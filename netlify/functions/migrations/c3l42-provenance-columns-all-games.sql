-- C3L-42 extension: snapshot provenance columns across ALL games, not just the Core siblings.
-- Applied to the live database on 5 August 2026 (Task 10, Angle 2).
--
-- WHY
-- C3L-42 added written_at and source to mtg_price_snapshots and confirmed the other 7 Core
-- games lacked them. Task 10 was asked to confirm whether the gap really stopped at those 7.
-- It did not. Measured directly against information_schema: 31 of the 32 *_price_snapshots
-- tables had neither column. Only mtg_price_snapshots had them, from C3L-42 itself.
-- Without written_at there is no way to tell a row that was written today from one backfilled
-- weeks later, which is exactly the question every staleness investigation in this programme
-- has had to answer by inference instead of by reading the data.
--
-- LOCK SAFETY
-- Checked before running, per the task's instruction, because some of these tables are large
-- (yugioh_price_snapshots is 309 MB, mtg_price_snapshots is 1578 MB).
-- ADD COLUMN with no DEFAULT is a catalogue-only change in PostgreSQL 11+: it takes an ACCESS
-- EXCLUSIVE lock but holds it only for the metadata update, with no table rewrite.
-- The DEFAULT is therefore applied as a SEPARATE ALTER after the column exists. Adding a
-- volatile default such as now() in the same statement as ADD COLUMN is what would force a
-- full rewrite of every existing row under that lock. Splitting the two avoids it entirely.
-- Existing rows keep written_at NULL, which is honest: their true write time is unknown and
-- backfilling now() would fabricate provenance rather than record it.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS, so re-running is safe and skips mtg.

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name LIKE '%\_price\_snapshots'
    ORDER BY table_name
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS written_at timestamptz', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS source text', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN written_at SET DEFAULT now()', t);
  END LOOP;
END $$;

-- VERIFIED AFTER RUNNING: 32 of 32 *_price_snapshots tables now carry written_at and source,
-- and all 32 have the now() default on written_at.
--
-- NOT DONE HERE, and deliberately so: the sync jobs still do not POPULATE source. Only
-- sync-mtg-daily.mjs sets it (added by C3L-42). The default fills written_at automatically on
-- every new row, so staleness questions are answerable from now on, but attributing a row to a
-- particular writer is not, for 31 games. That is logged as its own finding rather than
-- silently half-solved, because it needs a touch of every sync job to close.
