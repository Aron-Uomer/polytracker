import { useEffect, useState } from "react";
import { fetchSmartMoney } from "../api";
import type { SmartMoneyFilters, SmartMoneyResult } from "../types";
import { usd } from "../format";
import { BoltIcon } from "./icons";
import { Pager } from "./Pager";

const PAGE_SIZE = 10;

function OutcomePill({ outcome }: { outcome: string }) {
  const o = outcome.toLowerCase();
  const cls =
    o === "yes"
      ? "border-success/30 bg-success/10 text-success"
      : o === "no"
      ? "border-danger/30 bg-danger/10 text-danger"
      : "border-white/10 bg-white/5 text-slate-300";
  return <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-medium ${cls}`}>{outcome || "–"}</span>;
}

const DEFAULTS: SmartMoneyFilters = {
  window: "7d",
  count: 25,
  metric: "profit",
  side: "buy",
  sort: "traders",
};

export function SmartMoney() {
  const [filters, setFilters] = useState<SmartMoneyFilters>(DEFAULTS);
  const [data, setData] = useState<SmartMoneyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const set = <K extends keyof SmartMoneyFilters>(k: K, v: SmartMoneyFilters[K]) =>
    setFilters((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setPage(0);
    fetchSmartMoney(filters)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load"));
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const verb = filters.side === "buy" ? "buying" : "selling";

  return (
    <section className="animate-fadeUp py-10">
      <div className="mb-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
        <BoltIcon className="h-3.5 w-3.5" /> Follow the smart money
      </div>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        What top traders are <span className="gradient-text">{verb}</span>
      </h1>
      <p className="mt-1 text-slate-400">
        {data
          ? `Markets the top ${data.tradersScanned} traders (by ${data.metric}) ${verb === "buying" ? "bought" : "sold"} in the last ${data.windowDays === 1 ? "24h" : `${data.windowDays} days`}.`
          : "Crunching recent trades from the top traders…"}
      </p>

      {/* Filters */}
      <div className="mt-5 flex flex-wrap gap-2">
        <Seg label="Window" value={filters.window} onChange={(v) => set("window", v as SmartMoneyFilters["window"])} options={[["1d", "24h"], ["7d", "7 days"], ["30d", "30 days"]]} />
        <Seg label="Action" value={filters.side} onChange={(v) => set("side", v as SmartMoneyFilters["side"])} options={[["buy", "Buying"], ["sell", "Selling"]]} />
        <Seg label="Ranked by" value={filters.metric} onChange={(v) => set("metric", v as SmartMoneyFilters["metric"])} options={[["profit", "Profit"], ["volume", "Volume"]]} />
        <Seg label="Sort" value={filters.sort} onChange={(v) => set("sort", v as SmartMoneyFilters["sort"])} options={[["traders", "Consensus"], ["usd", "Size"]]} />
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-2">
        {!data && !error ? (
          Array.from({ length: 8 }).map((_, i) => <div key={i} className="shimmer h-16 rounded-xl" />)
        ) : data && data.markets.length === 0 ? (
          <div className="glass rounded-xl py-16 text-center text-sm text-slate-500">
            No notable {verb} from the top {data.tradersScanned} traders in this window. Try a
            wider window or a bigger trader pool.
          </div>
        ) : (
          data?.markets.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE).map((m, i) => (
            <a
              key={m.conditionId + m.outcome}
              href={m.slug ? `https://polymarket.com/event/${m.slug}` : undefined}
              target="_blank"
              rel="noreferrer"
              className="glass glass-hover flex items-center gap-3 rounded-xl p-3"
            >
              <span className="w-5 shrink-0 text-center font-mono text-sm text-slate-500">
                {page * PAGE_SIZE + i + 1}
              </span>
              {m.icon && <img src={m.icon} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-100">{m.title}</span>
                  <OutcomePill outcome={m.outcome} />
                </div>
                {m.names.length > 0 && <div className="truncate text-xs text-slate-500">{m.names.join(", ")}</div>}
              </div>
              <div className="shrink-0 text-right">
                <div className={`font-mono text-sm font-semibold ${filters.side === "buy" ? "text-brand-light" : "text-danger"}`}>
                  {m.traders} {m.traders === 1 ? "trader" : "traders"}
                </div>
                <div className="font-mono text-xs text-slate-500">{usd(m.usdc)}</div>
              </div>
            </a>
          ))
        )}
      </div>

      {data && data.markets.length > 0 && (
        <Pager page={page} count={data.markets.length} pageSize={PAGE_SIZE} onPage={setPage} />
      )}
    </section>
  );
}

function Seg({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="px-0.5 text-[10px] uppercase tracking-wider text-slate-600">{label}</span>
      <div className="glass inline-flex rounded-lg p-0.5">
        {options.map(([v, lbl]) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              value === v ? "bg-white/10 text-slate-100" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}
