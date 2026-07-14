// netlify/functions/shared/session.mjs
// task-110: signed, httpOnly session cookies for the /account dashboard.
//
// Why this exists: the magic-link pattern from task-109 authenticates someone for a single
// action. A dashboard is a place people are meant to RETURN to, and making them request a
// fresh emailed link on every visit would kill the return-visit habit the dashboard exists to
// create. So clicking a magic link mints a 30 day session; the link itself stays single-action.
//
// The cookie is a signed assertion, NOT an encrypted store. It carries the account id and
// email so the page can render without a database round trip, and an HMAC so the browser
// cannot alter either. Nothing secret is in the payload, only identity.
//
// SESSION_SECRET must be set in Netlify. If it is missing, hasSessionSecret() is false and
// every session operation FAILS CLOSED: no cookie is minted, no cookie is trusted, and
// /account falls back to the emailed magic-link flow. A missing secret must never degrade
// into an unsigned, forgeable cookie.

const SESSION_SECRET = Netlify.env.get('SESSION_SECRET');

export const SESSION_COOKIE  = 'c3_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds

export function hasSessionSecret() {
  return typeof SESSION_SECRET === 'string' && SESSION_SECRET.length >= 32;
}

// ---------------------------------------------------------------------------
// base64url, because a cookie value may not contain +, / or =
// ---------------------------------------------------------------------------
function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(payloadB64) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return b64url(new Uint8Array(sig));
}

// Constant-time compare. A plain === leaks how much of the signature matched via timing,
// which is enough to forge a signature byte by byte given enough attempts.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Mint / verify
// ---------------------------------------------------------------------------
export async function createSession({ id, email }) {
  if (!hasSessionSecret()) return null;
  const payload = {
    uid: id,
    email,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  const payloadB64 = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(payloadB64);
  return `${payloadB64}.${sig}`;
}

// Returns { uid, email } or null. Null covers every failure: no secret, no cookie, malformed,
// bad signature, expired.
export async function verifySession(token) {
  if (!hasSessionSecret() || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;

  const payloadB64 = token.slice(0, dot);
  const sig        = token.slice(dot + 1);

  const expected = await hmac(payloadB64);
  if (!safeEqual(sig, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)));
  } catch {
    return null;
  }

  if (!payload || !payload.uid || !payload.email) return null;
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;

  return { uid: payload.uid, email: payload.email };
}

// ---------------------------------------------------------------------------
// Cookie plumbing
// ---------------------------------------------------------------------------
export function readSessionCookie(req) {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === SESSION_COOKIE) return rest.join('=');
  }
  return null;
}

// HttpOnly so page scripts cannot read it (an XSS then cannot exfiltrate the session).
// Secure so it never travels over plain HTTP. SameSite=Lax so it still arrives when the user
// arrives by clicking the magic link in their email client, which a Strict cookie would drop.
export function sessionCookieHeader(value) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

export function clearSessionCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// Convenience: the account for this request, or null.
export async function getSessionFromRequest(req) {
  return verifySession(readSessionCookie(req));
}
