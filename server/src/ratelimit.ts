import type { NextFunction, Request, Response } from "express";

// Small in-process fixed-window rate limiter. No dependency, no store to run —
// enough for a single API instance, which is what the free-tier deploy is. If
// this ever scales to multiple instances, swap the `buckets` map for Redis;
// the middleware signature stays the same.

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** Namespaces the counter so several limiters can key on the same IP. */
  name: string;
  windowMs: number;
  max: number;
  message?: string;
  /** Defaults to the client IP. */
  keyFn?: (req: Request) => string;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 50_000; // hard cap so a flood of unique IPs can't grow this forever
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size > MAX_BUCKETS) buckets.clear();
}

export function rateLimit(opts: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    sweep(now);

    const key = `${opts.name}|${opts.keyFn?.(req) ?? req.ip ?? "unknown"}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;

    res.setHeader("X-RateLimit-Limit", String(opts.max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, opts.max - bucket.count)));

    if (bucket.count > opts.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: opts.message ?? "Too many requests — please slow down.",
        retryAfter,
      });
    }
    next();
  };
}
