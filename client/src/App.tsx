import { useEffect, useRef, useState } from "react";
import {
  fetchTrader,
  getWatchlist,
  addWatch,
  removeWatch,
  setPlan,
  pushRecent,
  fetchMe,
  logout as apiLogout,
  getBillingConfig,
  startCheckout,
} from "./api";
import type { AddWatchResult, AuthUser, TraderStats, WatchlistState } from "./types";
import { AuthModal } from "./components/AuthModal";
import { usd, usdFull, pct, pnlColor, tradeSince, shortAddr } from "./format";
import { StatCard } from "./components/StatCard";
import { TraderHeader } from "./components/TraderHeader";
import { PositionsTable } from "./components/PositionsTable";
import { DetailsPanel } from "./components/DetailsPanel";
import { Leaderboard } from "./components/Leaderboard";
import { Watchlist } from "./components/Watchlist";
import { TrackButton } from "./components/TrackButton";
import { SearchBox } from "./components/SearchBox";
import { SmartMoney } from "./components/SmartMoney";
import { Compare } from "./components/Compare";
import { ProGate } from "./components/ProGate";
import { ActivityCalendar, PnlHistory } from "./components/Charts";
import {
  SearchIcon,
  TrophyIcon,
  StarIcon,
  TargetIcon,
  CoinsIcon,
  ChartIcon,
  RefreshIcon,
  BoltIcon,
  ColumnsIcon,
} from "./components/icons";

type Route = "home" | "leaderboard" | "watchlist" | "smart" | "compare";

function parseHash(): { route: Route; trader: string | null } {
  const h = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  const [seg, param] = h.split("/");
  if (seg === "leaderboard") return { route: "leaderboard", trader: null };
  if (seg === "watchlist") return { route: "watchlist", trader: null };
  if (seg === "smart") return { route: "smart", trader: null };
  if (seg === "compare") return { route: "compare", trader: null };
  if (seg === "trader" && param) return { route: "home", trader: param.toLowerCase() };
  return { route: "home", trader: null };
}

function useHashRoute() {
  const [state, setState] = useState(parseHash);
  useEffect(() => {
    const onChange = () => setState(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return state;
}

function goTo(route: Route, trader?: string) {
  window.location.hash =
    route === "home" ? (trader ? `/trader/${trader}` : "/") : `/${route}`;
  window.scrollTo({ top: 0 });
}

const FEATURES = [
  { Icon: TargetIcon, title: "Real win rate", body: "Reconstructed from a wallet's full trade history, not just whatever positions happen to be open." },
  { Icon: CoinsIcon, title: "Complete P&L & volume", body: "Canonical all-time profit, today's P&L and lifetime volume, straight from Polymarket." },
  { Icon: ChartIcon, title: "Every position & metric", body: "Open & resolved bets with entry dates, plus a dozen derived stats and charts." },
];

export default function App() {
  const [stats, setStats] = useState<TraderStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [tab, setTab] = useState<"all" | "open" | "resolved">("all");
  const [watch, setWatch] = useState<WatchlistState | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [billing, setBilling] = useState({ enabled: false, price: 10 });
  const [flash, setFlash] = useState<string | null>(null);
  const { route, trader } = useHashRoute();
  const lastLookedUp = useRef<string | null>(null);

  const refreshWatch = () => getWatchlist().then(setWatch).catch(() => {});

  useEffect(() => {
    refreshWatch();
    fetchMe().then(setUser).catch(() => {});
    getBillingConfig().then(setBilling).catch(() => {});

    // Returning from Stripe Checkout (?checkout=success|cancel lives in the hash).
    const q = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
    const checkout = q.get("checkout");
    if (checkout === "success") {
      fetchMe().then((u) => u && setUser(u));
      refreshWatch();
      setFlash("Payment received! Pro activates once the transaction confirms on-chain (usually a few minutes).");
      goTo("watchlist");
    } else if (checkout === "cancel") {
      setFlash("Checkout canceled. No payment was made.");
      goTo("watchlist");
    }
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4500);
    return () => clearTimeout(t);
  }, [flash]);

  function onAuthed(u: AuthUser) {
    setUser(u);
    setAuthOpen(false);
    refreshWatch(); // now resolves to the account (anonymous list was merged in)
  }
  function signOut() {
    apiLogout();
    setUser(null);
    refreshWatch();
  }

  async function lookup(addr: string, refresh = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchTrader(addr, refresh);
      setStats(res.stats);
      setCached(res.cached);
      setIndexing(Boolean(res.indexing));
      const name = res.stats.profile.name || res.stats.profile.pseudonym || shortAddr(addr);
      pushRecent(addr, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStats(null);
    } finally {
      setLoading(false);
    }
  }

  // URL is the source of truth for which trader is shown.
  useEffect(() => {
    if (route !== "home") return;
    if (!trader) {
      setStats(null);
      setError(null);
      lastLookedUp.current = null;
      return;
    }
    if (lastLookedUp.current === trader) return;
    lastLookedUp.current = trader;
    lookup(trader);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, trader]);

  const selectTrader = (addr: string) => goTo("home", addr.toLowerCase());

  async function addTrader(addr: string): Promise<AddWatchResult> {
    const res = await addWatch(addr);
    if (res.state) setWatch(res.state);
    return res;
  }
  async function removeTrader(addr: string) {
    setWatch(await removeWatch(addr));
  }
  async function upgradePlan() {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (billing.enabled) {
      try {
        window.location.href = await startCheckout(); // Stripe-hosted page
      } catch (e) {
        setFlash(e instanceof Error ? e.message : "Could not start checkout.");
      }
      return;
    }
    // No payment provider configured – dev stub flips the plan directly.
    setWatch(await setPlan("pro"));
    setUser({ ...user, plan: "pro" });
  }
  const isTracked = (addr: string) => !!watch?.entries.some((e) => e.address === addr.toLowerCase());

  const onHome = route === "home";
  const showHero = onHome && !trader;
  const isPro = watch?.plan === "pro";

  // Combined open + resolved, newest entry first – backs the default "All" tab.
  const allPositions = stats
    ? [...stats.openPositions, ...stats.resolvedPositions].sort(
        (a, b) => (Date.parse(b.firstTradeAt ?? "") || 0) - (Date.parse(a.firstTradeAt ?? "") || 0)
      )
    : [];

  return (
    <>
      <div className="bg-ambient" />
      <div className="bg-grain" />

      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <button onClick={() => goTo("home")} className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg gradient-cta">
              <BoltIcon className="h-4 w-4 text-white" />
            </span>
            <span className="font-display text-[15px] font-bold tracking-tight">
              Poly<span className="gradient-text">Track</span>
            </span>
          </button>

          <div className="flex items-center gap-1.5">
          <nav className="flex items-center gap-0.5 text-sm">
            <NavLink icon={<SearchIcon className="h-4 w-4" />} label="Tracker" active={onHome} onClick={() => goTo("home")} />
            <NavLink icon={<TrophyIcon className="h-4 w-4" />} label="Leaderboard" active={route === "leaderboard"} onClick={() => goTo("leaderboard")} />
            <NavLink icon={<BoltIcon className="h-4 w-4" />} label="Smart money" active={route === "smart"} onClick={() => goTo("smart")} pro={!isPro} />
            <NavLink icon={<ColumnsIcon className="h-4 w-4" />} label="Compare" active={route === "compare"} onClick={() => goTo("compare")} pro={!isPro} />
            <NavLink icon={<StarIcon className="h-4 w-4" />} label="My Traders" active={route === "watchlist"} onClick={() => goTo("watchlist")} badge={watch && watch.count > 0 ? watch.count : undefined} />
          </nav>
          <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
          <AccountControl user={user} onSignIn={() => setAuthOpen(true)} onSignOut={signOut} />
          </div>
        </div>
      </header>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onAuthed={onAuthed} />}

      {flash && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 animate-fadeUp rounded-xl border border-white/10 bg-ink-800 px-4 py-2.5 text-sm text-slate-100 shadow-xl">
          {flash}
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4">
        {route === "leaderboard" && (
          <Leaderboard onSelect={selectTrader} onAdd={addTrader} isTracked={isTracked} onNeedUpgrade={() => goTo("watchlist")} />
        )}
        {route === "smart" &&
          (isPro ? (
            <SmartMoney />
          ) : (
            <ProGate
              title="Follow the smart money"
              desc="See exactly which markets the most profitable traders are piling into right now a signal you won't find anywhere else."
              onUpgrade={upgradePlan}
            />
          ))}
        {route === "compare" &&
          (isPro ? (
            <Compare watchAddresses={watch?.entries ?? []} onSelect={selectTrader} />
          ) : (
            <ProGate
              title="Compare traders head-to-head"
              desc="Stack up to four wallets side by side P&L, volume and portfolio at a glance."
              onUpgrade={upgradePlan}
            />
          ))}
        {route === "watchlist" && (
          <Watchlist state={watch} onAdd={addTrader} onRemove={removeTrader} onUpgrade={upgradePlan} onSelect={selectTrader} />
        )}

        {onHome && (
          <>
            <section className={showHero ? "pt-16 pb-4 text-center sm:pt-24" : "pt-8"}>
              {showHero && (
                <div className="animate-fadeUp">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 shadow-soft">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                    Live Polymarket trader analytics
                  </span>
                  <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-bold leading-[1.04] tracking-tight sm:text-7xl">
                    See any trader's <span className="gradient-text">real stats</span>
                  </h1>
                  <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
                    Search a trader or paste a Polymarket wallet to reveal win rate, profit,
                    volume, open bets and a full breakdown in seconds.
                  </p>
                </div>
              )}

              <div className={`relative mx-auto mt-9 flex ${showHero ? "max-w-2xl" : "max-w-full"}`}>
                <SearchBox onPick={selectTrader} loading={loading} />
              </div>

              {showHero && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5"><span className="h-1 w-1 rounded-full bg-brand-light" /> Real win rate & P&L</span>
                  <span className="flex items-center gap-1.5"><span className="h-1 w-1 rounded-full bg-brand-light" /> Full position history</span>
                  <span className="flex items-center gap-1.5"><span className="h-1 w-1 rounded-full bg-brand-light" /> Free to use</span>
                </div>
              )}
            </section>

            {error && (
              <div className="mx-auto mt-6 max-w-2xl rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            {loading && !stats && <ResultsSkeleton />}

            {stats && !error && (
              <section className="animate-fadeUp mt-8 space-y-6 pb-16">
                {indexing && (
                  <div className="flex items-center gap-2 rounded-xl border border-premium/40 bg-premium/10 px-4 py-2.5 text-sm text-premium">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-premium" />
                    Still indexing this wallet's older history counts will firm up. Refresh in a moment.
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <TraderHeader stats={stats} />
                  <div className="flex items-center gap-2">
                    <TrackButton address={stats.address} tracked={isTracked(stats.address)} onAdd={addTrader} onNeedUpgrade={() => goTo("watchlist")} />
                    <button
                      onClick={() => lookup(stats.address, true)}
                      disabled={loading}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:border-brand hover:text-brand-light disabled:opacity-50"
                    >
                      <RefreshIcon className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <StatCard label="Total P&L" value={`${stats.totalProfit >= 0 ? "+" : ""}${usd(stats.totalProfit)}`} valueClass={pnlColor(stats.totalProfit)} sub={`Today ${stats.profitToday >= 0 ? "+" : ""}${usd(stats.profitToday)}`} />
                  <StatCard label="Win Rate" value={pct(stats.winRate)} sub={`${stats.wins}W / ${stats.losses}L of ${stats.resolvedCount} resolved`} />
                  <StatCard label="Total Trades" value={`${stats.totalTrades.toLocaleString()}${stats.tradesCapped ? "+" : ""}`} sub={`${usd(stats.totalVolume)} vol · since ${tradeSince(stats.firstTradeAt)}`} />
                  <StatCard label="Portfolio Value" value={usd(stats.portfolioValue)} sub={`${stats.openPositionsCount} open positions`} />
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <PnlHistory key={`pnl-${stats.address}`} address={stats.address} />
                  <ActivityCalendar key={`cal-${stats.address}`} daily={stats.dailySeries} />
                </div>

                <DetailsPanel stats={stats} />

                <div className="glass rounded-2xl p-1.5">
                  <div className="flex gap-1 px-2 pt-1.5">
                    <TabButton active={tab === "all"} onClick={() => setTab("all")}>
                      All ({stats.openPositionsCount + stats.resolvedCount})
                    </TabButton>
                    <TabButton active={tab === "open"} onClick={() => setTab("open")}>
                      Open ({stats.openPositionsCount})
                    </TabButton>
                    <TabButton active={tab === "resolved"} onClick={() => setTab("resolved")}>
                      Resolved ({stats.resolvedCount})
                    </TabButton>
                  </div>
                  <div className="px-3 pb-2">
                    <PositionsTable
                      positions={
                        tab === "open"
                          ? stats.openPositions
                          : tab === "resolved"
                          ? stats.resolvedPositions
                          : allPositions
                      }
                      mode={tab}
                    />
                  </div>
                </div>

                <p className="text-right text-xs text-slate-600">
                  Open positions value {usdFull(stats.openPositionsValue)} · {cached ? "cached" : "fresh"} · updated {new Date(stats.lastUpdated).toLocaleString()}
                </p>
              </section>
            )}

            {showHero && (
              <section className="mt-24 pb-24">
                <div className="mb-8 text-center">
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Why PolyTrack
                  </span>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                    Numbers you can actually trust
                  </h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {FEATURES.map((f) => (
                    <div key={f.title} className="glass glass-hover rounded-2xl p-6">
                      <div className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-brand-light">
                        <f.Icon className="h-5 w-5" />
                      </div>
                      <h3 className="mt-4 font-display text-base font-semibold text-slate-100">
                        {f.title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.body}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto max-w-7xl px-4 py-6 text-center text-xs text-slate-600">
          PolyTrack · Data from Polymarket's public API · For informational purposes only.
        </div>
      </footer>
    </>
  );
}

function ResultsSkeleton() {
  return (
    <section className="mt-8 space-y-6 pb-16">
      <div className="flex items-center gap-4">
        <div className="shimmer h-12 w-12 rounded-full" />
        <div className="space-y-2">
          <div className="shimmer h-4 w-32 rounded" />
          <div className="shimmer h-3 w-24 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="shimmer h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="shimmer h-44 rounded-xl" />
        <div className="shimmer h-44 rounded-xl" />
      </div>
      <div className="shimmer h-48 rounded-2xl" />
      <p className="text-center text-xs text-slate-600">
        Crunching the full trade history this can take a few seconds for very active wallets.
      </p>
    </section>
  );
}

function AccountControl({
  user,
  onSignIn,
  onSignOut,
}: {
  user: AuthUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!user) {
    return (
      <button
        onClick={onSignIn}
        className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-200 transition hover:border-brand hover:text-brand-light"
      >
        Sign in
      </button>
    );
  }

  const initial = (user.name || user.email || "?").charAt(0).toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="grid h-8 w-8 place-items-center rounded-full bg-brand text-sm font-semibold text-white ring-1 ring-white/15"
        title={user.email}
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-ink-900 shadow-xl">
          <div className="border-b border-white/5 px-4 py-3">
            <div className="truncate text-sm font-medium text-slate-100">{user.name || "Account"}</div>
            <div className="truncate text-xs text-slate-500">{user.email}</div>
            <span
              className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                user.plan === "pro" ? "bg-premium/15 text-premium" : "bg-white/5 text-slate-400"
              }`}
            >
              {user.plan} plan
            </span>
            {user.plan === "pro" && user.proExpiresAt && (
              <div className="mt-1.5 text-[11px] text-slate-500">
                Pro until {new Date(user.proExpiresAt).toLocaleDateString()}
              </div>
            )}
          </div>
          <button
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="w-full px-4 py-2.5 text-left text-sm text-slate-300 transition hover:bg-white/5"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function NavLink({
  icon,
  label,
  active,
  onClick,
  badge,
  pro,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
  pro?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={pro ? `${label} (Pro)` : label}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition sm:px-3 ${
        active ? "bg-white/10 text-slate-100" : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
      }`}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
      {pro && (
        <span className="rounded bg-premium/15 px-1 text-[9px] font-bold uppercase tracking-wide text-premium">
          Pro
        </span>
      )}
      {badge !== undefined && (
        <span className="rounded-full bg-brand/25 px-1.5 text-xs font-medium text-brand-light">{badge}</span>
      )}
    </button>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
        active ? "bg-white/10 text-slate-100" : "text-slate-400 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}
