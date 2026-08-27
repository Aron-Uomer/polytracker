// Whole Record change verification. Spawns the built server in several
// configurations, asserts behaviour, prints a PASS/FAIL table.
//
//   cd wholerecord && npm run build
//   npm --prefix server run verify
//
// Runs entirely in-memory (DATABASE_URL blanked) — never touches your database.

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolved from this file, not the cwd, so it works from either the repo root
// or server/ (npm sets cwd to the package dir).
const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IPN_SECRET = "verify-secret";
const results = [];

function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  const tag = pass ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`  ${tag}  ${name}${detail ? `  \x1b[90m${detail}\x1b[0m` : ""}`);
}

async function waitForHealth(port, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://localhost:${port}/api/health`);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function startServer(port, env) {
  const child = spawn(process.execPath, ["dist/index.js"], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      DATABASE_URL: "",
      NODE_ENV: "development",
      NOWPAYMENTS_API_KEY: "",
      NOWPAYMENTS_IPN_SECRET: IPN_SECRET,
      AUTH_SECRET: "verify-only-secret",
      PORT: String(port),
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  return { child, getLog: () => log };
}

function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object")
    return Object.keys(v).sort().reduce((a, k) => ((a[k] = sortDeep(v[k])), a), {});
  return v;
}

async function sendIpn(port, payload, { signature } = {}) {
  const body = JSON.stringify(sortDeep(payload));
  const sig = signature ?? crypto.createHmac("sha512", IPN_SECRET).update(body).digest("hex");
  const res = await fetch(`http://localhost:${port}/api/billing/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-nowpayments-sig": sig },
    body,
  });
  return res;
}

/* ---------------------------------------------------------------- phase 1 */
// Local dev, no payment provider: the dev shortcut SHOULD work here.
async function phaseDev() {
  console.log("\n\x1b[1m1. Local dev, billing not configured\x1b[0m");
  const port = 4201;
  const { child } = startServer(port, {});
  try {
    if (!(await waitForHealth(port))) return check("server starts", false, "no health response");
    check("server starts", true);

    const cfg = await (await fetch(`http://localhost:${port}/api/billing/config`)).json();
    check("billing config reports devStub", cfg.devStub === true && cfg.enabled === false, JSON.stringify(cfg));

    // Security headers
    const h = (await fetch(`http://localhost:${port}/api/health`)).headers;
    check(
      "security headers set",
      h.get("x-content-type-options") === "nosniff" &&
        h.get("x-frame-options") === "DENY" &&
        h.get("referrer-policy") === "no-referrer"
    );
    check("x-powered-by removed", h.get("x-powered-by") === null, h.get("x-powered-by") ?? "");

    // Reads must not create rows / bad ids rejected
    const anon = crypto.randomUUID();
    const wl = await fetch(`http://localhost:${port}/api/watchlist`, { headers: { "x-client-id": anon } });
    const wlBody = await wl.json();
    check("unknown client id reads empty free plan", wl.status === 200 && wlBody.plan === "free" && wlBody.count === 0);
    const badId = await fetch(`http://localhost:${port}/api/watchlist`, { headers: { "x-client-id": "short" } });
    check("malformed client id rejected", badId.status === 400);

    // Tracking a wallet requires an account
    const anonTrack = await fetch(`http://localhost:${port}/api/watchlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-client-id": anon },
      body: JSON.stringify({ address: "0x204f72f35326db932158cba6adff0b9a1da95e14" }),
    });
    const anonTrackBody = await anonTrack.json();
    check(
      "tracking refused when signed out",
      anonTrack.status === 401 && anonTrackBody.authRequired === true,
      `status ${anonTrack.status}`
    );

    // Dev stub allowed here
    const stub = await fetch(`http://localhost:${port}/api/me/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-client-id": anon },
      body: JSON.stringify({ plan: "pro" }),
    });
    check("dev plan stub works locally", stub.status === 200);

    // Pro feature is enforced server-side for anonymous callers
    const sm = await fetch(`http://localhost:${port}/api/smart-money`);
    check("smart-money requires a Pro account", sm.status === 403);

    // Rate limit: 30/min on /api/trader
    let codes = [];
    for (let i = 0; i < 31; i++) {
      const r = await fetch(`http://localhost:${port}/api/trader/0xnotanaddress`);
      codes.push(r.status);
    }
    const limited = codes[30] === 429;
    const firstThirtyOk = codes.slice(0, 30).every((c) => c === 400);
    check("rate limit trips at 31st request", limited && firstThirtyOk, `last=${codes[30]}`);
    const rl = await fetch(`http://localhost:${port}/api/trader/0xnotanaddress`);
    check("429 carries Retry-After", rl.headers.get("retry-after") !== null);

    /* ---- billing webhook suite ---- */
    console.log("\n\x1b[1m2. IPN webhook\x1b[0m");
    const email = `verify-${Date.now()}@example.com`;
    const reg = await fetch(`http://localhost:${port}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "test-password-123" }),
    });
    const { token, user } = await reg.json();
    check("registration succeeds", reg.status === 200 && !!token, `plan=${user?.plan}`);

    // Duplicate registration must be refused (account-takeover guard)
    const dup = await fetch(`http://localhost:${port}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "attacker-password" }),
    });
    check("duplicate email registration refused", dup.status === 400);

    const me = async () =>
      (await (await fetch(`http://localhost:${port}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })).json()).user;

    const paid = {
      payment_status: "finished",
      order_id: `${user.id}:${Date.now()}`,
      payment_id: `VERIFY-${Date.now()}`,
      price_amount: 10,
      price_currency: "usd",
    };

    await sendIpn(port, paid);
    const afterFirst = await me();
    check("valid IPN grants Pro", afterFirst.plan === "pro", `until ${afterFirst.proExpiresAt}`);

    await sendIpn(port, paid); // exact replay
    const afterReplay = await me();
    check(
      "replayed IPN does NOT extend Pro",
      afterReplay.proExpiresAt === afterFirst.proExpiresAt,
      `${afterFirst.proExpiresAt} -> ${afterReplay.proExpiresAt}`
    );

    await sendIpn(port, { ...paid, payment_id: `${paid.payment_id}-B`, price_amount: 1 });
    check("underpaid IPN ignored", (await me()).proExpiresAt === afterFirst.proExpiresAt);

    await sendIpn(port, { ...paid, payment_id: `${paid.payment_id}-C`, price_currency: "eur" });
    check("wrong-currency IPN ignored", (await me()).proExpiresAt === afterFirst.proExpiresAt);

    const badSig = await sendIpn(port, paid, { signature: "deadbeef" });
    check("bad signature rejected", badSig.status === 400);

    // Pro unlocks the gated feature
    const smPro = await fetch(`http://localhost:${port}/api/smart-money`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    check("Pro account reaches smart-money", smPro.status !== 403, `status ${smPro.status}`);

    // ...and a signed-in account CAN track
    const authTrack = await fetch(`http://localhost:${port}/api/watchlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ address: "0x204f72f35326db932158cba6adff0b9a1da95e14" }),
    });
    const tracked = await authTrack.json();
    check(
      "signed-in account can track",
      authTrack.status === 200 && tracked.count === 1,
      `status ${authTrack.status}, count ${tracked.count}`
    );
  } finally {
    child.kill();
  }
}

/* ---------------------------------------------------------------- phase 3 */
// Production with billing configured: the dev shortcut must be gone.
async function phaseProd() {
  console.log("\n\x1b[1m3. Production, billing configured\x1b[0m");
  const port = 4202;
  const { child } = startServer(port, {
    NODE_ENV: "production",
    NOWPAYMENTS_API_KEY: "fake-key-so-billing-is-on",
  });
  try {
    if (!(await waitForHealth(port))) return check("server starts", false, "no health response");
    check("server starts", true);

    const cfg = await (await fetch(`http://localhost:${port}/api/billing/config`)).json();
    check("billing reported enabled, devStub off", cfg.enabled === true && cfg.devStub === false, JSON.stringify(cfg));

    const stub = await fetch(`http://localhost:${port}/api/me/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-client-id": crypto.randomUUID() },
      body: JSON.stringify({ plan: "pro" }),
    });
    check("plan self-upgrade refused (404)", stub.status === 404, `got ${stub.status}`);
  } finally {
    child.kill();
  }
}

/* ---------------------------------------------------------------- phase 4 */
// Production without AUTH_SECRET must refuse to boot.
async function phaseSecret() {
  console.log("\n\x1b[1m4. Production without AUTH_SECRET\x1b[0m");
  const { child, getLog } = startServer(4203, { NODE_ENV: "production", AUTH_SECRET: "" });
  const code = await new Promise((resolve) => child.on("exit", resolve));
  check("refuses to start (exit 1)", code === 1, `exit=${code}`);
  check("explains why", /AUTH_SECRET/.test(getLog()));
}

/* ---------------------------------------------------------------- phase 5 */
// Error detail must be withheld from clients in production.
async function phaseDetail() {
  console.log("\n\x1b[1m5. Error detail redaction\x1b[0m");
  const run = (nodeEnv) =>
    new Promise((resolve) => {
      const c = spawn(
        process.execPath,
        [
          "-e",
          "import('./dist/errors.js').then(m=>console.log(JSON.stringify({detail:m.publicDetail(new Error('postgres://user:pw@internal'))})))",
        ],
        { cwd: SERVER_DIR, env: { ...process.env, NODE_ENV: nodeEnv }, stdio: ["ignore", "pipe", "ignore"] }
      );
      let out = "";
      c.stdout.on("data", (d) => (out += d));
      c.on("exit", () => resolve(JSON.parse(out || "{}")));
    });
  const prod = await run("production");
  const dev = await run("development");
  check("production omits detail", prod.detail === undefined, JSON.stringify(prod));
  check("development keeps detail", typeof dev.detail === "string");
}

/* ---------------------------------------------------------------- phase 6 */
// Positions paging. A pure function, so this needs no server and no upstream
// data — it is checked here because getting it wrong returns an empty table
// rather than an error, which is the kind of bug that ships quietly.
async function phasePositions() {
  console.log("\n\x1b[1m6. Positions paging\x1b[0m");
  const { selectPositions, PAGE_SIZE } = await import("../dist/positions.js");

  const day = (n) => new Date(Date.UTC(2026, 0, n)).toISOString();
  const pos = (i, over = {}) => ({
    conditionId: `c${i}`,
    title: `Market ${String(i).padStart(3, "0")}`,
    slug: "", icon: "", outcome: "Yes",
    size: 1, avgPrice: 0.5, curPrice: 0.5,
    initialValue: i, currentValue: i * 2,
    cashPnl: 0, percentPnl: 0, realizedPnl: 0,
    pnl: i,
    resolved: false,
    firstTradeAt: day(1 + (i % 28)),
    lastTradeAt: day(1 + (i % 28)),
    ...over,
  });

  const open = Array.from({ length: 45 }, (_, i) => pos(i));
  const resolved = Array.from({ length: 30 }, (_, i) => pos(100 + i, { resolved: true }));

  // The bug this phase exists for: the route builds these from
  // Number(req.query.page), so a request with no paging params hands in NaN.
  const bare = selectPositions(open, resolved, { mode: "all", page: NaN, pageSize: NaN });
  check(
    "missing page/pageSize fall back, not NaN",
    bare.positions.length === PAGE_SIZE && bare.page === 0 && bare.pageSize === PAGE_SIZE,
    `rows ${bare.positions.length}, page ${bare.page}, size ${bare.pageSize}`
  );
  check("total counts the whole set, not the page", bare.total === 75, `total ${bare.total}`);

  const openPage = selectPositions(open, resolved, { mode: "open" });
  check("mode=open excludes resolved", openPage.total === 45 && openPage.positions.every((p) => !p.resolved));

  // Sorting must span the whole set before slicing, or page 2 is just the
  // second chunk of an arbitrary order.
  const byPnl = selectPositions(open, resolved, { mode: "open", sort: "pnl", dir: "asc", page: 2 });
  check(
    "page 2 continues the global sort",
    byPnl.positions[0].pnl === 40 && byPnl.positions.length === 5,
    `first pnl ${byPnl.positions[0].pnl}, rows ${byPnl.positions.length}`
  );

  // Resolved rows sort on what they were worth; open rows on what they are
  // worth now. Getting this backwards makes every closed position read as $0.
  const byValue = selectPositions(open, resolved, { mode: "all", sort: "value", dir: "desc" });
  check("value uses initialValue once resolved", byValue.positions[0].conditionId === "c129");

  const past = selectPositions(open, resolved, { mode: "all", page: 900 });
  check("out-of-range page is empty, not an error", past.positions.length === 0 && past.total === 75);

  const huge = selectPositions(open, resolved, { mode: "all", pageSize: 5000 });
  check("pageSize is capped", huge.pageSize === 100, `size ${huge.pageSize}`);

  // An unknown date is not "the oldest" — those rows belong at the bottom
  // whichever way the column is pointing.
  const undated = [pos(999, { firstTradeAt: null, lastTradeAt: null })];
  for (const dir of ["asc", "desc"]) {
    const p = selectPositions(undated.concat(open), [], { mode: "open", sort: "lastTradeAt", dir, pageSize: 100 });
    check(`undated rows sort last (${dir})`, p.positions[p.positions.length - 1].conditionId === "c999");
  }
}

await phaseDev();
await phaseProd();
await phaseSecret();
await phaseDetail();
await phasePositions();

const failed = results.filter((r) => !r.pass);
console.log(
  `\n${failed.length === 0 ? "\x1b[32m" : "\x1b[31m"}${results.length - failed.length}/${results.length} checks passed\x1b[0m`
);
if (failed.length) {
  console.log("Failed:", failed.map((f) => f.name).join(", "));
  process.exit(1);
}
