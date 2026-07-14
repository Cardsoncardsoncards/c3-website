-- netlify/functions/migrations/create-accounts-and-follows.sql
-- task-109: accounts + unified follows (Sections 1 to 3 of the passwordless account
-- architecture reference). NOT YET APPLIED. Held for explicit approval.
--
-- Verified against the live database immediately before writing this:
--   card_price_alerts   0 rows
--   follow_magic_links  0 rows
--   subscribers         0 rows   (table already exists, keyed by email, UNIQUE(email))
--   auth.users          0 rows   (Supabase Auth is provisioned but UNUSED, so identity is
--                                 built here rather than on auth.users, and the existing
--                                 follow_magic_links pattern is generalised rather than a
--                                 second magic-link system being introduced)
--
-- Nothing in this migration destroys data, because every table it touches is empty.
-- It is additive plus two column changes on the empty follow_magic_links.

begin;

-- ---------------------------------------------------------------------------
-- 1. accounts. One row per person, free or paid. Created silently on first
--    follow. No password is required for the row to exist.
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  -- Optional and nullable, never set as a side effect of following something. Stays NULL
  -- for every account until a paid tier introduces an explicit "set a password" flow
  -- (Section 4 of the reference doc, deliberately out of scope for task-109).
  password_hash text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),

  -- The duplicate-identity bug, closed at the database rather than in application code.
  -- card-api.mjs had no .toLowerCase() anywhere, so Sam@x.com and sam@x.com were two
  -- different people. Normalising only in JS leaves the same hole open for the next writer
  -- who forgets. This CHECK makes a non-normalised email physically unstorable.
  constraint accounts_email_normalised check (email = lower(btrim(email))),
  constraint accounts_email_shape      check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

comment on table public.accounts is
  'One account per person, free or paid. Silently created on first follow, no email sent by the create step (task-109).';

-- ---------------------------------------------------------------------------
-- 2. follows. Replaces card_price_alerts for the follow feature. ONE table for
--    everyone: tier is never encoded by which table a row lives in, it is decided
--    at send time by checking subscribers. That is what makes upgrade/downgrade free.
--
--    NOTE: target-price alerts are NOT part of this table. They are a separate,
--    MTG-only feature backed by mtg_price_alerts (card-api.mjs handlePriceAlert), which
--    this migration deliberately does not touch. The vestigial alert_type='target'
--    branch on card_price_alerts was never used by any code path.
-- ---------------------------------------------------------------------------
create table if not exists public.follows (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.accounts(id) on delete cascade,

  game         text not null,
  card_slug    text not null,
  card_name    text,

  -- The reference doc's entity_id, as a stored generated column rather than a hand-built
  -- string. This gives the doc's exact UNIQUE (user_id, entity_id) while keeping game and
  -- card_slug as first-class, indexable columns that the nightly sender can filter on
  -- without parsing a composite key apart.
  entity_id    text generated always as (game || ':' || card_slug) stored,

  alert_types  text[] not null default array['price_move'],

  -- Double opt-in, carried over unchanged. Mail scanners prefetch links (Outlook Safe Links
  -- auto-confirmed a live test follow 14 seconds after send), so confirmation stays a POST.
  confirmed         boolean not null default false,
  confirmed_at      timestamptz,
  confirm_token     text,

  -- Soft delete: "stop emailing me about this". The follow row is preserved and simply
  -- excluded from sends. Distinct from a hard delete ("remove from my follows"), which
  -- deletes the row outright. The reference doc is explicit that conflating these is a bug.
  unsubscribe_token text not null default gen_random_uuid()::text,
  unsubscribed_at   timestamptz,

  -- An alert fires once per follow, then the user re-follows. Carried over unchanged.
  -- current_price is the price at the moment the alert fired, written by check-card-follows.
  triggered     boolean not null default false,
  triggered_at  timestamptz,
  current_price numeric,

  created_at   timestamptz not null default now(),

  -- The whole point of the rebuild. The old constraint was
  --   UNIQUE (email, game, card_slug, direction)
  -- and direction was ALWAYS NULL on follow rows. In Postgres NULL <> NULL inside a unique
  -- index, so duplicate follows silently succeeded. Every column here is NOT NULL
  -- (entity_id is generated from two NOT NULL columns), so the constraint actually binds.
  constraint follows_user_entity_key unique (user_id, entity_id)
);

comment on table public.follows is
  'Unified follow table for every tier. Tier is resolved at send time from subscribers, never by table membership (task-109).';
comment on column public.follows.unsubscribed_at is
  'Soft delete. Set = stop sending, keep the relationship. A hard delete removes the row entirely. Do not conflate.';

create index if not exists idx_follows_user           on public.follows (user_id);
-- The nightly sender's exact predicate: confirmed, not yet triggered, not unsubscribed.
create index if not exists idx_follows_due            on public.follows (confirmed, triggered, unsubscribed_at);
create index if not exists idx_follows_entity         on public.follows (game, card_slug);
create unique index if not exists idx_follows_unsub_token on public.follows (unsubscribe_token);
create index if not exists idx_follows_confirm_token  on public.follows (confirm_token);

-- ---------------------------------------------------------------------------
-- 3. follow_magic_links: generalise onto accounts instead of a raw email string.
--    Safe to do destructively because the table is empty (verified: 0 rows).
--    The 24 hour TTL is unchanged, it is already the proven pattern here.
-- ---------------------------------------------------------------------------
alter table public.follow_magic_links
  add column if not exists user_id uuid references public.accounts(id) on delete cascade;

alter table public.follow_magic_links
  alter column user_id set not null;

-- email now lives on accounts. Keeping a second copy here would let the two drift, which is
-- precisely the duplicate-identity failure this task exists to remove.
alter table public.follow_magic_links
  drop column if exists email;

create index if not exists idx_follow_magic_links_user on public.follow_magic_links (user_id);

-- ---------------------------------------------------------------------------
-- 4. RLS. Deliberately service_role ONLY, with no anon policy of any kind.
--
--    These tables hold email addresses and the anon key ships to every browser. The existing
--    PII tables get this right (card_price_alerts grants anon INSERT but NOT anon SELECT;
--    subscribers and follow_magic_links are service-only) and this migration keeps that.
--    card-api.mjs already writes follows with SUPABASE_SERVICE_KEY (supabasePost defaults to
--    useService = true), so no anon INSERT policy is needed here either.
-- ---------------------------------------------------------------------------
alter table public.accounts enable row level security;
alter table public.follows  enable row level security;

drop policy if exists service_all_accounts on public.accounts;
create policy service_all_accounts on public.accounts
  for all to service_role using (true) with check (true);

drop policy if exists service_all_follows on public.follows;
create policy service_all_follows on public.follows
  for all to service_role using (true) with check (true);

commit;

-- ---------------------------------------------------------------------------
-- NOT INCLUDED, ON PURPOSE
--
-- card_price_alerts is left in place. It is empty and, once card-api.mjs is cut over, it is
-- dead. Dropping it is irreversible and buys nothing today, so it should be a separate,
-- deliberate follow-up AFTER the new path is confirmed working in production:
--
--   -- drop table public.card_price_alerts;
--
-- Also deliberately not added: a used_at column on follow_magic_links for single-use tokens.
-- It is a real improvement (a magic link is currently replayable until it expires) but it is
-- a behaviour change nobody asked for in this task. Flagged for a follow-up.
-- ---------------------------------------------------------------------------
