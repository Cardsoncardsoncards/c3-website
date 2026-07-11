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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: 'DELETE',
      signal: controller.signal,
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
    });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: 0, statusText: e.message };
  }
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
// Double opt-in: rows land with confirmed=false and a confirm_token. Confirmation requires
// an explicit POST (see handleConfirmFollow) because a GET link is fetched automatically by
// mail security scanners: Outlook Safe Links auto-confirmed a real test follow 14 seconds
// after the email was sent, with nobody clicking. A bare GET is therefore inert.
const SITE_ORIGIN = 'https://cardsoncardsoncards.com.au';

const FOLLOW_GAMES = new Set([
  'mtg', 'pokemon', 'lorcana', 'onepiece', 'yugioh', 'dbsfusionworld', 'starwars'
]);

// PART E: generous, observational cap. Existing rows are NEVER touched when this is hit,
// only new inserts are checked, so lowering it later cannot force anyone's follows away.
const FOLLOW_CAP = 100;

const MAGIC_LINK_TTL_HOURS = 24;

const GAME_TABLES = {
  mtg: 'mtg_cards', pokemon: 'pokemon_cards', lorcana: 'lorcana_cards',
  onepiece: 'onepiece_cards', yugioh: 'yugioh_cards',
  dbsfusionworld: 'dbsfusionworld_cards', starwars: 'starwars_cards'
};

// MTG stores images as image_uri_*; every other Core game uses a single image_url.
const GAME_IMAGE_COL = {
  mtg: 'image_uri_normal', pokemon: 'image_url', lorcana: 'image_url',
  onepiece: 'image_url', yugioh: 'image_url',
  dbsfusionworld: 'image_url', starwars: 'image_url'
};

const GAME_LABELS = {
  mtg: 'Magic: The Gathering', pokemon: 'Pokemon', lorcana: 'Lorcana',
  onepiece: 'One Piece', yugioh: 'Yu-Gi-Oh',
  dbsfusionworld: 'Dragon Ball Fusion World', starwars: 'Star Wars Unlimited'
};

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

async function supabasePatch(path, data) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: 'PATCH',
      signal: controller.signal,
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(data)
    });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: 0, statusText: e.message };
  }
}


// --- Shared page shell for the follow pages ---
function followPage(title, bodyHtml, status = 200) {
  return new Response(`<!DOCTYPE html>
<html lang="en-AU"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | Cards on Cards on Cards</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/c3logo.png" type="image/png">
<style>
body{background:#080a0f;color:#F0F2FF;font-family:system-ui,sans-serif;line-height:1.7;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
.box{max-width:560px;width:100%;text-align:center;background:#0e1118;border:1px solid #1e2235;border-radius:14px;padding:36px}
h1{color:#C9A84C;font-size:22px;margin:0 0 12px}
p{color:rgba(240,242,255,.75);font-size:15px}
a{color:#C9A84C}
img.card{max-width:200px;border-radius:10px;margin:8px auto;display:block}
button{background:#C9A84C;color:#0A0C14;border:none;padding:12px 22px;border-radius:8px;font-weight:700;font-size:15px;cursor:pointer}
button:hover{opacity:.9}
input[type=email]{width:100%;padding:11px 13px;border-radius:8px;border:1px solid #242840;background:#0d1117;color:#e8eaf0;font-size:14px;margin-bottom:10px;box-sizing:border-box}
ul.follows{list-style:none;padding:0;margin:18px 0;text-align:left}
ul.follows li{border:1px solid #1e2235;border-radius:10px;padding:12px 14px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:12px}
.meta{font-size:12px;color:#7a8099}
.small{font-size:12px;color:#7a8099}
</style></head>
<body><div class="box">
<h1>${esc(title)}</h1>
${bodyHtml}
<p><a href="/cards">Browse the Card Vault</a></p>
</div></body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' }
  });
}

const followMessage = (title, message, status = 200) =>
  followPage(title, `<p>${esc(message)}</p>`, status);

// Reads a token from the query string, or from a POST body (form or JSON).
async function readToken(req, url) {
  let token = url.searchParams.get('token');
  if (req.method === 'POST') {
    try {
      const ct = req.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const b = await req.json();
        token = (b && b.token) || token;
      } else {
        const form = await req.formData();
        token = form.get('token') || token;
      }
    } catch { /* fall back to the query-string token */ }
  }
  return token;
}

// --- PART A: confirm a follow. A GET is INERT, only a POST confirms. ---
//
// Mail security scanners (Outlook Safe Links, Defender, corporate gateways) prefetch every
// URL in an email. One of them auto-confirmed a live test follow 14 seconds after the email
// was sent, with nobody clicking, which defeats double opt-in entirely. A GET now only
// renders a page with a button; nothing is written until that button POSTs.
async function handleConfirmFollow(req) {
  const url = new URL(req.url);
  const token = await readToken(req, url);

  if (!token) {
    return followMessage('Link not valid', 'That confirmation link is missing its token.', 400);
  }

  const rows = await supabaseGet(
    `card_price_alerts?select=id,email,game,card_name,card_slug,confirmed,unsubscribe_token&confirm_token=eq.${encodeURIComponent(token)}&limit=1`,
    true
  ).catch(() => []);

  if (!Array.isArray(rows) || rows.length === 0) {
    return followMessage('Link not valid', 'That confirmation link is not recognised. It may have already been used.', 404);
  }

  const row  = rows[0];
  const name = row.card_name || row.card_slug;

  if (row.confirmed) {
    return followMessage('Already confirmed', `You are already getting price alerts for ${name}.`);
  }

  // GET: show the button. Deliberately no state change of any kind.
  if (req.method !== 'POST') {
    const imageUrl = await getCardImage(row.game, row.card_slug);
    return followPage('Confirm your price alerts', `
<p>Confirm you want price alerts for <strong>${esc(name)}</strong> (${esc(GAME_LABELS[row.game] || row.game)}).</p>
${imageUrl ? `<img class="card" src="${esc(imageUrl)}" alt="${esc(name)}">` : ''}
<form method="POST" action="/api/confirm-follow">
  <input type="hidden" name="token" value="${esc(token)}">
  <button type="submit">Yes, confirm my alerts</button>
</form>
<p class="small">Nothing is confirmed until you press the button.</p>`);
  }

  // POST: the only path that writes.
  const res = await supabasePatch(`card_price_alerts?id=eq.${row.id}`, {
    confirmed: true,
    confirmed_at: new Date().toISOString(),
    confirm_token: null            // single use
  });

  if (!res.ok) {
    console.error('[confirm-follow] patch failed', res.status);
    return followMessage('Something went wrong', 'We could not confirm your alerts just now. Please try the link again shortly.', 500);
  }

  return followPage('You are all set', `
<p>We will email you when <strong>${esc(name)}</strong> moves significantly in price.</p>
<p class="small">Changed your mind? <a href="/api/unsubscribe-follow?token=${encodeURIComponent(row.unsubscribe_token || '')}">Unsubscribe from this card</a>.</p>`);
}

// --- PART B: unsubscribe. A GET is inert here for exactly the same reason as confirm: a
// scanner prefetching the unsubscribe link would otherwise silently switch a user's alerts
// off without them ever clicking. ---
async function handleUnsubscribeFollow(req) {
  const url = new URL(req.url);
  const token = await readToken(req, url);

  if (!token) {
    return followMessage('Link not valid', 'That unsubscribe link is missing its token.', 400);
  }

  const rows = await supabaseGet(
    `card_price_alerts?select=id,email,card_name,card_slug&unsubscribe_token=eq.${encodeURIComponent(token)}&limit=1`,
    true
  ).catch(() => []);

  if (!Array.isArray(rows) || rows.length === 0) {
    // Already gone is the outcome the user wanted, so say that rather than erroring.
    return followMessage('Already unsubscribed', 'That follow is no longer active, so there is nothing to unsubscribe from.');
  }

  const row  = rows[0];
  const name = row.card_name || row.card_slug;

  if (req.method !== 'POST') {
    return followPage('Unsubscribe', `
<p>Stop price alerts for <strong>${esc(name)}</strong>?</p>
<form method="POST" action="/api/unsubscribe-follow">
  <input type="hidden" name="token" value="${esc(token)}">
  <button type="submit">Yes, unsubscribe me</button>
</form>
<p class="small">Nothing changes until you press the button.</p>`);
  }

  const res = await supabaseDelete('card_price_alerts', `id=eq.${row.id}`);
  if (!res.ok) {
    console.error('[unsubscribe-follow] delete failed', res.status);
    return followMessage('Something went wrong', 'We could not unsubscribe you just now. Please try the link again shortly.', 500);
  }

  await logEmail(row.email, 'follow_unsubscribe', row.id, true, null);
  return followMessage('You have been unsubscribed', `You have been unsubscribed from alerts for ${name}.`);
}

// --- PART C: lightweight "my follows", magic link, no accounts ---
//
// Anti-enumeration: the response is identical whether the email has follows, has none, or
// has never been seen. Otherwise this becomes a way to test which addresses are in the system.
async function handleMyFollowsRequest(req) {
  let email = null;
  try {
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const b = await req.json();
      email = b && b.email;
    } else {
      const form = await req.formData();
      email = form.get('email');
    }
  } catch { /* handled below */ }

  const GENERIC = 'If that email has any followed cards, we have sent it a link to manage them. Check your inbox.';

  if (isValidEmail(email)) {
    const follows = await supabaseGet(
      `card_price_alerts?select=id&email=eq.${encodeURIComponent(email)}&alert_type=eq.follow&limit=1`,
      true
    ).catch(() => []);

    // Only actually send if there is something to show. The response never changes.
    if (Array.isArray(follows) && follows.length > 0) {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_HOURS * 3600 * 1000).toISOString();

      const ins = await supabasePost('follow_magic_links', { email, token, expires_at: expiresAt });
      if (ins && ins.ok) {
        const link = `${SITE_ORIGIN}/api/my-follows?token=${encodeURIComponent(token)}`;
        await sendAlertEmail({
          to: email,
          emailType: 'follow_magic_link',
          alertId: null,
          subject: 'Manage your followed cards',
          html: `<p>Hi,</p>
<p>Here is your link to view and manage the cards you follow on Cards on Cards on Cards.</p>
<p><a href="${link}" style="background:#C9A84C;color:#0A0C14;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block">View my followed cards</a></p>
<p>This link works for ${MAGIC_LINK_TTL_HOURS} hours, then it expires.</p>
<p>If you did not request this, you can ignore this email.</p>
<p>The C3 Team</p>`
        });
      } else {
        console.error('[my-follows] magic link insert failed');
      }
    }
  }

  return followMessage('Check your inbox', GENERIC);
}

async function handleMyFollows(req) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  // No token: show the request form.
  if (!token) {
    return followPage('Manage your followed cards', `
<p>Enter your email and we will send you a link to view the cards you follow.</p>
<form method="POST" action="/api/my-follows">
  <input type="email" name="email" placeholder="you@example.com" required>
  <button type="submit">Email me my follows</button>
</form>
<p class="small">No account needed. The link expires after ${MAGIC_LINK_TTL_HOURS} hours.</p>`);
  }

  const links = await supabaseGet(
    `follow_magic_links?select=email,expires_at&token=eq.${encodeURIComponent(token)}&limit=1`,
    true
  ).catch(() => []);

  if (!Array.isArray(links) || links.length === 0) {
    return followMessage('Link not valid', 'That link is not recognised. Request a new one from the manage page.', 404);
  }

  const link = links[0];
  if (new Date(link.expires_at).getTime() < Date.now()) {
    return followMessage('Link expired', `That link has expired. Links are valid for ${MAGIC_LINK_TTL_HOURS} hours. Request a new one.`, 410);
  }

  const rows = await supabaseGet(
    `card_price_alerts?select=game,card_name,card_slug,confirmed,created_at,unsubscribe_token&email=eq.${encodeURIComponent(link.email)}&alert_type=eq.follow&order=created_at.desc`,
    true
  ).catch(() => []);

  if (!Array.isArray(rows) || rows.length === 0) {
    return followMessage('No followed cards', 'You are not following any cards right now.');
  }

  const items = rows.map(r => {
    const name = r.card_name || r.card_slug;
    const when = (r.created_at || '').slice(0, 10);
    return `<li>
  <span>
    <strong>${esc(name)}</strong><br>
    <span class="meta">${esc(GAME_LABELS[r.game] || r.game)} &middot; followed ${esc(when)}${r.confirmed ? '' : ' &middot; not yet confirmed'}</span>
  </span>
  <a href="/api/unsubscribe-follow?token=${encodeURIComponent(r.unsubscribe_token || '')}">Remove</a>
</li>`;
  }).join('');

  return followPage('Your followed cards', `
<ul class="follows">${items}</ul>
<p class="small">${rows.length} card${rows.length === 1 ? '' : 's'} followed.</p>`);
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
  // GET renders a button, POST performs the action. Both methods reach the handler, which
  // is what makes a scanner's GET prefetch inert.
  if (path === '/api/confirm-follow')     return handleConfirmFollow(req);
  if (path === '/api/unsubscribe-follow') return handleUnsubscribeFollow(req);
  if (path === '/api/my-follows') {
    return req.method === 'POST' ? handleMyFollowsRequest(req) : handleMyFollows(req);
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
    '/api/card-follow',
    '/api/confirm-follow',
    '/api/unsubscribe-follow',
    '/api/my-follows',
    '/api/quiz-result',
    '/api/quiz-stats'
  ]
};
