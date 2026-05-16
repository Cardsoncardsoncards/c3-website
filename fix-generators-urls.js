// fix-generators-urls.js
// Run from repo root: node fix-generators-urls.js
const fs = require('fs');
const path = 'src/generators.html';
let content = fs.readFileSync(path, 'utf8');
const changes = [];

// Fix 1: c.cardUrl -> c.path (API returns path not cardUrl)
const old1 = '<a href="${c.cardUrl}" class="btn-view"';
const new1 = '<a href="${c.path || \'#\'}" class="btn-view"';
if (content.includes(old1)) {
  content = content.replace(old1, new1);
  changes.push('Fix 1: c.cardUrl -> c.path');
} else {
  console.log('Fix 1 not found, checking variants...');
  const idx = content.indexOf('cardUrl');
  if (idx !== -1) console.log('Context:', content.slice(idx-20, idx+60));
}

// Fix 2: c.ebayUrl -> build from card name and game
// The API doesn't return ebayUrl - build it from c.name and c.game
const old2 = '<a href="${c.ebayUrl}" target="_blank" rel="noopener sponsored" class="btn-ebay"';
const new2 = '<a href="${\'https://www.ebay.com.au/sch/i.html?_nkw=\' + encodeURIComponent(c.name + \' \' + c.game) + \'&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=5339146789&customid=generators&toolid=10001&mkevt=1\'}" target="_blank" rel="noopener sponsored" class="btn-ebay"';
if (content.includes(old2)) {
  content = content.replace(old2, new2);
  changes.push('Fix 2: c.ebayUrl -> built eBay search URL with campid');
} else {
  console.log('Fix 2 not found, checking variants...');
  const idx = content.indexOf('ebayUrl');
  if (idx !== -1) console.log('Context:', content.slice(idx-20, idx+80));
}

fs.writeFileSync(path, content, 'utf8');
console.log('\nApplied ' + changes.length + ' fixes:');
changes.forEach(c => console.log('  - ' + c));
console.log('\nVerify with:');
console.log('  findstr /n "cardUrl ebayUrl c.path" src\\generators.html');
