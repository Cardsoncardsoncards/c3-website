// shop-products.mjs
// Netlify function -- serves /shop-data as JSON
// Reads amazon_products from Supabase grouped by game
// Called by shop.html on page load to populate all product tiles
// Cache: 1 hour (prices update nightly at 02:00 UTC)

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');

async function supabaseGet(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      signal: controller.signal,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    clearTimeout(timer);
    return [];
  }
}

export default async (req) => {
  const rows = await supabaseGet(
    'amazon_products?is_active=eq.true' +
    '&select=asin,game,product_name,item_type,image_url,current_price_aud,affiliate_url,priority' +
    '&order=priority.asc' +
    '&limit=500'
  );

  const grouped = {};
  for (const row of rows) {
    const g = row.game || 'other';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(row);
  }

  return new Response(JSON.stringify({ ok: true, grouped }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      'Access-Control-Allow-Origin': '*'
    }
  });
};

export const config = { path: '/shop-data' };
