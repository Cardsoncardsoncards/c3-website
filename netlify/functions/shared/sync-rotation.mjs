// netlify/functions/shared/sync-rotation.mjs
//
// Staleness-ordered rotation with a wall-clock budget, for syncs whose catalogue is too big to
// refresh in one Netlify background run.
//
// WHY THIS EXISTS (C3L-133 and C3L-134). Two games are far larger than the rest, Yu-Gi-Oh at
// 47,071 cards and Pokemon at 31,833, and each failed in its own way at the 15 minute limit:
//
//   Pokemon gated card writes on "is this set new", recorded the answer permanently in
//   pokemon_sync_progress, and then filled that table. Every set became not-new forever, so the
//   card-write branch became unreachable and market_price froze. 215 of its 235 sets had not
//   been refreshed since 14 May 2026. The sync still reported sync_success every night.
//
//   Yu-Gi-Oh had no gate at all and simply ran until Netlify killed it, three times a night,
//   never reaching either its success or its error line. 21 starts and zero outcomes in 7 days.
//
// So the two available designs were each already tried here and each failed: gate permanently
// and freeze, or do not gate and get killed. This module is the third option. Refresh the most
// stale sets first, stop cleanly when a time budget is spent, and record where it stopped, so
// every set is revisited on a bounded cycle and no run is ever killed mid-write.
//
// ON THE PROGRESS TABLES. pokemon_sync_progress and yugioh_sync_progress both already exist
// with the same two columns, set_id and synced_at. They are NOT dropped. What changes is what
// they mean: synced_at was a flag that a set had ever been done and is now an ORDERING key for
// when it was last done. A row's presence no longer excludes a set from anything, which is the
// specific behaviour that froze Pokemon.
//
// ON THE BUDGET. Netlify background functions are capped at 15 minutes (900s). The default
// leaves real headroom rather than creeping up to the wall, because the failure mode of
// overrunning is not a slow run, it is C3L-134: the process is killed, so the code that would
// report the failure never executes and the run is indistinguishable from one that never
// started. Finishing early and saying so is always better than finishing late and vanishing.
//
// ON COVERAGE FALLING BEHIND. This module deliberately adds no new alert. scripts/
// sync-health-check.mjs already carries Signal C, card metadata stale by CARD_STALE_DAYS (4)
// or more, which is exactly the symptom of a rotation that cannot keep up. If the budget is
// too small for the catalogue, that existing check fails. A second overlapping alert would be
// noise, and C3L-51's own note is that a threshold which cries wolf gets ignored.

// Netlify's hard limit for a background function.
export const BACKGROUND_LIMIT_MS = 900_000;

/**
 * Wall-clock budget. Cheap to call, so it can be checked in a hot loop.
 * @param {number} budgetMs how long the budgeted phase may run for
 */
export function makeBudget(budgetMs) {
  const start = Date.now();
  return {
    startedAt: start,
    budgetMs,
    elapsedMs: () => Date.now() - start,
    elapsedS:  () => ((Date.now() - start) / 1000).toFixed(1),
    remainingMs: () => Math.max(0, budgetMs - (Date.now() - start)),
    exceeded:  () => Date.now() - start >= budgetMs,
    /**
     * True when there is not enough budget left to be confident a further unit of work can
     * finish. Checked BEFORE starting a set rather than after, so a set is never begun that
     * cannot be completed, which is what keeps writes whole.
     */
    cannotFit: (estimateMs) => Date.now() - start + estimateMs >= budgetMs,
  };
}

/**
 * Reads a <game>_sync_progress table into a Map of set_id to synced_at (epoch ms).
 * A read failure returns an EMPTY map rather than throwing. That degrades to "every set looks
 * equally stale", which makes the rotation arbitrary but still correct, and is much safer than
 * failing the whole sync over an ordering hint.
 */
export async function loadSetProgress({ table, supabaseUrl, serviceKey, logPrefix = '[rotation]' }) {
  const progress = new Map();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/${table}?select=set_id,synced_at&limit=5000`,
        {
          signal: ctrl.signal,
          headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
        }
      );
      if (!res.ok) {
        console.warn(`${logPrefix} ${table} read failed HTTP ${res.status}, rotation order will be arbitrary`);
        return progress;
      }
      const rows = await res.json();
      for (const r of rows) {
        const t = r.synced_at ? Date.parse(r.synced_at) : NaN;
        progress.set(r.set_id, Number.isFinite(t) ? t : 0);
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.warn(`${logPrefix} ${table} unreachable (${err.message}), rotation order will be arbitrary`);
  }
  return progress;
}

/**
 * Orders sets oldest-refreshed first. Never-refreshed sets sort ahead of everything, so a newly
 * released set is picked up on the next run rather than waiting for a full cycle.
 * Returns a new array; the input is not mutated.
 */
export function orderSetsByStaleness(sets, progress) {
  return [...sets].sort((a, b) => {
    const ta = progress.has(a.id) ? progress.get(a.id) : -1;
    const tb = progress.has(b.id) ? progress.get(b.id) : -1;
    if (ta !== tb) return ta - tb;
    // Stable, deterministic tiebreak. Without it, sets sharing a timestamp (215 of Pokemon's
    // 235 share 14 May) could come back in a different order each night and starve some of
    // them indefinitely while others repeat.
    return String(a.id).localeCompare(String(b.id), 'en');
  });
}

/**
 * Stamps a set as refreshed now. Upsert, so it both inserts a new set and moves an existing
 * set to the back of the queue.
 */
export async function markSetSynced({ table, setId, supabaseUrl, serviceKey, logPrefix = '[rotation]' }) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({ set_id: setId, synced_at: new Date().toISOString() })
    });
    if (!res.ok) {
      console.warn(`${logPrefix} ${table} mark failed for set ${setId}: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(`${logPrefix} ${table} mark error for set ${setId}: ${err.message}`);
  }
}

/**
 * One line describing what a rotation actually covered, for the sync_events row and the log.
 * Returns null when every set was refreshed, so a complete run writes nothing misleading.
 *
 * This is the piece C3L-134 was missing. "Started and never finished" and "finished having
 * covered 42 of 235" look identical from outside unless the run says which one it was.
 */
export function rotationSummary({ refreshed, total, budgetMs, oldestRemaining }) {
  if (refreshed >= total) return null;
  const oldest = oldestRemaining ? `, oldest unrefreshed ${oldestRemaining}` : '';
  return `partial rotation: ${refreshed}/${total} sets refreshed, ` +
         `${Math.round(budgetMs / 1000)}s budget spent${oldest}`;
}
