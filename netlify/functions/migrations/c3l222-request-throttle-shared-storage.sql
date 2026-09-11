-- netlify/functions/migrations/c3l222-request-throttle-shared-storage.sql
--
-- C3L-222, Part A. Move the C3L-107 request throttle's counter out of an in-process Map and
-- into shared storage, so a count accumulated by one Netlify instance is visible to every
-- other one.
--
-- WHY THIS EXISTS. The throttle has been live since 8 August 2026 (8447180, 18a52c1) across
-- 98 function files, with thresholds that were correct for the traffic it was built for. On
-- 10 to 11 September 2026 a crawl blew both thresholds on 233 separate /24-hours, peaking at
-- 767 distinct paths, and was never throttled once, because the counter lived in
-- shared/request-throttle.mjs as a Map in one instance's memory while Netlify ran many. The
-- module's own header warned about exactly this. THE THRESHOLDS WERE NEVER THE PROBLEM, THE
-- STORAGE WAS. This migration changes WHERE the count lives and nothing else: 300 requests,
-- 150 distinct paths, 1500 for the declared AI tier and 400 tracked paths all stay as they
-- are.
--
-- THE WINDOW IS NOW CLOCK ALIGNED, and this is a real behaviour change forced by sharing.
-- The old Map started a block's window at its first request. Two instances cannot agree on
-- that without a round trip to discover it, so window_start is the request time floored to
-- the hour. A block therefore gets a fresh count on each hour boundary rather than an hour
-- after it first appeared. Window LENGTH is unchanged at one hour.

create table if not exists public.request_throttle_windows (
  -- The /24 (or /48 for IPv6) network from shared/request-fingerprint.mjs truncateIp().
  -- Deliberately the same key the module already fingerprints on, so this counter and the
  -- card_views provenance columns describe the same thing.
  source_block   text        not null,
  -- Request time floored to the hour. See the note above on clock alignment.
  window_start   timestamptz not null,
  request_count  integer     not null default 0,
  -- Distinct paths seen in this window. Appended to only when the path is not already
  -- present, so the array is distinct by construction and array_length IS the distinct
  -- count. Capped by the caller (p_max_paths) so one long crawl cannot grow a row without
  -- bound, which is the same guard MAX_TRACKED_PATHS gave the Map.
  paths          text[]      not null default '{}',
  -- Whether this block presented a declared AI assistant user agent at any point in the
  -- window. Recorded rather than trusted: the module still decides the ceiling from the
  -- user agent on the request in hand.
  ai_tier        boolean     not null default false,
  -- How many requests this block has had rejected in this window. Exists so exactly one
  -- sync_events telemetry row is written per block per window ACROSS ALL INSTANCES, which
  -- the in-memory version could only ever promise per instance.
  blocked_count  integer     not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (source_block, window_start)
);

-- Supports the hourly prune below, the only query here that does not go via the primary key.
create index if not exists request_throttle_windows_window_start_idx
  on public.request_throttle_windows (window_start);

-- Same posture as follow_magic_links: RLS on with NO policy, which fails closed. Only
-- service_role, which bypasses RLS, can reach this table. The anon key ships to every
-- browser, and a rate limiter the rate limited party can read or edit is not one.
alter table public.request_throttle_windows enable row level security;

-- ---------------------------------------------------------------------------------------
-- throttle_bump: count one request against a block's window and return the running totals.
--
-- ONE STATEMENT, NOT READ THEN WRITE. Concurrent instances calling this cannot lose an
-- increment: INSERT ... ON CONFLICT DO UPDATE takes a row lock, and RETURNING reports the
-- row as it stands after this call's own increment. A read-then-write would race and
-- undercount, and for a rate limiter undercounting means letting the crawl through.
-- ---------------------------------------------------------------------------------------
-- IT TAKES AN ARRAY AND AN INCREMENT, NOT ONE PATH, and that is not over-engineering. The
-- module holds a block's first LOCAL_GATE requests in instance memory and never touches the
-- network for them, because measurement showed that a round trip per request added about
-- 200ms to every card page. When a block does cross that gate the instance flushes
-- everything it held in ONE call, so the shared count stays EXACT rather than losing the
-- held requests. A one-request-per-call signature could not express that flush.
drop function if exists public.throttle_bump(text, timestamptz, text, integer, boolean);

create or replace function public.throttle_bump(
  p_block        text,
  p_window_start timestamptz,
  p_paths        text[],
  p_increment    integer default 1,
  p_max_paths    integer default 400,
  p_ai           boolean default false
)
returns table (request_count integer, distinct_paths integer)
language sql
security definer
set search_path = public
as $$
  insert into public.request_throttle_windows as w
    (source_block, window_start, request_count, paths, ai_tier, updated_at)
  values (
    p_block,
    p_window_start,
    greatest(coalesce(p_increment, 1), 1),
    (select array(
       select distinct u from unnest(coalesce(p_paths, '{}'::text[])) u
        where u is not null and u <> ''
        limit greatest(coalesce(p_max_paths, 400), 1)
     )),
    coalesce(p_ai, false),
    now()
  )
  on conflict (source_block, window_start) do update
    set request_count = w.request_count + greatest(coalesce(p_increment, 1), 1),
        paths = case
                  when p_paths is null or cardinality(p_paths) = 0            then w.paths
                  when coalesce(array_length(w.paths, 1), 0)
                       >= greatest(coalesce(p_max_paths, 400), 1)             then w.paths
                  else (select array(
                          select distinct u
                            from unnest(w.paths || p_paths) u
                           where u is not null and u <> ''
                           limit greatest(coalesce(p_max_paths, 400), 1)
                        ))
                end,
        ai_tier = w.ai_tier or coalesce(p_ai, false),
        updated_at = now()
  returning w.request_count, coalesce(array_length(w.paths, 1), 0);
$$;

-- ---------------------------------------------------------------------------------------
-- throttle_record_block: count one REJECTION and return the new total. The caller writes a
-- sync_events telemetry row only when this returns 1, so there is one row per block per
-- window however many instances are serving.
-- ---------------------------------------------------------------------------------------
create or replace function public.throttle_record_block(
  p_block        text,
  p_window_start timestamptz
)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.request_throttle_windows
     set blocked_count = blocked_count + 1,
         updated_at = now()
   where source_block = p_block
     and window_start = p_window_start
  returning blocked_count;
$$;

-- ---------------------------------------------------------------------------------------
-- throttle_prune_windows: drop windows that can no longer be consulted. Scheduled hourly,
-- see the cron registration at the foot of this file. Without it this table grows forever,
-- which is the exact failure card_views is being given a retention policy for in Part D of
-- the same task.
-- ---------------------------------------------------------------------------------------
create or replace function public.throttle_prune_windows()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.request_throttle_windows
   where window_start < now() - interval '2 hours';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- SECURITY DEFINER functions are callable by whoever holds EXECUTE, and the default grant is
-- to PUBLIC. Leaving that in place would turn each of these into an unauthenticated write
-- endpoint, which on an anti-abuse mechanism would be worse than the problem it solves.
revoke all on function public.throttle_bump(text, timestamptz, text[], integer, integer, boolean) from public, anon, authenticated;
revoke all on function public.throttle_record_block(text, timestamptz) from public, anon, authenticated;
revoke all on function public.throttle_prune_windows() from public, anon, authenticated;
grant execute on function public.throttle_bump(text, timestamptz, text[], integer, integer, boolean) to service_role;
grant execute on function public.throttle_record_block(text, timestamptz) to service_role;
grant execute on function public.throttle_prune_windows() to service_role;

-- Hourly prune, registered separately from this file so that re-running the migration cannot
-- create a duplicate schedule. Registered 11 September 2026 as cron jobid 16.
--   select cron.schedule('prune-throttle-windows', '7 * * * *',
--                        $job$select public.throttle_prune_windows()$job$);

-- ---------------------------------------------------------------------------------------
-- MEASURED, 11 September 2026, against real deploy previews of this repo. Recorded here
-- because the numbers are the justification for the pre-gate, and without them the next
-- reader will reasonably wonder why the module does not just call throttle_bump every time.
--
-- LATENCY, paired interleaved samples, control preview against changed preview, same
-- infrastructure, cache busted:
--   round trip on EVERY request        median +214ms, mean +383ms on a card page
--   unthrottled endpoint, same deploys  median  +21ms   (so the deploys are comparable)
--   with the local pre-gate             median  -50ms, mean -9ms   (baseline, no cost)
-- And the mechanism was confirmed rather than inferred: after 16 real card page loads with
-- the pre-gate live, request_throttle_windows contained ZERO rows, so zero round trips
-- happened.
--
-- SLOP, measured on the same deploy by bursting one /24 until it was rejected:
--   395 requests were served before the throttle engaged, against the 300 threshold.
--   MEASURED SLOP: 95 requests. At the moment of measurement 57 requests were still held
--   unflushed across instances, which implies at least 3 concurrent instances.
--   The worst case bound is 300 + (LOCAL_GATE - 1) x instances = 300 + 19 x instances.
-- THE 300 AND 150 THRESHOLDS ARE UNCHANGED. This slop is a known, bounded lateness in
-- DETECTION, not a quiet loosening of the limits, and no request goes uncounted: the flush
-- is what keeps the total exact. Against an actor who made 114,213 requests, being late by
-- roughly 95 is not the part that matters.
