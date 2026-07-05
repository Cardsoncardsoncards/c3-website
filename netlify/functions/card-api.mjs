// netlify/functions/card-api.mjs
// Handles: likes, views, price alerts, collection waitlist, random commander

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

  // If email provided, add to MailerLite (engaged users)
  if (email && email.includes('@')) {
    const MAILERLITE_KEY = Netlify.env.get('MAILERLITE_API_KEY');
    if (MAILERLITE_KEY) {
      try {
        await fetch('https://connect.mailerlite.com/api/subscribers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MAILERLITE_KEY}` },
          body: JSON.stringify({ email, groups: ['mIFDGb'], fields: { feedback_rating: rating || '', source: 'card_feedback' } })
        });
      } catch (e) { console.error('MailerLite feedback error:', e.message); }
    }
  }

  return json({ ok: true });
}

// --- Sell price alert (for sellers wanting notification when price rises) ---
async function handleSellAlert(req) {
  const body = await req.json();
  const { scryfallId, cardName, email, targetPriceAud } = body;
  if (!scryfallId || !email || !targetPriceAud) return json({ error: 'Missing fields' }, 400);

  await supabasePost('mtg_price_alerts', {
    scryfall_id: scryfallId,
    email,
    target_price_aud: targetPriceAud,
    alert_type: 'above',
    is_active: true,
    card_name: cardName || null
  });

  // Confirmation email
  if (RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'C3 Price Alerts <alerts@cardsoncardsoncards.com.au>',
          to: [email],
          subject: `Sell alert set for ${cardName || 'your card'}`,
          html: `<p>Hi,</p>
<p>You will be notified when <strong>${cardName}</strong> rises above <strong>AU$${targetPriceAud}</strong>.</p>
<p>We check prices daily. When the price hits your target we will email you straight away.</p>
<p>The C3 Team</p>
<p style="font-size:11px;color:#999">To unsubscribe from price alerts, reply to this email.</p>`
        })
      });
    } catch (e) { console.error('Resend sell-alert error:', e.message); }
  }

  // Add to MailerLite
  const MAILERLITE_KEY = Netlify.env.get('MAILERLITE_API_KEY');
  if (MAILERLITE_KEY) {
    try {
      await fetch('https://connect.mailerlite.com/api/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MAILERLITE_KEY}` },
        body: JSON.stringify({ email, groups: ['mIFDGb'], fields: { source: 'sell_alert' } })
      });
    } catch {}
  }

  return json({ ok: true });
}

// --- Store-first eBay URL helper ---
// Returns C3 store search URL first, falls back to all AU sellers
function getEbayUrls(cardName, game = 'mtg') {
  const gameKeyword = game === 'mtg' ? 'mtg' : game === 'pokemon' ? 'pokemon' : game === 'yugioh' ? 'yugioh' : game;
  const q = encodeURIComponent(`${cardName} ${gameKeyword}`);
  const campid = '5339146789';
  const storeUrl = `https://www.ebay.com.au/str/cardsoncardsoncards?_nkw=${q}&campid=${campid}&toolid=10001&mkevt=1`;
  const allUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${q}&_sacat=183454&_sop=15&mkcid=1&mkrid=705-53470-19255-0&campid=${campid}&toolid=10001&mkevt=1`;
  return { storeUrl, allUrl };
}



// --- Random card draw ---
async function handleRandomCard(req) {
  const url = new URL(req.url);
  const game = url.searchParams.get('game') || 'mtg';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '3'), 10);
  const rarity = url.searchParams.get('rarity') || '';

  const TABLE_MAP = {
    mtg: { table: 'mtg_cards', imgCol: 'image_uri_small', priceCol: 'price_usd', slugCol: 'slug', nameCol: 'name', extraCols: 'set_name,rarity,color_identity,type_line' },
    pokemon: { table: 'pokemon_cards', imgCol: 'image_url', priceCol: 'market_price', slugCol: 'slug', nameCol: 'name', extraCols: 'set_name,rarity' },
    yugioh: { table: 'yugioh_cards', imgCol: 'image_url', priceCol: 'market_price', slugCol: 'slug', nameCol: 'name', extraCols: 'set_name,rarity' },
    lorcana: { table: 'lorcana_cards', imgCol: 'image_url', priceCol: 'market_price', slugCol: 'slug', nameCol: 'name', extraCols: 'set_name,rarity' },
    onepiece: { table: 'onepiece_cards', imgCol: 'image_url', priceCol: 'market_price', slugCol: 'slug', nameCol: 'name', extraCols: 'set_name,rarity' },
    dragonball: { table: 'dragonball_cards', imgCol: 'image_url', priceCol: 'market_price', slugCol: 'slug', nameCol: 'name', extraCols: 'set_name,rarity' },
    starwars: { table: 'starwars_cards', imgCol: 'image_url', priceCol: 'market_price', slugCol: 'slug', nameCol: 'name', extraCols: 'set_name,rarity' },
    riftbound: { table: 'riftbound_cards', imgCol: 'image_url', priceCol: 'market_price', slugCol: 'slug', nameCol: 'name', extraCols: 'set_name,rarity' },
  };

  const cfg = TABLE_MAP[game] || TABLE_MAP.mtg;
  // Per-game max offset to avoid exceeding row count on smaller tables
  const GAME_MAX_OFFSET = { mtg: 9000, pokemon: 9000, yugioh: 9000, lorcana: 3000, onepiece: 6000, dragonball: 4000, starwars: 3500, riftbound: 1000 };
  const maxOffset = (GAME_MAX_OFFSET[game] || 9000) - limit;
  const offset = Math.floor(Math.random() * maxOffset);
  let query = `${cfg.table}?${cfg.imgCol}=not.is.null&limit=${limit}&offset=${offset}&select=${cfg.slugCol},${cfg.nameCol},${cfg.imgCol},${cfg.priceCol},price_aud,${cfg.extraCols}`;

  if (rarity && rarity !== 'all') {
    if (rarity === 'rare+') query += `&rarity=in.(Rare,Mythic Rare,Mythic,Secret Rare,Ultra Rare,Legendary)`;
    else if (rarity === 'mythic') query += `&rarity=in.(Mythic Rare,Mythic,Secret Rare)`;
  }

  try {
    const res = await supabaseGet(query);
    if (!res || !res.length) return json({ error: 'No cards found' }, 404);
    const cards = res.map(c => ({
      slug: c[cfg.slugCol],
      name: c[cfg.nameCol],
      image: c[cfg.imgCol],
      price_usd: c[cfg.priceCol] || null,
      price_aud: c.price_aud || (c[cfg.priceCol] ? (c[cfg.priceCol] * 1.45).toFixed(2) : null),
      set_name: c.set_name || '',
      rarity: c.rarity || '',
      extra: { type: c.type_line || c.type || '', color: c.color_identity || c.ink || c.attribute || '', ink: c.ink || '' },
      game,
      path: `/cards/${game}/${c[cfg.slugCol]}`,
    }));
    return json({ cards });
  } catch (err) {
    console.error('[random-card]', err.message);
    return json({ error: 'Failed to fetch cards' }, 500);
  }
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

// --- Quiz result increment ---
async function handleQuizResult(req) {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const body = await req.json();
  const { quiz_slug, result_slug } = body;
  if (!quiz_slug || !result_slug) return json({ error: 'Missing fields' }, 400);
  try {
    const key = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_quiz_count`, {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_quiz_slug: quiz_slug, p_result_slug: result_slug })
    });
    return json({ ok: res.ok });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// --- Quiz stats read (server-side, no client Supabase key needed) ---
async function handleQuizStats(req) {
  const url = new URL(req.url);
  const quiz_slug = url.searchParams.get('quiz_slug');
  if (!quiz_slug) return json({ error: 'Missing quiz_slug' }, 400);
  try {
    const data = await supabaseGet(`quiz_stats?quiz_slug=eq.${encodeURIComponent(quiz_slug)}&select=result_slug,count&order=count.desc`);
    return json({ stats: Array.isArray(data) ? data : [] });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// --- Main router ---
export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;
  const noindexHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'X-Robots-Tag': 'noindex' };

  if (path === '/api/card-like') return handleLike(req);
  if (path === '/api/card-view') {
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: noindexHeaders });
    return handleView(req);
  }
  if (path === '/api/price-alert') {
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: noindexHeaders });
    return handlePriceAlert(req);
  }
  if (path === '/api/collection-waitlist') {
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: noindexHeaders });
    return handleWaitlist(req);
  }
  if (path === '/api/random-commander') return handleRandomCommander(req);
  if (path === '/api/random-card') return handleRandomCard(req);
  if (path === '/api/feedback') {
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: noindexHeaders });
    return handleFeedback(req);
  }
  if (path === '/api/sell-alert') {
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: noindexHeaders });
    return handleSellAlert(req);
  }
  if (path === '/api/newsletter') {
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: noindexHeaders });
    return handleNewsletter(req);
  }
  if (path === '/api/quiz-result') return handleQuizResult(req);
  if (path === '/api/quiz-stats') return handleQuizStats(req);

  return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: noindexHeaders });
};

export const config = {
  path: [
    '/api/card-like',
    '/api/card-view',
    '/api/price-alert',
    '/api/collection-waitlist',
    '/api/random-commander',
    '/api/random-card',
    '/api/feedback',
    '/api/newsletter',
    '/api/sell-alert',
    '/api/quiz-result',
    '/api/quiz-stats'
  ]
};
