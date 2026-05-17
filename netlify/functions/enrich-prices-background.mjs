// netlify/functions/enrich-prices-background.mjs
// Daily enrichment sync - runs at 5:00am UTC (3:00pm AEST)
// Fetches detailed price data for top-value cards across all games
// Adds: median_price, lowest_with_shipping, buylist_price, total_listings
// 
// Budget: ~9,000 requests/day total across all syncs
// This function uses whatever is left after bulk syncs (~4,800 requests)
// Targets top cards by market_price across all 32 game tables
//
// DAILY games (MTG, Pokemon, YuGiOh): enriched every day
// ODD DAY games (Group A): enriched on Mon/Wed/Fri/Sun
// EVEN DAY games (Group B): enriched on Tue/Thu/Sat

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const SUPABASE_ANON_KEY    = Netlify.env.get('SUPABASE_ANON_KEY');
const TCGAPI_KEY           = Netlify.env.get('TCGAPI_KEY');
const SYNC_SECRET          = Netlify.env.get('SYNC_SECRET');
const TCGAPI_BASE          = 'https://api.tcgapi.dev/v1';
const RATE_LIMIT_BUFFER    = 300;

// Games that sync every day
const DAILY_GAMES = [
  { table: 'mtg_cards',     label: 'MTG' },
  { table: 'pokemon_cards', label: 'Pokemon' },
  { table: 'yugioh_cards',  label: 'YuGiOh' },
];

// Group A: odd day games (Mon=1, Wed=3, Fri=5, Sun=0)
const GROUP_A_GAMES = [
  { table: 'dragonball_cards',      label: 'Dragon Ball' },
  { table: 'shadowverse_cards',     label: 'Shadowverse' },
  { table: 'universus_cards',       label: 'UniVersus' },
  { table: 'starwars_cards',        label: 'Star Wars' },
  { table: 'finalfantasy_cards',    label: 'Final Fantasy' },
  { table: 'wixoss_cards',          label: 'WIXOSS' },
  { table: 'dbsfusionworld_cards',  label: 'DBS Fusion World' },
  { table: 'metazoo_cards',         label: 'MetaZoo' },
  { table: 'alphaclash_cards',      label: 'Alpha Clash' },
  { table: 'dragonballz_cards',     label: 'Dragon Ball Z' },
  { table: 'bakugan_cards',         label: 'Bakugan' },
  { table: 'hololive_cards',        label: 'Hololive' },
  { table: 'warhammer_cards',       label: 'Warhammer' },
];

// Group B: even day games (Tue=2, Thu=4, Sat=6)
const GROUP_B_GAMES = [
  { table: 'weissschwarz_cards',    label: 'Weiss Schwarz' },
  { table: 'digimon_cards',         label: 'Digimon' },
  { table: 'vanguard_cards',        label: 'Vanguard' },
  { table: 'forceofwill_cards',     label: 'Force of Will' },
  { table: 'buddyfight_cards',      label: 'BuddyFight' },
  { table: 'onepiece_cards',        label: 'One Piece' },
  { table: 'unionarena_cards',      label: 'Union Arena' },
  { table: 'wow_cards',             label: 'WoW TCG' },
  { table: 'grandarchive_cards',    label: 'Grand Archive' },
  { table: 'sorcery_cards',         label: 'Sorcery' },
  { table: 'lorcana_cards',         label: 'Lorcana' },
  { table: 'gateruler_cards',       label: 'Gate Ruler' },
  { table: 'battlespiritssaga_cards', label: 'Battle Spirits' },
  { table: 'gundam_cards',          label: 'Gundam' },
  { table: 'riftbound_cards',       label: 'Riftbound' },
  { table: 'godzilla_cards',        label: 'Godzilla' },
];

async function tcgapiGetPrices(cardId) {
  const res = await fetch(`${TCGAPI_BASE}/cards/${cardId}/prices`, {
    headers: { 'X-API-Key': TCGAPI_KEY }
  });
  if (!res.ok) return null;
  const remaining = parseInt(res.headers.get('x-ratelimit-remaining') ?? '9999', 10);
  if (remaining < RATE_LIMIT_BUFFER) {
    throw new Error(`Rate limit low: ${remaining} remaining. Aborting enrichment.`);
  }
  try {
    const data = await res.json();
    return data.data || null;
  } catch {
    return null;
  }
}

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function supabaseUpdate(table, id, fields) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(fields)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase PATCH ${table} id=${id} failed: ${err.slice(0, 200)}`);
  }
}

function parsePriceData(priceData, audRate) {
  if (!priceData) return null;

  // priceData can be a single object or array of printings
  const printings = Array.isArray(priceData) ? priceData : [priceData];
  const normal = printings.find(p => p.printing === 'Normal' || p.printing === 'normal') || printings[0];
  const foil   = printings.find(p => p.printing === 'Foil' || p.printing === 'foil' || p.printing === 'Holo');

  if (!normal) return null;

  return {
    median_price:          normal.median_price || null,
    lowest_with_shipping:  normal.lowest_with_shipping || null,
    buylist_price:         normal.buylist_price || null,
    total_listings:        normal.total_listings || null,
    foil_median_price:     foil ? (foil.median_price || null) : null,
    foil_buylist_price:    foil ? (foil.buylist_price || null) : null,
    enriched_at:           new Date().toISOString()
  };
}

async function enrichGame(game, budgetCards, audRate) {
  console.log(`[enrich] ${game.label}: fetching top ${budgetCards} cards`);

  // Fetch top cards by price from this game's table
  const cards = await supabaseGet(
    `${game.table}?order=market_price.desc.nullslast&limit=${budgetCards}&select=id,market_price&market_price=gt.0`
  );

  if (!cards.length) {
    console.log(`[enrich] ${game.label}: no priced cards found`);
    return 0;
  }

  let enriched = 0;
  let failed = 0;

  for (const card of cards) {
    try {
      const priceData = await tcgapiGetPrices(card.id);
      const fields = parsePriceData(priceData, audRate);
      if (fields) {
        await supabaseUpdate(game.table, card.id, fields);
        enriched++;
      }
    } catch (e) {
      if (e.message.includes('Rate limit low')) throw e;
      failed++;
      if (failed > 10) {
        console.error(`[enrich] ${game.label}: too many failures, skipping rest`);
        break;
      }
    }
  }

  console.log(`[enrich] ${game.label}: enriched ${enriched}/${cards.length} cards`);
  return enriched;
}

export default async (req) => {
  console.log('[enrich-prices] Starting...');
  const start = Date.now();

  const secret = req.headers.get('x-sync-secret');
  const isScheduled = !secret;
  if (!isScheduled && (!SYNC_SECRET || secret !== SYNC_SECRET)) {
    return new Response('Unauthorised', { status: 401 });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !TCGAPI_KEY) {
    return new Response('Missing env vars', { status: 500 });
  }

  try {
    // Determine today's day of week (0=Sun, 1=Mon ... 6=Sat)
    const dayOfWeek = new Date().getUTCDay();
    const isOddDay  = dayOfWeek % 2 !== 0;  // Mon/Wed/Fri/Sun = odd indices (1,3,5,0)
    const isGroupA  = [1, 3, 5, 0].includes(dayOfWeek);
    const isGroupB  = [2, 4, 6].includes(dayOfWeek);

    console.log(`[enrich-prices] Day ${dayOfWeek}, Group A: ${isGroupA}, Group B: ${isGroupB}`);

    // Build today's active game list
    const todayGames = [...DAILY_GAMES];
    if (isGroupA) todayGames.push(...GROUP_A_GAMES);
    if (isGroupB) todayGames.push(...GROUP_B_GAMES);

    console.log(`[enrich-prices] Active games today: ${todayGames.map(g => g.label).join(', ')}`);

    // Budget allocation:
    // Total limit: 10,000
    // Base sync cost today (approximate):
    //   Daily games (MTG+Pokemon+YuGiOh): 3,262
    //   Group A extra: 1,006  or  Group B extra: 1,875
    // Remaining for enrichment: ~4,800 to 5,700
    // Use 4,500 as a conservative enrichment budget (leaves safety margin)
    const TOTAL_ENRICHMENT_BUDGET = 4500;

    // Allocate budget proportionally by card count estimates
    const gameWeights = {
      'mtg_cards':              122270,
      'pokemon_cards':           31495,
      'yugioh_cards':            45711,
      'lorcana_cards':            2889,
      'onepiece_cards':           6643,
      'dragonball_cards':        11587,
      'starwars_cards':           6073,
      'riftbound_cards':           794,
      'digimon_cards':           26427,
      'weissschwarz_cards':      30138,
      'vanguard_cards':          24371,
      'finalfantasy_cards':       5302,
      'unionarena_cards':         5591,
      'forceofwill_cards':       13403,
      'battlespiritssaga_cards':  1947,
      'shadowverse_cards':       11522,
      'grandarchive_cards':       3721,
      'universus_cards':          7869,
      'buddyfight_cards':         7763,
      'dbsfusionworld_cards':     3491,
      'metazoo_cards':            3455,
      'sorcery_cards':            3171,
      'gundam_cards':             1181,
      'hololive_cards':           1160,
      'wixoss_cards':             4670,
      'wow_cards':                4735,
      'gateruler_cards':          1184,
      'alphaclash_cards':         1933,
      'bakugan_cards':            1650,
      'dragonballz_cards':        1820,
      'godzilla_cards':            694,
      'warhammer_cards':          1184,
    };

    const totalWeight = todayGames.reduce((sum, g) => sum + (gameWeights[g.table] || 1000), 0);

    // Allocate cards per game, minimum 20, maximum 2000
    const gameAllocations = todayGames.map(g => {
      const weight = gameWeights[g.table] || 1000;
      const allocated = Math.round((weight / totalWeight) * TOTAL_ENRICHMENT_BUDGET);
      return {
        ...g,
        budget: Math.max(20, Math.min(2000, allocated))
      };
    });

    console.log('[enrich-prices] Budget allocations:');
    gameAllocations.forEach(g => console.log(`  ${g.label}: ${g.budget} cards`));

    // Use a fixed AUD rate for consistency (no extra API call needed)
    let audRate = 1.58;
    try {
      const fxRes = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const fxData = await fxRes.json();
      audRate = fxData.rates?.AUD || 1.58;
    } catch {
      console.log('[enrich-prices] FX fetch failed, using fallback 1.58');
    }

    // Run enrichment for each game
    let totalEnriched = 0;
    for (const game of gameAllocations) {
      totalEnriched += await enrichGame(game, game.budget, audRate);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[enrich-prices] Done. ${totalEnriched} cards enriched in ${elapsed}s`);

    return new Response(JSON.stringify({ enriched: totalEnriched, elapsed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[enrich-prices] FATAL:', err.message);
    return new Response(err.message, { status: 500 });
  }
};

export const config = {
  schedule: "0 5 * * *",
  type: "background"
};
