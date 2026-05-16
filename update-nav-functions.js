// update-nav-functions.js
// Run from repo root: node update-nav-functions.js
// Updates nav HTML in all Netlify function .mjs files to the new 7-item coloured nav

const fs = require('fs');

const EBAY_URL = 'https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=C3Nav&toolid=10001&mkevt=1';

// New nav CSS to inject (replaces old nav colour classes)
const NEW_NAV_CSS = `
    /* === C3 NAV COLOURS === */
    .nav-link--vault{color:#C9A84C;border-color:rgba(201,168,76,.35)}.nav-link--vault:hover,.nav-link--vault.active{background:rgba(201,168,76,.1);border-color:#C9A84C;color:#E8C86A}
    .nav-link--compare{color:#A78BFA;border-color:rgba(167,139,250,.35)}.nav-link--compare:hover,.nav-link--compare.active{background:rgba(167,139,250,.1);border-color:#A78BFA;color:#C4B5FD}
    .nav-link--market{color:#4ADE80;border-color:rgba(74,222,128,.35)}.nav-link--market:hover,.nav-link--market.active{background:rgba(74,222,128,.1);border-color:#4ADE80;color:#86EFAC}
    .nav-link--tools{color:#FB923C;border-color:rgba(251,146,60,.35)}.nav-link--tools:hover,.nav-link--tools.active{background:rgba(251,146,60,.1);border-color:#FB923C;color:#FDBA74}
    .nav-link--play{color:#F472B6;border-color:rgba(244,114,182,.35)}.nav-link--play:hover,.nav-link--play.active{background:rgba(244,114,182,.1);border-color:#F472B6;color:#F9A8D4}
    .nav-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.35)}.nav-link--blog:hover,.nav-link--blog.active{background:rgba(126,203,161,.1);border-color:#7ECBA1;color:#A5DFC0}
    .nav-link--ebay{color:#60A5FA;border-color:rgba(96,165,250,.35);background:rgba(96,165,250,.05)}.nav-link--ebay:hover{background:rgba(96,165,250,.12);border-color:#60A5FA;color:#93C5FD}`;

// New nav HTML links block — activeClass is the class for the active page
const buildNavLinks = (activeClass) => {
  const items = [
    { href: '/cards',   cls: 'vault',   label: 'Card Vault' },
    { href: '/compare', cls: 'compare', label: 'Compare' },
    { href: '/market',  cls: 'market',  label: 'Market' },
    { href: '/tools',   cls: 'tools',   label: 'Tools' },
    { href: '/play',    cls: 'play',    label: 'Play' },
    { href: '/blog',    cls: 'blog',    label: 'Blog' },
  ];
  const links = items.map(item => {
    const active = item.cls === activeClass ? ' active' : '';
    return `      <a href="${item.href}" class="nav-link nav-link--${item.cls}${active}">${item.label}</a>`;
  }).join('\n');
  const ebay = `      <a href="${EBAY_URL}" target="_blank" rel="noopener" class="nav-link nav-link--ebay">Shop eBay &#8599;</a>`;
  return links + '\n' + ebay;
};

// Files: [filename, activeNavClass]
const FILES = [
  // Hub pages
  ['netlify/functions/pokemon-hub.mjs',     'vault'],
  ['netlify/functions/lorcana-hub.mjs',      'vault'],
  ['netlify/functions/onepiece-hub.mjs',     'vault'],
  ['netlify/functions/dragonball-hub.mjs',   'vault'],  // may be dragonball-hub
  ['netlify/functions/starwars-hub.mjs',     'vault'],
  ['netlify/functions/riftbound-hub.mjs',    'vault'],
  ['netlify/functions/yugioh-hub.mjs',       'vault'],  // may not exist
  // Card pages
  ['netlify/functions/card-page.mjs',        'vault'],
  ['netlify/functions/pokemon-card-page.mjs','vault'],
  ['netlify/functions/yugioh-card-page.mjs', 'vault'],
  ['netlify/functions/lorcana-card-page.mjs','vault'],
  ['netlify/functions/onepiece-card-page.mjs','vault'],
  ['netlify/functions/dragonball-card-page.mjs','vault'],
  ['netlify/functions/starwars-card-page.mjs','vault'],
  ['netlify/functions/riftbound-card-page.mjs','vault'],
  // Set pages
  ['netlify/functions/pokemon-set-page.mjs', 'vault'],
  ['netlify/functions/lorcana-set-page.mjs', 'vault'],
  ['netlify/functions/onepiece-set-page.mjs','vault'],
  ['netlify/functions/dragonball-set-page.mjs','vault'],
  ['netlify/functions/starwars-set-page.mjs','vault'],
  ['netlify/functions/riftbound-set-page.mjs','vault'],
  ['netlify/functions/yugioh-set-page.mjs',  'vault'],
  // Other function pages
  ['netlify/functions/card-compare.mjs',     'compare'],
  ['netlify/functions/market-insights.mjs',  'market'],
  ['netlify/functions/card-index.mjs',       'vault'],
];

// Pattern to find old nav links block
// Matches from first <a href="/" class="nav-link to last nav-link closing </a>
const NAV_LINKS_START = `<div class="nav-links">`;
const NAV_LINKS_END = `</div>\n  </div>\n</nav>`;

let updated = 0;
let skipped = 0;

for (const [file, activeClass] of FILES) {
  if (!fs.existsSync(file)) {
    console.log(`SKIP (not found): ${file}`);
    skipped++;
    continue;
  }

  let content = fs.readFileSync(file, 'utf8');

  // Find and replace the nav links block
  const startIdx = content.indexOf(NAV_LINKS_START);
  if (startIdx === -1) {
    console.log(`SKIP (no nav-links found): ${file}`);
    skipped++;
    continue;
  }

  const endIdx = content.indexOf(NAV_LINKS_END, startIdx);
  if (endIdx === -1) {
    console.log(`SKIP (no nav end found): ${file}`);
    skipped++;
    continue;
  }

  const newNavLinks = `<div class="nav-links">\n${buildNavLinks(activeClass)}\n    </div>\n  </div>\n</nav>`;
  content = content.slice(0, startIdx) + newNavLinks + content.slice(endIdx + NAV_LINKS_END.length);

  // Replace old nav CSS colour classes with new ones
  // Find existing nav colour block and replace it
  const oldNavCssPatterns = [
    '.nav-link--home{',
    '.nav-link--vault{color:var(--gold)',
    '.nav-link--shop{',
    '.nav-link--ev{',
    '.nav-link--tracker{',
    '.nav-link--quiz{',
    '.nav-link--calendar{',
    '.nav-link--generators{',
  ];

  // Find the start of the first old nav colour class
  let navCssStart = -1;
  for (const pattern of oldNavCssPatterns) {
    const idx = content.indexOf(pattern);
    if (idx !== -1 && (navCssStart === -1 || idx < navCssStart)) {
      navCssStart = idx;
    }
  }

  if (navCssStart !== -1) {
    // Find the end of nav CSS block (next closing </style> or a non-nav CSS line)
    // Collect all nav colour lines and replace them with new ones
    // Strategy: find the line with .nav-link--home and replace up to .nav-link--ebay
    const ebayIdx = content.indexOf('.nav-link--ebay{', navCssStart);
    if (ebayIdx !== -1) {
      // Find end of the ebay line
      const ebayLineEnd = content.indexOf('\n', ebayIdx + 1);
      // Replace from navCssStart to end of ebay line with new CSS
      content = content.slice(0, navCssStart) + NEW_NAV_CSS.trim() + content.slice(ebayLineEnd);
    }
  }

  fs.writeFileSync(file, content, 'utf8');
  console.log(`UPDATED: ${file}`);
  updated++;
}

console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
