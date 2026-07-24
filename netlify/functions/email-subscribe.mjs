import { getSessionFromRequest } from './shared/session.mjs';

const MAILERLITE_API_KEY = Netlify.env.get('MAILERLITE_API_KEY');
const GROUP_ID = '182892277158381312';

// Basic in-memory abuse throttle. Per serverless instance only (instances are short-lived and
// not shared across the fleet), so this blunts a scripted flood rather than being a hard cap,
// the same trade-off account.mjs makes for login. A durable limit (Netlify edge rate-limiting
// or a shared counter) is the upgrade if this endpoint ever justifies it.
const RL_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RL_MAX = 6;                    // requests per key (IP, and email) per window
const rlHits = new Map();            // key -> { count, resetAt }
function rlBlocked(key) {
  const now = Date.now();
  const rec = rlHits.get(key);
  if (!rec || now > rec.resetAt) { rlHits.set(key, { count: 1, resetAt: now + RL_WINDOW_MS }); return false; }
  rec.count += 1;
  return rec.count > RL_MAX;
}
function clientIp(req) {
  return req.headers.get('x-nf-client-connection-ip')
    || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || 'unknown';
}

// task-132 Part 7: persist "already subscribed to the weekly digest" against the account, so the
// dashboard CTA does not reappear every visit. Fire-and-forget: a non-account email simply
// matches no row, and a failure here must never fail the subscribe itself.
const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
async function markDigestSubscribed(email) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/accounts?email=eq.${encodeURIComponent(email)}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ digest_subscribed: true }),
    });
  } catch { /* telemetry-grade: never fail the subscribe over this */ }
}

export default async (req) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let email, honeypot;
  try { const b = await req.json(); email = (b.email || '').trim().toLowerCase(); honeypot = b.company; }
  catch { return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers }); }

  // Honeypot: a hidden field a real person never sees or fills. A value here means a bot, so
  // return an ordinary success (give the bot no signal) and do nothing.
  if (honeypot && String(honeypot).trim() !== '')
    return new Response(JSON.stringify({ success: true }), { status: 200, headers });

  if (!email || !email.includes('@') || email.length < 5)
    return new Response(JSON.stringify({ error: 'Valid email required' }), { status: 400, headers });

  // Throttle per IP and per email before doing any outbound work.
  if (rlBlocked('ip:' + clientIp(req)) || rlBlocked('em:' + email))
    return new Response(JSON.stringify({ error: 'Too many requests. Please try again shortly.' }), { status: 429, headers });

  if (!MAILERLITE_API_KEY)
    return new Response(JSON.stringify({ error: 'Service error' }), { status: 500, headers });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MAILERLITE_API_KEY}` },
      body: JSON.stringify({ email, groups: [GROUP_ID] }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (res.ok || res.status === 409) {
      // digest_subscribed is ACCOUNT state, so only the account owner may set it. This endpoint
      // is otherwise anonymous (anyone can add an email to the MailerLite digest list), and
      // without this check anyone could POST another person's email and flip a flag on their
      // account. getSessionFromRequest verifies the HMAC-signed session cookie server-side; we
      // write the flag only when the signed-in email matches the submitted one.
      const session = await getSessionFromRequest(req).catch(() => null);
      if (session && typeof session.email === 'string' && session.email.trim().toLowerCase() === email) {
        await markDigestSubscribed(email);
      }
      return new Response(JSON.stringify({ success: true }), { status: 200, headers });
    }
    const err = await res.text();
    console.error('MailerLite error:', err);
    return new Response(JSON.stringify({ error: 'Subscription failed' }), { status: 500, headers });
  } catch (e) {
    clearTimeout(timer);
    return new Response(JSON.stringify({ error: 'Request timed out' }), { status: 500, headers });
  }
};
