// netlify/functions/sync-yugioh.mjs
// Scheduled: daily at 5:00am UTC (3:00pm AEST)
// Game: Yu-Gi-Oh! | Slug: yugioh (confirmed tcgapi.dev/games)
// Tables: yugioh_sets, yugioh_cards, yugioh_price_snapshots
//
// IMPORTANT - Credit budget:
//   Sets:        7 pages  =       7 credits
//   Cards:      ~610 pages =    610 credits (avg 1 page per set)
//   Bulk prices: ceil(45711 / 500) = 92 calls x 250 = 23,000 credits
//   Total bulk prices EXCEEDS daily 10,000 limit by 2.3x
//
// STRATEGY: Process sets newest-first. Save metadata for all sets cheaply.
//   Then add prices set-by-set until credits run low.
//   Over ~3 daily runs, all sets will have prices.
//   The most recently released (highest value) sets are priced first every run.

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const TCGAPI_KEY           = Netlify.env.get('TCGAPI_KEY');
const GAME_SLUG            = 'yugioh';
const TCGAPI_BASE          = 'https://api.tcgapi.dev/v1';
const SAFE_FLOOR           = 500;
const BULK_SIZE            = 500;
const SNAP_MIN_USD         = 0.25;  // lower threshold for YGO competitive staples

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
  console.log('[sync-yugioh] Starting');
  if (!TCGAPI_KEY) return new Response('TCGAPI_KEY missing', { status: 500 });
  if (!SUPABASE_SERVICE_KEY) return new Response('SUPABASE_SERVICE_KEY missing', { status: 500 });

  const t0 = Date.now();

  try {
    const audRate = await getAudRate();
    console.log(`[sync-yugioh] AUD rate: ${audRate}`);

    // 1. Fetch all sets
    const allSets = [];
    let page = 1;
    while (true) {
      const d = await apiGet(`/games/${GAME_SLUG}/sets?per_page=100&page=${page}`);
      allSets.push(...(d.data || []));
      console.log(`[sync-yugioh] Sets page ${page}: ${(d.data||[]).length} (credits: ${creditsLeft})`);
      if (!d.meta?.has_more) break;
      page++;
    }

    // Sort newest release date first — ensures recent high-value sets get priced each run
    allSets.sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''));
    console.log(`[sync-yugioh] ${allSets.length} sets found (sorted newest first)`);

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
    for (let i = 0; i < setRows.length; i += 100) await dbUpsert('yugioh_sets', setRows.slice(i, i + 100));
    console.log(`[sync-yugioh] ${setRows.length} sets upserted (credits: ${creditsLeft})`);

    // 3. Process sets one at a time: metadata + prices where credits allow
    const today = new Date().toISOString().slice(0, 10);
    let totalCards = 0, totalSnaps = 0, setsWithPrices = 0, setsMetadataOnly = 0;

    for (const set of allSets) {
      // Fetch cards for this set
      const setCards = [];
      let cp = 1;
      while (true) {
        const d = await apiGet(`/sets/${set.id}/cards?per_page=100&page=${cp}`);
        setCards.push(...(d.data || []));
        if (!d.meta?.has_more) break;
        cp++;
      }

      if (!setCards.length) continue;

      // Can we afford prices for this set?
      const setCost = Math.ceil(setCards.length * 0.5);
      const canAfford = (creditsLeft - setCost) > SAFE_FLOOR;

      const priceMap = new Map();
      if (canAfford) {
        const ids = setCards.map(c => c.id);
        for (let i = 0; i < ids.length; i += BULK_SIZE) {
          if (creditsLeft <= SAFE_FLOOR) break;
          try {
            const d = await apiGet(`/bulk/prices?ids=${ids.slice(i, i + BULK_SIZE).join(',')}`);
            for (const p of (d.data || [])) priceMap.set(p.card_id, p);
          } catch (e) {
            if (e.message.includes('429') || e.message.includes('safe floor')) break;
            console.error(`[sync-yugioh] Bulk error in set ${set.name}:`, e.message);
          }
        }
        setsWithPrices++;
      } else {
        setsMetadataOnly++;
      }

      // Build rows for this set
      const slugsSeen = new Set();
      const cardRows = [], snapRows = [];

      for (const c of setCards) {
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

      for (let i = 0; i < cardRows.length; i += 200) await dbUpsert('yugioh_cards', cardRows.slice(i, i + 200));
      for (let i = 0; i < snapRows.length; i += 500) await dbUpsert('yugioh_price_snapshots', snapRows.slice(i, i + 500));

      totalCards += cardRows.length;
      totalSnaps += snapRows.length;
    }

    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[sync-yugioh] Done: ${totalCards} cards, ${totalSnaps} snapshots. Sets with prices: ${setsWithPrices}, metadata only: ${setsMetadataOnly}. ${secs}s. Credits: ${creditsLeft}`);
    return new Response('OK', { status: 200 });

  } catch (err) {
    console.error('[sync-yugioh] FATAL:', err.message);
    return new Response(err.message, { status: 500 });
  }
};

export const config = { schedule: '0 5 * * *' };
