import { Router } from "express";
import { prisma, withDb, DB_ENABLED } from "../db.js";
import { computeTraderStats, computeTraderSummary, type TraderStats } from "../stats.js";
import { getActivityStats } from "../polymarket.js";
import { getActivityStatsFromDb, indexWallet, type IndexState } from "../indexer.js";

export const traderRouter = Router();

const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS ?? 300);
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/** Upsert the cached trader row + a history snapshot (no-op without a database). */
async function persist(address: string, stats: TraderStats, idx: IndexState | null) {
  await withDb(async (db) => {
    const row = {
      name: stats.profile.name,
      pseudonym: stats.profile.pseudonym,
      profileImage: stats.profile.profileImage,
      portfolioValue: stats.portfolioValue,
      totalProfit: stats.totalProfit,
      profitToday: stats.profitToday,
      totalVolume: stats.totalVolume,
      totalTrades: stats.totalTrades,
      tradesCapped: stats.tradesCapped,
      openPositions: stats.openPositionsCount,
      resolvedCount: stats.resolvedCount,
      wins: stats.wins,
      losses: stats.losses,
      winRate: stats.winRate,
      payload: stats as unknown as object,
      idxNewestTs: idx?.newestTs ?? null,
      idxOldestTs: idx?.oldestTs ?? null,
      idxComplete: idx?.complete ?? false,
      idxUpdatedAt: idx ? new Date() : null,
    };
    await db.trader.upsert({
      where: { address },
      create: { address, ...row },
      update: { ...row, lastFetchedAt: new Date() },
    });
    await db.statSnapshot.create({
      data: {
        traderAddress: address,
        portfolioValue: stats.portfolioValue,
        totalProfit: stats.totalProfit,
        winRate: stats.winRate,
        totalTrades: stats.totalTrades,
      },
    });
  });
}

/** Live path: bounded fetch of trade history (used when there's no database). */
async function computeLive(address: string) {
  const activity = await getActivityStats(address);
  const stats = await computeTraderStats(address, activity);
  return { stats, indexing: activity.capped };
}

/**
 * GET /api/trader/:address
 * Serves cached stats if fresh; otherwise indexes the wallet's trades into the
 * DB (incrementally) and computes exact stats from it. Falls back to a bounded
 * live fetch if no database is configured or the DB is unreachable.
 * ?refresh=1 forces a recompute.
 */
traderRouter.get("/:address", async (req, res) => {
  const address = req.params.address?.toLowerCase();
  const forceRefresh = req.query.refresh === "1" || req.query.refresh === "true";

  if (!ADDRESS_RE.test(address)) {
    return res.status(400).json({
      error: "Invalid wallet address. Expected a 0x-prefixed 40-hex-char address.",
    });
  }

  try {
    if (DB_ENABLED) {
      const cached = await withDb((db) => db.trader.findUnique({ where: { address } }));
      if (cached && !forceRefresh) {
        const ageMs = Date.now() - cached.lastFetchedAt.getTime();
        // Serve cache only when fresh AND the backfill is finished (so we keep
        // making progress on partially-indexed whales).
        if (ageMs < CACHE_TTL_SECONDS * 1000 && cached.idxComplete) {
          return res.json({
            cached: true,
            indexing: false,
            stats: cached.payload as unknown as TraderStats,
          });
        }
      }

      try {
        const idx = await indexWallet(prisma, address);
        const activity = await getActivityStatsFromDb(prisma, address, idx.complete);
        const stats = await computeTraderStats(address, activity);
        await persist(address, stats, idx);
        return res.json({ cached: false, indexing: !idx.complete, stats });
      } catch (dbErr) {
        console.warn("[trader] DB/index path failed, falling back to live:", dbErr);
      }
    }

    const { stats, indexing } = await computeLive(address);
    await persist(address, stats, null);
    return res.json({ cached: false, indexing, stats });
  } catch (err) {
    console.error("trader route error", err);
    return res.status(502).json({
      error: "Failed to fetch trader data from Polymarket.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

/** GET /api/trader/:address/summary — cheap headline stats (no trade paging). */
traderRouter.get("/:address/summary", async (req, res) => {
  const address = req.params.address?.toLowerCase();
  if (!ADDRESS_RE.test(address)) {
    return res.status(400).json({ error: "Invalid wallet address." });
  }
  try {
    const summary = await computeTraderSummary(address);
    return res.json({ summary });
  } catch (err) {
    return res.status(502).json({
      error: "Failed to fetch trader summary.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

/** GET /api/trader/:address/history — snapshots for charting over time. */
traderRouter.get("/:address/history", async (req, res) => {
  const address = req.params.address?.toLowerCase();
  if (!ADDRESS_RE.test(address)) {
    return res.status(400).json({ error: "Invalid wallet address." });
  }
  const snapshots =
    (await withDb((db) =>
      db.statSnapshot.findMany({
        where: { traderAddress: address },
        orderBy: { takenAt: "asc" },
        take: 500,
      })
    )) ?? [];
  return res.json({ snapshots });
});
