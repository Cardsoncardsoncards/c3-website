// netlify/functions/shared/request-throttle.mjs
//
// C3L-107. An application-level rate limit for public page renders, keyed by network block.
//
// LIVE AND ENFORCING. Wired in on 8 August 2026 as commits 8447180 (build) and 18a52c1
// (wire in), and imported by 98 function files: 32 card pages, 33 hubs, 31 set pages, plus
// card-index.mjs and mtg-random-commander.mjs. As of C3L-222 it is also called by
// /api/card-view in card-api.mjs, which makes 99 callers. Every one of them calls
// checkThrottle as the first statement of its handler, before any Supabase round trip and
// before any HTML is built.
//
// Its counter is backed by SHARED STORAGE (the request_throttle_windows table, migration
// netlify/functions/migrations/c3l222-request-throttle-shared-storage.sql), not by an
// in-process Map. That change is the whole point of C3L-222 and the reason this module now
// does what its own tests always said it did. See THE LIMITATION THAT WAS FIXED below.
//
// This header previously read "NOT LIVE. Nothing imports this module." while 98 files
// imported it. It was stale from the day it was wired in and it is recorded in C3L-222 as an
// instance of the C3L-174 family: a comment that passes every check while describing
// something that is no longer true.
//
// This is application code inside the functions. It is NOT a Netlify Firewall Traffic Rule
// and it consumes none of that 5-rule budget. The 5-rule ceiling is real for a confirmed
// range block, which still has to be done by hand in the Netlify UI, but it has nothing to
// do with this file.
//
// ---------------------------------------------------------------------------------------
// WHY IT TRIGGERS ON SHAPE AND NOT ON VOLUME ALONE
//
// A rate limit that fires on request count alone cannot tell a crawl from a good day. On
// release day, or when a post does well, a lot of people hit a few pages. That is the
// success case for this business and throttling it would be self harm. When a crawler runs,
// a few hosts hit a LOT of DIFFERENT pages, because it is enumerating a catalogue rather
// than reading anything.
//
// So both conditions must hold inside the same window before anything is throttled:
//
//     requests from the block   >  MAX_REQUESTS_PER_WINDOW
//     DISTINCT paths            >  MAX_DISTINCT_PATHS
//
// A viral spike fails the second test: thousands of requests, a handful of URLs. An
// enumeration crawl passes both, because breadth is the thing it cannot avoid doing.
//
// ---------------------------------------------------------------------------------------
// WHERE THE NUMBERS COME FROM. Measured 8 August 2026 from card_views over the 6 to 7
// August window, the only window in which request fingerprints exist. Not picked round.
//
//   Busiest hour of any /24 that was not Meta or Alibaba:            9 views
//   Highest views-per-session seen from any such network:            9.00
//   Number of those network-hours above 100 views:                   0 (of 18)
//   Whole site's busiest DAY before the crawl began (13 July):      93 views, all sources
//   Meta 57.141.18.0/24, peak hour:                                982 views
//   Meta 57.141.18.0/24, typical active hour:                  471 to 819 views
//   Alibaba 43.119.100.0/24, peak hour:                            647 views
//   Alibaba 47.82.201.0/24, peak hour:                             577 views
//
// 300 requests per hour per /24 therefore sits in a very wide empty band: 33x the busiest
// hour any real network produced, 3.2x the entire site's best pre-crawl DAY, and below
// every confirmed crawler hour worth catching. Meta's quietest active hour was 159 and is
// deliberately UNDER this line: a throttle should bite extreme volume, and a detector,
// which is what scripts/crawler-volume-check.mjs already is at 100 per hour, is the right
// tool for the slow tail. This is intentionally a blunter instrument set further out,
// because a false positive here costs a real visitor a 429 rather than costing one email.
//
// 150 distinct paths is half the request threshold. It cannot be reached at all by a
// visitor behaving like the measured average of 5.4 pages per session unless roughly 28
// separate people are behind one /24 in one hour, and even then only if no two of them
// look at the same page.
//
// THE 10 TO 11 SEPTEMBER 2026 EVENT CONFIRMED THESE NUMBERS RATHER THAN CHALLENGING THEM.
// That crawl put 233 separate /24-hours over both thresholds, peaking at 767 distinct paths
// in one block-hour, and was not throttled once. The thresholds were right. The storage was
// wrong. C3L-222 changed the storage and deliberately changed none of the numbers.
//
// ---------------------------------------------------------------------------------------
// THE LIMITATION THAT WAS FIXED, and the one that remains.
//
// FIXED (C3L-222): the counter was a Map in one serverless instance's memory. Netlify runs
// many instances and they cold start, so a crawl spread across instances was counted many
// times over, each count starting from zero and none of them reaching 300. That is exactly
// what happened on 10 to 11 September. The counter now lives in Postgres and every instance
// increments the same row, so the count a crawler accumulates follows it from instance to
// instance.
//
// REMAINS: this keys on the /24, so traffic deliberately spread thin across many networks
// still defeats it. C3L-197 measured precisely that shape, 6,265 distinct /24s at 1.07
// requests each, and no per-block threshold can catch it. Edge blocking is the tool for
// that, not this. Anyone reading this module as airtight is still reading it wrong.

import { clientIp, truncateIp } from './request-fingerprint.mjs';

const WINDOW_MS = 60 * 60 * 1000;   // one hour
const MAX_REQUESTS_PER_WINDOW = 300;
const MAX_DISTINCT_PATHS = 150;

// Self declared AI assistant crawlers get this instead. See VERIFICATION TIERS below.
const AI_MAX_REQUESTS_PER_WINDOW = 1500;

// Stop growing the per block path set once it is far enough past the threshold to have
// already decided the question. Without this a long crawl would hold one string per URL,
// which is the sort of thing that is fine until the day it is not. This is passed to the
// database function as p_max_paths rather than restated there, so the cap has one
// definition. It is 2.7x MAX_DISTINCT_PATHS and therefore cannot change any decision.
const MAX_TRACKED_PATHS = 400;

// ---------------------------------------------------------------------------------------
// THE LOCAL PRE-GATE, AND THE SLOP IT BUYS. READ THIS BEFORE CHANGING ANY NUMBER ABOVE.
//
// Consulting shared storage on every request costs a Supabase round trip on every request.
// Measured 11 September 2026 on two deploy previews of this repo running on identical
// infrastructure, 30 interleaved paired samples: it added a median of 214ms and a mean of
// 383ms to a card page, against +21ms median on an endpoint with no throttle on it. Roughly
// 200ms of that is the throttle. Paid by every visitor on 99 function files, to catch an
// actor who by definition is not a visitor, that is the wrong trade.
//
// So an instance now counts a block LOCALLY until it has seen LOCAL_GATE requests from it in
// the current window, and only then starts talking to shared storage. When it escalates it
// FLUSHES everything it has held, in one call, so the shared count stays exact rather than
// losing the first few.
//
// WHAT THIS COSTS, stated as a known slop rather than quietly folded into the thresholds:
// the 300 and 150 figures are unchanged, but the number of requests that can get through
// before the shared counter notices is no longer exactly 300. In the worst case it is
//
//     300 + (LOCAL_GATE - 1) x (number of instances serving that block)
//
// because each instance may be holding up to LOCAL_GATE - 1 requests it has not flushed yet.
// Nothing is LOST, the flush makes the total exact, the detection is simply late by that
// much. Measured end to end against a real deploy preview rather than calculated: see the
// figure recorded in the C3L-222 register row.
//
// Why 20 rather than 5 or 100: a real visitor's /24 sends single-figure requests per hour to
// any one instance, so 20 keeps the entire normal case off the network, while the slop it
// admits is a rounding error against the 114,213 requests the 10 to 11 September actor
// actually made. Raising it widens the slop linearly; lowering it puts the round trip back
// into ordinary page loads.
const LOCAL_GATE = 20;

// ---------------------------------------------------------------------------------------
// VERIFICATION TIERS
//
// Tier 1, EXEMPT ENTIRELY, at any volume. Reverse DNS on the connecting address must
// resolve to one of these suffixes, AND that hostname must resolve forward to the same
// address. Both halves are required. A reverse lookup on its own proves nothing, because
// the owner of an address controls its PTR record and can point it anywhere; the forward
// confirmation is what makes it Google, or Bing, attesting to it in DNS they control. This
// is Google's own documented method and it is used here properly rather than shortcut to a
// user agent check, which is a string anyone can type.
const VERIFIED_CRAWLER_SUFFIXES = [
  '.googlebot.com',
  '.google.com',
  '.googleusercontent.com',
  '.search.msn.com',        // Bingbot
  '.applebot.apple.com',    // Applebot
  '.duckduckgo.com',
];

// Tier 2, RAISED CEILING. These identify themselves only by user agent, and a user agent is
// free text, so this is not verification and is not described as such. It is a deliberate
// decision about which way to be wrong. The site is actively trying to grow this channel:
// robots.txt names these agents and welcomes them on purpose. Throttling one by mistake
// costs real business, while an impostor who forges the string gains nothing except a
// higher rate limit on public pages that are already free to read. Given the choice, err
// toward letting them through.
const AI_ASSISTANT_TOKENS = [
  'gptbot', 'oai-searchbot', 'chatgpt-user',
  'claudebot', 'claude-web', 'anthropic-ai',
  'perplexitybot', 'google-extended',
  'bingbot', 'applebot',
];

// Tier 3 is everything else, on the standard threshold.

// The DNS result cache stays in memory ON PURPOSE, unlike the counter. It is a cache and not
// a counter: an instance that misses it pays one extra pair of DNS lookups and reaches the
// same answer, so sharing it would buy nothing and cost a round trip.
const verifiedCache = new Map();    // ip -> { verified:boolean, expires:number }
const VERIFY_CACHE_MS = 6 * 60 * 60 * 1000;

function envGet(name) {
  try {
    if (typeof Netlify !== 'undefined' && Netlify.env) return Netlify.env.get(name);
  } catch { /* not on Netlify, e.g. under the test harness */ }
  return null;
}

// ---------------------------------------------------------------------------------------
// THE COUNTER STORE
//
// Two implementations behind one shape. Production resolves to the Supabase one. The memory
// one is the fallback when there is no database to talk to (the local test harness, and any
// environment where the credentials are missing), and it is what scripts/test-request-throttle.mjs
// drives so that thousands of control requests do not become thousands of network calls
// against the live database.
//
// A store exposes:
//   bump(block, windowStart, paths[], increment, maxPaths, isAi) -> { count, distinctPaths } | null
//   recordBlock(block, windowStart)                              -> number | null
// and returns null to mean "I could not answer", which the caller treats as allow.
//
// bump takes an ARRAY of paths and an INCREMENT rather than one path, because the local
// pre-gate above flushes several held requests in a single call.
// ---------------------------------------------------------------------------------------

// Every request on 99 function files pays this, so it is capped far tighter than the 8
// second timeout this codebase uses for fetches that a page is actually waiting on for its
// content. A throttle that cannot answer quickly must get out of the way: 2 seconds is
// already far beyond a healthy round trip to Supabase, and anything slower than that is a
// database problem whose correct handling is to serve the page, not to hold it.
const STORE_TIMEOUT_MS = 2000;

export function createMemoryStore() {
  const windows = new Map();   // `${block}|${windowStart}` -> { count, paths:Set, blocked }

  function keyOf(block, windowStart) { return `${block}|${windowStart}`; }

  return {
    name: 'memory',
    async bump(block, windowStart, paths, increment, maxPaths, isAi) {
      const key = keyOf(block, windowStart);
      let rec = windows.get(key);
      if (!rec) {
        // Drop windows that can no longer be consulted, so a long lived instance cannot
        // grow this Map without bound. The database store has an hourly pg_cron prune for
        // the same reason.
        if (windows.size > 5000) {
          for (const [k, v] of windows) if (v.windowStart < windowStart - WINDOW_MS) windows.delete(k);
        }
        rec = { windowStart, count: 0, paths: new Set(), blocked: 0, ai: false };
        windows.set(key, rec);
      }
      rec.count += Math.max(1, increment || 1);
      rec.ai = rec.ai || !!isAi;
      for (const p of paths || []) {
        if (p && rec.paths.size < maxPaths) rec.paths.add(p);
      }
      return { count: rec.count, distinctPaths: rec.paths.size };
    },
    async recordBlock(block, windowStart) {
      const rec = windows.get(keyOf(block, windowStart));
      if (!rec) return null;
      rec.blocked += 1;
      return rec.blocked;
    },
    __clear() { windows.clear(); },
  };
}

function createSupabaseStore(url, key) {
  async function rpc(fn, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), STORE_TIMEOUT_MS);
    try {
      const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;                       // timeout, abort, network error: caller allows
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    name: 'supabase',
    async bump(block, windowStart, paths, increment, maxPaths, isAi) {
      const out = await rpc('throttle_bump', {
        p_block: block,
        p_window_start: new Date(windowStart).toISOString(),
        p_paths: (paths || []).filter(Boolean),
        p_increment: Math.max(1, increment || 1),
        p_max_paths: maxPaths,
        p_ai: !!isAi,
      });
      // returns table(...) comes back as an array of one row.
      const row = Array.isArray(out) ? out[0] : out;
      if (!row || typeof row.request_count !== 'number') return null;
      return { count: row.request_count, distinctPaths: row.distinct_paths || 0 };
    },
    async recordBlock(block, windowStart) {
      const out = await rpc('throttle_record_block', {
        p_block: block,
        p_window_start: new Date(windowStart).toISOString(),
      });
      return typeof out === 'number' ? out : null;
    },
  };
}

// The local pre-gate's own state: what THIS instance has seen and not yet flushed.
// key -> { windowStart, held:number, paths:Set, escalated:boolean }
const localHolding = new Map();

function localRecord(map, key, windowStart) {
  let rec = map.get(key);
  if (!rec || rec.windowStart !== windowStart) {
    // A new window for this key. Also sweep, so a long lived instance cannot accumulate a
    // record per block per hour forever.
    if (map.size > 5000) {
      for (const [k, v] of map) if (v.windowStart !== windowStart) map.delete(k);
    }
    rec = { windowStart, held: 0, paths: new Set(), escalated: false };
    map.set(key, rec);
  }
  return rec;
}

let storeOverride = null;     // set by __setStoreForTests
let resolvedStore = null;
let warnedNoCredentials = false;

function getStore() {
  if (storeOverride) return storeOverride;
  if (resolvedStore) return resolvedStore;
  const url = envGet('SUPABASE_URL');
  const key = envGet('SUPABASE_SERVICE_KEY');
  if (url && key) {
    resolvedStore = createSupabaseStore(url, key);
  } else {
    // This is the pre-C3L-222 behaviour, and it is a DEGRADED mode rather than a supported
    // one: the counter goes back to being per instance. Said out loud once per instance so
    // that it shows up in the function log instead of being silently wrong, which is the
    // failure shape this whole finding is about.
    if (!warnedNoCredentials) {
      warnedNoCredentials = true;
      console.warn('[throttle] no SUPABASE_URL/SUPABASE_SERVICE_KEY, counting per instance only');
    }
    resolvedStore = createMemoryStore();
  }
  return resolvedStore;
}

// ---------------------------------------------------------------------------------------
// OBSERVABILITY. A throttle that cannot be seen cannot be monitored, and shipping a
// discriminating mechanism with no record of what it caught would be the same silent-failure
// shape this codebase keeps producing.
//
// Two channels, deliberately. console.warn goes to Netlify's function log for live tailing.
// The sync_events row is the durable one, because it can be queried afterwards and it is the
// stream C3L-51's health check already reads, so nothing new has to be maintained.
//
// ONE BLOCK PER WINDOW, NOT ONE PER REQUEST. Meta's peak hour would have produced 682
// rejections; writing 682 rows would make the record useless and put a Supabase round trip
// on every rejected request. The first block for a network in a window is recorded and the
// rest are counted. Since C3L-222 that count is the SHARED one, so this is now one row per
// block per window across every instance, which the in-memory version could only ever
// promise per instance.
//
// On the key: SUPABASE_SERVICE_KEY is used because sync_events is service_role write only.
// This is not a new exposure. Netlify env vars are site-wide, so the value is already
// present in every function's environment; what is new is one narrow append-only telemetry
// write, before any HTML is built, and the variable never appears after a template literal.
// Fire and forget with a 4 second cap: telemetry must never delay or fail a page response.
const SYNC_EVENT_TYPE = 'throttle_block';

async function recordBlock(store, block, windowStart, counts, req) {
  const ua = (req.headers && req.headers.get ? req.headers.get('user-agent') : null) || 'none';
  let path = '';
  try { path = new URL(req.url).pathname; } catch { /* ignore */ }

  // Only the first block in this window, across all instances, writes anything. Both
  // channels are behind this gate: the 10 to 11 September actor would have produced over a
  // hundred thousand rejections, and a function log with a line per rejection is not a
  // record of anything, it is the thing you cannot find the record in.
  const blocked = await store.recordBlock(block, windowStart);
  if (blocked !== 1) return;

  console.warn(`[throttle] BLOCK block=${block} count=${counts.count} paths=${counts.distinctPaths} path=${path} ua=${ua.slice(0, 120)}`);

  const url = envGet('SUPABASE_URL');
  const key = envGet('SUPABASE_SERVICE_KEY');
  if (!url || !key) return;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    fetch(`${url}/rest/v1/sync_events`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        event_type: SYNC_EVENT_TYPE,
        game: '__throttle__',
        rows_affected: counts.count,
        triggered_at: new Date().toISOString(),
        webhook_fired: false,
        error_message: `block=${block} paths=${counts.distinctPaths} path=${path} ua=${ua.slice(0, 200)}`,
      }),
    }).catch(() => {}).finally(() => clearTimeout(timer));
  } catch { /* telemetry must never break the request */ }
}

function isAiAssistant(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return AI_ASSISTANT_TOKENS.some(t => ua.includes(t));
}

// Reverse lookup, then forward confirm. Returns false on any error, any timeout, and any
// mismatch. Failing closed here means "not verified", which only means the caller falls
// back to a threshold; it never denies anything on its own.
async function verifyByDns(ip) {
  if (!ip) return false;
  const cached = verifiedCache.get(ip);
  if (cached && Date.now() < cached.expires) return cached.verified;

  let verified = false;
  try {
    const dns = await import('node:dns');
    const resolver = dns.promises;
    const names = await resolver.reverse(ip);
    for (const name of names) {
      const host = String(name).toLowerCase().replace(/\.$/, '');
      if (!VERIFIED_CRAWLER_SUFFIXES.some(s => host.endsWith(s))) continue;
      const forward = ip.includes(':')
        ? await resolver.resolve6(host).catch(() => [])
        : await resolver.resolve4(host).catch(() => []);
      if (forward.includes(ip)) { verified = true; break; }
    }
  } catch {
    verified = false;
  }

  verifiedCache.set(ip, { verified, expires: Date.now() + VERIFY_CACHE_MS });
  return verified;
}

/**
 * Decide whether this request should be throttled, and record it against its network block.
 *
 * Returns { throttled:boolean, retryAfter:number, reason:string, block:string|null }.
 * Never throws: a throttle that fails must let the request through, not break the page.
 *
 * @param {Request} req
 * @param {{ now?: number, dnsVerify?: (ip:string)=>Promise<boolean>, store?: object,
 *           scope?: string, breadthKey?: string }} [opts]
 *        opts.now and opts.dnsVerify exist so the tests can drive a clock and a DNS result
 *        instead of sleeping for an hour or depending on live DNS. opts.store lets a test
 *        supply its own counter. Production passes none of those three.
 *
 *        opts.scope and opts.breadthKey are for callers that are not page renders, and the
 *        only one today is /api/card-view. Both exist because C3L-222 found that dropping
 *        this function unmodified onto a single-path API endpoint produces a check that can
 *        NEVER fire, for two separate reasons:
 *
 *        1. BREADTH. The throttle needs both volume AND breadth, and it measures breadth as
 *           distinct URL paths. Every request to /api/card-view has the SAME path, so
 *           distinct paths is permanently 1, permanently under MAX_DISTINCT_PATHS, and the
 *           second condition can never be met however many millions of calls arrive. For an
 *           endpoint like that the caller must say what breadth MEANS to it. For the view
 *           beacon it is the card being reported, which is exactly the enumeration signal:
 *           the 10 to 11 September crawl viewed 114,213 cards once each.
 *        2. SCOPE. A card page load makes two counted requests, the page and then its
 *           beacon. Counting both into one bucket would silently halve the effective page
 *           budget for every real visitor while adding nothing, since the beacon contributes
 *           no breadth of its own. A distinct scope gives the endpoint its own 300/150
 *           budget under the same numbers, so neither surface can spend the other's.
 *
 *        This is a change in what gets counted, NOT in the thresholds, which are untouched.
 */
export async function checkThrottle(req, opts = {}) {
  try {
    const now = opts.now != null ? opts.now : Date.now();
    const verify = opts.dnsVerify || verifyByDns;
    const store = opts.store || getStore();

    const ip = clientIp(req);
    const block = truncateIp(ip);
    // An address we cannot parse is ALLOWED, and every such caller is not lumped into one
    // shared bucket. Keying the unknowns together would let one unparseable client spend a
    // bucket that then denies everyone else in it, trading a crawl for an outage.
    if (!block) return { throttled: false, retryAfter: 0, reason: 'unkeyed', block: null };

    // Clock aligned, not first-request aligned. Two instances cannot agree on when a block
    // first appeared without a round trip to find out; they can both floor the clock.
    const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;

    // Page renders share one bucket per network block. A caller passing a scope gets its own
    // bucket under the same thresholds. See the opts.scope note above.
    const counterKey = opts.scope ? `${opts.scope}:${block}` : block;

    // What "distinct" means for this caller. Defaults to the URL path, which is right for a
    // page render and wrong for a single-path endpoint. See the opts.breadthKey note above.
    let breadth = opts.breadthKey || '';
    if (!breadth) {
      try { breadth = new URL(req.url).pathname; } catch { /* unparseable url, skip */ }
    }

    const ua = req.headers && req.headers.get ? req.headers.get('user-agent') : null;
    const isAi = isAiAssistant(ua);
    const ceiling = isAi ? AI_MAX_REQUESTS_PER_WINDOW : MAX_REQUESTS_PER_WINDOW;

    // THE LOCAL PRE-GATE. Hold the first LOCAL_GATE requests from this block in memory and
    // do not touch the network at all. This is the branch almost every real page view takes.
    // See the long note on LOCAL_GATE above for the slop it admits.
    const gate = opts.localGate != null ? opts.localGate : LOCAL_GATE;
    // opts.localState lets a test give each simulated instance its OWN pre-gate memory. In
    // production there is one per instance, which is exactly what the module-level Map is.
    const held = localRecord(opts.localState || localHolding, counterKey, windowStart);
    held.held += 1;
    if (breadth) held.paths.add(breadth);

    if (!held.escalated && held.held < gate) {
      return { throttled: false, retryAfter: 0, reason: 'under-local-gate', block };
    }

    // Escalating, or already escalated. Flush whatever is held in ONE call so the shared
    // count stays exact, then keep counting one at a time from here on.
    const flushCount = held.held;
    const flushPaths = [...held.paths];
    held.held = 0;
    held.paths.clear();
    held.escalated = true;

    const counts = await store.bump(counterKey, windowStart, flushPaths, flushCount, MAX_TRACKED_PATHS, isAi);
    // The store could not answer. ALLOW. A rate limiter that turns a database blip into a
    // site outage has done far more damage than the crawl it was built to slow down.
    //
    // PUT THE FLUSH BACK FIRST. These requests have not been recorded anywhere, and dropping
    // them here would mean a store that is briefly unreachable permanently erases everything
    // it failed to accept, which is how a counter silently undercounts the exact actor it
    // exists to catch.
    if (!counts) {
      held.held += flushCount;
      for (const p of flushPaths) if (held.paths.size < MAX_TRACKED_PATHS) held.paths.add(p);
      return { throttled: false, retryAfter: 0, reason: 'store-unavailable', block };
    }

    // Both conditions, always. Volume alone is a good day, breadth alone is a slow crawl
    // that the hourly detector already covers.
    if (counts.count <= ceiling || counts.distinctPaths <= MAX_DISTINCT_PATHS) {
      return { throttled: false, retryAfter: 0, reason: 'under-threshold', block };
    }

    // Only now, for a block that has already blown both limits, is a DNS round trip worth
    // paying for. Doing this on every request would put two lookups in the path of every
    // page view to save nothing.
    if (await verify(ip)) {
      return { throttled: false, retryAfter: 0, reason: 'verified-crawler', block };
    }

    await recordBlock(store, counterKey, windowStart, counts, req);
    const retryAfter = Math.max(1, Math.ceil((windowStart + WINDOW_MS - now) / 1000));
    return { throttled: true, retryAfter, reason: 'rate-limited', block };
  } catch {
    return { throttled: false, retryAfter: 0, reason: 'error-open', block: null };
  }
}

// A plain, honest 429. Not a silent drop, not a disguised page, not a slow response
// pretending to be a slow server. A caller that is being rate limited is told so, told for
// how long, and told not to index the response.
export function throttleResponse(retryAfter) {
  return new Response(
    'Too Many Requests. This network is sending more requests than this site serves. '
    + 'Please slow down and try again shortly.',
    {
      status: 429,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Retry-After': String(retryAfter),
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
      },
    }
  );
}

// Exposed for the tests only, so they can assert against the same numbers the module uses
// rather than restating them and drifting.
export const THRESHOLDS = {
  WINDOW_MS,
  MAX_REQUESTS_PER_WINDOW,
  MAX_DISTINCT_PATHS,
  AI_MAX_REQUESTS_PER_WINDOW,
  MAX_TRACKED_PATHS,
  LOCAL_GATE,
};

// Test hooks. __setStoreForTests(null) restores normal resolution.
export function __setStoreForTests(store) {
  storeOverride = store;
}

// Clears all counters so one test's traffic cannot leak into the next.
export function __resetForTests() {
  if (storeOverride && storeOverride.__clear) storeOverride.__clear();
  if (resolvedStore && resolvedStore.__clear) resolvedStore.__clear();
  resolvedStore = null;
  verifiedCache.clear();
  localHolding.clear();
}

// Forget one instance's local pre-gate state without touching the shared counter, so a test
// can simulate a COLD instance arriving at a block another instance has already been serving.
export function __coldStartForTests() {
  localHolding.clear();
}
