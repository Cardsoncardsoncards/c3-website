// netlify/functions/shared/game-meta.mjs
// task-135: the ONE 32-game map, shared by the follow WRITE path (card-api.mjs) and the follow
// READ / dashboard path (account.mjs's enrichFollows). Previously each kept its own copy, and the
// dashboard's copy only listed the original 7 games, so follows in the other 25 rendered blank
// (task-134). Defining games in one place prevents that drift.
//
// Each entry is [cards table, image column, display label]. Every game uses {game}_cards with an
// image_url column, except MTG (mtg_cards + image_uri_normal). Verified against the live schema:
// all 32 tables carry name, set_name, price_aud, price_change_7d, price_change_30d and the image
// column named here, so the dashboard's enrich SELECT is valid for every game.
export const GAME_META = {
  mtg:               ['mtg_cards',               'image_uri_normal', 'Magic: The Gathering'],
  pokemon:           ['pokemon_cards',           'image_url',        'Pokemon'],
  yugioh:            ['yugioh_cards',            'image_url',        'Yu-Gi-Oh'],
  lorcana:           ['lorcana_cards',           'image_url',        'Lorcana'],
  onepiece:          ['onepiece_cards',          'image_url',        'One Piece'],
  dbsfusionworld:    ['dbsfusionworld_cards',    'image_url',        'Dragon Ball Fusion World'],
  starwars:          ['starwars_cards',          'image_url',        'Star Wars Unlimited'],
  alphaclash:        ['alphaclash_cards',        'image_url',        'Alpha Clash'],
  bakugan:           ['bakugan_cards',           'image_url',        'Bakugan'],
  battlespiritssaga: ['battlespiritssaga_cards', 'image_url',        'Battle Spirits Saga'],
  buddyfight:        ['buddyfight_cards',        'image_url',        'Buddyfight'],
  digimon:           ['digimon_cards',           'image_url',        'Digimon'],
  dragonball:        ['dragonball_cards',        'image_url',        'Dragon Ball Super'],
  dragonballz:       ['dragonballz_cards',       'image_url',        'Dragon Ball Z'],
  finalfantasy:      ['finalfantasy_cards',      'image_url',        'Final Fantasy TCG'],
  forceofwill:       ['forceofwill_cards',       'image_url',        'Force of Will'],
  gateruler:         ['gateruler_cards',         'image_url',        'Gate Ruler'],
  godzilla:          ['godzilla_cards',          'image_url',        'Godzilla'],
  grandarchive:      ['grandarchive_cards',      'image_url',        'Grand Archive'],
  gundam:            ['gundam_cards',            'image_url',        'Gundam'],
  hololive:          ['hololive_cards',          'image_url',        'Hololive'],
  metazoo:           ['metazoo_cards',           'image_url',        'MetaZoo'],
  riftbound:         ['riftbound_cards',         'image_url',        'Riftbound'],
  shadowverse:       ['shadowverse_cards',       'image_url',        'Shadowverse'],
  sorcery:           ['sorcery_cards',           'image_url',        'Sorcery Contested Realm'],
  unionarena:        ['unionarena_cards',        'image_url',        'Union Arena'],
  universus:         ['universus_cards',         'image_url',        'UniVersus'],
  vanguard:          ['vanguard_cards',          'image_url',        'Cardfight Vanguard'],
  warhammer:         ['warhammer_cards',         'image_url',        'Warhammer'],
  weissschwarz:      ['weissschwarz_cards',      'image_url',        'Weiss Schwarz'],
  wixoss:            ['wixoss_cards',            'image_url',        'Wixoss'],
  wow:               ['wow_cards',               'image_url',        'World of Warcraft'],
};

// C3L-183. THE 32 GAMES ABOVE ARE NOT THE GAMES THAT CAN ALERT. Read this before using any
// export in this file to decide whether a follow is offered or honoured.
//
// Three names in this repo sound like they mean "games you can follow" and only one of them
// does. `GAME_META` and `FOLLOW_GAMES` below are all 32 games: that is the set the dashboard
// can RENDER a stored follow for, which is why task-135 built them. `ALERTABLE_GAMES` is the
// 7 games `check-card-follows` can actually evaluate and email on. There is also a THIRD
// thing called `GAME_TABLES`: the one exported here is all 32, and `check-card-follows.mjs`
// used to define its own unrelated 7-game constant under the SAME NAME. That collision is
// what this constant exists to end, so that file now derives its maps from here.
//
// The gap this closes: `follow-block.mjs` rendered a follow button on all 32 card pages while
// only these 7 could ever produce an alert, and neither the button nor `applyFollow()`
// checked. A weissschwarz follow (id 7) was accepted, confirmed and then skipped silently
// every night. See C3L-183.
//
// ADDING A GAME HERE IS NOT A ONE-LINE CHANGE and must not be done to "fix" a missing button.
// A game only belongs in this set once its price-change columns are proven trustworthy enough
// to email a stranger about. That audit is the separate open item C3L-184, and it is the work
// this constant deliberately defers rather than pretends to have done.
export const ALERTABLE_GAMES = new Set([
  'mtg', 'pokemon', 'lorcana', 'onepiece', 'yugioh', 'dbsfusionworld', 'starwars'
]);

// C3L-185: FOLLOW_GAMES now has ZERO callers, and its name is actively dangerous. It reads as
// "the games you can follow" and it is all 32. Its only ever use was the follow-creation guard
// in card-api.mjs, which is exactly the one job it was wrong for: it rejected a nonsense game
// and accepted weissschwarz, which is how follow id 7 came to exist. That call site now uses
// ALERTABLE_GAMES. Kept rather than deleted because removing an export is a separate decision,
// NOT because anything needs it. Do not reach for this to gate a follow. If you want "every
// game that has a card page", say Object.keys(GAME_META) and mean it.
export const FOLLOW_GAMES   = new Set(Object.keys(GAME_META));
export const GAME_TABLES    = Object.fromEntries(Object.entries(GAME_META).map(([g, m]) => [g, m[0]]));
export const GAME_IMAGE_COL = Object.fromEntries(Object.entries(GAME_META).map(([g, m]) => [g, m[1]]));
export const GAME_LABELS    = Object.fromEntries(Object.entries(GAME_META).map(([g, m]) => [g, m[2]]));

// task-153: which column identifies ONE PRINTING in each game's cards table.
//
// This is the second place MTG is the exception, and for the same underlying reason as the
// image column above. Checked against the live schema before writing it, not assumed:
//   - scryfall_id exists on mtg_cards and on NO other table. It is unique and non-null across
//     all 98,370 rows.
//   - tcgplayer_id exists on all 32 tables and is unique and non-null on every one of them.
// So MTG keys printings by scryfall_id and the other 31 by tcgplayer_id. mtg_cards does carry
// a tcgplayer_id too, but it is NOT used here: Scryfall's tcgplayer_id is per TCGplayer
// product, so separate printings can share one, which is exactly the ambiguity being removed.
//
// Why this matters for only one game: MTG slugs are name-level (98,370 printings under 33,913
// slugs), while all 31 other games have zero duplicate slugs, so for them the slug already
// identifies the printing and printing_id is belt-and-braces. Storing it for every game
// anyway keeps one read path instead of an MTG branch in every consumer.
export const GAME_PRINTING_COL = Object.fromEntries(
  Object.keys(GAME_META).map(g => [g, g === 'mtg' ? 'scryfall_id' : 'tcgplayer_id'])
);
