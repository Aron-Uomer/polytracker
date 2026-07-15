import { useEffect, useState } from "react";
import { fetchTraderSummary } from "../api";
import type { TraderSummary, WatchEntry } from "../types";
import { usd, shortAddr, pnlColor } from "../format";
import { PlusIcon, XIcon, UserIcon } from "./icons";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const MAX = 4;

export function Compare({
  watchAddresses,
  onSelect,
}: {
  watchAddresses: WatchEntry[];
  onSelect: (a: string) => void;
}) {
  const [addrs, setAddrs] = useState<string[]>([]);
  const [data, setData] = useState<Record<string, TraderSummary | null>>({});
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    addrs.forEach((a) => {
      if (a in data) return;
      setData((d) => ({ ...d, [a]: null }));
      fetchTraderSummary(a)
        .then((s) => setData((d) => ({ ...d, [a]: s })))
        .catch(() => setData((d) => ({ ...d, [a]: null })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrs]);

  function add(raw: string) {
    const a = raw.trim().toLowerCase();
    if (!ADDRESS_RE.test(a)) return setError("Enter a valid 0x… address.");
    if (addrs.includes(a)) return setError("Already added.");
    if (addrs.length >= MAX) return setError(`Up to ${MAX} traders.`);
    setError(null);
    setAddrs((x) => [...x, a]);
    setInput("");
  }
  function remove(a: string) {
    setAddrs((x) => x.filter((y) => y !== a));
  }

  const quickAdd = watchAddresses.filter((w) => !addrs.includes(w.address)).slice(0, 6);
  const rows: { label: string; get: (s: TraderSummary) => number }[] = [
    { label: "Total P&L", get: (s) => s.totalProfit },
    { label: "Today", get: (s) => s.profitToday },
    { label: "Portfolio", get: (s) => s.portfolioValue },
    { label: "Volume", get: (s) => s.totalVolume },
  ];

  return (
    <section className="animate-fadeUp py-10">
      <div className="mb-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
        Head to head
      </div>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Compare <span className="gradient-text">traders</span>
      </h1>
      <p className="mt-1 text-slate-400">Stack up to {MAX} wallets side by side.</p>

      {/* Add bar */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add(input)}
          placeholder="0x… wallet address"
          spellCheck={false}
          className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm outline-none transition focus:border-brand"
        />
        <button
          onClick={() => add(input)}
          className="gradient-cta inline-flex items-center justify-center gap-1.5 rounded-xl px-6 py-3 font-semibold text-white transition hover:brightness-110"
        >
          <PlusIcon className="h-4 w-4" /> Add
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {quickAdd.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">From your roster:</span>
          {quickAdd.map((w) => (
            <button
              key={w.address}
              onClick={() => add(w.address)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300 transition hover:border-brand hover:text-brand-light"
            >
              {w.label || shortAddr(w.address)}
            </button>
          ))}
        </div>
      )}

      {addrs.length === 0 ? (
        <div className="glass mt-8 rounded-xl py-16 text-center text-sm text-slate-500">
          Add two or more traders to compare them.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr>
                <th className="w-32" />
                {addrs.map((a) => (
                  <th key={a} className="p-3 text-center align-bottom">
                    <button onClick={() => remove(a)} className="float-right text-slate-600 hover:text-danger">
                      <XIcon className="h-4 w-4" />
                    </button>
                    <div className="flex cursor-pointer flex-col items-center gap-1.5" onClick={() => onSelect(a)}>
                      {data[a]?.profile.profileImage ? (
                        <img src={data[a]!.profile.profileImage!} alt="" className="h-10 w-10 rounded-full object-cover ring-1 ring-white/10" />
                      ) : (
                        <span className="grid h-10 w-10 place-items-center rounded-full bg-ink-700 text-slate-500 ring-1 ring-white/10">
                          <UserIcon className="h-5 w-5" />
                        </span>
                      )}
                      <span className="max-w-[120px] truncate text-slate-100 hover:text-brand-light">
                        {data[a]?.profile.name || data[a]?.profile.pseudonym || shortAddr(a)}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const vals = addrs.map((a) => (data[a] ? row.get(data[a]!) : null));
                const best = Math.max(...vals.filter((v): v is number => v !== null), -Infinity);
                return (
                  <tr key={row.label} className="border-t border-white/[0.06]">
                    <td className="py-3 pr-3 text-xs uppercase tracking-wider text-slate-500">{row.label}</td>
                    {addrs.map((a, i) => {
                      const v = vals[i];
                      const colorize = row.label === "Total P&L" || row.label === "Today";
                      return (
                        <td key={a} className="p-3 text-center">
                          {v === null ? (
                            <span className="text-slate-600">…</span>
                          ) : (
                            <span
                              className={`font-mono font-semibold tabular-nums ${
                                colorize ? pnlColor(v) : "text-slate-200"
                              } ${v === best && addrs.length > 1 ? "underline decoration-brand/60 underline-offset-4" : ""}`}
                            >
                              {colorize && v >= 0 ? "+" : ""}
                              {usd(v)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
