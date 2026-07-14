// netlify/functions/compare-search.mjs
// Autocomplete API for the Card Compare page and all hub card search boxes
// GET /api/compare-search?q=lightning+bolt&limit=8&game=mtg
// GET /api/compare-search?q=lightning+bolt&game=mtg&printings=1
// Supports all 32 TCGs with data in Supabase
// Updated: 20 May 2026 -- added the Extended games (24 of them, for 32 total)

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');

// All 32 games with data in Supabase
// priceCol: isAud=true means price is already AUD (MTG only); false means USD -> convert at 1.45
const GAME_TABLES = [
  // --- Core 8 (original) ---
  { game: 'mtg',              table: 'mtg_cards',              nameCol: 'name', slugCol: 'slug', priceCol: 'price_aud',    imgCol: 'image_uri_small', setCol: 'set_name', label: 'MTG',                color: '#C9A84C', isAud: true  },
  { game: 'pokemon',          table: 'pokemon_cards',          nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Pokemon',            color: '#FFCC00', isAud: false },
  { game: 'yugioh',           table: 'yugioh_cards',           nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Yu-Gi-Oh',           color: '#c8a332', isAud: false },
  { game: 'lorcana',          table: 'lorcana_cards',          nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Lorcana',            color: '#38BDF8', isAud: false },
  { game: 'onepiece',         table: 'onepiece_cards',         nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'One Piece',          color: '#EF4444', isAud: false },
  { game: 'dbsfusionworld',   table: 'dbsfusionworld_cards',   nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'DBS Fusion World',   color: '#FF6B35', isAud: false },
  { game: 'starwars',         table: 'starwars_cards',         nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Star Wars',          color: '#FFE81F', isAud: false },
  { game: 'riftbound',        table: 'riftbound_cards',        nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Riftbound',          color: '#7C6AF5', isAud: false },
  // --- Extended 24 ---
  // Note: dragonball (Dragon Ball Super CCG) is Extended. The Core Dragon Ball game is
  // dbsfusionworld (Fusion World), listed above. They are separate games, separate tables.
  { game: 'dragonball',       table: 'dragonball_cards',       nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Dragon Ball',        color: '#F97316', isAud: false },
  { game: 'digimon',          table: 'digimon_cards',          nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Digimon',            color: '#3B82F6', isAud: false },
  { game: 'vanguard',         table: 'vanguard_cards',         nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Vanguard',           color: '#DC2626', isAud: false },
  { game: 'weissschwarz',     table: 'weissschwarz_cards',     nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Weiss Schwarz',      color: '#EC4899', isAud: false },
  { game: 'finalfantasy',     table: 'finalfantasy_cards',     nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Final Fantasy TCG',  color: '#6366F1', isAud: false },
  { game: 'forceofwill',      table: 'forceofwill_cards',      nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Force of Will',      color: '#0EA5E9', isAud: false },
  { game: 'buddyfight',       table: 'buddyfight_cards',       nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Buddyfight',         color: '#F59E0B', isAud: false },
  { game: 'shadowverse',      table: 'shadowverse_cards',      nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Shadowverse Evolve', color: '#8B5CF6', isAud: false },
  { game: 'wow',              table: 'wow_cards',              nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'WoW TCG',            color: '#C9A84C', isAud: false },
  { game: 'unionarena',       table: 'unionarena_cards',       nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Union Arena',        color: '#10B981', isAud: false },
  { game: 'universus',        table: 'universus_cards',        nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'UniVersus',          color: '#6366F1', isAud: false },
  { game: 'metazoo',          table: 'metazoo_cards',          nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'MetaZoo',            color: '#84CC16', isAud: false },
  { game: 'grandarchive',     table: 'grandarchive_cards',     nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Grand Archive',      color: '#C084FC', isAud: false },
  { game: 'wixoss',           table: 'wixoss_cards',           nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Wixoss',             color: '#F43F5E', isAud: false },
  { game: 'sorcery',          table: 'sorcery_cards',          nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Sorcery TCG',        color: '#A78BFA', isAud: false },
  { game: 'hololive',         table: 'hololive_cards',         nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Hololive TCG',       color: '#06B6D4', isAud: false },
  { game: 'alphaclash',       table: 'alphaclash_cards',       nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Alpha Clash',        color: '#EF4444', isAud: false },
  { game: 'gundam',           table: 'gundam_cards',           nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Gundam Card Game',   color: '#64748B', isAud: false },
  { game: 'battlespiritssaga',table: 'battlespiritssaga_cards',nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Battle Spirits Saga',color: '#FB923C', isAud: false },
  { game: 'dragonballz',      table: 'dragonballz_cards',      nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Dragon Ball Z TCG',  color: '#EAB308', isAud: false },
  { game: 'bakugan',          table: 'bakugan_cards',          nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Bakugan TCG',        color: '#EF4444', isAud: false },
  { game: 'godzilla',         table: 'godzilla_cards',         nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Godzilla TCG',       color: '#22C55E', isAud: false },
  { game: 'warhammer',        table: 'warhammer_cards',        nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Warhammer TCG',      color: '#92400E', isAud: false },
  { game: 'gateruler',        table: 'gateruler_cards',        nameCol: 'name', slugCol: 'slug', priceCol: 'market_price', imgCol: 'image_url',       setCol: 'set_name', label: 'Gate Ruler',         color: '#0891B2', isAud: false },
];

async function supabaseFetch(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      signal: controller.signal,
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    return await res.json();
  } catch { clearTimeout(timer); return []; }
}

function normaliseCard(card, cfg, usdToAud = 1.45) {
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
    collectorNumber: card.collector_number || null,
    scryfallId:   card.scryfall_id || null,   // MTG printing-unique id (null for other games); used by the compare version-switcher
    cardPath:     `/cards/${game}/${card[slugCol]}`
  };
}

// Weiss Schwarz has no property column; resolve set ids from weissschwarz_sets.
// Returns [] on failure (caller falls back to unfiltered). Reuses supabaseFetch
// (AbortController + timeout + res.ok already handled there).
async function resolveWsSetIds(property) {
  const rows = await supabaseFetch(`weissschwarz_sets?property=eq.${encodeURIComponent(property)}&select=id`);
  return (rows || []).map(r => r.id).filter(id => id != null);
}

async function searchGame(cfg, query, limit, usdToAud, extraFilter = '') {
  const { table, nameCol, slugCol, priceCol, imgCol, setCol } = cfg;
  const encoded = encodeURIComponent(query);
  const path = `${table}?${nameCol}=ilike.*${encoded}*${extraFilter}&select=${slugCol},${nameCol},${priceCol},${imgCol},${setCol}&order=${priceCol}.desc.nullslast&limit=${limit}`;
  const data = await supabaseFetch(path);
  return (data || []).map(c => normaliseCard(c, cfg, usdToAud));
}

async function getPrintings(cfg, name, usdToAud, extraFilter = '') {
  const { table, nameCol, slugCol, priceCol, imgCol, setCol } = cfg;
  const encoded = encodeURIComponent(name);
  const extraCols = cfg.game === 'mtg' ? ',collector_number,scryfall_id' : '';
  const path = `${table}?${nameCol}=eq.${encoded}${extraFilter}&select=${slugCol},${nameCol},${priceCol},${imgCol},${setCol}${extraCols}&order=${priceCol}.asc.nullslast&limit=40`;
  const data = await supabaseFetch(path);
  return (data || []).map(c => normaliseCard(c, cfg, usdToAud));
}

export default async (req) => {
  const url        = new URL(req.url);
  const query      = (url.searchParams.get('q') || '').trim();
  const limit      = Math.min(parseInt(url.searchParams.get('limit') || '8'), 20);
  const gameFilter = url.searchParams.get('game') || null;
  const propertyFilter = url.searchParams.get('property') || null;
  const printings  = url.searchParams.get('printings') === '1';

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, s-maxage=60'
  };

  if (!query || query.length < 2) {
    return new Response(JSON.stringify([]), { headers });
  }

  const tables   = gameFilter ? GAME_TABLES.filter(g => g.game === gameFilter) : GAME_TABLES;
  const usdToAud = 1.45;

  // Weiss Schwarz property narrowing: resolve set ids once; applied only to the
  // weissschwarz table below (tables is already isolated to WS when game=weissschwarz).
  let wsSetFilter = '';
  if (gameFilter === 'weissschwarz' && propertyFilter) {
    const ids = await resolveWsSetIds(propertyFilter);
    if (ids.length) wsSetFilter = `&set_id=in.(${ids.join(',')})`;
  }

  if (printings && gameFilter && tables.length === 1) {
    const results = await getPrintings(tables[0], query, usdToAud, tables[0].game === 'weissschwarz' ? wsSetFilter : '');
    return new Response(JSON.stringify(results), { headers });
  }

  const perGame = gameFilter ? limit : Math.ceil(limit / tables.length) + 2;
  const settled = await Promise.allSettled(tables.map(g => searchGame(g, query, perGame, usdToAud, g.game === 'weissschwarz' ? wsSetFilter : '')));
  const allCards = settled
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a, b) => (b.priceAud || 0) - (a.priceAud || 0))
    .slice(0, limit * 2);

  return new Response(JSON.stringify(allCards), { headers });
};

export const config = { path: '/api/compare-search' };
