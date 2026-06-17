// netlify/functions/register-interest.mjs
// Handles /api/register-interest POST from subscribe.html
// Adds to MailerLite paid group + notifies owner via Resend

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

  const { name, email, interests } = body;
  if (!email || !name) {
    return new Response(JSON.stringify({ ok: false, error: 'Name and email required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const interestList = Array.isArray(interests) && interests.length
    ? interests : ['unspecified'];

  // 1. Add to MailerLite group with interest tags
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
        fields: { name },
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
        to: ['alerts@cardsoncardsoncards.com.au'],
        subject: 'New subscription interest: ' + interestList.join(', '),
        html: '<p><strong>Name:</strong> ' + name + '</p>'
          + '<p><strong>Email:</strong> ' + email + '</p>'
          + '<p><strong>Interested in:</strong> ' + interestList.join(', ') + '</p>'
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

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
};

export const config = { path: '/api/register-interest' };
