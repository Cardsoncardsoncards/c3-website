// netlify/functions/sync-pokemon-enrichment-background.mjs
// C3L-61. Backfills pokemon card enrichment: hp, stage, types, attacks, weaknesses,
// retreat_cost. Runs on its own schedule, separate from the price sync, and deliberately so.
//
// WHY THIS EXISTS AS ITS OWN FUNCTION
// sync-pokemon-background.mjs gates card writes on isNewSet. pokemon_sync_progress holds 235
// rows against 235 sets, so that gate has been closed for every set without exception, and all
// six enrichment columns are empty across all 31,833 rows. The gate is not a bug: it exists to
// hold that sync inside Netlify's 15 minute ceiling, and its runs already measure 2.0 to 11.9
// minutes doing NO card writes at all. Adding a 31,833 row backfill to a job with roughly three
// minutes of headroom is how yugioh became C3L-57, a sync that starts three times a night and
// has never once finished. A separate function gets its own 15 minute budget.
//
// This is user-visible, not housekeeping. pokemon-card-page.mjs renders an HP bar, a Weakness
// box and a Retreat Cost box, each behind a truthiness check, so all three are silently absent
// on every pokemon card page today while prices display normally.
//
// HOW THE BATCH IS BOUNDED, and why it is bounded by TIME rather than by a set count
// The task asked for a measured batch size rather than a guess. The measurement was done and it
// refused to give a clean answer, which is itself the finding: the run that wrote 1,776 cards
// across 16 sets on 29 July took 11.96 minutes, while runs writing ZERO cards took 2.06, 6.83,
// 7.25 and 11.93. The baseline varies by ten minutes on its own, driven by upstream latency, so
// subtracting it cannot isolate a per-set cost. Any "N sets per run" derived from that data
// would be a guess wearing a measurement's clothes.
// So the primary bound is a wall clock budget, checked before each set is started. That is
// self-correcting in a way a fixed N is not: a set of 400 cards and a set of 20 cost different
// amounts, and upstream latency varies by the hour. MAX_SETS_PER_RUN is a second, independent
// bound so that a failure of the timing logic still cannot produce an unbounded run.
// Every set's real duration is logged, so after a few runs the actual per-set cost is known
// from data rather than estimated, and these numbers can be revisited on evidence.

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const POKEMONTCG_API_KEY   = Netlify.env.get('POKEMONTCG_API_KEY');
const GAME_SLUG            = 'pokemon-enrichment';

// 5 minutes of work against a 15 minute ceiling, so a 3x margin rather than a tight fit.
// Checked BEFORE a set is started, never during, so the worst case overrun is one set.
const TIME_BUDGET_MS    = 5 * 60 * 1000;
// Second, independent bound. Even if the clock check were wrong, a run cannot exceed this.
const MAX_SETS_PER_RUN  = 10;

export const config = { schedule: '40 */6 * * *' };

function derivePokemonStage(supertype, subtypes) {
  const subs = Array.isArray(subtypes) ? subtypes : [];
  const STAGE_WORDS = ['basic', 'stage 1', 'stage 2', 'stage 3', 'baby', 'mega', 'restored',
    'vmax', 'vstar', 'v-union', 'break', 'level-up'];
  const found = subs.find(s => STAGE_WORDS.includes(String(s || '').toLowerCase()));
  if (found) return found;
  if (supertype && supertype !== 'Pokemon' && supertype !== 'Pokémon') return supertype;
  return subs[0] || null;
}

const sbHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json'
};

async function sbFetch(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: { ...sbHeaders, ...(options.headers || {}) },
      signal: controller.signal
    });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// Same audit trail every other sync writes, so this backfill is visible to C3L-51's health
// check rather than being a silent background process. Its own game key keeps it separate from
// the price sync's stream, and the hyphen means the health check's game discovery regex does
// not mistake it for a 33rd game needing its own price table.
async function logSyncEvent(eventType, rowsAffected = null, errorMessage = null) {
  try {
    await sbFetch('sync_events', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify([{
        event_type: eventType, game: GAME_SLUG,
        rows_affected: rowsAffected, error_message: errorMessage
      }])
    });
  } catch (e) {
    console.warn(`[${GAME_SLUG}] sync_events log failed: ${e.message}`);
  }
}

async function buildPokemonTCGSetMap() {
  const map = new Map();
  if (!POKEMONTCG_API_KEY) return map;
  let page = 1;
  while (page <= 20) {
    const res = await fetch(`https://api.pokemontcg.io/v2/sets?page=${page}&pageSize=250`, {
      headers: { 'X-Api-Key': POKEMONTCG_API_KEY }
    });
    if (!res.ok) break;
    const data = await res.json();
    const sets = data.data || [];
    for (const s of sets) {
      if (s.name) map.set(s.name.toLowerCase().trim(), s.id);
      if (s.ptcgoCode) map.set(s.ptcgoCode.toLowerCase().trim(), s.id);
    }
    if (sets.length < 250) break;
    page++;
  }
  return map;
}

// Only the six enrichment fields are read here. The price fields the same endpoint returns are
// deliberately ignored: the price sync already writes those daily and this job must not become
// a second writer of prices, which is the C3L-54 mistake.
async function fetchStatsForSet(ptcgSetId) {
  const stats = new Map();
  let page = 1;
  while (page <= 20) {
    const res = await fetch(
      `https://api.pokemontcg.io/v2/cards?q=set.id:${encodeURIComponent(ptcgSetId)}&page=${page}&pageSize=250&select=name,number,hp,types,attacks,weaknesses,retreatCost,supertype,subtypes`,
      { headers: { 'X-Api-Key': POKEMONTCG_API_KEY } }
    );
    if (!res.ok) throw new Error(`pokemontcg.io ${res.status} for set ${ptcgSetId}`);
    const data = await res.json();
    const cards = data.data || [];
    for (const c of cards) {
      const key = `${(c.name || '').toLowerCase().trim()}|${(c.number || '').toLowerCase().trim()}`;
      stats.set(key, {
        hp:           c.hp ?? null,
        stage:        derivePokemonStage(c.supertype, c.subtypes),
        types:        Array.isArray(c.types) ? c.types : null,
        attacks:      Array.isArray(c.attacks) ? c.attacks : null,
        weaknesses:   Array.isArray(c.weaknesses) ? c.weaknesses : null,
        retreat_cost: Array.isArray(c.retreatCost) ? c.retreatCost.length : null
      });
    }
    if (cards.length < 250) break;
    page++;
  }
  return stats;
}

export default async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('FATAL: SUPABASE_URL and SUPABASE_SERVICE_KEY are required.');
    return new Response('missing supabase config', { status: 500 });
  }
  if (!POKEMONTCG_API_KEY) {
    // Fails loudly rather than looping quietly doing nothing, which is the C3L-53 shape.
    await logSyncEvent('sync_error', null, 'POKEMONTCG_API_KEY not set, cannot backfill');
    console.error('FATAL: POKEMONTCG_API_KEY is required.');
    return new Response('missing pokemontcg key', { status: 500 });
  }

  const startedAt = Date.now();
  await logSyncEvent('sync_start');
  let setsDone = 0;
  let cardsUpdated = 0;

  try {
    // Least-recently-backfilled first, and never-backfilled sorts first because the left join
    // leaves backfilled_at null. Once all 235 are done this keeps rotating oldest first, so the
    // job converges and then becomes a rolling refresh rather than stopping and letting the
    // data age out again.
    const setsRes = await sbFetch('pokemon_sets?select=id,name,abbreviation&order=id.asc&limit=1000');
    if (!setsRes.ok) throw new Error(`pokemon_sets read failed ${setsRes.status}`);
    const allSets = await setsRes.json();

    const progRes = await sbFetch('pokemon_enrichment_progress?select=set_id,backfilled_at&limit=1000');
    if (!progRes.ok) throw new Error(`progress read failed ${progRes.status}`);
    const progress = new Map((await progRes.json()).map(r => [r.set_id, r.backfilled_at]));

    const queue = allSets
      .map(s => ({ ...s, done: progress.get(s.id) || null }))
      .sort((a, b) => {
        if (a.done === null && b.done !== null) return -1;
        if (b.done === null && a.done !== null) return 1;
        if (a.done === null && b.done === null) return a.id - b.id;
        return a.done < b.done ? -1 : a.done > b.done ? 1 : 0;
      });

    const remaining = queue.filter(s => s.done === null).length;
    console.log(`[${GAME_SLUG}] ${allSets.length} sets total, ${remaining} never backfilled`);

    const setMap = await buildPokemonTCGSetMap();

    for (const set of queue) {
      if (setsDone >= MAX_SETS_PER_RUN) {
        console.log(`[${GAME_SLUG}] set cap reached (${MAX_SETS_PER_RUN}), stopping cleanly`);
        break;
      }
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        console.log(`[${GAME_SLUG}] time budget spent, stopping cleanly before starting another set`);
        break;
      }

      const setStart = Date.now();
      const ptcgSetId = setMap.get((set.name || '').toLowerCase().trim())
        || setMap.get((set.abbreviation || '').toLowerCase().trim())
        || null;

      if (!ptcgSetId) {
        // Recorded as done so the queue advances. A set with no pokemontcg.io counterpart will
        // never gain stats, and retrying it forever would starve sets that can.
        await sbFetch('pokemon_enrichment_progress', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify([{ set_id: set.id, cards_updated: 0, ptcg_set_id: null,
            backfilled_at: new Date().toISOString() }])
        });
        setsDone++;
        console.log(`[${GAME_SLUG}] set ${set.id} "${set.name}": no pokemontcg.io match, skipped`);
        continue;
      }

      const stats = await fetchStatsForSet(ptcgSetId);

      const cardsRes = await sbFetch(
        `pokemon_cards?set_id=eq.${set.id}&select=id,name,clean_name,number&limit=2000`);
      if (!cardsRes.ok) throw new Error(`cards read failed ${cardsRes.status} for set ${set.id}`);
      const cards = await cardsRes.json();

      const rows = [];
      for (const card of cards) {
        const key = `${(card.clean_name || card.name || '').toLowerCase().trim()}|${(card.number || '').toLowerCase().trim()}`;
        const st = stats.get(key);
        if (!st) continue;
        // id and name are the only NOT NULL columns, so a partial upsert is safe and touches
        // nothing the price sync owns. Prices, slugs and set linkage are all left alone.
        rows.push({
          id: card.id,
          name: card.name,
          hp: st.hp, stage: st.stage, types: st.types,
          attacks: st.attacks, weaknesses: st.weaknesses, retreat_cost: st.retreat_cost,
          updated_at: new Date().toISOString()
        });
      }

      for (let i = 0; i < rows.length; i += 200) {
        const up = await sbFetch('pokemon_cards', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(rows.slice(i, i + 200))
        });
        if (!up.ok) throw new Error(`card upsert failed ${up.status}: ${(await up.text()).slice(0,200)}`);
      }

      // Progress is recorded only AFTER the writes land. An interrupted run therefore loses at
      // most the set in flight, which is simply picked up again next time, and the upserts are
      // keyed on the primary key so redoing one duplicates nothing.
      await sbFetch('pokemon_enrichment_progress', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{ set_id: set.id, cards_updated: rows.length,
          ptcg_set_id: ptcgSetId, backfilled_at: new Date().toISOString() }])
      });

      setsDone++;
      cardsUpdated += rows.length;
      console.log(`[${GAME_SLUG}] set ${set.id} "${set.name}": ${rows.length}/${cards.length} cards enriched in ${((Date.now()-setStart)/1000).toFixed(1)}s`);
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[${GAME_SLUG}] done: ${setsDone} sets, ${cardsUpdated} cards, ${elapsed}s`);
    await logSyncEvent('sync_success', cardsUpdated);
    return new Response(JSON.stringify({ sets: setsDone, cards: cardsUpdated, seconds: elapsed }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error(`[${GAME_SLUG}] failed after ${setsDone} sets:`, err.message);
    await logSyncEvent('sync_error', cardsUpdated, err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
