// netlify/functions/shared/sync-event.mjs
//
// One definition of "write a row to sync_events".
//
// WHY (C3L-91). The alerting subsystem has never written a single sync_events row, ever. Not a
// start, not a success, not a failure. Re-verified 9 August 2026: zero rows for follows and zero
// for the digest, across the whole life of the table. So there has never been a way to answer
// "did the alert run last night, and did it do anything", and the only evidence a run ever
// happened at all is a Netlify function log that ages out.
//
// The sync functions already do this, each with its own private copy of the same helper. This
// module exists so the alerting path does not become the fifty-first copy, and so the column
// names are written down once. sync_events columns: event_type, game, rows_affected,
// error_message, triggered_at (defaulted).
//
// Deliberately never throws and never blocks the caller's real work. A failure to LOG must not
// turn into a failure to alert, which would be a strictly worse bug than the one being fixed.

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');

/**
 * @param {object}  opts
 * @param {string}  opts.eventType     e.g. 'sync_start', 'sync_success', 'sync_error'
 * @param {string}  [opts.game]        free text; the alerting rows use 'follows' and 'digest'
 * @param {number}  [opts.rowsAffected]
 * @param {string}  [opts.errorMessage]
 * @param {string}  [opts.logPrefix]
 */
export async function logSyncEvent({ eventType, game = null, rowsAffected = null, errorMessage = null, logPrefix = '[sync-event]' }) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.warn(`${logPrefix} cannot log ${eventType}: Supabase env vars missing`);
    return false;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/sync_events`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify([{
        event_type:    eventType,
        game:          game,
        rows_affected: Number.isFinite(rowsAffected) ? rowsAffected : null,
        error_message: errorMessage ? String(errorMessage).slice(0, 500) : null
      }]),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`${logPrefix} sync_events ${eventType} failed HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    clearTimeout(timer);
    console.warn(`${logPrefix} sync_events ${eventType} error: ${e.message}`);
    return false;
  }
}
