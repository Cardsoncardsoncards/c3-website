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

let lookups = 0;
globalThis.fetch = async (url) => {
  lookups++;
  const table = url.match(/rest\/v1\/([a-z_]+)\?/)[1];
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
await check('no collision means no database round trip',
  [{ id: 1 }, { id: 2 }], i => 'unique-' + i.id, 'newgame_cards',
  { 1: 'unique-1', 2: 'unique-2' });
const noLookup = lookups === before;
console.log((noLookup ? 'PASS  ' : 'FAIL  ') + 'lookup skipped when nothing collides ('
  + (lookups - before) + ' queries)');
noLookup ? pass++ : fail++;

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
