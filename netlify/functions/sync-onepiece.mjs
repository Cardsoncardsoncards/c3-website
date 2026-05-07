// netlify/functions/sync-onepiece.mjs
// Scheduled: daily at 5:30am UTC (3:30pm AEST)
// Game: One Piece Card Game | Slug: one-piece-card-game (confirmed tcgapi.dev/games)
// Tables: onepiece_sets, onepiece_cards, onepiece_price_snapshots
//
// Credit budget per full sync (Pro tier, 10,000/day):
//   Sets:        1 page   =     1 credit
//   Cards:      ~74 pages =    74 credits (avg 1 page per set)
//   Bulk prices: ceil(6643 / 500) = 14 calls x 250 = 3,500 credits
//   Total:      ~3,575 credits — well within daily limit

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const TCGAPI_KEY           = Netlify.env.get('TCGAPI_KEY');
const GAME_SLUG            = 'one-piece-card-game';
const TCGAPI_BASE          = 'https://api.tcgapi.dev/v1';
const SAFE_FLOOR           = 500;
const BULK_SIZE            = 500;
const SNAP_MIN_USD         = 0.50;

let creditsLeft = 10000;

function slugify(name, number) {
  const base = (name || '').toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const num = (number || '').replace(/[^a-z0-9]/gi, '-').toLowerCase().replace(/^-+|-+$/g, '');
  return num ? `${base}-${num}` : base;
}

async function getAudRate() {
  try {
    const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const d = await r.json();
    return d.rates?.AUD || 1.58;
  } catch { return 1.58; }
}

async function apiGet(path) {
  if (creditsLeft <= SAFE_FLOOR) throw new Error(`Credits at safe floor (${creditsLeft}). Stopping.`);

  const res = await fetch(`${TCGAPI_BASE}${path}`, {
    headers: { 'X-API-Key': TCGAPI_KEY, 'Accept': 'application/json' }
  });

  const hdr = res.headers.get('X-RateLimit-Remaining');
  if (hdr !== null) creditsLeft = parseInt(hdr, 10);

  if (res.status === 429) {
    const reset = res.headers.get('X-RateLimit-Reset') || 'midnight UTC';
    throw new Error(`429 rate limit exceeded. Resets: ${reset}. Credits: ${creditsLeft}`);
  }

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`API ${res.status} on ${path}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  if (hdr === null && data.rate_limit?.daily_remaining != null) creditsLeft = data.rate_limit.daily_remaining;
  return data;
}

async function dbUpsert(table, rows) {
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
    throw new Error(`DB upsert ${table} failed: ${err.slice(0, 300)}`);
  }
}

export default async (req) => {
  console.log('[sync-onepiece] Starting');
  if (!TCGAPI_KEY) return new Response('TCGAPI_KEY missing', { status: 500 });
  if (!SUPABASE_SERVICE_KEY) return new Response('SUPABASE_SERVICE_KEY missing', { status: 500 });

  const t0 = Date.now();

  try {
    const audRate = await getAudRate();
    console.log(`[sync-onepiece] AUD rate: ${audRate}`);

    // 1. Fetch all sets
    const allSets = [];
    let page = 1;
    while (true) {
      const d = await apiGet(`/games/${GAME_SLUG}/sets?per_page=100&page=${page}`);
      allSets.push(...(d.data || []));
      console.log(`[sync-onepiece] Sets page ${page}: ${(d.data||[]).length} (credits: ${creditsLeft})`);
      if (!d.meta?.has_more) break;
      page++;
    }
    console.log(`[sync-onepiece] ${allSets.length} sets found`);

    // 2. Upsert sets
    const setRows = allSets.map(s => ({
      id: s.id, name: s.name,
      slug: s.slug || slugify(s.name, ''),
      abbreviation: s.abbreviation || null,
      release_date: s.release_date || null,
      card_count: s.card_count || 0,
      game_slug: GAME_SLUG,
      updated_at: new Date().toISOString()
    }));
    for (let i = 0; i < setRows.length; i += 100) await dbUpsert('onepiece_sets', setRows.slice(i, i + 100));
    console.log(`[sync-onepiece] ${setRows.length} sets upserted`);

    // 3. Fetch all card metadata
    const allCards = [];
    const cardSetMap = new Map();
    for (const set of allSets) {
      let cp = 1;
      while (true) {
        const d = await apiGet(`/sets/${set.id}/cards?per_page=100&page=${cp}`);
        for (const c of (d.data || [])) { allCards.push(c); cardSetMap.set(c.id, set); }
        if (!d.meta?.has_more) break;
        cp++;
      }
    }
    console.log(`[sync-onepiece] ${allCards.length} cards fetched (credits: ${creditsLeft})`);

    // 4. Bulk prices
    const estimatedCost = Math.ceil(allCards.length * 0.5);
    console.log(`[sync-onepiece] Bulk prices: ~${estimatedCost} credits needed, ${creditsLeft} available`);

    const priceMap = new Map();
    const ids = allCards.map(c => c.id);
    let bulkAborted = false;

    for (let i = 0; i < ids.length; i += BULK_SIZE) {
      if (creditsLeft <= SAFE_FLOOR) {
        console.warn(`[sync-onepiece] Credits too low, stopping bulk prices early at batch ${Math.floor(i/BULK_SIZE)+1}`);
        bulkAborted = true;
        break;
      }
      try {
        const d = await apiGet(`/bulk/prices?ids=${ids.slice(i, i + BULK_SIZE).join(',')}`);
        for (const p of (d.data || [])) priceMap.set(p.card_id, p);
        console.log(`[sync-onepiece] Prices batch ${Math.floor(i/BULK_SIZE)+1}/${Math.ceil(ids.length/BULK_SIZE)} (credits: ${creditsLeft})`);
      } catch (e) {
        if (e.message.includes('429') || e.message.includes('safe floor')) { bulkAborted = true; break; }
        console.error(`[sync-onepiece] Bulk batch error (non-fatal):`, e.message);
      }
    }

    // 5. Build rows
    const today = new Date().toISOString().slice(0, 10);
    const slugsSeen = new Set();
    const cardRows = [], snapRows = [];

    for (const c of allCards) {
      const set = cardSetMap.get(c.id);
      const p = priceMap.get(c.id) || {};
      const mp = p.market_price ?? null;
      const lp = p.low_price ?? null;
      const fp = p.foil_market_price ?? null;

      let slug = slugify(c.clean_name || c.name, c.number);
      if (slugsSeen.has(slug)) slug = `${slug}-${c.id}`;
      slugsSeen.add(slug);

      cardRows.push({
        id: c.id, tcgplayer_id: c.tcgplayer_id || null,
        name: c.name, clean_name: c.clean_name || null, slug,
        number: c.number || null, rarity: c.rarity || null,
        image_url: c.image_url || null, tcgplayer_url: c.tcgplayer_url || null,
        set_id: set.id, set_name: set.name, game_slug: GAME_SLUG,
        custom_attributes: c.custom_attributes || null,
        market_price: mp, low_price: lp, foil_market_price: fp,
        price_aud: mp != null ? parseFloat((mp * audRate).toFixed(2)) : null,
        foil_price_aud: fp != null ? parseFloat((fp * audRate).toFixed(2)) : null,
        aud_rate: audRate,
        price_change_24h: p.price_change_24h ?? null,
        price_change_7d: null,
        last_price_update: p.last_updated_at || null,
        updated_at: new Date().toISOString()
      });

      if (mp != null && mp >= SNAP_MIN_USD) {
        snapRows.push({
          card_id: c.id, snapshot_date: today,
          market_price: mp, low_price: lp, foil_price: fp,
          price_aud: parseFloat((mp * audRate).toFixed(2)), aud_rate: audRate
        });
      }
    }

    for (let i = 0; i < cardRows.length; i += 200) await dbUpsert('onepiece_cards', cardRows.slice(i, i + 200));
    for (let i = 0; i < snapRows.length; i += 500) await dbUpsert('onepiece_price_snapshots', snapRows.slice(i, i + 500));

    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[sync-onepiece] Done: ${cardRows.length} cards, ${snapRows.length} snapshots, ${secs}s, credits: ${creditsLeft}${bulkAborted ? ' — PRICES INCOMPLETE' : ''}`);
    return new Response('OK', { status: 200 });

  } catch (err) {
    console.error('[sync-onepiece] FATAL:', err.message);
    return new Response(err.message, { status: 500 });
  }
};

export const config = { schedule: '30 5 * * *' };
