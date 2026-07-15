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

export function pnlColor(n: number): string {
  if (n > 0) return "text-emerald-400";
  if (n < 0) return "text-rose-400";
  return "text-slate-300";
}
