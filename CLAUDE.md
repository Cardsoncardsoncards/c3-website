# CLAUDE.md -- C3 Autonomous Build Rules
# Cards on Cards on Cards (cardsoncardsoncards.com.au)
# Read this file before touching any file in this repo.
# These rules are non-negotiable. Apply every one on every file, every session.
# Note: this file uses -- as markdown formatting in headings only. The no-em-dash rule
# applies to code files and content files, not to this rules file itself.
# Last verified against the live repo and live Supabase: 14 July 2026 (task-115).

---

## IDENTITY AND CONTEXT

- Site: cardsoncardsoncards.com.au
- Stack: Eleventy static site + Netlify serverless functions (.mjs) + Supabase PostgreSQL
- Repo: GitHub Cardsoncardsoncards/c3-website (PUBLIC repo), auto-deploys to Netlify on push to main
- Netlify project: cardsoncardsoncards (site id cfa7a71e-27b6-4a5b-a888-ba5924a436d3)
- Sign-off on all content and emails: "The C3 Team" or "Cards on Cards on Cards"
- Australian English throughout -- no US spelling

### Relationship to PROJECT.md
PROJECT.md exists at the repo root and describes itself as the single source of truth for
strategy, status, history and commercial decisions. It is NOT superseded by this file.
- PROJECT.md: what the project is, where it stands, what was decided and why.
- CLAUDE.md (this file): the rules for changing code in this repo.
Where the two overlap on a hard identifier, both were checked and they agree. If they ever
disagree, verify against the actual repo or database and fix both.

---

## REPO PATHS

- Laptop: C:\Users\sammy\Projects\c3-website   (VERIFIED, this is the working path)
- Desktop: C:\Users\sgyim\OneDrive\Desktop\C3 Website\c3-eleventy\c3-eleventy
  (carried over from the old notes, NOT verifiable from the laptop. Confirm before relying on it.)
- Eleventy config: .eleventy.js (dot prefix, no underscore)
- Netlify functions: netlify/functions/
- Shared function modules: netlify/functions/shared/
- SQL migrations: netlify/functions/migrations/
- Static src: src/
- Build output: _site/ (gitignored, never commit this)

---

## CRITICAL IDENTIFIERS -- NEVER GET THESE WRONG

- eBay EPN campid: 5339146789
- eBay category for TCG singles: 183454
- GA4 property: G-WR68HPE92S
- Supabase project ID: owaroeqchreuffbyakqx (Seoul region)
- Support / notification inbox: ccc.squadhelp@gmail.com

SECURITY WARNING: This repo is PUBLIC on GitHub.
Never hardcode any secret values, API keys, or auth tokens in any file.
Always use Netlify.env.get('VAR_NAME') to read secrets at runtime.

---

## NETLIFY FUNCTION RULES -- APPLY TO EVERY .mjs FILE

Scale, so you know what a change touches: 202 function files, 201 of which register a route
via export const config. 101 of them import shared/nav.mjs.

### Auth and environment
- ALWAYS use Netlify.env.get('VAR_NAME') -- NEVER process.env (causes silent failures on Netlify)
  Current state: 200 files use Netlify.env.get, ZERO use process.env. Keep it that way.
- ALWAYS use export default async (req) => -- NEVER export const handler (causes 404s)
  Current state: 202 files use export default async, ZERO use export const handler.
- export const config must be at module level, not inside a function
- Routing is in-code via export const config = { path: '/route' }. Netlify.toml redirects are
  NOT how pages are routed here. Do not add a redirect to "fix" a route.

### Which Supabase key to use
- Hub pages, set pages, card pages (read-only public data): SUPABASE_ANON_KEY
- Background sync functions that write data: SUPABASE_SERVICE_KEY
- Anything touching accounts, follows, follow_magic_links or subscribers: SUPABASE_SERVICE_KEY.
  Those four tables are service_role only (see schema below). The anon key cannot read them.
- Never use SUPABASE_ANON_KEY for write operations on production data

### Fetch patterns
- ALWAYS add AbortController + 8 second timeout to every fetch call
- ALWAYS check res.ok before calling res.json()
- Use Promise.allSettled not Promise.all for parallel fetches (a single failed game must not
  take down a whole page). Promise.all still survives in 5 files; do not add more.

### Supabase queries
- ALWAYS include both auth headers: 'apikey' and 'Authorization': 'Bearer ' + key
- ALWAYS use select= parameter on every Supabase query (never select *)
- NEVER use URLSearchParams for PostgREST filter strings (percent-encodes * and { breaking filters)
- Order by a nullable column must use .nullslast, or NULL-dated rows sort above real ones
- The Supabase key variable must NEVER appear after the const html = backtick line

---

## HTML FILE RULES

There are 24 .html files in src/. 22 of them carry the site nav. content-engine.html (internal
tool) and forms.html (Netlify forms stub) deliberately have no nav and are not user-facing.

### Required tags (verify before every push)
- GA4: script async src with G-WR68HPE92S
- Favicon: link rel=icon type=image/png href=/c3logo.png
- OG tags: og:image, og:title, og:description all required
- Canonical URL required on every page
- Affiliate disclaimer in footer required on every page
- Mobile media query required

### Nav: two separate implementations, kept in sync by hand

This is the single most misunderstood thing in this repo. There is no shared nav component
across both worlds. There are two:

1. DYNAMIC PAGES (101 function files) import netlify/functions/shared/nav.mjs.
   That module is the source of truth for those pages. Change it once, it deploys everywhere.
   It has a hamburger (.nav-burger) + slide-out drawer, and at <=768px it sets
   .nav-links { display: none } and the drawer takes over.

2. STATIC PAGES (the 22 in src/) each inline their OWN COPY of the nav markup and CSS.
   They do NOT import nav.mjs and they CANNOT (they are plain HTML, not JS modules).
   This duplication is the deliberate, established convention here. Do NOT "fix" it by
   extracting a shared component. When the nav changes, it changes in 23 places: nav.mjs
   plus the 22 static pages.
   Static pages use the SAME hamburger/drawer pattern as shop.html: a <button class="hamburger">
   inside .nav-inner, and at <=768px .nav-links is display:none and is opened/closed by toggling
   the .open class on it (.nav-links.open{display:flex}). There is NO horizontally scrolling pill
   row. The System 1 CSS (.hamburger styles plus the @media(max-width:768px){.nav-links{display:none}}
   block) must be the LAST-defined .nav-links display rule on the page, otherwise a later base
   .nav-links{display:flex} rule silently defeats the burger. That later-rule conflict was the
   index.html / pricing.html / subscribe.html bug fixed in task-121.

   CORRECTED 16 Jul 2026 (task-121): an earlier version of this file said static pages have "NO
   burger and NO drawer" and keep a scrolling pill row. That contradicted shop.html's actual,
   working hamburger implementation. All static pages should now match shop.html's nav behaviour.

### Nav routes (all verified live)
- /cards, /calendar, /welcome, /subscribe, /tools, /play, /blog, /shop -> static pages in src/
- /account -> account.mjs        - /compare -> card-compare.mjs
- /market  -> market-insights.mjs - /search  -> search-page.mjs

### The Account link (task-113)
- Markup: <a href="/account" class="nav-account"> with a person glyph + .nav-account-text span.
- It sits OUTSIDE .nav-links, at the far right of .nav-inner. On dynamic pages this is because
  .nav-links is display:none on mobile, so an Account pill inside it would vanish on phones.
- At <=768px it collapses to icon-only (.nav-account-text { display: none }).
- /account is ONE endpoint serving BOTH states: no session renders the sign-in page, a valid
  session renders the dashboard. So a plain static link to /account is correct signed in or out.
  Do not build a separate "sign in" route.
- Some static pages still carry, harmlessly,
      @media (max-width: 768px) { .nav-links { flex-shrink: 1; min-width: 0; } }
  Since task-121 this is a no-op at mobile: .nav-links is display:none there (System 1) and the
  hamburger drawer takes over, so there is no pill row to shrink or clip. It only mattered under
  the old scrolling-row design, which no longer exists. Leave it or delete it, either is fine; do
  not copy it into nav.mjs (dynamic pages also hide .nav-links on mobile).

### No em dashes in content or code
- Never use the em dash character in any code, content, or copy file
- Never use en dashes either
- Use a comma, or restructure the sentence. This is checked on every task.

---

## XSS SECURITY RULES -- APPLY TO EVERY FILE THAT RENDERS DB DATA

- ALL database values going into HTML must be escaped
- alt= attributes, innerHTML, data-name, data-setname: escape quotes and angle brackets
- Card names are the usual offender (apostrophes and quotes in set and card names)
- Supabase key must never appear after the const html = backtick line

---

## GAMES IN SCOPE -- 32 TOTAL

Source of truth: GAME_TABLES in netlify/functions/compare-search.mjs. Every game has its own
hub, card page, set page, sitemap and sync function, and its own <game>_cards table.

### Core 8
mtg, pokemon, yugioh, lorcana, onepiece, dbsfusionworld, starwars, riftbound

These 8 (and only these 8) are what GAME_CONFIG in shared/weekly-report-core.mjs covers, and
what the weekly reports treat as first-class.

### Extended 24
dragonball, digimon, vanguard, weissschwarz, finalfantasy, forceofwill, buddyfight, shadowverse,
wow, unionarena, universus, metazoo, grandarchive, wixoss, sorcery, hololive, alphaclash, gundam,
battlespiritssaga, dragonballz, bakugan, godzilla, warhammer, gateruler

8 + 24 = 32, which matches the "32 TCGs" copy on /compare.

### The three Dragon Ball games are three DIFFERENT games. Do not merge them.
This has been got wrong before, in both directions. All three are separate tables, separate URL
namespaces, separate sync jobs, separate data. Which one is CORE was settled in task-116:

- dbsfusionworld  -> dbsfusionworld_cards   3,965 rows  /cards/dbsfusionworld   CORE 8.
                     Dragon Ball Super Fusion World. THIS is the Core Dragon Ball game.
                     Upstream tcgapi.dev slug: 'dragon-ball-super-fusion-world'.
                     It is also one of the 7 followable card pages, and it is what the apitcg
                     Card Details work targets. Core status makes it consistent with both.
- dragonball      -> dragonball_cards      11,852 rows  /cards/dragonball       EXTENDED.
                     Dragon Ball Super CCG, the older product.
                     Upstream tcgapi.dev slug: 'dragon-ball-super-ccg'.
                     It has MORE rows than the Core game. Row count is NOT what decides Core.
- dragonballz     -> dragonballz_cards      1,820 rows  /cards/dragonballz      EXTENDED.
                     The old Panini DBZ TCG.

Never take an upstream slug from memory. Both real slugs above are copied from the sync jobs
(sync-dbsfusionworld-background.mjs, sync-dragonball-background.mjs), which are the only place
they are proven correct. weekly-report-core.mjs previously carried 'dragon-ball-super', which
matches NEITHER game.

### KNOWN INCONSISTENCY, not yet fixed (as of task-116)
Three places still list dragonball as a primary/Core game. They are user-visible, so they were
reported rather than silently changed. Fix them in a task that is scoped to say so:
- market-insights.mjs:44  PRIMARY_GAMES  -> drives the /market primary tabs.
- card-compare.mjs        the Core 8 colour and label maps (around line 1332) and the GAME entry.
- market-data.mjs         ALL_FANOUT (18 "well-populated" games) includes dragonball and omits
                          dbsfusionworld. Not strictly a Core list, but it leaves the Core Dragon
                          Ball game out of the market fanout entirely.

### Followable games (7) are NOT the same set as the Core 8
Only these 7 card-page files import shared/follow-links.mjs and carry a follow button:
mtg (card-page.mjs), pokemon, yugioh, lorcana, onepiece, starwars, dbsfusionworld.
Note what that means: riftbound is Core 8 but NOT followable, and yugioh is followable. If you
add follows to a game, add the card page import too.

### Permanently excluded
Flesh and Blood (LSS commercial restrictions -- never recommend or build for this game).
There are no FAB tables or functions. Passing editorial mentions in blog posts are fine.

---

## DATABASE SCHEMA REFERENCE

Verified directly against the live database, not from memory.

### MTG IS THE EXCEPTION. This has bitten multiple past tasks.
- mtg_cards uses image_uri (plus image_uri_small / _normal / _art_crop / _border_crop)
  and prices in price_aud / price_usd. It has NO image_url and NO market_price column.
- EVERY OTHER GAME uses image_url and market_price (USD, not AUD).
- So: mtg_cards.image_uri, pokemon_cards.image_url. Getting this backwards yields silently
  broken images, not an error.

### Identity and follows (task-109 migration, applied and live)
- accounts
  id uuid PK, email text NOT NULL, password_hash text NULL, created_at, last_seen_at
  UNIQUE (email)
  CHECK (email = lower(btrim(email)))  -- a non-normalised address is physically unstorable
  CHECK (email matches a basic address shape)
- follows
  id bigint PK, user_id uuid NOT NULL -> accounts(id) ON DELETE CASCADE,
  game text NOT NULL, card_slug text NOT NULL, card_name text,
  entity_id text GENERATED ALWAYS AS (game || ':' || card_slug) STORED,
  alert_types text[] NOT NULL, confirmed bool NOT NULL, confirmed_at, confirm_token,
  unsubscribe_token text NOT NULL, unsubscribed_at, triggered bool NOT NULL, triggered_at,
  current_price numeric, created_at
  UNIQUE (user_id, entity_id)  -- every column in it is NOT NULL, so duplicates cannot slip
  through on a NULL, which is exactly how the old card_price_alerts uniqueness leaked.
- follow_magic_links
  id bigint PK, token text NOT NULL UNIQUE, user_id uuid NOT NULL -> accounts(id) CASCADE,
  expires_at, created_at
  There is NO email column. It was dropped and replaced by user_id. Do not reintroduce it.
- subscribers  (pre-existing, was undocumented anywhere before task-109)
  id, email UNIQUE, stripe_customer_id, stripe_sub_id, plan, status, subscribed_at,
  cancelled_at, updated_at
  CHECK status IN ('active','cancelled','past_due','trialing')
  Paid tier is resolved from THIS table at send time, never by which table a follow row lives in.

### RLS on the four tables above
All four have RLS ENABLED. accounts, follows and subscribers each carry a single service_role
policy. follow_magic_links has RLS on with NO policy at all, which fails closed: only
service_role (which bypasses RLS) can reach it. This is deliberate. These tables hold email
addresses and the anon key ships to every browser. Never expose them to anon.

### Dragon Ball tables, and which is Core (verified, task-116)
Column names are identical across both, so a table swap is safe on shape. Coverage:
- dbsfusionworld_cards (CORE):  3,965 rows, 3,815 priced (96.2%), 1,462 with price_change_7d,
                                2,605 with price_change_30d.
- dragonball_cards (EXTENDED): 11,852 rows, 10,369 priced (87.5%), 1,746 with price_change_7d,
                                2,207 with price_change_30d.
The Core game has fewer rows but proportionally BETTER price coverage. Do not "correct" the Core
designation back on row count.

### Other
- Every other table: anon SELECT + service_role ALL.
- Per-game tables follow the pattern <game>_cards and <game>_sets.
- <game>_sets columns: id, name, slug, abbreviation, release_date, card_count, game_slug,
  updated_at. Note it is name, NOT set_name.
- tcg_releases is forward-looking only. It has no rows for the recent past and no Marvel entry.
  For a released set, query the per-game <game>_sets table instead. (Learned in task-114.)

---

## KEY FILES AND THEIR PURPOSE

### netlify/functions/shared/
- nav.mjs (505 lines) -- the nav for the 101 dynamic function pages. NAV_CSS, NAV_HTML, and
  navHtml({gameLabel, gameHref}) for the per-game active indicator. Does not reach static pages.
- accounts-core.mjs (342) -- task-109. The ONE identity + follow write path. The cap, the
  duplicate check and the insert all live here and nowhere else. FREE_FOLLOW_CAP = 100.
  PAID_FOLLOW_CAP = null (no paid tier is live). Unsubscribe is a soft delete
  (unsubscribed_at); a separate, explicitly labelled hard delete frees a cap slot.
- session.mjs (132) -- task-110. HMAC-SHA256 signed, httpOnly, Secure, SameSite=Lax cookie,
  30 days, constant-time compare. Signed with SESSION_SECRET from Netlify env. If the secret is
  missing it FAILS CLOSED rather than degrading to an unsigned, forgeable cookie.
- follow-links.mjs (17) -- task-111. The single definition of the "Manage your follows" line
  under the follow button. Imported by all 7 followable card pages so the wording cannot drift.
- weekly-report-core.mjs (313) -- shared engine for the weekly emails: price-movement queries,
  the Resend template, batch send. Holds GAME_CONFIG (the Core 8) and TCG_API_GAME_MAP.
- price-chart.mjs (138) -- the single-line interactive price-history chart.
- view-tracking.mjs (44) -- the client-side card-view logging snippet.
- ws-properties.mjs (91) -- canonical display names for the 69 Weiss Schwarz properties.

### netlify/functions/
- account.mjs -- the /account dashboard. Serves the sign-in page when there is no session and
  the dashboard when there is. noindex, and deliberately NOT in any sitemap: it is personalised
  and session dependent, and submitting it would undo the sitemap work of tasks 84 to 107.
- migrations/create-accounts-and-follows.sql -- the task-109 migration. Already applied to the
  live database. It is a record of what was done, not a pending change.

---

## WHAT CLAUDE CODE CANNOT DO -- DO NOT ATTEMPT

- Make strategy decisions -- bring to claude.ai first
- Write blog posts -- those go to claude.ai
- Approve its own pushes -- always wait for explicit approval
- Hardcode secret values in files (repo is public)
- Fetch the live deployed site. The sandbox has NO network egress: curl returns HTTP 000 and
  zero bytes. Verify a deploy through the Netlify API instead, by checking that the deploy's
  commit_ref matches the commit that was just pushed. Say plainly that this is what was done.
  Never imply a visual check happened when it did not.

---

## SESSION START PROTOCOL

How this project actually runs:

1. Work arrives as numbered task files (task-NNN.md) written in claude.ai and downloaded to the
   user's Downloads folder. Claude Code is told to read and execute them, usually by absolute
   path, sometimes several in one session, in a stated order.
2. Read the whole task file before starting. Execute it in full, including its own report-back
   section, before moving to the next one.
3. VERIFY THE TASK'S OWN CLAIMS. Task files are written from context, not from the repo, and
   they are sometimes wrong. A task asserting "X is broken, fix it" may be describing something
   that is not broken, or is broken differently. Check before you change. Task-115 shipped with
   a flatly false premise (that dbsfusionworld and dragonball were the same game). If a task's
   premise does not survive contact with the repo, say so in the report and do NOT implement the
   wrong thing.
4. A task file in Downloads may drag an unrelated CLAUDE.md into context from that folder.
   Ignore it. THIS file, at the repo root, is the only one that governs this repo.
5. HOLD LOCALLY BY DEFAULT. Make the changes, run the checks, report back. Do not run any git
   write command (add, commit, push) until given an explicit go-ahead. "Hold locally, do not
   push" means exactly that.
6. Standard checks before reporting: the Eleventy build passes, node --check on any changed
   .mjs, and no em or en dashes anywhere in the added lines.
7. On go-ahead: stage, commit with a message that explains WHY, and push to main. Netlify
   auto-deploys from main. Confirm the deploy by matching its commit_ref to the pushed commit.
8. Minimum 3 files per push (batch small changes rather than pushing one file at a time).
