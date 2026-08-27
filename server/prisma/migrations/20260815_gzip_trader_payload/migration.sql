-- Store the cached trader payload gzipped.
--
-- Reading this column is the entire database-egress cost of a trader lookup:
-- nothing else reads the Trader table.
--
-- It was `json`. Postgres compresses that on disk, so the column measured about
-- 1.4 MB — but JSON is decompressed before it is sent, so every cache hit pulled
-- the full 4.0 MB of text across the network. Storing gzipped bytes makes what
-- is stored the same as what is transferred: 825 KB for the same wallet.
--
-- The column is dropped and recreated rather than converted. It is a cache with
-- a five-minute lifetime, so nothing of value is lost — the next lookup of any
-- wallet simply recomputes and repopulates it. Rows are kept so the timestamps
-- and headline columns survive.

ALTER TABLE "Trader" DROP COLUMN "payload";
ALTER TABLE "Trader" ADD COLUMN "payload" BYTEA NOT NULL DEFAULT '\x';

-- Every existing row now holds an empty payload, which would deserialise to
-- nothing. Expire them so the cache check treats them as stale and recomputes
-- rather than serving an empty body.
UPDATE "Trader" SET "lastFetchedAt" = to_timestamp(0);

-- The default existed only to satisfy NOT NULL while backfilling.
ALTER TABLE "Trader" ALTER COLUMN "payload" DROP DEFAULT;
