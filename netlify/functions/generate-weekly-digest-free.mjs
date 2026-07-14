// netlify/functions/generate-weekly-digest-free.mjs
// The FREE weekly digest, sent to everyone on the MailerLite main list.
//
// Deliberately separate from generate-weekly-report.mjs, which is the PAID Seller
// Intelligence report and is left completely untouched. The paid function targets
// PAID_GROUP_ID; this one targets MAIN_GROUP_ID. Neither knows about the other.
//
// The market queries, the email template and Resend batch delivery all come from
// shared/weekly-report-core.mjs, extracted verbatim from the paid function so the two
// cannot drift. Only the subscriber source and the copy differ.
//
// Schedule: "0 22 * * 6". Cron day 6 is Saturday and Netlify crons run in UTC, so this fires
// 22:00 UTC Saturday = 8am SUNDAY Sydney (AEST, UTC+10), which is the intended send time.
// It was briefly "0 22 * * 0", which is 22:00 UTC Sunday = 8am MONDAY Sydney. Cron day 0 is
// Sunday, so the day number has to be the day BEFORE the intended Sydney morning.
//
// Trigger: scheduled weekly, or manually with an x-sync-secret header against
// /.netlify/functions/generate-weekly-digest-free (a scheduled function cannot have a custom
// path, so there is no /api/... alias for this one).
// Pass ?dryRun=1 to build the email and count recipients WITHOUT sending to the list.
// Pass ?testEmail=you@example.com to send a single real email to that address only.

import {
  fetchMarketData,
  buildEmail,
  plainText,
  sendBatch,
  RESEND_API_KEY,
  SUPPORT_EMAIL
} from './shared/weekly-report-core.mjs';

const MAILERLITE_KEY = Netlify.env.get('MAILERLITE_API_KEY');
const SYNC_SECRET    = Netlify.env.get('SYNC_SECRET');

// The main (free) list. The paid group (188799131758626620) is NOT touched by this function.
const MAIN_GROUP_ID = '182892277158381312';
const ML_BASE       = 'https://connect.mailerlite.com/api';
const FETCH_TIMEOUT = 9000;
const REPORT_LABEL  = 'Weekly Market Digest';

// Free-tier unsubscribe subject. Passed explicitly into sendBatch (task-100) so this list can
// never inherit the paid report's "Unsubscribe C3 Weekly Report" wording. Unchanged from the
// value the shared module used to hardcode.
const LIST_UNSUBSCRIBE = `<mailto:${SUPPORT_EMAIL}?subject=Unsubscribe%20C3%20Weekly>`;

async function timedFetch(url, opts) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

// Paginated fetch of active subscribers on the main list. Mirrors the paid function's
// pagination exactly, only the group id differs. Returns null if the key is missing.
// Safety cap: 50 pages = 5000 subscribers.
async function fetchMainSubscribers() {
  if (!MAILERLITE_KEY) return null;
  const out = [];
  let cursor = null;
  for (let i = 0; i < 50; i++) {
    const params = new URLSearchParams({ limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const url = `${ML_BASE}/groups/${MAIN_GROUP_ID}/subscribers?${params.toString()}`;
    let res;
    try {
      res = await timedFetch(url, { headers: { Authorization: `Bearer ${MAILERLITE_KEY}`, Accept: 'application/json' } });
    } catch { break; }
    if (!res.ok) break;
    let data;
    try { data = await res.json(); } catch { break; }
    const page = data.data || [];
    for (const s of page) {
      if (s.email && (s.status === 'active' || !s.status)) out.push({ id: s.id, email: s.email });
    }
    cursor = (data.meta && data.meta.next_cursor) || null;
    if (!cursor || page.length === 0) break;
  }
  return out;
}

// Until a hosted unsubscribe endpoint exists for the digest, opt-outs route to support,
// paired with the List-Unsubscribe header for one-click in Gmail/Apple Mail.
function unsubscribeUrl(email) {
  const subject = encodeURIComponent('Unsubscribe from the C3 Weekly Digest');
  const body    = encodeURIComponent(`Please unsubscribe ${email} from the C3 Weekly Digest.`);
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

export default async (req) => {
  // Scheduled invocations carry no secret; manual ones must present it.
  const secret = req.headers.get('x-sync-secret');
  if (secret && SYNC_SECRET && secret !== SYNC_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorised' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'RESEND_API_KEY not set' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  const url       = new URL(req.url);
  const dryRun    = url.searchParams.get('dryRun') === '1';
  const testEmail = url.searchParams.get('testEmail');

  // Market data, identical to the paid report.
  const { up, down, buy, sell } = await fetchMarketData();

  const top     = up[0];
  const dateStr = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Free-list copy. No "paid subscribers" framing anywhere.
  const callTitle = top
    ? `${top.name} leads the market this week`
    : 'This week in the Australian TCG market';
  const callBody = top
    ? `${top.name} is up ${Math.abs(parseFloat(top.change7d)).toFixed(1)} per cent in seven days, leading this week's movers. Here is what moved across the games we track, plus the cards sitting well below their highs and the ones near them.`
    : `Here are this week's movers across the games we track, plus the cards sitting well below their highs and the ones near them.`;

  // REPORT_LABEL keeps the paid tier's "Weekly Seller Report" framing out of the free email.
  const htmlEmail = buildEmail({ dateStr, callTitle, callBody, up, down, buy, sell, reportLabel: REPORT_LABEL });
  const text      = plainText(dateStr, `C3 ${REPORT_LABEL}`);

  const counts = { up: up.length, down: down.length, buy: buy.length, sell: sell.length };

  // --- testEmail: send exactly one real email, touch nobody on the list ---
  if (testEmail) {
    const link = unsubscribeUrl(testEmail);
    const res = await sendBatch([{
      email: testEmail,
      subject: `[TEST] ${callTitle}`,
      html: htmlEmail.split('{$unsubscribe}').join(link),
      text: text.split('{$unsubscribe}').join(link),
    }], LIST_UNSUBSCRIBE);
    let detail = '';
    try { detail = (await res.text()).slice(0, 300); } catch { /* body optional */ }
    console.log(`[weekly-digest-free] TEST send to ${testEmail}: HTTP ${res.status}`);
    return new Response(JSON.stringify({
      ok: res.ok, mode: 'testEmail', recipient: testEmail, status: res.status,
      detail: detail || undefined, counts
    }, null, 2), { status: res.ok ? 200 : 502, headers: { 'Content-Type': 'application/json' } });
  }

  const subscribers = await fetchMainSubscribers();
  if (subscribers === null) {
    return new Response(JSON.stringify({ ok: false, error: 'MAILERLITE_API_KEY not set' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  // --- dryRun: build everything, resolve the real recipient list, send NOTHING ---
  if (dryRun) {
    const summary = {
      ok: true, dryRun: true, mode: 'dryRun',
      wouldSendTo: subscribers.length,
      groupId: MAIN_GROUP_ID,
      subject: callTitle,
      emailBytes: htmlEmail.length,
      counts,
      note: 'No email was sent. Nobody on the main list was contacted.'
    };
    console.log('[weekly-digest-free]', JSON.stringify(summary));
    return new Response(JSON.stringify(summary, null, 2), { headers: { 'Content-Type': 'application/json' } });
  }

  if (subscribers.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, subscriberCount: 0, counts,
      message: 'Main list is empty, nothing sent.' }, null, 2),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // Fan out in chunks of 100 (Resend's batch maximum), same as the paid report.
  let sentCount = 0, failedCount = 0;
  const errors = [];
  for (let i = 0; i < subscribers.length; i += 100) {
    const chunk = subscribers.slice(i, i + 100);
    const items = chunk.map(s => {
      const link = unsubscribeUrl(s.email);
      return {
        email: s.email,
        subject: callTitle,
        html: htmlEmail.split('{$unsubscribe}').join(link),
        text: text.split('{$unsubscribe}').join(link),
      };
    });
    let res;
    try { res = await sendBatch(items, LIST_UNSUBSCRIBE); }
    catch (e) {
      failedCount += chunk.length;
      errors.push({ status: 0, detail: String(e && e.message || e).slice(0, 200) });
      continue;
    }
    if (res.ok) {
      sentCount += chunk.length;
    } else {
      failedCount += chunk.length;
      let detail = '';
      try { detail = await res.text(); } catch { /* body optional */ }
      errors.push({ status: res.status, detail: detail.slice(0, 200) });
    }
  }

  const summary = {
    ok: failedCount === 0,
    message: failedCount === 0
      ? `Weekly digest sent to ${sentCount} subscribers on the main list.`
      : `Sent ${sentCount}, failed ${failedCount}.`,
    counts: { recipients: subscribers.length, sent: sentCount, failed: failedCount, ...counts },
    ...(errors.length ? { errors } : {})
  };
  console.log('[weekly-digest-free] SUMMARY', JSON.stringify(summary));

  return new Response(JSON.stringify(summary, null, 2), {
    status: failedCount === 0 ? 200 : 502,
    headers: { 'Content-Type': 'application/json' }
  });
};

// No `path` key here. Netlify rejects a custom path on a scheduled function, so this is
// reachable only at its default URL, /.netlify/functions/generate-weekly-digest-free.
export const config = {
  schedule: '0 22 * * 6'   // 22:00 UTC Saturday = 8am Sunday Sydney. See the note at the top.
};
