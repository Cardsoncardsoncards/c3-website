# PROJECT.md -- C3 Build Plan
# Cards on Cards on Cards (cardsoncardsoncards.com.au)
# Last updated: 4 June 2026
#
# HOW TO USE THIS FILE:
# - Read this file at session start to identify the next incomplete item
# - Mark items [x] as you complete and verify them
# - Never mark an item done unless npm run build passes AND the feature is confirmed working
# - Commit this file as part of every session push so progress is tracked
# - Update "Last updated" date when marking items complete
# - If unsure whether something is done, check the repo -- do not assume

---

## CHANGELOG

## Push: 29 May 2026
- Homepage: meta title updated to "Australia's TCG Intelligence Platform"
- Homepage: meta description rewritten with AU keyword targeting
- Homepage: hero headline changed to "Make smarter TCG decisions"
- Homepage: accent bar added below hero headline
- Homepage: hero subheading rewritten with intelligence and AU positioning
- Homepage: hero search bar added (connects to /cards search)
- Homepage: eBay store CTA and collection tracker CTA added to hero fold (replaces old Card Vault + EV Calculator CTAs)
- Homepage: social proof line added (25,000+ singles, same-day dispatch Sydney)
- Homepage: stats block updated (350,000+ cards, 31 TCGs, daily AU prices) -- went from 4 items to 3
- Homepage: Our Approach affiliate apology deleted, replaced with mission statement + Amazon Associates + EPN disclosure
- Homepage: section labels added (LATEST PRICES above carousel, START HERE above destination grid). FROM THE BLOG skipped -- no blog section on homepage
- Homepage: nav Card Vault renamed to Card Prices
- Homepage: commander carousel given 100vw breakout, hover lift CSS, keyboard-accessible pause button
- Homepage: mobile carousel edge fade fixed to 20px
- Homepage: email capture section added, connected to MailerLite group 182892277158381312
- Homepage: footer mission line added as first child of footer
- Homepage: GA4 eBay click tracking added to nav and footer eBay links (hero CTA already wired)
- All 8 hubs (pokemon, lorcana, yugioh, onepiece, dragonball, starwars, riftbound, mtg): GA4 eBay click tracking added to all eBay links (nav, carousel buy, quick-link)
- All 8 hubs: Shop eBay button confirmed above the set browser grid (already in correct position)
- Homepage tool descriptions (1l): skipped -- homepage has a single Tools destination card, not 4 individual tool cards
- Tools page: headline updated to "TCG Intelligence Tools" with inline styling
- Tools page: eyebrow removed, hero paragraph rewritten ("Data-driven tools built for the Australian TCG market...")
- Tools page: all 4 tool card descriptions rewritten to short one-liners
- New: netlify/functions/email-subscribe.mjs (MailerLite API subscriber function, 8s AbortController per CLAUDE.md, path /api/email-subscribe)

---

## DATABASE STATUS (as of 21 May 2026)

| Table | Count | Status |
|---|---|---|
| mtg_cards | 96,508 | Syncing daily via Scryfall |
| mtg_sets | 746 | Complete |
| pokemon_cards | 31,813 | Syncing daily via tcgapi.dev |
| pokemon_sets | 216 | Complete |
| yugioh_cards | 46,589 | Syncing daily via tcgapi.dev |
| yugioh_sets | 611 | Complete |
| lorcana_cards | 3,153 | Syncing daily via tcgapi.dev |
| lorcana_sets | 18 | Complete |
| onepiece_cards | 6,664 | Syncing daily via tcgapi.dev |
| onepiece_sets | 74 | Complete |
| dragonball_cards | 11,590 | Syncing daily via tcgapi.dev |
| dragonball_sets | 102 | Complete |
| starwars_cards | 6,913 | Syncing daily via tcgapi.dev |
| starwars_sets | 26 | Complete |
| riftbound_cards | 1,162 | Syncing daily via tcgapi.dev |
| riftbound_sets | 8 | Complete |
| card_sales_history | 0 | Empty -- sync-sales-history has not run successfully |
| mtg_price_snapshots | ~870,000 | Building daily |
| sync_events | 0 | Table exists, no data yet |
| mtg_card_views | ~4,892 | Active |
| mtg_card_likes | 0 | Active |

### tcgapi_id status (as of 21 May 2026 bulk cleanup)
| Game | Valid | Not found (-1) | NULL remaining |
|---|---|---|---|
| MTG | 11 | 94,409 | 2,088 (no tcgplayer_id) |
| Yu-Gi-Oh | 12,324 | 34,265 | 0 |
| Pokemon | 9,600 | 22,213 | 0 |
| Dragon Ball | 3,056 | 8,534 | 0 |
| Star Wars | 1,968 | 4,945 | 0 |
| One Piece | 3,061 | 3,603 | 0 |
| Riftbound | 439 | 723 | 0 |
| Lorcana | 699 | 2,454 | 0 |

---

## PHASE 1 -- INFRASTRUCTURE (COMPLETE)

- [x] Supabase schema: all 8 core game tables with cards, sets, price_snapshots
- [x] RLS policies: anon SELECT + service_role ALL on all tables
- [x] pg_cron enabled: mtg-tcgapi-null-cleanup (2am UTC daily) + sitemap-staleness-check (every 6h)
- [x] pg_net enabled for future webhook HTTP calls
- [x] sync_events table created with RLS
- [x] All 8 core game daily syncs deployed and scheduled
- [x] 23 extended game syncs deployed and scheduled (daily, staggered times)
- [x] sync-ids-* functions for all 8 games deployed
- [x] sync-ids schedule: lorcana/onepiece/riftbound/starwars/dragonball schedules added to function config (21 May 2026)
- [x] tcgapi_id bulk cleanup: all 8 core games at 0 NULL (21 May 2026)
- [x] GitHub Actions syntax check: .github/workflows/syntax-check.yml live (21 May 2026)
- [x] .claude/ added to .gitignore (21 May 2026)
- [ ] netlify.toml: verify explicit schedule entries for lorcana/riftbound/starwars/dragonball -- function config has them, toml status unconfirmed

---

## PHASE 2 -- CORE PAGES (COMPLETE WITH KNOWN BUGS)

### Static pages
- [x] index.html (homepage) -- live, destination cards section updated 21 May 2026
- [x] cards.html (Card Vault) -- live, search bar restored 21 May 2026, live dropdown search working
- [x] shop.html -- live
- [x] contact.html -- live, mailto links fixed
- [x] tracker.html -- live
- [x] ev-calculator.html -- live
- [x] legal.html -- live
- [x] calendar.html -- live
- [x] blog.njk -- live, 262 posts indexed as of 21 May 2026

### MTG hub and card pages
- [x] mtg-hub.mjs -- live, rotation warning, EV sets, sparklines, banned lists
- [x] card-page.mjs (MTG) -- live
- [x] mtg-banned.mjs -- live, all 4 formats (Standard, Pioneer, Modern, Legacy)

### Primary 8 game hubs (built, have known errors -- see Phase 3)
- [x] pokemon-hub.mjs -- deployed, set URLs fixed (s.slug||s.id) 21 May 2026
- [x] yugioh-hub.mjs -- deployed
- [x] lorcana-hub.mjs -- deployed, set URLs fixed (s.slug||s.id) 21 May 2026
- [x] onepiece-hub.mjs -- deployed
- [x] dragonball-hub.mjs -- deployed (Dragon Ball SUPER / DBS)
- [x] starwars-hub.mjs -- deployed
- [x] riftbound-hub.mjs -- deployed

### Primary 8 game set pages (AbortController fix applied 21 May 2026)
- [x] pokemon-set-page.mjs -- AbortController added
- [x] yugioh-set-page.mjs -- deployed (AbortController status: unverified)
- [x] lorcana-set-page.mjs -- AbortController added
- [x] onepiece-set-page.mjs -- AbortController added, eBay game name bug fixed
- [x] dragonball-set-page.mjs -- AbortController added (Dragon Ball SUPER / DBS)
- [x] starwars-set-page.mjs -- AbortController added
- [x] riftbound-set-page.mjs -- AbortController added

### Primary 8 game card pages
- [x] pokemon-card-page.mjs -- deployed
- [x] yugioh-card-page.mjs -- deployed
- [x] lorcana-card-page.mjs -- deployed
- [x] onepiece-card-page.mjs -- deployed
- [x] dragonball-card-page.mjs -- deployed (Dragon Ball SUPER / DBS)
- [x] starwars-card-page.mjs -- deployed
- [x] riftbound-card-page.mjs -- deployed

### Extended 24 game hubs/set/card pages (all deployed, not individually verified)
- [x] digimon hub/set/card -- deployed
- [x] vanguard hub/set/card -- deployed
- [x] weissschwarz hub/set/card -- deployed
- [x] finalfantasy hub/set/card -- deployed
- [x] forceofwill hub/set/card -- deployed
- [x] buddyfight hub/set/card -- deployed
- [x] shadowverse hub/set/card -- deployed
- [x] dbsfusionworld hub/set/card -- deployed
- [x] unionarena hub/set/card -- deployed
- [x] universus hub/set/card -- deployed
- [x] metazoo hub/set/card -- deployed
- [x] grandarchive hub/set/card -- deployed
- [x] wixoss hub/set/card -- deployed
- [x] sorcery hub/set/card -- deployed
- [x] hololive hub/set/card -- deployed
- [x] gundam hub/set/card -- deployed
- [x] dragonballz hub/set/card -- deployed (Dragon Ball Z / DBZ -- separate from DBS)
- [x] bakugan hub/set/card -- deployed
- [x] godzilla hub/set/card -- deployed
- [x] alphaclash hub/set/card -- deployed
- [x] gateruler hub/set/card -- deployed
- [x] warhammer hub/set/card -- deployed
- [x] wow hub/set/card -- deployed
- [x] battlespiritssaga hub/set/card -- deployed

---

## PHASE 3 -- KNOWN BUGS TO FIX (PRIORITY ORDER)

Work through Critical first, then High, then Medium. Do not start Phase 4 features until all Critical and High items are resolved.

### Critical (blocking user experience)
- [ ] Search bar: investigate "No cards found" on some queries -- compare-search endpoint response handling may be filtering incorrectly
- [ ] A-Z filtering: not working on non-MTG hubs -- investigate data-letter attribute population on set tiles
- [ ] Extended game set page 404s: audit all extended game set-page path registrations for route conflicts
- [ ] Sitemap generation: mtg_cards fetch returns 500 during Netlify build -- generate-sitemap-cards.mjs timeout fix needed

### High priority (affects revenue or data integrity)
- [ ] sync-sales-history: trigger manually and verify card_sales_history receives rows -- has never run successfully
- [ ] netlify.toml: confirm and add explicit schedule entries for lorcana/riftbound/starwars/dragonball if missing
- [ ] MTG Batch A streaming JSON fix: artist, edhrec_rank, reserved fields all zero in database -- fix sync-mtg-cards.mjs streaming parser (NOTE: this is a separate issue from tcgapi_id coverage -- Scryfall returns these fields but the streaming parser is not capturing them)
- [ ] eBay carousel (ebay-prices.js): filter by seller=cardsoncardsoncards, sort by price desc, EPN campid 5339146789 on all links, category_ids=183454

### Medium priority (affects quality)
- [ ] Visual audit: Cowork screenshot loop for all 27 game hub pages -- identify layout issues
- [ ] cards.html: screenshot verify live search dropdown (vault-search-results) is working correctly after restore
- [ ] Extended game set pages: systematic slug resolution check (confirm set URLs are navigating correctly)
- [ ] Lorcana hub: browser-verify set links after s.slug||s.id fix
- [ ] Pokemon hub: browser-verify set links after s.slug||s.id fix
- [ ] sync_events INSERT: add to end of each background sync function (approx 30 files) so audit trail builds
- [ ] yugioh-set-page.mjs: confirm AbortController is present (status unverified)
- [x] Fix ebayToken [] fallback to null in onepiece-card-page.mjs and riftbound-card-page.mjs (line 88)
- [x] Stripe AU$14.95 founding member product created, payment links updated in market-insights.mjs and pricing.html
- [x] MTG price change function rewritten with LATERAL subquery, pg_cron scheduled 20:00 UTC nightly
- [x] All 7 sibling price change functions refactored to use <= date matching
- [x] generate-weekly-report.mjs deployed via Resend, confirmed working end to end (1 subscriber + preview)
- [x] Stripe CLI installed, webhook confirmed active, test mode limitation noted

---

## DEPLOYED UTILITIES (do not delete or rebuild these)

- random-card.mjs: random card feature -- keep
- commander-carousel.mjs: MTG Commander carousel on homepage -- keep
- compare-search.mjs: multi-game search endpoint -- keep, read before building Card Compare
- card-compare.mjs: Card Compare page function -- keep
- search-page.mjs: handles /search page queries -- keep
- ebay-prices.js: eBay carousel skeleton -- needs completing (see Phase 3 High priority)
- set-carousel.mjs: set carousel component -- keep
- enrich-prices-background.mjs: price enrichment -- keep
- card-index.mjs: card index function -- keep
- card-api.mjs: card API function -- keep
- card-search.mjs: card search function -- keep
- dnd-interest.mjs: D&D interest capture -- keep
- check-price-alerts.mjs: price alert checker -- keep

---

## PHASE 4 -- FEATURES NOT YET BUILT

Do not start Phase 4 until all Phase 3 Critical and High items are complete.

### SEO (high value, confirmed low-competition opportunity)
- [ ] Artist pages for MTG -- GATED: requires Batch A fix + confirmed near-complete artist field coverage first
- [ ] Artist sort on MTG hub -- same gate condition
- [ ] Sitemap functions for 24 extended game card and set pages (hub pages covered by sitemap-static, card/set pages not covered)

### Card Compare feature (fully designed, not yet built)
NOTE: compare-search.mjs and card-compare.mjs already exist. Read both before starting.
Build in this exact order:
- [ ] Static two-card proof of concept (start here -- no backend)
- [ ] Side-by-side comparison for up to 4 cards
- [ ] Intent mode toggle (Buy / Sell / Compare Value)
- [ ] Condition adjustment and AUD/USD toggle (exchangerate-api.com)
- [ ] Version Value Score (0-100) and plain-English verdict
- [ ] Shareable URL
- [ ] CSV/XLSX download via SheetJS
- [ ] Portfolio Mode (email-gated, files never leave browser)
- [ ] Pro subscription tier AU$12-15/month (build last, after free tier is validated)

### eBay integration improvements
- [ ] eBay top-20 carousel complete: ebay-prices.js currently exists as skeleton -- finish with seller filter, price desc sort, limit 20, EPN campid on all links, category_ids=183454, 30-min cache
- [ ] eBay AU sold price snapshots as alternative AU pricing source

### Automation and infrastructure
- [ ] Cowork screenshot audit loop: visit all hub/set/card pages, screenshot, feed to claude.ai for visual review
- [ ] sync_events INSERT added to all 30 background sync functions
- [ ] Supabase database webhook: trigger sitemap regen when new cards synced

---

## PHASE 5 -- CONTENT (ONGOING)

### Blog posts (262 live as of 21 May 2026)
- [x] p001-p247: complete
- [x] p258, p259, p261, p262: complete
- [x] p494-p515: 22 tournament and competitive TCG posts added 27 June 2026
- [ ] CONFIRMED MISSING: p248-p257 and p260 do not exist in the build -- verify if intentional or an error before attempting to create
- [ ] Continue publishing at current cadence (target: 2-3 per week minimum)
- [ ] Next sequential post: p516

### eBay store (ongoing operations)
- Active: 25,441 listings, target to grow
- Campaign: AU$15-30 at 3% fixed, AU$30+ at 2% fixed (confirmed April 2026)
- Best Offer: auto-accept 85% on AU$20+ listings
- These are operational items, not build items -- maintain as normal business operation

---

## PHASE 6 -- AUTOMATION SETUP (HIGH PRIORITY BEFORE 15 JUNE 2026)

Anthropic billing changes on 15 June 2026 affect how autonomous Claude Code background agents are billed.
Interactive Claude Code sessions (you typing instructions) are not affected.
Heavy background agent runs may cost more after that date.
Complete this setup before 15 June to maximise autonomous build capacity under current pricing.

- [ ] CLAUDE.md placed in repo root -- download from claude.ai outputs, then in Claude Code run:
       "Create CLAUDE.md in the repo root with the content I will paste" then push
- [ ] PROJECT.md placed in repo root -- same process as CLAUDE.md above
- [ ] Supabase MCP configured in Claude Code settings (unlocks full loop: fix function, verify DB, push -- without switching to claude.ai)
- [ ] Cowork screenshot Skill built and tested for visual audit loop
- [ ] Test autonomous session on one small Phase 3 task before running on full backlog

---

## DECISION SCHEMA -- FOR AUTONOMOUS SESSIONS

### What is the next task?
Read Phase 3. Start at the top of Critical. If all Critical items are done, move to High. If all High items are done, move to Medium. Do not skip ahead to Phase 4 features.

### How do I know if a task is truly done?
- npm run build passes with no errors
- node --check passes on all modified .mjs files
- If it is a Supabase change: verify row counts before and after
- If it is a page: it renders at the correct URL with no 404
- If it is a sync: check the relevant table received new rows
- If it is a visual fix: screenshot confirms it

### Should I fix bugs in extended games?
Fix 404s and build failures on extended games only if they are in Phase 3. Do not add new features to extended games until all Phase 3 Critical and High items are resolved.

### How many files can I change per session?
As many as needed to complete the task. Batch into ONE push at session end.

### What if I find a bug while working on a different task?
Log it in the session summary. Add it to Phase 3 if not already there. Do not fix it unless it blocks the current task.

### What if the build fails after my changes?
Read the error, fix it, rebuild. Do not push until the build passes cleanly.

### What if I am unsure whether a feature was previously built?
Check the repo directly. Do not assume. Do not build something that already exists.

### Should I attempt to improve MTG tcgapi_id coverage?
No. tcgapi.dev has 0.01% MTG coverage by tcgplayer_id. This is a confirmed data limitation.
MTG pricing uses Scryfall. Moving on.

### What if sync-sales-history runs but card_sales_history stays empty?
Diagnose in order: (1) confirm cards exist with tcgapi_id > 0, (2) confirm TCGAPI_KEY env var is set in Netlify, (3) check function logs for timeout or auth errors, (4) report findings to claude.ai before attempting any fix.

---

## AFFILIATE AND TRACKING REFERENCE

### eBay EPN link format
https://www.ebay.com.au/sch/...?campid=5339146789&customid=[CONTEXT]&mkevt=1&mkcid=1&mkrid=705-53470-19255-0&siteid=15&toolid=10001

### eBay store link
https://www.ebay.com.au/str/cardsoncardsoncards?campid=5339146789&customid=[CONTEXT]&mkevt=1&mkcid=1&mkrid=705-53470-19255-0&siteid=15&toolid=10001

### Amazon affiliate link format
https://www.amazon.com.au/dp/[ASIN]?tag=blasdigital-22

### eBay Browse API (for carousel)
- category_ids=183454 (TCG singles category)
- Filter: seller=cardsoncardsoncards
- Sort: -price (highest first)
- Limit: 20
- Cache: 30 minutes
- All links must include EPN campid 5339146789

### eBay EPN links must NOT appear on physical inserts (self-referral policy violation)

---

## ETSY LISTING RULES (apply when generating any Etsy content)

- No & % $ special characters in titles -- use "and" instead of &
- Commas as separators in titles (not pipes or em dashes)
- Titles under 140 characters
- Exactly 13 tags, comma-separated
- Each tag 1-20 characters
- Prices entered ex-GST (Etsy displays higher inc-GST to customers)
- Etsy store: blasdigital.etsy.com

---

## SUPPLIERS REFERENCE (for eBay ROI calculations)

- Dice Arcade Miranda: primary supplier contact
- PokeBox AU: backup for play boxes (AU$249.99 Strixhaven backup)
- Strixhaven play boxes: AU$225 (47.7% off street)
- OP Kami: AU$215
- MH3 CB avg eBay AU sold: AU$955, net AU$340-418/box
