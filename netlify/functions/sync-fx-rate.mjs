// netlify/functions/sync-fx-rate.mjs
// Daily FX sync -- schedule: 0 1 * * * UTC (runs before the price sync crons)
// Fetches USD->AUD from the keyed ExchangeRate-API v6 endpoint and caches it in
// public.site_config (key = usd_aud_rate). This is the ONLY function that calls
// exchangerate-api.com directly. All card pages, compare and price syncs read the
// cached value via /api/fx-rate, so the free plan uses roughly 30 calls per month.
// On any failure we log and leave the existing cached value untouched as fallback.

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const EXCHANGE_KEY         = Netlify.env.get('EXCHANGE_RATE_API_KEY');
const SYNC_SECRET          = Netlify.env.get('SYNC_SECRET');

async function fetchLiveRate() {
  if (!EXCHANGE_KEY) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`https://v6.exchangerate-api.com/v6/${EXCHANGE_KEY}/pair/USD/AUD`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    const rate = parseFloat(data.conversion_rate);
    return rate > 0 ? rate : null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

async function cacheRate(rate) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/site_config?key=eq.usd_aud_rate`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ value: rate.toFixed(4), updated_at: new Date().toISOString() }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase PATCH failed ${res.status}: ${err.slice(0, 200)}`);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

export default async (req) => {
  // Auth: accept scheduled trigger OR POST with correct secret
  const isScheduled = !req.headers.get('x-sync-secret') &&
                      !req.headers.get('origin') &&
                      !req.headers.get('referer');
  if (!isScheduled) {
    const secret = req.headers.get('x-sync-secret');
    if (secret !== SYNC_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('[sync-fx-rate] Missing Supabase env vars');
    return new Response('Supabase env vars missing', { status: 500 });
  }

  const rate = await fetchLiveRate();
  if (rate === null) {
    // Do NOT overwrite the cached value. The old rate stays as fallback.
    console.error('[sync-fx-rate] FX fetch failed, keeping existing cached rate');
    return new Response(JSON.stringify({ updated: false, reason: 'fx_fetch_failed' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const rows = await cacheRate(rate);
    const stored = Array.isArray(rows) && rows[0] ? rows[0].value : rate.toFixed(4);
    console.log(`[sync-fx-rate] Cached USD->AUD rate: ${stored}`);
    return new Response(JSON.stringify({ updated: true, rate: stored }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    // Cache write failed; the old rate stays as fallback.
    console.error('[sync-fx-rate] Cache write failed, keeping existing cached rate:', err.message);
    return new Response(JSON.stringify({ updated: false, reason: 'cache_write_failed' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = {
  schedule: "0 1 * * *"
};
