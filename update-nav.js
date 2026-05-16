// update-nav.js
// Run from repo root: node update-nav.js
// Updates nav on all static HTML pages to the new 7-item coloured nav

const fs = require('fs');
const path = require('path');

const NAV_CSS = `
/* ===== C3 SHARED NAV CSS ===== */
.nav-inner{display:flex;align-items:center;justify-content:space-between;max-width:1140px;margin:0 auto;padding:0 20px;gap:12px;flex-wrap:nowrap}
.nav-logo{display:flex;align-items:center;gap:9px;font-family:'Cinzel',serif;font-size:11.5px;font-weight:700;letter-spacing:.12em;color:#C9A84C;text-decoration:none;text-transform:uppercase;white-space:nowrap;flex-shrink:0}
.nav-logo img{height:32px;width:32px;border-radius:6px;object-fit:cover;flex-shrink:0}
.nav-links{display:flex;gap:3px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
.nav-links::-webkit-scrollbar{display:none}
.nav-link{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;transition:all .2s;border:1px solid #1e2235;color:#A0A8C0;white-space:nowrap;flex-shrink:0}
.nav-link:hover{color:#F0F2FF;text-decoration:none}
.nav-link--vault{color:#C9A84C;border-color:rgba(201,168,76,.35)}
.nav-link--vault:hover,.nav-link--vault.active{background:rgba(201,168,76,.1);border-color:#C9A84C;color:#E8C86A}
.nav-link--compare{color:#A78BFA;border-color:rgba(167,139,250,.35)}
.nav-link--compare:hover,.nav-link--compare.active{background:rgba(167,139,250,.1);border-color:#A78BFA;color:#C4B5FD}
.nav-link--market{color:#4ADE80;border-color:rgba(74,222,128,.35)}
.nav-link--market:hover,.nav-link--market.active{background:rgba(74,222,128,.1);border-color:#4ADE80;color:#86EFAC}
.nav-link--tools{color:#FB923C;border-color:rgba(251,146,60,.35)}
.nav-link--tools:hover,.nav-link--tools.active{background:rgba(251,146,60,.1);border-color:#FB923C;color:#FDBA74}
.nav-link--play{color:#F472B6;border-color:rgba(244,114,182,.35)}
.nav-link--play:hover,.nav-link--play.active{background:rgba(244,114,182,.1);border-color:#F472B6;color:#F9A8D4}
.nav-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.35)}
.nav-link--blog:hover,.nav-link--blog.active{background:rgba(126,203,161,.1);border-color:#7ECBA1;color:#A5DFC0}
.nav-link--ebay{color:#60A5FA;border-color:rgba(96,165,250,.35);background:rgba(96,165,250,.05)}
.nav-link--ebay:hover{background:rgba(96,165,250,.12);border-color:#60A5FA;color:#93C5FD}`;

// New nav HTML - active class set per page below
const buildNav = (activePage) => {
  const links = [
    { href: '/cards',   cls: 'vault',   label: 'Card Vault' },
    { href: '/compare', cls: 'compare', label: 'Compare' },
    { href: '/market',  cls: 'market',  label: 'Market' },
    { href: '/tools',   cls: 'tools',   label: 'Tools' },
    { href: '/play',    cls: 'play',    label: 'Play' },
    { href: '/blog',    cls: 'blog',    label: 'Blog' },
  ];
  const ebay = `<a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=5339146789&customid=C3Nav&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="nav-link nav-link--ebay">Shop eBay &#8599;</a>`;
  const linkHtml = links.map(l => {
    const active = l.cls === activePage ? ' active' : '';
    return `<a href="${l.href}" class="nav-link nav-link--${l.cls}${active}">${l.label}</a>`;
  }).join('\n      ');
  return `<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo">
      <img src="/c3logo.png" alt="C3 Logo" style="height:32px;width:32px;border-radius:6px;object-fit:cover;flex-shrink:0;">
      <span>Cards on Cards on Cards</span>
    </a>
    <div class="nav-links">
      ${linkHtml}
      ${ebay}
    </div>
  </div>
</nav>`;
};

// Files to update: [filepath, activePage]
const FILES = [
  ['src/contact.html',      ''],
  ['src/legal.html',        ''],
  ['src/ev-calculator.html','tools'],
  ['src/tracker.html',      'tools'],
  ['src/calendar.html',     'play'],
  ['src/generators.html',   'play'],
  ['src/quizzes.html',      'play'],
  ['src/vip.html',          ''],
  ['src/shop.html',         ''],
  ['src/cards.html',        'vault'],
];

let updated = 0;
let skipped = 0;

for (const [file, activePage] of FILES) {
  if (!fs.existsSync(file)) {
    console.log(`SKIP (not found): ${file}`);
    skipped++;
    continue;
  }

  let content = fs.readFileSync(file, 'utf8');

  // Step 1: Replace all existing nav HTML blocks
  // Match from <nav> to </nav> (first occurrence)
  const navStart = content.indexOf('<nav>');
  const navEnd = content.indexOf('</nav>');
  if (navStart === -1 || navEnd === -1) {
    console.log(`SKIP (no nav found): ${file}`);
    skipped++;
    continue;
  }
  const newNavHtml = buildNav(activePage);
  content = content.slice(0, navStart) + newNavHtml + content.slice(navEnd + 6);

  // Step 2: Inject nav CSS into <style> block, replacing any existing nav CSS section
  // Find the style block and insert/replace nav CSS
  const styleEnd = content.indexOf('</style>');
  if (styleEnd !== -1) {
    // Remove old nav colour classes to avoid duplication
    const navCssMarker = '/* ===== C3 SHARED NAV CSS =====';
    const existingNavCss = content.indexOf(navCssMarker);
    if (existingNavCss !== -1) {
      // Already has nav CSS — remove it first
      const endMarker = content.indexOf('/* =====', existingNavCss + 10);
      if (endMarker !== -1) {
        content = content.slice(0, existingNavCss) + content.slice(endMarker);
      }
    }
    // Inject before </style>
    const newStyleEnd = content.indexOf('</style>');
    content = content.slice(0, newStyleEnd) + NAV_CSS + '\n' + content.slice(newStyleEnd);
  }

  // Step 3: Update footer to new 7-link format
  const footerStart = content.indexOf('<footer>');
  const footerEnd = content.indexOf('</footer>');
  if (footerStart !== -1 && footerEnd !== -1) {
    const newFooter = `<footer>
  <div style="text-align:center;padding:28px 24px;border-top:1px solid #1e2235;font-size:12px;color:#7a8099">
    <p>
      <a href="/" style="color:#7a8099;margin:0 8px;text-decoration:none">Home</a>
      <a href="/cards" style="color:#C9A84C;margin:0 8px;text-decoration:none">Card Vault</a>
      <a href="/compare" style="color:#A78BFA;margin:0 8px;text-decoration:none">Compare</a>
      <a href="/market" style="color:#4ADE80;margin:0 8px;text-decoration:none">Market</a>
      <a href="/tools" style="color:#FB923C;margin:0 8px;text-decoration:none">Tools</a>
      <a href="/play" style="color:#F472B6;margin:0 8px;text-decoration:none">Play</a>
      <a href="/blog" style="color:#7ECBA1;margin:0 8px;text-decoration:none">Blog</a>
      <a href="/contact.html" style="color:#7a8099;margin:0 8px;text-decoration:none">Contact</a>
      <a href="/legal.html" style="color:#7a8099;margin:0 8px;text-decoration:none">Legal</a>
      <a href="https://blasdigital.etsy.com" target="_blank" rel="noopener" style="color:#F97316;margin:0 8px;text-decoration:none">D&amp;D Tools on Etsy &#8599;</a>
    </p>
    <p style="margin-top:10px;font-size:11px;opacity:.45">&#169; 2026 Cards on Cards on Cards &middot; cardsoncardsoncards.com.au &middot; Affiliate links may earn a commission at no extra cost to you.</p>
  </div>`;
    content = content.slice(0, footerStart) + newFooter + '\n</footer>' + content.slice(footerEnd + 9);
  }

  fs.writeFileSync(file, content, 'utf8');
  console.log(`UPDATED: ${file} (active: ${activePage || 'none'})`);
  updated++;
}

console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
console.log('\nVerify nav on each file:');
FILES.forEach(([f]) => console.log('  ' + f));
