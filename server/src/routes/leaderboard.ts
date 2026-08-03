import { Router } from "express";
import {
  getLeaderboard,
  type LeaderboardMetric,
  type LeaderboardWindow,
} from "../polymarket.js";
import { publicDetail } from "../errors.js";

export const leaderboardRouter = Router();

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

  try {
    const rows = await getLeaderboard(metric, window, limit);
    return res.json({ metric, window, rows });
  } catch (err) {
    console.error("leaderboard route error", err);
    return res.status(502).json({
      error: "Failed to fetch the Polymarket leaderboard.",
      detail: publicDetail(err),
    });
  }
});
