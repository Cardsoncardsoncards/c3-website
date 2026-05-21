# CLAUDE.md -- C3 Autonomous Build Rules
# Cards on Cards on Cards (cardsoncardsoncards.com.au)
# Read this file before touching any file in this repo.
# These rules are non-negotiable. Apply every one on every file, every session.
# Note: this file uses -- as markdown formatting in headings only. The no-em-dash rule
# applies to code files and content files, not to this rules file itself.

---

## IDENTITY AND CONTEXT

- Site: cardsoncardsoncards.com.au
- Stack: Eleventy static site + Netlify serverless functions (.mjs) + Supabase PostgreSQL
- Repo: GitHub c3-website (PUBLIC repo), auto-deploys to Netlify on push to main
- Owner: Sammy G (never use "Sammy" in any content or communications)
- Sign-off on all content and emails: "The C3 Team" or "Cards on Cards on Cards"
- Income goal: AU$10,000 net/month
- Australian English throughout -- no US spelling

---

## REPO PATHS

- Laptop: C:\Users\sgyim\c3-website
- Desktop: C:\Users\sgyim\OneDrive\Desktop\C3 Website\c3-eleventy\c3-eleventy
- Eleventy config: .eleventy.js (dot prefix, no underscore)
- Netlify functions: netlify/functions/
- Static src: src/
- Build output: _site/ (never commit this)

---

## CRITICAL IDENTIFIERS -- NEVER GET THESE WRONG

- Amazon affiliate tag: blasdigital-22
- eBay EPN campid: 5339146789
- eBay Browse API category for TCG singles: 183454
- GA4 property: G-WR68HPE92S
- Supabase project ID: owaroeqchreuffbyakqx
- MailerLite account: 2220065
- Tracker form ID: mIFDGb
- Support email: ccc.squadhelp@gmail.com
- tcgapi.dev: Business plan, 50,000 calls/day, resets 10am AEST
- eBay App ID env var: EBAY_CLIENT_ID / EBAY_CLIENT_SECRET (Netlify env vars)

SECURITY WARNING: This repo is PUBLIC on GitHub.
Never hardcode any secret values, API keys, or auth tokens in any file.
Always use Netlify.env.get('VAR_NAME') to read secrets at runtime.
Key env vars available in Netlify:
  SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
  EBAY_CLIENT_ID, EBAY_CLIENT_SECRET
  TCGAPI_KEY
  SYNC_SECRET (value used in x-sync-secret header for sync authentication)
  EXCHANGE_RATE_API_KEY, MAILERLITE_API_KEY, RESEND_API_KEY

---

## NETLIFY FUNCTION RULES -- APPLY TO EVERY .mjs FILE

### Auth and environment
- ALWAYS use Netlify.env.get('VAR_NAME') -- NEVER process.env (causes silent failures on Netlify)
- ALWAYS use export default async (req) => -- NEVER export const handler (causes 404s)
- export const config must be at module level, not inside a function

### Which Supabase key to use
- Hub pages, set pages, card pages (read-only public data): SUPABASE_ANON_KEY
- Background sync functions that write data: SUPABASE_SERVICE_KEY
- Never use SUPABASE_ANON_KEY for write operations on production data

### Sync function authentication
- All background sync functions require x-sync-secret header
- Value comes from: Netlify.env.get('SYNC_SECRET')
- Never hardcode the secret value -- this repo is public

### Fetch patterns
- ALWAYS add AbortController + 8 second timeout to every fetch call
- Pattern:
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: {...} });
    clearTimeout(timer);
    if (!res.ok) return fallback;
    return await res.json();
  } catch { clearTimeout(timer); return fallback; }
- ALWAYS check res.ok before calling res.json()
- Use Promise.allSettled not Promise.all for parallel fetches

### Supabase queries
- ALWAYS include both auth headers:
  'apikey': key
  'Authorization': 'Bearer ' + key
- ALWAYS use select= parameter on every Supabase query (never select *)
- NEVER use URLSearchParams for PostgREST filter strings (percent-encodes * and { breaking filters)
- Manually concatenate PostgREST filter strings instead
- The Supabase key variable must NEVER appear after the const html = backtick line

### Scheduled functions
- Background sync functions use schedule in export const config
- Format: export const config = { schedule: "0 X * * *" }
- Stagger schedules to avoid simultaneous API calls

---

## HTML FILE RULES -- APPLY TO EVERY .html FILE

### Required tags (verify before every push)
- GA4: script async src with G-WR68HPE92S
- Favicon: link rel=icon type=image/png href=/c3logo.png
- OG tags: og:image, og:title, og:description all required
- Canonical URL required on every page
- Affiliate disclaimer in footer required on every page
- Mobile media query required

### Nav rules
- nav-links must have flex-shrink:0
- No space-between on nav-inner
- Correct nav paths:
  /compare (not /card-compare.html)
  /market (not /market.html)
  /cards (not /cards.html)
  /blog (not /blog.html)
  /shop.html (correct, keeps .html)
  /ev-calculator.html (correct, keeps .html)
  /tracker.html (correct, keeps .html)
- eBay store link must include EPN campid 5339146789

### No em dashes in content or code
- Never use the em dash character in any code, content, or copy file
- Never use en dashes either
- Use commas, brackets, or full stops instead
- Exception: this CLAUDE.md file uses -- only in section headings

---

## XSS SECURITY RULES -- APPLY TO EVERY FILE THAT RENDERS DB DATA

- ALL database values going into HTML must be escaped
- alt= attributes: .replace(/"/g, '&quot;')
- innerHTML divs: escape < and >
- data-name attributes: escape quotes and apostrophes
- Set names in spans: escape < >
- Drawer innerHTML labels: escape < >
- data-setname: escape quotes
- User query: create safeQuery for HTML, use raw query for encodeURIComponent and gtag JS
- Supabase key must never appear after const html = backtick line

---

## GAMES IN SCOPE

Primary 8 (full feature set, priority fixes):
MTG, Pokemon, Yu-Gi-Oh, Disney Lorcana, One Piece, Dragon Ball Super, Star Wars Unlimited, Riftbound

Extended 24 (hub/set/card pages built, lower priority):
Digimon, Vanguard, Weiss Schwarz, Final Fantasy TCG, Force of Will, Buddyfight,
Shadowverse, DBS Fusion World, Union Arena, Univerus, Metazoo, Grand Archive,
Wixoss, Sorcery, Hololive, Gundam, Dragon Ball Z (DBZ), Bakugan, Godzilla, Alpha Clash,
Gate Ruler, Warhammer, WoW TCG, Battle Spirits Saga
FILE NAMING: dragonball-*.mjs = Dragon Ball Super (DBS, primary 8). dragonballz-*.mjs = Dragon Ball Z (DBZ, extended). Never confuse these.

Permanently excluded:
Flesh and Blood (LSS commercial restrictions -- never recommend or build for this game)

---

## TCGAPI.DEV COVERAGE REALITY (important for autonomous sessions)

- MTG: tcgapi.dev resolves only 11 of 96,508 cards via tcgplayer_id lookup
- MTG ID sync (sync-ids-mtg-background) is effectively useless -- do not re-run or troubleshoot it
- MTG pricing comes from Scryfall (daily sync), not tcgapi.dev
- Yu-Gi-Oh: 12,324 valid tcgapi_ids (26% coverage) -- worthwhile
- Pokemon: 9,600 valid tcgapi_ids (30% coverage) -- worthwhile
- Other games: 22-46% coverage -- worthwhile
- tcgapi_id = -1 means permanently not found, never retry
- tcgapi_id = NULL means not yet checked (should be zero for all 8 core games after 21 May 2026)

---

## CONTENT AND COPY RULES

- All prices in AUD unless explicitly stated otherwise
- Never make assumptions -- if unclear, ask before proceeding
- No filler phrases ("great question", "certainly", "straightforward")
- No em dashes or en dashes in any content or code
- Titles with specific decisions or buying outcomes outperform descriptive titles
- Blog post count: 262 live as of 21 May 2026 (next is p263)
- Posts p248-p257 and p260 are confirmed missing from the build -- do not assume they exist
- Each blog post = one additional Google-indexed URL
- Blog posts are NEVER created by autonomous Claude Code sessions -- all blog content goes through claude.ai
- Blog file format: src/blog/pNNN-[slug].md with Nunjucks front matter -- do not touch these files

---

## GIT AND DEPLOYMENT RULES

- ONE push per session maximum (Netlify build credit efficiency)
- Batch ALL changes into one commit per session
- Netlify auto-deploys approximately 60 seconds after GitHub push
- Never commit _site/ directory
- Never commit .claude/ directory (in .gitignore)
- Always run npm run build locally before pushing to catch errors
- Always run node --check on modified files before pushing
- GitHub Actions syntax check fires on every push -- it will catch missed errors
- After marking items complete in PROJECT.md, commit PROJECT.md as part of the session push

---

## C3 AUDIT CHECKLIST -- RUN ON EVERY .mjs BEFORE PUSH

Pass 1 -- Syntax
- No syntax errors (node --check passes)
- No em dashes in any string or comment
- export const config at module level
- export default async (req) => pattern

Pass 2 -- Security and identifiers
- EPN campid 5339146789 on all eBay links
- GA4 G-WR68HPE92S present in HTML pages
- Supabase key not exposed after html template literal starts
- No hardcoded secret values (repo is public)
- All DB values escaped before rendering

Pass 3 -- Fetch reliability
- AbortController + 8s timeout on every fetch
- res.ok check before JSON parse
- Promise.allSettled not Promise.all
- Netlify.env.get not process.env

Pass 4 -- Supabase
- select= on every query
- Both auth headers present
- Correct key used (anon for reads, service for writes)
- PostgREST filters manually concatenated (not URLSearchParams)

Pass 5 -- HTML structure (run this pass on .html files, not .mjs files)
- Nav paths correct (see nav rules above)
- OG tags present
- Canonical URL present
- Affiliate disclaimer in footer
- Mobile media query present
- No display:contents on forms
- GA4 script tag present
- Favicon link present
- Canonical URL matches the page URL exactly

After every fix: cold restart -- read file from line 1 as if never seen. Run audit again.
Never declare a file clean from self-checks alone.
Never skip cold restarts.

---

## DATABASE SCHEMA REFERENCE

### Core tables
- mtg_cards: id (uuid), name, set_name, set_code, tcgplayer_id, tcgapi_id, price_usd, image_uri, slug, rarity, artist, edhrec_rank, reserved, tcgapi_synced_at
- mtg_sets: id, name, code, released_at, slug
- mtg_price_snapshots: card_id, price_usd, foil_price_usd, snapshot_date, price_change_7d, foil_price_aud, price_change_30d, total_listings, median_price
- pokemon_cards: id, name, set_name, market_price, image_url, slug, tcgapi_id, tcgplayer_id
- yugioh_cards: same pattern as pokemon
- lorcana_cards: same pattern
- onepiece_cards: same pattern
- dragonball_cards: same pattern
- starwars_cards: same pattern
- riftbound_cards: same pattern
- card_sales_history: card_id, game, sale_date, price_usd, quantity
- sync_events: id, event_type, game, rows_affected, triggered_at, webhook_fired
- mtg_card_views: card_id, viewed_at
- mtg_card_likes: card_id, liked_at

### RLS policy
- All tables: anon SELECT + service_role ALL
- mtg_card_likes and mtg_card_views: 3 policies each (anon INSERT, anon SELECT, service_role ALL) -- intentional

### tcgapi_id convention
- Positive integer: valid tcgapi.dev ID, card has sales history data
- -1: confirmed not in tcgapi.dev database, skip permanently, never retry
- NULL: not yet checked (should be zero for all 8 core games after 21 May 2026 cleanup)

### MTG image field
- MTG cards use image_uri (not image_url -- this field name is different from other games)

---

## SYNC INFRASTRUCTURE

### Active daily syncs
- sync-mtg-cards: Scryfall API, streaming JSON, writes to mtg_cards and mtg_price_snapshots
- sync-pokemon-background, sync-lorcana-background, sync-onepiece-background
- sync-yugioh-background, sync-dragonball-background, sync-starwars-background, sync-riftbound-background
- 23 additional game syncs for extended games
- All syncs authenticate via x-sync-secret header using Netlify.env.get('SYNC_SECRET')

### ID syncs (resolve tcgplayer_id to tcgapi_id)
- sync-ids-mtg-background: effectively useless (0.01% coverage) -- do not prioritise
- sync-ids-pokemon-background, sync-ids-yugioh-background: worthwhile
- sync-ids-lorcana-background, sync-ids-onepiece-background, sync-ids-dragonball-background
- sync-ids-starwars-background, sync-ids-riftbound-background

### Sales history
- sync-sales-history: scheduled 0 17 * * *, queries tcgapi.dev /v1/cards/{id}/history
- Requires tcgapi_id > 0 (not NULL, not -1)
- card_sales_history table exists and is empty as of 21 May 2026 -- sync has not run successfully

### pg_cron jobs (Supabase, run automatically, no Netlify involvement)
- mtg-tcgapi-null-cleanup: 0 2 * * * (marks new NULL MTG tcgapi_ids as -1 in 5k batches)
- sitemap-staleness-check: 0 */6 * * * (cleans unfired sync_events older than 30 minutes)

---

## DECISION SCHEMA -- USE WHEN AMBIGUOUS

### When should I use Netlify.env.get vs process.env?
ALWAYS Netlify.env.get. Never process.env. No exceptions.

### When should I use export default vs export const handler?
ALWAYS export default async (req) =>. Never export const handler.

### Which Supabase key for a new function?
If it reads public card/set/price data: SUPABASE_ANON_KEY.
If it writes to any table (syncs, migrations): SUPABASE_SERVICE_KEY.

### Should I push after completing one task?
No. Hold all changes. Batch into one push at session end unless explicitly told otherwise.

### Should I commit PROJECT.md when marking items complete?
Yes. Include PROJECT.md in the session commit so progress is tracked across sessions.

### If a Supabase query times out via the MCP tool, what do I do?
Break into batches of 5,000-10,000 rows using WHERE id IN (SELECT id ... LIMIT N).

### If a file has both old and new patterns, which wins?
The new pattern (AbortController, Netlify.env.get, export default) always wins. Update old patterns when touching a file.

### If I find an issue in a file I was not asked to edit, what do I do?
Flag it in the session summary. Add it to Phase 3 of PROJECT.md. Do not edit it unless it blocks the current task.

### If a game is in the extended list but not the primary 8, what priority?
Fix blocking errors (404s, build failures) on extended games. Do not add features until all Phase 3 Critical items are resolved.

### Should I update blog post numbers in static files?
Only update if explicitly instructed with a confirmed count. Never guess the current post count.

### If a nav link path is ambiguous, which version is correct?
Use the paths in the nav rules section above. /compare not /card-compare.html etc.

### When building a new hub/set/card page for a game, what is the reference pattern?
Read the equivalent onepiece or riftbound file first. Those are the most recent and cleanest implementations.

### When starting the Card Compare feature, what already exists?
compare-search.mjs is already deployed and handles card search across all games.
card-compare.mjs is already deployed as the compare page function.
Read both files before building anything new for Card Compare. Do not duplicate existing endpoints.

### Should I try to fix MTG ID sync coverage?
No. tcgapi.dev has 0.01% MTG coverage by tcgplayer_id. This is a data limitation not a code bug.
MTG pricing comes from Scryfall. Do not attempt to improve MTG tcgapi_id coverage.

### What if sync-sales-history runs but card_sales_history stays at 0 rows?
Check: (1) are there cards with tcgapi_id > 0? (2) is the tcgapi.dev key valid? (3) is the function timing out?
Do not mark sync-sales-history as working until card_sales_history has confirmed new rows.

### If npm run build shows "Sitemap generation failed: Supabase mtg_cards fetch failed: 500"?
This error is expected and non-blocking. The build continues and completes successfully.
Do not attempt to fix this error as part of a different task. It is listed separately in Phase 3.
Treat the build as passing if Eleventy writes files successfully and functions bundle without errors.

### If I am unsure whether something was previously built?
Check the repo directly with git log or ls. Do not assume. Do not rebuild something that exists.

---

## SHOP.HTML RULES (apply when editing shop.html)

New and Pre-Orders section rules:
- Pre-orders appear first (newest release date first)
- Only add released items if pre-orders alone do not fill 12 or 18 slots
- Target exactly 12 or 18 slots (whichever fills with confirmed working images)
- No broken-image products in the New and Pre-Orders section
- TMNT stays MTG tab only (not in New and Pre-Orders)
- Broken-image items move to their game tab, not removed entirely
- shop.html is the authoritative source for what is live

---

## KEY FILES AND THEIR PURPOSE

- random-card.mjs: powers the random card feature -- keep, do not delete
- commander-carousel.mjs: powers the MTG Commander carousel on homepage -- keep
- compare-search.mjs: multi-game card search endpoint used by Card Vault search and Card Compare
- card-compare.mjs: the Card Compare page function
- card-page.mjs: MTG individual card pages
- search-page.mjs: the /search page that handles nav search bar queries
- ebay-prices.js: eBay carousel function (skeleton exists, not fully implemented)
- market-insights.mjs: the /market page
- mtg-banned.mjs: MTG banned lists for all 4 formats
- enrich-prices-background.mjs: background price enrichment function
- set-carousel.mjs: set carousel component used on hub pages

---

## WHAT CLAUDE CODE CANNOT DO -- DO NOT ATTEMPT

- Browse the live deployed site visually (no browser rendering)
- Access Supabase MCP without it being configured in Claude Code settings
- Make strategy decisions -- bring to claude.ai first
- Write blog posts -- those go to claude.ai
- Approve its own pushes -- always wait for explicit approval
- Hardcode secret values in files (repo is public)

---

## SESSION START PROTOCOL (run at start of every session)

1. Run git log --oneline -3 and report results
2. Run git status --short and report any uncommitted changes
3. Run git diff --name-only HEAD~1 HEAD to identify modified files, then run node --check on each modified .mjs file
4. Report the current date and device being used
5. Read PROJECT.md Phase 3 and report the next unchecked critical item
6. Ask: confirm this is the task, or is there a different priority?

Never start building before completing the session start protocol.
