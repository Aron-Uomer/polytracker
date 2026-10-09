// Subscription tiers. Payment integration comes later — for now `plan` lives on
// the User and can be flipped via the dev endpoint; the LIMITS are enforced
// wherever watchlist entries are added.

export type Plan = "free" | "pro";

export const PLAN_LIMITS: Record<Plan, number> = {
  free: 5,
  pro: 100,
};

export const PRO_PRICE_USD = 10; // $10 / month

export function isPlan(value: unknown): value is Plan {
  return value === "free" || value === "pro";
}

export function limitFor(plan: Plan): number {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

/** Effective plan: Pro only counts while its paid period hasn't lapsed. */
export function resolvePlan(plan: Plan, proExpiresAt: Date | number | null | undefined): Plan {
  if (plan !== "pro") return plan;
  if (!proExpiresAt) return "pro"; // no expiry set (e.g. dev stub) → treat as active
  const ms = proExpiresAt instanceof Date ? proExpiresAt.getTime() : proExpiresAt;
  return ms > Date.now() ? "pro" : "free";
}

/**
 * The rows whose Pro has lapsed and whose stored `plan` is therefore stale.
 *
 * Lives here, beside `resolvePlan`, because the two must agree: this is the
 * database-side spelling of the same rule, and the pair silently disagreeing
 * is the only way the sweep could ever revoke access it shouldn't. Keeping it
 * free of any database import also means it can be tested on its own.
 *
 * `proExpiresAt: null` is excluded deliberately. `resolvePlan` reads a missing
 * expiry as Pro that never lapses, so sweeping those rows would not be
 * correcting the record — it would be cancelling a plan.
 */
export function lapsedProFilter(now: Date = new Date()) {
  return { plan: "pro", proExpiresAt: { not: null, lt: now } };
}
