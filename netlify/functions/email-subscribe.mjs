const MAILERLITE_API_KEY = Netlify.env.get('MAILERLITE_API_KEY');
const GROUP_ID = '182892277158381312';

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
    if (res.ok || res.status === 409) return new Response(JSON.stringify({ success: true }), { status: 200, headers });
    const err = await res.text();
    console.error('MailerLite error:', err);
    return new Response(JSON.stringify({ error: 'Subscription failed' }), { status: 500, headers });
  } catch (e) {
    clearTimeout(timer);
    return new Response(JSON.stringify({ error: 'Request timed out' }), { status: 500, headers });
  }
};
