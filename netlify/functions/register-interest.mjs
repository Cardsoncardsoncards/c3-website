// netlify/functions/register-interest.mjs
// Handles /api/register-interest POST from subscribe.html and from the "Subscribe for Free
// Updates" panel on /account.
// Adds to the MailerLite MAIN (free) group + notifies owner via Resend.
//
// SUB-01, corrected 1 September 2026. This wrote to 188799131758626620 from the day it was
// written (d57091c, 17 June 2026), and that is the PAID group, not a second free list:
// stripe-webhook.mjs ADDS to it on checkout.session.completed and REMOVES from it on
// cancellation, so membership of that group IS the paid entitlement, and
// generate-weekly-report.mjs mails the paid C3 Seller Intelligence report to whoever is in it.
// This endpoint takes a name, an email and two interest checkboxes with no payment step
// anywhere, and both of its callers describe it as free: /account labels the button
// "Subscribe for Free Updates", and the welcome email below says everything on C3 is free
// today. So a free interest registration was granting paid entitlement. The paid signup path
// is Stripe checkout and always has been, which is why this is a wrong constant rather than a
// wrongly aimed form.

import { clientIp } from './shared/request-fingerprint.mjs';

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
// clientIp is imported from shared/request-fingerprint.mjs; the local copy that used to sit here
// was one of three identical hand-rolled versions. The 'unknown' fallback is kept and is NOT
// cosmetic: the shared helper returns null for an unresolvable address, and passing null to
// rlBlocked would put every unidentifiable caller into one shared bucket, letting a single
// scripted client rate-limit everyone else out. A named key keeps that grouping explicit.
function rlKeyForIp(req) {
  return clientIp(req) || 'unknown';
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
  // The MAIN (free) list, matching PROJECT.md and email-subscribe.mjs. See the SUB-01 note at
  // the top of this file before changing this back.
  const GROUP_ID       = '182892277158381312';

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
  if (rlBlocked('ip:' + rlKeyForIp(req)) || rlBlocked('em:' + String(email).trim().toLowerCase())) {
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
  // SUB-02. A MailerLite failure used to be caught, logged, and followed by an unconditional
  // 200 {ok:true} at the end of this handler, so a submitter was told they were on the list
  // while nothing had been stored anywhere. That is the one outcome a signup form must never
  // produce, and it is invisible from the outside precisely because it looks like success.
  // The add is now the gate: if it does not succeed, this returns a non-2xx, and neither the
  // owner notification nor the welcome email is sent, because "thanks for joining" is a false
  // statement once the write behind it has failed.
  //
  // 409 counts as success. It means the subscriber already exists, which is what a double
  // submit produces, and stripe-webhook.mjs treats that status the same way for the same reason.
  //
  // Nothing beyond the status code is logged. MailerLite echoes the submitted address back
  // inside a validation error body, so logging that body would put a subscriber email into the
  // function logs; the API key is never in scope for logging at all.
  if (!MAILERLITE_KEY) {
    console.error('MAILERLITE_API_KEY is not set, cannot record signup');
    return new Response(JSON.stringify({ ok: false, error: 'Signup is temporarily unavailable. Please try again shortly.' }), {
      status: 503, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
  let mlOk = false;
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
    mlOk = mlRes.ok || mlRes.status === 409;
    if (!mlOk) console.error('MailerLite add failed, status ' + mlRes.status);
  } catch (e) {
    clearTimeout(mlTimer);
    console.error('MailerLite add failed, no usable response: ' + e.name);
  }
  if (!mlOk) {
    return new Response(JSON.stringify({ ok: false, error: 'Could not complete signup. Please try again shortly.' }), {
      status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
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
          + '<p>Added to MailerLite group ' + GROUP_ID + ' (main, free).</p>'
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
            + `<p style="font-size:11px;color:#999">Cards on Cards on Cards is operated by Voxsanity Pty Ltd, ABN 82 700 348 867.</p>`
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
