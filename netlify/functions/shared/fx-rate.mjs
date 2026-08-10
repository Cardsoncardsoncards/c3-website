// netlify/functions/shared/fx-rate.mjs
//
// ONE definition of "what USD/AUD rate do we convert at", replacing hardcoded 1.45 literals.
//
// WHY THIS EXISTS (C3L-130). The real rate on 9 August 2026 was 1.4182. The literal scattered
// through this codebase is 1.45, which is +2.24 per cent, applied silently to prices. It
// appears in three distinct shapes, counted rather than estimated:
//   1. `return 1.45;`            the getExchangeRate fetch fallback: 34 files, 68 occurrences
//   2. `market_price * 1.45`     inline display conversion:         100 files, 238 occurrences
//   3. "converted to AUD at approximately 1.45"  user-visible copy:  65 files, 36 occurrences
// Shape 2 never consults the stored rate at all, which makes it the worst of the three: it is
// not a fallback, it is a permanent hardcoded conversion.
//
// THE SOURCE OF TRUTH is site_config.usd_aud_rate, written daily at 01:00 UTC by the Netlify
// function sync-fx-rate.mjs. That is the writer that works. The Postgres cron that was supposed
// to also maintain it ran 42 times without ever succeeding and is now disabled; see C3L-130.
//
// ON THE REMAINING CONSTANT. A last-resort literal cannot be eliminated entirely: if Supabase
// is unreachable there is nothing else to fall back to. What CAN be fixed is that there is now
// exactly ONE of them instead of 68, it is far closer to reality than 1.45, and, critically,
// taking it is LOGGED. Today the fallback is silent, so a timeout producing a wrong price
// leaves no trace and its frequency is unknowable. After this it leaves a line in the function
// log every time.
//
// The constant is deliberately NOT set to today's exact rate. A stale-but-plausible number that
// looks precise invites someone to trust it. It is set to a round, obviously-approximate value
// and labelled as an emergency floor, so anyone reading a log line knows the real rate was
// unavailable rather than that this figure was chosen.

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');

// Last-resort only. See the note above. Never used when site_config is reachable.
export const EMERGENCY_FALLBACK_RATE = 1.42;

// The same sanity bounds update_usd_aud_rate() applies to itself before writing, so a corrupt
// stored value cannot reprice the catalogue through this path either.
const MIN_SANE_RATE = 1.20;
const MAX_SANE_RATE = 2.00;

// Per-instance memo. A single page render can convert dozens of prices and must not issue
// dozens of lookups. Short TTL so a long-lived instance still picks up the daily change.
let cached = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

/**
 * Current USD to AUD rate. Never throws and never returns a nonsense number.
 * @returns {Promise<{rate:number, source:'site_config'|'fallback', updatedAt:string|null}>}
 */
export async function getFxRate() {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) return cached;

  let result = { rate: EMERGENCY_FALLBACK_RATE, source: 'fallback', updatedAt: null };

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/site_config?select=value,updated_at&key=eq.usd_aud_rate&limit=1`,
        { signal: ctrl.signal, headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
      );
      if (res.ok) {
        const rows = await res.json();
        const raw = Array.isArray(rows) && rows[0] ? parseFloat(rows[0].value) : NaN;
        if (Number.isFinite(raw) && raw >= MIN_SANE_RATE && raw <= MAX_SANE_RATE) {
          result = { rate: raw, source: 'site_config', updatedAt: rows[0].updated_at || null };
        } else {
          console.warn(`[fx-rate] stored rate unusable (${JSON.stringify(rows?.[0]?.value)}), using fallback ${EMERGENCY_FALLBACK_RATE}`);
        }
      } else {
        console.warn(`[fx-rate] site_config read failed HTTP ${res.status}, using fallback ${EMERGENCY_FALLBACK_RATE}`);
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.warn(`[fx-rate] site_config unreachable (${err.message}), using fallback ${EMERGENCY_FALLBACK_RATE}`);
  }

  cached = result;
  cachedAt = now;
  return result;
}

/** Convenience: just the number, for call sites that do not care about provenance. */
export async function fxRate() {
  return (await getFxRate()).rate;
}

/** Test hook: clears the memo so a test can observe a fresh lookup. */
export function __resetFxCacheForTests() {
  cached = null;
  cachedAt = 0;
}
