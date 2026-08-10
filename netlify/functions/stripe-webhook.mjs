import crypto from 'node:crypto';

const STRIPE_SECRET_KEY     = Netlify.env.get('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = Netlify.env.get('STRIPE_WEBHOOK_SECRET');
const MAILERLITE_API_KEY    = Netlify.env.get('MAILERLITE_API_KEY');
const SUPABASE_URL          = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY  = Netlify.env.get('SUPABASE_SERVICE_KEY');

const PAID_GROUP_ID = '188799131758626620';
const ML = 'https://connect.mailerlite.com/api';

export const config = { path: '/api/stripe-webhook' };

// C3L-59. The signature header can legitimately carry MORE THAN ONE v1 value. Stripe sends
// every valid signature during a webhook secret rotation, so a request signed with the new
// secret arrives alongside one signed with the old. The previous version of this parser wrote
// each key into an object, so a second v1 overwrote the first and only the LAST one was ever
// checked. If the valid signature was not last, a genuine Stripe event was rejected.
// Proven by test rather than assumed: with two v1 values the old code passed when the correct
// one was last and failed when it was first. Every signature is now checked and any match is
// accepted, which is what Stripe's own libraries do.
function verify(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  let t = null;
  const signatures = [];
  for (const kv of sigHeader.split(',')) {
    const i = kv.indexOf('=');
    if (i <= 0) continue;
    const key = kv.slice(0, i).trim();
    const value = kv.slice(i + 1).trim();
    if (key === 't') t = value;
    else if (key === 'v1') signatures.push(value);
  }
  if (!t || !signatures.length) return false;

  // Timestamp tolerance is checked BEFORE the comparison, so a stale but correctly signed
  // replay is rejected without doing the HMAC work at all.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (!Number.isFinite(age) || age >= 300) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex');
  const a = Buffer.from(expected);
  let matched = false;
  for (const candidate of signatures) {
    const b = Buffer.from(candidate);
    // Length is compared first because timingSafeEqual throws on a mismatch. Every loop
    // iteration still runs, so this does not leak which signature matched by timing.
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) matched = true;
  }
  return matched;
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

// C3L-58. These used to swallow every failure. A timeout made mlFetch return null and the
// caller ignored it; a non-2xx response was written to console and otherwise ignored. The
// handler then returned 200 regardless, so Stripe considered the event delivered and never
// retried. The real-world shape of that: a customer pays, MailerLite is briefly unreachable,
// they are never added to the paid group, Stripe is told everything is fine, and nobody finds
// out. They have paid and received nothing.
// These now throw. The handler turns a throw into a non-2xx, which is how you ask Stripe to
// retry, and it retries with backoff for up to three days.
async function addToPaid(email) {
  if (!email) throw new Error('checkout.session.completed carried no usable email');
  if (!MAILERLITE_API_KEY) throw new Error('MAILERLITE_API_KEY is not set, cannot grant paid access');
  const res = await mlFetch('/subscribers', { method: 'POST', body: JSON.stringify({ email, groups: [PAID_GROUP_ID] }) });
  if (!res) throw new Error('MailerLite unreachable while adding to the paid group');
  // 409 means the subscriber already exists, which is success for our purposes and is also
  // what a duplicate delivery produces. That is what makes this operation safely retryable.
  if (!res.ok && res.status !== 409) {
    throw new Error(`MailerLite add failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

async function removeFromPaid(email) {
  // Deliberately NOT a throw, and this is the asymmetry with addToPaid. Reaching here with no
  // email means Stripe answered and the customer has none, so there is no group membership to
  // revoke and no retry that could ever change that. Throwing would make Stripe redeliver a
  // permanently unprocessable event for three days. addToPaid is the opposite case: money has
  // changed hands and a customer we cannot identify is worth shouting about.
  if (!email) {
    console.error('[stripe-webhook] subscription deleted for a customer with no email on file, nothing to revoke');
    return;
  }
  if (!MAILERLITE_API_KEY) throw new Error('MAILERLITE_API_KEY is not set, cannot revoke paid access');
  const look = await mlFetch(`/subscribers/${encodeURIComponent(email)}`, { method: 'GET' });
  if (!look) throw new Error('MailerLite unreachable while looking up the subscriber');
  // A subscriber who is not there cannot be in the paid group, so there is nothing to revoke
  // and this is a success, not a failure. Distinguishing 404 from a transport error is the
  // difference between correctly finishing and retrying forever.
  if (look.status === 404) return;
  if (!look.ok) throw new Error(`MailerLite lookup failed ${look.status}`);
  let data;
  try { data = await look.json(); } catch { throw new Error('MailerLite lookup returned unparseable JSON'); }
  const id = data && data.data && data.data.id;
  if (!id) return;
  const del = await mlFetch(`/subscribers/${id}/groups/${PAID_GROUP_ID}`, { method: 'DELETE' });
  if (!del) throw new Error('MailerLite unreachable while removing from the paid group');
  if (!del.ok && del.status !== 404) {
    throw new Error(`MailerLite remove failed ${del.status}`);
  }
}

// C3L-58, the insert-first replay guard. Stripe's delivery guarantee is at-least-once, so a
// repeated event_id is a matter of when, not if, and it is also what our own retries now
// produce deliberately.
//
// Insert-first, NOT check-then-insert. The primary key on event_id is the thing that decides,
// inside the database, which delivery got there first. A check-then-insert would only narrow
// the race between two concurrent deliveries, not close it.
//
// Returns 'first' to process, 'done' to skip because a previous delivery already finished, or
// 'retry' when a previous delivery claimed the event but never completed it, which means it
// died part way and the work still needs doing.
async function claimEvent(eventId, eventType) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    // Deliberately fails OPEN, and the reasoning is recorded because it is a real trade.
    // Both handlers today are idempotent set operations (add to a group, remove from a group),
    // so processing twice is harmless, while refusing to process because the dedupe store is
    // unreachable would deny a paying customer their access. If a NON-idempotent handler is
    // ever added below, this trade has to be revisited and this branch should become a hard
    // failure instead.
    console.error('[stripe-webhook] dedupe store unavailable, processing without replay guard');
    return 'first';
  }
  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/stripe_webhook_events`, {
      method: 'POST',
      headers,
      body: JSON.stringify([{ event_id: eventId, event_type: eventType }]),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (res.ok) return 'first';
    if (res.status === 409) {
      // Already claimed. Whether to redo the work depends on whether it ever finished.
      const look = await fetch(
        `${SUPABASE_URL}/rest/v1/stripe_webhook_events?select=completed_at&event_id=eq.${encodeURIComponent(eventId)}`,
        { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
      );
      if (!look.ok) return 'retry';
      const rows = await look.json();
      return rows.length && rows[0].completed_at ? 'done' : 'retry';
    }
    console.error(`[stripe-webhook] claim failed ${res.status}, processing without replay guard`);
    return 'first';
  } catch (e) {
    clearTimeout(timer);
    console.error(`[stripe-webhook] claim error ${e.message}, processing without replay guard`);
    return 'first';
  }
}

async function markCompleted(eventId) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/stripe_webhook_events?event_id=eq.${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ completed_at: new Date().toISOString() }),
      signal: controller.signal
    });
    clearTimeout(timer);
  } catch (e) {
    clearTimeout(timer);
    // The work succeeded, only the bookkeeping failed. Worst case is that a later duplicate
    // redoes idempotent work, which is exactly the behaviour before this guard existed.
    console.error(`[stripe-webhook] could not mark ${eventId} completed: ${e.message}`);
  }
}

// Returns the customer's email, or null when Stripe answers successfully and the customer
// genuinely has no email on file.
//
// The distinction matters and used to be lost: this previously returned null for a network
// timeout, a 500 from Stripe, a missing API key and a real customer-without-an-email alike.
// The caller cannot then tell "try again in a minute" from "there is nothing here to act on",
// and with the handler now retrying on failure that ambiguity would mean either retrying a
// permanently unprocessable event for three days, or silently skipping a real one.
// Transport and HTTP failures THROW, so the handler asks Stripe to retry. Only a successful
// response with no email returns null.
async function stripeCustomerEmail(customerId) {
  if (!customerId) return null;
  if (!STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set, cannot resolve the customer');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
      signal: controller.signal
    });
    clearTimeout(timer);
    // A deleted customer is a real answer, not a failure, and there is nothing to revoke.
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Stripe customer lookup failed ${res.status}`);
    const c = await res.json();
    return c && c.email ? c.email.toLowerCase() : null;
  } catch (e) {
    clearTimeout(timer);
    throw e;
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

  // Replay guard, before any work is done.
  const eventId = event && event.id;
  if (!eventId) {
    // A signed payload with no id should not exist. Refusing it is safer than processing
    // something that cannot be deduplicated.
    return new Response(JSON.stringify({ error: 'Event has no id' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }
  const claim = await claimEvent(eventId, event.type);
  if (claim === 'done') {
    console.log(`[stripe-webhook] ${eventId} already processed, ignoring duplicate delivery`);
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  }

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
    // Event types we do not act on are still recorded as finished, so Stripe stops resending
    // them and the table does not fill with permanently incomplete rows.
  } catch (e) {
    // C3L-58. This used to swallow the error and return 200, which told Stripe the event was
    // handled when it was not. Returning 500 is what asks Stripe to retry, and it retries with
    // backoff for up to three days, which is the difference between a transient MailerLite
    // outage costing nothing and it silently costing a customer their access.
    // Safe to retry precisely because the operations are idempotent: adding an existing
    // subscriber returns 409, which is treated as success, and removing an absent one is a
    // no-op. The event is deliberately left NOT completed so the retry does the work.
    console.error(`[stripe-webhook] handler error on ${eventId} (${event.type}), returning 500 so Stripe retries:`, e.message);
    return new Response(JSON.stringify({ error: 'Processing failed, retry expected' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  await markCompleted(eventId);
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
