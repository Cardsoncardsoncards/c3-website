-- netlify/functions/migrations/add-printing-id-to-follows.sql
-- task-153: record WHICH PRINTING a follow was created from, not just the card name.
--
-- The problem this closes. task-109 gave follows (game, card_slug, card_name) and an
-- entity_id generated from game || ':' || card_slug. No printing, anywhere. For 31 of the
-- 32 games that is harmless, because their slugs are already one-per-printing. For MTG it
-- is not: mtg_cards holds 98,370 rows under only 33,913 distinct slugs, so a slug names a
-- CARD, not a printing. Ragavan, Nimble Pilferer alone has 10 printings sharing one slug,
-- from AU$0 up to AU$86.79.
--
-- task-152's same-day fix made every surface agree by routing them all through one rule
-- ("newest priced, priced first", shared/card-resolver.mjs). That made the surfaces
-- consistent with each other. It could not make them consistent with what the person was
-- actually looking at, because nothing recorded that. The MTG card page swaps the hero
-- image, price block and printing info CLIENT SIDE when a thumbnail in the printings
-- carousel is clicked, with no URL change, so the printing on screen at the moment someone
-- presses Follow is frequently NOT the one the server rendered. This column records it.
--
-- WHY printing_id text AND NOT scryfall_id.
-- The task file proposed scryfall_id, "matching what mtg_cards already uses". Checked live
-- against all 32 card tables before writing this: scryfall_id exists on mtg_cards ONLY.
-- Every one of the other 31 tables keys a printing by tcgplayer_id, which is integer on
-- some games and bigint on others. A scryfall_id column would therefore be dead on 31 of
-- 32 games. One nullable text column holds either identifier, and the per-game column it
-- points at is named once in shared/game-meta.mjs (GAME_PRINTING_COL).
-- Verified live, 28 July 2026: scryfall_id is unique and non-null across all 98,370
-- mtg_cards rows, and tcgplayer_id is unique and non-null across all 32 other tables.
--
-- NULLABLE ON PURPOSE. A null means "this follow predates the column, or the card page
-- could not name a printing". Readers fall back to resolveCardBySlug() in that case, which
-- is the pre-task-153 behaviour, so a null degrades to today's answer rather than to an
-- error. Nothing is ever guessed and then stored as though it were known.

alter table public.follows
  add column if not exists printing_id text;

comment on column public.follows.printing_id is
  'The specific printing the follow was created from. Holds mtg_cards.scryfall_id for mtg and <game>_cards.tcgplayer_id for the other 31 games; the column it refers to is mapped in shared/game-meta.mjs GAME_PRINTING_COL. NULL means no printing was recorded (pre task-153 rows, or a page that could not name one), and readers fall back to the shared slug rule in shared/card-resolver.mjs (task-153).';

-- Deliberately NOT a foreign key and NOT unique. It points into one of 32 different tables
-- depending on the game, which no single FK can express, and two people following the same
-- printing is normal. It is also NOT added to entity_id: UNIQUE (user_id, entity_id) stays
-- one follow per card per person. Letting one person follow two printings of the same card
-- separately is a product decision, not a bug fix, and is out of scope here.

-- No index. follows holds 4 rows (verified live, 28 July 2026) and every read already
-- filters on user_id, id or a token, never on printing_id alone. Add one if that changes.

-- ---------------------------------------------------------------------------
-- Backfill: only where the answer is KNOWN, never where it would be a guess.
-- ---------------------------------------------------------------------------
-- The 4 existing rows split cleanly:
--   pokemon, unionarena, weissschwarz  -- their slugs are unique per printing (verified:
--     zero duplicate slugs in all 31 non-MTG tables), so the slug already identifies exactly
--     one printing. Writing it down is a lookup, not an inference, so these are backfilled.
--   mtg (Ragavan, Nimble Pilferer)     -- 10 printings share that slug. Which one the
--     customer was looking at was never recorded and cannot be recovered. It is left NULL
--     so it keeps resolving through the shared rule. Inventing a printing here would turn
--     an honest unknown into a stored fact, which is the exact class of bug this task fixes.
--
-- Written as a per-game update over the non-MTG tables that actually have follow rows. The
-- join is on slug and is guarded by the game, so it cannot touch a row of another game.

update public.follows f
   set printing_id = c.tcgplayer_id::text
  from public.pokemon_cards c
 where f.game = 'pokemon'
   and f.card_slug = c.slug
   and f.printing_id is null;

update public.follows f
   set printing_id = c.tcgplayer_id::text
  from public.unionarena_cards c
 where f.game = 'unionarena'
   and f.card_slug = c.slug
   and f.printing_id is null;

update public.follows f
   set printing_id = c.tcgplayer_id::text
  from public.weissschwarz_cards c
 where f.game = 'weissschwarz'
   and f.card_slug = c.slug
   and f.printing_id is null;
