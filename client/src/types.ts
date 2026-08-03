// Mirrors the server's TraderStats payload.

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
  pnl: number;
  resolved: boolean; // "no longer open" — exitType says how it ended
  /** "closed" = the wallet sold out before the market resolved. Absent on
   *  payloads cached by an older server build. */
  exitType?: "open" | "resolved" | "closed";
  endDate?: string;
  firstTradeAt: string | null;
  lastTradeAt: string | null;
}

export interface TraderStats {
  address: string;
  profile: {
    name: string | null;
    pseudonym: string | null;
    profileImage: string | null;
  };
  portfolioValue: number;
  totalProfit: number;
  profitToday: number;
  totalVolume: number;
  openPositionsValue: number;
  totalTrades: number;
  tradesCapped: boolean;
  firstTradeAt: string | null;
  lastTradeAt: string | null;
  openPositionsCount: number;
  resolvedCount: number; // finished trades: settled + closed
  settledCount?: number;
  closedCount?: number;
  wins: number;
  losses: number;
  winRate: number | null;
  openPositions: PositionView[];
  resolvedPositions: PositionView[];
  details: TraderDetails;
  dailySeries: DailyPoint[];
  lastUpdated: string;
}

export interface DailyPoint {
  date: string;
  trades: number;
  volume: number;
  netCash: number;
}

export interface Snapshot {
  takenAt: string;
  totalProfit: number;
  winRate: number | null;
  portfolioValue: number;
  totalTrades: number;
}

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

export type SmartWindow = "1d" | "7d" | "30d";
export type SmartSide = "buy" | "sell";
export type SmartSort = "traders" | "usd";

export interface SmartMoneyFilters {
  window: SmartWindow;
  count: number;
  metric: LeaderboardMetric;
  side: SmartSide;
  sort: SmartSort;
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

export interface TraderDetails {
  maxWin: number;
  maxLoss: number;
  avgEntryCents: number | null;
  avgBuySize: number | null;
  avgBuyPerDay: number | null;
  marketsPerDay: number | null;
  efficiencyPct: number | null;
  avgPnlPctLast100: number | null;
  activeDays: number;
  marketsTraded: number;
  totalBought: number;
}

export interface TraderResponse {
  cached: boolean;
  indexing?: boolean; // true while the wallet's older history is still backfilling
  stats: TraderStats;
}

export interface LeaderboardRow {
  rank: number;
  address: string;
  name: string | null;
  pseudonym: string | null;
  profileImage: string | null;
  amount: number;
}

export type LeaderboardMetric = "profit" | "volume";
export type LeaderboardWindow = "all" | "1d" | "7d" | "30d";

export interface LeaderboardResponse {
  metric: LeaderboardMetric;
  window: LeaderboardWindow;
  rows: LeaderboardRow[];
}

export interface TraderSummary {
  address: string;
  profile: { name: string | null; pseudonym: string | null; profileImage: string | null };
  totalProfit: number;
  profitToday: number;
  totalVolume: number;
  portfolioValue: number;
}

export type Plan = "free" | "pro";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  plan: Plan;
  proExpiresAt: string | null;
}

export interface WatchEntry {
  address: string;
  label: string | null;
}

export interface WatchlistState {
  plan: Plan;
  limit: number;
  count: number;
  entries: WatchEntry[];
  proPrice?: number;
  proExpiresAt?: string | null;
}

export interface AddWatchResult {
  ok: boolean;
  upgradeRequired?: boolean;
  authRequired?: boolean; // not signed in — tracking needs an account
  error?: string;
  state?: WatchlistState;
}
