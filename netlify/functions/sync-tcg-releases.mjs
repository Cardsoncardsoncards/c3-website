// netlify/functions/sync-tcg-releases.mjs
// Daily aggregation -- schedule: 30 2 * * * UTC
// Collects upcoming (release_date >= today) sets from every {game}_sets table and
// upserts them into tcg_releases. Conflict target is the unique key (game, slug, product_type).
// Read-only against the source _sets tables; writes only to tcg_releases.

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const SYNC_SECRET          = Netlify.env.get('SYNC_SECRET');

// game key -> source table. All tables expose release_date, name, slug and card_count,
// except mtg_sets which stores its slug in set_slug.
const GAMES = [
  'alphaclash', 'bakugan', 'battlespiritssaga', 'buddyfight', 'dbsfusionworld', 'digimon',
  'dragonball', 'dragonballz', 'finalfantasy', 'forceofwill', 'gateruler', 'godzilla',
  'grandarchive', 'gundam', 'hololive', 'lorcana', 'metazoo', 'onepiece', 'pokemon',
  'riftbound', 'shadowverse', 'sorcery', 'starwars', 'unionarena', 'universus', 'vanguard',
  'warhammer', 'weissschwarz', 'wixoss', 'wow', 'yugioh'
].map(g => ({ game: g, table: `${g}_sets`, slugField: 'slug', nameField: 'name' }));
GAMES.push({ game: 'mtg', table: 'mtg_sets', slugField: 'set_slug', nameField: 'name' });

async function supabaseGet(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      signal: controller.signal,
      headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`GET ${path} failed ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) { clearTimeout(timer); throw e; }
}

async function upsertReleases(rows) {
  if (!rows.length) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    // Manual query string (never URLSearchParams: PostgREST needs literal commas here).
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tcg_releases?on_conflict=game,slug,product_type`, {
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
    clearTimeout(timer);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`upsert tcg_releases failed ${res.status}: ${err.slice(0, 300)}`);
    }
  } catch (e) { clearTimeout(timer); throw e; }
}

export default async (req) => {
  // Auth: accept scheduled trigger OR POST with the correct sync secret.
  const isScheduled = !req.headers.get('x-sync-secret') &&
                      !req.headers.get('origin') &&
                      !req.headers.get('referer');
  if (!isScheduled && req.headers.get('x-sync-secret') !== SYNC_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response('Supabase env vars missing', { status: 500 });
  }

  const today  = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  const perGame = {};

  const results = await Promise.allSettled(GAMES.map(async (g) => {
    const path = `${g.table}?release_date=gte.${today}`
      + `&select=${g.nameField},${g.slugField},release_date,card_count`
      + `&order=release_date.asc`;
    const sets = await supabaseGet(path);
    const rows = [];
    for (const s of sets) {
      const setName = s[g.nameField];
      const slug    = s[g.slugField];
      if (!setName || !slug || !s.release_date) continue; // respect NOT NULL columns
      rows.push({
        game:         g.game,
        set_name:     setName,
        slug:         slug,
        product_type: 'other', // set-level release; tcg_releases.product_type CHECK allows 'other' as the generic

        release_date: s.release_date,
        is_confirmed: true,
        updated_at:   nowIso
      });
    }
    perGame[g.game] = rows.length;
    return rows;
  }));

  const allRows = [];
  for (const r of results) {
    if (r.status === 'fulfilled') allRows.push(...r.value);
    else console.error('[sync-tcg-releases] game fetch failed:', r.reason && r.reason.message);
  }

  try {
    for (let i = 0; i < allRows.length; i += 200) {
      await upsertReleases(allRows.slice(i, i + 200));
    }
  } catch (e) {
    console.error('[sync-tcg-releases] upsert error:', e.message);
    return new Response(e.message, { status: 500 });
  }

  console.log(`[sync-tcg-releases] upserted ${allRows.length} upcoming releases across ${GAMES.length} games`);
  return new Response(JSON.stringify({ upserted: allRows.length, perGame }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const config = {
  schedule: "30 2 * * *",
  type: "background"
};
