// netlify/functions/random-card.mjs
// Returns random cards from any supported TCG game
// Query params: ?game=pokemon&limit=3&sort=price&min_price=10
// min_price is interpreted in AUD (converted to USD internally for non-MTG market_price)
// Supported games: mtg, pokemon, yugioh, lorcana, onepiece, riftbound, starwars, dbsfusionworld,
//                  dragonball, weissschwarz
// Optional &property=<slug> narrows Weiss Schwarz to one licensed property (via weissschwarz_sets).

import { fxRate } from './shared/fx-rate.mjs';

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

// C3L-70. LAST-RESORT FALLBACK ONLY. These were the live figures, and they are now used solely
// when the live count below cannot be obtained.
//
// They were previously the only source of the total, and the comment here said each value must
// UNDER-count deliberately so an offset could never overshoot. That is a sound instinct with an
// unsound consequence: paired with the 0.7 cap below, the two safety margins COMPOUND, and every
// card past the product of them became structurally undrawable. Measured 10 August 2026 against
// the rows that actually pass the image and rarity filters this endpoint uses:
//
//   dragonball      6,261 assumed vs 11,405 real   38.4 per cent reachable
//   lorcana         2,000 assumed vs  3,171 real   44.2 per cent reachable
//   starwars        6,113 assumed vs  7,789 real   54.9 per cent reachable
//   dbsfusionworld  3,400 assumed vs  3,714 real   64.1 per cent reachable
//   riftbound       1,159 assumed vs  1,250 real   64.9 per cent reachable
//   weissschwarz   29,000 assumed vs 30,777 real   66.0 per cent reachable
//   onepiece        6,289 assumed vs  6,644 real   66.3 per cent reachable
//   mtg            96,480 assumed vs 96,684 real   69.9 per cent reachable
//   yugioh         46,588 assumed vs 45,902 real   71.0 per cent reachable
//   pokemon        31,642 assumed vs 29,103 real   76.1 per cent reachable
//
// Note Pokemon and Yu-Gi-Oh, where the constant OVER-counts. The stated invariant that every
// value under-counts was not true, so the overshoot the 0.7 cap defends against was a live
// possibility, not a hypothetical. The real answer to both problems is an accurate count plus
// a retry, which is what this file now does.
const GAME_COUNTS_FALLBACK = {
  mtg: 96480, pokemon: 29103, yugioh: 45902, lorcana: 3171,
  onepiece: 6644, riftbound: 1250, starwars: 7789, dragonball: 11405,
  dbsfusionworld: 3714,
  weissschwarz: 30777,
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

// C3L-70. How many rows actually match the filters this request is about to use.
//
// count=exact is banned in this repo because it forces a sequential scan. count=estimated reads
// the planner's estimate instead, which is the right precision for choosing a random offset and
// costs nothing. PostgREST falls back to an exact count on its own when the estimate is small.
//
// The estimate can land either side of the truth, so the caller retries on an empty result
// rather than trusting it. That is the trade this replaces: a permanent 30 per cent haircut on
// every game, swapped for an occasional second query on the rare overshoot.
const countCache = new Map();
const COUNT_TTL_MS = 10 * 60 * 1000;

async function countMatchingRows(table, filterQuery) {
  const key = `${table}?${filterQuery}`;
  const hit = countCache.get(key);
  if (hit && Date.now() - hit.at < COUNT_TTL_MS) return hit.total;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filterQuery}&select=id&limit=1`, {
      signal: controller.signal,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'count=estimated',
        'Range-Unit': 'items'
      }
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    // Content-Range looks like "0-0/12345", or "*/12345" when the page is empty.
    const cr = res.headers.get('content-range') || '';
    const total = parseInt(cr.split('/')[1], 10);
    if (!Number.isFinite(total) || total <= 0) return null;
    countCache.set(key, { total, at: Date.now() });
    return total;
  } catch {
    clearTimeout(timer);
    return null;
  }
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
  // C3L-130 shape 2. Read the live rate once per invocation and let the nested render
  // helpers close over it. It cannot be awaited at each use: several of those helpers
  // are synchronous. fxRate() never throws and falls back to a labelled constant.
  const audRate = await fxRate();
  const url   = new URL(req.url);
  const game  = (url.searchParams.get('game') || '').toLowerCase();
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '1'), 20);
  const rarityParam = (url.searchParams.get('rarity') || 'all').toLowerCase();
  const property = url.searchParams.get('property') || null;

  if (!game || !GAME_TABLES[game]) {
    return json({ error: 'Invalid game. Supported: ' + Object.keys(GAME_TABLES).join(', ') }, 400);
  }

  const table     = GAME_TABLES[game];
  const cardPath  = GAME_PATHS[game];
  const imgField  = getImageField(game);

  const sortParam = (url.searchParams.get('sort') || 'random').toLowerCase();
  const usePrice = sortParam === 'price';

  // Optional minimum price floor, interpreted in AUD. 0 or invalid means no floor.
  const minPriceRaw = parseFloat(url.searchParams.get('min_price') || '0');
  const minPrice = Number.isFinite(minPriceRaw) && minPriceRaw > 0 ? minPriceRaw : 0;

  // C3L-70. The offset is chosen further down, once the filters it has to be valid against are
  // actually known. It used to be computed here, before them, which is why it could only ever be
  // derived from a whole-table guess.
  let offset = 0;
  let total = 0;

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
    // C3L-130, a variant the shape 2 sweep missed. min_price arrives in AUD and market_price is
    // USD, so this converts the OTHER way and the literal appeared as a DIVISION, not a `* 1.45`.
    // Every grep that closed shape 2 looked for multiplication. At the live 1.4164 the old line
    // asked for market_price >= 6.90 on a min_price of AU$10 where the correct floor is 7.06, so
    // it let through cards below the price the user asked for. audRate is already read above.
    if (minPrice > 0) priceFilter = `&market_price=gte.${(minPrice / audRate).toFixed(2)}`;
    else if (usePrice) priceFilter = '&market_price=gt.0';
  }
  // Weiss Schwarz property filter: resolve set ids first, then narrow by set_id.
  // Property pools are small, so reset the offset to 0 (the full-table offset would
  // overshoot the filtered pool and 404). Falls back to unfiltered if zero sets match.
  let wsSetFilter = '';
  let wsNarrowed = false;
  if (game === 'weissschwarz' && property) {
    const ids = await resolveWsSetIds(property);
    if (ids.length) { wsSetFilter = `&set_id=in.(${ids.join(',')})`; wsNarrowed = true; }
  }

  // C3L-70. Count against the SAME filters this request will use, then pick the offset from that.
  // The property-narrowed Weiss Schwarz pool is counted too, rather than special-cased to offset
  // 0: that special case existed only because the old total was a whole-table figure that would
  // always overshoot a property pool.
  const filterQuery = `${imageFilter}${rarityFilter}${priceFilter}${wsSetFilter}`;
  const counted = await countMatchingRows(table, filterQuery);
  total = counted != null
    ? counted
    : (wsNarrowed ? 0 : (GAME_COUNTS_FALLBACK[game] || 1000));

  // No 0.7 cap. It existed to absorb an inaccurate total, and the total is no longer a guess.
  // The retry below is what now handles an estimate that lands high, which costs one extra query
  // on the rare miss instead of hiding a third of the catalogue on every single request.
  const offsetCeiling = Math.max(0, total - limit);
  offset = usePrice || offsetCeiling <= 0 ? 0 : Math.floor(Math.random() * (offsetCeiling + 1));

  const runQuery = async (off) => {
    const q = `${SUPABASE_URL}/rest/v1/${table}?${filterQuery}&order=${orderStr}&limit=${limit}&offset=${off}&select=${selectFields}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const r = await fetch(q, { signal: controller.signal, headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } });
      clearTimeout(timer);
      return r;
    } catch (e) { clearTimeout(timer); throw e; }
  };

  try {
    // count=estimated can land above the true row count, which returns an empty page rather than
    // an error. Halve, then fall back to 0, which cannot overshoot if any row matches at all.
    const attempts = offset > 0 ? [offset, Math.floor(offset / 2), 0] : [0];
    let cards = null;
    let usedOffset = 0;
    for (const off of attempts) {
      const res = await runQuery(off);
      if (!res.ok) return json({ error: 'Database error' }, 500);
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length) { cards = rows; usedOffset = off; break; }
    }
    if (!cards) return json({ error: 'No cards found' }, 404);
    offset = usedOffset;

    cards = cards.map(c => {
      // Normalise image field so frontend always uses c.image_url
      const imageUrl = c.image_uri_small || c.image_url || null;
      const priceAud = c.price_aud
        ? `AU$${parseFloat(c.price_aud).toFixed(2)}`
        : c.market_price
          ? `~AU$${(parseFloat(c.market_price) * audRate).toFixed(2)}`
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
