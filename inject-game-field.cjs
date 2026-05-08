// inject-game-field.cjs
// Run from repo root: node inject-game-field.cjs
// Reads all .md files in src/blog/, infers game from filename, injects game: into frontmatter if missing.

const fs = require('fs');
const path = require('path');

const BLOG_DIR = path.join(__dirname, 'src', 'blog');

const GAME_MAP = [
  { pattern: /pokemon|poke(?!r)/i, game: 'pokemon' },
  { pattern: /lorcana/i, game: 'lorcana' },
  { pattern: /one.?piece|onepiece/i, game: 'one-piece' },
  { pattern: /yu.?gi.?oh|yugioh/i, game: 'yugioh' },
  { pattern: /dragon.?ball|dragonball|dbs/i, game: 'dragon-ball-super' },
  { pattern: /star.?wars|swu/i, game: 'star-wars-unlimited' },
  { pattern: /riftbound/i, game: 'riftbound' },
  { pattern: /mtg|magic|commander|edh|\bstandard\b|\bmodern\b|pioneer|legacy|\bdraft\b|\bsealed\b|booster|set-booster|play-booster|collector-booster|mh3|mh2|dsk|blb|otj|mkm|lci|woe|mom|one|bro|dmu|snc|neo|vow|mid|afr|stx|khm|znr|m21|m20|eld|thb/i, game: 'mtg' },
];

if (!fs.existsSync(BLOG_DIR)) {
  console.error('ERROR: src/blog/ not found. Run this from the repo root.');
  process.exit(1);
}

const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'));
let updated = 0;
let skipped = 0;
let noMatch = [];

for (const file of files) {
  const filePath = path.join(BLOG_DIR, file);
  const content = fs.readFileSync(filePath, 'utf8');

  // Check frontmatter exists
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) {
    console.log(`  [SKIP - no frontmatter] ${file}`);
    skipped++;
    continue;
  }

  // Skip if game: already present
  if (/^game:/m.test(fmMatch[1])) {
    skipped++;
    continue;
  }

  // Infer game from filename
  const basename = path.basename(file, '.md');
  let inferredGame = null;
  for (const { pattern, game } of GAME_MAP) {
    if (pattern.test(basename)) {
      inferredGame = game;
      break;
    }
  }

  if (!inferredGame) {
    noMatch.push(file);
    continue;
  }

  // Inject game: as first field after opening ---
  const newContent = content.replace(/^---\r?\n/, `---\ngame: ${inferredGame}\n`);
  fs.writeFileSync(filePath, newContent, 'utf8');
  updated++;
  console.log(`  [OK] ${file} -> game: ${inferredGame}`);
}

console.log(`\n========================================`);
console.log(`Done.`);
console.log(`  Updated:          ${updated}`);
console.log(`  Already had game: ${skipped}`);
console.log(`  No match (manual): ${noMatch.length}`);
console.log(`========================================`);
if (noMatch.length) {
  console.log('\nFiles needing manual game: assignment:');
  noMatch.forEach(f => console.log('  ' + f));
  console.log('\nAdd one of: mtg, pokemon, lorcana, one-piece, yugioh, dragon-ball-super, star-wars-unlimited, riftbound');
}
