# C3L-34 investigation, 5 August 2026

Task 03. No behaviour was changed. No migration was applied, no displayed
figure or verdict was altered. This document is the before-and-after for
review, and the queries behind it.

Investigated by Claude Code on the laptop, worktree
`c3-audit-c3l34-investigation`, against the live Supabase project
`owaroeqchreuffbyakqx` and the repo at commit `6d79037`.

---

## 1. The headline correction

**C3L-34 as written in the register was substantially wrong, and this
investigation's first job is to say so.**

It claimed the card page "is presenting a 92 day extreme as a 52 week one".
It is not. The card page labels these figures **"Recent High"** and **"Recent
Low"** (`card-page.mjs:791` and `:793`), and the verdict reads **"Near recent
high"**, **"Near recent low"** or **"Mid-range price"**
(`getSignalVerdict`, `card-page.mjs:167`). The word "recent" is accurate for
an 84 day window. Nothing on the card page claims 52 weeks.

The "52w" naming survives only in the database column names
(`price_52w_high_aud`, `price_52w_low_aud`), in internal variable names, and
in code comments. That was a deliberate, documented decision, not an
oversight. `market-data.mjs:223-224` states it plainly:

> The high/low spans all price history C3 holds, roughly ten weeks, not a
> true 52 week window. The columns are named 52w because the schema predates
> that. Copy says "recent".

A second comment, `sync-mtg-daily.mjs:416`, says the same thing
independently. So two separate places in the codebase already knew and
recorded this.

**What is actually exposed** is one sentence of marketing copy, on the
features list at `src/cards.html:708`:

> "90-day price charts on every MTG card. See 52-week highs, lows, and trend
> direction before you buy or sell."

That single sentence contradicts both the deliberate convention and the data.
It is the entire user-facing 52 week claim on the site. A repo-wide search for
user-visible "52 week", "52-week" or "52w" text returns this line and nothing
else.

---

## 2. Does a correct 52 week computation change any number today

**No. Not one.**

`compute_mtg_signals_batch` takes `MIN(price_aud)` and `MAX(price_aud)` over a
card's entire snapshot history with no date filter. Adding a true
`snapshot_date >= CURRENT_DATE - 365` filter was tested against 5,000 cards:

| Cards compared | Lows that differ | Highs that differ |
|---|---|---|
| 5,000 | 0 | 0 |

All history is younger than 52 weeks, so an unfiltered window and a correct
52 week window currently return identical values. **C3L-34 is a naming and
copy problem today, not a value problem.** It becomes a value problem on
**4 May 2027**, when history first exceeds 365 days and the missing filter
starts pulling in data older than 52 weeks that a correct window would drop.

That date is the real deadline for the fix, not any date this year.

---

## 3. The actual scope

| Measure | Value |
|---|---|
| Earliest snapshot | 2026-05-04 |
| Latest snapshot | 2026-08-04 |
| Calendar span | **92 days** |
| Distinct days actually collected | **84** (the 6 day C3L-11 outage plus 2 others) |
| `mtg_signals` rows | 43,507 |
| Rows carrying a high and a low | 43,507 (100 per cent) |
| Cards with a buy verdict | 4,634 |
| Cards with a sell verdict | 8,693 |
| **Cards with any verdict** | **13,327** |
| Signals last computed | 2026-08-04 21:00 UTC |

Note the register and Task 02 both said "92 days". The calendar span is 92,
but only 84 days were actually collected. Both numbers are true and they mean
different things, so both are recorded here.

### History length varies enormously between cards

This is the finding that matters more than the naming.

| Measure | Value |
|---|---|
| Cards with priced history | 83,162 |
| Shortest history | **1 day** |
| Longest history | 84 days |
| Mean | 41.7 days |
| Median | 33 days |
| Cards with 7 days or fewer | **39,263 (47 per cent)** |
| Cards with 30 days or fewer | 41,405 |
| Cards with 80 days or more | 37,944 |

So "recent high" does not mean the same thing from one card page to the next.
On one card it is 84 days of observation. On another it is a single day.

### Verdicts issued on very short history

Cross-referencing verdicts against history length:

| History | Signal rows | Buy | Sell | Any verdict |
|---|---|---|---|---|
| 1 to 7 days | 816 | 52 | 239 | **291** |
| 8 to 14 days | 499 | 114 | 127 | **241** |
| 15 to 30 days | 845 | 166 | 191 | 357 |
| 31 to 60 days | 2,180 | 535 | 347 | 882 |
| 61 to 84 days | 39,167 | 3,767 | 7,789 | 11,556 |

**532 cards currently carry a buy or sell verdict derived from 14 days of
history or less.** The degenerate case is handled: a card with one day of
history has high equal to low, the `high > low * 1.30` volatility gate fails,
and no verdict is issued. But a card with 6 days and a noisy price passes that
gate easily.

---

## 4. How the verdict is actually decided

Precisely, because a fix has to preserve this.

Written by `compute_mtg_signals_batch` into `mtg_signals`:

```
buy  = (high > low * 1.30) AND (latest_price <= low  * 1.10)
sell = (high > low * 1.30) AND (latest_price >= high * 0.90)
```

So it is **two thresholds, not one**: a volatility gate requiring the range to
be at least 30 per cent of the low, and then a proximity test putting the
current price within 10 per cent of either end. Both are ratio comparisons
against the high and low, so any change to how high and low are derived moves
verdicts directly.

Displayed by `getSignalVerdict` in `card-page.mjs`, which maps `sell` to "Near
recent high", `buy` to "Near recent low", and everything else to "Mid-range
price". Note that a card with no verdict and a card with insufficient data
both render as "Mid-range price", which is a claim rather than an absence.

The same two columns also drive `/market` ("X% off high", "Near X% of high")
and the weekly seller email ("List these now, near their recent high"). All of
that copy says "recent" or just "high", none of it says 52 week.

---

## 5. Before and after, real cards

"Now" is exactly what a visitor sees on the live card page today.

Approach **(a)** is relabel honestly: keep the window, state it truthfully.
Approach **(b)** is withhold the figure and any verdict depending on it until
genuine 52 week history exists, which is 4 May 2027 at the earliest.

| Card (set) | Days of history | Price now | Recent Low shown | Recent High shown | Verdict now | Under (a) | Under (b) |
|---|---|---|---|---|---|---|---|
| Tundra (leb) | 1 | $5,945 | $5,945 | $5,945 | Mid-range price | Same figures, label becomes "84 day" or "since 4 May" | Low, high and verdict all withheld |
| Beorn the Fierce (hob) | 6 | $59.02 | $25.17 | $59.02 | **Near recent high** | Unchanged | Withheld |
| Beorn the Fierce (hob, other printing) | 6 | $92.22 | $92.22 | $135.84 | **Near recent low** | Unchanged | Withheld |
| Gandalf, Goblins' Bane (hob) | 8 | $207.32 | $207.32 | $285.93 | **Near recent low** | Unchanged | Withheld |
| Bounty of the Hunt (wc97) | 9 | $2.56 | $0.56 | $2.56 | **Near recent high** | Unchanged | Withheld |
| Ancestral Recall (2ed) | 11 | $7,149.93 | $7,149.93 | $7,149.93 | Mid-range price | Unchanged | Withheld |
| Scrubland (leb) | 27 | $3,003 | $3,003 | $3,045 | Mid-range price | Unchanged | Withheld |
| **Ornithopter (sum)** | 28 | $715 | **$0.07** | $725 | **Near recent high** | Unchanged, and still wrong, see below | Withheld |
| Bilbo, Thief in the Night (hob) | 29 | $36.59 | $36.59 | $60.87 | **Near recent low** | Unchanged | Withheld |
| Gauntlet of Might (leb) | 72 | $858 | $858 | $1,232.49 | **Near recent low** | Unchanged | Withheld |
| Timetwister (2ed) | 84 | $8,651.49 | $7,095.99 | $8,651.49 | Mid-range price | Unchanged | Withheld |
| Time Walk (2ed) | 84 | $8,179.59 | $4,003.99 | $8,179.59 | **Near recent high** | Unchanged | Withheld |

### Does either approach flip any verdict

**Approach (a): no. Not one, on any card, anywhere in the catalogue.** It
changes labels only. Because a true 52 week window returns identical values
today (Section 2), relabelling cannot move a threshold. And because the card
page, `/market` and the weekly email already say "recent", approach (a) is
**already implemented everywhere except `src/cards.html:708`**. The entire
work of approach (a) is correcting one sentence of marketing copy.

**Approach (b): it removes every verdict on the site.** All 13,327 buy and
sell verdicts disappear, all 43,507 high and low figures disappear, the
buy/sell sections of `/market` render empty, and the weekly seller email loses
both of its signal sections. That state persists until **4 May 2027**, roughly
nine months. It is not a smaller change than (a), it is the removal of the
signals feature for most of a year.

---

## 6. A third option the data argues for, presented not chosen

Neither (a) nor (b) addresses what this investigation found to be the more
substantive problem, and both leave it in place.

**Ornithopter (sum)** displays a "Recent Low" of **$0.07** against a current
price of $715, a range of 1,035,614 per cent, and on that basis is labelled
"Near recent high". The $0.07 is not a real historical low, it is almost
certainly a bad snapshot. It is simultaneously a visibly wrong displayed
number and the input to a trading signal.

How common:

| Range (high / low) | Cards | Of which carry a verdict |
|---|---|---|
| Over 10x | 242 | **117** |
| Over 100x | 10 | |
| Over 1000x | 1 (Ornithopter) | |

So the option the data suggests is a **minimum-history and outlier guard on
the verdict**, in the same shape as C3L-25's minimum-sample guard and C3L-12's
tolerance: require some minimum number of collected days before issuing a buy
or sell verdict, and reject a low or high that is implausibly far from the
distribution. That would change roughly 532 short-history verdicts and up to
117 outlier-driven ones, which is a real before-and-after but a far smaller
one than (b), and unlike (a) it fixes something that is actually wrong.

This is recorded as an option, not a recommendation. The choice is Claude.ai's
and Sammy's.

---

## 7. Queries used

All read-only. Nothing in this investigation wrote to the database.

- History span and signal counts: aggregate over `mtg_price_snapshots` and
  `mtg_signals`.
- Per-card history distribution: `count(distinct snapshot_date)` grouped by
  `scryfall_id`, filtered to `price_aud > 0`.
- Verdict by history bucket: `mtg_signals` joined to that distribution.
- 365 day equivalence: `min`/`max` with and without
  `snapshot_date >= current_date - 365`, over a 5,000 card sample.
- Outlier ranges: ratio of `price_52w_high_aud` to `price_52w_low_aud`.
- Verdict mechanism: `pg_get_functiondef` on `compute_mtg_signals_batch`.
- Caller checks: `cron.job` command search, `pg_get_functiondef` scan across
  `prokind='f'`, and repo-wide grep.

---

## 8. Related findings opened by this investigation

- **C3L-38**: `updateSnapshotVerdicts()` in `sync-mtg-daily.mjs` is called on
  every sync (line 621) and fails on every sync, because the `exec_sql` RPC it
  depends on does not exist. Its own comment claims it is dormant, which is
  stale.
- **C3L-39**: 532 cards carry a buy or sell verdict built on 14 days of
  history or less.
- **C3L-40**: 242 cards have a high/low range over 10x, 117 of them carrying a
  verdict, driven by implausible lows such as Ornithopter's $0.07.
- **C3L-35 re-confirmed**: `update_price_stats` is still called by nothing,
  0 cron callers and 0 function callers.
