# C3 Findings Register

Canonical, single source of truth for every audit finding and every task's
outcome. This file lives in the repo and is git-tracked, it is not a
Downloads or project-only copy. Same pattern as Voxsanity's own register.

## START HERE, updated every task, read this first

**As of:** 6 August 2026, 00:52 UTC, `28200de` at the time of writing.
**Note that `9661b52` is not mine**: another session committed to `main`
between my last two updates, fixing p619's em dashes, word count and duplicate
H1. Worth knowing that this repo currently has more than one session writing
to `main`, using the same `C3 Team` git identity, so authorship in the log does
not distinguish them.

**One-line state:** 16 numbered task files executed, findings run C3L-01 to
C3L-60 with **45 resolved, 2 partly resolved, 4 High open, 5 Medium, 1 Low,
3 informational**. Stated plainly because the example format assumes a master
order and the reality does not match it: **the programme has run entirely on
ad-hoc numbered task files, not on the Wave 1 plan.** None of `1-claims`,
`3-pricing` or `4-links` has been started, and Section 10 has carried that as
item 7 since the beginning.

**Currently in flight:** none of mine. Every worktree from tasks 10 to 16 is
removed and `main` is clean at 0 ahead, 0 behind. **One worktree that is NOT
mine exists**, `C:/Users/sammy/Projects/c3-website-blog` on branch
`blog-content`, last seen at `f555d27`. It has been left untouched and is
presumed to belong to another session.

**Immediate next action:** no task file is pending. **Two dated checkpoints
fall due within hours and neither has happened yet, so neither should be
recorded as proven:**
1. ~~weissschwarz, 00:30 UTC today~~ **PASSED. Verified in production at 00:40
   UTC: `sync_start @ 00:30, sync_success @ 00:37`, and the table is now 0 days
   stale with a 2026-08-06 snapshot, its first success since 28 July.** That is
   C3L-48, C3L-49 and C3L-55 all confirmed working against live data rather
   than by simulation, and it ends a 9 day outage. Nothing further needed.
2. **`daily-tcg-sync.yml`, roughly 04:00 UTC today.** `continue-on-error` was
   removed in `f810c2f`, so this workflow should go **RED** on its next run.
   Its last run, 5 August 06:15 UTC, still reported success because it predates
   the fix. **A red result there is the fix working, not a new breakage.**

**Open decisions awaiting Sammy:**
- **C3L-54, which writer owns `pokemon_cards`.** The background sync and
  `daily-tcg-sync.yml` both fire at `0 4 * * *` onto the same table with
  different id and slug schemes. This has to be settled before C3L-53 is fixed,
  because fixing the scripts without it trades silence for collision.
- **C3L-53 and C3L-54 now have a recommendation awaiting your yes or no**, from Task 18: retire all three daily scripts and `daily-tcg-sync.yml` with them, leaving `daily-mtg-sync.yml` untouched. Reasoning and the rejected alternatives are in Section 3 under the C3L-53 and C3L-54 entries. Nothing was shipped.
- ~~**C3L-53, the three schema mismatches**~~ (`logo_uri` on `pokemon_sets`, `code`
  on `lorcana_sets`, `num_of_cards` on `yugioh_sets`). **Explicitly noted per
  the briefing's instruction: no Task 12 or any other task file for C3L-53
  exists in Downloads. `task-12-business-selfserve-checkout.md` is a different
  piece of work. So this is unassigned, not in progress.**
- **C3L-56**, whether the 5 orphan slugs get redirects or whether slug
  preservation is extended to non-colliding rows.
- ~~Blog post p619's duplicate H1~~ **RESOLVED 6 August by `9661b52`, which was
  another session's commit, not this one.** Verified in the built output: the
  rendered page now carries exactly one `<h1>`, the layout's, and the file has
  no em or en dashes. Recorded because the fix arrived from outside this
  session's own work.
- ~~Duplicate task files in Downloads~~ **RESOLVED 6 August.** All five copies
  of the C3L-55 slug-seed task are now deleted.

**Anything live and wrong on the site right now:**
- ~~weissschwarz prices are 9 days old~~ **FIXED and verified in production
  6 August 00:37 UTC, first successful sync since 28 July.**
- **`pokemon_cards` has had no row updated since 29 July**, nine days, while
  its prices stay current, and its enrichment columns (`hp`, `types`,
  `attacks`) are empty across all 31,833 rows. Found in Task 18. The sync
  health check does NOT catch this, because it measures snapshot freshness and
  the snapshots are fine.
- **yugioh's background sync has never completed a run** (C3L-57). It starts
  three times a night, times out at Netlify's 15 minute ceiling each time, and
  logs no terminal event. Its data is current only because snapshots are
  written incrementally on the way down, so the site looks fine.
- **All three daily sync scripts fail at their first step every day** (C3L-53).
  Those games stay current only because a second writer keeps them so.
- ~~p619 renders a duplicate H1~~, fixed 6 August, see above.

**Full detail:** Section 9 for counts, Section 10 for the full ordered list of
what to pick up next, Section 3 for every individual finding.

---

## 0. Purpose and convention

- **This is the one place findings live.** `c3-master-audit-protocol-v1.md`
  (method) and the original Downloads-based companion file stay as
  reference and seed material, but from 4 August 2026 this repo file is
  the live copy. If the two ever disagree, this file is correct, the
  Downloads copy was a snapshot at creation time.
- **Every task updates this file directly, in its own commit, before the
  task counts as finished.** Not a separate follow-up step, not something
  Claude.ai regenerates from a report pasted back to it. Whoever does the
  work (Claude Code, Cowork, or Claude.ai investigating live) edits this
  file as part of the same push.
- **Never delete a row. Never renumber. Update status in place. Append new
  ID ranges only.** Unchanged from the original discipline.
- **The task log (Section 1) is the audit trail.** It answers who touched
  what, when, and what the six-line report said. **The findings tables
  (Sections 3 onward) are the current-state snapshot.** They answer what is
  true right now. Both get updated every time, not one or the other.
- **Per protocol Section 15, every entry includes the six-line report**
  (compliance, removal candidates, suggestions, blind-spot self-check,
  opportunities identified, complexity or fragility flags), condensed to
  what is non-empty. An absent line reads as not checked.
- **Every task refreshes the START HERE section FIRST, before any other part
  of this file, and a task is not finished while that section still describes
  an earlier task's state.** Same non-negotiable standing as the six-line
  report, and for the same reason: this register is now long enough that the
  top of it is the only part guaranteed to be read, so a stale summary there
  is worse than none. Refreshing it means every field, re-derived from what is
  actually true in the repo and the database right now, not carried forward
  from the previous task's wording. If a field's answer is genuinely unknown,
  it says so explicitly rather than being quietly omitted.
- **Section headings carry their ID range in the title** (for example,
  "Section 6, IDs C3X-01 to C3X-16"), and Section 9 keeps a running count,
  the same pattern that kept Voxsanity's much larger register navigable
  once its volume grew past what a flat read-through could handle. Section
  11 has the concrete rule for when a section needs splitting further.

---

## 1. Task log, append only, newest first

| Date | Task or slug | What happened | Six-line report (condensed) |
|---|---|---|---|
| 2026-08-06 | `c3-audit-c3l53-c3l54-investigation`, Claude Code, laptop, own worktree, **investigation only, nothing shipped** | Task 18. No code change, no migration, no fix, by instruction. **C3L-53 turns out to be understated: these are not three schema mismatches, they are three scripts written against a data model the database no longer has.** The reported errors named one column each only because PostgREST reports the first it hits. Measured field by field: all three `_sets` tables share one canonical shape and none of the three scripts writes it, with **7, 16 and 12 nonexistent columns respectively on the cards side**, plus text-into-integer on `id` and `set_id`, and **yugioh omitting the primary key entirely**. **C3L-54 is narrower than recorded**: there is no live collision and cannot be one, because the script writer dies before reaching the cards table and its ids are the wrong type anyway. **It also answers the task's C3L-55 question directly, and the answer is no**: seed-from-stored-slugs coordinates slugs, not primary keys, and these writers do not share an id space. **The decider for all three tables: the background syncs already hold the gameplay data in `custom_attributes`**, `atk, attribute, def, level, race, type` for yugioh and `cost, ink, inkwell, lore, strength, willpower` for lorcana, exactly the sets the scripts build as columns. Recommendation is RETIRE for all three, for three different reasons, and therefore retire `daily-tcg-sync.yml`, leaving `daily-mtg-sync.yml` alone | Compliance: nothing touched, no privacy, EPN, Amazon, Scryfall or `/legal` surface involved, and no code shipped. Removal: the recommendation IS a removal, three scripts and one workflow, brought back for confirmation rather than executed. Suggestions: confirm or reject the retirement; and **treat pokemon separately, because retiring its dead script does not fix it**. Blind spots: **the field-by-field comparison is from reading both writers and querying `information_schema`, NOT from running either script against the canonical schema**, so "would fail" is inferred from column names and types rather than observed, though the live PGRST204 errors corroborate it; `custom_attributes` coverage was sampled by key name, not audited value by value, so "already covered" means the field exists rather than that every card has it, and coverage is partial at 41 per cent for yugioh and 17 per cent for lorcana; and the unique-field list assumes nothing else writes those tables, which was checked by grep rather than exhaustively. Opportunities: none new. Fragility: **`pokemon_cards` has had no row updated since 29 July while its prices stayed current**, which means a table can look healthy at the price layer while its metadata quietly ages, and nothing in the new sync health check would catch that because freshness is measured on snapshots | **Section 19 self-check. Point 1, root cause not pattern application: MET, and it is the substance of the task, the reported finding was taken apart rather than actioned, and it was wrong. Point 2, four-roundtable before shipping: NOT APPLICABLE, nothing shipped, and it should be run before any retirement is executed. Point 3, the detection question: raised and answered negatively, the sync health check would NOT have caught pokemon's stale card metadata, which is logged above as the fragility rather than left implicit.** |
| 2026-08-06 | `c3-audit-6adversarial-stripe`, Claude Code, laptop, own worktree | Task 16, **the first Critical item in this programme, and it was verified by testing rather than by reading throughout, per the C3L-44 lesson**. The tests are committed and wired into CI, so the verification is repeatable rather than a claim in a report. **Step 2's premise does not survive contact with the repo and that is itself the finding (C3L-60): there is no server-side checkout creation anywhere.** Payment is a Stripe-hosted Payment Link, so C3 never calls Stripe to create a charge and there is no idempotency key to attach. The whole risk surface is the webhook. **C3L-58, Critical: every downstream failure was swallowed and the handler returned 200, so a customer could pay, MailerLite could be briefly unreachable, and they would never be granted access while Stripe was told the event was handled.** Also no replay protection at all, `event.id` was never read. **C3L-59: signature verification was sound on 12 of 13 attack cases, with one real defect**, multiple `v1` values during a secret rotation, only the last checked. **The strongest evidence in the task: running the committed suite against the PRE-FIX handler fails 6 times**, including `mlAdd went 1 -> 2` on a duplicate delivery and `got 200` where a failed grant should have asked for a retry | Compliance: no privacy, EPN, Amazon, Scryfall or `/legal` surface touched. This is authorised testing of the owner's own payment integration; **no live Stripe key was used, no charge, refund or real webhook was created, and the only database writes were one synthetic event id that was deleted and verified back to 0 rows.** Removal: none. Suggestions: fix C3L-57 (yugioh timeout) and C3L-53's three schema mismatches, both still open; and correct CLAUDE.md's claim that paid tier resolves from the `subscribers` table, which is empty and read by nothing. Blind spots: **nothing was tested against real Stripe infrastructure**, no Stripe CLI, no test-mode event, no live redelivery, because the webhook secret is not available on this machine and creating real payment objects was out of scope, so what is proven is the handler's own logic against stubbed transports plus the dedupe constraint against the real table; the 5xx retry path is verified by the handler returning 500, **not by observing Stripe actually redeliver**; and the fail-open branch when the dedupe store is unreachable is deliberate but means replay protection is best-effort, not guaranteed. Opportunities: none new. Fragility: **the handler answered 200 to a failed payment grant, and would have gone on doing so indefinitely, because nothing downstream of a paying customer was ever checked. It is the same silent-success shape as C3L-10, C3L-51 and C3L-53, now found in the one place where it costs a customer money** | **Section 19 self-check. Point 1, root cause not pattern application: MET, the checkout-idempotency premise was tested against the repo and retired rather than implemented, and the real defects were found underneath it. Point 2, four-roundtable before shipping: PARTIAL and stated honestly, an adversarial pass was run against the handler and is what produced the forged, stale, unsigned, rotation and transient-versus-unprocessable cases, but the design, real-user and mixed lenses were not run as separate deliberate passes. Point 3, the detection question: MET in a small way, the webhook's failures are now visible to Stripe as failed deliveries and the regression suite runs in CI, but no alert reaches a human when a grant fails repeatedly, which is the same gap C3L-51 closed for syncs and has not been closed here.** |
| 2026-08-06 | `c3-audit-c3l51-detection`, Claude Code, laptop, own worktree | Task 14. **C3L-51 resolved, and the detection question this programme opened with is closed for the syncs.** The signal was chosen by measuring first: `sync_events` was rejected as primary because it is not a dependable key (39 `game` values for 32 games, NULL for the amazon job, three event_type vocabularies, and **yugioh logging 30 starts with zero terminal events while its data is current**). Signal A is ground truth freshness per game table, stale at 3 days; Signal B pairs starts against terminal events and covers A's blind spot. **First dispatched run FAILED correctly on two real problems and its log was read in full: weissschwarz 8d stale, yugioh::sync incomplete 22.6h.** The evidence-erasing cron was REMOVED rather than repaired, with the reasoning recorded in a migration. **The four-roundtable ran before shipping and changed the design twice**: an empty `sync_events` result would have silently satisfied Signal B, now a failure; and the check could itself have died silently, now it writes a heartbeat and the hourly deploy check asserts that heartbeat is recent, verified end to end by dispatching both. C3L-57 opened for yugioh's never-completing sync | Compliance: no privacy, EPN, Amazon, Scryfall or `/legal` surface touched. Nothing user-facing changed; this is monitoring plus one cron removal. Removal: pg_cron jobid 2, `sitemap-staleness-check`, which fired no webhook and only destroyed the record that none had fired. Suggestions: fix C3L-57 (yugioh's 15 minute timeout), and note that C3L-53's three schema mismatches are still unfixed even though they would now be caught. Blind spots: **the mutual monitoring does NOT cover the common-mode case**, both checks are GitHub cron so a repo inactive for 60 days loses both together, and closing that needs something outside GitHub; the 3 day threshold means a freeze is caught on day 3, not day 1, a deliberate trade against noise; Signal B was validated against 3 days of history, not a long baseline; and the daily 14:00 UTC schedule has been dispatched manually but has not yet fired on its own. Opportunities: none new. Fragility: **the check found two real live problems on its very first run, which is the argument for it and also uncomfortable, since both had been true for days while everything looked fine** | **Section 19 self-check, done the way Task 11's re-run was. Point 1, root cause not pattern application: MET, the signal was chosen by measuring `sync_events` rather than assuming the obvious log table was the answer, and rejecting it is the whole design. Point 2, four-roundtable before shipping: MET, and it earned its place twice over. Point 3, the detection question asked explicitly and separately: MET, this task IS that question, and the dependency it inherited from C3L-49 and C3L-53 is now discharged rather than restated.** |
| 2026-08-06 | `c3-audit-c3l55-slug-seed`, Claude Code, laptop, own worktree | Task 13. **C3L-55 resolved and C3L-49's last 5 games closed by the same change**, which is the third and final rule this problem has had. All 31 sync functions now import one shared module instead of carrying 31 inline copies: a record keeps whatever slug it already owns, and a bare slug is only invented for a colliding group that has no owner yet. **Both readings stated as Section 19 point 1 requires: RULE 1 is principled, it is the invariant the unique constraint needs rather than a rule that happens to match the data; RULE 2, the bootstrap tiebreak, is arbitrary and says so in the module, and is acceptable only because it runs once per group when no URL is live and is then frozen by RULE 1.** Verified by simulating the rule over every table with a unique index on `slug`: **368 rows in real collision groups across 8 tables, reproduced exactly, 0 mismatches**, including all 13 lowest-id-wins would have flipped. **The four-roundtable review ran BEFORE shipping this time and changed the fix twice**: adversarial found that weissschwarz's sets path feeds an unsanitised upstream `s.slug` into a PostgREST `in.()` filter, now dropped from the lookup rather than escaped so it fails safe; mixed cross-functional named the trade this consolidation makes, a bug that used to break one game now breaks 31, answered with `scripts/test-slug-assign.mjs` wired into `syntax-check.yml`. C3L-56 opened for 5 pre-existing orphan slugs | Compliance: no privacy, EPN, Amazon, Scryfall or `/legal` surface touched. **Zero live URLs move as a result of this change, verified by simulation against stored data rather than argued from the design.** Removal: 31 inline slug rules deleted, net 557 insertions against 845 deletions. Suggestions: decide C3L-56 (redirect the 5 orphans or extend preservation to non-colliding rows); and note the read-then-write window in the new lookup is not transactional, which matters only for pokemon while C3L-54's two same-minute writers stand. Blind spots: **the rule is verified by simulation and by an 11-case CI test against real rows, NOT by a live sync run**, so first real proof is each game's next scheduled firing; the simulation reconstructs collision groups from stored slugs, so a group resolved by some historical means other than the `base-id` shape is invisible to it; and the new database lookup adds a failure mode that did not exist before, since a lookup timeout now fails the batch, deliberately, rather than guessing. Opportunities: none new. Fragility: **this problem has now had three different fixes in four days, and the first two were both shipped as verified.** What separates this one is that it is the first where the rule follows from the constraint rather than from the data happening to agree with it | **Section 19 self-assessment, asked for explicitly: point 1 met, both readings stated. Point 2 met and it earned its place, the roundtable changed the fix twice before it shipped rather than validating it after. Point 3 NOT met by this task and deliberately so, it is Task 14's entire subject, and until then C3L-51 still means a repeat of this on any background sync is found by a person looking.** |
| 2026-08-05 | Protocol sync from Claude.ai, no slug, no worktree, **one file only** | `c3-master-audit-protocol-v1.md` replaced in full from the Downloads copy, commit `1f7aa10`, confirmed through the GitHub API as containing **exactly one file at +190/-1**. Diffed both directions with line endings normalised before overwriting, per the C3L-32 lesson that a Downloads copy can be a lossy reconstruction: **zero lines existed only in the repo's copy**, so the sync is strictly additive and the single deletion is the `## 19. Revision log` heading renumbered to `## 20`. **The sync settles a question in this register's own favour and against it.** Section 19, severity-scaled root-cause discipline, does exist and does say what Task 11's task file claimed; the repo had simply never been updated. Task 11's row and the corrections count are amended accordingly, and this is logged as correction 5, a correction of a correction. What lands: Section 19 itself, Section 13.1's full text (previously applied from the register's account of it), and **Section 1 point 5, which fixes the underlying loop by ruling that this document is handed over in full because only Claude.ai writes to it, and that a task file quotes the rule text it relies on rather than a bare section number until a sync is confirmed landed** | Compliance: nothing touched, this is a document sync and a register amendment. Removal: none. Suggestions: none new; the protocol's own new rules cover the failure this exposed. Blind spots: **the sync is verified as a faithful copy of the file in Downloads, not as the newest thing Claude.ai holds**, so if Claude.ai has since moved on again the repo is behind by exactly as much and there is still no way to tell from inside the repo; and Section 19's requirements were satisfied in Task 11 by coincidence rather than by reading them, so no completed task has yet been executed against its actual text. Opportunities: none new. Fragility: for several days the repo held a protocol that was missing a section three separate task files depended on, and nothing in the repo could detect that, which is the documentation-level version of the same blindness C3L-51 describes for the syncs |
| 2026-08-05 | `c3-audit-c3l49-rootcause`, Claude Code, laptop, own worktree | Task 11, C3L-49 as a root-cause sweep rather than a pattern copy. ~~**First correction: the task cited "protocol Section 19" for its elevated standard, and Section 19 is the Revision log. There is no Section 19 point 1.**~~ **THAT CORRECTION WAS ITSELF WRONG, and it is corrected here the same day, after the protocol was synced in commit `1f7aa10`. Section 19, severity-scaled root-cause discipline, exists and says exactly what the task file said it says. It was written by Claude.ai on 9 August and the repo's copy had never been updated, so the reference was live and the repo was the stale party, not the task file.** The work proceeded on Sections 15 and 13.1 and on Sammy's own instruction, which happened to match Section 19's actual requirements (root cause over pattern application, the detection question asked separately), so nothing was executed wrongly, but the register recorded a task file as defective when the fault was on this side. **This is the third time a task file has been called out for citing something the repo did not hold, and the synced protocol's own Section 1 point 5 now names that pattern and fixes it: this document only ever gets written by Claude.ai, so it never updates itself the way the register does, and until a sync is confirmed landed a task file quotes the rule text rather than a bare section number.** **Verified every game before touching it, by one sweep over all tables carrying a unique index on `slug`: 186 stored collisions across 8 tables, lowest-id-wins reproduces 173 and would FLIP 13.** So 26 sync functions fixed, **5 deliberately not** (`unionarena` 9 flips, `gundam`, `pokemon`, `yugioh`, `weissschwarz` 1 each). Stated plainly per the task's own point: lowest-id-wins is not demonstrably correct, only verified non-destructive per game, and `unionarena` shows why, its 9 flips are rarity variants separated only by asterisks that slugify strips, with the base rarity holding the bare slug on the HIGHER id. **Second correction, to my own Task 10 work: C3L-48 also changed the weissschwarz CARDS path, which was never verified and would have moved a live card URL. Reverted.** Step 3's race question answered: same-sync overlap is impossible (daily schedules, 15 minute cap), but `sync-pokemon-background.mjs` and `daily-tcg-sync.yml` both fire at `0 4 * * *` onto `pokemon_cards` with different id and slug schemes (C3L-54). **Step 3 also turned up the biggest thing in the task by accident: all three daily scripts have been dead for a week, failing on schema mismatches at their first step, with `continue-on-error: true` painting every run green (C3L-53), which also made Task 10's C3L-50 guards inert on arrival** | Compliance: no privacy, EPN, Amazon, Scryfall or `/legal` surface touched. No live URL was changed, which was the explicit constraint, and 13 that would have changed were protected by not shipping the fix to those 5 games. Removal: `continue-on-error` removed from three workflow steps. Suggestions: seed slug assignment from stored slugs to close the remaining 5 properly; fix the three schema mismatches behind C3L-53; decide which writer owns `pokemon_cards` (C3L-54); and give `sync_events` a consumer (C3L-51), without which none of this is detected next time. Blind spots: **the 26 fixed games are verified by a data sweep, a behavioural test of the transformed helper extracted from a real changed file, and node --check, NOT by a live sync run**, so the first real proof is each game's next scheduled firing; the sweep detects collisions by the `base-id` suffix shape, so a collision resolved by some other historical means would not be seen; and `continue-on-error` removal is verified by reading the file, not by a run. Opportunities: none new. Fragility: **C3L-53 was found because a step-3 question happened to send me to an Actions log, not because anything was watching, which is precisely how the outage that opened this programme was found, and it is the whole argument for C3L-51** |
| 2026-08-05 | Deploy health check, **first real runs**, no slug, no code changed | Sammy added `NETLIFY_AUTH_TOKEN` and asked for the check to be dispatched and its real result confirmed through the API. Two runs exist and together they cover both outcomes. **`31001947783`, 11:33 UTC, scheduled, FAILED**, and correctly so: it fired before the secret existed, the log shows the token resolving to empty and the script exiting 1 on `a check that cannot run is not a check that passed`. **`31003249490`, 11:53 UTC, dispatched, PASSED in 15 seconds**, reporting `latest deploy: 8315b81 state=ready`, `published: 8315b81 state=ready`, `origin/main: 8315b81`, `published matches origin/main`. All three agree, so the site is serving exactly what main says. Also settled a thing that would otherwise look like a second missing secret: `NETLIFY_SITE_ID` is empty in both logs and does not matter, the script falls back to the documented non-secret site id at line 30 | Compliance: none touched, this is a workflow dispatch, a read of two run logs and a register edit. Removal: none. Suggestions: none new for this check, it is doing what it was built to do; the one open question it inherits is C3L-51, that the 31 background syncs still have no equivalent consumer. Blind spots: **the PASS was observed against a healthy deploy, so the check is proven to run and to compare correctly, but its mismatch and its `state=error` branches have NOT been seen fire against a real bad deploy**, only its missing-secret branch has; and it was dispatched manually, so the hourly schedule is still unproven beyond the single 11:33 firing. Opportunities: none new. Fragility: the hourly schedule had already fired once and failed before anyone dispatched it, which is a reminder that a scheduled check added in one task starts running immediately and can be red for reasons that have nothing to do with the thing it watches |
| 2026-08-05 | `c3-audit-5-datasync`, Claude Code, laptop, own worktree | Task 10, four angles, all four answered. **Angle 3 found the live one and it was fixed first: weissschwarz had written no prices for 8 days and was failing EVERY night, 24 errors against 1 success since 12 July**, aborting on a `23505` slug collision between two real Kaguya-sama sets before it ever reached prices (C3L-48). It had been "fixed" once already, by `0508754`, whose guard deduped in arrival order on a comment asserting the API order was stable; it held for exactly one run. Replaced with an order-independent lowest-id-wins rule, **verified by running both rules over the two real ids in both orders**, new rule identical either way and matching the live table so no URL changes, old rule flips and reproduces the error. **Angle 1: C3L-10 was never actually implemented** (C3L-50), zero-row guards added to all 4 script syncs, with the counter chosen per file because pokemon and lorcana count only CHANGED rows and a 0 there is a legitimate quiet day. **Angle 2: the provenance gap was 31 of 32 tables, not the 7 the entry implied** (C3L-52), columns added with the default attached separately to avoid rewriting a 1,578 MB table. **Angle 4: nothing monitors any of it, and a cron job marks alerts as fired without firing them** (C3L-51). C3L-49 flagged for its own task rather than forced into this one | Compliance: no privacy, EPN, Amazon, Scryfall or `/legal` surface touched. C3L-48 restores a game that was serving 8 day old prices under an "updated daily" promise, which is the same misleading-currency exposure as C3L-01. Removal: none. Suggestions: sweep the 30 remaining arrival-order slug guards (C3L-49) as its own task, checking each game's stored slugs against the rule first because it can change live URLs; give `sync_events` a real consumer (C3L-51); and populate `source` in the other 31 syncs. Blind spots: **the weissschwarz fix is verified by replaying the logic over the real colliding ids, not by a live sync run**, because the job is on a Netlify schedule and the next real proof is tomorrow's 00:30 run; the zero-row guards are verified by syntax check and by reading each counter's meaning, NOT by forcing a zero-row run, so their trigger path is unexercised; and the 30 files in C3L-49 were confirmed to share the pattern by grep, not read individually. Opportunities: none new. Fragility: a fix shipped four tasks into a programme built to stop exactly this failed silently for 8 days, and would have kept failing indefinitely, because the thing that was supposed to notice it is a cron job that erases the evidence instead |
| 2026-08-05 | `c3-audit-c3l47-infra`, Claude Code, laptop, own worktree | Task 09, two pieces. **C3L-47 closed and verified by measurement, not by reading**, which mattered because C3L-44 once passed a code review while still leaking. Re-measured before changing anything (registered 799ms median against 494ms, non-overlapping ranges), added a 900ms constant-time floor taken from the slow path's own measured cluster of 764 to 859ms, applied to the whole handler rather than just the not-found branch. **Re-measured after: 1,176ms against 1,180ms, a 4ms delta, ranges fully overlapping.** Reset flow confirmed still working, synthetic accounts removed. **Infrastructure**: C3L-09 actions moved v4 to v5 (verified v4 declares node20, v5 and v7 both node24) and Node 20 to 22; C3L-26 hourly deploy-health check built, catching both a failed deploy and a published commit that does not match `origin/main`; C3L-35 `update_price_stats` REMOVED after re-confirming zero callers; C3L-38 `updateSnapshotVerdicts` DELETED and `exec_sql` deliberately NOT created | Compliance: no privacy, EPN, Amazon, Scryfall or `/legal` surface touched. C3L-47 closes the last live enumeration channel on the account system. Test accounts removed and production verified at 0 `@example.com` and 0 orphaned links. Removal: two, both executed, `update_price_stats` and `updateSnapshotVerdicts`, and the reasoning for declining to create `exec_sql` is recorded rather than left implicit. Suggestions: add `NETLIFY_AUTH_TOKEN` so the deploy check can run, and dispatch it once manually before trusting the schedule, exactly as the RLS check needed in Task 07. Blind spots: the deploy-health check has NOT been run end to end for the same reason as the RLS check, no token on this machine, only its fail-closed path is verified; the 900ms floor was validated at ordinary traffic and not under load, though it is a fixed constant so load should not move it; and the workflow bumps are unverified until each workflow next runs. Opportunities: none new. Fragility: dropping `update_price_stats` discarded a guard added only four tasks earlier under C3L-25, which is a reminder that work on a component nothing calls is worth questioning before doing rather than after |
| 2026-08-05 | `c3-audit-siblings-c3l36`, Claude Code, laptop, own worktree | Task 08, three pieces in three commits. **C3L-46**: `handleForgot` given the same per-address send throttle as signup, reusing the live helper and the same counter rather than a second one. Measuring it turned up **C3L-47**, that `handleForgot` is enumerable by timing (829ms median registered against 509ms unregistered, non-overlapping ranges, identical bodies), which the throttle does not fix and which is logged rather than guessed at. **C3L-17 to C3L-23**: tolerance applied to all seven siblings, per card because they resolve their anchor per card, tolerance 1 day measured from each game's own cadence, anchors moved off `CURRENT_DATE` onto the newest snapshot held. **This corrected 3,050 live mislabelled figures, 733 on 24h and 2,317 on 7d, which contradicts what those seven entries recorded.** **C3L-36**: 23 card-page files swept to date-bounded, not the 28 the entry claimed | Compliance: no privacy, EPN, Amazon, Scryfall or `/legal` surface touched. C3L-46 reduces an email-abuse exposure; C3L-47 is a live enumeration channel left open and now recorded. The synthetic account used to measure C3L-47 was removed and production verified clean. Removal: none new. Suggestions: decide on a constant-time floor for `handleForgot` (C3L-47), the only remaining way to close it; and consider whether the 90 day chart window should be a shared constant rather than repeated inline in 23 files. Blind spots: the sibling fix was verified by isolating old-versus-new logic on today's data for starwars specifically and by aggregate suppression counts for the rest, not card-by-card across all seven; and the 23 swept files were verified by syntax check plus six hubs and one card page fetched live, not all 23 rendered. Opportunities: none new. Fragility: the first sibling before/after comparison was confounded by a stale baseline and would have read as a huge unexplained regression if taken at face value, which is a caution that a baseline captured from a scheduled job is not a baseline for a code change |
| 2026-08-05 | Recurring RLS check, **first real run**, no slug, no code changed | Sammy added the `SUPABASE_ANON_KEY` secret and dispatched `weekly-rls-check.yml`. Run `30982378152` **PASSED** in 32 seconds, 15 checks, 0 failures. Actual log pulled and read, not just the status. Part A: 13 tables swept, all blocked, 4 meaningful (`accounts` 145 rows, `follow_magic_links` 146, `follows` 4, `email_log` 3) and 9 correctly labelled as proving nothing because they are empty. Part B: `B's follow row 13 survived all four attacks intact`, `A's dashboard does not disclose B's data`. Cleanup removed 2 synthetic accounts with none left behind. Full result written into C3L-06. This closes Task 07's blind spot that the script had never been run end to end | Compliance: none touched, this is a read of an existing run plus a register edit. Removal: none. Suggestions: none new, the check is doing what it was built to do. Blind spots: 9 of 13 tables still prove nothing because they hold no data, which is by design and is the reason the labelling exists, but it means today's pass covers 4 tables of real evidence and not 13; and the run exercised the follow path only, because follows remain the only user-owned row type that exists. Opportunities: none new. Fragility: the run carries the Node 20 deprecation warning already logged as C3L-09, which will eventually break this workflow along with the two sync workflows |
| 2026-08-05 | `c3-audit-c3l44-c3l45-recurring-rls`, Claude Code, laptop, own worktree | Task 07, three pieces. **C3L-44**: signup no longer discloses whether an address is registered. It took two attempts and that is the finding worth carrying: the first fix equalised body content and length, read as correct, and still leaked through **timing**, a 491ms median separation caused by one extra database round trip on the registered branch. Fixed by making the lookup unconditional; re-measured live at a **19ms** median delta with fully interleaved ranges, against 1,214ms in the original finding. A per-address send throttle was added so equalising timing did not create an email-bomb vector. **C3L-45**: an empty batch is normal termination and stays; what changed is that a truncated run is now distinguishable from a finished one, verified live reporting `expected 41628, complete`. **Recurring RLS check**: Task 06's method automated, weekly, labelling each table meaningful or vacuous so the empty tables start being genuinely tested once they hold rows, with targets discovered from column shape rather than hardcoded | Compliance: no privacy, EPN, Amazon, Scryfall or `/legal` surface touched. C3L-44 strengthens the Privacy Policy's implicit position that account existence is not public. Test accounts created during verification were all removed, production verified at 0 `@example.com` and 0 orphaned magic links. Removal: none new. Suggestions: add `SUPABASE_ANON_KEY` as a repository secret and dispatch the workflow manually once before trusting the schedule; consider whether `handleForgot` should carry the same send throttle, since it has the same unthrottled send exposure and only signup was in scope here. Blind spots: **the recurring check has not been run end to end**, only its fail-closed path, its RPC's shape, and that anon cannot call it, because the service key is not retrievable from this machine; and the throttle is per serverless instance in memory, so it blunts casual abuse rather than a distributed attempt, the same caveat the existing login limiter carries. Opportunities: none new. Fragility: the C3L-44 fix was verified correct at a point where it was still leaking, which is a caution that reading a security fix is not evidence it works, and this one only failed the measurement, not the review |
| 2026-08-05 | `c3-audit-0rls-c3l43`, Claude Code, laptop, own worktree | Task 06, two pieces. **Piece 1 closes protocol Section 4 and C3L-06, open since the first session, and it passes.** Two synthetic accounts, real sessions through the live endpoint, and eight object-level attacks by Account A against Account B's follow row: read, soft delete, hard delete, token-authenticated hard delete, bogus token, unauthenticated delete, and token substitution on two surfaces. **All eight rejected, B's row verified intact in the database after each.** Anon-key sweep of all 13 sensitive tables returned 0 rows, and that is meaningful for the 4 that actually hold data, including `accounts` with 138 real rows and `follow_magic_links` with 139 live tokens. All synthetic data removed, counts back to baseline exactly. One real finding, C3L-44, account enumeration through signup, which is information disclosure not an authorisation gap, so it did not halt the work. **Piece 2, C3L-43**: the breakdown the task asked for is 1,871 genuinely stale and **0** falling through a function gap, so the fix is an expiry not a repair; 798 stale verdicts expired, 0 current cards affected | Compliance: this was authorised security testing of the owner's own site under protocol Section 4, non-destructive, and all synthetic data was removed with counts verified back to baseline. One email was sent to a synthetic `example.com` address as an unavoidable part of exercising the real signup path; Account B was created directly to avoid a second. C3L-44 touches the Privacy Policy's implicit position on account confidentiality. Removal: none new. Suggestions: decide whether signup should be made generic (C3L-44), and consider a recurring scheduled version of this RLS test per Section 4's closing line rather than leaving it a one-time pass. Blind spots: the two-account test covered follows, which is the only user-owned row type that currently exists, so "collection rows" and "alert rows" in Section 4's wording were vacuous rather than tested, `card_price_alerts` and `collection_waitlist` are both empty tables; and the 1,042 stale cards above the price floor were explained as churn by rate analysis, not per-card. Opportunities: none new. Fragility: `update_mtg_signals_batched` exits its batch loop on the first empty batch, which is not firing today but would silently truncate processing if a 500-card window ever yielded zero upserts |
| 2026-08-05 | `c3-audit-c3l39-c3l41-c3l42`, Claude Code, laptop, own worktree | Task 05, **three separate pieces, kept separate in three migrations, three register entries and a structured commit**. Piece 1, C3L-39: minimum-history guard at 30 distinct days, implemented at source so all three consuming surfaces inherit it, **measured effect 424 verdicts withheld** (buy 4,634 to 4,522, sell 8,693 to 8,381) with 0 sub-threshold cards still verdicted, plus the "Mid-range price" conflation fixed on the card page with a distinct not-enough-history state. Piece 2, C3L-41: exactly 8 rows flagged by primary key, values preserved not deleted, **Ornithopter's low moved $0.07 to $715 and its ratio 10,357 to 1.0**, and honestly, 2 of the 8 did not change because their signal rows are stale. Piece 3, C3L-42: `written_at` and `source` added to `mtg_price_snapshots` with the default attached separately to avoid a full rewrite of a 1,559 MB live table, and the other 7 Core games confirmed still lacking both. C3L-38's question answered definitively (not the same bug, one root cause, the old fix silenced it). C3L-43 opened | Compliance: nothing touched on privacy, EPN, Amazon, Scryfall attribution or `/legal`. C3L-39 reduces an unfounded-advice exposure rather than creating one, since a buy or sell call is the most actionable thing this site says. Removal: `update_price_stats` (C3L-35) and `updateSnapshotVerdicts` (C3L-38) remain removal candidates and C3L-38's answer strengthens the case, it is a step that runs daily and provably does nothing. Suggestions: expire stale `mtg_signals` rows (C3L-43), and either create `exec_sql` or delete `updateSnapshotVerdicts` rather than leaving a daily no-op. Blind spots: `/market` and the weekly email were NOT updated for the stale-row case and still surface all 798, only the card page is covered; the other 7 Core games have no equivalent guard and were not given one; and the display change is verified by reading and by node syntax check, not by a rendered browser. Opportunities: none new. Fragility: `compute_mtg_signals_batch` has now been replaced twice in one session, and its final body carries changes from two different findings, so anyone reverting one piece must read both migrations rather than assuming the file they are holding is the whole story |
| 2026-08-05 | `c3-audit-c3l40-confirmation`, Claude Code, laptop, own worktree, **investigation only, nothing shipped** | Task 04. No fix, no guard, no data correction, no migration. C3L-40's "almost certainly a bad snapshot" is replaced with measured rates: of the 242 outliers, **189 (78.1 per cent) are genuine market data**, the three Marvel sets released 26 June whose preorder highs collapsed after release, **8 (3.3 per cent) are ingestion-suspect** and all trace to one anomalous batch, and **45 (18.6 per cent) are unclear**. So the original finding overstated the problem by roughly an order of magnitude. For Ornithopter specifically, three candidate mechanisms were tested and ruled out (decimal or FX shift, wrong printing matched, foil mix-up), leaving the 6 June batch as the mechanism, and it is stated plainly that what Scryfall actually reported that day cannot be proven because neither Scryfall nor C3 keeps the history. The systemic cause is logged as C3L-41, a one-off 39,515 row write on a single date that has never recurred and whose writer could not be identified, and C3L-42 explains why it could not be: the table has no ingestion timestamp or source column at all | Compliance: nothing touched, no privacy, EPN, Amazon, Scryfall or `/legal` surface involved. Scryfall API use stayed within its terms, 7 single-card requests with the project User-Agent and a delay between them. Removal: none new. Suggestions: any cleanup should target only the 6 June batch rows and must not touch the Marvel cards, whose extreme ranges are real price history; and add a `written_at` plus source or batch marker to the snapshot tables (C3L-42) before the next time this question is asked. Blind spots: 45 of 242 are unresolved and I could not resolve them, the 6 June writer is unidentified, and only 7 cards were individually confirmed against the source, so the 78 per cent genuine figure rests on set-release timing and price-collapse shape rather than on 189 individual source checks. The other 31 games were not examined for the same 6 June anomaly. Opportunities: none new. Fragility: a finding written from one card's appearance became a 242 card claim in the register for a day, the second time in three tasks that a finding generalised further than its evidence |
| 2026-08-05 | `c3-audit-c3l34-investigation`, Claude Code, laptop, own worktree, **investigation only, nothing shipped** | Task 03. No migration, no code change, no displayed figure or verdict altered. The headline result is a correction to my own C3L-34 from Task 02: its central claim was wrong. The card page says "Recent High/Low", not "52 week", and that wording was a deliberate decision documented independently in two places in the codebase. A true 365 day filter changes **no value today**, 0 of 5,000 cards differ, so C3L-34 is a naming problem now and a value problem only from 4 May 2027. The single real exposure is one marketing sentence at `src/cards.html:708`. Downgraded High to Medium. Full before-and-after for 12 real cards under both candidate approaches is in `C3L34_INVESTIGATION_2026-08-05.md`. Approach (a) flips zero verdicts and is already implemented everywhere except that one sentence; approach (b) would remove all 13,327 verdicts and all 43,507 figures for roughly nine months. Three new findings opened, one of them (C3L-40) a genuinely wrong displayed number that neither candidate approach would fix | Compliance: the `src/cards.html` sentence is a misleading-precision claim of the kind protocol Section 7 flags under the ACCC priority, identified and left for the fix task per this task's own no-ship rule. Nothing else touched. Removal: `update_price_stats` (C3L-35) and `updateSnapshotVerdicts` (C3L-38) are both removal candidates, being two writers of the same columns with no working one between them. Suggestions: correct the one marketing sentence, and consider a minimum-history and outlier guard on the verdict, which is the third option the data argues for and which neither (a) nor (b) covers. Blind spots: this pass read the MTG signals path only, the other seven Core games have their own signal or verdict surfaces that were not looked at, and no rendered-browser check was done, all label claims come from reading source and one live HTML fetch. Opportunities: none new. Fragility: C3L-34 stood in the register for a day as a High severity claim that was wrong on its central point, which is a caution about findings written from reading one function rather than tracing to the display layer |
| 2026-08-05 | `c3-audit-mtg-cardpage-consolidation`, Claude Code, laptop, own worktree | Task 02. Three of the task file's premises did not survive contact with the repo and are corrected below rather than implemented as written. C3L-15 fixed by consolidation not by patching: the badge and the prose trend sentence, which were a second and third implementation of the same statistic, now both read the single corrected column. C3L-16 fixed by bounding the window on date rather than row count, and C3L-30 answered definitively (it freezes permanently, it does not shift). C3L-25, C3L-28, C3L-29, C3L-31 all done. C3L-27 to C3L-31 did not exist in the repo register at all and were merged in from a newer Downloads copy, which turned out to have LOST Task 01 evidence, logged as C3L-32. Four new findings opened, one of which (C3L-34) is a live mislabelled statistic bigger than the one this task was written to fix | Compliance: no privacy, EPN, Amazon, Scryfall attribution or `/legal` surface touched. C3L-29 improves an accessibility position rather than creating exposure. C3L-34 is a live misleading-pricing claim inside the ACCC priority in protocol Section 7, logged not fixed. Removal: `update_price_stats` is a genuine removal candidate, it is called by nothing at all (C3L-35), and the guard added to it per Step 4 therefore has no live effect today. Suggestions: fix C3L-34 before it becomes a year of mislabelled history, and sweep C3L-16's identical one-line defect across the other 27 card pages (C3L-36). Blind spots: no rendered-browser check was done, the chart and badge changes are verified by node syntax check, by a numeric harness over the real date series, and by reading, not by looking at a page. C3L-29 is verified as correct markup, not by a screen reader. Opportunities: none new. Fragility: the register itself proved able to lose evidence when regenerated outside the repo (C3L-32), which is the mechanism the register exists to prevent |
| 2026-08-04 | `c3-audit-urgent-c3l12`, Claude Code, laptop, own worktree | Task 01. C3L-12 fixed and applied to the live database roughly 32 hours before the 20:00 UTC 5 August deadline, and about 8 hours before tonight's 20:00 UTC 4 August cron run: both windows now anchor on the newest snapshot actually held and return NULL when the real window is more than 1 day from nominal. C3L-08 fixed, including the `package-lock.json` update without which `npm ci` would have failed and broken the MTG sync that was repaired earlier today. All 7 sibling functions read individually and logged as their own rows (C3L-17 to C3L-23): all 7 share the defect but none is currently wrong, because only MTG has a snapshot gap. Investigating where the value is displayed found two further live defects on the MTG card page that are a different mechanism entirely (C3L-15, C3L-16), one of them already wrong today and one that will freeze every MTG price chart around 10 August | Compliance: no privacy, EPN, Amazon, Scryfall attribution or `/legal` surface touched. This work reduces a live ACCC misleading-pricing exposure rather than creating one. Removal: none, first repair of this function. Suggestions: apply the same tolerance to the 7 siblings before their next outage rather than after (C3L-17 to C3L-23), and give `update_price_stats` a minimum-sample guard (C3L-25). Blind spots: the fix was verified by checksum against an independently computed expectation and by date simulation, but no test exercises the NULL path end to end against real production data, because doing so would have required faking snapshot rows. C3L-15 and C3L-16 were found by reading, not by any test, and nothing in this pass would have caught them if the task had not required checking the display path. Opportunities: none new. Fragility: the 5 August run will publish an 8 day window as "7d", which is the chosen tolerance working as designed rather than a residual bug, stated here so it is not mistaken for one later |
| 2026-08-04 | Claude Code, laptop, kickoff session, no slug | Environment confirmed (`C:\Users\sammy\Projects\c3-website`, branch `main`, clean, 0 behind origin). Protocol and register seeded and pushed (`a02a9cc`), confirmed live via the GitHub commit API, not local log. MTG sync root cause found from the real Actions log: Scryfall dropped `download_uri` in favour of `jsonl_download_uri` and changed the payload from a JSON array to gzipped JSONL. Fixed (`2d0404b`), verified against the real 77MB file before push, then a manual run went green in 10m47s and wrote 52,623 snapshots for 2026-08-04, confirmed in the database. C3L-01, C3L-02, C3L-04, C3L-07 resolved. Investigating the recovered data surfaced two further findings the sync fix does not address (C3L-11, C3L-12). Partial progress on protocol Section 4: the anon-exposure and object-level-authorisation code checks passed, the two-account live test did NOT run | Compliance: Scryfall attribution and Fan Content Policy wording untouched, no privacy, ACCC, EPN, or Amazon surface touched by this change. C3L-12 is a live misleading-pricing-claim risk and does sit inside the ACCC priority named in protocol Section 7, logged not fixed. Removal: none, this was a first repair of this job, not a third patch. Suggestions: declare `stream-chain` directly (C3L-08), make a sync that writes zero snapshots exit non-zero (C3L-10), and require the price-change functions to assert their window rather than take the nearest available snapshot (C3L-12). Blind spots: this session read the MTG job only. The other 31 games' sync jobs and `daily-tcg-sync.yml`'s run history were never checked for the same or any other silent failure, and the seven non-MTG price-change functions were not read even though they are near-certain copies of the one carrying C3L-12. Opportunities: none new. Fragility: `stream-chain` imported but undeclared (C3L-08), Node 20 deprecation will force-break both sync workflows (C3L-09), and the whole incident was caught only because a failure email happened to be read (C3L-10) |
| 2026-08-04 | Kickoff, laptop, no slug yet | Sammy gave the go-ahead to start. Combined prompt written: environment check, git pull, seed this file plus the protocol plus the historical companion file into the repo, then begin with the MTG fix, the live RLS/BOLA test, and Wave 1 as session time allows. Programme status flipped from on hold to started in Section 10 | Compliance: none new, planning only. Removal: none. Suggestions: none new. Blind spots: none, pure planning. Opportunities: none new. Fragility: none new |
| 2026-08-04 | Claude.ai, planning only, no slug | Sammy confirmed the programme is on hold pending other work (Voxsanity) finishing, not to start yet. Restated the anchor priorities in his own words (site works functionally, numbers correct and consistent, backend captures what will matter later, no accidental public exposure, correct legal terms, no breakage for live visitors), cross-checked against the existing plan in protocol Section 16, one gap closed (explicit check for silently-discarded source fields added to Category 1), one new standing rule added (live-site safety, protocol Section 16.2, load testing must never hit production directly) | Compliance: none new. Removal: none. Suggestions: none new. Blind spots: none identified this pass, pure planning. Opportunities: none new. Fragility: none new, this pass added a safety rule rather than finding a fragility |
| 2026-08-04 | Claude.ai, live investigation, no slug, pre-Wave 0, triggered by a GitHub Actions failure email | MTG price sync confirmed 7 days stale, not just failed today (C3L-01 to C3L-04). `collection_waitlist` public-read PII exposure found and fixed directly (C3L-05). RLS confirmed enabled schema-wide, no `authenticated` role used anywhere, account and follow data has no anon path at all (C3L-06) | Compliance: privacy conflict found and closed (C3L-05). Removal: none. Suggestions: cron jobs should check input freshness before computing derived signals. Blind spots: application code, GitHub Actions logs, and two Supabase log-service fetches were all unreachable this session. Opportunities: none new. Fragility: cron jobs reported `succeeded` for a week while operating on frozen input, nothing downstream noticed, worth a general fix |

*(Future rows go above this line, newest first. Do not overwrite or
compress old rows once this file has real history.)*

---

## 2. ID ranges in use

- `C3L-` : findings confirmed by direct, live investigation (database
  queries, live page fetches), not from an external report. Started
  4 August 2026.
- `C3-001` to `C3-164`: first external pass, 30 July 2026 docx, anchor
  register, status column tracks C3's own confirmation, not the original
  report's classification.
- `C3S2-`: reserved for the second external pass's structured register
  (xlsx) once provided, not yet appended, do not assume its numbering
  matches C3-001 to C3-164.
- `C3X-01` onward: findings from round-table and blind-spot passes, not
  present in either external report and not from direct live investigation.
- `OPP-01` onward: opportunity register, continuous per protocol Section 15.

---

## 3. Confirmed findings, live investigation (IDs C3L-01 to C3L-60)

Checked directly against the live Supabase project (`owaroeqchreuffbyakqx`)
and, where noted, the live site. Genuine confirmed evidence, not a report
being re-verified.

| ID | Finding | Evidence | Priority |
|---|---|---|---|
| C3L-01, root cause confirmed and fixed 2026-08-04, awaiting first green run | MTG price data has been stale for 7 days, not just today. Most recent `mtg_price_snapshots.snapshot_date` is 2026-07-28, checked against 2026-08-04. Every other Core game synced today or yesterday, confirming this is MTG-specific, not a platform-wide outage | Direct query, `select snapshot_date, count(*) from mtg_price_snapshots group by snapshot_date order by 1 desc`, cross-checked against the other seven Core games' equivalent tables | Critical, take down or correct now. MTG is roughly 89.8 per cent of C3's own eBay revenue, this is the highest-revenue game running on week-old prices |
| C3L-02 | Individual MTG card pages actively claim "prices updated daily... sourced from Scryfall... updated daily" while the underlying data has not moved in a week. A live, currently-true false-freshness claim, not a hypothetical wording risk | Confirmed via a live card page ("Contract from Below"), template copy directly contradicted by C3L-01's evidence | Critical, same root cause as C3L-01, the customer-facing symptom, part of the same fix not a separate one |
| C3L-03 | Two downstream pg_cron jobs (`update-mtg-price-changes-daily`, `update-mtg-signals-daily`) report `status: succeeded` every day this week, while silently computing output from data that has not changed, because their input has been frozen since 07-28. A green cron status does not mean the output is meaningful | Direct query against `cron.job_run_details` for jobs 1, 11, 15, all show `succeeded` through 08-04 | High, the real-world version of protocol Section 13, success reported is not the same as the thing the business needs being true |
| C3L-04, resolved 2026-08-04 | `sync_events` has no record of the job that actually failed, it only logs `ids_sync_start`/`ids_sync_success` for MTG (a different, card-ID sync, which ran fine today). "Failed in 15 seconds" suggests an early-stage failure (auth, missing secret, connection, changed Scryfall endpoint) rather than a mid-sync data error, but this is inference, not confirmed | Direct query against `sync_events` filtered on `game ilike '%mtg%'`, only two event types present, neither for the failing job | High, needs Claude Code, GitHub Actions logs and the workflow file are not reachable from Claude.ai |
| C3L-05, resolved 2026-08-04 | `collection_waitlist` (raw emails: id, email, joined_at, source_card_id, source_card_name) had an `anon_read_collection_waitlist` policy with `qual: true`, any anonymous request could read every row. Every comparable table in the schema is anon-insert-only with no anon read policy, this was the one inconsistent with that pattern | Confirmed via `pg_policies`, table was empty (0 rows) at the time, nothing was actually exposed. Fixed via `apply_migration`, dropping the policy, insert confirmed still working after | Was critical, now resolved |
| C3L-06, **RESOLVED 2026-08-05 by live two-account test, piece 1 of task `c3-audit-0rls-c3l43`. Protocol Section 4 is now closed, the question that has been open since the first session.** | **The live test that C3L-06 could never do has now run, and everything holds.** Two synthetic accounts were created, sessions established through the real `/account?token=` endpoint, and Account B created a real follow through `/api/card-follow`. Account A then attempted eight attacks against it through the same endpoints the app itself uses: read B's rows via its own dashboard, soft-delete B's follow (`action=stop`), hard-delete it (`action=remove`), read B's rows via `/api/my-follows` with A's own magic token, hard-delete B's follow via that token-authenticated path, the same with a bogus token, an unauthenticated delete, and a GET on `/api/unsubscribe-follow` with B's token. **All eight were rejected. B's follow row was verified intact in the database after every single one**, still owned by B, `unsubscribed_at` still NULL, never deleted. The bogus-token attempt returned 404. Separately, the anon-key PostgREST sweep was run against all 13 tables holding email, token, password or Stripe columns, and every one returned 0 rows. **That result is only meaningful for the 4 tables that actually contain data**, and it is: `accounts` (138 real rows including emails and password hashes), `follow_magic_links` (139 live tokens), `follows` and `email_log` all returned 0 to anon despite holding real data. The other 9 are empty, so their 0-row result proves nothing and rests on policy definition alone, 6 being INSERT-only and `retailer_placements` carrying a deliberate `active = true` anon SELECT | Live HTTP against `cardsoncardsoncards.com.au` for the object-level tests, direct `mtg_price_snapshots`-style verification queries after each attack, live PostgREST against the project URL with the legacy anon key for the table sweep, and row counts via service role to distinguish "blocked" from "empty" | Informational, positive, and now **evidenced rather than inferred**. All synthetic data was removed afterwards and the counts confirmed back to baseline exactly: accounts 138, follows 4, magic links 139, 0 leftovers. **FIRST REAL RUN OF THE RECURRING VERSION, 5 August 2026 06:44 UTC, run `30982378152`, `workflow_dispatch` on `64a0695`, conclusion PASSED in 32 seconds, 15 checks recorded and 0 failures.** This is the actual log output, not a status read. Part A swept 13 tables and every one was blocked: `accounts` (145 rows), `follow_magic_links` (146), `follows` (4) and `email_log` (3) returned nothing to the anon key despite holding real data, which is the meaningful half; the other 9 (`archetype_watchlist`, `card_price_alerts`, `collection_waitlist`, `deck_sessions`, `mtg_price_alerts`, `retailer_placements`, `seller_watchlist`, `subscriber_events`, `subscribers`) were blocked but are empty, so the run labelled each of them "proves nothing yet" rather than counting them as a pass. Part B: `B's follow row 13 survived all four attacks intact` and `A's dashboard does not disclose B's data`. Cleanup: `removed 2 synthetic account(s), none left behind`. **Nothing needs attention.** The only warnings in the run are the already-logged Node 20 deprecation (C3L-09) and a benign `punycode` notice from a dependency. **This also closes Task 07's recorded blind spot that the script had never been executed end to end.** Standing caveat, unchanged and by design: 9 of the 13 tables still prove nothing because they hold no data, and they only become real tests once they do. Original text follows. | No table in the public schema uses the `authenticated` role in any policy, `rowsecurity` is `true` on all roughly 140 tables checked. Account, follow, and follow-magic-link data has no `anon` policy at all beyond `service_role`, the browser cannot touch those tables directly under any circumstance | Confirmed via `pg_tables.rowsecurity` and `pg_policies` across the full schema | Informational, positive finding, but shifts real risk to Netlify function code, which this session could not read. Section 12's authentication-without-authorisation pattern still needs checking there specifically |

| C3L-07 | `downloadBulkFile()` called `bulkRes.json()` without ever checking `bulkRes.ok`, in direct breach of CLAUDE.md's own "ALWAYS check res.ok before calling res.json()" rule. This is why the failure presented as "Could not find default_cards bulk URL", a message that pointed at the wrong cause: any non-200 from Scryfall would have produced the identical misleading error, and the entry was in fact present the whole time, only its URL field had been renamed | Read directly from `scripts/sync-mtg-daily.mjs:105-112` at the failing commit, cross-checked against the live endpoint returning HTTP 200 with a healthy `default_cards` entry, which ruled out the message's literal claim | Was high, now resolved. Fixed in the same change as C3L-01. A wrong error message cost real diagnostic time across seven days of failures |
| C3L-08, resolved 2026-08-04 | `scripts/sync-mtg-daily.mjs` imports `stream-chain` directly, but `stream-chain` is not declared in `package.json`. It resolves today only because `stream-json` depends on it and `package-lock.json` pins it, so `npm ci` happens to install it. A `stream-json` major bump that drops or renames that dependency would break the MTG sync with no change to C3's own code | Confirmed via `package.json` dependencies (only `@supabase/supabase-js` and `stream-json`), `stream-json`'s own dependency on `stream-chain ^2.2.4`, and the lock file pinning it | Medium. Not fixed in this change deliberately, since regenerating the lock file mid-incident-fix widens the blast radius of a repair that needed to land cleanly. One-line fix, should be its own commit |
| C3L-09, resolved 2026-08-05 | Both sync workflows pin `node-version: '20'` and use `actions/checkout@v4` and `actions/setup-node@v4`. GitHub is deprecating Node 20 on runners and is already force-running these actions on Node 24, emitting a deprecation warning on every run. This is a scheduled future breakage of the same job that just failed for seven days, not a hypothetical | Read directly from the 4 August run log's own post-job warning, and from `.github/workflows/daily-mtg-sync.yml:31` and `daily-tcg-sync.yml` | Medium, but time-boxed by GitHub's own removal date, not by C3's priorities. Applies to `daily-tcg-sync.yml` too, so it is not MTG-specific |
| C3L-10 | Nothing anywhere alerts on sync failure. Seven consecutive daily failures produced no page, no dashboard state, and no `sync_events` row, and were noticed only because a GitHub Actions failure email happened to be read. The two downstream pg_cron jobs meanwhile reported `succeeded` daily on frozen input (C3L-03), so every automated signal available said the system was healthy while the highest-revenue game served week-old prices | Confirmed by the seven-day failure run history against C3L-03's `succeeded` cron records and C3L-04's absence of any `sync_events` row for the failing job | High. This is the finding that made a one-line upstream change cost a week. The freshness assertion suggested under C3L-03 belongs here, a sync that writes zero new snapshots should exit non-zero |

| C3L-11 | The seven-day outage left a permanent, unbackfillable six-day hole in `mtg_price_snapshots`: 29 July to 3 August 2026 inclusive have zero rows, while 28 July has 52,445 and 4 August has 52,623. Scryfall's bulk data is point-in-time and carries no history, so those six days cannot be recovered from the source. This is the durable cost of the outage and it does not go away now that the sync works | Direct query, `generate_series` over 25 July to 4 August left-joined against `mtg_price_snapshots`, six days returning 0 | High, and permanently unfixable rather than merely open. Matters because it is the input to every derived signal, see C3L-12. Should be recorded as a known history gap wherever price history is presented or exported |
| C3L-12, resolved 2026-08-04, live in the database, see the resolution note below | `update_mtg_price_changes()` takes `MAX(snapshot_date) <= CURRENT_DATE - 7` (and `- 30`), meaning it silently falls back to the nearest older snapshot rather than requiring an actual seven-day-old one. Because of C3L-11's gap it will therefore publish windows of 8, 9, 10, 11, 12 and 13 days as `price_change_7d` on 5 to 10 August, self-healing on 11 August, and windows of 31 to 36 days as `price_change_30d` from 28 August to 2 September, self-healing on 3 September. The same defect already produced a wrong number during the outage: on 3 August it compared 28 July against 27 July, publishing a one-day movement as a seven-day change. The value is never NULL and never flagged, so a card page shows a confident "7 day change" that is not one | Confirmed by reading `pg_get_functiondef` for the live function, then by a date-arithmetic simulation over the real snapshot dates plus projected daily snapshots, run for both the 7d and 30d windows. Two structurally different methods, the function body and the data | High, and time-critical rather than merely open. The next `update-mtg-price-changes-daily` run (20:00 UTC daily) is correct tonight, 4 August, because 28 July happens to be exactly seven days back. It first publishes a mislabelled window at 20:00 UTC on 5 August. Not fixed this session: the remedy is a product decision about whether an unavailable window should show NULL, or a widened window with a visible low-confidence flag, which protocol Section 5 point 5 already calls for and which is Claude.ai's call, not Claude Code's |
| C3L-13 | Positive finding, object-level authorisation is genuinely present on the follow mutation path, not merely authentication. `deleteFollow()` and `unsubscribeFollow()` both filter on `id=eq.<followId>&user_id=eq.<userId>` together, so a caller supplying another user's follow id changes nothing. The `/account/admin` view, which renders every account email and every follow, is gated server-side by `!session || !isAdmin(session.email)` returning a plain 404, with the email taken from the HMAC-signed session cookie rather than from client input | Read directly from `netlify/functions/shared/accounts-core.mjs:330-349` and `netlify/functions/account.mjs:789-797`, then confirmed live: `/account/admin` and `/account/admin/` both return 404 unauthenticated, `/account` returns the 200 sign-in page as designed | Informational, positive. This is the specific authentication-without-authorisation pattern protocol Section 12 names, checked and not found on this path. It does not close protocol Section 4, whose two-account live test still has not run, see Section 10 |
| C3L-14 | Positive finding, no Supabase key of any kind reaches the browser. Eleven live pages (`/`, `/cards`, `/compare`, `/market`, `/search`, `/account`, `/tools`, `/subscribe`, `/pricing`, `/shop`, `/calendar`) contain zero JWT-shaped strings and zero references to a service, secret, or anon key variable, and link zero JavaScript asset files, because the site is server-rendered through Netlify functions. C3 therefore does not have the shipped-anon-key surface that protocol Section 4's cited vulnerability class assumes | Live fetch of all eleven pages, regex sweep for JWT-shaped strings and for key variable names, plus a follow-up sweep of every linked `.js` asset, of which there were none | Informational, positive, and it narrows real risk rather than removing it. With no anon key in the browser, the PostgREST-with-anon-key half of Section 4 is largely moot and the genuine exposure surface is the Netlify function code, exactly as C3L-06 concluded from the other direction |

| C3L-15, resolved 2026-08-05 | The MTG card page does not use `price_change_7d` at all. It computes its own "7d" badge from `snapshots.slice(-7)`, the last seven snapshot ROWS, with no reference to dates. Because of C3L-11's six-day hole those seven rows currently span 23 July to 4 August, so the badge on every MTG card page is presenting a **12 calendar day** movement as "7d". Unlike C3L-12 this is wrong right now, today, not from 5 August, and fixing C3L-12 does not touch it because it is a completely separate mechanism | Read from `netlify/functions/card-page.mjs:240-249` (`snapshots.slice(-7)`) and `:1392` (the query that fills `snapshots`), then confirmed by querying the seven most recent snapshot dates for the most-snapshotted card, which span 2026-07-23 to 2026-08-04, 12 days | High, and live now. Not fixed in this task: Task 01's Step 5 requires the diff to address exactly C3L-12 and nothing broader, and this is a different defect in a different file. It self-heals around 11 August as fresh dailies push the gap out of the last seven rows, but it is wrong every day until then. Needs its own task, and the fix is to select by date window rather than by row count |
| C3L-16, resolved 2026-08-05 | Same file, latent and separate: `card-page.mjs:1392` queries `mtg_price_snapshots?...&order=snapshot_date.asc&limit=90`, which returns the OLDEST 90 rows, not the newest. It is harmless today only because the most-snapshotted MTG card currently has 84 snapshots. Once any card exceeds 90, its price chart and its 7d badge silently freeze on the oldest 90 days and never advance again, while continuing to render as current | Confirmed by reading the query, then by `select max(cnt)` over per-card snapshot counts, which returns 84 against a limit of 90, growing by one per day | High, with a near-term trigger. At one snapshot per day from a current maximum of 84, the first cards cross 90 around 10 August 2026. Not fixed here for the same scope reason as C3L-15, and it should be fixed in the same task, since both live in the same function and both concern the same query result |
| C3L-17, resolved 2026-08-05, **assessment CORRECTED, see the shared note below** | `update_pokemon_price_changes()` does NOT share C3L-12's code shape. It uses four temp tables and a per-card `DISTINCT ON (card_id) ... WHERE snapshot_date <= day7_date ORDER BY card_id, snapshot_date DESC`, resolving a nearest-older snapshot per card rather than one global anchor date, and it also maintains `price_change_24h`, which MTG does not. It does however share the underlying defect: there is no tolerance check anywhere, so a card whose nearest snapshot is far from the target silently yields a mislabelled window | Full function body read via `pg_get_functiondef`, plus a structural comparison across all 8 functions confirming `has_any_tolerance_check` is false for every one | Medium, not currently wrong. Pokemon has 0 missing snapshot days in the last 31, so no window is mislabelled today. This is a latent defect that activates on that game's first sync outage |
| C3L-18, resolved 2026-08-05, **assessment CORRECTED, see the shared note below** | `update_yugioh_price_changes()`. Same per-card `DISTINCT ON` temp-table shape as C3L-17, same absent tolerance check, same `price_change_24h` handling. Structurally different from MTG, logically the same defect | Function body read individually via `pg_get_functiondef` | Medium, not currently wrong, 0 missing snapshot days in the last 31 |
| C3L-19, resolved 2026-08-05, **assessment CORRECTED, see the shared note below** | `update_lorcana_price_changes()`. Same per-card `DISTINCT ON` temp-table shape, no tolerance check. Differs slightly from the Pokemon and Yu-Gi-Oh variants in using `CREATE TEMP TABLE IF NOT EXISTS` plus `TRUNCATE` rather than a plain `CREATE TEMP TABLE`, and it sets no `statement_timeout`, but the window logic is identical | Function body read individually via `pg_get_functiondef` | Medium, not currently wrong, 0 missing snapshot days in the last 31 |
| C3L-20, resolved 2026-08-05, **assessment CORRECTED, see the shared note below** | `update_onepiece_price_changes()`. Same shape and same absent tolerance check as C3L-19, including the `IF NOT EXISTS` plus `TRUNCATE` variant | Function body read individually via `pg_get_functiondef` | Medium, not currently wrong, 0 missing snapshot days in the last 31 |
| C3L-21, resolved 2026-08-05, **assessment CORRECTED, see the shared note below** | `update_starwars_price_changes()`. Same per-card `DISTINCT ON` shape, no tolerance check. Separately worth noting: Star Wars Unlimited is the only Core game whose latest snapshot is 2026-08-03 rather than 2026-08-04, so it is one day behind at the time of checking. That is not necessarily a fault, its sync may simply not have run yet today, but it was not chased down in this task and is unconfirmed either way | Function body read individually via `pg_get_functiondef`, staleness from a per-game latest-snapshot query | Medium for the tolerance defect. The one-day lag is unconfirmed and should be checked rather than assumed benign |
| C3L-22, resolved 2026-08-05, **assessment CORRECTED, see the shared note below** | `update_riftbound_price_changes()`. Same per-card `DISTINCT ON` shape, no tolerance check | Function body read individually via `pg_get_functiondef` | Medium, not currently wrong, 0 missing snapshot days in the last 31 |
| C3L-23, resolved 2026-08-05, **assessment CORRECTED, see the shared note below** | `update_dragonball_price_changes()`. Same per-card `DISTINCT ON` shape, no tolerance check. Note this function is for `dragonball`, the EXTENDED game, not for `dbsfusionworld`, the Core one. There are 8 `update_<game>_price_changes` functions and 8 matching cron jobs, but the set they cover is the Core 8 with `dbsfusionworld` swapped out for `dragonball`. This is a fourth instance of the known Core/Extended Dragon Ball confusion already documented in CLAUDE.md, which lists three others | Function body read individually, plus `cron.job` showing `update-dragonball-price-changes-daily` exists and no `dbsfusionworld` job exists at all | Medium for the tolerance defect, and the Core/Extended mismatch is worth folding into whichever task closes CLAUDE.md's existing three-place inconsistency rather than fixing in isolation |
| C3L-24 | `dbsfusionworld`, the Core 8 Dragon Ball game, is the only Core game with no price-change function and no cron job. Its `price_change_24h/7d/30d` values are not computed from C3's own snapshots at all, they are written straight through from the upstream tcgapi.dev response by `sync-dbsfusionworld-background.mjs`. So it is neither affected by C3L-12 nor verifiable against C3's own snapshot history, and the window those upstream percentages actually represent is unknown and undocumented | Confirmed by the absence of any `update_dbsfusionworld_price_changes` function, zero matching `cron.job` rows, and by reading `sync-dbsfusionworld-background.mjs:293-313` where the values are assigned from `price.price_change_*` | Medium, informational rather than broken. Logged because an earlier hypothesis in this same session, that these values were simply stale, was wrong: they have different provenance, not no provenance. Worth confirming what window the upstream figure represents before any page presents it beside a C3-computed one |
| C3L-25, resolved 2026-08-05, but see C3L-35 | `update_price_stats()` is a third window mechanism, different again from C3L-12 and C3L-15. It averages over a date RANGE (`snapshot_date >= CURRENT_DATE - INTERVAL '7 days'`) rather than anchoring on a single snapshot, so C3L-11's hole makes `price_7d_avg_aud` and `price_30d_avg_aud` averages over fewer samples rather than wrong windows, and it writes only where `snapshot_date = CURRENT_DATE`, so it silently did nothing at all for the whole outage. It has no minimum-sample guard, which is exactly protocol Section 5 point 5 | Function body read via `pg_get_functiondef` | Medium. A materially smaller error than C3L-12, logged separately rather than folded in because it is a different failure mode and a different fix |

**Resolution evidence for C3L-01 to C3L-04, 4 August 2026.** Root cause, read
from the real Actions log rather than inferred: Scryfall removed
`download_uri` from every entry in its `/bulk-data` index and replaced it with
`jsonl_download_uri`, simultaneously changing the payload from a plain JSON
array to gzip-compressed JSONL. The `default_cards` entry itself never
disappeared, only its URL field changed name, which is why the script's own
error message was actively misleading (C3L-07). Confirmed by three
structurally different checks, per Part 0 and Section 13: the failing CI log,
a live fetch of the index showing all seven entries carrying
`jsonl_download_uri` and none carrying `download_uri`, and a live fetch of the
file itself returning `content-type: application/gzip` with gzip magic bytes
`1f8b` and no `content-encoding` header, which proves `fetch` does not
transparently decompress it and the sync must gunzip explicitly. The 15-second
failure time in C3L-04 is now explained: the job died roughly 4 seconds in, at
the index parse, having already succeeded at both the FX-rate fetch and the
Card Kingdom pricelist load. It was never a credential, secret, or auth
problem, and no workflow file had been edited. Fix verified before push by
running the exact new parse pipeline against the real 77MB file: 739 distinct
sets, 97,074 cards with images and 83,115 with USD prices parsed cleanly into
the same record shape the sync consumes. Rollback is a plain `git revert` of
the fix commit, no migration and no schema change was involved.

| C3L-26, resolved 2026-08-05, **mechanism built, secret added, and RUN FOR REAL on 5 August: run `31003249490` PASSED with all three of latest deploy, published deploy and `origin/main` agreeing on `8315b81`. The earlier scheduled run `31001947783` FAILED fail-closed on the missing secret, so both paths are now observed rather than reasoned about** | The Netlify production deploy for commit `2d0404b`, the MTG sync fix pushed earlier the same day, FAILED, and nothing surfaced it. Netlify records it as `state: error`, "Failed during stage 'building site': Build script returned non-zero exit code: 2", with `deploy_time: null`, so it never completed. The site was never actually broken, because the previous deploy stayed published and the next commit 19 minutes later built cleanly, but for those 19 minutes `origin/main` and the live site were different code and nothing said so. Had that been the last commit of the day, the site would have served the older build indefinitely while git reported main as current | Netlify API `listSiteDeploys` and `getDeploy` for deploy `6a71c22e930fbd0008930a79`. The build log itself is not exposed through the API (`log_access_attributes` is empty), so the specific failing step is NOT established. The build script is `node scripts/generate-sitemap-cards.mjs && eleventy && node scripts/generate-blog-sitemap.js`, and the first step queries Supabase while the 85,000-row MTG sync was running concurrently, which is a plausible but unconfirmed cause. Read the Netlify UI build log to settle it | High. This is the same class as C3L-10, a failure that only a human happening to look would catch, and it was found only because this task verified the deploy record rather than assuming a push means a deploy. Two things to fix: notification on failed deploy, and a check that the published `commit_ref` matches `origin/main`. Do not treat the transient-contention theory as established, it is a hypothesis |

| C3L-27, resolved 2026-08-05 | The real fix for C3L-15 is architectural, not another tolerance patch. The card page should read the already-corrected stored value instead of independently recomputing from `snapshots.slice(-7)`. Two mechanisms computing "the same" statistic is what let them diverge in the first place, and will do so again the next time either one changes without the other. **Corrected on merge:** this entry as written in the Downloads copy names a table `mtg_price_changes`. No such table exists. Task 01's fix writes `price_change_7d` and `price_change_30d` as COLUMNS on `mtg_cards`, which is what the card page now reads | Roundtable D (data provenance persona), run against C3L-15. Table-name error confirmed against `information_schema.tables`, which returns `mtg_cards` and `mtg_price_snapshots` and no `mtg_price_changes` | High. Resolved: the page reads `card.price_change_7d`. The audit also found a THIRD copy of the same statistic, the prose "trending up / dipped / stable" sentence, which had the identical `slice(-7)` flaw and could contradict the badge directly above it. Both now derive from the one source |
| C3L-28, resolved 2026-08-05 | Confirmed, and worse than the question assumed. The chart did not merely interpolate across the 29 July to 3 August gap, it positioned points by ARRAY INDEX rather than by date, so six missing days rendered as an ordinary one-day step. A gap was not just unmarked, it was visually indistinguishable from continuous daily collection | Read from `buildPriceChart` in `card-page.mjs`, where `toX(i)` was `pad.l + (i / (n - 1)) * chartW`, index based with no reference to `snapshot_date` | Medium. Resolved: x is now positioned by date, and the line breaks rather than drawing through any gap longer than `CHART_GAP_BREAK_DAYS` (2 days, matching C3L-12's 1 day tolerance, so a single missed sync is bridged and a real outage is not). Verified numerically: on uniform daily history the new mapping is identical to the old one to 1e-9, so ordinary charts are unchanged, and across the real gap the space is now 7 times a one-day step rather than 1 |
| C3L-29, resolved 2026-08-05 | Partly confirmed, and the premise needs correcting. The figure was NOT purely visual: the markup rendered "▲ 12.3% 7d" as real text, so the number itself was already available to assistive technology. What was missing is that DIRECTION rode entirely on a bare `▲`/`▼` glyph plus colour, which a screen reader announces inconsistently or as a shape name, and "7d" is not self-describing | Read directly from the price-row markup in `card-page.mjs` | Medium. Resolved by adding `role="img"` with an explicit `aria-label` ("Up 12.3 per cent over the last 7 days") and marking the glyph text `aria-hidden`, so the announced string states direction, magnitude and period in words. Verified as correct markup by reading, NOT by testing with an actual screen reader |
| C3L-30, resolved 2026-08-05 | Answered definitively rather than left as a question. C3L-16's `order=snapshot_date.asc&limit=90` returns the OLDEST 90 rows by date. Nothing in the system ever deletes a snapshot, so the oldest 90 are a FIXED SET forever. The window therefore freezes permanently on the card's first 90 days and does not subtly shift, which was the alternative the finding raised. A card crossing the threshold would have shown 4 May to roughly 1 August 2026 for the rest of the site's life while rendering as current | Confirmed by the query semantics plus a check that no `cron.job` command contains a delete of any kind, so no pruning exists that could advance the oldest-90 set | Medium. Resolved as a question, and the underlying defect is fixed under C3L-16. The permanence is what made it worth fixing before 10 August rather than after |
| C3L-31, resolved 2026-08-05 | No runbook exists for support to distinguish a known, dated, self-healing data issue from a genuinely new bug, if a customer asks why a figure looks wrong | Roundtable D (support persona) | Low, process gap. Resolved: a plain-language support note now sits at the top of `card-page.mjs`, next to the logic it describes, stating that a missing recent-change badge shortly after a sync outage is correct behaviour, that it heals in roughly 7 or 30 days from the last gap day, and that a confident badge disagreeing with the chart is the case actually worth investigating |
| C3L-32 | The register regressed when regenerated outside the repo. The Downloads copy dated 5 August is 40,363 bytes against the repo's 57,725, and is missing Task 01 evidence that the repo copy holds: the regression checksum `bb5282275ec2d072893d06c677929878`, the migration name `c3l12_price_window_tolerance`, the `TOLERANCE_DAYS` reasoning, and the 52,623 snapshot figure. Its sibling rows also jump C3L-17 straight to C3L-23, dropping the five per-function rows Task 01 was explicitly asked to log one at a time. It is a condensed regeneration presented as the newer file, which is precisely what Section 0 forbids | Byte-for-byte comparison of the two copies, plus targeted greps for each piece of Task 01 evidence, plus an ID enumeration of both | High, process. Not a data loss in the end, because the repo copy was treated as canonical and the new C3L-27 to C3L-31 rows were merged INTO it rather than the Downloads copy being allowed to overwrite it. Had this task simply copied the newer-looking file over the repo, Task 01's evidence would have been destroyed. Worth a standing rule: the Downloads copy is only ever merged from, never copied over |
| C3L-33 | Switching the badge to the stored column changes the basis of the number. `update_mtg_price_changes` computes from `price_usd`, whereas the removed local version computed from `price_aud`, so the percentage shown beside an AUD price is now a USD-denominated movement. Across a 3,000 card sample the two bases differ by 0.26 percentage points on average, but by up to 16.7 on very cheap cards where rounding AUD to two decimals dominates the arithmetic | Direct comparison of both computations over the 28 July to 4 August pair, 3,000 cards sampled | Medium. Accepted deliberately as the cost of having one mechanism instead of three, and recorded here rather than left as a silent side effect. The cleaner end state is for the stored column to be computed in AUD, since AUD is what the page displays, which would need `update_mtg_price_changes` changed rather than the page |
| C3L-34, **substantially corrected 2026-08-05, downgraded from High to Medium**, investigated in full, no fix shipped | **The original text of this finding, retained below per the never-delete rule, was wrong in its central claim and is corrected here.** It said the card page "is presenting a 92 day extreme as a 52 week one". It is not. The card page labels these figures "Recent High" and "Recent Low" and the verdict reads "Near recent high", "Near recent low" or "Mid-range price". "Recent" is accurate for an 84 day window, and nothing on the card page, `/market`, or the weekly email claims 52 weeks. The "52w" naming survives only in column names, internal variables and comments, and that was a deliberate documented decision, recorded independently in two places (`market-data.mjs:223-224`, "The columns are named 52w because the schema predates that. Copy says recent", and `sync-mtg-daily.mjs:416`). The real exposure is a single sentence of marketing copy at `src/cards.html:708`, "See 52-week highs, lows, and trend direction", which is the only user-visible 52 week claim on the site and contradicts the convention every other surface follows. Two further corrections: a true 365 day filter changes **no value today**, 0 of 5,000 cards differ on either high or low, because all history is younger than 52 weeks, so this is a naming problem now and only becomes a value problem on **4 May 2027**; and the span is 92 calendar days but only **84 days actually collected**. ORIGINAL TEXT FOLLOWS: The card page's "52 week high/low" and its buy and sell verdicts are not 52 week figures. `compute_mtg_signals_batch`, which is the live path (cron job 15, `update_mtg_signals_batched`, writing `mtg_signals`, which the card page reads), takes `MIN(price_aud)` and `MAX(price_aud)` over a card's ENTIRE snapshot history with no date filter at all. Snapshot history currently spans 4 May to 4 August 2026, 92 days, so the page is presenting a 92 day extreme as a 52 week one today, and will present an all-time extreme as a 52 week one once history passes a year. The same numbers drive `buy_verdict` and `sell_verdict`, so a "good entry" call is made against a window that is not the one stated | Full function body read via `pg_get_functiondef`, confirming no `snapshot_date` filter in `card_stats`. History span and the 43,507 `mtg_signals` rows last computed 21:00 UTC 4 August confirmed by direct query | High, live, and the same class as C3L-15 and C3L-12 but on a statistic nobody had checked. NOT fixed here: it is outside Task 02's stated scope, and correcting it would move buy and sell verdicts across the whole catalogue, which is a visible product change needing its own task and its own before-and-after. It is now the most significant open mislabelled figure in this file |
| C3L-35, **resolved 2026-08-05 by REMOVAL, see the decision note below.** Previously re-confirmed still true by Task 03, which re-ran the checks rather than inheriting the status: 0 `cron.job` callers, 0 other database functions referencing it (`pg_get_functiondef` scanned across all `prokind='f'`), 0 repo callers, and 0 rows written to its target columns today. See also C3L-38, which is the OTHER writer of the same columns and fails on every run, so those columns have two writers and no working one | `update_price_stats()` is called by nothing. No `cron.job` command references it and no file in the repo references it. The minimum-sample guard added to it under C3L-25 is therefore correct but inert, and the columns it maintains (`price_7d_avg_aud`, `price_30d_avg_aud`, `price_52w_high_aud` on `mtg_price_snapshots`) are not the ones the card page reads, which come from `mtg_signals` instead | Confirmed by `cron.job` command search returning zero, and a repo-wide grep for `update_price_stats` returning no caller | Medium. This is a genuine removal candidate under the standing addendum: either wire it up or delete it, because a maintained function nobody calls invites a future reader to assume it is the live path, which is exactly the wrong turn this task nearly took. Its existence also masked C3L-34, since the orphan is correctly date-filtered to 365 days while the live path is not |
| C3L-38, **resolved 2026-08-05 by DELETION, and exec_sql deliberately NOT created, see the decision note below** | **Answering Task 05's question definitively: no, they are NOT the same bug. They are two different failures of the same function, at different times, with one root cause underneath both.** The 6 June 2026 run died with `TypeError: supabase.rpc(...).catch is not a function`, a JavaScript error in how the call was written, which crashed the whole sync with exit code 1 after the price data had already been written. That specific error was later fixed: the current code awaits the call and wraps it in try/catch, and its own comment describes exactly that history. What C3L-38 records is the failure that remains AFTER that fix, a server-side `PGRST202`, "Could not find the function public.exec_sql(query) in the schema cache", which is caught, logged as a warning, and allowed to pass. Confirmed directly: `exec_sql` does not exist in the database, 0 matching rows in `pg_proc`. So the underlying root cause is one thing, the RPC this function depends on has never existed, and the 2026 fix converted a hard crash into a silent warning without addressing it. **That is worth stating plainly: the fix made the symptom quieter, not the function correct**, which is why the sync now reports success while this step does nothing. Original text follows. | `updateSnapshotVerdicts()` in `scripts/sync-mtg-daily.mjs` is invoked unconditionally on every sync run (line 621) and fails on every run, because the `exec_sql` RPC it depends on does not exist in the schema. It logs a warning and the sync continues and reports success, so nothing surfaces it. Its own header comment claims it is dormant ("Left in place rather than deleted... If you revive it"), which is stale and actively misleading: it is called, it just never works | Read from the code at `sync-mtg-daily.mjs:417` and `:621`, then confirmed against the real 4 August Actions log, which contains "Verdict update via RPC failed: ... Could not find the function public.exec_sql(query) in the schema cache" followed by "Verdict update skipped". Consistent with `mtg_price_snapshots.price_52w_high_aud` being NULL on every row written today, and with `market-data.mjs:217-221`'s note that those columns were abandoned in June | Medium. Real impact is nil today, because nothing reads the columns it fails to write, but it is the C3L-10 family again: a step that runs daily, fails daily, and reports success. It is also a removal candidate alongside C3L-35, and its stale comment is exactly the kind of note that sends a future reader down the wrong path |
| C3L-39, resolved 2026-08-05, **piece 1 of 3 in task `c3-audit-c3l39-c3l41-c3l42`** | 532 MTG cards currently carry a buy or sell verdict derived from 14 days of price history or less, and 291 of those from 7 days or less. Card history length varies far more than any finding had recorded: across 83,162 priced cards the median is 33 days, the mean 41.7, the minimum 1 day and the maximum 84, and 39,263 cards (47 per cent) hold 7 days or fewer. "Recent high" therefore means 84 days of observation on one card page and a single day on another, with no indication which | Per-card `count(distinct snapshot_date)` over `mtg_price_snapshots` filtered to `price_aud > 0`, cross-joined against `mtg_signals` verdicts and bucketed by history length | High. The degenerate single-day case is already safe, since high equals low and the `high > low * 1.30` volatility gate rejects it, but a card with six noisy days passes that gate easily and is then given a trading signal. This is the same small-sample class as protocol Section 5 point 5 and C3L-25, applied to a verdict rather than an average |
| C3L-40, **cause confirmed 2026-08-05 by Task 04, "almost certainly a bad snapshot" replaced with measured rates, no fix shipped** | **The original guess was wrong about the population and right only about Ornithopter itself.** Classifying all 242 outliers disjointly: **189 (78.1 per cent) are genuine market data**, not errors. They are the three Marvel sets (`msh` 101, `msc` 77, `mar` 11), all released 2026-06-26, whose highs cluster in the 11 to 20 June preorder window and whose prices then collapsed post-release. That is ordinary new-set behaviour and the range is real. **8 (3.3 per cent) are ingestion-suspect**, all tracing to a single anomalous batch on 2026-06-06 (C3L-41). **45 (18.6 per cent) remain unclear** and could not be resolved either way. On the 7 cards fetched individually from Scryfall for confirmation, all 7 had a current price matching C3's stored latest exactly, so **current ingestion is accurate**; the disputed values are all historical. For Ornithopter specifically, three candidate mechanisms were tested and ruled out: not a decimal or FX shift (0.05 USD times 1.45 gives 0.07 AUD, internally consistent), not a wrong printing matched (Scryfall confirms the same `scryfall_id` is Summer Magic Ornithopter #270 and reports 500.00 USD, which matches C3's $715 AUD at 1.43 exactly), and not a foil mix-up (the card is nonfoil-only with a null foil price). What remains is that its $0.05 row sits inside the 6 June batch. **It cannot be proven what Scryfall reported on 6 June**, because Scryfall publishes no price history and C3 archives no raw source file, so this is confirmed as far as the available evidence allows and no further | Disjoint classification query over all 242 with set codes and high/low dates; per-card shape analysis (54 single-day, 53 two-to-three-day, 135 sustained four-day-plus lows); live Scryfall API fetch for 7 sampled cards; full snapshot history for Ornithopter | High for the 8 plus whatever fraction of the 45 turns out real, **but materially smaller than the original 242 implied**. A cleanup would need to correct or exclude only the 6 June batch rows, not the Marvel cards, and doing the latter would delete genuine price history. Recorded as information for the fix task, nothing changed here |
| C3L-41, resolved 2026-08-05 for the 8 affected rows, **piece 2 of 3**, the 6 June event itself remains unexplained | **A single anomalous ingestion event on 2026-06-06, systemic in shape but bounded, and never repeated.** That date holds 90,785 snapshot rows against roughly 51,236 on every adjacent day. The excess is exactly 39,515 rows which all carry a NULL `aud_usd_rate` where every normal row carries one, average 0.209 USD against 10.152 for that day's normal rows, and 6,442 of them under ten cents against about 597 on a normal day. There are no duplicate `scryfall_id` values, so this is not a double-insert of the daily set, it is 39,515 additional cards. 37,872 of them (95.8 per cent) have no snapshot on any other date, which is why the display impact is small: a card with a single snapshot never reaches `mtg_signals`. The blast radius is the roughly 1,643 cards that also appear normally, of which 8 became C3L-40 outliers. **The writer could not be identified.** Every NULL-`aud_usd_rate` row in the entire table is on this one date, no other date has any; the sync script version in effect that day (`2b93d98`) did write `aud_usd_rate`, so it was not that; and no other current code path writes this table | `count(*)` and `count(aud_usd_rate)` per `snapshot_date` across May to July; distinct-card and duplicate checks on 6 June; a full-table check confirming 2026-06-06 is the only date with any NULL FX rows; repo-wide search for writers of `mtg_price_snapshots`; `git show` of the sync script version in effect on the date | Medium. Bounded and historical rather than ongoing, and it has not recurred in two months, but it is unexplained, and an unexplained write of 39,515 rows into a production price table is worth knowing the cause of before deciding whether a cleanup is safe. Separately, the scheduled MTG sync FAILED on 4, 5, 6, 7 and 8 June while snapshots still appeared for those dates, because the crash (`TypeError: supabase.rpc(...).catch is not a function`, the exact bug `updateSnapshotVerdicts`'s own comment describes) happens after the data is written. So a failed run is not the same as a missing day, which is worth remembering when reading the run history |
| C3L-42, resolved 2026-08-05 for `mtg_price_snapshots`, **piece 3 of 3**, the other 7 Core games confirmed still lacking it | `mtg_price_snapshots` has no ingestion timestamp, no source column and no batch or run identifier. Its only temporal column is `snapshot_date`, which is the date the price is *about*, not when or by what the row was written. This is the specific reason C3L-41's writer could not be identified: there is no way to distinguish a row written by the nightly sync from one written by a manual script, a backfill, or a one-off, even when their values differ wildly. The same shape applies to the other 31 games' snapshot tables | Column listing for `mtg_price_snapshots` via `information_schema.columns`, 19 columns, none of them a write timestamp or provenance marker | Medium. Not wrong today, but it converts any future data-origin question into guesswork, which is exactly what happened here. Protocol Section 16.1's "are we storing what will matter later" check applies directly: a `written_at` and a source or batch marker cost almost nothing at insert time and cannot be reconstructed afterwards |
| C3L-40-original | 242 cards have a displayed high/low range exceeding 10x, and 117 of those carry a buy or sell verdict computed from it. The worst, Ornithopter (`sum`), shows a "Recent Low" of **$0.07** against a current price of $715, a range of 1,035,614 per cent, and is labelled "Near recent high" on that basis. The $0.07 is not a plausible historical low, it is almost certainly a bad snapshot, and it is simultaneously a visibly wrong displayed number and the input to a trading signal | Ratio of `price_52w_high_aud` to `price_52w_low_aud` across all 43,507 `mtg_signals` rows, with the verdict columns joined. 10 cards exceed 100x, 1 exceeds 1000x | High. Narrow in count but this is the most visibly wrong number found on the site so far, and unlike C3L-34 it is a genuine value error rather than a labelling one. Neither candidate approach in the C3L-34 investigation addresses it, which is why the investigation records a third option |
| C3L-36, resolved 2026-08-05, **and its own file count was wrong, 23 not 28** | C3L-16 was recorded as an MTG card page issue. It is not. The identical unbounded `order=snapshot_date.asc&limit=90` appears in roughly 28 card page files, one per game, so every game's chart carries the same permanent-freeze defect on the same timetable. No game has crossed 90 yet, MTG is closest at 84 snapshots and Pokemon next at 81, so the fleet crosses over the following weeks rather than all at once. Notably `pokemon-card-page.mjs` ALREADY uses the correct shape, a `snapshot_date=gte.` date cutoff, so the right pattern was present in the codebase the whole time and simply had not been applied consistently | Repo-wide grep for `snapshot_date.asc`, plus a per-game max-snapshots-per-card query across 12 games confirming none exceeds 90 today | High. Only the MTG file is fixed here, because Task 02 is scoped to the MTG card page and its Step 8 requires the diff to be no broader than stated. The remaining files are the same one-line change and should be swept in a single follow-up before the earliest of them crosses 90 |

| C3L-37, resolved 2026-08-05 | Found while rewriting the chart path builder for C3L-28, not looked for. The old builder emitted a `moveto` only at array index 0 (`i === 0 ? 'M' : 'L'`) and dropped empty entries afterwards, so any series whose FIRST point had no price produced a path beginning with `L`. An SVG path that does not begin with a moveto is invalid and renders nothing at all. This hit the foil line specifically, since a card commonly has no foil price on the earliest snapshot in the window and gains one later: those cards silently showed no foil line while the legend still advertised one | Reproduced in isolation: input `[0,0,5,6,7]` produced `L20,95 L30,94 L40,93` under the old builder, with no leading moveto, against `M20,95 L30,94 L40,93` under the new one. Incidence measured directly, 43 of 2,000 sampled cards (about 2.2 per cent, so roughly 900 across the charted catalogue) have a missing first-point foil price and a later real one | Medium. Resolved as a side effect of C3L-28's fix, because the new builder always opens a subpath with a moveto. Recorded rather than absorbed silently, since it was a real user-visible defect that no finding had identified and no test would have caught |

| C3L-45, resolved 2026-08-05, **piece 2 of task `c3-audit-c3l44-c3l45-recurring-rls`** | `update_mtg_signals_batched` exits its batch loop the moment a batch returns 0 processed rows, and a genuine early truncation is indistinguishable from a normal finish because both simply return a count. **Note on provenance: this was raised as a fragility line in Task 05's six-line report and never had a register row of its own; Task 07's file referenced C3L-45 as though it existed. This row is that entry, created now.** The question the fix had to answer first is whether an empty batch is normal or abnormal, and the answer is **normal**: `compute_mtg_signals_batch` pages by OFFSET, so an empty window is exactly how end-of-data is signalled and exiting on it must stay. The abnormal case is real but not currently reachable, a 500-wide window entirely made of filtered rows would also return 0 and silently skip everything after it; measured, 10,995 of 52,623 cards on the newest date have a NULL `price_aud` (20.9 per cent) but `card_batch` orders by `scryfall_id`, a UUID, so they are scattered rather than clustered and 500 consecutive is negligible | Function body read directly before deciding, per the task's instruction not to assume; NULL-price distribution measured against the live catalogue | Medium. Resolved by making the two outcomes distinguishable rather than by changing when the loop stops: the run now counts how many cards it should cover before starting, compares afterwards, and on a short run raises a WARNING and returns "TRUNCATED" instead of a clean count. Verified live, the run reports `41636 cards processed in 107 batches, expected 41628, complete`, the 8-card overshoot being the excluded-from-signals rows that still upsert from other dates |
| C3L-44, resolved 2026-08-05, **piece 1 of task `c3-audit-c3l44-c3l45-recurring-rls`** | **Account enumeration through the signup endpoint.** `POST /account` with `action=signup` returns a materially different response depending on whether the email is already registered: a fresh address returns "Almost there / We have sent a confirmation link" while a registered one returns "That email already has an account. Log in, or reset your password." Both are HTTP 200, but the body differs (25,341 bytes against 30,721) and so does the timing (1,930 ms against 716 ms, because the fresh path sends an email and the existing path returns before it). Either signal is enough to test an address list against the site and learn who has an account. What makes this worth logging rather than shrugging at is the inconsistency: `handleForgot` right next to it is **deliberately** anti-enumeration, with an explicit comment saying so and an identical response either way, so the property was clearly understood and simply not carried across to signup | Measured live against the production endpoint during the piece 1 test, using a synthetic address for the fresh case and that same address once registered for the existing case, so no real user's address was submitted and only one email was sent | Medium. It is information disclosure, not an authorisation gap, and the authorisation test it was found alongside passed cleanly, which is why it did not stop that piece. Not fixed here: making signup generic is a real UX tradeoff (the user must somehow learn their address is taken) and the usual resolution, sending "you already have an account" to the address instead of showing it on screen, is a product decision. Note C3-101/102 in Section 4 covers this ground and can now be marked confirmed on the signup path and refuted on the reset path |
| C3L-43, **resolved 2026-08-05, piece 2 of task `c3-audit-0rls-c3l43`** | Found while measuring C3L-39's effect, not looked for. `mtg_signals` holds **1,871 rows that are never recomputed**, because `compute_mtg_signals_batch` only processes cards present on the latest snapshot date and nothing ever ages out or removes a row for a card that stops appearing. **798 of those stale rows still display a buy or sell verdict**, computed from data as old as 27 June, with `latest_date` values up to five weeks behind the rest of the site. A visitor sees a confident "Near recent low" with no indication it was last true a month ago | Measured directly after the C3L-39 recompute: 41,636 of 43,507 rows were processed, leaving 1,871 with a NULL `days_of_history`, of which 798 carry a verdict, `latest_date` ranging 2026-06-27 to 2026-07-28 | Medium. Partially mitigated already, not by design but as a side effect: C3L-39's display guard treats a NULL `days_of_history` as not-confident, so the MTG card page now shows "Not enough price history yet" for these rather than a stale verdict. `/market` and the weekly email read the columns directly and are NOT covered, so those two surfaces still surface all 798. The real fix is for the signal computation to expire or delete rows whose card has left the daily set, which is its own task |

| C3L-46, resolved 2026-08-05, **piece 1 of task `c3-audit-siblings-c3l36`, own commit** | `handleForgot` had the same unthrottled-send exposure C3L-44's fix closed on signup: it would mail a known address once per request, indefinitely, with nothing to stop a replay of the form being used to bury someone's inbox. Task 07 flagged it in its own suggestions as still open, and this closes it | Fixed by reusing `maySendLink`, the helper already live on signup, keyed the same way on the submitted address and never on whether an account exists. Deliberately the SAME counter rather than a second one: both endpoints mail the same address off the same magic-link infrastructure, so someone alternating between them should not get double the budget, and two throttles with separate state would drift apart | Medium, closed. Same in-memory caveat as the login limiter and the signup throttle: per serverless instance, not shared, so it blunts casual abuse rather than a determined distributed attempt |
| C3L-47, resolved 2026-08-05, **verified by measurement not by reading**, piece 1 of task `c3-audit-c3l47-infra` | **`handleForgot` is enumerable by TIMING, and the throttle in C3L-46 does not fix it.** Measured on the live endpoint before changing anything: a registered address returns in a 829ms median against 509ms for an unregistered one, with ranges that do not overlap at all (795 to 829 against 490 to 527), and byte-identical bodies at 25,302. The cause is structural, only the registered branch does any work, because only a registered address has an account to send a reset link to. Its own comment reads "Anti-enumeration: identical response whether or not the email is registered", which is true of the response and false of the time taken | Four paired samples per group against the production endpoint, using a synthetic account created directly for the purpose and removed afterwards, so no real user's address was submitted and no real user was mailed | Medium. **Not fixed, and deliberately not attempted inside a piece scoped as small.** The C3L-44 remedy does not transfer: signup could be made symmetric by sending mail in both branches, but there is no equivalent here, because you cannot send a reset link to an address that has no account. Closing this needs a different mechanism, most likely a deliberate constant-time floor on the handler, which is a decision about a security/latency tradeoff rather than a patch. Note the throttle does narrow it slightly as a side effect: once an address is throttled the registered branch stops sending and the timing converges, so the leak is strongest on the first few probes per address |

| C3L-48, **resolved 2026-08-05 for the SETS path, which was the actual outage. CORRECTED 5 August by task `c3-audit-c3l49-rootcause`: Task 10 also applied the same rule to the CARDS path, and that part was wrong and has been reverted.** The sets fix was verified against stored rows and stands. The cards path was changed on the assumption that what held for the sets held for the cards, which was never checked: `weissschwarz_cards` has 2 colliding pairs and lowest-id-wins reproduces only 1, so on the next successful run it would have taken the bare slug off id 962780 and moved a live card URL. Reverted to the original guard and folded into C3L-49's flagged five. **The lesson is the one this programme keeps relearning: the sets check was real evidence and the cards change was an extrapolation from it, in the same commit, presented as equally verified** | **weissschwarz had not written a price snapshot since 28 July, 8 days, and was failing every single night.** `sync_events` shows 25 starts, 24 errors and 1 success since 12 July, the same error each time: `Supabase upsert to weissschwarz_sets failed: {"code":"23505","details":"Key (slug)=(kaguya-sama-love-is-war) already exists."}`. Two real sets collide once the "?" is stripped: id 2700024 "Kaguya-Sama: Love is War?" and id 2700131 "Kaguya-sama: Love is War". The sync dies at the sets upsert and never reaches prices, so the whole game froze. The table holds only 3 snapshot dates ever (18 May, 6 June, 28 July). **This had already been "fixed" once**, by commit `0508754` "Unfreeze the weissschwarz and wow syncs", whose guard deduped in arrival order and whose comment asserted "allSets arrives in a stable API order, so the winner does not change between runs". That assumption is what was wrong: the table carries a UNIQUE index on `slug` alone while the upsert conflict target is `id`, so the moment the API returned the pair in the other order the run tried to move an already-taken bare slug onto a different id, and Postgres killed the batch. It worked for exactly one run and failed every night after | Root cause read from `sync_events` error text, confirmed against the live rows (both last written 2026-07-28, id 2700024 holding the bare slug). Fixed with `assignUniqueSlugs`, an order-independent rule where the LOWEST id keeps the bare slug. Verified by executing both functions over the two real ids in BOTH arrival orders: the new rule returns the identical map either way and it matches the live table exactly, so **no set or card URL changes**; the old guard flips and reproduces the 23505. Applied to the cards path too, which carries the same UNIQUE index and the same latent flaw | High, closed. The most serious thing found this task, and it was found by measuring actual staleness rather than by reading exit codes |
| C3L-49, **SUPERSEDED 2026-08-06 by task `c3-audit-c3l55-slug-seed`, which is the closing state, do not read the rest of this row as current.** The lowest-id-wins fix described below no longer exists in the codebase. It has been replaced everywhere by `assignStableSlugs`, which keeps whatever slug a record already owns and only invents an assignment for a genuinely new colliding pair. **That closes the 5 games this row left open (`unionarena`, `gundam`, `pokemon`, `yugioh`, `weissschwarz`) and repairs the residual defect C3L-55 found in the 26 it had already changed, in one rule rather than two.** The row is kept unedited below because the reasoning is still the record of how the answer was arrived at, and because the register's own rule is that superseded work stays visible rather than being rewritten. Original status follows. ~~**partly resolved 2026-08-05, task `c3-audit-c3l49-rootcause`. 26 games fixed on verified evidence, 5 deliberately NOT fixed because the fix would have moved live URLs.** The verification method was a single sweep over every table carrying a unique index on `slug`, matching each id-suffixed slug back to the row holding its bare form and comparing ids in each table's native type. Result: **186 real collisions already stored across 8 tables, and lowest-id-wins reproduces 173 of them but would flip 13.** The 13 are `unionarena_cards` 9, `gundam_cards` 1, `pokemon_cards` 1, `yugioh_cards` 1, `weissschwarz_cards` 1. Those five games keep the old arrival-order guard and their latent 23505 risk stays open, logged rather than traded for a live URL change. The other 26 are fixed and provably unchanged, because they either have no stored collision at all or their stored collisions match the rule exactly (`buddyfight_cards` 1, `digimon_cards` 1, `weissschwarz_sets` 1). **On the tiebreak question the honest answer is that lowest-id-wins is NOT demonstrably correct, it is merely verified non-destructive per game**, which is why it was not applied where it destroys.~~ `unionarena` shows what the real rule would have to encode: all 9 of its flips are rarity variants separated only by asterisks that slugify strips (`SR*`, `SR**`, `SR***`), and in every case the base rarity holds the bare slug and carries the higher id. **The genuinely correct fix for all 5 is to seed the assignment from the slugs already stored rather than to invent any rule**, which needs a read of existing slugs in each sync and is its own task | The same arrival-order slug guard that broke weissschwarz exists in **30 other sync functions**, on the cards path, unchanged. It is latent rather than firing: those games have not yet had two names collapse to one slug. It is not harmless, because the database makes it fatal wherever it does fire, **56 UNIQUE-on-slug indexes across the `_cards` and `_sets` tables** were measured directly, so any future colliding pair silently freezes that game the same way | Grep across `netlify/functions/sync-*-background.mjs` for the `slugsSeen` pattern (30 files beyond weissschwarz), plus a `pg_index` query enumerating every unique index whose definition covers `(slug)` | High as a class, deliberately NOT swept in this task and the reason is recorded rather than implied. A blind sweep is not safe here: lowest-id-wins matched weissschwarz's stored assignment, but if any other game currently has a collision resolved the other way, switching rules would **change live card URLs**. Doing it properly means checking each game's existing suffixed slugs against the rule before changing it, which is a task, not a step |
| C3L-50, **resolved 2026-08-05, angle 1 of task `c3-audit-5-datasync`** | **C3L-10 was never actually fixed.** The kickoff session logged "make a sync that writes zero snapshots exit non-zero" as a suggestion and it was never implemented, so the exact failure mode that hid the original 7 day MTG outage was still live on every one of the 4 script syncs. `sync-mtg-daily.mjs` exited non-zero only when a batch failed permanently, so a run that reached the end having written nothing still went green. `pokemon`, `lorcana` and `yugioh` were worse: they exit non-zero only when something throws, and pokemon and lorcana catch per-set errors and continue, so **every set could fail and the workflow would still report success** | Measured per job rather than extrapolated from MTG, per Section 13.1. Guards added to all four. The counter chosen matters and was checked in each file rather than assumed: pokemon and lorcana count only rows whose hash CHANGED, so 0 there is a legitimate quiet day, and the guard therefore uses cards SEEN (`upserted + unchanged`). MTG and yugioh build a snapshot row for every card independent of the change check (mtg at line 463, before the hash comparison), so 0 snapshots there is unambiguously broken and is guarded directly | High, closed for the 4 script syncs. Note the honest limit: the 31 background syncs already log an error to `sync_events` and return non-2xx, so they are not silently green in the same way, their problem is C3L-51, that nothing reads what they log |
| C3L-51, **RESOLVED 2026-08-06, task `c3-audit-c3l51-detection`, and verified by a real observed run rather than by a clean deploy.** `.github/workflows/sync-health-check.yml` plus `scripts/sync-health-check.mjs`, daily at 14:00 UTC, alerting through GitHub's own failure email, the channel already proven three times in this programme. **The signal choice was decided by measurement before anything was designed, and `sync_events` was rejected as the primary signal.** Checking it properly showed the earlier finding was masking a second problem exactly as the task suspected: it carries **39 distinct values of `game` for 32 games**, mixing upstream slugs with internal names, with six games present under both after upstream renames; `game` is NULL for the amazon job; three event_type vocabularies coexist (`sync_*`, `ids_sync_*`, `amazon_prices_sync_*`); and decisively, **yugioh logs `sync_start` three times a night and has never once logged a terminal event while its data is perfectly current**, so absence of an error there means nothing. **Signal A is therefore ground truth**, the newest `snapshot_date` in each game's own table, stale at 3 days (1 day is normal because the sync writes later in the UTC day than the check reads, 2 is one transient miss, 3 means it is not returning; weissschwarz reached 8). **Signal B covers Signal A's blind spot**, pairing each start against a later terminal event, needing no knowledge of the messy `game` key at all | **First real run, `31055550913`, FAILED correctly and its full output was read, not just its status: 31 games fresh, `weissschwarz 8d STALE`, and `yugioh::sync started 22.6h ago, no success or error since`.** Both are true. Fail-closed verified locally against genuinely absent credentials, exit 1 both with no variables and with only one set, the same way the RLS and deploy checks were each proven before being trusted. Game discovery verified at exactly 32, derived from the sync functions present in the repo rather than hardcoded, and cross-checked against CLAUDE.md's list with no drift either way, with a hard failure if it ever falls below 32 | Resolved. **The detection question this programme has been carrying since its first session is now closed for the syncs**, and it is closed with a mechanism that fails loudly rather than one that has to be remembered |
| C3L-57, **open, found 2026-08-06 while designing C3L-51's check** | **yugioh's background sync has never completed a single run.** It starts at 00:01, 00:17 and 00:34 every night, three invocations roughly 16 minutes apart, which is Netlify's 15 minute background-function ceiling plus overhead: it times out, is retried, times out, is retried, times out. It logs `sync_start` each time and has logged **no `sync_success` or `sync_error` at all** in the measured window. **The reason nobody noticed is that it looks healthy from the outside**: snapshots are written incrementally as it goes, so `yugioh_price_snapshots` is current every day and Signal A rates it `0d ok`. Whatever the function does after the point it dies has therefore never run | 30 `sync_start` rows in 10 days with zero terminal events, timestamps read directly and showing the three-per-night retry pattern; `yugioh_price_snapshots` confirmed at 0 days stale in the same run | Medium. **Not fixed here, and it is the reason Signal B exists**: a freshness-only check would have rated this game healthy forever. What is unknown is what comes after the timeout point and has consequently never executed, which needs the function read end to end against its own 15 minute budget. Note it compounds C3L-54: yugioh is also one of the games with two writers | **Nothing monitors any of this, and one job actively destroys the evidence.** The gap is not merely that alerting was absent for MTG before this programme, it is worse and it is current. 31 background syncs faithfully write `sync_start`, `sync_success` and `sync_error` rows to `sync_events`, and **nothing reads that table for alerting**. A grep for `resend`, `sendAlert`, `notify` or `alert` across the sync functions returns 0 files. The only consumer is pg_cron job 2, `sitemap-staleness-check`, running `0 */6 * * *`, whose entire body is `UPDATE sync_events SET webhook_fired = true WHERE webhook_fired = false AND triggered_at < NOW() - INTERVAL '30 minutes'`. **It marks notifications as fired without firing anything**, so the record that no alert went out is erased every six hours | Measured across the last 30 days: **14 distinct games logged sync errors and not one produced an alert**. weissschwarz alone failed 24 times over 8 days (C3L-48) with nobody notified. The only games with any real failure signal are the 4 that run in GitHub Actions, which emails on a red run, and that is exactly the accident that caught the original MTG outage | High. This is the direct answer to protocol Section 16.1 at the monitoring level: the data being stored is fine, the problem is that nothing consumes it. Not fixed here, it needs a decision about where an alert should go and a real destination, which is a design question rather than a patch |
| C3L-58, **RESOLVED 2026-08-06, task `c3-audit-6adversarial-stripe`, Critical, and the first Critical item this programme has touched** | **The Stripe webhook swallowed every downstream failure and answered Stripe 200 regardless.** `mlFetch` returns null on timeout and the caller ignored it; a non-2xx was logged and ignored; the handler's catch wrote to console and fell through to `{received:true}` 200. The real shape of that: **a customer pays, MailerLite is briefly unreachable, they are never added to the paid group, Stripe is told the event was handled so it never retries, and nobody finds out. They have paid and received nothing.** Compounding it, **`event.id` was never read anywhere, so there was no replay protection of any kind**, against a provider whose delivery guarantee is explicitly at-least-once | **Both proven by running the committed regression suite against the PRE-FIX handler, where it fails 6 times.** The decisive two: `DUPLICATE delivery does NOT re-grant access` failed with `mlAdd went 1 -> 2`, so a second delivery really did re-run the grant; and `MailerLite failure returns 500 so Stripe retries` failed with `got 200`, so a failed grant really did report success. Fixed handler passes 21 of 21, and both suites pass **in CI on the shipping commit**, run `31058297715`. Netlify deploy for `3151113` confirmed `ready` | Resolved. Failures now throw and the handler answers 5xx, which is how Stripe is asked to retry, with backoff for up to three days. Replay is guarded **insert-first against a primary key on `event_id`, not check-then-insert**, because only the constraint closes the race rather than narrowing it, which was the specific thing the task asked to verify. `completed_at` is written only after the work succeeds, so a delivery that died half way is reprocessed rather than skipped. Safe to retry precisely because both operations are idempotent: adding an existing subscriber returns 409 and is treated as success, removing an absent one is a no-op |
| C3L-59, **RESOLVED 2026-08-06, same task** | Signature verification was otherwise sound, and that is worth stating plainly rather than implying the whole thing was broken: **12 of 13 offline attack cases passed unchanged** on the original code, including unsigned, empty, garbage, wrong secret, tampered body, missing `t`, missing `v1`, a stale-but-correctly-signed replay, and it fails closed with no secret configured. **The one real defect: the `stripe-signature` header can legitimately carry MORE THAN ONE `v1` value**, which is exactly what Stripe sends during a webhook secret rotation. The parser wrote each key into an object, so the second `v1` overwrote the first and only the last was ever checked. A genuine Stripe event was therefore rejected whenever the valid signature was not last | Tested, not read: with two `v1` values the original passed when the correct one was last and **failed when it was first**. That single case is the entire delta between 12/13 and 13/13. Every candidate signature is now checked and any match accepted, which is what Stripe's own libraries do | Resolved. Availability rather than confidentiality: it could not let a forged event through, it could only reject a real one, and it would have done so at the least convenient moment, during a secret rotation |
| C3L-60, **informational, confirmed 2026-08-06, and it retires a Tier 1 assumption rather than fixing anything** | **The "checkout idempotency" item cannot apply, because there is no server-side checkout creation in this codebase at all.** Payment is a Stripe-hosted Payment Link (`buy.stripe.com/...`, linked from 10 static pages) with a hosted billing portal for cancellation. C3 never calls Stripe to create a charge or a subscription, so there is no API call to attach an idempotency key to, and no double-charge C3 could cause. The entire risk surface is the webhook, which is why this task's findings all live there. Secondary: **the Supabase `subscribers` table is empty, written by nothing and read by nothing.** Entitlement is MailerLite group membership only. `accounts-core.mjs` already documents this correctly; CLAUDE.md's line that paid tier is resolved from that table at send time is aspirational rather than current | `grep` for real Stripe API usage across the repo returns exactly one file, `stripe-webhook.mjs`. `STRIPE_SECRET_KEY` is used only to look a customer up by id. `subscribers` measured at 0 rows, 0 with a `stripe_customer_id`, and no `rest/v1/subscribers` reference anywhere in code | Informational. **Left alone deliberately**: nothing depends on the dormant table, and populating it would be building an entitlement system nobody asked for. Flagged so the next person does not read CLAUDE.md and assume the table is live |

| C3L-52, **partly resolved 2026-08-05, angle 2 of task `c3-audit-5-datasync`** | C3L-42 added `written_at` and `source` to `mtg_price_snapshots` and confirmed the other 7 Core games lacked them. The gap does not stop at those 7: measured against `information_schema`, **31 of the 32 `*_price_snapshots` tables had neither column**, only mtg had them. Without `written_at` there is no way to distinguish a row written today from one backfilled weeks later, which is the question C3L-40 and C3L-41 both had to answer by inference because the data could not answer it | Columns added to all 31 by a `DO` loop, recorded in `netlify/functions/migrations/c3l42-provenance-columns-all-games.sql`, verified after as **32 of 32 carrying `written_at`, `source` and the `now()` default**. Lock safety checked before running as the task required: bare `ADD COLUMN` is catalogue-only, and the volatile `now()` default is attached in a SEPARATE `ALTER` precisely so it does not force a full rewrite of a 309 MB (`yugioh`) or 1,578 MB (`mtg`) table under an ACCESS EXCLUSIVE lock. Existing rows keep `written_at` NULL, which is honest, their real write time is unknown and back-filling `now()` would fabricate provenance | Medium. **Half closed, and the open half is stated rather than glossed**: `written_at` now populates itself on every new row for all 32 games, but `source` is still WRITTEN by only one job, `sync-mtg-daily.mjs`. Attributing a row to a particular writer remains impossible for 31 games, and closing that needs a touch of every sync job |

| C3L-53, **INVESTIGATED 2026-08-06, task `c3-audit-c3l53-c3l54-investigation`, no fix shipped by instruction. The finding as originally written UNDERSTATES it by a wide margin: these are not three schema mismatches, they are three scripts written against a data model that no longer exists.** The error messages named one missing column each because PostgREST reports the first it hits. Measured field by field against `information_schema`: all three `_sets` tables share one canonical shape (`id, name, slug, abbreviation, release_date, card_count, game_slug, updated_at`) and **not one of the three scripts writes it**. pokemon sends `series`, `logo_uri`, `symbol_uri`, none of which exist, plus a text `id` into an integer column. lorcana sends `code` and `released_at` where the columns are `abbreviation` and `release_date`. **yugioh sends four columns that do not exist (`set_name`, `set_code`, `num_of_cards`, `tcg_date`) and omits the primary key entirely.** The cards side is worse: **7 nonexistent columns for pokemon, 16 for lorcana, 12 for yugioh**, plus text-into-integer on `id` and `set_id`. So no column rename fixes any of this. Original entry follows. ~~open and serious, found 2026-08-05 while checking C3L-49's race-condition question, task `c3-audit-c3l49-rootcause`~~ | **All three daily sync scripts in `daily-tcg-sync.yml` are completely dead and have been reporting success every morning.** Each fails at its FIRST step against a real schema mismatch: pokemon `Could not find the 'logo_uri' column of 'pokemon_sets'`, lorcana `Could not find the 'code' column of 'lorcana_sets'`, yugioh `Could not find the 'num_of_cards' column of 'yugioh_sets'`, all PGRST204 from PostgREST. They throw at `syncSets`, exit 1, and **`continue-on-error: true` on all three steps threw the exit code away**, so the workflow has reported `success` every day at least back to 31 July. The games still hold current data only because their separate BACKGROUND syncs work, which is what hid this. **Two corrections to my own recent work follow from it.** Task 10 credited these 4 script syncs with "a real failure signal, which is why the MTG outage was eventually noticed"; that is true of `daily-mtg-sync.yml` but flatly false of these three. And the C3L-50 zero-row guards Task 10 added to exactly these scripts were **inert on arrival**: they call `process.exit(1)`, which `continue-on-error` discarded, and in any case the scripts die before ever reaching them | Read from the real Actions log of run `30980768499` (5 August, 06:15 UTC), confirmed against the workflow file's three `continue-on-error: true` lines and against `information_schema`, where `pokemon_cards` has no `data_hash` column and integer `id` and `set_id` while the script writes a text `id` and selects `data_hash`. The run history shows `success` for 6 consecutive days | High. **Half closed here**: `continue-on-error` removed from all three steps, so the failures become visible and the C3L-50 guards can actually fire. The schema mismatches themselves are NOT fixed, that is a separate task per game. **Expect this workflow to go red on its next run, and that is the fix working, not a new breakage** |
| C3L-54, **INVESTIGATED 2026-08-06, same task, and the risk is NARROWER than recorded, though for an uncomfortable reason.** There is no live collision and there cannot be one: the script writer fails at its first step and never reaches the cards table, and even if the sets step were repaired it would still write a text `id` into an integer primary key, so every row would be rejected. **The two writers do not share an id space at all**: the script uses tcgdex-style text ids (`en-base1-4`), the background sync uses numeric tcgapi ids. **That also answers the task's question about C3L-55 directly: seed-from-stored-slugs would NOT resolve this.** It coordinates which record keeps a slug; it has nothing to say about two writers disagreeing on what a primary key is. Two id spaces writing one integer PK either collide or duplicate the same real card, whatever the slug rule says. The collision is therefore hypothetical, and only becomes real if someone rewrites the scripts to the canonical schema and leaves both writers running, which is precisely the option this investigation recommends against. Original entry follows. ~~open, found 2026-08-05, this is the answer to C3L-49's step 3 race-condition question~~ | Two runs of the SAME sync cannot overlap: the schedules are daily, staggered 15 to 45 minutes apart, and Netlify background functions cap at 15 minutes, so a job cannot still be running when its next scheduled firing arrives. **But a genuine concurrent-writer path does exist, and it is a different mechanism from C3L-49's arrival-order bug rather than the same one counted twice.** `sync-pokemon-background.mjs` is scheduled `0 4 * * *` and `daily-tcg-sync.yml` is cron `0 4 * * *`, the same minute, and both target `pokemon_cards`. They do not even agree on what a row looks like: the background writer uses numeric upstream ids and `slugify(clean_name, number, setAbbr)`, the script writer uses text ids shaped `lang-setid-localId` and `slugify(name, cardId)`. Determinism fixes ordering within one run; it does nothing about two writers disagreeing about the same table at the same instant | Schedules read from `sync-pokemon-background.mjs` and `.github/workflows/daily-tcg-sync.yml` directly; the two slug algorithms and the two id shapes read from the two scripts | Medium today, and only because C3L-53 means the script writer currently fails before writing anything, so the collision is masked. **Fixing C3L-53 without also resolving this will un-mask it.** The decision needed is which writer owns `pokemon_cards`, not a code patch, and the same question applies to lorcana and yugioh, whose two writers happen not to share a start minute |

| C3L-55, **RESOLVED 2026-08-06, task `c3-audit-c3l55-slug-seed`, and it closes C3L-49's remaining 5 games in the same change.** The fix is `netlify/functions/shared/slug-assign.mjs`, now imported by all 31 sync functions, replacing 31 inline copies of two different failed rules. **RULE 1, and this one is principled rather than merely non-destructive: whichever record already owns a slug in the database keeps it.** That is the invariant the constraint actually needs, not a heuristic that happens to fit the data. A live slug never moves to another record, so a working URL keeps working and the upsert can never try to relocate a taken slug, and it holds no matter what ids arrive later, which is precisely what lowest-id-wins could not promise. **RULE 2, the bootstrap tiebreak, is arbitrary and is labelled as arbitrary in the module itself**: when a colliding group has no stored owner at all, the lowest id wins. Nothing makes the lower id more canonical. It is defensible only because nothing is at stake at that moment, no URL is live to protect, and two runs must agree, and because the moment it is written RULE 1 freezes it permanently, so the arbitrary call is made once per group on a group with no history and is never revisited | **Verified against stored data, not assumed safe because it is more correct in principle.** The new rule was simulated over every table carrying a unique index on `slug`: **368 rows sit in real collision groups across 8 tables and the rule reproduces all 368 exactly, 0 mismatches**, including all 13 cases lowest-id-wins would have flipped. Then tested behaviourally against the real module with 11 cases built from real stored rows, `scripts/test-slug-assign.mjs`, **which passed in CI on the shipping commit, run `31052545622`, not only on this laptop**. Net effect on the codebase is 557 insertions against 845 deletions | Resolved. **One residual is recorded rather than quietly fixed**: 5 rows across `pokemon_cards` and `weissschwarz_cards` hold a suffixed slug whose colliding partner has since disappeared upstream, so on the next sync they become the only member of their group and take the bare slug, and their current URL will 404. **That behaviour is identical under the old logic, so it is pre-existing and not introduced by this change**, verified by simulation. Closing it would require fetching stored slugs for every row rather than only colliding ones, roughly a 30 to 50 per cent increase in request count on games with hundreds of sets, against a 15 minute function ceiling, to preserve 5 slugs. Logged as C3L-56 rather than traded for a timeout risk |
| C3L-56, **open, low, found 2026-08-06 during C3L-55's verification** | 5 rows carry a slug of the form `base-id` while no row holds `base`: 2 in `pokemon_cards` (World Championship Decks reprints) and 3 in `weissschwarz_cards` (Kaguya-sama singles). Their colliding partner has been removed upstream, so each is now alone under its base slug and the next successful sync will assign it the bare slug, moving a URL that currently resolves | Measured directly: suffixed rows with no bare-slug counterpart, across every table with a unique index on `slug`. Only these 2 tables have any | Low, and stated precisely so it is not mistaken for a regression: **this is pre-existing behaviour, unchanged by C3L-55**, since the old arrival-order and lowest-id rules both hand a lone record the bare slug. It is now measured and named rather than unknown. The fix is either a redirect for the 5 old URLs or extending slug preservation to non-colliding records, and the second is what makes it a task rather than a one-line change |
| ~~C3L-55~~, **superseded by the resolved entry above, original finding text retained** | ~~open, found 2026-08-05 by re-running Task 11's step 5 against Section 19's actual text once the protocol was synced** | **The C3L-49 fix is weaker than its own register entry claims, and the gap is the one Section 19 point 2 exists to catch.** `assignUniqueSlugs` gives the bare slug to the lowest id in a colliding group. That is stable only while the population is fixed. It assumes any future colliding row arrives with a HIGHER id, and **that assumption is false**: upstream ids are not monotonic with release date. Measured on onepiece, the set released 2026-09-18 holds card ids from 2153581 while sets released 2026-07-31 and 2026-08-22 hold ids from 2163005 and 2164207, so a newer product carries LOWER ids. When a future card lands with an id below the current bare-slug holder in its group, the rule hands it the bare slug, **changes a live URL, and can raise the same 23505 by moving an already-taken slug onto a different id**, which is the exact failure C3L-48 was fixed to stop | Not modelled, measured: `min(card id)` per set against `release_date` for the 6 most recent onepiece sets. onepiece is one of the 26 games the fix WAS applied to | Medium now, High whenever an upstream backfill lands. **This does not make the fix wrong, it makes it partial**: it removed run-to-run flapping over a fixed population, which was the live outage, and left growth unaddressed. It also confirms the shape of the original bug rather than escaping it, an ordering assumption about data the sync does not control. **The seed-from-stored-slugs approach already named as the correct fix for the 5 unfixed games is also the fix for this, and it closes both at once**, because a row that already owns a slug keeps it no matter what id arrives later~~ |

**Does closing C3L-51 also close C3L-53's underlying gap? Answered directly,
6 August 2026, because Task 14 asked and the honest answer is partly.**

*Yes for the detection half.* C3L-53 was three daily sync scripts dead for a
week behind `continue-on-error: true`. That flag is gone, so those three now go
red on their own, AND the new sync health check would independently catch the
consequence: if pokemon, lorcana or yugioh stopped writing, Signal A sees the
freshness fall behind within 3 days no matter what any workflow claims about
itself. The specific way C3L-53 hid, a green tick over a dead job, cannot
happen again in either of those two ways.

*No for the underlying defect.* **The three schema mismatches are still there
and unfixed**: `logo_uri` missing from `pokemon_sets`, `code` from
`lorcana_sets`, `num_of_cards` from `yugioh_sets`. Those scripts still fail at
their first step every day. They are now loud instead of silent, which is the
whole point, but loud and broken is not fixed. C3L-53 stays open on that basis
and should not be read as closed because detection improved around it.

*And one thing detection cannot fix at all.* Those three games only look
healthy because a SECOND writer, the background sync, keeps their data current.
That is C3L-54's dual-writer problem, and it is what made C3L-53 survivable
rather than an outage. Fixing the scripts without deciding which writer owns
those tables would light up the collision instead of the silence.


**C3L-53 and C3L-54, the per-table options and the recommendation, 6 August 2026,
task `c3-audit-c3l53-c3l54-investigation`. Investigation only, nothing shipped,
the decision comes back for confirmation first.**

*What each writer actually provides, measured per table rather than as one
answer, because the task was right that they differ.*

**The finding that decides all three: the background syncs already carry the
gameplay data the scripts were written to supply, in the canonical
`custom_attributes` jsonb column.** Sampled from live data, `yugioh_cards`
holds keys `atk, attribute, def, level, race, type`, which is exactly the set
the yugioh script builds as separate columns. `lorcana_cards` holds `cost, ink,
inkwell, lore, strength, willpower`, again exactly the lorcana script's set.
The scripts are not supplying anything unique in the fields that matter, they
are supplying the same data in a shape the database stopped using.

**pokemon.** Script adds `series`, `category`, `illustrator`, `description`,
and set logo and symbol URIs that no other writer supplies. Background sync has
dedicated columns for the gameplay data (`hp`, `stage`, `types`, `attacks`,
`weaknesses`, `retreat_cost`) but **0 of 31,833 rows are populated**, and
`custom_attributes` is empty too. Separately and worth its own attention:
**`pokemon_cards` has not had a single row updated since 29 July**, nine days,
while `pokemon_price_snapshots` is current, because that sync gates card writes
on sync progress and only snapshot writes run unconditionally.
**lorcana.** Script would uniquely add `card_text`, `flavor_text`, `move_cost`,
`version` and `type`. Everything else it carries is already in
`custom_attributes` (575 of 3,403 rows).
**yugioh.** Script would uniquely add `description` and `archetype`. Its
gameplay fields are already in `custom_attributes` (19,555 of 47,071 rows).

*The options, stated plainly per the task, before any recommendation.*

1. **Fix the schema mismatch and let both writers run, coordinated by C3L-55's
   pattern.** Rejected on evidence rather than taste: C3L-55 coordinates slugs,
   not primary keys, and these two writers do not agree on what an id is. This
   option would create the collision C3L-54 describes rather than manage it.
2. **Fix the scripts but narrow their role to only what the background sync
   does not cover.** Coherent, and the honest cost is that "what is not
   covered" is `description`, `archetype`, `card_text`, `flavor_text`,
   `illustrator` and `series`, none of which is in the database today and none
   of which any page currently renders. It means maintaining a second writer,
   a second API dependency and a second failure mode for fields nothing uses.
3. **Retire the script for that table, background sync becomes sole owner.**
4. **Something else**: repoint the scripts at the canonical schema. This is not
   a smaller version of option 1, it is a rewrite. For yugioh it is not even
   possible as written, because the canonical `_sets` primary key is an integer
   and the upstream YGOPRODeck feed has no numeric set id to supply.

*Recommendation, per table, and it is the same one three times for three
different reasons.*

- **pokemon: RETIRE (option 3).** The script cannot be repaired cheaply, it
  targets both a different data model and a different id space. **But retiring
  it must not be read as closing the pokemon gap**, because the background
  sync's own enrichment is not landing either, 0 rows of 31,833 with `hp`, and
  card rows nine days stale. Retiring the script removes a dead writer; it does
  not fix pokemon, and that needs its own investigation.
- **lorcana: RETIRE (option 3).** Its gameplay fields are already covered.
  What is genuinely lost is `card_text` and `flavor_text`, and the cheaper way
  to get those, if wanted, is to extend the background sync's
  `custom_attributes`, not to revive a second writer.
- **yugioh: RETIRE (option 3), and this one is not really a choice.** The sets
  write omits the primary key and the upstream feed has no value to supply for
  it, so option 4 is closed and options 1 and 2 both depend on it.

**Retiring all three means retiring `daily-tcg-sync.yml` itself, since those
three jobs are its entire content. `daily-mtg-sync.yml` is separate, healthy,
and must not be touched.** Doing so also closes C3L-54 outright rather than
coordinating around it, and removes the C3L-50 guards from three scripts that
would no longer exist, which is a simplification rather than a loss.

**What this does NOT resolve, stated so the recommendation is not oversold:**
pokemon's stale card metadata and empty enrichment columns are a separate
defect that retiring a dead script does nothing about, and it is the one thing
found here that is actively wrong on the site today.

**The detection half of C3L-49, re-run against Section 19's real text,
5 August 2026. Supersedes the version written before the protocol sync.**

*Task 11 executed step 5 against a guess at Section 19, because the repo's copy
did not have it. Re-run against the text now in `1f7aa10`, two of the three
mandatory points hold and one does not.*

**Point 1, root cause not pattern application: met.** Section 19 asks for both
readings to be stated plainly, that matching stored data proves the fix broke
nothing and does NOT prove the tiebreak is objectively correct. That is exactly
what C3L-49's entry says, and it is why 5 games were left alone.

**Point 2, the full four-roundtable scope review before writing the fix: NOT
met. Task 11 never ran it, and running it late found C3L-55 within minutes**,
a residual defect in the 26 games already shipped. That is the strongest
possible evidence for the requirement, and it is recorded as a failure to
follow the standard rather than smoothed over.

**Point 3, the detection question asked separately: met, and now sharper than
Task 11 stated it.** Task 11 wrote that the detection posture was "unchanged".
That was too blunt in one direction and too generous in the other:
- It improved for exactly 3 jobs. Removing `continue-on-error` restores a real
  Actions failure email for the pokemon, lorcana and yugioh SCRIPT syncs.
- It is untouched for all 31 BACKGROUND syncs. Verified by reading every
  workflow: the 5 that exist cover 4 script syncs, one deploy check and one RLS
  check, and **no workflow or script anywhere references `sync_events`**.
- **All 26 games fixed under C3L-49 are background syncs. Not one of them
  gained any detection whatsoever. The fix landed entirely inside the blind
  spot**, including weissschwarz, the reference case Section 19 is written
  around.

So the dependency, stated as point 3 requires rather than as a general caution:
**C3L-51 covers this exact gap and is open. A repeat of weissschwarz on any of
the 31 background syncs today would be found the same way the original was,
by a person happening to look.** C3L-53 already proved it inside this
programme: three syncs dead for a week, found by accident during an unrelated
step, not by anything watching.

*This task asked directly whether the fix closes the risk on its own. It does
not, and the register should not be read as if it does.*

What was actually closed is one specific bug in 26 of 31 places: a slug
assignment that could flip between runs. What is NOT closed is the reason it
went unnoticed for 8 days, and that half belongs to **C3L-51**, which remains
open. Nothing reads `sync_events`. The weissschwarz sync wrote a `sync_error`
row every night for 24 nights and no human saw one of them. **Determinism means
this particular collision will not recur in those 26 games. It does nothing
whatsoever about the next different failure**, which will be exactly as
invisible as this one was, for exactly as long.

C3L-53 is the proof of that, found in this task rather than by any monitor:
three sync scripts dead for at least a week, reporting success every morning.
It was not found because anything watched, it was found because the
race-condition question in step 3 happened to send me to an Actions log. That
is the same accident that caught the original MTG outage, which is the finding
this entire programme opened with.

**So the standing dependency, stated plainly: every slug-collision fix in this
register is a point fix. Until C3L-51 has a real consumer, the programme's
detection posture is unchanged, and the next silent failure will be found by
luck.** The five games left unfixed under C3L-49 make that worse, because they
keep a known live risk that nothing is watching.

**Resolution evidence for C3L-47, C3L-09, C3L-26, C3L-35 and C3L-38,
5 August 2026, task `c3-audit-c3l47-infra`. Two pieces, kept separate.**

*Piece 1, C3L-47, and it is verified by measurement rather than by reading,
which is the whole point given C3L-44 passed a code review while still
leaking.* The split was re-measured live before changing anything and still
held: registered a **799ms** median against **494ms** unregistered, ranges not
overlapping at all, 764 to 2,617 against 478 to 553. A single request told you
whether an address was registered.

C3L-44's remedy does not transfer, because there is no reset link to send to
an address with no account, so the gap is closed by **waiting on the fast
path** and nothing is cut from the slow path. The floor is **900ms**, taken
from the slow path's own measured distribution rather than guessed: its
typical cluster ran 764 to 859ms, so 900 sits just above it and both paths land
on the floor in the normal case instead of the fast path being padded to
somewhere in the middle of the slow path's spread. It is applied to the WHOLE
handler, not only the not-found branch, which is strictly stronger because it
also absorbs slow-path runs that come in under the floor.

**Measured after, on the live site, interleaving the two groups so drift could
not land on one of them: registered median 1,176ms against unregistered
1,180ms, a delta of 4ms, down from 305ms, with the ranges fully overlapping
(1,158 to 1,190 against 1,160 to 1,190).** One registered sample at 3,038ms is
network noise of the same kind seen before the fix at 2,617ms. Both cautions
the task named were checked: 900ms does not materially harm a user who was
already waiting about 800ms on this submit, and the floor is a fixed constant
rather than anything derived from load, so it cannot become a load-dependent
signal itself. No regression on the real flow: the registered path still
created reset tokens throughout, 6 per test address across the two measurement
runs. All synthetic accounts removed afterwards, production verified at 0
`@example.com` and 0 orphaned links.

*Piece 2, C3L-09.* The warning names the ACTIONS, not `node-version`.
Verified per version rather than assumed: `actions/checkout@v4` and
`actions/setup-node@v4` declare `runs.using: node20`, while **v5 and v7 both
declare node24**. Chose **v5**, not the latest v7: both resolve the runtime
identically, v5 is still actively maintained (v5.1.0 shipped alongside v7.0.1
carrying the same backported fixes), and it is the smallest behavioural delta
from the working v4 on workflows that run the production sync, where a
two-major jump would add risk for no runtime benefit. `node-version` also
moved 20 to 22, the current LTS. Six pins across four workflow files.

*Piece 2, C3L-26.* An hourly workflow now checks the two things that incident
got wrong: whether the most recent deploy is in state `error`, and whether the
published `commit_ref` matches `origin/main`. It is deliberately tolerant of a
deploy in flight, because tripping on every ordinary push is how a check like
this gets ignored and then ignored when it matters. ~~**It needs
`NETLIFY_AUTH_TOKEN` as a repository secret, which I did not add, so until
that exists it fails loudly on its first run**, which is the intended
fail-closed behaviour rather than a silent skip.~~ Same shape as the RLS check's
own setup requirement in Task 07.

**FIRST REAL RUNS, 5 August 2026, both pulled from the GitHub API and read in
full rather than taken from a status badge. There are two, and the pair is more
useful than either alone, because between them they exercise both paths.**

*Run `31001947783`, 11:33 UTC, `schedule`, **FAILED**, and it failed correctly.*
This fired on the hourly schedule before the secret existed. The log shows
`NETLIFY_AUTH_TOKEN:` resolving to empty and the script exiting 1 with
`FATAL: NETLIFY_AUTH_TOKEN is required. This check cannot run without it, and a
check that cannot run is not a check that passed.` **That is the fail-closed
path firing for real, against a genuinely missing secret, rather than being
reasoned about.** The Task 09 blind spot said only the fail-closed path was
verified; what was not appreciated is that it was about to be verified live.

*Run `31003249490`, 11:53 UTC, `workflow_dispatch`, **PASSED** in 15 seconds,
after Sammy added the secret.* What it actually found, verbatim from the log:
`latest deploy   : 8315b81 state=ready`, `published       : 8315b81 state=ready`,
`origin/main     : 8315b81`, `published matches origin/main.`,
`Deploy health check PASSED.` So all three agree on `8315b81`, the newest
commit, the newest deploy and the currently published one are the same build,
and the site is serving exactly what `origin/main` says it should. This is the
condition C3L-26 found violated on 4 August, now confirmed healthy by the
mechanism instead of by a human checking by hand.

**One thing worth recording rather than leaving as a puzzle: `NETLIFY_SITE_ID`
also resolves to empty in both logs, and it does NOT matter.** There is no such
repository secret, and there does not need to be:
`scripts/deploy-health-check.mjs:30` falls back to the hardcoded
`cfa7a71e-27b6-4a5b-a888-ba5924a436d3`, which is the site id documented in
CLAUDE.md and is not a secret. The empty value in the log is therefore expected,
not a second missing-secret problem, and it is stated here so nobody spends time
"fixing" it later.

**The Task 09 blind spot is now closed on evidence: the check has been run end
to end, it works, both its outcomes have been observed, and it takes 15
seconds.**

*Piece 2, C3L-35, the decision: **REMOVE**.* Re-confirmed immediately before
dropping rather than inherited: 0 cron callers, 0 database function callers,
0 repo callers, and it writes columns nothing reads. A maintained-looking
function that nothing calls invites a future reader to assume it is the live
path, which is not hypothetical, it is exactly the wrong turn Task 03 nearly
took while investigating C3L-34. Recorded honestly: this discards the
minimum-sample guard Task 05 added under C3L-25, which was correct and was
recorded at the time as inert. The reasoning survives in C3L-25's entry and in
`c3l25-price-stats-minimum-sample.sql`, which also serves as the rollback.

*Piece 2, C3L-38, the decision: **DELETE the function, do NOT create
`exec_sql`**.* Three reasons, in order of weight. Creating a generic
`exec_sql(query text)` RPC that executes arbitrary SQL would be a serious
footgun on a project whose entire audit thread is RLS and key exposure: it
converts any future key leak into full database compromise, so adding one to
keep a broken step alive is the wrong trade by a wide margin. It writes the
same unread columns as C3L-35. And even working, it would duplicate what
`compute_mtg_signals_batch` already does correctly. Confirmed by grep before
deleting that the only remaining reference anywhere to
`mtg_price_snapshots.price_52w_*` and its snapshot-level verdict columns was
this function itself; every live reader takes those figures from `mtg_signals`.
82 lines of dead code and its call site removed.

*No data was touched by either removal.* The 527,793 legacy rows in the
abandoned snapshot columns are exactly as they were, and `exec_sql` remains
absent, confirmed after the fact.

**Resolution evidence for C3L-17 to C3L-23 and C3L-36, 5 August 2026, task
`c3-audit-siblings-c3l36`. Two pieces, and one correction that matters more
than either.**

*The correction, first, because it changes what these seven entries said.*
Every one of C3L-17 to C3L-23 recorded that the sibling was **"not currently
wrong"** and that fixing it was preventive. At the GAME level that was true and
still is: none of the seven had a game-wide snapshot gap like MTG's. At the
PER-CARD level it was **false**, and nobody had looked per card, because the
earlier analysis measured whole-game cadence and stopped there. Measured
immediately after applying the fix, the cards whose window exceeded tolerance
and were therefore carrying a mislabelled figure:

| game | cards | 24h suppressed | 7d suppressed |
|---|---|---|---|
| pokemon | 30,049 | 3 | 12 |
| yugioh | 45,668 | **708** | **2,195** |
| lorcana | 3,306 | 0 | 7 |
| onepiece | 6,802 | 6 | 36 |
| starwars | 7,370 | 14 | 13 |
| riftbound | 1,241 | 1 | 10 |
| dragonball | 10,448 | 1 | 44 |
| **total** | | **733** | **2,317** |

Yugioh is 95 per cent of it, consistent with it having the worst cadence of the
seven (worst gap 7 days against 5 for the others). The worst individual case:
cards whose "7 day change" was computed across an **88 day** window, 5 August
against 9 May, because their only older snapshot is the first day of history.
So this work corrected 3,050 live mislabelled figures rather than merely
preventing future ones.

*Piece 2, the mechanism.* Not verbatim from MTG, because these are not MTG's
function, and that was re-read rather than assumed: MTG resolves ONE global
anchor and compares every card against it, while these seven resolve the anchor
PER CARD via `DISTINCT ON`. So the tolerance is per card too, the temp tables
now carry the resolved snapshot date, and the comparison is
`(t.snap - dN.snap)`, the real window for that specific card. Tolerance is
1 day for all seven, measured not copied: every one syncs daily, average gap
1.11 to 1.21 days across 74 to 82 distinct days. The anchors also moved from
`CURRENT_DATE - N` to `max_date - N`, which matters as much as the tolerance,
because a calendar anchor slides away from the data during an outage while the
data stands still, which is exactly how MTG came to compare 28 July against
27 July and call it seven days.

*How it was verified, and a trap worth recording.* The first before/after
comparison was **confounded and nearly misread**: the stored baseline came from
the previous night's cron run, so comparing it against a fresh run mixed the
code change with a whole day of new snapshots, and produced differences of
thousands of rows that had nothing to do with the fix. Replaying the OLD logic
against TODAY's data and diffing that against what the new function stored is
what isolated it. For starwars, where `max_date` equals today so the anchors are
identical, the isolated diff is exactly 14 cards on 24h and 13 on 7d, which is
the tolerance and nothing else.

*Piece 3, C3L-36, and its own count was wrong.* The entry said "roughly 28
other game card-page files". The real number is **23**. Of 32 card-page files:
**23 carried the defect and are fixed**, **2 were already correct**
(`card-page.mjs`, fixed for MTG in Task 02, and `pokemon-card-page.mjs`, which
has used a date cutoff all along and is the file Task 02 copied from), and
**7 have no snapshot query and no chart at all** so there is nothing to fix
(`wow`, `weissschwarz`, `warhammer`, `hololive`, `grandarchive`, `godzilla`,
`dragonballz`), confirmed by direct count of 0 references to `price_snapshots`
and 0 to any chart builder in each.

One near miss recorded because it would have wasted a later session:
`card-page.mjs` matched a naive grep for the old pattern and looked like a
second unfixed query in the file already fixed. It was the pattern quoted
inside an explanatory comment written in Task 02. Checked rather than assumed.

The change is a pure inline replacement inside the query string, adding a
`snapshot_date=gte.` 90 day cutoff and lifting the row limit to 400 so it can
only ever be a safety cap. Deliberately no new statements: two of the 23
(`finalfantasy`, `unionarena`) assign through a ternary where a declaration
inserted above the matched line would have landed inside an expression.
Verified `node --check` on all 23, both ternary files render correctly, a
repo-wide search for the bare pattern now returns only the two files that
legitimately contain it inside a date-bounded query, six swept game hubs return
200, and a swept Star Wars card page renders 77 chart points spanning
2026-05-14 to 2026-08-05, ending at today rather than at the oldest rows.

*Rollbacks, one per piece.* C3L-46: revert the one-line `maySendLink` guard in
`handleForgot`. C3L-17 to C3L-23: re-apply the previous function bodies, which
differ in exactly four ways each, anchors on `CURRENT_DATE`, no `snap` column,
no tolerance condition, no `max_date` lookup or NULL guard. C3L-36: a plain
`git revert` of the sweep commit, which touches only query strings and comments.

**Resolution evidence for C3L-44, C3L-45 and the recurring RLS check,
5 August 2026, task `c3-audit-c3l44-c3l45-recurring-rls`. Three pieces,
recorded separately.**

*Piece 1, C3L-44.* Signup now matches `handleForgot`'s pattern rather than a
new one: both branches send mail and both fall through to one response that is
true either way. A per-address send throttle was added at the same time,
because equalising timing means the registered branch now sends mail and
without a throttle that would hand anyone a way to mail a known address by
replaying the form. The throttle is keyed on the submitted address and never
on whether an account exists, so it cannot become a second enumeration channel.

**This took two attempts, and the second one is the point.** The first fix
made body content and length identical, 25,386 bytes either way, and removed
the "already has an account" text, and reading the code it looked done. Live
measurement said otherwise: five paired samples gave the registered path a
median of **1,512ms against 1,021ms**, a 491ms separation. Single samples
overlapped so it was not obvious, but medians over repeated requests separate
cleanly and that is all an attacker needs. The cause was an asymmetry
introduced by the fix itself: the registered branch called `getAccountByEmail`
lazily inside its own branch, so it made one more database round trip than the
unregistered one. The response was generic but the work behind it was not. The
lookup now runs unconditionally before the branch, so both paths perform
exactly one lookup, one insert attempt and one send.

Re-measured after that change, on the live site, same paired method:
unregistered median **1,171ms**, registered median **1,152ms**, a **19ms**
delta against 491ms before and 1,214ms in the original finding, with the two
ranges fully interleaved (1,126 to 1,356 against 1,096 to 1,177). Body lengths
identical at 25,387. No leaking text. **The lesson worth keeping: the code read
as correct at the halfway point, and only measurement caught it.** All
synthetic accounts were removed afterwards and production verified clean, 0
`@example.com` and 0 orphaned magic links.

*Piece 2, C3L-45.* Covered in its own row above. The short version: an empty
batch is normal termination and stays, what changed is that a truncated run is
now distinguishable from a finished one. Live: `41636 cards processed in 107
batches, expected 41628, complete`.

*Piece 3, the recurring RLS check.* Logged as an update to C3L-06 rather than
a new ID, deliberately: it is not a new finding, it is the standing mechanism
that keeps C3L-06's result true, and splitting it off would leave C3L-06
reading as a one-time pass again. It lives at
`scripts/rls-recurring-check.mjs` and `.github/workflows/weekly-rls-check.yml`,
runs Sundays 04:00 UTC (clear of the 03:00 sync), and is Task 06's method
automated rather than redesigned.

Two things it does that a naive repeat would not. It reads each table's true
row count through a service-role RPC and labels every result **meaningful** or
**vacuous**, so `collection_waitlist` and `card_price_alerts` begin being
genuinely tested the moment they hold a row instead of reporting the same empty
pass forever, which is C3L-06's own recorded caveat. And it discovers its
targets from column shape at run time rather than a hardcoded list, so a new
table with an email or `user_id` column is covered without anyone remembering,
which is Section 4 point 4. Discovery needed a database-side source because
PostgREST's OpenAPI root returns 401 to the anon key; the supporting RPC is
SECURITY DEFINER, revoked from PUBLIC **and** from `anon` and `authenticated`
by name, and anon calling it was confirmed to get `42501 permission denied`.

**Two honest gaps on this piece.** The workflow needs `SUPABASE_ANON_KEY` as a
repository secret, which no existing workflow uses; I did not add it, that is a
credential-store change to the repo that was not asked for, so until it exists
the workflow fails loudly on its first run, which is the intended fail-closed
behaviour rather than a silent skip. And **the script has not been run end to
end**, because the service key is not retrievable from this machine. What was
verified is the fail-closed path (no secrets set gives exit 1 with an explicit
message), the RPC's output shape, and that anon cannot call it. Run it once by
manual dispatch after adding the secret, before trusting the schedule.

**Resolution evidence for C3L-43, 5 August 2026, piece 2 of task
`c3-audit-0rls-c3l43`.**

*Measured before deciding the fix, per the task's own instruction.* The two
categories it asked to separate are **1,871 and 0**. All 1,871 stale rows are
absent from the newest snapshot date. **Zero** are cards still syncing normally
that fall through a gap inside `compute_mtg_signals_batch`: that was checked
directly and every card present on the newest snapshot date with a usable price
has a signal row, 0 missed. So this was purely staleness and the fix is an
expiry, not a repair to the function.

*Why they stopped appearing.* 829 of the 1,871 last traded below the sync's
`MIN_SNAPSHOT_USD` floor of 0.50 USD, so they stop being snapshotted by design.
The other 1,042 were still above the floor when last seen. Checked specifically
for a cliff at the gzipped-JSONL migration, since a regression there would have
been mine from Task 01, and **there is none**: attrition runs at a steady 50 to
150 cards per day across the whole period with no step change, so this is
ordinary catalogue churn.

*The fix, and where it was put.* Verdicts are cleared at source in
`update_mtg_signals_batched` rather than filtered in each consumer, because
there are three consuming surfaces and adding a filter to each is three chances
to forget one, which is the C3L-27 lesson. Confirmed first that both consumers
needed it: `market-data.mjs` and `weekly-report-core.mjs` each read
`buy_verdict`/`sell_verdict` and **neither filters on `latest_date`**, so both
`/market` and the weekly seller email were publishing stale calls. Also
confirmed, because the task asked specifically, that the weekly email has **no
caching or pre-generation step**, it queries live at send time, so clearing the
stored value covers it with no second change.

*The staleness rule is deliberately outage-safe.* A row is stale when its card
is absent from the newest snapshot date **that exists**, never when it is old
relative to today's calendar date. During the 29 July to 3 August outage the
newest date stayed at 28 July, so every card present on it stayed current. A
calendar-based rule would have blanked the entire catalogue's verdicts during
that outage. Both the verdicts and `days_of_history` are cleared, so all three
surfaces including the card page's C3L-39 guard treat a stale row as "cannot
say" rather than one of them still asserting "Mid-range price".

*Measured effect.* The job now reports its own expiry count: **798 stale rows
expired**, exactly matching the 798 measured beforehand. Buy verdicts 4,522 to
4,144 and sell 8,381 to 7,961, a drop of 798 in total. Verified afterwards:
**0 stale rows still carry a verdict**, and **0 current cards were wrongly
blanked**. `/market` and an MTG card page were both fetched live and still
render correctly, with buy/sell badges still present on `/market`, so the
feature works and only the stale entries are gone. Self-healing by
construction: if a card reappears in a snapshot the next run recomputes it.

*Rollback.* Re-apply the previous `update_mtg_signals_batched` body, which is
identical minus the expiry block and its counter. Every cleared value is
recomputable by definition, so a single run of the job restores anything.

**Resolution evidence for C3L-39, C3L-41 and C3L-42, 5 August 2026, task
`c3-audit-c3l39-c3l41-c3l42`. Three separate pieces, recorded separately
because they are three separate changes that happen to touch the same two
tables.**

*Piece 1, C3L-39, minimum-history guard.* Threshold set at **30 distinct days
with a price**, chosen for three stated reasons: it is the shortest window the
site already claims a trend over anywhere else (`price_change_30d`), it sits
just under the median card history of 33 days so a typical card is unaffected,
and measured against the real catalogue it withholds 6.5 per cent of verdicts
where 14 days would withhold 3.8 per cent and 45 days 11.2 per cent. Distinct
days, not row count, so several rows on one date cannot look well-observed.
**Withheld rather than marked low-confidence**, because a buy or sell call is a
binary prompt to act and a "low confidence buy" still reads as buy to someone
scanning a page. Implemented at source in `compute_mtg_signals_batch` so the
card page, `/market` and the weekly email all inherit it rather than three
surfaces each deciding separately, which is the C3L-27 lesson applied before
the divergence rather than after. `days_of_history` is stored on `mtg_signals`
for the same reason. **Measured effect, not estimated:** buy verdicts 4,634 to
4,522 and sell verdicts 8,693 to 8,381, so **424 verdicts withheld**, and a
direct check confirms **0 cards below the threshold still carry a verdict**.
The separate "Mid-range price" conflation is fixed in `card-page.mjs`: a card
with too little data now renders "Not enough price history yet" in its own
visually distinct style, where previously it was indistinguishable from a card
with a genuine mid-range verdict, which asserted a conclusion where there was
none.

*Piece 2, C3L-41, targeted correction.* Exactly **8 rows** flagged
`excluded_from_signals`, listed individually by primary key in the migration so
the change can never widen silently, and confirmed afterwards as 8 rows, all
dated 2026-06-06. **The 189 genuine Marvel cards and the 45 unclear cards were
not touched**, per the task. Values were **flagged, not deleted or corrected**,
because deleting them would destroy the only surviving evidence of the 6 June
event, and the row remains readable and auditable. **Measured effect:**
Ornithopter's low moved from $0.07 to $715 and its range ratio from 10,357 to
1.0. Five others moved similarly. **Two of the 8 did not change**, Crossroads
Consecrator and Fear of the Dark, because their `mtg_signals` rows are stale
and were never recomputed (C3L-43), so this piece landed on 6 of 8 and that is
stated rather than rounded up. Honest scope note carried from the migration:
only Ornithopter is dramatically wrong on its face; the other 7 hold plausible
small values and were excluded because of **where they came from**, not because
the number is provably wrong.

*Piece 3, C3L-42, provenance columns.* `written_at timestamptz` and
`source text` added to `mtg_price_snapshots`, and `sync-mtg-daily.mjs` now
stamps `source: 'sync-mtg-daily'` on every snapshot it writes. Existing rows
stay NULL, deliberately, this was not a backfill. **Lock safety mattered here
and was confirmed rather than assumed:** the table is 4,383,687 rows and
1,559 MB and serves live card pages, and on PostgreSQL 17 a column added with a
VOLATILE default such as `now()` forces a full table rewrite under an ACCESS
EXCLUSIVE lock. The column was therefore added bare and the default attached as
a separate statement, which rewrites nothing. **Scope check while in the
schema, as asked:** all seven other Core games' snapshot tables (pokemon,
yugioh, lorcana, onepiece, starwars, riftbound, dbsfusionworld) have neither
column. Confirmed and logged, not fixed, per the task.

*Regression, common to all three.* Eight normal long-history cards had their
low, high and verdict recomputed by hand under the OLD unguarded logic and
compared against what is stored after all three changes: all 8 match exactly on
all three fields. Six verdict-carrying cards with 84 days of history had their
verdicts independently re-derived from the stored high, low and latest price:
all 6 match. So nothing outside the intended population moved.

*Rollbacks, one per piece, each independent.* C3L-39: drop
`mtg_signals.days_of_history` and re-apply the C3L-41 version of the function,
which is identical minus the `days_hist` expression and the two
`>= MIN_HISTORY_DAYS` conditions; the page change is a plain revert. C3L-41:
set `excluded_from_signals = false` on the 8 listed ids, drop the column, and
re-apply the previous function body minus the one `AND NOT
s.excluded_from_signals` line. C3L-42: drop the two columns and revert the one
line in the sync. Each is written so the reverse is obvious from reading the
migration, per protocol Section 16.2 point 3.

**Resolution evidence for C3L-15, C3L-16, C3L-25 and C3L-27 to C3L-31,
5 August 2026, task `c3-audit-mtg-cardpage-consolidation`.**

*C3L-15 and C3L-27, consolidation rather than a patch.* The badge no longer
recomputes anything. It reads `card.price_change_7d`, the value
`update_mtg_price_changes` already corrected under C3L-12, which anchors on
real dates and returns NULL when the window is not genuinely about seven days.
A NULL therefore renders no badge at all, which is the correct outcome and is
already how every other surface behaves. The audit also found a third copy of
the same statistic that neither the register nor the task file mentioned: the
prose sentence "The price has been trending up over the last week", built from
the identical `slice(-7)` and free to contradict the badge directly above it.
It now derives from the same single value, and when that value is unavailable
it says nothing rather than asserting the price has been "stable", which was
the old fallback and was a claim made from no evidence.

*C3L-16.* The query is now bounded by date, `snapshot_date=gte.` a rolling
90 day cutoff, with the row limit kept only as a safety cap far above what a
daily cadence produces. Row count can no longer decide the window. The same
correct shape already existed in `pokemon-card-page.mjs`, which is why it was
adopted rather than invented.

*Verification, two structurally different methods.* First, a numeric harness
over the real date series, run against the new mapping in isolation: on 30 days
of uniform daily history the new date-based x positions are identical to the old
index-based ones to within 1e-9, which is the regression check that ordinary
charts are unchanged, and it detects zero line breaks. Against the real
24 July to 4 August series it detects exactly one break, at 28 July to 4 August,
and the gap occupies 7.00 times the width of a one-day step where it previously
occupied 1.00. Second, the guard added under C3L-25 was exercised read-only
against its own expressions over 500 cards: the seven day window currently holds
at most 2 distinct days, so 0 cards pass the 4 day threshold, against 396 that
would have published a "7 day average" without it, while the well-sampled 30 day
window (25 distinct days) still publishes for 390. Both checks avoid writing to
production. Neither is a rendered-browser check, and none was done.

*C3L-25 threshold reasoning.* Four distinct days for the seven day average and
fifteen for the thirty day one, a majority of each nominal window. A majority is
the weakest bar that still guarantees the average describes most of the period
it claims to, and requiring the full count would blank the figure after any
single missed sync, the same over-strictness rejected when choosing C3L-12's
1 day tolerance. Applied as migration `c3l25_price_stats_minimum_sample`, source
at `netlify/functions/migrations/c3l25-price-stats-minimum-sample.sql`, and
confirmed live by re-reading the function body rather than trusting the
migration's success report. Note C3L-35: this function is called by nothing, so
the guard is correct but has no live effect today.

*Rollback.* The card page change is a plain `git revert` of the commit, no
schema and no data involved. The `update_price_stats` change is reverted by
re-applying the previous definition, which is identical except that `avg_7d`
and `avg_30d` are unguarded `AVG(...) FILTER` expressions and the two
sample-count columns do not exist. That previous definition is preserved in the
migration file's own header comment. It replaces one function body, holds no
lock and loses no data.

**Resolution evidence for C3L-12 and C3L-08, 4 August 2026, task
`c3-audit-urgent-c3l12`.** The fix has two parts. Both comparison windows now
anchor on `snap_today`, the newest snapshot actually held, rather than on
`CURRENT_DATE`, so the window measured is the one between the two rows
actually being compared and a stale sync reads as stale data rather than as a
broken window. On top of that, each window must be within `TOLERANCE_DAYS` of
its nominal length or the value is NULL rather than a confident wrong number.
Tolerance is 1 day, chosen for the daily sync cadence: a healthy system has an
exact match, one day absorbs a single missed run, and 2 or more would start
presenting a nine-day movement as a weekly one, which is the defect being
fixed. Applied as migration `c3l12_price_window_tolerance`, source kept at
`netlify/functions/migrations/c3l12-price-window-tolerance.sql`.

Verified three ways. First, the live function body was re-read with
`pg_get_functiondef` after applying, confirming the tolerance constant and both
`snap_today` anchors are present and the old `CURRENT_DATE - 7` anchor is gone,
rather than trusting that the migration reported success. Second, a regression
check: the old logic's output for today was computed independently into a
checksum BEFORE the change (`bb5282275ec2d072893d06c677929878`, 41,628 rows),
the new function was then run, and the values it actually stored checksum
identically, with 0 mismatched rows on both the 7d and the 30d column. Old and
new must agree today because both anchors resolve to 28 July, and they do
exactly, so the case that was already correct is provably unbroken. Third, the
tolerance expressions were exercised against real snapshot dates for each
future run day: 5 August publishes an 8 day window, 6 to 10 August publish
NULL, and 11 August onward returns to a true 7 days. Note honestly what that
third check is and is not: it evaluates the same expressions the function uses
against real data, but it is not an end-to-end run of the NULL path, which
would have required inserting fake snapshot rows into a production table. That
gap is recorded in this task's blind-spot line rather than left implied.

One consequence stated plainly so it is not later mistaken for a residual bug:
the 5 August run publishes an 8 day window as `price_change_7d`. That is the
chosen 1 day tolerance working as designed. Tightening to 0 would make it
exact but would blank the movers lists on any single missed sync.

A side effect worth recording: running the fixed function immediately also
overwrote the values left by the 3 August cron run, which had compared 28 July
against 27 July and published a one-day movement as a seven-day change. The
stored 7d figures are now a true 28 July to 4 August movement, so the live site
stopped showing that particular wrong number several hours before the nightly
cron would have corrected it anyway.

C3L-08 was fixed in the same task by declaring `stream-chain` at `^2.2.5`,
matching the installed and lock-pinned version. `package-lock.json` was
regenerated with `npm install --package-lock-only` in the same commit. Without
that, `npm ci` fails on a package.json and lock file that disagree, which would
have broken the MTG sync repaired earlier the same day. `npm ci --dry-run`
was run afterwards and resolves 144 packages cleanly.

**Verified fixed, not merely deployed.** A manual `workflow_dispatch` run on
the fixed commit (`2d0404b`, run 30901800725) completed green in 10m47s,
logging `Bulk file format detected: gzip-jsonl`, 85,294 cards upserted,
52,623 snapshots upserted, 739 sets upserted, and zero failures of any kind.
The database was then checked independently of the CI log, per Part 0's
verify-twice rule and because C3L-03 is precisely the trap of believing a
green status: `mtg_price_snapshots` now holds 52,623 rows dated 2026-08-04,
a number that matches the run log exactly. C3L-01 and C3L-02 are therefore
resolved on real evidence, the false "updated daily" claim on MTG card pages
is true again, and the seven-day stall is over. The same query is what
surfaced C3L-11 and C3L-12, which the sync fix does not address.

**What Claude.ai's tools could not reach, 4 August session:** the GitHub
Actions workflow file and run logs (no GitHub connector, repo is private),
the Netlify function source presumably performing the MTG sync, and
Supabase's own `api` and `postgres` log services (both fetches failed at
the tool level, not retried). All three are Claude Code's job.

---

## 4. Reported findings, confirm-first (19 of the full C3-001 to C3-164 range, a curated subset, not the whole register, see note below)

Every row is a claim from the external reports (30 July docx, 1 August
report), not yet independently confirmed. First action on each is live
confirmation, not acting on the report's word alone. Where confirmed and
still broken, act immediately. Where already fixed, mark Resolved with
evidence, do not re-litigate.

**Note on completeness:** this table holds the 19 individual C3-IDs (12
rows, some grouping 2 to 3 related IDs) already triaged as highest priority
from the 30 July docx's full 164-finding register. It is not the whole
164. The rest still lives only in that docx, untriaged into this file. As
each remaining C3-ID gets checked, add its own row here rather than
assuming it is covered by proximity to one that already is.

| ID | Finding | Reported severity | Confirm how | Status |
|---|---|---|---|---|
| C3-024/025 | Warhammer 40,000 booster box EV calculator models a fictitious product (12-pack Collector Booster, 14-card Play Boosters, serialised chase cards); real release is four Commander decks | Critical | Fetch the live EV page, compare against Wizards' own product documentation | Not yet confirmed live |
| C3-027/028 | Zendikar Expeditions EV model internally contradictory on expected quantity and acquisition mechanic | Critical | Fetch the live EV page, check stated pack odds against the actual Expeditions insertion mechanic | Not yet confirmed live |
| C3-032/033 | Final Fantasy and Modern Horizons 3 EV models include a serialised or Collector-only card as if pullable from a standard Play Booster | Critical | Fetch both live pages, check slot eligibility against Wizards' own product pages | Not yet confirmed live |
| C3-026/029/030 | Zendikar Rising and Commander Legends EV models use the current Play Booster structure on products that predate it or use a different structure | High | Fetch live pages, cross-check release-year product structure | Not yet confirmed live |
| C3-031 | Jeweled Lotus described as a current Commander staple after its ban | High | Fetch live page, check current banlist | Not yet confirmed live |
| EV verdict | EV pages can show a purchase verdict before an actual box cost is entered, and can show contradictory verdicts simultaneously | High | Load a sampled EV page pre-input, capture initial state | Not yet confirmed live |
| C3-075 | WWW and apex hostnames may serve different site generations | High | Fetch both hostnames, diff. Note: 12 July Netlify duplicate-project issue was separately closed, this may already be resolved | Likely resolved, confirm to close formally |
| C3-076/077 | Legacy `.html` routes remain live alongside clean routes, with different content (Tarkir: Dragonstorm cited) | High | Fetch both route forms for a sample, diff, check for a 301 | Not yet confirmed live |
| C3-122 | Pricing page describes paid tiers as planned; `/legal` describes an existing, billed subscription | High, now a named 2026-27 ACCC enforcement priority | Fetch pricing page and `/legal` together, diff subscription language | Not yet confirmed live |
| C3-001/003 | "Exact AUD," "local price," used where the value is a converted or modelled estimate | High | Grep all copy for these phrases, cross-check actual data source | Not yet confirmed live |
| C3-012/013 | Tracked-game count still conflicts (31 vs 32) somewhere live, despite the 11 July fix | Medium | Grep for hard-coded game counts sitewide | Not yet confirmed live |
| C3-059 | Quiz count conflicts (29 vs an older figure) somewhere live | Low | Confirm the 12 July fix reached every page stating a quiz count | Not yet confirmed live |

---

## 5. Prioritised action tiers

See protocol Section 7 for the reasoning. Update as each lens closes.

**Tier 0, take down or correct now:** Section 4 above, once each row is
confirmed live. C3L-01/02 were here and are now resolved, 4 August 2026.
C3L-12 replaced them in this tier and is itself resolved as of 4 August 2026,
ahead of its 20:00 UTC 5 August deadline. **C3L-15 now holds this tier**: it
is the same class of wrong number on the same highest-revenue game, on the
MTG card page rather than in the database, and unlike C3L-12 it is already
wrong today rather than from a future date. C3L-16 sits beside it, triggering
around 10 August 2026. Both sit inside the ACCC misleading-pricing priority
named in protocol Section 7 for the same reason C3L-12 did.

**Tier 1, critical, launch-blocking:**
- ~~RLS and BOLA verification, the two-account object-level access test
  specifically (protocol Section 4).~~ **DONE and PASSED, 5 August 2026,
  task `c3-audit-0rls-c3l43`.** Eight object-level attacks by one real
  account against another's row, all rejected, target row verified intact in
  the database after each. Anon-key sweep of all 13 sensitive tables
  returned 0 rows, meaningfully so for the 4 that hold real data. See C3L-06.
  Protocol Section 4's closing line asks for this to become a recurring
  scheduled check rather than a one-time pass, which has NOT been set up.
- Stripe checkout idempotency key usage, confirmed present on every charge
  and subscription-creation call, not assumed from webhook-side signature
  checking alone.
- Stripe webhook signature, replay, and idempotency verification (C3-098),
  including duplicate delivery of the same event ID.
- Stripe webhook handler write pattern confirmed as insert-first under a
  database unique constraint, not check-then-insert.
- Premium entitlement decided server-side only, never trusted from a
  client-supplied field or local storage (C3-097).
- Password-reset token controls and account-enumeration resistance
  (C3-101/102).

**Tier 2, high:**
- EV catalogue-wide rebuild against the immutable-product-record method.
- Cross-page price and trend reconciliation invariant.
- Affiliate link integrity sweep, all 32 games.
- Card and printing identity stability across pages.
- Follow and alert email-abuse controls (C3-115).
- ~~The MTG sync fix itself (C3L-01 to C3L-04), root cause and repair.~~
  Done and verified 4 August 2026, commit `2d0404b`, run 30901800725. Left
  in place per the never-delete-a-row rule. Its unresolved consequences
  moved to C3L-11 and C3L-12, they are not covered by this closed item.

**Tier 3, medium:** content and SEO items, legacy template coexistence,
structured-data accuracy, third-party integration health.

**Tier 4, low and long-term:** redundancy sweep, chaos and resilience
testing, monetisation scouting, Section 7 below.

---

## 6. Blind-spot findings, round-table and self-review derived (IDs C3X-01 to C3X-16)

Not present in either external report, and not from direct live
investigation, this range's provenance is round-table and self-critique
passes.

| ID | Finding | Why it matters | Priority |
|---|---|---|---|
| C3X-01 | No sweep confirms zero remaining references to `dragonball_cards` or `dragonballz_cards` where `dbsfusionworld_cards` is correct, across code, content, and the apitcg enrichment job once it runs | This exact confusion has already caused real mistakes historically | High |
| C3X-02 | The apitcg dry run's 14 unmatched rows (99.93 per cent match) have no defined handling, silently null, silently wrong, or flagged is unknown | A small known gap can still mislead if it renders as a confident-looking wrong value | Medium |
| C3X-03 | Flesh and Blood's exclusion is policy-documented but not confirmed as a code-level guard in the 32-game `GAME_CONFIG` pattern | A future copy-paste could reintroduce FaB by accident, breaching LSS's restriction | Medium |
| C3X-04 | Single-supplier concentration, primary income depends on Dice Arcade Miranda alone | Real business-continuity risk, not previously logged as an audit item | Long-term, business not technical |
| C3X-05 | Credential-chain bus-factor, no documented recovery sequence for registrar, Netlify, Supabase, Stripe, MailerLite, Resend if the operator loses simultaneous access | Mirrors the external report's general "recovery matters as much as prevention" finding, no C3-specific version existed | High |
| C3X-06 | The 11 July count-constant fix not swept for every page stating a card or game count | Same failure shape as C3-012/013, a fix confirmed on checked pages can still be open elsewhere | Medium |
| C3X-07 | Unit economics against the AU$10,000/month goal not checked against real numbers in any pass so far | The audit checks correctness and safety, not progress against the stated financial goal | Medium, once data-integrity work is trustworthy |
| C3X-08 | No formal ToS or licensing review for four of eight external stat APIs (YGOPRODeck, Lorcast, optcgapi.com, swu-db.com) | Single point of failure, no company SLA, previously logged but never given a formal priority | Medium |
| C3X-09 | eBay store inventory count differs across site sections and against the live dashboard | Same failure class as C3-012/013, a number that should come from one source and does not | Medium |
| C3X-10 | No control considered for a bad-faith actor feeding the AI-assisted content pipeline false product information, to test whether it publishes uncorrected | Panel 1, adversarial and abuse-case | Medium |
| C3X-11 | Stripe checkout path's idempotency key usage unconfirmed, a more likely failure mode than webhook forgery, not previously its own item | Panel 2, concurrency and idempotency | Critical, now Tier 1 |
| C3X-12 | Webhook out-of-order and duplicate-delivery handling unconfirmed beyond a basic signature check | Panel 2, concurrency and idempotency | High |
| C3X-13 | No git-history sweep on auth-adjacent files checking whether authorisation logic was quietly altered across many incremental Claude Code sessions | Panel 3, AI-generated-code risk | High |
| C3X-14 | The authentication-without-authorisation pattern had not been named or specifically searched for in any existing review | Panel 3, AI-generated-code risk | Critical, feeds directly into protocol Section 4 |
| C3X-15 | No concrete scale-multiplication test cases existed despite performance being in scope | Panel 2, concurrency and idempotency | High |
| C3X-16 | The tier system has no explicit safeguard against a hard-to-fix finding being quietly downgraded over time | Panel 5, business-outcome grounding | Low, process discipline |

---

## 7. Hypothetical and future-scenario test cases, ready to run

Generated from protocol Section 11's four patterns, mapped to the
execution slug that should run each one.

| Scenario | Generator pattern | Slug | What a pass looks like |
|---|---|---|---|
| 20 concurrent users versus 2,000, across price sync, follow-alert send, search, and Stripe checkout at once | Scale multiplication | `8-perf` | The specific component that degrades first is named, not assumed |
| Daily price refresh runs while thousands of users are actively browsing | Scale multiplication | `8-perf`, `3-pricing` | No page ever renders a mix of yesterday's and today's snapshot |
| Same email signs up twice inside one second | Duplicate and replay | `0-rls`, `6-adversarial` | Second attempt rejected cleanly, no duplicate account |
| Follow-alert submitted twice before the first confirmation sends | Duplicate and replay | `10-alerts` | Deduplicated server-side, not two confirmation emails |
| Same Stripe webhook event ID delivered twice | Duplicate and replay | `6-adversarial` | Second delivery is a no-op, no duplicate entitlement or charge |
| Checkout retried after a client-side timeout | Duplicate and replay | `6-adversarial` | Idempotency key prevents a second charge |
| Two overlapping sync runs for the same game | Race condition | `5-datasync` | Last-write-wins is explicit and intentional, not accidental |
| Tier or entitlement check reads mid-webhook-write | Race condition | `0-rls`, `6-adversarial` | The check always reads committed state, never a partial write |
| Full-catalogue scrape attempt | Attacker mindset | `7-abuse` | A named, tested control exists, not an assumed one |
| Email-bomb attempt via the follow feature | Attacker mindset | `7-abuse`, `10-alerts` | Per-email and per-IP limits actually tested against the live endpoint |
| Cross-user object access via ID or UUID substitution | Attacker mindset | `0-rls` | Covered directly by protocol Section 4's method |

---

## 8. Opportunity register (IDs OPP-01 to OPP-06)

Continuous, per protocol Section 15. Any task that spots something C3's
data or architecture could do that a competitor plausibly cannot adds a row
here immediately, whether or not that was its assigned scope.

| ID | Opportunity | What makes it defensible | Depends on |
|---|---|---|---|
| OPP-01 | AU liquidity signal, a "days to sell" or listed-versus-sold spread from C3's own eBay transaction history | Real transaction data competitors lack, MTG-only for now | Sold-data pipeline stays MTG-scoped until other Core games have volume |
| OPP-02 | Multi-source price confidence score, how many of the eight external sources agree on a price | No competitor polls all eight sources C3 aggregates | EV and price-accuracy work closing first |
| OPP-03 | AU-specific grading EV calculator using real AU graded-versus-raw comps | Differentiated from PSA and US-centric tools | Blocked on sold-data pipeline access, already correctly deferred |
| OPP-04 | Release-calendar-driven early movement alerts using `tcg_releases` across all 32 games | Most competitors track this manually per game | Generators and calendar expansion, already D9-approved |
| OPP-05 | Trustworthy booster box EV, once rebuilt, as a genuine differentiator using real AU box and singles prices | Turns the current core defect into a real advantage once fixed | Tier 1 and Tier 2 work closing first |
| OPP-06 | Data-license or API product once AU sold data is trustworthy, aimed at AU LGS or resellers | Same pattern Voxsanity logged for its own data | Sold-data pipeline access, blocked pending the Seller Hub re-export decision |

---

## 9. Summary counts

Updated whenever a task changes the counts below, not left to go stale.
Same discipline as Voxsanity's own Section 5.

- **Live-investigation findings (C3L-):** 60 total. 45 resolved with evidence
  (C3L-01, C3L-02, C3L-04, C3L-05, **C3L-06**, C3L-07, C3L-08, **C3L-10**, C3L-12,
  C3L-15, C3L-16, **C3L-17 to C3L-23**, C3L-25, C3L-27, C3L-28, C3L-29,
  C3L-30, C3L-31, **C3L-36**, C3L-37, C3L-39, C3L-41, C3L-42, C3L-43,
  C3L-44, C3L-45, C3L-46, **C3L-09**, **C3L-26**, **C3L-35**, **C3L-38**, **C3L-47**,
  **C3L-48**, **C3L-50**, **C3L-49**, **C3L-55**, **C3L-51**, **C3L-58**, **C3L-59**). **C3L-06 remains the significant one: the live
  two-account object-level test ran on 5 August and passed, so protocol
  Section 4 is closed on evidence rather than on policy reading, and its
  recurring version has since had its first real run.**
  **C3L-10 moved to resolved on 5 August, and how it got there is worth
  recording: it had been carried as "open" since the kickoff session while
  actually being unimplemented, a suggestion nobody had acted on. Task 10
  implemented it across all 4 script syncs (C3L-50).**
  2 partly resolved (**C3L-52**, where `written_at` is closed for all 32
  games and `source` remains unpopulated for 31 of them; **C3L-53**, the
  dishonest green removed but the three underlying schema mismatches not
  fixed). **C3L-49 moved from partly resolved to resolved on 6 August: Task 13
  closed the 5 games it had left open, so all 31 sync functions now carry the
  same rule.**
  4 high and still fully open (C3L-03, C3L-11, C3L-32, C3L-40), of
  which C3L-11 is permanently unfixable rather than merely outstanding.
  **C3L-51 was RESOLVED on 6 August by Task 14. It was the most consequential
  open item in this file, the reason every other fix was a point fix, and the
  syncs are now watched by something that fails loudly.** What it does not
  cover is recorded with it: both watchers are GitHub cron, so a repo inactive
  for 60 days loses both at once.
  **C3L-49 and C3L-53 are also High but are counted once, above, under partly
  resolved, rather than a second time here.**
  **C3L-51 is the one that matters most and it has not moved.** Task 11 was
  asked to state the dependency explicitly and does: every slug fix in this
  register is a point fix, and until `sync_events` has a real consumer the
  detection posture is unchanged. C3L-53 was found by accident in Task 11,
  not by any monitor, which is the same way the original MTG outage was found.
  **C3L-48 was CORRECTED in Task 11**: its sets fix stands, its cards-path
  change was an unverified extrapolation shipped in the same commit and has
  been reverted.
  **C3L-40 stays High but only its unresolved tail remains**: Task 04
  measured it at 8 ingestion-suspect and 45 unclear out of 242, the other 189
  being genuine Marvel new-set price collapse, and Task 05 then handled the
  8, so what is left open is the 45 nobody could classify.
  3 medium and still open (C3L-24, C3L-33, C3L-34). **C3L-34 was downgraded
  from High to Medium on 5 August** after Task 03's investigation showed its
  central claim was wrong. **C3L-47, the password-reset timing enumeration
  and the last live security finding, was closed on 5 August and verified by
  measurement at a 4ms median delta with fully overlapping ranges.**
  1 medium and open from Task 11 (**C3L-54**, the pokemon dual-writer race,
  masked today only because C3L-53 means one of the two writers never gets as
  far as writing). **C3L-55 was resolved on 6 August by Task 13, which also
  closed the 5 games C3L-49 had left open, so C3L-49 is now superseded rather
  than partly resolved.** 1 low and open (**C3L-56**, 5 orphan slugs whose
  colliding partner vanished upstream, pre-existing behaviour, not introduced
  by the fix).
  3 informational and positive (C3L-13, C3L-14, **C3L-60**, which retires the
  checkout-idempotency assumption rather than fixing anything, because there is
  no server-side checkout in this codebase to make idempotent).
  Tally: 45 resolved + 2 partly resolved + 4 high open (C3L-03, C3L-11,
  C3L-32, C3L-40) + 5 medium open (C3L-24, C3L-33, C3L-34, C3L-54, C3L-57)
  + 1 low open (C3L-56) + 3 informational = 60.
  **C3L-58 is the first Critical severity item this programme has both found and
  closed, and it sat in the one place where a defect costs a customer money.**
- **Note on the ID range:** Task 01 asked for sibling rows to continue from
  C3L-13, but C3L-13 and C3L-14 were already taken by the kickoff session
  earlier the same day. New IDs therefore run from C3L-15, per the
  append-only rule. The task file was written before those two existed.
- **Reported findings tracked here (C3- subset):** 19 individual IDs across
  12 rows, all still unconfirmed live. This is a curated subset of the full
  external 164, not the whole set, see the note under Section 4.
- **Blind-spot findings (C3X-):** 16 total. 2 critical (C3X-11, C3X-14), 4
  high (C3X-01, C3X-05, C3X-12, C3X-13, C3X-15), 8 medium, 2 low or process.
- **Opportunities (OPP-):** 6 total, all still gated behind other work
  closing first, none actionable standalone yet.
- **Resolved this file's lifetime:** 37 of 47 C3L- findings, plus C3L-05 from
  the pre-Wave-0 session. The remaining open set is listed above.
- **Corrections to this file's own findings: 5.** Tracked deliberately,
  because a register that only records what it found and never what it got
  wrong is not an audit trail:
  1. **C3L-34**, 5 August. Claimed the card page presented a 92 day extreme as
     a 52 week one. It does not, it says "Recent High", and the wording was a
     deliberate documented decision. Downgraded High to Medium. Caught one day
     later, by a task written to fix it.
  2. **C3L-40**, 5 August. Claimed 242 outlier cards were "almost certainly"
     bad data. Measured at 8 ingestion-suspect, 189 genuine Marvel price
     collapse and 45 unclear, so it overstated the population by roughly an
     order of magnitude. Caught by the task written to confirm it.
  3. **C3L-17 to C3L-23**, 5 August. All seven claimed the sibling function
     was "not currently wrong" and that fixing it was preventive. True at the
     game level, false per card: 733 cards carried a mislabelled 24 hour
     change and 2,317 a mislabelled 7 day change, 3,050 in total. Caught
     inside the same task that fixed them, rather than across two, but it is
     the same shape of event as the two above, an aggregate claim that did not
     survive contact with granular data.
  4. **C3L-48's cards path**, 5 August. Task 10 verified the lowest-id-wins
     rule against the stored weissschwarz SETS rows, then applied it to the
     CARDS path in the same commit and presented both as equally verified.
     The cards path was never checked and would have moved a live card URL.
     Caught by Task 11 and reverted, one day later.
  5. **The "Section 19 does not exist" correction itself**, 5 August, which is
     a correction OF a correction and the first of its kind here. Task 11
     recorded that its task file cited a protocol section that was not there.
     The section was there, in Claude.ai's copy; the repo's copy was stale and
     had been for days. Caught the same day, by syncing the protocol
     (`1f7aa10`) and reading what actually landed. **This one inverts the usual
     direction: the register was wrong about an external document being wrong,
     which is a failure mode the other four do not cover.**
  The common thread in the first four is a finding written from one level of
  observation (one function, one card, whole-game cadence, one code path) and
  generalised to another without measuring at that second level. The fifth is
  different and worth keeping separate: it came from trusting the repo's copy
  of a document that only ever gets written somewhere else, and the synced
  protocol's Section 1 point 5 now names exactly that.
- **Total rows this file currently tracks:** 88, across 4 ID ranges, out of
  a much larger universe (at minimum the full 164 in the external docx,
  plus whatever the 13-wave programme surfaces once it starts). This
  number is expected to grow quickly once Wave 1 runs, that growth is the
  reason Section 11 exists.

---

## 10. Current state, what to pick up next

**Programme status: started, 4 August 2026. First Claude Code session
complete, stopped at a clean checkpoint after the MTG fix was verified, with
no wave slug yet opened.**

The MTG sync failure (C3L-01 to C3L-04) is closed on real evidence. Wave 1
has not started: no worktree was created and none of `1-claims`, `3-pricing`
or `4-links` was touched, because the MTG investigation ran long once the
recovered data surfaced C3L-11 and C3L-12, per Section 13's rule that an
anomaly is resolved before moving on rather than noted and deferred.

Priority order for the next session:

1. **Environment check first**, per the standing addendum, before any of
   the below.
2. ~~**C3L-12, the price-change window mislabelling.**~~ **Done, 4 August
   2026, task `c3-audit-urgent-c3l12`, applied to the live database roughly
   32 hours before the 20:00 UTC 5 August deadline.** The decision it needed
   was taken as NULL rather than a flagged wider window, on the grounds that
   the display path already handles NULL everywhere it surfaces and a
   low-confidence flag would have required frontend work across 94 files.
   The seven sibling functions were read individually and are logged as
   C3L-17 to C3L-23: all seven share the defect, none is currently
   publishing a wrong number, because MTG is the only game with a snapshot
   gap. They should be fixed before their first outage, not after.
   **Two genuinely separate defects on the MTG card page were found while
   checking where this value is displayed, and are now the most urgent open
   items in this file: C3L-15, which is wrong today, and C3L-16, which
   freezes every MTG price chart around 10 August.** Neither is touched by
   the C3L-12 fix and both need their own task.
3. ~~**C3L-15 and C3L-16, both on the MTG card page.**~~ **Done, 5 August
   2026, task `c3-audit-mtg-cardpage-consolidation`,** ahead of C3L-16's
   expected 10 August trigger. C3L-15 was fixed by consolidation rather than
   by patching, and a third undocumented copy of the same statistic was found
   and folded in. C3L-16's window is now bounded by date. C3L-25, C3L-27 to
   C3L-31 closed in the same task.
   ~~**What replaces it as the urgent item is C3L-34.**~~ **Corrected
   5 August 2026 by Task 03's investigation: C3L-34 was not what this said.**
   The card page says "Recent High/Low", not "52 week", deliberately and
   documented in two places in the codebase, and a true 365 day filter changes
   no value today (0 of 5,000 cards). C3L-34 is a naming problem now and a
   value problem only from 4 May 2027, and its real exposure is one marketing
   sentence at `src/cards.html:708`. Downgraded to Medium.
   **What actually replaces it as the urgent item is C3L-39, and then a much
   narrower C3L-40.** Task 04 measured C3L-40 rather than assuming it: of the
   242, **189 are genuine Marvel new-set price collapse and should never be
   touched**, 8 are ingestion-suspect and trace to one anomalous 6 June batch
   (C3L-41), and 45 are unclear. So the Ornithopter $0.07 is real but close
   to unique, not typical, and any cleanup must target the 6 June rows only.
   That makes C3L-39, the 532 verdicts built on 14 days of history or less,
   the larger of the two.
   **Both done, 5 August 2026, task `c3-audit-c3l39-c3l41-c3l42`.** C3L-39
   closed with a 30 day minimum-history guard, 424 verdicts withheld, and the
   insufficient-data state separated from the genuine mid-range one. C3L-41's
   8 rows flagged and excluded, Ornithopter's low back to $715. C3L-42's
   provenance columns added to `mtg_price_snapshots`.
   **What is now next, in order:** C3L-43, the 1,871 stale `mtg_signals` rows
   of which 798 still publish a verdict to `/market` and the weekly email
   (the card page is already covered); then C3L-36, C3L-16's identical
   one-line defect in roughly 27 remaining card page files; then the 45
   unclassified outliers that are all that remains of C3L-40. C3L-39 is 532 cards carrying a buy or sell
   verdict built on 14 days of history or less. Neither is addressed by either
   candidate approach in the C3L-34 investigation, which is why that
   investigation records a third option, a minimum-history and outlier guard,
   for Claude.ai and Sammy to choose. The full before-and-after is in
   `C3L34_INVESTIGATION_2026-08-05.md`.
   **C3L-36 is now done too, 5 August 2026, task `c3-audit-siblings-c3l36`:
   23 card-page files swept to date-bounded, not the 28 that entry claimed, 2
   were already correct and 7 have no chart at all.** So of the items this
   section has carried, what remains open is C3L-40's 45 unclassified
   outliers, and the newest finding **C3L-47**, the password-reset endpoint's
   timing enumeration, which is the only live security issue still open and
   needs a decision on a constant-time floor rather than a patch. Alongside it, **C3L-36**: C3L-16's identical
   one-line defect exists in roughly 28 card page files, one per game, and
   only the MTG one is fixed. No game has crossed 90 snapshots yet, MTG was
   closest at 84 and Pokemon next at 81, so the sweep has weeks rather than
   days, but not many. `pokemon-card-page.mjs` already carries the correct
   pattern to copy.
4. **C3L-10 and C3L-26 together, no alerting on either side of the deploy.**
   C3L-10 is why a one-line upstream change cost seven days. C3L-26 is the
   same shape on the Netlify side: the 4 August deploy of `2d0404b` failed
   outright and nothing said so, found only because Task 01 checked the
   deploy record rather than assuming a push means a deploy. A sync that
   writes zero snapshots should exit non-zero, a failed deploy should
   notify, and something should compare the published `commit_ref` against
   `origin/main`.
   **Both now done, but note WHEN and how long they sat: C3L-26 in Task 09,
   C3L-10 not until Task 10, 5 August 2026 (C3L-50).** C3L-10 had been
   carried as an open suggestion since the kickoff session while nothing
   had actually been implemented, on all 4 script syncs, for the entire
   programme. It was closed only because Task 10 measured each job rather
   than trusting the register's own status. **What it does NOT cover is the
   31 background syncs: those do log and do return non-2xx, so their
   problem is not dishonest exit codes, it is that nothing reads what they
   log, which is C3L-51 and is still open.**
5. ~~Protocol Section 4's RLS/BOLA test.~~ **DONE and PASSED, 5 August 2026,
   task `c3-audit-0rls-c3l43`. This closes the question that had been open
   since the first session.** Two synthetic accounts, real sessions through
   the live endpoint, eight object-level attacks, all rejected, target row
   verified intact after each. Synthetic data removed and counts confirmed
   back to baseline. One finding came out of it, C3L-44, account enumeration
   via the signup endpoint, which is information disclosure rather than an
   authorisation gap. **Two things NOT done that belong to a follow-up:**
   Section 4's closing instruction to make this a recurring scheduled check
   rather than a one-time pass, and the fact that "collection rows" and
   "alert rows" in Section 4's wording could not be tested because no such
   user-owned rows exist yet, `card_price_alerts` and `collection_waitlist`
   are both empty. When either feature gains real rows, this test needs
   re-running against it rather than being treated as already covered.
   **Both of those are now handled, 5 August 2026, task
   `c3-audit-c3l44-c3l45-recurring-rls`.** The recurring version exists at
   `scripts/rls-recurring-check.mjs` and `.github/workflows/weekly-rls-check.yml`,
   and it labels each table meaningful or vacuous from its true row count, so
   the two empty tables start being genuinely tested the moment they hold a
   row rather than repeating the same empty pass.
   ~~It needs one thing from Sammy before it can run: `SUPABASE_ANON_KEY` as a
   repository secret. It has also not been executed end to end.~~
   **Both resolved. The secret was added and the check ran for real on
   5 August 2026 at 06:44 UTC, run 30982378152, and PASSED. Full result
   recorded under C3L-06. The Task 07 blind spot that it had never been
   executed end to end is now closed: it has, it works, and it took 32
   seconds.**
6. **The two open items Task 10 deliberately did not close, 5 August 2026,
   task `c3-audit-5-datasync`. Both are High and both were left open on
   purpose rather than half-done.**
   **C3L-49 is the one to do first, and it wants its own task.** The
   arrival-order slug guard that froze weissschwarz for 8 days
   (C3L-48) is still present in 30 other sync functions, and 56
   unique-on-slug indexes across the `_cards` and `_sets` tables make it
   fatal in every one of them the moment two names collide. It is not a
   find-and-replace: lowest-id-wins happened to match what weissschwarz had
   stored, but if any other game currently has a collision resolved the
   other way, applying the rule blind would **change live card URLs**. The
   task is to check each game's existing suffixed slugs against the rule
   first, then sweep only where the assignment is unchanged, and handle any
   game where it differs as its own decision with a redirect.
   **C3L-51 needs a decision from Sammy before any code.** Nothing reads
   `sync_events`, and pg_cron job 2 marks `webhook_fired = true` without
   firing anything, so the evidence that no alert went out is erased every
   6 hours. 14 games logged errors in the last 30 days and not one of them
   reached a human. The open question is where an alert should go, the
   `ccc.squadhelp@gmail.com` inbox, Resend, or a GitHub Actions job that
   reads the table and fails loudly, and that is a choice, not a patch.
   Also carried: `source` is still populated by only `sync-mtg-daily.mjs`,
   so 31 games have the column and no writer (C3L-52).
7. Wave 1 slugs (`1-claims`, `3-pricing`, `4-links`), each in its own
   worktree per Part 0. `3-pricing` should inherit C3L-11 and C3L-12 as
   known context rather than rediscovering them.
8. Housekeeping carried from this session: `c3-master-audit-findings-and-actions-v1.md`
   is not present anywhere on the laptop and so was never seeded into the
   repo, only the protocol and this register were. Protocol Section 0 marks
   it historical seed content superseded by this file, so nothing is
   blocked, but if a copy exists elsewhere it should be added for the
   record. `C3_SESSION_RULES.md`, named in the kickoff task file, does not
   exist in the repo either, and no file of that name was found on the
   machine.
9. This section becomes a pointer to whichever wave or slug is currently
   active, updated by whoever picks up the next task, every time, not just
   at convenient checkpoints.

---

## 11. How to work through this file across sessions

1. Open this file at the start of any task that touches anything it could
   plausibly cover, not just audit-labelled tasks. A bug fix, a feature
   build, anything that could confirm, close, or contradict a row here
   counts.
2. Update Status fields and the Summary counts (Section 9) in place as work
   happens. Never delete a row. The task log (Section 1) gets a new row at
   the top every time, the findings tables get edited in place.
3. When the second external pass's structured register (the 1 August
   report's xlsx) becomes available, append it as `C3S2-` per Section 2,
   cross-check for overlap with the existing C3- and C3X- ranges before
   treating anything in it as wholly new, note any confirmed duplicate
   rather than double-counting it in Section 9.
4. **Once any single section's table exceeds roughly 25 to 30 rows,** split
   that section into `###` subsections by theme, the way category size
   forced Voxsanity's own register to break Section 3 into ten subsections
   rather than one long table. This file has not hit that size yet
   (largest section is 16 rows), but Wave 1 alone could push several
   sections past it quickly, watch for it rather than waiting for the file
   to become unreadable before acting.
5. Before declaring any wave or slug "done," re-read protocol Sections 0
   and 15 first, the two mandates and the no-known-safe rule. The habit
   this file exists to catch is calling something complete too early, that
   check is part of the process, not optional.
