// Run this from C:\Users\sgyim\c3-website
// node fix.js

const fs = require('fs');
const path = 'netlify/functions/card-compare.mjs';
let content = fs.readFileSync(path, 'utf8');

const changes = [];

// Fix 1: Replace clickAttr line with canAdd
const old1 = `    const clickAttr = (inCompare || full) ? '' : ' onclick="addCard(\\'' + card.game + '\\',\\'' + card.slug + '\\')" onkeydown="if(event.key===\\'Enter\\')addCard(\\'' + card.game + '\\',\\'' + card.slug + '\\')"';`;
const new1 = `    const canAdd = !inCompare && !full;`;
if (content.includes(old1)) {
  content = content.replace(old1, new1);
  changes.push('Fix 1: clickAttr -> canAdd');
} else {
  console.log('Fix 1 pattern not found - showing line 751:');
  console.log(content.split('\n')[750]);
}

// Fix 2: Replace clickAttr usage with data attributes
const old2 = `    return '<div class="result-item" tabindex="0" role="option" aria-selected="false"' + clickAttr + '>' +`;
const new2 = `    return '<div class="result-item" tabindex="0" role="option" aria-selected="false"' + (canAdd ? ' data-game="' + card.game + '" data-slug="' + card.slug + '"' : ' data-disabled="true"') + '>' +`;
if (content.includes(old2)) {
  content = content.replace(old2, new2);
  changes.push('Fix 2: clickAttr usage -> data attributes');
} else {
  console.log('Fix 2 pattern not found');
}

// Fix 3: Replace version-item onclick with data attributes
const old3 = `      '<div class="version-item" onclick="switchVersion(\\'' + game + '\\',\\'' + v.slug + '\\',' + slotIdx + ')" tabindex="0" onkeydown="if(event.key===\\'Enter\\')switchVersion(\\'' + game + '\\',\\'' + v.slug + '\\',' + slotIdx + ')">' +`;
const new3 = `      '<div class="version-item" data-game="' + game + '" data-slug="' + v.slug + '" data-slot="' + slotIdx + '" tabindex="0">' +`;
if (content.includes(old3)) {
  content = content.replace(old3, new3);
  changes.push('Fix 3: version-item onclick -> data attributes');
} else {
  console.log('Fix 3 not found - showing line 791:');
  console.log(content.split('\n')[790]);
}

// Fix 4: Add click delegation handlers
const old4 = `  // Versions button delegation (replaces fragile inline onclick)\n  const vBtn = e.target.closest('.slot-versions-btn');`;
const new4 = `  // Result item click - add card to compare
  const resultItem = e.target.closest('.result-item[data-game]');
  if (resultItem && !resultItem.dataset.disabled) {
    addCard(resultItem.dataset.game, resultItem.dataset.slug);
  }
  // Version item click - switch version in slot
  const versionItem = e.target.closest('.version-item[data-game]');
  if (versionItem) {
    switchVersion(versionItem.dataset.game, versionItem.dataset.slug, parseInt(versionItem.dataset.slot, 10));
  }
  // Versions button delegation (replaces fragile inline onclick)
  const vBtn = e.target.closest('.slot-versions-btn');`;
if (content.includes(old4)) {
  content = content.replace(old4, new4);
  changes.push('Fix 4: click delegation added');
} else {
  console.log('Fix 4 not found');
}

// Fix 5: Add Enter key handler to handleSearchKey
const old5 = `  else if (e.key === 'Escape') { if (el) el.style.display = 'none'; searchIndex = -1; }\n}`;
const new5 = `  else if (e.key === 'Escape') { if (el) el.style.display = 'none'; searchIndex = -1; }
  else if (e.key === 'Enter') { const focused = el ? el.querySelector('.result-item:focus') : null; if (focused && focused.dataset.game) addCard(focused.dataset.game, focused.dataset.slug); }
}`;
if (content.includes(old5)) {
  content = content.replace(old5, new5);
  changes.push('Fix 5: Enter key handler added');
} else {
  console.log('Fix 5 not found');
}

fs.writeFileSync(path, content, 'utf8');
console.log('\nApplied ' + changes.length + ' fixes:');
changes.forEach(c => console.log('  - ' + c));
console.log('\nVerify with:');
console.log('  git diff netlify/functions/card-compare.mjs');
