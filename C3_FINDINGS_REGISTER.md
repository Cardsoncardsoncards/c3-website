# C3 Findings Register

Canonical, single source of truth for every audit finding and every task's
outcome. This file lives in the repo and is git-tracked, it is not a
Downloads or project-only copy. Same pattern as Voxsanity's own register.

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
- **Section headings carry their ID range in the title** (for example,
  "Section 6, IDs C3X-01 to C3X-16"), and Section 9 keeps a running count,
  the same pattern that kept Voxsanity's much larger register navigable
  once its volume grew past what a flat read-through could handle. Section
  11 has the concrete rule for when a section needs splitting further.

---

## 1. Task log, append only, newest first

| Date | Task or slug | What happened | Six-line report (condensed) |
|---|---|---|---|
| 2026-08-04 | `c3-audit-urgent-c3l12`, Claude Code, laptop, own worktree | Task 01. C3L-12 fixed and applied to the live database with 12 hours to spare against the 20:00 UTC 5 August deadline: both windows now anchor on the newest snapshot actually held and return NULL when the real window is more than 1 day from nominal. C3L-08 fixed, including the `package-lock.json` update without which `npm ci` would have failed and broken the MTG sync that was repaired earlier today. All 7 sibling functions read individually and logged as their own rows (C3L-17 to C3L-23): all 7 share the defect but none is currently wrong, because only MTG has a snapshot gap. Investigating where the value is displayed found two further live defects on the MTG card page that are a different mechanism entirely (C3L-15, C3L-16), one of them already wrong today and one that will freeze every MTG price chart around 10 August | Compliance: no privacy, EPN, Amazon, Scryfall attribution or `/legal` surface touched. This work reduces a live ACCC misleading-pricing exposure rather than creating one. Removal: none, first repair of this function. Suggestions: apply the same tolerance to the 7 siblings before their next outage rather than after (C3L-17 to C3L-23), and give `update_price_stats` a minimum-sample guard (C3L-25). Blind spots: the fix was verified by checksum against an independently computed expectation and by date simulation, but no test exercises the NULL path end to end against real production data, because doing so would have required faking snapshot rows. C3L-15 and C3L-16 were found by reading, not by any test, and nothing in this pass would have caught them if the task had not required checking the display path. Opportunities: none new. Fragility: the 5 August run will publish an 8 day window as "7d", which is the chosen tolerance working as designed rather than a residual bug, stated here so it is not mistaken for one later |
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

## 3. Confirmed findings, live investigation (IDs C3L-01 to C3L-25)

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
| C3L-06 | No table in the public schema uses the `authenticated` role in any policy, `rowsecurity` is `true` on all roughly 140 tables checked. Account, follow, and follow-magic-link data has no `anon` policy at all beyond `service_role`, the browser cannot touch those tables directly under any circumstance | Confirmed via `pg_tables.rowsecurity` and `pg_policies` across the full schema | Informational, positive finding, but shifts real risk to Netlify function code, which this session could not read. Section 12's authentication-without-authorisation pattern still needs checking there specifically |

| C3L-07 | `downloadBulkFile()` called `bulkRes.json()` without ever checking `bulkRes.ok`, in direct breach of CLAUDE.md's own "ALWAYS check res.ok before calling res.json()" rule. This is why the failure presented as "Could not find default_cards bulk URL", a message that pointed at the wrong cause: any non-200 from Scryfall would have produced the identical misleading error, and the entry was in fact present the whole time, only its URL field had been renamed | Read directly from `scripts/sync-mtg-daily.mjs:105-112` at the failing commit, cross-checked against the live endpoint returning HTTP 200 with a healthy `default_cards` entry, which ruled out the message's literal claim | Was high, now resolved. Fixed in the same change as C3L-01. A wrong error message cost real diagnostic time across seven days of failures |
| C3L-08, resolved 2026-08-04 | `scripts/sync-mtg-daily.mjs` imports `stream-chain` directly, but `stream-chain` is not declared in `package.json`. It resolves today only because `stream-json` depends on it and `package-lock.json` pins it, so `npm ci` happens to install it. A `stream-json` major bump that drops or renames that dependency would break the MTG sync with no change to C3's own code | Confirmed via `package.json` dependencies (only `@supabase/supabase-js` and `stream-json`), `stream-json`'s own dependency on `stream-chain ^2.2.4`, and the lock file pinning it | Medium. Not fixed in this change deliberately, since regenerating the lock file mid-incident-fix widens the blast radius of a repair that needed to land cleanly. One-line fix, should be its own commit |
| C3L-09 | Both sync workflows pin `node-version: '20'` and use `actions/checkout@v4` and `actions/setup-node@v4`. GitHub is deprecating Node 20 on runners and is already force-running these actions on Node 24, emitting a deprecation warning on every run. This is a scheduled future breakage of the same job that just failed for seven days, not a hypothetical | Read directly from the 4 August run log's own post-job warning, and from `.github/workflows/daily-mtg-sync.yml:31` and `daily-tcg-sync.yml` | Medium, but time-boxed by GitHub's own removal date, not by C3's priorities. Applies to `daily-tcg-sync.yml` too, so it is not MTG-specific |
| C3L-10 | Nothing anywhere alerts on sync failure. Seven consecutive daily failures produced no page, no dashboard state, and no `sync_events` row, and were noticed only because a GitHub Actions failure email happened to be read. The two downstream pg_cron jobs meanwhile reported `succeeded` daily on frozen input (C3L-03), so every automated signal available said the system was healthy while the highest-revenue game served week-old prices | Confirmed by the seven-day failure run history against C3L-03's `succeeded` cron records and C3L-04's absence of any `sync_events` row for the failing job | High. This is the finding that made a one-line upstream change cost a week. The freshness assertion suggested under C3L-03 belongs here, a sync that writes zero new snapshots should exit non-zero |

| C3L-11 | The seven-day outage left a permanent, unbackfillable six-day hole in `mtg_price_snapshots`: 29 July to 3 August 2026 inclusive have zero rows, while 28 July has 52,445 and 4 August has 52,623. Scryfall's bulk data is point-in-time and carries no history, so those six days cannot be recovered from the source. This is the durable cost of the outage and it does not go away now that the sync works | Direct query, `generate_series` over 25 July to 4 August left-joined against `mtg_price_snapshots`, six days returning 0 | High, and permanently unfixable rather than merely open. Matters because it is the input to every derived signal, see C3L-12. Should be recorded as a known history gap wherever price history is presented or exported |
| C3L-12, resolved 2026-08-04, live in the database, see the resolution note below | `update_mtg_price_changes()` takes `MAX(snapshot_date) <= CURRENT_DATE - 7` (and `- 30`), meaning it silently falls back to the nearest older snapshot rather than requiring an actual seven-day-old one. Because of C3L-11's gap it will therefore publish windows of 8, 9, 10, 11, 12 and 13 days as `price_change_7d` on 5 to 10 August, self-healing on 11 August, and windows of 31 to 36 days as `price_change_30d` from 28 August to 2 September, self-healing on 3 September. The same defect already produced a wrong number during the outage: on 3 August it compared 28 July against 27 July, publishing a one-day movement as a seven-day change. The value is never NULL and never flagged, so a card page shows a confident "7 day change" that is not one | Confirmed by reading `pg_get_functiondef` for the live function, then by a date-arithmetic simulation over the real snapshot dates plus projected daily snapshots, run for both the 7d and 30d windows. Two structurally different methods, the function body and the data | High, and time-critical rather than merely open. The next `update-mtg-price-changes-daily` run (20:00 UTC daily) is correct tonight, 4 August, because 28 July happens to be exactly seven days back. It first publishes a mislabelled window at 20:00 UTC on 5 August. Not fixed this session: the remedy is a product decision about whether an unavailable window should show NULL, or a widened window with a visible low-confidence flag, which protocol Section 5 point 5 already calls for and which is Claude.ai's call, not Claude Code's |
| C3L-13 | Positive finding, object-level authorisation is genuinely present on the follow mutation path, not merely authentication. `deleteFollow()` and `unsubscribeFollow()` both filter on `id=eq.<followId>&user_id=eq.<userId>` together, so a caller supplying another user's follow id changes nothing. The `/account/admin` view, which renders every account email and every follow, is gated server-side by `!session || !isAdmin(session.email)` returning a plain 404, with the email taken from the HMAC-signed session cookie rather than from client input | Read directly from `netlify/functions/shared/accounts-core.mjs:330-349` and `netlify/functions/account.mjs:789-797`, then confirmed live: `/account/admin` and `/account/admin/` both return 404 unauthenticated, `/account` returns the 200 sign-in page as designed | Informational, positive. This is the specific authentication-without-authorisation pattern protocol Section 12 names, checked and not found on this path. It does not close protocol Section 4, whose two-account live test still has not run, see Section 10 |
| C3L-14 | Positive finding, no Supabase key of any kind reaches the browser. Eleven live pages (`/`, `/cards`, `/compare`, `/market`, `/search`, `/account`, `/tools`, `/subscribe`, `/pricing`, `/shop`, `/calendar`) contain zero JWT-shaped strings and zero references to a service, secret, or anon key variable, and link zero JavaScript asset files, because the site is server-rendered through Netlify functions. C3 therefore does not have the shipped-anon-key surface that protocol Section 4's cited vulnerability class assumes | Live fetch of all eleven pages, regex sweep for JWT-shaped strings and for key variable names, plus a follow-up sweep of every linked `.js` asset, of which there were none | Informational, positive, and it narrows real risk rather than removing it. With no anon key in the browser, the PostgREST-with-anon-key half of Section 4 is largely moot and the genuine exposure surface is the Netlify function code, exactly as C3L-06 concluded from the other direction |

| C3L-15 | The MTG card page does not use `price_change_7d` at all. It computes its own "7d" badge from `snapshots.slice(-7)`, the last seven snapshot ROWS, with no reference to dates. Because of C3L-11's six-day hole those seven rows currently span 23 July to 4 August, so the badge on every MTG card page is presenting a **12 calendar day** movement as "7d". Unlike C3L-12 this is wrong right now, today, not from 5 August, and fixing C3L-12 does not touch it because it is a completely separate mechanism | Read from `netlify/functions/card-page.mjs:240-249` (`snapshots.slice(-7)`) and `:1392` (the query that fills `snapshots`), then confirmed by querying the seven most recent snapshot dates for the most-snapshotted card, which span 2026-07-23 to 2026-08-04, 12 days | High, and live now. Not fixed in this task: Task 01's Step 5 requires the diff to address exactly C3L-12 and nothing broader, and this is a different defect in a different file. It self-heals around 11 August as fresh dailies push the gap out of the last seven rows, but it is wrong every day until then. Needs its own task, and the fix is to select by date window rather than by row count |
| C3L-16 | Same file, latent and separate: `card-page.mjs:1392` queries `mtg_price_snapshots?...&order=snapshot_date.asc&limit=90`, which returns the OLDEST 90 rows, not the newest. It is harmless today only because the most-snapshotted MTG card currently has 84 snapshots. Once any card exceeds 90, its price chart and its 7d badge silently freeze on the oldest 90 days and never advance again, while continuing to render as current | Confirmed by reading the query, then by `select max(cnt)` over per-card snapshot counts, which returns 84 against a limit of 90, growing by one per day | High, with a near-term trigger. At one snapshot per day from a current maximum of 84, the first cards cross 90 around 10 August 2026. Not fixed here for the same scope reason as C3L-15, and it should be fixed in the same task, since both live in the same function and both concern the same query result |
| C3L-17 | `update_pokemon_price_changes()` does NOT share C3L-12's code shape. It uses four temp tables and a per-card `DISTINCT ON (card_id) ... WHERE snapshot_date <= day7_date ORDER BY card_id, snapshot_date DESC`, resolving a nearest-older snapshot per card rather than one global anchor date, and it also maintains `price_change_24h`, which MTG does not. It does however share the underlying defect: there is no tolerance check anywhere, so a card whose nearest snapshot is far from the target silently yields a mislabelled window | Full function body read via `pg_get_functiondef`, plus a structural comparison across all 8 functions confirming `has_any_tolerance_check` is false for every one | Medium, not currently wrong. Pokemon has 0 missing snapshot days in the last 31, so no window is mislabelled today. This is a latent defect that activates on that game's first sync outage |
| C3L-18 | `update_yugioh_price_changes()`. Same per-card `DISTINCT ON` temp-table shape as C3L-17, same absent tolerance check, same `price_change_24h` handling. Structurally different from MTG, logically the same defect | Function body read individually via `pg_get_functiondef` | Medium, not currently wrong, 0 missing snapshot days in the last 31 |
| C3L-19 | `update_lorcana_price_changes()`. Same per-card `DISTINCT ON` temp-table shape, no tolerance check. Differs slightly from the Pokemon and Yu-Gi-Oh variants in using `CREATE TEMP TABLE IF NOT EXISTS` plus `TRUNCATE` rather than a plain `CREATE TEMP TABLE`, and it sets no `statement_timeout`, but the window logic is identical | Function body read individually via `pg_get_functiondef` | Medium, not currently wrong, 0 missing snapshot days in the last 31 |
| C3L-20 | `update_onepiece_price_changes()`. Same shape and same absent tolerance check as C3L-19, including the `IF NOT EXISTS` plus `TRUNCATE` variant | Function body read individually via `pg_get_functiondef` | Medium, not currently wrong, 0 missing snapshot days in the last 31 |
| C3L-21 | `update_starwars_price_changes()`. Same per-card `DISTINCT ON` shape, no tolerance check. Separately worth noting: Star Wars Unlimited is the only Core game whose latest snapshot is 2026-08-03 rather than 2026-08-04, so it is one day behind at the time of checking. That is not necessarily a fault, its sync may simply not have run yet today, but it was not chased down in this task and is unconfirmed either way | Function body read individually via `pg_get_functiondef`, staleness from a per-game latest-snapshot query | Medium for the tolerance defect. The one-day lag is unconfirmed and should be checked rather than assumed benign |
| C3L-22 | `update_riftbound_price_changes()`. Same per-card `DISTINCT ON` shape, no tolerance check | Function body read individually via `pg_get_functiondef` | Medium, not currently wrong, 0 missing snapshot days in the last 31 |
| C3L-23 | `update_dragonball_price_changes()`. Same per-card `DISTINCT ON` shape, no tolerance check. Note this function is for `dragonball`, the EXTENDED game, not for `dbsfusionworld`, the Core one. There are 8 `update_<game>_price_changes` functions and 8 matching cron jobs, but the set they cover is the Core 8 with `dbsfusionworld` swapped out for `dragonball`. This is a fourth instance of the known Core/Extended Dragon Ball confusion already documented in CLAUDE.md, which lists three others | Function body read individually, plus `cron.job` showing `update-dragonball-price-changes-daily` exists and no `dbsfusionworld` job exists at all | Medium for the tolerance defect, and the Core/Extended mismatch is worth folding into whichever task closes CLAUDE.md's existing three-place inconsistency rather than fixing in isolation |
| C3L-24 | `dbsfusionworld`, the Core 8 Dragon Ball game, is the only Core game with no price-change function and no cron job. Its `price_change_24h/7d/30d` values are not computed from C3's own snapshots at all, they are written straight through from the upstream tcgapi.dev response by `sync-dbsfusionworld-background.mjs`. So it is neither affected by C3L-12 nor verifiable against C3's own snapshot history, and the window those upstream percentages actually represent is unknown and undocumented | Confirmed by the absence of any `update_dbsfusionworld_price_changes` function, zero matching `cron.job` rows, and by reading `sync-dbsfusionworld-background.mjs:293-313` where the values are assigned from `price.price_change_*` | Medium, informational rather than broken. Logged because an earlier hypothesis in this same session, that these values were simply stale, was wrong: they have different provenance, not no provenance. Worth confirming what window the upstream figure represents before any page presents it beside a C3-computed one |
| C3L-25 | `update_price_stats()` is a third window mechanism, different again from C3L-12 and C3L-15. It averages over a date RANGE (`snapshot_date >= CURRENT_DATE - INTERVAL '7 days'`) rather than anchoring on a single snapshot, so C3L-11's hole makes `price_7d_avg_aud` and `price_30d_avg_aud` averages over fewer samples rather than wrong windows, and it writes only where `snapshot_date = CURRENT_DATE`, so it silently did nothing at all for the whole outage. It has no minimum-sample guard, which is exactly protocol Section 5 point 5 | Function body read via `pg_get_functiondef` | Medium. A materially smaller error than C3L-12, logged separately rather than folded in because it is a different failure mode and a different fix |

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
- RLS and BOLA verification, the two-account object-level access test
  specifically (protocol Section 4). Section 3's C3L-06 confirms the
  database layer, this test has not yet run.
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

- **Live-investigation findings (C3L-):** 25 total. 7 resolved with evidence
  (C3L-01, C3L-02, C3L-04, C3L-05, C3L-07, C3L-08, C3L-12). 5 high and still
  open (C3L-03, C3L-10, C3L-11, C3L-15, C3L-16), of which C3L-11 is
  permanently unfixable rather than merely outstanding, C3L-15 is wrong on
  live MTG card pages today, and C3L-16 triggers around 10 August 2026.
  10 medium and still open (C3L-09, and C3L-17 to C3L-25). 3 informational
  and positive (C3L-06, C3L-13, C3L-14).
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
- **Resolved this file's lifetime:** 7 (C3L-01, C3L-02, C3L-04, C3L-05,
  C3L-07, C3L-08, C3L-12).
- **Total rows this file currently tracks:** 66, across 4 ID ranges, out of
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
   12 hours before the 20:00 UTC 5 August deadline.** The decision it needed
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
3. **C3L-10, no sync alerting**, which is why a one-line upstream change
   cost seven days. A sync that writes zero snapshots should exit non-zero,
   and a failure should surface somewhere other than an email nobody is
   obliged to read.
4. Protocol Section 4's RLS/BOLA test, the **two-account object-level access
   test specifically, which still has not run.** What did run this session
   is the code-level and anon-exposure half: object-level authorisation
   confirmed present on the follow mutation path and the admin view
   (C3L-13), and no key of any kind reaching the browser (C3L-14). Neither
   substitutes for two real synthetic accounts exercising the live
   endpoints, which is the actual method Section 4 specifies. Run it as
   `c3-audit-0-rls` in its own worktree.
5. Wave 1 slugs (`1-claims`, `3-pricing`, `4-links`), each in its own
   worktree per Part 0. `3-pricing` should inherit C3L-11 and C3L-12 as
   known context rather than rediscovering them.
6. Housekeeping carried from this session: `c3-master-audit-findings-and-actions-v1.md`
   is not present anywhere on the laptop and so was never seeded into the
   repo, only the protocol and this register were. Protocol Section 0 marks
   it historical seed content superseded by this file, so nothing is
   blocked, but if a copy exists elsewhere it should be added for the
   record. `C3_SESSION_RULES.md`, named in the kickoff task file, does not
   exist in the repo either, and no file of that name was found on the
   machine.
7. This section becomes a pointer to whichever wave or slug is currently
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
