// netlify/functions/sitemap-onepiece.mjs
// Generates XML sitemap for onepiece card pages at /cards/onepiece/[slug]
// Registered in sitemap-index.xml as /api/sitemap-onepiece
// Fixed: AbortController on all fetches, correct price column (price_aud)

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const SITE_URL          = 'https://cardsoncardsoncards.com.au';
const PRICE_THRESHOLD   = 1.00;
const PAGE_SIZE         = 1000;
const SAFETY_MAX        = 50000; // sitemaps.org hard limit, fail loud rather than silently cap

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

async function fetchSlugs(afterId) {
  const url = `${SUPABASE_URL}/rest/v1/onepiece_cards`
    + `?select=id,slug,price_aud,updated_at`
    + `&price_aud=gte.${PRICE_THRESHOLD}`
    + `&slug=not.is.null`
    + `&order=id.asc`
    + `&limit=${PAGE_SIZE}`
    + (afterId != null ? `&id=gt.${afterId}` : ``);
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
    // Keyset pagination: fetch pages until a short batch signals the end.
    // No count query (count=exact forces a full scan and 504s under anon).
    const allCards = [];
    let lastId = null;
    while (allCards.length < SAFETY_MAX) {
      const batch = await fetchSlugs(lastId);
      allCards.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      lastId = batch[batch.length - 1].id;
    }
    if (allCards.length >= SAFETY_MAX) {
      throw new Error(`exceeded ${SAFETY_MAX} URLs, sitemap must be split`);
    }

    const today = new Date().toISOString().slice(0, 10);
    const urls = allCards
      .filter(c => c.slug && c.slug.trim() !== '')
      .map(c => {
        const lastmod = c.updated_at ? c.updated_at.slice(0, 10) : today;
        const price = parseFloat(c.price_aud) || 0;
        const priority = price >= 20 ? '0.9' : price >= 5 ? '0.8' : '0.7';
        return `  <url>\n    <loc>${SITE_URL}/cards/onepiece/${c.slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
      })
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- onepiece card pages: ${allCards.length} cards with price >= AU${PRICE_THRESHOLD} -->
  <!-- Generated: ${new Date().toISOString()} -->
${urls}
</urlset>`;

    return new Response(xml, { status: 200, headers });

  } catch (err) {
    console.error('[sitemap-onepiece] error:', err.message);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- Error: ${err.message} --></urlset>`,
      { status: 200, headers }
    );
  }
};

export const config = { path: '/api/sitemap-onepiece' };
