// fix-generators.js
// Run from repo root: node fix-generators.js
// Fixes two field name bugs in src/generators.html

const fs = require('fs');
const path = 'src/generators.html';
let content = fs.readFileSync(path, 'utf8');
const changes = [];

// Fix 1: image field — API returns c.image not c.image_url
const old1a = 'const imgHtml = c.image_url';
const new1a = 'const imgHtml = c.image';
if (content.includes(old1a)) {
  content = content.replace(old1a, new1a);
  changes.push('Fix 1a: imgHtml condition c.image_url -> c.image');
} else { console.log('Fix 1a not found'); }

const old1b = '? `<img src="${c.image_url}"';
const new1b = '? `<img src="${c.image}"';
if (content.includes(old1b)) {
  content = content.replace(old1b, new1b);
  changes.push('Fix 1b: img src c.image_url -> c.image');
} else { console.log('Fix 1b not found'); }

// Fix 2: price field — API returns c.price_aud not c.priceDisplay
const old2 = '${c.priceDisplay}';
const new2 = '${c.price_aud ? \'AU$\' + parseFloat(c.price_aud).toFixed(2) : \'Price TBC\'}';
if (content.includes(old2)) {
  content = content.replace(old2, new2);
  changes.push('Fix 2: c.priceDisplay -> formatted c.price_aud');
} else { console.log('Fix 2 not found'); }

fs.writeFileSync(path, content, 'utf8');
console.log('\nApplied ' + changes.length + ' fixes:');
changes.forEach(c => console.log('  - ' + c));
console.log('\nVerify with:');
console.log('  findstr /n "c.image c.price_aud priceDisplay" src\\generators.html');
