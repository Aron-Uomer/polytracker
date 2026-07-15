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
