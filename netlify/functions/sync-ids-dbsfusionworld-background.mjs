// netlify/functions/sync-ids-dbsfusionworld-background.mjs
//
// HELD, NOT SCHEDULED, NOT LIVE. Task 47, 10 August 2026. See the config at the bottom.
//
// Resolves tcgplayer_id -> tcgapi.dev internal ID for DBS FUSION WORLD, which is the CORE
// Dragon Ball game. Note the neighbouring file sync-ids-dragonball-background.mjs covers
// dragonball, the EXTENDED game, and they are different games with different tables. See
// CLAUDE.md: getting these two the wrong way round has happened before, in both directions.
//
// Built by copying the dragonball job and swapping the table and game identity, deliberately,
// so the two stay reviewable side by side. shared/sync-rotation.mjs was considered and does NOT
// fit: that module rotates SETS by staleness under a wall-clock budget, for catalogues too big
// to finish in one run. This job iterates unresolved CARDS and already self-chains when it runs
// out of time, and dbsfusionworld has 1,614 rows in the price window, so a full pass is one run.
// Forcing the rotation module in would add set-level bookkeeping this job has no use for.
//
// Verified against the live API before this file was written, using three real dbsfusionworld
// tcgplayer_ids: all three returned HTTP 200 with a real tcgapi id and a matching card name,
// and the rate-limit header showed 42,055 calls remaining. NOTE this is api.tcgapi.dev keyed by
// TCGAPI_KEY, which is a DIFFERENT service from the api.apitcg.com used by
// enrich-apitcg-stats-background.mjs, whose monthly quota is currently exhausted (C3L-93).
// Background function (15-min timeout), 20 parallel API calls per batch.
// Self-chains on time limit: fires next invocation automatically until complete.
// No auth check - background/scheduled functions have no headers to check against.

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const TCGAPI_KEY           = Netlify.env.get('TCGAPI_KEY');
const SYNC_SECRET          = Netlify.env.get('SYNC_SECRET');
const SITE_URL             = Netlify.env.get('URL');

const GAME_CONFIG = { game: 'dbsfusionworld', table: 'dbsfusionworld_cards', priceCol: 'market_price' };

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
      `${SUPABASE_URL}/rest/v1/${table}?tcgplayer_id=eq.${String(tcgplayerId)}`,
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
    fetch(`${SITE_URL}/.netlify/functions/sync-ids-dbsfusionworld-background`, {
      method: 'POST',
      headers: { 'x-sync-secret': SYNC_SECRET }
    });
  } catch (_) {}
}

// Audit trail into sync_events. Fire-and-forget: never breaks the sync itself.
//
// NOTE: this function has no top-level try/catch (it self-chains when it runs out of
// time), so there is no error path to hook. Only ids_sync_start and ids_sync_success
// are emitted; a hard failure shows up as a missing success row, plus the Netlify logs.
// Each self-chained continuation emits its own start row.
async function logSyncEvent(eventType, rowsAffected = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/sync_events`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify([{
        event_type:    eventType,
        game:          GAME_CONFIG.game,
        rows_affected: rowsAffected
      }]),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) console.warn(`[sync-ids-dbsfusionworld] sync_events log failed ${res.status}`);
  } catch (e) {
    clearTimeout(timer);
    console.warn(`[sync-ids-dbsfusionworld] sync_events log error: ${e.message}`);
  }
}

export default async (req) => {
  const startTime = Date.now();
  const { table, priceCol, game } = GAME_CONFIG;
  let totalProcessed = 0, totalSucceeded = 0, totalFailed = 0;
  let rateLimitHit = false, timeLimitHit = false, currentRemaining = 50000;
  const log = [];

  await logSyncEvent('ids_sync_start');

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

  await logSyncEvent('ids_sync_success', totalSucceeded);

  return new Response(JSON.stringify({ game, totalProcessed, totalSucceeded, totalFailed, rateLimitHit, timeLimitHit, currentRemaining, elapsedSec, done, log }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
};

// HELD. No schedule key, so this function is registered but never fires on its own, and being
// unscheduled it is also reachable over HTTP for a controlled first run (C3L-136 explains why
// that matters: a scheduled function answers 403 to direct HTTP and could not be tested at all).
// The migration adding tcgapi_id and tcgapi_synced_at is also HELD and must be applied first,
// or every PATCH here fails on an unknown column.
// To go live after review, restore: export const config = { schedule: "0 15 * * *" };
// 15:00 UTC keeps it clear of the 03:00 sync-ids window the other games share.
export const config = {};
