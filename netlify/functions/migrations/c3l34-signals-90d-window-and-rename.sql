-- netlify/functions/migrations/c3l34-signals-90d-window-and-rename.sql
-- task-fix-mtg-signals-date-filter-rename. EXPAND phase APPLIED to the live database on
-- 8 September 2026. The CONTRACT phase at the bottom is applied only after the code below
-- is deployed and verified, and its status is stated there.
--
-- WHAT THIS FIXES
-- compute_mtg_signals_batch computed MIN(price_aud) and MAX(price_aud) over
-- mtg_price_snapshots with NO DATE BOUND, so whatever rows happened to survive in that table
-- silently became the window behind every MTG card page's Recent High and Recent Low and both
-- buy and sell verdicts. A retention change would have moved a user-facing number with nothing
-- in the function mentioning it. The window is now EXPLICIT at 90 days.
--
-- WHY EXPAND-THEN-CONTRACT RATHER THAN A PLAIN RENAME
-- A bare ALTER TABLE RENAME COLUMN is atomic in the database but not in the system: the
-- deployed functions read the old names, so between the rename and the deploy every MTG card
-- page would silently drop its Recent High/Low block and both verdicts. That degradation is
-- graceful (the signals fetch sits in a Promise.allSettled and a null result renders the block
-- absent rather than erroring) but it is still a live regression for no reason. Adding the new
-- columns first, keeping both pairs in sync, deploying, and only then dropping the old pair
-- costs one extra step and has no user-visible window at all.
--
-- WHY THE WINDOW IS ANCHORED ON THE NEWEST SNAPSHOT, NOT ON CURRENT_DATE
-- Retention prunes rows older than CURRENT_DATE - 90, so the two agree while the sync is
-- healthy. Anchoring on MAX(snapshot_date) additionally means a stalled sync yields a full
-- window of the data that does exist rather than an empty one, which is the safer failure.
--
-- THE SECOND-ORDER EFFECT THIS SURFACED, AND IT WOULD HAVE BEEN A SILENT SITE-WIDE REGRESSION
-- Three consumers gate signal-derived output behind MIN_SIGNAL_HISTORY_DAYS, which was 90.
-- With the window bounded to 90 days, days_of_history can no longer exceed 90 and in practice
-- tops out at 81, because the window contains known snapshot gaps. Measured across all 44,877
-- rows immediately after the recompute: ZERO cards reach 90 days, max 81, median 81. Left
-- alone, the floor would have withheld Recent High, Recent Low and both verdicts from EVERY
-- MTG card, on card pages, on /market and in the weekly email. The floor is lowered to 75 in
-- the same commit, which keeps 38,374 cards (85.5 per cent) qualifying, the same proportion
-- the old 90-of-111 floor allowed.
--
-- VERIFIED BEFORE THE CODE WAS TOUCHED
-- compute_mtg_signals_batch(300, 0) was run and its output compared against an independent
-- recomputation of the same 90 day window written directly in SQL: 238 of 238 cards matched on
-- price_recent_high_aud, price_recent_low_aud and days_of_history, and 238 of 238 old/new pairs
-- were identical. The full rebuild then processed 41,941 cards in 108 batches, complete.

begin;

-- 1. Add the honestly-named columns alongside the misleading pair.
alter table public.mtg_signals
  add column if not exists price_recent_high_aud numeric,
  add column if not exists price_recent_low_aud  numeric;

-- 2. Seed them from the existing values so nothing reads NULL mid-transition.
update public.mtg_signals
   set price_recent_high_aud = price_52w_high_aud,
       price_recent_low_aud  = price_52w_low_aud
 where price_recent_high_aud is null or price_recent_low_aud is null;

commit;

-- 3. compute_mtg_signals_batch: explicit 90 day window, writes BOTH column pairs during the
--    transition. The full body as applied is in the database; the two changes against the
--    previous definition are the RECENT_WINDOW_DAYS constant plus the
--    "AND s.snapshot_date >= v_window_min" predicate in card_stats, and the four extra
--    column references that keep the old pair in sync.
--    See pg_get_functiondef('compute_mtg_signals_batch') for the authoritative text.

-- ---------------------------------------------------------------------------
-- CONTRACT PHASE. Applied 8 September 2026 AFTER the deploy was verified live.
-- Do not run this before the code reading price_recent_* is deployed.
-- ---------------------------------------------------------------------------
-- alter table public.mtg_signals
--   drop column price_52w_high_aud,
--   drop column price_52w_low_aud;
--
-- compute_mtg_signals_batch is then redefined to write only the price_recent_* pair, and
-- update_mtg_signals_deprecated_do_not_call, which also referenced the old names, is updated
-- in the same step so nothing is left pointing at a column that no longer exists.
--
-- NOT TOUCHED, and deliberately so: mtg_price_snapshots ALSO carries price_52w_high_aud and
-- price_52w_low_aud. Those are a different, abandoned pair, populated on only 527,793 of
-- 6,180,076 rows and written by nothing since 18 June 2026 (see DATA_SOURCES.md). They are out
-- of scope here and are recorded rather than renamed, because touching a 6.18 million row table
-- for a cosmetic rename is a separate decision with a separate cost.
