// scripts/test-signup-defences.mjs
// Regression suite for the C3L-90 signup-abuse defences in netlify/functions/account.mjs.
//
// Runs the REAL handler. Netlify.env and global fetch are stubbed so the module can load and so
// every outbound call (Supabase PostgREST, Resend) is intercepted and recorded rather than made.
// That means these assertions are about the handler's actual behaviour, not about reading it.
//
// Usage: node scripts/test-signup-defences.mjs
// Wired into .github/workflows/syntax-check.yml so the defences cannot silently regress.

// --- env stub, must exist before the module is imported -------------------------------------
const ENV = {
  SUPABASE_URL: 'https://stub.supabase.co',
  SUPABASE_SERVICE_KEY: 'stub-service-key',
  RESEND_API_KEY: 'stub-resend-key',
  SESSION_SECRET: 'stub-session-secret-value-long-enough',
  ADMIN_EMAILS: 'admin@example.com',
};
globalThis.Netlify = { env: { get: (k) => ENV[k] } };

// --- fetch stub -----------------------------------------------------------------------------
// Records every outbound call. Supabase reads/writes are answered with controlled shapes; the
// Resend endpoint is answered 200 but never actually contacted.
let calls = [];
let existingEmails = new Set();      // addresses the stubbed DB already holds
let nextAccountId = 1000;

function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = (opts.method || 'GET').toUpperCase();
  let body = null;
  try { body = opts.body ? JSON.parse(opts.body) : null; } catch { body = opts.body; }
  calls.push({ url: u, method, body });

  if (u.includes('api.resend.com')) return jsonRes({ id: 'stub-email-id' });

  if (u.includes('/rest/v1/email_log')) return new Response(null, { status: 201 });

  if (u.includes('/rest/v1/accounts')) {
    if (method === 'POST') {
      const row = Array.isArray(body) ? body[0] : body;
      const email = row && row.email;
      if (existingEmails.has(email)) {
        // PostgREST unique-violation shape
        return jsonRes({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409);
      }
      existingEmails.add(email);
      return jsonRes([{ id: nextAccountId++, email }], 201);
    }
    // GET lookup by email
    const m = u.match(/email=eq\.([^&]+)/);
    const email = m ? decodeURIComponent(m[1]) : null;
    return jsonRes(existingEmails.has(email) ? [{ id: 42, email, password_hash: 'x' }] : []);
  }

  if (u.includes('/rest/v1/follow_magic_links')) {
    if (method === 'POST') return jsonRes([{ token: 'stub-token' }], 201);
    return jsonRes([]);
  }

  if (u.includes('/rest/v1/follows')) return jsonRes([]);

  return jsonRes([]);
};

const mod = await import('../netlify/functions/account.mjs');
const handler = mod.default;

// --- helpers --------------------------------------------------------------------------------
function signupRequest(fields, { ip = '203.0.113.10' } = {}) {
  const fd = new URLSearchParams();
  fd.set('action', 'signup');
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request('https://cardsoncardsoncards.com.au/account', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-nf-client-connection-ip': ip,
    },
    body: fd.toString(),
  });
}

function reset() {
  calls = [];
  existingEmails = new Set();
}

const resendCalls = () => calls.filter(c => c.url.includes('api.resend.com'));
const emailLogCalls = () => calls.filter(c => c.url.includes('/rest/v1/email_log'));
const accountInserts = () => calls.filter(c => c.url.includes('/rest/v1/accounts') && c.method === 'POST');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
}

const VALID = { email: 'real.person@example.com', password: 'Correct-Horse-9', confirm: 'Correct-Horse-9' };

// --- 1. a real signup still works end to end ------------------------------------------------
console.log('\n1. Real signup, honest submission');
reset();
{
  const res = await handler(signupRequest(VALID, { ip: '198.51.100.1' }));
  const html = await res.text();
  check('returns 200', res.status === 200, `got ${res.status}`);
  check('shows the check-your-email page', /Check your email/i.test(html));
  check('shows NO error to the user', !/could not create your account/i.test(html));
  check('account row was inserted', accountInserts().length === 1, `${accountInserts().length} inserts`);
}

// --- 2. honeypot ----------------------------------------------------------------------------
console.log('\n2. Honeypot field populated (bot)');
reset();
{
  const res = await handler(signupRequest({ ...VALID, website: 'http://spam.example' }, { ip: '198.51.100.2' }));
  const html = await res.text();
  check('still returns 200 (no tell for the bot)', res.status === 200, `got ${res.status}`);
  check('response is INDISTINGUISHABLE from success', /Check your email/i.test(html));
  check('NO account created', accountInserts().length === 0, `${accountInserts().length} inserts`);
  check('NO email sent', resendCalls().length === 0, `${resendCalls().length} sends`);
}

console.log('\n2b. Honeypot present but empty (real browser)');
reset();
{
  const res = await handler(signupRequest({ ...VALID, website: '' }, { ip: '198.51.100.3' }));
  check('account IS created', accountInserts().length === 1, `${accountInserts().length} inserts`);
  check('returns 200', res.status === 200);
}

// --- 3. IP rate limiting --------------------------------------------------------------------
console.log('\n3. IP rate limit, repeated signups from one IP');
reset();
{
  const IP = '198.51.100.99';
  let blockedAt = null;
  for (let i = 1; i <= 10; i++) {
    const res = await handler(signupRequest({
      email: `burst${i}@example.com`, password: 'Correct-Horse-9', confirm: 'Correct-Horse-9',
    }, { ip: IP }));
    const html = await res.text();
    const blocked = /too many/i.test(html);
    if (blocked && blockedAt === null) blockedAt = i;
  }
  check('the limit DOES trigger', blockedAt !== null, 'never blocked in 10 attempts');
  check('it triggers after a handful, not on the first', blockedAt === null || blockedAt > 1, `blocked at ${blockedAt}`);
  check('it triggers within 10 attempts', blockedAt !== null && blockedAt <= 10, `blocked at ${blockedAt}`);
  console.log(`        (first blocked attempt: #${blockedAt})`);
}

console.log('\n3b. A different IP is unaffected by the first IP hitting the limit');
{
  const res = await handler(signupRequest({
    email: 'innocent@example.com', password: 'Correct-Horse-9', confirm: 'Correct-Horse-9',
  }, { ip: '203.0.113.77' }));
  const html = await res.text();
  check('other IP is NOT blocked', !/too many/i.test(html));
}

// --- 4. email_log ---------------------------------------------------------------------------
console.log('\n4. email_log is written on send (C3L-92)');
reset();
{
  await handler(signupRequest({
    email: 'logged@example.com', password: 'Correct-Horse-9', confirm: 'Correct-Horse-9',
  }, { ip: '203.0.113.5' }));
  const logs = emailLogCalls();
  check('a row was written to email_log', logs.length >= 1, `${logs.length} rows`);
  if (logs.length) {
    const row = Array.isArray(logs[0].body) ? logs[0].body[0] : logs[0].body;
    check('recipient recorded', row && row.recipient === 'logged@example.com', JSON.stringify(row));
    check('email_type recorded', row && typeof row.email_type === 'string' && row.email_type.length > 0);
    check('success flag recorded as boolean', row && typeof row.success === 'boolean');
    check('no id supplied (column is GENERATED ALWAYS)', row && !('id' in row));
  }
}

// --- 5. the Step A switch is back ON --------------------------------------------------------
console.log('\n5. Step E: the signup confirmation email is re-enabled');
reset();
{
  await handler(signupRequest({
    email: 'confirm.me@example.com', password: 'Correct-Horse-9', confirm: 'Correct-Horse-9',
  }, { ip: '203.0.113.6' }));
  check('a confirmation email WAS sent', resendCalls().length === 1, `${resendCalls().length} sends`);
  if (resendCalls().length) {
    const b = resendCalls()[0].body;
    check('sent to the signing-up address', b && Array.isArray(b.to) && b.to[0] === 'confirm.me@example.com');
    check('from the alerts@ sender', b && /alerts@cardsoncardsoncards\.com\.au/.test(b.from || ''));
  }
}

// --- 6. C3L-44 symmetry is preserved --------------------------------------------------------
console.log('\n6. C3L-44: registered and unregistered addresses behave identically');
reset();
{
  existingEmails.add('already@example.com');
  const r1 = await handler(signupRequest({
    email: 'already@example.com', password: 'Correct-Horse-9', confirm: 'Correct-Horse-9',
  }, { ip: '203.0.113.20' }));
  const h1 = await r1.text();
  const sends1 = resendCalls().length;

  reset();
  const r2 = await handler(signupRequest({
    email: 'brandnew@example.com', password: 'Correct-Horse-9', confirm: 'Correct-Horse-9',
  }, { ip: '203.0.113.21' }));
  const h2 = await r2.text();
  const sends2 = resendCalls().length;

  check('same status', r1.status === r2.status, `${r1.status} vs ${r2.status}`);
  check('both send exactly one email', sends1 === 1 && sends2 === 1, `${sends1} vs ${sends2}`);
  const strip = s => s.replace(/already@example\.com|brandnew@example\.com/g, 'ADDR');
  check('response bodies identical once the address is masked', strip(h1) === strip(h2));
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
