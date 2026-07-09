# C3 MASTER PROJECT DOCUMENT
**Cards on Cards on Cards — cardsoncardsoncards.com.au**
*Single source of truth. Replaces PROJECT.md, CLAUDE.md, C3_Master_Handover_28June2026.md, C3_Project_Handover_June2026.md and all prior handover documents.*
*Generated: 2 July 2026. Next update after Week 1 build sprint completes.*

---

## SESSION START PROTOCOL (MANDATORY — EVERY NEW CHAT)

Before any task work:
1. State the model in use (e.g. "Model: Claude Sonnet 4.6" or "Model: Claude Fable 5")
2. Ask user to confirm current date and time in Sydney
3. No task work until both are confirmed

Before any build or traffic advice, confirm:
- GSC verification status (complete or pending)
- Site is live and indexed
- Current traffic level (check GSC or GA4 if relevant to task)

---

## IDENTITY AND CONSTANTS

**Site:** cardsoncardsoncards.com.au
**Owner:** Sammy G
**Business model:** TCG card intelligence platform with price display, card knowledge, synergy guides, release calendar and eBay EPN affiliate links across 32+ games. Worldwide scope. Australian-built identity.
**Stack:** Eleventy + Netlify Functions (ESM .mjs) + Supabase (PostgreSQL, Seoul region)
**Repo:** github.com/Cardsoncardsoncards/c3-website (branch: main, auto-deploys on push)
**Laptop repo path:** C:\Users\sgyim\c3-website
**Desktop repo path:** C:\Users\sgyim\OneDrive\Desktop\C3 Website\c3-eleventy\c3-eleventy
**Eleventy config:** .eleventy.js (dot prefix, never underscore)
**Supabase project ID:** owaroeqchreuffbyakqx (Seoul region)
**GA4:** G-WR68HPE92S
**EPN campid:** 5339146789
**Amazon tag:** blasdigital-22
**MailerLite main group:** 182892277158381312
**MailerLite paid group:** 188799131758626620
**MailerLite automation ID:** 189667469958317870
**Notification inbox:** ccc.squadhelp@gmail.com
**Sign-off:** "The C3 Team" only. Never "Sammy."
**Resend:** Domain cardsoncardsoncards.com.au verified. Sending from alerts@cardsoncardsoncards.com.au (Tokyo region). Login via resend.com with GitHub OAuth.
**ACC Dashboard:** aggregation-command-centre.netlify.app (MCP connected)
**Domain registrar:** Crazy Domains (crazydomains.com.au). Registered through 24 March 2028.

---

## STRATEGIC DIRECTION (CONFIRMED 2 JULY 2026)

### Core positioning
"Australia's TCG card intelligence platform, covering prices, card knowledge, synergies and releases across 32+ games worldwide."

### What C3 is
- Price display (tcgapi.dev confirmed commercially permitted in writing via Discord DM 2 July 2026)
- Card intelligence: how-to-play, synergies, combos, deck roles, ruling context
- Release calendar and set intelligence
- eBay EPN affiliate links on every card and set page
- Worldwide scope with Australian-built identity

### What C3 is NOT
- A marketplace
- A price-only lookup tool
- A subscription product (deprioritised indefinitely)
- An AdSense-heavy site at current traffic levels

### Key decisions (do not revisit)
- Flesh and Blood: permanently excluded. LSS commercial restrictions.
- Workers compensation: permanently excluded from all content.
- Subscription tier: deprioritised. Stripe and Resend code stays in repo but is not part of the active roadmap.
- AdSense: blog pages and homepage only, once traffic exceeds 10,000 monthly pageviews. Never on card pages or hub pages (conflicts with EPN).
- tcgapi.dev licensing: CONFIRMED PERMITTED. Discord DM from _dataZar 2 July 2026: "Yes, as long as you're not reselling the data for download or API or anything like that. You are fine." Screenshot saved locally at Desktop/C3 Website/Confirmation from TCGAPI admin.jpg. Original email to tcgapi.dev support also sent 28 June as paper trail.
- Amazon AU: keep integration, manual image sourcing for sealed products, zero organic revenue to date, $28.60 total earnings all-time (confirmed personal purchases). Deprioritise API image fix. Keep tag blasdigital-22 active.
- Worldwide eBay links: remove siteid=15 from all eBay affiliate links so international users route to their local eBay automatically. EPN commission still applies globally.

---

## REVENUE STATUS (AS OF 2 JULY 2026)

### eBay EPN
- Campid: 5339146789
- EPN tracking bug fixed 28 June 2026 (mkevt=1 was missing from all links)
- Pre-fix revenue: ~AU$77/month (likely underreported due to bug)
- Post-fix revenue: first accurate data expected in EPN dashboard from late June/early July
- eBay store: Cards on Cards on Cards. 23,943+ active listings. AU$3.49 floor. 99.9% feedback.

### Amazon AU
- Tag: blasdigital-22
- Total earnings all-time: $28.60 USD (note: USD not AUD) (confirmed as personal/friends purchases, not organic)
- 1,061 total clicks. 35 items ordered. 3.30% conversion. $377.66 total revenue dispatched.
- Status: active but zero organic revenue. Keep integration. Manual images for sealed product.

### AdSense
- Not active. Threshold: 10,000 monthly pageviews minimum before enabling.
- When enabled: blog pages and homepage only. Never card or hub pages.

### Subscription
- Stripe integration built. Resend built. Zero subscribers. Deprioritised indefinitely.
- LGS buylist display for a fee: future revenue stream once traffic is sufficient. Not in active roadmap.

---

## TRAFFIC STATUS (AS OF 2 JULY 2026)

- Traffic cliff: 19 June 2026. Dropped from ~58 clicks/day to 3 clicks/day.
- Root cause: Lorcana sitemap broken. Lorcana booster box pages dropped from Google index.
- Fix deployed: 28 June 2026. All sitemaps now use keyset pagination. count=exact removed. nullslast added. All 32 game sitemaps submitted to GSC.
- Recovery window: 24-72 hours from 28 June. Lorcana sitemap is the primary watch.
- GSC average position: 13.5 (page 2 for most queries). Moving to page 1 is primary organic lever.
- Blog sitemap: SUCCESS confirmed same day (28 June). 500 posts indexed.
- All 28 game card sitemaps: pending Google crawl as of 28 June. Total indexable card pages: ~96,500.
- Sitemap XML whitespace fixed 2 July 2026 (yugioh, cards, starwars, dragonball map() returns normalised to array-join).

---

## TECH STACK AND INFRASTRUCTURE

### Supabase
- Project ID: owaroeqchreuffbyakqx (Seoul region)
- Instance: Small (2GB RAM, 2-core ARM, ~$14.83/month). Upgraded 30 June 2026 from Nano after Disk IO Budget exhaustion caused pg_cron failures.
- RLS: all tables have anon SELECT + service_role ALL policies.
- pg_cron: enabled. Check health via: SELECT jobid, status, start_time, return_message FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20
- Expected status after Small upgrade: "succeeded" replacing "job startup timeout"
- ACTION REQUIRED: Run the pg_cron health query above to confirm recovery after Small upgrade. If still failing, next tier is Medium ($0.0822/hr).
- pg_net: enabled for future webhook HTTP calls
- 22 tables total with full RLS and indexes (as of 27-28 June sprint)
- MTG signals: update_mtg_signals() rewritten as batched function. Jobid 15. Runs 21:00 UTC daily. 41,423 MTG cards have 52-week signals.
- tcg_events: 67 ANZ tournament events loaded across 18 games, Jan-Dec 2026.

### Key Supabase patterns (do not deviate)
- count=exact: NEVER USE. Forces full sequential scan. Use keyset pagination (while batch.length === PAGE_SIZE).
- order=market_price.desc: ALWAYS add .nullslast to use index on tables with NULL market_price values.
- Anon role: 3-second statement timeout on public queries. Use SECURITY DEFINER functions for long-running computation.
- MTG join key: scryfall_id (not card_id). All other games use integer card_id.
- DDL changes: use apply_migration. Reads and DML: use execute_sql.
- Diagnostic table for pg_cron: cron.job_run_details

### Netlify functions (do not deviate)
- export const config must be at module level (unindented) for route/schedule registration
- Netlify.env.get() not process.env
- Promise.allSettled not Promise.all
- AbortController with 8-second timeout on every fetch
- Scheduled functions cannot also have a path in config. Mutually exclusive.
- res.ok check before JSON parse
- PostgREST URL construction: NEVER use URLSearchParams (percent-encodes asterisks and braces that PostgREST requires as literals). Manual string concatenation only.

### GitHub Actions
- Daily MTG sync: failed 29-30 June in parallel with pg_cron failures. Resolved after Supabase upgrade.
- Syntax check workflow: .github/workflows/syntax-check.yml (live)

---

## EXTERNAL APIs AND DATA SOURCES

| Source | Use | Cost | Status | Risk |
|---|---|---|---|---|
| tcgapi.dev | Card data, prices, synergies for 31 non-MTG games | $99.99/month Business plan | Active | CONFIRMED LOW. Written permission from _dataZar 2 July 2026. Not for resale as download or API. Display on public website is fine. |
| Scryfall | MTG card data, metadata, imagery, prices | Free | Active | No risk. WotC Fan Content Policy. Hard rule: cannot be paywalled. |
| pokemontcg.io | Pokemon condition-level pricing | Free (API key required) | Active | Low. Community project. Same upstream question as tcgapi.dev but dormant at current scale. |
| exchangerate-api.com | USD to AUD FX rates | Free (open v4) | Active | No risk. |
| Frankfurter API | Backup FX in ebay-prices.js | Free | Active | No risk. |
| eBay Browse API | eBay affiliate link generation | Free (EPN) | Active | No risk. Approved EPN affiliate. |
| Amazon Associates | Sealed product affiliate links | Free (tag: blasdigital-22) | Active | No risk. |

### tcgapi.dev game coverage (from website, 2 July 2026)
Currently in C3 (32 games): MTG, Pokemon, Yu-Gi-Oh, Lorcana, One Piece, Dragon Ball Super, Star Wars Unlimited, Riftbound, Digimon, Cardfight Vanguard, Weiss Schwarz, Final Fantasy, Force of Will, Buddyfight, Shadowverse, DBS Fusion World, Union Arena, UniVersus, MetaZoo, Grand Archive, Wixoss, Sorcery, Hololive, Gundam, Dragon Ball Z, Bakugan, Godzilla, Alpha Clash, Gate Ruler, Warhammer, WoW TCG, Battle Spirits Saga.

Available on tcgapi.dev but NOT yet in C3 (expansion candidates):
- Argent Saga TCG (1,000 cards, 10 sets)
- The Caster Chronicles (854 cards, 12 sets)
- Transformers TCG (733 cards, 8 sets)
- Exodus TCG (709 cards, 8 sets)
- Dragoborne (686 cards, 11 sets)
- Munchkin CCG (603 cards, 5 sets)
- Zombie World Order TCG (72 cards, 2 sets)
- My Little Pony CCG (38 cards, 11 sets)
- KeyForge (25 cards, 10 sets)
- Alternate Souls (14 cards, 2 sets)

Non-card products available on tcgapi.dev (to be incorporated for traffic and affiliate revenue):
- D&D Miniatures (1,273 cards/products, 24 sets)
- Life Counters (887 products, 17 sets)
- Collectible Storage (971 products, 76 sets)
- Storage Albums (1,313 products, 21 sets)
- Protective Pages (94 products, 7 sets)
- Supply Bundles (37 products, 6 sets)
- TCGplayer Supplies (2 products, 1 set)
- Bulk Lots (140 products, 28 sets)
- Card Storage Tins (10 products, 1 set)

Decision: YES, incorporate all of the above. Both additional games and accessories/supplies. All drive eBay affiliate traffic. Build after core bug sprint and Weiss Schwarz breakout.

### Weiss Schwarz breakout (CONFIRMED DECISION)
Weiss Schwarz is a publisher/umbrella brand, not a single game. Each licensed property must become its own full hub page for maximum SEO value. Examples of properties that need breakout: Attack on Titan, Sword Art Online, Re:Zero, Hololive (already separate), Madoka Magica, Sword Art Online, and all others in the Weiss Schwarz catalogue. Build full hub pages per property, not filtered views. This is a medium-sized build requiring schema work and new hub functions.

---

## KNOWN BUGS (PRIORITY ORDER — FIX BEFORE ANYTHING ELSE)

### Resolved
- Full audit 5 July 2026: (P1) card and set pages, MTG card-page, and the WS property hub now return 503 with Retry-After on a genuine Supabase fetch failure instead of 404, reserving 404 for confirmed-empty results. supabaseGet throws on failure across all 63 page files plus weissschwarz-property-hub; the primary existence query returns 503 on rejection, secondary data still degrades gracefully. This addresses the indexed-page drop (52.9k to 24.5k) caused by hard 404s during the outage. (P3) the "most valuable" top5 strip now sorts by price descending across all 58 affected set-page and card-page templates, matching the onepiece and pokemon reference. (P5.7) siteid=15 stripped from every eBay link in netlify/functions (287 occurrences, 104 files) for worldwide routing, campid and all other tracking params intact. Verified already-fixed and left unchanged (grep proof): extended set-page route conflicts, lorcana/pokemon hub slug tiles, pokemon set.id ordering, yugioh hardcoded cards array, onepiece/riftbound triple bug, card-compare em-dash. WS property pages confirmed correct in code and data (170 sets, 71 populated properties); prior live breakage was a stale deploy, now shipped. Investigated with no clear defect and left untouched: compare-search "No cards found" (endpoint logic sound), A-Z filter on non-MTG hubs (data-letter populated and matched). Out of scope this session: netlify.toml sync-ids schedules for lorcana/starwars/riftbound.
- Hub sets nullslast fix + WS sitemap series URLs 3 July 2026: added .nullslast to release_date.desc order on all 33 hub sets queries (corrects NULL-dated sets sorting above newest dated sets; complies with the nullslast standard). Added the 70 /cards/weissschwarz/series/ property URLs to sitemap-weissschwarz.mjs so the property hub pages get indexed.
- Fix sprint complete 3 July 2026 - 7 audit items resolved: WS hub property load (sets query decoupled from card queries), yugioh-set-page og:title added, onepiece/pokemon-set-page canonical de-www'd, em-dash cleanup (card-compare, card-index, card-page), Promise.allSettled across 29 set-pages, Compare game-count copy (8 to 32 TCGs, C3 Market left at 8), XSS card-name escaping in alt and text positions across card-pages. Note: search-page copy left at "7 games" (accurate to its 7 searchable games; expanding search to 32 is a separate feature task).

### Critical (blocking user experience)
- ~~Search bar: "No cards found" on some queries. compare-search endpoint response handling filtering incorrectly.~~
  RESOLVED (task-40, confirmed live 10 Jul 2026): compare-search.mjs already lists all 32 games via GAME_TABLES; live /api/compare-search returned results for charizard (Pokemon) and luffy (One Piece). No fix needed.
- ~~A-Z filtering: not working on non-MTG hubs. Investigate data-letter attribute population on set tiles.~~
  RESOLVED (task-40, confirmed in source 10 Jul 2026): data-letter is populated from the first char of the set name (letterKey/lk) on pokemon-hub, lorcana-hub, onepiece-hub; not blank/undefined.
- ~~Extended game set page 404s: audit all extended game set-page path registrations for route conflicts.~~
  RESOLVED (task-40, confirmed live 10 Jul 2026): set pages are served by per-game functions at /cards/<game>/sets/:slug+ (not netlify.toml routes). Live HTTP 200 for godzilla, hololive, warhammer, grandarchive, wow, dragonballz. The old /sets/<game>/ URL shape 404s but is not the real route.
- ~~Sitemap generation: mtg_cards fetch returns 500 during Netlify build. generate-sitemap-cards.mjs timeout fix needed.~~
  RESOLVED (task-40/41, 10 Jul 2026): the active build script scripts/generate-sitemap-cards.mjs already has fetchWithRetry (exp backoff), a zero-row sanity guard, and process.exit(1) on genuine failure. The stale unused duplicate netlify/functions/generate-sitemap-cards.mjs was deleted in task-41.

### High priority (affects revenue or data integrity)
- var u= minified pattern: present in 8 primary hubs and 7 primary card-pages. Breaks search and A-Z filters.
- pokemon-set-page.mjs: set.id referenced before set is declared. Runtime crash.
- lorcana-hub and pokemon-hub: set tile URLs use s.id not s.slug.
- yugioh-set-page.mjs: possibly still has const cards = [] hardcoded. Verify.
- onepiece-card-page and riftbound-card-page: triple bug (extra brace + escaped backtick + duplicate _psr0).
- sync-sales-history: has never run successfully. Trigger manually and verify card_sales_history receives rows.
  STILL OPEN (task-40/41, 10 Jul 2026): trigger mechanism confirmed present (POST with header x-sync-secret matching SYNC_SECRET env var; also scheduled 0 17). card_sales_history confirmed 0 rows / null week_date on 10 Jul 2026, so it has genuinely never received data. Not triggered in task-41 (read-only check per instructions). Manual trigger + verification still required.
- ~~netlify.toml: confirm and add explicit schedule entries for lorcana, riftbound, starwars, dragonball if missing.~~
  RESOLVED (task-41, 10 Jul 2026): dragonball already had a dedicated sync-ids schedule. Added sync-ids-lorcana-background (10 3), sync-ids-riftbound-background (20 3), sync-ids-starwars-background (30 3), staggered within the 03:00 window. All three target files confirmed to exist.
- ~~MTG Batch A streaming JSON fix: artist, edhrec_rank, reserved fields all zero in database. sync-mtg-cards.mjs streaming parser not capturing these fields from Scryfall.~~
  RESOLVED (task-40, confirmed in code + DB 10 Jul 2026): the active sync (scripts/sync-mtg-daily.mjs) maps artist, reserved, edhrec_rank into the upsert. DB over 98,052 mtg_cards rows: artist populated 97,358, edhrec_rank 91,197, reserved=true 1,068 (reserved non-null on all rows). Not zero.
- eBay carousel (ebay-prices.js): filter by seller=cardsoncardsoncards, sort by price desc, EPN campid 5339146789 on all links, category_ids=183454.
  ADDRESSED (task-41, 10 Jul 2026): seller filter (/str/cardsoncardsoncards) and campid=5339146789 were already present. Added _sacat=183454 (CCG Individual Cards category) and _sop=16 (price high-to-low sort) to the store-search link. Store (/str/) support for these params needs live browser verification after deploy; item search (/sch/i.html) elsewhere in the repo already uses _sacat=183454.
- Pre-existing em-dash in card-compare.mjs: CLAUDE.md violation. Fix in next push.
- ~~package-lock.json: has unrelated pre-existing local modification. Include in next push.~~
  RESOLVED (task-41, 10 Jul 2026): the local change removes the direct stream-chain dependency (consistent with package.json, which no longer lists it). Committed in task-41. NOTE: scripts/sync-mtg-daily.mjs still imports stream-chain, which now resolves only as a transitive dep of stream-json - worth adding back as a direct dep if that import is intended to be relied on.
- siteid=15 in all eBay links: must be removed for worldwide routing. International users currently sent to eBay AU only.

### Medium priority (affects quality)
- Visual audit: Cowork screenshot loop for all 27 game hub pages. Identify layout issues.
- cards.html: verify live search dropdown (vault-search-results) is working correctly.
- Extended game set pages: systematic slug resolution check.
- Lorcana hub: browser-verify set links after s.slug fix.
- Pokemon hub: browser-verify set links after s.slug fix.
- sync_events INSERT: add to end of each background sync function (approx 30 files) so audit trail builds.
- yugioh-set-page.mjs: confirm AbortController is present (status unverified).
- Three broken internal links on Pokemon hub: two blog links, one quiz link. Batch into next deploy.
- FX fetch bug: lorcana, finalfantasy, unionarena card pages still using stale fallback rate instead of live fetch.
- Mobile nav unification: not consistent across all non-MTG pages.

---

## CODE AUDIT STANDARD (RUN ON EVERY .mjs BEFORE DELIVERY)

Run unprompted. Repeat until zero issues. Cold restart after every fix.

Checks for .mjs files:
1. Syntax correct
2. export const config at module level (unindented)
3. EPN campid 5339146789 present on all eBay links
4. No em dashes anywhere
5. AbortController with timeout on every fetch
6. res.ok check before JSON parse
7. select= on every Supabase query
8. No display:contents on forms
9. Promise.allSettled not Promise.all
10. siteid=15 removed from all eBay links (worldwide routing)

Checks for HTML files:
11. GA4 G-WR68HPE92S present
12. rel=icon c3logo.png present
13. og:image, og:title, og:description present
14. Affiliate disclaimer in footer
15. Canonical URL present
16. Mobile media query present
17. nav-links flex-shrink:0, no space-between on nav-inner
18. Nav paths: /compare not /card-compare.html, /market not /market.html

XSS checks:
19. alt= attrs: .replace(/"/g,'&quot;')
20. innerHTML divs: escape < and >
21. data-name attrs: escape quotes and apostrophes
22. Set names in spans: escape < >
23. Drawer innerHTML labels: escape < >
24. data-setname: escape quotes
25. User query: create safeQuery for HTML, use raw query for encodeURIComponent and gtag JS context
26. SUPABASE_ANON_KEY must never appear after const html=` line

Process:
- Read every line before any automated check
- Run automated audit
- Fix all issues
- Cold restart: read from line 1 again as if never seen
- Run audit again
- Repeat until zero issues on a full fresh pass
- Never declare clean after fixing without running the full suite again

---

## CONTENT RULES (APPLY EVERYWHERE)

- Australian English throughout
- No em dashes or en dashes anywhere. Use commas, brackets or full stops.
- No banned words: straightforward, elevate, robust, comprehensive, leverage, delve, unlock, seamless, tapestry, vital, crucial, game-changer, dive in, furthermore, moreover
- No filler phrases: "great question", "certainly", "absolutely"
- Sign-off: "The C3 Team" only. Never "Sammy."
- Blog posts: minimum 1,000 words evergreen, 800 words tournament previews
- Minimum 5 FAQ pairs per post
- Mandatory CTAs by post type
- Maximum 3 sentences per paragraph
- Subheadings every 300 words

---

## CLAUDE CODE VS CLAUDE.AI SPLIT

Claude Code (terminal): all file edits, git operations, bash commands, npm, build scripts, iterating on functions with immediate testing, 3+ file changes in same session, debugging Netlify functions with log reading.

Claude.ai (this interface): planning, content, strategy, Supabase MCP, analysis, blog posts, documents, spreadsheets, reviewing approach, generating CLAUDE.md updates.

Never paste full .mjs files into Claude.ai. Never generate repo files in Claude.ai for manual copy.

### Claude Code prompt permissions block (include at top of every Claude Code prompt)
PERMISSIONS: Auto-approve without asking: git log/status/diff/add/commit/push, node --check on any file, npm run build, grep/find/ls/echo/cat on any repo file, sed -i on netlify/functions/*.mjs, python3 scripts in /tmp/, reading and writing /tmp/ files. Only ask before creating new files in netlify/functions/ or running git push to main.

---

## PUSH DISCIPLINE

- Minimum 3 files per commit. Never push a single-file fix.
- Never push twice in one session without explicit user approval.
- Every push = one Netlify deploy = usage burned.
- One push per session unless explicitly approved for second.
- Include PROJECT.md (this file once renamed) in every commit.
- Batch all related changes into one push.

---

## INVESTIGATION RULES (MANDATORY)

- Write a read-only investigation prompt first
- User runs in Claude Code
- Paste output back
- Write execution prompt based on confirmed live data
- Never write execution prompts from stale snapshots or project file copies
- Project file copies are STALE. Always verify against live repo files via Claude Code.
- Run every grep before writing any fix
- Show data first, write prompt second
- After investigation, state what was NOT checked
- Never accept ALREADY-FIXED without grep confirmation in same session
- Cover ALL file types every time
- Missing a file type or pattern variant is a failed audit

---

## VERIFICATION RULES

- Every claim must be backed by grep or query output in the same session
- node --check passes do not confirm browser behaviour
- npm run build passing does not confirm runtime query results
- Browser verification steps must specify exactly what "working" looks like
- Supabase queries must confirm data exists before assuming a code fix will solve a display problem

---

## REVIEW RULES

- Never review a prompt by reading the prompt
- Always review by returning to raw data and asking "what does the data show that the prompt does not handle?"
- Treat every prompt as wrong until data proves otherwise
- Before sign-off, explicitly answer: what files were not checked, what pattern variants were not tested, what error states are not handled, what happens after each fix if it reveals a new error

---

## USAGE EFFICIENCY RULES

1. Disable unused connectors before each session. Enable only what is needed for that task.
2. One task per chat. One goal per session.
3. Plan before pasting. Paste only what is needed. Reference file paths instead of pasting whole files.
4. Batch requests. Send all related questions in one message.
5. No confirmation loops. If output is trusted, go run it. Only reply to report an error.
6. Avoid copy-back loops. Do not paste a file back asking Claude to check it unless something is broken.
7. Check usage at Settings > Usage before heavy sessions.
8. If a chat has gone past 15-20 exchanges, stop and start a new one with a one-paragraph summary.
9. Long conversations re-send full history every turn. This is the biggest usage driver. Keep chats short.
10. Multiple active MCP connectors burn usage even when not called. Disable them.

---

## FABLE 5 INTEGRATION

Claude Fable 5 launched 9 June 2026. Suspended 12 June due to US export directive. Restored approximately 2 July 2026. Now available on claude.ai.

Fable 5 sits above the Opus class in Anthropic's model hierarchy. Same underlying model as Mythos 5 with safety classifiers added. 1M token context window. 128K output tokens. Costs 2x usage on subscription plans.

Use Fable 5 for:
- AI content pipeline generating card intelligence content (how-to-play, synergies, combos) at scale. Quality difference over Sonnet 4.6 is material for complex game mechanics content.
- Claude Code sessions doing complex multi-file refactors. Reduces iteration cycles and errors.

Use Sonnet 4.6 for:
- Strategy, planning, content writing, spreadsheets, blog posts, shorter conversations.
- Any task where Sonnet 4.6 quality is sufficient. Fable 5 at 2x usage burns the session budget fast.

Model string for API use: claude-fable-5

---

## AI CONTENT PIPELINE (PLANNED - WEEK 2+)

Purpose: generate card intelligence content at scale using Fable 5 via Anthropic API.

Content per card page:
- How this card works (rules explanation in plain language)
- What this card does well (strategic role)
- Cards that work well with this card (synergy suggestions)
- Common combos involving this card
- What deck archetypes use this card
- Format legality and notes where applicable

Storage: new Supabase table card_content with columns: card_id, game, how_to_play, synergies, combos, deck_roles, generated_at. Index on card_id and game.

Generation priority order: Tier 1 games first (MTG, Pokemon, Lorcana, One Piece, Yu-Gi-Oh, Riftbound, Star Wars), then Tier 2, then Tier 3.

Quality rule: wrong synergy suggestions will damage C3 credibility in TCG communities. Every prompt must be game-specific and mechanically grounded. Generic output is not acceptable. Source rulings from official documents or add a "verify with official ruling" disclaimer.

Accuracy disclaimer to appear on all AI-generated content: "Synergy suggestions are AI-assisted. Always verify with official card rulings before play."

---

## GAME TIERS

### Tier 1 (flagship, priority build and content)
MTG, Pokemon, Yu-Gi-Oh, One Piece, Lorcana, Riftbound, Star Wars Unlimited

### Tier 2 (useful expansion, build after Tier 1 stable)
Cardfight Vanguard, Dragon Ball Super, Digimon, DBS Fusion World, Union Arena, Sorcery, Gundam, Weiss Schwarz (see breakout note below)

### Tier 3 (niche and legacy, keep visible with confidence labels)
Final Fantasy, Force of Will, UniVersus, Shadowverse, Grand Archive, Hololive, Wixoss, Buddyfight, WoW TCG, MetaZoo, Alpha Clash, Battle Spirits Saga

### Tier 4 (suppress from homepage, fix data before promoting)
Bakugan, Gate Ruler, Godzilla, Dragon Ball Z, Warhammer

### Expansion games (not yet in C3, build after core is stable)
Argent Saga TCG, The Caster Chronicles, Transformers TCG, Exodus TCG, Dragoborne, Munchkin CCG, Zombie World Order TCG, My Little Pony CCG, KeyForge, Alternate Souls

### Accessories and supplies (add for traffic, not card intelligence)
D&D Miniatures, Life Counters, Collectible Storage, Storage Albums, Protective Pages, Supply Bundles, TCGplayer Supplies, Bulk Lots, Card Storage Tins. All get eBay affiliate links. No card intelligence content needed. Simple hub and product pages.

### Weiss Schwarz breakout
Each licensed property under Weiss Schwarz gets its own full hub page. Build after core bug sprint. Requires schema work and new hub functions per property.

---

## DEPLOYED INFRASTRUCTURE (DO NOT DELETE OR REBUILD)

### Netlify functions (active)
- random-card.mjs: random card feature
- commander-carousel.mjs: MTG Commander carousel on homepage
- compare-search.mjs: multi-game search endpoint
- card-compare.mjs: Card Compare page function
- search-page.mjs: /search page queries
- ebay-prices.js: eBay carousel (needs completing per bug list)
- set-carousel.mjs: set carousel component
- enrich-prices-background.mjs: price enrichment
- card-index.mjs: card index function
- card-api.mjs: card API function
- card-search.mjs: card search function
- dnd-interest.mjs: D&D interest capture
- check-price-alerts.mjs: price alert checker
- market-insights.mjs: market insights page
- generate-weekly-report.mjs: weekly seller report email
- stripe-webhook.mjs: Stripe webhook (deprioritised but keep)
- email-subscribe.mjs: email subscribe handler
- card-kingdom.mjs: Card Kingdom integration
- sync-fx-rate.mjs: centralised FX rate sync
- get-fx-rate.mjs: FX rate endpoint

### Static pages (live)
- index.html: homepage
- cards.html: Card Vault
- shop.html: shop page
- contact.html: contact
- tracker.html: collection tracker
- ev-calculator.html: EV calculator
- legal.html: legal and affiliate disclosure
- calendar.html: release calendar
- blog.njk: blog (500 posts)

### MTG hub and card pages (live)
- mtg-hub.mjs: rotation warning, EV sets, sparklines, banned lists
- card-page.mjs (MTG): live
- mtg-banned.mjs: all 4 formats (Standard, Pioneer, Modern, Legacy)

### Primary 8 game hubs (deployed, known bugs - see bug list)
pokemon-hub, yugioh-hub, lorcana-hub, onepiece-hub, dragonball-hub, starwars-hub, riftbound-hub

### Extended 24 game hubs (deployed, not individually verified)
digimon, vanguard, weissschwarz, finalfantasy, forceofwill, buddyfight, shadowverse, dbsfusionworld, unionarena, universus, metazoo, grandarchive, wixoss, sorcery, hololive, gundam, dragonballz, bakugan, godzilla, alphaclash, gateruler, warhammer, wow, battlespiritssaga

### Supabase tables (22 total, all RLS enabled)
Core game tables (cards, sets, price_snapshots for each): mtg_cards, mtg_sets, mtg_price_snapshots, pokemon_cards, yugioh_cards, lorcana_cards, onepiece_cards, dragonball_cards, starwars_cards, riftbound_cards, card_sales_history, sync_events, mtg_card_views, mtg_card_likes, mtg_signals, tcg_events, tcg_releases, retailer_placements, and 4 others from 27-28 June sprint.

MTG image field: image_uri (not image_url - different from all other games)
mtg_card_likes and mtg_card_views: 3 policies each (anon INSERT, anon SELECT, service_role ALL) - intentional, not an anomaly.

---

## AFFILIATE LINK FORMATS

### eBay EPN (worldwide, siteid removed)
https://www.ebay.com/sch/i.html?_nkw=[SEARCH]&campid=5339146789&customid=[CONTEXT]&mkevt=1&mkcid=1&mkrid=705-53470-19255-0&toolid=10001

Note: siteid=15 removed for worldwide routing. International users route to local eBay automatically.

### eBay store link
https://www.ebay.com.au/str/cardsoncardsoncards?campid=5339146789&customid=[CONTEXT]&mkevt=1&mkcid=1&mkrid=705-53470-19255-0&toolid=10001

### Amazon AU
https://www.amazon.com.au/dp/[ASIN]?tag=blasdigital-22

### eBay Browse API (for carousel)
- category_ids=183454 (TCG singles)
- Filter: seller=cardsoncardsoncards
- Sort: -price (highest first)
- Limit: 20
- Cache: 30 minutes
- All links must include EPN campid 5339146789

### EPN links must NOT appear on physical inserts (self-referral policy violation)

---

## SECONDARY PROJECT: PORTAL ASTRA

- Site: portalastra.com
- Stack: Next.js / Netlify
- GA4: G-QMJ074E2JZ
- GSC: verified, sitemap submitted
- Outstanding: MailerLite welcome email automation, Stars tab horoscope reading test, mobile audit
- Longer-term: Stripe paid tier, Supabase APOD archive
- This project is separate from C3. Do not mix context.

---

## SUPPLIER REFERENCE

- Primary supplier: Dice Arcade Miranda
- No individual card buying. Booster box sourcing only.
- PokeBox AU: backup for play boxes
- Strixhaven play boxes: AU$225 (47.7% off street)
- OP Kami: AU$215
- MH3 CB avg eBay AU sold: AU$955, net AU$340-418/box

---

## ETSY RULES (BLAS DIGITAL)

- No & % $ special characters in titles. Use "and" instead of &.
- Commas as separators in titles. Not pipes or em dashes.
- Titles under 140 characters.
- Exactly 13 tags, comma-separated.
- Each tag 1-20 characters.
- Prices entered ex-GST.
- Etsy store: blasdigital.etsy.com

---

## BUILD PRIORITY ORDER (FROM 2 JULY 2026)

### Step 1: Bug sprint (do before everything else)
Fix all Critical and High bugs from the bug list above. One push at end of sprint. Include all related files, PROJECT.md, siteid removal from all eBay links, em-dash fix in card-compare.mjs, and package-lock.json in the same push.

### Step 2: Card intelligence content layer
Create card_content Supabase table. Build AI content pipeline using Fable 5 via Anthropic API. Generate content for Tier 1 games first. Add content sections to card page templates. Pricing display stays. Content is additive, not replacing prices.

### Step 3: Release calendar page live
/calendar page. tcg_releases and tcg_events tables already populated. "Upcoming TCG releases 2026" has low competition. Add to hub pages as upcoming events section.

### Step 4: Worldwide positioning and brand update
Update homepage copy, meta tags, nav, legal page to reflect worldwide scope and card intelligence positioning. Remove AU-only framing. Keep Australian-built identity as credibility marker.

### Step 5: Weiss Schwarz breakout
Schema work, new hub functions per licensed property.
WS breakout complete 3 July 2026: new weissschwarz-property-hub.mjs serves /cards/weissschwarz/series/:property (70 licensed property groups), weissschwarz-hub.mjs converted to a property directory index, sync-weissschwarz-background.mjs auto-assigns property on new sets via weissschwarz_property_map. Route namespaced under /series/ to avoid collision with card-page :slug+ (card-page excludedPath updated). Pending: global siteid=15 removal from eBay links (per strategic direction) still applies to WS hub and property hub.

### Step 6: Expansion games and accessories
Add remaining tcgapi.dev games and accessory/supply categories.

### Step 7: AdSense (when traffic permits)
Blog pages and homepage only. Not card or hub pages.

### Step 8: LGS buylist display
Approach local game stores once traffic is sufficient. Paid placement for their buylist data.

---

## UPCOMING CONTENT DEADLINE

Blog posts p494-p515 done. Next sequential post: p516.

YGO Oceanic WCQ recap post (p516): due within 48 hours of 12 July 2026 event ending.

---

## SECURITY STATUS (CONFIRMED 19 MAY 2026)

All tables have RLS enabled with correct anon SELECT + service_role ALL policies. mtg_card_likes and mtg_card_views correctly have 3 policies each (anon INSERT, anon SELECT, service_role ALL). This is intentional, not an anomaly.

---

## DATA SOURCE LEGAL STATUS

| Source | Status | Evidence | Action |
|---|---|---|---|
| tcgapi.dev | CONFIRMED PERMITTED | Discord DM from _dataZar 2 July 2026. Screenshot saved locally. | None required. Keep displaying prices. |
| pokemontcg.io | Low risk, unconfirmed | Community project, widely used | Contact if revenue grows significantly |
| Scryfall | Confirmed permitted | WotC Fan Content Policy | Cannot paywall MTG data. Currently compliant. |
| eBay Browse API | Confirmed | Approved EPN affiliate | No action |
| exchangerate-api.com | No risk | Public FX data | No action |
| Amazon Associates | Confirmed | Approved affiliate | No action |

Footer attribution required: TCGPlayer data via tcgapi.dev. MTG data via Scryfall (WotC Fan Content Policy). Exchange rates via exchangerate-api.com.

---

*End of C3 Master Project Document*
*Model used to generate: Claude Sonnet 4.6*
*Date: 2 July 2026*
*Replace all previous handover documents with this file. Filename in repo: PROJECT.md*
