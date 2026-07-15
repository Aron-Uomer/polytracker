import { Router, type Request, type Response } from "express";
import { addWallet, getState, removeWallet, setPlan } from "../watchlist.js";
import { isPlan, PLAN_LIMITS, PRO_PRICE_USD } from "../plans.js";
import { verifyToken } from "../auth.js";
import { bearerToken } from "./auth.js";

export const watchlistRouter = Router();
export const meRouter = Router();

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/** Wrap an async handler so a rejection returns 500 instead of crashing the process. */
const ah =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response) =>
    fn(req, res).catch((e) => {
      console.error("route error", e);
      if (!res.headersSent) {
        res.status(500).json({
          error:
            "Server error. If DATABASE_URL is set, make sure it points at a reachable Postgres, or leave it blank to use in-memory.",
        });
      }
    });

/** Identity = logged-in account (bearer token) if present, else anonymous client id. */
function clientId(req: Request): string | null {
  const userId = verifyToken(bearerToken(req));
  if (userId) return userId;
  const id = req.header("x-client-id");
  return id && id.length >= 8 && id.length <= 100 ? id : null;
}

// GET /api/me — plan, limit and current usage.
meRouter.get(
  "/",
  ah(async (req, res) => {
    const id = clientId(req);
    if (!id) return res.status(400).json({ error: "Missing x-client-id header." });
    const state = await getState(id);
    res.json({ ...state, proPrice: PRO_PRICE_USD });
  })
);

// POST /api/me/plan { plan } — DEV STUB until billing exists.
meRouter.post(
  "/plan",
  ah(async (req, res) => {
    const id = clientId(req);
    if (!id) return res.status(400).json({ error: "Missing x-client-id header." });
    const plan = req.body?.plan;
    if (!isPlan(plan)) {
      return res.status(400).json({ error: "plan must be 'free' or 'pro'." });
    }
    const state = await setPlan(id, plan);
    res.json({ ...state, proPrice: PRO_PRICE_USD });
  })
);

// GET /api/watchlist — the tracked wallets for this client.
watchlistRouter.get(
  "/",
  ah(async (req, res) => {
    const id = clientId(req);
    if (!id) return res.status(400).json({ error: "Missing x-client-id header." });
    res.json(await getState(id));
  })
);

// POST /api/watchlist { address, label? } — add, enforcing the plan limit.
watchlistRouter.post(
  "/",
  ah(async (req, res) => {
    const id = clientId(req);
    if (!id) return res.status(400).json({ error: "Missing x-client-id header." });
    const address = String(req.body?.address ?? "").toLowerCase();
    const label = req.body?.label ? String(req.body.label).slice(0, 60) : null;
    if (!ADDRESS_RE.test(address)) {
      return res.status(400).json({ error: "Invalid wallet address." });
    }
    const result = await addWallet(id, address, label);
    if (!result.ok && result.upgradeRequired) {
      return res.status(403).json({
        error: `You've reached your ${result.state.plan} plan limit of ${result.state.limit} traders.`,
        upgradeRequired: true,
        proLimit: PLAN_LIMITS.pro,
        proPrice: PRO_PRICE_USD,
        state: result.state,
      });
    }
    res.json(result.state);
  })
);

// DELETE /api/watchlist/:address — stop tracking a wallet.
watchlistRouter.delete(
  "/:address",
  ah(async (req, res) => {
    const id = clientId(req);
    if (!id) return res.status(400).json({ error: "Missing x-client-id header." });
    const state = await removeWallet(id, req.params.address);
    res.json(state);
  })
);
