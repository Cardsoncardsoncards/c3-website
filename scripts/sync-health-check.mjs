// Sync health check (C3L-51). Scheduled by .github/workflows/sync-health-check.yml.
//
// WHAT THIS IS FOR
// 31 background syncs and 4 script syncs keep every game's prices current, and until now
// NOTHING watched any of them. weissschwarz froze for 8 days and wrote a sync_error every night
// for 24 nights with nobody notified (C3L-48). Three daily scripts died for a week while their
// workflow reported success (C3L-53). Both were found by a person happening to look, which is
// also how the outage that opened this programme was found. This closes that.
//
// WHICH SIGNAL THIS RELIES ON, AND WHY, because the task that commissioned it required the
// question be answered before the check was designed rather than after:
//
// sync_events is NOT trusted as the primary signal. It is written by the syncs, but measured
// against reality it is not a dependable key:
//   - 39 distinct values of `game` for 32 games, because upstream slugs and internal names are
//     both used, and six games appear under BOTH after upstream renames (lorcana/lorcana-tcg,
//     onepiece/one-piece-card-game, starwars/star-wars-unlimited, riftbound/riftbound-league-...,
//     dragonball/dragon-ball-super-ccg, wow/world-of-warcraft-tcg).
//   - `game` is NULL for the amazon price job.
//   - Three different event_type vocabularies: sync_*, ids_sync_*, amazon_prices_sync_*.
//   - Most damning: yugioh logs sync_start three times a night and has NEVER logged a terminal
//     event, yet its data is perfectly current. Absence of an error in that table means nothing.
//
// So SIGNAL A, the primary one, is GROUND TRUTH: the newest snapshot_date actually present in
// each game's own price table. That is the thing users see, it cannot be wrong about itself, and
// it is the same measurement that first found C3L-01 and Task 10's Angle 3.
//
// SIGNAL B is the complement, and it exists because Signal A has a real blind spot: yugioh's
// sync times out at Netlify's 15 minute ceiling on every single run (starts at 00:01, 00:17 and
// 00:34, three retries, never a completion) while still writing enough snapshots on the way down
// that freshness looks fine. A run that starts and never finishes is invisible to Signal A.
// Signal B catches it from sync_events WITHOUT depending on the messy `game` key: it only asks,
// per (game, stream), whether the most recent start was ever followed by a terminal event.
//
// FAIL-CLOSED. Missing configuration is a failure, not a skip. A check that cannot run has not
// passed, the same rule the RLS and deploy checks already follow.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// A game is stale after this many days with no new snapshot. Chosen from the real cadence
// rather than picked round: every sync runs daily, and a game sitting at 1 day is normal
// because the sync writes later in the UTC day than this check reads. 2 days means one full
// missed cycle, which does happen transiently. 3 means it has missed twice and is not coming
// back on its own. weissschwarz sat at 8. A threshold that cries wolf is a threshold that gets
// ignored, which is the failure mode this whole check exists to avoid.
const STALE_DAYS = 3;

// A run that started this long ago without recording success or failure is treated as never
// having finished. Netlify background functions are capped at 15 minutes, so 2 hours is far
// beyond any legitimate run.
const INCOMPLETE_HOURS = 2;

// SIGNAL C threshold (C3L-61). Card METADATA staleness, which is a different question from
// price freshness and deliberately gets its own number rather than reusing STALE_DAYS.
// Pokemon is the case that proves the two are not the same: it scored `0d ok` on Signal A every
// single run, correctly, while its card metadata sat nine days stale and all six enrichment
// columns were empty across all 31,833 rows. Signal A was not wrong, it was answering a
// different question.
// The threshold is measured, not chosen for roundness. Across the 32 games, 31 have card
// metadata 0 or 1 days old, because their background syncs write card rows on every run.
// Pokemon was the sole outlier at 8 days. 4 days is therefore 4x the observed normal and still
// catches the only real case comfortably, which is the same "do not cry wolf" reasoning behind
// Signal A's 3 days.
const CARD_STALE_DAYS = 4;

// The check writes a heartbeat every run, and checks its own previous one. If the schedule
// stops firing (GitHub disables cron on inactive repos, someone edits the workflow, a secret
// is rotated), the next run that does happen reports the gap loudly instead of quietly
// resuming. This does not detect ongoing silence on its own, which is why the hourly deploy
// health check independently asserts this heartbeat is recent. Two schedules, each watching
// the other, so neither can die unnoticed.
const HEARTBEAT_GAME = '__sync_health_check__';
const HEARTBEAT_EVENT = 'health_check_ran';
const HEARTBEAT_MAX_AGE_HOURS = 36;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('FATAL: SUPABASE_URL and SUPABASE_SERVICE_KEY are required. This check cannot');
  console.error('run without them, and a check that cannot run is not a check that passed.');
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

// The game list is derived from the sync functions actually present in the repo rather than
// hardcoded, so a newly added game is covered the day its sync lands instead of whenever
// somebody remembers to update this file. mtg is added explicitly because it is the one game
// synced by a GitHub Actions script rather than a Netlify background function.
async function gameList() {
  const { readdirSync } = await import('node:fs');
  const games = readdirSync('netlify/functions')
    .map(f => /^sync-([a-z0-9]+)-background\.mjs$/.exec(f))
    .filter(Boolean)
    .map(m => m[1])
    .filter(g => g !== 'ids' && g !== 'amazon');
  if (!games.includes('mtg')) games.push('mtg');
  return [...new Set(games)].sort();
}

function daysBetween(a, b) {
  return Math.round((a - b) / 86400000);
}

const run = async () => {
  const games = await gameList();
  console.log(`Checking ${games.length} games.\n`);
  if (games.length < 32) {
    console.error(`FATAL: only ${games.length} games discovered, expected at least 32.`);
    console.error('A sync function has been removed or renamed, so this check is no longer');
    console.error('covering what it claims to cover.');
    process.exit(1);
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // ---- SIGNAL A: real data freshness, per game, from the game's own table ----
  const stale = [];
  const empty = [];
  const unreadable = [];
  console.log('=== Signal A, snapshot freshness (ground truth) ===');
  for (const game of games) {
    let rows;
    try {
      rows = await rest(`${game}_price_snapshots?select=snapshot_date&order=snapshot_date.desc&limit=1`);
    } catch (err) {
      unreadable.push({ game, err: err.message });
      console.log(`  ${game.padEnd(20)} UNREADABLE  ${err.message}`);
      continue;
    }
    if (!rows.length) {
      empty.push(game);
      console.log(`  ${game.padEnd(20)} EMPTY, no snapshots at all`);
      continue;
    }
    const last = new Date(rows[0].snapshot_date + 'T00:00:00Z');
    const age = daysBetween(today, last);
    const flag = age >= STALE_DAYS ? 'STALE' : 'ok';
    if (age >= STALE_DAYS) stale.push({ game, last: rows[0].snapshot_date, age });
    console.log(`  ${game.padEnd(20)} ${String(age).padStart(2)}d  ${rows[0].snapshot_date}  ${flag}`);
  }

  // ---- SIGNAL C: card metadata staleness, distinct from price freshness ----
  // Deliberately a separate signal with its own threshold rather than a widening of Signal A.
  // Conflating them would either make the price signal noisy or make this one useless, since
  // metadata legitimately changes far less often than prices do.
  const staleMeta = [];
  console.log('\n=== Signal C, card metadata freshness ===');
  for (const game of games) {
    let rows;
    try {
      rows = await rest(`${game}_cards?select=updated_at&order=updated_at.desc.nullslast&limit=1`);
    } catch (err) {
      // Not fatal on its own: Signal A already fails loudly if a game's data is unreachable.
      console.log(`  ${game.padEnd(20)} metadata unreadable, ${err.message}`);
      continue;
    }
    if (!rows.length || !rows[0].updated_at) {
      console.log(`  ${game.padEnd(20)} no updated_at recorded`);
      continue;
    }
    const last = new Date(rows[0].updated_at);
    const age = Math.floor((Date.now() - last.getTime()) / 86400000);
    if (age >= CARD_STALE_DAYS) {
      staleMeta.push({ game, age, last: rows[0].updated_at.slice(0, 10) });
      console.log(`  ${game.padEnd(20)} ${String(age).padStart(2)}d  ${rows[0].updated_at.slice(0,10)}  STALE METADATA`);
    }
  }
  if (!staleMeta.length) console.log(`  none, every game's card rows written within ${CARD_STALE_DAYS} days`);

  // ---- SIGNAL B: runs that started and never finished ----
  // Deliberately key-agnostic. It never needs to know which `game` string maps to which table,
  // it only pairs a start against a later terminal event within the same stream.
  console.log('\n=== Signal B, runs that started and never finished ===');
  const since = new Date(Date.now() - 3 * 86400000).toISOString();
  const events = await rest(
    `sync_events?select=game,event_type,triggered_at&triggered_at=gte.${since}&order=triggered_at.asc&limit=5000`
  );
  // Found by the adversarial pass before shipping: without this, an empty result silently
  // satisfies Signal B. Every sync logs a start, so three days with no events at all does not
  // mean everything is healthy, it means the logging or the scheduling has stopped, and a check
  // that reports "no incomplete runs" off zero rows is exactly the dishonest-green shape this
  // whole task exists to remove.
  if (!events.length) {
    console.error(`  NO EVENTS AT ALL in the last 3 days, which cannot be right for 31 daily syncs.`);
  }
  const streams = new Map();
  for (const e of events) {
    const m = /^(.*)_(start|success|error)$/.exec(e.event_type || '');
    if (!m) continue;
    const key = `${e.game ?? '(none)'}::${m[1]}`;
    if (!streams.has(key)) streams.set(key, { starts: [], ends: [] });
    streams.get(key)[m[2] === 'start' ? 'starts' : 'ends'].push(new Date(e.triggered_at));
  }
  const incomplete = [];
  const cutoff = Date.now() - INCOMPLETE_HOURS * 3600000;
  for (const [key, { starts, ends }] of streams) {
    if (!starts.length) continue;
    const lastStart = new Date(Math.max(...starts.map(d => d.getTime())));
    if (lastStart.getTime() > cutoff) continue;
    const finished = ends.some(d => d.getTime() >= lastStart.getTime());
    if (!finished) {
      const hours = ((Date.now() - lastStart.getTime()) / 3600000).toFixed(1);
      incomplete.push({ key, lastStart: lastStart.toISOString(), hours });
      console.log(`  ${key.padEnd(40)} started ${hours}h ago, no success or error since`);
    }
  }
  if (!incomplete.length) console.log('  none, every stream that started also finished');

  // ---- Heartbeat: did this check itself run when it should have? ----
  console.log('\n=== Heartbeat, this check watching itself ===');
  let heartbeatGap = null;
  const prior = await rest(
    `sync_events?select=triggered_at&game=eq.${HEARTBEAT_GAME}&order=triggered_at.desc&limit=1`
  );
  if (!prior.length) {
    console.log('  no previous heartbeat, treating as first run');
  } else {
    const ageH = (Date.now() - new Date(prior[0].triggered_at).getTime()) / 3600000;
    console.log(`  previous run ${ageH.toFixed(1)}h ago (${prior[0].triggered_at})`);
    if (ageH > HEARTBEAT_MAX_AGE_HOURS) {
      heartbeatGap = ageH.toFixed(1);
      console.log(`  GAP: expected within ${HEARTBEAT_MAX_AGE_HOURS}h, so this check was not running`);
    }
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/sync_events`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify([{ event_type: HEARTBEAT_EVENT, game: HEARTBEAT_GAME }])
    });
    if (!res.ok) console.warn(`  heartbeat write failed ${res.status}`);
    else console.log('  heartbeat written');
  } catch (err) {
    console.warn(`  heartbeat write error: ${err.message}`);
  }

  // ---- Verdict ----
  console.log('\n=== RESULT ===');
  const problems = [];
  if (stale.length) problems.push(`${stale.length} game(s) stale by ${STALE_DAYS}+ days: ` +
    stale.map(s => `${s.game} (${s.age}d, last ${s.last})`).join(', '));
  if (empty.length) problems.push(`${empty.length} game(s) with no snapshots at all: ${empty.join(', ')}`);
  if (unreadable.length) problems.push(`${unreadable.length} table(s) unreadable: ` +
    unreadable.map(u => u.game).join(', '));
  if (incomplete.length) problems.push(`${incomplete.length} sync stream(s) started without ever finishing: ` +
    incomplete.map(i => `${i.key} (${i.hours}h)`).join(', '));
  if (heartbeatGap) problems.push(`this check did not run for ${heartbeatGap}h, longer than the ${HEARTBEAT_MAX_AGE_HOURS}h it is scheduled for`);
  if (!events.length) problems.push('sync_events recorded nothing in 3 days, so either the syncs stopped firing or their logging broke');
  if (staleMeta.length) problems.push(`${staleMeta.length} game(s) with card metadata stale by ${CARD_STALE_DAYS}+ days, prices may still be current: ` +
    staleMeta.map(m => `${m.game} (${m.age}d, last ${m.last})`).join(', '));

  if (problems.length) {
    for (const p of problems) console.error(`FAIL: ${p}`);
    console.error('\nSync health check FAILED.');
    process.exit(1);
  }
  console.log(`All ${games.length} games fresh within ${STALE_DAYS} days, every sync stream completed.`);
  console.log('Sync health check PASSED.');
};

run().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
