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

console.log('\n=== RESULT ===');
if (problems.length) {
  console.error(`DEPLOY HEALTH CHECK FAILED with ${problems.length} problem(s):`);
  for (const p of problems) console.error(' - ' + p);
  process.exit(1);
}
console.log('Deploy health check PASSED.');
