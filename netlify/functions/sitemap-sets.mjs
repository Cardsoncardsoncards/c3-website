// netlify/functions/sitemap-sets.mjs
// Sitemap for every game's SET pages, /cards/<game>/sets/<slug>.
// Registered in sitemap-index.xml as /api/sitemap-sets.
//
// Task-83 found these had ZERO sitemap coverage: 2,370 live, indexable pages across 31
// games that Google was never told about. The card sitemaps only ever covered card pages,
// and sitemap-static only covers the game hubs.
//
// One combined file rather than 31 per-game ones: the whole set is ~2,400 URLs, under 5% of
// Google's 50,000-per-sitemap limit, so splitting would add 31 routes for no benefit.
//
// Eligibility: a set is included when it has a slug. Confirmed against live data that every
// one of the 2,370 sets with a slug also has card_count > 0, so there are no empty/thin set
// pages to exclude today. The card_count > 0 condition is still applied explicitly, so an
// unreleased set that lands with zero cards is not submitted.
//
// MTG is deliberately absent: mtg_sets has no slug column and there is no MTG set-page
// route (/cards/mtg/sets/* 404s), so it has no set pages to submit.

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const SITE_URL          = 'https://cardsoncardsoncards.com.au';
const PAGE_SIZE         = 1000;
const SAFETY_MAX        = 50000; // sitemaps.org hard limit, split before exceeding, never silently cap

// Every game with a *-set-page.mjs route. MTG has none, see header.
const GAMES = [
  'alphaclash', 'bakugan', 'battlespiritssaga', 'buddyfight', 'dbsfusionworld', 'digimon',
  'dragonball', 'dragonballz', 'finalfantasy', 'forceofwill', 'gateruler', 'godzilla',
  'grandarchive', 'gundam', 'hololive', 'lorcana', 'metazoo', 'onepiece', 'pokemon',
  'riftbound', 'shadowverse', 'sorcery', 'starwars', 'unionarena', 'universus', 'vanguard',
  'warhammer', 'weissschwarz', 'wixoss', 'wow', 'yugioh'
];

async function supabaseFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// Keyset pagination on the primary key. A failed page THROWS rather than returning [], so a
// partial Supabase failure cannot silently truncate the sitemap and de-index real pages.
async function fetchSets(game, afterId) {
  const url = `${SUPABASE_URL}/rest/v1/${game}_sets`
    + `?select=id,slug,card_count,updated_at`
    + `&slug=not.is.null`
    + `&card_count=gt.0`
    + (afterId != null ? `&id=gt.${afterId}` : ``)
    + `&order=id.asc`
    + `&limit=${PAGE_SIZE}`;
  const res = await supabaseFetch(url);
  if (!res.ok) throw new Error(`${game}_sets fetch failed: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(`${game}_sets returned a non-array payload`);
  return data;
}

export default async () => {
  const headers = {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=86400',
    'Netlify-CDN-Cache-Control': 'public, max-age=86400,durable'
  };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- Error: missing env vars --></urlset>',
      { status: 200, headers }
    );
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const urls = [];
    const seen = new Set();

    for (const game of GAMES) {
      let lastId = null;
      while (urls.length < SAFETY_MAX) {
        const batch = await fetchSets(game, lastId);
        for (const s of batch) {
          if (!s.slug || !String(s.slug).trim()) continue;
          const loc = `${SITE_URL}/cards/${game}/sets/${s.slug}`;
          if (seen.has(loc)) continue;   // never submit the same URL twice
          seen.add(loc);
          const lastmod = s.updated_at ? s.updated_at.slice(0, 10) : today;
          urls.push(
            `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`
          );
        }
        if (batch.length < PAGE_SIZE) break;
        lastId = batch[batch.length - 1].id;
      }
    }

    if (urls.length >= SAFETY_MAX) {
      // A single sitemap may not exceed 50,000 URLs. Fail loud rather than silently capping.
      throw new Error(`exceeded ${SAFETY_MAX} URLs, sitemap must be split`);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Set pages across ${GAMES.length} games: ${urls.length} sets -->
  <!-- Generated: ${new Date().toISOString()} -->
${urls.join('\n')}
</urlset>`;

    return new Response(xml, { status: 200, headers });

  } catch (err) {
    console.error('[sitemap-sets] error:', err.message);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- Error: ${err.message} --></urlset>`,
      { status: 500, headers } // fail loud: Google keeps the last good sitemap instead of caching a partial one
    );
  }
};

export const config = { path: '/api/sitemap-sets' };
