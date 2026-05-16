// fix-nav-css-all.js
// Run from repo root: node fix-nav-css-all.js
// Injects nav colour CSS into any function file that has nav-link HTML but no nav-link--vault CSS
const fs = require('fs');

const NAV_COLOUR_CSS = `
    .nav-link--vault{color:#C9A84C;border-color:rgba(201,168,76,.35)}.nav-link--vault:hover,.nav-link--vault.active{background:rgba(201,168,76,.1);border-color:#C9A84C;color:#E8C86A}
    .nav-link--compare{color:#A78BFA;border-color:rgba(167,139,250,.35)}.nav-link--compare:hover,.nav-link--compare.active{background:rgba(167,139,250,.1);border-color:#A78BFA;color:#C4B5FD}
    .nav-link--market{color:#4ADE80;border-color:rgba(74,222,128,.35)}.nav-link--market:hover,.nav-link--market.active{background:rgba(74,222,128,.1);border-color:#4ADE80;color:#86EFAC}
    .nav-link--tools{color:#FB923C;border-color:rgba(251,146,60,.35)}.nav-link--tools:hover,.nav-link--tools.active{background:rgba(251,146,60,.1);border-color:#FB923C;color:#FDBA74}
    .nav-link--play{color:#F472B6;border-color:rgba(244,114,182,.35)}.nav-link--play:hover,.nav-link--play.active{background:rgba(244,114,182,.1);border-color:#F472B6;color:#F9A8D4}
    .nav-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.35)}.nav-link--blog:hover,.nav-link--blog.active{background:rgba(126,203,161,.1);border-color:#7ECBA1;color:#A5DFC0}
    .nav-link--ebay{color:#60A5FA;border-color:rgba(96,165,250,.35);background:rgba(96,165,250,.05)}.nav-link--ebay:hover{background:rgba(96,165,250,.12);border-color:#60A5FA;color:#93C5FD}`;

// All function files that have nav-link classes
const files = fs.readdirSync('netlify/functions').filter(f => f.endsWith('.mjs'));

let fixed = 0;
let alreadyOk = 0;
let skipped = 0;

for (const fname of files) {
  const fpath = 'netlify/functions/' + fname;
  const content = fs.readFileSync(fpath, 'utf8');

  // Skip if already has colour CSS
  if (content.includes('.nav-link--vault{') || content.includes('.nav-link--vault {')) {
    alreadyOk++;
    continue;
  }

  // Skip if no nav-link--vault HTML either (nav not updated yet)
  if (!content.includes('nav-link--vault')) {
    skipped++;
    continue;
  }

  // Find the .nav-link base style and inject after it
  const partial = '.nav-link{';
  const idx = content.indexOf(partial);
  if (idx === -1) {
    console.log(`SKIP (no .nav-link base): ${fname}`);
    skipped++;
    continue;
  }

  const lineEnd = content.indexOf('}', idx) + 1;
  const newContent = content.slice(0, lineEnd) + NAV_COLOUR_CSS + content.slice(lineEnd);
  fs.writeFileSync(fpath, newContent, 'utf8');
  console.log(`FIXED: ${fname}`);
  fixed++;
}

console.log(`\nDone. Fixed: ${fixed}, Already OK: ${alreadyOk}, Skipped: ${skipped}`);
