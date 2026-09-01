// netlify/functions/sync-alert-digest.mjs
//
// ALERT-02. One daily digest email covering every sync failure in the previous 48 hours.
//
// WHY A DIGEST AND NOT PER-EVENT ALERTING (C3L-51, C3L-57 and the weissschwarz case in C3L-48).
// Measured over the 14 days to 1 September 2026, sync_events carried 65 sync_error and 37
// sync_partial rows, which is 102 failures or roughly 7.2 a day with a range of 4 to 11. Sending
// one email per event would put around seven messages a day into one inbox, and an alert channel
// at that volume is filtered or ignored inside a week. That would recreate exactly the blindness
// this function exists to remove, so the unit of alerting here is the DAY, not the event.
//
// AND NOTHING WHEN THERE IS NOTHING. A daily "all clear" trains the reader to skip the sender,
// which is the same failure by a slower route. If the window holds no failures this sends no
// email at all and simply records that it ran.
//
// DEDUPLICATION USES webhook_fired, AND THAT COLUMN IS GENUINELY FREE.
// It was designed as an alert-fired flag and is no longer written by anything: C3L-51 removed
// pg_cron jobid 2 on 6 August 2026, the job that set webhook_fired = true on rows where nothing
// had actually fired. That migration states "nothing reads the column" and deliberately left it
// in place. The live distribution agrees: every row with webhook_fired = true stops at
// 2026-08-05 15:01, and all 2,879 rows since are false. So marking a row true here is the first
// time the column has ever meant what its name says.
//
// ORDER OF OPERATIONS, AND THE TRADE-OFF IT ACCEPTS.
// The email is sent FIRST and the rows are marked SECOND. The alternative, marking before
// sending, loses failures permanently whenever a send fails, because the next run skips them.
// This ordering means a send that succeeds while the follow-up mark fails could repeat those
// groups in tomorrow's digest. That case is not silent: it returns a non-2xx and writes its own
// sync_events row, so a duplicate is always accompanied by a loud signal explaining why.
// Losing a failure quietly is worse than repeating one noisily.
//
// SCHEDULE: 20:00 UTC, which is 06:00 in Sydney during AEST. The last scheduled sync of the day
// starts at 15:00 UTC (the six sync-ids jobs) and Netlify caps a background function at 15
// minutes, so the whole sync window is closed by 15:15 UTC. 20:00 clears that comfortably, is
// not occupied by any existing schedule, and lands the digest at the start of an Australian
// working day rather than in the middle of the night.

import { logSyncEvent } from './shared/sync-event.mjs';

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
// Service role, deliberately. The anon key returns HTTP 200 and an empty array on an
// RLS-protected table, which would make this digest report "all clear" forever and would be
// indistinguishable from a healthy day.
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const RESEND_API_KEY       = Netlify.env.get('RESEND_API_KEY');

const ALERT_TO      = 'ccc.squadhelp@gmail.com';
const ALERT_FROM    = 'C3 Sync Alerts <alerts@cardsoncardsoncards.com.au>';
const FETCH_TIMEOUT = 8000;
// 48 rather than 24, deliberately. The run is daily, so a 24 hour window drops any failure that
// happened while a run was missed: nothing else would ever pick those rows up. Widening cannot
// cause a duplicate, because webhook_fired excludes anything already reported, so the only effect
// of the extra 24 hours is that a skipped run is caught up on the next one. The cost of a wider
// window is zero and the cost of a narrower one is a silently lost failure.
const WINDOW_HOURS  = 48;
// Bounds the response. Well above the observed ceiling of 11 failures in a day, so a realistic
// window is never truncated, while a runaway failure mode cannot return an unbounded payload.
const ROW_LIMIT     = 500;
const FAILURE_TYPES = ['sync_error', 'sync_partial'];
const ERROR_SNIPPET = 160;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function sbFetch(path, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        ...(init && init.headers ? init.headers : {})
      }
    });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// Groups by game and event type. The `game` column holds a MIXTURE of upstream slugs and C3 game
// keys: `one-piece-card-game` and `onepiece` both appear, as do `lorcana-tcg` and `lorcana`, plus
// non-game sentinels such as `follows` and `pokemon-enrichment` and some NULLs. Nothing here
// filters on game or translates it, precisely because a filter written against game keys would
// silently match nothing. That is the defect that left sync-health-check.mjs useless for three
// weeks. Whatever string the row carries is what gets grouped and reported.
function groupFailures(rows) {
  const groups = new Map();
  for (const r of rows) {
    const game = r.game == null ? '(no game recorded)' : r.game;
    const key = `${game} :: ${r.event_type}`;
    let g = groups.get(key);
    if (!g) {
      g = { game, eventType: r.event_type, count: 0, latest: r.triggered_at, sample: r.error_message };
      groups.set(key, g);
    }
    g.count += 1;
    // Rows arrive newest first, so the representative error is the most recent one that has text.
    if (!g.sample && r.error_message) g.sample = r.error_message;
    if (r.triggered_at > g.latest) g.latest = r.triggered_at;
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.game.localeCompare(b.game));
}

export default async () => {
  const started = Date.now();
  const json = (status, body) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' }
  });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('[sync-alert-digest] Supabase env vars missing, cannot read sync_events');
    return json(500, { ok: false, error: 'Supabase configuration missing' });
  }

  const sinceIso = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();

  // PostgREST filter strings are assembled by hand. URLSearchParams percent-encodes * and {,
  // which breaks PostgREST filters. select= is explicit and count=exact is deliberately NOT used,
  // because it forces a sequential scan on a table that grows by roughly 1,400 rows a fortnight.
  const query =
    'sync_events' +
    '?select=id,game,event_type,error_message,triggered_at' +
    `&event_type=in.(${FAILURE_TYPES.join(',')})` +
    `&triggered_at=gte.${sinceIso}` +
    '&webhook_fired=is.false' +
    '&order=triggered_at.desc' +
    `&limit=${ROW_LIMIT}`;

  let rows;
  try {
    const res = await sbFetch(query, { method: 'GET' });
    if (!res.ok) {
      console.error(`[sync-alert-digest] sync_events read failed HTTP ${res.status}`);
      await logSyncEvent({
        eventType: 'sync_error', game: 'alert-digest',
        errorMessage: `sync_events read failed HTTP ${res.status}`,
        logPrefix: '[sync-alert-digest]'
      });
      return json(502, { ok: false, error: 'Could not read sync_events' });
    }
    rows = await res.json();
  } catch (e) {
    console.error(`[sync-alert-digest] sync_events read error: ${e.name}`);
    await logSyncEvent({
      eventType: 'sync_error', game: 'alert-digest',
      errorMessage: `sync_events read error: ${e.name}`,
      logPrefix: '[sync-alert-digest]'
    });
    return json(502, { ok: false, error: 'Could not read sync_events' });
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    // Nothing to say, so say nothing. Recorded so a silent day is still provably a day the
    // digest ran, which is the gap C3L-91 identified in the previous alerting path.
    console.log('[sync-alert-digest] no unreported failures in window, no email sent');
    await logSyncEvent({
      eventType: 'sync_success', game: 'alert-digest', rowsAffected: 0,
      logPrefix: '[sync-alert-digest]'
    });
    return json(200, { ok: true, failures: 0, emailed: false });
  }

  const groups = groupFailures(rows);
  const { subject, html } = buildEmail(groups, rows.length, sinceIso);

  if (!RESEND_API_KEY) {
    console.error('[sync-alert-digest] RESEND_API_KEY not set, cannot send digest');
    await logSyncEvent({
      eventType: 'sync_error', game: 'alert-digest',
      errorMessage: 'RESEND_API_KEY not set, digest not sent',
      logPrefix: '[sync-alert-digest]'
    });
    return json(500, { ok: false, error: 'Mail configuration missing' });
  }

  // Send first. See the ordering note at the top of this file.
  let sendOk = false;
  let sendDetail = '';
  const rsController = new AbortController();
  const rsTimer = setTimeout(() => rsController.abort(), FETCH_TIMEOUT);
  try {
    const rsRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: rsController.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({ from: ALERT_FROM, to: [ALERT_TO], subject, html })
    });
    clearTimeout(rsTimer);
    sendOk = rsRes.ok;
    if (!sendOk) sendDetail = `HTTP ${rsRes.status}`;
  } catch (e) {
    clearTimeout(rsTimer);
    sendDetail = e.name;
  }

  // An alerter that fails quietly is worse than no alerter, because it manufactures confidence.
  // Nothing about the key or the recipient is logged, only the transport status.
  if (!sendOk) {
    console.error(`[sync-alert-digest] Resend send failed, ${sendDetail}`);
    await logSyncEvent({
      eventType: 'sync_error', game: 'alert-digest', rowsAffected: rows.length,
      errorMessage: `digest send failed (${sendDetail}), ${rows.length} failures unreported`,
      logPrefix: '[sync-alert-digest]'
    });
    return json(502, { ok: false, error: 'Digest send failed', failures: rows.length, emailed: false });
  }

  // Mark only what was actually reported.
  const ids = rows.map(r => r.id).filter(n => Number.isInteger(n));
  let markOk = false;
  let markDetail = '';
  try {
    const patch = await sbFetch(`sync_events?id=in.(${ids.join(',')})`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ webhook_fired: true })
    });
    markOk = patch.ok;
    if (!markOk) markDetail = `HTTP ${patch.status}`;
  } catch (e) {
    markDetail = e.name;
  }

  if (!markOk) {
    console.error(`[sync-alert-digest] digest sent but dedup mark failed, ${markDetail}`);
    await logSyncEvent({
      eventType: 'sync_error', game: 'alert-digest', rowsAffected: rows.length,
      errorMessage: `digest sent but webhook_fired mark failed (${markDetail}), ${rows.length} rows may repeat tomorrow`,
      logPrefix: '[sync-alert-digest]'
    });
    return json(502, { ok: false, error: 'Sent but dedup mark failed', failures: rows.length, emailed: true });
  }

  await logSyncEvent({
    eventType: 'sync_success', game: 'alert-digest', rowsAffected: rows.length,
    logPrefix: '[sync-alert-digest]'
  });
  console.log(`[sync-alert-digest] sent digest for ${rows.length} failures in ${groups.length} groups, ${Date.now() - started}ms`);
  return json(200, { ok: true, failures: rows.length, groups: groups.length, emailed: true });
};

// Builds the digest. Deliberately placed AFTER the handler: this is the only function
// holding an html template literal, and the repo rule is that no Supabase key reference may
// appear after a `const html =` line. Function declarations hoist, so the handler above can
// still call it. Nothing here touches a key, a token or a recipient address.
function buildEmail(groups, total, sinceIso) {
  const games = new Set(groups.map(g => g.game)).size;
  const subject = `C3 sync: ${total} failure${total === 1 ? '' : 's'} in ${WINDOW_HOURS}h across ${games} job${games === 1 ? '' : 's'}`;

  const rows = groups.map(g => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;font-family:Arial,Helvetica,sans-serif;font-size:13px;">${esc(g.game)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;font-family:Arial,Helvetica,sans-serif;font-size:13px;">${esc(g.eventType)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;font-family:Arial,Helvetica,sans-serif;font-size:13px;text-align:right;"><strong>${g.count}</strong></td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#555;">${esc(String(g.sample || '(no message recorded)').slice(0, ERROR_SNIPPET))}</td>
    </tr>`).join('');

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;">
  <p><strong>${total} sync failure${total === 1 ? '' : 's'}</strong> recorded in the ${WINDOW_HOURS} hours to ${esc(new Date().toISOString())}.</p>
  <p style="font-size:12px;color:#555;">Window opens ${esc(sinceIso)}. Counts cover event types ${esc(FAILURE_TYPES.join(' and '))} only. Rows already included in a previous digest are excluded.</p>
  <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;margin-top:12px;">
    <tr>
      <th align="left" style="padding:6px 10px;border-bottom:2px solid #333;font-family:Arial,Helvetica,sans-serif;font-size:12px;">Job</th>
      <th align="left" style="padding:6px 10px;border-bottom:2px solid #333;font-family:Arial,Helvetica,sans-serif;font-size:12px;">Type</th>
      <th align="right" style="padding:6px 10px;border-bottom:2px solid #333;font-family:Arial,Helvetica,sans-serif;font-size:12px;">Count</th>
      <th align="left" style="padding:6px 10px;border-bottom:2px solid #333;font-family:Arial,Helvetica,sans-serif;font-size:12px;">Representative error</th>
    </tr>${rows}
  </table>
  <p style="font-size:11px;color:#888;margin-top:16px;">Sent by sync-alert-digest. This address does not receive mail.</p>
</div>`;

  return { subject, html };
}

export const config = {
  schedule: "0 20 * * *"
};
