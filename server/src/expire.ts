import { withDb } from "./db.js";
import { lapsedProFilter } from "./plans.js";

/**
 * Write lapsed Pro plans back down to free.
 *
 * Entitlement itself does not depend on this. `resolvePlan` already treats a
 * lapsed Pro as free on every read, so nobody has ever kept access past their
 * expiry — every gate in the app goes through it. What this fixes is the
 * *stored* state: the plan column recorded what was granted and nothing ever
 * corrected it, so the database showed Pro users who lapsed months ago. Any
 * `WHERE plan = 'pro'` — a dashboard, a revenue count, an export, or the next
 * person to query the table without knowing the rule — overcounted.
 *
 * Two rows are deliberately left alone:
 *
 *   - `proExpiresAt IS NULL` means no expiry was ever set. `plans.ts` reads
 *     that as Pro that does not lapse (the dev-stub grant), so sweeping it to
 *     free would not be tidying the record, it would be revoking access.
 *   - Anything not on `pro` is already correct and is not rewritten, which
 *     keeps the sweep a no-op on a healthy table rather than a mass update
 *     that touches every row each hour.
 */
export async function expireLapsedPro(): Promise<number> {
  const result = await withDb((db) =>
    db.user.updateMany({
      where: lapsedProFilter(),
      data: { plan: "free" },
    })
  );
  return result?.count ?? 0;
}

/** Hourly is far finer than needed for a monthly pass, and cheap: the query
 *  matches nothing almost every time it runs. */
const SWEEP_INTERVAL_MS = 3_600_000;

/**
 * Run the sweep now, then on an interval.
 *
 * It runs at boot as well as on the timer because this host sleeps when idle:
 * a free instance can be down for hours, and an interval alone would only
 * ever fire on a process that happened to stay awake long enough. Waking up
 * is in fact the moment the table is most likely to be stale.
 */
export function startExpirySweep(intervalMs = SWEEP_INTERVAL_MS): void {
  const run = async () => {
    try {
      const count = await expireLapsedPro();
      // Silent when there is nothing to do — this runs every hour forever and
      // should not fill the log with "expired 0".
      if (count > 0) console.log(`[plans] ${count} lapsed Pro plan(s) set to free`);
    } catch (err) {
      // A failed sweep is cosmetic: reads still resolve correctly without it.
      console.warn("[plans] expiry sweep failed:", err);
    }
  };

  void run();
  // unref so a pending timer never holds the process open during shutdown.
  setInterval(run, intervalMs).unref();
}
