import type { PositionView } from "./stats.js";

/**
 * Sorting and paging for the positions table.
 *
 * This used to live in the browser: the API shipped every position — 7,087 of
 * them on an active wallet, 4 MB of JSON — so the table could sort and slice
 * twenty rows out of it. The ordering rules moved here unchanged so the table
 * looks identical; only the volume of data crossing the network changed.
 */

export type PositionMode = "all" | "open" | "resolved";
export type SortKey = "firstTradeAt" | "lastTradeAt" | "title" | "value" | "pnl";
export type SortDir = "asc" | "desc";

export const PAGE_SIZE = 20;

const SORT_KEYS: readonly SortKey[] = [
  "firstTradeAt",
  "lastTradeAt",
  "title",
  "value",
  "pnl",
];

export const isSortKey = (v: unknown): v is SortKey =>
  typeof v === "string" && (SORT_KEYS as readonly string[]).includes(v);

export const isMode = (v: unknown): v is PositionMode =>
  v === "all" || v === "open" || v === "resolved";

/**
 * Defaults follow Polymarket: their Positions tab sorts by current value,
 * biggest first. Finished trades have no live value to rank by, so those fall
 * back to most-recently-traded — the ordering their Activity feed uses.
 */
export const DEFAULT_SORT: Record<PositionMode, { key: SortKey; dir: SortDir }> = {
  open: { key: "value", dir: "desc" },
  resolved: { key: "lastTradeAt", dir: "desc" },
  all: { key: "lastTradeAt", dir: "desc" },
};

/** The figure shown in the Value column — sorting has to match what's displayed. */
const valueOf = (p: PositionView) => (p.resolved ? p.initialValue : p.currentValue);

const isDateKey = (k: SortKey): k is "firstTradeAt" | "lastTradeAt" =>
  k === "firstTradeAt" || k === "lastTradeAt";

function compare(a: PositionView, b: PositionView, key: SortKey): number {
  switch (key) {
    case "title":
      return (a.title || "").localeCompare(b.title || "");
    case "value":
      return valueOf(a) - valueOf(b);
    case "pnl":
      return a.pnl - b.pnl;
    default:
      return Date.parse(a[key] as string) - Date.parse(b[key] as string);
  }
}

export function sortPositions(
  rows: PositionView[],
  key: SortKey,
  dir: SortDir
): PositionView[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    // Rows with no known date sort last in both directions — an unknown isn't
    // "oldest", and burying them keeps the top of the table meaningful.
    if (isDateKey(key)) {
      const na = !a[key];
      const nb = !b[key];
      if (na && nb) return 0;
      if (na) return 1;
      if (nb) return -1;
    }
    return compare(a, b, key) * factor;
  });
}

/** Falls back for anything that isn't a real number — NaN and Infinity included. */
const num = (v: number | undefined, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

export interface PositionPage {
  positions: PositionView[];
  total: number;
  page: number;
  pageSize: number;
  mode: PositionMode;
  sort: SortKey;
  dir: SortDir;
}

export function selectPositions(
  open: PositionView[],
  resolved: PositionView[],
  opts: {
    mode: PositionMode;
    sort?: SortKey;
    dir?: SortDir;
    page?: number;
    pageSize?: number;
  }
): PositionPage {
  const mode = opts.mode;
  const rows = mode === "open" ? open : mode === "resolved" ? resolved : [...open, ...resolved];

  const sort = opts.sort ?? DEFAULT_SORT[mode].key;
  const dir = opts.dir ?? DEFAULT_SORT[mode].dir;
  // A caller asking for page 900 of a 3-page list gets an empty page rather than
  // an error — the table clamps, and an out-of-range request is not a failure.
  //
  // `??` is not enough here: callers reach this via Number(req.query.page), and
  // a missing query param becomes NaN, which is neither null nor undefined. NaN
  // survived every clamp below and slice(NaN, NaN) returned nothing, so a plain
  // ?mode=all with no paging params came back empty.
  const page = Math.max(0, Math.floor(num(opts.page, 0)));
  const pageSize = Math.min(100, Math.max(1, Math.floor(num(opts.pageSize, PAGE_SIZE))));

  const sorted = sortPositions(rows, sort, dir);
  return {
    positions: sorted.slice(page * pageSize, page * pageSize + pageSize),
    total: rows.length,
    page,
    pageSize,
    mode,
    sort,
    dir,
  };
}
