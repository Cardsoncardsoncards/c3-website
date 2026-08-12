import { logSyncEvent } from './shared/sync-event.mjs';
// netlify/functions/check-card-follows.mjs
// Daily check for "follow this card" alerts (card_price_alerts, alert_type 'follow').
//
// C3L-91, added 10 August 2026. This function now writes a terminal sync_events row on EVERY
// exit path, which it has never done before. Until now the alerting subsystem produced no
// sync_events rows at all, ever, so there was no way to answer "did it run last night" once the
// Netlify log aged out. The logging is purely additive: no alert logic, threshold, filter or
// email behaviour is changed by it, and a failure to log is swallowed rather than allowed to
// become a failure to alert.
//
// Note the EARLY exit is logged too, with rows_affected 0. That case, no confirmed follows
// pending, is the one this subsystem is in almost every night, and a monitor that only sees
// rows when work happened cannot tell "ran and had nothing to do" from "did not run".
//
// Separate from check-price-alerts.mjs on purpose: that one is the MTG-only, one-shot
// target-price system backed by mtg_price_alerts. This is multi-game and fires on a
// percentage price MOVE rather than a target being crossed. The two do not share a table
// and must not be merged.
//
// Data reliability (confirmed in task-43): 30-day price change is reliable across all 7
// Core games, but 7-day is only reliable for One Piece, Yu-Gi-Oh and MTG. Every other
// game therefore uses the 30-day window. Using 7d where it is not reliable would produce
// alerts off noise.
//
// A price floor keeps penny cards from generating meaningless alerts: a 3c card moving to
// 4c is +33% and worth nobody's inbox.
//
// Supabase only, no external card APIs. Resend is used for the emails.

import { resolveFollowCard } from './shared/card-resolver.mjs';
import {
  ALERTABLE_GAMES,
  GAME_TABLES    as ALL_GAME_TABLES,
  GAME_IMAGE_COL as ALL_GAME_IMAGE_COL,
  GAME_LABELS    as ALL_GAME_LABELS
} from './shared/game-meta.mjs';

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const RESEND_API_KEY       = Netlify.env.get('RESEND_API_KEY');
const SYNC_SECRET          = Netlify.env.get('SYNC_SECRET');

const SITE_ORIGIN      = 'https://cardsoncardsoncards.com.au';
const CHANGE_THRESHOLD = 10;    // percent move, in either direction
const PRICE_FLOOR_AUD  = 5;     // ignore anything cheaper than this
const BATCH            = 200;

// Games whose 7-day price change is trustworthy. Everything else falls back to 30d.
const SEVEN_DAY_RELIABLE = new Set(['onepiece', 'yugioh', 'mtg']);

// C3L-183. These three maps used to be literals here, listing the same 7 games that
// shared/game-meta.mjs already described for all 32. That duplication was not harmless: this
// file's local constant was named GAME_TABLES and game-meta.mjs exports a DIFFERENT
// GAME_TABLES covering all 32 games, so the same name meant two different things depending on
// which file you were reading. They are now DERIVED from the one canonical set, so the games
// this function can evaluate and the games follow-block.mjs offers a button for cannot drift
// apart: both read ALERTABLE_GAMES, and adding a game there changes both at once.
//
// MTG stores art as image_uri_*; every other game uses a single image_url. That distinction
// lives in game-meta.mjs and is inherited here rather than restated.
const pick = (src) => Object.fromEntries(
  Object.entries(src).filter(([g]) => ALERTABLE_GAMES.has(g))
);

const GAME_TABLES    = pick(ALL_GAME_TABLES);
const GAME_IMAGE_COL = pick(ALL_GAME_IMAGE_COL);
const GAME_LABELS    = pick(ALL_GAME_LABELS);

function esc(str) {
  return (str == null ? '' : String(str))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function supabaseGet(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function markTriggered(id, currentPrice) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/follows?id=eq.${id}`, {
      method: 'PATCH',
      signal: controller.signal,
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        triggered:     true,
        triggered_at:  new Date().toISOString(),
        current_price: currentPrice
      })
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`PATCH ${res.status}`);
    return true;
  } catch (e) {
    clearTimeout(timer);
    console.error(`[check-card-follows] mark triggered failed for ${id}: ${e.message}`);
    return false;
  }
}

// PART F: permanent record of every alert email attempt. Fire-and-forget: a logging
// failure must never make a real send look like it failed.
async function logEmail(recipient, emailType, relatedAlertId, success, errorMessage) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/email_log`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify([{
        recipient,
        email_type: emailType,
        related_card_alert_id: relatedAlertId || null,
        success: !!success,
        error_message: errorMessage ? String(errorMessage).slice(0, 500) : null
      }])
    });
    clearTimeout(timer);
    if (!res.ok) console.warn(`[email_log] insert failed ${res.status}`);
  } catch (e) {
    clearTimeout(timer);
    console.warn(`[email_log] insert error: ${e.message}`);
  }
}

async function sendAlertEmail(row, card, changePct, windowLabel) {
  const dir      = changePct >= 0 ? 'up' : 'down';
  const name     = esc(card.name || row.card_name || row.card_slug);
  const gameName = esc(GAME_LABELS[row.game] || row.game);
  const price    = Number(card.price_aud).toFixed(2);
  const abs      = Math.abs(changePct).toFixed(1);
  const cardUrl  = `${SITE_ORIGIN}/cards/${row.game}/${encodeURIComponent(row.card_slug)}`;

  // PART D: card art. PART B: per-row unsubscribe link, required in every alert email.
  const imageHtml = card.image_url
    ? `<p><img src="${esc(card.image_url)}" alt="${name}" width="220" style="max-width:220px;border-radius:10px;display:block"></p>`
    : '';
  const unsubUrl  = `${SITE_ORIGIN}/api/unsubscribe-follow?token=${encodeURIComponent(row.unsubscribe_token || '')}`;
  const manageUrl = `${SITE_ORIGIN}/api/my-follows`;

  if (!RESEND_API_KEY) {
    console.warn('[check-card-follows] RESEND_API_KEY not configured, no alert sent');
    await logEmail(row.email, 'follow_alert', row.id, false, 'RESEND_API_KEY not configured');
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'C3 Price Alerts <alerts@cardsoncardsoncards.com.au>',
        to: [row.email],
        subject: `${name} is ${dir} ${abs}%`,
        html: `<p>Hi,</p>
<p><strong>${name}</strong> (${gameName}) has moved <strong>${dir} ${abs}%</strong> over the last ${windowLabel}.</p>
${imageHtml}
<p>It is now around <strong>AU$${price}</strong>.</p>
<p><a href="${cardUrl}" style="background:#C9A84C;color:#0A0C14;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block">View the card</a></p>
<p>The C3 Team</p>
<p style="font-size:11px;color:#999">Don't want alerts for this card any more? <a href="${unsubUrl}">Unsubscribe</a>. You can also <a href="${manageUrl}">manage all your followed cards</a>.</p>
<p style="font-size:11px;color:#999">Prices are estimates in AUD and are not a quote. See our <a href="${SITE_ORIGIN}/methodology">methodology</a> for how we source them. This alert fires once. Follow the card again to be alerted on its next move.</p>`
      })
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      console.error(`[check-card-follows] Resend ${res.status}: ${body}`);
      await logEmail(row.email, 'follow_alert', row.id, false, `${res.status}: ${body}`);
      return false;
    }
    const sent = await res.json().catch(() => ({}));
    console.log(`[check-card-follows] Resend OK id=${sent.id || 'unknown'} to=${row.email}`);
    await logEmail(row.email, 'follow_alert', row.id, true, null);
    return true;
  } catch (e) {
    clearTimeout(timer);
    console.error(`[check-card-follows] Resend error: ${e.message}`);
    await logEmail(row.email, 'follow_alert', row.id, false, e.message);
    return false;
  }
}

export default async (req) => {
  // Scheduled invocations carry no secret; manual ones must present it.
  const secret = req.headers.get('x-sync-secret');
  if (secret && SYNC_SECRET && secret !== SYNC_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response('Supabase env vars missing', { status: 500 });
  }

  const log = [];
  // missingChange (C3L-161) counts follows whose price-change column was NULL, so the summary
  // can distinguish "did not move" from "no data to judge". It is deliberately separate from
  // missingCard, which means the card row itself could not be resolved at all.
  let checked = 0, sent = 0, skippedFloor = 0, belowThreshold = 0, missingCard = 0, missingChange = 0;
  let skippedUnsupported = 0;   // C3L-183: follows on games this function cannot evaluate

  try {
    // task-109: reads the unified follows table, not card_price_alerts.
    //
    // unsubscribed_at=is.null is the send-time half of the soft delete. An unsubscribed follow
    // still exists (the user keeps the card in their list) but must never be emailed about.
    // Miss this filter and a soft delete silently does nothing.
    //
    // The email now lives on accounts, joined through, rather than being copied onto every
    // follow row. That is what stops the same person existing twice under different casings.
    const raw = await supabaseGet(
      `follows?select=id,game,card_slug,card_name,printing_id,unsubscribe_token,accounts(email)` +
      `&confirmed=is.true&triggered=is.false&unsubscribed_at=is.null&limit=${BATCH}`
    );

    // Flatten the joined account back onto the row so the rest of this function, which was
    // written against a flat row.email, keeps working unchanged.
    const rows = (Array.isArray(raw) ? raw : [])
      .map(r => ({ ...r, email: r.accounts ? r.accounts.email : null }))
      .filter(r => r.email);

    if (!Array.isArray(rows) || rows.length === 0) {
      await logSyncEvent({ eventType: 'sync_success', game: 'follows', rowsAffected: 0, logPrefix: '[check-card-follows]' });
      return new Response(JSON.stringify({ ok: true, checked: 0, sent: 0, note: 'no confirmed follows pending' }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    for (const row of rows) {
      const table = GAME_TABLES[row.game];
      if (!table) {
        // C3L-183. This `continue` used to sit ABOVE `checked++`, so a follow on a game this
        // function cannot evaluate left no trace at all: it was not counted, the run still
        // reported sync_success, and the only visible symptom was a `checked` total quietly
        // one short of the follows that actually exist. That is the same silent-partial shape
        // as C3L-168 and C3L-136, and it is why a weissschwarz follow went unnoticed nightly
        // from 16 July.
        //
        // `checked` still means EXAMINED and deliberately does not include these, because
        // inflating it would hide the gap rather than show it. The skip gets its own counter,
        // reaches the JSON summary, and downgrades the run to sync_partial below, so a skipped
        // follow is now impossible to miss without reading the log array.
        skippedUnsupported++;
        log.push(`unsupported game ${row.game} on follow ${row.id}, cannot alert, see C3L-183`);
        continue;
      }

      checked++;

      let card;
      // slug is NOT unique in mtg_cards: roughly two thirds of MTG cards have several
      // printings under one slug. The other 31 games have unique slugs.
      //
      // Without an explicit order, limit=1 returns an ARBITRARY printing, so the alert was
      // silently evaluating a different card than the one followed: a real run skipped
      // Thundermare on the AU$5 price floor by reading a AU$1.32 printing while the one on
      // the page was AU$15.35 and up 934%.
      //
      // This used to order by price, tracking the most valuable printing. That was
      // deterministic but it disagreed with the card page, so an alert email could quote a
      // different printing and price than the page the person followed from. task-152 put it
      // on the one shared rule in shared/card-resolver.mjs.
      //
      // task-153: where the follow recorded which printing it meant, the alert is now evaluated
      // against THAT printing. This is the surface where the difference is most material,
      // because the printing does not merely decide the picture: it decides the price, so it
      // decides both the AU$5 floor test and the percentage move that triggers the email at all.
      // Ragavan's printings run from AU$0 to AU$86.79 under a single slug, so alerting on a
      // rule-picked printing meant emailing people about a card they were not holding.
      //
      // The image column differs per game (MTG uses image_uri_normal, the rest image_url),
      // so it is aliased to a single image_url field for the email template.
      const imageCol = GAME_IMAGE_COL[row.game] || 'image_url';
      try {
        card = await resolveFollowCard(
          (path) => supabaseGet(path),
          row.game,
          row.card_slug,
          row.printing_id,
          { select: `slug,name,price_aud,price_change_7d,price_change_30d,image_url:${imageCol}` }
        );
      } catch (e) {
        log.push(`${row.game}/${row.card_slug}: read error ${e.message}`);
        continue;
      }

      if (!card) { missingCard++; continue; }

      const priceAud = Number(card.price_aud);
      if (!Number.isFinite(priceAud) || priceAud < PRICE_FLOOR_AUD) { skippedFloor++; continue; }

      // 7d only where it is trustworthy, otherwise 30d.
      const useSevenDay = SEVEN_DAY_RELIABLE.has(row.game);
      const raw         = useSevenDay ? card.price_change_7d : card.price_change_30d;
      const windowLabel = useSevenDay ? '7 days' : '30 days';

      // C3L-161. MISSING DATA IS NOT A ZERO PER CENT MOVE. This guard has to come BEFORE the
      // numeric one, because `Number(null)` is `0`, not `NaN`, so a NULL price_change column
      // sailed through `!Number.isFinite` as a literal flat move and was counted in
      // belowThreshold one line down. The original line was clearly written expecting NULL to
      // arrive as NaN, which is what an ABSENT PostgREST key gives; an explicit JSON `null`,
      // which is what a NULL column actually gives, behaves the opposite way.
      //
      // This cannot have produced a wrong email in either direction: zero never crosses the
      // 10 per cent threshold. What it cost was the only line anyone reads to decide whether
      // this subsystem is healthy, because a night where every followed card had NO DATA and a
      // night where every followed card SAT STILL produced an identical summary.
      //
      // Not hypothetical: on 11 August every one of the 41,675 MTG cards carrying a current
      // price had price_change_7d NULL, MTG reads the 7 day window, and the one live MTG follow
      // was therefore counted as a flat card rather than as a card with nothing to judge.
      if (raw === null || raw === undefined || raw === '') {
        missingChange++;
        log.push(`${row.game}/${row.card_slug}: no ${windowLabel} price change data, not counted as a flat move`);
        continue;
      }

      const changePct = Number(raw);
      if (!Number.isFinite(changePct)) { missingChange++; continue; }

      if (Math.abs(changePct) < CHANGE_THRESHOLD) { belowThreshold++; continue; }

      const emailed = await sendAlertEmail(row, card, changePct, windowLabel);
      if (!emailed) { log.push(`${row.game}/${row.card_slug}: email failed, leaving untriggered for retry`); continue; }

      // Only mark triggered once the email actually went out, so a Resend outage
      // retries tomorrow instead of silently swallowing the alert.
      await markTriggered(row.id, priceAud);
      sent++;
      log.push(`${row.game}/${row.card_slug}: ${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}% over ${windowLabel}, emailed`);
    }

    const summary = { ok: true, checked, sent, belowThreshold, missingChange, skippedFloor, missingCard, skippedUnsupported, threshold: CHANGE_THRESHOLD, priceFloorAud: PRICE_FLOOR_AUD, log };
    console.log('[check-card-follows]', JSON.stringify(summary));
    // rows_affected is EMAILS SENT, not follows examined. A run that checked 40 follows and sent
    // nothing is a normal quiet night; a run that sent nothing for weeks while checked climbs is
    // the thing worth noticing, and both are readable from this one number plus the log line.
    // C3L-183. A run that could not evaluate part of its input is NOT a success, which is the
    // C3L-168 rule applied to this function: reporting sync_success while silently dropping a
    // follow is exactly how this went unnoticed for weeks. rows_affected stays EMAILS SENT in
    // both branches so the number keeps one meaning; the reason string carries the detail.
    await logSyncEvent({
      eventType:    skippedUnsupported > 0 ? 'sync_partial' : 'sync_success',
      game:         'follows',
      rowsAffected: sent,
      errorMessage: skippedUnsupported > 0
        ? `${skippedUnsupported} follow(s) on games this job cannot evaluate, see C3L-183`
        : null,
      logPrefix:    '[check-card-follows]'
    });
    return new Response(JSON.stringify(summary, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[check-card-follows] FATAL:', err.message);
    await logSyncEvent({ eventType: 'sync_error', game: 'follows', rowsAffected: sent, errorMessage: err.message, logPrefix: '[check-card-follows]' });
    return new Response(err.message, { status: 500 });
  }
};

export const config = {
  // C3L-82, changed 10 August 2026 from '0 20 * * *' (06:00 AEST) to 21:30 UTC (07:30 AEST).
  //
  // WHY. This function decides whether to email someone based on price_change_7d and
  // price_change_30d, and eight pg_cron jobs REWRITE exactly those columns between 20:00 and
  // 20:40 UTC. At 20:00 it was reading them mid-rewrite. Verified against cron.job on 10 August
  // rather than trusted from the finding, because schedules move:
  //
  //   20:00  update-mtg-price-changes-daily        jobid 11   avg 2m33s, worst 6m04s
  //   20:10  update-pokemon-price-changes-daily    jobid  4   ~18s
  //   20:15  update-yugioh-price-changes-daily     jobid  5   ~21s
  //   20:20  update-dragonball-price-changes-daily jobid  6   ~4s
  //   20:25  update-onepiece-price-changes-daily   jobid  7   ~4s
  //   20:30  update-starwars-price-changes-daily   jobid  8   ~3s
  //   20:35  update-lorcana-price-changes-daily    jobid  9   ~1s
  //   20:40  update-riftbound-price-changes-daily  jobid 10   <1s
  //
  // So the MTG job started in the SAME MINUTE as this function and ran for up to six more,
  // and the other seven had not started at all. That is not a theoretical race: follow id 10 is
  // an MTG card, so the one game whose rewrite overlapped this function's read is a game
  // somebody actually follows.
  //
  // All eight are done by about 20:41 worst case. 21:30 leaves roughly 50 minutes of buffer and
  // also clears update-mtg-signals-daily at 21:00, which is not read here but shares the window.
  // Deliberately NOT set to 20:45: the buffer should absorb a slow night, not just an average one.
  schedule: '30 21 * * *'
};
