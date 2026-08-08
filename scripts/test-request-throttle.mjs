// scripts/test-request-throttle.mjs
//
// Section 2 of the C3L-107 task: one positive control and three negative controls for
// shared/request-throttle.mjs, driven by the real traffic shapes measured on 6 to 7 August
// 2026 rather than invented ones.
//
// Run: node scripts/test-request-throttle.mjs
//
// The Googlebot case does a REAL reverse and forward DNS lookup against a real Googlebot
// address, so it exercises the actual verification path rather than a stub of it. Every
// other case injects a dnsVerify that returns false, which is the pessimistic answer, so no
// negative control can pass by accidentally being treated as a verified crawler.

import {
  checkThrottle,
  throttleResponse,
  THRESHOLDS,
  __resetForTests,
} from '../netlify/functions/shared/request-throttle.mjs';

const NEVER_VERIFIED = async () => false;

function makeReq(ip, path, ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36') {
  return new Request(`https://cardsoncardsoncards.com.au${path}`, {
    headers: { 'x-nf-client-connection-ip': ip, 'user-agent': ua },
  });
}

let failures = 0;
function report(name, passed, detail) {
  if (!passed) failures++;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}`);
  console.log(`      ${detail}`);
}

// ----------------------------------------------------------------------------------------
// 1. POSITIVE CONTROL: the confirmed Meta and Alibaba shapes.
//    Meta 57.141.18.0/24 peaked at 982 views in one hour, essentially all distinct cards.
//    Alibaba 43.119.100.0/24 peaked at 647 and 47.82.201.0/24 at 577, same shape.
// ----------------------------------------------------------------------------------------
async function positiveControl() {
  const shapes = [
    { label: 'Meta 57.141.18.x',    ip: '57.141.18.42',   views: 982, distinct: 982 },
    { label: 'Alibaba 43.119.100.x', ip: '43.119.100.7',  views: 647, distinct: 646 },
    { label: 'Alibaba 47.82.201.x',  ip: '47.82.201.19',  views: 577, distinct: 577 },
  ];
  for (const s of shapes) {
    __resetForTests();
    const now = Date.now();
    let firstThrottledAt = null;
    let throttledCount = 0;
    for (let i = 0; i < s.views; i++) {
      const path = `/cards/mtg/card-${i % s.distinct}`;
      const r = await checkThrottle(makeReq(s.ip, path), { now, dnsVerify: NEVER_VERIFIED });
      if (r.throttled) {
        throttledCount++;
        if (firstThrottledAt === null) firstThrottledAt = i + 1;
      }
    }
    const engaged = throttledCount > 0;
    report(
      `positive control: ${s.label} (${s.views} requests, ${s.distinct} distinct paths)`,
      engaged,
      engaged
        ? `throttle engaged at request ${firstThrottledAt}, ${throttledCount} of ${s.views} rejected`
        : `throttle NEVER engaged across ${s.views} requests`
    );
  }

  // And the 429 itself is a real 429 with a real Retry-After.
  __resetForTests();
  const now = Date.now();
  let last = null;
  for (let i = 0; i < 500; i++) {
    last = await checkThrottle(makeReq('57.141.18.42', `/cards/mtg/c-${i}`), { now, dnsVerify: NEVER_VERIFIED });
  }
  const res = throttleResponse(last.retryAfter);
  const ok = res.status === 429
    && Number(res.headers.get('retry-after')) > 0
    && res.headers.get('cache-control') === 'no-store';
  report(
    'positive control: response is a standard 429',
    ok,
    `status=${res.status} retry-after=${res.headers.get('retry-after')}s cache-control=${res.headers.get('cache-control')}`
  );
}

// ----------------------------------------------------------------------------------------
// 2. NEGATIVE CONTROL: real Googlebot, verified by real reverse and forward DNS, at a
//    volume far past the threshold. Must never be throttled.
// ----------------------------------------------------------------------------------------
async function googlebotControl() {
  __resetForTests();
  const ip = '66.249.66.1';            // published Googlebot range, resolves to googlebot.com
  const now = Date.now();
  const volume = 5000;                 // 5x the threshold, and 5x Meta's worst hour
  let throttled = 0;
  for (let i = 0; i < volume; i++) {
    // No dnsVerify injected: this uses the module's own live rDNS + forward confirmation.
    const r = await checkThrottle(makeReq(ip, `/cards/mtg/card-${i}`, 'Googlebot/2.1 (+http://www.google.com/bot.html)'), { now });
    if (r.throttled) throttled++;
  }
  report(
    `negative control: verified Googlebot at ${volume} requests`,
    throttled === 0,
    throttled === 0
      ? `0 throttled, exempt via live reverse+forward DNS on ${ip}`
      : `${throttled} requests were throttled, which must never happen`
  );

  // Prove the verification is doing work rather than passing everything: an address whose
  // rDNS does not forward-confirm must NOT be exempt.
  __resetForTests();
  let spoofThrottled = 0;
  for (let i = 0; i < 500; i++) {
    const r = await checkThrottle(
      makeReq('57.141.18.42', `/cards/mtg/card-${i}`, 'Googlebot/2.1 (+http://www.google.com/bot.html)'),
      { now }
    );
    if (r.throttled) spoofThrottled++;
  }
  report(
    'negative control: a FORGED Googlebot user agent is not exempt',
    spoofThrottled > 0,
    spoofThrottled > 0
      ? `${spoofThrottled} throttled, so exemption comes from DNS and not from the user agent string`
      : 'a forged Googlebot user agent was exempted, which is the exact gap this must not have'
  );
}

// ----------------------------------------------------------------------------------------
// 3. NEGATIVE CONTROL: real users at normal volume. Measured average is 5.4 pages/session.
// ----------------------------------------------------------------------------------------
async function realUserControl() {
  __resetForTests();
  const now = Date.now();
  const sessions = 40;                 // 40 separate visitors behind one /24 in one hour
  const pagesEach = 5.4;
  let requests = 0, throttled = 0;
  for (let s = 0; s < sessions; s++) {
    const pages = Math.round(pagesEach + (s % 3) - 1);
    for (let p = 0; p < pages; p++) {
      requests++;
      const r = await checkThrottle(makeReq('203.0.113.15', `/cards/mtg/user-card-${s}-${p}`), { now, dnsVerify: NEVER_VERIFIED });
      if (r.throttled) throttled++;
    }
  }
  report(
    `negative control: ${sessions} real sessions at 5.4 pages each`,
    throttled === 0,
    `${requests} requests from one /24, ${throttled} throttled (threshold is ${THRESHOLDS.MAX_REQUESTS_PER_WINDOW} requests AND ${THRESHOLDS.MAX_DISTINCT_PATHS} distinct paths)`
  );
}

// ----------------------------------------------------------------------------------------
// 4. NEGATIVE CONTROL: a genuine traffic spike, human shaped, at many times normal volume.
//    This is the test that matters most. A release day or a post doing well means a LOT of
//    people hitting a FEW pages. Volume alone must not trigger anything.
// ----------------------------------------------------------------------------------------
async function viralSpikeControl() {
  __resetForTests();
  const now = Date.now();
  const hotPages = [
    '/cards/mtg/black-lotus',
    '/cards/mtg',
    '/blog/mtg-reality-fracture-everything-we-know/',
    '/cards/pokemon',
    '/compare',
    '/cards/mtg/sets/star-trek',
  ];
  const sessions = 600;                // 15x the normal-volume control
  let requests = 0, throttled = 0;
  for (let s = 0; s < sessions; s++) {
    const pages = 4 + (s % 5);         // varied session depth, 4 to 8 pages
    for (let p = 0; p < pages; p++) {
      requests++;
      const path = hotPages[(s + p) % hotPages.length];
      const r = await checkThrottle(makeReq('198.51.100.77', path), { now, dnsVerify: NEVER_VERIFIED });
      if (r.throttled) throttled++;
    }
  }
  report(
    `negative control: viral spike, ${sessions} sessions over ${hotPages.length} hot pages`,
    throttled === 0,
    `${requests} requests from one /24 (${Math.round(requests / THRESHOLDS.MAX_REQUESTS_PER_WINDOW * 10) / 10}x the request threshold), `
      + `only ${hotPages.length} distinct paths, ${throttled} throttled`
  );
}

// ----------------------------------------------------------------------------------------
// Extra: the AI assistant raised ceiling, since robots.txt actively welcomes these agents.
// ----------------------------------------------------------------------------------------
async function aiAssistantControl() {
  __resetForTests();
  const now = Date.now();
  let throttled = 0;
  for (let i = 0; i < 1000; i++) {
    const r = await checkThrottle(
      makeReq('192.0.2.50', `/cards/mtg/card-${i}`, 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)'),
      { now, dnsVerify: NEVER_VERIFIED }
    );
    if (r.throttled) throttled++;
  }
  report(
    'negative control: declared AI assistant at 1,000 requests',
    throttled === 0,
    `0 expected below the raised ceiling of ${THRESHOLDS.AI_MAX_REQUESTS_PER_WINDOW}, got ${throttled} throttled`
  );
}

console.log('C3L-107 request throttle, Section 2 controls\n');
console.log(`thresholds: ${THRESHOLDS.MAX_REQUESTS_PER_WINDOW} requests AND ${THRESHOLDS.MAX_DISTINCT_PATHS} distinct paths per /24 per hour`);
console.log(`AI assistant ceiling: ${THRESHOLDS.AI_MAX_REQUESTS_PER_WINDOW} requests\n`);

await positiveControl();
console.log('');
await googlebotControl();
console.log('');
await realUserControl();
console.log('');
await viralSpikeControl();
console.log('');
await aiAssistantControl();

console.log(`\n${failures === 0 ? 'ALL CONTROLS PASSED' : failures + ' CONTROL(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
