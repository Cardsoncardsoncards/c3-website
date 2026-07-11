// netlify/functions/check-card-follows.mjs
// Daily check for "follow this card" alerts (card_price_alerts, alert_type 'follow').
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

const GAME_TABLES = {
  mtg:            'mtg_cards',
  pokemon:        'pokemon_cards',
  lorcana:        'lorcana_cards',
  onepiece:       'onepiece_cards',
  yugioh:         'yugioh_cards',
  dbsfusionworld: 'dbsfusionworld_cards',
  starwars:       'starwars_cards'
};

// MTG stores art as image_uri_*; every other Core game uses a single image_url.
const GAME_IMAGE_COL = {
  mtg:            'image_uri_normal',
  pokemon:        'image_url',
  lorcana:        'image_url',
  onepiece:       'image_url',
  yugioh:         'image_url',
  dbsfusionworld: 'image_url',
  starwars:       'image_url'
};

const GAME_LABELS = {
  mtg:            'Magic: The Gathering',
  pokemon:        'Pokemon',
  lorcana:        'Lorcana',
  onepiece:       'One Piece',
  yugioh:         'Yu-Gi-Oh',
  dbsfusionworld: 'Dragon Ball Fusion World',
  starwars:       'Star Wars Unlimited'
};

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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/card_price_alerts?id=eq.${id}`, {
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
  let checked = 0, sent = 0, skippedFloor = 0, belowThreshold = 0, missingCard = 0;

  try {
    const rows = await supabaseGet(
      `card_price_alerts?select=id,email,game,card_slug,card_name,unsubscribe_token&alert_type=eq.follow&confirmed=is.true&triggered=is.false&limit=${BATCH}`
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, checked: 0, sent: 0, note: 'no confirmed follows pending' }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    for (const row of rows) {
      const table = GAME_TABLES[row.game];
      if (!table) { log.push(`unknown game ${row.game} on alert ${row.id}`); continue; }

      checked++;

      let cards;
      // slug is NOT unique in mtg_cards: 98,052 rows share only 33,799 distinct slugs, so
      // roughly two thirds of MTG cards have several printings under one slug (Thundermare
      // has four, from AU$0.00 to AU$15.35). The other six Core games have unique slugs.
      //
      // Without an explicit order, limit=1 returns an ARBITRARY printing, so the alert was
      // silently evaluating a different card than the one followed: a real run skipped
      // Thundermare on the AU$5 price floor by reading a AU$1.32 printing while the one on
      // the page was AU$15.35 and up 934%.
      //
      // Order by price deliberately, so a follow always tracks the most valuable printing
      // of that card. That is both deterministic and the printing worth alerting on.
      //
      // The image column differs per game (MTG uses image_uri_normal, the rest image_url),
      // so it is aliased to a single image_url field for the email template.
      const imageCol = GAME_IMAGE_COL[row.game] || 'image_url';
      try {
        cards = await supabaseGet(
          `${table}?select=slug,name,price_aud,price_change_7d,price_change_30d,image_url:${imageCol}&slug=eq.${encodeURIComponent(row.card_slug)}&order=price_aud.desc.nullslast&limit=1`
        );
      } catch (e) {
        log.push(`${row.game}/${row.card_slug}: read error ${e.message}`);
        continue;
      }

      if (!Array.isArray(cards) || cards.length === 0) { missingCard++; continue; }
      const card = cards[0];

      const priceAud = Number(card.price_aud);
      if (!Number.isFinite(priceAud) || priceAud < PRICE_FLOOR_AUD) { skippedFloor++; continue; }

      // 7d only where it is trustworthy, otherwise 30d.
      const useSevenDay = SEVEN_DAY_RELIABLE.has(row.game);
      const raw         = useSevenDay ? card.price_change_7d : card.price_change_30d;
      const windowLabel = useSevenDay ? '7 days' : '30 days';

      const changePct = Number(raw);
      if (!Number.isFinite(changePct)) continue;

      if (Math.abs(changePct) < CHANGE_THRESHOLD) { belowThreshold++; continue; }

      const emailed = await sendAlertEmail(row, card, changePct, windowLabel);
      if (!emailed) { log.push(`${row.game}/${row.card_slug}: email failed, leaving untriggered for retry`); continue; }

      // Only mark triggered once the email actually went out, so a Resend outage
      // retries tomorrow instead of silently swallowing the alert.
      await markTriggered(row.id, priceAud);
      sent++;
      log.push(`${row.game}/${row.card_slug}: ${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}% over ${windowLabel}, emailed`);
    }

    const summary = { ok: true, checked, sent, belowThreshold, skippedFloor, missingCard, threshold: CHANGE_THRESHOLD, priceFloorAud: PRICE_FLOOR_AUD, log };
    console.log('[check-card-follows]', JSON.stringify(summary));
    return new Response(JSON.stringify(summary, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[check-card-follows] FATAL:', err.message);
    return new Response(err.message, { status: 500 });
  }
};

export const config = {
  schedule: '0 20 * * *'   // 06:00 AEST daily, after the overnight card syncs land
};
