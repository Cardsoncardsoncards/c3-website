// netlify/functions/shared/request-throttle.mjs
//
// C3L-107. An application-level rate limit for public page renders, keyed by network block.
//
// NOT LIVE. Nothing imports this module. It is built, tested and committed as a proposal.
// Wiring it into a page function is a separate, deliberate act, and it should not happen
// until someone has read the thresholds below and agreed with them.
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
// ---------------------------------------------------------------------------------------
// THE HONEST LIMITATION, stated rather than implied, and it is the same one account.mjs
// already documents about its signup limiter: this Map lives in memory in ONE serverless
// instance. Netlify runs many, and they cold start. So this blunts a burst from one origin
// and does NOT stop a crawl deliberately spread thin across many blocks or one that happens
// to land on many instances. A counter that actually holds needs a shared store. Anyone
// reading this as airtight is reading it wrong.

import { clientIp, truncateIp } from './request-fingerprint.mjs';

const WINDOW_MS = 60 * 60 * 1000;   // one hour
const MAX_REQUESTS_PER_WINDOW = 300;
const MAX_DISTINCT_PATHS = 150;

// Self declared AI assistant crawlers get this instead. See VERIFICATION TIERS below.
const AI_MAX_REQUESTS_PER_WINDOW = 1500;

// Stop growing the per block path set once it is far enough past the threshold to have
// already decided the question. Without this a long crawl would hold one string per URL in
// memory, which is the sort of thing that is fine until the day it is not.
const MAX_TRACKED_PATHS = 400;

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

const buckets = new Map();          // netBlock -> { count, paths:Set, resetAt }
const verifiedCache = new Map();    // ip -> { verified:boolean, expires:number }
const VERIFY_CACHE_MS = 6 * 60 * 60 * 1000;

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
// rest are counted in memory, so the row says "this block, this many, this user agent".
//
// On the key: SUPABASE_SERVICE_KEY is used because sync_events is service_role write only.
// This is not a new exposure. Netlify env vars are site-wide, so the value is already
// present in every function's environment; what is new is one narrow append-only telemetry
// write, before any HTML is built, and the variable never appears after a template literal.
// Fire and forget with a 4 second cap: telemetry must never delay or fail a page response.
const SYNC_EVENT_TYPE = 'throttle_block';

function envGet(name) {
  try {
    if (typeof Netlify !== 'undefined' && Netlify.env) return Netlify.env.get(name);
  } catch { /* not on Netlify, e.g. under the test harness */ }
  return null;
}

function recordBlock(block, rec, req) {
  rec.blocked = (rec.blocked || 0) + 1;
  const ua = (req.headers && req.headers.get ? req.headers.get('user-agent') : null) || 'none';
  let path = '';
  try { path = new URL(req.url).pathname; } catch { /* ignore */ }

  // Only the first block in this window writes anything.
  if (rec.blocked !== 1) return;

  console.warn(`[throttle] BLOCK block=${block} count=${rec.count} paths=${rec.paths.size} path=${path} ua=${ua.slice(0, 120)}`);

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
        game: null,
        rows_affected: rec.count,
        triggered_at: new Date().toISOString(),
        webhook_fired: false,
        error_message: `block=${block} paths=${rec.paths.size} path=${path} ua=${ua.slice(0, 200)}`,
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

function bucketFor(block, now) {
  const rec = buckets.get(block);
  if (!rec || now > rec.resetAt) {
    const fresh = { count: 0, paths: new Set(), resetAt: now + WINDOW_MS };
    buckets.set(block, fresh);
    return fresh;
  }
  return rec;
}

// Drop expired blocks so the Map cannot grow without bound across a long lived instance.
function sweep(now) {
  for (const [block, rec] of buckets) if (now > rec.resetAt) buckets.delete(block);
}

/**
 * Decide whether this request should be throttled, and record it against its network block.
 *
 * Returns { throttled:boolean, retryAfter:number, reason:string, block:string|null }.
 * Never throws: a throttle that fails must let the request through, not break the page.
 *
 * @param {Request} req
 * @param {{ now?: number, dnsVerify?: (ip:string)=>Promise<boolean> }} [opts]
 *        opts.now and opts.dnsVerify exist so the tests can drive a clock and a DNS result
 *        instead of sleeping for an hour or depending on live DNS. Production passes
 *        neither.
 */
export async function checkThrottle(req, opts = {}) {
  try {
    const now = opts.now != null ? opts.now : Date.now();
    const verify = opts.dnsVerify || verifyByDns;

    const ip = clientIp(req);
    const block = truncateIp(ip);
    // An address we cannot parse is ALLOWED, and every such caller is not lumped into one
    // shared bucket. Keying the unknowns together would let one unparseable client spend a
    // bucket that then denies everyone else in it, trading a crawl for an outage.
    if (!block) return { throttled: false, retryAfter: 0, reason: 'unkeyed', block: null };

    if (buckets.size > 5000) sweep(now);

    const rec = bucketFor(block, now);
    rec.count += 1;
    if (rec.paths.size < MAX_TRACKED_PATHS) {
      try { rec.paths.add(new URL(req.url).pathname); } catch { /* unparseable url, skip */ }
    }

    const ua = req.headers && req.headers.get ? req.headers.get('user-agent') : null;
    const ceiling = isAiAssistant(ua) ? AI_MAX_REQUESTS_PER_WINDOW : MAX_REQUESTS_PER_WINDOW;

    // Both conditions, always. Volume alone is a good day, breadth alone is a slow crawl
    // that the hourly detector already covers.
    if (rec.count <= ceiling || rec.paths.size <= MAX_DISTINCT_PATHS) {
      return { throttled: false, retryAfter: 0, reason: 'under-threshold', block };
    }

    // Only now, for a block that has already blown both limits, is a DNS round trip worth
    // paying for. Doing this on every request would put two lookups in the path of every
    // page view to save nothing.
    if (await verify(ip)) {
      return { throttled: false, retryAfter: 0, reason: 'verified-crawler', block };
    }

    recordBlock(block, rec, req);
    const retryAfter = Math.max(1, Math.ceil((rec.resetAt - now) / 1000));
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
};

// Test hook. Clears all counters so one test's traffic cannot leak into the next.
export function __resetForTests() {
  buckets.clear();
  verifiedCache.clear();
}
