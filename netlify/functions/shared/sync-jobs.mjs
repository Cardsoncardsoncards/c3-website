// netlify/functions/shared/sync-jobs.mjs
//
// The registry and the auth for the manual sync trigger (C3L-136).
//
// WHY THIS EXISTS. 45 of this repo's 46 scheduled functions contain an `x-sync-secret`
// manual-invocation path, and not one of them has ever been reachable. Netlify returns
// 403 to every direct HTTP request for a function whose config carries `schedule`, in
// production as well as on previews. Re-confirmed 10 August 2026 against the live domain:
//
//   POST /.netlify/functions/sync-pokemon-background   403   (scheduled)
//   POST /.netlify/functions/sync-fx-rate              403   (scheduled)
//   POST /.netlify/functions/sync-indexnow-ping        403   (scheduled)
//   POST /.netlify/functions/card-api                  400   (not scheduled, request arrived)
//   POST /.netlify/functions/get-fx-rate               400   (not scheduled, request arrived)
//
// So the secret checks inside those 45 files are not broken, they are unreachable, and no
// amount of fixing them changes that. The capability has to live somewhere that is NOT
// scheduled. That is what admin-trigger.mjs and admin-trigger-background.mjs are.
//
// WHAT THIS DOES NOT DO. It does not HTTP-call the scheduled functions, because that is the
// thing the platform blocks. It imports their default export and calls it directly, passing
// a synthetic Request carrying the secret, which is the same entry point the scheduler uses.

// Last-resort guard. If SYNC_SECRET is absent the trigger must refuse everything rather than
// degrade to an open endpoint, which is the mistake C3L-127 recorded: a guard that rejected a
// WRONG secret but passed a request with NO header at all.
const SYNC_SECRET = Netlify.env.get('SYNC_SECRET');

/**
 * Jobs the manual trigger can run. Deliberately a short, named list rather than "any sync",
 * so adding one is an explicit decision and the uncovered set stays visible.
 *
 * `background` records whether the target itself is a Netlify background function, which is
 * only documentation here: the trigger always runs on the background side, so a 15 minute
 * budget applies either way.
 */
export const JOBS = {
  pokemon: {
    label: 'Pokemon card and price sync',
    file: 'sync-pokemon-background.mjs',
    schedule: '0 4 * * *',
    background: true,
    note: 'Staleness-ordered set rotation with a wall-clock budget, added in 414aa90 for C3L-133.'
  },
  yugioh: {
    label: 'Yu-Gi-Oh card and price sync',
    file: 'sync-yugioh-background.mjs',
    schedule: '0 0 * * *',
    background: true,
    note: 'Same rotation shape as Pokemon, added in 414aa90 for C3L-57 and C3L-134.'
  },
  'fx-rate': {
    label: 'USD to AUD rate refresh',
    file: 'sync-fx-rate.mjs',
    schedule: '0 1 * * *',
    background: false,
    note: 'The one working writer of site_config.usd_aud_rate. The pg_cron writer is disabled, see C3L-130.'
  }
};

export const JOB_NAMES = Object.keys(JOBS);

// Constant-time compare, same reasoning as shared/session.mjs: a plain === leaks how much of
// the secret matched through timing.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Unconditional secret check. There is no "looks like the scheduler so let it through" branch,
 * because that is exactly the bypass C3L-127 found: absence of headers cannot distinguish the
 * scheduler from curl. Nothing schedules these two functions, so no such branch is needed.
 *
 * @returns {{ok: true} | {ok: false, status: number, message: string}}
 */
export function checkSyncSecret(req) {
  if (!SYNC_SECRET) {
    // Fail closed. An unset secret must not mean "no check required".
    return { ok: false, status: 503, message: 'SYNC_SECRET is not configured, trigger disabled' };
  }
  const supplied = req.headers.get('x-sync-secret');
  if (!supplied) return { ok: false, status: 401, message: 'Missing x-sync-secret header' };
  if (!safeEqual(supplied, SYNC_SECRET)) return { ok: false, status: 401, message: 'Bad x-sync-secret header' };
  return { ok: true };
}

/** The secret itself, for forwarding to the job being invoked. Never returned to a caller. */
export function syncSecret() {
  return SYNC_SECRET;
}

const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');

/**
 * Writes a sync_events row for the trigger itself. This is the only way a caller can see the
 * outcome of a background invocation, because Netlify answers 202 and discards the handler's
 * response, so without this the run would be exactly the silent shape this register keeps
 * complaining about.
 */
export async function logTriggerEvent(eventType, job, rowsAffected = null, errorMessage = null) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
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
        event_type: eventType,
        game: job,
        rows_affected: rowsAffected,
        error_message: errorMessage ? String(errorMessage).slice(0, 500) : null
      }]),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) console.warn(`[admin-trigger] sync_events log failed ${res.status}`);
  } catch (e) {
    clearTimeout(timer);
    console.warn(`[admin-trigger] sync_events log error: ${e.message}`);
  }
}
