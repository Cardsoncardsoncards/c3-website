// netlify/functions/tcg-prices.mjs
// Proxy for TCGapi.dev price lookups — Pokemon, Lorcana, One Piece, Yu-Gi-Oh, Star Wars Unlimited
// Caches results in-memory for 30 minutes to preserve free tier quota (500 req/day)
// Env var required: TCGAPI_KEY

const TCGAPI_KEY = Netlify.env.get('TCGAPI_KEY');
const BASE_URL = 'https://tcgapi.dev/v1';

// Simple in-memory cache: key -> { data, expires }
const cache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { cache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data) {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL });
}

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=1800'
  }
});

// Map our game slugs to TCGapi game identifiers
const GAME_MAP = {
  'pokemon': 'pokemon',
  'lorcana': 'lorcana',
  'onepiece': 'one-piece',
  'yugioh': 'yugioh',
  'starwars': 'star-wars-unlimited',
  'riftbound': 'riftbound'
};

// Fetch price for a single card by name + set
async function fetchCardPrice(game, cardName, setName) {
  if (!TCGAPI_KEY) return null;

  const cacheKey = `price:${game}:${cardName}:${setName || ''}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      name: cardName,
      ...(setName ? { set: setName } : {}),
      limit: '5'
    });

    const res = await fetch(`${BASE_URL}/prices/${game}?${params}`, {
      headers: {
        'Authorization': `Bearer ${TCGAPI_KEY}`,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      console.error(`TCGapi error ${res.status} for ${game}/${cardName}`);
      return null;
    }

    const data = await res.json();
    cacheSet(cacheKey, data);
    return data;
  } catch (e) {
    console.error('TCGapi fetch error:', e.message);
    return null;
  }
}

// Fetch prices for a full set (used by hub pages to enrich top cards)
async function fetchSetPrices(game, setName) {
  if (!TCGAPI_KEY) return null;

  const cacheKey = `set:${game}:${setName}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({ set: setName, limit: '50' });
    const res = await fetch(`${BASE_URL}/prices/${game}?${params}`, {
      headers: {
        'Authorization': `Bearer ${TCGAPI_KEY}`,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) return null;
    const data = await res.json();
    cacheSet(cacheKey, data);
    return data;
  } catch (e) {
    console.error('TCGapi set fetch error:', e.message);
    return null;
  }
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Content-Type' }
    });
  }

  if (!TCGAPI_KEY) {
    return json({ error: 'TCGapi not configured' }, 503);
  }

  const url = new URL(req.url);
  const params = url.searchParams;

  // Required: game
  const gameSlug = params.get('game');
  if (!gameSlug || !GAME_MAP[gameSlug]) {
    return json({ error: `Invalid game. Valid values: ${Object.keys(GAME_MAP).join(', ')}` }, 400);
  }
  const game = GAME_MAP[gameSlug];

  // Mode: card lookup vs set lookup
  const cardName = params.get('name');
  const setName = params.get('set');

  if (!cardName && !setName) {
    return json({ error: 'Provide name and/or set parameter' }, 400);
  }

  if (cardName) {
    const data = await fetchCardPrice(game, cardName, setName);
    if (!data) return json({ error: 'No price data found' }, 404);
    return json({ game: gameSlug, card: cardName, set: setName || null, prices: data });
  }

  // Set-level lookup
  const data = await fetchSetPrices(game, setName);
  if (!data) return json({ error: 'No set price data found' }, 404);
  return json({ game: gameSlug, set: setName, prices: data });
};

export const config = {
  path: '/api/tcg-prices'
};
