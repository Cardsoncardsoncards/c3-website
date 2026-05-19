// netlify/functions/sync-tcgapi-ids.mjs
// ONE-TIME sync: resolves tcgplayer_id -> tcgapi.dev internal ID for all cards
// Run manually or via scheduled trigger. Safe to re-run - skips already resolved cards.
// Processes cards with tcgplayer_id but no tcgapi_id yet, ordered by price desc.
// Monitors X-RateLimit-Remaining and stops gracefully at 200 remaining to protect daily limit.

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const TCGAPI_KEY           = Netlify.env.get('TCGAPI_KEY');
const SYNC_SECRET          = Netlify.env.get('SYNC_SECRET');

// All 8 games with their table name and price column for ordering
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

// Price ceiling to filter obvious data errors (Lorcana $10,000, One Piece $12,750 etc)
const PRICE_CEILING = 2000;
// Stop if remaining credits drop below this threshold
const RATE_LIMIT_STOP = 200;
// Batch size per Supabase read
const BATCH_SIZE = 100;
// Delay between API calls in ms to avoid hammering
const CALL_DELAY_MS = 50;

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



async function tcgapiGet(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`https://api.tcgapi.dev${path}`, {
      headers: { 'X-API-Key': TCGAPI_KEY },
      signal: controller.signal
    });
    clearTimeout(timer);
    const remaining = parseInt(res.headers.get('X-RateLimit-Remaining') || '9999', 10);
    const data = res.ok ? await res.json() : null;
    return { ok: res.ok, status: res.status, remaining, data };
  } catch (e) { clearTimeout(timer); return { ok: false, status: 0, remaining: 9999, data: null }; }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export default async (req) => {
  // Auth check
  const secret = req.headers.get('x-sync-secret');
  if (secret !== SYNC_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(req.url);
  // Optional: force re-sync a specific game e.g. ?game=mtg
  const gameFilter = url.searchParams.get('game') || null;
  // Optional: limit cards per run e.g. ?limit=500 (default: run until rate limit hit)
  const runLimit = parseInt(url.searchParams.get('limit') || '0', 10);

  const log = [];
  let totalProcessed = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;
  let rateLimitHit = false;
  let currentRemaining = 9999;

  const gamesToProcess = gameFilter
    ? GAMES.filter(g => g.game === gameFilter)
    : GAMES;

  for (const gameConfig of gamesToProcess) {
    if (rateLimitHit) break;
    if (runLimit > 0 && totalProcessed >= runLimit) break;

    const { game, table, priceCol } = gameConfig;
    log.push(`--- ${game.toUpperCase()} ---`);

    let offset = 0;
    let gameProcessed = 0;
    let gameSucceeded = 0;
    let gameFailed = 0;

    while (true) {
      if (rateLimitHit) break;
      if (runLimit > 0 && totalProcessed >= runLimit) break;

      // Fetch batch of unresolved cards ordered by price desc, skip outliers
      const path = `${table}?select=id,tcgplayer_id,name&tcgplayer_id=not.is.null&tcgapi_id=is.null&${priceCol}=gte.1&${priceCol}=lte.${PRICE_CEILING}&order=${priceCol}.desc.nullslast&limit=${BATCH_SIZE}&offset=${offset}`;

      let cards;
      try {
        cards = await supabaseGet(path);
      } catch (e) {
        log.push(`${game}: Supabase read error at offset ${offset}: ${e.message}`);
        break;
      }

      if (!Array.isArray(cards) || cards.length === 0) {
        log.push(`${game}: no more unresolved cards at offset ${offset}`);
        break;
      }

      // Deduplicate by tcgplayer_id within this batch
      // MTG has duplicate tcgplayer_ids (same product, different Scryfall variants)
      const seen = new Set();
      const deduped = [];
      for (const card of cards) {
        if (!card.tcgplayer_id) continue;
        if (seen.has(card.tcgplayer_id)) continue;
        seen.add(card.tcgplayer_id);
        deduped.push(card);
      }

      for (const card of deduped) {
        if (rateLimitHit) break;
        if (runLimit > 0 && totalProcessed >= runLimit) break;

        totalProcessed++;
        gameProcessed++;

        await sleep(CALL_DELAY_MS);

        const { ok, status, remaining, data } = await tcgapiGet(
          `/v1/cards/tcgplayer/${card.tcgplayer_id}`
        );
        currentRemaining = remaining;

        if (remaining <= RATE_LIMIT_STOP) {
          log.push(`RATE LIMIT WARNING: ${remaining} remaining. Stopping to protect daily budget.`);
          rateLimitHit = true;
          break;
        }

        if (!ok || !data || !data.data) {
          // 404 means this TCGPlayer ID does not exist on tcgapi.dev - mark with tcgapi_id=-1 so we skip it next run
          if (status === 404) {
            try {
              await supabasePatch(table, card.id, 'id', {
                tcgapi_id: -1,
                tcgapi_synced_at: new Date().toISOString()
              });
            } catch (e) {
              // Non-fatal
            }
          }
          totalFailed++;
          gameFailed++;
          continue;
        }

        const cardData = data.data;
        const tcgapiId = cardData.id;
        const totalListings = cardData.total_listings ?? null;

        if (!tcgapiId) {
          totalFailed++;
          gameFailed++;
          continue;
        }

        try {
          // Update ALL rows with this tcgplayer_id (handles MTG duplicates)
          const patchPath = `${table}?tcgplayer_id=eq.${card.tcgplayer_id}`;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 10000);
          const patchRes = await fetch(
            `${SUPABASE_URL}/rest/v1/${patchPath}`,
            {
              method: 'PATCH',
              headers: {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify({
                tcgapi_id: tcgapiId,
                total_listings: totalListings,
                tcgapi_synced_at: new Date().toISOString()
              }),
              signal: controller.signal
            }
          );
          clearTimeout(timer);

          if (!patchRes.ok) {
            const err = await patchRes.text();
            throw new Error(`PATCH failed ${patchRes.status}: ${err}`);
          }

          totalSucceeded++;
          gameSucceeded++;
        } catch (e) {
          log.push(`${game}: write error for tcgplayer_id ${card.tcgplayer_id}: ${e.message}`);
          totalFailed++;
          gameFailed++;
        }
      }

      offset += BATCH_SIZE;
      // If we got fewer than BATCH_SIZE, we are done with this game
      if (cards.length < BATCH_SIZE) break;
    }

    log.push(`${game}: processed ${gameProcessed}, succeeded ${gameSucceeded}, failed ${gameFailed}`);
  }

  const summary = {
    totalProcessed,
    totalSucceeded,
    totalFailed,
    rateLimitHit,
    currentRemaining,
    log
  };

  return new Response(JSON.stringify(summary, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
};

export const config = {
  path: '/api/sync-tcgapi-ids',
  schedule: null
};
