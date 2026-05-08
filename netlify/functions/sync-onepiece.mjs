// netlify/functions/sync-onepiece.mjs
// Scheduled: daily at 5:30am UTC (3:30pm AEST)
// Fetches all One Piece sets + cards + prices from tcgapi.dev Pro
// Upserts into onepiece_sets, onepiece_cards, onepiece_price_snapshots

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const TCGAPI_KEY           = Netlify.env.get('TCGAPI_KEY');
const GAME_SLUG            = 'one-piece-card-game';
const TCGAPI_BASE          = 'https://api.tcgapi.dev/v1';
const RATE_LIMIT_BUFFER    = 200;
const MAX_PAGES            = 50; // hard cap on pagination to prevent runaway loops

// --- Helpers ---

function slugify(name, number, setAbbr) {
  const base = name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const withNumber = number ? `${base}-${number.replace(/[^a-z0-9]/gi, '-').toLowerCase()}` : base;
  // Always prefix with set abbreviation to prevent cross-set slug collisions
  const prefix = setAbbr
    ? setAbbr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : null;
  return prefix ? `${prefix}-${withNumber}` : withNumber;
}

async function getExchangeRate() {
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await res.json();
    return data.rates?.AUD || 1.58;
  } catch {
    return 1.58;
  }
}

async function tcgapiGet(path) {
  const res = await fetch(`${TCGAPI_BASE}${path}`, {
    headers: { 'X-API-Key': TCGAPI_KEY }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`tcgapi GET ${path} failed ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  // Default to 0 if rate_limit field is missing — forces abort rather than running blind
  const remaining = data.rate_limit?.daily_remaining ?? 0;
  if (remaining < RATE_LIMIT_BUFFER) {
    throw new Error(`Rate limit low: ${remaining} requests remaining. Aborting to protect quota.`);
  }
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
    throw new Error(`Supabase upsert to ${table} failed: ${err.slice(0, 300)}`);
  }
}

// --- Main ---

export default async (req) => {
  console.log('[sync-onepiece] Starting...');
  const start = Date.now();

  // Validate env vars first
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('[sync-onepiece] Missing Supabase env vars');
    return new Response('Supabase env vars missing', { status: 500 });
  }
  if (!TCGAPI_KEY) {
    console.error('[sync-onepiece] TCGAPI_KEY not set');
    return new Response('TCGAPI_KEY missing', { status: 500 });
  }

  try {
    const audRate = await getExchangeRate();
    console.log(`[sync-onepiece] AUD rate: ${audRate}`);

    // Step 1: Fetch all sets (hard cap at MAX_PAGES)
    console.log('[sync-onepiece] Fetching sets...');
    const allSets = [];
    let page = 1;
    while (page <= MAX_PAGES) {
      const data = await tcgapiGet(`/games/${GAME_SLUG}/sets?per_page=100&page=${page}`);
      const sets = data.data || [];
      allSets.push(...sets);
      if (sets.length < 100) break;
      page++;
    }
    console.log(`[sync-onepiece] Found ${allSets.length} sets`);

    // Step 2: Upsert sets
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
      await supabaseUpsert('onepiece_sets', setRows.slice(i, i + 100));
    }
    console.log(`[sync-onepiece] Upserted ${setRows.length} sets`);

    // Step 3: For each set, fetch cards + prices
    const today = new Date().toISOString().split('T')[0];
    let totalCards = 0;
    let totalSnaps = 0;

    for (const set of allSets) {
      console.log(`[sync-onepiece] Syncing set: ${set.name} (id:${set.id})`);
      const setCards = [];
      let cardPage = 1;

      // Hard cap on card pages per set
      while (cardPage <= MAX_PAGES) {
        const data = await tcgapiGet(`/sets/${set.id}/cards?per_page=100&page=${cardPage}`);
        const cards = data.data || [];
        setCards.push(...cards);
        if (cards.length < 100) break;
        cardPage++;
      }

      if (!setCards.length) continue;

      // Fetch bulk prices
      const cardIds = setCards.map(c => c.id);
      const priceMap = new Map();

      for (let i = 0; i < cardIds.length; i += 500) {
        const batch = cardIds.slice(i, i + 500);
        try {
          const priceData = await tcgapiGet(`/bulk/prices?ids=${batch.join(',')}`);
          const prices = priceData.data || [];
          for (const p of prices) {
            priceMap.set(p.card_id, p);
          }
        } catch (e) {
          // Re-throw rate limit errors — do not swallow them
          if (e.message.includes('Rate limit low')) throw e;
          console.error(`[sync-onepiece] Bulk price fetch failed for set ${set.id}:`, e.message);
        }
      }

      // Build rows
      const cardRows = [];
      const slugsSeen = new Set();
      const snapRows = [];
      const setAbbr = set.abbreviation || set.slug || String(set.id);

      for (const card of setCards) {
        const price = priceMap.get(card.id) || {};
        const marketPrice = price.market_price || null;
        const lowPrice = price.low_price || null;
        const foilPrice = price.foil_market_price || null;
        let slug = slugify(card.clean_name || card.name, card.number, setAbbr);
        if (slugsSeen.has(slug)) slug = slug + '-' + card.id;
        slugsSeen.add(slug);

        cardRows.push({
          id:                card.id,
          tcgplayer_id:      card.tcgplayer_id || null,
          name:              card.name,
          clean_name:        card.clean_name || null,
          slug:              slug,
          number:            card.number || null,
          rarity:            card.rarity || null,
          image_url:         card.image_url || null,
          tcgplayer_url:     card.tcgplayer_url || null,
          set_id:            set.id,
          set_name:          set.name,
          game_slug:         GAME_SLUG,
          custom_attributes: card.custom_attributes ? JSON.stringify(card.custom_attributes) : null,
          market_price:      marketPrice,
          low_price:         lowPrice,
          foil_market_price: foilPrice,
          price_aud:         marketPrice ? parseFloat((marketPrice * audRate).toFixed(2)) : null,
          foil_price_aud:    foilPrice ? parseFloat((foilPrice * audRate).toFixed(2)) : null,
          aud_rate:          audRate,
          price_change_24h:  price.price_change_24h || null,
          price_change_7d:   null,
          last_price_update: price.last_updated_at || null,
          updated_at:        new Date().toISOString()
        });

        if (marketPrice && marketPrice >= 0.50) {
          snapRows.push({
            card_id:       card.id,
            snapshot_date: today,
            market_price:  marketPrice,
            low_price:     lowPrice,
            foil_price:    foilPrice,
            price_aud:     parseFloat((marketPrice * audRate).toFixed(2)),
            aud_rate:      audRate
          });
        }
      }

      for (let i = 0; i < cardRows.length; i += 200) {
        await supabaseUpsert('onepiece_cards', cardRows.slice(i, i + 200));
      }
      for (let i = 0; i < snapRows.length; i += 500) {
        await supabaseUpsert('onepiece_price_snapshots', snapRows.slice(i, i + 500));
      }

      totalCards += cardRows.length;
      totalSnaps += snapRows.length;
      console.log(`[sync-onepiece] Set ${set.name}: ${cardRows.length} cards, ${snapRows.length} snapshots`);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[sync-onepiece] Done. ${totalCards} cards, ${totalSnaps} snapshots. ${elapsed}s`);
    return new Response('OK', { status: 200 });

  } catch (err) {
    console.error('[sync-onepiece] FATAL:', err.message);
    return new Response(err.message, { status: 500 });
  }
};

export const config = { schedule: '30 5 * * *' };
