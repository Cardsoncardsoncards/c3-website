// netlify/functions/sync-starwars-background.mjs
// Daily sync -- schedule: 0 4 * * * UTC
// Fetches all star-wars-unlimited sets + cards + prices from tcgapi.dev Pro
// Upserts into starwars_sets, starwars_cards, starwars_price_snapshots

import { summariseFailures } from './shared/failure-summary.mjs';
import { assignStableSlugs } from './shared/slug-assign.mjs';

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const TCGAPI_KEY           = Netlify.env.get('TCGAPI_KEY');
const SYNC_SECRET          = Netlify.env.get('SYNC_SECRET');
const GAME_SLUG            = 'star-wars-unlimited';
const TCGAPI_BASE          = 'https://api.tcgapi.dev/v1';
const RATE_LIMIT_BUFFER    = 200;
const MAX_PAGES            = 50;
const ENRICH_MAX_PER_RUN   = 1500;
const SWU_SET_CODES = {
  'Spark of Rebellion': 'sor',
  'Shadows of the Galaxy': 'shd',
  'Twilight of the Republic': 'twi',
  'Jump to Lightspeed': 'jtl',
  'Legends of the Force': 'lof'
};

function slugify(name, number, setAbbr) {
  const base = name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const withNumber = number ? `${base}-${number.replace(/[^a-z0-9]/gi, '-').toLowerCase()}` : base;
  const prefix = setAbbr
    ? setAbbr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : null;
  return prefix ? `${prefix}-${withNumber}` : withNumber;
}


async function getExchangeRate() {
  const base = Netlify.env.get('URL') || 'https://cardsoncardsoncards.com.au';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  await logSyncEvent('sync_start');

  try {
    const res = await fetch(`${base}/api/fx-rate`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return 1.45;
    const data = await res.json();
    return parseFloat(data.rate) || 1.45;
  } catch {
    clearTimeout(timeout);
    return 1.45;
  }
}

async function tcgapiGet(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${TCGAPI_BASE}${path}`, {
      headers: { 'X-API-Key': TCGAPI_KEY },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`tcgapi GET ${path} failed ${res.status}: ${err.slice(0, 200)}`);
    }
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch {
      throw new Error(`tcgapi GET ${path} returned non-JSON: ${text.slice(0, 200)}`);
    }
    const remaining = parseInt(res.headers.get('x-ratelimit-remaining') ?? '9999', 10);
    if (remaining < RATE_LIMIT_BUFFER) {
      throw new Error(`Rate limit low: ${remaining} remaining. Aborting.`);
    }
    return data;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function supabaseGet(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    return await res.json();
  } catch { clearTimeout(timeout); return []; }
}

// Card Details enrichment: swu-db (free, no key). Join = set code + numeric part of number.
async function fetchStarwarsStats(setCode, number) {
  if (!setCode || !number) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://api.swu-db.com/cards/${setCode}/${encodeURIComponent(number)}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const c = await res.json();
    if (!c || (c.Cost == null && c.Power == null && c.HP == null)) return null;
    return {
      cost: c.Cost ?? null, power: c.Power ?? null, hp: c.HP ?? null,
      aspects: Array.isArray(c.Aspects) ? c.Aspects : null,
      traits: Array.isArray(c.Traits) ? c.Traits : null,
      arenas: Array.isArray(c.Arenas) ? c.Arenas : null,
      type: c.Type ?? null
    };
  } catch { clearTimeout(timeout); return null; }
}

async function supabaseUpsert(table, rows) {
  if (!rows.length) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(rows),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase upsert to ${table} failed: ${err.slice(0, 300)}`);
    }
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function supabaseUpsertSnapshots(table, rows) {
  if (!rows.length) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=card_id,snapshot_date`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(rows),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase snapshot upsert to ${table} failed: ${err.slice(0, 300)}`);
    }
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// Audit trail into sync_events. Fire-and-forget: a logging failure must never break
// the sync itself, so this swallows its own errors and only warns.
//
// The live sync_events schema is deliberately thin: event_type (required), game,
// rows_affected, triggered_at (defaults to now()), webhook_fired (defaults false).
// Run status is encoded in event_type. On a sync_error the caught error message is now
// persisted to the sync_events.error_message column, so a failed run is diagnosable from
// Supabase alone without relying on Netlify function logs. It still goes to console.error too.
async function logSyncEvent(eventType, rowsAffected = null, errorMessage = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/sync_events`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify([{
        event_type:    eventType,
        game:          GAME_SLUG,
        rows_affected: rowsAffected,
        error_message: errorMessage
      }]),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[sync-${GAME_SLUG}] sync_events log failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  } catch (e) {
    clearTimeout(timer);
    console.warn(`[sync-${GAME_SLUG}] sync_events log error: ${e.message}`);
  }
}

export default async (req) => {
  // Auth: accept scheduled trigger OR POST with correct secret
  const isScheduled = !req.headers.get('x-sync-secret') &&
                      !req.headers.get('origin') &&
                      !req.headers.get('referer');
  if (!isScheduled) {
    const secret = req.headers.get('x-sync-secret');
    if (secret !== SYNC_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  console.log('[sync-starwars] Starting...');
  const start = Date.now();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('[sync-starwars] Missing Supabase env vars');
    return new Response('Supabase env vars missing', { status: 500 });
  }
  if (!TCGAPI_KEY) {
    console.error('[sync-starwars] TCGAPI_KEY not set');
    return new Response('TCGAPI_KEY missing', { status: 500 });
  }

  try {
    const audRate = await getExchangeRate();
    console.log(`[sync-starwars] AUD rate: ${audRate}`);

    // Step 1: Fetch all sets
    const allSets = [];
    let page = 1;
    while (page <= MAX_PAGES) {
      const data = await tcgapiGet(`/games/${GAME_SLUG}/sets?per_page=100&page=${page}`);
      const sets = data.data || [];
      allSets.push(...sets);
      if (sets.length < 100) break;
      page++;
    }
    console.log(`[sync-starwars] Found ${allSets.length} sets`);

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
      await supabaseUpsert('starwars_sets', setRows.slice(i, i + 100));
    }

    // Step 3: For each set, fetch cards + prices
    const today = new Date().toISOString().split('T')[0];
    let totalCards = 0;
    let totalSnaps = 0;
    // C3L-168: this array already existed here and already collected sets that failed
    // to FETCH, and it was returned in the HTTP response while the run still logged
    // sync_success. Upsert failures now feed the same array, and the array now decides
    // the event type, so both kinds of lost set are visible in sync_events.
    const failedSets = [];
    let enrichCount = 0;

    for (const set of allSets) {
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

      // Card Details: existing enrichment for this set (preserve on upsert, skip re-fetch)
      const enrichedMap = new Map();
      for (const r of await supabaseGet(`starwars_cards?set_id=eq.${set.id}&custom_attributes=not.is.null&select=id,custom_attributes`)) {
        if (r.custom_attributes) enrichedMap.set(r.id, r.custom_attributes);
      }

      // Bulk prices
      const cardIds = setCards.map(c => c.id);
      const priceMap = new Map();
      for (let i = 0; i < cardIds.length; i += 500) {
        const batch = cardIds.slice(i, i + 500);
        try {
          const priceData = await tcgapiGet(`/bulk/prices?ids=${batch.join(',')}`);
          for (const p of (priceData.data || [])) {
            priceMap.set(p.card_id, p);
          }
        } catch (e) {
          if (e.message.includes('Rate limit low')) throw e;
          console.error(`[sync-starwars] Bulk price fetch failed for set ${set.id}:`, e.message);
          failedSets.push(set.id ?? set.name ?? 'unknown');
        }
      }

      const cardRows = [];
      const snapRows = [];
      const setAbbr = set.abbreviation || set.slug || String(set.id);
      const cardSlugs = await assignStableSlugs({
        items: setCards,
        baseSlugFor: card => slugify(card.clean_name || card.name, card.number, setAbbr),
        table: 'starwars_cards',
        supabaseUrl: SUPABASE_URL,
        serviceKey: SUPABASE_SERVICE_KEY
      });

      for (const card of setCards) {
        const price = priceMap.get(card.id) || {};
        const marketPrice = price.market_price || null;
        const lowPrice    = price.low_price || null;
        const foilPrice   = price.foil_market_price || null;

        const slug = cardSlugs.get(card.id);

        let customAttrs = enrichedMap.get(card.id) || card.custom_attributes || null;
        if (!enrichedMap.has(card.id) && enrichCount < ENRICH_MAX_PER_RUN) {
          const swuCode = SWU_SET_CODES[set.name];
          const swuNum = card.number ? String(card.number).split('/')[0].replace(/[^0-9]/g, '') : null;
          if (swuCode && swuNum) {
            const stats = await fetchStarwarsStats(swuCode, swuNum);
            if (stats) { customAttrs = stats; enrichCount++; }
          }
        }

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
          custom_attributes: customAttrs,
          market_price:      marketPrice,
          low_price:         lowPrice,
          foil_market_price: foilPrice,
          price_aud:         marketPrice ? parseFloat((marketPrice * audRate).toFixed(2)) : null,
          foil_price_aud:    foilPrice ? parseFloat((foilPrice * audRate).toFixed(2)) : null,
          aud_rate:          audRate,
          price_change_24h:  price.price_change_24h || null,
          // C3L-80: the upstream price_change_7d write was REMOVED here on 1 September 2026.
          // It copied tcgapi.dev's own figure verbatim, over the vendor's market and currency,
          // with no window and no tolerance, and it overwrote the value that
          // update_starwars_price_changes() computes each night from C3's OWN price_aud snapshots
          // at a fixed 7 day offset with a 1 day tolerance. Two writers disagreeing on a
          // percentage is worse than one, because the page cannot say which it is showing.
          // The cron is the surviving writer. Measured before removal: it can populate more
          // cards than this line left standing, so removing it widens coverage rather than
          // narrowing it. The snapshot-row write further down is deliberately KEPT, as a
          // record of what upstream reported; nothing renders it.
          price_change_30d:  price.price_change_30d || null,
          total_listings:    price.total_listings || null,
          median_price:      price.median_price || null,
          last_price_update: price.last_updated_at || null,
          updated_at:        new Date().toISOString()
        });

        if (marketPrice && marketPrice >= 0.5) {
          snapRows.push({
            card_id:          card.id,
            snapshot_date:    today,
            source:           'sync-starwars-background',
            market_price:     marketPrice,
            low_price:        lowPrice,
            foil_price:       foilPrice,
            price_aud:        parseFloat((marketPrice * audRate).toFixed(2)),
            aud_rate:         audRate,
            price_change_7d:  price.price_change_7d  || null,
            foil_price_aud:   foilPrice ? parseFloat((foilPrice * audRate).toFixed(2)) : null,
            price_change_30d: price.price_change_30d || null,
            total_listings:   price.total_listings   || null,
            median_price:     price.median_price     || null
          });
        }
      }

      let cardsWritten = 0, snapsWritten = 0;

      // FK-02, 31 August 2026. Applied from the One Piece fix in a1db61d (FK-01), unchanged in
      // shape. These two upserts used to run concurrently inside one Promise.allSettled, and
      // they are not independent: starwars_price_snapshots.card_id is a FOREIGN KEY onto
      // starwars_cards(id), so a snapshot row is the CHILD of a card row. Racing
      // them meant that for a brand new set, whose parent card rows do not exist yet, a snapshot
      // chunk could reach Postgres before the card chunk had committed and the whole snapshot
      // upsert was rejected 23503. sync_events recorded that against 15 distinct games in the
      // fourteen days to 31 August.
      //
      // Parent first, child second, awaited in order. The two arms stay isolated from one another
      // (a failed card upsert records itself and does not throw past this block), which is what
      // the Promise.allSettled shape was for; only the concurrency is gone, and the concurrency
      // is the bug. The results array keeps its shape so the reporting loop below is unchanged.
      const results = [];
      try {
        for (let i = 0; i < cardRows.length; i += 200) {
          const chunk = cardRows.slice(i, i + 200);
          await supabaseUpsert('starwars_cards', chunk);
          cardsWritten += chunk.length;
        }
        results.push({ status: 'fulfilled' });
      } catch (err) {
        results.push({ status: 'rejected', reason: err });
      }
      try {
        for (let i = 0; i < snapRows.length; i += 500) {
          const chunk = snapRows.slice(i, i + 500);
          await supabaseUpsertSnapshots('starwars_price_snapshots', chunk);
          snapsWritten += chunk.length;
        }
        results.push({ status: 'fulfilled' });
      } catch (err) {
        results.push({ status: 'rejected', reason: err });
      }

      for (const r of results) {
        if (r.status === 'rejected') {
          console.error(`[sync-starwars] Upsert error for set ${set.name}:`, r.reason?.message);
          failedSets.push(`${set.name}: ${r.reason?.message || 'unknown error'}`);
        }
      }

      // C3L-168: cardsWritten/snapsWritten count rows the database accepted. The old
      // cardRows.length counted rows ASSEMBLED, so a set whose upsert aborted still
      // added its full row count and the run reported a total nothing had written.
      totalCards += cardsWritten;
      totalSnaps += snapsWritten;
      console.log(`[sync-starwars] ${set.name}: ${cardsWritten}/${cardRows.length} cards, ${snapsWritten}/${snapRows.length} snapshots written`);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[sync-starwars] Done. ${totalCards} cards, ${totalSnaps} snapshots in ${elapsed}s`);
    // C3L-168: a run that lost a set reports sync_partial with the reasons, not
    // sync_success. Nothing about the sync's own behaviour changes, only what it says.
    await logSyncEvent(
      failedSets.length ? 'sync_partial' : 'sync_success',
      totalCards,
      summariseFailures(failedSets)
    );
    return new Response(JSON.stringify({ cards: totalCards, snapshots: totalSnaps, elapsed, failedSets, failedSetCount: failedSets.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[sync-starwars] FATAL:', err.message);
    await logSyncEvent('sync_error', null, err.message);
    return new Response(err.message, { status: 500 });
  }
};

export const config = {
  schedule: "0 4 * * *",
  type: "background"
};
