-- C3L-25: give update_price_stats a minimum-sample guard.
--
-- The problem, confirmed against live data on 4 August 2026 (UTC):
-- price_7d_avg_aud and price_30d_avg_aud were plain AVG()s over a date RANGE, with no check that
-- the range actually contained enough days to average. After the 29 July to 3 August outage
-- (C3L-11) the seven day window held exactly 2 distinct snapshot days, 28 July and 4 August, so
-- the site was publishing a two-sample figure as a "7 day average". Unlike C3L-12 this is not a
-- mislabelled window, it is a real window with too little in it, which is why it needed its own
-- fix rather than the same one.
--
-- Thresholds, reasoned from the daily sync cadence rather than picked round:
--   7 day average  requires at least 4 distinct days, a majority of the nominal 7.
--   30 day average requires at least 15 distinct days, a majority of the nominal 30.
-- A majority is the weakest bar that still guarantees the average describes most of the period it
-- claims to. Requiring the full count would blank these figures after any single missed sync,
-- which is the same over-strictness rejected when choosing C3L-12's 1 day tolerance. Below the
-- bar the value is NULL, not a smaller-window average quietly relabelled.
--
-- Deliberately NOT changed here: price_52w_high_aud, price_52w_low_aud, and the buy_verdict and
-- sell_verdict that derive from them. Those have a related small-sample exposure, a "52 week
-- high" drawn from a few weeks of history is also overstating its window, but gating them would
-- flip verdicts to insufficient_data across the whole catalogue, which is a visible product
-- change rather than a correctness fix. Logged as C3L-34 instead of bundled in here.
--
-- ROLLBACK: re-apply the previous definition, which is identical except that avg_7d and avg_30d
-- are unguarded AVG(...) FILTER expressions and the two sample-count columns do not exist. The
-- previous definition is preserved verbatim in C3_FINDINGS_REGISTER.md under C3L-25. This
-- replaces one function body, touches no schema and no data, and holds no lock on any table.

CREATE OR REPLACE FUNCTION public.update_price_stats()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  MIN_SAMPLES_7D  constant int := 4;
  MIN_SAMPLES_30D constant int := 15;
BEGIN
  -- Update 52-week high/low and averages on the most recent snapshot per card
  UPDATE mtg_price_snapshots snap
  SET
    price_52w_high_aud = stats.high_52w,
    price_52w_low_aud = stats.low_52w,
    price_7d_avg_aud  = CASE WHEN stats.days_7d  >= MIN_SAMPLES_7D  THEN stats.avg_7d  ELSE NULL END,
    price_30d_avg_aud = CASE WHEN stats.days_30d >= MIN_SAMPLES_30D THEN stats.avg_30d ELSE NULL END,
    sell_verdict = CASE
      WHEN stats.range_52w > 0 AND snap.price_aud IS NOT NULL THEN
        CASE
          WHEN (snap.price_aud - stats.low_52w) / stats.range_52w >= 0.85 THEN 'near_high'
          WHEN (snap.price_aud - stats.low_52w) / stats.range_52w <= 0.20 THEN 'near_low'
          ELSE 'mid_range'
        END
      ELSE 'insufficient_data'
    END,
    buy_verdict = CASE
      WHEN stats.range_52w > 0 AND snap.price_aud IS NOT NULL THEN
        CASE
          WHEN (snap.price_aud - stats.low_52w) / stats.range_52w <= 0.20 THEN 'good_entry'
          WHEN (snap.price_aud - stats.low_52w) / stats.range_52w >= 0.85 THEN 'wait'
          ELSE 'fair_value'
        END
      ELSE 'insufficient_data'
    END
  FROM (
    SELECT
      scryfall_id,
      MAX(price_aud) FILTER (WHERE snapshot_date >= CURRENT_DATE - INTERVAL '365 days') AS high_52w,
      MIN(price_aud) FILTER (WHERE snapshot_date >= CURRENT_DATE - INTERVAL '365 days' AND price_aud > 0) AS low_52w,
      AVG(price_aud) FILTER (WHERE snapshot_date >= CURRENT_DATE - INTERVAL '7 days') AS avg_7d,
      AVG(price_aud) FILTER (WHERE snapshot_date >= CURRENT_DATE - INTERVAL '30 days') AS avg_30d,
      -- Distinct days, not row count, so a card with several rows on one date cannot look like a
      -- well-sampled week.
      COUNT(DISTINCT snapshot_date) FILTER (WHERE snapshot_date >= CURRENT_DATE - INTERVAL '7 days'
                                              AND price_aud IS NOT NULL) AS days_7d,
      COUNT(DISTINCT snapshot_date) FILTER (WHERE snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
                                              AND price_aud IS NOT NULL) AS days_30d,
      COALESCE(
        MAX(price_aud) FILTER (WHERE snapshot_date >= CURRENT_DATE - INTERVAL '365 days') -
        MIN(price_aud) FILTER (WHERE snapshot_date >= CURRENT_DATE - INTERVAL '365 days' AND price_aud > 0),
        0
      ) AS range_52w
    FROM mtg_price_snapshots
    GROUP BY scryfall_id
  ) stats
  WHERE snap.scryfall_id = stats.scryfall_id
    AND snap.snapshot_date = CURRENT_DATE;
END;
$function$;
