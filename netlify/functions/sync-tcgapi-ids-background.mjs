// netlify/functions/sync-tcgapi-ids.mjs
// Resolves tcgplayer_id -> tcgapi.dev internal ID for all cards across all 8 games.
// Rebuilt as a background function (15-min timeout) with parallel API calls (20 concurrent).
// Safe to re-run - skips already resolved cards. Stops gracefully at rate limit buffer.
// Fixes: offset logic (always offset=0 since written cards drop from result), parallel batches.

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const TCGAPI_KEY           = Netlify.env.get('TCGAPI_KEY');
const SYNC_SECRET          = Netlify.env.get('SYNC_SECRET');

const GAMES = [
  { game: 'mtg',        table: 'mtg_cards',        priceCol: 'price_usd',    idType: 'bigint' },
  { game: 'pokemon',    table: 'pokemon_cards',     priceCol: 'market_price', idType: 'integer' },
  { game: 'yugioh',     table: 'yugioh_cards',      priceCol: 'market_price', idType: 'integer' },
  { game: 'dragonball', table: 'dragonball_cards',  priceCol: 'market_price', idType: 'integer' },
  { game: 'onepiece',   table: 'onepiece_cards',    priceCol: 'market_price', idType: 'integer' },
  { game: 'starwars',   table: 'starwars_cards',    priceCol: 'market_price', idType: 'integer' },
  { game: 'lorcana',    table: 'lorcana_cards',     priceCol: 'market_price', idType: 'integer' },
  { game: 'riftbound',  table: 'riftbound_cards',   priceCol: 'market_price', idType: 'integer' },
];

const PRICE_CEILING    = 2000;
const RATE_LIMIT_STOP  = 500;   // Stop at 500 remaining (more conservative for background run)
const BATCH_SIZE       = 100;   // Cards fetched from Supabase per read
const CONCURRENCY      = 20;    // Parallel tcgapi.dev calls per batch
const MAX_RUNTIME_MS   = 13 * 60 * 1000; // 13 minutes hard stop (under 15-min background limit)

async function supabaseGet(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
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
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase GET error ${res.status}: ${err}`);
    }
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
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`PATCH failed ${res.status}: ${err}`);
    }
    return true;
  } catch (e) { clearTimeout(timer); throw e; }
}

// Returns { ok, status, remaining, data }
// On timeout/error: remaining stays at lastKnownRemaining (not 9999) to avoid false safe value
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
    // On timeout/network error: preserve lastKnownRemaining, do not pretend credits are full
    return { ok: false, status: 0, remaining: lastKnownRemaining, data: null };
  }
}

// Process a batch of cards in parallel (up to CONCURRENCY at a time)
async function processBatch(cards, table, currentRemaining) {
  let succeeded = 0;
  let failed = 0;
  let remaining = currentRemaining;
  let rateLimitHit = false;

  // Split into chunks of CONCURRENCY
  for (let i = 0; i < cards.length; i += CONCURRENCY) {
    if (rateLimitHit) break;
    const chunk = cards.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      chunk.map(card => tcgapiGet(`/v1/cards/tcgplayer/${card.tcgplayer_id}`, remaining))
    );

    // Process results sequentially to track remaining credits accurately
    for (let j = 0; j < results.length; j++) {
      const card = chunk[j];
      const result = results[j];

      if (result.status === 'rejected') {
        failed++;
        continue;
      }

      const { ok, status, remaining: rem, data } = result.value;

      // Update remaining from any successful response that has a real value
      if (rem < remaining) remaining = rem;

      if (remaining <= RATE_LIMIT_STOP) {
        rateLimitHit = true;
        break;
      }

      if (!ok || !data || !data.data) {
        if (status === 404) {
          // Mark as not found so we skip next run
          try {
            await supabasePatch(table, card.tcgplayer_id, {
              tcgapi_id: -1,
              tcgapi_synced_at: new Date().toISOString()
            });
          } catch (_) { /* non-fatal */ }
        }
        failed++;
        continue;
      }

      const cardData = data.data;
      const tcgapiId = cardData.id;
      const totalListings = cardData.total_listings ?? null;

      if (!tcgapiId) { failed++; continue; }

      try {
        await supabasePatch(table, card.tcgplayer_id, {
          tcgapi_id: tcgapiId,
          total_listings: totalListings,
          tcgapi_synced_at: new Date().toISOString()
        });
        succeeded++;
      } catch (_) {
        failed++;
      }
    }
  }

  return { succeeded, failed, remaining, rateLimitHit };
}

export default async (req) => {
  const secret = req.headers.get('x-sync-secret');
  if (secret !== SYNC_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(req.url);
  const gameFilter = url.searchParams.get('game') || null;
  const runLimit   = parseInt(url.searchParams.get('limit') || '0', 10);

  const startTime = Date.now();
  const log = [];
  let totalProcessed  = 0;
  let totalSucceeded  = 0;
  let totalFailed     = 0;
  let rateLimitHit    = false;
  let timeLimitHit    = false;
  let currentRemaining = 50000;

  const gamesToProcess = gameFilter
    ? GAMES.filter(g => g.game === gameFilter)
    : GAMES;

  for (const gameConfig of gamesToProcess) {
    if (rateLimitHit || timeLimitHit) break;
    if (runLimit > 0 && totalProcessed >= runLimit) break;

    const { game, table, priceCol } = gameConfig;
    log.push(`--- ${game.toUpperCase()} ---`);

    let gameProcessed = 0;
    let gameSucceeded = 0;
    let gameFailed    = 0;

    // KEY FIX: always offset=0 because written cards (tcgapi_id IS NOT NULL) drop out of results
    while (true) {
      if (rateLimitHit || timeLimitHit) break;
      if (runLimit > 0 && totalProcessed >= runLimit) break;

      // Check runtime
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        log.push(`TIME LIMIT: ${Math.round((Date.now() - startTime) / 1000)}s elapsed. Stopping safely.`);
        timeLimitHit = true;
        break;
      }

      // Always fetch from offset 0 - processed cards have tcgapi_id set so they drop from this query
      const path = `${table}?select=id,tcgplayer_id,name` +
        `&tcgplayer_id=not.is.null` +
        `&tcgapi_id=is.null` +
        `&${priceCol}=gte.1` +
        `&${priceCol}=lte.${PRICE_CEILING}` +
        `&order=${priceCol}.desc.nullslast` +
        `&limit=${BATCH_SIZE}`;

      let cards;
      try {
        cards = await supabaseGet(path);
      } catch (e) {
        log.push(`${game}: Supabase read error: ${e.message}`);
        break;
      }

      if (!Array.isArray(cards) || cards.length === 0) {
        log.push(`${game}: complete - no more unresolved cards`);
        break;
      }

      // Deduplicate by tcgplayer_id (MTG has duplicate tcgplayer_ids)
      const seen = new Set();
      const deduped = [];
      for (const card of cards) {
        if (!card.tcgplayer_id || seen.has(card.tcgplayer_id)) continue;
        seen.add(card.tcgplayer_id);
        deduped.push(card);
      }

      const { succeeded, failed, remaining, rateLimitHit: rlHit } = await processBatch(
        deduped, table, currentRemaining
      );

      currentRemaining = remaining;
      gameProcessed   += deduped.length;
      gameSucceeded   += succeeded;
      gameFailed      += failed;
      totalProcessed  += deduped.length;
      totalSucceeded  += succeeded;
      totalFailed     += failed;

      if (rlHit) {
        log.push(`RATE LIMIT: ${remaining} credits remaining. Stopping.`);
        rateLimitHit = true;
        break;
      }
    }

    log.push(`${game}: processed ${gameProcessed}, succeeded ${gameSucceeded}, failed ${gameFailed}`);
  }

  const elapsedSec = Math.round((Date.now() - startTime) / 1000);

  return new Response(JSON.stringify({
    totalProcessed,
    totalSucceeded,
    totalFailed,
    rateLimitHit,
    timeLimitHit,
    currentRemaining,
    elapsedSec,
    done: !rateLimitHit && !timeLimitHit,
    log
  }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
};

// Background function: 15-minute timeout, path for HTTP trigger
export const config = {
  path: '/api/sync-tcgapi-ids'
};
