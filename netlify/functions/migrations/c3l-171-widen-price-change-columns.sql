-- C3L-171. Widen price_change_7d / _30d / _24h from numeric(8,4) to unconstrained numeric
-- on the 24 game tables that still constrain them.
--
-- WHY, and the cause was confirmed against real data rather than read off the error code.
--
-- `sync-weissschwarz-background` had been losing the whole 162 card set
-- "hololive production Premium Booster" every night since 28 July with:
--
--   22003  numeric field overflow
--   A field with precision 8, scale 4 must round to an absolute value less than 10^4.
--
-- The tempting reading is "a price is too big". It is not a price. The ONLY numeric(8,4)
-- columns in these tables are the three price_change percentages, and a percentage is exactly
-- the column that can legitimately run to five figures. Fetched live from tcgapi.dev for that
-- set: 162 cards, 162 price rows, and EXACTLY ONE value out of range, card 914684
-- "Wishing for a Future With You, Omaru Polka (SP)" with price_change_30d = 21950. Every other
-- value in the set is small; the largest 7d and 24h are both 19.3. One card's 30 day
-- percentage was aborting the upsert for the other 161.
--
-- WHY WIDEN RATHER THAN CLAMP IN THE SYNC. Because the constraint is the anomaly, not the
-- value. These three columns are already UNCONSTRAINED numeric on 39 tables and constrained on
-- only 24, and the unconstrained ones routinely hold values the constrained ones could never
-- accept: yugioh_cards holds a price_change_30d of 92,397.5, pokemon_cards 18,061 with a 7d of
-- 6,203.11, mtg_cards 8,500. So 21950 is ordinary upstream data that most of this schema
-- already stores, and clamping it to NULL in code would have thrown away a real signal to
-- protect a limit that the majority of the same schema does not impose.
--
-- Widening is non-destructive: numeric(8,4) values all fit in unconstrained numeric unchanged.
-- Nothing is rounded, nothing is dropped, and no existing row is rewritten in value.
--
-- Idempotent by construction: the loop selects only columns still at precision 8 scale 4, so
-- re-running it finds nothing and does nothing.

DO $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('price_change_7d', 'price_change_30d', 'price_change_24h')
      AND numeric_precision = 8
      AND numeric_scale = 4
    ORDER BY table_name, column_name
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE numeric', r.table_name, r.column_name);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'C3L-171: widened % column(s)', n;
END $$;
