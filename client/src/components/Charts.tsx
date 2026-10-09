import { useMemo, useState } from "react";
import type { DailyPoint } from "../types";
import { usd } from "../format";
import { ChevronLeft, ChevronRight } from "./icons";

/* ------------------------- Monthly activity calendar ----------------------- */

/* Heat in the board's own amber. These were indigo — a leftover from before
   the Tote Board, and the one place on the page that still looked like a
   different product. Driving them through --lamp also means they re-light
   with the theme instead of staying a fixed film that vanishes on a pale
   ground. */
const TONE = [
  "rgb(var(--hair) / 0.05)",
  "rgb(var(--lamp) / 0.22)",
  "rgb(var(--lamp) / 0.42)",
  "rgb(var(--lamp) / 0.68)",
  "rgb(var(--lamp) / 0.95)",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ActivityCalendar({
  daily,
  capped = false,
}: {
  daily: DailyPoint[];
  /** The history read stopped before reaching the wallet's first trade. */
  capped?: boolean;
}) {
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
  let activeDays = 0;
  let busiest: DailyPoint | null = null;
  for (const d of daily) {
    if (d.date.startsWith(monthKey)) {
      monthVol += d.volume;
      monthTrades += d.trades;
      if (d.trades > 0) activeDays++;
      if (d.volume > 0 && (!busiest || d.volume > busiest.volume)) busiest = d;
    }
  }

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(cur.y, cur.m + delta, 1));
    setCur({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  };

  // Paging stays inside the months we actually hold. On a heavily traded wallet
  // the history read stops after a bounded number of pages, so `daily` can
  // cover three days — a single month, with nowhere to page to. Rather than
  // show two arrows that refuse to move, drop them: one month means one view.
  const canPrev = !minMonth || monthKey > minMonth;
  const canNext = !maxMonth || monthKey < maxMonth;
  const navigable = Boolean(minMonth && maxMonth && minMonth !== maxMonth);

  // A month inside the range with nothing in it was genuinely quiet — the read
  // covered it. Saying "0 trades" is only safe because paging can't leave the
  // range, so we never label unread months as inactive.
  const monthHasData = monthTrades > 0 || monthVol > 0;

  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Activity
        </h3>
        <div className="flex items-center gap-1">
          {navigable && (
            <NavBtn disabled={!canPrev} onClick={() => shift(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </NavBtn>
          )}
          <span
            className={`text-center text-sm font-medium text-slate-200 ${navigable ? "w-28" : ""}`}
          >
            {MONTHS[cur.m]} {cur.y}
          </span>
          {navigable && (
            <NavBtn disabled={!canNext} onClick={() => shift(1)}>
              <ChevronRight className="h-4 w-4" />
            </NavBtn>
          )}
        </div>
      </div>

      {/* The cells are square and the grid has seven columns, so cell size is
          driven entirely by how wide the container is. Left unconstrained on a
          desktop that meant ~150px days and a card about 950px tall. The grid
          is capped at a readable ~46px per day and the month's figures fill
          the space beside it, rather than the card centring the grid and
          leaving a wide empty margin either side. Below `sm` the two stack and
          the card is already narrower than the cap, so phones are unaffected. */}
      <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
        <div className="grid w-full shrink-0 grid-cols-7 gap-1.5 sm:w-[360px]">
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
            const heat = intensity(vol);
            // The day number sits on top of the heat, so it has to flip with
            // it: on the two hottest steps the cell is near-solid lamp and
            // needs the board colour, which is dark under one lighting and
            // pale under the other. Anything less and the number is unreadable
            // on exactly the days that matter most.
            const dayInk = heat === 0 ? "text-muted" : heat >= 3 ? "text-board" : "text-bone";
            return (
              <div
                key={date}
                title={`${date}: ${vol > 0 ? usd(vol) + " volume" : "no trades"}`}
                className="relative aspect-square rounded-md text-[11px]"
                style={{ background: TONE[heat] }}
              >
                <span className={`absolute right-1 top-0.5 ${dayInk}`}>
                  {day}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex flex-1 flex-col justify-between gap-5">
          {monthHasData ? (
            /* Two by two, not a list: as a single column these four sat in a
               narrow strip and left the rest of the card empty. */
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              <Figure label="Trades" value={monthTrades.toLocaleString()} />
              <Figure label="Volume" value={usd(monthVol)} />
              <Figure
                label="Busiest day"
                value={busiest ? usd(busiest.volume) : "–"}
                sub={busiest ? `${MONTHS[cur.m]} ${Number(busiest.date.slice(8))}` : undefined}
              />
              <Figure
                label="Active days"
                value={String(activeDays)}
                sub={`of ${daysInMonth}`}
              />
            </div>
          ) : (
            <p className="text-sm text-muted">No trades this month.</p>
          )}

          <div className="space-y-2">
            {/* Without this, a wallet whose read stopped after three days looks
                like a wallet that only ever traded for three days. */}
            {capped && (
              <p className="text-xs leading-relaxed text-muted">
                Recent activity only — this wallet has more history than one read covers.
              </p>
            )}
            <span className="flex items-center gap-1.5 text-[10px] text-muted">
              Less
              {TONE.map((c, i) => (
                <span key={i} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: c }} />
              ))}
              More
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A month figure. Deliberately lighter than StatCard — these summarise the
 *  month on screen, not the wallet, and shouldn't compete with the row above. */
function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 font-mono text-[20px] font-semibold leading-tight tracking-tight text-slate-100">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
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
      className="grid h-7 w-7 place-items-center rounded-lg border border-hair/10 text-slate-400 transition hover:border-brand hover:text-brand-light disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}
