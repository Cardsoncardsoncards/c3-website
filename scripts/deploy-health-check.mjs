// scripts/deploy-health-check.mjs
//
// C3L-26. On 4 August 2026 the production deploy of commit 2d0404b failed outright, Netlify
// recorded state "error" and deploy_time null, and nothing said so. The site was not broken only
// because the previous deploy stayed published and the next commit built cleanly 19 minutes
// later. For those 19 minutes origin/main and the live site were different code. It was found by
// accident, because a later task happened to check the deploy record rather than assume a push
// means a deploy.
//
// This is the automatic version of that check. Two questions, both of which that incident would
// have answered wrongly:
//
//   1. Did the most recent deploy FAIL? A deploy in state "error" is a failure nobody is
//      otherwise told about.
//   2. Is what is PUBLISHED actually what is on origin/main? A deploy can fail, or be skipped,
//      or be superseded, and leave the live site quietly behind the repo. Comparing the published
//      commit_ref against origin/main is the only thing that catches that, and it is the check
//      that would have caught 2d0404b.
//
// Deliberately tolerant of the normal case: a deploy that is still building or enqueued is not a
// failure, it is the ordinary state for a minute or two after a push, so a published ref that is
// behind origin/main is only reported when nothing is currently in flight. Otherwise this would
// cry wolf on every push and be ignored within a week, which is how a check like this dies.
//
// Failure behaviour per Part 0: a real problem exits non-zero and fails the workflow, which is
// the same notification path that surfaced the July MTG sync outage. A missing token or an
// unreachable API also exits non-zero rather than passing quietly, because a check that could not
// run is not a check that passed.

const SITE_ID = process.env.NETLIFY_SITE_ID || 'cfa7a71e-27b6-4a5b-a888-ba5924a436d3';
const TOKEN   = process.env.NETLIFY_AUTH_TOKEN;
const EXPECTED_SHA = (process.env.EXPECTED_SHA || '').trim();

if (!TOKEN) {
  console.error('FATAL: NETLIFY_AUTH_TOKEN is required. This check cannot run without it, and a');
  console.error('check that cannot run is not a check that passed. Add it as a repository secret.');
  process.exit(1);
}
if (!EXPECTED_SHA) {
  console.error('FATAL: EXPECTED_SHA not set. The workflow should pass the origin/main SHA.');
  process.exit(1);
}

const api = async (path) => {
  const r = await fetch(`https://api.netlify.com/api/v1${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  if (!r.ok) throw new Error(`Netlify API ${path} returned ${r.status}`);
  return r.json();
};

const problems = [];

try {
  const deploys = await api(`/sites/${SITE_ID}/deploys?per_page=5`);
  if (!Array.isArray(deploys) || !deploys.length) {
    problems.push('Netlify returned no deploys at all, which is itself wrong.');
  } else {
    const latest = deploys[0];
    console.log(`latest deploy   : ${(latest.commit_ref || 'none').slice(0, 7)} state=${latest.state}`);

    // 1. Did the most recent deploy fail?
    if (latest.state === 'error') {
      problems.push(
        `latest deploy ${(latest.commit_ref || 'unknown').slice(0, 7)} FAILED: ` +
        `${latest.error_message || 'no error message recorded'}`
      );
    }

    // 2. Is the published deploy the same commit as origin/main?
    const site = await api(`/sites/${SITE_ID}`);
    const published = site.published_deploy || {};
    const pubRef = (published.commit_ref || '').trim();
    console.log(`published       : ${pubRef.slice(0, 7)} state=${published.state}`);
    console.log(`origin/main     : ${EXPECTED_SHA.slice(0, 7)}`);

    const inFlight = deploys.some((d) => ['building', 'enqueued', 'uploading', 'processing'].includes(d.state));

    if (pubRef && pubRef !== EXPECTED_SHA) {
      if (inFlight) {
        console.log('published is behind origin/main, but a deploy is in flight. Not a failure.');
      } else {
        problems.push(
          `published commit ${pubRef.slice(0, 7)} does not match origin/main ${EXPECTED_SHA.slice(0, 7)}, ` +
          'and nothing is currently deploying. The live site is not the repo.'
        );
      }
    } else if (pubRef === EXPECTED_SHA) {
      console.log('published matches origin/main.');
    }
  }
} catch (e) {
  problems.push(`check threw before completing: ${e.message}`);
}

// C3L-51, the mutual half. The sync health check runs once a day and would go silent without
// anyone noticing if its schedule stopped firing, which GitHub does to cron workflows on
// inactive repos. A detector that can die quietly has moved the blind spot rather than closed
// it. So this job, which runs hourly, asserts that the daily one actually ran. The daily one
// asserts the same about its own previous run. Two independent schedules watching each other,
// so killing detection now takes both of them failing at once rather than either.
//
// Skipped rather than failed when Supabase credentials are absent, because this is a secondary
// assertion inside a check whose primary job is deploys, and refusing to report on deploys
// because a different subsystem is unconfigured would be the wrong trade. The absence is
// printed loudly instead.
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const HEARTBEAT_GAME = '__sync_health_check__';
const HEARTBEAT_MAX_AGE_HOURS = 36;

console.log('\n=== Sync health check heartbeat (C3L-51 mutual monitoring) ===');
if (!SB_URL || !SB_KEY) {
  console.log('SKIPPED: SUPABASE_URL / SUPABASE_SERVICE_KEY not set for this workflow, so the');
  console.log('sync health check is NOT being watched by anything right now.');
} else {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(
      `${SB_URL}/rest/v1/sync_events?select=triggered_at&game=eq.${HEARTBEAT_GAME}&order=triggered_at.desc&limit=1`,
      { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }, signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 150)}`);
    const rows = await res.json();
    if (!rows.length) {
      console.log('no heartbeat recorded yet. Expected until the sync health check has run once.');
    } else {
      const ageH = (Date.now() - new Date(rows[0].triggered_at).getTime()) / 3600000;
      console.log(`last sync health check ran ${ageH.toFixed(1)}h ago (${rows[0].triggered_at})`);
      if (ageH > HEARTBEAT_MAX_AGE_HOURS) {
        problems.push(
          `the sync health check has not run for ${ageH.toFixed(1)}h, against a daily schedule. ` +
          'Nothing is currently watching the 32 game syncs.'
        );
      }
    }
  } catch (e) {
    console.log(`heartbeat lookup failed: ${e.message}. Not failing the deploy check on this.`);
  }
}

console.log('\n=== RESULT ===');
if (problems.length) {
  console.error(`DEPLOY HEALTH CHECK FAILED with ${problems.length} problem(s):`);
  for (const p of problems) console.error(' - ' + p);
  process.exit(1);
}
console.log('Deploy health check PASSED.');
