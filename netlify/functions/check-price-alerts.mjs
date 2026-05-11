// netlify/functions/check-price-alerts.mjs
// Scheduled daily cron: checks mtg_price_alerts against current prices
// Fires Resend emails for:
//   - BUYER alerts: price dropped below target (alert_type: 'below')
//   - SELLER alerts: price rose above target (alert_type: 'above')
// Runs at 9am AEST (11pm UTC) daily — after price syncs have completed

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY') || Netlify.env.get('SUPABASE_ANON_KEY');
const RESEND_API_KEY    = Netlify.env.get('RESEND_API_KEY');
const MAILERLITE_KEY    = Netlify.env.get('MAILERLITE_API_KEY');
const SYNC_SECRET       = Netlify.env.get('SYNC_SECRET') || 'c3sync2026riftbound';

async function supabaseGet(path, useService = false) {
  const key = useService ? SUPABASE_SERVICE_KEY : Netlify.env.get('SUPABASE_ANON_KEY');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  if (!res.ok) return [];
  return res.json();
}

async function supabasePatch(table, id, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(data)
  });
  return res.ok;
}

async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'C3 Price Alerts <alerts@cardsoncardsoncards.com.au>',
        to: [to],
        subject,
        html,
      })
    });
    return res.ok;
  } catch (e) {
    console.error('[alerts] Resend error:', e.message);
    return false;
  }
}

async function addToMailerLite(email, group = 'price-alerts') {
  if (!MAILERLITE_KEY) return;
  try {
    await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MAILERLITE_KEY}` },
      body: JSON.stringify({ email, groups: ['mIFDGb'] })
    });
  } catch {}
}

function buyerEmail(cardName, cardSlug, targetAud, currentAud) {
  const diff = (targetAud - currentAud).toFixed(2);
  const cardUrl = `https://cardsoncardsoncards.com.au/cards/mtg/${cardSlug}`;
  const ebayUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(cardName + ' mtg')}&_sacat=183454&campid=5339146789`;
  return {
    subject: `Price alert: ${cardName} is now AU$${currentAud.toFixed(2)} 🎉`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#0f1117;color:#e8eaf0;border-radius:12px;overflow:hidden">
        <div style="background:#C9A84C;padding:20px 24px">
          <h1 style="margin:0;font-size:20px;color:#000">📉 Your price alert triggered!</h1>
        </div>
        <div style="padding:24px">
          <p style="font-size:16px;margin-bottom:16px">
            <strong style="color:#C9A84C">${cardName}</strong> has dropped to
            <strong style="color:#22c55e">AU$${currentAud.toFixed(2)}</strong>
          </p>
          <p style="color:#9ba3c4;font-size:13px;margin-bottom:20px">
            You set an alert at AU$${targetAud.toFixed(2)}.
            The price is now AU$${diff} below your target.
          </p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <tr>
              <td style="background:#1a1d2e;border:1px solid #2d3254;padding:10px 14px;border-radius:6px;text-align:center">
                <div style="font-size:11px;color:#9ba3c4;text-transform:uppercase;letter-spacing:.08em">Your Target</div>
                <div style="font-size:18px;font-weight:700;color:#C9A84C">AU$${targetAud.toFixed(2)}</div>
              </td>
              <td style="width:16px"></td>
              <td style="background:#1a1d2e;border:1px solid #2d3254;padding:10px 14px;border-radius:6px;text-align:center">
                <div style="font-size:11px;color:#9ba3c4;text-transform:uppercase;letter-spacing:.08em">Current Price</div>
                <div style="font-size:18px;font-weight:700;color:#22c55e">AU$${currentAud.toFixed(2)}</div>
              </td>
            </tr>
          </table>
          <a href="${ebayUrl}" style="display:block;background:#C9A84C;color:#000;padding:14px;border-radius:8px;text-align:center;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:12px">
            Buy on eBay AU Now →
          </a>
          <a href="${cardUrl}" style="display:block;background:#1a1d2e;border:1px solid #2d3254;color:#C9A84C;padding:12px;border-radius:8px;text-align:center;font-size:13px;text-decoration:none;margin-bottom:20px">
            View Card Details on C3 →
          </a>
          <p style="font-size:11px;color:#666;margin-top:16px">
            This alert has been marked as triggered. To set a new alert, visit the card page on
            <a href="https://cardsoncardsoncards.com.au" style="color:#C9A84C">cardsoncardsoncards.com.au</a>.
            Prices are estimates based on US market data converted to AUD. Check eBay AU for live pricing.
          </p>
          <p style="font-size:11px;color:#666;margin-top:8px">
            To unsubscribe from price alerts, reply to this email with "unsubscribe".
          </p>
        </div>
      </div>
    `
  };
}

function sellerEmail(cardName, cardSlug, targetAud, currentAud) {
  const gain = (currentAud - targetAud).toFixed(2);
  const cardUrl = `https://cardsoncardsoncards.com.au/cards/mtg/${cardSlug}`;
  const ebayUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(cardName + ' mtg')}&_sacat=183454&campid=5339146789`;
  return {
    subject: `Sell alert: ${cardName} has risen to AU$${currentAud.toFixed(2)} 📈`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#0f1117;color:#e8eaf0;border-radius:12px;overflow:hidden">
        <div style="background:#ef4444;padding:20px 24px">
          <h1 style="margin:0;font-size:20px;color:#fff">📈 Your sell alert triggered!</h1>
        </div>
        <div style="padding:24px">
          <p style="font-size:16px;margin-bottom:16px">
            <strong style="color:#C9A84C">${cardName}</strong> has risen to
            <strong style="color:#ef4444">AU$${currentAud.toFixed(2)}</strong>
          </p>
          <p style="color:#9ba3c4;font-size:13px;margin-bottom:20px">
            You set a sell alert at AU$${targetAud.toFixed(2)}.
            The price is now AU$${gain} above your target — it may be time to sell.
          </p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <tr>
              <td style="background:#1a1d2e;border:1px solid #2d3254;padding:10px 14px;border-radius:6px;text-align:center">
                <div style="font-size:11px;color:#9ba3c4;text-transform:uppercase;letter-spacing:.08em">Your Target</div>
                <div style="font-size:18px;font-weight:700;color:#C9A84C">AU$${targetAud.toFixed(2)}</div>
              </td>
              <td style="width:16px"></td>
              <td style="background:#1a1d2e;border:1px solid #2d3254;padding:10px 14px;border-radius:6px;text-align:center">
                <div style="font-size:11px;color:#9ba3c4;text-transform:uppercase;letter-spacing:.08em">Current Price</div>
                <div style="font-size:18px;font-weight:700;color:#ef4444">AU$${currentAud.toFixed(2)}</div>
              </td>
            </tr>
          </table>
          <a href="${ebayUrl}" style="display:block;background:#ef4444;color:#fff;padding:14px;border-radius:8px;text-align:center;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:12px">
            Check eBay AU Prices Now →
          </a>
          <a href="${cardUrl}" style="display:block;background:#1a1d2e;border:1px solid #2d3254;color:#C9A84C;padding:12px;border-radius:8px;text-align:center;font-size:13px;text-decoration:none;margin-bottom:20px">
            View Price History on C3 →
          </a>
          <p style="font-size:11px;color:#666;margin-top:16px">
            Prices are estimates based on Scryfall/TCGPlayer data converted to AUD. Always check eBay AU for live Australian pricing before selling.
            To unsubscribe, reply with "unsubscribe".
          </p>
        </div>
      </div>
    `
  };
}

async function run() {
  console.log('[check-price-alerts] Starting run at', new Date().toISOString());

  // Fetch all active alerts
  const alerts = await supabaseGet(
    `mtg_price_alerts?is_active=eq.true&select=id,scryfall_id,email,target_price_aud,alert_type,card_name,created_at`,
    true
  );

  if (!alerts.length) {
    console.log('[check-price-alerts] No active alerts');
    return { checked: 0, triggered: 0 };
  }

  console.log(`[check-price-alerts] Checking ${alerts.length} active alerts`);

  // Get unique scryfall_ids
  const ids = [...new Set(alerts.map(a => a.scryfall_id))];

  // Fetch current prices from Supabase
  const priceRows = await supabaseGet(
    `mtg_cards?scryfall_id=in.(${ids.join(',')})&select=scryfall_id,slug,name,price_aud,price_usd`,
    false
  );

  const priceMap = new Map(priceRows.map(r => [r.scryfall_id, r]));

  let triggered = 0;

  for (const alert of alerts) {
    const card = priceMap.get(alert.scryfall_id);
    if (!card) continue;

    const currentAud = parseFloat(card.price_aud || 0);
    if (currentAud <= 0) continue;

    const targetAud = parseFloat(alert.target_price_aud);
    const cardName = alert.card_name || card.name;
    const cardSlug = card.slug;

    let shouldFire = false;
    if (alert.alert_type === 'below' && currentAud <= targetAud) shouldFire = true;
    if (alert.alert_type === 'above' && currentAud >= targetAud) shouldFire = true;

    if (!shouldFire) continue;

    // Build email
    const emailContent = alert.alert_type === 'below'
      ? buyerEmail(cardName, cardSlug, targetAud, currentAud)
      : sellerEmail(cardName, cardSlug, targetAud, currentAud);

    const sent = await sendEmail({ to: alert.email, ...emailContent });

    if (sent) {
      triggered++;
      console.log(`[check-price-alerts] Fired ${alert.alert_type} alert for ${cardName} to ${alert.email}`);

      // Mark alert as triggered (deactivate)
      await supabasePatch('mtg_price_alerts', alert.id, {
        is_active: false,
        triggered_at: new Date().toISOString(),
        triggered_price_aud: currentAud
      });

      // Add to MailerLite (they're clearly engaged)
      await addToMailerLite(alert.email);
    }
  }

  console.log(`[check-price-alerts] Done. Checked: ${alerts.length}, Triggered: ${triggered}`);
  return { checked: alerts.length, triggered };
}

export default async (req) => {
  // Allow both scheduled trigger and manual POST with secret
  const isScheduled = req.headers.get('x-nf-event') === 'schedule';
  const isManual = req.method === 'POST' && req.headers.get('x-sync-secret') === SYNC_SECRET;

  if (!isScheduled && !isManual) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const result = await run();
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('[check-price-alerts] Fatal error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = {
  schedule: '0 23 * * *' // 11pm UTC = 9am AEST daily
};
