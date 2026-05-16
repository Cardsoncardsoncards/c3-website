// fix-yugioh-cols.js
// Run from repo root: node fix-yugioh-cols.js
const fs = require('fs');
const file = 'netlify/functions/card-api.mjs';
let c = fs.readFileSync(file, 'utf8');

// Remove 'type' from yugioh extraCols - column doesn't exist in yugioh_cards
const old = `yugioh: { table: 'yugioh_cards', imgCol: 'image_url', priceCol: 'market_price', slugCol: 'slug', nameCol: 'name', extraCols: 'set_name,rarity,type,attribute' },`;
const fix = `yugioh: { table: 'yugioh_cards', imgCol: 'image_url', priceCol: 'market_price', slugCol: 'slug', nameCol: 'name', extraCols: 'set_name,rarity,attribute' },`;

if (c.includes(old)) {
  c = c.replace(old, fix);
  fs.writeFileSync(file, c, 'utf8');
  console.log('FIXED: removed type from yugioh extraCols');
} else {
  console.log('Pattern not found. Current yugioh line:');
  const idx = c.indexOf("yugioh: { table: 'yugioh_cards'");
  if (idx !== -1) console.log(c.slice(idx, idx + 150));
}
