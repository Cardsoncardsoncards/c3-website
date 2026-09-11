-- netlify/functions/migrations/c3l222-traffic-retention-and-rollup.sql
--
-- C3L-222, Part D. Retention on card_views and page_views: a 90 day time cutoff on the raw
-- rows, with a daily rollup kept forever so the history is not simply thrown away.
--
-- WHY. Neither table had any retention or deletion at all, confirmed by grep across
-- migrations, scripts and every function file, and c3l-card-views-anon-read.sql:37 explicitly
-- deferred the question. On 10 to 11 September 2026 a single crawl put 114,213 rows into
-- card_views in 33 hours, 29 per cent of the table. Measured 11 September: card_views is
-- 387,707 rows and 180 MB, page_views 6,048 rows and 2,728 kB, against a 5.2 GB database on
-- an 8 GB included allowance. This is a hygiene and query-performance decision, NOT a cost
-- driven one. Nothing here is urgent on billing.
--
-- ON THE 90 DAYS. It was Claude.ai's suggested default in the 11 September session and NOT a
-- figure Sammy independently specified. It is recorded that way in the register too, so it is
-- not read as more settled than it is. Everything below is written to work at any window
-- length: the number appears once, as the p_retain_days default on prune_traffic_raw, and
-- changing it there changes the policy.
--
-- WHAT 90 DAYS ACTUALLY DELETES TODAY, measured before applying: 5,011 of 387,707 card_views
-- rows (1.3 per cent) and ZERO page_views rows, because page_views only starts on 8 August
-- 2026. So this does not shrink either table meaningfully right now. Its value is that
-- neither table can grow without bound from here, which is the failure this is here to
-- prevent rather than to repair.
--
-- ---------------------------------------------------------------------------------------
-- THE HONEST LIMIT OF THE ROLLUP, and it is broader than the task that commissioned it
-- assumed. `distinct_sessions` is exact ONLY at the exact grain it is stored:
-- (rollup_date, source_table, game, page_type, country). It cannot be summed:
--   * across DAYS, because a session spanning midnight, or a visitor returning on another
--     day, is counted once per day;
--   * across GAMES or PAGE TYPES, because one session that looks at an MTG card and then a
--     Pokemon card is counted in both rows;
--   * across COUNTRIES, for the same reason where geo is missing or changes.
-- `views` has none of these problems and is exact at every level of aggregation.
-- So: trend the sessions figure, do not quote it as a unique-visitor count.
--
-- AND IT IS NOT A ROUNDING ERROR. Measured on this site's own AU traffic, summing daily
-- distinct sessions over an ISO week overstates the true weekly figure by 36 to 53 PER CENT.
-- The full measurement is in the PART D.4 block at the foot of this file, and it is the
-- reason the weekly growth query was NOT moved onto this table.
-- ---------------------------------------------------------------------------------------

create table if not exists public.traffic_daily_rollup (
  -- The calendar day in SYDNEY time, matching how the growth queries already read this data.
  rollup_date       date        not null,
  source_table      text        not null check (source_table in ('card_views', 'page_views')),
  game              text,                    -- card_views only, NULL for page_views rows
  page_type         text,                    -- page_views only, NULL for card_views rows
  country           text,                    -- geo_country, NULL where geo is unknown
  views             integer     not null,
  distinct_sessions integer     not null,
  updated_at        timestamptz not null default now(),

  -- NULLS NOT DISTINCT is what makes the upsert idempotent (Postgres 17.6 here, the syntax
  -- needs 15+). Under the default NULLS DISTINCT every rerun would insert a NEW row for
  -- every card_views group, because page_type is NULL on all of them and NULL never equals
  -- NULL. The job is meant to be safe to rerun, so this matters more than it looks.
  constraint traffic_daily_rollup_key
    unique nulls not distinct (rollup_date, source_table, game, page_type, country)
);

create index if not exists traffic_daily_rollup_date_idx
  on public.traffic_daily_rollup (rollup_date);

-- Read-only public aggregate, no addresses, no user agents, no session ids, so it follows the
-- same posture as the rest of the reporting tables rather than the locked-down posture of the
-- identity tables.
alter table public.traffic_daily_rollup enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'traffic_daily_rollup'
       and policyname = 'traffic_daily_rollup_service_all'
  ) then
    create policy traffic_daily_rollup_service_all on public.traffic_daily_rollup
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------------------
-- rollup_traffic_day: aggregate ONE Sydney calendar day from both raw tables, by upsert.
-- Safe to rerun on a day already rolled up: it overwrites that day's figures rather than
-- adding to them, so a partial or failed run self heals on the next pass.
-- ---------------------------------------------------------------------------------------
create or replace function public.rollup_traffic_day(p_day date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  day_start timestamptz := (p_day::timestamp at time zone 'Australia/Sydney');
  day_end   timestamptz := ((p_day + 1)::timestamp at time zone 'Australia/Sydney');
  n_card    integer := 0;
  n_page    integer := 0;
begin
  insert into public.traffic_daily_rollup
    (rollup_date, source_table, game, page_type, country, views, distinct_sessions, updated_at)
  select p_day, 'card_views', cv.game, null, cv.geo_country,
         count(*)::integer, count(distinct cv.session_id)::integer, now()
    from public.card_views cv
   where cv.viewed_at >= day_start and cv.viewed_at < day_end
   group by cv.game, cv.geo_country
  on conflict on constraint traffic_daily_rollup_key do update
    set views = excluded.views,
        distinct_sessions = excluded.distinct_sessions,
        updated_at = now();
  get diagnostics n_card = row_count;

  insert into public.traffic_daily_rollup
    (rollup_date, source_table, game, page_type, country, views, distinct_sessions, updated_at)
  select p_day, 'page_views', null, pv.page_type, pv.geo_country,
         count(*)::integer, count(distinct pv.session_id)::integer, now()
    from public.page_views pv
   where pv.viewed_at >= day_start and pv.viewed_at < day_end
   group by pv.page_type, pv.geo_country
  on conflict on constraint traffic_daily_rollup_key do update
    set views = excluded.views,
        distinct_sessions = excluded.distinct_sessions,
        updated_at = now();
  get diagnostics n_page = row_count;

  return n_card + n_page;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- rollup_traffic_range: the backfill. Inclusive of both ends.
-- ---------------------------------------------------------------------------------------
create or replace function public.rollup_traffic_range(p_from date, p_to date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  d     date;
  total integer := 0;
begin
  d := p_from;
  while d <= p_to loop
    total := total + public.rollup_traffic_day(d);
    d := d + 1;
  end loop;
  return total;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- prune_traffic_raw: delete raw rows past the retention window, and ONLY for days that have
-- already been rolled up.
--
-- THE EXISTS CLAUSE IS THE WHOLE SAFETY PROPERTY, not a detail. A day whose rollup row is
-- missing, because the job failed, because it was never backfilled, or because someone
-- changed the window, is never deleted. The worst case is that raw rows survive longer than
-- the policy says, which is recoverable. The alternative failure, deleting a day that was
-- never summarised, is not.
-- ---------------------------------------------------------------------------------------
create or replace function public.prune_traffic_raw(p_retain_days integer default 90)
returns table (source text, deleted integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz := ((current_date - p_retain_days)::timestamp at time zone 'Australia/Sydney');
  n integer;
begin
  delete from public.card_views cv
   where cv.viewed_at < cutoff
     and exists (
       select 1 from public.traffic_daily_rollup r
        where r.source_table = 'card_views'
          and r.rollup_date = (cv.viewed_at at time zone 'Australia/Sydney')::date
     );
  get diagnostics n = row_count;
  source := 'card_views'; deleted := n; return next;

  delete from public.page_views pv
   where pv.viewed_at < cutoff
     and exists (
       select 1 from public.traffic_daily_rollup r
        where r.source_table = 'page_views'
          and r.rollup_date = (pv.viewed_at at time zone 'Australia/Sydney')::date
     );
  get diagnostics n = row_count;
  source := 'page_views'; deleted := n; return next;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- traffic_daily_maintenance: what pg_cron runs. Roll up yesterday FIRST, then prune. That
-- order is load bearing: the prune only removes days that already have a rollup row, so
-- rolling up first is what guarantees the boundary day is never lost.
-- ---------------------------------------------------------------------------------------
create or replace function public.traffic_daily_maintenance()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yesterday date := (now() at time zone 'Australia/Sydney')::date - 1;
  rolled    integer;
  pruned    integer := 0;
  r         record;
begin
  rolled := public.rollup_traffic_day(yesterday);
  for r in select * from public.prune_traffic_raw() loop
    pruned := pruned + r.deleted;
  end loop;
  return format('rolled %s rows for %s, pruned %s raw rows', rolled, yesterday, pruned);
end;
$$;

revoke all on function public.rollup_traffic_day(date) from public, anon, authenticated;
revoke all on function public.rollup_traffic_range(date, date) from public, anon, authenticated;
revoke all on function public.prune_traffic_raw(integer) from public, anon, authenticated;
revoke all on function public.traffic_daily_maintenance() from public, anon, authenticated;
grant execute on function public.rollup_traffic_day(date) to service_role;
grant execute on function public.rollup_traffic_range(date, date) to service_role;
grant execute on function public.prune_traffic_raw(integer) to service_role;
grant execute on function public.traffic_daily_maintenance() to service_role;

-- Scheduled at 15:30 UTC, which is 01:30 AEST and 02:30 AEDT, so it is always safely past
-- midnight in Sydney whichever side of daylight saving the date falls, and it does not
-- collide with the 20:00 to 21:00 UTC block of price-change jobs.
--   select cron.schedule('traffic-daily-maintenance', '30 15 * * *',
--                        $job$select public.traffic_daily_maintenance()$job$);
-- Registered separately rather than inside this file, so that re-running the migration
-- cannot create a duplicate schedule.

-- ---------------------------------------------------------------------------------------
-- PART D.4: THE WEEKLY AU GROWTH QUERY.
--
-- The task offered two options, rollup-for-everything or a hybrid, and said to pick the
-- simpler. MEASUREMENT CHANGED THE ANSWER, so the reasoning is recorded here rather than
-- just the result.
--
-- Measured 11 September 2026, live table against rollup, AU page_views by ISO week:
--
--   week start   views live / rollup     sessions live / rollup     session overcount
--   2026-08-03        50 / 50                  33 / 45                   +36 per cent
--   2026-08-10       377 / 377                108 / 165                  +53 per cent
--   2026-08-17       248 / 248                112 / 166                  +48 per cent
--   2026-08-24       254 / 254                121 / 183                  +51 per cent
--   2026-08-31       335 / 335                146 / 204                  +40 per cent
--
-- VIEWS MATCH EXACTLY, every week. SESSIONS DO NOT, and the gap is 36 to 53 per cent, not
-- the "slight" overcount the task anticipated. Summing a per-day distinct count over seven
-- days counts a returning visitor once per day they appear, and on this traffic most
-- visitors appear on more than one day.
--
-- SO THE ROLLUP-FOR-EVERYTHING OPTION IS REJECTED for the sessions figure. Adopting it would
-- have inflated Sammy's headline weekly number by about half, silently, in the same week the
-- number is being used to judge growth. It is kept for views, where it is exact.
--
-- CHOSEN: leave the existing query alone and add the rollup as the ARCHIVE, not as a
-- replacement. This is both the simplest to maintain and the only one that cannot change a
-- number behind the reader's back. It works because page_views begins on 8 August 2026 and
-- retention is 90 days, so the ENTIRE page_views history sits inside the window and query 1
-- stays exact. Nothing needs to change until data first ages out, which on a 90 day window
-- is about 6 November 2026.

-- QUERY 1, unchanged, EXACT for both figures. Correct for any range inside the window.
-- Confirmed 11 September 2026 to be completely unaffected by the first prune: page_views
-- lost ZERO rows, and the card_views rows that were deleted all predate 13 June 2026, which
-- is before page_views existed at all.
--
--   select date_trunc('week', (viewed_at at time zone 'Australia/Sydney'))::date as week_start,
--          count(*) as views,
--          count(distinct session_id) as sessions
--     from page_views
--    where geo_country = 'AU'
--    group by 1
--    order by 1;

-- QUERY 2, the archive. Use for any range reaching past the retention window. `views` is
-- exact at every level of aggregation. `sessions` is an UPPER BOUND once more than one day
-- is summed, by the 36 to 53 per cent measured above, and the column is named so that it
-- cannot be mistaken for the exact figure.
--
--   select date_trunc('week', rollup_date::timestamp)::date as week_start,
--          sum(views) as views,
--          sum(distinct_sessions) as sessions_upper_bound
--     from traffic_daily_rollup
--    where source_table = 'page_views' and country = 'AU'
--    group by 1
--    order by 1;
