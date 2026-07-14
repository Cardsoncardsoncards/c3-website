// netlify/functions/random-card.mjs
// Returns random cards from any supported TCG game
// Query params: ?game=pokemon&limit=3&sort=price&min_price=10
// min_price is interpreted in AUD (converted to USD internally for non-MTG market_price)
// Supported games: mtg, pokemon, yugioh, lorcana, onepiece, riftbound, starwars, dbsfusionworld,
//                  dragonball, weissschwarz
// Optional &property=<slug> narrows Weiss Schwarz to one licensed property (via weissschwarz_sets).

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID        = '5339146789';

// GAME_TABLES membership is a CAPABILITY gate: an unlisted game gets a 400 from this endpoint.
// task-118 adds dbsfusionworld (the Core Dragon Ball game), which was missing and so could never
// be rolled. dragonball is KEPT: Extended, but removing it would 400 a game that works today.
const GAME_TABLES = {
  mtg:        'mtg_cards',
  pokemon:    'pokemon_cards',
  yugioh:     'yugioh_cards',
  lorcana:    'lorcana_cards',
  onepiece:   'onepiece_cards',
  riftbound:  'riftbound_cards',
  starwars:   'starwars_cards',
  dbsfusionworld: 'dbsfusionworld_cards',
  dragonball: 'dragonball_cards',
  weissschwarz: 'weissschwarz_cards',
};

// Used only to pick a random offset, so every value here must UNDER-count the rows that actually
// pass the image + rarity filters, or an offset can overshoot and return nothing.
const GAME_COUNTS = {
  mtg: 96480, pokemon: 31642, yugioh: 46588, lorcana: 2000,  // conservative: not all have images
  onepiece: 6289, riftbound: 1159, starwars: 6113, dragonball: 6261,
  dbsfusionworld: 3400,  // 3,573 have an image and rarity != None; conservative
  weissschwarz: 29000,  // 30,484 total (all imaged); ~29,832 with rarity != None; conservative
};

const GAME_PATHS = {
  mtg: '/cards/mtg', pokemon: '/cards/pokemon', yugioh: '/cards/yugioh',
  lorcana: '/cards/lorcana', onepiece: '/cards/onepiece', riftbound: '/cards/riftbound',
  starwars: '/cards/starwars', dbsfusionworld: '/cards/dbsfusionworld',
  dragonball: '/cards/dragonball',
  weissschwarz: '/cards/weissschwarz',
};

// MTG uses image_uri_small; all other games use image_url
const IMAGE_FIELD = {
  mtg: 'image_uri_small',
};
function getImageField(game) {
  return IMAGE_FIELD[game] || 'image_url';
}

// Weiss Schwarz has no property column on the cards table. Resolve the set ids
// for a licensed property from weissschwarz_sets, so the card query can narrow
// via set_id=in.(...). Returns [] on any failure (caller falls back to unfiltered).
async function resolveWsSetIds(property) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/weissschwarz_sets?property=eq.${encodeURIComponent(property)}&select=id`,
      { signal: controller.signal, headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.map(r => r.id).filter(id => id != null) : [];
  } catch { clearTimeout(timer); return []; }
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
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '1'), 20);
  const rarityParam = (url.searchParams.get('rarity') || 'all').toLowerCase();
  const property = url.searchParams.get('property') || null;

  if (!game || !GAME_TABLES[game]) {
    return json({ error: 'Invalid game. Supported: ' + Object.keys(GAME_TABLES).join(', ') }, 400);
  }

  const table     = GAME_TABLES[game];
  const total     = GAME_COUNTS[game] || 1000;
  const cardPath  = GAME_PATHS[game];
  const imgField  = getImageField(game);

  const sortParam = (url.searchParams.get('sort') || 'random').toLowerCase();
  const usePrice = sortParam === 'price';

  // Optional minimum price floor, interpreted in AUD. 0 or invalid means no floor.
  const minPriceRaw = parseFloat(url.searchParams.get('min_price') || '0');
  const minPrice = Number.isFinite(minPriceRaw) && minPriceRaw > 0 ? minPriceRaw : 0;

  // When using price sort, start from offset 0 (top cards)
  // When random, use a safe offset capped at half the total to avoid empty results
  const safeMax = Math.max(1, Math.floor(total * 0.7) - limit);
  let offset = usePrice ? 0 : Math.floor(Math.random() * safeMax);

  // MTG: filter on image_uri_small; others: filter on image_url
  let imageFilter, rarityFilter, selectFields;
  if (game === 'mtg') {
    imageFilter  = `image_uri_small=not.is.null&tcgplayer_id=not.is.null`;
    if (rarityParam === 'mythic') rarityFilter = `&rarity=eq.mythic`;
    else if (rarityParam === 'rare') rarityFilter = `&rarity=in.(rare,mythic)`;
    else rarityFilter = '';
    selectFields = `id,slug,name,image_uri_small,price_aud,price_usd,rarity,set_code,set_name`;
  } else {
    imageFilter  = `image_url=not.is.null`;
    // Base filter: exclude rarity=None (sealed product in starwars/dragonball)
    const baseRarity = `&rarity=neq.None`;
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

  // Order: price sort uses price_aud desc (or market_price for non-MTG), random uses id/tcgplayer_id
  let orderStr;
  if (usePrice) {
    if (game === 'mtg') orderStr = 'price_aud.desc.nullslast';
    else orderStr = 'market_price.desc.nullslast';
  } else {
    orderStr = game === 'mtg' ? 'tcgplayer_id' : 'id';
  }
  // Price filter. MTG filters on price_aud (AUD); other games on market_price (USD, ~1.45 to AUD).
  // A min_price floor (AUD) applies whenever supplied; otherwise price sort still excludes zero-price cards.
  let priceFilter = '';
  if (game === 'mtg') {
    if (minPrice > 0) priceFilter = `&price_aud=gte.${minPrice}`;
    else if (usePrice) priceFilter = '&price_aud=gt.0';
  } else {
    // TODO: replace with live FX rate once price_aud DB coverage confirmed
    if (minPrice > 0) priceFilter = `&market_price=gte.${(minPrice / 1.45).toFixed(2)}`;
    else if (usePrice) priceFilter = '&market_price=gt.0';
  }
  // Weiss Schwarz property filter: resolve set ids first, then narrow by set_id.
  // Property pools are small, so reset the offset to 0 (the full-table offset would
  // overshoot the filtered pool and 404). Falls back to unfiltered if zero sets match.
  let wsSetFilter = '';
  if (game === 'weissschwarz' && property) {
    const ids = await resolveWsSetIds(property);
    if (ids.length) { wsSetFilter = `&set_id=in.(${ids.join(',')})`; offset = 0; }
  }
  const query = `${SUPABASE_URL}/rest/v1/${table}?${imageFilter}${rarityFilter}${priceFilter}${wsSetFilter}&order=${orderStr}&limit=${limit}&offset=${offset}&select=${selectFields}`;

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
          ? `~AU$${(parseFloat(c.market_price) * 1.45).toFixed(2)}`
          : 'Price TBC';
      return {
        ...c,
        image_url:    imageUrl,
        cardUrl:      `${cardPath}/${c.slug}`,
        priceDisplay: priceAud,
        ebayUrl:      `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(c.name)}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`,
      };
    });

    return json({ cards, game, total, offset });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

export const config = { path: '/api/random-card' };
