import { useEffect, useMemo, useState } from "react";
import { fetchHistory } from "../api";
import type { DailyPoint, Snapshot } from "../types";
import { usd } from "../format";
import { ChevronLeft, ChevronRight } from "./icons";

/* ------------------------- Monthly activity calendar ----------------------- */

const TONE = [
  "rgba(255,255,255,0.04)",
  "rgba(129,140,248,0.25)",
  "rgba(129,140,248,0.45)",
  "rgba(129,140,248,0.7)",
  "rgba(129,140,248,0.95)",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ActivityCalendar({ daily }: { daily: DailyPoint[] }) {
  const volByDate = useMemo(() => new Map(daily.map((d) => [d.date, d.volume])), [daily]);
  const maxVol = useMemo(() => Math.max(1, ...daily.map((d) => d.volume)), [daily]);

  const dates = useMemo(() => daily.map((d) => d.date).sort(), [daily]);
  const minMonth = dates[0]?.slice(0, 7) ?? null;
  const maxMonth = dates[dates.length - 1]?.slice(0, 7) ?? null;

  const [cur, setCur] = useState(() => {
    const base = maxMonth ?? new Date().toISOString().slice(0, 7);
    const [y, m] = base.split("-").map(Number);
    return { y, m: m - 1 };
  });

  const monthKey = `${cur.y}-${String(cur.m + 1).padStart(2, "0")}`;
  const daysInMonth = new Date(Date.UTC(cur.y, cur.m + 1, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(cur.y, cur.m, 1)).getUTCDay();
  const offset = (firstDow + 6) % 7; // Monday-first

  const intensity = (v: number) => {
    if (v <= 0) return 0;
    return Math.min(4, 1 + Math.floor((Math.log10(v + 1) / Math.log10(maxVol + 1)) * 4));
  };

  let monthVol = 0;
  let monthTrades = 0;
  for (const d of daily) {
    if (d.date.startsWith(monthKey)) {
      monthVol += d.volume;
      monthTrades += d.trades;
    }
  }

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(cur.y, cur.m + delta, 1));
    setCur({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  };
  const canPrev = !minMonth || monthKey > minMonth;
  const canNext = !maxMonth || monthKey < maxMonth;

  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Activity
        </h3>
        <div className="flex items-center gap-1">
          <NavBtn disabled={!canPrev} onClick={() => shift(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </NavBtn>
          <span className="w-28 text-center text-sm font-medium text-slate-200">
            {MONTHS[cur.m]} {cur.y}
          </span>
          <NavBtn disabled={!canNext} onClick={() => shift(1)}>
            <ChevronRight className="h-4 w-4" />
          </NavBtn>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-center text-[10px] uppercase tracking-wide text-muted">
            {w}
          </div>
        ))}
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`b${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const date = `${monthKey}-${String(day).padStart(2, "0")}`;
          const vol = volByDate.get(date) ?? 0;
          return (
            <div
              key={date}
              title={`${date}: ${vol > 0 ? usd(vol) + " volume" : "no trades"}`}
              className="relative aspect-square rounded-md text-[11px]"
              style={{ background: TONE[intensity(vol)] }}
            >
              <span className={`absolute right-1 top-0.5 ${vol > 0 ? "text-white/80" : "text-muted"}`}>
                {day}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>
          {monthTrades.toLocaleString()} trades · {usd(monthVol)} volume
        </span>
        <span className="flex items-center gap-1.5 text-[10px]">
          Less
          {TONE.map((c, i) => (
            <span key={i} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: c }} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}

function NavBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:border-brand hover:text-brand-light disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/* ------------------------------ P&L history -------------------------------- */

export function PnlHistory({ address }: { address: string }) {
  const [snaps, setSnaps] = useState<Snapshot[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHistory(address).then((s) => !cancelled && setSnaps(s));
    return () => {
      cancelled = true;
    };
  }, [address]);

  return (
    <div className="glass rounded-xl p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
        P&amp;L history
      </h3>
      {snaps === null ? (
        <div className="shimmer h-24 rounded-lg" />
      ) : snaps.length < 2 ? (
        <div className="flex h-24 items-center justify-center px-4 text-center text-xs text-muted">
          P&amp;L history builds as the wallet is re-checked over time (needs the database).
          Come back later to see the trend.
        </div>
      ) : (
        <Line points={snaps.map((s) => s.totalProfit)} />
      )}
    </div>
  );
}

function Line({ points }: { points: number[] }) {
  const W = 600;
  const H = 96;
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 0);
  const range = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / range) * H;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(" ");
  const up = points[points.length - 1] >= points[0];
  const stroke = up ? "#34d399" : "#f87171";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" preserveAspectRatio="none">
      {min < 0 && max > 0 && (
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      )}
      <path d={d} fill="none" stroke={stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
