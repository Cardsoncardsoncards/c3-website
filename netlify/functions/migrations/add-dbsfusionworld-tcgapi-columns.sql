-- netlify/functions/migrations/add-dbsfusionworld-tcgapi-columns.sql
--
-- HELD, NOT APPLIED. Task 47, 10 August 2026. Do not run this without Sammy's go-ahead.
--
-- WHY. dbsfusionworld is the CORE Dragon Ball game (see CLAUDE.md), and it is the only one of
-- the games with a sync-ids job that has no tcgapi_id column and therefore no job. Verified
-- against the live database on 10 August: of the 8 tables with a sync-ids-*-background.mjs
-- counterpart, dbsfusionworld_cards is the single one missing both tcgapi_id and
-- tcgapi_synced_at. dragonball_cards, the EXTENDED Dragon Ball game, has had them all along,
-- which is the same Core-versus-Extended mix-up CLAUDE.md warns about.
--
-- SHAPE. Copied from dragonball_cards rather than invented, so the two Dragon Ball tables stay
-- comparable. The index is PARTIAL on purpose: the sync only ever queries tcgapi_id IS NULL to
-- find work, and once resolved a row is never looked up by this column again, so indexing the
-- resolved rows is what earns its keep for downstream joins while the NULLs stay unindexed.
--
-- SCOPE ON THE LIVE DATA, measured 10 August 2026:
--   dbsfusionworld_cards            4,109 rows
--   with tcgplayer_id               4,109 rows, so nothing is unresolvable for want of a key
--   in the sync's own price window  1,614 rows (market_price between 1 and 2000)
-- At 20 parallel calls and a 42,000+ daily tcgapi.dev allowance, a full first pass is one run,
-- comfortably inside the 15 minute background ceiling and nowhere near the rate limit.
--
-- REVERSIBLE. Dropping the two columns and the index restores the previous state exactly; no
-- existing column is altered and no data is rewritten.

ALTER TABLE public.dbsfusionworld_cards
  ADD COLUMN IF NOT EXISTS tcgapi_id        bigint,
  ADD COLUMN IF NOT EXISTS tcgapi_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_dbsfusionworld_cards_tcgapi_id
  ON public.dbsfusionworld_cards USING btree (tcgapi_id)
  WHERE (tcgapi_id IS NOT NULL);

-- Rollback:
--   DROP INDEX IF EXISTS public.idx_dbsfusionworld_cards_tcgapi_id;
--   ALTER TABLE public.dbsfusionworld_cards
--     DROP COLUMN IF EXISTS tcgapi_id,
--     DROP COLUMN IF EXISTS tcgapi_synced_at;
