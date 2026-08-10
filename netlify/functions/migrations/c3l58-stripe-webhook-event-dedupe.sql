-- C3L-58: insert-first replay guard for the Stripe webhook.
-- Applied to the live database on 6 August 2026 (Task 16), as migration
-- `c3l58_stripe_webhook_event_dedupe`. This file is the repo's record of it.
--
-- WHY
-- Stripe's delivery guarantee is at-least-once. The same event_id WILL arrive more than once,
-- and after this task it also arrives again deliberately, because the handler now answers 5xx
-- on failure so Stripe retries instead of being told a failed grant succeeded.
-- Before this table there was no deduplication of any kind: `event.id` was never read. Proven
-- rather than asserted, by running the current regression suite against the pre-fix handler:
-- a second delivery of the same event called MailerLite a second time, `mlAdd` going 1 to 2.
--
-- INSERT-FIRST, NOT CHECK-THEN-INSERT, which is the specific thing the task asked to verify.
-- The primary key on event_id is what decides, inside the database, which delivery arrived
-- first. A check-then-insert would only narrow the window between two concurrent deliveries,
-- never close it. The handler inserts before doing any work and treats the unique violation
-- itself as the duplicate signal.
--
-- completed_at is the second half, and it is why this is not just a "seen it" set. It is written
-- only after the work actually succeeds. A delivery that claimed the event and then died part
-- way leaves completed_at NULL, so the retry REPROCESSES rather than being skipped as a
-- duplicate. Marking an event processed at claim time would have converted a transient failure
-- into a permanent one, which is the exact failure mode this task set out to remove.

create table if not exists public.stripe_webhook_events (
  event_id     text primary key,
  event_type   text,
  received_at  timestamptz not null default now(),
  completed_at timestamptz,
  attempts     integer not null default 1
);

comment on table public.stripe_webhook_events is
  'C3L-58. Insert-first replay guard for the Stripe webhook. Stripe guarantees at-least-once delivery, so the same event_id WILL arrive twice eventually. The primary key is the guard: the handler inserts before doing any work, and a duplicate insert is the signal that this delivery is a repeat. completed_at is set only after the work succeeds, so a delivery that died half way is retried rather than skipped.';

-- Fails closed for anon, matching the treatment of the other tables that should never be
-- reachable with the key that ships to every browser. Nothing here is a secret, but nothing
-- here is public either, and there is no reason for it to be readable.
alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from anon, authenticated;

create policy "service_role manages stripe webhook events"
  on public.stripe_webhook_events for all to service_role using (true) with check (true);

create index if not exists stripe_webhook_events_received_idx
  on public.stripe_webhook_events (received_at desc);

-- VERIFIED AFTER RUNNING: RLS enabled, 1 policy, anon SELECT privilege false, 0 rows.
-- The guarantee itself was then exercised against the real table with a synthetic event id:
-- the first insert succeeded, the second raised unique_violation, exactly one row existed
-- afterwards and completed_at was preserved. The synthetic row was deleted and the table
-- confirmed back to 0 rows.
