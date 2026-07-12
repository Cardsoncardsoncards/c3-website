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

const SITE_HOST     = 'cardsoncardsoncards.com.au';
const SITE_URL      = `https://${SITE_HOST}`;
const INDEXNOW_KEY  = Netlify.env.get('INDEXNOW_KEY');
const SYNC_SECRET   = Netlify.env.get('SYNC_SECRET');

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const CHUNK_SIZE        = 10000;   // IndexNow's documented per-request maximum
const FETCH_TIMEOUT     = 20000;
const SUBMIT_TIMEOUT    = 30000;

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

export default async (req) => {
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

    const summary = {
      ok: failedChunks === 0,
      totalUrls: urls.length,
      chunksSent: results.length,
      urlsAccepted: sent,
      failedChunks,
      sources,
      failedSources,
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
