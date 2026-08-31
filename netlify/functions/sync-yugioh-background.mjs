// netlify/functions/sync-yugioh-background.mjs
// Daily sync -- schedule: 0 0 * * * UTC
// Fetches all yugioh sets + cards + prices from tcgapi.dev Pro
// Upserts into yugioh_sets, yugioh_cards, yugioh_price_snapshots

import { summariseFailures } from './shared/failure-summary.mjs';
import { assignStableSlugs } from './shared/slug-assign.mjs';
import {
  makeBudget,
  loadSetProgress,
  orderSetsByStaleness,
  markSetSynced,
  rotationSummary
} from './shared/sync-rotation.mjs';

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const TCGAPI_KEY           = Netlify.env.get('TCGAPI_KEY');
const SYNC_SECRET          = Netlify.env.get('SYNC_SECRET');
const GAME_SLUG            = 'yugioh';
const TCGAPI_BASE          = 'https://api.tcgapi.dev/v1';
const RATE_LIMIT_BUFFER    = 200;
const MAX_PAGES            = 50;
const ENRICH_MAX_PER_RUN   = 1500;
const PROGRESS_TABLE       = 'yugioh_sync_progress';

// C3L-134. This sync used to walk all 615 sets in a fixed order with no time limit, so Netlify
// killed it at 900s, three times a night, and it never once reached either its success or its
// error line: 21 starts and zero outcomes in 7 days. Worse, each retry restarted from the SAME
// position, so the same head sets were refreshed repeatedly and the tail starved. Measured on
// 9 August: 248 of 615 sets refreshed that day, while 365 sets holding about 21,500 cards were
// last written between 7 June and 11 July. max(yugioh_cards.updated_at) still read "today",
// which is why nothing noticed.
//
// Ordering by staleness makes the three attempts add up instead of repeat, and the budget means
// the run ends by choosing to rather than by being killed. See shared/sync-rotation.mjs.
const ROTATION_BUDGET_MS   = 720_000;

// Yu-Gi-Oh sets are smaller on average than Pokemon's (47,071 cards across 615 sets, about 77
// each, against Pokemon's 135) so the per-set reservation is lower. Still deliberately
// pessimistic against the largest sets rather than set to the average.
const SET_ESTIMATE_MS      = 20_000;

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

// Card Details enrichment: YGOPRODeck (free, no key). Join key = card name.
async function fetchYugiohStats(name) {
  if (!name) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(name)}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    const c = data && Array.isArray(data.data) ? data.data[0] : null;
    if (!c) return null;
    return {
      atk: c.atk ?? null, def: c.def ?? null, level: c.level ?? null,
      attribute: c.attribute ?? null, race: c.race ?? null, type: c.type ?? null
    };
  } catch { clearTimeout(timeout); return null; }
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

  console.log('[sync-yugioh] Starting...');
  const start = Date.now();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('[sync-yugioh] Missing Supabase env vars');
    return new Response('Supabase env vars missing', { status: 500 });
  }
  if (!TCGAPI_KEY) {
    console.error('[sync-yugioh] TCGAPI_KEY not set');
    return new Response('TCGAPI_KEY missing', { status: 500 });
  }

  try {
    const audRate = await getExchangeRate();
    console.log(`[sync-yugioh] AUD rate: ${audRate}`);

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
    console.log(`[sync-yugioh] Found ${allSets.length} sets`);

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
      await supabaseUpsert('yugioh_sets', setRows.slice(i, i + 100));
    }

    // Step 3: Refresh cards + prices, most stale set first, until the budget is spent.
    //
    // yugioh_sync_progress already existed with the right two columns but was never read: it
    // holds 611 rows all stamped 2026-05-15 and nothing has touched it since. It is now the
    // rotation's ordering key, which is what makes a killed or budget-stopped run resume from
    // where it stopped rather than from the top.
    const today = new Date().toISOString().split('T')[0];
    let totalCards = 0;
    // C3L-168: sets whose upsert failed, so the run reports sync_partial rather than a
    // sync_success carrying a row count nothing ever wrote.
    const failedSets = [];
    let totalSnaps = 0;
    let enrichCount = 0;
    let setCount = 0;

    const setProgress = await loadSetProgress({
      table: PROGRESS_TABLE,
      supabaseUrl: SUPABASE_URL,
      serviceKey: SUPABASE_SERVICE_KEY,
      logPrefix: '[sync-yugioh]'
    });
    const rotationOrder = orderSetsByStaleness(allSets, setProgress);

    // Sample mode: manual invocation only, so a scheduled run cannot be silently capped.
    const url = new URL(req.url);
    const maxSetsParam = parseInt(url.searchParams.get('maxSets') ?? '', 10);
    const maxSets = (!isScheduled && Number.isFinite(maxSetsParam) && maxSetsParam > 0)
      ? maxSetsParam
      : rotationOrder.length;
    if (maxSets < rotationOrder.length) {
      console.log(`[sync-yugioh] SAMPLE MODE: limiting to ${maxSets} of ${rotationOrder.length} sets`);
    }

    const oldestStamp = s => (setProgress.has(s.id) ? new Date(setProgress.get(s.id)).toISOString().slice(0, 10) : 'never');
    console.log(`[sync-yugioh] rotation: ${setProgress.size} stamps, order head: ` +
      rotationOrder.slice(0, 3).map(s => `${s.name} (${oldestStamp(s)})`).join(', '));

    const budget = makeBudget(ROTATION_BUDGET_MS);
    let deferredFirst = null;

    for (const set of rotationOrder) {
      // Checked BEFORE the set is started, so no set is begun that cannot be finished and no
      // card write is left half-applied by a kill.
      if (setCount >= maxSets || budget.cannotFit(SET_ESTIMATE_MS)) {
        if (!deferredFirst) deferredFirst = set;
        continue;
      }
      setCount++;

      const setCards = [];
      let cardPage = 1;
      while (cardPage <= MAX_PAGES) {
        const data = await tcgapiGet(`/sets/${set.id}/cards?per_page=100&page=${cardPage}`);
        const cards = data.data || [];
        setCards.push(...cards);
        if (cards.length < 100) break;
        cardPage++;
      }
      // Stamp even an empty set, otherwise it stays permanently at the head of the staleness
      // queue and is retried first every single night while real sets wait behind it.
      if (!setCards.length) {
        await markSetSynced({ table: PROGRESS_TABLE, setId: set.id, supabaseUrl: SUPABASE_URL, serviceKey: SUPABASE_SERVICE_KEY, logPrefix: '[sync-yugioh]' });
        continue;
      }

      // Card Details: existing enrichment for this set (preserve on upsert, skip re-fetch)
      const enrichedMap = new Map();
      for (const r of await supabaseGet(`yugioh_cards?set_id=eq.${set.id}&custom_attributes=not.is.null&select=id,custom_attributes`)) {
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
          console.error(`[sync-yugioh] Bulk price fetch failed for set ${set.id}:`, e.message);
        }
      }

      const cardRows = [];
      const snapRows = [];
      const setAbbr = set.abbreviation || set.slug || String(set.id);
      const cardSlugs = await assignStableSlugs({
        items: setCards,
        baseSlugFor: card => slugify(card.clean_name || card.name, card.number, setAbbr),
        table: 'yugioh_cards',
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
          const stats = await fetchYugiohStats(card.name);
          if (stats) { customAttrs = stats; enrichCount++; }
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
          price_change_7d:   price.price_change_7d || null,
          price_change_30d:  price.price_change_30d || null,
          total_listings:    price.total_listings || null,
          median_price:      price.median_price || null,
          last_price_update: price.last_updated_at || null,
          updated_at:        new Date().toISOString()
        });

        if (marketPrice && marketPrice >= 0.25) {
          snapRows.push({
            card_id:          card.id,
            snapshot_date:    today,
            source:           'sync-yugioh-background',
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
      // they are not independent: yugioh_price_snapshots.card_id is a FOREIGN KEY onto
      // yugioh_cards(id), so a snapshot row is the CHILD of a card row. Racing
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
          await supabaseUpsert('yugioh_cards', chunk);
          cardsWritten += chunk.length;
        }
        results.push({ status: 'fulfilled' });
      } catch (err) {
        results.push({ status: 'rejected', reason: err });
      }
      try {
        for (let i = 0; i < snapRows.length; i += 500) {
          const chunk = snapRows.slice(i, i + 500);
          await supabaseUpsertSnapshots('yugioh_price_snapshots', chunk);
          snapsWritten += chunk.length;
        }
        results.push({ status: 'fulfilled' });
      } catch (err) {
        results.push({ status: 'rejected', reason: err });
      }

      for (const r of results) {
        if (r.status === 'rejected') {
          console.error(`[sync-yugioh] Upsert error for set ${set.name}:`, r.reason?.message);
          failedSets.push(`${set.name}: ${r.reason?.message || 'unknown error'}`);
        }
      }

      // C3L-168: what the database accepted, not what was assembled.
      totalCards += cardsWritten;
      totalSnaps += snapsWritten;
      await markSetSynced({ table: PROGRESS_TABLE, setId: set.id, supabaseUrl: SUPABASE_URL, serviceKey: SUPABASE_SERVICE_KEY, logPrefix: '[sync-yugioh]' });
      console.log(`[sync-yugioh] ${set.name}: ${cardRows.length} cards, ${snapRows.length} snapshots (${budget.elapsedS()}s)`);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    // C3L-134. Without this line a run that covered 248 of 615 sets and a run that was killed
    // after 248 are indistinguishable from outside. summary is null on a complete rotation.
    const summary = rotationSummary({
      refreshed: setCount,
      total: maxSets,
      budgetMs: budget.elapsedMs(),
      oldestRemaining: deferredFirst ? oldestStamp(deferredFirst) : null
    });

    console.log(`[sync-yugioh] Done. ${setCount} sets, ${totalCards} cards, ${totalSnaps} snapshots in ${elapsed}s`);
    if (summary) console.log(`[sync-yugioh] ${summary}`);
    // C3L-168: a lost set makes this sync_partial. The rotation summary is preserved and
    // the failure reasons are appended to it, because both matter and they are different
    // facts: summary says how much of the rotation was covered, failedSets says what broke.
    const failureNote = summariseFailures(failedSets);
    await logSyncEvent(
      failedSets.length ? 'sync_partial' : 'sync_success',
      totalCards,
      [summary, failureNote].filter(Boolean).join(' || ') || null
    );
    return new Response(JSON.stringify({ setsRefreshed: setCount, cards: totalCards, snapshots: totalSnaps, elapsed, rotation: summary }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[sync-yugioh] FATAL:', err.message);
    await logSyncEvent('sync_error', null, err.message);
    return new Response(err.message, { status: 500 });
  }
};

export const config = {
  schedule: "0 0 * * *",
  type: "background"
};
