-- C3L-43: stop stale signal rows publishing a verdict as if it were current.
--
-- What was measured first, before deciding the fix. Of the 1,871 `mtg_signals` rows never
-- recomputed, ALL 1,871 are absent from the newest snapshot date, and 0 are cards that are
-- still syncing and falling through a gap inside compute_mtg_signals_batch. That second
-- category was checked directly and is genuinely empty: every card present on the newest
-- snapshot date with a usable price has a signal row, 0 missed. So this is purely a staleness
-- problem, not a function bug, and the fix is an expiry rather than a repair.
--
-- Why they stopped appearing: 829 of the 1,871 last traded below the sync's MIN_SNAPSHOT_USD
-- floor of 0.50 USD, so they stop being snapshotted by design. The other 1,042 were still above
-- the floor when last seen and drop out through ordinary catalogue churn. Checked for a cliff at
-- the gzipped-JSONL migration and there is none: attrition runs at a steady 50 to 150 cards per
-- day across the whole period, so this is not a regression from that change.
--
-- The consequence being fixed: 798 of those rows still carried a buy or sell verdict, computed
-- from data as old as 27 June, with `latest_date` up to five weeks behind the rest of the site.
-- `market-data.mjs` and `weekly-report-core.mjs` both read `buy_verdict`/`sell_verdict` and
-- NEITHER filters on `latest_date`, so `/market` and the weekly seller email were both
-- publishing them. The weekly email has no caching or pre-generation step, it queries live at
-- send time, so clearing the stored value is sufficient for both.
--
-- WHY CLEAR AT SOURCE rather than filter in each consumer: there are three consuming surfaces
-- and adding a staleness filter to each is three chances to forget one. This is the same C3L-27
-- lesson that removed three copies of the seven-day statistic. One mechanism, every consumer
-- inherits it.
--
-- THE STALENESS RULE, and why it is outage-safe: a row is stale when its card is absent from the
-- NEWEST SNAPSHOT DATE THAT EXISTS, not when it is old relative to today's calendar date. During
-- the 29 July to 3 August outage (C3L-11) there was no newer snapshot, so the newest date stayed
-- at 28 July and every card present on it stayed current. A calendar-based rule would have
-- blanked the entire catalogue's verdicts during that outage. This one does not.
--
-- Both `buy_verdict`/`sell_verdict` AND `days_of_history` are cleared. The verdicts are what
-- `/market` and the email read; `days_of_history` is what the card page's C3L-39 guard reads.
-- Clearing both means all three surfaces treat a stale row as "cannot say" rather than one of
-- them still showing "Mid-range price", which is a claim. Fully self-healing: if the card
-- reappears in a snapshot, the very next run recomputes and repopulates both.
--
-- ROLLBACK: re-apply the previous `update_mtg_signals_batched` body, which is identical to the
-- one below minus the expire_stale CTE block and its RAISE NOTICE. Nothing else changes. The
-- cleared values are all recomputable by definition, so no data is lost that a single run of the
-- job does not restore.

CREATE OR REPLACE FUNCTION public.update_mtg_signals_batched()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_offset     INT := 0;
  v_processed  INT;
  v_next       INT;
  v_done       BOOLEAN := FALSE;
  v_total      INT := 0;
  v_batches    INT := 0;
  v_max_date   DATE;
  v_expired    INT := 0;
BEGIN
  LOOP
    EXIT WHEN v_done;

    SELECT processed, next_offset, done
    INTO v_processed, v_next, v_done
    FROM compute_mtg_signals_batch(500, v_offset);

    v_offset := v_next;
    v_total  := v_total + v_processed;
    v_batches := v_batches + 1;

    EXIT WHEN v_done OR v_processed = 0;
  END LOOP;

  -- C3L-43: expire verdicts for cards that are no longer in the newest snapshot. Relative to
  -- the newest snapshot that exists, never to today's date, so an outage cannot blank the
  -- catalogue.
  SELECT MAX(snapshot_date) INTO v_max_date FROM mtg_price_snapshots;

  IF v_max_date IS NOT NULL THEN
    UPDATE mtg_signals s
    SET buy_verdict     = NULL,
        sell_verdict    = NULL,
        days_of_history = NULL
    WHERE (s.buy_verdict IS NOT NULL OR s.sell_verdict IS NOT NULL OR s.days_of_history IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM mtg_price_snapshots p
        WHERE p.scryfall_id = s.scryfall_id
          AND p.snapshot_date = v_max_date
      );
    GET DIAGNOSTICS v_expired = ROW_COUNT;
  END IF;

  RETURN format(
    'update_mtg_signals_batched: %s cards processed in %s batches, %s stale rows expired',
    v_total, v_batches, v_expired);
END;
$function$;
