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
  getAccountByEmail,
  createAccountWithPassword,
  setPasswordHash,
} from './shared/accounts-core.mjs';

// task-129 Part 2: password auth. Hashing via Node's built-in scrypt (no new dependency).
import { hashPassword, verifyPassword, passwordProblem } from './shared/password.mjs';

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

// task-135: the 32-game map, shared with card-api.mjs. Replaces account.mjs's old 7-game
// GAME_CARDS so enrichFollows can render followed cards for every game, not just the original 7.
import { GAME_TABLES, GAME_IMAGE_COL, GAME_LABELS } from './shared/game-meta.mjs';

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const RESEND_API_KEY       = Netlify.env.get('RESEND_API_KEY');
const SITE_ORIGIN          = 'https://cardsoncardsoncards.com.au';

// task-129 Part 5: master admin allowlist. ADMIN_EMAILS is a comma-separated env var read
// SERVER-SIDE ONLY (this file is a serverless function, never shipped to the browser). It
// defaults to the owner address when the env var is unset, so admin works out of the box and
// can be widened without a code change. Access is gated by matching the SESSION email against
// this set on the server (see the /account/admin branch); there is no client-side hiding.
const ADMIN_EMAILS = new Set(
  (Netlify.env.get('ADMIN_EMAILS') || 'ccc.squadhelp@gmail.com')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
);
function isAdmin(email) {
  return typeof email === 'string' && ADMIN_EMAILS.has(email.trim().toLowerCase());
}

// task-135: the per-game table/image/label map now comes from shared/game-meta.mjs (GAME_TABLES,
// GAME_IMAGE_COL, GAME_LABELS), covering all 32 games. It replaced the old 7-game GAME_CARDS here.
// Every game's table carries name, set_name, price_aud, price_change_7d, price_change_30d and its
// image column (verified live), so the enrich SELECT below is valid for all of them. Movement
// coverage is per CARD, so a missing value renders as "no data", never a fabricated 0%.

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
    if (!GAME_TABLES[f.game]) continue; // still guards a genuinely unknown game; all 32 are known
    if (!byGame.has(f.game)) byGame.set(f.game, []);
    byGame.get(f.game).push(f.card_slug);
  }

  const cardIndex = new Map(); // "game:slug" -> card
  await Promise.all([...byGame.entries()].map(async ([game, slugs]) => {
    const table    = GAME_TABLES[game];
    const imageCol = GAME_IMAGE_COL[game];
    const list = slugs.map(s => `"${s}"`).join(',');
    const rows = await sbGet(
      `${table}?select=slug,name,set_name,price_aud,price_change_7d,price_change_30d,${imageCol}` +
      `&slug=in.(${encodeURIComponent(list)})`
    );
    for (const r of (Array.isArray(rows) ? rows : [])) {
      // MTG has many printings per slug. Keep the dearest, matching how the sitemap and the
      // carousel already resolve an ambiguous MTG slug.
      const key = `${game}:${r.slug}`;
      const prev = cardIndex.get(key);
      if (!prev || (parseFloat(r.price_aud) || 0) > (parseFloat(prev.price_aud) || 0)) {
        cardIndex.set(key, { ...r, image: r[imageCol] });
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
// task-129 Part 2: account email + login rate limiting
// ---------------------------------------------------------------------------

// createMagicLink() only mints the token row; sending is the caller's job (same split card-api
// uses). This sends the confirm/reset link through Resend, so no raw provider email reaches a
// user unbranded.
const RESEND_FROM = 'C3 Accounts <alerts@cardsoncardsoncards.com.au>';
async function sendAccountEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) { console.error('[account] RESEND_API_KEY missing, cannot send'); return false; }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + RESEND_API_KEY },
      body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html }),
    });
    clearTimeout(t);
    if (!res.ok) { console.error('[account] Resend error', res.status); return false; }
    return true;
  } catch (e) { clearTimeout(t); console.error('[account] Resend fetch failed', e.message); return false; }
}

// Login rate limiting. Per-email in-memory counter on a rolling window. This is a per-instance
// limiter (serverless instances are short-lived and not shared), which blunts casual brute force
// at current scale; a DB-backed counter is the upgrade if login traffic ever justifies it.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX       = 8;
const loginAttempts = new Map(); // email -> { count, resetAt }
function loginBlocked(email) {
  const rec = loginAttempts.get(email);
  if (!rec) return false;
  if (Date.now() > rec.resetAt) { loginAttempts.delete(email); return false; }
  return rec.count >= LOGIN_MAX;
}
function recordFailedLogin(email) {
  const now = Date.now();
  const rec = loginAttempts.get(email);
  if (!rec || now > rec.resetAt) { loginAttempts.set(email, { count: 1, resetAt: now + LOGIN_WINDOW_MS }); return; }
  rec.count += 1;
}
function clearLoginAttempts(email) { loginAttempts.delete(email); }

// Mints a magic-link token and emails it, framed as confirm (sign-up) or reset (forgot). The
// underlying magic-link infra (follow_magic_links + resolveMagicLink) is UNCHANGED and shared;
// only the presentation differs. Reset links carry &reset=1 so the handler shows the set-password
// form; confirm links land on the dashboard.
async function sendLinkEmail(account, kind) {
  const token = await createMagicLink(account.id);
  if (!token) return false;
  const reset = kind === 'reset';
  const link  = `${SITE_ORIGIN}/account?token=${encodeURIComponent(token)}${reset ? '&reset=1' : ''}`;
  const subject = reset ? 'Reset your C3 password' : 'Confirm your C3 account';
  const intro   = reset
    ? 'You asked to reset your C3 password. Click below to set a new one.'
    : 'Welcome to C3. Click below to confirm your account and finish signing up.';
  const btnText = reset ? 'Set a new password' : 'Confirm my account';
  return sendAccountEmail({
    to: account.email,
    subject,
    html: `<p>Hi,</p><p>${intro}</p>
<p><a href="${link}" style="background:#C9A84C;color:#0A0C14;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block">${btnText}</a></p>
<p>If you did not request this, you can safely ignore this email.</p>
<p>The C3 Team</p>`,
  });
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
.sortbar{display:flex;align-items:center;gap:8px;margin:0 0 14px}
.sortbar label{color:var(--text2)}
#follow-sort{background:#0d1117;border:1px solid #242840;color:#e8eaf0;border-radius:8px;padding:7px 10px;font-size:13px;font-family:inherit;cursor:pointer}

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
input[type=email],input[type=password]{width:100%;padding:11px 13px;border-radius:8px;border:1px solid #242840;background:#0d1117;color:#e8eaf0;font-size:14px;margin-bottom:10px;font-family:inherit}
button.primary{background:var(--gold);color:#080a0f;border:none;padding:11px 22px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;width:100%}
.small{font-size:12px;color:var(--text2)}

/* task-129: password auth panel (login / create / forgot), one visible at a time */
.auth-form{display:none;flex-direction:column}
.auth[data-mode="login"] .auth-login{display:flex}
.auth[data-mode="signup"] .auth-signup{display:flex}
.auth[data-mode="forgot"] .auth-forgot{display:flex}
.auth-h{font-family:'Cinzel',serif;font-size:18px;margin-bottom:12px}
.auth-alt{font-size:12px;color:var(--text2);margin-top:10px}
.auth-note{font-size:13px;margin-bottom:12px}

/* task-129 Part 4: combined page (subscribe left / auth right) */
.combined{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:22px}
.panel{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:28px}
.benefits{list-style:none;margin:0 0 18px;padding:0}
.benefits li{font-size:13px;color:var(--silver);padding:5px 0 5px 22px;position:relative}
.benefits li::before{content:"\\2713";color:var(--gold);position:absolute;left:0;font-weight:700}
.ck{display:block;font-size:13px;color:var(--white);margin:10px 0;cursor:pointer}
.ck input{margin-right:8px}
.ck-d{display:block;font-size:11px;color:var(--text2);margin:2px 0 0 24px}
input[type=text]{width:100%;padding:11px 13px;border-radius:8px;border:1px solid #242840;background:#0d1117;color:#e8eaf0;font-size:14px;margin-bottom:10px;font-family:inherit}
.form-msg{font-size:12px;margin-top:10px;min-height:16px;color:var(--silver)}
.support-c3{margin:0 0 16px}
.support-c3 a{background:var(--gold);color:#080a0f;padding:9px 20px;border-radius:20px;font-weight:700;text-decoration:none;font-size:13px;display:inline-block}
.support-c3 a:hover{background:var(--gold-lit)}
@media (max-width:768px){ .combined{grid-template-columns:1fr} }

/* task-129 Part 5: admin tables */
.admin-t{width:100%;border-collapse:collapse;font-size:13px}
.admin-t th,.admin-t td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--border);white-space:nowrap}
.admin-t th{color:var(--text2);font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.05em}
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
  <div class="support-c3"><a href="https://buy.stripe.com/3cIdR836CeXk95C475aIM02" target="_blank" rel="noopener">&#10084;&#65039; Support C3</a></div>
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
// The password auth panel: login (default), create-account, and forgot-password, one shown at a
// time via a tiny toggle. Reused by the signed-out combined page (Part 4). `note` is an inline
// message; `noteColor` distinguishes an error (red) from an ok/info message (green).
function authPanel(mode = 'login', note = '', noteColor = '#F87171') {
  const noteHtml = note ? `<p class="auth-note" style="color:${noteColor}">${esc(note)}</p>` : '';
  return `
<div class="auth" data-mode="${esc(mode)}">
  ${noteHtml}
  <form class="auth-form auth-login" method="POST" action="/account">
    <input type="hidden" name="action" value="login">
    <h2 class="auth-h">Log in</h2>
    <input type="email" name="email" placeholder="you@example.com" required autocomplete="email">
    <input type="password" name="password" placeholder="Password" required autocomplete="current-password">
    <button class="primary" type="submit">Log in</button>
    <p class="auth-alt"><a href="#" data-auth="forgot">Forgot password?</a></p>
    <p class="auth-alt">New to C3? <a href="#" data-auth="signup">Create an account</a></p>
  </form>
  <form class="auth-form auth-signup" method="POST" action="/account">
    <input type="hidden" name="action" value="signup">
    <h2 class="auth-h">Create your account</h2>
    <input type="email" name="email" placeholder="you@example.com" required autocomplete="email">
    <input type="password" name="password" placeholder="Password (min 8 characters)" required autocomplete="new-password" minlength="8">
    <input type="password" name="confirm" placeholder="Confirm password" required autocomplete="new-password">
    <button class="primary" type="submit">Create account</button>
    <p class="auth-alt">Already have an account? <a href="#" data-auth="login">Log in</a></p>
  </form>
  <form class="auth-form auth-forgot" method="POST" action="/account">
    <input type="hidden" name="action" value="forgot">
    <h2 class="auth-h">Reset your password</h2>
    <input type="email" name="email" placeholder="you@example.com" required autocomplete="email">
    <button class="primary" type="submit">Email me a reset link</button>
    <p class="auth-alt"><a href="#" data-auth="login">Back to log in</a></p>
  </form>
  <script>
  (function(){
    var box = document.currentScript.parentNode;
    box.addEventListener('click', function(e){
      var t = e.target.closest('[data-auth]'); if(!t) return;
      e.preventDefault(); box.setAttribute('data-mode', t.getAttribute('data-auth'));
    });
  })();
  </script>
</div>`;
}

// task-129 Part 4: the combined signed-out page. LEFT = free email-updates subscribe block
// (the old /subscribe content, folded in here); RIGHT = password auth (login / create / forgot).
// Copy is deliberately governing-plan-safe: this is FREE updates, no paid tier is claimed or
// implied (the paid tier is gated behind AU sold-data on 1,000+ Core cards, not yet live).
function signedOutPage(note = '', mode = 'login') {
  const secretWarning = hasSessionSecret()
    ? ''
    : `<p class="small" style="color:#F87171;margin-top:12px">Sessions are not configured on this deployment, so login cannot persist yet.</p>`;
  return page('Your C3 Account', `
<h1>Your C3 Account</h1>
<p class="whoami">Free to use. Create an account to follow cards and get price alerts, or subscribe for email updates as C3 grows.</p>
<div class="combined">
  <div class="panel">
    <h2 class="auth-h">Free email updates</h2>
    <p class="small" style="margin-bottom:14px">Everything on C3 is free today. Tell us what you want to hear about as it grows.</p>
    <ul class="benefits">
      <li>All prices and card pages, every game</li>
      <li>14-day price history charts</li>
      <li>3 active price alerts</li>
      <li>Collection tracker for up to 100 cards</li>
      <li>All tools and play features</li>
      <li>Optional weekly digest email</li>
    </ul>
    <form id="sub-form" novalidate>
      <input type="text" id="sub-name" name="name" placeholder="Your name" autocomplete="name" required>
      <input type="email" id="sub-email" name="email" placeholder="you@example.com" autocomplete="email" required>
      <label class="ck"><input type="checkbox" name="interest" value="Market Intelligence"> Market Intelligence<span class="ck-d">Weekly AU TCG market signals and movers.</span></label>
      <label class="ck"><input type="checkbox" name="interest" value="Collection Tools"> Collection Tools<span class="ck-d">Advanced collection tracking and valuation.</span></label>
      <button type="submit" class="primary" id="sub-submit">Subscribe for Free Updates</button>
      <div class="form-msg" id="sub-msg"></div>
    </form>
    <script>
    (function(){
      var form = document.getElementById('sub-form'); if(!form) return;
      form.addEventListener('submit', async function(e){
        e.preventDefault();
        var btn = document.getElementById('sub-submit'), msg = document.getElementById('sub-msg');
        var name = document.getElementById('sub-name').value.trim();
        var email = document.getElementById('sub-email').value.trim();
        if(!name || !email){ msg.style.color='#F87171'; msg.textContent='Name and email are required.'; return; }
        var interests = [].map.call(document.querySelectorAll('input[name="interest"]:checked'), function(c){ return c.value; });
        btn.disabled = true; msg.style.color='var(--silver)'; msg.textContent='Signing you up...';
        try {
          var r = await fetch('/api/register-interest', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: name, email: email, interests: interests }) });
          if(r.ok){ msg.style.color='#4ADE80'; msg.textContent='Thanks! We will notify you as C3 grows.'; form.reset(); }
          else { msg.style.color='#F87171'; msg.textContent='Something went wrong. Please try again.'; btn.disabled=false; }
        } catch(_){ msg.style.color='#F87171'; msg.textContent='Something went wrong. Please try again.'; btn.disabled=false; }
      });
    })();
    </script>
  </div>
  <div class="panel">
    ${authPanel(mode, note)}
    ${secretWarning}
  </div>
</div>
<div class="explore" style="margin-top:26px">
  <a href="/compare"  class="pill pill--compare">Compare</a>
  <a href="/market"   class="pill pill--market">Market</a>
  <a href="/calendar" class="pill pill--calendar">Calendar</a>
</div>`);
}

// The reset link mints a session, then lands here so the user can pick a new password.
function setPasswordPage(account, { cookie = null, note = '' } = {}) {
  return page('Set a new password', `
<h1>Set a new password</h1>
<p class="whoami">Signed in as <strong>${esc(account.email)}</strong>. Choose a new password below.</p>
${note ? `<p class="small" style="color:#F87171;margin:12px 0">${esc(note)}</p>` : ''}
<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:28px;margin-top:22px;max-width:420px">
  <form class="signin" method="POST" action="/account">
    <input type="hidden" name="action" value="setpw">
    <input type="password" name="password" placeholder="New password (min 8 characters)" required autocomplete="new-password" minlength="8">
    <input type="password" name="confirm" placeholder="Confirm new password" required autocomplete="new-password">
    <button class="primary" type="submit">Set new password</button>
  </form>
</div>`, { cookie });
}

// "Check your email" confirmation shown after sign-up and forgot-password (identical for forgot,
// to avoid revealing whether an email is registered).
function checkEmailPage(heading, message) {
  return page(heading, `
<h1>${esc(heading)}</h1>
<p class="whoami">${esc(message)}</p>
<p class="small" style="margin-top:12px">The link works for ${MAGIC_LINK_TTL_HOURS} hours. You can close this tab.</p>`);
}

// ---------------------------------------------------------------------------
// Signed-in dashboard
// ---------------------------------------------------------------------------
async function dashboard(account, { cookie = null } = {}) {
  const raw  = await listFollows(account.uid || account.id);
  const rows = await enrichFollows(raw);

  const tier = await getTier(account.email);
  const cap  = capFor(tier);

  // task-132 Part 7: has this account already subscribed to the weekly digest? If so, the CTA is
  // replaced by a confirmation, so it stops re-prompting every visit.
  const digestRows = await sbGet(`accounts?select=digest_subscribed&id=eq.${encodeURIComponent(account.uid || account.id)}&limit=1`);
  const digestSubscribed = Array.isArray(digestRows) && digestRows[0] ? !!digestRows[0].digest_subscribed : false;

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
      const label = GAME_LABELS[f.game] || f.game;
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

      // task-132 Part 6: per-row sort keys for the client-side sort control. Missing values are
      // rendered as '' and always sort last. All of these come from enrichFollows already, so no
      // extra query is needed.
      const sName  = (f.card_name || (c && c.name) || f.card_slug || '').toLowerCase();
      const sPrice = (c && c.price_aud != null && parseFloat(c.price_aud) > 0) ? parseFloat(c.price_aud) : '';
      const s7     = (c && c.price_change_7d  != null && Number.isFinite(parseFloat(c.price_change_7d)))  ? parseFloat(c.price_change_7d)  : '';
      const s30    = (c && c.price_change_30d != null && Number.isFinite(parseFloat(c.price_change_30d))) ? parseFloat(c.price_change_30d) : '';

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
<div class="follow" data-name="${esc(sName)}" data-price="${sPrice}" data-ch7="${s7}" data-ch30="${s30}">
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
${rows.length > 1 ? `
<div class="sortbar">
  <label for="follow-sort" class="small">Sort</label>
  <select id="follow-sort">
    <option value="added">Recently added</option>
    <option value="az">Name A to Z</option>
    <option value="price-hi">Price high to low</option>
    <option value="price-lo">Price low to high</option>
    <option value="mv7-up">Biggest 7d gainers</option>
    <option value="mv7-dn">Biggest 7d fallers</option>
    <option value="mv30-up">Biggest 30d gainers</option>
    <option value="mv30-dn">Biggest 30d fallers</option>
  </select>
</div>` : ''}
<div id="follow-list">${listHtml}</div>
${rows.length > 1 ? `
<script>
(function(){
  var sel=document.getElementById('follow-sort'), list=document.getElementById('follow-list');
  if(!sel||!list) return;
  var orig=[].slice.call(list.querySelectorAll('.follow'));
  function num(el,a){ var v=el.getAttribute(a); return (v===''||v==null)?NaN:parseFloat(v); }
  function byNum(attr,up){ return function(a,b){ var x=num(a,attr),y=num(b,attr);
    if(isNaN(x)&&isNaN(y))return 0; if(isNaN(x))return 1; if(isNaN(y))return -1; return up?(y-x):(x-y); }; }
  sel.addEventListener('change', function(){
    var v=sel.value, arr=orig.slice();
    if(v==='az') arr.sort(function(a,b){ return (a.getAttribute('data-name')||'').localeCompare(b.getAttribute('data-name')||''); });
    else if(v==='price-hi') arr.sort(byNum('data-price',true));
    else if(v==='price-lo') arr.sort(byNum('data-price',false));
    else if(v==='mv7-up')  arr.sort(byNum('data-ch7',true));
    else if(v==='mv7-dn')  arr.sort(byNum('data-ch7',false));
    else if(v==='mv30-up') arr.sort(byNum('data-ch30',true));
    else if(v==='mv30-dn') arr.sort(byNum('data-ch30',false));
    // 'added' keeps the original (created_at desc) order.
    arr.forEach(function(el){ list.appendChild(el); });
  });
})();
</script>` : ''}

<div class="explore">
  <a href="/compare"  class="pill pill--compare">Compare</a>
  <a href="/market"   class="pill pill--market">Market</a>
  <a href="/calendar" class="pill pill--calendar">Calendar</a>
</div>

${digestSubscribed ? `
<div class="digest">
  <h2>You are getting the weekly digest</h2>
  <p>Buy and sell signals across every game you track land in your inbox on Sunday mornings.</p>
</div>` : `
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
</script>`}`;

  return page('Your C3 Account', body, { cookie });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// task-129 Part 5: master admin view.
//
// SECURITY: this renders REAL USER PII, every account email and every follow. It MUST stay
// gated by the server-side session-email check against ADMIN_EMAILS (see the /account/admin
// branch in the handler). It must NEVER be linked from a public page, the nav, or a sitemap,
// and the gate must remain a server refusal, not a hidden client-side link. Do not add a
// "you must be admin" hint to non-admins either: they get a plain 404.
// ---------------------------------------------------------------------------
async function adminView(session) {
  const accounts = await sbGet('accounts?select=id,email,created_at,last_seen_at&order=created_at.desc&limit=1000');
  const follows  = await sbGet('follows?select=user_id,game,card_slug,card_name,alert_types,confirmed,created_at&order=created_at.desc&limit=2000');
  const acc = Array.isArray(accounts) ? accounts : [];
  const fol = Array.isArray(follows)  ? follows  : [];

  const acctRows = acc.map(a =>
    `<tr><td>${esc(a.email)}</td><td>${esc((a.created_at || '').slice(0, 10))}</td><td>${esc((a.last_seen_at || '').slice(0, 10))}</td></tr>`
  ).join('');

  const emailById = new Map(acc.map(a => [a.id, a.email]));
  const followRows = fol.map(f => {
    const alerts = Array.isArray(f.alert_types) ? f.alert_types.join(', ') : (f.alert_types || '');
    return `<tr><td>${esc(emailById.get(f.user_id) || f.user_id)}</td><td>${esc(f.game)}</td><td>${esc(f.card_name || f.card_slug)}</td><td>${esc(alerts)}</td><td>${f.confirmed ? 'yes' : 'no'}</td></tr>`;
  }).join('');

  return page('Admin', `
<h1>Admin</h1>
<p class="whoami">Signed in as <strong>${esc(session.email)}</strong> (admin) &middot; <a class="signout" href="/account">Back to your account</a></p>
<p class="small" style="color:#F87171;margin:10px 0 22px">Contains real user data. Do not share this page.</p>

<h2 class="auth-h">Accounts (${acc.length})</h2>
<div style="overflow-x:auto"><table class="admin-t">
<thead><tr><th>Email</th><th>Created</th><th>Last seen</th></tr></thead>
<tbody>${acctRows || '<tr><td colspan="3">No accounts yet.</td></tr>'}</tbody>
</table></div>

<h2 class="auth-h" style="margin-top:28px">Follows (${fol.length})</h2>
<div style="overflow-x:auto"><table class="admin-t">
<thead><tr><th>User</th><th>Game</th><th>Card</th><th>Alert types</th><th>Confirmed</th></tr></thead>
<tbody>${followRows || '<tr><td colspan="5">No follows yet.</td></tr>'}</tbody>
</table></div>`);
}

// ---------------------------------------------------------------------------
// task-129 Part 2: auth action handlers
// ---------------------------------------------------------------------------
async function handleLogin(form) {
  const email    = normaliseEmail(form && form.get('email'));
  const password = form && form.get('password');
  if (!email || !password) return signedOutPage('Enter your email and password.', 'login');
  if (loginBlocked(email))  return signedOutPage('Too many attempts. Please wait a few minutes and try again.', 'login');
  const account = await getAccountByEmail(email);
  // One generic message whether the email is unknown, has no password set, or the password is
  // wrong: no account enumeration and no hint about which accounts use passwords.
  if (!account || !account.password_hash || !verifyPassword(password, account.password_hash)) {
    recordFailedLogin(email);
    return signedOutPage('Email or password is incorrect.', 'login');
  }
  clearLoginAttempts(email);
  const cookie = hasSessionSecret() ? sessionCookieHeader(await createSession(account)) : null;
  return dashboard({ uid: account.id, email: account.email }, { cookie });
}

async function handleSignup(form) {
  const email    = normaliseEmail(form && form.get('email'));
  const password = form && form.get('password');
  const confirm  = form && form.get('confirm');
  if (!email) return signedOutPage('Enter a valid email address.', 'signup');
  const pwProblem = passwordProblem(password);
  if (pwProblem) return signedOutPage(pwProblem, 'signup');
  if (password !== confirm) return signedOutPage('The two passwords do not match.', 'signup');

  const result = await createAccountWithPassword(email, hashPassword(password));
  if (!result.ok) {
    if (result.reason === 'email_exists') {
      return signedOutPage('That email already has an account. Log in, or reset your password.', 'login');
    }
    return signedOutPage('We could not create your account just now. Please try again.', 'signup');
  }
  // Confirmation email, reusing the magic-link infra framed as "confirm your account".
  await sendLinkEmail(result.account, 'confirm');
  return checkEmailPage('Almost there', `We have sent a confirmation link to ${email}. Click it to confirm your account and sign in.`);
}

async function handleForgot(form) {
  const email = normaliseEmail(form && form.get('email'));
  // Anti-enumeration: identical response whether or not the email is registered.
  if (email) {
    const account = await getAccountByEmail(email);
    if (account) await sendLinkEmail(account, 'reset');
  }
  return checkEmailPage('Check your email', 'If an account exists for that email, we have sent a password reset link.');
}

async function handleSetPassword(session, form) {
  const password = form && form.get('password');
  const confirm  = form && form.get('confirm');
  const pwProblem = passwordProblem(password);
  if (pwProblem)            return setPasswordPage({ id: session.uid, email: session.email }, { note: pwProblem });
  if (password !== confirm) return setPasswordPage({ id: session.uid, email: session.email }, { note: 'The two passwords do not match.' });
  await setPasswordHash(session.uid, hashPassword(password));
  clearLoginAttempts(session.email);
  return dashboard(session);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async (req) => {
  const url = new URL(req.url);

  // task-129 Part 5: admin view at /account/admin. Gated SERVER-SIDE by matching the session
  // email against ADMIN_EMAILS. A signed-out or non-admin request gets a plain 404, never a hint
  // that an admin view exists. This is the only gate; there is no client-side hiding.
  if (url.pathname.replace(/\/$/, '') === '/account/admin') {
    const session = await getSessionFromRequest(req);
    if (!session || !isAdmin(session.email)) {
      return page('Not found', `<h1>Not found</h1><p class="whoami">That page does not exist.</p>`, { status: 404 });
    }
    return adminView(session);
  }

  // Explicit sign out.
  if (url.searchParams.get('signout')) {
    return page('Signed out', `
<h1>Signed out</h1>
<p class="whoami">You have been signed out on this device.</p>
<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:28px;margin-top:22px;max-width:420px">
  ${authPanel('login')}
</div>`, { cookie: clearSessionCookieHeader() });
  }

  // Arriving from an emailed link (confirm account, or password reset). Verify the token, mint
  // the 30 day session, then show the set-password form (reset) or the dashboard (confirm).
  const token = url.searchParams.get('token');
  if (token) {
    const resolved = await resolveMagicLink(token);
    if (resolved.status === 'expired') return signedOutPage('That link has expired. Request a new one below.', 'forgot');
    if (resolved.status !== 'ok')      return signedOutPage('That link is not valid. Request a new one below.', 'forgot');
    const cookie = hasSessionSecret()
      ? sessionCookieHeader(await createSession(resolved.account))
      : null; // fail closed: no secret, no cookie
    if (url.searchParams.get('reset')) {
      return setPasswordPage({ id: resolved.account.id, email: resolved.account.email }, { cookie });
    }
    return dashboard({ uid: resolved.account.id, email: resolved.account.email }, { cookie });
  }

  const session = await getSessionFromRequest(req);

  if (req.method === 'POST') {
    const form   = await req.formData().catch(() => null);
    const action = form && form.get('action');

    // Auth actions do not require an existing session.
    if (action === 'login')  return handleLogin(form);
    if (action === 'signup') return handleSignup(form);
    if (action === 'forgot') return handleForgot(form);

    // Everything else requires a session. A magic-link token is not accepted for POST:
    // destructive actions should not be reachable from a URL sitting in an inbox.
    if (!session) return signedOutPage('Please sign in again to manage your account.', 'login');

    if (action === 'setpw') return handleSetPassword(session, form);

    const id = form && form.get('id');
    if ((action === 'stop' || action === 'remove') && id) {
      if (action === 'stop') await unsubscribeFollow(String(id));      // soft delete, row stays
      else                   await deleteFollow(session.uid, String(id)); // hard delete, scoped
    }
    return dashboard(session);
  }

  if (!session) return signedOutPage();

  return dashboard(session);
};

export const config = { path: ['/account', '/account/admin'] };
