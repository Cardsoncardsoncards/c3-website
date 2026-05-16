// fix-compare-nav-css.js
// Run from repo root: node fix-compare-nav-css.js
const fs = require('fs');
const path = 'netlify/functions/card-compare.mjs';
let content = fs.readFileSync(path, 'utf8');

const anchor = '.nav-link{display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid var(--border);color:var(--text2);white-space:nowrap;transition:all .15s}';

const inject = `
    .nav-link--vault{color:#C9A84C;border-color:rgba(201,168,76,.35)}.nav-link--vault:hover,.nav-link--vault.active{background:rgba(201,168,76,.1);border-color:#C9A84C;color:#E8C86A}
    .nav-link--compare{color:#A78BFA;border-color:rgba(167,139,250,.35)}.nav-link--compare:hover,.nav-link--compare.active{background:rgba(167,139,250,.1);border-color:#A78BFA;color:#C4B5FD}
    .nav-link--market{color:#4ADE80;border-color:rgba(74,222,128,.35)}.nav-link--market:hover,.nav-link--market.active{background:rgba(74,222,128,.1);border-color:#4ADE80;color:#86EFAC}
    .nav-link--tools{color:#FB923C;border-color:rgba(251,146,60,.35)}.nav-link--tools:hover,.nav-link--tools.active{background:rgba(251,146,60,.1);border-color:#FB923C;color:#FDBA74}
    .nav-link--play{color:#F472B6;border-color:rgba(244,114,182,.35)}.nav-link--play:hover,.nav-link--play.active{background:rgba(244,114,182,.1);border-color:#F472B6;color:#F9A8D4}
    .nav-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.35)}.nav-link--blog:hover,.nav-link--blog.active{background:rgba(126,203,161,.1);border-color:#7ECBA1;color:#A5DFC0}
    .nav-link--ebay{color:#60A5FA;border-color:rgba(96,165,250,.35);background:rgba(96,165,250,.05)}.nav-link--ebay:hover{background:rgba(96,165,250,.12);border-color:#60A5FA;color:#93C5FD}`;

if (content.includes(anchor)) {
  content = content.replace(anchor, anchor + inject);
  fs.writeFileSync(path, content, 'utf8');
  console.log('Done. Nav CSS injected after .nav-link base style.');
} else {
  // Try partial match
  const partial = '.nav-link{display:inline-flex;align-items:center;padding:6px 10px';
  const idx = content.indexOf(partial);
  if (idx !== -1) {
    const lineEnd = content.indexOf('}', idx) + 1;
    content = content.slice(0, lineEnd) + inject + content.slice(lineEnd);
    fs.writeFileSync(path, content, 'utf8');
    console.log('Done (partial match). Nav CSS injected.');
  } else {
    console.log('ERROR: anchor not found. Check the .nav-link line manually.');
  }
}
