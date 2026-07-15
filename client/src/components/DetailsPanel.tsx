import type { TraderStats } from "../types";
import { usd, pnlColor } from "../format";

function Cell({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 transition hover:border-white/15">
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-base font-semibold ${valueClass ?? "text-slate-200"}`}>
        {value}
      </div>
    </div>
  );
}

const money = (n: number | null) => (n === null ? "–" : usd(n));

const signedPct = (n: number | null) =>
  n === null ? "–" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

const since = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : "–";

export function DetailsPanel({ stats }: { stats: TraderStats }) {
  const d = stats.details;
  return (
    <div className="glass rounded-2xl p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Details
      </h3>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
        <Cell label="Wins / Losses" value={`${stats.wins} / ${stats.losses}`} />
        <Cell
          label="Efficiency"
          value={signedPct(d.efficiencyPct)}
          valueClass={pnlColor(d.efficiencyPct ?? 0)}
        />
        <Cell
          label="Avg P&L % (last 100)"
          value={signedPct(d.avgPnlPctLast100)}
          valueClass={pnlColor(d.avgPnlPctLast100 ?? 0)}
        />
        <Cell label="Volume" value={money(stats.totalVolume)} />

        <Cell label="Total Bought" value={money(d.totalBought)} />
        <Cell label="Avg Buy / Day" value={money(d.avgBuyPerDay)} />
        <Cell label="Avg Buy (last 50)" value={money(d.avgBuySize)} />
        <Cell
          label="Avg Entry"
          value={d.avgEntryCents === null ? "–" : `${d.avgEntryCents.toFixed(0)}¢`}
        />

        <Cell label="Markets Traded" value={d.marketsTraded.toLocaleString()} />
        <Cell label="Active Days" value={d.activeDays.toLocaleString()} />
        <Cell label="Open Value" value={money(stats.openPositionsValue)} />
        <Cell label="Trading Since" value={since(stats.firstTradeAt)} />
      </div>
    </div>
  );
}
