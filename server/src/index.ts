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

// Allowed frontend origins. Normalize (drop trailing slashes) on both sides so a
// stray "/" in CORS_ORIGIN doesn't silently block the real Vercel origin.
const norm = (s: string) => s.trim().replace(/\/+$/, "");
const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map(norm)
  .filter(Boolean);
console.log("[cors] allowed origins:", allowedOrigins.join(", ") || "(none)");

app.use(
  cors({
    origin(origin, cb) {
      // Non-browser requests (curl, health checks) have no Origin — allow them.
      if (!origin || allowedOrigins.includes(norm(origin))) return cb(null, true);
      console.warn(`[cors] blocked origin: ${origin}`);
      cb(null, false);
    },
  })
);
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
