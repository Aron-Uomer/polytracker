import {
  fetchActivityPage,
  getLeaderboard,
  type LeaderboardMetric,
  type PmActivity,
} from "./polymarket.js";

// "Smart money" = what the top traders have been trading recently. Filterable
// by time window, how many top traders to scan, the ranking metric, side, and sort.

export type SmartWindow = "1d" | "7d" | "30d";
export type SmartSide = "buy" | "sell";
export type SmartSort = "traders" | "usd";

export interface SmartMoneyMarket {
  conditionId: string;
  title: string;
  slug: string;
  icon: string;
  outcome: string;
  traders: number;
  usdc: number;
  names: string[];
}

export interface SmartMoneyResult {
  markets: SmartMoneyMarket[];
  tradersScanned: number;
  window: SmartWindow;
  windowDays: number;
  metric: LeaderboardMetric;
  side: SmartSide;
  sort: SmartSort;
  generatedAt: string;
}

export interface SmartMoneyOpts {
  window: SmartWindow;
  count: number; // how many top traders to scan
  metric: LeaderboardMetric;
  side: SmartSide;
  sort: SmartSort;
}

const WINDOW_DAYS: Record<SmartWindow, number> = { "1d": 1, "7d": 7, "30d": 30 };
const WINDOW_PAGES: Record<SmartWindow, number> = { "1d": 1, "7d": 2, "30d": 4 };
const TTL_MS = Number(process.env.SMART_MONEY_TTL_MS ?? 5 * 60 * 1000);

const cache = new Map<string, { at: number; data: SmartMoneyResult }>();

/** Run async fn over items with bounded concurrency. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** A trader's trade events within the window (paged back until we pass `since`). */
async function traderTrades(address: string, since: number, maxPages: number): Promise<PmActivity[]> {
  const out: PmActivity[] = [];
  let end: number | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await fetchActivityPage(address, end, 500).catch(() => [] as PmActivity[]);
    if (page.length === 0) break;
    out.push(...page);
    const minTs = Math.min(...page.map((a) => a.timestamp));
    if (minTs < since || page.length < 500) break;
    end = minTs;
  }
  return out.filter((a) => a.timestamp >= since);
}

export async function getSmartMoney(opts: SmartMoneyOpts): Promise<SmartMoneyResult> {
  const key = `${opts.metric}:${opts.window}:${opts.count}:${opts.side}:${opts.sort}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const top = await getLeaderboard(opts.metric, "all", opts.count);
  const since = Math.floor(Date.now() / 1000) - WINDOW_DAYS[opts.window] * 86400;
  const wantSide = opts.side === "buy" ? "BUY" : "SELL";

  const pages = await mapLimit(top, 10, (t) =>
    traderTrades(t.address, since, WINDOW_PAGES[opts.window])
  );

  interface Agg {
    conditionId: string;
    title: string;
    slug: string;
    icon: string;
    outcome: string;
    usdc: number;
    traders: Set<string>;
    names: Set<string>;
  }
  const byMarket = new Map<string, Agg>();

  top.forEach((trader, i) => {
    for (const a of pages[i]) {
      if (a.type !== "TRADE" || a.side !== wantSide) continue;
      const mkey = `${a.conditionId}:${a.outcomeIndex}`;
      let m = byMarket.get(mkey);
      if (!m) {
        m = {
          conditionId: a.conditionId,
          title: a.title ?? "",
          slug: a.slug ?? "",
          icon: a.icon ?? "",
          outcome: a.outcome ?? "",
          usdc: 0,
          traders: new Set(),
          names: new Set(),
        };
        byMarket.set(mkey, m);
      }
      m.usdc += a.usdcSize ?? 0;
      m.traders.add(trader.address);
      if (trader.name) m.names.add(trader.name);
    }
  });

  const markets = [...byMarket.values()]
    .map((m) => ({
      conditionId: m.conditionId,
      title: m.title,
      slug: m.slug,
      icon: m.icon,
      outcome: m.outcome,
      traders: m.traders.size,
      usdc: m.usdc,
      names: [...m.names].slice(0, 4),
    }))
    .sort((a, b) =>
      opts.sort === "usd"
        ? b.usdc - a.usdc || b.traders - a.traders
        : b.traders - a.traders || b.usdc - a.usdc
    )
    .slice(0, 30);

  const data: SmartMoneyResult = {
    markets,
    tradersScanned: top.length,
    window: opts.window,
    windowDays: WINDOW_DAYS[opts.window],
    metric: opts.metric,
    side: opts.side,
    sort: opts.sort,
    generatedAt: new Date().toISOString(),
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}
