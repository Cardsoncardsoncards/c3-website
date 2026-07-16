// netlify/functions/card-api.mjs
// Handles: likes, views, price alerts, collection waitlist, random commander, card follows
//
// task-109: every follow now goes through shared/accounts-core.mjs. This file no longer
// writes card_price_alerts, no longer matches people by a raw case-sensitive email string,
// and no longer carries its own inline cap check. Follows live in the unified follows table,
// keyed to a real accounts row that is created silently on first follow.

import {
  normaliseEmail,
  resolveOrCreateAccount,
  applyFollow,
  listFollows,
  countFollows,
  unsubscribeFollow,
  deleteFollow,
  findFollowByUnsubToken,
  findFollowByConfirmToken,
  confirmFollow,
  createMagicLink,
  resolveMagicLink,
  getTier,
  capFor,
  FREE_FOLLOW_CAP,
  MAGIC_LINK_TTL_HOURS,
} from './shared/accounts-core.mjs';

// task-132: read the session cookie so a signed-in follow is one click (no email double opt-in).
import { getSessionFromRequest } from './shared/session.mjs';

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

// A non-2xx from PostgREST used to fall straight through res.json() as a parsed error
// object. Callers check Array.isArray(), so every system failure (bad key, 500, RLS
// denial) was indistinguishable from "no rows matched" and got reported to the user as
// "Link not valid". Throw instead, so a caller can tell a broken backend apart from a
// genuinely unknown token.
class SupabaseError extends Error {}

async function supabaseGet(path, useService = false) {
  const key = useService ? SUPABASE_SERVICE_KEY : SUPABASE_ANON_KEY;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
      signal: controller.signal
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch { /* empty body */ }
      throw new SupabaseError(`Supabase ${res.status}: ${detail}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
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
// system backed by mtg_price_alerts and untouched by task-109. This one is multi-game and
// backed by the unified follows table, one row per (account, card), no target price. The
// user is emailed when the card moves by a threshold percentage (see check-card-follows.mjs).
//
// Double opt-in: rows land with confirmed=false and a confirm_token. Confirming requires an
// explicit POST (see handleConfirmFollow), because mail security scanners prefetch every URL
// in an email: Outlook Safe Links auto-confirmed a live test follow 14 seconds after it was
// sent, with nobody clicking. A bare GET is therefore inert.
const SITE_ORIGIN = 'https://cardsoncardsoncards.com.au';

// task-132 Part 11: the full 32-game roster. Follow validation, the confirm-email image lookup,
// and the game label all derive from this ONE map, so adding a game is a single edit. Every game
// uses {game}_cards with an image_url column, except MTG (mtg_cards + image_uri_normal).
// Previously only the 7 Core games were listed; the follow system now covers all 32.
const GAME_META = {
  mtg:               ['mtg_cards',               'image_uri_normal', 'Magic: The Gathering'],
  pokemon:           ['pokemon_cards',           'image_url',        'Pokemon'],
  yugioh:            ['yugioh_cards',            'image_url',        'Yu-Gi-Oh'],
  lorcana:           ['lorcana_cards',           'image_url',        'Lorcana'],
  onepiece:          ['onepiece_cards',          'image_url',        'One Piece'],
  dbsfusionworld:    ['dbsfusionworld_cards',    'image_url',        'Dragon Ball Fusion World'],
  starwars:          ['starwars_cards',          'image_url',        'Star Wars Unlimited'],
  alphaclash:        ['alphaclash_cards',        'image_url',        'Alpha Clash'],
  bakugan:           ['bakugan_cards',           'image_url',        'Bakugan'],
  battlespiritssaga: ['battlespiritssaga_cards', 'image_url',        'Battle Spirits Saga'],
  buddyfight:        ['buddyfight_cards',        'image_url',        'Buddyfight'],
  digimon:           ['digimon_cards',           'image_url',        'Digimon'],
  dragonball:        ['dragonball_cards',        'image_url',        'Dragon Ball Super'],
  dragonballz:       ['dragonballz_cards',       'image_url',        'Dragon Ball Z'],
  finalfantasy:      ['finalfantasy_cards',      'image_url',        'Final Fantasy TCG'],
  forceofwill:       ['forceofwill_cards',       'image_url',        'Force of Will'],
  gateruler:         ['gateruler_cards',         'image_url',        'Gate Ruler'],
  godzilla:          ['godzilla_cards',          'image_url',        'Godzilla'],
  grandarchive:      ['grandarchive_cards',      'image_url',        'Grand Archive'],
  gundam:            ['gundam_cards',            'image_url',        'Gundam'],
  hololive:          ['hololive_cards',          'image_url',        'Hololive'],
  metazoo:           ['metazoo_cards',           'image_url',        'MetaZoo'],
  riftbound:         ['riftbound_cards',         'image_url',        'Riftbound'],
  shadowverse:       ['shadowverse_cards',       'image_url',        'Shadowverse'],
  sorcery:           ['sorcery_cards',           'image_url',        'Sorcery Contested Realm'],
  unionarena:        ['unionarena_cards',        'image_url',        'Union Arena'],
  universus:         ['universus_cards',         'image_url',        'UniVersus'],
  vanguard:          ['vanguard_cards',          'image_url',        'Cardfight Vanguard'],
  warhammer:         ['warhammer_cards',         'image_url',        'Warhammer'],
  weissschwarz:      ['weissschwarz_cards',      'image_url',        'Weiss Schwarz'],
  wixoss:            ['wixoss_cards',            'image_url',        'Wixoss'],
  wow:               ['wow_cards',               'image_url',        'World of Warcraft'],
};
const FOLLOW_GAMES   = new Set(Object.keys(GAME_META));
const GAME_TABLES    = Object.fromEntries(Object.entries(GAME_META).map(([g, m]) => [g, m[0]]));
const GAME_IMAGE_COL = Object.fromEntries(Object.entries(GAME_META).map(([g, m]) => [g, m[1]]));
const GAME_LABELS    = Object.fromEntries(Object.entries(GAME_META).map(([g, m]) => [g, m[2]]));

// PART E: generous, observational cap. Existing rows are NEVER touched when it is reached,
// only new inserts are checked, so lowering it later cannot force anyone's follows away.
// The cap and the magic-link TTL live in shared/accounts-core.mjs (FREE_FOLLOW_CAP,
// MAGIC_LINK_TTL_HOURS), imported at the top of this file, deliberately not redeclared here.

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

// PART F: permanent record of every alert email attempt. Fire-and-forget by design: a
// logging failure must never make a real send look like it failed to the user.
async function logEmail(recipient, emailType, relatedAlertId, success, errorMessage) {
  try {
    await supabasePost('email_log', {
      recipient,
      email_type: emailType,
      related_card_alert_id: relatedAlertId || null,
      success: !!success,
      error_message: errorMessage ? String(errorMessage).slice(0, 500) : null
    });
  } catch (e) {
    console.warn('[email_log] insert failed:', e.message);
  }
}

// Single place that sends and records. Checks res.ok rather than trusting the fetch to have
// worked, and always writes an email_log row either way.
async function sendFollowEmail({ to, subject, html, emailType, alertId }) {
  if (!RESEND_API_KEY) {
    console.warn(`[${emailType}] RESEND_API_KEY not configured, no email sent`);
    await logEmail(to, emailType, alertId, false, 'RESEND_API_KEY not configured');
    return false;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'C3 Price Alerts <alerts@cardsoncardsoncards.com.au>',
        to: [to],
        subject,
        html
      })
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      console.error(`[${emailType}] Resend FAILED ${res.status}: ${body}`);
      await logEmail(to, emailType, alertId, false, `${res.status}: ${body}`);
      return false;
    }
    const sent = await res.json().catch(() => ({}));
    console.log(`[${emailType}] Resend OK id=${sent.id || 'unknown'} to=${to}`);
    await logEmail(to, emailType, alertId, true, null);
    return true;
  } catch (e) {
    clearTimeout(timer);
    console.error(`[${emailType}] Resend error: ${e.message}`);
    await logEmail(to, emailType, alertId, false, e.message);
    return false;
  }
}

// PART D: card art for the emails. Best-effort, an email still sends without it.
async function getCardImage(game, cardSlug) {
  const table = GAME_TABLES[game];
  const col = GAME_IMAGE_COL[game];
  if (!table || !col) return null;
  try {
    const rows = await supabaseGet(
      `${table}?select=${col}&slug=eq.${encodeURIComponent(cardSlug)}&${col}=not.is.null&order=price_aud.desc.nullslast&limit=1`,
      true
    );
    return (Array.isArray(rows) && rows[0] && rows[0][col]) || null;
  } catch {
    return null;
  }
}

function cardImageHtml(imageUrl, cardName) {
  if (!imageUrl) return '';
  return `<p><img src="${esc(imageUrl)}" alt="${esc(cardName)}" width="220" style="max-width:220px;border-radius:10px;display:block"></p>`;
}

// PART B: every alert email must carry an unsubscribe link.
function unsubscribeFooterHtml(unsubToken) {
  const url = `${SITE_ORIGIN}/api/unsubscribe-follow?token=${encodeURIComponent(unsubToken)}`;
  return `<p style="font-size:11px;color:#999">Don't want alerts for this card any more? <a href="${url}">Unsubscribe</a>. You can also <a href="${SITE_ORIGIN}/api/my-follows">manage all your followed cards</a>.</p>`;
}

async function handleCardFollow(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { email, game, cardSlug, cardName } = body || {};

  if (!FOLLOW_GAMES.has(game))     return json({ error: 'Unsupported game' }, 400);
  if (!cardSlug || typeof cardSlug !== 'string') return json({ error: 'Card is required' }, 400);

  // task-132 auth-aware path. No email in the body means "try the signed-in one-click follow".
  // A valid session cookie -> follow directly, auto-confirmed, no email. No session -> tell the
  // client to reveal the email-capture input. The branch happens HERE, not in the card-page HTML,
  // so the card page stays identically cacheable for everyone.
  if (!email) {
    const session = await getSessionFromRequest(req).catch(() => null);
    if (!session) return json({ ok: true, needEmail: true });
    const r = await applyFollow({ email: session.email, game, cardSlug, cardName, autoConfirm: true });
    if (!r.ok) {
      if (r.reason === 'cap_reached') {
        return json({ error: `You have reached the maximum number of followed cards (${r.cap}). Remove one to add another.`, capReached: true }, 429);
      }
      console.error('[card-follow] signed-in applyFollow failed:', r.reason);
      return json({ error: 'Could not save your follow. Please try again.' }, 500);
    }
    return json({ ok: true, followed: !r.alreadyFollowing, alreadyFollowing: !!r.alreadyFollowing });
  }

  if (!normaliseEmail(email))      return json({ error: 'A valid email is required' }, 400);

  // The ONE follow write path. It normalises the email, silently resolves or creates the
  // account (sending nothing), resolves the tier, applies the right cap, and writes. The cap
  // check, the duplicate check and the insert used to be inline here; they are not any more,
  // because a second surface would have had to reimplement all three.
  const result = await applyFollow({ email, game, cardSlug, cardName });

  if (!result.ok) {
    if (result.reason === 'cap_reached') {
      return json({
        error: `You have reached the maximum number of followed cards (${result.cap}). Remove one to add another.`,
        capReached: true
      }, 429);
    }
    if (result.reason === 'invalid_email') {
      return json({ error: 'A valid email is required' }, 400);
    }
    console.error('[card-follow] applyFollow failed:', result.reason);
    return json({ error: 'Could not save your follow. Please try again.' }, 500);
  }

  if (result.alreadyFollowing) {
    return json({ ok: true, alreadyFollowing: true, confirmed: !!result.confirmed });
  }

  const alertId      = (result.follow && result.follow.id) || null;
  const unsubToken   = (result.follow && result.follow.unsubscribe_token) || '';
  const confirmToken = result.confirmToken;

  const confirmUrl = `${SITE_ORIGIN}/api/confirm-follow?token=${encodeURIComponent(confirmToken)}`;
  const safeName   = esc(cardName || cardSlug);
  const imageUrl   = await getCardImage(game, cardSlug);

  await sendFollowEmail({
    to: result.account.email,   // the normalised address, not whatever casing was typed
    emailType: 'follow_confirm',
    alertId,
    subject: `Confirm your price alerts for ${cardName || cardSlug}`,
    html: `<p>Hi,</p>
<p>You asked for price alerts on <strong>${safeName}</strong> (${esc(GAME_LABELS[game] || game)}).</p>
${cardImageHtml(imageUrl, cardName || cardSlug)}
<p>Click below, then press the confirm button on the page that opens. Alerts only start once you have done that.</p>
<p><a href="${confirmUrl}" style="background:#C9A84C;color:#0A0C14;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block">Confirm my alerts</a></p>
<p>If you did not request this, just ignore this email. Nothing will happen and you will not be subscribed.</p>
<p>Manage all your follows any time at <a href="${SITE_ORIGIN}/account">your C3 account</a>.</p>
<p>The C3 Team</p>
${unsubscribeFooterHtml(unsubToken)}
<p style="font-size:11px;color:#999">Prices are estimates in AUD. See our <a href="${SITE_ORIGIN}/methodology">methodology</a> for how we source them.</p>`
  });

  return json({ ok: true, pendingConfirmation: true });
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

// --- PART A: confirm a follow. A GET is INERT; only a POST confirms. ---
//
// Mail security scanners (Outlook Safe Links, Defender, corporate gateways) prefetch every
// URL in an email. One auto-confirmed a live test follow 14 seconds after it was sent, with
// nobody clicking, which defeats double opt-in entirely. A GET now only renders a page with
// a button; nothing is written until that button POSTs.
async function handleConfirmFollow(req) {
  const url = new URL(req.url);
  const token = await readToken(req, url);

  if (!token) {
    return followMessage('Link not valid', 'That confirmation link is missing its token.', 400);
  }

  // A lookup failure is NOT the same as an unknown token. Saying "Link not valid" when
  // Supabase is down sends the user away for good on a link that was always fine.
  let row;
  try {
    row = await findFollowByConfirmToken(token);
  } catch (e) {
    console.error('[confirm-follow] lookup failed:', e.message);
    return followMessage('Something went wrong', 'We could not check that link just now. Your link is still good. Please try again shortly.', 503);
  }

  if (!row) {
    return followMessage('Link not valid', 'That confirmation link is not recognised. It may have already been used.', 404);
  }

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
  const ok = await confirmFollow(row.id);

  if (!ok) {
    console.error('[confirm-follow] confirm failed for follow', row.id);
    return followMessage('Something went wrong', 'We could not confirm your alerts just now. Please try the link again shortly.', 500);
  }

  return followPage('You are all set', `
<p>We will email you when <strong>${esc(name)}</strong> moves significantly in price.</p>
<p class="small">Manage all your follows any time at <a href="/account">your C3 account</a>.</p>
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

  const row = await findFollowByUnsubToken(token).catch(() => null);

  if (!row) {
    // Already gone is the outcome the user wanted, so say that rather than erroring.
    return followMessage('Already unsubscribed', 'That follow is no longer active, so there is nothing to unsubscribe from.');
  }

  const name = row.card_name || row.card_slug;

  if (row.unsubscribed_at) {
    return followMessage('Already unsubscribed', `You are not getting alerts for ${name}.`);
  }

  if (req.method !== 'POST') {
    return followPage('Unsubscribe', `
<p>Stop price alerts for <strong>${esc(name)}</strong>?</p>
<form method="POST" action="/api/unsubscribe-follow">
  <input type="hidden" name="token" value="${esc(token)}">
  <button type="submit">Yes, unsubscribe me</button>
</form>
<p class="small">Nothing changes until you press the button. The card stays in your followed list, we just stop emailing you about it.</p>`);
  }

  // SOFT delete (task-109). This used to DELETE the row outright, which destroyed the
  // relationship on what the user only ever asked to be an email preference ("Don't want
  // alerts for this card any more?"). The row is kept and simply excluded from sends.
  // A genuine hard delete is a separate, explicitly-labelled action on the my-follows page.
  const ok = await unsubscribeFollow(row.id);
  if (!ok) {
    console.error('[unsubscribe-follow] soft delete failed for follow', row.id);
    return followMessage('Something went wrong', 'We could not unsubscribe you just now. Please try the link again shortly.', 500);
  }

  await logEmail(row.email, 'follow_unsubscribe', row.id, true, null);
  return followMessage('You have been unsubscribed', `You have been unsubscribed from alerts for ${name}. It is still in your followed cards if you want to turn alerts back on later.`);
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

  const normalised = normaliseEmail(email);

  if (normalised) {
    // Look the account up, do NOT create one. This is an unverified entry point: anyone can
    // type any address into the form. Creating an account here would let a stranger populate
    // the accounts table with addresses that never confirmed ownership, which is exactly the
    // failure the reference doc's Section 8 warns about. Accounts are only ever created by a
    // real follow action (applyFollow).
    const found = await supabaseGet(
      `accounts?select=id&email=eq.${encodeURIComponent(normalised)}&limit=1`,
      true
    ).catch(() => []);

    const account = Array.isArray(found) && found.length ? found[0] : null;

    if (account) {
      const follows = await listFollows(account.id).catch(() => []);

      // Only actually send if there is something to show. The response never changes.
      if (follows.length > 0) {
        const token = await createMagicLink(account.id);
        if (token) {
          const link = `${SITE_ORIGIN}/api/my-follows?token=${encodeURIComponent(token)}`;
          await sendFollowEmail({
            to: normalised,
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

  // Resolve the token to a real account rather than to a raw email string.
  const resolved = await resolveMagicLink(token);

  if (resolved.status === 'unknown') {
    return followMessage('Link not valid', 'That link is not recognised. Request a new one from the manage page.', 404);
  }
  if (resolved.status === 'expired') {
    return followMessage('Link expired', `That link has expired. Links are valid for ${MAGIC_LINK_TTL_HOURS} hours. Request a new one.`, 410);
  }

  const account = resolved.account;

  // POST with an id is the HARD delete: "remove from my follows entirely". Deliberately a
  // POST, and deliberately scoped to this account's own rows, so a prefetching mail scanner
  // cannot destroy anything and a guessed id cannot delete someone else's follow.
  if (req.method === 'POST') {
    const form = await req.formData().catch(() => null);
    const removeId = form && form.get('remove');
    if (removeId) {
      const ok = await deleteFollow(account.id, String(removeId));
      if (!ok) {
        return followMessage('Something went wrong', 'We could not remove that card just now. Please try again shortly.', 500);
      }
      // Fall through and re-render the list, so the user sees the result immediately.
    }
  }

  const rows = await listFollows(account.id);

  if (rows.length === 0) {
    return followMessage('No followed cards', 'You are not following any cards right now.');
  }

  await touchAccount(account.id);

  const tier = await getTier(account.email);
  const cap  = capFor(tier);

  // Two distinct actions, never conflated:
  //   Turn off alerts  = soft delete, keeps the card in the list, stops the emails.
  //   Remove           = hard delete, drops the row and frees a cap slot.
  const items = rows.map(r => {
    const name = r.card_name || r.card_slug;
    const when = (r.created_at || '').slice(0, 10);
    const off  = !!r.unsubscribed_at;
    const status = off
      ? ' &middot; alerts off'
      : (r.confirmed ? '' : ' &middot; not yet confirmed');
    const alertAction = off
      ? ''
      : `<a href="/api/unsubscribe-follow?token=${encodeURIComponent(r.unsubscribe_token || '')}">Turn off alerts</a>`;
    return `<li>
  <span>
    <strong>${esc(name)}</strong><br>
    <span class="meta">${esc(GAME_LABELS[r.game] || r.game)} &middot; followed ${esc(when)}${status}</span>
  </span>
  <span>
    ${alertAction}
    <form method="POST" action="/api/my-follows?token=${encodeURIComponent(token)}" style="display:inline">
      <input type="hidden" name="remove" value="${esc(String(r.id))}">
      <button type="submit" style="background:none;border:none;color:#7a8099;text-decoration:underline;cursor:pointer;font-size:13px;padding:0 0 0 10px">Remove</button>
    </form>
  </span>
</li>`;
  }).join('');

  const capLine = cap === null
    ? ''
    : `<p class="small">${rows.length} of ${cap} followed.</p>`;

  return followPage('Your followed cards', `
<ul class="follows">${items}</ul>
${capLine}
<p class="small">Turning off alerts keeps the card here and stops the emails. Remove takes it off your list entirely.</p>`);
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

  const cards = await supabaseGet(query).catch(() => []);
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
  // GET renders a button, POST performs the action. Both methods reach the handler,
  // which is exactly what makes a mail scanner's GET prefetch inert.
  if (path === '/api/confirm-follow')     return handleConfirmFollow(req);
  if (path === '/api/unsubscribe-follow') return handleUnsubscribeFollow(req);
  if (path === '/api/my-follows') {
    // A POST WITHOUT a token is the "email me my follows" form (anti-enumeration, no account
    // is created). A POST WITH a token is an authenticated action on the magic-link page,
    // currently the hard delete. Both go to the handler that owns that surface.
    const hasToken = !!url.searchParams.get('token');
    if (req.method === 'POST' && !hasToken) return handleMyFollowsRequest(req);
    return handleMyFollows(req);
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
