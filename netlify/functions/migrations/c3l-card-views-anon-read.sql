-- netlify/functions/migrations/c3l-card-views-anon-read.sql
--
-- Drops public_read_card_views, the anon SELECT policy on card_views.
--
-- WHY. The Weekly RLS and BOLA check failed on 9 August 2026 with exactly one problem:
--   FAIL: card_views: anon key returned 3 row(s). Live exposure.
-- That was correct. Nobody granted new access; data under an existing public grant became
-- sensitive. The f6b0e5a migration (6 August) added user_agent, ip_address, geo_country and
-- geo_city to card_views and never revisited its RLS. The same migration got this right for
-- the NEW table it created, with the comment "this table holds email addresses and client
-- addresses, and the anon key ships to every browser ... service_role only, fails closed".
-- That reasoning was applied to signup_attempts and not to card_views.
--
-- The exposure was real and was verified by direct test before this was written, not
-- inferred: 39,893 rows readable by the anon key, 17,926 of them carrying a populated
-- truncated IP, across 25 distinct /24 blocks, 11 cities and 26 user agents, beginning
-- 2026-08-06 13:05:30 UTC. The anon key is genuinely public: it is embedded verbatim in the
-- served HTML of /cards/mtg/random-commander as window.C3_SUPA_KEY.
--
-- WHY THIS IS SAFE, each point checked rather than assumed:
--   1. No database object depends on card_views. No views, no materialised views.
--   2. Nothing in shipped code reads card_views with the anon key. card-api.mjs WRITES it,
--      and crawler-volume-check.mjs READS it with SUPABASE_SERVICE_KEY, whose own comment
--      says the anon key is insufficient for that read.
--   3. The write path is unaffected on two independent counts: supabasePost defaults to
--      useService = true, so it uses the service key and bypasses RLS entirely, and it sends
--      Prefer: return=minimal, so it never asks for the row back and cannot be broken by the
--      loss of SELECT.
--   4. The My Dashboard connector reports tableRowCounts: {} with no errors, so it is reading
--      no Supabase tables at all, card_views included.
--
-- WHAT IS DELIBERATELY NOT CHANGED:
--   - anon_insert_card_views stays. The client-side tracker posts through /api/card-view,
--     which uses the service key, so this policy looks unused too, but removing a write path
--     is a different decision with a different blast radius and is not part of this fix.
--   - service_all_card_views stays. That is how the app and the crawler check reach the table.
--   - The 17,926 rows already exposed are left in place. Retention is a separate, lower
--     priority decision and was explicitly held back from this change.
--
-- This matches page_views, created service_role only on 8 August, which passed the same check
-- in the same run: "page_views: blocked, MEANINGFUL (64 real rows exist)".

drop policy if exists public_read_card_views on public.card_views;

comment on table public.card_views is
  'One row per card page view. Holds truncated client IPs, user agents and geo: service_role only. The anon SELECT policy was dropped 9 August 2026 after the recurring RLS check caught it, see C3L-125.';
