// netlify/functions/compare-search.mjs
// Autocomplete API for the Card Compare page
// GET /api/compare-search?q=lightning+bolt&limit=8
// Returns cards across all 8 games matching the query

const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');

const GAME_TABLES = [
  { game: 'mtg',        table: 'mtg_cards',        nameCol: 'name', slugCol: 'slug', priceCol: 'price_aud',  imgCol: 'image_uri_small',  label: 'MTG',         color: '#C9A84C' },
  { game: 'pokemon',    table: 'pokemon_cards',     nameCol: 'name', slugCol: 'slug', priceCol: 'price_usd',  imgCol: 'image_url',        label: 'Pokemon',     color: '#EF4444' },
  { game: 'yugioh',     table: 'yugioh_cards',      nameCol: 'name', slugCol: 'slug', priceCol: 'price_usd',  imgCol: 'image_url',        label: 'Yu-Gi-Oh',    color: '#8B5CF6' },
  { game: 'lorcana',    table: 'lorcana_cards',     nameCol: 'name', slugCol: 'slug', priceCol: 'price_usd',  imgCol: 'image_url',        label: 'Lorcana',     color: '#3B82F6' },
  { game: 'onepiece',   table: 'onepiece_cards',    nameCol: 'name', slugCol: 'slug', priceCol: 'price_usd',  imgCol: 'image_url',        label: 'One Piece',   color: '#F97316' },
  { game: 'dragonball', table: 'dragonball_cards',  nameCol: 'name', slugCol: 'slug', priceCol: 'price_usd',  imgCol: 'image_url',        label: 'Dragon Ball', color: '#EAB308' },
  { game: 'starwars',   table: 'starwars_cards',    nameCol: 'name', slugCol: 'slug', priceCol: 'price_usd',  imgCol: 'image_url',        label: 'Star Wars',   color: '#FFE81F' },
  { game: 'riftbound',  table: 'riftbound_cards',   nameCol: 'name', slugCol: 'slug', priceCol: 'price_usd',  imgCol: 'image_url',        label: 'Riftbound',   color: '#10B981' },
];

async function searchGame(gameConfig, query, limit) {
  const { game, table, nameCol, slugCol, priceCol, imgCol, label, color } = gameConfig;
  const encoded = encodeURIComponent(query);
  const url = `${SUPABASE_URL}/rest/v1/${table}?${nameCol}=ilike.*${encoded}*&select=${slugCol},${nameCol},${priceCol},${imgCol}&order=${priceCol}.desc.nullslast&limit=${limit}`;
  try {
    const res = await fetch(url, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map(card => ({
      slug: card[slugCol],
      name: card[nameCol],
      game,
      gameLabel: label,
      gameColor: color,
      price: card[priceCol] ? parseFloat(card[priceCol]) : null,
      priceDisplay: card[priceCol] ? 'AU$' + (parseFloat(card[priceCol]) * (game === 'mtg' ? 1 : 1.58)).toFixed(2) : 'N/A',
      image: card[imgCol] || null,
      cardPath: `/cards/${game}/${card[slugCol]}`
    }));
  } catch {
    return [];
  }
}

export default async (req) => {
  const url = new URL(req.url);
  const query = (url.searchParams.get('q') || '').trim();
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '5'), 10);
  const gameFilter = url.searchParams.get('game') || null;

  if (!query || query.length < 2) {
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  const tables = gameFilter ? GAME_TABLES.filter(g => g.game === gameFilter) : GAME_TABLES;
  const perGame = gameFilter ? limit : Math.ceil(limit / tables.length) + 1;

  const results = await Promise.allSettled(tables.map(g => searchGame(g, query, perGame)));
  const allCards = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a, b) => (b.price || 0) - (a.price || 0))
    .slice(0, limit * 2); // Return more than needed, client filters

  return new Response(JSON.stringify(allCards), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, s-maxage=60'
    }
  });
};

export const config = { path: '/api/compare-search' };
