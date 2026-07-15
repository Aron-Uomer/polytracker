# PolyTrack

Track and display any Polymarket trader's stats — **win rate, total P&L, today's P&L,
number of trades, traded volume, portfolio value, and open/resolved positions** — just
by pasting their wallet address.

A **Details** panel adds derived metrics computed from the wallet's full trade history:
efficiency (profit ÷ volume), average P&L % (last 100 markets), average buy size & buy/day,
average entry price, markets traded, active days, and trading-since date. Positions are
listed newest-entry-first with each market's "first buy" date.

Built as the foundation for a SaaS: React frontend, Node/Express API, and PostgreSQL
(via Prisma) for caching, history, and user accounts.

```
polytrack/
├── client/   React + Vite + TypeScript + Tailwind (the dashboard UI)
├── server/   Express + TypeScript API + Prisma (Polymarket fetch, stats, caching)
└── package.json   run both together in dev
```

## How it works

The server pulls from Polymarket's public APIs (no key required):

| Data | Source |
| --- | --- |
| Total P&L (all-time) + today's P&L | `lb-api.polymarket.com/profit` — the *canonical* number polymarket.com shows |
| Traded volume + profile (name/avatar) | `lb-api.polymarket.com/volume` |
| Portfolio value | `data-api.polymarket.com/value` |
| Open & resolved positions, per-market P&L | `data-api.polymarket.com/positions` |
| Trade count + history range | `data-api.polymarket.com/activity?type=TRADE` (paged backward through time) |
| Leaderboard (top traders) | `lb-api.polymarket.com/profit` & `/volume` (no `address`, ranked) |

It computes **win rate** itself as: resolved positions that ended in net profit ÷ all
resolved positions (dust positions under 1 share are excluded so the rate is meaningful).

Results are cached in Postgres for `CACHE_TTL_SECONDS` (default 5 min) and a snapshot is
saved on every refresh so you can chart a trader's history later.

> **No database needed to start.** If `DATABASE_URL` isn't set, the app runs "live-only":
> it skips caching/history and just fetches fresh each time. Add a database when you want
> caching, history, exact whale stats, and user accounts.

### Background indexer (when a database is configured)

The public REST endpoints cap deep pagination, and the live `/activity` feed can return
truncated pages — so for very active wallets, on-request fetching is both slow and a little
unreliable. With a `DATABASE_URL` set, PolyTrack instead **indexes each wallet's trades into
a `Trade` table** and computes stats from there:

- **Incremental:** a forward fill grabs only new trades since the last visit; a backward fill
  keeps walking toward the wallet's first trade across visits (`idxComplete` marks done).
- **Exact & instant:** once indexed, win rate / trade count / per-market P&L come from the DB
  with no page caps — even for wallets with tens of thousands of trades.
- **Resilient:** if the DB is unreachable, the route automatically falls back to the bounded
  live fetch, so the app keeps working.

Current-state figures (canonical P&L, portfolio value, open positions) are always fetched
live since they're cheap single calls; only the historical trade aggregation is indexed.

## Quick start

### 1. Install everything

```bash
cd polytrack
npm run install:all
```

### 2. (Recommended) Set up a free Postgres database

The best DB for this SaaS is **PostgreSQL**. The easiest zero-cost host is
[Neon](https://neon.tech) — it's serverless and plugs straight into Vercel:

1. Create a free Neon project and copy its connection string.
2. Configure the server env:
   ```bash
   cp server/.env.example server/.env
   ```
   Paste your string into `DATABASE_URL` in `server/.env`.
3. Create the tables:
   ```bash
   npm --prefix server run prisma:push
   ```

(You can skip this whole step for a quick try — the app works without it.)

### 3. Run it

```bash
npm run dev
```

- API → http://localhost:4000
- App → http://localhost:5173  ← open this

Paste a wallet (or click **Try an example wallet**) and you'll see the dashboard.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Run API + frontend together (hot reload) |
| `npm --prefix server run prisma:studio` | Browse the database in a GUI |
| `npm --prefix server run prisma:push` | Apply the Prisma schema to the database |
| `npm run build` | Production build of both server and client |

## Deploying

A simple, free-tier-friendly setup:

- **Database:** Neon (Postgres).
- **API (`server/`):** Render, Railway, or Fly.io. Build `npm --prefix server run build`,
  start `npm --prefix server start`. Set `DATABASE_URL`, `CORS_ORIGIN` (your frontend URL),
  and run `prisma db push` (or `prisma migrate deploy`) on deploy.
- **Frontend (`client/`):** Vercel or Netlify. Build `npm --prefix client run build`,
  output `client/dist`. Set `VITE_API_BASE` to your deployed API URL.

## Roadmap / next steps

The schema already includes `User` and `TrackedWallet` models for the SaaS layer. Natural
next features:

- ✅ **Leaderboard** of the top Polymarket traders (by profit/volume, all-time or 24h) at
  `#/leaderboard` — click any trader to open their full stats
- ✅ **Watchlist / "My Traders"** (`#/watchlist`) — track multiple wallets and see their
  stats side by side, with **tiered limits** (see below)
- ✅ **Accounts (email + password)** — sign up / sign in with JWT sessions; plans & watchlists
  follow the account across devices, and an anonymous watchlist is merged in on first login
- ✅ **Crypto billing (NOWPayments)** — hosted invoice + IPN webhook granting a 30-day Pro pass (see below)
- ✅ **Sign in with Google** (set `GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID`; see below)
- A **leaderboard** ranking every looked-up trader by P&L or win rate
- **History charts** from the `StatSnapshot` table (P&L / win rate over time)
- ✅ **Background indexer** — pages `/activity` into a `Trade` table for exact, instant stats
  on any wallet (active when `DATABASE_URL` is set; see above)
- A scheduled job to refresh/continue-indexing tracked wallets in the background (so whales
  are fully indexed before anyone looks them up)
- Daily P&L history & a calendar heatmap, now that trades are stored per-day
- Per-market and time-window filters

## Accounts & auth

Email + password sign-in with JWT bearer tokens (`server/src/auth.ts`, routes under `/api/auth`).
The token is stored in `localStorage` and sent as `Authorization: Bearer …`; requests are
identified by the account when signed in, otherwise by the anonymous `x-client-id`. Signing in
**merges** any wallets tracked anonymously into the account. Works with Postgres, or an
in-memory store shared with the watchlist when no `DATABASE_URL` is set (dev only — resets on
restart). Set a strong `AUTH_SECRET` in production. Passwords are hashed with bcrypt.

**Sign in with Google** (optional): the auth modal shows a "Continue with Google" button when a
Google OAuth Client ID is configured. The frontend gets a Google ID token, the backend verifies
it with `google-auth-library` and issues our own JWT (upserting the account by email — no
password). To enable:

1. In [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials),
   create an **OAuth client ID → Web application**.
2. Under **Authorized JavaScript origins** add `http://localhost:5173` (and your prod URL later).
   No redirect URI is needed for this token flow.
3. In `server/.env` set **both** `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` to that same
   client ID, then restart. (There's a single `server/.env` for the whole project — Vite reads
   it via `envDir` and only exposes the `VITE_`-prefixed vars to the browser.)

> Hardening for later: move the JWT into an httpOnly cookie, and add email verification /
> password reset (needs an email provider).

## Plans & the watchlist

Users can track multiple traders, capped by plan:

| Plan | Tracked traders | Price |
| --- | --- | --- |
| Free | 5 | $0 |
| Pro | 100 | $10 / month |

Limits live in `server/src/plans.ts` (`PLAN_LIMITS`) and are enforced server-side when adding
a wallet (`POST /api/watchlist` returns `403 { upgradeRequired: true }` past the cap).

### Billing (crypto via NOWPayments)

Payments are crypto-only, handled by **NOWPayments** hosted invoices (`server/src/billing.ts`).
It's **off by default** — with no keys set, "Upgrade to Pro" just flips the plan (the dev stub)
so you can develop without an account. Add your NOWPayments keys to turn on real checkout.

How it works: **Upgrade to Pro** creates a NOWPayments invoice → the buyer pays in crypto
(USDC/USDT/BTC/…) on the hosted page → NOWPayments calls our **IPN webhook** → we grant **30
days of Pro** (renewable). Since crypto can't silently auto-charge a wallet, Pro is a renewable
pass: `User.proExpiresAt` tracks the period and the plan reverts to free when it lapses.

**Setup:**

1. Create an account at [nowpayments.io](https://nowpayments.io) (add a payout wallet). For
   testing, use the **sandbox** at [account-sandbox.nowpayments.io](https://account-sandbox.nowpayments.io)
   and set `NOWPAYMENTS_API_URL="https://api-sandbox.nowpayments.io/v1"`.
2. **Payments → API keys** → copy the key → `NOWPAYMENTS_API_KEY`.
3. **Payments → IPN settings** → set an **IPN secret** → `NOWPAYMENTS_IPN_SECRET`.
4. Set `API_PUBLIC_URL` to a **publicly reachable** URL of this server (NOWPayments must be able
   to POST the IPN to `…/api/billing/webhook`). Locally, expose it with a tunnel, e.g.
   `ngrok http 4000`, and use the https URL it prints. In production, use your deployed API URL.
5. Restart the server. `GET /api/billing/config` now returns `{ enabled: true }`.

**Test the flow:** sign in → **Upgrade to Pro** → pay the invoice (sandbox lets you simulate a
payment). Once NOWPayments sends the `finished` IPN, your plan flips to **pro** for 30 days and
the tracked-wallet cap jumps to 100 (shown as "Pro until …").

**Going live:** switch `NOWPAYMENTS_API_URL` back to the production URL and use your live
account's API key + IPN secret. No code changes.

> The IPN webhook (`POST /api/billing/webhook`) is verified with HMAC-SHA512 over the sorted
> JSON body using `NOWPAYMENTS_IPN_SECRET`. Needs a database in production so Pro periods survive
> restarts; the in-memory fallback works for a single local session.

Signed-out visitors are identified by an anonymous `x-client-id` (localStorage); signing in
switches to the account and merges the anonymous watchlist. When crypto billing isn't
configured, **"Upgrade to Pro"** falls back to a dev stub (`POST /api/me/plan`) that flips the
plan so you can see the higher limit locally. The limit logic reads the effective `User.plan`
(Pro only while `proExpiresAt` hasn't lapsed).

## Notes & caveats

- **Win rate** is reconstructed from a wallet's full `/activity` history: per market we sum
  `sells + redeems − buys`, and a closed/resolved market counts as a "win" if that net is
  positive. (We can't rely on `/positions` alone — once a wallet *redeems* a resolved
  market it disappears from that endpoint, which is why a naive approach shows 0 resolved.)
  In practice this lands within ~0.1% of what trackers like polywallet show.
- **Portfolio value** is the open-positions value from Polymarket's `/value`. It does *not*
  include a wallet's idle USDC cash balance (that isn't exposed as a plain on-chain balance),
  so it can read a few % below trackers that add cash on top.
- **Trade count** is found by paging the `/activity` feed *backward through time* (via the
  `end` cursor), which — unlike offset paging — has no depth cap, so it reaches a wallet's
  full history. To keep a single lookup responsive it's bounded by `TRADES_MAX_PAGES` /
  `TRADES_TIME_BUDGET_MS` (see `server/.env.example`); if those bounds are hit before the
  wallet's first trade, the count shows e.g. `20,000+`. Hyperactive whales (tens of
  thousands of trades) are the only ones that hit this — an exact count for them needs the
  background indexer below.
- Polymarket users trade through a **proxy wallet** (a Gnosis Safe). The API accepts either
  the proxy or the controlling address; everything is keyed on the proxy wallet.
- All data comes from public Polymarket endpoints and is for informational purposes only.
```
