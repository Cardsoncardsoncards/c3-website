// netlify/functions/sitemap-cards.mjs
// Generates a dynamic XML sitemap for individual MTG card pages
// Phase 1: Only cards with price_usd >= 2.00 (~8,000-12,000 cards)
// After 60 days of indexation data, raise PRICE_THRESHOLD to 0 to include all 96k cards
//
// This endpoint is referenced by sitemap-index.xml as /api/sitemap-cards
// Google caps individual sitemaps at 50,000 URLs — we stay well under that

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const SITE_URL          = 'https://cardsoncardsoncards.com.au';

const PRICE_THRESHOLD = 2.0;
const PAGE_SIZE = 5000;

async function fetchCardSlugs(offset = 0) {
  const query = [
    `mtg_cards`,
    `?select=slug,price_usd,updated_at`,
    `&price_usd=gte.${PRICE_THRESHOLD}`,
    `&slug=not.is.null`,
    `&order=price_usd.desc`,
    `&limit=${PAGE_SIZE}`,
    `&offset=${offset}`
  ].join('');

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
  });

  if (!res.ok) {
    console.error('Supabase error:', res.status);
    return [];
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export const handler = async (req) => {
  const headers = {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=86400',
    'X-Robots-Tag': 'noindex'
  };

  try {
    let allCards = [];
    let offset = 0;
    let batch;

    do {
      batch = await fetchCardSlugs(offset);
      allCards = allCards.concat(batch);
      offset += PAGE_SIZE;
      if (allCards.length >= 49000) break;
    } while (batch.length === PAGE_SIZE);

    console.log(`sitemap-cards: generating ${allCards.length} card URLs (threshold: USD$${PRICE_THRESHOLD}+)`);

    const today = new Date().toISOString().slice(0, 10);

    const urls = allCards
      .filter(c => c.slug && c.slug.trim() !== '')
      .map(c => {
        const lastmod = c.updated_at ? c.updated_at.slice(0, 10) : today;
        const price = parseFloat(c.price_usd) || 0;
        const priority = price >= 20 ? '0.9' : price >= 5 ? '0.8' : '0.7';
        return `  <url>
    <loc>${SITE_URL}/cards/mtg/${c.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${priority}</priority>
  </url>`;
      })
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- MTG card pages: ${allCards.length} cards with price >= USD$${PRICE_THRESHOLD} -->
  <!-- Generated: ${new Date().toISOString()} -->
  <!-- To expand to all 96k cards: change PRICE_THRESHOLD to 0 in sitemap-cards.mjs -->
${urls}
</urlset>`;

    return new Response(xml, { status: 200, headers });

  } catch (err) {
    console.error('sitemap-cards error:', err.message);
    const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Error generating card sitemap: ${err.message} -->
</urlset>`;
    return new Response(fallback, { status: 200, headers });
  }
};

export const config = {
  path: '/api/sitemap-cards'
};