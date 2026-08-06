# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: **Polymarket traders scouting other people's wallets.** They have an address —
from a leaderboard, a screenshot, a Twitter callout, a friend's tip — and they want to know
whether that person is actually good before they copy, follow, or fade them. The arriving
visitor is evaluating a stranger's competence, not reviewing their own.

Secondary (confirmed by feature set, not by interview): the same user returns to monitor a
set of wallets over time via the watchlist.

## Product Purpose

Polymarket publishes profit and volume, which are easy to misread: a wallet can look
profitable off one lucky resolution, and open positions say nothing about what a trader
already exited. PolyTrack reconstructs a wallet's full record — win rate, realized and
unrealized P&L, position-by-position history — so a visitor can judge skill rather than
headline profit. Success is a visitor deciding, with justified confidence, whether a wallet
is worth following.

## Positioning

**Smart-money discovery.** The differentiated job is surfacing *who* is actually good, not
merely reporting on a wallet the visitor already chose. A competitor can render one
address's stats; the product's claim is helping the visitor find the addresses worth
rendering in the first place.

The underlying mechanism that makes this credible: stats are rebuilt from a wallet's
complete trade history — including positions already sold or resolved — rather than from
whatever happens to be open right now.

## Operating Context

Visitors arrive with a raw `0x…` address or a username pasted from elsewhere, often on
mobile, often mid-conversation. Evaluation is comparative and repeated: check a wallet,
compare it against another, keep the good ones on a list. Data originates from Polymarket's
public APIs (`lb-api.polymarket.com` for profit/volume, `data-api.polymarket.com` for
positions and activity); PolyTrack owns no proprietary market data.

## Capabilities and Constraints

Confirmed capabilities: wallet search; trader page with headline stats, sortable positions
table, and charts; leaderboard; smart-money view; side-by-side compare; watchlist
(requires sign-in); email/password and Google authentication; free and Pro tiers
(`server/src/plans.ts`: watchlist limit 5 free / 100 Pro, Pro at $10/month, billed in crypto
via NOWPayments).

Constraints:

- The API is hosted on Render's free tier and **sleeps after ~15 minutes idle**; a cold
  request takes 30–60s. No first-paint experience may depend on an API response.
- Deep wallet lookups page through Polymarket's activity API and can take ~20s on
  high-volume addresses.
- Hash-based routing; there are no separately crawlable per-trader URLs.
- The repository has no automated test suite.

Undecided: whether cached/aggregate data will ever be served at build time.

## Brand Commitments

Name: **PolyTrack**. No logo asset, wordmark file, or written brand guideline exists.
Nothing about the current visual treatment has been declared binding.

## Evidence on Hand

Real product surfaces exist and work (trader pages, leaderboard, smart money, compare,
watchlist). There are **no** testimonials, named customers, user counts, press mentions,
benchmarks, case studies, or partnership claims — none may be fabricated.

Confirmed for the landing page: **the hero shows no live data.** Real numbers appear only
after the visitor searches a wallet. This is a deliberate decision, taken because of the
cold-start constraint above, not an oversight to be corrected later.

## Product Principles

1. **Judgement over headline numbers.** Every surface exists to help someone decide whether
   a trader is good, not to display the largest figure available.
2. **Discovery is the product.** Finding wallets worth examining outranks rendering one
   already-known wallet prettily.
3. **Never fake proof.** No invented users, testimonials, or metrics — the credibility of a
   stats product collapses the moment any number on it is decorative.
4. **The cold start is a design constraint, not a bug to route around.** First paint owes
   nothing to the API.
5. **Honest about what is inferred.** Reconstructed history is the claim; where data is
   incomplete, the interface says so rather than rounding it away.

## Accessibility & Inclusion

No product-specific standard was established in the interview. Existing implementation
clears WCAG AA text contrast (verified 2026-08-06); that floor should not regress.
