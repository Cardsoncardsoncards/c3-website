-- netlify/functions/migrations/c3l226-price-snapshot-retention.sql
--
-- C3L-226. Give the 25 chart-serving *_price_snapshots tables a 120 day retention policy, and a
-- nightly pg_cron job to enforce it. Applied to the live database on 11 September 2026.
--
-- WHY THIS EXISTS. The 32 snapshot tables held 4,030 MB, 77.2 per cent of a 5,217 MB database,
-- and NOTHING had ever deleted a row from any of them. Combined write rate is about 149,200
-- rows/day, roughly 39.4 MB/day, which put the 8 GB crossing in mid to late November 2026.
--
-- WHY 120 DAYS, and why that number is not negotiable downwards. Four consumers read history,
-- and the deepest one sets the floor:
--   1. The price chart. All 25 chart-serving card pages query their snapshot table with a
--      90 day lower bound (shared/price-chart.mjs, CHART_WINDOW_DAYS = 90 in card-page.mjs:29,
--      and a literal 90 day gte in the other 24 card pages).
--   2. compute_mtg_signals_batch, RECENT_WINDOW_DAYS = 90.
--   3. The 8 nightly update_<game>_price_changes functions, which reach back 30 days.
--   4. MIN_SIGNAL_HISTORY_DAYS = 75 (card-page.mjs:52, market-data.mjs:239,
--      weekly-report-core.mjs:234). Below 75 days of history, Recent High, Recent Low and both
--      verdicts are withheld site-wide with no error. Live mtg_signals has a MEDIAN
--      days_of_history of 81 against its 90 day window, only 6 days above that floor, so this is
--      the tightest constraint in the system and the one that makes a cheap "just keep 90" wrong.
-- 90 is therefore the correctness floor and 120 is 90 plus a 30 day margin. The margin is what
-- absorbs a stalled sync, a backfill, or a run that is a few days late, without any of it
-- reaching the 75 day display floor.
--
-- WHY THE CUTOFF ANCHORS ON MAX(snapshot_date) AND NOT CURRENT_DATE. This is the C3L-34 rule,
-- applied to deletion rather than to reading. If a sync stalls for a week, a CURRENT_DATE anchor
-- keeps walking forward and eats into history that is still the newest data the site has, so a
-- stall would silently become data loss. Anchoring on the table's own newest row means a stalled
-- table simply stops being pruned, which is the safe direction to fail in.
--
-- THE 90 DAY GUARANTEE IS STRUCTURAL, NOT A HABIT. prune_price_snapshots refuses outright to run
-- with p_keep_days < 90. cutoff = MAX(snapshot_date) - (p_keep_days - 1), so p_keep_days >= 90
-- is exactly the condition cutoff <= MAX(snapshot_date) - 89. It is therefore not possible for
-- this job to leave fewer than 90 days of history for any card that had 90 days to begin with,
-- whatever argument a future caller passes.
--
-- WHAT THIS DOES NOT TOUCH. The 7 chartless games (dragonballz, godzilla, grandarchive,
-- hololive, warhammer, weissschwarz, wow) are NOT in the allow-list below. They render no chart
-- and have no consumer function, and they are handled separately and far more aggressively by
-- c3l227-chartless-snapshot-cleanup.sql.
--
-- DELETES ARE BATCHED BY ctid. mtg_price_snapshots keys on a uuid and the other 31 on a bigint,
-- so there is no one id column to page on; ctid works for every table and needs no index.

-- ---------------------------------------------------------------------------------------------
-- One parameterised prune, called once per table.
-- ---------------------------------------------------------------------------------------------
-- Adding p_cutoff changes the signature, and CREATE OR REPLACE would leave the earlier three
-- argument version in place beside it, making prune_price_snapshots('x') ambiguous. Drop it.
DROP FUNCTION IF EXISTS public.prune_price_snapshots(text, int, int);

-- p_cutoff EXISTS BECAUSE OF A MISTAKE MADE APPLYING THIS MIGRATION, and it is worth knowing.
-- The one-time backfill prune was paired with a local dump of the rows it would delete. The dump
-- pinned each table's cutoff to a literal date, but this function recomputed its own cutoff from
-- the LIVE MAX(snapshot_date). Between the two, the One Piece sync ran and moved that max forward
-- by a day, so the prune's cutoff moved with it and deleted 2026-05-14 as well: 7,348 rows
-- against the 3,713 that had been dumped. 3,635 rows were deleted with no backup copy.
-- Nothing about the nightly job is wrong here, recomputing from the live max is exactly what it
-- should do. The hazard is specific to pairing a delete with a dump taken earlier. When a caller
-- has already captured a set, it must be able to delete THAT set and not a freshly derived one,
-- so p_cutoff lets the caller pin the boundary. The 90 day guard applies to it either way.
CREATE OR REPLACE FUNCTION public.prune_price_snapshots(
  p_table     text,
  p_keep_days int DEFAULT 120,
  p_batch     int DEFAULT 20000,
  p_cutoff    date DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cutoff date;
  v_max    date;
  v_n      bigint;
  v_total  bigint := 0;
BEGIN
  -- The floor that makes the 90 day guarantee structural. See the header.
  IF p_keep_days < 90 THEN
    RAISE EXCEPTION
      'prune_price_snapshots: p_keep_days=% would retain less than the 90 days the price chart '
      'and the MTG signals window both require. Refusing.', p_keep_days;
  END IF;

  -- Only ever prune a table this migration knows about, and only a snapshots table.
  IF p_table !~ '^[a-z0-9]+_price_snapshots$' THEN
    RAISE EXCEPTION 'prune_price_snapshots: % is not a price snapshots table name.', p_table;
  END IF;

  EXECUTE format('SELECT MAX(snapshot_date) FROM %I', p_table) INTO v_max;
  IF v_max IS NULL THEN
    RAISE NOTICE 'prune_price_snapshots: % is empty, nothing to do.', p_table;
    RETURN 0;
  END IF;

  -- Inclusive window: keeping snapshot_date >= v_cutoff keeps exactly p_keep_days distinct dates.
  v_cutoff := COALESCE(p_cutoff, v_max - (p_keep_days - 1));

  -- The 90 day guarantee has to hold for a pinned cutoff too, otherwise p_cutoff would be a way
  -- around the guard above rather than a way to be precise about which rows are meant.
  IF v_cutoff > v_max - 89 THEN
    RAISE EXCEPTION
      'prune_price_snapshots: cutoff % on % would leave fewer than 90 days behind max %. Refusing.',
      v_cutoff, p_table, v_max;
  END IF;

  LOOP
    EXECUTE format(
      'DELETE FROM %I WHERE ctid = ANY(ARRAY(SELECT ctid FROM %I WHERE snapshot_date < $1 LIMIT $2))',
      p_table, p_table)
    USING v_cutoff, p_batch;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    EXIT WHEN v_n = 0;
  END LOOP;

  IF v_total > 0 THEN
    RAISE NOTICE 'prune_price_snapshots: % deleted % rows older than % (max %).',
      p_table, v_total, v_cutoff, v_max;
  END IF;
  RETURN v_total;
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- The driver. The allow-list IS the 25 chart-serving games, and nothing else belongs here.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prune_all_price_snapshots(p_keep_days int DEFAULT 120)
RETURNS TABLE (tbl text, deleted bigint)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_game text;
  -- The 25 games whose card page imports shared/price-chart.mjs. Verified by grep on
  -- 11 September 2026. The 8 that also run a nightly update_<game>_price_changes function
  -- (mtg, pokemon, yugioh, dragonball, onepiece, starwars, lorcana, riftbound) are in here too:
  -- all 25 need the same 90 days for the chart, so all 25 get the same 120 day window.
  v_games text[] := ARRAY[
    'mtg','pokemon','yugioh','lorcana','onepiece','dbsfusionworld','starwars','riftbound',
    'dragonball','digimon','vanguard','finalfantasy','forceofwill','buddyfight','shadowverse',
    'unionarena','universus','metazoo','wixoss','sorcery','alphaclash','gundam',
    'battlespiritssaga','bakugan','gateruler'
  ];
BEGIN
  FOREACH v_game IN ARRAY v_games LOOP
    tbl := v_game || '_price_snapshots';
    deleted := public.prune_price_snapshots(tbl, p_keep_days);
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prune_price_snapshots(text, int, int, date) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prune_all_price_snapshots(int)        FROM anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Schedule. Must land AFTER everything that still needs the full window on the same day.
--   0 20 * * *   update-mtg-price-changes-daily
--   10 to 40 20  the other 7 update-<game>-price-changes-daily jobs
--   0 21 * * *   update-mtg-signals-daily (update_mtg_signals_batched)
-- 23:00 leaves two clear hours after the signals batch starts. Even a prune that did race one of
-- those would be harmless, because it only removes rows older than 120 days and the deepest
-- reader reaches 90, but ordering it properly means never having to rely on that.
-- ---------------------------------------------------------------------------------------------
SELECT cron.schedule(
  'prune-price-snapshots-daily',
  '0 23 * * *',
  $$SELECT public.prune_all_price_snapshots()$$
);
