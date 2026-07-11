// netlify/functions/card-api.mjs
// Handles: likes, views, price alerts, collection waitlist, random commander

const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const RESEND_API_KEY = Netlify.env.get('RESEND_API_KEY');

async function supabasePost(table, data, useService = true) {
  const key = useService ? SUPABASE_SERVICE_KEY : SUPABASE_ANON_KEY;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(data)
    });
  } finally {
    clearTimeout(timer);
  }
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

// Escape anything DB- or user-sourced before it goes into HTML (confirmation page,
// alert emails). Card names come from the request body, so they are untrusted.
function esc(str) {
  return (str == null ? '' : String(str))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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
// Generic sitewide view logging: writes to card_views keyed by (game, card_ref).
// card_ref is scryfall_id for MTG (ambiguous slugs) and the unique slug for the
// other 31 games. Best-effort analytics: never fail the request.
async function handleView(req) {
  const body = await req.json();
  let { game, cardRef, sessionId, scryfallId } = body;
  // Backward-compat: the old MTG-only client shape sent { scryfallId } with no
  // game/cardRef, so any caller not yet redeployed keeps working as game='mtg'.
  if (!game && scryfallId) { game = 'mtg'; cardRef = scryfallId; }
  if (!game || !cardRef) return json({ ok: true });
  try {
    await supabasePost('card_views', {
      game,
      card_ref: cardRef,
      session_id: sessionId || null,
      viewed_at: new Date().toISOString(),
      country_code: 'AU'
    });
  } catch { /* analytics is best-effort; do not fail the request */ }
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

// --- Follow this card (multi-game percentage-change alerts) ---
//
// Distinct from handlePriceAlert above, which is the MTG-only, one-shot target-price
// system backed by mtg_price_alerts. This one is multi-game and backed by
// card_price_alerts with alert_type 'follow': no target price, no direction. The user
// is emailed when the card moves by a threshold percentage (see check-card-follows.mjs).
//
// Double opt-in: rows land with confirmed=false and a confirm_token, and only become
// eligible for alerts once the confirm link is visited.
const SITE_ORIGIN = 'https://cardsoncardsoncards.com.au';

const FOLLOW_GAMES = new Set([
  'mtg', 'pokemon', 'lorcana', 'onepiece', 'yugioh', 'dbsfusionworld', 'starwars'
]);

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

async function handleCardFollow(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { email, game, cardSlug, cardName } = body || {};

  if (!isValidEmail(email))        return json({ error: 'A valid email is required' }, 400);
  if (!FOLLOW_GAMES.has(game))     return json({ error: 'Unsupported game' }, 400);
  if (!cardSlug || typeof cardSlug !== 'string') return json({ error: 'Card is required' }, 400);

  // Don't create a second row if this email already follows this card.
  const existing = await supabaseGet(
    `card_price_alerts?select=id,confirmed&email=eq.${encodeURIComponent(email)}&game=eq.${encodeURIComponent(game)}&card_slug=eq.${encodeURIComponent(cardSlug)}&alert_type=eq.follow&limit=1`,
    true
  ).catch(() => []);

  if (Array.isArray(existing) && existing.length) {
    return json({ ok: true, alreadyFollowing: true, confirmed: !!existing[0].confirmed });
  }

  const confirmToken = crypto.randomUUID();

  const res = await supabasePost('card_price_alerts', {
    email,
    game,
    card_slug:  cardSlug,
    card_name:  cardName || null,
    alert_type: 'follow',
    confirmed:  false,
    confirm_token: confirmToken
  });

  if (!res || !res.ok) {
    console.error('[card-follow] insert failed', res && res.status);
    return json({ error: 'Could not save your follow. Please try again.' }, 500);
  }

  const confirmUrl = `${SITE_ORIGIN}/api/confirm-follow?token=${encodeURIComponent(confirmToken)}`;
  const safeName   = esc(cardName || cardSlug);

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
          subject: `Confirm your price alerts for ${cardName || cardSlug}`,
          html: `<p>Hi,</p>
<p>Please confirm you want price alerts for <strong>${safeName}</strong>.</p>
<p><a href="${confirmUrl}" style="background:#C9A84C;color:#0A0C14;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block">Confirm my alerts</a></p>
<p>Once confirmed, we will email you when this card's price moves significantly. We check daily.</p>
<p>If you did not request this, just ignore this email and nothing further will happen.</p>
<p>The C3 Team</p>
<p style="font-size:11px;color:#999">Prices are estimates in AUD. See our <a href="${SITE_ORIGIN}/methodology">methodology</a> for how we source them.</p>`
        })
      });
    } catch (e) {
      console.error('[card-follow] Resend error:', e.message);
      // The row is saved; the user can be re-sent a confirmation by following again.
    }
  }

  return json({ ok: true, pendingConfirmation: true });
}

// --- Confirm a follow (double opt-in landing page) ---
function confirmPage(title, message) {
  return new Response(`<!DOCTYPE html>
<html lang="en-AU"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | Cards on Cards on Cards</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/c3logo.png" type="image/png">
<style>
body{background:#080a0f;color:#F0F2FF;font-family:system-ui,sans-serif;line-height:1.7;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
.box{max-width:520px;text-align:center;background:#0e1118;border:1px solid #1e2235;border-radius:14px;padding:36px}
h1{color:#C9A84C;font-size:22px;margin:0 0 12px}
p{color:rgba(240,242,255,.75);font-size:15px}
a{color:#C9A84C}
</style></head>
<body><div class="box">
<h1>${esc(title)}</h1>
<p>${esc(message)}</p>
<p><a href="/cards">Browse the Card Vault</a></p>
</div></body></html>`, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' }
  });
}

async function handleConfirmFollow(req) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return confirmPage('Link not valid', 'That confirmation link is missing its token.');
  }

  const rows = await supabaseGet(
    `card_price_alerts?select=id,card_name,card_slug,confirmed&confirm_token=eq.${encodeURIComponent(token)}&limit=1`,
    true
  ).catch(() => []);

  if (!Array.isArray(rows) || rows.length === 0) {
    return confirmPage('Link not valid', 'That confirmation link is not recognised. It may have already been used.');
  }

  const row = rows[0];
  if (row.confirmed) {
    return confirmPage('Already confirmed', `You are already getting price alerts for ${row.card_name || row.card_slug}.`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/card_price_alerts?id=eq.${row.id}`, {
      method: 'PATCH',
      signal: controller.signal,
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        confirmed: true,
        confirmed_at: new Date().toISOString(),
        confirm_token: null      // single use
      })
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.error('[confirm-follow] patch failed', res.status);
      return confirmPage('Something went wrong', 'We could not confirm your alerts just now. Please try the link again shortly.');
    }
  } catch (e) {
    clearTimeout(timer);
    console.error('[confirm-follow] error:', e.message);
    return confirmPage('Something went wrong', 'We could not confirm your alerts just now. Please try the link again shortly.');
  }

  return confirmPage('You are all set', `We will email you when ${row.card_name || row.card_slug} moves significantly in price.`);
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
          subject: `C3 Feedback${rating ? ' (' + '★'.repeat(rating) + ')' : ''} - ${page || 'unknown page'}`,
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
  if (path === '/api/card-follow') {
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: noindexHeaders });
    return handleCardFollow(req);
  }
  if (path === '/api/confirm-follow') return handleConfirmFollow(req);
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
    '/api/card-follow',
    '/api/confirm-follow',
    '/api/quiz-result',
    '/api/quiz-stats'
  ]
};
