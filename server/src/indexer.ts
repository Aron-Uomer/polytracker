import type { PrismaClient } from "@prisma/client";
import {
  createActivityAggregator,
  fetchActivityPage,
  type ActivityStats,
  type PmActivity,
} from "./polymarket.js";

// How long a single indexing pass may run before yielding. Whales won't fully
// index in one pass; each subsequent lookup continues the backfill.
const INDEX_BUDGET_MS = Number(process.env.INDEX_BUDGET_MS ?? 20000);
const PAGE = 500;

/** Deterministic id so re-seeing the same event is a no-op (dedup key). */
function eventId(address: string, e: PmActivity): string {
  return `${address}|${e.transactionHash}|${e.asset}|${e.type}|${e.side ?? ""}|${e.timestamp}|${e.size}`;
}

function toRow(address: string, e: PmActivity) {
  return {
    id: eventId(address, e),
    address,
    txHash: e.transactionHash ?? "",
    timestamp: e.timestamp,
    type: e.type,
    side: e.side ?? "",
    conditionId: e.conditionId,
    asset: e.asset ?? "",
    size: e.size ?? 0,
    usdcSize: e.usdcSize ?? 0,
    price: e.price ?? 0,
    title: e.title ?? "",
    slug: e.slug ?? "",
    icon: e.icon ?? "",
  };
}

type TradeRow = ReturnType<typeof toRow>;

function rowToEvent(t: TradeRow): PmActivity {
  return {
    proxyWallet: t.address,
    timestamp: t.timestamp,
    conditionId: t.conditionId,
    type: t.type,
    size: t.size,
    usdcSize: t.usdcSize,
    transactionHash: t.txHash,
    price: t.price,
    asset: t.asset,
    side: (t.side || undefined) as PmActivity["side"],
    outcome: "",
    outcomeIndex: 0,
    title: t.title,
    slug: t.slug,
    icon: t.icon,
  };
}

async function insert(prisma: PrismaClient, address: string, events: PmActivity[]): Promise<number> {
  if (events.length === 0) return 0;
  const data = events.map((e) => toRow(address, e));
  const res = await prisma.trade.createMany({ data, skipDuplicates: true });
  return res.count;
}

export interface IndexState {
  newestTs: number | null;
  oldestTs: number | null;
  complete: boolean;
  inserted: number;
}

/**
 * Incrementally ingest a wallet's /activity into the Trade table.
 *  - Forward fill: pull events newer than what we have (cheap on refresh).
 *  - Backward fill: keep walking older until we reach the wallet's first trade
 *    (`complete`) or the time budget is hit. Resumes where it left off next time.
 */
export async function indexWallet(
  prisma: PrismaClient,
  address: string,
  budgetMs = INDEX_BUDGET_MS
): Promise<IndexState> {
  const user = address.toLowerCase();
  const trader = await prisma.trader.findUnique({
    where: { address: user },
    select: { idxNewestTs: true, idxOldestTs: true, idxComplete: true },
  });
  let complete = trader?.idxComplete ?? false;
  const knownNewest = trader?.idxNewestTs ?? null;
  const startedAt = Date.now();
  let inserted = 0;
  const overBudget = () => Date.now() - startedAt > budgetMs;

  // FORWARD FILL — only new activity since the last index.
  if (knownNewest != null) {
    let end: number | undefined;
    for (;;) {
      const page = await fetchActivityPage(user, end);
      if (page.length === 0) break;
      inserted += await insert(
        prisma,
        user,
        page.filter((a) => a.timestamp > knownNewest)
      );
      const minTs = Math.min(...page.map((a) => a.timestamp));
      if (minTs <= knownNewest || page.length < PAGE || minTs === end) break;
      end = minTs;
      if (overBudget()) break;
    }
  }

  // BACKWARD FILL — continue toward the wallet's first trade (also the initial fill).
  if (!complete) {
    let end: number | undefined = trader?.idxOldestTs ?? undefined;
    for (;;) {
      const page = await fetchActivityPage(user, end);
      if (page.length === 0) {
        complete = true;
        break;
      }
      inserted += await insert(prisma, user, page);
      const minTs = Math.min(...page.map((a) => a.timestamp));
      if (page.length < PAGE || minTs === end) {
        complete = true;
        break;
      }
      end = minTs;
      if (overBudget()) break;
    }
  }

  const range = await prisma.trade.aggregate({
    where: { address: user },
    _max: { timestamp: true },
    _min: { timestamp: true },
  });

  return {
    newestTs: range._max.timestamp ?? null,
    oldestTs: range._min.timestamp ?? null,
    complete,
    inserted,
  };
}

/** How many Trade rows to hold in memory at once while aggregating. */
const READ_BATCH = Number(process.env.INDEX_READ_BATCH ?? 5000);

/**
 * Build the activity aggregation from indexed Trade rows (exact + instant).
 *
 * Read in cursor-paged batches and folded into the aggregator as we go: a
 * 50k-trade whale would otherwise materialise its entire history in memory on
 * every cache miss. Rows are unique by primary key, so dedup is off.
 */
export async function getActivityStatsFromDb(
  prisma: PrismaClient,
  address: string,
  complete: boolean
): Promise<ActivityStats> {
  const user = address.toLowerCase();
  const agg = createActivityAggregator({ dedupe: false });

  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.trade.findMany({
      where: { address: user },
      // id breaks ties so the cursor is stable when trades share a timestamp.
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      take: READ_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;
    agg.push(rows.map(rowToEvent));
    if (rows.length < READ_BATCH) break;
    cursor = rows[rows.length - 1].id;
  }

  // capped = history isn't fully indexed yet (whale mid-backfill).
  return agg.finish({ capped: !complete });
}
