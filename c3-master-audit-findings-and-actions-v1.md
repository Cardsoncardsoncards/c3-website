# C3 Master Audit, Findings and Actions Register v1

Companion to `c3-master-audit-protocol-v1.md`. Read that file first for
method. This file is the data. Update status in place. Never delete a row.
Never renumber. Append new ID ranges only, exactly as Voxsanity's register
does for its reserved PEN- range.

**ID ranges in use:**
- `C3-001` to `C3-164`: first external pass, 30 July 2026 docx, anchor
  register, status column below tracks C3's own confirmation, not the
  original report's classification.
- `C3S2-`: reserved for the second pass's structured register (xlsx) once
  provided, not yet appended, do not assume its numbering matches C3-001 to
  C3-164.
- `C3X-01` onward: new findings from this session's own blind-spot pass,
  not present in either external report.

---

## 0. Live findings, confirmed directly, 4 August 2026

Everything in this section was checked against the live Supabase project
(`owaroeqchreuffbyakqx`) and, where noted, the live site, by Claude.ai
directly, using the Supabase tool available in this chat. This is genuine
confirmed evidence, not a report being re-verified. It sits outside the
C3X- range since it did not come from a round-table pass, it is its own
category, live-investigation findings, prefixed `C3L-`.

**Trigger:** Sammy forwarded a GitHub Actions failure email, "Daily MTG
Sync: All jobs have failed, failed in 15 seconds."

| ID | Finding | Evidence | Priority |
|---|---|---|---|
| C3L-01 | MTG price data has been stale for 7 days, not just today. Most recent `mtg_price_snapshots.snapshot_date` is 2026-07-28, checked against today, 2026-08-04. Every other game synced today or yesterday (Pokemon, Yu-Gi-Oh, One Piece, Digimon: 08-04, Lorcana, Star Wars, Dragon Ball Fusion World: 08-03), confirming this is MTG-specific, not a platform-wide outage | Direct query, `select snapshot_date, count(*) from mtg_price_snapshots group by snapshot_date order by 1 desc`, cross-checked against the other seven Core games' equivalent tables | Critical, take down or correct now. MTG is roughly 89.8 per cent of C3's own eBay revenue per prior sold-data analysis, this is the highest-revenue game running on week-old prices |
| C3L-02 | Individual MTG card pages actively claim "prices updated daily" and "sourced from Scryfall... updated daily" while the underlying data has not moved in a week. This is a live, currently-true false-freshness claim on the public site, not a hypothetical wording risk | Confirmed via a live card page ("Contract from Below") returned in search, template copy states "Prices updated daily. Sourced from Scryfall. AUD conversion at live rate," directly contradicted by C3L-01's evidence | Critical, same root cause as C3L-01, but this is the customer-facing symptom and should be considered part of the same fix, not a separate item |
| C3L-03 | Two downstream pg_cron jobs (`update-mtg-price-changes-daily`, `update-mtg-signals-daily`) report `status: succeeded` every day this week, while silently computing "price changes" and "signals" from data that has not actually changed, because their input (`mtg_price_snapshots`) has been frozen since 07-28. A green cron status does not mean the output is meaningful | Direct query against `cron.job_run_details` for jobs 1, 11, 15, all show `succeeded` through 08-04 | High, this is the concrete, real-world version of protocol Section 13's point: a check that reports success is not the same as a check that confirms the thing the business actually needs |
| C3L-04 | `sync_events` has no record at all of the job that actually failed. It only logs `ids_sync_start` and `ids_sync_success` for MTG (a card-ID sync, which ran fine today), the GitHub Actions "Daily MTG Sync" workflow is either a different job that never reaches the point where it would log to `sync_events`, or a logging gap. "Failed in 15 seconds" is fast enough to suggest an early-stage failure (auth, missing secret, connection, or a changed Scryfall bulk-data endpoint) rather than a mid-sync data error, but this is inference, not confirmed, see Section 5 for what closes it | Direct query against `sync_events` filtered on `game ilike '%mtg%'`, only two event types present, both for a different sync job | High, and the concrete reason this needs Claude Code next, GitHub Actions logs and the workflow file are not reachable from this chat |
| C3L-05, resolved this session | `collection_waitlist` (holds raw email addresses: id, email, joined_at, source_card_id, source_card_name) had an `anon_read_collection_waitlist` policy with `qual: true`, meaning any anonymous request to the public REST endpoint could read every row, every email, with no restriction. Every comparable table in the schema (`mtg_price_alerts`, `card_price_alerts`, `seller_watchlist`, `archetype_watchlist`, `deck_sessions`, `issue_reports`, `page_sessions`) is anon-insert-only with no anon read policy, this was the one inconsistent with that pattern | Confirmed via `pg_policies`, table was empty (0 rows) at the time, so no real signup was exposed. Fixed directly via `apply_migration`, dropping the policy. Insert still works, confirmed after the fix. If a public "N people waiting" counter is found to depend on this during Claude Code's pass, it should be served by a service-role function returning a count only, not by restoring table-wide read | Was critical, now resolved, evidence above |
| C3L-06 | No table anywhere in the public schema uses the `authenticated` role in any policy, and `rowsecurity` is `true` on every one of the roughly 140 tables checked. Account, follow, and follow-magic-link data has no `anon` policy at all beyond `service_role`, meaning the browser cannot read or write those tables directly under any circumstance, every access must go through a server-side function using the service role key. This is a genuinely safer pattern than the default-open failure mode described in protocol Section 12's research (88 per cent of a sampled set of vibe-coded apps had RLS off entirely), C3's RLS layer is closed by default everywhere it matters | Confirmed via `pg_tables.rowsecurity` and `pg_policies` across the full schema | Informational, positive finding, but it shifts where the real risk sits: the authorisation logic now lives entirely in Netlify function code this chat cannot read. Section 12's authentication-without-authorisation pattern must be checked there specifically, by Claude Code, not assumed safe because the database layer looks correct |

**What this session's tools could not reach**, stated plainly rather than
left implied: the actual GitHub Actions workflow file and run logs (no
GitHub connector available in this chat, and the repo is private so it is
not reachable by search or fetch either), the Netlify function source code
that presumably performs the real MTG sync, and Supabase's own `api` and
`postgres` log services, both log fetches failed at the tool level during
this session and were not retried further. All three are Claude Code's
next job, see Section 5.

**Six-line report for this pass, per protocol Section 15:**
1. Compliance check: `collection_waitlist` held raw emails under a public
   read policy, this is a Privacy Policy conflict (data collected for one
   stated purpose, exposed beyond it) and is now closed, not still open.
2. Removal candidates: none identified this pass.
3. Suggestions: the `mtg_signals` and MTG price-change cron jobs could
   reasonably check `mtg_price_snapshots` freshness before running and skip
   or alert rather than silently succeed on stale input, worth a small
   follow-up once the sync itself is fixed, not urgent on its own.
4. Blind-spot self-check: this pass could not see application code at all,
   only database state and public pages. It cannot confirm or rule out an
   authorisation gap inside any Netlify function, that is a real gap in
   this specific pass, not a clean bill of health for the areas it
   could not reach.
5. Opportunities identified: none new this pass, scope was narrow and
   incident-driven.
6. Complexity or fragility flags: the fact that two cron jobs can report
   `succeeded` for a week while operating on frozen input, with nothing
   downstream noticing, is itself a fragility worth naming, not just fixing
   the immediate sync. A freshness check before these jobs run is a small
   addition that closes this exact failure mode generally, not just this
   one instance of it.

---

## 1. Confirm-first, take down or correct within 24 to 48 hours

Every row below is a claim from the external reports, not yet independently
confirmed by C3's own tooling. Per Lens 1's method, the first action on each
is live confirmation, not immediate action on the report's word alone. Where
confirmed live and still broken, act immediately. Where already fixed since
30 July or 1 August, mark Resolved and move on, do not re-litigate.

| ID | Finding | Reported severity | Confirm how | Status |
|---|---|---|---|---|
| C3-024/025 | Warhammer 40,000 booster box EV calculator models a fictitious product (12-pack Collector Booster, 14-card Play Boosters, serialised chase cards); no such product exists, the real Warhammer 40,000 Magic release is four Commander decks | Critical | Fetch the live EV page directly, compare against Wizards' own product documentation | Not yet confirmed live |
| C3-027/028 | Zendikar Expeditions EV model is internally contradictory on expected quantity and acquisition mechanic | Critical | Fetch the live EV page, check the stated pack odds against the actual Expeditions insertion mechanic | Not yet confirmed live |
| C3-032/033 | Final Fantasy and Modern Horizons 3 EV models include a serialised or Collector-only card as if pullable from a standard Play Booster | Critical | Fetch both live pages, check slot eligibility against Wizards' own product pages | Not yet confirmed live |
| C3-026/029/030 | Zendikar Rising and Commander Legends EV models use the current Play Booster structure on products that predate Play Boosters or use a different structure entirely | High | Fetch live pages, cross-check release-year product structure | Not yet confirmed live |
| C3-031 | Jeweled Lotus described as a current Commander staple after its ban | High | Fetch live page, check current banlist | Not yet confirmed live |
| EV verdict | EV pages can show a purchase verdict ("Worth Opening") before the user has entered an actual box cost, and can show both an opening-positive and a buy-singles message simultaneously | High | Load a sampled EV page pre-input, capture initial state | Not yet confirmed live |
| C3-075 | WWW and apex hostnames may serve different site generations | High | Fetch both `cardsoncardsoncards.com.au` and `www.cardsoncardsoncards.com.au` directly, diff the responses. Note: the 12 July Netlify duplicate-project issue was separately found and closed, this may already be resolved, confirm before treating as open | Likely resolved, confirm to close the row formally |
| C3-076/077 | Legacy `.html` routes remain live alongside current clean routes, with different navigation, disclaimers, and affiliate wording (Tarkir: Dragonstorm cited as returning near-identical content on both `.html` and extensionless routes) | High | Fetch both route forms for a sampled set, diff, check for a 301 | Not yet confirmed live |
| C3-122 | Pricing page describes paid tiers as planned or unavailable; `/legal` describes an existing, billed C3 Seller Intelligence subscription with a Stripe billing domain | High, and now a named 2026-27 ACCC enforcement priority (subscription traps, misleading pricing) | Fetch pricing page and `/legal` in the same pass, diff subscription language | Not yet confirmed live |
| C3-001/003 | "Exact AUD," "local price," and similar wording used where the underlying value is a converted or modelled foreign-market estimate | High | Grep all copy for these phrases, cross-check each instance's actual data source | Not yet confirmed live |
| C3-012/013 | Tracked-game count still conflicts (31 vs 32) somewhere on the live site, despite the 11 July count-constant fix | Medium | Grep for hard-coded game counts sitewide, not just the pages already fixed | Not yet confirmed live |
| C3-059 | Quiz count conflicts (29 vs 17, or an older figure) somewhere on the live site | Low | Cross-check against the 12 July task-83/84 correction to 29 quizzes, confirm the fix reached every page that states a quiz count | Not yet confirmed live |

---

## 2. Prioritised action tiers

See protocol Section 7 for the reasoning behind this order. This table is
the working list, update as each lens closes.

### Tier 0, take down or correct now
Section 1 above, once each row is confirmed live.

### Tier 1, critical, launch-blocking
- RLS and BOLA verification (protocol Section 4), before any paid feature
  ships or traffic scales further. Per protocol Section 12, this is now the
  statistically most likely place a real gap exists, not one security item
  among equals.
- Stripe checkout idempotency key usage, confirmed present on every charge
  and subscription-creation call, not assumed from webhook-side signature
  checking alone (protocol Section 11.2). A retried checkout after a
  client-side timeout must not double-charge.
- Stripe webhook signature, replay, and idempotency verification (C3-098),
  specifically including duplicate delivery of the same event ID, since
  Stripe's own delivery guarantee is at-least-once, not exactly-once.
- Stripe webhook handler write pattern confirmed as insert-first under a
  database unique constraint, not check-then-insert, which only narrows the
  race condition rather than closing it.
- Premium entitlement decided server-side only, never trusted from a
  client-supplied field or local storage (C3-097).
- Password-reset token controls and account-enumeration resistance
  (C3-101/102).

### Tier 2, high
- EV catalogue-wide rebuild against the immutable-product-record method
  (protocol Section 5, point 8).
- Cross-page price and trend reconciliation invariant (protocol Section 5,
  point 2).
- Affiliate link integrity sweep, all 32 games, not just the highest-traffic
  ones, since a systemic tagging bug could sit unnoticed precisely on a
  low-traffic game.
- Card and printing identity stability across pages (protocol Section 5,
  point 6).
- Follow and alert email-abuse controls (C3-115), confirm double opt-in,
  dedup, and per-email and per-IP limits actually exist, not just the
  confirmation-step description.

### Tier 3, medium
- Content and SEO items: legacy template coexistence, structured-data
  accuracy, article sourcing and correction workflow, accessibility
  conformance evidence.
- Third-party integration health: cron collision map, version pinning
  across all eight external data sources.

### Tier 4, low and long-term
- Redundancy sweep (unused packages, tables, env vars).
- Chaos and resilience testing.
- Monetisation scouting, see Section 4 below.

---

## 3. Blind-spot findings, this session, new ID range C3X-

Not present in either external report, since both were public-surface-only
reviews with no repo or database access.

| ID | Finding | Why it matters | Priority |
|---|---|---|---|
| C3X-01 | No sweep confirms zero remaining references to `dragonball_cards` or `dragonballz_cards` where `dbsfusionworld_cards` is the correct target, across code, content, and the apitcg enrichment job once it runs against quota reset | This exact three-table confusion has already caused real mistakes historically, per project notes | High |
| C3X-02 | The apitcg dry run's 14 unmatched rows (99.93 per cent match rate) have no defined handling. Silently null, silently wrong, or flagged is currently unknown | A small, known gap in an otherwise-verified pipeline can still mislead if the 0.07 per cent renders as a confident-looking wrong value | Medium |
| C3X-03 | Flesh and Blood's exclusion is policy-documented but not confirmed as a code-level guard in the 32-game `GAME_CONFIG` pattern | A future copy-paste of that pattern into a new feature could reintroduce FaB by accident, silently breaching Legend Story Studios' commercial restriction | Medium |
| C3X-04 | Single-supplier concentration: primary income depends on one supplier (Dice Arcade Miranda) for opened booster box singles | Real business-continuity risk, not previously logged anywhere as an audit item | Long-term, business not technical |
| C3X-05 | Credential-chain bus-factor: no documented recovery sequence exists for the domain registrar, Netlify, Supabase, Stripe, MailerLite, and Resend accounts if the single operator loses simultaneous access to primary email, phone, and laptop | Directly mirrors the external report's general "recovery is as important as prevention" finding, but no C3-specific version of it exists yet | High |
| C3X-06 | The 11 July count-constant fix has not been swept for every page that states a card or game count (About, Methodology, footer, sitemap meta, tools page, individual blog posts), only confirmed on the pages already known to have been touched | Same failure shape as C3-012/013/081, a fix that closes the finding on the pages checked can still leave it open elsewhere | Medium |
| C3X-07 | Unit economics against the stated AU$10,000 net/month goal has not been checked against real current numbers in any audit pass so far | The audit currently only checks whether the site is correct and safe, not whether it is on track against its own stated financial goal | Medium, once data-integrity work is far enough along to trust the inputs |
| C3X-08 | No formal ToS or licensing review exists for four of the eight external stat APIs used in Card Details (YGOPRODeck, Lorcast, optcgapi.com, swu-db.com), beyond a light check that found no explicit commercial-reuse prohibition | Single point of failure with no company SLA behind any of them, already logged in project notes as a data-source register item but never carried into a formal audit finding with a priority | Medium |
| C3X-09 | The eBay store's displayed inventory count differs across site sections (23,000+ versus 30,000+ cited in the external report) and against the live eBay dashboard figure, which itself should always be pulled fresh, not relied on from a stored snapshot | Same failure class as C3-012/013, a headline number that should come from one source and does not | Medium |

### 3.1 Findings from the five-panel meta-review (protocol Section 14), new range continues

| ID | Finding | Panel | Priority |
|---|---|---|---|
| C3X-10 | No control yet considered for a bad-faith actor deliberately feeding the AI-assisted content pipeline (blog posts, quiz content) false product information, to test whether it publishes uncorrected | 1, adversarial and abuse-case | Medium |
| C3X-11 | Stripe checkout path's idempotency key usage is unconfirmed, this is a materially different and more likely failure mode than webhook forgery, and was not previously called out as its own item | 2, concurrency and idempotency | Critical, now Tier 1 above |
| C3X-12 | Webhook out-of-order and duplicate-delivery handling unconfirmed beyond a basic signature check. Signature verification alone does not prevent double-processing of the same legitimate event delivered twice | 2, concurrency and idempotency | High |
| C3X-13 | No git-history sweep exists for auth-adjacent files checking whether authorisation logic was quietly altered or partially removed across C3's many incremental Claude Code sessions, as distinct from a point-in-time check of today's state | 3, AI-generated-code risk | High |
| C3X-14 | The authentication-without-authorisation pattern (a function that confirms who the user is but never confirms they own the specific object being accessed) had not been named or specifically searched for in any existing review, despite being the single most common shape of gap in AI-generated code per current research | 3, AI-generated-code risk | Critical, feeds directly into protocol Section 4 |
| C3X-15 | No concrete scale-multiplication test cases existed despite the performance category already being in scope. See Section 3.2 below for the ready-to-run list this closes | 2, concurrency and idempotency | High |
| C3X-16 | The tier system has no explicit safeguard against a hard-to-fix finding being quietly downgraded in priority over time. Not a technical finding, logged as a standing discipline: re-check tier assignments against actual impact, not against how easy the fix looks, at every register reconciliation | 5, business-outcome grounding | Low, process discipline |

### 3.2 Hypothetical and future-scenario test cases, ready to run

Concrete test cases generated from protocol Section 11's four patterns,
mapped to the execution slug that should run each one. These are net-new
items, not restatements of Section 1 or 2 above.

| Scenario | Generator pattern | Slug | What a pass looks like |
|---|---|---|---|
| 20 concurrent real users versus 2,000 concurrent, across the price sync, follow-alert send, search, and Stripe checkout paths at once | Scale multiplication | `8-perf` | The specific component that degrades first is named, not assumed |
| Daily price refresh runs while thousands of users are actively browsing | Scale multiplication | `8-perf`, `3-pricing` | No page ever renders a mix of yesterday's and today's snapshot |
| Same email signs up twice inside one second (double-click or two tabs) | Duplicate and replay | `0-rls`, `6-adversarial` | Second attempt rejected cleanly, no duplicate account, no silent overwrite of the first |
| Follow-alert submitted twice for the same card and email before the first confirmation sends | Duplicate and replay | `10-alerts` | Deduplicated server-side, not two confirmation emails |
| Same Stripe webhook event ID delivered twice | Duplicate and replay | `6-adversarial` | Second delivery is a no-op, still returns 200, no duplicate entitlement or duplicate charge |
| Checkout retried after a client-side timeout | Duplicate and replay | `6-adversarial` | Idempotency key prevents a second charge |
| Two overlapping sync runs for the same game (a prior run overran its schedule) | Race condition | `5-datasync` | Last-write-wins behaviour is explicit and intentional, not accidental |
| Tier or entitlement check reads mid-webhook-write | Race condition | `0-rls`, `6-adversarial` | The check always reads committed state, never a partial write |
| Full-catalogue scrape attempt | Attacker mindset | `7-abuse` | A named, tested control exists, not an assumed one |
| Email-bomb attempt via the follow feature | Attacker mindset | `7-abuse`, `10-alerts` | Per-email and per-IP limits are actually tested against the live endpoint, not just documented as a rule |
| Cross-user object access via ID or UUID substitution | Attacker mindset | `0-rls` | Covered directly by protocol Section 4's method |

---

## 4. Opportunity register

Concrete, grounded in what C3 already stores, not speculative feature ideas.
Per protocol Section 15, this register is continuous, not a one-time list.
Any lens, at any point in the programme, that spots something C3's data or
architecture could do that a competitor plausibly cannot, adds a row here
immediately, whether or not opportunity-spotting was that lens's assigned
scope.

| ID | Opportunity | What makes it defensible | Depends on |
|---|---|---|---|
| OPP-01 | AU liquidity signal: a "days to sell" or spread-between-listed-and-sold metric derived from C3's own eBay transaction history, not scraped US data | Real transaction data most competitors do not have access to, MTG-only for now per the confirmed sold-data moat scope | Sold-data pipeline stays MTG-scoped until the other six Core games have volume |
| OPP-02 | Multi-source price confidence score: how many of the eight independent external sources agree on a price, shown as a confidence signal rather than a single number | No single competitor polls all eight sources C3 already aggregates, an agreement-based signal is hard to replicate without doing the same aggregation | EV and price-accuracy work (Tier 2) closing first, this should not launch on top of unverified underlying prices |
| OPP-03 | AU-specific grading EV calculator, using real AU eBay graded-versus-raw comps rather than US PSA population data | Genuinely differentiated from PSA and US-centric tools, AU postage and fee-adjusted | Explicitly blocked on sold-data pipeline access, already correctly deferred in project notes, do not build ahead of that gate |
| OPP-04 | Release-calendar-driven early movement alerts, using the `tcg_releases` table C3 already has structured across all 32 games | Most competitors track this manually per game, C3 already has it as structured data | Generators and calendar expansion to all 32 games, already a D9-approved item in progress |
| OPP-05 | Trustworthy booster box EV, once rebuilt correctly, as a genuine differentiator specifically because C3 can source real AU box prices alongside real AU singles values rather than US assumptions | Direct fix of the EV catalogue's current core defect turns the same feature from a liability into a real advantage | Tier 1 and Tier 2 work closing first, the external report's own release gate already states this should not be promoted until fixed |
| OPP-06 | Data-license or API product once the AU sold-data pipeline is trustworthy, aimed at Australian LGS or resellers | Same "sellability scouting" pattern Voxsanity logged for its own data (RED-15), applicable here with AU TCG sold data instead | Sold-data pipeline access, currently blocked pending the Seller Hub re-export decision |

---

## 5. Immediate next actions

1. **New top priority, ahead of the wave plan:** hand Claude Code the MTG
   sync failure (Section 0, C3L-01 through C3L-04). It needs repo access to
   read the actual GitHub Actions workflow file, its recent run history and
   error output, and whatever script or Netlify function it calls, none of
   which this session could reach. Confirm what changed roughly a week ago
   around 28 July that would explain a clean stop, a credential expiry, a
   Scryfall endpoint change, or a workflow file edit are the most likely
   categories given the fifteen-second failure time, but this is inference
   to be confirmed, not assumed.
2. Confirm Section 1's live-status column for the remaining unconfirmed
   take-down candidates, either via a short Claude Code session doing
   direct fetches, or via Cowork if a full visual pass is preferred at the
   same time. Not yet attempted this session beyond C3L-02.
3. Run protocol Section 4 (RLS and BOLA) properly, meaning the two-account
   object-level access test specifically. This session confirmed RLS is
   enabled schema-wide and reviewed every policy definition, which is real
   evidence, but it is not the same test as two live accounts attempting to
   read each other's data through the actual application, that still needs
   to run.
4. Bring back raw output here for reconciliation before writing the next
   lens's prompt, per the handoff pattern in the protocol.
