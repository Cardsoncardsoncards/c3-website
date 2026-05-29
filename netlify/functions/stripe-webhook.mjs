import crypto from 'node:crypto';

const STRIPE_SECRET_KEY     = Netlify.env.get('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = Netlify.env.get('STRIPE_WEBHOOK_SECRET');
const MAILERLITE_API_KEY    = Netlify.env.get('MAILERLITE_API_KEY');

const PAID_GROUP_ID = '188799131758626620';
const ML = 'https://connect.mailerlite.com/api';

export const config = { path: '/api/stripe-webhook' };

function verify(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = {};
  sigHeader.split(',').forEach(kv => {
    const i = kv.indexOf('=');
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  });
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  return age < 300;
}

async function mlFetch(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${ML}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MAILERLITE_API_KEY}`, ...(options.headers || {}) },
      signal: controller.signal
    });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

async function addToPaid(email) {
  if (!email || !MAILERLITE_API_KEY) return;
  const res = await mlFetch('/subscribers', { method: 'POST', body: JSON.stringify({ email, groups: [PAID_GROUP_ID] }) });
  if (res && !res.ok && res.status !== 409) console.error('ML add failed:', await res.text());
}

async function removeFromPaid(email) {
  if (!email || !MAILERLITE_API_KEY) return;
  const look = await mlFetch(`/subscribers/${encodeURIComponent(email)}`, { method: 'GET' });
  if (!look || !look.ok) return;
  let data;
  try { data = await look.json(); } catch { return; }
  const id = data && data.data && data.data.id;
  if (!id) return;
  await mlFetch(`/subscribers/${id}/groups/${PAID_GROUP_ID}`, { method: 'DELETE' });
}

async function stripeCustomerEmail(customerId) {
  if (!customerId || !STRIPE_SECRET_KEY) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const c = await res.json();
    return c && c.email ? c.email.toLowerCase() : null;
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const sig = req.headers.get('stripe-signature');
  const rawBody = await req.text();
  if (!verify(rawBody, sig, STRIPE_WEBHOOK_SECRET)) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  let event;
  try { event = JSON.parse(rawBody); }
  catch { return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object;
      const email = (s.customer_details && s.customer_details.email) || s.customer_email;
      await addToPaid(email ? String(email).toLowerCase() : null);
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const email = await stripeCustomerEmail(sub.customer);
      await removeFromPaid(email);
    }
  } catch (e) {
    console.error('Webhook handler error:', e);
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
