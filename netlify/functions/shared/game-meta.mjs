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

export const FOLLOW_GAMES   = new Set(Object.keys(GAME_META));
export const GAME_TABLES    = Object.fromEntries(Object.entries(GAME_META).map(([g, m]) => [g, m[0]]));
export const GAME_IMAGE_COL = Object.fromEntries(Object.entries(GAME_META).map(([g, m]) => [g, m[1]]));
export const GAME_LABELS    = Object.fromEntries(Object.entries(GAME_META).map(([g, m]) => [g, m[2]]));
