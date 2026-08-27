/**
 * A tiny in-process cache with a time limit and a size limit.
 *
 * Sits in front of the database cache. A hit here costs no database round trip
 * and no data transfer at all, which matters because reading a cached trader
 * payload is the single largest source of database egress in this app.
 *
 * Capped by entry count rather than bytes, because measuring the size of every
 * value would cost more than it saves. Pick the cap with the value size in
 * mind: a trader payload can reach 1.4 MB in memory, so 25 of those is about
 * 35 MB on a 512 MB instance.
 *
 * Not a substitute for the database cache. On a host that sleeps when idle the
 * process restarts often and this starts empty each time; it absorbs the
 * repeats inside one wake window, which is where most of them happen.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { at: number; value: T }>();

  constructor(private readonly ttlMs: number, private readonly max: number) {}

  get(key: string): T | null {
    const hit = this.entries.get(key);
    if (!hit) return null;

    if (Date.now() - hit.at >= this.ttlMs) {
      this.entries.delete(key);
      return null;
    }

    // Re-insert so this key becomes the most recently used. Map iterates in
    // insertion order, which is what makes the eviction below least-recently-used.
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, { at: Date.now(), value });
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  /** Diagnostics. */
  get size(): number {
    return this.entries.size;
  }
}
