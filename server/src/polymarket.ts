// Thin client over the public Polymarket Data API (https://data-api.polymarket.com).
// No auth required. The `user` param accepts either the proxy wallet or the
// controlling EOA; responses always use the proxy wallet.

const BASE = "https://data-api.polymarket.com";
// Leaderboard API: canonical profit/volume figures (matches what polymarket.com shows).
const LB_BASE = "https://lb-api.polymarket.com";

export interface PmPosition {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  totalBought: number;
  realizedPnl: number;
  curPrice: number;
  redeemable: boolean;
  title: string;
  slug: string;
  icon: string;
  outcome: string;
  outcomeIndex: number;
  endDate?: string;
}

export interface PmValue {
  user: string;
  value: number;
}

// Never let a hung upstream connection pin a request forever — without this a
// stalled Polymarket socket holds an Express handler (and a Render worker) open
// indefinitely.
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS ?? 15000);

async function getJson<T>(path: string, base = BASE): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new Error(`Polymarket API ${path} timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw err;
  }
  if (!res.ok) {
    throw new Error(`Polymarket API ${path} -> ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export interface PmLeaderboardEntry {
  proxyWallet: string;
  name?: string;
  pseudonym?: string;
  profileImage?: string;
  amount: number;
}

export interface ProfileAndProfit {
  profit: number; // all-time profit in USD (canonical)
  profitToday: number; // last-24h profit in USD
  volume: number; // all-time traded volume in USD
  name: string | null;
  pseudonym: string | null;
  profileImage: string | null;
}

/** Canonical profit, today's profit, total volume and profile from the leaderboard API. */
export async function getLeaderboardStats(user: string): Promise<ProfileAndProfit> {
  const [allTime, today, volume] = await Promise.all([
    getJson<PmLeaderboardEntry[]>(`/profit?window=all&address=${user}`, LB_BASE),
    getJson<PmLeaderboardEntry[]>(`/profit?window=1d&address=${user}`, LB_BASE),
    getJson<PmLeaderboardEntry[]>(`/volume?window=all&address=${user}`, LB_BASE),
  ]);
  const entry = allTime[0] ?? today[0] ?? volume[0];
  return {
    profit: allTime[0]?.amount ?? 0,
    profitToday: today[0]?.amount ?? 0,
    volume: volume[0]?.amount ?? 0,
    name: entry?.name ?? null,
    pseudonym: entry?.pseudonym ?? null,
    profileImage: entry?.profileImage ?? null,
  };
}

export type LeaderboardMetric = "profit" | "volume";
export type LeaderboardWindow = "all" | "1d" | "7d" | "30d";

export interface LeaderboardRow {
  rank: number;
  address: string;
  name: string | null;
  pseudonym: string | null;
  profileImage: string | null;
  amount: number;
}

/** Top traders on Polymarket by profit or volume (all-time or last 24h). */
export async function getLeaderboard(
  metric: LeaderboardMetric,
  window: LeaderboardWindow,
  limit: number
): Promise<LeaderboardRow[]> {
  const data = await getJson<PmLeaderboardEntry[]>(
    `/${metric}?window=${window}&limit=${limit}`,
    LB_BASE
  );
  return data.map((e, i) => ({
    rank: i + 1,
    address: e.proxyWallet,
    name: e.name || null,
    pseudonym: e.pseudonym || null,
    profileImage: e.profileImage || null,
    amount: e.amount ?? 0,
  }));
}

export async function getValue(user: string): Promise<number> {
  const data = await getJson<PmValue[]>(`/value?user=${user}`);
  return data[0]?.value ?? 0;
}

/** Fetch all positions (resolved + open), paging through results. */
export async function getPositions(user: string): Promise<PmPosition[]> {
  const all: PmPosition[] = [];
  const limit = 500;
  for (let offset = 0; offset < 5000; offset += limit) {
    // sizeThreshold=1 (the API default) excludes sub-1-share dust positions,
    // which otherwise flood the win-rate calc with thousands of tiny losses.
    const page = await getJson<PmPosition[]>(
      `/positions?user=${user}&limit=${limit}&offset=${offset}&sizeThreshold=1`
    );
    all.push(...page);
    if (page.length < limit) break;
  }
  return all;
}

export interface PmActivity {
  proxyWallet: string;
  timestamp: number;
  conditionId: string;
  type: string; // TRADE | REDEEM | SPLIT | MERGE | REWARD | CONVERSION | ...
  size: number;
  usdcSize: number;
  transactionHash: string;
  price: number;
  asset: string;
  side?: "BUY" | "SELL";
  outcome: string;
  outcomeIndex: number;
  title: string;
  slug?: string;
  icon?: string;
}

/** Per-market roll-up of a wallet's cash flow, used to reconstruct resolved P&L. */
export interface MarketAgg {
  conditionId: string;
  title: string;
  slug: string;
  icon: string;
  bought: number; // total USDC spent buying
  net: number; // sells + redeems - buys (realized cash flow for the market)
  firstTradeTs?: number; // unix seconds of first trade in this market ("first buy")
  lastTradeTs?: number; // unix seconds of most recent trade in this market
  /** True once we see a REDEEM — proof the market actually resolved on-chain.
   *  A market exited purely by selling may still be open. */
  redeemed: boolean;
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD (UTC)
  trades: number;
  volume: number; // USDC traded that day
  netCash: number; // sells + redeems - buys that day (realized cash flow)
}

export interface ActivityStats {
  tradeCount: number;
  capped: boolean;
  newest?: number; // unix seconds of most recent activity
  oldest?: number; // unix seconds of oldest activity we reached
  markets: Map<string, MarketAgg>;
  totalBought: number; // total USDC spent across all buys
  buyCount: number;
  entryWeightSum: number; // Σ(price · usdcSize) over buys → avg entry = /totalBought
  recentBuySizes: number[]; // usdc size of the most recent buys (up to 50)
  activeDays: number; // distinct calendar days with at least one trade
  daily: DailyPoint[]; // per-day activity, oldest→newest (for charts)
}

const TRADES_MAX_PAGES = Number(process.env.TRADES_MAX_PAGES ?? 40);
const TRADES_TIME_BUDGET_MS = Number(process.env.TRADES_TIME_BUDGET_MS ?? 25000);

/**
 * Walk a wallet's full /activity feed BACKWARD THROUGH TIME via the `end`
 * cursor. Unlike offset paging (capped at ~3,500 rows by the API), this has no
 * depth limit, so it reaches the wallet's first trade.
 *
 * Returns the trade count plus a per-market cash-flow roll-up, which lets us
 * reconstruct win/loss for markets that have been redeemed and therefore no
 * longer appear in /positions.
 *
 * Bounded by a page count and a wall-clock budget so a single lookup stays
 * responsive; `capped` signals we stopped before the wallet's first trade
 * (only extremely active wallets hit this — they need the background indexer
 * for exact figures).
 */
/** One page of the activity feed, oldest-bound by `end` (unix seconds). */
export async function fetchActivityPage(
  user: string,
  end?: number,
  limit = 500
): Promise<PmActivity[]> {
  const endParam = end !== undefined ? `&end=${end}` : "";
  return getJson<PmActivity[]>(
    `/activity?user=${user}&limit=${limit}&offset=0&sortBy=TIMESTAMP&sortDirection=DESC${endParam}`
  );
}

export interface ActivityAggregator {
  /** Fold a chunk of events in. Safe to call repeatedly. */
  push(events: Iterable<PmActivity>): void;
  finish(opts: { capped: boolean }): ActivityStats;
}

/**
 * Streaming aggregator over activity events. Source-agnostic: feed it events
 * fetched live OR rows read from the indexer's Trade table, in chunks, so a
 * whale's whole history never has to sit in memory at once. Only the roll-ups
 * (bounded by markets and calendar days) are retained.
 *
 * For the "recent buys" metric to be meaningful, push events newest-first.
 *
 * `dedupe` guards against the live feed returning an event twice across pages.
 * Rows from the Trade table are already unique by primary key, so that path
 * turns it off and avoids holding a key per event.
 */
export function createActivityAggregator(
  opts: { dedupe?: boolean } = {}
): ActivityAggregator {
  const seen = opts.dedupe === false ? null : new Set<string>();
  const markets = new Map<string, MarketAgg>();
  let tradeCount = 0;
  let newest: number | undefined;
  let oldest: number | undefined;
  let totalBought = 0;
  let buyCount = 0;
  let entryWeightSum = 0;
  const recentBuySizes: number[] = [];
  const dayMap = new Map<string, DailyPoint>();
  const dayFor = (ts: number): DailyPoint => {
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    let d = dayMap.get(date);
    if (!d) {
      d = { date, trades: 0, volume: 0, netCash: 0 };
      dayMap.set(date, d);
    }
    return d;
  };

  function push(events: Iterable<PmActivity>) {
    for (const a of events) {
      if (seen) {
        const key = `${a.transactionHash}:${a.asset}:${a.type}:${a.side}:${a.size}:${a.timestamp}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }

      const m =
        markets.get(a.conditionId) ??
        ({
          conditionId: a.conditionId,
          title: a.title ?? "",
          slug: a.slug ?? "",
          icon: a.icon ?? "",
          bought: 0,
          net: 0,
          redeemed: false,
        } satisfies MarketAgg);
      const usdc = a.usdcSize ?? 0;
      if (a.type === "TRADE") {
        tradeCount++;
        const day = dayFor(a.timestamp);
        day.trades++;
        day.volume += usdc;
        if (a.side === "BUY") {
          m.net -= usdc;
          m.bought += usdc;
          totalBought += usdc;
          buyCount++;
          entryWeightSum += (a.price ?? 0) * usdc;
          if (recentBuySizes.length < 50) recentBuySizes.push(usdc);
          day.netCash -= usdc;
        } else {
          m.net += usdc;
          day.netCash += usdc;
        }
        if (m.firstTradeTs === undefined || a.timestamp < m.firstTradeTs) {
          m.firstTradeTs = a.timestamp;
        }
        if (m.lastTradeTs === undefined || a.timestamp > m.lastTradeTs) {
          m.lastTradeTs = a.timestamp;
        }
      } else if (a.type === "REDEEM" || a.type === "REWARD") {
        m.net += usdc;
        if (a.type === "REDEEM") m.redeemed = true; // the market settled on-chain
        dayFor(a.timestamp).netCash += usdc;
      }
      if (!m.title && a.title) m.title = a.title;
      markets.set(a.conditionId, m);

      if (newest === undefined || a.timestamp > newest) newest = a.timestamp;
      if (oldest === undefined || a.timestamp < oldest) oldest = a.timestamp;
    }
  }

  return {
    push,
    finish: ({ capped }) => ({
      tradeCount,
      capped,
      newest,
      oldest,
      markets,
      totalBought,
      buyCount,
      entryWeightSum,
      recentBuySizes,
      activeDays: dayMap.size,
      daily: [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    }),
  };
}

/** One-shot convenience wrapper around {@link createActivityAggregator}. */
export function buildActivityStats(
  events: PmActivity[],
  opts: { capped: boolean }
): ActivityStats {
  const agg = createActivityAggregator();
  agg.push(events);
  return agg.finish(opts);
}

/**
 * Live path: page a wallet's full /activity feed backward through time and
 * aggregate it. Bounded by a page count and a wall-clock budget; `capped`
 * signals we stopped before the wallet's first trade.
 */
export async function getActivityStats(user: string): Promise<ActivityStats> {
  const agg = createActivityAggregator();
  let end: number | undefined;
  let capped = false;
  const startedAt = Date.now();

  for (let i = 0; i < TRADES_MAX_PAGES; i++) {
    const page = await fetchActivityPage(user, end);
    if (page.length === 0) break;
    agg.push(page); // folded in immediately — pages aren't retained

    const minTs = Math.min(...page.map((a) => a.timestamp));
    if (page.length < 500) break; // reached the wallet's first activity
    if (minTs === end) break; // can't advance (whole page shares one timestamp)
    end = minTs;

    if (i === TRADES_MAX_PAGES - 1 || Date.now() - startedAt > TRADES_TIME_BUDGET_MS) {
      capped = true;
      break;
    }
  }

  return agg.finish({ capped });
}
