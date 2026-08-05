-- C3L-45: make a truncated signals run distinguishable from a finished one.
--
-- THE QUESTION THIS HAD TO ANSWER FIRST, because the fix depends on it: is an empty batch normal
-- or abnormal? It is NORMAL. `compute_mtg_signals_batch` selects a 500-wide window of card ids
-- by OFFSET, and once the offset passes the end of the catalogue the window is empty, nothing is
-- upserted, and `processed = 0` is exactly how the function signals "no more data". Exiting on it
-- is correct and must stay.
--
-- The abnormal case exists too and is the reason this finding was raised: a 500-card window
-- ENTIRELY made of cards filtered out by `card_stats` (NULL price_aud, or excluded_from_signals)
-- also yields `processed = 0`, and the loop would stop there and silently skip every card after
-- that offset. Measured on the live catalogue: 10,995 of 52,623 cards on the newest snapshot date
-- have a NULL price_aud, 20.9 per cent, but `card_batch` orders by `scryfall_id`, which is a
-- UUID, so they are scattered uniformly rather than clustered. The chance of 500 consecutive
-- filtered cards is therefore negligible and this is NOT currently firing.
--
-- So the defect is not that the loop stops. It is that a genuine truncation and a normal finish
-- look identical from the outside: both simply return a count, and nobody would know the
-- difference until a card's signals quietly went stale. That is the same shape as C3L-10 and
-- C3L-26, a failure with no signal attached, and it is what is fixed here.
--
-- THE FIX: count how many cards the run SHOULD have covered before starting, compare against what
-- it actually processed, and if the run came up short, RAISE WARNING and say so in the returned
-- string rather than reporting a clean finish. The comparison uses "fewer than expected", not
-- equality, because the total legitimately runs slightly ABOVE the eligible count: a card flagged
-- excluded_from_signals on one date still upserts from its other dates, which is why the last run
-- processed 41,636 against 41,628 eligible.
--
-- No behaviour changes on a healthy run. This only adds a check and a louder failure.
--
-- ROLLBACK: re-apply the C3L-43 version of this function, which is identical except that it has
-- no v_expected/v_short logic, no RAISE WARNING, and a shorter return string. Nothing else in the
-- function is touched, and no data is read or written differently.

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
  v_expected   INT := 0;   -- C3L-45
  v_short      BOOLEAN;    -- C3L-45
BEGIN
  SELECT MAX(snapshot_date) INTO v_max_date FROM mtg_price_snapshots;

  -- C3L-45: what a complete run should cover, measured before the loop runs.
  SELECT COUNT(DISTINCT scryfall_id) INTO v_expected
  FROM mtg_price_snapshots
  WHERE snapshot_date = v_max_date
    AND price_aud IS NOT NULL
    AND NOT excluded_from_signals;

  LOOP
    EXIT WHEN v_done;

    SELECT processed, next_offset, done
    INTO v_processed, v_next, v_done
    FROM compute_mtg_signals_batch(500, v_offset);

    v_offset := v_next;
    v_total  := v_total + v_processed;
    v_batches := v_batches + 1;

    -- Stopping here is correct: an empty batch is how end-of-data is signalled. Whether that
    -- was a real finish or a truncation is decided after the loop, not guessed at here.
    EXIT WHEN v_done OR v_processed = 0;
  END LOOP;

  -- C3L-43: expire verdicts for cards no longer in the newest snapshot. Relative to the newest
  -- snapshot that exists, never to today's date, so an outage cannot blank the catalogue.
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

  -- C3L-45: a short run is a truncation, not a finish. Say so loudly.
  v_short := (v_expected > 0 AND v_total < v_expected);

  IF v_short THEN
    RAISE WARNING 'update_mtg_signals_batched TRUNCATED: processed % of % expected cards in % batches, stopped at offset %. A batch came back empty before the end of the catalogue.',
      v_total, v_expected, v_batches, v_offset;
  END IF;

  RETURN format(
    'update_mtg_signals_batched: %s cards processed in %s batches, %s stale rows expired, expected %s, %s',
    v_total, v_batches, v_expired, v_expected,
    CASE WHEN v_short THEN 'TRUNCATED, ran short of the catalogue' ELSE 'complete' END);
END;
$function$;
