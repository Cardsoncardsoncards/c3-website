# C3 Master Audit Protocol v1
## Full-depth, continuous, three-tool audit programme for cardsoncardsoncards.com.au

Created 1 August 2026. Model in use for this design: Claude Sonnet 5, Claude.ai
interface.

---

## 0. What this document is, and how it fits with what already exists

Four documents already exist and are not being replaced, only reconciled:

1. `c3-full-depth-audit-protocol.md`, the existing six-lens brief (Part 0 setup
   rules plus Lenses 1 to 6). Its Part 0 rules (repo paths, worktree discipline,
   deploy verification, cleanup, no declarative safety claims, verify twice by
   two different methods) stay exactly as written. This document does not
   repeat them, it amends and extends them. Read both together.
2. `Cards_on_Cards_on_Cards_Full_Security_Data_Accuracy_Product_and_Scale_Audit_2026-07-30.docx`,
   the first ChatGPT-driven pass. 164 findings, IDs C3-001 to C3-164, seven
   categories A to G. This is the anchor finding-ID register.
3. `deep-research-report (2026-08-01)`, the second ChatGPT-driven pass. 150
   findings across six areas, ten simulated ten-role roundtables. Its
   structured findings register (the xlsx referenced inside it) was not
   provided in this session, only its narrative report. When that xlsx is
   available, append it as a new ID range, do not assume its IDs match C3-001
   to C3-164.
4. `voxsanity-standing-addendum-compliance-removal-suggestions.md`, the
   process discipline reference (environment check first, compliance check
   every task, recommend removal over a third patch, log suggestions
   separately, three-line final report). Applies here in full, C3-specific
   compliance list substituted (see Section 9).

This document is the process. `C3_FINDINGS_REGISTER.md`, living in the repo
itself and git-tracked, not a Downloads or project-only copy, is the data,
confirmed 4 August 2026 as the single canonical location. The original
Downloads-based companion file (`c3-master-audit-findings-and-actions-v1.md`)
was the seed content for this and is now historical, not the live copy.
Never let the register go stale. Update status in place, never delete a
row, never renumber, append new ranges only. This is the same discipline
Voxsanity's register already proved out, applied here the same way, in the
repo, not adjacent to it.

Note on cross-references below: everywhere this protocol says "companion
file" it means whichever file was canonical at the time of writing, now
`C3_FINDINGS_REGISTER.md`. Section numbers cited against it (for example
"companion file's Section 1 and 2," "the C3X range") were correct against
the original Downloads file's numbering as of 1 August and were not
re-numbered here when the register moved and its own sections were
renumbered during that move. Match by content and ID prefix (C3-, C3L-,
C3X-, OPP-), not by section number, if the two ever appear to disagree.

### Every lens carries two mandates, not one

This applies to all thirteen slugs in Section 10, without exception, and is
worth stating explicitly rather than leaving it implied:

1. **Verify what has already been called out.** Every relevant row in the
   companion file's Section 1 and 2 that falls inside this lens's scope gets
   independently re-derived from live reality, per Lens 1's method. A prior
   report's finding is a hypothesis to test, not a fact to copy into the
   register as confirmed.
2. **Independently search for what has not been called out.** Neither
   external report had repo or database access, and even a repo-and-database
   pass can miss things a differently-shaped check would catch (this is the
   entire reason Part 0 requires verifying twice by two structurally
   different methods). Every lens's brief below asks for the full population
   of whatever it covers (every displayed number, every link, every table),
   not just the ones already on a list. A lens that only re-checks known
   items and reports nothing new has not actually run the second mandate,
   and should say so plainly rather than let a clean-looking pass imply full
   coverage.

A lens is not done when every known finding in its scope has a status. It is
done when a fresh pass, run with the intent of finding something new, comes
back empty, and that emptiness is reported as its own explicit result, not
silence.

The concrete method for generating that fresh pass, including scale,
duplicate-action, race-condition, and attacker-mindset scenarios, is
Section 11. The specific reason Section 4's check is not optional is
Section 12. The rule for what happens the moment a lens finds something
that does not match expectation is Section 13.

---

## 1. Setup and deploy rules, amendments only

Everything in `c3-full-depth-audit-protocol.md` Part 0 stands, with the
push-discipline amendment below (confirmed by Sammy, 1 August 2026, resolves
what was an open decision in the first draft of this document).

1. **Push discipline is lifted for the duration of this audit programme,**
   the same way the D7 freeze was lifted on 16 July. Multiple pushes per
   session, and pushes from multiple parallel sessions, are both fine.
   The minimum-3-files-per-commit habit is still worth keeping as basic git
   hygiene (a commit that fixes one thing is easier to review and revert
   than a single-file drive-by), but it is no longer a hard gate, and no
   push needs explicit approval before it happens. This does not touch the
   separate, permanent rule that a real Stripe transaction still needs
   in-the-moment confirmation.
2. **File creation has standing blanket approval for the duration of this
   programme.** Every audit task file, investigation prompt, findings-register
   update, and report produced by Claude.ai, Claude Code, or Claude Cowork may
   be created without asking permission first, provided it lands in the
   Downloads task-file location or the project's audit files.

---

## 2. The three-tool split

This extends the project's existing Claude Code vs Claude.ai rule with a
third tool, rather than replacing it.

### Claude.ai (this interface): design, synthesis, roundtables
- Owns this protocol and the findings register.
- Writes each lens's investigation prompt as a ready-to-run Claude Code
  terminal prompt or Cowork task, one at a time, referencing the full
  Downloads path per the existing task-file rule.
- Runs the continuous round-table review passes (Section 6).
- Reconciles findings coming back from Claude Code and Cowork into the
  register: dedupes against existing IDs, re-prioritises, never silently
  drops anything.
- Never touches live code directly. Never asks for a full file to be pasted
  back for review, per the existing usage-efficiency rules.

### Claude Code (terminal, worktrees): repo, git, Supabase, Netlify
- Runs the actual grep, query, and live-endpoint sweeps.
- Owns Lens 1 (claims re-verification), Lens 2 (cross-system interaction),
  Lens 5 (backend data sync, all 32 games), Lens 6 (test validity and
  adversarial red-team against a staging environment), plus the RLS and BOLA
  live checks in Section 4.
- Every finding reported back in the register's row format (see companion
  file), never a bare "looks fine" or "should be okay."

### Claude Cowork: multi-step autonomous work across many live pages at once
- Owns anything that needs to browse the real site end to end like a visitor
  would: full click-through QA across every button and link, affiliate
  destination verification, screenshot loops across all 32 game hubs,
  cross-browser and cross-device visual diffing, in-app browser testing
  (Gmail and Outlook specifically, since that is likely the majority of real
  outreach and alert-email traffic), the full-scale crawler run (not sample
  mode), and an accessibility sweep.
- Also the right tool for the "every displayed number, traced to source"
  sweep across live pages (Section 5), since it can hold many pages open at
  once and compare them, then hand structured discrepancies to Claude Code
  for database-level verification.

**Handoff pattern:** Claude.ai designs the lens prompt, Claude Code or Cowork
executes it, raw output gets pasted back here, Claude.ai updates the register
and decides the next lens. Same shape as the existing investigation-then-
execution rule, applied to audit work instead of feature builds.

**What "stopping" actually means, confirmed 4 August 2026.** A Claude Code
session does not run unattended forever and does not stop at a random
point either. It stops at one of a small number of triggers, each
deliberate:
1. It finishes everything in the task file it was given, a clean, planned
   stop.
2. It hits something Section 15 or 16 says to flag rather than push
   through, an anomaly under Section 13, a fragility flag, anything the
   no-assumptions rule says not to guess past. This is a pause built into
   the rules, not the session failing.
3. Practical session limits, exact behaviour depends on the Claude Code
   setup in use, not something this document can state precisely.
Pushes and commits happen as the work completes, not batched up waiting for
a manual go-ahead, per the push discipline being lifted for this
programme. Every session's six-line report, required by Section 15,
surfaces blind spots, opportunities, and urgent items as a matter of
course, not only when something happens to be found, an empty line still
gets stated as empty. That report lands in `C3_FINDINGS_REGISTER.md`
directly, and separately, whatever the terminal shows lands with Sammy
directly, since that is simply how a terminal session works.

**The check-in cadence.** Claude.ai does not hand over all thirteen slugs'
task files up front, because a later wave may need adjusting based on what
an earlier one finds, the same anomaly-loop-back logic in Section 13
applied at the level of the whole programme, not only inside one check.
The loop is: Claude.ai writes a batch of task files (one wave, or one
priority item like the MTG fix), Sammy runs them, in one terminal or
several in parallel per the wave table, each session updates the register
and reports in its own terminal, Sammy brings the updated register back to
Claude.ai, Claude.ai reconciles it and writes the next batch. Repeat. This
is the same three-way loop the rest of this document already assumes, made
explicit here because it is the part most likely to get asked about again.

---

## 3. Ten-category coverage map

The existing six lenses are the entry points. This maps them onto ten
categories at Voxsanity's depth, so nothing in that depth gets missed here.
Categories with no current C3 lens are new scope, not previously covered by
anything in this project.

| # | Category | Maps to | What is missing versus Voxsanity depth |
|---|---|---|---|
| 1 | Data integrity, every displayed number | Lens 3, Lens 1 | Computed-column audit, same-fact-two-ways sweep, NULL-to-zero sweep, date/timezone math, rounding and precision policy, historical backfill correctness |
| 2 | Security, core application | Lens 6 | Full BOLA/IDOR sweep (Section 4), CSP and security header audit, secrets-in-git-history scan, PostgREST introspection abuse specific to Supabase's auto-generated API |
| 3 | Abuse, bot traffic, adversarial users | none yet | Scraping and anti-abuse, follow/alert email-bombing (already flagged as a real risk in the ChatGPT reports), multi-account gaming, fake-review defence once any public reviews exist |
| 4 | Performance, scale, infrastructure | none yet | Load test at 2x and 5x expected peak, Supabase connection pool under concurrency, query plans on the heaviest queries, cache stampede after the daily price refresh, Netlify compute and bandwidth ceiling |
| 5 | Mobile, browser, caching, analytics accuracy | none yet | In-app browser test (Gmail, Outlook), GA4 versus real database count reconciliation, cross-browser visual diff, cache-busting confirmation after deploy |
| 6 | UX, accessibility, content tone | Lens 4, partial | WCAG 2.2 AA pass, the too-many-competing-CTAs finding already raised externally, large printing-collection performance (the 80-printing Sol Ring case), legacy `.html` template coexistence with current templates |
| 7 | Alerts, communication, functional QA | none yet | Alert-vs-reality cross-check, full click-through pass (Cowork), console-error sweep, third-party widget failure behaviour (what happens if Stripe, Resend, or MailerLite is down) |
| 8 | Third-party integration and automation health | none yet | Cron collision map across all sync jobs, version-pinning and rate-limit coordination across all eight external data sources, webhook signature verification beyond Stripe |
| 9 | Technical implementation of compliance claims | Lens 4, partial | Privacy policy versus actual data practice line by line, cookie-consent enforcement not just disclosure, deletion-cascade completeness, the subscription-wording gate (now a live 2026-27 ACCC enforcement priority, see Section 7) |
| 10 | Redundancy elimination and monetisation scouting | none yet | Unused package, table, and env-var sweep, plus the opportunity register (Section 9) |

---

## 4. The single highest-priority technical check, run this first

This is not a generic recommendation. A documented 2026 vulnerability class
(tracked as CVE-2025-48757) found Supabase Row Level Security disabled or
misconfigured in roughly 10 per cent of scanned applications built the way
C3 is built (Netlify plus Supabase, anon key shipped to the browser by
design). Independent analysis attributes the large majority of Supabase
data exposures specifically to RLS misconfiguration, not to any other
cause. C3's own privacy policy already states that collection and alert
data is protected by RLS. That is a testable claim, not something to take
on trust, and the external audit could not verify it from the public
surface alone.

The check itself is simple, non-destructive, and requires no customer data:

1. For every table in the public schema, query the live PostgREST endpoint
   directly with the anon key. A correctly configured table returns empty
   results or a 401/403. A table returning real rows is a live, immediate
   finding, fix or take the feature down.
2. Create two synthetic accounts. Have Account A attempt to read, update,
   and delete Account B's collection rows, follow rows, and alert rows via
   the same endpoints the app itself uses. Every one of these must be
   rejected.
3. Confirm no privileged (service-role) key appears anywhere in frontend
   JavaScript, source maps, Netlify build output, browser network calls, or
   git history.
4. Repeat this exact check for `dbsfusionworld_cards` and every other table
   added since the last time anyone looked, not just the tables that existed
   when RLS was last discussed.

Run this before anything else in Lens 6. Once closed, add it as a recurring
scheduled check, per Part 0's "any recurring check must fail gracefully"
rule, not a one-time sweep.

---

## 5. Every displayed number, the method

This is the highest-stakes category for C3 specifically. The product's
entire value proposition is accurate price intelligence. A wrong price, a
wrong ranking, or a stale price shown as current is not cosmetic, it can
mislead a real buyer into a real purchase decision on wrong information,
and it is now also a named ACCC enforcement focus (Section 7).

For every displayed price, comparison, ranking, trend, or derived statistic
across all 32 games:

1. Re-derive it from raw source data by two structurally different methods,
   never two reads of the same cached value.
2. Check the invariant holds: `round(native_price × applied_fx_rate, 2)` must
   equal the displayed AUD price, and the same printing ID, same snapshot ID,
   and same window must produce the same price, trend, high, low, and signal
   on every page that shows it (card page, Compare, Market, search results).
3. Check the price floor (AUD $3.49 minimum on eBay singles listings) is
   actually enforced at the point of display, not just documented as a rule.
4. Check staleness bounds are enforced, not just described. If the site says
   "no stale data," confirm that against an actual old release or an actual
   old snapshot, not the general claim.
5. Check small-sample statistics. A "lowest price" or "average price" drawn
   from one or two listings is exactly the shape of bug that inflated
   Voxsanity's trial count 3.4x. Confirm a minimum sample size or a visible
   low-confidence flag exists before a statistic is treated as reliable.
6. Check card and printing identity stays stable across pages. A generic
   card-name URL and a Compare-selected printing must resolve to the same
   set, collector number, and price, or the URL must carry enough state
   (source game, set, collector number, finish, or an immutable printing ID)
   to guarantee it does.
7. Check every headline count (games tracked, cards tracked, listings live,
   quizzes available) is generated from one live query and reused, not
   independently hard-coded per page. The count-constant fix already done
   on 11 July covered card and game counts; confirm nothing else (About page,
   Methodology page, footer, sitemap meta, tools page, individual blog posts)
   still carries an old hard-coded figure.
8. Check the EV calculator catalogue specifically, product by product,
   against the immutable-product-record method already specified in the
   30 July report's EV validation protocol: one record per box type (pack
   count, cards per pack, slot structure, language, region, product code,
   release date), one eligibility table for every chase or serialised card
   mapped to the exact product and slot it can appear in, and a second
   reviewer sign-off before republishing any calculator.

---

## 6. Continuous round-table review

This is not a fixed number of passes. It is a process that repeats until a
full pass adds zero new findings, which is the actual definition of done,
not a target round count.

1. Base panel: reuse the 20-persona roster already built in
   `C3_20_Persona_Roundtable_Review_Jul2026.md`.
2. Extend it only where the ChatGPT reports' 10-roundtable structure adds a
   C3-specific lens the existing 20 do not cover: per-game trading-card
   specialists (Magic, Pokemon, Yu-Gi-Oh, Lorcana, One Piece, sealed
   products, grading, counterfeit detection), international users (US, UK,
   EU, Japan, Singapore, New Zealand, Canada), and an AI/data/modelling
   panel (data quality, ETL, provenance, model risk) given the confirmed
   pattern of AI-generated product facts publishing without a validated
   source record.
3. After every lens's findings come back, run one round-table pass asking
   explicitly: what would this panel miss if it only reviewed this lens's
   output in isolation. Log anything raised under the blind-spot register
   (companion file), do not silently absorb it into the main list without a
   row.
4. Repeat. Stop only when a full pass returns nothing new, and say so
   explicitly rather than declaring the list complete by assertion, the
   exact failure mode the Voxsanity register exists to prevent.

---

## 7. Prioritisation framework

Grounded in the actual regulatory and business context confirmed today, not
a generic severity scale.

**Take down or correct within 24 to 48 hours, no further audit needed to
justify it.** These are reported by the 30 July and 1 August external
passes and are treated as unverified by C3's own tooling until Lens 1
confirms each one live. Confirming them live is itself the first task, see
the companion file.

**Critical, launch-blocking.** Anything that gates paid access, scale-up, or
promotion of a feature: the RLS and BOLA verification in Section 4, Stripe
webhook signature and idempotency verification, and any price-source wording
that overstates precision ("exact," "local price") where the underlying
value is a converted or modelled estimate.

**High.** Real user or revenue impact, not launch-blocking on its own: the
EV catalogue-wide rebuild, cross-page price reconciliation, the affiliate
link integrity sweep across all 32 games (a broken or missing tracking
parameter loses real revenue silently, with no symptom to notice it by).

**Medium.** Content, UX, and SEO items that affect trust and conversion but
do not create legal or financial exposure on their own.

**Low and long-term.** The redundancy sweep, the monetisation scouting
list, and anything explicitly deferred pending another gate closing first
(for example, the grading EV page idea, which is already correctly blocked
on sold-data access per existing project notes).

Why this order, beyond internal judgement: the ACCC's 2026-27 compliance
and enforcement priorities, announced 19 February 2026, explicitly name
dark patterns, subscription traps, and misleading pricing claims as a
central focus, including proceedings already filed against a major
technology company for concealing a subscription tier from millions of
Australian users. A pricing page describing a subscription as "planned"
while the legal terms describe an existing, billed subscription is not a
theoretical risk category, it sits directly inside a named current
enforcement priority. This raises that specific finding's real-world
priority regardless of how it would otherwise be scored on severity alone.

---

## 8. Blind-spot register, this session's own pass

Genuine gaps neither ChatGPT report could see (both were public-surface-only
reviews with no repo or database access) and neither existing C3 document
currently covers. Full detail and IDs live in the companion findings file,
summarised here:

1. Dragon Ball's three-table history (`dragonball_cards`, `dbsfusionworld_cards`,
   `dragonballz_cards`) is a proven, C3-specific bug class. No sweep yet
   confirms zero remaining references to the wrong table anywhere in current
   code, content, or the apitcg enrichment job once it runs.
2. The apitcg dry run matched 21,028 of 21,042 rows (99.93 per cent). What
   happens to the other 14 rows when the real run finally executes has never
   been specified: silently null, silently wrong, or flagged.
3. Flesh and Blood's exclusion is documented as policy. No check confirms it
   is also enforced at the code level (the 32-game `GAME_CONFIG` pattern
   used across generators, calendar, and search), meaning a future copy-paste
   of that pattern could reintroduce it by accident.
4. Single-supplier concentration risk: primary income depends on one
   supplier (Dice Arcade Miranda) for opened booster box singles. Not a
   technical finding, but a real continuity risk that belongs in the same
   register as the technical ones, per the redundancy and monetisation
   category.
5. Business-continuity bus-factor: what happens to the domain registrar,
   Netlify, Supabase, Stripe, MailerLite, and Resend accounts if the single
   operator loses access to the primary email account, phone, or laptop at
   the same time. The external report raised recovery generally; this adds
   the specific credential-chain dependency map as its own item.
6. Unit economics against the stated AU$10,000 net/month, 12 to 18 month
   goal has not been checked against real current numbers anywhere in this
   audit's scope. Worth a dedicated pass once the data-integrity work closes
   enough that the underlying revenue and cost figures can be trusted.
7. No check yet confirms the "count-constant" wording fix from 11 July did
   not simply move the inconsistency rather than remove it, see Section 5,
   point 7.

---

## 9. Compliance discipline, applied to C3

Per the standing addendum, every lens and every task confirms nothing it
touches conflicts with:

- The Privacy Policy's actual stated practice versus what the code and
  database actually do.
- Terms of Use, Subscription Terms, and Refund Policy on the `/legal` page.
- Attribution requirements for every external data source in scope
  (Scryfall's Fan Content Policy, tcgapi.dev, pokemontcg.io, YGOPRODeck,
  Lorcast, optcgapi.com, swu-db.com, apitcg.com).
- eBay Partner Network policy and affiliate disclosure requirements (already
  signed off as compliant by EPN, do not re-raise that specific finding,
  but do re-verify disclosure placement is unchanged since that sign-off).
- Amazon Associates AU program terms.
- Flesh and Blood's permanent exclusion (Legend Story Studios commercial
  restriction, a deliberate standing decision, not a gap to fill).
- Any jurisdiction-specific rule already in project documentation (ACCC,
  Australian Privacy Principles, Spam Act for the alert and email features).

If a lens's scope genuinely does not touch any of the above, say so
explicitly in its final report. An absent line reads as not checked, not as
not applicable.

---

## 10. Parallel execution plan

Confirmed 1 August 2026: parallel is the default, not an exception. The
existing protocol already notes six-terminal parallel execution works well;
this extends the same task-slug convention to all thirteen lens units
(the original six lenses plus the RLS/BOLA check as its own unit plus the
six new categories from Section 3), each in its own worktree, per Part 0's
existing worktree rules unchanged.

**Remaining open decision:** whether to genuinely run all thirteen at once,
or in waves. Thirteen concurrent Claude Code sessions all querying Supabase
and hitting the live site at once is itself a mild version of the load-test
scenario the performance category exists to check for, so running in two or
three waves of four to six is the safer default for a solo-operated
production site, not a hard rule. Wave grouping below is a starting
recommendation, reorder freely.

| Slug | Lens or category | Tool | Depends on |
|---|---|---|---|
| `c3-audit-0-rls` | Section 4, RLS and BOLA check | Claude Code | none, run first regardless of wave |
| `c3-audit-1-claims` | Lens 1, claims re-verification | Claude Code | none |
| `c3-audit-2-crosssystem` | Lens 2, cross-system interaction | Claude Code | none |
| `c3-audit-3-pricing` | Lens 3 and Section 5, every displayed number | Claude Code (data) plus Cowork (cross-page visual) | none |
| `c3-audit-4-links` | Lens 4, full scope: link functionality, internal link architecture, backlink profile, affiliate tracking, full crawler run, see the breakdown below the wave grouping | Cowork | none |
| `c3-audit-5-datasync` | Lens 5, backend data sync, all 32 games | Claude Code | none |
| `c3-audit-6-adversarial` | Lens 6, test validity, adversarial red-team, everything not already covered by `c3-audit-0-rls` | Claude Code | benefits from `c3-audit-0-rls` closing first, not strictly blocked |
| `c3-audit-7-abuse` | Category 3, abuse and bot traffic | Claude Code | none |
| `c3-audit-8-perf` | Category 4, performance, scale, infrastructure | Claude Code | none for the read-only assessment parts, load-test execution itself should not run concurrently with other heavy sessions |
| `c3-audit-9-mobile` | Category 5, mobile, browser, caching, analytics accuracy | Cowork | none |
| `c3-audit-10-alerts` | Category 7, alerts, communication, functional QA | Cowork (click-through) plus Claude Code (alert-vs-reality) | none |
| `c3-audit-11-integration` | Category 8, third-party integration and automation health | Claude Code | none |
| `c3-audit-12-redundancy` | Category 10, redundancy and monetisation scouting | Claude Code | none |

**Suggested wave grouping**, purely for keeping load on Supabase and Netlify
reasonable, not a dependency chain:

- Wave 1: `0-rls`, `1-claims`, `3-pricing`, `4-links`. Highest priority, and
  the four least likely to collide on the same files.
- Wave 2: `5-datasync`, `2-crosssystem`, `6-adversarial`, `7-abuse`.
- Wave 3: `8-perf`, `9-mobile`, `10-alerts`, `11-integration`, `12-redundancy`.

**`4-links`, confirmed 4 August 2026 as four distinct sub-scopes, not
one, revised same day after Sammy caught a second gap.** Raised by Sammy
directly both times, worth being honest about that rather than presenting
this as if it were caught internally: the first pass (link functionality,
internal architecture, backlinks) still missed links and interactive
elements sitting *inside* content, not just the site's own navigation and
hub structure.

1. **Link functionality.** Every internal link and every external link
   (affiliate or otherwise) actually resolves, no 404s, no redirect loops,
   no chains longer than one hop, canonical tags match the actual served
   URL. The full-scale crawler run (`c3-crawler.mjs`, not sample mode) and
   affiliate destination verification, already the slug's original scope.
2. **Internal link architecture.** A different question from "does the
   link work": is the internal linking structure itself sound. Orphan
   pages, anything live and indexed with zero internal links pointing to
   it, cannot be found by a visitor browsing normally even though it
   exists. Click depth from the homepage to any given page. Whether new
   content actually links back to the relevant hub or game page, the
   29 July blog-post hub-link bug (`/cards/<game>` versus a bare `/<game>`
   path) was one instance of this, worth treating as a standing check
   across all content going forward, not a closed one-off fix. Whether
   high-value pages (Card Details, EV calculators, hub pages) get
   meaningful internal link equity rather than being buried several clicks
   deep.
3. **Backlink profile.** External sites linking in, not previously named
   anywhere in this document. Pull Google Search Console's own Links
   report (top linking sites, top linked pages), check for anything that
   looks toxic or spammy, confirm any known or expected inbound links
   (partnerships, directory listings, press mentions) actually resolve to
   the correct current page rather than a stale or redirected one. This
   does not need a paid third-party tool to start, GSC's own data is free
   and sufficient for a first pass.
4. **In-content and interactive links, added 4 August, the gap Sammy
   caught.** Everything sitting inside a page's actual content, not its
   navigation shell. Social share buttons on blog posts, do they actually
   share the current page's real URL and a sensible title, not a stale or
   generic one. Links inside blog post body text, do they point at the
   card, set, or game they reference, not a dead or renamed page. "Buy on
   eBay" and similar in-content calls to action on Card Details and EV
   pages specifically, distinct from the affiliate destination check in
   point 1, this is about whether the button exists and is clickable in
   the first place on every layout, not just whether its destination is
   correctly tagged. Anything a user can click that lives inside a card,
   a quiz, a comparison table, or an embedded widget, not just the links a
   sitemap or crawler would naturally enumerate from page-level `<a>` tags.

**Process note, not just a content note.** This is the second time in a
row a real, material gap in scope was caught by Sammy asking rather than
by this document's own round-table or blind-spot process. Section 14's
five-panel review did not catch either the backlink gap or this one.
Section 15's six-line report requires a blind-spot line on every task, but
a lens that has not run yet cannot self-check a scope it has not yet
defined, which is exactly what happened twice here. The fix is Section 12
below (the four-roundtable framework), made a standing part of how every
lens actually runs, not an additional document review pass that happens
once and is trusted afterward.

Every slug still follows Part 0 in full: `git fetch origin` before starting
and before pushing, rebase not merge, confirm deploy via the platform's own
deploy record rather than rendered content, never reuse a slug even for a
re-run, and clean up the worktree once its push is confirmed live. Two
slugs touching the same file (for example, `7-abuse` and `12-redundancy`
both plausibly touching the same env-var or rate-limit code) is exactly
what the rebase-and-re-check step exists for, not a reason to serialise
everything.

Each slug produces its own findings-register update and its own round-table
pass (Section 6) as it closes, reconciled here in Claude.ai before its
worktree is removed.

### 10.1 Estimated time per wave and per item

First-pass estimates only, for an agentic Claude Code or Cowork session
doing the work described, not human hours. Two things make these a floor,
not a ceiling, stated plainly rather than hidden in fine print:

1. Section 13's anomaly loop-back means any check that turns up something
   unexpected extends its own item's time unpredictably. That is the
   process working correctly, not a delay to route around, and no estimate
   below should be read as licence to cut a check short to stay on
   schedule.
2. `3-pricing` is large enough on its own to be a fragility flag in its own
   right, see Section 15. It covers every displayed number across 32 games
   plus a full EV-catalogue rebuild (previously reported as 43 individual
   calculators). Splitting it into sub-passes (for example `3a-invariants`
   for the cross-page price and trend checks, `3b-ev-catalogue` for the
   calculator rebuild specifically) is worth considering before starting it
   as one block, rather than discovering partway through that it should
   have been split.

| Slug | Item | Estimate | Wave |
|---|---|---|---|
| `0-rls` | RLS and BOLA check | 2 to 3 hours | 1 |
| `1-claims` | Claims re-verification | 2 to 4 hours | 1 |
| `3-pricing` | Every displayed number, EV catalogue rebuild-validation | 6 to 10 hours, real candidate to split, see above | 1 |
| `4-links` | Link functionality, internal link architecture, backlink profile, affiliate tracking, full crawler run | 4 to 6 hours, up from 3 to 5, scope confirmed wider 4 August | 1 |
| `5-datasync` | Backend data sync, all 32 games | 4 to 6 hours | 2 |
| `2-crosssystem` | Cross-system interaction | 2 to 3 hours | 2 |
| `6-adversarial` | Test validity, adversarial red-team, Stripe event-order | 3 to 5 hours | 2 |
| `7-abuse` | Abuse and bot traffic | 2 to 3 hours | 2 |
| `8-perf` | Performance, scale, infrastructure | 3 to 5 hours, likely needs load-test tooling built from scratch first, since no test suite currently exists anywhere in the codebase per the external reports | 3 |
| `9-mobile` | Mobile, browser, caching, analytics accuracy | 3 to 4 hours | 3 |
| `10-alerts` | Alerts, communication, functional QA | 3 to 4 hours | 3 |
| `11-integration` | Third-party integration and automation health | 2 to 3 hours | 3 |
| `12-redundancy` | Redundancy and monetisation scouting | 2 to 3 hours | 3 |

| Wave | Wall-clock if run in parallel (bounded by the longest item) | Cumulative effort if run one at a time |
|---|---|---|
| Wave 1 | 6 to 10 hours, unchanged, still bounded by `3-pricing` | 14 to 23 hours, up from 13 to 22 |
| Wave 2 | 4 to 6 hours | 11 to 17 hours |
| Wave 3 | 3 to 5 hours | 13 to 19 hours |
| **Programme total** | **13 to 21 hours across three sequential waves, less if two waves are run in parallel and Supabase and Netlify load tolerates it** | **38 to 59 hours, up from 37 to 58** |

---

## 11. Hypothetical and future-scenario stress testing

Everything before this section checks what is true today. This section is
the mechanism for catching what is not yet a problem but will become one.
Every lens's two mandates in Section 0 get a third, made explicit here:
construct scenarios that have not happened yet, using the four generator
patterns below, applied to whatever that lens covers, not just the worked
examples given.

### 11.1 Scale multiplication

**Safety note, see Section 16.2 for the full rule:** nothing in this
subsection is run as real generated load against the live production site.
It means analysing known capacity limits or testing against a staging
deploy, not sending synthetic traffic at real visitors.

Take today's real number and multiply it, do not describe "high traffic"
abstractly. C3's actual current daily-traffic baseline is itself an
unconfirmed number, flagged as a gap since the 4 July roundtable and still
unconfirmed. Until that baseline is pulled from GA4, use round reference
points and name the actual mechanism that breaks first, not a general
"would probably struggle."

- 20 real people on the site at once versus 2,000 at once: does the daily
  price sync job, the follow-alert email send, search, and the Stripe
  checkout path all still behave correctly, or does one degrade first,
  and which one.
- What is genuinely the first thing to fail at 100x today's load: the
  Supabase connection pool, a Netlify function concurrency ceiling, an
  external data source's own rate limit (tcgapi.dev, apitcg.com, Scryfall,
  pokemontcg.io), or MailerLite/Resend send throughput. Name it, do not
  leave it generic.
- What happens the moment the daily price refresh runs while thousands of
  people are actively browsing: does anyone ever see a half-updated page,
  mixing yesterday's and today's snapshot.

### 11.2 Duplicate and replayed actions

For every action a user or a webhook can perform once, test what happens
when it happens twice, concurrently, or out of order.

- Sign up twice with the same email inside the same second, double-click or
  two tabs.
- Submit a follow-alert request twice for the same card and email before
  the first confirmation even sends.
- A Stripe webhook delivered twice for the same event. Stripe's own
  delivery guarantee is at-least-once, not exactly-once, this will happen
  in production regardless of whether it has yet.
- A payment request times out client-side, the user clicks pay again.
  Concretely: does the checkout path generate and reuse an idempotency key
  per attempt, and does the webhook handler use an insert-first pattern
  under a database unique constraint rather than check-then-insert, which
  is the specific pattern that closes the classic race condition rather
  than just narrowing its window.
- Two background jobs writing to the same table's same row at the same
  time, for example two overlapping sync runs for one game if a prior run
  overran its schedule.

### 11.3 Race conditions generally

Anywhere two things can happen in either order, test both orders
deliberately, not just the order that happens to occur in a manual test.

- A tier or entitlement check reading stale data while a Stripe webhook is
  mid-write.
- Two follow-alert emails queued for the same price movement, does the
  user get one or two.
- A price sync writing a new snapshot while a page is mid-render from the
  old one.

### 11.4 Attacker-mindset framing

For every feature, ask explicitly "if I wanted to break this, abuse it, or
extract value I should not have, how would I," not "does this look secure."

- If I wanted to scrape the entire price catalogue for free and resell it,
  what actually stops me.
- If I wanted to make C3 pay for my abuse (email-bomb via follow, exhaust a
  paid external API quota via search, run up Netlify function compute),
  what actually stops me.
- If I wanted to see another user's saved collection or alert list, what is
  the actual tested mechanism that stops me, not the assumption that RLS
  should cover it.
- If I wanted to plant a fake review or manipulate a ranking once any
  user-generated content exists, what stops me.

Apply all four patterns to every one of the thirteen lens units in Section
10, not as a separate fourteenth lens. A lens's report is incomplete if it
only confirmed today's state and never asked what happens at scale, on a
retry, out of order, or under deliberate abuse.

---

## 12. AI-generated-code-specific risk lens

This gets its own section rather than folding into Section 3's category
map, because it is not hypothetical for C3. C3's codebase has been built
almost entirely through Claude Code sessions, which puts it directly inside
the population current security research describes, not adjacent to it.

Findings current as of 1 August 2026, cited so they can be re-checked as
the research moves: a Q1 2026 audit of over 200 vibe-coded applications
found at least one AI-hallucination-related security flaw in 91.5 per cent
of them, a figure corroborated independently across five separate studies
(Veracode's scan of 4 million code samples, Georgia Tech's Vibe Security
Radar CVE tracker, CodeRabbit's 470-pull-request analysis, Kingbird's own
200-plus-app audit, and Escape's 5,600-application production scan). A
separate 2026 audit of 50 vibe-coded apps across major AI coding platforms
found 88 per cent had Supabase Row Level Security entirely disabled, not
partially, not misconfigured, off. AI-generated code has been measured
producing security flaws at roughly 2.74 times the rate of human-written
code, with authorisation flaws, missing access controls, and hardcoded
credentials as the dominant pattern, notably not classic injection or XSS,
which one newer study found foundation models have actually gotten better
at avoiding.

The specific failure pattern worth naming directly, because it is the one
most likely to exist unnoticed in C3's own code: a function that looks
like it checks permission and does not. The documented shape is an
AI-generated permission-check function that authenticates (confirms who
the user is) but never separately authorises (confirms the user owns the
specific object being accessed). Authentication running while
authorisation silently does not is invisible in a demo and invisible in a
working build. It only surfaces when someone deliberately tests
object-level access with two real accounts, which is exactly Section 4's
method.

What this means practically for this audit:

1. Section 4 is not a generic best-practice check. Current research says it
   is the single statistically most likely place a real, currently
   unnoticed gap exists in C3's own codebase specifically. It runs first,
   as already planned, and it is not one security item among equals.
2. Every lens watches for authentication-without-authorisation as a named
   pattern specifically, not just "check security," whenever it reviews any
   function that reads or writes user-specific data.
3. Iterative prompting is itself a documented risk: authorisation logic
   quietly altered or partially removed across successive edit rounds, not
   just missing from a first draft. C3's development history is exactly
   this pattern, many incremental Claude Code sessions over weeks. A
   point-in-time check of "is auth correct today" is not sufficient. A
   git-history sweep of every commit that touched an auth-adjacent file is
   a genuinely different check and belongs to Lens 6 and Section 4
   together, not a substitute for the live test, an addition to it.
4. Hardcoded credentials and exposed secrets are specifically
   over-represented in AI-generated code per this same research,
   reinforcing Section 4's point 3 (no privileged key in frontend
   JavaScript, source maps, or git history) as first priority, not routine
   housekeeping.

---

## 13. Self-correcting execution, anomalies loop back immediately

The wave plan in Section 10 is a starting shape, not a fixed schedule. Part
0's existing "verify twice, by two different methods" rule already requires
a second check before calling anything closed. This section makes explicit
when that second check happens: immediately, not as a separately scheduled
future pass.

**Rule:** if any check inside any lens produces a result that does not
match the documented or expected behaviour, whatever the source of that
expectation (CLAUDE.md, PROJECT.md, a prior audit finding, or plain common
sense about what the feature is supposed to do), that specific check
pauses and re-runs immediately, by a second, structurally different method
(a different query shape, a direct live fetch instead of a cached read, a
second synthetic account instead of re-reading the first result), before
the lens moves on to its next item. The lens does not finish its list and
circle back later. It stops on the anomaly, resolves it one way or the
other, confirmed real and logged with full evidence, or ruled out and
logged with the method that ruled it out, and only then continues.

This is deliberately more expensive per anomaly than a flat linear pass.
That cost is accepted on purpose: it is exactly the shape of mistake that
let the Voxsanity register's founding incident happen, a first check that
looked clean, was treated as sufficient, and was only actually verified
when someone later asked a direct question.

This applies across parallel waves too. A slug that finds an anomaly does
not keep going to protect throughput against the other slugs running
alongside it. It resolves the anomaly first, even if that means it
finishes its wave later than the rest.

---

## 14. Five-panel meta-review of this protocol and register

Run 1 August 2026, reviewing this protocol and the companion findings file
as they stood before this revision. Full findings are logged in the
companion file's C3X range from C3X-10 onward, summarised here by panel.

**Panel 1, adversarial and abuse-case design.** Roles represented: red-team
lead, bot-abuse researcher, fraud analyst, competitor-intelligence
specialist. Top finding: the original protocol checked whether already-known
abuse vectors were closed, it did not systematically generate new ones.
Section 11.4 is this panel's direct fix. Also raised: no consideration yet
of a bad-faith actor deliberately feeding the AI-assisted content pipeline
(blog posts, quiz content) bad information to test whether it publishes
uncorrected, given the confirmed pattern of AI-generated product facts
publishing without a validated source record.

**Panel 2, concurrency, scale, and idempotency.** Roles represented: SRE,
distributed-systems engineer, payments engineer, database engineer. Top
finding: the original performance category described load testing but did
not specifically require testing retries, duplicate submissions, or
out-of-order webhook delivery, a different and often more consequential
failure class than raw volume alone. Sections 11.2 and 11.3 are this
panel's direct fix. Also raised, now Tier 1 in the companion file: no
confirmation exists that the Stripe checkout path uses idempotency keys at
all.

**Panel 3, AI-generated-code risk.** Roles represented: vibe-coding
security researcher, AI code reviewer, static-analysis specialist. Top
finding: the protocol treated Section 4's RLS check as one security item
among several. Given C3's own build history, current research says this is
closer to the single most likely gap in the whole codebase, not one item
among equals. Section 12 is this panel's direct fix, including the
authentication-without-authorisation pattern named specifically.

**Panel 4, audit-methodology meta-review.** Roles represented: internal-audit
lead, QA process designer, compliance auditor whose job is auditing audits,
not products. Top finding: the original coverage map and wave plan were
both static, a lens could report a clean pass with no built-in mechanism
forcing it to prove it had looked for something new rather than only
re-confirmed the known list. Section 0's two-mandates statement partly
addressed this already, this panel pushed further: Section 13's immediate
anomaly loop-back is the concrete mechanism that makes "the process checks
itself" real rather than aspirational.

**Panel 5, business-outcome and solo-operator grounding.** Roles
represented: small-business owner, single-operator continuity specialist,
customer-support and reputation lens. Top finding: an audit this deep can
produce more findings than one person can action, and a long unprioritised
list is itself a risk, real issues buried under low-value ones. The tier
system in the companion file already addresses this. This panel's specific
push was to keep the tiering honest under pressure, a finding should not
get quietly downgraded because it is hard to fix, only because it is
genuinely lower impact. No process mechanism added here beyond stating it
as a standing discipline, since it is a judgement call each time, not
something that can be automated away.

---

## 15. Opportunity and fragility callouts, and the no-assumptions rule, restated with more force

Confirmed 1 August 2026, in response to Sammy asking for this explicitly a
second time. Two things were already implied across Section 0's two
mandates, Part 0's "no declarative safety claims" rule, and Section 13's
anomaly loop-back. They are restated here directly, because implied is not
the same as enforced, and this got raised again for a reason.

**Nothing is known safe.** No finding, no table, no function, no prior
audit result, including a Resolved status already sitting in this register
from an earlier pass, may be treated as settled without a fresh, evidenced
check inside the pass currently touching it. A prior Confirmed or Resolved
status is itself a claim to re-derive when a later lens's scope overlaps
it, not a fact to inherit silently. This is the same principle Part 0
already states for anything this document itself asserts, extended
explicitly to the register's own past entries, not only to external
report claims.

**Every lens finds its own blind spots, actively, not passively.** Section
0 already requires this. Restated as a concrete check: before a lens is
reported complete, it answers, in writing, "what is this lens least likely
to have caught, given how it was scoped and what tools it used." That
answer is required even when short, and even when the honest answer is
that nothing obvious comes to mind, in which case say that plainly rather
than omitting the line.

**Opportunities are logged continuously, not once.** The opportunity
register in the companion file (Section 4 there) is not a one-time list
closed after this session. Any lens, at any point in the programme, that
notices something C3's own data or architecture could do that a competitor
plausibly cannot, logs it as a new OPP item immediately, with the same
"why this is defensible, what it depends on" shape as the existing entries,
regardless of whether opportunity-spotting was that lens's assigned scope.

**Complexity and fragility get named, not built around quietly.** Where a
fix would require touching a large surface area, or sits on top of code
already fragile enough that building further on it carries a real chance
of introducing a new defect, that gets flagged explicitly and by name, not
attempted silently and not deferred without a note. Two concrete triggers
for this flag: a fix that cannot be scoped to a single, reviewable change
without touching several unrelated systems, and a fix layered on top of
something that has already failed to be reliably repaired across more than
one prior attempt (this is exactly the standing addendum's "recommend
removal over a third patch" trigger, restated here as its own named
callout so it fires even outside a strict third-attempt count, whenever the
underlying pattern is fragile). Where this flag fires, state the real
tradeoff of removal versus continued patching, per the standing addendum,
rather than defaulting to another attempt because it is the smaller task
in the moment.

**Every lens's final report grows from three lines to six.** The standing
addendum already requires compliance check, removal candidates, and
suggestions, present even when the answer is none. Add three more, same
rule, present even when the answer is none:

4. Blind-spot self-check, per the second point above.
5. Opportunities identified, per the third point above, logged to the
   companion file's opportunity register even if the finding sits outside
   this lens's assigned scope.
6. Complexity or fragility flags, per the fourth point above.

An absent line on any of these six reads as not checked, exactly as the
standing addendum already states for its original three, not treated as
lower stakes because it was added later.

---

## 16. Live-site safety discipline, and the priorities Sammy actually stated

Confirmed 4 August 2026, in Sammy's own words, restated here directly
because this is the actual anchor priority for the whole programme, not
one lens among many others of equal weight:

"I want the site to work. Links, calculations, cards, images, buttons,
everything. When I say numbers and pricing, I want it to be working, but
also check where it's pulling this information from, has it been
calculated correctly, is it showing the same on every page. We're not
thinking just about what we're displaying to people, but the backend, are
we storing the data correctly, getting a history and important stuff
that'll be available to us later on. Have we got full security, is there
information made public by accident, is that the right privacy, terms,
agreements. I want to go through all of this without breaking the website,
current visitors, because it's live and getting traffic, need to have a
good experience."

### 16.1 Where this maps onto the existing plan, and what changes

This restates rather than replaces the ten-category coverage map.
Cross-referenced against it directly:

- **"Site works, links, calculations, cards, images, buttons"**: this is
  Lens 4 plus Category 7's click-through pass plus Category 6's UX sweep,
  currently spread across `4-links` (Wave 1) and `10-alerts` and `9-mobile`
  (Wave 3). Given this is the stated anchor priority, `4-links` in Wave 1
  is reframed as covering basic functional integrity first, affiliate
  tracking second, not the other way around. A page that 404s or a button
  that does nothing matters more, immediately, than a mistagged affiliate
  link.
- **"Numbers and pricing, calculated correctly, consistent everywhere"**:
  this is exactly Section 5, already the largest and most detailed section
  in this document. No change needed, already the anchor it should be.
- **"Backend, storing correctly, getting history, available to us later"**:
  partly new emphasis. Category 1's existing scope (computed-column audit,
  historical backfill correctness) checks whether stored data is correct.
  It did not explicitly ask whether the *right* data is being captured for
  future use, not only whether today's stored values are accurate. Added
  as an explicit check: for every sync job, confirm it is not silently
  discarding fields the source API provides that C3 does not use yet but
  plausibly will, a rarity, population, or ranking figure dropped at
  ingestion cannot be recovered retroactively once the source's own
  history window rolls past it.
- **"Full security, information made public by accident"**: Section 4,
  already the single highest-priority check in this document. C3L-05 (the
  `collection_waitlist` fix) is a direct, already-confirmed real example of
  exactly this concern, not a hypothetical risk category.
- **"Right privacy, terms, agreements"**: Section 9.
- **"Without breaking the website, current visitors need a good
  experience"**: new, not previously its own section, added below.

### 16.2 The live-site safety rule

The site has real traffic today. Every check and every fix in this
programme follows these rules, in addition to Part 0's existing discipline:

1. **Section 11.1's scale-multiplication scenarios never run as actual
   generated load against production.** Simulating 2,000 concurrent users
   means analysing capacity limits (connection pool size, function
   concurrency ceiling, external API rate limits) and reasoning from known
   figures, or testing against a staging deploy, never sending real
   synthetic traffic at the live site. A load test that degrades the site
   for a real visitor while proving the site degrades under load is not an
   acceptable trade.
2. **Any migration or bulk update prefers a low-traffic window** where the
   choice is available, and never holds a long lock on a table serving live
   reads (`mtg_price_snapshots` and similar high-traffic tables
   specifically) without confirming the lock duration first.
3. **Every fix identifies its rollback before it is applied, not after
   something goes wrong.** `apply_migration` calls in this programme should
   be written so the reverse operation is obvious from reading them, the
   `collection_waitlist` fix follows this already, dropping a policy is
   trivially reversible by re-creating it.
4. **Read-only investigation always precedes any write**, per Part 0,
   restated here specifically in terms of protecting the live visitor
   experience, not only getting the fix right.
5. **A fix large, invasive, or uncertain enough to risk a new outage gets
   flagged under Section 15's complexity and fragility rule before it is
   attempted**, not attempted anyway because the finding feels urgent.
   Urgency is a reason to prioritise a fix, not a reason to skip the
   caution that keeps it from becoming a second incident.

---

## 18. The four-roundtable framework, standing requirement for every lens

Confirmed 4 August 2026, in response to the `4-links` gap above happening
twice. This section is the actual fix, not just an acknowledgement that a
fix was needed.

### 18.1 What this replaces

Section 6's round-table review already existed, one generic panel, run
after a lens's findings come back. That was too thin to catch what it just
missed twice. This section replaces the single panel with four named
lenses, applied to every one of the sixteen remaining items in the master
order, not as a separate pass that happens once before work starts, but as
part of how each item's own findings get reviewed once real investigation
has actually happened.

**Why grounded, not blind.** Running four roundtables of ten personas each
*before* any investigation, purely as speculation about a lens that hasn't
run yet, produces generic content: real but ungrounded worry, not a
specific, checkable finding. The far more valuable version runs the four
roundtables *against real findings*, real code, real data already pulled,
the same discipline Section 6 already established, just wider. The
demonstration in this session's response, run against C3L-15 and C3L-16
because they were fresh and concrete, is the worked example this section
is built from, not a hypothetical one.

### 18.2 The four lenses, roughly ten personas each

**A. Design and visual.** UI and visual design, typography and legibility,
information design and data visualisation specifically, brand and style
consistency across pages, colour contrast and visual accessibility, motion
and interaction design, print or export view rendering, dark mode or
theming if it exists, Australian English and tone consistency in visible
copy, and a genuinely cold first-time-visitor read with no prior context.
Asks: is this element visually correct, consistently styled, legible, on
brand, placed where a visitor would actually look for it, not just present
somewhere on the page.

**B. Real user and usage.** A casual visitor comparing two prices, a
serious high-volume collector making a real buy or sell decision from
what's shown, a mobile visitor on a slow connection, a screen-reader or
assistive-technology user, a non-Australian visitor, a first-time visitor
with zero context, a returning user checking the same page daily, someone
unfamiliar with TCG jargon (a gift buyer, a parent), a seller
cross-referencing before listing, and someone arriving from a shared link
rather than site navigation. Asks: does this actually work for a real
person doing a real thing under real conditions, not an idealised session.

**C. Adversarial and hypothetical scale.** An attacker asking "how would I
break this," a scraper or bot operator, an SRE thinking about what happens
at 10x or 100x today's load, a fraud analyst, a competitor doing
reconnaissance, a user submitting deliberately malformed input, a user
repeating the same action a thousand times, a sudden traffic spike from a
viral share, an automated monitoring script misreading the page, and a
future maintainer six months from now with none of today's context. Asks:
not does this work now, but what happens at scale, under attack, retried,
or out of order, exactly Section 11's four generator patterns applied
concretely to this specific element rather than in the abstract.

**D. Mixed and cross-functional.** A data engineer tracing where a number
actually comes from, an accountant checking unit economics, a lawyer
checking compliance exposure, a support agent who has to answer a real
complaint about this exact element, an SEO specialist, someone fact-
checking a claim on the page as if writing about it, an affiliate-network
auditor, a future Sammy debugging this at 2am with no memory of today,
someone doing investor-style due diligence, and a competitor's engineer
assessing build quality from the outside. Asks: everything that does not
fit neatly into design, user, or adversarial, provenance, business, legal,
and outside-in credibility.

### 18.3 The worked method, using "look at this price chart" as the
standing example

Sammy's own framing, kept verbatim as the standard to hold every element
to: where does the data come from, how is it calculated, is the
calculation correct, is the right data being shown, is it sitting in the
right place on the page. Applied concretely, not abstractly, to any
element under review:

1. Trace the data to its actual source, not the source it's assumed to
   have. For a price chart, is it reading the fixed database table or
   independently recomputing from raw rows, and if two mechanisms exist
   for what looks like one statistic, that divergence is itself a finding
   (this is exactly what C3L-15 turned out to be).
2. Confirm the calculation against the source by hand, at least once, not
   by trusting the code's own description of what it does.
3. Confirm the same fact reads the same way everywhere it's shown, the
   invariant Section 5 already states for numbers, extended here to mean
   visually too, not just numerically, two pages showing "the same" chart
   should not use different colours for up and down, different rounding,
   or different placement conventions.
4. Confirm where it sits on the page and whether that placement makes
   sense for how a real visitor actually reads the page, not just that the
   element renders somewhere.
5. Ask all four roundtable lenses against the specific element, not the
   page in general. "Review the price chart" is checkable. "Review the
   card page" produces generic notes.

### 18.4 How this actually gets executed, not promised all at once

Doing this with genuine quality for all sixteen remaining items, four
roundtables and roughly ten personas each, is real, substantial work,
honestly closer to being folded into each item's own execution than a
separate pass that could be produced in one sitting. Two things follow
from that directly:

1. **Every remaining task file, from this point forward, includes the
   four-roundtable pass as part of that item's own findings review,** not
   as a separate step to schedule later. When `3-pricing` runs, its
   findings get this treatment as they come back, the same session, not a
   follow-up.
2. **Claude.ai does not run all sixteen items' worth of this unprompted
   between messages.** There is no mechanism in this interface for
   continuing to work after a response ends and reporting back later
   unprompted, that is a real operational limit, not a reluctance to do
   the work. What happens instead: each item, as it's worked, gets this
   treatment as part of its own six-line report, and the findings land in
   `C3_FINDINGS_REGISTER.md` the same way everything else does.

---

## 19. Revision log

- 1 August 2026: initial version. Six-lens reconciliation, ten-category
  coverage map, Section 4 RLS priority check, tri-tool split.
- 1 August 2026, same day: parallel execution plan (Section 10), push
  discipline lifted, two-mandates statement added.
- 1 August 2026, same day: Sections 11 to 14 added, hypothetical and
  future-scenario stress testing, AI-generated-code risk lens,
  self-correcting anomaly loop-back, five-panel meta-review.
- 1 August 2026, same day: time-per-item and time-per-wave estimates added
  to Section 10. Section 15 added, opportunity and fragility callouts made
  standing requirements, every lens's final report extended from three
  lines to six, the no-assumed-safety rule extended explicitly to the
  register's own past entries.
- 4 August 2026: findings register moved to a repo-resident file,
  `C3_FINDINGS_REGISTER.md`, git-tracked, updated by every task in its own
  commit, per the same pattern already proven on Voxsanity. The Downloads
  companion file is now historical seed content, not the live copy. First
  live-investigation findings (`C3L-` range) added the same day, before any
  wave started, triggered by a real production incident (MTG price sync
  stale 7 days), not by the planned sequence.
- 4 August 2026, same day: Section 16 added, Sammy's own restated anchor
  priorities (site works, numbers correct and consistent, backend capture
  for future use, no accidental public exposure, correct legal terms, no
  breakage for live visitors) mapped explicitly against the existing plan,
  and the live-site safety rule added given the site carries real traffic
  today. Programme confirmed on hold pending other work finishing, not yet
  started, see `C3_FINDINGS_REGISTER.md` Section 10 for current status.
- 4 August 2026, later the same day: `4-links` expanded a second time to
  add in-content and interactive links (social share buttons, in-content
  article links, embedded-widget links), caught by Sammy a second time,
  not by this document's own process. Section 18 added, the four-roundtable
  framework (design, real user, adversarial and scale, mixed
  cross-functional, roughly ten personas each), made a standing part of
  every remaining lens's own execution rather than a separate pass,
  demonstrated against C3L-15 and C3L-16 in the session this was written.
