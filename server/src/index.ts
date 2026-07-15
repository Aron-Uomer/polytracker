import "dotenv/config";
import express from "express";
import cors from "cors";
import { traderRouter } from "./routes/trader.js";
import { leaderboardRouter } from "./routes/leaderboard.js";
import { watchlistRouter, meRouter } from "./routes/watchlist.js";
import { smartMoneyRouter } from "./routes/smartmoney.js";
import { authRouter } from "./routes/auth.js";
import { billingRouter } from "./routes/billing.js";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

// This API serves public data and authenticates with Bearer tokens in the
// Authorization header (no cookies), so allowing any origin is safe — a third
// party site can't ride a user's session. This also avoids CORS_ORIGIN mismatch
// headaches on deploy. To restrict, set CORS_ORIGIN to a comma-separated list.
const norm = (s: string) => s.trim().replace(/\/+$/, "");
const configured = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map(norm)
  .filter((s) => s && s !== "*");

if (configured.length > 0) {
  console.log("[cors] restricting to:", configured.join(", "));
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || configured.includes(norm(origin))),
    })
  );
} else {
  console.log("[cors] allowing all origins");
  app.use(cors()); // Access-Control-Allow-Origin: * (works for non-credentialed requests)
}
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/trader", traderRouter);
app.use("/api/leaderboard", leaderboardRouter);
app.use("/api/watchlist", watchlistRouter);
app.use("/api/me", meRouter);
app.use("/api/smart-money", smartMoneyRouter);
app.use("/api/auth", authRouter);
app.use("/api/billing", billingRouter);

// Final safety net: never let one bad request take the whole server down.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("unhandled route error", err);
  if (!res.headersSent) res.status(500).json({ error: "Server error." });
});

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
});

app.listen(PORT, () => {
  console.log(`PolyTrack API listening on http://localhost:${PORT}`);
});
