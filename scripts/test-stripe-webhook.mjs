// Regression test for netlify/functions/stripe-webhook.mjs (C3L-58, C3L-59).
//
// This is the money path. A customer pays through a Stripe-hosted Payment Link, Stripe posts
// checkout.session.completed here, and this handler is the only thing that grants them the paid
// group. If it is wrong, someone has paid and received nothing, so it gets a real test rather
// than a code read. The C3L-44 lesson applies directly: a fix that looks correct can still be
// broken, and only measurement tells you which.
//
// Everything here is offline. Stripe, MailerLite and Supabase are all stubbed, no live key is
// used and no payment infrastructure is touched. What is genuinely exercised is the handler's
// own logic: signature verification, the insert-first replay guard, and whether a failure asks
// Stripe to retry or silently swallows it.
//
// Run: node scripts/test-stripe-webhook.mjs

import crypto from 'node:crypto';

const SECRET = 'whsec_test_secret_not_real';

// Netlify.env must exist before the module is imported, since it reads env at module scope.
globalThis.Netlify = {
  env: {
    get: (k) => ({
      STRIPE_WEBHOOK_SECRET: SECRET,
      STRIPE_SECRET_KEY: 'sk_test_not_real',
      MAILERLITE_API_KEY: 'ml_test_not_real',
      SUPABASE_URL: 'https://stub.supabase.co',
      SUPABASE_SERVICE_KEY: 'service_test_not_real'
    })[k]
  }
};

// --- stub transport -------------------------------------------------------------------
let calls;
let claimed;          // event_id -> completed boolean, stands in for the dedupe table
let mailerliteMode;   // 'ok' | 'fail' | 'down'

function resetStubs() {
  calls = { mlAdd: 0, mlRemove: 0, claimInsert: 0, claimLookup: 0, markComplete: 0 };
  claimed = new Map();
  mailerliteMode = 'ok';
}

globalThis.fetch = async (url, opts = {}) => {
  const method = opts.method || 'GET';
  const body = opts.body ? JSON.parse(opts.body) : null;

  if (url.includes('/rest/v1/stripe_webhook_events')) {
    if (method === 'POST') {
      calls.claimInsert++;
      const id = body[0].event_id;
      if (claimed.has(id)) return { ok: false, status: 409, text: async () => 'duplicate key' };
      claimed.set(id, false);
      return { ok: true, status: 201, text: async () => '' };
    }
    if (method === 'PATCH') {
      calls.markComplete++;
      const id = decodeURIComponent(url.split('event_id=eq.')[1]);
      claimed.set(id, true);
      return { ok: true, status: 204, text: async () => '' };
    }
    calls.claimLookup++;
    const id = decodeURIComponent(url.split('event_id=eq.')[1].split('&')[0]);
    return { ok: true, status: 200, json: async () => [{ completed_at: claimed.get(id) ? 'now' : null }] };
  }

  if (url.includes('connect.mailerlite.com')) {
    if (mailerliteMode === 'down') throw new Error('network down');
    if (method === 'POST') {
      calls.mlAdd++;
      if (mailerliteMode === 'fail') return { ok: false, status: 500, text: async () => 'ML broke' };
      return { ok: true, status: 200, text: async () => '{}' };
    }
    if (method === 'DELETE') { calls.mlRemove++; return { ok: true, status: 204, text: async () => '' }; }
    return { ok: true, status: 200, json: async () => ({ data: { id: 'sub_1' } }) };
  }

  if (url.includes('api.stripe.com')) {
    return { ok: true, status: 200, json: async () => ({ email: 'Payer@Example.com' }) };
  }
  throw new Error('unexpected fetch to ' + url);
};

const { default: handler } = await import('../netlify/functions/stripe-webhook.mjs');

// --- helpers --------------------------------------------------------------------------
function signed(bodyObj, { secret = SECRET, ts = Math.floor(Date.now() / 1000), extraV1 } = {}) {
  const raw = JSON.stringify(bodyObj);
  const v1 = crypto.createHmac('sha256', secret).update(`${ts}.${raw}`, 'utf8').digest('hex');
  const sig = extraV1 ? `t=${ts},v1=${extraV1},v1=${v1}` : `t=${ts},v1=${v1}`;
  return { raw, sig };
}
function req(raw, sig, method = 'POST') {
  return { method, headers: { get: (h) => (h === 'stripe-signature' ? sig : null) }, text: async () => raw };
}
const checkout = (id) => ({ id, type: 'checkout.session.completed',
  data: { object: { customer_details: { email: 'Payer@Example.com' } } } });

let pass = 0, fail = 0;
function check(label, cond, detail = '') {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (cond ? '' : '   <-- ' + detail));
  cond ? pass++ : fail++;
}

// --- 1. the happy path still works ------------------------------------------------------
resetStubs();
{
  const { raw, sig } = signed(checkout('evt_1'));
  const res = await handler(req(raw, sig));
  check('valid first delivery returns 200', res.status === 200, `got ${res.status}`);
  check('valid first delivery grants paid access', calls.mlAdd === 1, `mlAdd=${calls.mlAdd}`);
  check('valid first delivery marks the event completed', calls.markComplete === 1);
}

// --- 2. replay, the thing Stripe guarantees will happen ---------------------------------
{
  const { raw, sig } = signed(checkout('evt_1'));
  const before = calls.mlAdd;
  const res = await handler(req(raw, sig));
  check('DUPLICATE delivery returns 200', res.status === 200, `got ${res.status}`);
  check('DUPLICATE delivery does NOT re-grant access', calls.mlAdd === before,
    `mlAdd went ${before} -> ${calls.mlAdd}`);
}

// --- 3. downstream failure must ask Stripe to retry, not swallow -------------------------
resetStubs();
{
  mailerliteMode = 'fail';
  const { raw, sig } = signed(checkout('evt_2'));
  const res = await handler(req(raw, sig));
  check('MailerLite failure returns 500 so Stripe retries', res.status === 500, `got ${res.status}`);
  check('failed event is NOT marked completed', calls.markComplete === 0);

  // the retry Stripe would send, now with MailerLite healthy again
  mailerliteMode = 'ok';
  const retry = await handler(req(raw, sig));
  check('Stripe retry after failure succeeds', retry.status === 200, `got ${retry.status}`);
  check('retry actually grants the access that was missed', calls.mlAdd === 2, `mlAdd=${calls.mlAdd}`);
}

// --- 4. transport dying mid-call is also a retry, not a silent success --------------------
resetStubs();
{
  mailerliteMode = 'down';
  const { raw, sig } = signed(checkout('evt_3'));
  const res = await handler(req(raw, sig));
  check('MailerLite unreachable returns 500, not 200', res.status === 500, `got ${res.status}`);
}

// --- 5. forged and malformed requests -----------------------------------------------------
resetStubs();
{
  const { raw } = signed(checkout('evt_4'));
  check('unsigned request rejected 400', (await handler(req(raw, null))).status === 400);
  const bad = signed(checkout('evt_4'), { secret: 'whsec_attacker' });
  check('wrongly signed request rejected 400', (await handler(req(bad.raw, bad.sig))).status === 400);
  const stale = signed(checkout('evt_4'), { ts: Math.floor(Date.now() / 1000) - 400 });
  check('stale but correctly signed replay rejected 400',
    (await handler(req(stale.raw, stale.sig))).status === 400);
  check('no work done for any rejected request', calls.mlAdd === 0 && calls.claimInsert === 0,
    `mlAdd=${calls.mlAdd} claims=${calls.claimInsert}`);
  check('GET rejected 405', (await handler(req('', null, 'GET'))).status === 405);
}

// --- 6. secret rotation, the C3L-59 bug ---------------------------------------------------
resetStubs();
{
  const otherTs = Math.floor(Date.now() / 1000);
  const rawObj = checkout('evt_5');
  const rawStr = JSON.stringify(rawObj);
  const oldSig = crypto.createHmac('sha256', 'whsec_previous').update(`${otherTs}.${rawStr}`, 'utf8').digest('hex');
  const { raw, sig } = signed(rawObj, { ts: otherTs, extraV1: oldSig });
  // valid signature is LAST here; the reversed order is what the old parser got wrong
  check('rotation with valid signature last accepted', (await handler(req(raw, sig))).status === 200);

  resetStubs();
  const good = crypto.createHmac('sha256', SECRET).update(`${otherTs}.${rawStr}`, 'utf8').digest('hex');
  const reversed = `t=${otherTs},v1=${good},v1=${oldSig}`;
  check('rotation with valid signature FIRST accepted (C3L-59)',
    (await handler(req(rawStr, reversed))).status === 200);
}

// --- 6b. transient vs unprocessable, the two must not look the same -----------------------
// A revoke where Stripe answers but the customer has no email is finished, not retryable.
// A revoke where Stripe itself is unreachable IS retryable. Before the fix both returned null
// and were indistinguishable.
resetStubs();
{
  const stripeFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('api.stripe.com')) return { ok: true, status: 200, json: async () => ({ email: null }) };
    return stripeFetch(url, opts);
  };
  const { raw, sig } = signed({ id: 'evt_6', type: 'customer.subscription.deleted',
    data: { object: { customer: 'cus_no_email' } } });
  const res = await handler(req(raw, sig));
  check('revoke for a customer with no email completes, does not retry forever', res.status === 200,
    `got ${res.status}`);
  check('nothing removed when there is nothing to remove', calls.mlRemove === 0);

  globalThis.fetch = async (url, opts) => {
    if (url.includes('api.stripe.com')) return { ok: false, status: 500, text: async () => 'stripe down' };
    return stripeFetch(url, opts);
  };
  const b = signed({ id: 'evt_7', type: 'customer.subscription.deleted',
    data: { object: { customer: 'cus_x' } } });
  const res2 = await handler(req(b.raw, b.sig));
  check('revoke when Stripe itself is down returns 500 so it retries', res2.status === 500,
    `got ${res2.status}`);
  globalThis.fetch = stripeFetch;
}

// --- 7. an event with no id cannot be deduplicated, so it is refused ----------------------
resetStubs();
{
  const { raw, sig } = signed({ type: 'checkout.session.completed', data: { object: {} } });
  check('event with no id rejected 400', (await handler(req(raw, sig))).status === 400);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
