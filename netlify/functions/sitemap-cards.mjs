// netlify/functions/sitemap-cards.mjs
// Generates a dynamic XML sitemap for individual MTG card pages
// Phase 1: Only cards with price_usd >= 2.00 (~24,000 cards confirmed via Supabase)
// After 60 days of indexation data, raise PRICE_THRESHOLD to 0 to include all 96k cards
//
// This endpoint is referenced by sitemap-index.xml as /api/sitemap-cards
// Google caps individual sitemaps at 50,000 URLs — we stay well under that

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const SITE_URL          = 'https://cardsoncardsoncards.com.au';

const PRICE_THRESHOLD = 2.0;
const PAGE_SIZE = 1000; // Supabase REST enforced max per request

async function fetchCardSlugs(offset = 0) {
  const url = `${SUPABASE_URL}/rest/v1/mtg_cards`
    + `?select=slug,price_usd,updated_at`
    + `&price_usd=gte.${PRICE_THRESHOLD}`
    + `&slug=not.is.null`
    + `&order=price_usd.desc`
    + `&limit=${PAGE_SIZE}`
    + `&offset=${offset}`;

  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Prefer': 'return=representation'
    }
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[sitemap-cards] Supabase error:', res.status, body.slice(0, 300));
    return [];
  }

  const data = await res.json();
  const count = Array.isArray(data) ? data.length : 0;
  console.log(`[sitemap-cards] offset ${offset} returned ${count} rows`);
  return Array.isArray(data) ? data : [];
}

export default async (req) => {
  const headers = {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=86400',
    'X-Robots-Tag': 'noindex'
  };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[sitemap-cards] missing env vars');
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- Error: missing env vars --></urlset>',
      { status: 200, headers }
    );
  }

  try {
    // Step 1: get exact count — no Range headers, just Prefer: count=exact
    const countRes = await fetch(
      `${SUPABASE_URL}/rest/v1/mtg_cards?select=id&price_usd=gte.${PRICE_THRESHOLD}&slug=not.is.null&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'count=exact'
        }
      }
    );
    const contentRange = countRes.headers.get('content-range');
    console.log('[sitemap-cards] content-range:', contentRange);

    // content-range format: "0-0/24040" — extract total after the slash
    const totalCount = (contentRange && contentRange.includes('/'))
      ? parseInt(contentRange.split('/')[1], 10)
      : 25000; // safe fallback slightly above actual count

    console.log(`[sitemap-cards] total cards to fetch: ${totalCount}`);

    // Step 2: fetch pages sequentially — avoids hammering Supabase in parallel
    const allCards = [];
    for (let offset = 0; offset < totalCount; offset += PAGE_SIZE) {
      const batch = await fetchCardSlugs(offset);
      allCards.push(...batch);
      if (batch.length < PAGE_SIZE) break; // reached last page early
    }

    console.log(`[sitemap-cards] fetched ${allCards.length} total cards`);

    const today = new Date().toISOString().slice(0, 10);
    const urls = allCards
      .filter(c => c.slug && c.slug.trim() !== '')
      .map(c => {
        const lastmod = c.updated_at ? c.updated_at.slice(0, 10) : today;
        const price = parseFloat(c.price_usd) || 0;
        const priority = price >= 20 ? '0.9' : price >= 5 ? '0.8' : '0.7';
        return `  <url>\n    <loc>${SITE_URL}/cards/mtg/${c.slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
      })
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- MTG card pages: ${allCards.length} cards with price >= USD$${PRICE_THRESHOLD} -->
  <!-- Generated: ${new Date().toISOString()} -->
${urls}
</urlset>`;

    return new Response(xml, { status: 200, headers });

  } catch (err) {
    console.error('[sitemap-cards] error:', err.message);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- Error: ' + err.message + ' --></urlset>',
      { status: 200, headers }
    );
  }
};

export const config = {
  path: '/api/sitemap-cards'
};
