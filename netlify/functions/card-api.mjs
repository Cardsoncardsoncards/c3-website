// netlify/functions/card-api.mjs
// Handles: likes, views, price alerts, collection waitlist, dynamic sitemap

const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');

async function supabasePost(table, data, useService = true) {
  const key = useService ? SUPABASE_SERVICE_KEY : SUPABASE_ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(data)
  });
  return res;
}

async function supabaseDelete(table, filter, useService = true) {
  const key = useService ? SUPABASE_SERVICE_KEY : SUPABASE_ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    }
  });
  return res;
}

async function supabaseGet(path, useService = false) {
  const key = useService ? SUPABASE_SERVICE_KEY : SUPABASE_ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  return res.json();
}

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

// --- Like handler ---
async function handleLike(req) {
  const body = await req.json();
  const { scryfallId, sessionId } = body;
  if (!scryfallId || !sessionId) return json({ error: 'Missing fields' }, 400);

  if (req.method === 'POST') {
    await supabasePost('mtg_card_likes', { scryfall_id: scryfallId, session_id: sessionId });
    return json({ ok: true });
  }
  if (req.method === 'DELETE') {
    await supabaseDelete('mtg_card_likes', `scryfall_id=eq.${scryfallId}&session_id=eq.${sessionId}`);
    return json({ ok: true });
  }
  return json({ error: 'Method not allowed' }, 405);
}

// --- View tracker ---
async function handleView(req) {
  const body = await req.json();
  const { scryfallId, sessionId } = body;
  if (!scryfallId) return json({ ok: true }); // Silently ignore

  await supabasePost('mtg_card_views', {
    scryfall_id: scryfallId,
    session_id: sessionId || null,
    viewed_at: new Date().toISOString(),
    country_code: 'AU'
  });
  return json({ ok: true });
}

// --- Price alert ---
async function handlePriceAlert(req) {
  const body = await req.json();
  const { scryfallId, cardName, email, targetPriceAud } = body;
  if (!scryfallId || !email || !targetPriceAud) return json({ error: 'Missing fields' }, 400);

  await supabasePost('mtg_price_alerts', {
    scryfall_id: scryfallId,
    email,
    target_price_aud: targetPriceAud,
    alert_type: 'below',
    is_active: true
  });
  return json({ ok: true });
}

// --- Collection waitlist ---
async function handleWaitlist(req) {
  const body = await req.json();
  const { email, sourceCardId, sourceCardName } = body;
  if (!email) return json({ error: 'Email required' }, 400);

  await supabasePost('collection_waitlist', {
    email,
    source_card_id: sourceCardId || null,
    source_card_name: sourceCardName || null,
    joined_at: new Date().toISOString()
  });
  return json({ ok: true });
}

// --- Dynamic sitemap for card pages ---
async function handleSitemap() {
  const cards = await supabaseGet('mtg_cards?select=slug,updated_at&price_usd=gte.0.5&order=price_usd.desc&limit=50000');
  const sets = await supabaseGet('mtg_sets?select=set_slug,release_date&order=release_date.desc');

  const cardUrls = cards.map(c =>
    `<url><loc>https://cardsoncardsoncards.com.au/cards/mtg/${c.slug}</loc><lastmod>${(c.updated_at || '').split('T')[0]}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`
  ).join('');

  const setUrls = sets.map(s =>
    `<url><loc>https://cardsoncardsoncards.com.au/cards/mtg/sets/${s.set_slug}</loc><lastmod>${s.release_date || '2026-01-01'}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`
  ).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://cardsoncardsoncards.com.au/cards/mtg</loc><changefreq>daily</changefreq><priority>0.9</priority></url>
<url><loc>https://cardsoncardsoncards.com.au/cards/mtg/random-commander</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
${setUrls}
${cardUrls}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, s-maxage=86400'
    }
  });
}

// --- Random commander ---
async function handleRandomCommander(req) {
  const url = new URL(req.url);
  const colors = url.searchParams.get('colors');
  const maxCmc = url.searchParams.get('maxCmc');

  let query = `mtg_cards?select=slug&type_line=like.*Legendary*&limit=1000`;
  if (maxCmc) query += `&cmc=lte.${maxCmc}`;

  const cards = await supabaseGet(query);
  const filtered = colors
    ? cards.filter(c => colors.split('').every(col => (c.color_identity || []).includes(col.toUpperCase())))
    : cards;

  if (!filtered.length) return json({ slug: null });
  const pick = filtered[Math.floor(Math.random() * filtered.length)];
  return json({ slug: pick.slug });
}

// --- Main router ---
export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === '/api/card-like') return handleLike(req);
  if (path === '/api/card-view' && req.method === 'POST') return handleView(req);
  if (path === '/api/price-alert' && req.method === 'POST') return handlePriceAlert(req);
  if (path === '/api/collection-waitlist' && req.method === 'POST') return handleWaitlist(req);
  if (path === '/api/sitemap-cards') return handleSitemap();
  if (path === '/api/random-commander') return handleRandomCommander(req);

  return json({ error: 'Not found' }, 404);
};

export const config = {
  path: [
    '/api/card-like',
    '/api/card-view',
    '/api/price-alert',
    '/api/collection-waitlist',
    '/api/sitemap-cards',
    '/api/random-commander'
  ]
};
