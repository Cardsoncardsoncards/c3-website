// Regression test for netlify/functions/shared/slug-assign.mjs (C3L-55).
//
// Why this file exists rather than a one-off check in a task: the slug rule used to live
// inline in 31 separate sync functions and now lives in one shared module, which is better
// for correctness and worse for blast radius. A mistake in that module no longer breaks one
// game, it breaks every game at once. This test is the counterweight, and it runs in CI on
// every push that touches the module.
//
// Every fixture below is a REAL row pulled from the live database, not an invented example.
// The five marked FLIP are the cases where the previous rule, lowest-id-wins, would have
// taken a slug off a live row and moved a working URL.
//
// Run: node scripts/test-slug-assign.mjs

import { assignStableSlugs } from '../netlify/functions/shared/slug-assign.mjs';

// table -> { storedSlug: idOfRowThatOwnsIt }, copied from live data on 5 August 2026
const STORED = {
  buddyfight_cards:   { 'immortal-entities-bold-dragon-eb01-0045en': 859700 },
  gundam_cards:       { 'steel-requiem-resource-r025-c-r-025': 1081761,
                        'dual-impact-resource-r015-c-r-015': 1030428 },
  unionarena_cards:   { 'ue22bt-chainsaw-man-reze-031-sr-ue22bt-csm-1-031': 2164155 },
  weissschwarz_cards: { 'kaguya-sama-love-is-war-kaguyasama-love-is-war-booster-box': 962780 },
  yugioh_cards:       { 'premium-pack-2-elemental-hero-heat-pp02-en007': 310476 },
  newgame_cards:      {}
};

// C3L-56, RULE 3. The whole stored contents of each table, id to slug, which is what the new
// full-table scan reads. STORED above is the same data keyed the other way round and is what
// RULE 1's `slug=in.(...)` lookup reads, so the two must agree or the fixtures are lying.
// The three weissschwarz rows below are the real C3L-56 orphans, copied from live data on
// 11 August 2026: each holds `${base}-${id}` while nothing holds the bare base.
const WS_ORPHAN_1 = 'kaguya-sama-love-is-war-bewitching-pose-kaguya-kgl-s79-e078-r';
const WS_ORPHAN_2 = 'kaguya-sama-love-is-war-marching-band-kaguya-kgl-s95-e077-rr';
const WS_ORPHAN_3 = 'kaguya-sama-love-is-war-marked-deck-kgl-s79-e020-c';
// A real Pokemon row whose slug ENDS IN ITS OWN ID BY COINCIDENCE: card "N - 2017 (Naoto
// Suzuki)", number 105/124, row id 124. Its base slug legitimately ends `-105-124`. Treating a
// trailing number as an id suffix is what made C3L-56 read as 5 orphans when it is 3.
const PKM_COINCIDENCE = 'world-championship-decks-n-2017-naoto-suzuki-105-124';

const TABLE_ROWS = {
  weissschwarz_cards: {
    962780:  'kaguya-sama-love-is-war-kaguyasama-love-is-war-booster-box',
    961867:  'kaguya-sama-love-is-war-kaguyasama-love-is-war-booster-box-961867',
    985672:  WS_ORPHAN_1 + '-985672',
    985674:  WS_ORPHAN_2 + '-985674',
    1131673: WS_ORPHAN_3 + '-1131673'
  },
  pokemon_cards: { 124: PKM_COINCIDENCE },
  buddyfight_cards:  { 859700: 'immortal-entities-bold-dragon-eb01-0045en' },
  gundam_cards:      { 1081761: 'steel-requiem-resource-r025-c-r-025',
                       1030428: 'dual-impact-resource-r015-c-r-015' },
  unionarena_cards:  { 2164155: 'ue22bt-chainsaw-man-reze-031-sr-ue22bt-csm-1-031' },
  yugioh_cards:      { 310476: 'premium-pack-2-elemental-hero-heat-pp02-en007' },
  newgame_cards:     {}
};

let lookups = 0;      // RULE 1, slug=in.(...)
let scans   = 0;      // RULE 3, full table id/slug scan
let failScanFor = null;   // set to a table name to simulate the scan failing

globalThis.fetch = async (url) => {
  const table = url.match(/rest\/v1\/([a-z_]+)\?/)[1];

  // RULE 3's full-table scan.
  if (/select=id,slug&order=id\.asc/.test(url)) {
    scans++;
    if (failScanFor === table) return { ok: false, status: 500, text: async () => 'simulated failure' };
    const offset = Number((url.match(/offset=(\d+)/) || [])[1] || 0);
    const all = Object.entries(TABLE_ROWS[table] || {}).map(([id, slug]) => ({ id: Number(id), slug }));
    return { ok: true, json: async () => all.slice(offset) };
  }

  // RULE 1's colliding-base owner lookup.
  lookups++;
  const list = decodeURIComponent(url.match(/slug=in\.\((.*)\)$/)[1]);
  const want = list.split('","').map(s => s.replace(/^"|"$/g, ''));
  const rows = want
    .filter(s => STORED[table] && STORED[table][s] !== undefined)
    .map(s => ({ id: STORED[table][s], slug: s }));
  return { ok: true, json: async () => rows };
};

let pass = 0;
let fail = 0;
const base = b => () => b;

async function check(label, items, baseFn, table, expected) {
  const m = await assignStableSlugs({
    items, baseSlugFor: baseFn, table, supabaseUrl: 'https://x', serviceKey: 'k'
  });
  const got = {};
  for (const [k, v] of m) got[k] = v;
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label);
  if (!ok) {
    console.log('   expected ' + JSON.stringify(expected));
    console.log('   got      ' + JSON.stringify(got));
  }
  ok ? pass++ : fail++;
}

const B = 'immortal-entities-bold-dragon-eb01-0045en';
const G = 'steel-requiem-resource-r025-c-r-025';
const U = 'ue22bt-chainsaw-man-reze-031-sr-ue22bt-csm-1-031';
const W = 'kaguya-sama-love-is-war-kaguyasama-love-is-war-booster-box';
const Y = 'premium-pack-2-elemental-hero-heat-pp02-en007';

await check('buddyfight, lowest id owns bare, old and new rule agree',
  [{ id: 859700 }, { id: 859702 }], base(B), 'buddyfight_cards',
  { 859700: B, 859702: B + '-859702' });

await check('gundam FLIP, higher id owns bare',
  [{ id: 1081639 }, { id: 1081761 }], base(G), 'gundam_cards',
  { 1081639: G + '-1081639', 1081761: G });

await check('unionarena FLIP, base rarity holds bare on the higher id',
  [{ id: 2164115 }, { id: 2164155 }], base(U), 'unionarena_cards',
  { 2164115: U + '-2164115', 2164155: U });

await check('weissschwarz cards FLIP, the pair Task 11 had to revert for',
  [{ id: 961867 }, { id: 962780 }], base(W), 'weissschwarz_cards',
  { 961867: W + '-961867', 962780: W });

await check('yugioh FLIP, case-only name difference',
  [{ id: 310456 }, { id: 310476 }], base(Y), 'yugioh_cards',
  { 310456: Y + '-310456', 310476: Y });

await check('order independence, same group reversed',
  [{ id: 1081761 }, { id: 1081639 }], base(G), 'gundam_cards',
  { 1081761: G, 1081639: G + '-1081639' });

await check('C3L-55 itself: a NEW lower id must not steal the live bare slug',
  [{ id: 1081761 }, { id: 1081639 }, { id: 5 }], base(G), 'gundam_cards',
  { 1081761: G, 1081639: G + '-1081639', 5: G + '-5' });

await check('bootstrap, brand new colliding pair with no stored owner, lowest id wins',
  [{ id: 900 }, { id: 400 }], base('brand-new'), 'newgame_cards',
  { 900: 'brand-new-900', 400: 'brand-new' });

await check('a slug with characters unsafe for a PostgREST filter is not looked up, and the '
  + 'bootstrap applies rather than a malformed query',
  [{ id: 20 }, { id: 10 }], base('bad"slug,here'), 'newgame_cards',
  { 20: 'bad"slug,here-20', 10: 'bad"slug,here' });

const before = lookups;
await check('no collision means no RULE 1 round trip',
  [{ id: 1 }, { id: 2 }], i => 'unique-' + i.id, 'newgame_cards',
  { 1: 'unique-1', 2: 'unique-2' });
const noLookup = lookups === before;
console.log((noLookup ? 'PASS  ' : 'FAIL  ') + 'RULE 1 lookup skipped when nothing collides ('
  + (lookups - before) + ' queries)');
noLookup ? pass++ : fail++;

// ---------------------------------------------------------------------------
// C3L-56, RULE 3. A lone claimant that already owns the suffixed slug keeps it.
// ---------------------------------------------------------------------------

await check('C3L-56 orphan 1: lone claimant already stored suffixed KEEPS its live URL',
  [{ id: 985672 }], base(WS_ORPHAN_1), 'weissschwarz_cards',
  { 985672: WS_ORPHAN_1 + '-985672' });

await check('C3L-56 orphan 2: same, different set',
  [{ id: 985674 }], base(WS_ORPHAN_2), 'weissschwarz_cards',
  { 985674: WS_ORPHAN_2 + '-985674' });

await check('C3L-56 orphan 3: same, a Climax card',
  [{ id: 1131673 }], base(WS_ORPHAN_3), 'weissschwarz_cards',
  { 1131673: WS_ORPHAN_3 + '-1131673' });

await check('a lone claimant stored under the BARE slug keeps the bare slug, RULE 3 must not '
  + 'invent a suffix',
  [{ id: 962780 }], base('kaguya-sama-love-is-war-kaguyasama-love-is-war-booster-box'),
  'weissschwarz_cards',
  { 962780: 'kaguya-sama-love-is-war-kaguyasama-love-is-war-booster-box' });

await check('a genuinely new lone record, stored nowhere, still takes the bare slug',
  [{ id: 777777 }], base('brand-new-lone'), 'weissschwarz_cards',
  { 777777: 'brand-new-lone' });

await check('FALSE POSITIVE GUARD: a slug ending in its own id BY COINCIDENCE (card number '
  + '105/124, row id 124) is not treated as suffixed and gains no second suffix',
  [{ id: 124 }], base(PKM_COINCIDENCE), 'pokemon_cards',
  { 124: PKM_COINCIDENCE });

// RULE 3 must never be able to break a sync. If its scan fails, behaviour degrades to exactly
// what this module did before C3L-56 rather than throwing, because 31 sync functions import it.
failScanFor = 'buddyfight_cards';
await check('RULE 3 FAILS SOFT: a failed scan degrades to the pre-C3L-56 bare-slug behaviour '
  + 'instead of throwing',
  [{ id: 424242 }], base('scan-failed-base'), 'buddyfight_cards',
  { 424242: 'scan-failed-base' });
failScanFor = null;

// Cost: the scan is cached per table for the run, so many per-set calls pay for one scan.
const scansBefore = scans;
for (let i = 0; i < 5; i++) {
  await assignStableSlugs({
    items: [{ id: 985672 }], baseSlugFor: base(WS_ORPHAN_1),
    table: 'weissschwarz_cards', supabaseUrl: 'https://x', serviceKey: 'k'
  });
}
const cached = scans === scansBefore;
console.log((cached ? 'PASS  ' : 'FAIL  ') + 'RULE 3 scan is cached across per-set calls ('
  + (scans - scansBefore) + ' extra scans across 5 calls)');
cached ? pass++ : fail++;

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
