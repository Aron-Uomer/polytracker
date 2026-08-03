import "dotenv/config";
import express from "express";
import cors from "cors";
import { traderRouter } from "./routes/trader.js";
import { leaderboardRouter } from "./routes/leaderboard.js";
import { watchlistRouter, meRouter } from "./routes/watchlist.js";
import { smartMoneyRouter } from "./routes/smartmoney.js";
import { authRouter } from "./routes/auth.js";
import { billingRouter } from "./routes/billing.js";
import { rateLimit } from "./ratelimit.js";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

// Behind Render/Vercel's proxy, so req.ip must come from X-Forwarded-For or every
// caller shares one rate-limit bucket. Trust exactly one hop — trusting them all
// would let a client spoof its own IP by prepending to the header.
app.set("trust proxy", 1);

// Baseline security headers. This is a JSON API with no HTML surface, so the
// helmet defaults that matter here are just these few — no need for the
// dependency (drop helmet in if you'd rather track it upstream).
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin"); // the frontend is a different origin
  next();
});

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
app.use(express.json({ limit: "64kb" }));

// Health check stays unlimited so the platform's probe never trips a limit.
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Rate limits. Every route that fans out to Polymarket or writes to the database
// is capped per IP: without this a single client can amplify one cheap request
// into dozens of upstream page fetches, and credential stuffing is unthrottled.
// These are in-process counters — see ratelimit.ts on scaling past one instance.
app.use(
  rateLimit({ name: "global", windowMs: 60_000, max: 300 })
);

app.use(
  "/api/trader",
  rateLimit({
    name: "trader",
    windowMs: 60_000,
    max: 30,
    message: "Too many trader lookups — please wait a moment before trying again.",
  }),
  traderRouter
);
app.use("/api/leaderboard", rateLimit({ name: "leaderboard", windowMs: 60_000, max: 60 }), leaderboardRouter);
app.use("/api/watchlist", rateLimit({ name: "watchlist", windowMs: 60_000, max: 60 }), watchlistRouter);
app.use("/api/me", rateLimit({ name: "me", windowMs: 60_000, max: 60 }), meRouter);
app.use(
  "/api/smart-money",
  rateLimit({
    name: "smart-money",
    windowMs: 60_000,
    max: 10,
    message: "Too many smart-money requests — please wait a moment.",
  }),
  smartMoneyRouter
);
app.use(
  "/api/auth",
  rateLimit({
    name: "auth",
    windowMs: 15 * 60_000,
    max: 20,
    message: "Too many sign-in attempts. Please try again in a few minutes.",
  }),
  authRouter
);
// The webhook is generous (NOWPayments retries) but not unbounded; checkout is
// tight since each call creates a real invoice upstream.
app.use(
  "/api/billing",
  rateLimit({ name: "billing", windowMs: 60_000, max: 60 }),
  billingRouter
);

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
