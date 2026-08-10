-- netlify/functions/migrations/c3l-page-views.sql
--
-- Task B. card_views only exists for CARD pages, because the only two call sites of
-- requestFingerprint() are card-api.mjs (the /api/card-view POST) and account.mjs (signup).
-- Every other page type on this site, hub, set, blog, and the 23 static pages, carries GA4
-- and carries no request fingerprint at all.
--
-- That gap is why tonight's traffic could not be attributed. Measured 8 August 2026: GA4
-- recorded 18,814 sessions in 24 hours while card_views recorded ZERO card views in the
-- preceding hour. The traffic is real, it executes JavaScript (GA4 is client side and it
-- fires), and it is not on card pages, so nothing in this database has ever seen it.
--
-- This table is the card_views shape for everything that is not a card. It deliberately does
-- NOT extend card_views: that table's rows are keyed on game and card_ref, which are
-- meaningless for a blog post, and mixing the two would corrupt every card analytic already
-- built on it.
--
-- RLS is service_role only, which is STRICTER than card_views (that table also carries an
-- anon insert and an anon read policy). The reason is that this table exists to hold request
-- provenance and nothing public needs to read it. Note the practical consequence, learned the
-- hard way while building this: a table with RLS on and no anon policy returns HTTP 200 with
-- an EMPTY ARRAY to the anon key, not a 403. A monitor reading it with the wrong key reports
-- "nothing found" and looks like it passed. Read it with the service key or not at all.

create table if not exists public.page_views (
  id           uuid primary key default gen_random_uuid(),
  path         text not null,
  page_type    text,
  session_id   text,
  viewed_at    timestamptz not null default now(),
  user_agent   text,
  ip_address   text,
  geo_country  text,
  geo_city     text
);

-- The three questions this table exists to answer, in the order they get asked: what is
-- happening right now, which network is doing it, and which pages are being hit.
create index if not exists page_views_viewed_at_idx  on public.page_views (viewed_at desc);
create index if not exists page_views_ip_address_idx on public.page_views (ip_address);
create index if not exists page_views_path_idx       on public.page_views (path);

alter table public.page_views enable row level security;

drop policy if exists service_all_page_views on public.page_views;
create policy service_all_page_views on public.page_views
  for all to service_role using (true) with check (true);
