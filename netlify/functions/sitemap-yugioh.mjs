// netlify/functions/sitemap-yugioh.mjs
// Generates XML sitemap for yugioh card pages at /cards/yugioh/[slug]
// Registered in sitemap-index.xml as /api/sitemap-yugioh
// Fixed: AbortController on all fetches, correct price column (market_price)

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const SITE_URL          = 'https://cardsoncardsoncards.com.au';
const PRICE_THRESHOLD   = 1.0;
const PAGE_SIZE         = 1000;
const MAX_CARDS         = 10000;

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

async function fetchSlugs(offset = 0) {
  const url = `${SUPABASE_URL}/rest/v1/yugioh_cards`
    + `?select=slug,market_price,updated_at`
    + `&market_price=gte.${PRICE_THRESHOLD}`
    + `&slug=not.is.null`
    + `&order=market_price.desc.nullslast`
    + `&limit=${PAGE_SIZE}`
    + `&offset=${offset}`;
  try {
    const res = await supabaseFetch(url, { 'Prefer': 'return=representation' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

export default async (req) => {
  const headers = {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=86400',
  };

  const empty = (msg) => new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<!-- ${msg} -->\n</urlset>`,
    { status: 200, headers }
  );

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return empty('Error: missing env vars');

  try {
    const allCards = [];
    let offset = 0;
    while (offset < MAX_CARDS) {
      const batch = await fetchSlugs(offset);
      allCards.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    const today = new Date().toISOString().slice(0, 10);
    const urls = allCards
      .filter(c => c.slug && c.slug.trim() !== '')
      .map(c => {
        const lastmod = c.updated_at ? c.updated_at.slice(0, 10) : today;
        const price = parseFloat(c.market_price) || 0;
        const priority = price >= 20 ? '0.9' : price >= 5 ? '0.8' : '0.7';
        return `  <url>\n    <loc>${SITE_URL}/cards/yugioh/${c.slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
      })
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- yugioh card pages: ${allCards.length} cards with price >= ${PRICE_THRESHOLD} -->
  <!-- Generated: ${new Date().toISOString()} -->
${urls}
</urlset>`;

    return new Response(xml, { status: 200, headers });

  } catch (err) {
    console.error('[sitemap-yugioh] error:', err.message);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- Error: ${err.message} --></urlset>`,
      { status: 200, headers }
    );
  }
};

export const config = { path: '/api/sitemap-yugioh' };
