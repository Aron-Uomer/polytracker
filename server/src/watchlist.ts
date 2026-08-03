import { prisma, DB_ENABLED } from "./db.js";
import { limitFor, resolvePlan, type Plan } from "./plans.js";
import { memEnsure, memGet, type WatchEntry } from "./memstore.js";

// Identity is either a logged-in account id or an anonymous `x-client-id`.
// Watchlists persist in Postgres when a DATABASE_URL is configured, otherwise in
// the shared in-memory store (works in dev, resets on restart).

export type { WatchEntry };

export interface WatchlistState {
  plan: Plan;
  limit: number;
  count: number;
  entries: WatchEntry[];
  proExpiresAt: string | null;
}

export interface AddResult {
  ok: boolean;
  upgradeRequired?: boolean;
  state: WatchlistState;
}

function stateFrom(
  plan: Plan,
  entries: WatchEntry[],
  proExpiresAt: Date | number | null
): WatchlistState {
  const eff = resolvePlan(plan, proExpiresAt);
  const iso =
    proExpiresAt == null
      ? null
      : (proExpiresAt instanceof Date ? proExpiresAt : new Date(proExpiresAt)).toISOString();
  return {
    plan: eff,
    limit: limitFor(eff),
    count: entries.length,
    entries,
    proExpiresAt: eff === "pro" ? iso : null,
  };
}

const EMPTY_FREE_STATE = (): WatchlistState => stateFrom("free", [], null);

/**
 * Current watchlist for an identity.
 *
 * `create` is off by default: reads must not materialise a row, or anyone can
 * fill the users table just by sending random `x-client-id` headers at
 * `GET /api/watchlist`. An unknown id simply reads as an empty free plan; the
 * row appears the first time they actually save something.
 */
export async function getState(
  clientId: string,
  { create = false }: { create?: boolean } = {}
): Promise<WatchlistState> {
  if (DB_ENABLED) {
    const user = create
      ? await prisma.user.upsert({
          where: { id: clientId },
          create: { id: clientId, plan: "free" },
          update: {},
        })
      : await prisma.user.findUnique({ where: { id: clientId } });
    if (!user) return EMPTY_FREE_STATE();

    const rows = await prisma.trackedWallet.findMany({
      where: { userId: clientId },
      orderBy: { createdAt: "asc" },
    });
    return stateFrom(
      user.plan as Plan,
      rows.map((r) => ({ address: r.address, label: r.label })),
      user.proExpiresAt
    );
  }
  const u = create ? memEnsure(clientId) : memGet(clientId);
  if (!u) return EMPTY_FREE_STATE();
  return stateFrom(u.plan, [...u.entries], u.proExpiresAt);
}

export async function addWallet(
  clientId: string,
  rawAddress: string,
  label: string | null
): Promise<AddResult> {
  const address = rawAddress.toLowerCase();
  // A write, so this is where an anonymous identity earns its row.
  const state = await getState(clientId, { create: true });

  if (state.entries.some((e) => e.address === address)) {
    return { ok: true, state }; // idempotent — already tracked
  }
  if (state.count >= state.limit) {
    return { ok: false, upgradeRequired: true, state }; // hit the plan cap
  }

  if (DB_ENABLED) {
    await prisma.trackedWallet.create({
      data: { userId: clientId, address, label },
    });
  } else {
    memEnsure(clientId).entries.push({ address, label });
  }
  return { ok: true, state: await getState(clientId) };
}

export async function removeWallet(clientId: string, rawAddress: string): Promise<WatchlistState> {
  const address = rawAddress.toLowerCase();
  if (DB_ENABLED) {
    await prisma.trackedWallet.deleteMany({ where: { userId: clientId, address } });
  } else {
    const u = memEnsure(clientId);
    u.entries = u.entries.filter((e) => e.address !== address);
  }
  return getState(clientId);
}

/** Dev-only until billing exists: flip a user's plan to see the higher cap. */
export async function setPlan(clientId: string, plan: Plan): Promise<WatchlistState> {
  if (DB_ENABLED) {
    await prisma.user.upsert({
      where: { id: clientId },
      create: { id: clientId, plan },
      update: { plan },
    });
  } else {
    memEnsure(clientId).plan = plan;
  }
  return getState(clientId);
}

/**
 * Move an anonymous client's tracked wallets into a logged-in account.
 *
 * The source id comes from a client-supplied header, so we only ever merge from
 * a genuinely anonymous identity — one with no email and no password. Otherwise
 * signing in while passing someone else's user id as `x-client-id` would move
 * that account's wallets into yours.
 */
export async function mergeAnonymous(fromId: string, toId: string): Promise<void> {
  if (!fromId || fromId === toId) return;

  if (DB_ENABLED) {
    const from = await prisma.user.findUnique({
      where: { id: fromId },
      select: { email: true, passwordHash: true },
    });
    if (!from || from.email || from.passwordHash) return; // not an anonymous identity
    const rows = await prisma.trackedWallet.findMany({ where: { userId: fromId } });
    for (const w of rows) {
      await prisma.trackedWallet
        .upsert({
          where: { userId_address: { userId: toId, address: w.address } },
          create: { userId: toId, address: w.address, label: w.label },
          update: {},
        })
        .catch(() => {});
    }
    await prisma.trackedWallet.deleteMany({ where: { userId: fromId } });
    return;
  }

  const from = memGet(fromId);
  if (!from || from.email || from.passwordHash) return; // not an anonymous identity
  const to = memEnsure(toId);
  for (const e of from.entries) {
    if (!to.entries.some((x) => x.address === e.address)) to.entries.push(e);
  }
  from.entries = [];
}
