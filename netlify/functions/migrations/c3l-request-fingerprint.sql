-- Request fingerprint capture: card_views columns + the signup_attempts table.
--
-- Context for anyone reading this later:
--
-- 1. card_views already had a country_code column. It is NOT reused here. Every one of the
--    20,422 rows written between 4 May and 6 Aug 2026 holds the literal string 'AU', because
--    card-api.mjs hardcoded it rather than reading anything off the request. That column is
--    100% fabricated, and nothing in the repo reads it. Writing real values into it would
--    make it permanently unanalysable: a genuine AU row would be indistinguishable from a
--    fabricated one. So geo_country is a NEW column that is clean from its first row, and
--    country_code is left in place, quarantined, as a record of what was actually collected.
--
-- 2. There was no table recording signup attempts at all. The per-IP signup limiter added in
--    C3L-90 Step C keeps its counters in an in-memory Map inside one serverless instance, so
--    it forgets everything on cold start and has never written a durable row. The bot farm
--    that produced ~180 signups in eight days left no request-level trace anywhere. This
--    table is where that trace goes from now on.
--
-- 3. ip_address holds a TRUNCATED address (IPv4 /24, IPv6 /48), not the full one. See the
--    reasoning in shared/request-fingerprint.mjs. It is still personal information.

-- --- card_views -------------------------------------------------------------------------
alter table public.card_views add column if not exists user_agent  text;
alter table public.card_views add column if not exists ip_address  text;
alter table public.card_views add column if not exists geo_country text;
alter table public.card_views add column if not exists geo_city    text;

comment on column public.card_views.country_code is
  'LEGACY, DO NOT USE. Hardcoded to ''AU'' by card-api.mjs for every row written before Aug 2026. Superseded by geo_country.';
comment on column public.card_views.ip_address is
  'Truncated client address (IPv4 /24, IPv6 /48). Personal information. Populated from Aug 2026 onward; NULL for earlier rows.';

-- Bot-vs-person triage reads these two together, most recent first.
create index if not exists card_views_viewed_at_idx  on public.card_views (viewed_at desc);
create index if not exists card_views_ip_address_idx on public.card_views (ip_address) where ip_address is not null;

-- --- signup_attempts --------------------------------------------------------------------
create table if not exists public.signup_attempts (
  id           bigint generated always as identity primary key,
  email        text,                                    -- null when the attempt had no parseable address
  outcome      text        not null,                    -- vocabulary is fixed in shared/request-fingerprint.mjs
  user_agent   text,
  ip_address   text,                                    -- truncated; see note 3 above
  geo_country  text,
  geo_city     text,
  attempted_at timestamptz not null default now()
);

-- Deliberately NO check constraint on outcome. This insert sits in the signup request path,
-- and a constraint violation would throw away the very record of an attempt nobody
-- anticipated, which is exactly the attempt worth keeping. The vocabulary is held in code
-- instead, in one place, so it cannot drift per caller.

comment on table public.signup_attempts is
  'One row per signup attempt, successful or rejected. Holds email addresses and truncated IPs: service_role only.';

create index if not exists signup_attempts_attempted_at_idx on public.signup_attempts (attempted_at desc);
create index if not exists signup_attempts_ip_address_idx   on public.signup_attempts (ip_address, attempted_at desc) where ip_address is not null;
create index if not exists signup_attempts_email_idx        on public.signup_attempts (email) where email is not null;

-- RLS: this table holds email addresses and client addresses, and the anon key ships to every
-- browser. Same posture as accounts/follows/subscribers: service_role only, fails closed.
alter table public.signup_attempts enable row level security;

drop policy if exists signup_attempts_service_all on public.signup_attempts;
create policy signup_attempts_service_all
  on public.signup_attempts
  for all
  to service_role
  using (true)
  with check (true);
