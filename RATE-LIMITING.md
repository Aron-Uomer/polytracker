# Rate limiting

The code: [`server/src/ratelimit.ts`](server/src/ratelimit.ts) — about 60 lines.
Where the limits are set: [`server/src/index.ts`](server/src/index.ts).

---

## What it does

It counts how many requests each visitor makes, and blocks them if they make too many too
fast.

Think of a bouncer with a clicker. Every time you walk in, he clicks. If you've come in more
than 30 times this minute, he stops you at the door until the minute is up.

---

## Why we need it

**Reason 1: one request to us becomes fifty requests to Polymarket.**

When someone looks up a wallet, our server has to ask Polymarket for the data. Not once —
about fifty times, because it walks through the wallet's trade history page by page.

So if one person sends us 100 requests, we send Polymarket 5,000. Do that for long and
Polymarket blocks our server. We'd have no data at all, and the site would be dead. The rate
limit protects our relationship with them as much as it protects us.

**Reason 2: stopping password guessing.**

Anyone can hit the login endpoint without an account. Without a limit, someone could try
millions of email and password combinations until one works. With a limit, they get 20 tries
every 15 minutes, which makes that pointless.

There's also a third, smaller reason: our server has 512 MB of memory. Too many big lookups
at once will run it out of memory before it runs out of anything else.

---

## How it works

The server keeps a list in memory. Each entry is one visitor's counter for one part of the
site:

```
"trader|203.0.113.7"   ->  { count: 12, resetAt: 3:05:00pm }
```

That reads as: *the visitor at 203.0.113.7 has made 12 trader requests, and their count goes
back to zero at 3:05pm.*

When a request comes in:

1. **Work out whose counter this is.** The key is the section name plus the visitor's IP
   address. The section name matters — it means running out of trader lookups doesn't also
   lock you out of logging in. Each section has its own counter.

2. **Find their counter, or start a new one.** If the reset time has already passed, we throw
   the old counter away and start fresh at zero.

3. **Add one to the count.**

4. **Tell them where they stand.** Every response includes two headers:
   `X-RateLimit-Limit` (your allowance) and `X-RateLimit-Remaining` (what's left).

5. **Allow or block.** Under the limit, the request goes through. Over it, they get a `429`
   response ("too many requests") and a `Retry-After` header saying how many seconds to wait.

That's the whole thing. No database, no extra service to run. Just a list in memory.

---

## The limits

| Part of the site | Allowance | Per |
| --- | --- | --- |
| Health check | unlimited | — |
| Everything (overall cap) | 300 | minute |
| Logging in / signing up | **20** | **15 minutes** |
| Smart money | **10** | minute |
| Trader lookup | **30** | minute |
| Leaderboard | 60 | minute |
| Watchlist | 60 | minute |
| Account | 60 | minute |
| Billing | 60 | minute |

Every request counts against **two** limits: the overall 300/minute cap, and the limit for
that specific section.

### Why the numbers are so different

The limits are based on **how expensive each request is**, not on being evenly fair.

- A **leaderboard** request is one call to Polymarket. Cheap. 60 a minute is fine.
- A **trader lookup** is about fifty calls. 30 a minute is already 1,500 calls to Polymarket
  from one person.
- **Smart money** scans lots of traders at once. It's the most expensive thing we do, so it
  gets the smallest allowance.

### Why login is measured in 15 minutes, not 1

Every other limit resets each minute. Login resets every 15.

That's on purpose. The other limits are protecting a *resource* — bursts are fine as long as
they don't last. Login is protecting a *password*, and someone guessing passwords is happy to
go slowly.

Here's the difference:

- 20 tries per **minute** = 28,800 guesses a day.
- 20 tries per **15 minutes** = 1,920 guesses a day.

Same number, very different protection. And if you've genuinely forgotten your password, 20
tries is plenty.

### Why the health check has no limit

Render pings `/api/health` constantly to check the server is alive. If that ping ever got rate
limited, Render would think the server was broken and restart it.

---

## Two things that would break if you moved them

**1. The health check has to stay where it is.**

In `index.ts`, the health check is written *above* the rate limiting code. That's the only
reason it's unlimited. Move that line lower and Render's pings start counting against the
limit — and eventually restart your server for no reason.

**2. `app.set("trust proxy", 1)` is part of the rate limiter.**

Our server doesn't talk to visitors directly. Render sits in front of it and passes requests
along. So by default, every request looks like it came from Render, not from the visitor.

Without this line, **everyone shares one counter.** The first 30 people to look up a wallet
would use up the allowance for the entire internet.

The `1` matters too. It means "trust one server in front of us" — Render. If you set it to
`true` ("trust everyone"), visitors could lie about their own IP address and get a fresh
allowance on every request, which defeats the whole thing.

If you ever move off Render, check this number again. It describes your hosting setup, not
your code. On a plain server with nothing in front of it, it should be `false`.

---

## Memory

The list of counters lives in memory, so it can't be allowed to grow forever. Two things keep
it in check:

**Cleanup.** Once a minute, the server walks the list and deletes expired counters. It runs
during a normal request and takes almost no time.

**A hard ceiling.** If the list ever passes 50,000 entries, it gets wiped completely.

Wiping everything is crude — it briefly resets everyone's count. But running out of memory
would take the whole site down, and a few seconds of weak enforcement is much better than
that.

---

## What's tested

Two of the 27 checks in `npm --prefix server run verify` cover this:

**"rate limit trips at 31st request"** — sends 31 trader requests and checks that the first 30
get through and the 31st is blocked.

There's a detail here worth understanding. The test uses a deliberately invalid address, so
the first 30 come back as errors. That's the point: it proves we count **every attempt**, not
just the successful ones. If we only counted valid requests, someone could send unlimited
garbage and never hit the limit.

**"429 carries Retry-After"** — checks the blocked response tells you how long to wait.
Without that, an app has no idea when to try again.

**Not tested:** that counters actually reset when the minute is up, that the sections really
are separate from each other, and what happens when lots of requests arrive at the same
instant.

---

## Quirks worth knowing

These aren't bugs. They're side effects of keeping it simple. Better to know now than to be
confused later.

### You can briefly get double the limit

The counter resets at a fixed moment. So someone could make 30 requests at 11:59:59 and 30
more at 12:00:01 — 60 requests in two seconds, all allowed, because the counter reset in
between.

A more complicated design would prevent this. We didn't bother, because the limits exist to
stop *sustained* abuse, and two seconds of double speed doesn't hurt anything.

### Payment callbacks share a limit with checkout

When someone pays, NOWPayments sends our server a message confirming it. That message and the
"start checkout" button share the same 60/minute allowance, counted by IP address.

Since every payment confirmation comes from NOWPayments' own servers, they all share one
counter. At your current volume this doesn't matter at all. If you ever get 60 payments in a
minute, it would — and the fix is to give the payment callback its own limit.

Worth knowing: the callback is already protected by a signature check that proves the message
really came from NOWPayments. The rate limit there is just a flood guard, not the main
defence.

### People sharing an internet connection share a counter

Everyone in one office, on one VPN, or on one university network looks like a single visitor
to us, because they share an IP address.

This is why trader lookups are 30 a minute and not 5. The limits are set loosely enough that
normal shared connections won't hit them.

---

## When you outgrow this

Right now you run **one** server, and the counters live in that server's memory. That works
perfectly.

The moment you run **two** servers, it stops working properly. Each one keeps its own separate
list, so your real limit doubles, and whether someone gets blocked depends on which server
their request happened to land on.

The fix is to move the counters into Redis (a shared memory store both servers can read). It's
a small change — only the storage part changes, and nothing else has to be touched.

Don't do it until you actually run a second server. Adding Redis now means paying for it and
maintaining it for no benefit.

---

## How to change a limit

Open `server/src/index.ts` and edit the numbers in the `rateLimit({ ... })` lines.

The limits are in the code on purpose, not in a settings dashboard. A rate limit is a security
setting, so changing it should go through a proper code change that someone can review — not a
text box somebody edits at 3am.

**Before raising the trader limit, remember the multiplier.** Each trader lookup is about 50
requests to Polymarket. At 30 a minute, one person is already generating 1,500 requests a
minute to them. Doubling it to 60 means 3,000.
