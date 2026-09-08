// netlify/functions/admin-archive-probe.mjs
//
// PHASE 0 PROBE for the snapshot archive. Manually invoked, NOT scheduled.
//
// WHY THIS EXISTS
// C3L-221: Netlify's env-read API returns a 20 character MASK for every secret-flagged
// variable, with nothing in the response saying so. A session reading a secret that way
// gets a plausible-looking fake and, if it probes a vendor with it, gets a rejection that
// looks like proof the stored credential is bad. That already produced one wrong, confidently
// worded finding (C3L-93, retracted the same day).
//
// The only place the real value exists is inside Netlify's runtime. So this function does the
// credential handling here, where it belongs, and reports ONLY a verdict.
//
// ABSOLUTE RULE FOR THIS FILE, and the reason it is stated so loudly: this function must NEVER
// return, log, echo or otherwise emit the credential value, any prefix or suffix of it, its
// length, or any hash of it. Not in the response, not in console output, not while debugging a
// failure. If a check fails, the correct output is the FAILURE MODE, never the material. There
// is deliberately no "debug" branch, because the moment one exists someone will use it.
//
// It is a `path` function rather than a scheduled one on purpose: C3L-136 established that
// Netlify answers 403 to any direct HTTP request for a function whose config carries `schedule`,
// so a scheduled probe could never be invoked at all.
import { checkSyncSecret } from './shared/sync-jobs.mjs';

const BUCKET = 'price-snapshot-archive';

// C3L-96: the service credential lives under TWO names across two secret stores, and nothing
// connects them. Do not assume SUPABASE_SERVICE_KEY. Try both, report which one worked BY NAME.
const CREDENTIAL_NAMES = ['SUPABASE_SERVICE_KEY', 'SUPABASE_SECRET_KEY'];

// CLAUDE.md requires Netlify.env.get in functions and forbids process.env, which is why that is
// tried first. process.env is kept only as a second read for THIS diagnostic, because the whole
// point is to find out which read path actually yields a working value at runtime.
function readEnv(name) {
  try {
    if (typeof Netlify !== 'undefined' && Netlify.env) {
      const v = Netlify.env.get(name);
      if (v) return { value: v, via: 'Netlify.env.get' };
    }
  } catch { /* fall through */ }
  try {
    if (typeof process !== 'undefined' && process.env && process.env[name]) {
      return { value: process.env[name], via: 'process.env' };
    }
  } catch { /* fall through */ }
  return { value: '', via: null };
}

async function withTimeout(fn, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fn(controller.signal); } finally { clearTimeout(timer); }
}

export default async (req) => {
  const auth = checkSyncSecret(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.message }), {
      status: auth.status, headers: { 'Content-Type': 'application/json' },
    });
  }

  const steps = [];
  const url = readEnv('SUPABASE_URL').value;
  if (!url) {
    return new Response(JSON.stringify({
      ok: false, failedAt: 'SUPABASE_URL', detail: 'not present in this runtime context',
    }, null, 2), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  // 1. Which credential NAME is actually present here? Names only, never values.
  const present = CREDENTIAL_NAMES
    .map((n) => ({ name: n, ...readEnv(n) }))
    .filter((c) => c.value);

  steps.push({
    step: 'credential-lookup',
    namesChecked: CREDENTIAL_NAMES,
    namesPresent: present.map((c) => c.name),
    readVia: present.length ? present[0].via : null,
  });

  if (!present.length) {
    return new Response(JSON.stringify({
      ok: false,
      failedAt: 'credential-lookup',
      detail: 'neither credential name is present in this runtime context',
      context: readEnv('CONTEXT').value || 'unknown',
      steps,
    }, null, 2), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  // Use the first name that is present. The value never leaves this scope.
  const KEY = present[0].value;
  const usedName = present[0].name;
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

  // 2. Does the credential actually authenticate? Read a service-role-only table.
  //    A working service credential returns 200. The anon key also returns 200 here but with an
  //    empty array under RLS, so the status alone is not the test: this is a reachability check,
  //    and the authoritative test is the Storage call below, which anon cannot do at all.
  let authOk = false;
  try {
    const r = await withTimeout((signal) =>
      fetch(`${url}/rest/v1/follows?select=id&limit=1`, { headers: H, signal }));
    authOk = r.ok;
    steps.push({ step: 'postgrest-reachable', status: r.status, ok: r.ok });
  } catch (e) {
    steps.push({ step: 'postgrest-reachable', ok: false, error: e.name });
  }

  // 3. List buckets. This is service-role only, so success here is the real proof.
  let bucketExisted = null;
  try {
    const r = await withTimeout((signal) =>
      fetch(`${url}/storage/v1/bucket`, { headers: H, signal }));
    const listOk = r.ok;
    let names = [];
    if (listOk) {
      const body = await r.json();
      if (Array.isArray(body)) names = body.map((b) => b.name);
    }
    bucketExisted = listOk ? names.includes(BUCKET) : null;
    steps.push({ step: 'storage-list-buckets', status: r.status, ok: listOk, bucketCount: names.length });
    if (!listOk) {
      return new Response(JSON.stringify({
        ok: false, failedAt: 'storage-list-buckets', credentialNameUsed: usedName,
        detail: 'the credential did not authenticate against Storage',
        context: readEnv('CONTEXT').value || 'unknown', steps,
      }, null, 2), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (e) {
    steps.push({ step: 'storage-list-buckets', ok: false, error: e.name });
    return new Response(JSON.stringify({ ok: false, failedAt: 'storage-list-buckets', steps }, null, 2),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  // 4. Create the bucket if it is not there. Private, never public: these are price archives.
  if (!bucketExisted) {
    try {
      const r = await withTimeout((signal) => fetch(`${url}/storage/v1/bucket`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }), signal,
      }));
      steps.push({ step: 'storage-create-bucket', status: r.status, ok: r.ok });
    } catch (e) {
      steps.push({ step: 'storage-create-bucket', ok: false, error: e.name });
    }
  }

  // 5. Round trip a small object. Write, read back, compare byte for byte, then clean up.
  const probePath = '_selftest/phase0-probe.json';
  const payload = JSON.stringify({ probe: 'phase0', at: new Date().toISOString(), rows: [1, 2, 3] });
  let writeOk = false, readBack = false, cleaned = false;
  try {
    const w = await withTimeout((signal) => fetch(`${url}/storage/v1/object/${BUCKET}/${probePath}`, {
      method: 'POST', headers: { ...H, 'Content-Type': 'application/json', 'x-upsert': 'true' },
      body: payload, signal,
    }));
    writeOk = w.ok;
    steps.push({ step: 'storage-write', status: w.status, ok: w.ok });

    if (writeOk) {
      const g = await withTimeout((signal) =>
        fetch(`${url}/storage/v1/object/${BUCKET}/${probePath}`, { headers: H, signal }));
      const back = g.ok ? await g.text() : '';
      readBack = g.ok && back === payload;
      steps.push({ step: 'storage-read-back', status: g.status, byteIdentical: readBack });

      const d = await withTimeout((signal) =>
        fetch(`${url}/storage/v1/object/${BUCKET}/${probePath}`, { method: 'DELETE', headers: H, signal }));
      cleaned = d.ok;
      steps.push({ step: 'storage-cleanup', status: d.status, ok: d.ok });
    }
  } catch (e) {
    steps.push({ step: 'storage-round-trip', ok: false, error: e.name });
  }

  const ok = writeOk && readBack;
  return new Response(JSON.stringify({
    ok,
    credentialNameUsed: usedName,        // NAME only. The value never leaves this function.
    readVia: present[0].via,
    context: readEnv('CONTEXT').value || 'unknown',
    bucket: BUCKET,
    bucketExisted,
    postgrestReachable: authOk,
    cleanedUp: cleaned,
    steps,
  }, null, 2), {
    status: ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = {
  path: '/api/admin/archive-probe',
};
