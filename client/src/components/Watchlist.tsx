import { useEffect, useState } from "react";
import { fetchTraderSummary } from "../api";
import type { AddWatchResult, TraderSummary, WatchEntry, WatchlistState } from "../types";
import { usd, shortAddr, pnlColor } from "../format";
import { StarIcon, CrownIcon, PlusIcon, XIcon, UserIcon } from "./icons";

interface Props {
  state: WatchlistState | null;
  signedIn: boolean;
  onSignIn: () => void;
  onAdd: (address: string) => Promise<AddWatchResult>;
  onRemove: (address: string) => void;
  onUpgrade: () => void;
  onSelect: (address: string) => void;
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function Watchlist({ state, signedIn, onSignIn, onAdd, onRemove, onUpgrade, onSelect }: Props) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const atLimit = !!state && state.count >= state.limit;
  const isFree = state?.plan === "free";
  const pctUsed = state ? Math.min(100, (state.count / state.limit) * 100) : 0;
  const lockedCount = state ? Math.max(0, state.entries.length - state.limit) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const addr = input.trim();
    if (!ADDRESS_RE.test(addr)) {
      setError("Enter a valid 0x… wallet address.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await onAdd(addr);
    setBusy(false);
    if (res.ok) setInput("");
    // authRequired opens the sign-in modal upstream and re-tries afterwards, so
    // don't shout an error at someone who's mid sign-up.
    else if (res.authRequired) setError(null);
    else if (res.upgradeRequired) setError(res.error ?? "Plan limit reached.");
    else setError(res.error ?? "Couldn't add that wallet.");
  }

  return (
    <section className="animate-fadeUp py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted">
            <StarIcon className="h-3.5 w-3.5" /> Your roster
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            My <span className="gradient-text">traders</span>
          </h1>
          <p className="mt-1 text-slate-400">
            Track a roster of wallets and watch their stats side by side.
          </p>
        </div>

        {state && (
          <div className="glass min-w-[200px] rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  isFree
                    ? "bg-white/5 text-slate-300"
                    : "bg-premium/15 text-premium ring-1 ring-premium/30"
                }`}
              >
                {!isFree && <CrownIcon className="h-3.5 w-3.5" />}
                {isFree ? "Free plan" : "Pro plan"}
              </span>
              <span className="font-mono text-sm text-slate-300">
                <span className={atLimit ? "text-danger" : "text-slate-100"}>{state.count}</span>
                <span className="text-muted"> / {state.limit}</span>
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all ${atLimit ? "bg-danger" : "gradient-cta"}`}
                style={{ width: `${pctUsed}%` }}
              />
            </div>
            {!isFree && state.proExpiresAt && (
              <div className="mt-2 text-[11px] text-muted">
                Pro until {new Date(state.proExpiresAt).toLocaleDateString()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add bar — tracking needs an account, so signed-out visitors get the
          reason and a way in rather than a form that 401s. */}
      {signedIn ? (
        <>
          <form onSubmit={submit} className="mt-6 flex flex-col gap-3 sm:flex-row">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="0x… wallet address to track"
              spellCheck={false}
              disabled={atLimit}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm outline-none transition focus:border-brand disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy || atLimit}
              className="gradient-cta inline-flex items-center justify-center gap-1.5 rounded-xl px-6 py-3 font-semibold shadow-glow transition hover:brightness-110 disabled:opacity-50"
            >
              <PlusIcon className="h-4 w-4" /> {busy ? "Adding…" : "Track"}
            </button>
          </form>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </>
      ) : (
        <div className="glass mt-6 flex flex-col items-center gap-4 rounded-2xl px-6 py-10 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-brand-light">
            <StarIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-100">
              Sign in to track traders
            </h2>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-400">
              Your roster is saved to your account, so it follows you to any device.
              Free accounts track up to {state?.limit ?? 5} wallets.
            </p>
          </div>
          <button
            onClick={onSignIn}
            className="gradient-cta inline-flex items-center justify-center gap-1.5 rounded-xl px-6 py-3 font-semibold shadow-glow transition hover:brightness-110"
          >
            Sign in or create an account
          </button>
        </div>
      )}

      {/* Upgrade banner */}
      {isFree && (atLimit || error) && (
        <div className="glass mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 text-premium">
              <CrownIcon className="h-5 w-5" />
            </span>
            <div>
              <div className="font-semibold text-slate-100">
                Reached your free limit of {state?.limit} traders
              </div>
              <div className="text-sm text-slate-400">
                Pay with crypto track up to 100 traders for ${state?.proPrice ?? 10} / 30 days.
              </div>
            </div>
          </div>
          <button
            onClick={onUpgrade}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-5 py-2.5 font-semibold text-ink-950 transition hover:bg-slate-200"
          >
            <CrownIcon className="h-4 w-4" /> Upgrade to Pro
          </button>
        </div>
      )}

      {/* Cards */}
      {!state ? (
        <p className="mt-10 text-center text-sm text-muted">Loading…</p>
      ) : state.entries.length === 0 ? (
        <div className="glass mt-8 rounded-2xl py-16 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-muted">
            <StarIcon className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm text-slate-400">
            No traders yet. Paste a wallet above, or add them from the Tracker or Leaderboard.
          </p>
        </div>
      ) : (
        <>
          {lockedCount > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-premium/30 bg-premium/[0.06] p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 text-premium">
                  <CrownIcon className="h-5 w-5" />
                </span>
                <div>
                  <div className="font-semibold text-slate-100">
                    {lockedCount} {lockedCount === 1 ? "trader is" : "traders are"} locked
                  </div>
                  <div className="text-sm text-slate-400">
                    Your free plan tracks {state.limit}. Go Pro to unlock all {state.entries.length}.
                  </div>
                </div>
              </div>
              <button
                onClick={onUpgrade}
                className="rounded-lg bg-gradient-to-r from-premium to-amber-400 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:brightness-105"
              >
                Unlock with Pro
              </button>
            </div>
          )}
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {state.entries.slice(0, state.limit).map((e) => (
              <SummaryCard
                key={e.address}
                entry={e}
                onOpen={() => onSelect(e.address)}
                onRemove={() => onRemove(e.address)}
              />
            ))}
            {state.entries.slice(state.limit).map((e) => (
              <LockedCard key={e.address} entry={e} onRemove={() => onRemove(e.address)} />
            ))}
          </div>
        </>
      )}

      {isFree && !atLimit && lockedCount === 0 && state && state.entries.length > 0 && (
        <p className="mt-6 text-center text-xs text-muted">
          On the free plan ({state.count}/{state.limit}).{" "}
          <button onClick={onUpgrade} className="text-brand-light hover:underline">
            Upgrade to Pro
          </button>{" "}
          for up to 100.
        </p>
      )}
    </section>
  );
}

function LockedCard({ entry, onRemove }: { entry: WatchEntry; onRemove: () => void }) {
  return (
    <div className="glass relative overflow-hidden rounded-2xl p-4">
      <div className="pointer-events-none blur-[3px] select-none">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-ink-700 text-muted">
            <UserIcon className="h-4 w-4" />
          </div>
          <div>
            <div className="font-medium text-slate-100">{entry.label || shortAddr(entry.address)}</div>
            <div className="font-mono text-xs text-muted">{shortAddr(entry.address)}</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-6 rounded bg-white/5" />
          ))}
        </div>
      </div>
      <div className="absolute inset-0 grid place-items-center bg-ink-900/40">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-premium/30 bg-ink-900/80 px-3 py-1 text-xs font-medium text-premium">
          <CrownIcon className="h-3.5 w-3.5" /> Pro
        </span>
      </div>
      <button
        onClick={onRemove}
        className="absolute right-2 top-2 z-10 rounded-md p-1 text-muted transition hover:bg-white/5 hover:text-danger"
        title="Remove"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

function SummaryCard({
  entry,
  onOpen,
  onRemove,
}: {
  entry: WatchEntry;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const [data, setData] = useState<TraderSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchTraderSummary(entry.address)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [entry.address]);

  const name =
    entry.label || data?.profile.name || data?.profile.pseudonym || shortAddr(entry.address);

  return (
    <div onClick={onOpen} className="glass glass-hover group cursor-pointer rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {data?.profile.profileImage ? (
            <img
              src={data.profile.profileImage}
              alt=""
              className="h-9 w-9 rounded-full object-cover ring-1 ring-white/10"
            />
          ) : (
            <div className="grid h-9 w-9 place-items-center rounded-full bg-ink-700 text-muted ring-1 ring-white/10">
              <UserIcon className="h-4 w-4" />
            </div>
          )}
          <div>
            <div className="font-medium text-slate-100">{name}</div>
            <div className="font-mono text-xs text-muted">{shortAddr(entry.address)}</div>
          </div>
        </div>
        <button
          onClick={(ev) => {
            ev.stopPropagation();
            onRemove();
          }}
          className="rounded-md p-1 text-muted opacity-0 transition hover:bg-white/5 hover:text-danger group-hover:opacity-100"
          title="Remove"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      {failed ? (
        <p className="mt-4 text-xs text-muted">Couldn't load stats.</p>
      ) : !data ? (
        <div className="shimmer mt-4 h-12 rounded" />
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <Metric label="Total P&L" value={`${data.totalProfit >= 0 ? "+" : ""}${usd(data.totalProfit)}`} cls={pnlColor(data.totalProfit)} />
          <Metric label="Today" value={`${data.profitToday >= 0 ? "+" : ""}${usd(data.profitToday)}`} cls={pnlColor(data.profitToday)} />
          <Metric label="Portfolio" value={usd(data.portfolioValue)} />
          <Metric label="Volume" value={usd(data.totalVolume)} />
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`font-mono font-semibold tabular-nums ${cls ?? "text-slate-200"}`}>{value}</div>
    </div>
  );
}
