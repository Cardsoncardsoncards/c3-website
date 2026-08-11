// netlify/functions/sync-weissschwarz-background.mjs
// Daily sync -- schedule: 30 0 * * * UTC
// Fetches all weiss-schwarz sets + cards + prices from tcgapi.dev Pro
// Upserts into weissschwarz_sets, weissschwarz_cards, weissschwarz_price_snapshots

import { summariseFailures } from './shared/failure-summary.mjs';
import { assignStableSlugs } from './shared/slug-assign.mjs';

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const TCGAPI_KEY           = Netlify.env.get('TCGAPI_KEY');
const SYNC_SECRET          = Netlify.env.get('SYNC_SECRET');
const GAME_SLUG            = 'weiss-schwarz';
const TCGAPI_BASE          = 'https://api.tcgapi.dev/v1';
const RATE_LIMIT_BUFFER    = 200;
const MAX_PAGES            = 50;

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

  console.log('[sync-weissschwarz] Starting...');
  const start = Date.now();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('[sync-weissschwarz] Missing Supabase env vars');
    return new Response('Supabase env vars missing', { status: 500 });
  }
  if (!TCGAPI_KEY) {
    console.error('[sync-weissschwarz] TCGAPI_KEY not set');
    return new Response('TCGAPI_KEY missing', { status: 500 });
  }

  try {
    const audRate = await getExchangeRate();
    console.log(`[sync-weissschwarz] AUD rate: ${audRate}`);

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
    console.log(`[sync-weissschwarz] Found ${allSets.length} sets`);

    // Step 2: Upsert sets
    // weissschwarz_sets has a UNIQUE index on slug alone while the upsert conflict target is
    // id, so two sets that slugify to the same value abort the whole batch with a 23505 and
    // no prices are ever written. That is exactly what happened: "Kaguya-Sama: Love is War"
    // and "Kaguya-Sama: Love is War?" both reduce to kaguya-sama-love-is-war once the "?" is
    // stripped, and the sync had been failing on it daily since 6 June.
    // Collisions are resolved by assignStableSlugs, which keeps whatever slug is already
    // stored on the record and only invents an assignment for a genuinely new colliding pair.
    const setSlugs = await assignStableSlugs({
      items: allSets,
      baseSlugFor: s => s.slug || slugify(s.name, null, null),
      table: 'weissschwarz_sets',
      supabaseUrl: SUPABASE_URL,
      serviceKey: SUPABASE_SERVICE_KEY
    });
    const setRows = allSets.map(s => {
      return {
        id:           s.id,
        name:         s.name,
        slug:         setSlugs.get(s.id),
        abbreviation: s.abbreviation || null,
        release_date: s.release_date || null,
        card_count:   s.card_count || 0,
        game_slug:    GAME_SLUG,
        updated_at:   new Date().toISOString()
      };
    });

    for (let i = 0; i < setRows.length; i += 100) {
      await supabaseUpsert('weissschwarz_sets', setRows.slice(i, i + 100));
    }

    // Step 2b: Auto-assign a property to any sets that do not have one yet (non-fatal)
    try {
      const propHeaders = {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      };

      const propGet = async (path) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { signal: controller.signal, headers: propHeaders });
          clearTimeout(timer);
          if (!res.ok) return [];
          const data = await res.json();
          return Array.isArray(data) ? data : [];
        } catch { clearTimeout(timer); return []; }
      };

      const propPatch = async (setId, property) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          const res = await fetch(`${SUPABASE_URL}/rest/v1/weissschwarz_sets?id=eq.${setId}`, {
            method: 'PATCH',
            headers: { ...propHeaders, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ property }),
            signal: controller.signal
          });
          clearTimeout(timer);
          if (!res.ok) {
            const errText = await res.text();
            console.error(`[sync-weissschwarz] property PATCH failed for set ${setId}: ${res.status} ${errText.slice(0, 200)}`);
          }
        } catch (e) {
          clearTimeout(timer);
          console.error(`[sync-weissschwarz] property PATCH error for set ${setId}: ${e.message}`);
        }
      };

      const unassigned = await propGet('weissschwarz_sets?property=is.null&select=id,name');
      if (unassigned.length) {
        const propMap = await propGet('weissschwarz_property_map?select=name_pattern,property');
        let assigned = 0;
        for (const set of unassigned) {
          const nm = (set.name || '').toLowerCase();
          const match = propMap.find(m => m.name_pattern && nm.includes(m.name_pattern.toLowerCase()));
          await propPatch(set.id, match ? match.property : 'other');
          assigned++;
        }
        console.log(`[sync-weissschwarz] Auto-assigned property for ${assigned} set(s), ${propMap.length} patterns available`);
      }
    } catch (e) {
      console.error(`[sync-weissschwarz] property auto-assign block failed (non-fatal): ${e.message}`);
    }

    // Step 3: For each set, fetch cards + prices
    const today = new Date().toISOString().split('T')[0];
    let totalCards = 0;
    // C3L-168: every set whose upsert failed, so the run can report sync_partial
    // instead of a sync_success that counts rows nothing ever wrote.
    const failedSets = [];
    let totalSnaps = 0;

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
          console.error(`[sync-weissschwarz] Bulk price fetch failed for set ${set.id}:`, e.message);
        }
      }

      const cardRows = [];
      const snapRows = [];
      const setAbbr = set.abbreviation || set.slug || String(set.id);
      // C3L-55, 5 August 2026. This path is now on the same stored-slug rule as everything else.
      // History worth keeping, because it is why the rule looks like this: Task 10 put
      // lowest-id-wins here on the strength of having verified it for the SETS, which was an
      // extrapolation. weissschwarz_cards has 2 colliding pairs and lowest-id-wins reproduces
      // only 1. On the other, id 962780 "Kaguya-sama Love is War? Booster Box" holds the bare
      // slug while 961867 is lower, so the rule would have moved a live card URL. Task 11
      // reverted it to the arrival-order guard, which protected the URL but left the 23505 risk.
      // assignStableSlugs closes both: 962780 keeps the slug it already owns because it owns it,
      // not because of how its id compares to anything.
      const cardSlugs = await assignStableSlugs({
        items: setCards,
        baseSlugFor: card => slugify(card.clean_name || card.name, card.number, setAbbr),
        table: 'weissschwarz_cards',
        supabaseUrl: SUPABASE_URL,
        serviceKey: SUPABASE_SERVICE_KEY
      });

      for (const card of setCards) {
        const price = priceMap.get(card.id) || {};
        const marketPrice = price.market_price || null;
        const lowPrice    = price.low_price || null;
        const foilPrice   = price.foil_market_price || null;

        const slug = cardSlugs.get(card.id);

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
          custom_attributes: card.custom_attributes || null,
          market_price:      marketPrice,
          low_price:         lowPrice,
          foil_market_price: foilPrice,
          price_aud:         marketPrice ? parseFloat((marketPrice * audRate).toFixed(2)) : null,
          foil_price_aud:    foilPrice ? parseFloat((foilPrice * audRate).toFixed(2)) : null,
          aud_rate:          audRate,
          price_change_24h:  price.price_change_24h || null,
          price_change_7d:   price.price_change_7d || null,
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
      const results = await Promise.allSettled([
        (async () => {
          for (let i = 0; i < cardRows.length; i += 200) {
            const chunk = cardRows.slice(i, i + 200);
            await supabaseUpsert('weissschwarz_cards', chunk);
            cardsWritten += chunk.length;
          }
        })(),
        (async () => {
          for (let i = 0; i < snapRows.length; i += 500) {
            const chunk = snapRows.slice(i, i + 500);
            await supabaseUpsertSnapshots('weissschwarz_price_snapshots', chunk);
            snapsWritten += chunk.length;
          }
        })()
      ]);

      for (const r of results) {
        if (r.status === 'rejected') {
          console.error(`[sync-weissschwarz] Upsert error for set ${set.name}:`, r.reason?.message);
          failedSets.push(`${set.name}: ${r.reason?.message || 'unknown error'}`);
        }
      }

      // C3L-168: cardsWritten/snapsWritten count rows the database accepted. The old
      // cardRows.length counted rows ASSEMBLED, so a set whose upsert aborted still
      // added its full row count and the run reported a total nothing had written.
      totalCards += cardsWritten;
      totalSnaps += snapsWritten;
      console.log(`[sync-weissschwarz] ${set.name}: ${cardsWritten}/${cardRows.length} cards, ${snapsWritten}/${snapRows.length} snapshots written`);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[sync-weissschwarz] Done. ${totalCards} cards, ${totalSnaps} snapshots in ${elapsed}s`);
    // C3L-168: a run that lost a set reports sync_partial with the reasons, not
    // sync_success. Nothing about the sync's own behaviour changes, only what it says.
    await logSyncEvent(
      failedSets.length ? 'sync_partial' : 'sync_success',
      totalCards,
      summariseFailures(failedSets)
    );
    return new Response(JSON.stringify({ cards: totalCards, snapshots: totalSnaps, elapsed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[sync-weissschwarz] FATAL:', err.message);
    await logSyncEvent('sync_error', null, err.message);
    return new Response(err.message, { status: 500 });
  }
};

export const config = {
  schedule: "30 0 * * *",
  type: "background"
};
