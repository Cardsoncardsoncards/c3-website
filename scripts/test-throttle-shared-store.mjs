// scripts/test-throttle-shared-store.mjs
//
// C3L-222, Part A and Part B. Controls for the change of STORAGE under the C3L-107 throttle,
// and for the two arguments /api/card-view has to pass for the check to be capable of firing
// at all.
//
// Run: node scripts/test-throttle-shared-store.mjs
//
// These are unit controls and they drive the memory store, so they run with no database and
// no network. They prove the LOGIC. They do not prove that the Postgres round trip works,
// because nothing running on a laptop can: the service credential is not readable here
// (C3L-221). That half is proved separately, against a real deploy preview with real
// Netlify instances, and the result is recorded in the C3L-222 register row.
//
// scripts/test-request-throttle.mjs still holds the threshold controls and is unchanged.
// This file deliberately does not restate them.

import {
  checkThrottle,
  createMemoryStore,
  THRESHOLDS,
  __resetForTests,
} from '../netlify/functions/shared/request-throttle.mjs';

const NEVER_VERIFIED = async () => false;
const NOW = Date.parse('2026-09-11T04:30:00Z');

function pageReq(ip, path) {
  return new Request(`https://cardsoncardsoncards.com.au${path}`, {
    headers: { 'x-nf-client-connection-ip': ip, 'user-agent': 'Mozilla/5.0' },
  });
}

function beaconReq(ip) {
  return new Request('https://cardsoncardsoncards.com.au/api/card-view', {
    method: 'POST',
    headers: { 'x-nf-client-connection-ip': ip, 'user-agent': 'Mozilla/5.0' },
  });
}

let failures = 0;
function report(name, passed, detail) {
  if (!passed) failures++;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}`);
  console.log(`      ${detail}`);
}

// ----------------------------------------------------------------------------------------
// 1. THE BUG, REPRODUCED. Spread one crawl across 8 instances that do not share a counter
//    and it is never throttled, which is precisely what happened on 10 to 11 September.
//    This control exists so the fix below is measured against the real failure rather than
//    against nothing.
// ----------------------------------------------------------------------------------------
async function perInstanceCountersMissIt() {
  __resetForTests();
  // Each simulated instance gets its own store AND its own local pre-gate memory, which is
  // what a Netlify instance actually has.
  const instances = Array.from({ length: 8 }, () => ({ store: createMemoryStore(), localState: new Map() }));
  let throttled = 0;
  const total = 2400;                       // 8x the 300 threshold, all distinct paths
  for (let i = 0; i < total; i++) {
    const inst = instances[i % instances.length];    // round robin, as a load balancer would
    const r = await checkThrottle(pageReq('43.172.192.9', `/cards/mtg/card-${i}`), {
      now: NOW, dnsVerify: NEVER_VERIFIED, store: inst.store, localState: inst.localState,
    });
    if (r.throttled) throttled++;
  }
  report(
    'reproduces C3L-222: 8 per-instance counters, 2,400 requests, no throttle',
    throttled === 0,
    `${total} requests over ${instances.length} instances at ${total / instances.length} each, `
      + `${throttled} throttled. Each instance stayed under ${THRESHOLDS.MAX_REQUESTS_PER_WINDOW}, `
      + 'so no instance ever saw a reason to act. This is the defect, not a passing grade.'
  );
}

// ----------------------------------------------------------------------------------------
// 2. THE FIX. The same crawl, the same 8 instances, one shared counter. Must throttle, and
//    must do it at the same request number a single instance would have.
// ----------------------------------------------------------------------------------------
async function sharedCounterCatchesIt() {
  __resetForTests();
  const shared = createMemoryStore();
  const N = 8;
  const instances = Array.from({ length: N }, () => ({ store: shared, localState: new Map() }));
  let throttled = 0;
  let firstAt = null;
  const total = 2400;
  for (let i = 0; i < total; i++) {
    const inst = instances[i % N];
    const r = await checkThrottle(pageReq('43.172.192.9', `/cards/mtg/card-${i}`), {
      now: NOW, dnsVerify: NEVER_VERIFIED, store: inst.store, localState: inst.localState,
    });
    if (r.throttled) { throttled++; if (firstAt === null) firstAt = i + 1; }
  }
  // The slop bound from the local pre-gate: each of the N instances may be holding up to
  // LOCAL_GATE - 1 requests it has not flushed yet.
  const bound = THRESHOLDS.MAX_REQUESTS_PER_WINDOW + (THRESHOLDS.LOCAL_GATE - 1) * N;
  report(
    'shared counter: the same 2,400 requests over 8 instances ARE throttled',
    throttled > 0 && firstAt > THRESHOLDS.MAX_REQUESTS_PER_WINDOW && firstAt <= bound + 1,
    `throttle engaged at request ${firstAt}, ${throttled} of ${total} rejected, across ${N} `
      + `instances sharing one window row. Threshold is ${THRESHOLDS.MAX_REQUESTS_PER_WINDOW}; `
      + `the local pre-gate (LOCAL_GATE=${THRESHOLDS.LOCAL_GATE}) admits a worst case slop of `
      + `(${THRESHOLDS.LOCAL_GATE} - 1) x ${N} = ${(THRESHOLDS.LOCAL_GATE - 1) * N}, so the bound `
      + `is ${bound}. MEASURED SLOP HERE: ${firstAt - 1 - THRESHOLDS.MAX_REQUESTS_PER_WINDOW} requests.`
  );
}

// ----------------------------------------------------------------------------------------
// 3. A SECOND INSTANCE SEES THE FIRST ONE'S COUNT. The narrower statement of the same thing,
//    asserted directly: instance B has served nothing, and its very first request is
//    rejected because instance A has already spent the window.
// ----------------------------------------------------------------------------------------
async function coldInstanceInheritsTheCount() {
  __resetForTests();
  const shared = createMemoryStore();
  const instA = new Map();

  let aThrottled = 0;
  for (let i = 0; i < 400; i++) {
    const r = await checkThrottle(pageReq('43.173.160.4', `/cards/pokemon/card-${i}`), {
      now: NOW, dnsVerify: NEVER_VERIFIED, store: shared, localState: instA,
    });
    if (r.throttled) aThrottled++;
  }

  // Instance B: cold, has never seen this block, shares only the store. Its first requests
  // sit under its own local pre-gate, so they are ALLOWED. This is the slop, measured rather
  // than assumed, and it is bounded by LOCAL_GATE per instance.
  const instB = new Map();
  let letThrough = 0;
  let rejectedAt = null;
  for (let i = 0; i < 60; i++) {
    const r = await checkThrottle(pageReq('43.173.160.4', `/cards/pokemon/on-B-${i}`), {
      now: NOW, dnsVerify: NEVER_VERIFIED, store: shared, localState: instB,
    });
    if (r.throttled) { rejectedAt = i + 1; break; }
    letThrough++;
  }

  report(
    'a COLD instance inherits the shared count, after its own local pre-gate',
    rejectedAt === THRESHOLDS.LOCAL_GATE && letThrough === THRESHOLDS.LOCAL_GATE - 1,
    `instance A served 400 requests (${aThrottled} rejected). A COLD instance B then let `
      + `${letThrough} requests through before rejecting at its request ${rejectedAt}, which is `
      + `LOCAL_GATE (${THRESHOLDS.LOCAL_GATE}). THAT IS THE SLOP, per instance, and it is the `
      + 'price of keeping the round trip out of ordinary page loads. Under the old in-memory '
      + 'Map, instance B would have allowed 300.'
  );
}

// ----------------------------------------------------------------------------------------
// 4. PART B, BREADTH. Dropped onto /api/card-view unmodified, the check can never fire: every
//    request carries the same URL path, so distinct paths is permanently 1. This control
//    fails loudly if anyone ever removes the breadthKey argument.
// ----------------------------------------------------------------------------------------
async function beaconNeedsABreadthKey() {
  __resetForTests();
  const shared = createMemoryStore();
  let naive = 0;
  for (let i = 0; i < 3000; i++) {
    const r = await checkThrottle(beaconReq('43.172.192.9'), {
      now: NOW, dnsVerify: NEVER_VERIFIED, store: shared, scope: 'card-view',
    });
    if (r.throttled) naive++;
  }
  report(
    'without a breadth key, 3,000 beacon POSTs are NOT throttled (the trap)',
    naive === 0,
    `${naive} throttled. Every request has path /api/card-view, so distinct paths stays at 1, `
      + `forever under the ${THRESHOLDS.MAX_DISTINCT_PATHS} breadth threshold. A checkThrottle `
      + 'call added here without a breadthKey is decoration.'
  );

  __resetForTests();
  const shared2 = createMemoryStore();
  let real = 0;
  let firstAt = null;
  for (let i = 0; i < 3000; i++) {
    const r = await checkThrottle(beaconReq('43.172.192.9'), {
      now: NOW, dnsVerify: NEVER_VERIFIED, store: shared2,
      scope: 'card-view', breadthKey: `mtg:card-${i}`,       // enumeration: each card once
    });
    if (r.throttled) { real++; if (firstAt === null) firstAt = i + 1; }
  }
  report(
    'with the card as the breadth key, an enumeration of 3,000 cards IS throttled',
    real > 0 && firstAt === THRESHOLDS.MAX_REQUESTS_PER_WINDOW + 1,
    `throttle engaged at request ${firstAt}, ${real} of 3000 rejected. This is the 10 to 11 `
      + 'September shape: each card reported exactly once.'
  );
}

// ----------------------------------------------------------------------------------------
// 5. PART B, THE NEGATIVE CONTROL THAT MATTERS. A real visitor refreshing one card page, and
//    a busy household or office on one /24, must not be throttled on the beacon.
// ----------------------------------------------------------------------------------------
async function beaconLetsRealVisitorsThrough() {
  __resetForTests();
  const shared = createMemoryStore();
  let throttled = 0;
  for (let i = 0; i < 2000; i++) {
    const r = await checkThrottle(beaconReq('203.0.113.15'), {
      now: NOW, dnsVerify: NEVER_VERIFIED, store: shared,
      scope: 'card-view', breadthKey: 'mtg:black-lotus',      // one card, refreshed hard
    });
    if (r.throttled) throttled++;
  }
  report(
    'one card refreshed 2,000 times is NOT throttled (volume without breadth)',
    throttled === 0,
    `${throttled} throttled. 2,000 requests is ${Math.round(2000 / THRESHOLDS.MAX_REQUESTS_PER_WINDOW * 10) / 10}x `
      + 'the request threshold, but one distinct card is not an enumeration.'
  );

  __resetForTests();
  const shared2 = createMemoryStore();
  let officeThrottled = 0;
  let requests = 0;
  for (let s = 0; s < 40; s++) {
    for (let p = 0; p < 5; p++) {
      requests++;
      const r = await checkThrottle(beaconReq('203.0.113.15'), {
        now: NOW, dnsVerify: NEVER_VERIFIED, store: shared2,
        scope: 'card-view', breadthKey: `mtg:visitor-${s}-card-${p}`,
      });
      if (r.throttled) officeThrottled++;
    }
  }
  report(
    '40 real visitors behind one /24 at 5 cards each are NOT throttled on the beacon',
    officeThrottled === 0,
    `${requests} beacon posts, ${requests} distinct cards, ${officeThrottled} throttled `
      + `(thresholds ${THRESHOLDS.MAX_REQUESTS_PER_WINDOW} AND ${THRESHOLDS.MAX_DISTINCT_PATHS})`
  );
}

// ----------------------------------------------------------------------------------------
// 6. PART B, SCOPE. The beacon must not spend the page budget. A card page load makes two
//    counted requests, and if they shared a bucket every real visitor's page allowance would
//    be quietly halved for no gain, since the beacon adds no breadth of its own.
// ----------------------------------------------------------------------------------------
async function scopesDoNotShareABudget() {
  __resetForTests();
  const shared = createMemoryStore();

  // 290 page loads, each with its beacon. Under one bucket that is 580 and over the line.
  for (let i = 0; i < 290; i++) {
    await checkThrottle(pageReq('203.0.113.99', `/cards/mtg/card-${i}`), {
      now: NOW, dnsVerify: NEVER_VERIFIED, store: shared,
    });
    await checkThrottle(beaconReq('203.0.113.99'), {
      now: NOW, dnsVerify: NEVER_VERIFIED, store: shared,
      scope: 'card-view', breadthKey: `mtg:card-${i}`,
    });
  }

  const nextPage = await checkThrottle(pageReq('203.0.113.99', '/cards/mtg/card-290'), {
    now: NOW, dnsVerify: NEVER_VERIFIED, store: shared,
  });
  report(
    'the beacon does not spend the page budget',
    nextPage.throttled === false,
    `after 290 page loads AND their 290 beacons (580 counted requests in total), page request `
      + `291 returned throttled=${nextPage.throttled} reason=${nextPage.reason}. Sharing one `
      + `bucket would have crossed ${THRESHOLDS.MAX_REQUESTS_PER_WINDOW} at request 151.`
  );
}

// ----------------------------------------------------------------------------------------
// 7. FAIL OPEN. A store that cannot answer must never cost a visitor their page. This is the
//    single most important control in the file: a rate limiter that turns a database blip
//    into a site outage has done more damage than any crawl.
// ----------------------------------------------------------------------------------------
async function failsOpen() {
  __resetForTests();
  const deadStore = {
    name: 'dead',
    async bump() { return null; },                       // timeout, 5xx, network error
    async recordBlock() { return null; },
  };
  let throttled = 0;
  let reason = '';
  for (let i = 0; i < 1000; i++) {
    const r = await checkThrottle(pageReq('43.172.192.9', `/cards/mtg/card-${i}`), {
      now: NOW, dnsVerify: NEVER_VERIFIED, store: deadStore,
    });
    if (r.throttled) throttled++;
    reason = r.reason;
  }
  report(
    'an unreachable store allows every request rather than denying them',
    throttled === 0 && reason === 'store-unavailable',
    `1,000 requests with a store that always returns null: ${throttled} throttled, reason="${reason}"`
  );

  __resetForTests();
  const throwingStore = {
    name: 'throwing',
    async bump() { throw new Error('connection reset'); },
    async recordBlock() { return null; },
  };
  // localGate 1 forces escalation on the very first request, so the throw is actually
  // reached. Without it this request would stop at the pre-gate and prove nothing.
  const r = await checkThrottle(pageReq('43.172.192.9', '/cards/mtg/x'), {
    now: NOW, dnsVerify: NEVER_VERIFIED, store: throwingStore, localGate: 1,
  });
  report(
    'a store that THROWS is caught and the request is allowed',
    r.throttled === false && r.reason === 'error-open',
    `throttled=${r.throttled} reason=${r.reason} (localGate forced to 1 so the store is reached)`
  );
}

// ----------------------------------------------------------------------------------------
// 8. CLOCK ALIGNED WINDOWS. Sharing forces this: two instances cannot agree on when a block
//    first appeared without a round trip to find out, so the window is the clock hour.
// ----------------------------------------------------------------------------------------
async function windowsAreClockAligned() {
  __resetForTests();
  const shared = createMemoryStore();
  const hourStart = Date.parse('2026-09-11T04:00:00Z');

  for (let i = 0; i < 400; i++) {
    await checkThrottle(pageReq('198.51.100.3', `/cards/mtg/card-${i}`), {
      now: hourStart + 59 * 60 * 1000, dnsVerify: NEVER_VERIFIED, store: shared,
    });
  }
  const blockedNow = await checkThrottle(pageReq('198.51.100.3', '/cards/mtg/late'), {
    now: hourStart + 59 * 60 * 1000, dnsVerify: NEVER_VERIFIED, store: shared,
  });
  // One minute later is the next clock hour, so the window is fresh.
  const afterRollover = await checkThrottle(pageReq('198.51.100.3', '/cards/mtg/next-hour'), {
    now: hourStart + 60 * 60 * 1000 + 1000, dnsVerify: NEVER_VERIFIED, store: shared,
  });

  report(
    'the window resets on the clock hour, and Retry-After points at it',
    blockedNow.throttled === true && afterRollover.throttled === false && blockedNow.retryAfter <= 60,
    `at 04:59 throttled=${blockedNow.throttled} retryAfter=${blockedNow.retryAfter}s `
      + `(the 60s to the top of the hour, not a flat 3600); at 05:00 throttled=${afterRollover.throttled}`
  );
}

// ----------------------------------------------------------------------------------------
// 9. THE LOCAL PRE-GATE. The reason this exists is latency: consulting shared storage on
//    every request added a measured ~200ms median to a card page. This control asserts the
//    saving directly, by counting how many times the store is touched at all.
// ----------------------------------------------------------------------------------------
async function preGateKeepsNormalTrafficOffTheNetwork() {
  __resetForTests();
  let storeCalls = 0;
  const counting = {
    name: 'counting',
    inner: createMemoryStore(),
    async bump(...a) { storeCalls++; return this.inner.bump(...a); },
    async recordBlock(...a) { return this.inner.recordBlock(...a); },
  };

  // 40 real visitors behind one /24, 5 pages each, all landing on ONE instance (the worst
  // case for this control, since spreading them over instances would only reduce the count).
  const local = new Map();
  let requests = 0;
  for (let s = 0; s < 40; s++) {
    for (let p = 0; p < 5; p++) {
      requests++;
      await checkThrottle(pageReq('203.0.113.15', `/cards/mtg/v${s}-p${p}`), {
        now: NOW, dnsVerify: NEVER_VERIFIED, store: counting, localState: local,
      });
    }
  }
  const saved = Math.round((1 - storeCalls / requests) * 100);
  report(
    'the pre-gate keeps the round trip out of ordinary traffic',
    storeCalls < requests,
    `${requests} requests from one /24 caused ${storeCalls} store calls, `
      + `${saved} per cent fewer round trips. The first ${THRESHOLDS.LOCAL_GATE - 1} are held `
      + 'locally and flushed in one call, and only then does each request cost a trip.'
  );

  // And a genuinely quiet block, which is what most real visitors are, never touches it.
  __resetForTests();
  let quietCalls = 0;
  const quietStore = {
    name: 'quiet',
    inner: createMemoryStore(),
    async bump(...a) { quietCalls++; return this.inner.bump(...a); },
    async recordBlock(...a) { return this.inner.recordBlock(...a); },
  };
  const quietLocal = new Map();
  for (let i = 0; i < THRESHOLDS.LOCAL_GATE - 1; i++) {
    await checkThrottle(pageReq('198.51.100.200', `/cards/mtg/quiet-${i}`), {
      now: NOW, dnsVerify: NEVER_VERIFIED, store: quietStore, localState: quietLocal,
    });
  }
  report(
    'a quiet block never touches the network at all',
    quietCalls === 0,
    `${THRESHOLDS.LOCAL_GATE - 1} requests from one /24 caused ${quietCalls} store calls. `
      + 'This is the path a real visitor takes, and it costs zero added latency.'
  );
}

console.log('C3L-222 shared-storage throttle controls\n');
console.log(`thresholds unchanged: ${THRESHOLDS.MAX_REQUESTS_PER_WINDOW} requests AND `
  + `${THRESHOLDS.MAX_DISTINCT_PATHS} distinct, AI ceiling ${THRESHOLDS.AI_MAX_REQUESTS_PER_WINDOW}, `
  + `tracked paths capped at ${THRESHOLDS.MAX_TRACKED_PATHS}\n`);

await perInstanceCountersMissIt();
console.log('');
await sharedCounterCatchesIt();
console.log('');
await coldInstanceInheritsTheCount();
console.log('');
await beaconNeedsABreadthKey();
console.log('');
await beaconLetsRealVisitorsThrough();
console.log('');
await scopesDoNotShareABudget();
console.log('');
await failsOpen();
console.log('');
await windowsAreClockAligned();
console.log('');
await preGateKeepsNormalTrafficOffTheNetwork();

console.log(`\n${failures === 0 ? 'ALL CONTROLS PASSED' : failures + ' CONTROL(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
