// netlify/functions/get-fx-rate.mjs
// Lightweight internal endpoint at /api/fx-rate.
// Reads the cached USD->AUD rate from public.site_config (written daily by
// sync-fx-rate) and returns it as JSON. Used by card pages, compare and the
// price sync functions so none of them call the upstream FX provider directly.
// Returns: { rate: 1.5823, updated_at: "2026-06-20T01:00:00Z" }

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const FALLBACK_RATE     = 1.45;

export default async () => {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=600, s-maxage=3600'
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/site_config?select=value,updated_at&key=eq.usd_aud_rate&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        signal: controller.signal
      }
    );
    clearTimeout(timeout);
    if (!res.ok) {
      return new Response(JSON.stringify({ rate: FALLBACK_RATE, updated_at: null }), { status: 200, headers });
    }
    const rows = await res.json();
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    const rate = row ? parseFloat(row.value) : NaN;
    return new Response(JSON.stringify({
      rate: rate > 0 ? rate : FALLBACK_RATE,
      updated_at: row ? row.updated_at : null
    }), { status: 200, headers });
  } catch {
    clearTimeout(timeout);
    return new Response(JSON.stringify({ rate: FALLBACK_RATE, updated_at: null }), { status: 200, headers });
  }
};

export const config = { path: '/api/fx-rate' };
