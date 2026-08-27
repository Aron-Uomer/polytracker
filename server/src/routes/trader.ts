import { gzipSync, gunzipSync } from "node:zlib";
import { Router } from "express";
import { prisma, withDb, DB_ENABLED } from "../db.js";
import {
  computeTraderStats,
  computeTraderQuick,
  type TraderStats,
  type TraderQuick,
} from "../stats.js";
import { getActivityStats } from "../polymarket.js";
import { once } from "../inflight.js";
import { TtlCache } from "../ttlcache.js";
import { selectPositions, isMode, isSortKey } from "../positions.js";
import { publicDetail } from "../errors.js";

export const traderRouter = Router();

const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS ?? 300);
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

// Full stats: large values, so a small cap. 25 x up to 1.4 MB is ~35 MB.
const statsCache = new TtlCache<TraderStats>(CACHE_TTL_SECONDS * 1000, 25);

/**
 * Tier-1 summaries.
 *
 * These had no cache of any kind, so every page load and every refresh made
 * about eight fresh calls to Polymarket even when the full stats were already
 * cached and about to be served instantly. Reloading a page five times meant
 * forty upstream requests for data that had not changed.
 *
 * The values are far smaller than full stats, so this holds more of them.
 */
const quickCache = new TtlCache<TraderQuick>(CACHE_TTL_SECONDS * 1000, 200);

/** Upsert the cached stats row (no-op without a database). */
async function persist(address: string, stats: TraderStats) {
  statsCache.set(address, stats);
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
 * Strip the position arrays before sending.
 *
 * They are the entire reason a response reached 4 MB: 7,087 rows shipped so the
 * table could show twenty. They stay in the cached payload, because that is
 * where /positions reads its pages from — they simply stop crossing the wire on
 * every page view.
 */
function toWire(stats: TraderStats): Omit<TraderStats, "openPositions" | "resolvedPositions"> {
  const { openPositions: _o, resolvedPositions: _r, ...rest } = stats;
  return rest;
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
    const hot = statsCache.get(address);
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
          statsCache.set(address, stats);
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
    return res.json({
      cached: payload.cached,
      indexing: payload.indexing,
      stats: toWire(payload.stats),
    });
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
    const hot = quickCache.get(address);
    if (hot) return res.json({ summary: hot });

    // `once` still matters underneath: it stops several simultaneous first
    // lookups of the same cold wallet each starting their own fetch. The cache
    // stops the *sequential* repeats — reloading the page a minute later.
    const summary = await once(`quick:${address}`, async () => {
      const computed = await computeTraderQuick(address);
      quickCache.set(address, computed);
      return computed;
    });
    return res.json({ summary });
  } catch (err) {
    return res.status(502).json({
      error: "Failed to fetch trader summary.",
      detail: publicDetail(err),
    });
  }
});

/**
 * GET /api/trader/:address/positions — one sorted page of the positions table.
 *
 * Reads from the same cached stats the main route serves, so a page turn costs
 * no upstream calls and, on a warm cache, no database round trip either. Sorting
 * happens across the whole set before slicing, so page 3 of "by P&L" is the real
 * third page, not the third page of an arbitrary order.
 *
 *   ?mode=all|open|resolved  ?sort=firstTradeAt|lastTradeAt|title|value|pnl
 *   ?dir=asc|desc            ?page=0  ?pageSize=20
 */
traderRouter.get("/:address/positions", async (req, res) => {
  const address = req.params.address?.toLowerCase();
  if (!ADDRESS_RE.test(address)) {
    return res.status(400).json({ error: "Invalid wallet address." });
  }

  const mode = isMode(req.query.mode) ? req.query.mode : "all";
  const sort = isSortKey(req.query.sort) ? req.query.sort : undefined;
  const dir = req.query.dir === "asc" || req.query.dir === "desc" ? req.query.dir : undefined;

  try {
    // Same coalescing key as the main route: a page turn arriving while the
    // wallet is still being computed waits for that one pass instead of
    // starting a second.
    const payload = await once(`trader:${address}:false`, () => loadTrader(address, false));
    return res.json(
      selectPositions(payload.stats.openPositions, payload.stats.resolvedPositions, {
        mode,
        sort,
        dir,
        page: Number(req.query.page),
        pageSize: Number(req.query.pageSize),
      })
    );
  } catch (err) {
    return res.status(502).json({
      error: "Failed to fetch positions.",
      detail: publicDetail(err),
    });
  }
});

// GET /:address/history is gone with StatSnapshot. Charting a trend over time
// requires storing figures over time, and that store is exactly the unbounded
// growth this change set removes.
