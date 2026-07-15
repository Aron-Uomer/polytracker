import { Router } from "express";
import {
  getSmartMoney,
  type SmartSide,
  type SmartSort,
  type SmartWindow,
} from "../smartmoney.js";
import type { LeaderboardMetric } from "../polymarket.js";
import { verifyToken, getAuthUser } from "../auth.js";
import { bearerToken } from "./auth.js";

export const smartMoneyRouter = Router();

const WINDOWS: SmartWindow[] = ["1d", "7d", "30d"];
const COUNTS = [10, 25, 50];

/**
 * GET /api/smart-money?window=1d|7d|30d&count=10|25|50&metric=profit|volume
 *                      &side=buy|sell&sort=traders|usd
 */
smartMoneyRouter.get("/", async (req, res) => {
  // Smart money is a Pro feature.
  const userId = verifyToken(bearerToken(req));
  const user = userId ? await getAuthUser(userId) : null;
  if (user?.plan !== "pro") {
    return res.status(403).json({ error: "Smart money is a Pro feature.", proRequired: true });
  }

  const window = (WINDOWS.includes(req.query.window as SmartWindow)
    ? req.query.window
    : "7d") as SmartWindow;
  const metric: LeaderboardMetric = req.query.metric === "volume" ? "volume" : "profit";
  const side: SmartSide = req.query.side === "sell" ? "sell" : "buy";
  const sort: SmartSort = req.query.sort === "usd" ? "usd" : "traders";
  const count = COUNTS.includes(Number(req.query.count)) ? Number(req.query.count) : 25;

  try {
    res.json(await getSmartMoney({ window, count, metric, side, sort }));
  } catch (err) {
    console.error("smart-money route error", err);
    res.status(502).json({
      error: "Failed to build the smart-money feed.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});
