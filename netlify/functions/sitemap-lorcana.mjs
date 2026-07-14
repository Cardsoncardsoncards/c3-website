// netlify/functions/sitemap-lorcana.mjs
// Generates XML sitemap for lorcana card pages at /cards/lorcana/[slug]
// Registered in sitemap-index.xml as /api/sitemap-lorcana
// Fixed: AbortController on all fetches, correct price column (price_aud)

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const SITE_URL          = 'https://cardsoncardsoncards.com.au';
const PRICE_THRESHOLD   = 1.00;
const PAGE_SIZE         = 1000;
const SAFETY_MAX        = 50000; // sitemaps.org hard limit, split before exceeding, never silently cap

async function supabaseFetch(url, extraHeaders = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        ...extraHeaders
      }
    });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// Keyset pagination on the primary key: each page fetches rows with id greater
// than the last seen. Unlike OFFSET this stays O(n) as the table grows and never
// re-scans. A failed page THROWS (caught below) instead of returning [], because a
// swallowed error would silently truncate the sitemap and de-index real pages.
async function fetchSlugs(afterId) {
  const url = `${SUPABASE_URL}/rest/v1/lorcana_cards`
    + `?select=id,slug,price_aud,updated_at`
    + `&price_aud=gte.${PRICE_THRESHOLD}`
    + `&slug=not.is.null`
    + (afterId != null ? `&id=gt.${afterId}` : ``)
    + `&order=id.asc`
    + `&limit=${PAGE_SIZE}`;
  const res = await supabaseFetch(url, { 'Prefer': 'return=representation' });
  if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Supabase returned a non-array payload');
  return data;
}

export default async (req) => {
  const headers = {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=86400', 'Netlify-CDN-Cache-Control': 'public, max-age=86400,durable',
  };

  const empty = (msg) => new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<!-- ${msg} -->\n</urlset>`,
    { status: 200, headers }
  );

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return empty('Error: missing env vars');

  try {
    const allCards = [];
    let lastId = null;
    while (allCards.length < SAFETY_MAX) {
      const batch = await fetchSlugs(lastId);
      allCards.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      lastId = batch[batch.length - 1].id;
    }
    if (allCards.length >= SAFETY_MAX) {
      // A single sitemap may not exceed 50,000 URLs. If this ever trips, the
      // file must be split into indexed sub-sitemaps. Fail loud, never cap.
      throw new Error(`exceeded ${SAFETY_MAX} URLs, sitemap must be split`);
    }

    const today = new Date().toISOString().slice(0, 10);
    const urls = allCards
      .filter(c => c.slug && c.slug.trim() !== '')
      .map(c => {
        const lastmod = c.updated_at ? c.updated_at.slice(0, 10) : today;
        const price = parseFloat(c.price_aud) || 0;
        const priority = price >= 20 ? '0.9' : price >= 5 ? '0.8' : '0.7';
        return `  <url>\n    <loc>${SITE_URL}/cards/lorcana/${c.slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
      })
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- lorcana card pages: ${allCards.length} cards with price >= ${PRICE_THRESHOLD} -->
  <!-- Generated: ${new Date().toISOString()} -->
${urls}
</urlset>`;

    return new Response(xml, { status: 200, headers });

  } catch (err) {
    console.error('[sitemap-lorcana] error:', err.message);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- Error: ${err.message} --></urlset>`,
      { status: 500, headers } // fail loud: Google keeps the last good sitemap instead of caching a partial one
    );
  }
};

export const config = { path: '/api/sitemap-lorcana' };
