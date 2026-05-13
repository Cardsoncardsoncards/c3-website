// netlify/functions/compare-search.mjs
// Autocomplete API for the Card Compare page
// GET /api/compare-search?q=lightning+bolt&limit=8&game=mtg
// GET /api/compare-search?q=lightning+bolt&game=mtg&printings=1 (all printings of that name)
// Returns cards across all 8 games matching the query

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');

// priceCol: actual column name in each table
// mtg uses price_aud directly; all others use market_price (USD) and we convert at 1.58
const GAME_TABLES = [
  { game: 'mtg',        table: 'mtg_cards',       nameCol: 'name', slugCol: 'slug', priceCol: 'price_aud',    imgCol: 'image_uri_small', setCol: 'set_name',  label: 'MTG',         color: '#C9A84C', isAud: true  },
  { game: 'pokemon',    table: 'pokemon_cards',    nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name',  label: 'Pokemon',     color: '#EF4444', isAud: false },
  { game: 'yugioh',     table: 'yugioh_cards',     nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name',  label: 'Yu-Gi-Oh',   color: '#8B5CF6', isAud: false },
  { game: 'lorcana',    table: 'lorcana_cards',    nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name',  label: 'Lorcana',     color: '#3B82F6', isAud: false },
  { game: 'onepiece',   table: 'onepiece_cards',   nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name',  label: 'One Piece',   color: '#F97316', isAud: false },
  { game: 'dragonball', table: 'dragonball_cards', nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name',  label: 'Dragon Ball', color: '#EAB308', isAud: false },
  { game: 'starwars',   table: 'starwars_cards',   nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name',  label: 'Star Wars',   color: '#FFE81F', isAud: false },
  { game: 'riftbound',  table: 'riftbound_cards',  nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name',  label: 'Riftbound',   color: '#10B981', isAud: false },
];

async function supabaseFetch(path) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

function normaliseCard(card, cfg, usdToAud = 1.58) {
  const { game, nameCol, slugCol, priceCol, imgCol, setCol, label, color, isAud } = cfg;
  const rawPrice = card[priceCol] ? parseFloat(card[priceCol]) : null;
  const priceAud = rawPrice ? (isAud ? rawPrice : rawPrice * usdToAud) : null;
  return {
    slug:         card[slugCol],
    name:         card[nameCol],
    game,
    gameLabel:    label,
    gameColor:    color,
    priceAud,
    priceUsd:     isAud ? (rawPrice ? rawPrice / usdToAud : null) : rawPrice,
    priceDisplay: priceAud ? 'AU$' + priceAud.toFixed(2) : 'N/A',
    image:        card[imgCol] || null,
    setName:      card[setCol] || null,
    cardPath:     `/cards/${game}/${card[slugCol]}`
  };
}

async function searchGame(cfg, query, limit, usdToAud) {
  const { table, nameCol, slugCol, priceCol, imgCol, setCol } = cfg;
  const encoded = encodeURIComponent(query);
  const url = `${SUPABASE_URL}/rest/v1/${table}?${nameCol}=ilike.*${encoded}*&select=${slugCol},${nameCol},${priceCol},${imgCol},${setCol}&order=${priceCol}.desc.nullslast&limit=${limit}`;
  const data = await supabaseFetch(url.replace(`${SUPABASE_URL}/rest/v1/`, ''));
  return (data || []).map(c => normaliseCard(c, cfg, usdToAud));
}

async function getPrintings(cfg, name, usdToAud) {
  const { table, nameCol, slugCol, priceCol, imgCol, setCol } = cfg;
  const encoded = encodeURIComponent(name);
  const path = `${table}?${nameCol}=eq.${encoded}&select=${slugCol},${nameCol},${priceCol},${imgCol},${setCol}&order=${priceCol}.asc.nullslast&limit=40`;
  const data = await supabaseFetch(path);
  return (data || []).map(c => normaliseCard(c, cfg, usdToAud));
}

export default async (req) => {
  const url         = new URL(req.url);
  const query       = (url.searchParams.get('q') || '').trim();
  const limit       = Math.min(parseInt(url.searchParams.get('limit') || '8'), 20);
  const gameFilter  = url.searchParams.get('game') || null;
  const printings   = url.searchParams.get('printings') === '1';

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, s-maxage=60'
  };

  if (!query || query.length < 2) {
    return new Response(JSON.stringify([]), { headers });
  }

  const tables    = gameFilter ? GAME_TABLES.filter(g => g.game === gameFilter) : GAME_TABLES;
  const usdToAud  = 1.58; // fallback rate; live rate is fetched by card-compare.mjs at render time

  // Printings mode: return all versions of exact card name from one game
  if (printings && gameFilter && tables.length === 1) {
    const results = await getPrintings(tables[0], query, usdToAud);
    return new Response(JSON.stringify(results), { headers });
  }

  // Normal search mode
  const perGame  = gameFilter ? limit : Math.ceil(limit / tables.length) + 2;
  const settled  = await Promise.allSettled(tables.map(g => searchGame(g, query, perGame, usdToAud)));
  const allCards = settled
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a, b) => (b.priceAud || 0) - (a.priceAud || 0))
    .slice(0, limit * 2);

  return new Response(JSON.stringify(allCards), { headers });
};

export const config = { path: '/api/compare-search' };
