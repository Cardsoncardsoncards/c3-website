// netlify/functions/shared/ws-properties.mjs
// Canonical display names for the 69 Weiss Schwarz licensed properties.
// SINGLE SOURCE OF TRUTH for property naming across the site:
//   - imported at runtime by weissschwarz-hub.mjs (directory) and
//     weissschwarz-property-hub.mjs (property page headers);
//   - used to GENERATE the static Vault grid tiles and disco-strip in
//     src/cards.html (a passthrough file that cannot import at build time).
// Keyed by property slug (== weissschwarz_sets.property).

export const WS_PROPERTY_NAMES = {
  'accel-world': 'Accel World',
  'adventure-time': 'Adventure Time',
  'angel-beats': 'Angel Beats!',
  'arifureta': "Arifureta: From Commonplace to World's Strongest",
  'attack-on-titan': 'Attack on Titan',
  'avatar-last-airbender': 'Avatar: The Last Airbender',
  'ayakashi-triangle': 'Ayakashi Triangle',
  'azur-lane': 'Azur Lane',
  'bang-dream': 'BanG Dream!',
  'batman-ninja': 'Batman Ninja',
  'blue-archive': 'Blue Archive',
  'bocchi-the-rock': 'Bocchi the Rock!',
  'bofuri': "BOFURI: I Don't Want to Get Hurt, so I'll Max Out My Defense.",
  'cardcaptor-sakura': 'Cardcaptor Sakura',
  'chainsaw-man': 'Chainsaw Man',
  'dandadan': 'Dandadan',
  'date-a-live': 'Date A Live',
  'disgaea': 'Disgaea',
  'eminence-in-shadow': 'The Eminence in Shadow',
  'fairy-tail': 'Fairy Tail',
  'fate': 'Fate/stay night',
  'frieren': "Frieren: Beyond Journey's End",
  'fruit-of-grisaia': 'The Fruit of Grisaia',
  'girls-band-cry': 'Girls Band Cry',
  'goblin-slayer': 'Goblin Slayer',
  'guilty-gear': 'Guilty Gear',
  'gurren-lagann': 'Gurren Lagann',
  'haruhi-suzumiya': 'The Melancholy of Haruhi Suzumiya',
  'hatsune-miku': 'Hatsune Miku',
  'hololive': 'Hololive (Weiss Schwarz)',
  'idolmaster': 'THE iDOLM@STER',
  'is-it-wrong-dungeon': 'Is It Wrong to Try to Pick Up Girls in a Dungeon?',
  'jojo-bizarre-adventure': "JoJo's Bizarre Adventure",
  'kaguya-sama': 'Kaguya-sama: Love Is War',
  'kancolle': 'KanColle (Kantai Collection)',
  'kill-la-kill': 'Kill la Kill',
  'konosuba': "KonoSuba: God's Blessing on This Wonderful World!",
  'log-horizon': 'Log Horizon',
  'love-live': 'Love Live!',
  'lycoris-recoil': 'Lycoris Recoil',
  'macross': 'Macross',
  'makeine': 'Makeine: Too Cute Crybaby Girls',
  'miss-kobayashis-dragon-maid': "Miss Kobayashi's Dragon Maid",
  'mob-psycho-100': 'Mob Psycho 100',
  'monogatari': 'Monogatari Series',
  'mushoku-tensei': 'Mushoku Tensei: Jobless Reincarnation',
  'nazarick-overlord': 'Overlord',
  'nikke': 'Goddess of Victory: Nikke',
  'nisekoi': 'Nisekoi',
  'no-game-no-life': 'No Game No Life',
  'oshi-no-ko': 'Oshi no Ko',
  'persona': 'Persona',
  'puella-magi-madoka-magica': 'Puella Magi Madoka Magica',
  'quintessential-quintuplets': 'The Quintessential Quintuplets',
  'rascal-does-not-dream': 'Rascal Does Not Dream of Bunny Girl Senpai',
  'rent-a-girlfriend': 'Rent-A-Girlfriend',
  'revue-starlight': 'Revue Starlight',
  'rezero': 'Re:Zero -Starting Life in Another World-',
  'rurouni-kenshin': 'Rurouni Kenshin',
  'rwby': 'RWBY',
  'saekano': 'Saekano: How to Raise a Boring Girlfriend',
  'seven-deadly-sins': 'The Seven Deadly Sins',
  'shakugan-no-shana': 'Shakugan no Shana',
  'spy-x-family': 'Spy x Family',
  'sword-art-online': 'Sword Art Online',
  'that-time-i-got-reincarnated-as-a-slime': 'That Time I Got Reincarnated as a Slime',
  'to-love-ru': 'To Love Ru',
  'tokyo-revengers': 'Tokyo Revengers',
  'umamusume': 'Umamusume: Pretty Derby',
};

// Returns the canonical display name for a property slug, falling back to
// naive title-case for anything unmapped (e.g. the promo / anthology buckets).
export function wsPropertyLabel(slug) {
  if (WS_PROPERTY_NAMES[slug]) return WS_PROPERTY_NAMES[slug];
  return String(slug || '')
    .split('-')
    .map(w => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ''))
    .join(' ')
    .trim();
}
