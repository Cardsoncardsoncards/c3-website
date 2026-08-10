// scripts/fx-freshness-check.mjs
//
// C3L-131's recommended tripwire, built. Scheduled by .github/workflows/fx-freshness-check.yml.
//
// WHAT THIS IS FOR
// C3L-130: update_usd_aud_rate() ran 42 times between 27 June and 9 August, pg_cron recorded
// every single run as `succeeded`, and it never once updated the rate. It polls its own async
// pg_net response from inside the transaction that response can only be written after, so it
// times out at 30s, raises a WARNING, and returns having written nothing. A RAISE WARNING is
// not an error, so `cron.job_run_details.status` reads `succeeded` and nothing anywhere noticed
// for six weeks.
//
// This check does NOT touch that function. It is a tripwire, not a repair. It asks the one
// question that would have caught the whole thing on day one instead of day forty-two: is the
// number actually fresh?
//
// WHY THE SIGNAL IS THE VALUE'S OWN TIMESTAMP, and not the job status:
// The lesson of C3L-130 and C3L-131 is that a job reporting success proves nothing. The same
// applies to `sync_events` (C3L-51 already established that absence of an error there means
// nothing) and to `cron.job_run_details.status`. So this checks GROUND TRUTH, the same choice
// sync-health-check.mjs made for Signal A: the freshness of the value users actually get.
// site_config.usd_aud_rate.updated_at cannot be wrong about itself.
//
// It also cannot be fooled by the two-writer situation. There are currently two writers to this
// rate, the Netlify sync-fx-rate.mjs at 0 1 * * * which works, and the Postgres cron at
// 0 6 * * * which does not. This check does not care which one wrote it. If NEITHER writes, it
// fails, which is the only thing that matters.
//
// THRESHOLD, and why 26 hours with a 04:00 UTC run.
// The rate is written daily at 01:00 UTC. Checking at 04:00 gives a healthy age of ~3 hours.
// One entirely missed cycle puts the age at ~27 hours at the next check, which is past the
// 26 hour line and fails clearly. That leaves no borderline case in either direction: a
// working day is never close to failing, and a missed day is never close to passing.
//
// FAIL-CLOSED. Missing configuration is a failure, not a skip. A check that cannot run has not
// passed, the same rule the sync, RLS and deploy checks already follow.
//
// The alert channel is GitHub's own failure email, matching every other check here. Nothing new
// to maintain and nothing new to go quietly stale.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Above this age the rate is not being maintained by anything. See the note above.
const MAX_AGE_HOURS = 26;

// Secondary assertion, and it is deliberately here rather than left out. A stale rate is not
// the only way this number can be wrong: a present but nonsensical rate would silently reprice
// the entire catalogue. The bounds are not invented, they are the same 1.20 to 2.00 sanity
// range update_usd_aud_rate() already applies to itself before writing.
const MIN_SANE_RATE = 1.20;
const MAX_SANE_RATE = 2.00;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('FATAL: SUPABASE_URL and SUPABASE_SERVICE_KEY must both be set.');
  console.error('Failing rather than skipping: a check that cannot run has not passed.');
  process.exit(1);
}

async function sb(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      signal: ctrl.signal,
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) throw new Error(`${path} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

const run = async () => {
  console.log('=== FX rate freshness check (C3L-130 / C3L-131) ===');

  const rows = await sb('site_config?select=key,value,updated_at&key=eq.usd_aud_rate&limit=1');

  const problems = [];

  if (!Array.isArray(rows) || rows.length === 0) {
    // Not the same failure as a stale rate, and worth saying so distinctly: the row is gone.
    console.error('FAIL: site_config has no usd_aud_rate row at all.');
    console.error('\nFX freshness check FAILED.');
    process.exit(1);
  }

  const row     = rows[0];
  const rate    = parseFloat(row.value);
  const updated = new Date(row.updated_at);
  const ageHrs  = (Date.now() - updated.getTime()) / 3.6e6;

  console.log(`  rate:       ${row.value}`);
  console.log(`  updated_at: ${row.updated_at}`);
  console.log(`  age:        ${ageHrs.toFixed(1)}h (limit ${MAX_AGE_HOURS}h)`);

  if (!Number.isFinite(ageHrs)) {
    problems.push(`updated_at is unparseable: ${row.updated_at}`);
  } else if (ageHrs > MAX_AGE_HOURS) {
    problems.push(
      `the USD/AUD rate is ${ageHrs.toFixed(1)}h old, older than the ${MAX_AGE_HOURS}h limit. ` +
      'Nothing is maintaining it. Every AUD price on the site derives from this number. ' +
      'Check sync-fx-rate.mjs (Netlify, 0 1 * * *) first, since it is the writer that works; ' +
      'the Postgres cron update_usd_aud_rate() is a known phantom success, see C3L-130.'
    );
  }

  if (!Number.isFinite(rate)) {
    problems.push(`the stored rate is not a number: ${JSON.stringify(row.value)}`);
  } else if (rate < MIN_SANE_RATE || rate > MAX_SANE_RATE) {
    problems.push(
      `the stored rate ${rate} is outside the sane range ${MIN_SANE_RATE} to ${MAX_SANE_RATE}, ` +
      'which is the same bound update_usd_aud_rate() applies to itself before writing.'
    );
  }

  console.log('\n=== RESULT ===');
  if (problems.length) {
    for (const p of problems) console.error(`FAIL: ${p}`);
    console.error('\nFX freshness check FAILED.');
    process.exit(1);
  }

  console.log(`Rate ${rate} is ${ageHrs.toFixed(1)}h old and within range. FX freshness check PASSED.`);
};

run().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
