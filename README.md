# Whole Record

**Find out whether a Polymarket trader is actually any good.**

Paste any wallet address and get their real win rate, profit, and every position they've
held — including the ones they already closed.

---

## The problem

Polymarket shows you a trader's profit. Profit is easy to misread.

A wallet can look brilliant off one lucky resolution. And the positions page only shows what
someone is holding *right now* — it says nothing about the twelve markets they quietly sold at
a loss last month. Once a trader redeems a resolved market, it vanishes from that view
entirely.

So the number everyone quotes tells you almost nothing about skill.

Whole Record rebuilds the full picture from a wallet's complete trade history: every entry,
every exit, everything already settled. Then it works out how often they were actually right.

---

## What you get

Paste a wallet — or search a trader by name — and you'll see:

**Headline numbers**
- **Win rate**, worked out from every finished market, not just open ones
- All-time profit and today's profit
- Lifetime volume and current portfolio value
- Total trades, and when they started trading

**Positions**
- Every open and closed position, sortable by any column
- Entry price, current price, and profit or loss per market
- Whether each one actually resolved, or the trader sold out early

**Deeper detail**
- Efficiency (profit ÷ volume), average entry price, average trade size
- Markets traded, active days, best and worst result
- An activity calendar showing when they trade

**Finding traders worth checking**
- **Leaderboard** — the top traders on Polymarket by profit or volume
- **Smart money** — which markets the best traders are buying right now
- **Compare** — up to four wallets side by side
- **Watchlist** — keep the good ones and check back later

---

## Using it

1. Open the site.
2. Paste a wallet address (`0x…`) or type a trader's name.
3. Press **Track**.

Headline numbers appear in about a second. The full history takes longer on very active
wallets — it's reading their entire trade record from Polymarket while you wait.

Watching a wallet needs a free account. Everything else works signed out.

### Free and Pro

| | Free | Pro |
| --- | --- | --- |
| Look up any wallet | ✅ | ✅ |
| Leaderboard | ✅ | ✅ |
| Watchlist | 5 wallets | 100 wallets |
| Smart money | — | ✅ |
| Compare wallets | — | ✅ |
| Price | $0 | $10 / month |

Pro is paid in crypto and lasts 30 days at a time. There's no subscription that silently
renews — when it lapses, you drop back to free.

---

## Where the numbers come from

Everything comes from Polymarket's own public API. No private data, no scraping, no key
required.

| What | Source |
| --- | --- |
| Profit, today's profit, volume, profile | `lb-api.polymarket.com` |
| Portfolio value, open positions | `data-api.polymarket.com` |
| Full trade history | `data-api.polymarket.com/activity` |

### How win rate is calculated

This is the number the whole product exists for, so it's worth being precise about.

For every market a wallet has traded, we add up what they put in and what they took out
(`sells + redeems − buys`). If they came out ahead, that market counts as a win.

Win rate is **wins ÷ finished markets**.

Two details:

- **"Finished" includes markets they sold out of early**, not just ones that resolved. That's
  why the interface says *closed* rather than *resolved*. Each position is tagged with which
  one it was.
- **Tiny positions are ignored** (under one share). Otherwise thousands of dust positions
  would drown out the real result.

In practice this lands within about 0.1% of what other Polymarket trackers show.

---

## Honest limitations

- **Very active wallets get approximate numbers.** Reading a full trade history takes time, so
  each lookup is capped. A wallet with tens of thousands of trades will show figures based on
  its most recent activity, and the interface says so rather than pretending otherwise.
- **Portfolio value doesn't include idle cash.** It's the value of open positions. Polymarket
  doesn't expose a wallet's spare USDC, so this can read a few percent below trackers that add
  it.
- **Traders are identified by their proxy wallet.** Polymarket users trade through a proxy
  (a Gnosis Safe). You can paste either address — everything is keyed to the proxy.
- **This is information, not advice.** Past results tell you about the past.

---

## For developers

Built with React, Vite, TypeScript and Tailwind on the front end; Express, TypeScript and
Prisma with Postgres on the back.

```
client/   the web app
server/   the API
```

Run it locally:

```bash
npm run install:all
npm run dev          # API on :4000, app on :5173
```

It works without a database — you just lose accounts, the watchlist, and caching. To enable
those, copy `server/.env.example` to `server/.env`, add a Postgres `DATABASE_URL`, and run
`npx prisma migrate deploy` from `server/`.

**Further reading:**

- [DEPLOY.md](DEPLOY.md) — deploying to Vercel, Render and Neon, plus every environment
  variable, Google sign-in, crypto billing and analytics
- [RATE-LIMITING.md](RATE-LIMITING.md) — how request limits work and why each one is set
  where it is
- [PRODUCT.md](PRODUCT.md) — who this is for and what it's trying to be
