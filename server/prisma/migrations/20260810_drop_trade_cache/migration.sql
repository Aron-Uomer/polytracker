-- Drop the trade cache and the stat-snapshot history.
--
-- Trade stored every trade of every wallet anyone ever searched, permanently:
-- 196,243 rows across just 8 wallets came to 226 MB — 94% of the database — and
-- grew without bound with every new address looked up. Stats are now computed
-- from a live, bounded read of Polymarket's activity feed on each lookup.
--
-- Nothing here is user data. Trade was derived entirely from Polymarket's
-- public feed, and StatSnapshot held only periodic copies of figures that are
-- recomputed on demand. Watchlists, users, and payments are untouched.

-- StatSnapshot first: it has a foreign key onto Trader.
DROP TABLE IF EXISTS "StatSnapshot";

DROP TABLE IF EXISTS "Trade";

-- Indexer bookkeeping describing a table that no longer exists.
ALTER TABLE "Trader" DROP COLUMN IF EXISTS "idxNewestTs";
ALTER TABLE "Trader" DROP COLUMN IF EXISTS "idxOldestTs";
ALTER TABLE "Trader" DROP COLUMN IF EXISTS "idxComplete";
ALTER TABLE "Trader" DROP COLUMN IF EXISTS "idxUpdatedAt";
