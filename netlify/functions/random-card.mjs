// netlify/functions/random-card.mjs
// Returns random cards from any supported TCG game
// Query params: ?game=pokemon&limit=3
// Supported games: mtg, pokemon, yugioh, lorcana, onepiece, riftbound, starwars, dragonball

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID        = '5339146789';

const GAME_TABLES = {
  mtg:        'mtg_cards',
  pokemon:    'pokemon_cards',
  yugioh:     'yugioh_cards',
  lorcana:    'lorcana_cards',
  onepiece:   'onepiece_cards',
  riftbound:  'riftbound_cards',
  starwars:   'starwars_cards',
  dragonball: 'dragonball_cards',
};

const GAME_COUNTS = {
  mtg: 96480, pokemon: 31642, yugioh: 46588, lorcana: 3153,
  onepiece: 6289, riftbound: 1159, starwars: 6113, dragonball: 6261,
};

const GAME_PATHS = {
  mtg: '/cards/mtg', pokemon: '/cards/pokemon', yugioh: '/cards/yugioh',
  lorcana: '/cards/lorcana', onepiece: '/cards/onepiece', riftbound: '/cards/riftbound',
  starwars: '/cards/starwars', dragonball: '/cards/dragonball',
};

// MTG uses image_uri_small; all other games use image_url
const IMAGE_FIELD = {
  mtg: 'image_uri_small',
};
function getImageField(game) {
  return IMAGE_FIELD[game] || 'image_url';
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    }
  });
}

export default async (req) => {
  const url   = new URL(req.url);
  const game  = (url.searchParams.get('game') || '').toLowerCase();
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '1'), 6);
  const rarityParam = (url.searchParams.get('rarity') || 'all').toLowerCase();

  if (!game || !GAME_TABLES[game]) {
    return json({ error: 'Invalid game. Supported: ' + Object.keys(GAME_TABLES).join(', ') }, 400);
  }

  const table     = GAME_TABLES[game];
  const total     = GAME_COUNTS[game] || 1000;
  const cardPath  = GAME_PATHS[game];
  const imgField  = getImageField(game);

  const offset = Math.floor(Math.random() * Math.max(1, total - limit));

  // MTG: filter on image_uri_small; others: filter on image_url
  // MTG has no rarity column in the same way -- skip rarity filter for MTG
  let imageFilter, rarityFilter, selectFields;
  if (game === 'mtg') {
    imageFilter  = `image_uri_small=not.is.null`;
    if (rarityParam === 'mythic') rarityFilter = `&rarity=eq.mythic`;
    else if (rarityParam === 'rare') rarityFilter = `&rarity=in.(rare,mythic)`;
    else rarityFilter = '';
    selectFields = `id,slug,name,image_uri_small,price_aud,price_usd,rarity,set_code,set_name`;
  } else {
    imageFilter  = `image_url=not.is.null`;
    // Base filter: always exclude sealed/null
    const baseRarity = `&rarity=not.is.null&rarity=neq.None`;
    // Game-specific rarity mappings based on actual DB values
    const rarityMap = {
      pokemon: {
        rare:    `&rarity=not.is.null&rarity=neq.None&rarity=in.(Rare,Holo Rare,Double Rare,Ultra Rare,Illustration Rare,Secret Rare,Special Illustration Rare,Hyper Rare,Shiny Holo Rare,Shiny Rare)`,
        ultra:   `&rarity=not.is.null&rarity=neq.None&rarity=in.(Ultra Rare,Illustration Rare,Secret Rare,Special Illustration Rare,Hyper Rare,Shiny Holo Rare,Shiny Rare)`,
        secret:  `&rarity=not.is.null&rarity=neq.None&rarity=in.(Secret Rare,Special Illustration Rare,Hyper Rare)`,
      },
      yugioh: {
        super:   `&rarity=not.is.null&rarity=neq.None&rarity=ilike.*super rare*`,
        ultra:   `&rarity=not.is.null&rarity=neq.None&rarity=ilike.*ultra rare*`,
        secret:  `&rarity=not.is.null&rarity=neq.None&rarity=ilike.*secret rare*`,
      },
      lorcana: {
        super:      `&rarity=not.is.null&rarity=neq.None&rarity=in.(Super Rare,Enchanted)`,
        enchanted:  `&rarity=eq.Enchanted`,
      },
      onepiece: {
        rare:   `&rarity=not.is.null&rarity=neq.None&rarity=in.(R,SR,L,SEC)`,
        leader: `&rarity=in.(L,SEC)`,
      },
      riftbound: {
        rare:  `&rarity=not.is.null&rarity=neq.None&rarity=in.(Rare,Epic,Showcase)`,
        epic:  `&rarity=in.(Epic,Showcase)`,
      },
      dragonball: {
        rare:  `&rarity=not.is.null&rarity=neq.None&rarity=in.(Rare,Expansion Rare,Super Rare,Special Rare)`,
        super: `&rarity=not.is.null&rarity=neq.None&rarity=in.(Super Rare,Special Rare)`,
      },
      starwars: {
        rare:      `&rarity=not.is.null&rarity=neq.None&rarity=in.(Rare,Legendary,Special)`,
        legendary: `&rarity=in.(Legendary,Special)`,
      },
    };
    const gameFilters = rarityMap[game] || {};
    rarityFilter = gameFilters[rarityParam] || baseRarity;
    selectFields = `id,slug,name,number,image_url,market_price,price_aud,rarity,set_name`;
  }

  const query = `${SUPABASE_URL}/rest/v1/${table}?${imageFilter}${rarityFilter}&order=id&limit=${limit}&offset=${offset}&select=${selectFields}`;

  try {
    const res = await fetch(query, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });

    if (!res.ok) return json({ error: 'Database error' }, 500);

    let cards = await res.json();
    if (!Array.isArray(cards) || !cards.length) return json({ error: 'No cards found' }, 404);

    cards = cards.map(c => {
      // Normalise image field so frontend always uses c.image_url
      const imageUrl = c.image_uri_small || c.image_url || null;
      const priceAud = c.price_aud
        ? `AU$${parseFloat(c.price_aud).toFixed(2)}`
        : c.market_price
          ? `~AU$${(parseFloat(c.market_price) * 1.58).toFixed(2)}`
          : 'Price TBC';
      return {
        ...c,
        image_url:    imageUrl,
        cardUrl:      `${cardPath}/${c.slug}`,
        priceDisplay: priceAud,
        ebayUrl:      `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(c.name)}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`,
      };
    });

    return json({ cards, game, total, offset });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

export const config = { path: '/api/random-card' };
