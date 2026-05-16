// update-nav-cardpages.js
// Run from repo root: node update-nav-cardpages.js
// Handles card pages and set pages that use a different nav pattern

const fs = require('fs');

const EPN_CAMPID_PLACEHOLDER = '${EPN_CAMPID}';
const EBAY_URL = `https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID_PLACEHOLDER}&customid=C3Nav&toolid=10001&mkevt=1`;

const NEW_NAV_LINKS = `      <a href="/cards" class="nav-link nav-link--vault">Card Vault</a>
      <a href="/compare" class="nav-link nav-link--compare">Compare</a>
      <a href="/market" class="nav-link nav-link--market">Market</a>
      <a href="/tools" class="nav-link nav-link--tools">Tools</a>
      <a href="/play" class="nav-link nav-link--play">Play</a>
      <a href="/blog" class="nav-link nav-link--blog">Blog</a>
      <a href="${EBAY_URL}" target="_blank" rel="noopener" class="nav-link nav-link--ebay">Shop eBay &#8599;</a>`;

const NEW_NAV_CSS = `    .nav-link--vault{color:#C9A84C;border-color:rgba(201,168,76,.35)}.nav-link--vault:hover{background:rgba(201,168,76,.1);border-color:#C9A84C;color:#E8C86A}
    .nav-link--compare{color:#A78BFA;border-color:rgba(167,139,250,.35)}.nav-link--compare:hover{background:rgba(167,139,250,.1);border-color:#A78BFA;color:#C4B5FD}
    .nav-link--market{color:#4ADE80;border-color:rgba(74,222,128,.35)}.nav-link--market:hover{background:rgba(74,222,128,.1);border-color:#4ADE80;color:#86EFAC}
    .nav-link--tools{color:#FB923C;border-color:rgba(251,146,60,.35)}.nav-link--tools:hover{background:rgba(251,146,60,.1);border-color:#FB923C;color:#FDBA74}
    .nav-link--play{color:#F472B6;border-color:rgba(244,114,182,.35)}.nav-link--play:hover{background:rgba(244,114,182,.1);border-color:#F472B6;color:#F9A8D4}
    .nav-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.35)}.nav-link--blog:hover{background:rgba(126,203,161,.1);border-color:#7ECBA1;color:#A5DFC0}
    .nav-link--ebay{color:#60A5FA;border-color:rgba(96,165,250,.35);background:rgba(96,165,250,.05)}.nav-link--ebay:hover{background:rgba(96,165,250,.12);border-color:#60A5FA;color:#93C5FD}`;

const FILES = [
  'netlify/functions/pokemon-card-page.mjs',
  'netlify/functions/yugioh-card-page.mjs',
  'netlify/functions/lorcana-card-page.mjs',
  'netlify/functions/onepiece-card-page.mjs',
  'netlify/functions/starwars-card-page.mjs',
  'netlify/functions/riftbound-card-page.mjs',
  'netlify/functions/card-page.mjs',
  'netlify/functions/pokemon-set-page.mjs',
  'netlify/functions/lorcana-set-page.mjs',
  'netlify/functions/onepiece-set-page.mjs',
  'netlify/functions/dragonball-set-page.mjs',
  'netlify/functions/starwars-set-page.mjs',
  'netlify/functions/riftbound-set-page.mjs',
  'netlify/functions/yugioh-set-page.mjs',
  'netlify/functions/dragonball-card-page.mjs',
];

let updated = 0;
let skipped = 0;

for (const file of FILES) {
  if (!fs.existsSync(file)) {
    console.log(`SKIP (not found): ${file}`);
    skipped++;
    continue;
  }

  let content = fs.readFileSync(file, 'utf8');

  // Find the nav-links div start
  const navLinksStart = content.indexOf('<div class="nav-links">');
  if (navLinksStart === -1) {
    console.log(`SKIP (no nav-links): ${file}`);
    skipped++;
    continue;
  }

  // Find the closing </div> of nav-links — it's the next </div> after the opening
  // We look for </div> that closes the nav-links div
  let depth = 1;
  let i = navLinksStart + '<div class="nav-links">'.length;
  while (i < content.length && depth > 0) {
    if (content.slice(i, i+5) === '<div ') depth++;
    else if (content.slice(i, i+6) === '</div>') { depth--; if (depth === 0) break; }
    i++;
  }

  if (depth !== 0) {
    console.log(`SKIP (could not find nav-links close): ${file}`);
    skipped++;
    continue;
  }

  // Replace content between <div class="nav-links"> and its closing </div>
  const before = content.slice(0, navLinksStart);
  const after = content.slice(i); // starts with </div>
  content = before + '<div class="nav-links">\n' + NEW_NAV_LINKS + '\n    ' + after;

  // Inject new nav CSS — find existing nav link colour lines and replace
  // Look for .nav-link-- patterns and replace the block
  // Strategy: find first .nav-link-- colour definition and last one, replace that range
  const firstNavCss = content.search(/\.nav-link--[a-z]+\{color:/);
  if (firstNavCss !== -1) {
    // Find the last nav-link-- line before </style>
    const styleClose = content.indexOf('</style>', firstNavCss);
    const navCssBlock = content.slice(firstNavCss, styleClose);
    // Replace all .nav-link-- lines
    const lastNavLine = navCssBlock.lastIndexOf('.nav-link--');
    const lastNavLineEnd = navCssBlock.indexOf('\n', lastNavLine) + 1;
    const endOfNavCss = firstNavCss + lastNavLineEnd;
    content = content.slice(0, firstNavCss) + NEW_NAV_CSS + '\n' + content.slice(endOfNavCss);
  }

  fs.writeFileSync(file, content, 'utf8');
  console.log(`UPDATED: ${file}`);
  updated++;
}

console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
