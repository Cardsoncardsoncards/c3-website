-- C3L-39: do not issue a buy or sell verdict from too little price history.
--
-- The problem: 532 cards carried a trading verdict built on 14 days of history or less,
-- 291 of them on 7 days or less. Card history varies far more than anything had recorded:
-- across 83,162 priced cards the median is 33 days, the mean 41.7, the minimum 1 day and
-- the maximum 84, and 47 per cent hold 7 days or fewer. So "Near recent low" meant 84 days
-- of observation on one card page and six days on another, with nothing to tell them apart.
--
-- The verdict is a ratio test against the observed high and low:
--     buy  = high > low * 1.30 AND latest <= low  * 1.10
--     sell = high > low * 1.30 AND latest >= high * 0.90
-- The 1.30 volatility gate already rejects the degenerate one-day case, where high equals
-- low. It does not reject a six-day card whose price wobbled 30 per cent on noise, which is
-- the actual failure being fixed.
--
-- THRESHOLD: 30 distinct days with a price. Reasoning, in the same shape as C3L-12's 1 day
-- tolerance and C3L-25's majority-of-window rule:
--   1. It is the shortest window this site already claims a trend over anywhere else
--      (price_change_30d), so it is consistent with what C3 elsewhere treats as enough.
--   2. It sits just under the median card history of 33 days, so a typical card keeps its
--      verdict and only the genuinely thin tail loses one.
--   3. Measured, not estimated: it withholds 863 of the current 13,327 verdicts, 6.5 per
--      cent. At 14 days it would be 504 and at 45 days 1,498. 30 covers the whole
--      population C3L-39 identified while leaving the ordinary catalogue untouched.
-- Distinct DAYS, not row count, so a card with several rows on one date cannot look
-- well-observed.
--
-- WITHHOLD, not low-confidence, and why: a buy or sell call is a binary prompt to act. A
-- "low confidence buy" still reads as buy to someone scanning a page, so the honest option
-- is to not make the call. The card page separately gains an explicit "not enough history"
-- state, because until now a card with insufficient data and a card with a genuine
-- mid-range verdict both rendered the identical "Mid-range price" label, which stated a
-- conclusion where there was none. That display half is in card-page.mjs, not here.
--
-- days_of_history is stored rather than recomputed at display time, so the card page,
-- /market and the weekly email all read the same number and cannot drift apart. That is
-- the C3L-27 lesson applied before the divergence happens rather than after.
--
-- LOCK SAFETY: mtg_signals is 43,507 rows, small. ADD COLUMN with no default is
-- metadata-only regardless.
--
-- ROLLBACK:
--   ALTER TABLE public.mtg_signals DROP COLUMN IF EXISTS days_of_history;
-- and re-apply the C3L-41 version of compute_mtg_signals_batch, which is identical to the
-- one below except that card_stats has no days_hist expression and the two verdict CASEs
-- have no "cs.days_hist >= MIN_HISTORY_DAYS" condition.

ALTER TABLE public.mtg_signals ADD COLUMN IF NOT EXISTS days_of_history integer;

COMMENT ON COLUMN public.mtg_signals.days_of_history IS
  'Distinct days with a usable price for this card. Below 30, C3L-39 withholds the buy and sell verdict and the card page shows an explicit not-enough-history state rather than Mid-range price.';

CREATE OR REPLACE FUNCTION public.compute_mtg_signals_batch(p_batch_size integer DEFAULT 500, p_offset integer DEFAULT 0)
 RETURNS TABLE(processed integer, next_offset integer, done boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  MIN_HISTORY_DAYS constant int := 30;
  v_max_date DATE;
  v_processed INT := 0;
BEGIN
  SELECT MAX(snapshot_date) INTO v_max_date FROM mtg_price_snapshots;

  INSERT INTO mtg_signals (
    scryfall_id, price_52w_low_aud, price_52w_high_aud,
    buy_verdict, sell_verdict, latest_price_aud, latest_date, computed_at,
    days_of_history
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
      MAX(s.price_aud) FILTER (WHERE s.snapshot_date = v_max_date) AS latest_price,
      COUNT(DISTINCT s.snapshot_date) FILTER (WHERE s.price_aud > 0) AS days_hist  -- C3L-39
    FROM mtg_price_snapshots s
    INNER JOIN card_batch b ON b.scryfall_id = s.scryfall_id
    WHERE s.price_aud IS NOT NULL
      AND NOT s.excluded_from_signals   -- C3L-41
    GROUP BY s.scryfall_id
  )
  SELECT
    cs.scryfall_id,
    cs.low_52w,
    cs.high_52w,
    CASE WHEN cs.days_hist >= MIN_HISTORY_DAYS       -- C3L-39
          AND cs.high_52w > cs.low_52w * 1.30
          AND cs.latest_price <= cs.low_52w * 1.10
         THEN 'buy' ELSE NULL END,
    CASE WHEN cs.days_hist >= MIN_HISTORY_DAYS       -- C3L-39
          AND cs.high_52w > cs.low_52w * 1.30
          AND cs.latest_price >= cs.high_52w * 0.90
         THEN 'sell' ELSE NULL END,
    cs.latest_price,
    v_max_date,
    NOW(),
    cs.days_hist
  FROM card_stats cs
  ON CONFLICT (scryfall_id) DO UPDATE SET
    price_52w_low_aud  = EXCLUDED.price_52w_low_aud,
    price_52w_high_aud = EXCLUDED.price_52w_high_aud,
    buy_verdict        = EXCLUDED.buy_verdict,
    sell_verdict       = EXCLUDED.sell_verdict,
    latest_price_aud   = EXCLUDED.latest_price_aud,
    latest_date        = EXCLUDED.latest_date,
    computed_at        = EXCLUDED.computed_at,
    days_of_history    = EXCLUDED.days_of_history;

  GET DIAGNOSTICS v_processed = ROW_COUNT;

  RETURN QUERY SELECT v_processed, (p_offset + p_batch_size), (v_processed = 0);
END;
$function$;
