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
