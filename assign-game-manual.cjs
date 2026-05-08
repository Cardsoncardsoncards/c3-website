// assign-game-manual.cjs
// Run from repo root: node assign-game-manual.cjs
// Assigns game: field to the 57 posts that inject-game-field.cjs could not auto-detect.

const fs = require('fs');
const path = require('path');

const BLOG_DIR = path.join(__dirname, 'src', 'blog');

// Manual assignments
// game: tcg = generic multi-game content
// game: dnd = Dungeons and Dragons content
// Specific overrides where auto-detection was wrong
const ASSIGNMENTS = {
  // Generic TCG (accessories, guides, multi-game)
  'p043-best-tcg-card-sleeves-australia.md': 'tcg',
  'p045-which-tcg-to-start-australia.md': 'tcg',
  'p046-how-to-organise-tcg-collection-australia.md': 'tcg',
  'p047-best-tcg-playmat-australia.md': 'tcg',
  'p048-free-tcg-collection-tracker-spreadsheet-australia.md': 'tcg',
  'p049-how-to-buy-tcg-cards-safely-online-australia.md': 'tcg',
  'p050-tcg-card-storage-solutions-australia.md': 'tcg',
  'p062-best-tcg-pre-orders-australia-april-2026.md': 'tcg',
  'p065-upcoming-tcg-releases-australia-april-june-2026.md': 'tcg',
  'p079-tcg-collection-trackers-spreadsheet.md': 'tcg',
  'p081-best-tcg-buylist-prices-australia.md': 'tcg',
  'p082-how-to-compare-tcg-buylist-offers-australia.md': 'tcg',
  'p083-what-is-a-tcg-buylist-australia.md': 'tcg',
  'p093-best-tcg-binders-australia.md': 'tcg',
  'p094-best-tcg-deck-boxes-australia.md': 'tcg',
  'p095-best-tcg-playmats-australia-deep-dive.md': 'tcg',
  'p099-what-is-tcg-buylist-australia.md': 'tcg',
  'p102-how-to-compare-buylist-offers-australia.md': 'tcg',
  'p103-tcg-buylist-aggregator-australia.md': 'tcg',
  'p147-what-is-expected-value-tcg-australia.md': 'tcg',
  'p174-why-you-cant-stop-opening-packs-psychology-tcg.md': 'tcg',
  'p176-best-tcg-for-kids-australia-parents-guide.md': 'tcg',
  'p178-real-cost-selling-cards-ebay-australia.md': 'tcg',
  'p196-tcg-flipping-australia-worth-it-2026.md': 'tcg',
  'p199-best-tcg-two-players-australia-date-night.md': 'tcg',
  'p200-how-to-track-tcg-collection-value-over-time-australia.md': 'tcg',
  'p213-start-family-tcg-collection-without-fortune-australia.md': 'tcg',
  'p220-how-to-find-tcg-group-game-store-australia.md': 'tcg',
  'p222-how-to-value-tcg-collection-insurance-australia.md': 'tcg',
  'p223-cheapest-way-start-each-tcg-australia.md': 'tcg',
  'p226-trading-card-games-focus-anxiety-research-australia.md': 'tcg',
  'p232-tcg-release-calendar-2026-australia.md': 'tcg',
  'p237-tcg-selling-fees-australia.md': 'tcg',
  'p238-tcg-storage-protection-guide-australia.md': 'tcg',
  'p241-how-to-buy-tcg-cards-ebay-australia.md': 'tcg',
  'p247-how-to-prepare-first-tcg-tournament-australia.md': 'tcg',

  // D&D content
  'p066-how-to-start-playing-dnd-australia.md': 'dnd',
  'p067-dnd-dice-buyers-guide-australia.md': 'dnd',
  'p068-dnd-miniatures-guide-australia.md': 'dnd',
  'p069-dnd-starter-sets-australia.md': 'dnd',
  'p070-dnd-core-books-guide-australia.md': 'dnd',
  'p071-dnd-adventure-books-guide-australia.md': 'dnd',
  'p072-dm-screen-guide-australia.md': 'dnd',
  'p073-dnd-battle-mats-guide-australia.md': 'dnd',
  'p074-dnd-storage-bags-australia.md': 'dnd',
  'p075-dnd-board-games-australia.md': 'dnd',
  'p076-free-dm-tools-dnd-australia.md': 'dnd',
  'p077-dnd-tavern-scenes-resources.md': 'dnd',
  'p078-dnd-dungeon-puzzles-traps-guide.md': 'dnd',
  'p096-how-to-find-dnd-group-australia.md': 'dnd',
  'p097-best-dnd-apps-australia.md': 'dnd',
  'p098-best-dnd-campaigns-beginners-australia.md': 'dnd',

  // MTG sets that were missed
  'p188-most-expensive-cards-bloomburrow-australia.md': 'mtg',
  'p214-most-expensive-cards-duskmourn-australia.md': 'mtg',
  'p215-most-expensive-cards-foundations-australia.md': 'mtg',
  'p219-most-expensive-cards-tarkir-dragonstorm-australia.md': 'mtg',

  // Digimon - out of scope, tag as tcg for filtering purposes
  'p242-digimon-card-game-australia-guide.md': 'tcg',

  // Auto-detection wrong - override
  'p028-lorcana-vs-pokemon-australia.md': 'lorcana',
  'p239-riftbound-vs-pokemon-vs-mtg-australia.md': 'riftbound',
};

let updated = 0;
let skipped = 0;
let errors = [];

for (const [filename, game] of Object.entries(ASSIGNMENTS)) {
  const filePath = path.join(BLOG_DIR, filename);

  if (!fs.existsSync(filePath)) {
    console.log(`  [NOT FOUND] ${filename}`);
    errors.push(filename);
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);

  if (!fmMatch) {
    console.log(`  [NO FRONTMATTER] ${filename}`);
    errors.push(filename);
    continue;
  }

  // If game: already present, replace it
  if (/^game:/m.test(fmMatch[1])) {
    const newContent = content.replace(/^game:.*$/m, `game: ${game}`);
    fs.writeFileSync(filePath, newContent, 'utf8');
    updated++;
    console.log(`  [OVERRIDE] ${filename} -> game: ${game}`);
    continue;
  }

  // Inject game: as first field
  const newContent = content.replace(/^---\r?\n/, `---\ngame: ${game}\n`);
  fs.writeFileSync(filePath, newContent, 'utf8');
  updated++;
  console.log(`  [OK] ${filename} -> game: ${game}`);
}

console.log(`\n========================================`);
console.log(`Done.`);
console.log(`  Updated: ${updated}`);
console.log(`  Errors:  ${errors.length}`);
if (errors.length) {
  console.log('  Error files:');
  errors.forEach(f => console.log('    ' + f));
}
console.log(`========================================`);
