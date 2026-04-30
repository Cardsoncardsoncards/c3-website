// netlify/functions/card-api.mjs
// Handles: likes, views, price alerts, collection waitlist, random commander, sitemap

const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const RESEND_API_KEY = Netlify.env.get('RESEND_API_KEY');

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
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
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
  status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
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
  if (!scryfallId) return json({ ok: true });
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

  // Send confirmation email via Resend
  if (RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'C3 Price Alerts <alerts@cardsoncardsoncards.com.au>',
          to: [email],
          subject: `Price alert set for ${cardName}`,
          html: `<p>Hi,</p>
<p>You will be notified when <strong>${cardName}</strong> drops below <strong>AU$${targetPriceAud}</strong>.</p>
<p>We check prices daily. When the price drops we will email you straight away.</p>
<p>You can browse more cards at <a href="https://cardsoncardsoncards.com.au/cards/mtg">cardsoncardsoncards.com.au</a></p>
<p>The C3 Team</p>
<p style="font-size:11px;color:#999">To unsubscribe from price alerts, reply to this email.</p>`
        })
      });
    } catch (e) {
      console.error('Resend error:', e.message);
    }
  }

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

  const cardUrls = (Array.isArray(cards) ? cards : []).map(c =>
    `<url><loc>https://cardsoncardsoncards.com.au/cards/mtg/${c.slug}</loc><lastmod>${(c.updated_at || '').split('T')[0]}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`
  ).join('');

  const setUrls = (Array.isArray(sets) ? sets : []).map(s =>
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
    headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, s-maxage=86400' }
  });
}

// --- Random commander ---
// FIX: select color_identity so filter works, narrow to Legendary Creatures only
async function handleRandomCommander(req) {
  const url = new URL(req.url);
  const colors = url.searchParams.get('colors');
  const maxCmc = url.searchParams.get('maxCmc');
  const exclude = url.searchParams.get('exclude');

  let query = `mtg_cards?select=slug,color_identity,cmc&type_line=like.*Legendary*Creature*&image_uri_normal=not.is.null&limit=2000`;
  if (maxCmc) query += `&cmc=lte.${maxCmc}`;

  const cards = await supabaseGet(query);
  if (!Array.isArray(cards) || cards.length === 0) return json({ slug: null });

  let filtered = colors
    ? cards.filter(c => {
        const ci = c.color_identity || [];
        return colors.split('').every(col => ci.includes(col.toUpperCase()));
      })
    : cards;

  // Exclude last shown card so Generate Another always returns something different
  if (exclude && filtered.length > 1) {
    filtered = filtered.filter(c => c.slug !== exclude);
  }

  if (!filtered.length) return json({ slug: null });
  const pick = filtered[Math.floor(Math.random() * filtered.length)];
  return json({ slug: pick.slug });
}


// --- Feedback handler ---
async function handleFeedback(req) {
  const body = await req.json();
  const { rating, text, email, page, cardName } = body;
  if (!text && !rating) return json({ error: 'No content' }, 400);

  // Send email via Resend
  if (RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'C3 Feedback <alerts@cardsoncardsoncards.com.au>',
          to: ['ccc.squadhelp@gmail.com'],
          subject: `C3 Feedback${rating ? ' (' + '★'.repeat(rating) + ')' : ''} — ${page || 'unknown page'}`,
          html: `
            <h2>New C3 Feedback</h2>
            <p><strong>Page:</strong> ${page || 'N/A'}</p>
            ${cardName ? `<p><strong>Card:</strong> ${cardName}</p>` : ''}
            ${rating ? `<p><strong>Rating:</strong> ${'★'.repeat(rating)}${'☆'.repeat(5-rating)} (${rating}/5)</p>` : ''}
            ${text ? `<p><strong>Message:</strong><br>${text}</p>` : ''}
            ${email ? `<p><strong>Reply to:</strong> <a href="mailto:${email}">${email}</a></p>` : '<p><em>No email provided</em></p>'}
          `
        })
      });
    } catch (e) {
      console.error('Resend feedback error:', e.message);
    }
  }

  return json({ ok: true });
}


// --- Newsletter subscribe ---
async function handleNewsletter(req) {
  const body = await req.json();
  const { email } = body;
  if (!email || !email.includes('@')) return json({ error: 'Invalid email' }, 400);

  const MAILERLITE_KEY = Netlify.env.get('MAILERLITE_API_KEY');
  if (!MAILERLITE_KEY) return json({ error: 'Not configured' }, 500);

  try {
    const res = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MAILERLITE_KEY}`
      },
      body: JSON.stringify({ email, groups: ['mIFDGb'] })
    });
    if (res.ok || res.status === 200 || res.status === 201) {
      return json({ ok: true });
    }
    const err = await res.text();
    console.error('MailerLite error:', err);
    return json({ error: 'Subscribe failed' }, 500);
  } catch (e) {
    console.error('Newsletter error:', e.message);
    return json({ error: e.message }, 500);
  }
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
  if (path === '/api/feedback' && req.method === 'POST') return handleFeedback(req);
  if (path === '/api/newsletter' && req.method === 'POST') return handleNewsletter(req);

  return json({ error: 'Not found' }, 404);
};

export const config = {
  path: [
    '/api/card-like',
    '/api/card-view',
    '/api/price-alert',
    '/api/collection-waitlist',
    '/api/sitemap-cards',
    '/api/random-commander',
    '/api/feedback',
    '/api/newsletter'
  ]
};
