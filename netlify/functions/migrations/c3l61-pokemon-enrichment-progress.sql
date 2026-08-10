-- C3L-61: progress tracking for the pokemon enrichment backfill.
-- Applied to the live database on 6 August 2026 as `c3l61_pokemon_enrichment_progress`.
-- This file is the repo's record of it.
--
-- WHY A SEPARATE TABLE, which the task specifically required and which is the point.
-- `pokemon_sync_progress` already exists and already means something precise: "the price sync
-- has seen this set". That value is what the price sync's `isNewSet` gate reads to decide
-- whether to write card rows. Reusing it to also mean "enrichment backfilled" would have made
-- a working, load-bearing value ambiguous, and the price sync is the one thing in this area
-- that is currently healthy. Same reasoning that made retiring safer than repairing in Task 19:
-- do not change the meaning of something a working job depends on.
--
-- `backfilled_at` doubles as the rotation key. The backfill orders by it ascending with
-- never-backfilled sets first, so the job converges through all 235 sets and then keeps
-- rotating oldest-first instead of stopping. That matters because the gap this fixes was caused
-- by a one-time write path closing permanently: a backfill that also stopped would recreate the
-- same problem more slowly.

create table if not exists public.pokemon_enrichment_progress (
  set_id        integer primary key,
  backfilled_at timestamptz not null default now(),
  cards_updated integer,
  ptcg_set_id   text
);

comment on table public.pokemon_enrichment_progress is
  'C3L-61. Tracks which pokemon sets have had their card enrichment (hp, stage, types, attacks, weaknesses, retreat_cost) backfilled. DELIBERATELY SEPARATE from pokemon_sync_progress, which means "price sync has seen this set" and is what gates the price sync card writes. Overloading that table would have changed the meaning of a value the working price sync depends on. backfilled_at is also the rotation key: once every set is done the backfill keeps going, oldest first, so metadata never ages out again.';

-- Fails closed for anon, consistent with every other table that only service_role should reach.
alter table public.pokemon_enrichment_progress enable row level security;
revoke all on public.pokemon_enrichment_progress from anon, authenticated;

create policy "service_role manages pokemon enrichment progress"
  on public.pokemon_enrichment_progress for all to service_role using (true) with check (true);

-- Supports the oldest-first rotation the backfill orders by.
create index if not exists pokemon_enrichment_progress_backfilled_idx
  on public.pokemon_enrichment_progress (backfilled_at asc);

-- VERIFIED AFTER RUNNING: table created, RLS enabled, anon and authenticated revoked, one
-- service_role policy, 0 rows at creation.
