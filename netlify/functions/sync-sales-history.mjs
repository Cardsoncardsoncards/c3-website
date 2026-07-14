// netlify/functions/sync-sales-history.mjs
// Pulls weekly sales history from tcgapi.dev and stores in card_sales_history.
// Tiered priority:
//   Tier 1 (daily):  cards with price >= $10, up to 1000 per game
//   Tier 2 (weekly): cards with price $3-$10, processed Mon/Thu
//   Tier 3 (monthly): cards with price $1-$3, processed on 1st of month
// Safe to re-run. Upserts on (tcgapi_id, week_date, printing).
// Monitors X-RateLimit-Remaining and stops at 500 remaining.

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const TCGAPI_KEY           = Netlify.env.get('TCGAPI_KEY');
const SYNC_SECRET          = Netlify.env.get('SYNC_SECRET');

// This list is NOT a Core-games list. It is gated on one hard prerequisite: the card table must
// carry a resolved tcgapi_id, because that is the only key this sync can call tcgapi.dev with
// (see the query below, which filters tcgapi_id=not.is.null&tcgapi_id=neq.-1). tcgapi_id is
// populated by the per-game sync-ids-<game>-background.mjs jobs.
//
// task-118: dbsfusionworld is the Core Dragon Ball game but is deliberately NOT in this list.
// dbsfusionworld_cards has NO tcgapi_id column at all (it has id, tcgplayer_id, set_id only),
// and there is no sync-ids-dbsfusionworld-background.mjs to populate one. Adding it here would
// not sync anything: the select would reference a column that does not exist, PostgREST would
// 400, and the catch below would log "Supabase read error" on every tier of every run forever.
// Enabling sales history for Fusion World is a schema + new-sync-job task, not a list edit.
//
// dragonball stays. It is Extended now, but it HAS a resolved tcgapi_id (3,158 cards, 1,004 in
// tier 1) and is actively accruing sales history. Removing it would delete working coverage and
// gain nothing, since this list is gated on tcgapi_id, not on Core status.
const GAMES = [
  { game: 'mtg',        table: 'mtg_cards',        priceCol: 'price_usd'    },
  { game: 'pokemon',    table: 'pokemon_cards',     priceCol: 'market_price' },
  { game: 'yugioh',     table: 'yugioh_cards',      priceCol: 'market_price' },
  { game: 'dragonball', table: 'dragonball_cards',  priceCol: 'market_price' },
  { game: 'onepiece',   table: 'onepiece_cards',    priceCol: 'market_price' },
  { game: 'starwars',   table: 'starwars_cards',    priceCol: 'market_price' },
  { game: 'lorcana',    table: 'lorcana_cards',     priceCol: 'market_price' },
  { game: 'riftbound',  table: 'riftbound_cards',   priceCol: 'market_price' },
];

const PRICE_CEILING     = 2000;
const RATE_LIMIT_STOP   = 500;
const BATCH_SIZE        = 50;
const CALL_DELAY_MS     = 60;
const HISTORY_RANGE     = 'year';

// Cards per tier per game per run
const TIER1_LIMIT       = 1000;  // $10+ daily
const TIER2_LIMIT       = 500;   // $3-$10 Mon/Thu only
const TIER3_LIMIT       = 300;   // $1-$3 1st of month only

async function supabaseGet(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    return res.json();
  } catch (e) { clearTimeout(timer); throw e; }
}

async function supabaseUpsert(rows) {
  if (!rows.length) return true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/card_sales_history`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(rows),
        signal: controller.signal
      }
    );
    clearTimeout(timer);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Upsert failed ${res.status}: ${err}`);
    }
    return true;
  } catch (e) { clearTimeout(timer); throw e; }
}

async function tcgapiGetHistory(tcgapiId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(
      `https://api.tcgapi.dev/v1/cards/${tcgapiId}/history?range=${HISTORY_RANGE}`,
      {
        headers: { 'X-API-Key': TCGAPI_KEY },
        signal: controller.signal
      }
    );
    clearTimeout(timer);
    const remaining = parseInt(res.headers.get('X-RateLimit-Remaining') || '9999', 10);
    const data = res.ok ? await res.json() : null;
    return { ok: res.ok, status: res.status, remaining, data };
  } catch (e) { clearTimeout(timer); return { ok: false, status: 0, remaining: 9999, data: null }; }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getTier(dayOfWeek, dayOfMonth) {
  // Tier 1: always (daily)
  // Tier 2: Mon=1, Thu=4
  // Tier 3: 1st of month only
  return {
    tier1: true,
    tier2: dayOfWeek === 1 || dayOfWeek === 4,
    tier3: dayOfMonth === 1
  };
}

export default async (req) => {
  const secret = req.headers.get('x-sync-secret');
  if (secret !== SYNC_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(req.url);
  const gameFilter  = url.searchParams.get('game') || null;
  const forceTier   = url.searchParams.get('tier') || null;  // force '1', '2', or '3'
  const runLimit    = parseInt(url.searchParams.get('limit') || '0', 10);

  const now = new Date();
  const dayOfWeek  = now.getUTCDay();
  const dayOfMonth = now.getUTCDate();
  const tiers = forceTier
    ? { tier1: forceTier === '1', tier2: forceTier === '2', tier3: forceTier === '3' }
    : getTier(dayOfWeek, dayOfMonth);

  const log = [];
  let totalCards    = 0;
  let totalRows     = 0;
  let totalFailed   = 0;
  let rateLimitHit  = false;
  let currentRemaining = 9999;

  log.push(`Tiers active: tier1=${tiers.tier1} tier2=${tiers.tier2} tier3=${tiers.tier3}`);

  const gamesToProcess = gameFilter
    ? GAMES.filter(g => g.game === gameFilter)
    : GAMES;

  for (const gameConfig of gamesToProcess) {
    if (rateLimitHit) break;

    const { game, table, priceCol } = gameConfig;
    log.push(`--- ${game.toUpperCase()} ---`);

    // Build price tier filters for this game
    const tierConfigs = [];
    if (tiers.tier1) tierConfigs.push({ min: 10, max: PRICE_CEILING, limit: TIER1_LIMIT, label: 'tier1' });
    if (tiers.tier2) tierConfigs.push({ min: 3,  max: 10,            limit: TIER2_LIMIT, label: 'tier2' });
    if (tiers.tier3) tierConfigs.push({ min: 1,  max: 3,             limit: TIER3_LIMIT, label: 'tier3' });

    for (const tierConf of tierConfigs) {
      if (rateLimitHit) break;

      let offset = 0;
      let tierProcessed = 0;
      let tierRows = 0;

      while (true) {
        if (rateLimitHit) break;
        if (runLimit > 0 && totalCards >= runLimit) break;
        if (tierProcessed >= tierConf.limit) break;

        // Fetch cards with tcgapi_id resolved, in price tier, ordered by price desc
        const path = `${table}?select=id,tcgapi_id,tcgplayer_id,name,${priceCol}&tcgapi_id=not.is.null&tcgapi_id=neq.-1&${priceCol}=gte.${tierConf.min}&${priceCol}=lte.${tierConf.max}&order=${priceCol}.desc.nullslast&limit=${BATCH_SIZE}&offset=${offset}`;

        let cards;
        try {
          cards = await supabaseGet(path);
        } catch (e) {
          log.push(`${game} ${tierConf.label}: Supabase read error: ${e.message}`);
          break;
        }

        if (!Array.isArray(cards) || cards.length === 0) break;

        // Deduplicate by tcgapi_id within batch (handles MTG variants)
        const seen = new Set();
        const deduped = [];
        for (const card of cards) {
          if (!card.tcgapi_id || seen.has(card.tcgapi_id)) continue;
          seen.add(card.tcgapi_id);
          deduped.push(card);
        }

        for (const card of deduped) {
          if (rateLimitHit) break;
          if (tierProcessed >= tierConf.limit) break;

          totalCards++;
          tierProcessed++;

          await sleep(CALL_DELAY_MS);

          const { ok, remaining, data } = await tcgapiGetHistory(card.tcgapi_id);
          currentRemaining = remaining;

          if (remaining <= RATE_LIMIT_STOP) {
            log.push(`RATE LIMIT: ${remaining} remaining. Stopping.`);
            rateLimitHit = true;
            break;
          }

          if (!ok || !data || !Array.isArray(data.data) || data.data.length === 0) {
            // 404 or empty history - skip silently, not an error
            continue;
          }

          // Build upsert rows from history data
          // Filter out weeks with zero market_price and zero sales_volume (no data)
          const rows = data.data
            .filter(h => h.date && h.printing && (h.market_price > 0 || h.sales_volume > 0))
            .map(h => ({
              game,
              tcgapi_id:           card.tcgapi_id,
              tcgplayer_id:        card.tcgplayer_id,
              card_name:           card.name,
              week_date:           h.date,
              printing:            h.printing || 'Normal',
              market_price_usd:    h.market_price   > 0 ? h.market_price   : null,
              avg_sales_price_usd: h.avg_sales_price > 0 ? h.avg_sales_price : null,
              sales_volume:        h.sales_volume    > 0 ? h.sales_volume    : null,
              low_price_usd:       h.low_price       > 0 ? h.low_price       : null,
              synced_at:           new Date().toISOString()
            }));

          if (rows.length === 0) continue;

          try {
            await supabaseUpsert(rows);
            tierRows += rows.length;
            totalRows += rows.length;
          } catch (e) {
            log.push(`${game}: upsert error for tcgapi_id ${card.tcgapi_id}: ${e.message}`);
            totalFailed++;
          }
        }

        offset += BATCH_SIZE;
        if (cards.length < BATCH_SIZE) break;
      }

      log.push(`${game} ${tierConf.label}: ${tierProcessed} cards, ${tierRows} rows upserted`);
    }
  }

  const summary = {
    totalCards,
    totalRows,
    totalFailed,
    rateLimitHit,
    currentRemaining,
    tiers,
    log
  };

  return new Response(JSON.stringify(summary, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
};

export const config = {};
