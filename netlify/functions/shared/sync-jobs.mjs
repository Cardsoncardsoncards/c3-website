import { logSyncEvent } from './sync-event.mjs';
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
  weissschwarz: {
    label: 'Weiss Schwarz card and price sync',
    file: 'sync-weissschwarz-background.mjs',
    schedule: '30 0 * * *',
    background: true,
    note: 'Added 11 August 2026 to verify C3L-166 on demand. This is the game where two sets '
        + 'slugify identically, so it is the one whose cross-batch slug collision has to be '
        + 'provable without waiting for 00:30 UTC. '
        + 'CORRECTED AGAIN 2 September 2026 (task5), and the previous warning is now WRONG, so '
        + 'do not act on it. This note used to say a same-day re-run raises 23505 on every '
        + 'already-snapshotted card, because the snapshot upsert merged on the primary key while '
        + 'a separate unique index covered (card_id, snapshot_date). That C3L-170 hazard has '
        + 'since been fixed and the fix was verified rather than assumed: this file now upserts '
        + 'with on_conflict=card_id,snapshot_date, and the live index '
        + 'weissschwarz_price_snapshots_card_id_snapshot_date_key covers exactly that pair, so '
        + 'the conflict target and the constraint agree and a second run merges the day row. '
        + 'All 28 game syncs were checked the same way and all 28 now match. Expect an ordinary '
        + 'clean re-run, NOT the sync_partial and inflated failed-set count described before.'
  },
  'fx-rate': {
    label: 'USD to AUD rate refresh',
    file: 'sync-fx-rate.mjs',
    schedule: '0 1 * * *',
    background: false,
    note: 'The one working writer of site_config.usd_aud_rate. The pg_cron writer is disabled, see C3L-130.'
  },

  // ---- BATCH 2, added 11 August 2026. Chosen smallest and safest first, on purpose. ----
  //
  // 'releases' writes one small table with a correct conflict target and reads everything else.
  // The five 'ids-*' jobs currently have ZERO pending rows each (measured the same day), so
  // invoking them exercises the entire trigger path end to end while doing almost no work,
  // which is exactly what a first batch should do.
  //
  // READ THIS BEFORE ADDING MORE ids-* JOBS. These five are also the jobs that most NEED a
  // manual path, and not for the usual reason. Each one self-chains when it hits its 13 minute
  // budget by calling its OWN scheduled URL over HTTP, and Netlify answers 403 to exactly that
  // (C3L-136), so the continuation has never been able to fire. See C3L-173. Running one
  // through this trigger calls the handler directly and is therefore the only way a
  // continuation can currently happen at all.
  releases: {
    label: 'Upcoming set releases aggregation',
    file: 'sync-tcg-releases.mjs',
    schedule: '30 2 * * *',
    background: false,
    note: 'Reads 32 <game>_sets tables, writes only tcg_releases, upserting on the unique key '
        + '(game, slug, product_type). Idempotent: a manual run on top of the nightly one '
        + 'rewrites the same rows and moves updated_at, which is what makes it easy to verify.'
  },
  'ids-lorcana': {
    label: 'Lorcana tcgapi id resolution',
    file: 'sync-ids-lorcana-background.mjs',
    schedule: '0 15 * * *',
    background: true,
    note: 'Resolves tcgplayer_id to tcgapi.dev id. Only ever selects rows where tcgapi_id IS '
        + 'NULL, so re-running cannot redo finished work. 0 pending on 11 August 2026.'
  },
  'ids-onepiece': {
    label: 'One Piece tcgapi id resolution',
    file: 'sync-ids-onepiece-background.mjs',
    schedule: '0 15 * * *',
    background: true,
    note: 'Same shape as ids-lorcana. 0 pending on 11 August 2026.'
  },
  'ids-starwars': {
    label: 'Star Wars Unlimited tcgapi id resolution',
    file: 'sync-ids-starwars-background.mjs',
    schedule: '0 15 * * *',
    background: true,
    note: 'Same shape as ids-lorcana. 0 pending on 11 August 2026.'
  },
  'ids-riftbound': {
    label: 'Riftbound tcgapi id resolution',
    file: 'sync-ids-riftbound-background.mjs',
    schedule: '0 15 * * *',
    background: true,
    note: 'Same shape as ids-lorcana. 0 pending on 11 August 2026.'
  },
  'ids-dragonball': {
    label: 'Dragon Ball Super CCG tcgapi id resolution',
    file: 'sync-ids-dragonball-background.mjs',
    schedule: '0 15 * * *',
    background: true,
    note: 'Same shape as ids-lorcana. This is the EXTENDED dragonball game (dragonball_cards), '
        + 'NOT the Core dbsfusionworld. There is no ids job for dbsfusionworld at all. '
        + '0 pending on 11 August 2026.'
  },

  // ---- BATCH 3, added 2 September 2026 (task5). THE REMAINING 38, so the registry now
  // covers all 48 scheduled functions. ----
  //
  // WHY THIS IS A REGISTRY EDIT AND NOT 38 FILE EDITS. The task that commissioned this asked
  // for a manual trigger to be added "to each of the 36 functions". That is the one shape that
  // cannot work, and this file already records why: Netlify answers 403 to any direct HTTP
  // request for a function whose config carries `schedule`. Editing 38 more files would have
  // produced 38 more copies of the unreachable guard that already sits, dead, in 45 of them.
  // Re-confirmed live before writing this, against the deployed site:
  //   POST /.netlify/functions/sync-fx-rate              403 (empty body, platform layer)
  //   POST /.netlify/functions/sync-pokemon-background   403 (empty body, platform layer)
  // The 403 arrives with no body, so it is Netlify refusing to route rather than the
  // function returning its own 401. The capability has to live off the schedule, which is
  // what admin-trigger.mjs already is. Adding a job is two lines here plus two there.
  //
  // THE SAFEGUARD WAS VERIFIED BEFORE ANY JOB WAS ADDED, not assumed from reading the code.
  // Against the live endpoint, every unauthenticated shape was refused:
  //   no x-sync-secret header at all         401 Missing x-sync-secret header
  //   wrong secret                           401 Bad x-sync-secret header
  //   empty secret header                    401 Missing x-sync-secret header
  //   no header but origin and referer set   401 Missing x-sync-secret header
  //   GET instead of POST                    405 POST only
  // The fourth case is the one that matters: it is the exact C3L-127 bypass shape, where a
  // request with no headers was mistaken for the scheduler. checkSyncSecret has no such
  // branch, and the live result confirms it.
  //
  // ON RE-RUN SAFETY FOR THE 28 GAME SYNCS. Every one of them upserts snapshots with
  // on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX on each
  // <game>_price_snapshots table, both checked rather than assumed. So a same-day re-run
  // merges the day row. SEE THE CORRECTION ON THE weissschwarz ENTRY ABOVE: the 23505 hazard
  // it warns about no longer exists.
  //
  // THREE JOBS CARRY A `caution` AND IT IS NOT DECORATION. card-follows, price-alerts and
  // alert-digest SEND EMAIL TO REAL PEOPLE. A manual re-run can deliver a duplicate alert to
  // a stranger, and there is no undo on a delivered email. They are registered because the
  // trigger is secret-protected and only the operator can reach it, but they must not be used
  // to test the trigger path. describeJobs() surfaces `caution` so a caller listing the jobs
  // sees the warning rather than having to read this file.
  alphaclash: {
    label: 'Alpha Clash card and price sync',
    file: 'sync-alphaclash-background.mjs',
    schedule: '0 10 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  bakugan: {
    label: 'Bakugan card and price sync',
    file: 'sync-bakugan-background.mjs',
    schedule: '0 12 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  battlespiritssaga: {
    label: 'Battle Spirits Saga card and price sync',
    file: 'sync-battlespiritssaga-background.mjs',
    schedule: '15 10 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  buddyfight: {
    label: 'Future Card Buddyfight card and price sync',
    file: 'sync-buddyfight-background.mjs',
    schedule: '0 3 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  dbsfusionworld: {
    label: 'Dragon Ball Super Fusion World card and price sync',
    file: 'sync-dbsfusionworld-background.mjs',
    schedule: '0 9 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  digimon: {
    label: 'Digimon card and price sync',
    file: 'sync-digimon-background.mjs',
    schedule: '30 2 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  dragonball: {
    label: 'Dragon Ball Super CCG card and price sync',
    file: 'sync-dragonball-background.mjs',
    schedule: '0 2 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  dragonballz: {
    label: 'Dragon Ball Z (Panini) card and price sync',
    file: 'sync-dragonballz-background.mjs',
    schedule: '30 10 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  finalfantasy: {
    label: 'Final Fantasy TCG card and price sync',
    file: 'sync-finalfantasy-background.mjs',
    schedule: '30 5 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  forceofwill: {
    label: 'Force of Will card and price sync',
    file: 'sync-forceofwill-background.mjs',
    schedule: '30 1 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  gateruler: {
    label: 'Gate Ruler card and price sync',
    file: 'sync-gateruler-background.mjs',
    schedule: '45 10 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  godzilla: {
    label: 'Godzilla card and price sync',
    file: 'sync-godzilla-background.mjs',
    schedule: '0 11 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  grandarchive: {
    label: 'Grand Archive card and price sync',
    file: 'sync-grandarchive-background.mjs',
    schedule: '0 8 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  gundam: {
    label: 'Gundam card and price sync',
    file: 'sync-gundam-background.mjs',
    schedule: '15 11 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  hololive: {
    label: 'Hololive card and price sync',
    file: 'sync-hololive-background.mjs',
    schedule: '30 11 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  lorcana: {
    label: 'Lorcana card and price sync',
    file: 'sync-lorcana-background.mjs',
    schedule: '30 9 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  metazoo: {
    label: 'MetaZoo card and price sync',
    file: 'sync-metazoo-background.mjs',
    schedule: '30 8 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  onepiece: {
    label: 'One Piece card and price sync',
    file: 'sync-onepiece-background.mjs',
    schedule: '30 4 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  riftbound: {
    label: 'Riftbound card and price sync',
    file: 'sync-riftbound-background.mjs',
    schedule: '45 9 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  shadowverse: {
    label: 'Shadowverse Evolve card and price sync',
    file: 'sync-shadowverse-background.mjs',
    schedule: '0 5 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  sorcery: {
    label: 'Sorcery Contested Realm card and price sync',
    file: 'sync-sorcery-background.mjs',
    schedule: '30 7 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  starwars: {
    label: 'Star Wars Unlimited card and price sync',
    file: 'sync-starwars-background.mjs',
    schedule: '0 4 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  unionarena: {
    label: 'Union Arena card and price sync',
    file: 'sync-unionarena-background.mjs',
    schedule: '0 6 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  universus: {
    label: 'UniVersus card and price sync',
    file: 'sync-universus-background.mjs',
    schedule: '30 3 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  vanguard: {
    label: 'Cardfight Vanguard card and price sync',
    file: 'sync-vanguard-background.mjs',
    schedule: '0 1 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  warhammer: {
    label: 'Warhammer card and price sync',
    file: 'sync-warhammer-background.mjs',
    schedule: '45 11 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  wixoss: {
    label: 'Wixoss card and price sync',
    file: 'sync-wixoss-background.mjs',
    schedule: '30 6 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  wow: {
    label: 'World of Warcraft TCG card and price sync',
    file: 'sync-wow-background.mjs',
    schedule: '0 7 * * *',
    background: true,
    note: 'Card, set and price-snapshot sync. Safe to re-run on the same day: the snapshot upsert '
  + 'targets on_conflict=card_id,snapshot_date, and that pair carries a real UNIQUE INDEX '
  + '(<game>_price_snapshots_card_id_snapshot_date_key, verified live 2 September 2026), so a '
  + 'second run merges the day row rather than raising 23505.'
  },
  'ids-mtg': {
    label: 'MTG tcgapi id resolution',
    file: 'sync-ids-mtg-background.mjs',
    schedule: '0 3 * * *',
    background: true,
    note: 'Resolves tcgplayer_id to tcgapi.dev id, selecting only rows where tcgapi_id IS NULL, so '
  + 'a re-run cannot redo finished work. Like the other ids-* jobs it self-chains by calling '
  + 'its own scheduled URL, which Netlify answers with 403, so this trigger is the only way '
  + 'its continuation can fire. See C3L-173.'
  },
  'ids-pokemon': {
    label: 'Pokemon tcgapi id resolution',
    file: 'sync-ids-pokemon-background.mjs',
    schedule: '0 3 * * *',
    background: true,
    note: 'Same shape and same C3L-173 self-chaining problem as ids-mtg.'
  },
  'ids-yugioh': {
    label: 'Yu-Gi-Oh tcgapi id resolution',
    file: 'sync-ids-yugioh-background.mjs',
    schedule: '0 3 * * *',
    background: true,
    note: 'Same shape and same C3L-173 self-chaining problem as ids-mtg.'
  },
  'enrich-prices': {
    label: 'Price enrichment across games',
    file: 'enrich-prices-background.mjs',
    schedule: '0 5 * * *',
    background: true,
    note: 'Fills missing price fields from the shared enrichment path. Reads broadly and writes '
  + 'price columns only.'
  },
  'enrich-apitcg-stats': {
    label: 'apitcg card detail enrichment',
    file: 'enrich-apitcg-stats-background.mjs',
    schedule: '0 13 1 * *',
    background: false,
    note: 'Monthly, not daily, so it is the job most likely to be wanted on demand: waiting for the '
  + 'next run means waiting up to a month.'
  },
  indexnow: {
    label: 'IndexNow URL ping',
    file: 'sync-indexnow-ping.mjs',
    schedule: '0 3 * * *',
    background: false,
    caution: 'Outward facing. This submits URLs to a third-party indexing service, so a manual run is '
  + 'visible outside C3 and should not be used to test the trigger path.',
    note: 'Pings IndexNow with changed URLs, authenticated by the key file served at the site root.'
  },
  'sales-history': {
    label: 'eBay sales history capture',
    file: 'sync-sales-history.mjs',
    schedule: '0 17 * * *',
    background: false,
    note: 'Appends observed sales. Re-running the same day may add duplicate observations, so '
  + 'prefer it after a confirmed failure rather than speculatively.'
  },
  'card-follows': {
    label: 'Card follow price-change alerts',
    file: 'check-card-follows.mjs',
    schedule: '30 21 * * *',
    background: false,
    caution: 'SENDS EMAIL TO REAL PEOPLE. A manual run can deliver a second alert for a movement that '
  + 'was already notified. There is no undo on a delivered email. Do not use this to test the '
  + 'trigger path, and do not re-run it to "check something" on a day the scheduled run '
  + 'already succeeded.',
    note: 'Evaluates follows for the 7 games in ALERTABLE_GAMES and emails matches via Resend.'
  },
  'price-alerts': {
    label: 'Standalone price alerts',
    file: 'check-price-alerts.mjs',
    schedule: '0 23 * * *',
    background: false,
    caution: 'SENDS EMAIL TO REAL PEOPLE. Same warning as card-follows: a re-run can double-send.',
    note: 'The older price alert path, kept alongside the follow system.'
  },
  'alert-digest': {
    label: 'Alert digest email',
    file: 'sync-alert-digest.mjs',
    schedule: '0 20 * * *',
    background: false,
    caution: 'SENDS EMAIL TO REAL PEOPLE. A re-run delivers a duplicate digest.',
    note: 'Rolls pending alerts into a single digest send.'
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

/**
 * Writes a sync_events row for the trigger itself. This is the only way a caller can see the
 * outcome of a background invocation, because Netlify answers 202 and discards the handler's
 * response, so without this the run would be exactly the silent shape this register keeps
 * complaining about.
 *
 * Delegates to shared/sync-event.mjs so there is one definition of the row shape rather than
 * a fifty-first private copy.
 */
export async function logTriggerEvent(eventType, job, rowsAffected = null, errorMessage = null) {
  return logSyncEvent({ eventType, game: job, rowsAffected, errorMessage, logPrefix: '[admin-trigger]' });
}
