// netlify/functions/sync-ids-pokemon-background.mjs
// Resolves tcgplayer_id -> tcgapi.dev internal ID for pokemon cards only.
// Background function (15-min timeout), 20 parallel API calls per batch.
// Self-chains on time limit: fires next invocation automatically until complete.
// No auth check - background/scheduled functions have no headers to check against.

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const TCGAPI_KEY           = Netlify.env.get('TCGAPI_KEY');
const SYNC_SECRET          = Netlify.env.get('SYNC_SECRET');
const SITE_URL             = Netlify.env.get('URL');

const GAME_CONFIG = { game: 'pokemon', table: 'pokemon_cards', priceCol: 'market_price' };

const PRICE_CEILING   = 2000;
const RATE_LIMIT_STOP = 50;
const BATCH_SIZE      = 100;
const CONCURRENCY     = 20;
const MAX_RUNTIME_MS  = 13 * 60 * 1000;

async function supabaseGet(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) { const err = await res.text(); throw new Error(`Supabase GET ${res.status}: ${err}`); }
    return res.json();
  } catch (e) { clearTimeout(timer); throw e; }
}

async function supabasePatch(table, tcgplayerId, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?tcgplayer_id=eq.${tcgplayerId}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      }
    );
    clearTimeout(timer);
    if (!res.ok) { const err = await res.text(); throw new Error(`PATCH ${res.status}: ${err}`); }
    return true;
  } catch (e) { clearTimeout(timer); throw e; }
}

async function tcgapiGet(path, lastKnownRemaining) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`https://api.tcgapi.dev${path}`, {
      headers: { 'X-API-Key': TCGAPI_KEY },
      signal: controller.signal
    });
    clearTimeout(timer);
    const remaining = parseInt(res.headers.get('X-RateLimit-Remaining') || String(lastKnownRemaining), 10);
    const data = res.ok ? await res.json() : null;
    return { ok: res.ok, status: res.status, remaining, data };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: 0, remaining: lastKnownRemaining, data: null };
  }
}

async function processBatch(cards, table, currentRemaining) {
  let succeeded = 0, failed = 0, remaining = currentRemaining, rateLimitHit = false;
  for (let i = 0; i < cards.length; i += CONCURRENCY) {
    if (rateLimitHit) break;
    const chunk = cards.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(card => tcgapiGet(`/v1/cards/tcgplayer/${card.tcgplayer_id}`, remaining))
    );
    for (let j = 0; j < results.length; j++) {
      const card = chunk[j];
      const result = results[j];
      if (result.status === 'rejected') { failed++; continue; }
      const { ok, remaining: rem, data } = result.value;
      if (rem < remaining) remaining = rem;
      if (remaining <= RATE_LIMIT_STOP) { rateLimitHit = true; break; }
      if (!ok || !data || !data.data) {
        // Mark all failed API calls as -1 so they drop from future runs.
        // Without this, non-404 failures stay NULL and get reprocessed forever.
        try { await supabasePatch(table, card.tcgplayer_id, { tcgapi_id: -1, tcgapi_synced_at: new Date().toISOString() }); } catch (_) {}
        failed++; continue;
      }
      const tcgapiId = data.data.id;
      const totalListings = data.data.total_listings ?? null;
      if (!tcgapiId) {
        try { await supabasePatch(table, card.tcgplayer_id, { tcgapi_id: -1, tcgapi_synced_at: new Date().toISOString() }); } catch (_) {}
        failed++; continue;
      }
      try {
        await supabasePatch(table, card.tcgplayer_id, { tcgapi_id: tcgapiId, total_listings: totalListings, tcgapi_synced_at: new Date().toISOString() });
        succeeded++;
      } catch (_) { failed++; }
    }
  }
  return { succeeded, failed, remaining, rateLimitHit };
}

async function selfChain() {
  try {
    fetch(`${SITE_URL}/.netlify/functions/sync-ids-pokemon-background`, {
      method: 'POST',
      headers: { 'x-sync-secret': SYNC_SECRET }
    });
  } catch (_) {}
}

export default async (req) => {
  const startTime = Date.now();
  const { table, priceCol, game } = GAME_CONFIG;
  let totalProcessed = 0, totalSucceeded = 0, totalFailed = 0;
  let rateLimitHit = false, timeLimitHit = false, currentRemaining = 50000;
  const log = [];

  while (true) {
    if (rateLimitHit || timeLimitHit) break;
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      log.push(`TIME LIMIT: ${Math.round((Date.now() - startTime) / 1000)}s elapsed - self-chaining`);
      timeLimitHit = true; break;
    }
    const path = `${table}?select=id,tcgplayer_id,name` +
      `&tcgplayer_id=not.is.null&tcgapi_id=is.null` +
      `&${priceCol}=gte.1&${priceCol}=lte.${PRICE_CEILING}` +
      `&order=${priceCol}.desc.nullslast&limit=${BATCH_SIZE}`;
    let cards;
    try { cards = await supabaseGet(path); } catch (e) { log.push(`Supabase error: ${e.message}`); break; }
    if (!Array.isArray(cards) || cards.length === 0) { log.push(`${game}: complete - all cards resolved`); break; }
    const seen = new Set();
    const deduped = cards.filter(c => c.tcgplayer_id && !seen.has(c.tcgplayer_id) && seen.add(c.tcgplayer_id));
    const { succeeded, failed, remaining, rateLimitHit: rlHit } = await processBatch(deduped, table, currentRemaining);
    currentRemaining = remaining;
    totalProcessed += deduped.length;
    totalSucceeded += succeeded;
    totalFailed += failed;
    if (rlHit) { log.push(`RATE LIMIT: ${remaining} remaining - stopping`); rateLimitHit = true; break; }
  }

  const elapsedSec = Math.round((Date.now() - startTime) / 1000);
  const done = !rateLimitHit && !timeLimitHit;

  if (timeLimitHit && !rateLimitHit) {
    await selfChain();
  }

  return new Response(JSON.stringify({ game, totalProcessed, totalSucceeded, totalFailed, rateLimitHit, timeLimitHit, currentRemaining, elapsedSec, done, log }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
};

export const config = {};
