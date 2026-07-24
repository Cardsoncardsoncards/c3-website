// netlify/functions/register-interest.mjs
// Handles /api/register-interest POST from subscribe.html
// Adds to MailerLite paid group + notifies owner via Resend

// Escape user-supplied values before they go into any HTML email body. The owner notification
// below interpolates the submitted name and email directly, so without this a submitter could
// inject markup into the inbox that receives these alerts.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Basic in-memory abuse throttle. Per serverless instance only (instances are short-lived and
// not shared across the fleet), so this blunts a scripted flood rather than being a hard cap,
// the same trade-off account.mjs makes for login. It matters more here than on most endpoints
// because each accepted request sends a "welcome" email to the SUBMITTER-supplied address via
// our verified domain, which is an email-bombing and sender-reputation surface if left open.
const RL_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RL_MAX = 5;                    // requests per key (IP, and email) per window
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

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    });
  }

  const MAILERLITE_KEY = Netlify.env.get('MAILERLITE_API_KEY');
  const RESEND_KEY     = Netlify.env.get('RESEND_API_KEY');
  const GROUP_ID       = '188799131758626620';

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const { name, email, interests, company } = body;

  // Honeypot: a hidden field a real person never sees or fills. A value here means a bot, so
  // return an ordinary success (give the bot no signal) and do nothing.
  if (company && String(company).trim() !== '') {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  if (!email || !name) {
    return new Response(JSON.stringify({ ok: false, error: 'Name and email required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  // Throttle per IP and per email before any outbound work (MailerLite add, owner email, and the
  // welcome email to the submitter-supplied address).
  if (rlBlocked('ip:' + clientIp(req)) || rlBlocked('em:' + String(email).trim().toLowerCase())) {
    return new Response(JSON.stringify({ ok: false, error: 'Too many requests. Please try again shortly.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  const interestList = Array.isArray(interests) && interests.length
    ? interests : ['unspecified'];

  // 1. Add to MailerLite group, storing the interest checkboxes as queryable fields.
  // task-129 Part 3: previously the interests only appeared in the owner notification email
  // below and were never stored segmentably. Now they land in per-interest custom fields so
  // segmentation works. MailerLite has no boolean field type, so these are 1 (interested) / 0.
  const mlFields = {
    name,
    market_intelligence: (Array.isArray(interests) && interests.includes('Market Intelligence')) ? 1 : 0,
    collection_tools:     (Array.isArray(interests) && interests.includes('Collection Tools')) ? 1 : 0,
  };
  const mlController = new AbortController();
  const mlTimer = setTimeout(() => mlController.abort(), 8000);
  try {
    const mlRes = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      signal: mlController.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + MAILERLITE_KEY
      },
      body: JSON.stringify({
        email,
        fields: mlFields,
        groups: [GROUP_ID],
        status: 'active'
      })
    });
    clearTimeout(mlTimer);
    if (!mlRes.ok) {
      const err = await mlRes.text();
      console.error('MailerLite error:', err);
    }
  } catch (e) {
    clearTimeout(mlTimer);
    console.error('MailerLite fetch failed:', e.message);
  }

  // 2. Send owner notification via Resend
  const rsController = new AbortController();
  const rsTimer = setTimeout(() => rsController.abort(), 8000);
  try {
    const rsRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: rsController.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + RESEND_KEY
      },
      body: JSON.stringify({
        from: 'C3 Alerts <alerts@cardsoncardsoncards.com.au>',
        to: ['ccc.squadhelp@gmail.com'],
        subject: 'New subscription interest: ' + interestList.join(', '),
        html: '<p><strong>Name:</strong> ' + esc(name) + '</p>'
          + '<p><strong>Email:</strong> ' + esc(email) + '</p>'
          + '<p><strong>Interested in:</strong> ' + esc(interestList.join(', ')) + '</p>'
          + '<p>Added to MailerLite group 188799131758626620.</p>'
      })
    });
    clearTimeout(rsTimer);
    if (!rsRes.ok) {
      const err = await rsRes.text();
      console.error('Resend error:', err);
    }
  } catch (e) {
    clearTimeout(rsTimer);
    console.error('Resend fetch failed:', e.message);
  }

  // 3. task-132 Part 8: welcome/confirmation email to the SUBMITTER (in addition to the owner
  // notification above, not replacing it). Fire-and-forget: a Resend hiccup must not fail signup.
  if (RESEND_KEY) {
    const safeName = (name || '').replace(/[<>&"]/g, '').trim();
    const wantsList = Array.isArray(interests) && interests.length
      ? ', including updates on ' + interests.map(i => String(i).replace(/[<>&"]/g, '')).join(' and ')
      : '';
    const wcController = new AbortController();
    const wcTimer = setTimeout(() => wcController.abort(), 8000);
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: wcController.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + RESEND_KEY },
        body: JSON.stringify({
          from: 'Cards on Cards on Cards <alerts@cardsoncardsoncards.com.au>',
          to: [email],
          subject: 'Thanks for joining Cards on Cards on Cards',
          html: `<p>Hi${safeName ? ' ' + safeName : ''},</p>`
            + `<p>Thanks for joining Cards on Cards on Cards. You are on the list and we will email you as C3 grows${wantsList}.</p>`
            + `<p>Everything on C3 is free today: live AUD prices and price history across 32 trading card games, a release calendar, and free tools. Start at the <a href="https://cardsoncardsoncards.com.au/cards">Card Vault</a>.</p>`
            + `<p>You can follow any card for free price alerts and manage everything from <a href="https://cardsoncardsoncards.com.au/account">your C3 account</a>.</p>`
            + `<p>The C3 Team</p>`
            + `<p style="font-size:11px;color:#999">You are receiving this because you signed up at cardsoncardsoncards.com.au. Reply to this email to unsubscribe.</p>`
        })
      });
      clearTimeout(wcTimer);
    } catch (e) {
      clearTimeout(wcTimer);
      console.error('Welcome email failed:', e.message);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
};

export const config = { path: '/api/register-interest' };
