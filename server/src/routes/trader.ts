import { Router } from "express";
import { prisma, withDb, DB_ENABLED } from "../db.js";
import { computeTraderStats, computeTraderQuick, type TraderStats } from "../stats.js";
import { getActivityStats } from "../polymarket.js";
import { getActivityStatsFromDb, indexWallet, type IndexState } from "../indexer.js";
import { once } from "../inflight.js";
import { publicDetail } from "../errors.js";

export const traderRouter = Router();

const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS ?? 300);
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

// A snapshot exists to chart a trend, not to record every page view. Without a
// floor here a wallet that's polled (or is mid-backfill, so it never serves from
// cache) writes a row per request and the table grows without bound.
const SNAPSHOT_MIN_INTERVAL_MS =
  Number(process.env.SNAPSHOT_MIN_INTERVAL_SECONDS ?? 3600) * 1000;
const SNAPSHOT_RETENTION = Number(process.env.SNAPSHOT_RETENTION ?? 500);

/** Append a history snapshot, throttled and pruned to a bounded retention. */
async function snapshot(db: typeof prisma, address: string, stats: TraderStats) {
  const last = await db.statSnapshot.findFirst({
    where: { traderAddress: address },
    orderBy: { takenAt: "desc" },
    select: { takenAt: true },
  });
  if (last && Date.now() - last.takenAt.getTime() < SNAPSHOT_MIN_INTERVAL_MS) return;

  await db.statSnapshot.create({
    data: {
      traderAddress: address,
      portfolioValue: stats.portfolioValue,
      totalProfit: stats.totalProfit,
      winRate: stats.winRate,
      totalTrades: stats.totalTrades,
    },
  });

  // Drop anything past the retention window (cheap: runs at most once per
  // interval per wallet, and only ever trims one row in the steady state).
  const total = await db.statSnapshot.count({ where: { traderAddress: address } });
  if (total > SNAPSHOT_RETENTION) {
    const stale = await db.statSnapshot.findMany({
      where: { traderAddress: address },
      orderBy: { takenAt: "desc" },
      skip: SNAPSHOT_RETENTION,
      select: { id: true },
    });
    await db.statSnapshot.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }
}

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
    await snapshot(db, address, stats);
  });
}

/** Live path: bounded fetch of trade history (used when there's no database). */
async function computeLive(address: string) {
  const activity = await getActivityStats(address);
  const stats = await computeTraderStats(address, activity);
  return { stats, indexing: activity.capped };
}

interface TraderPayload {
  cached: boolean;
  indexing: boolean;
  stats: TraderStats;
}

/**
 * Serves cached stats if fresh; otherwise indexes the wallet's trades into the
 * DB (incrementally) and computes exact stats from it. Falls back to a bounded
 * live fetch if no database is configured or the DB is unreachable.
 */
async function loadTrader(address: string, forceRefresh: boolean): Promise<TraderPayload> {
  if (DB_ENABLED) {
    const cached = await withDb((db) => db.trader.findUnique({ where: { address } }));
    if (cached && !forceRefresh) {
      const ageMs = Date.now() - cached.lastFetchedAt.getTime();
      // Serve cache only when fresh AND the backfill is finished (so we keep
      // making progress on partially-indexed whales).
      if (ageMs < CACHE_TTL_SECONDS * 1000 && cached.idxComplete) {
        return {
          cached: true,
          indexing: false,
          stats: cached.payload as unknown as TraderStats,
        };
      }
    }

    try {
      const idx = await indexWallet(prisma, address);
      const activity = await getActivityStatsFromDb(prisma, address, idx.complete);
      const stats = await computeTraderStats(address, activity);
      await persist(address, stats, idx);
      return { cached: false, indexing: !idx.complete, stats };
    } catch (dbErr) {
      console.warn("[trader] DB/index path failed, falling back to live:", dbErr);
    }
  }

  const { stats, indexing } = await computeLive(address);
  await persist(address, stats, null);
  return { cached: false, indexing, stats };
}

/** GET /api/trader/:address — full stats. `?refresh=1` forces a recompute. */
traderRouter.get("/:address", async (req, res) => {
  const address = req.params.address?.toLowerCase();
  const forceRefresh = req.query.refresh === "1" || req.query.refresh === "true";

  if (!ADDRESS_RE.test(address)) {
    return res.status(400).json({
      error: "Invalid wallet address. Expected a 0x-prefixed 40-hex-char address.",
    });
  }

  try {
    // Concurrent lookups of the same wallet share one indexing pass rather than
    // each paging Polymarket from scratch.
    const payload = await once(`trader:${address}:${forceRefresh}`, () =>
      loadTrader(address, forceRefresh)
    );
    return res.json(payload);
  } catch (err) {
    console.error("trader route error", err);
    return res.status(502).json({
      error: "Failed to fetch trader data from Polymarket.",
      detail: publicDetail(err),
    });
  }
});

/**
 * GET /api/trader/:address/summary — tier 1. Canonical figures plus open
 * positions, with no trade-history paging, so it answers in about a second
 * while the full lookup is still walking the activity feed.
 */
traderRouter.get("/:address/summary", async (req, res) => {
  const address = req.params.address?.toLowerCase();
  if (!ADDRESS_RE.test(address)) {
    return res.status(400).json({ error: "Invalid wallet address." });
  }
  try {
    const summary = await once(`quick:${address}`, () => computeTraderQuick(address));
    return res.json({ summary });
  } catch (err) {
    return res.status(502).json({
      error: "Failed to fetch trader summary.",
      detail: publicDetail(err),
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
