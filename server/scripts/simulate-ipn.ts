import "dotenv/config";
import crypto from "node:crypto";

// Simulate a NOWPayments "payment finished" IPN against the local server, so you
// can verify the checkout → grant-Pro flow without a working NOWPayments account.
//
//   npm run simulate:ipn -- <email> <password> [apiBase]
//
// Requires NOWPAYMENTS_IPN_SECRET to be set in server/.env (any value) and the
// server restarted with it. It logs in as the given user, sends a signed IPN,
// then prints the resulting plan.

const [, , email, password, apiBaseArg] = process.argv;
const API = apiBaseArg ?? "http://localhost:4000";
const SECRET = process.env.NOWPAYMENTS_IPN_SECRET;

if (!email || !password) {
  console.error("Usage: npm run simulate:ipn -- <email> <password> [apiBase]");
  process.exit(1);
}
if (!SECRET) {
  console.error(
    "Set NOWPAYMENTS_IPN_SECRET in server/.env first (any value, e.g. 'testsecret'), then restart the server."
  );
  process.exit(1);
}

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

async function main() {
  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const login = (await loginRes.json()) as { token?: string; user?: { id: string; plan: string }; error?: string };
  if (!loginRes.ok || !login.token || !login.user) {
    console.error("❌ Login failed:", login.error ?? loginRes.status);
    process.exit(1);
  }
  console.log(`✔ Logged in as ${email} (user ${login.user.id}, plan: ${login.user.plan})`);

  const payload = {
    payment_status: "finished",
    order_id: `${login.user.id}:${Date.now()}`,
    payment_id: 5000000000,
    price_amount: 10,
    price_currency: "usd",
    pay_currency: "usdttrc20",
  };
  const body = JSON.stringify(sortDeep(payload));
  const sig = crypto.createHmac("sha512", SECRET!).update(body).digest("hex");

  const hook = await fetch(`${API}/api/billing/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-nowpayments-sig": sig },
    body,
  });
  console.log(`✔ Sent signed 'finished' IPN → webhook responded ${hook.status}`);
  if (!hook.ok) {
    console.error("   (400 = signature mismatch: the server's NOWPAYMENTS_IPN_SECRET must match this one — restart it.)");
    process.exit(1);
  }

  const me = (await (
    await fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${login.token}` } })
  ).json()) as { user?: { plan: string; proExpiresAt: string | null } };
  console.log(`🎉 Plan is now: ${me.user?.plan}  (Pro until ${me.user?.proExpiresAt ?? "—"})`);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
