import { Router } from "express";
import {
  getLeaderboard,
  type LeaderboardMetric,
  type LeaderboardRow,
  type LeaderboardWindow,
} from "../polymarket.js";
import { once } from "../inflight.js";
import { TtlCache } from "../ttlcache.js";
import { publicDetail } from "../errors.js";

export const leaderboardRouter = Router();

/**
 * This route had no cache of any kind: every visitor, on every visit, cost a
 * fresh call to Polymarket for rankings that move slowly. The browser now
 * caches its own view, but that only helps a browser that has already loaded
 * it — the first load from every new visitor and every new device still went
 * upstream. One entry here serves all of them.
 *
 * Longer than the trader TTL because leaderboards change far more slowly than
 * a wallet's positions. Note this compounds with the client's own 20 minutes:
 * a visitor can see figures up to both windows old. That is a deliberate trade
 * for rankings, and the wrong one for anything time-sensitive.
 */
const TTL_SECONDS = Number(process.env.LEADERBOARD_TTL_SECONDS ?? 600);

// Small values — 100 rows of name, address and a number. The cap is generous
// because the key space is bounded anyway: 2 metrics x 4 windows x a clamped
// limit, and only the handful of combinations the UI actually offers.
const cache = new TtlCache<LeaderboardRow[]>(TTL_SECONDS * 1000, 50);

/**
 * GET /api/leaderboard?metric=profit|volume&window=all|1d&limit=N
 * Top Polymarket traders, ranked.
 */
leaderboardRouter.get("/", async (req, res) => {
  const metric: LeaderboardMetric = req.query.metric === "volume" ? "volume" : "profit";
  const WINDOWS: LeaderboardWindow[] = ["all", "1d", "7d", "30d"];
  const window: LeaderboardWindow = WINDOWS.includes(req.query.window as LeaderboardWindow)
    ? (req.query.window as LeaderboardWindow)
    : "all";
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);

  const key = `${metric}:${window}:${limit}`;

  try {
    const hot = cache.get(key);
    if (hot) return res.json({ metric, window, rows: hot });

    // `once` covers the cold case the cache cannot: several visitors arriving
    // together on an empty cache would each start their own upstream call.
    // They now share one, and the first to finish fills the cache for the rest.
    const rows = await once(`leaderboard:${key}`, async () => {
      const fetched = await getLeaderboard(metric, window, limit);
      cache.set(key, fetched);
      return fetched;
    });
    return res.json({ metric, window, rows });
  } catch (err) {
    console.error("leaderboard route error", err);
    return res.status(502).json({
      error: "Failed to fetch the Polymarket leaderboard.",
      detail: publicDetail(err),
    });
  }
});
