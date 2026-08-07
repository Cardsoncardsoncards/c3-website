// Crawler volume check. Scheduled by .github/workflows/crawler-volume-check.yml.
//
// WHAT THIS IS FOR
// Sustained machine crawling of every card page on the site ran from 22 July 2026 and was
// noticed on 6 August, a fortnight later, and only because a person happened to look at GA4.
// Nothing watched traffic volume. This is the fifth consecutive investigation to record that
// gap, so this closes it for this one signal rather than recording it again.
//
// It answers one question, hourly: is any single network sending far more card views than a
// person could? That is the question that would have surfaced the July crawl in an hour.
//
// WHY THE THRESHOLD IS 100 VIEWS PER /24 PER HOUR, from measured data rather than picked round.
// Every figure below is from card_views over the 6 to 7 August window, the only window where
// request fingerprints exist:
//   - The busiest hour any identified HUMAN network produced: 1 view.
//   - The busiest whole-site DAY before the crawl began (13 July): 93 views, all sources
//     combined. So 100 in a single hour is already above the site's best pre-crawl day.
//   - The QUIETEST active hour of Meta's crawler: 159 views.
//   - The busiest hour of the two Alibaba Cloud ranges: 1,224 views between them.
// 100 therefore sits in a wide empty band: roughly 100x above real traffic and comfortably
// below the slowest thing worth catching. A threshold that cries wolf gets ignored, and a
// threshold set at the crawler's peak catches nothing until it is already too late.
//
// WHAT "ANY SINGLE NETWORK" MEANS. card_views.ip_address is already truncated to a /24 by
// shared/request-fingerprint.mjs, deliberately, for privacy. So this counts per /24 and not
// per host, which is the right unit anyway: the July crawler ran two workers that split the
// catalogue between them, and per-host counting would have halved each one's apparent rate.
//
// DELIBERATELY NOT ALLOWLISTED. Googlebot, Meta and every other declared crawler are all
// subject to this check. It is a detector, not a blocker, so a false positive costs one email
// and nothing else. It also means this doubles as the compliance test on the robots.txt rule
// that closed /cards/ to meta-externalagent: if Meta keeps appearing here, it is not obeying.
//
// THE ALERT CHANNEL IS GITHUB'S OWN FAILURE EMAIL, matching sync-health-check.mjs, the RLS
// check and the deploy health check. It is already proven to reach Sammy and adding a second
// notification path would be a new thing to maintain and to go quietly stale. Nothing new is
// invented here: a breach exits non-zero, the workflow goes red, GitHub emails.
//
// FAIL-CLOSED. Missing configuration is a failure, not a skip. A check that cannot run has
// not passed, the same rule the sync, RLS and deploy checks already follow.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Views from one /24 within one clock hour, above which the hour is a breach. See the header
// for how this number was derived. Changing it should mean new measurement, not a hunch.
const THRESHOLD = 100;

// How many COMPLETE clock hours to look back over on each run. The job runs hourly, so one
// would do in theory. It is 3 because GitHub Actions cron is best-effort: scheduled runs are
// routinely delayed and are sometimes skipped entirely under load. A 3 hour window means two
// consecutive skipped runs still cannot hide a breach. Already-reported hours are skipped, so
// the overlap costs nothing in noise.
const LOOKBACK_HOURS = 3;

// Rows pulled per page, and the page cap. The busiest hour on record is 1,656 views, so a
// 3 hour window is around 5,000 rows and 20 pages is far more headroom than that needs. If the
// cap is ever hit, that is itself abnormal volume and is reported rather than silently cut.
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

const HEARTBEAT_GAME = '__crawler_volume_check__';
const HEARTBEAT_EVENT = 'crawler_check_ran';
const BREACH_EVENT = 'crawler_hour_breach';

// The job is scheduled hourly. 4 hours means it has missed three runs in a row before this
// complains, which distinguishes a genuinely stopped check from GitHub's ordinary lateness.
const HEARTBEAT_MAX_AGE_HOURS = 4;

// Set CRAWLER_CHECK_DRY_RUN=1 to evaluate and print without writing any sync_events row.
// Used to verify detection logic against production data without leaving audit rows behind.
const DRY_RUN = process.env.CRAWLER_CHECK_DRY_RUN === '1';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('FATAL: SUPABASE_URL and SUPABASE_SERVICE_KEY must both be set. Failing rather than skipping.');
  process.exit(1);
}

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`
};

async function rest(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`${path} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function writeEvent(row) {
  if (DRY_RUN) {
    console.log(`  [dry run] would write ${row.event_type}: ${row.error_message ?? '(no detail)'}`);
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/sync_events`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify([row]),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) console.warn(`  sync_events write failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  } catch (err) {
    clearTimeout(timer);
    console.warn(`  sync_events write error: ${err.message}`);
  }
}

// "2026-08-07T03" for a Date. The key for one /24 in one clock hour, used both to group views
// and to recognise an hour that has already been reported.
function hourKey(d) {
  return new Date(d).toISOString().slice(0, 13);
}

const run = async () => {
  const now = new Date();
  // Only COMPLETE clock hours are judged. The hour in progress is excluded because it is still
  // filling: judging it would compare a partial hour against a full-hour threshold and would
  // also re-report the same hour on the next run with a higher count.
  const currentHourStart = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()
  ));
  const windowStart = new Date(currentHourStart.getTime() - LOOKBACK_HOURS * 3600000);

  console.log('=== Crawler volume check ===');
  console.log(`  threshold: ${THRESHOLD} views per /24 per clock hour`);
  console.log(`  window:    ${windowStart.toISOString()} to ${currentHourStart.toISOString()} (${LOOKBACK_HOURS} complete hours)`);
  if (DRY_RUN) console.log('  MODE:      dry run, no sync_events rows will be written');

  // ---- Pull the window ----
  const rows = [];
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await rest(
      'card_views?select=ip_address,viewed_at,game' +
      '&ip_address=not.is.null' +
      `&viewed_at=gte.${windowStart.toISOString()}` +
      `&viewed_at=lt.${currentHourStart.toISOString()}` +
      `&order=viewed_at.asc&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`
    );
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }
  console.log(`  read ${rows.length} fingerprinted view(s)${truncated ? ' (PAGE CAP HIT, more exist)' : ''}`);

  // ---- Aggregate per /24 per clock hour ----
  const buckets = new Map();
  for (const r of rows) {
    if (!r.ip_address || !r.viewed_at) continue;
    const key = `${r.ip_address}@${hourKey(r.viewed_at)}`;
    let b = buckets.get(key);
    if (!b) {
      b = { ip: r.ip_address, hour: hourKey(r.viewed_at), views: 0, games: new Map() };
      buckets.set(key, b);
    }
    b.views++;
    b.games.set(r.game, (b.games.get(r.game) || 0) + 1);
  }

  const breaches = [...buckets.values()]
    .filter(b => b.views > THRESHOLD)
    .sort((a, b) => b.views - a.views);

  const busiest = [...buckets.values()].sort((a, b) => b.views - a.views)[0];
  console.log(`  ${buckets.size} network-hour bucket(s), busiest ${busiest ? `${busiest.ip} at ${busiest.views} view(s) in ${busiest.hour}` : 'none'}`);

  if (!breaches.length) {
    console.log(`  no /24 exceeded ${THRESHOLD} views in any complete hour`);
  }

  // ---- Skip hours already reported, so the 3 hour overlap does not re-alert ----
  // Fail-closed: if this lookup throws, nothing is treated as already reported, so a real
  // breach still alerts. Losing the alert would be worse than sending it twice.
  //
  // sync_events is service_role only (RLS on, one service_role policy, no anon policy), so
  // this specific read is why the job needs SUPABASE_SERVICE_KEY and not the anon key. Note
  // the failure mode is silent rather than loud: PostgREST answers an RLS-filtered read with
  // an empty array, not an error, so a wrong key does NOT throw here. It just makes every
  // breach look new and re-sends it. That degrades toward alerting too often, which is the
  // right direction to fail, but it will not announce itself. Found while testing this script
  // with the anon key, where dedupe silently did nothing.
  let alreadyReported = new Set();
  if (breaches.length) {
    try {
      const since = new Date(currentHourStart.getTime() - 48 * 3600000).toISOString();
      const prior = await rest(
        `sync_events?select=error_message&event_type=eq.${BREACH_EVENT}` +
        `&triggered_at=gte.${since}&limit=500`
      );
      alreadyReported = new Set(
        prior.map(p => String(p.error_message || '').split(' | ')[0]).filter(Boolean)
      );
    } catch (err) {
      console.warn(`  could not read prior breaches (${err.message}), treating all as new`);
    }
  }

  const fresh = [];
  for (const b of breaches) {
    const key = `${b.ip}@${b.hour}`;
    const topGame = [...b.games.entries()].sort((x, y) => y[1] - x[1])[0];
    const detail = `${key} | ${b.views} views, ${b.games.size} game(s), top ${topGame ? `${topGame[0]} (${topGame[1]})` : 'n/a'}`;

    if (alreadyReported.has(key)) {
      console.log(`  already reported, not re-alerting: ${detail}`);
      continue;
    }

    // One sample user agent, fetched only for a network that actually breached, so the alert
    // says who it claims to be without pulling user_agent for every row in the window.
    let ua = '(unknown)';
    try {
      const sample = await rest(
        `card_views?select=user_agent&ip_address=eq.${encodeURIComponent(b.ip)}` +
        `&viewed_at=gte.${b.hour}:00:00Z&user_agent=not.is.null&limit=1`
      );
      if (sample.length && sample[0].user_agent) ua = sample[0].user_agent.slice(0, 180);
    } catch { /* the alert is still useful without it */ }

    const full = `${detail}, ua: ${ua}`;
    console.error(`  BREACH: ${full}`);
    // The rollup at the end deliberately carries `detail` and not `full`. The user agent is
    // long, is already on the BREACH line above, and repeating it per breach turned the final
    // FAIL line into an unreadable wall in testing.
    fresh.push({ key, views: b.views, message: detail });
    await writeEvent({
      event_type: BREACH_EVENT,
      game: HEARTBEAT_GAME,
      rows_affected: b.views,
      error_message: full
    });
  }

  // ---- Heartbeat, this check watching itself ----
  console.log('\n=== Heartbeat ===');
  let heartbeatGap = null;
  try {
    const prior = await rest(
      `sync_events?select=triggered_at&event_type=eq.${HEARTBEAT_EVENT}&order=triggered_at.desc&limit=1`
    );
    if (!prior.length) {
      console.log('  no previous heartbeat, treating as first run');
    } else {
      const ageH = (Date.now() - new Date(prior[0].triggered_at).getTime()) / 3600000;
      console.log(`  previous run ${ageH.toFixed(1)}h ago (${prior[0].triggered_at})`);
      if (ageH > HEARTBEAT_MAX_AGE_HOURS) heartbeatGap = ageH.toFixed(1);
    }
  } catch (err) {
    console.warn(`  heartbeat read failed: ${err.message}`);
  }
  await writeEvent({ event_type: HEARTBEAT_EVENT, game: HEARTBEAT_GAME });
  if (!DRY_RUN) console.log('  heartbeat written');

  // ---- Verdict ----
  console.log('\n=== RESULT ===');
  const problems = [];
  if (fresh.length) {
    problems.push(
      `${fresh.length} network-hour(s) over ${THRESHOLD} views: ` + fresh.map(f => f.message).join('; ')
    );
  }
  if (truncated) {
    problems.push(`read cap of ${PAGE_SIZE * MAX_PAGES} rows hit in a ${LOOKBACK_HOURS}h window, which is itself abnormal volume`);
  }
  if (heartbeatGap) {
    problems.push(`this check did not run for ${heartbeatGap}h, longer than the ${HEARTBEAT_MAX_AGE_HOURS}h it allows`);
  }

  if (problems.length) {
    for (const p of problems) console.error(`FAIL: ${p}`);
    console.error('\nCrawler volume check FAILED.');
    process.exit(1);
  }
  console.log(`No /24 exceeded ${THRESHOLD} views in any of the last ${LOOKBACK_HOURS} complete hours.`);
  console.log('Crawler volume check PASSED.');
};

run().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
