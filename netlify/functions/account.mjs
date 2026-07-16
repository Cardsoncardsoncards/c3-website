// netlify/functions/account.mjs
// task-110: the /account dashboard. The return-visit hook: somewhere to come back to between
// alert emails, see what you track, and see how it has moved.
//
// Identity is entirely task-109's. This file adds NO second identity path: it resolves a
// session cookie, or it resolves a magic-link token (minting a session from it), or it shows
// the email form which triggers the same magic-link send card-api.mjs already owns.
//
// This page is noindex and is deliberately NOT in any sitemap. It is personalised and
// session-dependent, there is no public content here to index, and submitting it would
// undo the sitemap health work from tasks 84 to 107.

import {
  normaliseEmail,
  listFollows,
  countFollows,
  unsubscribeFollow,
  deleteFollow,
  createMagicLink,
  resolveMagicLink,
  getTier,
  capFor,
  MAGIC_LINK_TTL_HOURS,
} from './shared/accounts-core.mjs';

import {
  hasSessionSecret,
  createSession,
  getSessionFromRequest,
  sessionCookieHeader,
  clearSessionCookieHeader,
} from './shared/session.mjs';

// task-129: /account now uses the shared nav like every other dynamic page, instead of the
// old bespoke two-item .acct header. NAV_CSS is raw CSS (goes in <style>); navHtml() returns
// the full nav markup plus its own drawer script (goes right after <body>).
import { NAV_CSS, navHtml } from './shared/nav.mjs';

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const RESEND_API_KEY       = Netlify.env.get('RESEND_API_KEY');
const SITE_ORIGIN          = 'https://cardsoncardsoncards.com.au';

// Per-game card table + column map. Confirmed against the live schema (task-110 Part 0):
// every followable game has price_change_7d and price_change_30d. Only MTG differs on the
// image column, which is image_uri, not image_url. Movement coverage is per CARD, not per
// game (Star Wars has 7d on 29% of rows, DBS Fusion World 37%), so a missing value is
// rendered as "no data" rather than as a fabricated 0%.
const GAME_CARDS = {
  mtg:            { table: 'mtg_cards',            image: 'image_uri', label: 'MTG' },
  pokemon:        { table: 'pokemon_cards',        image: 'image_url', label: 'Pokemon' },
  lorcana:        { table: 'lorcana_cards',        image: 'image_url', label: 'Lorcana' },
  onepiece:       { table: 'onepiece_cards',       image: 'image_url', label: 'One Piece' },
  yugioh:         { table: 'yugioh_cards',         image: 'image_url', label: 'Yu-Gi-Oh' },
  dbsfusionworld: { table: 'dbsfusionworld_cards', image: 'image_url', label: 'DBS Fusion World' },
  starwars:       { table: 'starwars_cards',       image: 'image_url', label: 'Star Wars' },
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function sbGet(path) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      signal: ctrl.signal,
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    });
    clearTimeout(t);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    clearTimeout(t);
    return [];
  }
}

// Enriches each follow with live card data. Grouped by game so this is one query per game the
// person actually follows, not one per card.
async function enrichFollows(follows) {
  const byGame = new Map();
  for (const f of follows) {
    if (!GAME_CARDS[f.game]) continue;
    if (!byGame.has(f.game)) byGame.set(f.game, []);
    byGame.get(f.game).push(f.card_slug);
  }

  const cardIndex = new Map(); // "game:slug" -> card
  await Promise.all([...byGame.entries()].map(async ([game, slugs]) => {
    const cfg = GAME_CARDS[game];
    const list = slugs.map(s => `"${s}"`).join(',');
    const rows = await sbGet(
      `${cfg.table}?select=slug,name,set_name,price_aud,price_change_7d,price_change_30d,${cfg.image}` +
      `&slug=in.(${encodeURIComponent(list)})`
    );
    for (const r of (Array.isArray(rows) ? rows : [])) {
      // MTG has many printings per slug. Keep the dearest, matching how the sitemap and the
      // carousel already resolve an ambiguous MTG slug.
      const key = `${game}:${r.slug}`;
      const prev = cardIndex.get(key);
      if (!prev || (parseFloat(r.price_aud) || 0) > (parseFloat(prev.price_aud) || 0)) {
        cardIndex.set(key, { ...r, image: r[cfg.image] });
      }
    }
  }));

  return follows.map(f => ({ ...f, card: cardIndex.get(`${f.game}:${f.card_slug}`) || null }));
}

function movementHtml(value, label) {
  // A null is genuinely "we have no 7d figure for this card". Rendering it as 0% would be a
  // fabricated number, which is worse than an honest gap.
  if (value === null || value === undefined || value === '') {
    return `<span class="mv mv-none">${label} no data</span>`;
  }
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return `<span class="mv mv-none">${label} no data</span>`;
  const cls = n > 0 ? 'mv-up' : n < 0 ? 'mv-down' : 'mv-flat';
  const arrow = n > 0 ? '&#9650;' : n < 0 ? '&#9660;' : '';
  return `<span class="mv ${cls}">${label} ${arrow} ${Math.abs(n).toFixed(1)}%</span>`;
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------
function page(title, bodyHtml, { status = 200, cookie = null } = {}) {
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Robots-Tag': 'noindex',
    'Cache-Control': 'private, no-store',
  };
  if (cookie) headers['Set-Cookie'] = cookie;

  return new Response(`<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | Cards on Cards on Cards</title>
<meta name="description" content="Your C3 account. See the cards you follow, how their prices have moved, and manage your alerts.">
<meta name="robots" content="noindex, nofollow">
<link rel="canonical" href="${SITE_ORIGIN}/account">
<link rel="icon" href="/c3logo.png" type="image/png">
<meta property="og:title" content="Your C3 Account">
<meta property="og:description" content="Your C3 account. See the cards you follow, how their prices have moved, and manage your alerts.">
<meta property="og:image" content="${SITE_ORIGIN}/c3-og-banner.png">
<meta property="og:type" content="website">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#080a0f;--bg2:#0e1118;--gold:#C9A84C;--gold-lit:#E8C86A;--silver:#A0A8C0;--white:#F0F2FF;--border:#1e2235;--text2:#7a8099}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--white);font-family:'DM Sans',sans-serif;line-height:1.7}
a{color:var(--gold);text-decoration:none}
a:hover{color:var(--gold-lit)}
main{max-width:960px;margin:0 auto;padding:40px 20px 24px}
h1{font-family:'Cinzel',serif;font-size:28px;font-weight:700;margin-bottom:8px}
.whoami{font-size:14px;color:var(--silver);margin-bottom:4px}
.whoami strong{color:var(--white)}
.signout{font-size:12px;color:var(--text2);text-decoration:underline}
.capline{font-size:13px;color:var(--silver);margin:18px 0 14px;padding-bottom:14px;border-bottom:1px solid var(--border)}

.follow{display:flex;gap:14px;align-items:center;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px}
.follow img.art{width:64px;height:90px;object-fit:contain;border-radius:6px;background:#0d0f1a;flex-shrink:0}
.follow .noart{width:64px;height:90px;border-radius:6px;background:#0d0f1a;flex-shrink:0}
.fmeta{flex:1;min-width:0}
.fname{font-weight:600;font-size:15px;color:var(--white)}
.fsub{font-size:12px;color:var(--text2);margin-top:2px}
.fprice{font-size:15px;font-weight:700;color:var(--white);margin-top:6px}
.mv{font-size:11px;font-weight:700;margin-right:10px}
.mv-up{color:#4ADE80}.mv-down{color:#F87171}.mv-flat{color:var(--text2)}.mv-none{color:var(--text2);font-weight:500}
.factions{display:flex;flex-direction:column;gap:6px;flex-shrink:0}
.btn{font-size:12px;font-weight:600;padding:7px 12px;border-radius:7px;border:1px solid var(--border);background:none;color:var(--silver);cursor:pointer;white-space:nowrap;font-family:inherit}
.btn:hover{border-color:var(--gold);color:var(--white)}
.btn-remove{color:#F87171;border-color:rgba(248,113,113,.35)}
.btn-remove:hover{border-color:#F87171;color:#F87171}
.alerts-off{font-size:11px;color:var(--text2);text-align:center}

.empty{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:36px 24px;text-align:center}
.empty p{color:var(--silver);margin-bottom:16px}

.explore{display:flex;gap:8px;flex-wrap:wrap;margin:28px 0 24px}
.pill{display:inline-flex;align-items:center;padding:6px 12px;border-radius:7px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;border:1px solid}
.pill--compare{color:#A78BFA;border-color:rgba(167,139,250,.35)}
.pill--compare:hover{background:rgba(167,139,250,.08);border-color:#A78BFA;color:#A78BFA}
.pill--market{color:#4ADE80;border-color:rgba(74,222,128,.35)}
.pill--market:hover{background:rgba(74,222,128,.08);border-color:#4ADE80;color:#4ADE80}
.pill--calendar{color:#F87171;border-color:rgba(248,113,113,.35)}
.pill--calendar:hover{background:rgba(248,113,113,.08);border-color:#F87171;color:#F87171}

.digest{background:rgba(201,168,76,.07);border:1px solid var(--gold);border-radius:12px;padding:22px;text-align:center;margin-bottom:32px}
.digest h2{font-family:'Cinzel',serif;font-size:17px;color:var(--gold-lit);margin-bottom:8px}
.digest p{font-size:14px;color:var(--silver);margin-bottom:14px}
.digest button{background:var(--gold);color:#080a0f;font-weight:600;font-size:13px;padding:10px 22px;border-radius:8px;border:none;cursor:pointer;font-family:inherit}
.digest button:hover{background:var(--gold-lit)}
.digest .msg{font-size:12px;margin-top:10px;color:var(--silver)}

form.signin{max-width:380px;margin:0 auto}
input[type=email]{width:100%;padding:11px 13px;border-radius:8px;border:1px solid #242840;background:#0d1117;color:#e8eaf0;font-size:14px;margin-bottom:10px;font-family:inherit}
button.primary{background:var(--gold);color:#080a0f;border:none;padding:11px 22px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit}
.small{font-size:12px;color:var(--text2)}
footer{border-top:1px solid var(--border);padding:24px 20px 40px;text-align:center;font-size:12px;color:var(--text2)}

@media (max-width:768px){
  main{padding:28px 16px 20px}
  h1{font-size:22px}
  .follow{flex-wrap:wrap;gap:10px}
  .factions{flex-direction:row;width:100%}
  .btn{flex:1;text-align:center}
}

/* Shared nav (single source of truth: netlify/functions/shared/nav.mjs) */
${NAV_CSS}
</style>
</head>
<body>
${navHtml()}
<main>
${bodyHtml}
</main>
<footer>
  Cards on Cards on Cards, Australian TCG prices and intelligence.<br>
  Prices are indicative AUD estimates and move constantly. See our <a href="/methodology">methodology</a>.
</footer>
</body>
</html>`, { status, headers });
}

// ---------------------------------------------------------------------------
// Signed-out state: email form. Sending is card-api.mjs's job, so this posts there and does
// not duplicate the magic-link send (or the anti-enumeration behaviour that guards it).
// ---------------------------------------------------------------------------
function signedOutPage(note = '') {
  const secretWarning = hasSessionSecret()
    ? ''
    : `<p class="small" style="color:#F87171">Sessions are not configured on this deployment, so you will need a fresh link each visit.</p>`;

  return page('Sign in to your C3 account', `
<h1>Your C3 Account</h1>
<p class="whoami">Follow cards, get price alerts, and see everything you track in one place. No password, ever.</p>
${note ? `<p class="small" style="color:#4ADE80;margin:12px 0">${esc(note)}</p>` : ''}
<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:28px;margin-top:22px">
  <form class="signin" method="POST" action="/api/my-follows">
    <input type="email" name="email" placeholder="you@example.com" required autocomplete="email">
    <button class="primary" type="submit">Email me a sign in link</button>
  </form>
  <p class="small" style="text-align:center;margin-top:12px">We will email you a link. It works for ${MAGIC_LINK_TTL_HOURS} hours.</p>
  ${secretWarning}
</div>
<div class="explore" style="justify-content:center;margin-top:26px">
  <a href="/compare"  class="pill pill--compare">Compare</a>
  <a href="/market"   class="pill pill--market">Market</a>
  <a href="/calendar" class="pill pill--calendar">Calendar</a>
</div>`);
}

// ---------------------------------------------------------------------------
// Signed-in dashboard
// ---------------------------------------------------------------------------
async function dashboard(account, { cookie = null } = {}) {
  const raw  = await listFollows(account.uid || account.id);
  const rows = await enrichFollows(raw);

  const tier = await getTier(account.email);
  const cap  = capFor(tier);

  const capLine = cap === null
    ? `<p class="capline">${rows.length} card${rows.length === 1 ? '' : 's'} followed.</p>`
    : `<p class="capline">${rows.length} of ${cap} cards followed.</p>`;

  let listHtml;

  if (rows.length === 0) {
    // Empty state. The Card Vault link lives ONLY here: once someone has follows, a permanent
    // "go browse" link would compete with the list it is sitting next to.
    listHtml = `
<div class="empty">
  <p>You are not following any cards yet. Follow a card and we will email you when its price moves.</p>
  <a href="/cards" class="pill pill--compare" style="color:#C9A84C;border-color:rgba(201,168,76,.35)">Browse the Card Vault</a>
</div>`;
  } else {
    listHtml = rows.map(f => {
      const c    = f.card;
      const name = esc(f.card_name || (c && c.name) || f.card_slug);
      const cfg  = GAME_CARDS[f.game];
      const label = cfg ? cfg.label : f.game;
      const setName = c && c.set_name ? esc(c.set_name) : '';
      const price = c && c.price_aud != null && parseFloat(c.price_aud) > 0
        ? `AU$${parseFloat(c.price_aud).toFixed(2)}`
        : 'Price unavailable';

      const art = c && c.image
        ? `<img class="art" src="${esc(c.image)}" alt="${name}" loading="lazy">`
        : `<div class="noart"></div>`;

      const movement = c
        ? `${movementHtml(c.price_change_7d, '7d')}${movementHtml(c.price_change_30d, '30d')}`
        : '';

      const off = !!f.unsubscribed_at;

      // Two clearly labelled buttons, both always visible, never a menu or an icon. They do
      // genuinely different things and the labels say which.
      const stopBtn = off
        ? `<span class="alerts-off">Alerts off</span>`
        : `<form method="POST" action="/account" style="display:contents">
             <input type="hidden" name="action" value="stop">
             <input type="hidden" name="id" value="${esc(String(f.id))}">
             <button class="btn" type="submit">Stop alerts</button>
           </form>`;

      return `
<div class="follow">
  ${art}
  <div class="fmeta">
    <a href="/cards/${esc(f.game)}/${esc(f.card_slug)}" class="fname">${name}</a>
    <div class="fsub">${esc(label)}${setName ? ' &middot; ' + setName : ''}${f.confirmed ? '' : ' &middot; not yet confirmed'}</div>
    <div class="fprice">${price}</div>
    <div>${movement}</div>
  </div>
  <div class="factions">
    ${stopBtn}
    <form method="POST" action="/account" style="display:contents">
      <input type="hidden" name="action" value="remove">
      <input type="hidden" name="id" value="${esc(String(f.id))}">
      <button class="btn btn-remove" type="submit">Remove</button>
    </form>
  </div>
</div>`;
    }).join('');
  }

  const body = `
<h1>Your C3 Account</h1>
<p class="whoami">Signed in as <strong>${esc(account.email)}</strong> &middot;
  <a class="signout" href="/account?signout=1">Not you? Sign in with a different email</a></p>
${capLine}
${listHtml}

<div class="explore">
  <a href="/compare"  class="pill pill--compare">Compare</a>
  <a href="/market"   class="pill pill--market">Market</a>
  <a href="/calendar" class="pill pill--calendar">Calendar</a>
</div>

<div class="digest">
  <h2>Want the bigger picture too?</h2>
  <p>Get the free weekly digest of buy and sell signals across every game you track.</p>
  <button type="button" id="digest-btn">Get the free digest</button>
  <div class="msg" id="digest-msg"></div>
</div>

<script>
(function(){
  var b = document.getElementById('digest-btn');
  var m = document.getElementById('digest-msg');
  if (!b) return;
  b.addEventListener('click', function(){
    b.disabled = true; m.textContent = 'Signing you up...';
    fetch('/.netlify/functions/email-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ${JSON.stringify(account.email)} })
    }).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(d){
      if (r.ok) { m.style.color = '#4ADE80'; m.textContent = 'You are on the list. The digest lands Sunday morning.'; b.style.display='none'; }
      else { m.style.color = '#F87171'; m.textContent = (d && d.error) || 'Something went wrong.'; b.disabled = false; }
    }); }).catch(function(){
      m.style.color = '#F87171'; m.textContent = 'Something went wrong.'; b.disabled = false;
    });
  });
})();
</script>`;

  return page('Your C3 Account', body, { cookie });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async (req) => {
  const url = new URL(req.url);

  // Explicit sign out: clear the cookie, land back on the email form.
  if (url.searchParams.get('signout')) {
    return page('Signed out', `
<h1>Signed out</h1>
<p class="whoami">You have been signed out on this device.</p>
<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:28px;margin-top:22px">
  <form class="signin" method="POST" action="/api/my-follows">
    <input type="email" name="email" placeholder="you@example.com" required autocomplete="email">
    <button class="primary" type="submit">Email me a sign in link</button>
  </form>
</div>`, { cookie: clearSessionCookieHeader() });
  }

  // Arriving from a magic link: verify the token, mint the 30 day session, show the dashboard.
  // The token itself stays single-action; the session is what makes return visits work.
  const token = url.searchParams.get('token');
  if (token) {
    const resolved = await resolveMagicLink(token);
    if (resolved.status === 'expired') {
      return signedOutPage('That link has expired. Enter your email and we will send a fresh one.');
    }
    if (resolved.status !== 'ok') {
      return signedOutPage('That link is not valid. Enter your email and we will send a fresh one.');
    }
    const cookie = hasSessionSecret()
      ? sessionCookieHeader(await createSession(resolved.account))
      : null; // fail closed: no secret, no cookie, they simply get a fresh link next visit
    return dashboard(
      { uid: resolved.account.id, email: resolved.account.email },
      { cookie }
    );
  }

  const session = await getSessionFromRequest(req);

  // POST actions require a session. A magic-link token is not accepted here: destructive
  // actions should not be reachable from a URL sitting in an inbox.
  if (req.method === 'POST') {
    if (!session) return signedOutPage('Please sign in again to manage your cards.');

    const form   = await req.formData().catch(() => null);
    const action = form && form.get('action');
    const id     = form && form.get('id');

    if (action && id) {
      if (action === 'stop') {
        await unsubscribeFollow(String(id));      // soft delete, row stays
      } else if (action === 'remove') {
        await deleteFollow(session.uid, String(id)); // hard delete, scoped to this account
      }
    }
    return dashboard(session);
  }

  if (!session) return signedOutPage();

  return dashboard(session);
};

export const config = { path: '/account' };
