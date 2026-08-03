import {
  getLeaderboardStats,
  getPositions,
  getValue,
  type ActivityStats,
  type DailyPoint,
  type MarketAgg,
  type PmPosition,
} from "./polymarket.js";

export interface PositionView {
  conditionId: string;
  title: string;
  slug: string;
  icon: string;
  outcome: string;
  size: number;
  avgPrice: number;
  curPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  realizedPnl: number;
  pnl: number; // total P&L for the position: unrealized (cashPnl) + realized
  resolved: boolean; // "no longer an open position" — see exitType for how it ended
  /**
   * How the position ended:
   *  - "open"     still held, market still trading
   *  - "resolved" market settled on-chain (redeemable, priced at 0/1, or redeemed)
   *  - "closed"   wallet sold out of its own accord; the market may still be open
   * Win rate counts "resolved" and "closed" alike — both are finished trades with
   * a realised P&L — but only "resolved" means the market itself is over.
   */
  exitType: "open" | "resolved" | "closed";
  endDate?: string;
  firstTradeAt: string | null; // ISO date the wallet first entered this market
  lastTradeAt: string | null; // ISO date of the wallet's most recent trade here
}

export interface TraderStats {
  address: string;
  profile: {
    name: string | null;
    pseudonym: string | null;
    profileImage: string | null;
  };
  portfolioValue: number;
  totalProfit: number; // canonical all-time profit (leaderboard API)
  profitToday: number; // last-24h profit
  totalVolume: number; // all-time traded volume
  openPositionsValue: number;
  totalTrades: number;
  tradesCapped: boolean;
  firstTradeAt: string | null; // ISO date of oldest trade we reached
  lastTradeAt: string | null; // ISO date of newest trade
  openPositionsCount: number;
  resolvedCount: number; // finished trades — settledCount + closedCount; drives win rate
  settledCount: number; // of those, markets that actually resolved on-chain
  closedCount: number; // of those, markets the wallet sold out of before resolution
  wins: number;
  losses: number;
  winRate: number | null; // 0..1, null if no resolved positions
  openPositions: PositionView[];
  resolvedPositions: PositionView[];
  details: TraderDetails;
  dailySeries: DailyPoint[]; // per-day activity for charts (oldest→newest)
  lastUpdated: string;
}

/** Secondary metrics derived from trade history (the "Details" panel). */
export interface TraderDetails {
  maxWin: number; // largest single-market profit
  maxLoss: number; // largest single-market loss (negative)
  avgEntryCents: number | null; // volume-weighted average buy price, in cents
  avgBuySize: number | null; // average $ size of recent buys (last 50)
  avgBuyPerDay: number | null; // average $ bought per active trading day
  marketsPerDay: number | null; // distinct markets per active trading day
  efficiencyPct: number | null; // all-time profit ÷ volume
  avgPnlPctLast100: number | null; // average % P&L of last 100 resolved markets
  activeDays: number; // distinct days with at least one trade
  marketsTraded: number; // distinct markets ever traded
  totalBought: number; // total $ spent buying
}

/** A market is considered resolved when it's redeemable or its price has gone to 0/1. */
function isResolved(p: PmPosition): boolean {
  return p.redeemable === true || p.curPrice <= 0.0001 || p.curPrice >= 0.9999;
}

function toView(p: PmPosition): PositionView {
  return {
    conditionId: p.conditionId,
    title: p.title,
    slug: p.slug,
    icon: p.icon,
    outcome: p.outcome,
    size: p.size,
    avgPrice: p.avgPrice,
    curPrice: p.curPrice,
    initialValue: p.initialValue,
    currentValue: p.currentValue,
    cashPnl: p.cashPnl,
    percentPnl: p.percentPnl,
    realizedPnl: p.realizedPnl,
    pnl: p.cashPnl + p.realizedPnl,
    resolved: isResolved(p),
    exitType: isResolved(p) ? "resolved" : "open",
    endDate: p.endDate,
    firstTradeAt: null, // filled in from activity history
    lastTradeAt: null,
  };
}

export interface TraderSummary {
  address: string;
  profile: { name: string | null; pseudonym: string | null; profileImage: string | null };
  totalProfit: number;
  profitToday: number;
  totalVolume: number;
  portfolioValue: number;
}

/**
 * Lightweight stats for a wallet — just the cheap single-call leaderboard +
 * value data, no trade-history paging. Used to render many watchlist cards fast.
 */
export async function computeTraderSummary(address: string): Promise<TraderSummary> {
  const user = address.toLowerCase();
  const [lb, portfolioValue] = await Promise.all([getLeaderboardStats(user), getValue(user)]);
  return {
    address: user,
    profile: { name: lb.name, pseudonym: lb.pseudonym, profileImage: lb.profileImage },
    totalProfit: lb.profit,
    profitToday: lb.profitToday,
    totalVolume: lb.volume,
    portfolioValue,
  };
}

/** Build a resolved-position view from an activity cash-flow roll-up (a market
 *  the wallet has fully exited/redeemed, so it's gone from /positions). */
const isoOrNull = (ts?: number): string | null =>
  ts ? new Date(ts * 1000).toISOString() : null;

function marketToView(m: MarketAgg): PositionView {
  return {
    conditionId: m.conditionId,
    title: m.title,
    slug: m.slug,
    icon: m.icon,
    outcome: "",
    size: 0,
    avgPrice: 0,
    curPrice: 0,
    initialValue: m.bought,
    currentValue: 0,
    cashPnl: m.net,
    percentPnl: m.bought > 0 ? (m.net / m.bought) * 100 : 0,
    realizedPnl: m.net,
    pnl: m.net,
    resolved: true,
    // A redeem proves the market settled; otherwise the wallet just sold out and
    // the market may well still be trading.
    exitType: m.redeemed ? "resolved" : "closed",
    endDate: undefined,
    firstTradeAt: isoOrNull(m.firstTradeTs),
    lastTradeAt: isoOrNull(m.lastTradeTs),
  };
}

/** Most recent first; positions with no known entry date sort last. */
function byRecency(a: PositionView, b: PositionView): number {
  const ta = a.firstTradeAt ? Date.parse(a.firstTradeAt) : -Infinity;
  const tb = b.firstTradeAt ? Date.parse(b.firstTradeAt) : -Infinity;
  return tb - ta;
}

/**
 * Compute the headline stats. Current-state data (canonical P&L, portfolio
 * value, open positions) is always fetched live; the trade-history aggregation
 * (`activity`) is supplied by the caller — from the indexer's DB when available,
 * otherwise from a bounded live fetch.
 */
export async function computeTraderStats(
  address: string,
  activity: ActivityStats
): Promise<TraderStats> {
  const user = address.toLowerCase();

  const [lb, portfolioValue, positions] = await Promise.all([
    getLeaderboardStats(user),
    getValue(user),
    getPositions(user),
  ]);

  const views = positions.map(toView);

  // Attach each held position's entry/last-trade dates from activity history
  // (the /positions endpoint doesn't include them).
  for (const v of views) {
    const m = activity.markets.get(v.conditionId);
    if (m) {
      v.firstTradeAt = isoOrNull(m.firstTradeTs);
      v.lastTradeAt = isoOrNull(m.lastTradeTs);
    }
  }

  const open = views.filter((p) => !p.resolved);

  // Resolved markets come from two sources:
  //  1. Positions still held (redeemable / settled to 0 or 1) — rich data.
  //  2. Markets fully exited or redeemed, which DROP OFF /positions — we
  //     reconstruct these from the activity cash-flow roll-up. This is what lets
  //     us show a win rate for wallets that redeem everything (otherwise 0).
  const heldCids = new Set(positions.map((p) => p.conditionId));
  const resolvedHeld = views.filter((p) => p.resolved);
  const exited: PositionView[] = [];
  for (const m of activity.markets.values()) {
    if (heldCids.has(m.conditionId)) continue; // still held → counted via positions
    if (m.bought <= 0) continue; // never actually bought into this market
    exited.push(marketToView(m));
  }
  const resolved = [...resolvedHeld, ...exited];

  // Win = a finished trade that ended in net profit.
  const settledCount = resolved.filter((p) => p.exitType === "resolved").length;
  const closedCount = resolved.length - settledCount;
  const wins = resolved.filter((p) => p.pnl > 0).length;
  const losses = resolved.length - wins;
  const winRate = resolved.length > 0 ? wins / resolved.length : null;

  const openPositionsValue = open.reduce((sum, p) => sum + p.currentValue, 0);

  // Sort by entry date, newest first (matches how trackers like polywallet list
  // positions) so recent activity is visible at the top regardless of size.
  open.sort(byRecency);
  resolved.sort(byRecency);

  const mean = (xs: number[]): number | null =>
    xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;

  const last100Pct = resolved.slice(0, 100).map((p) => p.percentPnl);
  const details: TraderDetails = {
    maxWin: resolved.reduce((mx, p) => Math.max(mx, p.pnl), 0),
    maxLoss: resolved.reduce((mn, p) => Math.min(mn, p.pnl), 0),
    avgEntryCents:
      activity.totalBought > 0
        ? (activity.entryWeightSum / activity.totalBought) * 100
        : null,
    avgBuySize: mean(activity.recentBuySizes),
    avgBuyPerDay: activity.activeDays > 0 ? activity.totalBought / activity.activeDays : null,
    marketsPerDay:
      activity.activeDays > 0 ? activity.markets.size / activity.activeDays : null,
    efficiencyPct: lb.volume > 0 ? (lb.profit / lb.volume) * 100 : null,
    avgPnlPctLast100: mean(last100Pct),
    activeDays: activity.activeDays,
    marketsTraded: activity.markets.size,
    totalBought: activity.totalBought,
  };

  return {
    address: user,
    profile: {
      name: lb.name,
      pseudonym: lb.pseudonym,
      profileImage: lb.profileImage,
    },
    portfolioValue,
    totalProfit: lb.profit,
    profitToday: lb.profitToday,
    totalVolume: lb.volume,
    openPositionsValue,
    totalTrades: activity.tradeCount,
    tradesCapped: activity.capped,
    firstTradeAt: activity.oldest
      ? new Date(activity.oldest * 1000).toISOString()
      : null,
    lastTradeAt: activity.newest
      ? new Date(activity.newest * 1000).toISOString()
      : null,
    openPositionsCount: open.length,
    resolvedCount: resolved.length,
    settledCount,
    closedCount,
    wins,
    losses,
    winRate,
    openPositions: open,
    resolvedPositions: resolved,
    details,
    dailySeries: activity.daily,
    lastUpdated: new Date().toISOString(),
  };
}
