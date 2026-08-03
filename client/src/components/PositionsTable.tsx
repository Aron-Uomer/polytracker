import { useEffect, useMemo, useState } from "react";
import type { PositionView } from "../types";
import { usdFull, pnlColor } from "../format";
import { Pager } from "./Pager";

const PAGE_SIZE = 20;

function shortDay(iso: string | null): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

function OutcomePill({ outcome }: { outcome: string }) {
  const o = outcome.toLowerCase();
  const cls =
    o === "yes"
      ? "border-success/30 bg-success/10 text-success"
      : o === "no"
      ? "border-danger/30 bg-danger/10 text-danger"
      : "border-white/10 bg-white/5 text-slate-300";
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {outcome || "–"}
    </span>
  );
}

type Mode = "all" | "open" | "resolved";
type SortKey = "firstTradeAt" | "lastTradeAt" | "title" | "value" | "pnl";
type SortDir = "asc" | "desc";

/** The figure shown in the Value column — sorting has to match what's displayed. */
const valueOf = (p: PositionView) => (p.resolved ? p.initialValue : p.currentValue);

/**
 * Defaults follow Polymarket: their Positions tab sorts by current value,
 * biggest first. Finished trades have no live value to rank by, so those fall
 * back to most-recently-traded — the ordering their Activity feed uses.
 */
const DEFAULT_SORT: Record<Mode, { key: SortKey; dir: SortDir }> = {
  open: { key: "value", dir: "desc" },
  resolved: { key: "lastTradeAt", dir: "desc" },
  all: { key: "lastTradeAt", dir: "desc" },
};

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

interface Props {
  positions: PositionView[];
  mode: Mode;
}

export function PositionsTable({ positions, mode }: Props) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState(DEFAULT_SORT[mode]);

  // Each tab carries its own sensible default.
  useEffect(() => setSort(DEFAULT_SORT[mode]), [mode]);
  useEffect(() => setPage(0), [mode, positions.length, sort]);

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...positions].sort((a, b) => {
      // Rows with no known date sort last in both directions — an unknown isn't
      // "oldest", and burying them keeps the top of the table meaningful on
      // wallets whose history is still backfilling.
      if (isDateKey(sort.key)) {
        const na = !a[sort.key];
        const nb = !b[sort.key];
        if (na && nb) return 0;
        if (na) return 1;
        if (nb) return -1;
      }
      return compare(a, b, sort.key) * dir;
    });
  }, [positions, sort]);

  if (positions.length === 0) {
    const label = mode === "all" ? "" : mode === "resolved" ? "closed " : `${mode} `;
    return (
      <p className="py-10 text-center text-sm text-slate-500">No {label}positions found.</p>
    );
  }

  const paged = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const onSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "desc" ? "asc" : "desc" }
        : // First click on a new column: dates and money read newest/biggest
          // first, names read A–Z.
          { key, dir: key === "title" ? "asc" : "desc" }
    );

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
              <SortHeader label="First buy" k="firstTradeAt" sort={sort} onSort={onSort} className="py-2.5 pr-3" />
              <SortHeader label="Last trade" k="lastTradeAt" sort={sort} onSort={onSort} className="py-2.5 pr-3" />
              <SortHeader label="Market" k="title" sort={sort} onSort={onSort} className="py-2.5 pr-3" />
              <th className="py-2.5 px-3 font-medium">Outcome</th>
              <SortHeader label="Value" k="value" sort={sort} onSort={onSort} className="py-2.5 px-3" align="right" />
              <th className="py-2.5 px-3 text-right font-medium">Status</th>
              <SortHeader label="P&L" k="pnl" sort={sort} onSort={onSort} className="py-2.5 pl-3" align="right" />
            </tr>
          </thead>
          <tbody>
            {paged.map((p) => (
              <tr
                key={p.conditionId + p.outcome}
                className="border-t border-white/[0.05] transition hover:bg-white/[0.03]"
              >
                <td className="whitespace-nowrap py-3 pr-3 font-mono text-xs text-slate-400">
                  {shortDay(p.firstTradeAt)}
                </td>
                <td className="whitespace-nowrap py-3 pr-3 font-mono text-xs text-slate-400">
                  {shortDay(p.lastTradeAt)}
                </td>
                <td className="max-w-xs py-3 pr-3">
                  <div className="flex items-center gap-2.5">
                    {p.icon && (
                      <img src={p.icon} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
                    )}
                    <a
                      href={p.slug ? `https://polymarket.com/event/${p.slug}` : undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="line-clamp-2 text-slate-200 hover:text-brand-light"
                    >
                      {p.title}
                    </a>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <OutcomePill outcome={p.outcome} />
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-300">
                  {usdFull(valueOf(p))}
                </td>
                <td className="px-3 py-3 text-right">
                  {p.resolved ? (
                    <span
                      title={
                        p.exitType === "closed"
                          ? "Sold out before the market resolved"
                          : "Market resolved"
                      }
                      className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${
                        p.pnl > 0
                          ? "bg-success/10 text-success"
                          : "bg-danger/10 text-danger"
                      }`}
                    >
                      {p.pnl > 0 ? "Won" : "Lost"}
                      {p.exitType === "closed" && (
                        <span className="ml-1 text-slate-500">· sold</span>
                      )}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                      {(p.avgPrice * 100).toFixed(0)}¢ → {(p.curPrice * 100).toFixed(0)}¢
                    </span>
                  )}
                </td>
                <td className={`py-3 pl-3 text-right font-mono font-medium tabular-nums ${pnlColor(p.pnl)}`}>
                  {p.pnl >= 0 ? "+" : ""}
                  {usdFull(p.pnl)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} count={positions.length} pageSize={PAGE_SIZE} onPage={setPage} />
    </>
  );
}

function SortHeader({
  label,
  k,
  sort,
  onSort,
  className = "",
  align = "left",
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (k: SortKey) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const active = sort.key === k;
  return (
    <th className={`${className} font-medium ${align === "right" ? "text-right" : ""}`}>
      <button
        onClick={() => onSort(k)}
        title={`Sort by ${label.toLowerCase()}`}
        className={`inline-flex items-center gap-1 uppercase tracking-wider transition hover:text-slate-300 ${
          active ? "text-slate-300" : ""
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        <span className={`text-[9px] leading-none ${active ? "opacity-100" : "opacity-0"}`}>
          {sort.dir === "desc" ? "▼" : "▲"}
        </span>
      </button>
    </th>
  );
}
