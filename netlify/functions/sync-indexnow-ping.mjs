// netlify/functions/sync-indexnow-ping.mjs
// Submits the site's full URL set to IndexNow (Bing, Yandex, Seznam, Naver) once a day.
//
// Runs at 03:00 UTC, deliberately after the 02:30 UTC tcg_releases sync, so a same-day
// release change is already in the sitemaps by the time this reads them.
//
// How it works: read sitemap-index.xml, fetch every sub-sitemap it lists, collect every
// <loc>, then POST the list to IndexNow's bulk endpoint in chunks of 10,000 (its documented
// per-request maximum).
//
// KNOWN LIMITATION (v1): this is a blunt FULL RESUBMIT, not a diff. It re-submits every URL
// on every run rather than only what changed, because no change-tracking infrastructure
// exists yet. IndexNow tolerates this, but it is wasteful and worth refining once there is a
// way to know which URLs actually changed (e.g. reading updated_at off the sitemaps, or a
// last-pinged table). Flagged rather than hidden.
//
// Ownership: IndexNow verifies the caller owns the host by fetching keyLocation and matching
// its contents against `key`. The key lives in the INDEXNOW_KEY env var and is served from
// https://cardsoncardsoncards.com.au/<key>.txt (Eleventy passthrough).
//
// Trigger: scheduled daily, or manually with an x-sync-secret header against
// /.netlify/functions/sync-indexnow-ping (a scheduled function cannot have a custom path).
// Pass ?dryRun=1 to collect and count URLs without submitting anything.
//
// RATE GATE (task-157): a real submission runs at most once every 20 hours, enforced against a
// timestamp in site_config, for every caller including the cron. See the GATE_ constants below
// for why this exists and why it is not an auth check. ?dryRun=1 is not gated.

const SITE_HOST     = 'cardsoncardsoncards.com.au';
const SITE_URL      = `https://${SITE_HOST}`;
const INDEXNOW_KEY  = Netlify.env.get('INDEXNOW_KEY');
const SYNC_SECRET   = Netlify.env.get('SYNC_SECRET');

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const CHUNK_SIZE        = 10000;   // IndexNow's documented per-request maximum
const FETCH_TIMEOUT     = 20000;
const SUBMIT_TIMEOUT    = 30000;

// task-157 rate gate.
//
// task-154 proved live that a bare unauthenticated request to this endpoint returns 200 and
// runs the whole job: a single curl with no headers submitted all 56,161 URLs and IndexNow
// accepted every chunk. The auth check below short-circuits on a MISSING header, so "no secret"
// is treated as more trusted than "wrong secret".
//
// The proper fix is to make the secret mandatory, but that cannot be written yet: nobody has
// seen what a genuine Netlify scheduled invocation actually carries, so there is no way to tell
// it apart from a public request without guessing. Tonight's real 03:00 UTC run, captured by the
// task-154 diagnostic log above, settles that in a follow-up.
//
// This gate closes the practical risk in the meantime. It does not care who is calling. It only
// asks when the last successful submission happened, and refuses to run another one inside the
// window. An attacker hammering the endpoint gets one submission per window, exactly like the
// cron, which removes the unlimited-free-resubmit problem without pretending to know the
// scheduled request shape.
//
// 20 hours, not 24: the cron fires every 24 hours, so a 24 hour window would race its own
// schedule and skip a day whenever a run started even slightly late. 20 leaves 4 hours of slack
// while still blocking a same-day repeat.
const GATE_KEY   = 'indexnow_last_run_at';
const GATE_HOURS = 20;
const GATE_MS    = GATE_HOURS * 60 * 60 * 1000;
const DB_TIMEOUT = 5000;

async function timedFetch(url, opts = {}, timeout = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim()).filter(Boolean);
}

// Read the sitemap index, then every sitemap it points at, and collect every URL.
async function collectUrls(log) {
  const idxRes = await timedFetch(`${SITE_URL}/sitemap-index.xml`);
  if (!idxRes.ok) throw new Error(`sitemap-index.xml returned ${idxRes.status}`);
  const sources = extractLocs(await idxRes.text());
  log.push(`sitemap-index.xml lists ${sources.length} sources`);

  const seen = new Set();
  let failed = 0;

  for (const src of sources) {
    try {
      const res = await timedFetch(src);
      if (!res.ok) {
        failed++;
        log.push(`  WARN ${src} returned ${res.status}, skipped`);
        continue;
      }
      const locs = extractLocs(await res.text());
      // Only submit URLs on our own host. IndexNow rejects (422) a payload containing a URL
      // that does not belong to the declared host, which would fail the whole chunk.
      let kept = 0;
      for (const u of locs) {
        if (!u.startsWith(SITE_URL + '/')) continue;
        if (seen.has(u)) continue;   // the same URL can legitimately appear in two sitemaps
        seen.add(u);
        kept++;
      }
      log.push(`  ${src.replace(SITE_URL, '')}: ${locs.length} locs, ${kept} new`);
    } catch (e) {
      failed++;
      log.push(`  WARN ${src} failed: ${e.message}`);
    }
  }

  return { urls: [...seen], sources: sources.length, failedSources: failed };
}

async function submitChunk(urlList) {
  const res = await timedFetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: SITE_HOST,
      key: INDEXNOW_KEY,
      keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
      urlList
    })
  }, SUBMIT_TIMEOUT);

  let body = '';
  try { body = (await res.text()).slice(0, 300); } catch { /* body is optional on 200 */ }
  return { status: res.status, ok: res.ok, body };
}

// Read the last successful submission time out of site_config.
// Returns { ok: true, at: Date|null } on a clean read, where null means the key has never been
// written (first ever run). Returns { ok: false, error } when the read itself failed, which the
// caller treats as a reason to refuse rather than a reason to proceed.
async function readLastRunAt() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DB_TIMEOUT);
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/site_config?select=value,updated_at&key=eq.${GATE_KEY}&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        },
        signal: controller.signal
      }
    );
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `site_config read returned ${res.status}: ${body.slice(0, 160)}` };
    }
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return { ok: true, at: null };
    const parsed = new Date(rows[0].value);
    // A corrupt value must not silently disable the gate, so treat it as unreadable.
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: `site_config value is not a date: ${String(rows[0].value).slice(0, 60)}` };
    }
    return { ok: true, at: parsed };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e.message };
  }
}

// Stamp a successful submission. POST with merge-duplicates rather than the PATCH that
// sync-fx-rate uses, because PATCH silently matches zero rows the first time this key is
// written and the gate would never arm itself.
async function recordRun(iso) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DB_TIMEOUT);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/site_config`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({ key: GATE_KEY, value: iso, updated_at: iso }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text();
      console.error(`[indexnow] failed to record run time ${res.status}: ${body.slice(0, 160)}`);
      return false;
    }
    return true;
  } catch (e) {
    clearTimeout(timer);
    console.error('[indexnow] failed to record run time:', e.message);
    return false;
  }
}

export default async (req) => {
  // TEMPORARY (task-154 investigation, remove before shipping): log the full request shape so a
  // real scheduled invocation can be compared against a public one. Reads the body defensively,
  // since a scheduled GET has none.
  try {
    let rawBody = '';
    try { rawBody = await req.clone().text(); } catch (e) { rawBody = `<unreadable: ${e.message}>`; }
    console.log('[indexnow][task-154] REQUEST', JSON.stringify({
      method: req.method,
      url: req.url,
      headers: Object.fromEntries(req.headers.entries()),
      bodyLength: rawBody.length,
      body: rawBody.slice(0, 2000)
    }));
  } catch (e) {
    console.log('[indexnow][task-154] request log failed:', e.message);
  }

  // Scheduled invocations carry no secret; manual ones must present it.
  const secret = req.headers.get('x-sync-secret');
  if (secret && SYNC_SECRET && secret !== SYNC_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!INDEXNOW_KEY) {
    console.error('[indexnow] INDEXNOW_KEY not configured');
    return new Response(JSON.stringify({ ok: false, error: 'INDEXNOW_KEY not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dryRun') === '1';

  // The gate sits here, ahead of collectUrls, not next to the submit loop. collectUrls fetches
  // sitemap-index.xml plus all 35 sub-sitemaps, and 33 of those are our own /api/sitemap-*
  // functions, so letting a gated caller through to that point would still cost a burst of
  // Netlify invocations per request. Refusing first makes a blocked request nearly free.
  // dryRun stays ungated on purpose: it submits nothing, and it is the tool for checking what
  // the job would do without consuming the day's single real run.
  if (!dryRun) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('[indexnow] gate cannot run, Supabase env vars missing');
      return new Response(JSON.stringify({
        ok: false, error: 'rate gate unavailable: Supabase env vars missing'
      }, null, 2), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const gate = await readLastRunAt();

    // Fail CLOSED. If the gate cannot be read it is not safe to assume the window is open, and
    // the cost of being wrong is asymmetric: refusing costs at most one skipped day of IndexNow
    // pings, which changes nothing that the sitemaps do not already cover, while proceeding
    // would hand back the unlimited resubmit this whole gate exists to stop.
    if (!gate.ok) {
      console.error('[indexnow] GATE UNREADABLE, refusing to submit:', gate.error);
      return new Response(JSON.stringify({
        ok: false, gated: true, reason: 'gate_unreadable', error: gate.error
      }, null, 2), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }

    if (gate.at) {
      const elapsed = Date.now() - gate.at.getTime();
      if (elapsed < GATE_MS) {
        const nextEligible = new Date(gate.at.getTime() + GATE_MS);
        const retryAfter = Math.max(1, Math.ceil((GATE_MS - elapsed) / 1000));
        console.log(`[indexnow] GATED: last run ${gate.at.toISOString()}, next eligible ${nextEligible.toISOString()}`);
        // 429, not 401. This is not an authentication decision. The caller may well be the
        // legitimate cron; it is simply too soon for anyone to submit again.
        return new Response(JSON.stringify({
          ok: false,
          gated: true,
          lastRunAt: gate.at.toISOString(),
          nextEligibleAt: nextEligible.toISOString(),
          windowHours: GATE_HOURS
        }, null, 2), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) }
        });
      }
    }
  }

  const log = [];
  try {
    const { urls, sources, failedSources } = await collectUrls(log);
    log.push(`collected ${urls.length} distinct URLs from ${sources} sources (${failedSources} failed)`);

    if (urls.length === 0) throw new Error('collected 0 URLs, refusing to submit an empty payload');

    if (dryRun) {
      const summary = { ok: true, dryRun: true, totalUrls: urls.length, sources, failedSources,
                        chunksWouldSend: Math.ceil(urls.length / CHUNK_SIZE), log };
      console.log('[indexnow]', JSON.stringify({ ...summary, log: undefined }));
      return new Response(JSON.stringify(summary, null, 2), { headers: { 'Content-Type': 'application/json' } });
    }

    const results = [];
    let sent = 0, failedChunks = 0;
    for (let i = 0; i < urls.length; i += CHUNK_SIZE) {
      const chunk = urls.slice(i, i + CHUNK_SIZE);
      const r = await submitChunk(chunk);
      results.push({ chunk: results.length + 1, urls: chunk.length, status: r.status, body: r.body || undefined });
      if (r.ok) sent += chunk.length; else failedChunks++;
      console.log(`[indexnow] chunk ${results.length}: ${chunk.length} URLs -> HTTP ${r.status}${r.ok ? '' : ' ' + r.body}`);
    }

    // Arm the gate only on a fully clean submission, which is what "last successful run" means.
    // A run with a failed chunk deliberately leaves the window open so it can be retried rather
    // than losing a day to a transient IndexNow error. Chunk success is decided by IndexNow, not
    // by the caller, so this is not a lever anyone can pull to bypass the gate.
    let runRecorded = false;
    if (failedChunks === 0) {
      runRecorded = await recordRun(new Date().toISOString());
      if (!runRecorded) {
        // The submission really did happen, so say so plainly. The gate is now open earlier than
        // it should be, and that is worth seeing in the logs rather than hiding.
        console.error('[indexnow] submitted successfully but could NOT record the run time, the gate is still open');
      }
    }

    const summary = {
      ok: failedChunks === 0,
      totalUrls: urls.length,
      chunksSent: results.length,
      urlsAccepted: sent,
      failedChunks,
      sources,
      failedSources,
      gateRecorded: runRecorded,
      results
    };
    console.log('[indexnow] SUMMARY', JSON.stringify({ ...summary, results: undefined }));

    return new Response(JSON.stringify({ ...summary, log }, null, 2), {
      status: failedChunks === 0 ? 200 : 502,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[indexnow] FATAL:', err.message);
    return new Response(JSON.stringify({ ok: false, error: err.message, log }, null, 2), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};

// No `path` key here. Netlify rejects a custom path on a scheduled function, so this is
// reachable only at its default URL, /.netlify/functions/sync-indexnow-ping.
export const config = {
  schedule: '0 3 * * *'   // daily 03:00 UTC, after the 02:30 UTC tcg_releases sync
};
