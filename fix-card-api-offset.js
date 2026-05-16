// fix-card-api-offset.js
// Run from repo root: node fix-card-api-offset.js
const fs = require('fs');
const file = 'netlify/functions/card-api.mjs';
let c = fs.readFileSync(file, 'utf8');

const old = `  // Use offset randomisation - get a random page from the first 10000 cards with images
  const offset = Math.floor(Math.random() * (9000 - limit));`;

const fix = `  // Per-game max offset to avoid exceeding row count on smaller tables
  const GAME_MAX_OFFSET = { mtg: 9000, pokemon: 9000, yugioh: 9000, lorcana: 3000, onepiece: 6000, dragonball: 4000, starwars: 3500, riftbound: 1000 };
  const maxOffset = (GAME_MAX_OFFSET[game] || 9000) - limit;
  const offset = Math.floor(Math.random() * maxOffset);`;

// Also handle CRLF
const oldCRLF = old.replace(/\n/g, '\r\n');

if (c.includes(old)) {
  c = c.replace(old, fix);
  fs.writeFileSync(file, c, 'utf8');
  console.log('FIXED: offset cap applied (LF)');
} else if (c.includes(oldCRLF)) {
  c = c.replace(oldCRLF, fix);
  fs.writeFileSync(file, c, 'utf8');
  console.log('FIXED: offset cap applied (CRLF)');
} else {
  console.log('Pattern not found. Current offset line:');
  const idx = c.indexOf('offset = Math.floor');
  if (idx !== -1) console.log(c.slice(idx - 50, idx + 100));
}
