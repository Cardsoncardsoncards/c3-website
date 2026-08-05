# C3L-17 to C3L-23: window tolerance for the seven sibling price-change functions

Applied 5 August 2026 as two migrations, `c3l17_c3l23_sibling_tolerance_light`
(lorcana, onepiece, starwars, riftbound, dragonball) and
`c3l17_c3l23_sibling_tolerance_heavy` (pokemon, yugioh). They are split only because
the two heavy games carry `SET LOCAL statement_timeout`, `SET LOCAL enable_nestloop = off`
and a `RAISE NOTICE` row count that the other five do not, and those had to be preserved
verbatim.

The applied SQL is recorded in Supabase's own migration history under those two names.
This file is the reasoning, which the migration names alone do not carry.

## Not verbatim from MTG, because these are not MTG's function

Task 01 established that the siblings are structurally different and that was re-read here
rather than assumed. MTG resolves ONE global anchor date and compares every card against it.
These seven resolve the anchor PER CARD with
`DISTINCT ON (card_id) ... WHERE snapshot_date <= dayN ORDER BY snapshot_date DESC`.

So the tolerance check is also per card. The temp tables now carry the resolved `snap` date
alongside the price, and the comparison is `(t.snap - dN.snap)`, the real window for that
specific card, rather than one global window.

## Tolerance is 1 day for all seven, measured not copied

Every one of these games syncs daily. Average gap between snapshot dates is 1.11 to 1.21 days
across 74 to 82 distinct days of history, with 3 to 5 gaps longer than a day each and a worst
gap of 5 days, or 7 for yugioh. That is the same cadence MTG has, so the same reasoning
applies: a healthy day is an exact match, one day absorbs a single missed run, and two or more
would start presenting a nine-day movement as a weekly one.

## The anchors changed too, and that matters as much

They were `CURRENT_DATE - N` and are now `max_date - N`, where `max_date` is the newest
snapshot the game actually holds. Anchoring on the calendar means that during an outage the
target slides away from the data while the data stands still, which is exactly how MTG ended
up comparing 28 July against 27 July and calling it a seven-day change. Anchoring on the
newest snapshot held cannot do that.

An `IF max_date IS NULL THEN RETURN` guard is new as well: with no snapshots at all the old
version would have computed against NULL anchors rather than declining to answer.

## This was NOT purely preventive, which contradicts what C3L-17 to C3L-23 recorded

Those entries each said the sibling was "not currently wrong". At the GAME level that was
true, none of the seven had a game-wide gap like MTG's. At the PER-CARD level it was false,
and nobody had looked per card. Measured immediately after applying, the number of cards whose
window exceeded tolerance and are now suppressed:

| game | cards | 24h suppressed | 7d suppressed |
|---|---|---|---|
| pokemon | 30,049 | 3 | 12 |
| yugioh | 45,668 | 708 | 2,195 |
| lorcana | 3,306 | 0 | 7 |
| onepiece | 6,802 | 6 | 36 |
| starwars | 7,370 | 14 | 13 |
| riftbound | 1,241 | 1 | 10 |
| dragonball | 10,448 | 1 | 44 |
| **total** | | **733** | **2,317** |

Yugioh is 95 per cent of it, consistent with it having the worst cadence of the seven. The
worst individual case: cards whose "7 day change" was computed across an **88 day** window,
5 August against 9 May, because their only older snapshot is the first day of history.

## Rollback

Re-apply the previous definitions, which differ in exactly four ways per function: anchors read
`CURRENT_DATE` instead of `max_date`, the temp tables have no `snap` column, the three CASE
expressions have no `(t.snap - dN.snap) <= N + TOLERANCE_DAYS` condition, and there is no
`max_date` lookup or NULL guard. No table, column or row is touched, only seven function bodies.
