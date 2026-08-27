import type { PositionMode, PositionSortKey, PositionView, SortDir } from "../types";
import { usdFull, pnlColor } from "../format";
import { Pager } from "./Pager";

/** Matches valueOf() in server/src/positions.ts, which sorts by this number:
 *  a resolved position's "value" is what it was worth, not what it is now (nil). */
const valueOf = (p: PositionView) => (p.resolved ? p.initialValue : p.currentValue);

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

/**
 * Presentational only. Sorting and paging happen on the server — this component
 * renders the page it is handed and reports what the visitor clicked.
 *
 * It used to receive every position and sort/slice them here, which meant the
 * API had to ship all 7,000 rows so twenty could be displayed.
 */
interface Props {
  positions: PositionView[];
  mode: PositionMode;
  total: number;
  page: number;
  pageSize: number;
  sort: PositionSortKey;
  dir: SortDir;
  loading?: boolean;
  onPage: (page: number) => void;
  onSort: (key: PositionSortKey) => void;
}

export function PositionsTable({
  positions,
  mode,
  total,
  page,
  pageSize,
  sort,
  dir,
  loading = false,
  onPage,
  onSort,
}: Props) {
  if (total === 0) {
    const label = mode === "all" ? "" : mode === "resolved" ? "closed " : `${mode} `;
    return (
      <p className="py-10 text-center text-sm text-muted">No {label}positions found.</p>
    );
  }

  const paged = positions;

  return (
    <>
      <div className={`overflow-x-auto transition-opacity ${loading ? "opacity-50" : ""}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <SortHeader label="First buy" k="firstTradeAt" sortKey={sort} dir={dir} onSort={onSort} className="py-2.5 pr-3" />
              <SortHeader label="Last trade" k="lastTradeAt" sortKey={sort} dir={dir} onSort={onSort} className="py-2.5 pr-3" />
              <SortHeader label="Market" k="title" sortKey={sort} dir={dir} onSort={onSort} className="py-2.5 pr-3" />
              <th className="py-2.5 px-3 font-medium">Outcome</th>
              <SortHeader label="Value" k="value" sortKey={sort} dir={dir} onSort={onSort} className="py-2.5 px-3" align="right" />
              <th className="py-2.5 px-3 text-right font-medium">Status</th>
              <SortHeader label="P&L" k="pnl" sortKey={sort} dir={dir} onSort={onSort} className="py-2.5 pl-3" align="right" />
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
                        <span className="ml-1 text-muted">· sold</span>
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
      <Pager page={page} count={total} pageSize={pageSize} onPage={onPage} />
    </>
  );
}

function SortHeader({
  label,
  k,
  sortKey,
  dir,
  onSort,
  className = "",
  align = "left",
}: {
  label: string;
  k: PositionSortKey;
  sortKey: PositionSortKey;
  dir: SortDir;
  onSort: (k: PositionSortKey) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const active = sortKey === k;
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
          {dir === "desc" ? "▼" : "▲"}
        </span>
      </button>
    </th>
  );
}
