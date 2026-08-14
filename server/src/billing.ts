import crypto from "node:crypto";
import { prisma, DB_ENABLED } from "./db.js";
import { memEnsure, memClaimPayment } from "./memstore.js";
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

/**
 * Whether `POST /api/me/plan` (flip the plan, no payment) is allowed. Only in
 * local development with no payment provider configured — otherwise it's a
 * one-request bypass of checkout.
 */
export function devPlanStubEnabled(): boolean {
  return !billingEnabled() && process.env.NODE_ENV !== "production";
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

/**
 * Claim a payment id, returning false if we've already granted for it. This is
 * what makes the IPN safe to replay: NOWPayments can legitimately deliver the
 * same callback more than once, and a captured payload could be resent
 * deliberately — either way Pro must only be granted the first time.
 */
async function claimPayment(paymentId: string, userId: string, amountUsd: number): Promise<boolean> {
  if (!DB_ENABLED) return memClaimPayment(paymentId);
  try {
    await prisma.payment.create({
      data: { id: paymentId, userId, amountUsd, status: "finished" },
    });
    return true;
  } catch (err) {
    // P2002 = unique violation on the primary key, i.e. we've already granted
    // for this payment. Anything else (table missing, DB down) must NOT be read
    // as "already processed" — that would silently swallow a real payment. Throw
    // so the webhook 500s and NOWPayments retries the callback.
    if ((err as { code?: string }).code === "P2002") return false;
    throw err;
  }
}

/** Create a NOWPayments hosted invoice for the Pro pass; returns its URL. */
export async function createInvoice(user: AuthUser): Promise<string> {
  if (!API_KEY) throw new Error("Billing is not configured (missing NOWPAYMENTS_API_KEY).");
  const body = {
    price_amount: PRO_PRICE_USD,
    price_currency: "usd",
    order_id: `${user.id}:${Date.now()}`,
    order_description: `Whole Record Pro (${PRO_DAYS} days)`,
    ipn_callback_url: API_PUBLIC_URL ? `${API_PUBLIC_URL}/api/billing/webhook` : undefined,
    success_url: `${APP_URL}/#/watchlist?checkout=success`,
    cancel_url: `${APP_URL}/#/watchlist?checkout=cancel`,
    is_fee_paid_by_user: true,
  };
  const res = await fetch(`${API_URL}/invoice`, {
    method: "POST",
    headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
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

export interface IpnPayload {
  payment_id?: string | number;
  payment_status?: string;
  order_id?: string;
  price_amount?: string | number;
  price_currency?: string;
}

/**
 * Process a verified IPN: grant Pro once, for a finished payment of the right
 * amount. A valid signature proves NOWPayments sent it — not that it's the
 * first time we've seen it, nor that the invoice was for our price — so both
 * are checked here.
 */
export async function handleIpn(payload: IpnPayload): Promise<void> {
  if (payload.payment_status !== "finished") return; // ignore waiting/confirming/partial/failed

  const userId = String(payload.order_id ?? "").split(":")[0];
  if (!userId) return;

  const paymentId = String(payload.payment_id ?? "");
  if (!paymentId) {
    console.warn("[nowpayments] IPN without a payment_id — ignoring (can't dedupe it).");
    return;
  }

  // The invoice we created was priced in USD at PRO_PRICE_USD; anything else
  // isn't a payment for this product.
  const amount = Number(payload.price_amount ?? 0);
  const currency = String(payload.price_currency ?? "").toLowerCase();
  if (currency !== "usd" || !(amount + 1e-6 >= PRO_PRICE_USD)) {
    console.warn(
      `[nowpayments] IPN ${paymentId} priced ${amount} ${currency || "?"}, expected ${PRO_PRICE_USD} usd — not granting.`
    );
    return;
  }

  if (!(await claimPayment(paymentId, userId, amount))) {
    console.log(`[nowpayments] IPN ${paymentId} already processed — ignoring replay.`);
    return;
  }

  await grantPro(userId);
  console.log(`[nowpayments] granted ${PRO_DAYS} days of Pro to ${userId} (payment ${paymentId}).`);
}
