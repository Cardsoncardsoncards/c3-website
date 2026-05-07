// netlify/functions/sitemap-lorcana.mjs
// Generates XML sitemap for Lorcana card pages at /cards/lorcana/[slug]
// Registered in sitemap-index.xml as /api/sitemap-lorcana

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const SITE_URL          = 'https://cardsoncardsoncards.com.au';
const PRICE_THRESHOLD   = 1.0;
const PAGE_SIZE         = 1000;

async function fetchSlugs(offset = 0) {
  const url = `${SUPABASE_URL}/rest/v1/lorcana_cards`
    + `?select=slug,price_usd,updated_at`
    + `&price_usd=gte.${PRICE_THRESHOLD}`
    + `&slug=not.is.null`
    + `&order=price_usd.desc`
    + `&limit=${PAGE_SIZE}`
    + `&offset=${offset}`;
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=representation'
      }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

export default async (req) => {
  const headers = {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=86400',
    'X-Robots-Tag': 'noindex'
  };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- Error: missing env vars --></urlset>',
      { status: 200, headers }
    );
  }

  try {
    const countRes = await fetch(
      `${SUPABASE_URL}/rest/v1/lorcana_cards?select=id&price_usd=gte.${PRICE_THRESHOLD}&slug=not.is.null&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'count=exact'
        }
      }
    );
    const contentRange = countRes.headers.get('content-range');
    const totalCount = (contentRange && contentRange.includes('/'))
      ? parseInt(contentRange.split('/')[1], 10) : 0;

    if (totalCount === 0) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<!-- Lorcana card pages: pending sync -->\n</urlset>`,
        { status: 200, headers }
      );
    }

    const allCards = [];
    for (let offset = 0; offset < totalCount; offset += PAGE_SIZE) {
      const batch = await fetchSlugs(offset);
      allCards.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }

    const today = new Date().toISOString().slice(0, 10);
    const urls = allCards
      .filter(c => c.slug && c.slug.trim() !== '')
      .map(c => {
        const lastmod = c.updated_at ? c.updated_at.slice(0, 10) : today;
        const price = parseFloat(c.price_usd) || 0;
        const priority = price >= 20 ? '0.9' : price >= 5 ? '0.8' : '0.7';
        return `  <url>\n    <loc>${SITE_URL}/cards/lorcana/${c.slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
      })
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Lorcana card pages: ${allCards.length} cards with price >= USD$${PRICE_THRESHOLD} -->
  <!-- Generated: ${new Date().toISOString()} -->
${urls}
</urlset>`;

    return new Response(xml, { status: 200, headers });

  } catch (err) {
    console.error('[sitemap-lorcana] error:', err.message);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- Error: ${err.message} --></urlset>`,
      { status: 200, headers }
    );
  }
};

export const config = { path: '/api/sitemap-lorcana' };
