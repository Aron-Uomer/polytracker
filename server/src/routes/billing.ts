import { Router, type Request } from "express";
import { billingEnabled, createInvoice, verifyIpn, handleIpn } from "../billing.js";
import { verifyToken, getAuthUser, type AuthUser } from "../auth.js";
import { bearerToken } from "./auth.js";
import { PRO_PRICE_USD } from "../plans.js";

export const billingRouter = Router();

async function currentUser(req: Request): Promise<AuthUser | null> {
  const id = verifyToken(bearerToken(req));
  return id ? await getAuthUser(id) : null;
}

// GET /api/billing/config — is crypto billing live, and the price.
billingRouter.get("/config", (_req, res) => {
  res.json({ enabled: billingEnabled(), price: PRO_PRICE_USD, provider: "nowpayments" });
});

// POST /api/billing/checkout — create a NOWPayments hosted invoice.
billingRouter.post("/checkout", async (req, res) => {
  if (!billingEnabled()) return res.status(400).json({ error: "Billing isn't configured." });
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in first." });
  try {
    const url = await createInvoice(user);
    res.json({ url });
  } catch (e) {
    console.error("checkout error", e);
    res.status(500).json({ error: e instanceof Error ? e.message : "Could not start checkout." });
  }
});

// POST /api/billing/webhook — NOWPayments IPN. Verifies HMAC then grants Pro.
billingRouter.post("/webhook", async (req, res) => {
  const sig = req.header("x-nowpayments-sig");
  if (!verifyIpn(req.body, sig)) {
    console.warn(
      "[nowpayments] IPN signature mismatch — check NOWPAYMENTS_IPN_SECRET matches the IPN secret in your NOWPayments dashboard."
    );
    return res.status(400).json({ error: "Invalid signature." });
  }
  try {
    await handleIpn(req.body);
    res.json({ received: true });
  } catch (e) {
    console.error("ipn error", e);
    res.status(500).json({ error: "IPN processing failed." });
  }
});
