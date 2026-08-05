-- C3L-41: exclude 8 specific snapshot rows from signal computation. Targeted, not a guard.
--
-- What this is NOT: this is not the broad outlier guard originally considered. Task 04
-- measured the 242 outlier cards and found 189 of them (78.1 per cent) are GENUINE market
-- data, the three Marvel sets released 2026-06-26 whose preorder highs collapsed after
-- release. Excluding those would delete real price history. A further 45 are unclear and
-- were not resolved either way. Both groups are deliberately untouched here.
--
-- What this IS: the 8 rows whose low came from the single anomalous ingestion batch of
-- 2026-06-06 (39,515 rows, all with a NULL aud_usd_rate, average 0.209 USD against 10.152
-- for that day's normal rows, never recurred, writer unidentified). Those 8 are the only
-- ones with a defensible reason to distrust them: their provenance is the anomalous batch.
--
-- Honesty about the 8: only Ornithopter is dramatically wrong on its face, a 0.05 USD row
-- for a card Scryfall reports at 500.00 USD. The other 7 carry plausible small values
-- (0.07 to 0.47 USD) and are excluded because of WHERE THEY CAME FROM, not because the
-- number is provably wrong. That distinction is deliberate and is recorded rather than
-- glossed, because it is the whole reason this is 8 rows and not 242.
--
-- Method: the price values are NOT altered or deleted. Deleting them would destroy the
-- record of what happened, which is the only surviving evidence of the 6 June event. The
-- rows are flagged and the signal computation skips flagged rows. Fully reversible, and
-- the underlying data stays intact and auditable.
--
-- LOCK SAFETY, per protocol Section 16.2. ADD COLUMN with a CONSTANT default (false) is a
-- metadata-only change on PostgreSQL 17, no rewrite of this 4.38 million row, 1,559 MB
-- table. The UPDATE touches exactly 8 rows by primary key.
--
-- ROLLBACK, two steps, either independently safe:
--   UPDATE public.mtg_price_snapshots SET excluded_from_signals = false WHERE id IN (...the 8 ids below...);
--   ALTER TABLE public.mtg_price_snapshots DROP COLUMN IF EXISTS excluded_from_signals;
-- and re-apply the previous compute_mtg_signals_batch body, which is identical to the one
-- below except without the "AND NOT s.excluded_from_signals" line in card_stats.

ALTER TABLE public.mtg_price_snapshots
  ADD COLUMN IF NOT EXISTS excluded_from_signals boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.mtg_price_snapshots.excluded_from_signals IS
  'True means this row is ignored when computing mtg_signals. Set by C3L-41 on 8 rows from the anomalous 2026-06-06 batch. The price value is preserved deliberately, only its use in signals is suppressed.';

-- The 8 rows, by primary key, identified in Task 04 as the outlier lows sourced from the
-- 6 June batch. Listed explicitly rather than matched by a predicate, so this can never
-- widen silently to catch cards it was not meant to.
UPDATE public.mtg_price_snapshots
SET excluded_from_signals = true
WHERE id IN (
  '552328b6-ad01-490f-a17b-29038b52b976',  -- Ornithopter (sum), 0.05 USD, Scryfall says 500.00
  '673627cc-fc4d-4814-a8f1-f722ee8f428d',  -- Scurry of Squirrels (blc)
  '42f8a159-4304-491d-838d-cddf7a391c8f',  -- Brutal Command (unk)
  '8084b020-bdd0-4471-94f7-95828255c482',  -- Force of Nature (btd)
  '21b1de52-a29f-4a69-893d-6a1c13300688',  -- Camaraderie (ncc)
  '2264e311-79da-496c-9589-3f6a124021b6',  -- Fear of the Dark (dsk)
  '1287fffa-5bd8-4b1c-9e10-5180a64429e8',  -- Belfry Spirit (gk2)
  'c390c682-ddb4-40cb-a6fa-f07a4922f011'   -- Crossroads Consecrator (plst)
);

-- Teach the signal computation to skip flagged rows. This is the ONLY change to the
-- function in this migration: one added condition in card_stats. Everything else is
-- byte-identical to the previous definition.
CREATE OR REPLACE FUNCTION public.compute_mtg_signals_batch(p_batch_size integer DEFAULT 500, p_offset integer DEFAULT 0)
 RETURNS TABLE(processed integer, next_offset integer, done boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_date DATE;
  v_processed INT := 0;
BEGIN
  SELECT MAX(snapshot_date) INTO v_max_date FROM mtg_price_snapshots;

  INSERT INTO mtg_signals (
    scryfall_id, price_52w_low_aud, price_52w_high_aud,
    buy_verdict, sell_verdict, latest_price_aud, latest_date, computed_at
  )
  WITH card_batch AS (
    SELECT DISTINCT scryfall_id
    FROM mtg_price_snapshots
    WHERE snapshot_date = v_max_date
    ORDER BY scryfall_id
    LIMIT p_batch_size OFFSET p_offset
  ),
  card_stats AS (
    SELECT
      s.scryfall_id,
      MIN(s.price_aud) AS low_52w,
      MAX(s.price_aud) AS high_52w,
      MAX(s.price_aud) FILTER (WHERE s.snapshot_date = v_max_date) AS latest_price
    FROM mtg_price_snapshots s
    INNER JOIN card_batch b ON b.scryfall_id = s.scryfall_id
    WHERE s.price_aud IS NOT NULL
      AND NOT s.excluded_from_signals   -- C3L-41, the only added line
    GROUP BY s.scryfall_id
  )
  SELECT
    cs.scryfall_id,
    cs.low_52w,
    cs.high_52w,
    CASE WHEN cs.high_52w > cs.low_52w * 1.30 AND cs.latest_price <= cs.low_52w * 1.10
         THEN 'buy' ELSE NULL END,
    CASE WHEN cs.high_52w > cs.low_52w * 1.30 AND cs.latest_price >= cs.high_52w * 0.90
         THEN 'sell' ELSE NULL END,
    cs.latest_price,
    v_max_date,
    NOW()
  FROM card_stats cs
  ON CONFLICT (scryfall_id) DO UPDATE SET
    price_52w_low_aud  = EXCLUDED.price_52w_low_aud,
    price_52w_high_aud = EXCLUDED.price_52w_high_aud,
    buy_verdict        = EXCLUDED.buy_verdict,
    sell_verdict       = EXCLUDED.sell_verdict,
    latest_price_aud   = EXCLUDED.latest_price_aud,
    latest_date        = EXCLUDED.latest_date,
    computed_at        = EXCLUDED.computed_at;

  GET DIAGNOSTICS v_processed = ROW_COUNT;

  RETURN QUERY SELECT v_processed, (p_offset + p_batch_size), (v_processed = 0);
END;
$function$;
