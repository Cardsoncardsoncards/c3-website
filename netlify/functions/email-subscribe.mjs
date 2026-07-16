const MAILERLITE_API_KEY = Netlify.env.get('MAILERLITE_API_KEY');
const GROUP_ID = '182892277158381312';

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
  let email;
  try { const b = await req.json(); email = (b.email || '').trim().toLowerCase(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers }); }
  if (!email || !email.includes('@') || email.length < 5)
    return new Response(JSON.stringify({ error: 'Valid email required' }), { status: 400, headers });
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
      await markDigestSubscribed(email);
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
