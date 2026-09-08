-- netlify/functions/migrations/delete-retired-crown-zenith-orphans.sql
-- task-delete-retired-crown-zenith-orphans. APPLIED to the live database on 7 September 2026.
-- This file is a record of what was done, not a pending change.
--
-- WHAT THESE ROWS WERE
-- Two retired Crown Zenith rows in pokemon_sets, each with its own unique slug. They are NOT
-- the duplicate pairs fixed by fix-duplicate-set-slugs-unique-index.sql, and the unique slug
-- index added there does not touch them, because no other row shares their slug:
--
--   id 5500001  slug crown-zenith                    last synced 23 July 2026
--   id 5500154  slug crown-zenith-galarian-gallery   last synced 23 July 2026
--
-- The live Crown Zenith sets are 5500217 (swsh-crown-zenith, 225 cards) and 5500218
-- (swsh-crown-zenith-galarian-gallery, 70 cards), synced daily. Those two are untouched.
--
-- WHY THEY WERE SAFE TO DELETE, VERIFIED BEFORE THE DELETE RAN
-- 1. ZERO referencing cards. Both ids had 0 rows in pokemon_cards.
-- 2. NOT HARDCODED ANYWHERE LIVE. Neither slug appears anywhere in the repo. Both ids appear
--    only in c3l-201-pokemon-set-mapping.sql, which declares itself NOT APPLIED in its own
--    header, and the table it creates (public.pokemon_set_mapping) was confirmed absent from
--    the live database. Neither id nor slug appears in netlify.toml or sitemap-pokemon.mjs.
-- 3. GONE FROM UPSTREAM, re-checked live rather than trusted from the earlier read. The
--    tcgapi.dev call that populates this table, /v1/games/pokemon/sets, returned 234 sets on
--    7 September and contained neither id and neither slug. The only Crown Zenith sets it
--    still publishes are 5500217 and 5500218.
--
-- THE card_count COLUMN IS NOT THE CARD COUNT, AND IT LOOKS ALARMING HERE
-- These two rows carried card_count 9950 and 137. That column stores the number upstream last
-- declared, not the number of pokemon_cards rows that actually reference the set, and it was
-- last written in July by a source that has since retired both sets. The real referencing
-- count was 0 for both. Anyone re-reading this file should not take 9950 as evidence that a
-- populated set was deleted.
--
-- WHY THE GATE IS INSIDE THE STATEMENT
-- Same reason as the previous fix. pokemon_cards.set_id references pokemon_sets(id) ON DELETE
-- SET NULL, not restrict, so deleting a populated set row raises no error, it silently nulls
-- the set_id of every card on it. The zero-card check is therefore written into the DELETE as
-- a NOT EXISTS clause rather than run as a separate query beforehand and trusted. A row that
-- still has cards cannot be removed by this statement whatever the id list says.
--
-- MEASURED BEFORE AND AFTER
--   pokemon_sets            236 -> 234   (exactly the 2 rows below)
--   pokemon_cards total     32,642 -> 32,642   unchanged
--   pokemon_cards null set_id     0 -> 0       unchanged
-- pokemon_sets now holds 234 rows, which matches the 234 sets upstream currently publishes.

begin;

delete from public.pokemon_sets s
where s.id in (5500001, 5500154)
  and not exists (select 1 from public.pokemon_cards c where c.set_id = s.id);

commit;
