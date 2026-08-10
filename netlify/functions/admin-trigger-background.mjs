import { JOBS, checkSyncSecret, syncSecret, logTriggerEvent } from './shared/sync-jobs.mjs';
import pokemonSync from './sync-pokemon-background.mjs';
import yugiohSync from './sync-yugioh-background.mjs';
import fxRateSync from './sync-fx-rate.mjs';
// netlify/functions/admin-trigger-background.mjs
//
// C3L-136. The half that actually runs a sync on demand.
//
// It is a BACKGROUND function with NO `schedule` key, which is the whole point: `schedule` is
// what makes Netlify answer 403 to direct HTTP, and `type: background` is what buys the 15
// minute budget the rotation syncs are written against. A plain function would time out on
// Pokemon or Yu-Gi-Oh long before they finish.
//
// The targets are STATIC imports, not a dynamic import built from the job name. A variable
// specifier is not statically analysable, so the bundler would not include the target and the
// failure would only appear at invocation time, which is the class of failure this repo keeps
// producing. Adding a job here is therefore two lines: an import and a HANDLERS entry.

// Job name to the target's default export. The scheduler calls exactly this function with a
// Request, so calling it directly runs the same code path a scheduled run does.
const HANDLERS = {
  pokemon: pokemonSync,
  yugioh: yugiohSync,
  'fx-rate': fxRateSync
};

export default async (req) => {
  // Authenticated again here, independently of admin-trigger.mjs. This endpoint is reachable
  // on its own URL, so it cannot rely on having been called through the front door.
  const auth = checkSyncSecret(req);
  if (!auth.ok) {
    // Netlify has already answered 202 to the caller, so this line and the absent sync_events
    // row are the only evidence. Both are deliberate.
    console.error(`[admin-trigger-bg] rejected: ${auth.message}`);
    return new Response(auth.message, { status: auth.status });
  }

  let job = new URL(req.url).searchParams.get('job');
  if (!job) {
    try {
      const body = await req.json();
      job = body && body.job;
    } catch { /* no body, handled below */ }
  }

  if (!job || !HANDLERS[job]) {
    console.error(`[admin-trigger-bg] unknown job: ${JSON.stringify(job)}`);
    return new Response('Unknown job', { status: 400 });
  }

  const meta = JOBS[job];
  console.log(`[admin-trigger-bg] running ${job} (${meta.label})`);
  await logTriggerEvent('manual_trigger_start', job);
  const start = Date.now();

  try {
    // The synthetic Request carries the secret, which is what the target's own guard expects.
    // Origin and referer are deliberately absent: sync-fx-rate and sync-yugioh treat their
    // presence as a browser request.
    const inner = new Request(`https://cardsoncardsoncards.com.au/.netlify/functions/${meta.file.replace(/\.mjs$/, '')}`, {
      method: 'POST',
      headers: { 'x-sync-secret': syncSecret() }
    });

    const res = await HANDLERS[job](inner);
    const secs = Math.round((Date.now() - start) / 1000);
    const bodyText = res && typeof res.text === 'function' ? (await res.text()).slice(0, 500) : '';
    const status = res ? res.status : 0;

    if (status >= 200 && status < 300) {
      console.log(`[admin-trigger-bg] ${job} finished in ${secs}s, status ${status}: ${bodyText}`);
      await logTriggerEvent('manual_trigger_success', job, secs, null);
    } else {
      console.error(`[admin-trigger-bg] ${job} returned ${status} after ${secs}s: ${bodyText}`);
      await logTriggerEvent('manual_trigger_failure', job, secs, `status ${status}: ${bodyText}`);
    }
    return new Response('done', { status: 200 });
  } catch (err) {
    const secs = Math.round((Date.now() - start) / 1000);
    console.error(`[admin-trigger-bg] ${job} threw after ${secs}s: ${err.message}`);
    await logTriggerEvent('manual_trigger_failure', job, secs, err.message);
    return new Response('failed', { status: 500 });
  }
};

// NO `schedule` key. That is what keeps this reachable.
export const config = {
  type: 'background'
};
