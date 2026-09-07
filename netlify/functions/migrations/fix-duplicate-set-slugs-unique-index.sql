-- netlify/functions/migrations/fix-duplicate-set-slugs-unique-index.sql
-- task-fix-duplicate-pokemon-set-slugs. APPLIED to the live database on 7 September 2026.
-- This file is a record of what was done, not a pending change.
--
-- WHAT WENT WRONG
-- CLAUDE.md states that every <game>_sets table carries a UNIQUE index on slug alone. That was
-- false for 7 of the 32 sets tables, and pokemon_sets was one of them. Measured on 7 September,
-- before this migration:
--
--   24 of 32 sets tables had a unique slug index (added with the newer games).
--    7 of 32 had none: dragonball, lorcana, onepiece, pokemon, riftbound, starwars, yugioh.
--                      Those are the earliest games built, so the index was introduced later
--                      and never backfilled onto the originals.
--    1 of 32, mtg_sets, has no slug column at all. It keys on set_slug and already carries
--                      mtg_sets_set_slug_key, so it is correct and is not touched here.
--
-- Only pokemon_sets had actually accumulated duplicates: 2 slug values across 4 rows.
--
--   swsh-crown-zenith                    id 5500214 (0 cards, stale 15 May)
--                                        id 5500217 (225 cards, synced daily)
--   swsh-crown-zenith-galarian-gallery   id 5500215 (0 cards, stale 15 May)
--                                        id 5500218 (70 cards, synced daily)
--
-- Upstream tcgapi.dev re-issued both sets under NEW ids in September while the May rows were
-- still present. The set page resolves a set with `slug=eq.X&limit=1` and no ordering, so
-- Postgres returned whichever row it liked, and it returned the stale empty one for both. Both
-- Crown Zenith set pages served HTTP 200 with a correct heading and "0 cards", while 295 real
-- cards sat on the live rows and were unreachable from their own set page.
--
-- WHY THE DELETE WAS SAFE, AND WHY THE DATABASE WOULD NOT HAVE CAUGHT A MISTAKE
-- pokemon_cards.set_id references pokemon_sets(id) ON DELETE SET NULL, NOT restrict. Deleting a
-- populated set row would therefore NOT raise an error, it would silently null the set_id of
-- every card on it. The zero-card check is the only thing standing between a wrong id and
-- hundreds of orphaned cards, so it is written into the DELETE itself below rather than being
-- left to a separate query run beforehand.
--
-- Verified immediately before and after: both orphan ids had 0 referencing cards, and after the
-- delete pokemon_cards still holds 32,642 rows with 0 rows carrying a null set_id.
--
-- KNOWN CONSEQUENCE OF THE UNIQUE INDEX, DELIBERATE AND NOT A REGRESSION
-- With a unique index in place, the next time upstream re-issues a set under a new id with a
-- slug that already exists, the sets upsert will abort that batch with a 23505 instead of
-- quietly creating a second row. That is a LOUD failure replacing a SILENT one, and it is the
-- same trade the other 24 games have always run with. It is surfaced by the daily sync failure
-- digest added in d4e5682. Note that the card slugs themselves are protected separately by
-- shared/slug-assign.mjs, which is unaffected by this migration.

begin;

-- ---------------------------------------------------------------------------
-- 1. Remove the two stale duplicate rows in pokemon_sets.
--    The NOT EXISTS clause makes this self gating: a row that still has cards
--    cannot be deleted by this statement, whatever the id list says.
-- ---------------------------------------------------------------------------
delete from public.pokemon_sets s
where s.id in (5500214, 5500215)
  and not exists (select 1 from public.pokemon_cards c where c.set_id = s.id);

-- ---------------------------------------------------------------------------
-- 2. Add the missing unique slug index to the 7 tables that lacked one.
--    Each was confirmed to hold zero duplicate slug values first, so none of
--    these can fail on existing data.
-- ---------------------------------------------------------------------------
create unique index if not exists dragonball_sets_slug_idx on public.dragonball_sets (slug);
create unique index if not exists lorcana_sets_slug_idx    on public.lorcana_sets (slug);
create unique index if not exists onepiece_sets_slug_idx   on public.onepiece_sets (slug);
create unique index if not exists pokemon_sets_slug_idx    on public.pokemon_sets (slug);
create unique index if not exists riftbound_sets_slug_idx  on public.riftbound_sets (slug);
create unique index if not exists starwars_sets_slug_idx   on public.starwars_sets (slug);
create unique index if not exists yugioh_sets_slug_idx     on public.yugioh_sets (slug);

commit;
