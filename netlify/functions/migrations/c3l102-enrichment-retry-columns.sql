-- C3L-102: distinguish "attempted" from "done" in the pokemon enrichment backfill.
-- Applied to the live database on 6 August 2026 as `c3l61_enrichment_progress_retry_columns`,
-- plus an `attempts` column added immediately after. This file is the repo's record.
--
-- WHY
-- The first version of the backfill wrote a progress row for every set it looked at, which
-- permanently removed that set from the queue. Its first real run burned five sets: Crown Zenith
-- resolved upstream but enriched 0 of its 48 cards, XY Steam Siege (152 cards) and Base Set (8
-- cards) failed to resolve at all, and all three were recorded as finished having done nothing.
-- Nothing would ever have retried them, and nothing recorded that they had been skipped.
--
-- needs_retry separates the two states. cards_in_set makes the distinction checkable: a set with
-- 0 cards enriching 0 cards is a real no-op, a set with 152 cards enriching 0 is a failure, and
-- without the column those are identical rows.
--
-- NOTE, recorded because the record and reality disagreed: `attempts` was in the original
-- migration file for this table but was NOT present on the live table when checked. It was added
-- separately. Worth knowing that the migration file was not a reliable description of the schema.

alter table public.pokemon_enrichment_progress
  add column if not exists needs_retry  boolean not null default false,
  add column if not exists cards_in_set integer,
  add column if not exists last_error   text,
  add column if not exists attempts     integer not null default 0;

-- Reset the five burned sets. Deleting the rows returns them to the front of the queue as
-- never-attempted. This does NOT fix why two of them failed to match upstream, which is C3L-103
-- and a separate piece of work.
delete from public.pokemon_enrichment_progress;

-- VERIFIED AFTER RUNNING: 0 rows, and columns are
-- set_id, backfilled_at, cards_updated, ptcg_set_id, needs_retry, cards_in_set, last_error, attempts.
