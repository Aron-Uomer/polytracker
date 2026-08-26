# Rate limiting

Implementation: [`server/src/ratelimit.ts`](server/src/ratelimit.ts) (~60 lines, no dependency).
Configuration: [`server/src/index.ts`](server/src/index.ts).

---

## Why it exists

Two distinct threats, not one.

**Amplification.** A single request to `/api/trader/:address` can fan out to roughly fifty
calls to Polymarket's public API — up to forty pages of the activity feed, several pages of
positions, three leaderboard calls, one value call. A client sending 100 cheap-looking
requests turns into ~5,000 requests upstream. The limiter protects Polymarket's goodwill as
much as it protects this server; getting IP-banned by the only data source would end the
product.

**Credential stuffing.** `/api/auth/login` is an unauthenticated endpoint that compares a
password. Without a cap it is a free oracle for anyone with a leaked-credential list.

A third, quieter reason: this runs on a 512 MB Render instance with one process. Unbounded
concurrent whale lookups will exhaust it long before they exhaust the network.

---

## The mechanism

A **fixed-window counter**, held in a `Map` in process memory.

```ts
interface Bucket { count: number; resetAt: number; }
const buckets = new Map<string, Bucket>();   // "name|ip" -> Bucket
```

Every request through a limiter does five things:

1. **Builds a key**: `` `${opts.name}|${req.ip}` ``, e.g. `trader|203.0.113.7`.
   The `name` prefix is what allows several limiters to count the same IP independently —
   exhausting `/api/trader` must not lock a visitor out of signing in.

2. **Finds or creates the bucket.** If `resetAt` has already passed, the bucket is
   *replaced*, not decremented. That single line is what makes the window fixed rather than
   sliding, with the consequences described under [Known
   characteristics](#known-characteristics).

3. **Increments the counter.**

4. **Sets headers** on every response, allowed or not:
   `X-RateLimit-Limit`, `X-RateLimit-Remaining`.

5. **Decides.** Over the max → `429` with `Retry-After` (seconds, floor of 1) and a JSON
   body carrying `error` and `retryAfter`. Otherwise `next()`.

There is no store to run, no Redis, no sidecar. That is a deliberate fit to a single-instance
deployment, not an oversight — see [Scaling past one instance](#scaling-past-one-instance).

---

## The limits

Registered in `index.ts` in this order. Every `/api` request passes through the **global**
limiter *and* its route limiter, so both budgets are consumed.

| Path | Limit | Window | Reasoning |
| --- | --- | --- | --- |
| `/api/health` | **none** | — | Registered *before* the limiters so the platform's probe can never trip one. A rate-limited health check would make Render mark the service unhealthy and restart it. |
| *(global)* | 300 | 1 min | Backstop across everything, including paths with no specific limiter. |
| `/api/auth` | **20** | **15 min** | Credential stuffing. The long window is the point: 20 attempts is generous for a person who forgot their password and near-useless for a bot. |
| `/api/smart-money` | **10** | 1 min | Scans the top N traders' recent activity — the single most expensive endpoint in the API. |
| `/api/trader` | **30** | 1 min | ~50 upstream calls per cold lookup. |
| `/api/leaderboard` | 60 | 1 min | One upstream call, cacheable. |
| `/api/watchlist` | 60 | 1 min | Small database reads and writes. |
| `/api/me` | 60 | 1 min | Small database reads. |
| `/api/billing` | 60 | 1 min | Covers both checkout and the IPN webhook — see the caveat below. |

### Why the numbers differ by two orders of magnitude

They are set by **cost per request**, not by a uniform notion of politeness. A leaderboard
call is one upstream request; a smart-money call is hundreds. Giving them the same budget
would either strangle the cheap endpoints or leave the expensive one unprotected.

The auth window is the outlier and deliberately so. Every other limiter uses a one-minute
window because it is defending a resource. Auth is defending a *secret*, and secrets are
attacked slowly. A 20/minute cap would permit 28,800 guesses a day; 20 per fifteen minutes
permits 1,920.

---

## Middleware ordering

Order in `index.ts` is load-bearing:

```
trust proxy
security headers
CORS
express.json({ limit: "64kb" })
/api/health                     ← before the limiters, therefore exempt
global limiter (300/min)
per-route limiter + router
```

Two consequences worth understanding:

- **Body parsing happens before limiting.** A rate-limited request still has its body parsed.
  This is safe only because of the `64kb` cap on `express.json` — without that ceiling, an
  attacker could make the server parse megabytes per request and never reach the limiter that
  was supposed to stop them.

- **Health is exempt by position, not by configuration.** Moving that line below the global
  limiter would silently make the platform's uptime probe consume the same budget as real
  traffic.

### `trust proxy` is part of the rate limiter

```ts
app.set("trust proxy", 1);
```

Render terminates TLS at a proxy. Without this line `req.ip` is the *proxy's* address, so
every visitor on earth shares one bucket and the first busy minute locks out everybody.

The `1` matters as much as the setting. It means "trust exactly one hop" — take the last
entry in `X-Forwarded-For`, which the proxy itself appended. Trusting *all* hops
(`trust proxy: true`) would let any client prepend a forged address to that header and get a
fresh bucket per request, defeating the limiter entirely.

**If you ever move off Render, re-check this number.** It is a property of the deployment
topology, not of the code, and it is wrong by default on both a bare VPS (should be `false`)
and behind two proxies (should be `2`).

---

## Memory safety

The `buckets` map is bounded two ways, because a map keyed by client IP is a memory
amplification vector in its own right:

```ts
const MAX_BUCKETS = 50_000;

function sweep(now) {
  if (now - lastSweep < 60_000) return;   // at most once a minute
  lastSweep = now;
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
  if (buckets.size > MAX_BUCKETS) buckets.clear();
}
```

**The sweep** is throttled to once a minute and runs inline on a request. It is O(map size),
so at the 50,000 cap it is a 50,000-iteration loop once per minute — negligible next to a
single database round-trip.

**The hard cap** is a blunt instrument: exceeding it clears every bucket, briefly resetting
everyone's counter. That is a deliberate trade. On a 512 MB instance, a flood of unique
source addresses exhausting the heap is a worse outcome than a momentary gap in enforcement.

---

## What is tested

Two of the 27 checks in `server/scripts/verify.mjs` (`npm --prefix server run verify`):

- **`rate limit trips at 31st request`** — sends 31 requests to `/api/trader`, asserts the
  first 30 return `400` (invalid address, i.e. they reached the route) and the 31st returns
  `429`. This verifies the limiter counts *attempts* rather than successes, which is the
  property that matters: a limiter that only counted valid requests would let an attacker
  probe freely with malformed input.
- **`429 carries Retry-After`** — asserts the header is present, since a client cannot back
  off intelligently without it.

Not covered: window expiry and reset, per-name bucket isolation, and behaviour under
concurrent requests.

---

## Known characteristics

These are properties of the design, not bugs — but you should meet them here rather than
during an incident.

### Fixed windows allow burst-at-the-boundary

Thirty requests at `11:59:59` and thirty more at `12:00:01` is sixty requests in two seconds,
all permitted, because the bucket is replaced at the boundary. The effective short-term
ceiling is **2× the configured limit**.

A sliding-window or token-bucket algorithm removes this. It is not worth the complexity here
— the limits exist to stop sustained abuse and amplification, and a two-second doubling
threatens neither.

### The IPN webhook shares a bucket with checkout

`/api/billing` covers both `POST /checkout` and the NOWPayments IPN callback under one
60/minute limit, keyed by IP. Every IPN arrives from NOWPayments' address, so all callbacks
worldwide share a single bucket.

At current volume this is irrelevant. If payment volume ever grows enough for 60 callbacks a
minute to be plausible, split the webhook into its own limiter with a `keyFn` that ignores IP,
or exempt it and rely on the HMAC signature check for protection. The signature check is
already the real defence there; the rate limit is only a flood guard.

### Shared IPs share a bucket

Everyone behind one corporate NAT, VPN exit node, or university gateway counts as one client.
The limits are set loosely enough that this is unlikely to bite, but it is the reason
`/api/trader` is 30/minute rather than 5.

---

## Scaling past one instance

**Counters live in process memory.** With one instance that is correct and cheap. With two,
each keeps its own map: effective limits double, and enforcement depends on which instance a
request happens to land on.

The migration is contained. Replace the `buckets` Map with Redis `INCR` + `EXPIRE`; the
middleware signature and every call site stay identical:

```ts
const n = await redis.incr(key);
if (n === 1) await redis.pexpire(key, opts.windowMs);
if (n > opts.max) { /* 429 */ }
```

Do this when you add a second instance, not before. A Redis dependency for a single free-tier
process is cost and failure surface bought for nothing.

---

## Changing a limit

Edit the `rateLimit({ ... })` call in `server/src/index.ts`. Nothing is read from the
environment, deliberately — a limit is a security property and should change through a
reviewed commit rather than a dashboard field somebody can edit at 3am.

If you raise `/api/trader`, remember what it multiplies into: ~50 upstream calls each. Thirty
per minute per IP is already 1,500 requests a minute to Polymarket from one client.
