// netlify/functions/card-kingdom.mjs
// Fetches Card Kingdom pricelist and returns retail + buylist for a given card name
// Cache: 6 hours in-memory (resets on function cold start)
// CK API: https://api.cardkingdom.com/api/v2/pricelist — free, no auth required

let ckCache = null;
let ckCacheTime = 0;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

async function getCKPricelist() {
  const now = Date.now();
  if (ckCache && (now - ckCacheTime) < CACHE_TTL) return ckCache;

  const res = await fetch('https://api.cardkingdom.com/api/v2/pricelist', {
    headers: { 'Accept': 'application/json', 'User-Agent': 'CardsonCardsonCards/1.0 (cardsoncardsoncards.com.au)' }
  });
  if (!res.ok) throw new Error(`CK API error: ${res.status}`);
  const data = await res.json();

  // Build a name-keyed map for fast lookup
  // CK pricelist: array of { name, price_retail, price_buy, foil_price_retail, foil_price_buy, ... }
  const map = {};
  const items = data.data || data || [];
  for (const item of items) {
    if (item.name) {
      const key = item.name.toLowerCase().trim();
      if (!map[key]) map[key] = item; // first match wins (non-foil preferred)
    }
  }

  ckCache = map;
  ckCacheTime = now;
  return map;
}

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, s-maxage=21600' // 6 hours CDN cache
  }
});

export default async (req) => {
  const url = new URL(req.url);
  const name = url.searchParams.get('name');

  if (!name) return json({ error: 'name parameter required' }, 400);

  try {
    const pricelist = await getCKPricelist();
    const key = name.toLowerCase().trim();
    const item = pricelist[key];

    if (!item) return json({ retail: null, buylist: null, found: false });

    return json({
      found: true,
      name: item.name,
      retail: item.price_retail || null,
      buylist: item.price_buy || null,
      foil_retail: item.foil_price_retail || null,
      foil_buylist: item.foil_price_buy || null
    });
  } catch (e) {
    console.error('[card-kingdom] Error:', e.message);
    return json({ error: 'Failed to fetch CK prices', retail: null, buylist: null }, 500);
  }
};

export const config = {
  path: '/api/card-kingdom'
};
