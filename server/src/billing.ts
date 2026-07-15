import crypto from "node:crypto";
import { prisma, DB_ENABLED } from "./db.js";
import { memEnsure } from "./memstore.js";
import { PRO_PRICE_USD } from "./plans.js";
import type { AuthUser } from "./auth.js";

// Crypto payments via NOWPayments. "Upgrade to Pro" creates a hosted invoice;
// when the buyer pays, NOWPayments calls our IPN webhook and we grant 30 days of
// Pro. Recurring crypto isn't a silent auto-charge, so this is a renewable pass.

const API_KEY = process.env.NOWPAYMENTS_API_KEY;
const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;
const API_URL = process.env.NOWPAYMENTS_API_URL ?? "https://api.nowpayments.io/v1";
const APP_URL = (process.env.APP_URL ?? process.env.CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")[0]
  .trim();
// Public URL of THIS server, where NOWPayments sends IPN callbacks. Only used if
// it's a valid http(s) URL — otherwise we omit the callback (invoice still works,
// but we won't get the auto-confirmation; use `npm run simulate:ipn` to test).
const rawPublicUrl = (process.env.API_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
const isPublicUrl = /^https?:\/\/.+/i.test(rawPublicUrl) && !/localhost|127\.0\.0\.1/i.test(rawPublicUrl);
const API_PUBLIC_URL = isPublicUrl ? rawPublicUrl : "";
if (rawPublicUrl && !API_PUBLIC_URL) {
  console.warn(
    `[billing] API_PUBLIC_URL="${rawPublicUrl}" isn't a public http(s) URL NOWPayments can reach — ignoring it. ` +
      "Use a public https URL (e.g. an ngrok URL). Without it, invoices work but the plan won't auto-confirm; " +
      "use `npm run simulate:ipn` to test the grant flow."
  );
}

const PRO_DAYS = 30;

/** Billing is live once a NOWPayments API key is configured. */
export function billingEnabled(): boolean {
  return !!API_KEY;
}

/** Extend a user's Pro pass by 30 days (from now, or from current expiry). */
async function grantPro(userId: string) {
  const now = Date.now();
  if (DB_ENABLED) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const base = user?.proExpiresAt && user.proExpiresAt.getTime() > now ? user.proExpiresAt.getTime() : now;
    await prisma.user.update({
      where: { id: userId },
      data: { plan: "pro", proExpiresAt: new Date(base + PRO_DAYS * 86400_000) },
    });
  } else {
    const u = memEnsure(userId);
    const base = u.proExpiresAt && u.proExpiresAt > now ? u.proExpiresAt : now;
    u.plan = "pro";
    u.proExpiresAt = base + PRO_DAYS * 86400_000;
  }
}

/** Create a NOWPayments hosted invoice for the Pro pass; returns its URL. */
export async function createInvoice(user: AuthUser): Promise<string> {
  if (!API_KEY) throw new Error("Billing is not configured (missing NOWPAYMENTS_API_KEY).");
  const body = {
    price_amount: PRO_PRICE_USD,
    price_currency: "usd",
    order_id: `${user.id}:${Date.now()}`,
    order_description: `PolyTrack Pro (${PRO_DAYS} days)`,
    ipn_callback_url: API_PUBLIC_URL ? `${API_PUBLIC_URL}/api/billing/webhook` : undefined,
    success_url: `${APP_URL}/#/watchlist?checkout=success`,
    cancel_url: `${APP_URL}/#/watchlist?checkout=cancel`,
    is_fee_paid_by_user: true,
  };
  const res = await fetch(`${API_URL}/invoice`, {
    method: "POST",
    headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { invoice_url?: string; message?: string };
  if (!res.ok || !data.invoice_url) {
    throw new Error(data.message ?? `NOWPayments invoice failed (${res.status}).`);
  }
  return data.invoice_url;
}

// NOWPayments signs the IPN with HMAC-SHA512 over the JSON body with keys sorted.
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortDeep((value as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return value;
}

export function verifyIpn(payload: unknown, signature: string | undefined): boolean {
  if (!IPN_SECRET || !signature) return false;
  const digest = crypto
    .createHmac("sha512", IPN_SECRET)
    .update(JSON.stringify(sortDeep(payload)))
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** Process a verified IPN: grant Pro once the payment is finished. */
export async function handleIpn(payload: {
  payment_status?: string;
  order_id?: string;
}): Promise<void> {
  const status = payload.payment_status;
  if (status !== "finished") return; // ignore waiting/confirming/partial/failed
  const userId = String(payload.order_id ?? "").split(":")[0];
  if (userId) await grantPro(userId);
}
