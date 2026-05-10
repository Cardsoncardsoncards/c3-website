// netlify/functions/random-card.mjs
// Returns a random card from any supported TCG game
// Query params: ?game=pokemon&limit=1
// Supported games: pokemon, yugioh, lorcana, onepiece, riftbound, starwars, dragonball

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID        = '5339146789';

const GAME_TABLES = {
  pokemon:    'pokemon_cards',
  yugioh:     'yugioh_cards',
  lorcana:    'lorcana_cards',
  onepiece:   'onepiece_cards',
  riftbound:  'riftbound_cards',
  starwars:   'starwars_cards',
  dragonball: 'dragonball_cards',
};

const GAME_COUNTS = {
  pokemon: 31488, yugioh: 46588, lorcana: 3153,
  onepiece: 6641, riftbound: 1159, starwars: 6113, dragonball: 6261,
};

const GAME_PATHS = {
  pokemon: '/cards/pokemon', yugioh: '/cards/yugioh', lorcana: '/cards/lorcana',
  onepiece: '/cards/onepiece', riftbound: '/cards/riftbound',
  starwars: '/cards/starwars', dragonball: '/cards/dragonball',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'  // random cards should never cache
    }
  });
}

export default async (req) => {
  const url  = new URL(req.url);
  const game = (url.searchParams.get('game') || '').toLowerCase();
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '1'), 6);

  if (!game || !GAME_TABLES[game]) {
    return json({ error: 'Invalid game. Supported: ' + Object.keys(GAME_TABLES).join(', ') }, 400);
  }

  const table    = GAME_TABLES[game];
  const total    = GAME_COUNTS[game] || 1000;
  const cardPath = GAME_PATHS[game];

  // Get random offset
  const offset = Math.floor(Math.random() * Math.max(1, total - limit));

  // Build query -- get cards with images only, skip sealed
  const query = `${SUPABASE_URL}/rest/v1/${table}?image_url=not.is.null&rarity=not.is.null&rarity=neq.None&order=id&limit=${limit}&offset=${offset}&select=id,slug,name,number,image_url,market_price,price_aud,rarity,set_name`;

  try {
    const res = await fetch(query, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });

    if (!res.ok) return json({ error: 'Database error' }, 500);

    let cards = await res.json();
    if (!Array.isArray(cards) || !cards.length) return json({ error: 'No cards found' }, 404);

    cards = cards.map(c => ({
      ...c,
      cardUrl:      `${cardPath}/${c.slug}`,
      priceDisplay: c.price_aud
        ? `AU$${parseFloat(c.price_aud).toFixed(2)}`
        : c.market_price
          ? `~AU$${(parseFloat(c.market_price)*1.58).toFixed(2)}`
          : 'Price TBC',
      ebayUrl: `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(c.name)}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`,
    }));

    return json({ cards, game, total, offset });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

export const config = { path: '/api/random-card' };
