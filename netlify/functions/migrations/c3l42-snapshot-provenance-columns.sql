-- C3L-42: give mtg_price_snapshots a write timestamp and a source marker.
--
-- Why: the table has 19 columns and not one of them records when a row was written or
-- what wrote it. Its only temporal column, snapshot_date, is the date the price is ABOUT,
-- not when it landed. That is the exact reason Task 04 could not identify what wrote the
-- 39,515 anomalous rows of 2026-06-06 (C3L-41): there is no way to tell a row written by
-- the nightly sync from one written by a manual script or a one-off backfill, even when
-- their values differ wildly. Protocol Section 16.1's "are we capturing what will matter
-- later" applies directly, since this cannot be reconstructed after the fact.
--
-- LOCK SAFETY, per protocol Section 16.2 point 2. This table is 4,383,687 rows and
-- 1,559 MB and serves live card pages. On PostgreSQL 17, ADD COLUMN with a CONSTANT
-- default is a metadata-only change, but a VOLATILE default such as now() forces a full
-- table rewrite under an ACCESS EXCLUSIVE lock, which on 1.5 GB would be a real outage.
-- So the column is added bare first (catalog-only, effectively instant) and the default is
-- attached afterwards as a separate statement, which applies to future inserts only and
-- rewrites nothing. This also matches the task's instruction that existing rows stay NULL
-- and that this is not a backfill.
--
-- Scope note: the same gap exists on all eight Core games' snapshot tables
-- (pokemon, yugioh, lorcana, onepiece, starwars, riftbound, dbsfusionworld all confirmed
-- lacking both columns). Only mtg_price_snapshots is changed here, deliberately, per the
-- task. The rest are logged under C3L-42 rather than fixed.
--
-- ROLLBACK:
--   ALTER TABLE public.mtg_price_snapshots DROP COLUMN IF EXISTS written_at;
--   ALTER TABLE public.mtg_price_snapshots DROP COLUMN IF EXISTS source;
-- Dropping a column nothing reads is non-destructive to existing price data. No existing
-- column is altered by this migration and no row is updated.

ALTER TABLE public.mtg_price_snapshots ADD COLUMN IF NOT EXISTS written_at timestamptz;
ALTER TABLE public.mtg_price_snapshots ADD COLUMN IF NOT EXISTS source text;

-- Attached separately so no rewrite is triggered. Future inserts stamp themselves.
ALTER TABLE public.mtg_price_snapshots ALTER COLUMN written_at SET DEFAULT now();

COMMENT ON COLUMN public.mtg_price_snapshots.written_at IS
  'When this row was written. NULL for rows predating C3L-42 (5 August 2026). Distinct from snapshot_date, which is the date the price is about.';
COMMENT ON COLUMN public.mtg_price_snapshots.source IS
  'What wrote this row, for example sync-mtg-daily. NULL for rows predating C3L-42 and for any writer that does not set it.';
