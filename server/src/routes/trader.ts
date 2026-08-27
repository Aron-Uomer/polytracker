import { gzipSync, gunzipSync } from "node:zlib";
import { Router } from "express";
import { prisma, withDb, DB_ENABLED } from "../db.js";
import { computeTraderStats, computeTraderQuick, type TraderStats } from "../stats.js";
import { getActivityStats } from "../polymarket.js";
import { once } from "../inflight.js";
import { publicDetail } from "../errors.js";

export const traderRouter = Router();

const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS ?? 300);
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * Second-level cache, in this process.
 *
 * The database cache costs real egress on every hit — the payload column is the
 * only thing in this app that moves meaningful bytes out of Postgres. Serving a
 * repeat lookup from memory costs nothing at all.
 *
 * It is not a replacement for the database cache: on Render's free tier the
 * process sleeps after ~15 minutes idle, so this map starts empty far more
 * often than a normal server's would. It absorbs the repeats inside one wake
 * window, which is where most of them happen.
 *
 * Capped by entry count rather than bytes. A payload can reach 1.4 MB, so 25
 * entries is ~35 MB worst case on a 512 MB instance — deliberately modest.
 */
const MEM_CACHE_MAX = Number(process.env.MEM_CACHE_MAX ?? 25);
const memCache = new Map<string, { at: number; stats: TraderStats }>();

function memGet(address: string): TraderStats | null {
  const hit = memCache.get(address);
  if (!hit) return null;
  if (Date.now() - hit.at >= CACHE_TTL_SECONDS * 1000) {
    memCache.delete(address);
    return null;
  }
  // Refresh insertion order so this entry is now the most recently used.
  memCache.delete(address);
  memCache.set(address, hit);
  return hit.stats;
}

function memSet(address: string, stats: TraderStats): void {
  memCache.delete(address);
  memCache.set(address, { at: Date.now(), stats });
  // Map iterates in insertion order, so the first key is the oldest.
  while (memCache.size > MEM_CACHE_MAX) {
    const oldest = memCache.keys().next().value;
    if (oldest === undefined) break;
    memCache.delete(oldest);
  }
}

/** Upsert the cached stats row (no-op without a database). */
async function persist(address: string, stats: TraderStats) {
  memSet(address, stats);
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
      payload: gzipSync(Buffer.from(JSON.stringify(stats), "utf8")),
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
  if (!forceRefresh) {
    // Free: costs neither a database round trip nor any egress.
    const hot = memGet(address);
    if (hot) return { cached: true, indexing: hot.tradesCapped, stats: hot };
  }

  if (DB_ENABLED && !forceRefresh) {
    // Check the age BEFORE pulling the payload. A cached payload runs to 1.4 MB
    // on an active wallet, and fetching the whole row only to discover it is
    // stale and discard it spends that bandwidth for nothing. Two small queries
    // beat one large wasted one.
    const meta = await withDb((db) =>
      db.trader.findUnique({ where: { address }, select: { lastFetchedAt: true } })
    );
    const fresh =
      meta && Date.now() - meta.lastFetchedAt.getTime() < CACHE_TTL_SECONDS * 1000;

    if (fresh) {
      const cached = await withDb((db) =>
        db.trader.findUnique({ where: { address }, select: { payload: true } })
      );
      if (cached?.payload?.length) {
        try {
          const stats = JSON.parse(
            gunzipSync(cached.payload).toString("utf8")
          ) as TraderStats;
          memSet(address, stats);
          return { cached: true, indexing: stats.tradesCapped, stats };
        } catch (err) {
          // A payload written by an older build, or a truncated one. Fall
          // through and recompute rather than serving nothing.
          console.warn("[trader] unreadable cached payload, recomputing:", err);
        }
      }
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
