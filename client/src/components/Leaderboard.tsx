import { useEffect, useState } from "react";
import { fetchLeaderboard } from "../api";
import type {
  AddWatchResult,
  LeaderboardMetric,
  LeaderboardRow,
  LeaderboardWindow,
} from "../types";
import { usd, shortAddr, pnlColor } from "../format";
import { TrackButton } from "./TrackButton";
import { TrophyIcon, UserIcon, SearchIcon } from "./icons";
import { Pager } from "./Pager";

const PAGE_SIZE = 10;

interface Props {
  onSelect: (address: string) => void;
  onAdd: (address: string) => Promise<AddWatchResult>;
  isTracked: (address: string) => boolean;
  onNeedUpgrade: () => void;
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={`grid h-7 w-7 place-items-center font-mono text-sm ${
        rank <= 3 ? "font-semibold text-slate-100" : "text-muted"
      }`}
    >
      {rank}
    </span>
  );
}

export function Leaderboard({ onSelect, onAdd, isTracked, onNeedUpgrade }: Props) {
  const [metric, setMetric] = useState<LeaderboardMetric>("profit");
  const [window, setWindow] = useState<LeaderboardWindow>("all");
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchLeaderboard(metric, window, 50)
      .then((res) => !cancelled && setRows(res.rows))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [metric, window]);

  // Reset to the first page whenever the list changes.
  useEffect(() => setPage(0), [metric, window, filter]);

  const f = filter.trim().toLowerCase();
  const shown = f
    ? rows.filter((r) => (r.name || r.pseudonym || "").toLowerCase().includes(f))
    : rows;

  const paged = shown.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <section className="animate-fadeUp py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted">
            <TrophyIcon className="h-3.5 w-3.5" /> Live rankings
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Top <span className="gradient-text">traders</span>
          </h1>
          <p className="mt-1 text-slate-400">
            The biggest names on Polymarket. Click anyone to see their full stats.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Toggle
            options={[
              { v: "profit", label: "Profit" },
              { v: "volume", label: "Volume" },
            ]}
            value={metric}
            onChange={(v) => setMetric(v as LeaderboardMetric)}
          />
          <Toggle
            options={[
              { v: "1d", label: "Today" },
              { v: "7d", label: "This week" },
              { v: "all", label: "All-time" },
            ]}
            value={window}
            onChange={(v) => setWindow(v as LeaderboardWindow)}
          />
        </div>
      </div>

      <div className="relative mt-5 max-w-xs">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name…"
          className="w-full rounded-lg border border-hair/10 bg-hair/5 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-brand"
        />
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* overflow-x-auto, not overflow-hidden: on a narrow screen the track
          column sits past the edge, and hidden silently clipped it away. */}
      <div className="glass mt-6 overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[22rem] text-sm">
          <thead>
            <tr className="border-b border-hair/[0.06] text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="py-3 pl-5 pr-2 font-medium">#</th>
              <th className="py-3 px-2 font-medium">Trader</th>
              <th className="hidden py-3 px-2 font-medium sm:table-cell">Wallet</th>
              <th className="py-3 pl-2 pr-2 text-right font-medium">
                {metric === "profit" ? "Profit" : "Volume"}
                {window === "1d" ? " (24h)" : window === "7d" ? " (7d)" : ""}
              </th>
              <th className="py-3 pl-2 pr-5"></th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <tr key={i} className="border-t border-hair/[0.04]">
                    <td colSpan={5} className="px-5 py-4">
                      <div className="shimmer h-4 w-full rounded" />
                    </td>
                  </tr>
                ))
              : paged.map((r) => (
                  <tr
                    key={r.address}
                    onClick={() => onSelect(r.address)}
                    className="group cursor-pointer border-t border-hair/[0.05] transition hover:bg-hair/[0.04]"
                  >
                    <td className="py-2.5 pl-5 pr-2">
                      <RankBadge rank={r.rank} />
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-3">
                        {r.profileImage ? (
                          <img
                            src={r.profileImage}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover ring-1 ring-hair/10"
                          />
                        ) : (
                          <div className="grid h-8 w-8 place-items-center rounded-full bg-ink-700 text-muted ring-1 ring-hair/10">
                            <UserIcon className="h-4 w-4" />
                          </div>
                        )}
                        <span className="font-medium text-slate-100 group-hover:text-brand-light">
                          {r.name || r.pseudonym || "Anonymous"}
                        </span>
                      </div>
                    </td>
                    <td className="hidden py-2.5 px-2 font-mono text-xs text-muted sm:table-cell">
                      {shortAddr(r.address)}
                    </td>
                    <td
                      className={`py-2.5 pl-2 pr-2 text-right font-mono font-semibold tabular-nums ${
                        metric === "profit" ? pnlColor(r.amount) : "text-slate-200"
                      }`}
                    >
                      {metric === "profit" && r.amount >= 0 ? "+" : ""}
                      {usd(r.amount)}
                    </td>
                    <td className="py-2.5 pl-2 pr-5 text-right">
                      <TrackButton
                        address={r.address}
                        tracked={isTracked(r.address)}
                        onAdd={onAdd}
                        onNeedUpgrade={onNeedUpgrade}
                        compact
                      />
                    </td>
                  </tr>
                ))}
            {!loading && shown.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sm text-muted">
                  No traders match “{filter}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!loading && <Pager page={page} count={shown.length} pageSize={PAGE_SIZE} onPage={setPage} />}
    </section>
  );
}

function Toggle({
  options,
  value,
  onChange,
}: {
  options: { v: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="glass inline-flex rounded-xl p-1">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            value === o.v ? "gradient-cta font-semibold" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
