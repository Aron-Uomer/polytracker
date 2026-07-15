import { useEffect, useState } from "react";
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

interface Props {
  positions: PositionView[];
  mode: "all" | "open" | "resolved";
}

export function PositionsTable({ positions, mode }: Props) {
  const [page, setPage] = useState(0);
  // Reset paging when the tab (mode) or the number of rows changes.
  useEffect(() => setPage(0), [mode, positions.length]);

  if (positions.length === 0) {
    const label = mode === "all" ? "" : `${mode} `;
    return (
      <p className="py-10 text-center text-sm text-slate-500">No {label}positions found.</p>
    );
  }

  const paged = positions.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
            <th className="py-2.5 pr-3 font-medium">First buy</th>
            <th className="py-2.5 pr-3 font-medium">Market</th>
            <th className="py-2.5 px-3 font-medium">Outcome</th>
            <th className="py-2.5 px-3 text-right font-medium">Value</th>
            <th className="py-2.5 px-3 text-right font-medium">Status</th>
            <th className="py-2.5 pl-3 text-right font-medium">P&amp;L</th>
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
                {usdFull(p.resolved ? p.initialValue : p.currentValue)}
              </td>
              <td className="px-3 py-3 text-right">
                {p.resolved ? (
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${
                      p.pnl > 0
                        ? "bg-success/10 text-success"
                        : "bg-danger/10 text-danger"
                    }`}
                  >
                    {p.pnl > 0 ? "Won" : "Lost"}
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
