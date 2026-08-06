// Regression test for the pokemon enrichment backfill's per-set decision (C3L-102).
//
// Every case below is taken from the first real run on 6 August, which burned five sets by
// recording them as done having enriched nothing. The point of the test is that those exact
// inputs must now produce needsRetry rather than done.
//
// Run: node scripts/test-enrichment-outcome.mjs

import { classifySetOutcome, orderQueue, MAX_ATTEMPTS } from '../netlify/functions/shared/enrichment-outcome.mjs';

let pass = 0, fail = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label);
  if (!ok) {
    console.log('   expected ' + JSON.stringify(want));
    console.log('   got      ' + JSON.stringify(got));
  }
  ok ? pass++ : fail++;
}
const rd = o => ({ record: o.record, needsRetry: o.needsRetry, cardsUpdated: o.cardsUpdated });

// ---- the five sets the first run actually burned ----

// Crown Zenith: resolved to swsh12pt5, 48 cards present, 0 matched on name|number.
check('Crown Zenith, set matched but 0 of 48 cards matched, must RETRY not done',
  rd(classifySetOutcome({ ptcgSetId: 'swsh12pt5', cardsInSet: 48, cardsEnriched: 0, error: null })),
  { record: true, needsRetry: true, cardsUpdated: 0 });

// XY Steam Siege: 152 cards, no upstream match at all.
check('XY Steam Siege, 152 cards and no upstream match, must RETRY not done',
  rd(classifySetOutcome({ ptcgSetId: null, cardsInSet: 152, cardsEnriched: 0, error: null })),
  { record: true, needsRetry: true, cardsUpdated: 0 });

// Base Set: 8 cards, no upstream match.
check('Base Set, 8 cards and no upstream match, must RETRY not done',
  rd(classifySetOutcome({ ptcgSetId: null, cardsInSet: 8, cardsEnriched: 0, error: null })),
  { record: true, needsRetry: true, cardsUpdated: 0 });

// Sandstorm: matched ex2 but holds 0 cards. Genuinely nothing to do, must NOT retry forever.
check('Sandstorm, matched upstream but holds 0 cards, is genuinely DONE',
  rd(classifySetOutcome({ ptcgSetId: 'ex2', cardsInSet: 0, cardsEnriched: 0, error: null })),
  { record: true, needsRetry: false, cardsUpdated: 0 });

// McDonald's Promos: no match and no cards. Also genuinely done.
check("McDonald's Promos, no match and no cards, is genuinely DONE",
  rd(classifySetOutcome({ ptcgSetId: null, cardsInSet: 0, cardsEnriched: 0, error: null })),
  { record: true, needsRetry: false, cardsUpdated: 0 });

// ---- the upstream error that killed the whole run ----
check('pokemontcg.io 500, records a retry rather than aborting or being lost',
  rd(classifySetOutcome({ ptcgSetId: 'base4', cardsInSet: 100, cardsEnriched: 0,
                          error: 'pokemontcg.io 500 for set base4' })),
  { record: true, needsRetry: true, cardsUpdated: 0 });

const errOut = classifySetOutcome({ ptcgSetId: 'base4', cardsInSet: 100, cardsEnriched: 0,
                                    error: 'pokemontcg.io 500 for set base4' });
check('the error text is preserved for diagnosis',
  errOut.lastError, 'pokemontcg.io 500 for set base4');

// ---- the happy path still works ----
check('a set that actually enriched is DONE',
  rd(classifySetOutcome({ ptcgSetId: 'sv1', cardsInSet: 200, cardsEnriched: 198, error: null })),
  { record: true, needsRetry: false, cardsUpdated: 198 });

// ---- queue ordering ----
const q = orderQueue([
  { id: 5, progress: { needs_retry: false, attempts: 0, backfilled_at: '2026-08-06T01:00:00Z' } },
  { id: 2, progress: null },
  { id: 9, progress: { needs_retry: true, attempts: 1, backfilled_at: '2026-08-06T02:00:00Z' } },
  { id: 1, progress: null },
  { id: 7, progress: { needs_retry: true, attempts: MAX_ATTEMPTS, backfilled_at: '2026-08-06T00:00:00Z' } }
]);
check('queue: never-attempted first by id, then retries, then the rest',
  q.map(x => x.id), [1, 2, 9, 7, 5]);

// A set that has exhausted MAX_ATTEMPTS must NOT sit at the front forever, which is what would
// starve every set behind a permanently unmatchable one.
const starved = orderQueue([
  { id: 7, progress: { needs_retry: true, attempts: MAX_ATTEMPTS, backfilled_at: '2026-08-06T00:00:00Z' } },
  { id: 8, progress: { needs_retry: false, attempts: 0, backfilled_at: '2026-08-06T05:00:00Z' } }
]);
check('an exhausted retry does not block a healthy set behind it',
  starved.map(x => x.id), [7, 8]);
check('and it is ranked as ordinary rotation, not as a priority retry',
  orderQueue([
    { id: 8, progress: { needs_retry: false, attempts: 0, backfilled_at: '2026-08-06T05:00:00Z' } },
    { id: 9, progress: { needs_retry: true, attempts: 1, backfilled_at: '2026-08-06T06:00:00Z' } },
    { id: 7, progress: { needs_retry: true, attempts: MAX_ATTEMPTS, backfilled_at: '2026-08-06T00:00:00Z' } }
  ]).map(x => x.id), [9, 7, 8]);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
