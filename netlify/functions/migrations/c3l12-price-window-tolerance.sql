-- C3L-12: stop publishing a mislabelled price-change window.
--
-- The problem, confirmed against live data on 4 August 2026:
-- the previous version took MAX(snapshot_date) <= CURRENT_DATE - 7, which
-- returns the nearest OLDER snapshot no matter how far away it sits. The
-- 29 July to 3 August 2026 sync outage (C3L-01, C3L-11) left a six-day hole in
-- mtg_price_snapshots, so from 5 August the function would have published
-- windows of 8, 9, 10, 11, 12 and 13 days as price_change_7d, and from
-- 28 August windows of 31 to 36 days as price_change_30d. It had already
-- published a one-day movement as a seven-day change on 3 August. The value was
-- never NULL and never flagged, so a card page showed a confident "7 day
-- change" that was not one.
--
-- The fix has two parts:
--
-- 1. Anchor both comparison windows on the newest snapshot actually held
--    (snap_today) rather than on CURRENT_DATE. The window that matters is the
--    one between the two rows actually being compared. Anchoring on CURRENT_DATE
--    conflates a stale sync with a broken window and can null out a window that
--    is in fact correct.
--
-- 2. Require the window to be within TOLERANCE_DAYS of its nominal length, and
--    return NULL rather than a wrong number when it is not.
--
-- Tolerance is 1 day, chosen for the daily sync cadence: a healthy system has an
-- exact match, and one day absorbs a single missed run without materially
-- misstating the window. Allowing 2 or more would start presenting a nine-day
-- movement as a weekly one, which is the defect this fixes.
--
-- ROLLBACK: re-apply the previous definition, which is identical to this one
-- except that snap_7d and snap_30d read `CURRENT_DATE - 7` and
-- `CURRENT_DATE - 30` instead of `snap_today - 7` and `snap_today - 30`, and the
-- ok_7d / ok_30d guards and the TOLERANCE_DAYS constant are absent. The previous
-- definition is preserved verbatim in C3_FINDINGS_REGISTER.md under C3L-12.
-- No schema, table or column is touched by this change, only one function body,
-- so the rollback holds no lock and loses no data.

CREATE OR REPLACE FUNCTION public.update_mtg_price_changes()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  TOLERANCE_DAYS constant int := 1;
  snap_today  date;
  snap_7d     date;
  snap_30d    date;
  ok_7d       boolean;
  ok_30d      boolean;
BEGIN
  SELECT MAX(snapshot_date) INTO snap_today
  FROM mtg_price_snapshots
  WHERE snapshot_date <= CURRENT_DATE;

  IF snap_today IS NULL THEN RETURN; END IF;

  SELECT MAX(snapshot_date) INTO snap_7d
  FROM mtg_price_snapshots
  WHERE snapshot_date <= snap_today - 7;

  SELECT MAX(snapshot_date) INTO snap_30d
  FROM mtg_price_snapshots
  WHERE snapshot_date <= snap_today - 30;

  -- snap_7d is always at or older than snap_today - 7 by construction, so only
  -- the far side needs bounding. A NULL anchor (not enough history yet) fails
  -- closed to NULL rather than computing against nothing.
  ok_7d  := snap_7d  IS NOT NULL AND (snap_today - snap_7d)  <= 7  + TOLERANCE_DAYS;
  ok_30d := snap_30d IS NOT NULL AND (snap_today - snap_30d) <= 30 + TOLERANCE_DAYS;

  WITH
    pnow AS (
      SELECT scryfall_id, price_usd
      FROM mtg_price_snapshots
      WHERE snapshot_date = snap_today
        AND price_usd IS NOT NULL AND price_usd > 0
    ),
    p7 AS (
      SELECT scryfall_id, price_usd
      FROM mtg_price_snapshots
      WHERE ok_7d
        AND snapshot_date = snap_7d
        AND price_usd IS NOT NULL AND price_usd > 0
    ),
    p30 AS (
      SELECT scryfall_id, price_usd
      FROM mtg_price_snapshots
      WHERE ok_30d
        AND snapshot_date = snap_30d
        AND price_usd IS NOT NULL AND price_usd > 0
    )
  UPDATE mtg_cards c
  SET
    price_change_7d = CASE
      WHEN p7.price_usd > 0
      THEN ROUND(((pnow.price_usd - p7.price_usd) / p7.price_usd * 100)::numeric, 2)
      ELSE NULL
    END,
    price_change_30d = CASE
      WHEN p30.price_usd > 0
      THEN ROUND(((pnow.price_usd - p30.price_usd) / p30.price_usd * 100)::numeric, 2)
      ELSE NULL
    END
  FROM pnow
  LEFT JOIN p7  ON p7.scryfall_id  = pnow.scryfall_id
  LEFT JOIN p30 ON p30.scryfall_id = pnow.scryfall_id
  WHERE c.scryfall_id = pnow.scryfall_id;

END;
$function$;
