// netlify/functions/sync-pokemon.mjs
// Scheduled: daily at 4am UTC (2pm AEST)
// Primary source: tcgapi.dev Pro — card data, market/low/foil prices
// Secondary source: pokemontcg.io — TCGPlayer and Cardmarket price breakdowns
// Join key: tcgplayer_id (present in both APIs)
// Tables: pokemon_sets, pokemon_cards, pokemon_price_snapshots
// Fix 14 May 2026: pokemontcg.io prices fetched per-set (not global prefetch) to avoid timeout

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const TCGAPI_KEY           = Netlify.env.get('TCGAPI_KEY');
const POKEMONTCG_KEY       = Netlify.env.get('POKEMONTCG_API_KEY');
const SYNC_SECRET          = Netlify.env.get('SYNC_SECRET');
const GAME_SLUG            = 'pokemon';
const TCGAPI_BASE          = 'https://api.tcgapi.dev/v1';
const POKEMONTCG_BASE      = 'https://api.pokemontcg.io/v2';
const RATE_LIMIT_BUFFER    = 200;
const MAX_PAGES            = 50;

function slugify(name, number, setAbbr) {
  const base = name.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const withNumber = number ? `${base}-${number.replace(/[^a-z0-9]/gi, '-').toLowerCase()}` : base;
  const prefix = setAbbr ? setAbbr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : null;
  return prefix ? `${prefix}-${withNumber}` : withNumber;
}

async function getExchangeRate() {
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await res.json();
    return data.rates?.AUD || 1.58;
  } catch { return 1.58; }
}

async function tcgapiGet(path) {
  const res = await fetch(`${TCGAPI_BASE}${path}`, { headers: { 'X-API-Key': TCGAPI_KEY } });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`tcgapi GET ${path} failed ${res.status}: ${err.slice(0, 200)}`);
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`tcgapi non-JSON: ${text.slice(0, 200)}`); }
  const remaining = parseInt(res.headers.get('x-ratelimit-remaining') ?? '9999', 10);
  if (remaining < RATE_LIMIT_BUFFER) throw new Error(`Rate limit low: ${remaining} requests remaining. Aborting to protect quota.`);
  return data;
}

async function supabaseUpsert(table, rows) {
  if (!rows.length) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(rows)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase upsert ${table} failed: ${err.slice(0, 300)}`);
  }
}

async function supabaseUpsertSnapshots(table, rows) {
  if (!rows.length) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=card_id,snapshot_date`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(rows)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase upsert ${table} failed: ${err.slice(0, 300)}`);
  }
}

async function getAlreadySyncedSetIds() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/pokemon_sync_progress?select=set_id&limit=1000`,
    { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  if (!res.ok) return new Set();
  const rows = await res.json();
  return new Set(rows.map(r => r.set_id));
}

async function markSetSynced(setId) {
  await fetch(`${SUPABASE_URL}/rest/v1/pokemon_sync_progress`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify({ set_id: setId, synced_at: new Date().toISOString() })
  });
}

// Fetch pokemontcg.io prices for a SINGLE set by abbreviation.
// One API call per set — avoids the global prefetch that caused timeouts.
// Returns Map<tcgplayer_id (integer), price fields>
async function fetchPokemonTCGPricesForSet(setAbbr) {
  if (!POKEMONTCG_KEY || !setAbbr) return new Map();
  try {
    const setId = setAbbr.toLowerCase().replace(/\s+/g, '');
    const url = `${POKEMONTCG_BASE}/cards?q=set.id:${setId}&select=id,tcgplayer,cardmarket&pageSize=250`;
    const res = await fetch(url, { headers: { 'X-Api-Key': POKEMONTCG_KEY } });
    if (!res.ok) return new Map();
    const data = await res.json();
    const cards = data.data || [];
    const priceMap = new Map();
    for (const card of cards) {
      const tcgplayerId = card.tcgplayer?.productId;
      if (!tcgplayerId) continue;
      const tcp = card.tcgplayer?.prices || {};
      const cm  = card.cardmarket?.prices || {};
      priceMap.set(tcgplayerId, {
        tcg_low:             tcp.normal?.low             || null,
        tcg_mid:             tcp.normal?.mid             || null,
        tcg_market:          tcp.normal?.market          || null,
        tcg_direct_low:      tcp.normal?.directLow       || null,
        holofoil_low:        tcp.holofoil?.low           || null,
        holofoil_mid:        tcp.holofoil?.mid           || null,
        holofoil_market:     tcp.holofoil?.market        || null,
        reverse_holo_low:    tcp.reverseHolofoil?.low    || null,
        reverse_holo_mid:    tcp.reverseHolofoil?.mid    || null,
        reverse_holo_market: tcp.reverseHolofoil?.market || null,
        cardmarket_low:      cm.averageSellPrice         || cm.lowPrice || null,
        cardmarket_trend:    cm.trendPrice               || null,
        cardmarket_avg7:     cm.avg7                     || null,
        cardmarket_avg30:    cm.avg30                    || null,
      });
    }
    return priceMap;
  } catch {
    return new Map();
  }
}

export default async (req) => {
  console.log('[sync-pokemon] Starting...');

  const secret = req.headers.get('x-sync-secret');
  const isScheduled = !secret;
  if (!isScheduled && (!SYNC_SECRET || secret !== SYNC_SECRET)) {
    console.error('[sync-pokemon] Unauthorised');
    return new Response('Unauthorised', { status: 401 });
  }

  const start = Date.now();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return new Response('Supabase env vars missing', { status: 500 });
  if (!TCGAPI_KEY) return new Response('TCGAPI_KEY missing', { status: 500 });

  try {
    const audRate = await getExchangeRate();
    console.log(`[sync-pokemon] AUD rate: ${audRate}`);
    console.log(`[sync-pokemon] pokemontcg.io: ${POKEMONTCG_KEY ? 'key present, fetching per-set' : 'no key, prices will be null'}`);

    const syncedSetIds = await getAlreadySyncedSetIds();
    console.log(`[sync-pokemon] ${syncedSetIds.size} sets already synced — will skip these`);

    console.log('[sync-pokemon] Fetching sets...');
    const allSets = [];
    let page = 1;
    while (page <= MAX_PAGES) {
      const data = await tcgapiGet(`/games/${GAME_SLUG}/sets?per_page=100&page=${page}`);
      const sets = data.data || [];
      allSets.push(...sets);
      if (sets.length < 100) break;
      page++;
    }
    console.log(`[sync-pokemon] Found ${allSets.length} sets`);

    const setRows = allSets.map(s => ({
      id:           s.id,
      name:         s.name,
      slug:         s.slug || slugify(s.name, null, null),
      abbreviation: s.abbreviation || null,
      release_date: s.release_date || null,
      card_count:   s.card_count || 0,
      game_slug:    GAME_SLUG,
      updated_at:   new Date().toISOString()
    }));

    for (let i = 0; i < setRows.length; i += 100) {
      await supabaseUpsert('pokemon_sets', setRows.slice(i, i + 100));
    }
    console.log(`[sync-pokemon] Upserted ${setRows.length} sets`);

    const today = new Date().toISOString().split('T')[0];
    let totalCards   = 0;
    let totalSnaps   = 0;
    let setCount     = 0;
    let skippedCount = 0;

    for (const set of allSets) {
      if (syncedSetIds.has(set.id)) {
        skippedCount++;
        continue;
      }
      setCount++;
      if (setCount % 10 === 0) {
        console.log(`[sync-pokemon] Progress: ${setCount} new sets, ${skippedCount} skipped, ${totalCards} cards so far`);
      }

      const setCards = [];
      let cardPage = 1;
      while (cardPage <= MAX_PAGES) {
        const data = await tcgapiGet(`/sets/${set.id}/cards?per_page=100&page=${cardPage}`);
        const cards = data.data || [];
        setCards.push(...cards);
        if (cards.length < 100) break;
        cardPage++;
      }
      if (!setCards.length) continue;

      const cardIds = setCards.map(c => c.id);
      const priceMap = new Map();
      for (let i = 0; i < cardIds.length; i += 500) {
        const batch = cardIds.slice(i, i + 500);
        try {
          const priceData = await tcgapiGet(`/bulk/prices?ids=${batch.join(',')}`);
          for (const p of priceData.data || []) priceMap.set(p.card_id, p);
        } catch (e) {
          if (e.message.includes('Rate limit low')) throw e;
          console.error(`[sync-pokemon] Bulk price error set ${set.id}:`, e.message);
        }
      }

      // Per-set pokemontcg.io fetch — fast, one request per set
      const setAbbr = set.abbreviation || set.slug || String(set.id);
      const pokemonTCGPrices = await fetchPokemonTCGPricesForSet(setAbbr);

      const cardRows  = [];
      const slugsSeen = new Set();
      const snapRows  = [];

      for (const card of setCards) {
        const price       = priceMap.get(card.id) || {};
        const marketPrice = price.market_price      || null;
        const lowPrice    = price.low_price         || null;
        const foilPrice   = price.foil_market_price || null;
        const ptcg        = card.tcgplayer_id ? (pokemonTCGPrices.get(card.tcgplayer_id) || {}) : {};

        let slug = slugify(card.clean_name || card.name, card.number, setAbbr);
        if (slugsSeen.has(slug)) slug = slug + '-' + card.id;
        slugsSeen.add(slug);

        cardRows.push({
          id:                card.id,
          tcgplayer_id:      card.tcgplayer_id || null,
          name:              card.name,
          clean_name:        card.clean_name || null,
          slug,
          number:            card.number || null,
          rarity:            card.rarity || null,
          image_url:         card.image_url || null,
          tcgplayer_url:     card.tcgplayer_url || null,
          set_id:            set.id,
          set_name:          set.name,
          game_slug:         GAME_SLUG,
          custom_attributes: card.custom_attributes || null,
          market_price:      marketPrice,
          low_price:         lowPrice,
          foil_market_price: foilPrice,
          price_aud:         marketPrice ? parseFloat((marketPrice * audRate).toFixed(2)) : null,
          foil_price_aud:    foilPrice   ? parseFloat((foilPrice   * audRate).toFixed(2)) : null,
          aud_rate:          audRate,
          price_change_24h:  price.price_change_24h || null,
          price_change_7d:   price.price_change_7d  || null,
          price_change_30d:  price.price_change_30d || null,
          last_price_update: price.last_updated_at  || null,
          updated_at:        new Date().toISOString()
        });

        if (marketPrice && marketPrice >= 0.50) {
          snapRows.push({
            card_id:             card.id,
            snapshot_date:       today,
            market_price:        marketPrice,
            low_price:           lowPrice,
            foil_price:          foilPrice,
            price_aud:           parseFloat((marketPrice * audRate).toFixed(2)),
            aud_rate:            audRate,
            price_change_30d:    price.price_change_30d || null,
            tcg_low:             ptcg.tcg_low             ? parseFloat(ptcg.tcg_low)             : null,
            tcg_mid:             ptcg.tcg_mid             ? parseFloat(ptcg.tcg_mid)             : null,
            tcg_market:          ptcg.tcg_market          ? parseFloat(ptcg.tcg_market)          : null,
            tcg_direct_low:      ptcg.tcg_direct_low      ? parseFloat(ptcg.tcg_direct_low)      : null,
            holofoil_low:        ptcg.holofoil_low        ? parseFloat(ptcg.holofoil_low)        : null,
            holofoil_mid:        ptcg.holofoil_mid        ? parseFloat(ptcg.holofoil_mid)        : null,
            holofoil_market:     ptcg.holofoil_market     ? parseFloat(ptcg.holofoil_market)     : null,
            reverse_holo_low:    ptcg.reverse_holo_low    ? parseFloat(ptcg.reverse_holo_low)    : null,
            reverse_holo_mid:    ptcg.reverse_holo_mid    ? parseFloat(ptcg.reverse_holo_mid)    : null,
            reverse_holo_market: ptcg.reverse_holo_market ? parseFloat(ptcg.reverse_holo_market) : null,
            cardmarket_low:      ptcg.cardmarket_low      ? parseFloat(ptcg.cardmarket_low)      : null,
            cardmarket_trend:    ptcg.cardmarket_trend    ? parseFloat(ptcg.cardmarket_trend)    : null,
            cardmarket_avg7:     ptcg.cardmarket_avg7     ? parseFloat(ptcg.cardmarket_avg7)     : null,
            cardmarket_avg30:    ptcg.cardmarket_avg30    ? parseFloat(ptcg.cardmarket_avg30)    : null,
          });
        }
      }

      for (let i = 0; i < cardRows.length; i += 200) {
        await supabaseUpsert('pokemon_cards', cardRows.slice(i, i + 200));
      }
      for (let i = 0; i < snapRows.length; i += 500) {
        await supabaseUpsertSnapshots('pokemon_price_snapshots', snapRows.slice(i, i + 500));
      }

      totalCards += cardRows.length;
      totalSnaps += snapRows.length;
      await markSetSynced(set.id);
      console.log(`[sync-pokemon] Set ${set.name}: ${cardRows.length} cards, ${snapRows.length} snapshots`);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[sync-pokemon] Done. ${setCount} new sets, ${skippedCount} skipped. ${totalCards} cards, ${totalSnaps} snapshots. ${elapsed}s`);
    return new Response('OK', { status: 200 });

  } catch (err) {
    console.error('[sync-pokemon] FATAL:', err.message);
    return new Response(err.message, { status: 500 });
  }
};

export const config = { schedule: "0 4 * * *" };
