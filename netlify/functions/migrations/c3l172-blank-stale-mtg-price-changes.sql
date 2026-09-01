-- C3L-172: blank price_change_7d and price_change_30d on MTG cards that have no current price.
--
-- STATUS: NOT YET APPLIED. Written 1 September 2026, staged for review and a rehearsed run.
-- Every other migration in this directory records the date it was applied. This one does not,
-- deliberately, and must not be described as live until someone adds that line after running it.
--
-- THE DEFECT
-- update_mtg_price_changes() computes the 7 and 30 day change correctly: it anchors on real
-- snapshot dates at a fixed offset and refuses the window when the nearest snapshot is outside
-- TOLERANCE_DAYS, which is the C3L-12 fix and is not in question here. The defect is the final
-- line of its UPDATE:
--
--     WHERE c.scryfall_id = pnow.scryfall_id;
--
-- `pnow` is only the cards present in TODAY's priced snapshot. A card that drops out of pricing
-- is never visited again, so it keeps whatever price_change_7d it last had, permanently, and
-- nothing in the system will ever clear it.
--
-- MEASURED 1 September 2026, against the 2026-08-31 snapshot:
--   41,848 cards are in the priced snapshot, and 41,433 of them carry a price_change_7d.
--   57,989 cards are NOT, and 40,614 of them STILL carry one.
--
-- Worse than stale, and this is the part that argues for fixing it: a sample of those 40,614
-- carries the value 0, not an old percentage. Choose Your Champion, Crystal Ball, Swamp,
-- Austere Command, Bushy Bodyguard and Migratory Route were all last priced on 2026-06-06,
-- 87 days before that snapshot, and every one of them currently reports a 7 day change of 0.
-- A reader sees "no movement this week". The truth is "no price for three months". A blank is
-- the honest rendering, and card-page.mjs already renders nothing at all when the value is NULL.
--
-- NOTE the earlier half of C3L-172 has resolved itself. On 11 August exactly 0 of the cards in
-- the priced snapshot carried a 7 day figure, because a four day sync gap put the lookback
-- outside tolerance. That gap has closed and 41,433 of 41,848 now carry one. Only the residual
-- described above is still open, and only this statement addresses it.
--
-- WHAT THIS CHANGES
-- One additional statement at the end of the function. The existing computation is untouched,
-- byte for byte. The new statement can only ever write NULL, and only to rows that have no
-- price in the current snapshot, so it cannot alter a figure belonging to a currently priced
-- card and cannot affect price_usd, price_aud or any snapshot row.

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

  -- C3L-172. Everything above is unchanged. This is the whole of the fix.
  -- A card with no price in today's snapshot has no knowable 7 or 30 day change, so it must
  -- carry NULL rather than the last figure it happened to hold. The NOT EXISTS mirrors pnow's
  -- own definition exactly, so the two can never disagree about what "priced today" means.
  UPDATE mtg_cards c
  SET price_change_7d = NULL,
      price_change_30d = NULL
  WHERE (c.price_change_7d IS NOT NULL OR c.price_change_30d IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1 FROM mtg_price_snapshots s
      WHERE s.scryfall_id = c.scryfall_id
        AND s.snapshot_date = snap_today
        AND s.price_usd IS NOT NULL AND s.price_usd > 0
    );

END;
$function$;

-- EXPECTED EFFECT ON FIRST RUN, so the result can be checked rather than assumed:
--   Before: 40,614 cards not in the priced snapshot carry a price_change_7d.
--   After:  that count should be 0, and the count for cards IN the snapshot should be
--           unchanged at roughly 41,433. Any movement in the second number means the new
--           statement has reached rows it should not, and the run should be rolled back.
--
-- VERIFY WITH:
--   WITH snap AS (SELECT MAX(snapshot_date) d FROM mtg_price_snapshots),
--        pt AS (SELECT scryfall_id FROM mtg_price_snapshots, snap
--               WHERE snapshot_date = snap.d AND price_usd > 0)
--   SELECT count(*) FILTER (WHERE scryfall_id IN (SELECT scryfall_id FROM pt)
--                             AND price_change_7d IS NOT NULL) AS in_snapshot_with_7d,
--          count(*) FILTER (WHERE scryfall_id NOT IN (SELECT scryfall_id FROM pt)
--                             AND price_change_7d IS NOT NULL) AS stale_residual
--   FROM mtg_cards;
--
-- ROLLBACK, restoring the function exactly as it stood before this migration: re-run the
-- CREATE OR REPLACE above with the final UPDATE statement (the block introduced by the
-- "C3L-172. Everything above is unchanged" comment) deleted. Nothing else in the body differs,
-- so removing that one statement returns the function to its pre-migration definition. No data
-- restore is possible or needed: the statement only ever writes NULL, and the values it clears
-- were unknowable rather than correct.
