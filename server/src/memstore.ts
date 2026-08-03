import type { Plan } from "./plans.js";

// Shared in-memory user store used by both auth and watchlist when no database
// is configured (dev convenience; resets on restart). With a DATABASE_URL set,
// neither auth nor watchlist touches this — Postgres is the source of truth.

export interface WatchEntry {
  address: string;
  label: string | null;
}

export interface MemUser {
  id: string;
  email: string | null;
  name: string | null;
  passwordHash: string | null;
  plan: Plan;
  proExpiresAt: number | null; // unix ms
  entries: WatchEntry[];
}

const byId = new Map<string, MemUser>();
const byEmail = new Map<string, MemUser>();

export function memGet(id: string): MemUser | undefined {
  return byId.get(id);
}

export function memEnsure(id: string): MemUser {
  let u = byId.get(id);
  if (!u) {
    u = {
      id,
      email: null,
      name: null,
      passwordHash: null,
      plan: "free",
      proExpiresAt: null,
      entries: [],
    };
    byId.set(id, u);
  }
  return u;
}

export function memGetByEmail(email: string): MemUser | undefined {
  return byEmail.get(email);
}

export function memIndexEmail(u: MemUser) {
  if (u.email) byEmail.set(u.email, u);
}

// Processed payment ids, so a replayed IPN can't grant Pro twice. Like the rest
// of this store it's single-process and resets on restart — production billing
// needs a database (see README).
const processedPayments = new Set<string>();

/** Returns true the first time a payment id is seen, false on every replay. */
export function memClaimPayment(paymentId: string): boolean {
  if (processedPayments.has(paymentId)) return false;
  processedPayments.add(paymentId);
  return true;
}
