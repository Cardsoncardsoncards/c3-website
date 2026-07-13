// netlify/functions/market-data.mjs
// C3 Market data API - returns JSON for one game and period on demand.
// Called client-side by the market page shell. One game per request. No fanout timeout.
// Routes:
//   /api/market-data?game=all&period=7d       - top movers across primary games
//   /api/market-data?game=pokemon&period=7d   - single game movers
//   /api/market-data?game=mtg_signals&period=7d - MTG buy/sell signals

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const FETCH_TIMEOUT     = 9000;
const MOVER_CAP         = 400;

const GAME_CONFIG = {
  mtg:               { label: 'MTG',                color: '#C9A84C', path: '/cards/mtg' },
  pokemon:           { label: 'Pokemon',            color: '#EF4444', path: '/cards/pokemon' },
  yugioh:            { label: 'Yu-Gi-Oh',           color: '#8B5CF6', path: '/cards/yugioh' },
  lorcana:           { label: 'Lorcana',            color: '#3B82F6', path: '/cards/lorcana' },
  onepiece:          { label: 'One Piece',          color: '#F97316', path: '/cards/onepiece' },
  dragonball:        { label: 'Dragon Ball',        color: '#EAB308', path: '/cards/dragonball' },
  starwars:          { label: 'Star Wars',          color: '#38BDF8', path: '/cards/starwars' },
  riftbound:         { label: 'Riftbound',          color: '#818CF8', path: '/cards/riftbound' },
  digimon:           { label: 'Digimon',            color: '#06B6D4', path: '/cards/digimon' },
  finalfantasy:      { label: 'Final Fantasy',      color: '#8B5CF6', path: '/cards/finalfantasy' },
  grandarchive:      { label: 'Grand Archive',      color: '#10B981', path: '/cards/grandarchive' },
  sorcery:           { label: 'Sorcery',            color: '#D97706', path: '/cards/sorcery' },
  gundam:            { label: 'Gundam',             color: '#6366F1', path: '/cards/gundam' },
  hololive:          { label: 'Hololive',           color: '#F472B6', path: '/cards/hololive' },
  battlespiritssaga: { label: 'Battle Spirits',     color: '#14B8A6', path: '/cards/battlespiritssaga' },
  vanguard:          { label: 'Cardfight Vanguard', color: '#2563EB', path: '/cards/vanguard' },
  shadowverse:       { label: 'Shadowverse',        color: '#7C3AED', path: '/cards/shadowverse' },
  unionarena:        { label: 'Union Arena',        color: '#E11D48', path: '/cards/unionarena' },
  weissschwarz:      { label: 'Weiss Schwarz',      color: '#94A3B8', path: '/cards/weissschwarz' },
  alphaclash:        { label: 'Alpha Clash',        color: '#F59E0B', path: '/cards/alphaclash' },
  bakugan:           { label: 'Bakugan',            color: '#EA580C', path: '/cards/bakugan' },
  buddyfight:        { label: 'Buddyfight',         color: '#0EA5E9', path: '/cards/buddyfight' },
  forceofwill:       { label: 'Force of Will',      color: '#9333EA', path: '/cards/forceofwill' },
  gateruler:         { label: 'Gate Ruler',         color: '#0891B2', path: '/cards/gateruler' },
  godzilla:          { label: 'Godzilla',           color: '#84CC16', path: '/cards/godzilla' },
  metazoo:           { label: 'MetaZoo',            color: '#22C55E', path: '/cards/metazoo' },
  universus:         { label: 'Universus',          color: '#DB2777', path: '/cards/universus' },
  wixoss:            { label: 'Wixoss',             color: '#F43F5E', path: '/cards/wixoss' },
  wow:               { label: 'WoW TCG',            color: '#B45309', path: '/cards/wow' },
  warhammer:         { label: 'Warhammer',          color: '#DC2626', path: '/cards/warhammer' },
  dbsfusionworld:    { label: 'DBS Fusion World',   color: '#F97316', path: '/cards/dbsfusionworld' },
  dragonballz:       { label: 'Dragon Ball Z',      color: '#EAB308', path: '/cards/dragonballz' },
};

// Games included in the "all" fanout. Keep to well-populated games.
const ALL_FANOUT = [
  'pokemon','yugioh','lorcana','onepiece','dragonball','digimon',
  'finalfantasy','grandarchive','starwars','riftbound','sorcery',
  'unionarena','weissschwarz','vanguard','hololive','gundam','universus','shadowverse'
];

// ---------- helpers ----------

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'https://cardsoncardsoncards.com.au',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    }
  });
}

async function timedFetch(url, opts) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function supabaseGet(path) {
  try {
    const res = await timedFetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// Weiss Schwarz has no property column; resolve set ids from weissschwarz_sets so
// the movers query can narrow via set_id=in.(...). Returns [] on failure.
async function resolveWsSetIds(property) {
  const rows = await supabaseGet(`weissschwarz_sets?property=eq.${encodeURIComponent(property)}&select=id`);
  return (rows || []).map(r => r.id).filter(id => id != null);
}

// ---------- data fetchers ----------

async function fetchGameMovers(game, period, wsSetFilter = '') {
  const col = period === '30d' ? 'price_change_30d' : 'price_change_7d';
  const [gainersRaw, losersRaw] = await Promise.all([
    supabaseGet(
      `${game}_cards?price_aud=gt.0.25&rarity=not.is.null&rarity=neq.None${wsSetFilter}` +
      `&${col}=gte.2&order=${col}.desc&limit=40` +
      `&select=name,slug,set_name,rarity,image_url,price_aud,${col}`
    ),
    supabaseGet(
      `${game}_cards?price_aud=gt.0.25&rarity=not.is.null&rarity=neq.None${wsSetFilter}` +
      `&${col}=lte.-2&order=${col}.asc&limit=40` +
      `&select=name,slug,set_name,rarity,image_url,price_aud,${col}`
    )
  ]);

  const normalize = (rows) => {
    if (!Array.isArray(rows)) return [];
    return rows
      .filter(c => Math.abs(parseFloat(c[col])) <= MOVER_CAP)
      .slice(0, 10)
      .map(c => ({
        name:     c.name || '',
        setName:  c.set_name || '',
        priceAud: parseFloat(c.price_aud).toFixed(2),
        change7d: parseFloat(parseFloat(c[col]).toFixed(1)),
        rarity:   c.rarity || '',
        image:    c.image_url || '',
        slug:     c.slug || '',
        spark:    null,
        game,
      }));
  };

  return { gainers: normalize(gainersRaw), losers: normalize(losersRaw) };
}

async function fetchMTGMovers(period) {
  try {
    const today = await supabaseGet(
      `mtg_price_snapshots?order=snapshot_date.desc&limit=1&select=snapshot_date`
    );
    if (!today.length) return { gainers: [], losers: [] };
    const latestDate = today[0].snapshot_date;

    const days = period === '30d' ? 30 : 7;
    const d = new Date(latestDate);
    d.setDate(d.getDate() - days);
    const targetDate = d.toISOString().split('T')[0];

    const priorRow = await supabaseGet(
      `mtg_price_snapshots?snapshot_date=lte.${targetDate}&order=snapshot_date.desc&limit=1&select=snapshot_date`
    );
    const compareDate = priorRow.length ? priorRow[0].snapshot_date : targetDate;

    const [latestSnaps, priorSnaps] = await Promise.all([
      supabaseGet(`mtg_price_snapshots?snapshot_date=eq.${latestDate}&price_aud=gt.1&select=scryfall_id,price_aud&order=price_aud.desc&limit=1500`),
      supabaseGet(`mtg_price_snapshots?snapshot_date=eq.${compareDate}&price_aud=gt.1&select=scryfall_id,price_aud&order=price_aud.desc&limit=1500`)
    ]);
    if (!latestSnaps.length || !priorSnaps.length) return { gainers: [], losers: [] };

    const priorMap = {};
    priorSnaps.forEach(s => { priorMap[s.scryfall_id] = parseFloat(s.price_aud); });

    const movers = latestSnaps
      .filter(s => priorMap[s.scryfall_id] && priorMap[s.scryfall_id] > 0)
      .map(s => ({
        scryfall_id: s.scryfall_id,
        priceAud: parseFloat(s.price_aud),
        pct: ((parseFloat(s.price_aud) - priorMap[s.scryfall_id]) / priorMap[s.scryfall_id]) * 100
      }));

    const gainers = movers.filter(s => s.pct >= 5).sort((a, b) => b.pct - a.pct).slice(0, 10);
    const losers  = movers.filter(s => s.pct <= -5).sort((a, b) => a.pct - b.pct).slice(0, 10);

    const allIds = [...gainers, ...losers].map(s => s.scryfall_id);
    if (!allIds.length) return { gainers: [], losers: [] };

    const cards = await supabaseGet(
      `mtg_cards?scryfall_id=in.(${allIds.join(',')})&select=name,slug,set_name,rarity,image_uri_small,scryfall_id`
    );

    const enrich = (list) => list.map(mover => {
      const card = cards.find(c => c.scryfall_id === mover.scryfall_id);
      if (!card) return null;
      return {
        name:     card.name,
        setName:  card.set_name,
        priceAud: mover.priceAud.toFixed(2),
        change7d: parseFloat(mover.pct.toFixed(1)),
        rarity:   card.rarity || '',
        image:    card.image_uri_small || '',
        slug:     card.slug,
        spark:    null,
        scryfall_id: card.scryfall_id,
        game:     'mtg',
      };
    }).filter(Boolean);

    return { gainers: enrich(gainers), losers: enrich(losers) };
  } catch (e) {
    console.error('fetchMTGMovers error:', e.message);
    return { gainers: [], losers: [] };
  }
}

// Signals come from mtg_signals, rebuilt nightly by the update-mtg-signals-daily
// pg_cron job. This used to read price_52w_high_aud / price_52w_low_aud off
// mtg_price_snapshots, but those columns were abandoned on 18 June 2026 when that job
// took over and have been NULL on every row written since, so both filters matched zero
// rows and the buy/sell sections on /market rendered empty. mtg_signals carries
// buy_verdict and sell_verdict already computed, so the ratio thresholds are gone.
//
// The high/low spans all price history C3 holds, roughly ten weeks, not a true 52 week
// window. The columns are named 52w because the schema predates that. Copy says "recent".
// Every scanned row is already a signal (the verdict is the filter), so all of them reach the
// scryfall_id=in.(...) lookup. Buy and sell ids are merged into one query, so a large scan
// builds a URL past 15KB and the request dies with a header overflow before it reaches
// Supabase. Scan modestly and chunk the lookup so the URL cannot overflow.
const SIGNAL_MIN_AUD    = 5;
const SIGNAL_SCAN_LIMIT = 120;
const CARD_LOOKUP_CHUNK = 50;

// Resolves scryfall_ids to cards in chunks, so the request URL stays bounded.
async function lookupCardsChunked(ids) {
  const chunks = [];
  for (let i = 0; i < ids.length; i += CARD_LOOKUP_CHUNK) {
    const batch = ids.slice(i, i + CARD_LOOKUP_CHUNK).join(',');
    chunks.push(supabaseGet(
      `mtg_cards?scryfall_id=in.(${batch})&select=name,slug,set_name,rarity,image_uri_small,scryfall_id`
    ));
  }
  const settled = await Promise.allSettled(chunks);
  return settled.flatMap(r => (r.status === 'fulfilled' && Array.isArray(r.value)) ? r.value : []);
}

// One printing per card name, keeping the most valuable. Printings share a name but
// each has its own scryfall_id, so without this one card can fill the section.
function dedupeSignalsByName(list) {
  const best = new Map();
  for (const c of list) {
    const prev = best.get(c.name);
    if (!prev || parseFloat(c.priceAud) > parseFloat(prev.priceAud)) best.set(c.name, c);
  }
  return [...best.values()];
}

async function fetchMTGSignals() {
  try {
    const [buyRaw, sellRaw] = await Promise.allSettled([
      supabaseGet(
        `mtg_signals?buy_verdict=eq.buy&latest_price_aud=gte.${SIGNAL_MIN_AUD}` +
        `&order=latest_price_aud.desc&limit=${SIGNAL_SCAN_LIMIT}` +
        `&select=scryfall_id,latest_price_aud,price_52w_high_aud,price_52w_low_aud`
      ),
      supabaseGet(
        `mtg_signals?sell_verdict=eq.sell&latest_price_aud=gte.${SIGNAL_MIN_AUD}` +
        `&order=latest_price_aud.desc&limit=${SIGNAL_SCAN_LIMIT}` +
        `&select=scryfall_id,latest_price_aud,price_52w_high_aud,price_52w_low_aud`
      )
    ]);
    const buySig  = buyRaw.status  === 'fulfilled' && Array.isArray(buyRaw.value)  ? buyRaw.value  : [];
    const sellSig = sellRaw.status === 'fulfilled' && Array.isArray(sellRaw.value) ? sellRaw.value : [];

    const allIds = [...new Set([...buySig, ...sellSig].map(s => s.scryfall_id))];
    if (!allIds.length) return { buySignals: [], sellSignals: [] };

    const cards = await lookupCardsChunked(allIds);

    const enrichBuy = dedupeSignalsByName(buySig.map(snap => {
      const card = cards.find(c => c.scryfall_id === snap.scryfall_id);
      if (!card) return null;
      const high = parseFloat(snap.price_52w_high_aud);
      const price = parseFloat(snap.latest_price_aud);
      if (!(high > 0)) return null;
      const discount = Math.round(((high - price) / high) * 100);
      return {
        name:     card.name,
        setName:  card.set_name,
        rarity:   card.rarity || '',
        image:    card.image_uri_small || '',
        slug:     card.slug,
        priceAud: price,
        discount,
        spark:    null,
        scryfall_id: card.scryfall_id,
        game:     'mtg',
      };
    }).filter(Boolean)).slice(0, 8);

    const enrichSell = dedupeSignalsByName(sellSig.map(snap => {
      const card = cards.find(c => c.scryfall_id === snap.scryfall_id);
      if (!card) return null;
      const high = parseFloat(snap.price_52w_high_aud);
      const low = parseFloat(snap.price_52w_low_aud);
      const price = parseFloat(snap.latest_price_aud);
      const range = high - low;
      if (!(range > 0)) return null;
      const nearHighPct = Math.round(((price - low) / range) * 100);
      return {
        name:     card.name,
        setName:  card.set_name,
        rarity:   card.rarity || '',
        image:    card.image_uri_small || '',
        slug:     card.slug,
        priceAud: price,
        nearHighPct,
        spark:    null,
        scryfall_id: card.scryfall_id,
        game:     'mtg',
      };
    }).filter(Boolean)).slice(0, 8);

    return { buySignals: enrichBuy, sellSignals: enrichSell };
  } catch {
    return { buySignals: [], sellSignals: [] };
  }
}

// ---------- handler ----------

export default async (req) => {
  const url    = new URL(req.url);
  const game   = (url.searchParams.get('game')   || 'all').toLowerCase().trim();
  const period = (url.searchParams.get('period') || '7d').toLowerCase().trim();
  const property = url.searchParams.get('property') || null;

  // Signals route
  if (game === 'mtg_signals') {
    const data = await fetchMTGSignals();
    return jsonResponse(data);
  }

  // Single known game
  if (game !== 'all' && GAME_CONFIG[game]) {
    // Weiss Schwarz property narrowing: resolve set ids once, then filter movers.
    let wsSetFilter = '';
    if (game === 'weissschwarz' && property) {
      const ids = await resolveWsSetIds(property);
      if (ids.length) wsSetFilter = `&set_id=in.(${ids.join(',')})`;
    }
    const data = game === 'mtg'
      ? await fetchMTGMovers(period)
      : await fetchGameMovers(game, period, wsSetFilter);
    return jsonResponse(data);
  }

  // All-games fanout - parallel but scoped to ALL_FANOUT list
  if (game === 'all') {
    const tasks = [
      fetchMTGMovers(period),
      ...ALL_FANOUT.map(g => fetchGameMovers(g, period))
    ];
    const results = await Promise.allSettled(tasks);

    const allGainers = [];
    const allLosers  = [];
    results.forEach(r => {
      if (r.status === 'fulfilled') {
        (r.value.gainers || []).forEach(c => allGainers.push(c));
        (r.value.losers  || []).forEach(c => allLosers.push(c));
      }
    });

    allGainers.sort((a, b) => b.change7d - a.change7d);
    allLosers.sort((a, b) => a.change7d - b.change7d);

    return jsonResponse({
      gainers: allGainers.slice(0, 40),
      losers:  allLosers.slice(0, 40),
    });
  }

  return jsonResponse({ error: 'Unknown game parameter' }, 400);
};

export const config = { path: '/api/market-data' };
