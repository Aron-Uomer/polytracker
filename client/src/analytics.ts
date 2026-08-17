/**
 * Google Analytics 4.
 *
 * Everything here is a no-op unless VITE_GA_ID is set, so local development and
 * anyone self-hosting never load a tracking script or set a cookie.
 *
 * The one thing this file exists to solve: the app uses hash routing, so
 * `location.pathname` is always "/" no matter where the visitor is. Left to its
 * own devices GA would record the landing page, the leaderboard and every
 * trader page as a single URL. Each route therefore reports a synthetic path.
 */

const GA_ID = import.meta.env.VITE_GA_ID as string | undefined;

// Never report from a dev server, even if the id is present in .env.local —
// otherwise local clicking pollutes the same property as real traffic.
const ENABLED = Boolean(GA_ID) && !import.meta.env.DEV;

type GtagArgs =
  | ["js", Date]
  | ["config", string, Record<string, unknown>?]
  | ["event", string, Record<string, unknown>?];

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: GtagArgs) => void;
  }
}

let started = false;

/** Inject gtag.js once. Safe to call repeatedly. */
export function initAnalytics(): void {
  if (!ENABLED || started || typeof document === "undefined") return;
  started = true;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: GtagArgs) {
    window.dataLayer!.push(args);
  };

  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);

  window.gtag("js", new Date());
  // send_page_view is off: the initial view is sent by pageview() below, with a
  // real path rather than the bare "/" this router always reports.
  window.gtag("config", GA_ID!, { send_page_view: false });
}

/**
 * Record a view of a synthetic path, e.g. "/trader" or "/leaderboard".
 *
 * Wallet addresses are deliberately kept out of the path. They would give every
 * lookup its own URL and shred the page reports into thousands of one-visit
 * rows; the address travels on the wallet_lookup event instead, where it can be
 * aggregated.
 */
export function pageview(path: string, title?: string): void {
  if (!ENABLED || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: `${window.location.origin}${path}`,
    page_title: title ?? document.title,
  });
}

/** Record a named action. Silent when analytics is disabled. */
export function track(event: string, params: Record<string, unknown> = {}): void {
  if (!ENABLED || !window.gtag) return;
  window.gtag("event", event, params);
}
