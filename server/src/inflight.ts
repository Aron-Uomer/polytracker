// Request coalescing: concurrent callers asking for the same expensive thing
// share one computation instead of each starting their own. Without this, two
// simultaneous lookups of the same cold wallet both page Polymarket from
// scratch — doubling outbound traffic for identical results.

const inflight = new Map<string, Promise<unknown>>();

export function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const run = fn().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, run);
  return run;
}

/** How many computations are currently shared (diagnostics/tests). */
export const inflightCount = () => inflight.size;
