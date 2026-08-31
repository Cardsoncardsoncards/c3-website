// scripts/rls-recurring-check.mjs
//
// The recurring version of protocol Section 4's RLS and BOLA check. Section 4 closes with
// "once closed, add it as a recurring scheduled check, per Part 0's any-recurring-check-must-
// fail-gracefully rule, not a one-time sweep". Task 06 ran the check by hand on 5 August 2026
// and it passed; this is that same method, automated, so it keeps being true rather than having
// been true once.
//
// It deliberately does NOT redesign the test. It is the same two halves Task 06 ran:
//   PART A  anon-key sweep: every table holding user-identifying data must return zero rows to
//           the anon key, which is the key that ships to browsers.
//   PART B  two-account object-level test: account A must not be able to read, soft delete or
//           hard delete account B's rows through the same endpoints the app itself uses.
//
// TWO THINGS IT DOES THAT A NAIVE REPEAT WOULD NOT:
//
// 1. It distinguishes a MEANINGFUL pass from a VACUOUS one. Task 06's sweep found 0 rows on all
//    13 sensitive tables, but 9 of them were empty, so 0 rows proved nothing about those. C3L-06
//    records that caveat. This script reads each table's true row count via a service-role RPC
//    and labels every result, so `collection_waitlist` and `card_price_alerts` start being
//    genuinely tested the moment they hold a single row instead of reporting the same empty pass
//    forever.
// 2. It discovers its own targets. Section 4 point 4 asks for "every other table added since the
//    last time anyone looked". The target list comes from column shape at run time, so a new
//    table with an email or user_id column is picked up without anyone remembering to add it.
//
// FAILURE BEHAVIOUR, per Part 0. Any real failure exits non-zero, which fails the workflow, which
// is the same mechanism that surfaced the MTG sync outage. A missing secret or an unreachable
// database also exits non-zero rather than passing quietly: a check that cannot run is not a
// check that passed. Synthetic accounts are always cleaned up, including on failure.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SECRET_KEY;
const ANON_KEY     = process.env.SUPABASE_ANON_KEY;
const SITE_ORIGIN  = process.env.SITE_ORIGIN || 'https://cardsoncardsoncards.com.au';

const failures = [];
const notes    = [];
let createdAccountIds = [];

function fail(msg) { failures.push(msg); console.error('FAIL: ' + msg); }
function note(msg) { notes.push(msg);   console.log('  ' + msg); }

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error('FATAL: SUPABASE_URL, SUPABASE_SECRET_KEY and SUPABASE_ANON_KEY are all required.');
  console.error('SUPABASE_ANON_KEY is the one this check adds; the sweep is meaningless without');
  console.error('the key that actually ships to browsers. Add it as a repository secret.');
  process.exit(1);
}

async function svc(path, init = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', ...(init.headers || {})
    }
  });
}
async function anon(path) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
  });
}

// --- PART A: anon sweep over every table holding user-identifying data -----------------------

async function partA() {
  console.log('\n=== PART A: anon-key sweep ===');
  const res = await svc('rpc/rls_audit_targets', { method: 'POST', body: '{}' });
  if (!res.ok) {
    fail(`could not list audit targets (rls_audit_targets returned ${res.status}). The check cannot run.`);
    return;
  }
  const targets = await res.json();
  if (!Array.isArray(targets) || targets.length === 0) {
    fail('rls_audit_targets returned no tables, which is itself wrong. The check cannot run.');
    return;
  }

  let meaningful = 0, vacuous = 0;
  for (const t of targets) {
    if (!t.rls_enabled) fail(`${t.table_name}: RLS is DISABLED`);

    const r = await anon(`${t.table_name}?select=*&limit=3`);
    let rows = null;
    try { const j = await r.json(); if (Array.isArray(j)) rows = j.length; } catch { /* non-array body */ }

    if (rows !== null && rows > 0) {
      // The one unambiguous failure: real rows handed to the browser key.
      fail(`${t.table_name}: anon key returned ${rows} row(s). Live exposure.`);
      continue;
    }
    if (Number(t.row_count) > 0) {
      meaningful++;
      note(`${t.table_name}: blocked, MEANINGFUL (${t.row_count} real rows exist)`);
    } else {
      vacuous++;
      note(`${t.table_name}: blocked, but table is EMPTY so this proves nothing yet`);
    }
  }
  console.log(`Part A: ${targets.length} tables, ${meaningful} meaningful, ${vacuous} vacuous (empty).`);
  if (meaningful === 0) {
    fail('every sensitive table is empty, so Part A proved nothing at all this run.');
  }
}

// --- PART B: two-account object-level test ---------------------------------------------------

async function makeAccount(label) {
  const email = `c3-rls-auto-${label}-${Date.now()}@example.com`;
  const r = await svc('accounts', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ email, password_hash: 'recurring-check:not-a-real-hash' })
  });
  if (!r.ok) throw new Error(`could not create synthetic account ${label}: ${r.status}`);
  const [row] = await r.json();
  createdAccountIds.push(row.id);
  return row;
}

async function mintToken(userId) {
  const token = `c3rlsauto-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const r = await svc('follow_magic_links', {
    method: 'POST', body: JSON.stringify({ token, user_id: userId, expires_at: expires })
  });
  if (!r.ok) throw new Error(`could not mint magic link: ${r.status}`);
  return token;
}

// WF-03, 31 August 2026. DIAGNOSTICS ONLY. No condition, threshold or assertion changed: this
// function returns exactly what it returned before, for exactly the same inputs, and Part B still
// fails in exactly the same circumstances. The only difference is that it now says why.
//
// This check has failed every scheduled run since between 5 and 9 August and three weeks of
// failures carry no diagnostic information at all, because the status and body were discarded.
// Two sessions have now investigated it and disproven five hypotheses (missing SUPABASE_ANON_KEY,
// the SESSION_SECRET fail-closed gate, a broken service key, an ambiguous PostgREST embed, and
// SECURITY_HEADERS clobbering Set-Cookie) without being able to see what the endpoint replied.
//
// Nothing credential-shaped is printed. The token is never logged, no Set-Cookie VALUE is logged
// (only the count and the cookie NAMES), and the body excerpt is passed through redact() first.
function redactForLog(text) {
  return String(text)
    // any token= or key= query value
    .replace(/([?&](?:token|key|apikey|secret|password)=)[^&"'\s<]+/gi, '$1[REDACTED]')
    // JWT-shaped and base64/hex-shaped runs, which is what a key or a session value looks like
    .replace(/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+)?/g, '[REDACTED-JWT]')
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, '[REDACTED-HEX]');
}

// Which known /account page came back. This is the actually diagnostic bit: each of these strings
// is emitted by exactly one branch of account.mjs, so the marker names the branch that ran.
function accountPageMarker(body) {
  const marks = [
    ['That link is not valid', 'resolveMagicLink returned unknown (row not found, OR sbJson threw and was swallowed by its .catch)'],
    ['That link has expired', 'resolveMagicLink returned expired'],
    ['Sessions are not configured on this deployment', 'hasSessionSecret() is FALSE, cookie deliberately withheld'],
    ['Signed out', 'signout branch'],
    ['Your C3 Account', 'signed-out account page'],
  ];
  const hits = marks.filter(m => body.includes(m[0])).map(m => m[0] + ' -> ' + m[1]);
  return hits.length ? hits.join(' | ') : '(no known marker)';
}

async function sessionCookie(token) {
  const r = await fetch(`${SITE_ORIGIN}/account?token=${encodeURIComponent(token)}`, { redirect: 'manual' });
  const set = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')].filter(Boolean);
  const cookie = (set || []).map(c => c.split(';')[0]).join('; ');

  if (!cookie) {
    console.log('  DIAG sessionCookie: no Set-Cookie came back from /account?token=...');
    console.log(`    HTTP status      ${r.status} ${r.statusText || ''}`);
    console.log(`    location         ${r.headers.get('location') || '(none)'}`);
    console.log(`    content-type     ${r.headers.get('content-type') || '(none)'}`);
    console.log(`    set-cookie count ${(set || []).length}`);
    console.log(`    cookie names     ${(set || []).map(c => c.split('=')[0]).join(', ') || '(none)'}`);
    let body = '';
    try { body = await r.text(); } catch (err) { body = '(body unreadable: ' + err.message + ')'; }
    console.log(`    body length      ${body.length}`);
    console.log(`    page marker      ${accountPageMarker(body)}`);
    const title = /<title>([^<]*)<\/title>/i.exec(body);
    console.log(`    title            ${title ? title[1].trim() : '(none)'}`);
    console.log(`    body excerpt     ${redactForLog(body.replace(/\s+/g, " ").slice(0, 300))}`);
  }

  return cookie;
}

async function followRowsFor(userId) {
  const r = await svc(`follows?user_id=eq.${userId}&select=id,unsubscribed_at`);
  return r.ok ? r.json() : [];
}

async function partB() {
  console.log('\n=== PART B: two-account object-level test ===');
  const A = await makeAccount('a');
  const B = await makeAccount('b');
  const cookieA = await sessionCookie(await mintToken(A.id));
  if (!cookieA) { fail('could not establish a session for account A, Part B could not run.'); return; }

  // B creates a follow through the real endpoint.
  const cookieB = await sessionCookie(await mintToken(B.id));
  const mk = await fetch(`${SITE_ORIGIN}/api/card-follow`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: cookieB },
    body: JSON.stringify({ game: 'mtg', cardSlug: 'sol-ring', cardName: 'Sol Ring' })
  });
  if (!mk.ok) { fail(`account B could not create a follow (${mk.status}), Part B could not run.`); return; }

  const before = await followRowsFor(B.id);
  if (!before.length) { fail('account B has no follow row after creating one, Part B could not run.'); return; }
  const targetId = before[0].id;

  const body = (o) => new URLSearchParams(o).toString();
  const post = (cookie, o) => fetch(`${SITE_ORIGIN}/account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) },
    body: body(o), redirect: 'manual'
  });

  // A attacks B's row. Status codes are NOT the evidence, the database state is: the handler
  // re-renders the dashboard and returns 200 whether or not anything was changed.
  await post(cookieA, { action: 'stop',   id: String(targetId) });
  await post(cookieA, { action: 'remove', id: String(targetId) });
  await post(null,    { action: 'remove', id: String(targetId) });
  await fetch(`${SITE_ORIGIN}/api/my-follows?token=${encodeURIComponent(await mintToken(A.id))}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body({ remove: String(targetId) }), redirect: 'manual'
  });

  const after = await followRowsFor(B.id);
  const row = after.find(f => f.id === targetId);
  if (!row) {
    fail(`account A HARD DELETED account B's follow row ${targetId}. Object-level authorisation is broken.`);
  } else if (row.unsubscribed_at) {
    fail(`account A SOFT DELETED account B's follow row ${targetId}. Object-level authorisation is broken.`);
  } else {
    note(`B's follow row ${targetId} survived all four attacks intact.`);
  }

  // A's dashboard must not disclose B's data.
  const dash = await fetch(`${SITE_ORIGIN}/account`, { headers: { cookie: cookieA } });
  const html = await dash.text();
  if (html.includes(B.email)) fail("account A's dashboard disclosed account B's email address.");
  else note("A's dashboard does not disclose B's data.");
}

async function cleanup() {
  console.log('\n=== cleanup ===');
  for (const id of createdAccountIds) {
    await svc(`follows?user_id=eq.${id}`, { method: 'DELETE' });
    await svc(`follow_magic_links?user_id=eq.${id}`, { method: 'DELETE' });
    await svc(`accounts?id=eq.${id}`, { method: 'DELETE' });
  }
  const left = await svc('accounts?email=like.c3-rls-auto-*&select=id');
  const rows = left.ok ? await left.json() : [];
  if (Array.isArray(rows) && rows.length) {
    fail(`${rows.length} synthetic account(s) left behind after cleanup.`);
  } else {
    console.log(`  removed ${createdAccountIds.length} synthetic account(s), none left behind.`);
  }
}

// --- run -------------------------------------------------------------------------------------

let hardError = null;
try {
  await partA();
  await partB();
} catch (e) {
  hardError = e;
  fail(`check threw before completing: ${e.message}`);
} finally {
  try { await cleanup(); } catch (e) { fail(`cleanup failed: ${e.message}`); }
}

console.log('\n=== RESULT ===');
if (failures.length) {
  console.error(`RLS RECURRING CHECK FAILED with ${failures.length} problem(s):`);
  for (const f of failures) console.error(' - ' + f);
  process.exit(1);
}
console.log(`RLS recurring check PASSED. ${notes.length} checks recorded, 0 failures.`);
if (hardError) process.exit(1);
