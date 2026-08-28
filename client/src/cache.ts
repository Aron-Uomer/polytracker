/**
 * A localStorage cache with an expiry stamp on every entry.
 *
 * Leaving the leaderboard for another tab unmounts it, and coming back
 * remounts it and refetches from scratch — so bouncing between two tabs five
 * times cost five identical round trips for rankings that change slowly. The
 * leaderboard route has no server-side cache either, so each of those also
 * became a fresh call to Polymarket.
 *
 * An entry records when it goes stale rather than when it was written: reading
 * is then a single comparison against the clock, and it survives a reload,
 * which an in-memory cache does not.
 */

/** Bump when a cached payload's shape changes — old entries then miss rather
 *  than deserialize into something the UI no longer understands. */
const PREFIX = "wr:cache:v1:";

/** Twenty minutes. Rankings and flow data move slowly enough that this is
 *  invisible to a visitor, and it collapses a session's worth of tab-switching
 *  into one request per view. */
export const CACHE_TTL_MS = 20 * 60 * 1000;

interface Entry<T> {
  expiresAt: number;
  data: T;
}

// Safari's private mode and some hardened browser configurations make
// localStorage *throw* on access rather than return null, so this is probed
// once and every use below tolerates its absence. A browser without usable
// storage still works — it just refetches like before.
let store: Storage | null | undefined;
function storage(): Storage | null {
  if (store !== undefined) return store;
  try {
    const s = window.localStorage;
    const probe = `${PREFIX}probe`;
    s.setItem(probe, "1");
    s.removeItem(probe);
    store = s;
  } catch {
    store = null;
  }
  return store;
}

/** Every key this module owns. Collected before mutating, since removing while
 *  iterating localStorage shifts the indices underneath you. */
function ownKeys(s: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k?.startsWith(PREFIX)) keys.push(k);
  }
  return keys;
}

function evictExpired(s: Storage) {
  const now = Date.now();
  for (const k of ownKeys(s)) {
    try {
      const entry = JSON.parse(s.getItem(k) ?? "") as Entry<unknown>;
      if (typeof entry?.expiresAt !== "number" || now >= entry.expiresAt) s.removeItem(k);
    } catch {
      s.removeItem(k); // unreadable: no reason to keep it
    }
  }
}

export function readCache<T>(key: string): T | null {
  const s = storage();
  if (!s) return null;
  const full = PREFIX + key;
  const raw = s.getItem(full);
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as Entry<T>;
    if (typeof entry?.expiresAt !== "number") throw new Error("unrecognised entry");
    if (Date.now() >= entry.expiresAt) {
      s.removeItem(full);
      return null;
    }
    return entry.data;
  } catch {
    s.removeItem(full);
    return null;
  }
}

export function writeCache<T>(key: string, data: T, ttlMs = CACHE_TTL_MS): void {
  const s = storage();
  if (!s) return;
  const entry: Entry<T> = { expiresAt: Date.now() + ttlMs, data };
  try {
    s.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // Quota is shared with everything else the app stores, and a failed write
    // must never break a page that had already loaded its data.
    evictExpired(s);
    try {
      s.setItem(PREFIX + key, JSON.stringify(entry));
    } catch {
      /* still no room — serve without caching */
    }
  }
}

/** Drop everything. Used on sign-out so a cached Pro-only response can't
 *  outlive the session that was entitled to it. */
export function clearCache(): void {
  const s = storage();
  if (!s) return;
  for (const k of ownKeys(s)) s.removeItem(k);
}

/**
 * Serve `key` from the cache when it is still fresh, otherwise run `load` and
 * cache what it returns.
 *
 * `load` rejecting means nothing is written, so a failed request never poisons
 * the cache with an error or an empty list.
 */
export async function cached<T>(
  key: string,
  load: () => Promise<T>,
  ttlMs = CACHE_TTL_MS
): Promise<T> {
  const hit = readCache<T>(key);
  if (hit !== null) return hit;
  const data = await load();
  writeCache(key, data, ttlMs);
  return data;
}
