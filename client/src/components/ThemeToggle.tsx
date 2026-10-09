import { useEffect, useState } from "react";
import { apply, current, preferred, save, stored, type Theme } from "../theme";
import { LampOffIcon, LampOnIcon } from "./icons";

/**
 * Switches the board between its two lightings.
 *
 * The icon shows the lamp in its *current* state rather than the state the
 * click would produce — a lit filament when the lamps are on, a dead one when
 * they are not. The label carries the action, so nothing depends on reading
 * the metaphor the right way round.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document === "undefined" ? "dark" : current()
  );

  // The pre-paint script in index.html has already applied the right theme, so
  // this only reconciles React's copy of it with the DOM.
  useEffect(() => setTheme(current()), []);

  // Follow the OS while the visitor has never chosen for themselves. Once they
  // have, their choice outranks it and this stops mattering.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if (stored()) return;
      const next = preferred();
      apply(next);
      setTheme(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const flip = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    apply(next);
    save(next);
    setTheme(next);
  };

  const lit = theme === "dark"; // the lamps are on at night
  return (
    <button
      onClick={flip}
      aria-label={lit ? "Switch to daylight" : "Switch to lamplight"}
      title={lit ? "Daylight" : "Lamplight"}
      className={`grid h-8 w-8 place-items-center border border-board-rule text-bone-dim transition hover:border-lamp hover:text-lamp ${className}`}
    >
      {lit ? <LampOnIcon className="h-4 w-4" /> : <LampOffIcon className="h-4 w-4" />}
    </button>
  );
}
