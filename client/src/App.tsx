import { useEffect, useRef, useState } from "react";
import {
  fetchTrader,
  fetchTraderSummary,
  fetchPositions,
  getWatchlist,
  addWatch,
  removeWatch,
  setPlan,
  pushRecent,
  fetchMe,
  logout as apiLogout,
  getBillingConfig,
  startCheckout,
  type BillingConfig,
} from "./api";
import type {
  AddWatchResult,
  AuthUser,
  PositionMode,
  PositionPage,
  PositionSortKey,
  SortDir,
  TraderStats,
  TraderSummary,
  WatchlistState,
} from "./types";
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
import { ActivityCalendar } from "./components/Charts";
import {
  SearchIcon,
  TrophyIcon,
  StarIcon,
  RefreshIcon,
  BoltIcon,
  ColumnsIcon,
  MenuIcon,
  XIcon,
} from "./components/icons";
import { SplitFlap, BoardRow } from "./components/Board";
import { initAnalytics, pageview, track } from "./analytics";

/**
 * Mirrors DEFAULT_SORT in server/src/positions.ts. Kept here too so the first
 * request for a tab asks for the ordering it is about to display, rather than
 * fetching one ordering and immediately refetching another.
 */
const DEFAULT_POSITION_SORT: Record<PositionMode, { key: PositionSortKey; dir: SortDir }> = {
  open: { key: "value", dir: "desc" },
  resolved: { key: "lastTradeAt", dir: "desc" },
  all: { key: "lastTradeAt", dir: "desc" },
};

/** Hash routes reported to analytics as real paths — see analytics.ts. */
const ANALYTICS_PATH: Record<Route, string> = {
  home: "/",
  leaderboard: "/leaderboard",
  watchlist: "/watchlist",
  smart: "/smart-money",
  compare: "/compare",
};

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

// Board rows, not feature cards. Each one is a claim the product can actually
// substantiate the moment a wallet lands on the board.
const FEATURES = [
  {
    title: "Real win rate",
    body: "Reconstructed from a wallet's full trade history, not just whatever positions happen to be open. A trader who sold out at a loss last month still carries that loss here.",
  },
  {
    title: "Complete P&L & volume",
    body: "Canonical all-time profit, today's P&L and lifetime volume, straight from Polymarket's own record.",
  },
  {
    title: "Every position & metric",
    body: "Open and resolved bets with entry dates, plus a dozen derived stats and charts you can sort by any column.",
  },
];

export default function App() {
  const [stats, setStats] = useState<TraderStats | null>(null);
  // Tier 1: canonical figures + open positions, back in ~1s. Rendered while the
  // full history walk is still running, then superseded by it.
  const [quick, setQuick] = useState<TraderSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [tab, setTab] = useState<"all" | "open" | "resolved">("all");
  const [watch, setWatch] = useState<WatchlistState | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [billing, setBilling] = useState<BillingConfig>({ enabled: false, price: 10 });
  const [flash, setFlash] = useState<string | null>(null);
  const { route, trader } = useHashRoute();
  const lastLookedUp = useRef<string | null>(null);
  // Wallet the visitor tried to track while signed out — tracked for them as
  // soon as they authenticate, so the click isn't silently thrown away.
  const pendingTrack = useRef<string | null>(null);

  const refreshWatch = () =>
    getWatchlist()
      .then(setWatch)
      .catch((e) => console.warn("watchlist:", e instanceof Error ? e.message : e));

  useEffect(() => {
    initAnalytics();
    refreshWatch();
    fetchMe().then(setUser).catch(() => {});
    getBillingConfig().then(setBilling).catch(() => {});

    // Returning from the NOWPayments invoice (?checkout=success|cancel lives in the hash).
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

  async function onAuthed(u: AuthUser) {
    setUser(u);
    setAuthOpen(false);
    // The modal handles both register and login, and doesn't report which, so
    // this is deliberately the generic event rather than a guessed sign_up.
    track("login", { had_pending_track: Boolean(pendingTrack.current) });

    const pending = pendingTrack.current;
    pendingTrack.current = null;
    if (!pending) {
      refreshWatch(); // now resolves to the account (anonymous list was merged in)
      return;
    }
    // Finish what they were doing before we interrupted them to sign in.
    const res = await addWatch(pending);
    if (res.state) setWatch(res.state);
    if (res.ok) setFlash("Signed in — now tracking that wallet.");
    else setFlash(res.error ?? "Signed in, but that wallet couldn't be tracked.");
  }

  function closeAuth() {
    pendingTrack.current = null; // they backed out; don't track on a later sign-in
    setAuthOpen(false);
  }
  function signOut() {
    apiLogout();
    setUser(null);
    refreshWatch();
  }

  async function lookup(addr: string, refresh = false) {
    setLoading(true);
    setError(null);
    setQuick(null);
    setStats(null);
    // The core action. Kept as an event rather than a URL so the wallet can be
    // aggregated instead of shredding page reports into one row per address.
    track("wallet_lookup", { wallet: addr.toLowerCase(), refresh });

    // Both go out at once. The summary needs no trade-history paging and lands
    // in about a second; the full lookup can take 30s on an unindexed wallet.
    // Whichever arrives first renders, and the full one always wins.
    let settled = false;
    fetchTraderSummary(addr)
      .then((s) => {
        // Ignore a late summary — the full stats already supersede it, and a
        // stale write here would flicker the page backwards.
        if (!settled && lastLookedUp.current === addr) setQuick(s);
      })
      .catch(() => {
        /* tier 1 is an accelerator; its failure must not break the lookup */
      });

    try {
      const res = await fetchTrader(addr, refresh);
      settled = true;
      if (lastLookedUp.current !== addr) return; // navigated away mid-flight
      setStats(res.stats);
      setCached(res.cached);
      setIndexing(Boolean(res.indexing));
      const name = res.stats.profile.name || res.stats.profile.pseudonym || shortAddr(addr);
      pushRecent(addr, name);
    } catch (e) {
      settled = true;
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStats(null);
    } finally {
      setLoading(false);
    }
  }

  // One page_view per route change. Without this GA sees a single URL for the
  // entire app, because the hash never reaches location.pathname.
  useEffect(() => {
    const path = trader ? "/trader" : ANALYTICS_PATH[route];
    pageview(path);
  }, [route, trader]);

  // URL is the source of truth for which trader is shown.
  useEffect(() => {
    if (route !== "home") return;
    if (!trader) {
      setStats(null);
      setQuick(null);
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
    // Tracking needs an account. Ask up front rather than round-tripping to a
    // 401 the caller would have to translate anyway.
    if (!user) {
      pendingTrack.current = addr.toLowerCase();
      setAuthOpen(true);
      return { ok: false, authRequired: true, error: "Sign in to track a wallet." };
    }
    const res = await addWatch(addr);
    if (res.ok) track("add_to_watchlist", { wallet: addr.toLowerCase() });
    else if (res.upgradeRequired) track("watchlist_limit_hit", { plan: watch?.plan });
    if (res.state) setWatch(res.state);
    // Token expired or was revoked server-side — same prompt, same recovery.
    if (!res.ok && res.authRequired) {
      pendingTrack.current = addr.toLowerCase();
      setUser(null);
      setAuthOpen(true);
    }
    return res;
  }
  async function removeTrader(addr: string) {
    try {
      setWatch(await removeWatch(addr));
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Could not stop tracking that wallet.");
    }
  }
  async function upgradePlan() {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (billing.enabled) {
      try {
        // Fired before the redirect: once we hand off to NOWPayments the page
        // is gone, and an event queued after this line would never send.
        track("begin_checkout", { value: billing.price, currency: "USD" });
        window.location.href = await startCheckout(); // NOWPayments hosted invoice
      } catch (e) {
        setFlash(e instanceof Error ? e.message : "Could not start checkout.");
      }
      return;
    }
    if (!billing.devStub) {
      // Deployed without a payment provider — the local plan shortcut is off.
      setFlash("Upgrades aren't available yet — crypto checkout isn't configured on this deployment.");
      return;
    }
    // Local development only: flip the plan directly so the higher cap is visible.
    try {
      setWatch(await setPlan("pro"));
      setUser({ ...user, plan: "pro" });
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Could not change your plan.");
    }
  }
  const isTracked = (addr: string) => !!watch?.entries.some((e) => e.address === addr.toLowerCase());

  // The rail cannot carry five plates plus the account control under ~640px,
  // so below that the nav collapses to one lever and drops as board rows.
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);
  // Any route change closes it, browser-back included.
  useEffect(() => setMenuOpen(false), [route, trader]);

  const navTo = (r: Route) => {
    setMenuOpen(false);
    goTo(r);
  };

  const onHome = route === "home";
  const showHero = onHome && !trader;
  const isPro = watch?.plan === "pro";

  // Sorting and paging now happen on the server, so this holds the current page
  // rather than the whole list. A wallet with 7,000 positions used to arrive in
  // one 4 MB response so the table could show twenty of them.
  const [posPage, setPosPageData] = useState<PositionPage | null>(null);
  const [posLoading, setPosLoading] = useState(false);
  const [posSort, setPosSort] = useState<{ key: PositionSortKey; dir: SortDir }>(
    DEFAULT_POSITION_SORT.all
  );
  const [posPageNum, setPosPageNum] = useState(0);

  // Each tab carries its own sensible default, and changing tab starts at page 1.
  useEffect(() => {
    setPosSort(DEFAULT_POSITION_SORT[tab]);
    setPosPageNum(0);
  }, [tab]);

  // Re-sorting always returns to the first page — page 4 of a different ordering
  // is a different set of rows, and staying there would look like a glitch.
  const onSortPositions = (key: PositionSortKey) => {
    setPosSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "desc" ? "asc" : "desc" }
        : // First click on a new column: dates and money read newest/biggest
          // first, names read A–Z.
          { key, dir: key === "title" ? "asc" : "desc" }
    );
    setPosPageNum(0);
  };

  const setPosPage = (page: number) => setPosPageNum(page);

  // Fetch whenever the wallet, tab, sort or page changes. Aborts the previous
  // request so quickly clicking through pages can't land them out of order.
  useEffect(() => {
    if (!stats) {
      setPosPageData(null);
      return;
    }
    const ctrl = new AbortController();
    setPosLoading(true);
    fetchPositions(
      stats.address,
      { mode: tab, sort: posSort.key, dir: posSort.dir, page: posPageNum },
      ctrl.signal
    )
      .then((p) => setPosPageData(p))
      .catch((e) => {
        if (e instanceof Error && e.name !== "AbortError") console.warn("positions:", e.message);
      })
      .finally(() => setPosLoading(false));
    return () => ctrl.abort();
  }, [stats, tab, posSort, posPageNum]);

  return (
    <>
      <div className="bg-ambient" />
      <div className="bg-grain" />

      {/* Nav */}
      {/* The top rail. Opaque steel sitting proud of the chassis — not a
          translucent bar, which would put glass back in a world that has none. */}
      <header className="rail sticky top-0 z-40 border-b border-board-rule">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <button
            onClick={() => navTo("home")}
            aria-label="Whole Record home"
            className="group flex min-w-0 items-center gap-2.5"
          >
            <span className="shrink-0 border border-bone/35 px-[7px] py-[3px] font-display text-[11px] font-bold uppercase leading-none tracking-plate text-bone transition group-hover:border-lamp group-hover:text-lamp">
              WR
            </span>
            {/* Three characters longer than the old mark, and at 342px the rail
                also carries the account control and the menu lever — so the
                wordmark steps down rather than pushing them off the edge. */}
            <span className="whitespace-nowrap font-display text-[12px] font-bold uppercase leading-none tracking-[0.08em] text-bone min-[400px]:text-[13px] sm:text-[15px] sm:tracking-plate">
              Whole Record
            </span>
          </button>

          <div className="flex items-center gap-1.5">
            <nav className="hidden items-center gap-0.5 text-sm sm:flex">
              <NavLink icon={<SearchIcon className="h-4 w-4" />} label="Tracker" active={onHome} onClick={() => navTo("home")} />
              <NavLink icon={<TrophyIcon className="h-4 w-4" />} label="Leaderboard" active={route === "leaderboard"} onClick={() => navTo("leaderboard")} />
              <NavLink icon={<BoltIcon className="h-4 w-4" />} label="Smart money" active={route === "smart"} onClick={() => navTo("smart")} pro={!isPro} />
              <NavLink icon={<ColumnsIcon className="h-4 w-4" />} label="Compare" active={route === "compare"} onClick={() => navTo("compare")} pro={!isPro} />
              <NavLink icon={<StarIcon className="h-4 w-4" />} label="My Traders" active={route === "watchlist"} onClick={() => navTo("watchlist")} badge={watch && watch.count > 0 ? watch.count : undefined} />
            </nav>
            <span className="mx-1 hidden h-5 w-px bg-board-rule sm:block" />
            <AccountControl user={user} onSignIn={() => setAuthOpen(true)} onSignOut={signOut} />
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="rail-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              className="ml-0.5 grid h-9 w-9 shrink-0 place-items-center border border-board-rule text-bone transition hover:border-lamp hover:text-lamp sm:hidden"
            >
              {menuOpen ? <XIcon className="h-4 w-4" /> : <MenuIcon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Departure rows dropped from the rail. Same grammar as the page, so
            the menu is part of the board rather than an overlay on top of it. */}
        {menuOpen && (
          <nav id="rail-menu" className="chassis border-t border-board-rule sm:hidden">
            <MenuRow icon={<SearchIcon className="h-4 w-4" />} label="Tracker" active={onHome} onClick={() => navTo("home")} />
            <MenuRow icon={<TrophyIcon className="h-4 w-4" />} label="Leaderboard" active={route === "leaderboard"} onClick={() => navTo("leaderboard")} />
            <MenuRow icon={<BoltIcon className="h-4 w-4" />} label="Smart money" active={route === "smart"} onClick={() => navTo("smart")} pro={!isPro} />
            <MenuRow icon={<ColumnsIcon className="h-4 w-4" />} label="Compare" active={route === "compare"} onClick={() => navTo("compare")} pro={!isPro} />
            <MenuRow icon={<StarIcon className="h-4 w-4" />} label="My Traders" active={route === "watchlist"} onClick={() => navTo("watchlist")} badge={watch && watch.count > 0 ? watch.count : undefined} />
          </nav>
        )}
      </header>

      {authOpen && <AuthModal onClose={closeAuth} onAuthed={onAuthed} />}

      {flash && (
        <div className="rail fixed bottom-5 left-1/2 z-50 -translate-x-1/2 animate-fadeUp border border-board-rule px-4 py-2.5 text-sm text-slate-100 shadow-elevated">
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
          <Watchlist
            state={watch}
            signedIn={!!user}
            onSignIn={() => setAuthOpen(true)}
            onAdd={addTrader}
            onRemove={removeTrader}
            onUpgrade={upgradePlan}
            onSelect={selectTrader}
          />
        )}

        {onHome && (
          <>
            <section className={showHero ? "pt-6 sm:pt-10" : "pt-8"}>
              {showHero ? (
                /* The board itself: a slab mounted on the wall of the concourse,
                   bleeding to the gutter on phones and framed on desktop. */
                <div className="chassis chassis-lit relative -mx-4 overflow-hidden border-y border-board-rule px-5 py-12 sm:mx-0 sm:border sm:px-10 sm:py-16 lg:px-14 lg:py-20">
                  <div className="relative">
                    <h1 className="max-w-[15ch] font-display text-[clamp(2.4rem,8.2vw,5rem)] font-bold uppercase leading-[0.9] tracking-[-0.035em] text-bone">
                      Who is actually good?
                    </h1>
                    <p className="mt-6 max-w-[54ch] text-[15px] leading-relaxed text-bone-dim sm:text-base">
                      Polymarket publishes profit, and profit hides one lucky
                      resolution. Paste a wallet and the board settles on the whole
                      record — every trade, including the ones already closed.
                    </p>

                    <div className="mt-9 flex max-w-2xl">
                      <SearchBox onPick={selectTrader} loading={loading} />
                    </div>

                    <div className="mt-11 border-t border-board-rule pt-7 sm:mt-14">
                      <SplitFlap text="THE WHOLE RECORD" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative flex max-w-full">
                  <SearchBox onPick={selectTrader} loading={loading} />
                </div>
              )}
            </section>

            {error && (
              <div className="mx-auto mt-6 max-w-2xl rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            {loading && !stats && !quick && <ResultsSkeleton />}

            {quick && !stats && !error && (
              <QuickView
                quick={quick}
                tracked={isTracked(quick.address)}
                onTrack={addTrader}
                onNeedUpgrade={() => goTo("watchlist")}
              />
            )}

            {stats && !error && (
              <section className="animate-fadeUp mt-8 space-y-6 pb-16">
                {/* No background backfill exists any more, so this is a
                    permanent property of very active wallets, not a wait. */}
                {indexing && (
                  <div className="flex items-center gap-2 border border-premium/40 bg-premium/10 px-4 py-2.5 text-sm text-premium">
                    <span className="h-1.5 w-1.5 rounded-full bg-premium" />
                    This wallet has more history than one read can cover — figures below
                    are based on its most recent {stats.totalTrades.toLocaleString()} trades.
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
                  <StatCard label="Win Rate" value={pct(stats.winRate)} sub={`${stats.wins}W / ${stats.losses}L of ${stats.resolvedCount} closed`} />
                  <StatCard label="Total Trades" value={`${stats.totalTrades.toLocaleString()}${stats.tradesCapped ? "+" : ""}`} sub={`${usd(stats.totalVolume)} vol · since ${tradeSince(stats.firstTradeAt)}`} />
                  <StatCard label="Portfolio Value" value={usd(stats.portfolioValue)} sub={`${stats.openPositionsCount} open positions`} />
                </div>

                <ActivityCalendar key={`cal-${stats.address}`} daily={stats.dailySeries} />

                <DetailsPanel stats={stats} />

                <div className="glass rounded-2xl p-1.5">
                  <div className="flex gap-1 px-2 pt-1.5">
                    <TabButton active={tab === "all"} onClick={() => setTab("all")}>
                      All ({stats.openPositionsCount + stats.resolvedCount})
                    </TabButton>
                    <TabButton active={tab === "open"} onClick={() => setTab("open")}>
                      Open ({stats.openPositionsCount})
                    </TabButton>
                    {/* "Closed" covers both markets that resolved on-chain and
                        ones the wallet sold out of early — see PositionView.exitType. */}
                    <TabButton active={tab === "resolved"} onClick={() => setTab("resolved")}>
                      Closed ({stats.resolvedCount})
                    </TabButton>
                  </div>
                  <div className="px-3 pb-2">
                    <PositionsTable
                      positions={posPage?.positions ?? []}
                      mode={tab}
                      total={
                        posPage?.total ??
                        (tab === "open"
                          ? stats.openPositionsCount
                          : tab === "resolved"
                          ? stats.resolvedCount
                          : stats.openPositionsCount + stats.resolvedCount)
                      }
                      page={posPage?.page ?? 0}
                      pageSize={posPage?.pageSize ?? 20}
                      sort={posSort.key}
                      dir={posSort.dir}
                      loading={posLoading}
                      onPage={setPosPage}
                      onSort={onSortPositions}
                    />
                  </div>
                </div>

                <p className="text-right text-xs text-muted">
                  Open positions value {usdFull(stats.openPositionsValue)} · {cached ? "cached" : "fresh"} · updated {new Date(stats.lastUpdated).toLocaleString()}
                </p>
              </section>
            )}

            {showHero && (
              /* Departure-board rows, not a card grid. The rule and the lamp
                 carry the structure; nothing here is a container. */
              <section className="mt-20 pb-24 sm:mt-24">
                <h2 className="font-display text-[12px] font-bold uppercase tracking-plate text-bone-dim">
                  What the board reads
                </h2>
                <div className="mt-5 border-b border-board-rule">
                  {FEATURES.map((f) => (
                    <BoardRow key={f.title} label={f.title}>
                      {f.body}
                    </BoardRow>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* Bottom rail, engraved. */}
      <footer className="rail border-t border-board-rule">
        <div className="mx-auto max-w-7xl px-4 py-7">
          <p className="font-display text-[10px] font-medium uppercase tracking-plate text-bone-dim sm:text-[11px]">
            Whole Record · Data from Polymarket's public API · Informational only
          </p>
        </div>
      </footer>
    </>
  );
}

/**
 * Tier 1 view — rendered while the history walk is still running.
 *
 * Every figure shown is canonical Polymarket data. Win rate and trade count
 * are aggregates over a wallet's whole history, so they appear as pending
 * rather than estimated from a partial read: a win rate sampled from recent
 * trades is not an approximation, it is a wrong number.
 */
function QuickView({
  quick,
  tracked,
  onTrack,
  onNeedUpgrade,
}: {
  quick: TraderSummary;
  tracked: boolean;
  onTrack: (addr: string) => Promise<AddWatchResult>;
  onNeedUpgrade: () => void;
}) {
  const open = quick.openPositions ?? [];
  return (
    <section className="animate-fadeUp mt-8 space-y-6 pb-16">
      <div className="flex items-center gap-2 border border-board-rule bg-lamp/[0.07] px-4 py-2.5 text-sm text-lamp">
        <span className="h-1.5 w-1.5 animate-filament rounded-full bg-lamp" />
        Reading the full trade history — win rate and totals are still settling.
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <TraderHeader stats={{ address: quick.address, profile: quick.profile }} />
        <TrackButton
          address={quick.address}
          tracked={tracked}
          onAdd={onTrack}
          onNeedUpgrade={onNeedUpgrade}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Total P&L"
          value={`${quick.totalProfit >= 0 ? "+" : ""}${usd(quick.totalProfit)}`}
          valueClass={pnlColor(quick.totalProfit)}
          sub={`Today ${quick.profitToday >= 0 ? "+" : ""}${usd(quick.profitToday)}`}
        />
        <StatCard label="Win Rate" value="—" sub="Reading history…" />
        <StatCard label="Total Trades" value="—" sub={`${usd(quick.totalVolume)} volume`} />
        <StatCard
          label="Portfolio Value"
          value={usd(quick.portfolioValue)}
          sub={`${quick.openPositionsCount ?? open.length} open positions`}
        />
      </div>

      {open.length > 0 && (
        <div className="glass rounded-2xl p-4">
          <h3 className="mb-2 font-display text-[12px] font-bold uppercase tracking-plate text-bone-dim">
            Biggest open positions
          </h3>
          {/* A read-only preview of the top few by value — deliberately not the
              sortable table. This view exists for the second or two before the
              full stats land, and paging it would mean firing requests at a
              wallet that is about to be replaced by the real one. */}
          <ul className="divide-y divide-board-rule">
            {open.map((p) => (
              <li
                key={p.conditionId + p.outcome}
                className="flex items-center gap-3 py-2.5 text-sm"
              >
                {p.icon && (
                  <img src={p.icon} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
                )}
                <span className="line-clamp-1 flex-1 text-slate-200">{p.title}</span>
                <span className="shrink-0 text-xs uppercase tracking-wider text-muted">
                  {p.outcome}
                </span>
                <span className="shrink-0 font-mono tabular-nums text-slate-300">
                  {usdFull(p.currentValue)}
                </span>
              </li>
            ))}
          </ul>
          {(quick.openPositionsCount ?? 0) > open.length && (
            <p className="pt-2 text-xs text-muted">
              Showing the top {open.length} of {quick.openPositionsCount}. The full,
              sortable list arrives with the complete history.
            </p>
          )}
        </div>
      )}
    </section>
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
      <p className="text-center text-xs text-muted">
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
        className="border border-board-rule px-3 py-1.5 font-display text-[11px] font-bold uppercase tracking-plate text-bone transition hover:border-lamp hover:text-lamp"
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
        className="grid h-8 w-8 place-items-center bg-lamp font-display text-[13px] font-bold text-board"
        title={user.email}
      >
        {initial}
      </button>
      {open && (
        <div className="chassis absolute right-0 z-50 mt-1 w-56 overflow-hidden border border-board-rule shadow-elevated">
          <div className="border-b border-board-rule px-4 py-3">
            <div className="truncate text-sm font-medium text-slate-100">{user.name || "Account"}</div>
            <div className="truncate text-xs text-muted">{user.email}</div>
            <span
              className={`mt-2 inline-block px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-plate ${
                user.plan === "pro" ? "bg-premium/20 text-premium" : "bg-bone/[0.07] text-bone-dim"
              }`}
            >
              {user.plan} plan
            </span>
            {user.plan === "pro" && user.proExpiresAt && (
              <div className="mt-1.5 text-[11px] text-muted">
                Pro until {new Date(user.proExpiresAt).toLocaleDateString()}
              </div>
            )}
          </div>
          <button
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="w-full px-4 py-2.5 text-left text-sm text-slate-300 transition hover:bg-lamp/10 hover:text-bone"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/* One row of the dropped menu. Full-width, hairline-separated, 48px+ tall so
   it clears the touch-target floor the icon-only rail could not. */
function MenuRow({
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
      aria-current={active ? "page" : undefined}
      className={`flex w-full items-center gap-3 border-b border-board-rule px-4 py-4 text-left font-display text-[12px] font-bold uppercase tracking-plate transition last:border-b-0 ${
        active ? "bg-lamp/15 text-lamp" : "text-bone-dim hover:bg-bone/[0.06] hover:text-bone"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      {pro && (
        <span className="border border-premium/40 px-1 text-[9px] font-bold uppercase leading-[1.4] tracking-plate text-premium">
          Pro
        </span>
      )}
      {badge !== undefined && (
        <span className="bg-lamp px-1.5 font-mono text-[10px] font-bold leading-[1.5] text-board">
          {badge}
        </span>
      )}
    </button>
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
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 font-display text-[11px] font-bold uppercase tracking-plate transition sm:px-3 ${
        active
          ? "bg-lamp/15 text-lamp"
          : "text-bone-dim hover:bg-bone/[0.06] hover:text-bone"
      }`}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
      {pro && (
        <span className="border border-premium/40 px-1 text-[9px] font-bold uppercase leading-[1.4] tracking-plate text-premium">
          Pro
        </span>
      )}
      {badge !== undefined && (
        <span className="bg-lamp px-1.5 font-mono text-[10px] font-bold leading-[1.5] text-board">
          {badge}
        </span>
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
