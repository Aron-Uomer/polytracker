export function usd(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function usdFull(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function pct(n: number | null): string {
  if (n === null) return "–";
  return `${(n * 100).toFixed(1)}%`;
}

export function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function tradeSince(iso: string | null): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

/**
 * The gain/loss colours for every figure on the board.
 *
 * These were Tailwind's stock emerald-400 and rose-400 — the last two places
 * in the app still using the default palette, and the reason the board's own
 * `success`/`danger` were defined in the first place: the config notes the
 * stock pair "read as generic and sit cold against the enamel".
 *
 * They were also the one pair that never re-lit with the theme, because a
 * literal utility class cannot. On the light board emerald-400 measured
 * 1.60:1 and rose-400 2.24:1 — both far under the 4.5:1 floor, which is why
 * a win read as a bright smear rather than a number. The tokens below are
 * measured in both lightings: 8.20:1 / 5.57:1 at night, 5.05:1 / 4.93:1 in
 * daylight.
 */
export function pnlColor(n: number): string {
  if (n > 0) return "text-success";
  if (n < 0) return "text-danger";
  return "text-slate-300";
}
