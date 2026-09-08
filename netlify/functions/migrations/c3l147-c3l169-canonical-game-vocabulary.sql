-- netlify/functions/migrations/c3l147-c3l169-canonical-game-vocabulary.sql
-- task-fix-sync-events-game-vocabulary. APPLIED to the live database on 8 September 2026.
-- This file is a record of what was done AND a re-runnable script. See RE-RUN below.
--
-- WHAT THIS FIXES
-- sync_events.game held 58 distinct values across three mixed vocabularies: C3 game keys,
-- upstream tcgapi.dev slugs, and non-game subsystem labels, plus 158 NULL rows. Six games were
-- writing under BOTH a game key and a slug at the same time, so any per-game monitoring query
-- silently matched a fraction of real events. That cost was observed three separate times on
-- 8 September alone, including inside the task that verified C3L-148, where a query keyed on six
-- game names returned exactly one game.
--
-- THE DECISION, per C3L-169: THE GAME KEY WINS, everywhere.
-- The game key is what the rest of the system is already built on: the key of GAME_TABLES, the
-- <game>_cards and <game>_sets table prefix, and the /cards/<game> URL segment. The upstream slug
-- is a third party's identifier that C3 does not control and that HAS ALREADY CHANGED under us
-- five times (godzilla-tcg, grand-archive-tcg, hololive-trading-card-game, dragon-ball-z-score
-- and warhammer-old-world each left a stub of orphaned rows behind). Choosing the vendor slug
-- would mean the canonical vocabulary is renamed whenever a vendor feels like it.
--
-- WRITERS WERE FIXED FIRST, WHICH IS THE ORDER THAT MATTERS
-- C3L-169 is explicit that rewriting history while the writers still emit slugs restores the
-- split within 24 hours. 31 function files were changed in the same commit as this migration:
-- each game sync now declares a separate GAME_KEY and writes ONLY that to sync_events, while
-- GAME_SLUG is left untouched because it also builds the upstream URL and populates the
-- game_slug columns. Changing GAME_SLUG would have broken both.
--
-- RE-RUN AFTER DEPLOY. This migration was applied while the code fix was still held locally, so
-- production continued writing slugs until the deploy. Re-run this file once after the deploy to
-- sweep up rows written in between. It is idempotent: every statement is keyed on the old value,
-- so a second run over already-canonical data changes nothing.
--
-- MEASURED, BEFORE AND AFTER
--   total rows          5,473 -> 5,473   (nothing dropped, nothing duplicated)
--   distinct game        58   -> 48      (32 canonical games + 16 subsystem sentinels)
--   NULL rows            158  -> 0
-- Verification: a query keyed on six game names that previously returned 1 of 6 now returns 6 of 6.
--
-- THE NULL ROWS WERE NOT A LOGGING GAP, which is what the task asked to establish. All 158 were
-- subsystem events that genuinely have no game: 116 amazon_prices_sync_start/success rows from
-- sync-amazon-prices-background.mjs, and 42 throttle_block rows from shared/request-throttle.mjs.
-- Both now write an explicit sentinel instead of null, so the column can eventually take a
-- NOT NULL constraint.
--
-- NOT DONE HERE, deliberately, and it is C3L-169 step 4: there is still no CHECK or foreign key
-- pinning this column to a canonical list, so an unrecognised value would be accepted silently
-- again. Without that, this recurs. That is a separate change and needs its own decision about
-- how the 16 subsystem sentinels are exempted.

begin;

-- 1. Fold every upstream slug and retired alias onto its canonical C3 game key.
with m(old_value, canonical) as (values
  ('alpha-clash','alphaclash'), ('bakugan-tcg','bakugan'), ('battle-spirits-saga','battlespiritssaga'),
  ('cardfight-vanguard','vanguard'), ('digimon-card-game','digimon'), ('dragon-ball-super-ccg','dragonball'),
  ('dragon-ball-super-fusion-world','dbsfusionworld'), ('dragon-ball-z-score','dragonballz'),
  ('dragon-ball-z-tcg','dragonballz'), ('final-fantasy-tcg','finalfantasy'), ('force-of-will','forceofwill'),
  ('future-card-buddyfight','buddyfight'), ('gate-ruler','gateruler'), ('godzilla-card-game','godzilla'),
  ('godzilla-tcg','godzilla'), ('grand-archive','grandarchive'), ('grand-archive-tcg','grandarchive'),
  ('gundam-card-game','gundam'), ('hololive-official-card-game','hololive'),
  ('hololive-trading-card-game','hololive'), ('lorcana-tcg','lorcana'), ('one-piece-card-game','onepiece'),
  ('riftbound-league-of-legends-trading-card-game','riftbound'), ('shadowverse-evolve','shadowverse'),
  ('sorcery-contested-realm','sorcery'), ('star-wars-unlimited','starwars'), ('union-arena','unionarena'),
  ('warhammer-age-of-sigmar-champions-tcg','warhammer'), ('warhammer-old-world','warhammer'),
  ('weiss-schwarz','weissschwarz'), ('world-of-warcraft-tcg','wow')
)
update sync_events s set game = m.canonical
from m where s.game = m.old_value;

-- 2. Replace NULL with an explicit subsystem sentinel, scoped by event_type so nothing is guessed.
update sync_events set game = 'amazon-prices'
 where game is null and event_type like 'amazon_prices_sync%';

update sync_events set game = '__throttle__'
 where game is null and event_type = 'throttle_block';

commit;
