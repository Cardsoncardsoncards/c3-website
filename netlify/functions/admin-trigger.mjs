import { JOBS, JOB_NAMES, checkSyncSecret, syncSecret } from './shared/sync-jobs.mjs';
// netlify/functions/admin-trigger.mjs
//
// C3L-136. The front door for running a sync on demand.
//
// Two functions rather than one, for a reason worth stating. Netlify answers a background
// function with 202 the moment it accepts the request and then discards whatever the handler
// returns, so a background function CANNOT tell a caller that their secret was wrong. Putting
// the auth and the job-name check in a plain, synchronous function means an unauthorised
// request gets a real 401 and an unknown job gets a real 400, and only a request that passed
// both reaches the background half.
//
// This function is deliberately NOT scheduled, which is the whole reason it is reachable at
// all. See shared/sync-jobs.mjs for the 403 evidence.

export default async (req) => {
  const url = new URL(req.url);

  if (req.method !== 'POST') {
    return json({ error: 'POST only' }, 405);
  }

  const auth = checkSyncSecret(req);
  if (!auth.ok) {
    console.error(`[admin-trigger] rejected: ${auth.message}`);
    return json({ error: auth.message }, auth.status);
  }

  let job = url.searchParams.get('job');
  if (!job) {
    try {
      const body = await req.json();
      job = body && body.job;
    } catch { /* no body, handled below */ }
  }

  if (!job) {
    return json({ error: 'Missing job', jobs: describeJobs() }, 400);
  }
  if (!JOBS[job]) {
    return json({ error: `Unknown job "${job}"`, jobs: describeJobs() }, 400);
  }

  // Hand off to the background half, which has the 15 minute budget. This is an ordinary HTTP
  // call to a function with no `schedule` key, so it is not subject to the 403 that blocks the
  // scheduled functions themselves.
  const target = `${url.origin}/.netlify/functions/admin-trigger-background?job=${encodeURIComponent(job)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'x-sync-secret': syncSecret(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ job }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      console.error(`[admin-trigger] dispatch failed HTTP ${res.status}: ${detail}`);
      return json({ error: 'Dispatch failed', status: res.status, detail }, 502);
    }
    console.log(`[admin-trigger] dispatched ${job}, background accepted with ${res.status}`);
    return json({
      accepted: true,
      job,
      label: JOBS[job].label,
      dispatchStatus: res.status,
      // Said plainly, because a 202 is not a result. C3L-133 is the case where a job reported
      // success nightly while writing nothing.
      note: 'Accepted, not completed. Watch sync_events for manual_trigger_success or manual_trigger_failure on this game, and the function log for detail.'
    }, 202);
  } catch (err) {
    clearTimeout(timer);
    console.error(`[admin-trigger] dispatch error: ${err.message}`);
    return json({ error: 'Dispatch error', detail: err.message }, 502);
  }
};

function describeJobs() {
  return JOB_NAMES.map(n => ({
    job: n,
    label: JOBS[n].label,
    schedule: JOBS[n].schedule,
    // Surfaced deliberately. Three of these jobs send email to real people and a re-run
    // double-sends, so the warning has to reach whoever is reading the job list, not sit
    // only in shared/sync-jobs.mjs where a caller never looks.
    ...(JOBS[n].caution ? { caution: JOBS[n].caution } : {})
  }));
}

function json(obj, status) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
  });
}

export const config = {
  path: '/api/admin/trigger'
};
