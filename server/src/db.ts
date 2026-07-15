import { PrismaClient } from "@prisma/client";

/**
 * Whether a usable Postgres is configured. We reject the copy-pasted example
 * placeholder (…USER:PASSWORD@HOST/DBNAME…) so a stray DATABASE_URL doesn't try
 * to connect to a host literally named "HOST" and spam errors — in that case we
 * just run in-memory (same as leaving it blank).
 */
function computeDbEnabled(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return false;
  if (/USER:PASSWORD|@HOST[:/]|HOST\/DBNAME|username:password/i.test(url)) {
    console.warn(
      "[db] DATABASE_URL looks like the example placeholder — ignoring it and running in-memory. " +
        "Paste a real Postgres URL (e.g. from Neon) or leave it blank."
    );
    return false;
  }
  return true;
}

export const DB_ENABLED = computeDbEnabled();

// Single Prisma instance reused across hot reloads in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

let warnedNoDb = false;

/**
 * Run a database operation, returning null (and warning once) if the database
 * is unconfigured or unreachable. This lets the app run live-only — without a
 * configured Postgres — and transparently enable caching/history once a
 * DATABASE_URL is set.
 */
export async function withDb<T>(fn: (db: PrismaClient) => Promise<T>): Promise<T | null> {
  if (!DB_ENABLED) {
    if (!warnedNoDb) {
      console.warn(
        "[db] DATABASE_URL not set — running live-only (no caching or history). " +
          "Set it in server/.env to enable the database."
      );
      warnedNoDb = true;
    }
    return null;
  }
  try {
    return await fn(prisma);
  } catch (err) {
    console.warn("[db] operation failed, continuing without it:", (err as Error).message);
    return null;
  }
}
