import type {
  AddWatchResult,
  AuthUser,
  LeaderboardMetric,
  LeaderboardResponse,
  LeaderboardRow,
  LeaderboardWindow,
  Plan,
  PositionMode,
  PositionPage,
  PositionSortKey,
  SortDir,
  SmartMoneyFilters,
  SmartMoneyResult,
  TraderResponse,
  TraderSummary,
  WatchlistState,
} from "./types";

import { cached, clearCache } from "./cache";

// In dev, Vite proxies /api to the backend (see vite.config.ts).
// In prod, set VITE_API_BASE to the deployed API origin.
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/** Stable per-browser id – stands in for an account until real auth exists. */
function clientId(): string {
  let id = localStorage.getItem("pt_client_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("pt_client_id", id);
  }
  return id;
}
// --- Auth token (JWT bearer) ---
const TOKEN_KEY = "pt_token";
export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function clientHeaders(): Record<string, string> {
  const h: Record<string, string> = { "x-client-id": clientId() };
  const token = getToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
const jsonHeaders = () => ({ ...clientHeaders(), "Content-Type": "application/json" });

/** Parse a response safely: never throws "Unexpected end of JSON input" on an
 *  empty/HTML body — returns a clear error instead so the real cause shows up. */
async function readAuth(res: Response, fallback: string): Promise<{ token: string; user: AuthUser }> {
  const text = await res.text();
  let data: { token?: string; user?: AuthUser; error?: string } = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`${fallback} (server returned a non-JSON response, status ${res.status}). Is the API running?`);
    }
  }
  if (!res.ok) throw new Error(data.error ?? `${fallback} (status ${res.status})`);
  if (!data.token || !data.user) {
    throw new Error(data.error ?? `${fallback} (empty response, status ${res.status}). Restart the API server and try again.`);
  }
  setToken(data.token);
  return { token: data.token, user: data.user };
}

export async function register(email: string, password: string, name?: string): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password, name }),
  });
  return (await readAuth(res, "Registration failed")).user;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password }),
  });
  return (await readAuth(res, "Login failed")).user;
}

export async function loginWithGoogle(credential: string): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/api/auth/google`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ credential }),
  });
  return (await readAuth(res, "Google sign-in failed")).user;
}

export async function fetchMe(): Promise<AuthUser | null> {
  if (!getToken()) return null;
  const res = await fetch(`${API_BASE}/api/auth/me`, { headers: clientHeaders() });
  if (!res.ok) return null;
  return (await res.json()).user;
}

export function logout() {
  setToken(null);
  // Smart money is Pro-only. Without this, a cached response would stay
  // readable for the rest of its TTL after the session that earned it ended.
  clearCache();
}

// --- Billing ---
export interface BillingConfig {
  enabled: boolean; // real crypto checkout is configured
  price: number;
  devStub?: boolean; // local-only "flip the plan" shortcut is available
}

export async function getBillingConfig(): Promise<BillingConfig> {
  const res = await fetch(`${API_BASE}/api/billing/config`);
  if (!res.ok) return { enabled: false, price: 10, devStub: false };
  return res.json();
}

export async function startCheckout(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/billing/checkout`, {
    method: "POST",
    headers: jsonHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not start checkout");
  return data.url;
}

export async function fetchTrader(
  address: string,
  refresh = false
): Promise<TraderResponse> {
  const url = `${API_BASE}/api/trader/${address}${refresh ? "?refresh=1" : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

/**
 * Cached for {@link CACHE_TTL_MS}. Every parameter is in the key, so switching
 * metric or window is still a real request — it is only the *same* view, asked
 * for again after a tab bounce or a reload, that is served locally.
 */
export async function fetchLeaderboard(
  metric: LeaderboardMetric,
  window: LeaderboardWindow,
  limit = 25
): Promise<LeaderboardResponse> {
  return cached(`lb:${metric}:${window}:${limit}`, async () => {
    const url = `${API_BASE}/api/leaderboard?metric=${metric}&window=${window}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Request failed (${res.status})`);
    }
    return res.json() as Promise<LeaderboardResponse>;
  });
}

/**
 * One page of the positions table. Sorting and slicing happen server-side, so
 * page 3 of "by P&L" is the real third page across the whole set, not the third
 * page of whatever happened to be downloaded.
 */
export async function fetchPositions(
  address: string,
  opts: { mode: PositionMode; sort: PositionSortKey; dir: SortDir; page: number },
  signal?: AbortSignal
): Promise<PositionPage> {
  const q = new URLSearchParams({
    mode: opts.mode,
    sort: opts.sort,
    dir: opts.dir,
    page: String(opts.page),
  });
  const res = await fetch(`${API_BASE}/api/trader/${address}/positions?${q}`, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function fetchTraderSummary(address: string): Promise<TraderSummary> {
  const res = await fetch(`${API_BASE}/api/trader/${address}/summary`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()).summary;
}

/** Parse a watchlist response, turning an error body into a thrown error rather
 *  than letting `{ error: … }` land in state where a WatchlistState is expected. */
async function readState(res: Response, fallback: string): Promise<WatchlistState> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `${fallback} (status ${res.status})`);
  return data as WatchlistState;
}

export async function getWatchlist(): Promise<WatchlistState> {
  const res = await fetch(`${API_BASE}/api/watchlist`, { headers: clientHeaders() });
  return readState(res, "Could not load your watchlist");
}

export async function addWatch(address: string, label?: string): Promise<AddWatchResult> {
  const res = await fetch(`${API_BASE}/api/watchlist`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ address, label }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, state: data };
  return {
    ok: false,
    upgradeRequired: data.upgradeRequired,
    authRequired: data.authRequired ?? res.status === 401,
    error: data.error,
    state: data.state,
  };
}

export async function removeWatch(address: string): Promise<WatchlistState> {
  const res = await fetch(`${API_BASE}/api/watchlist/${address}`, {
    method: "DELETE",
    headers: clientHeaders(),
  });
  return readState(res, "Could not stop tracking that wallet");
}

/** Local-dev only: flip the current client's plan. The server refuses this in
 *  production and whenever crypto billing is configured. */
export async function setPlan(plan: Plan): Promise<WatchlistState> {
  const res = await fetch(`${API_BASE}/api/me/plan`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ plan }),
  });
  return readState(res, "Could not change your plan");
}

/** Cached like the leaderboard — this one scans many wallets upstream, so a
 *  repeat view is the most expensive request in the app to serve twice. */
export async function fetchSmartMoney(f: SmartMoneyFilters): Promise<SmartMoneyResult> {
  const key = `sm:${f.window}:${f.count}:${f.metric}:${f.side}:${f.sort}`;
  return cached(key, async () => {
    const q = new URLSearchParams({
      window: f.window,
      count: String(f.count),
      metric: f.metric,
      side: f.side,
      sort: f.sort,
    });
    const res = await fetch(`${API_BASE}/api/smart-money?${q}`, { headers: clientHeaders() });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Request failed (${res.status})`);
    }
    return res.json() as Promise<SmartMoneyResult>;
  });
}

// --- Lightweight trader search (no public username API exists, so we index the
// top leaderboard names: covers the well-known traders people search for) ---

let indexPromise: Promise<LeaderboardRow[]> | null = null;
async function traderIndex(): Promise<LeaderboardRow[]> {
  if (!indexPromise) {
    indexPromise = Promise.all([
      fetchLeaderboard("profit", "all", 50),
      fetchLeaderboard("volume", "all", 50),
    ])
      .then(([p, v]) => {
        const seen = new Map<string, LeaderboardRow>();
        for (const r of [...p.rows, ...v.rows]) if (!seen.has(r.address)) seen.set(r.address, r);
        return [...seen.values()];
      })
      .catch(() => []);
  }
  return indexPromise;
}

export async function searchTraders(query: string): Promise<LeaderboardRow[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const rows = await traderIndex();
  return rows
    .filter((r) => (r.name ?? r.pseudonym ?? "").toLowerCase().includes(q))
    .slice(0, 6);
}

const RECENT_KEY = "pt_recent";
export function getRecent(): { address: string; name: string }[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}
export function pushRecent(address: string, name: string) {
  const list = getRecent().filter((r) => r.address !== address.toLowerCase());
  list.unshift({ address: address.toLowerCase(), name });
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6)));
}
