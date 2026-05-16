// update-nav-const.js
// Run from repo root: node update-nav-const.js
// Replaces const NAV template literal in files that use inline-styled nav

const fs = require('fs');

const EPN = '${EPN_CAMPID}';
const EBAY_HREF = `https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN}&customid=C3Nav&toolid=10001&mkevt=1`;

const NEW_NAV = `const NAV = \`<nav style="background:rgba(8,10,15,.97);backdrop-filter:blur(18px);border-bottom:1px solid #1e2235;padding:10px 0;position:sticky;top:0;z-index:100">
  <div style="display:flex;align-items:center;justify-content:space-between;max-width:1140px;margin:0 auto;padding:0 20px;gap:12px;flex-wrap:nowrap">
    <a href="/" style="display:flex;align-items:center;gap:9px;font-family:'Cinzel',serif;font-size:11.5px;font-weight:700;letter-spacing:.12em;color:#C9A84C;text-decoration:none;text-transform:uppercase;white-space:nowrap;flex-shrink:0">
      <img src="/c3logo.png" alt="C3" style="height:32px;width:32px;border-radius:6px;object-fit:cover;flex-shrink:0">
      <span>Cards on Cards on Cards</span>
    </a>
    <div style="display:flex;gap:3px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none">
      <a href="/cards" style="display:inline-flex;align-items:center;padding:5px 9px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(201,168,76,.35);color:#C9A84C;white-space:nowrap">Card Vault</a>
      <a href="/compare" style="display:inline-flex;align-items:center;padding:5px 9px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(167,139,250,.35);color:#A78BFA;white-space:nowrap">Compare</a>
      <a href="/market" style="display:inline-flex;align-items:center;padding:5px 9px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(74,222,128,.35);color:#4ADE80;white-space:nowrap">Market</a>
      <a href="/tools" style="display:inline-flex;align-items:center;padding:5px 9px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(251,146,60,.35);color:#FB923C;white-space:nowrap">Tools</a>
      <a href="/play" style="display:inline-flex;align-items:center;padding:5px 9px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(244,114,182,.35);color:#F472B6;white-space:nowrap">Play</a>
      <a href="/blog" style="display:inline-flex;align-items:center;padding:5px 9px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(126,203,161,.35);color:#7ECBA1;white-space:nowrap">Blog</a>
      <a href="${EBAY_HREF}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;padding:5px 9px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(96,165,250,.35);color:#60A5FA;background:rgba(96,165,250,.05);white-space:nowrap">Shop eBay &#8599;</a>
    </div>
  </div>
</nav>\`;`;

const FILES = [
  'netlify/functions/onepiece-card-page.mjs',
  'netlify/functions/riftbound-card-page.mjs',
  'netlify/functions/card-page.mjs',
  'netlify/functions/pokemon-set-page.mjs',
  'netlify/functions/lorcana-set-page.mjs',
  'netlify/functions/yugioh-set-page.mjs',
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

  // Find const NAV = `...`;
  const navStart = content.indexOf('const NAV = `');
  if (navStart === -1) {
    console.log(`SKIP (no const NAV): ${file}`);
    skipped++;
    continue;
  }

  // Find the closing backtick+semicolon of the NAV template literal
  // Search from after the opening backtick
  const openBacktick = navStart + 'const NAV = `'.length - 1; // position of opening backtick
  let navEnd = -1;
  for (let i = openBacktick + 1; i < content.length; i++) {
    if (content[i] === '`' && content[i+1] === ';') {
      navEnd = i + 2; // include the backtick and semicolon
      break;
    }
  }

  if (navEnd === -1) {
    console.log(`SKIP (could not find NAV end): ${file}`);
    skipped++;
    continue;
  }

  content = content.slice(0, navStart) + NEW_NAV + content.slice(navEnd);

  fs.writeFileSync(file, content, 'utf8');
  console.log(`UPDATED: ${file}`);
  updated++;
}

console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
