/**
 * The two lightings.
 *
 * Dark is the designed default — the board at night under its own lamps — so
 * it is what `:root` carries in index.css and what an unmarked document shows.
 * Light is applied by stamping `data-theme="light"` on <html>; every colour
 * token is a CSS variable, so the whole interior re-lights without a single
 * component knowing a theme exists.
 *
 * Choice is sticky and explicit. A visitor who has never chosen gets dark,
 * not their OS preference: this is a dark-first design, and silently serving
 * light to the majority of machines (which report `prefers-color-scheme:
 * light` by default) would make the unchosen state the wrong one. The system
 * preference is still honoured as the *initial* value only if the visitor has
 * expressed one by setting their OS to dark — see `preferred()`.
 */

export type Theme = "dark" | "light";

const KEY = "wr_theme";

/** What the OS asks for, when it asks for anything. */
function systemPrefersLight(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  );
}

export function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    // Storage can throw outright in private modes. A visitor without it keeps
    // working, they just start from the default on every load.
    return null;
  }
}

/** The theme to start in: an explicit past choice, else the OS, else dark. */
export function preferred(): Theme {
  return stored() ?? (systemPrefersLight() ? "light" : "dark");
}

/**
 * Put a theme on the document. Only light is stamped — dark is the absence of
 * the attribute, which is what lets the pre-paint script in index.html be a
 * single line and what keeps the default flash-free.
 */
export function apply(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "light") root.setAttribute("data-theme", "light");
  else root.removeAttribute("data-theme");

  // The browser UI around the page should match the board it frames.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#EFEADE" : "#14150F");
}

export function save(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* unavailable storage is not worth failing a click over */
  }
}

export function current(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}
