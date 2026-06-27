// netlify/functions/card-search.mjs
// Global card search across all games with built card pages
// GET /api/card-search?q=lightning+bolt&limit=10
// Only includes games that have card page functions built

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID        = Netlify.env.get('EPN_CAMPID') || '5339146789';

// Only games with card pages built (/cards/[game]/[slug] exists)
const SEARCHABLE_GAMES = [
  { game: 'mtg',        table: 'mtg_cards',      imgCol: 'image_uri_small', priceCol: 'price_aud',    isAud: true,  label: 'MTG',        color: '#C9A84C' },
  { game: 'pokemon',    table: 'pokemon_cards',   imgCol: 'image_url',       priceCol: 'market_price', isAud: false, label: 'Pokemon',    color: '#EF4444' },
  { game: 'yugioh',     table: 'yugioh_cards',    imgCol: 'image_url',       priceCol: 'market_price', isAud: false, label: 'Yu-Gi-Oh',   color: '#8B5CF6' },
  { game: 'lorcana',    table: 'lorcana_cards',   imgCol: 'image_url',       priceCol: 'market_price', isAud: false, label: 'Lorcana',    color: '#3B82F6' },
  { game: 'onepiece',   table: 'onepiece_cards',  imgCol: 'image_url',       priceCol: 'market_price', isAud: false, label: 'One Piece',  color: '#F97316' },
  { game: 'starwars',   table: 'starwars_cards',  imgCol: 'image_url',       priceCol: 'market_price', isAud: false, label: 'Star Wars',  color: '#FFE81F' },
  { game: 'riftbound',  table: 'riftbound_cards', imgCol: 'image_url',       priceCol: 'market_price', isAud: false, label: 'Riftbound',  color: '#10B981' },
];

async function searchGame(cfg, query, limit) {
  // ilike value appended manually - URLSearchParams.set encodes * to %2A breaking PostgREST wildcard
  const baseUrl = new URL(`${SUPABASE_URL}/rest/v1/${cfg.table}`);
  baseUrl.searchParams.set('select', `slug,name,${cfg.imgCol},${cfg.priceCol},set_name`);
  baseUrl.searchParams.set('order', `${cfg.priceCol}.desc.nullslast`);
  baseUrl.searchParams.set('limit', String(limit));
  const searchUrl = baseUrl.toString() + '&name=ilike.*' + encodeURIComponent(query) + '*';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(searchUrl, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : []).map(card => {
      const rawPrice = card[cfg.priceCol] ? parseFloat(card[cfg.priceCol]) : null;
      const priceAud = rawPrice ? (cfg.isAud ? rawPrice : rawPrice * 1.45) : null;
      return {
        slug:         card.slug,
        name:         card.name,
        game:         cfg.game,
        gameLabel:    cfg.label,
        gameColor:    cfg.color,
        image:        card[cfg.imgCol] || null,
        setName:      card.set_name || null,
        priceAud,
        priceDisplay: priceAud ? 'AU$' + priceAud.toFixed(0) : null,
        cardPath:     `/cards/${cfg.game}/${card.slug}`,
        ebayPath:     `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(card.name + ' ' + cfg.label)}&_sacat=183454&campid=${EPN_CAMPID}&mkevt=1`
      };
    });
  } catch {
    clearTimeout(timer);
    return [];
  }
}

export default async (req) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, s-maxage=60'
  };

  const url   = new URL(req.url);
  const query = (url.searchParams.get('q') || '').trim();
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 20);
  const game  = url.searchParams.get('game') || null;

  if (!query || query.length < 2) {
    return new Response(JSON.stringify({ results: [], query: '' }), { headers });
  }

  const tables   = game ? SEARCHABLE_GAMES.filter(g => g.game === game) : SEARCHABLE_GAMES;
  const perGame  = game ? limit : Math.ceil(limit / tables.length) + 2;

  const settled  = await Promise.allSettled(tables.map(g => searchGame(g, query, perGame)));
  const results  = settled
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a, b) => (b.priceAud || 0) - (a.priceAud || 0))
    .slice(0, limit);

  return new Response(JSON.stringify({ results, query }), { headers });
};

export const config = { path: '/api/card-search' };
