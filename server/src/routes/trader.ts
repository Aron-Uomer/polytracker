import { Router } from "express";
import { prisma, withDb, DB_ENABLED } from "../db.js";
import { computeTraderStats, computeTraderQuick, type TraderStats } from "../stats.js";
import { getActivityStats } from "../polymarket.js";
import { once } from "../inflight.js";
import { publicDetail } from "../errors.js";

export const traderRouter = Router();

const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS ?? 300);
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/** Upsert the cached stats row (no-op without a database). */
async function persist(address: string, stats: TraderStats) {
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
    };
    await db.trader.upsert({
      where: { address },
      create: { address, ...row },
      update: { ...row, lastFetchedAt: new Date() },
    });
  });
}

/**
 * Compute stats from a live, bounded read of the activity feed.
 *
 * `capped` means the wallet has more history than one pass can read
 * (TRADES_MAX_PAGES x 500 events, or the wall-clock budget, whichever comes
 * first). There is no longer a background backfill that closes that gap, so a
 * capped wallet stays capped — the figures cover its most recent activity and
 * the UI must say so rather than promise they will firm up.
 */
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
 * Serves the cached stats row if it is still fresh, otherwise recomputes from a
 * live read and caches the result.
 *
 * The Trade table this used to index into is gone: it stored every trade of
 * every wallet ever searched and grew without bound. Only the computed stats
 * are cached now, keyed by wallet, which is a fixed cost per address rather
 * than one proportional to how much that wallet has traded.
 */
async function loadTrader(address: string, forceRefresh: boolean): Promise<TraderPayload> {
  if (DB_ENABLED && !forceRefresh) {
    const cached = await withDb((db) => db.trader.findUnique({ where: { address } }));
    if (cached && Date.now() - cached.lastFetchedAt.getTime() < CACHE_TTL_SECONDS * 1000) {
      const stats = cached.payload as unknown as TraderStats;
      return { cached: true, indexing: stats.tradesCapped, stats };
    }
  }

  const { stats, indexing } = await computeLive(address);
  await persist(address, stats);
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

// GET /:address/history is gone with StatSnapshot. Charting a trend over time
// requires storing figures over time, and that store is exactly the unbounded
// growth this change set removes.
