// netlify/functions/set-carousel.mjs
// Server-side Supabase query for set-specific card carousels
// Called by homepage and other pages to fetch top cards from a specific set
//
// Query params:
//   ?game=riftbound&set_id=500006&limit=16
//   ?game=lorcana&set_id=4500014&limit=16

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID        = '5339146789';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=1800'
    }
  });
}

// Map game name to table name
const GAME_TABLES = {
  riftbound: 'riftbound_cards',
  lorcana:   'lorcana_cards',
  pokemon:   'pokemon_cards',
  yugioh:    'yugioh_cards',
  onepiece:  'onepiece_cards',
  starwars:  'starwars_cards',
  dragonball:'dragonball_cards',
  mtg:       'mtg_cards',
};

// Map game to card URL path
const GAME_PATHS = {
  riftbound:  '/cards/riftbound',
  lorcana:    '/cards/lorcana',
  pokemon:    '/cards/pokemon',
  yugioh:     '/cards/yugioh',
  onepiece:   '/cards/onepiece',
  starwars:   '/cards/starwars',
  dragonball: '/cards/dragonball',
  mtg:        '/cards/mtg',
};

export default async (req) => {
  const url   = new URL(req.url);
  const game  = (url.searchParams.get('game') || '').toLowerCase();
  const setId = url.searchParams.get('set_id');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '16'), 24);

  if (!game || !GAME_TABLES[game]) {
    return json({ error: 'Invalid game parameter' }, 400);
  }

  const table    = GAME_TABLES[game];
  const cardPath = GAME_PATHS[game];

  // Build query - filter out sealed products (name contains Booster/Box/Case) and items without images
  let query = `${SUPABASE_URL}/rest/v1/${table}?`;

  if (setId) {
    query += `set_id=eq.${encodeURIComponent(setId)}&`;
  }

  // Filter: must have image, must have price, exclude sealed products
  query += `image_url=not.is.null&market_price=gt.0&rarity=not.is.null&rarity=neq.None`;

  // For games that use price_aud
  query += `&order=market_price.desc.nullslast&limit=${limit}`;
  query += `&select=slug,name,number,image_url,market_price,price_aud,rarity,set_name`;

  try {
    const res = await fetch(query, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    if (!res.ok) {
      const err = await res.text();
      return json({ error: `Supabase error: ${err.slice(0, 200)}` }, 500);
    }

    let cards = await res.json();

    // Filter out sealed products server-side
    const sealedKeywords = ['booster box', 'booster case', 'elite trainer', 'display box', 'case (wave', 'booster set', 'display case', 'event kit', 'trove case', 'champion deck', 'display', 'sealed', 'bundle', 'collection box'];
    cards = cards.filter(c => {
      const nameLower = (c.name || '').toLowerCase();
      // Keep if rarity is set (individual cards always have rarity)
      if (c.rarity && c.rarity !== 'None' && c.rarity !== 'none') return true;
      // Reject if name contains sealed keywords
      return !sealedKeywords.some(kw => nameLower.includes(kw));
    });

    // Add card URL and formatted price
    cards = cards.map(c => ({
      ...c,
      cardUrl:      `${cardPath}/${c.slug}`,
      ebayUrl:      `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(c.name)}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`,
      priceDisplay: c.price_aud
        ? `AU$${parseFloat(c.price_aud).toFixed(0)}`
        : c.market_price
          ? `~AU$${(parseFloat(c.market_price) * 1.58).toFixed(0)}`
          : '',
    }));

    return json({ cards, game, set_id: setId, count: cards.length });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

export const config = { path: '/api/set-carousel' };
