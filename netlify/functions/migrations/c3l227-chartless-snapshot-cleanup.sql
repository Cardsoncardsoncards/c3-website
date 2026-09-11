-- netlify/functions/migrations/c3l227-chartless-snapshot-cleanup.sql
--
-- C3L-227. One-time clear of price history for the 7 games that render no chart and have no
-- consumer of any kind, keeping only the single most recent snapshot row per card.
-- Applied to the live database on 11 September 2026.
--
-- THE 7 GAMES: dragonballz, godzilla, grandarchive, hololive, warhammer, weissschwarz, wow.
-- They are the 32 games minus the 25 whose card page imports shared/price-chart.mjs.
--
-- THE DEPENDENCY CHECK THAT AUTHORISED THIS, done before a row was deleted, table by table:
--   Repo:    the ONLY reference to any of these 7 tables anywhere in netlify/functions is the
--            game's own sync-<game>-background.mjs, and every one of them WRITES only, through
--            supabaseUpsertSnapshots, a blind POST with on_conflict=card_id,snapshot_date and
--            Prefer: resolution=merge-duplicates. No sync reads a previous snapshot row.
--   Deltas:  price_change_7d and price_change_30d on these tables are copied straight off the
--            upstream API payload (price.price_change_7d), NOT computed from history here. That
--            matters, because a day-over-day delta computed locally WOULD have been a dependency.
--   Database: zero functions, zero views, zero triggers, zero cron jobs and zero foreign keys
--            reference any of the 7 tables. Checked against pg_proc, pg_class, pg_trigger,
--            cron.job and pg_constraint, not by memory.
--   Workflows: no .github/workflows file names them.
--
-- THE ONE READER THAT DOES EXIST, and why it is why we keep a row rather than truncate.
-- scripts/sync-health-check.mjs Signal A reads, for ALL 32 games including these 7:
--     <game>_price_snapshots?select=snapshot_date&order=snapshot_date.desc&limit=1
-- It needs only the newest snapshot_date, but it treats a table with no rows as a hard failure
-- ("EMPTY, no snapshots at all"), and the script exits 1 if fewer than 32 games are discovered.
-- So a full TRUNCATE would have broken the sync health check for 7 of 32 games. Keeping the
-- latest row per card leaves MAX(snapshot_date) exactly as it was and Signal A unaffected.
--
-- WHY "LATEST PER CARD" AND NOT "EVERYTHING BEFORE THE LATEST DATE", which would have been one
-- cheap date predicate. Because they are not the same set, and the difference is destructive.
-- More than half of Weiss Schwarz cards, 12,199 of 23,048, have stopped being synced and their
-- newest row is OLDER than the table's newest row. A blanket date filter would have deleted the
-- only surviving price for every one of them. Per card is the correct predicate and the only
-- safe one.
--
-- THE DELETE CANNOT ORPHAN A CARD. It removes rows where row_number() over a per card partition
-- is greater than 1, so rank 1 is retained by construction, whatever the batch size and however
-- many times the function runs.
--
-- NO ONGOING JOB IS ADDED FOR THESE 7. Nothing reads their history, so there is nothing to
-- retain. They accumulate one row per card per day again from tomorrow, about 3,100 rows/day
-- combined, which is roughly 0.8 per cent of the 149,200 rows/day the 32 tables write. If that
-- is ever worth capping, it is a scheduled call to this same function, not a new mechanism.

DROP FUNCTION IF EXISTS public.cleanup_chartless_snapshots(text, bigint, int);

CREATE OR REPLACE FUNCTION public.cleanup_chartless_snapshots(
  p_table  text,
  p_max_id bigint,
  p_batch  int DEFAULT 20000
) RETURNS bigint
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n     bigint;
  v_total bigint := 0;
  -- Hard allow-list. These 7 and nothing else. A chart-serving table reaching this function
  -- would be a catastrophe, so it is refused by name rather than by the caller being careful.
  v_allowed text[] := ARRAY[
    'dragonballz_price_snapshots','godzilla_price_snapshots','grandarchive_price_snapshots',
    'hololive_price_snapshots','warhammer_price_snapshots','weissschwarz_price_snapshots',
    'wow_price_snapshots'
  ];
BEGIN
  IF NOT (p_table = ANY(v_allowed)) THEN
    RAISE EXCEPTION
      'cleanup_chartless_snapshots: % is not one of the 7 chartless games. Refusing.', p_table;
  END IF;

  -- p_max_id pins the set to the rows that were dumped to local CSV before this ran, so a sync
  -- landing mid run cannot widen the delete beyond what was backed up. This is the guard the
  -- One Piece prune in C3L-226 did not have.
  LOOP
    EXECUTE format(
      'DELETE FROM %I WHERE ctid = ANY(ARRAY('
      || 'SELECT ctid FROM ('
      || '  SELECT ctid, row_number() OVER (PARTITION BY card_id ORDER BY snapshot_date DESC, id DESC) AS rn'
      || '  FROM %I WHERE id <= $1'
      || ') q WHERE rn > 1 LIMIT $2))',
      p_table, p_table)
    USING p_max_id, p_batch;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    EXIT WHEN v_n = 0;
  END LOOP;

  RAISE NOTICE 'cleanup_chartless_snapshots: % deleted % rows, keeping the latest per card.',
    p_table, v_total;
  RETURN v_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_chartless_snapshots(text, bigint, int)
  FROM anon, authenticated;

-- Applied once, with the id pins captured at dump time:
--   weissschwarz 438209, grandarchive 88757, hololive 60993, wow 49693,
--   godzilla 31203, dragonballz 17130, warhammer 2716.
