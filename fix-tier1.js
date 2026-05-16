// fix-tier1.js
// Run from repo root: node fix-tier1.js
// Fixes: index.html nav + mission text, card-page.mjs nav, sitemap-static new pages

const fs = require('fs');
const changes = [];

// ============================================================
// FIX 1: index.html — new nav + mission text
// ============================================================
{
  const file = 'src/index.html';
  let c = fs.readFileSync(file, 'utf8');

  // Replace old nav links block
  const oldNav = `<div class="nav-links">
      <a href="/shop.html" class="nav-link nav-link--shop">Shop</a>
      <a href="/blog" class="nav-link nav-link--blog">Blog</a>
      <a href="/ev-calculator.html" class="nav-link nav-link--ev">EV Calc</a>
      <a href="/tracker.html" class="nav-link nav-link--tracker">Tracker</a>
      <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=5339146789&customid=C3Store&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="nav-link nav-link--ebay">eBay</a>
      <a href="/dnd" class="nav-link nav-link--dnd">D&amp;D Tools <span style="font-size:8px;padding:1px 5px;border-radius:3px;background:rgba(139,92,246,.2);color:#A78BFA;letter-spacing:.05em;margin-left:3px">SOON</span></a>
      <a href="/calendar" class="nav-link nav-link--calendar">Calendar</a>
      <a href="/generators" class="nav-link nav-link--generators">Generators</a>
      <a href="/quizzes" class="nav-link nav-link--quiz">Quizzes</a>
      <a href="/contact.html" class="nav-link nav-link--contact">Contact Us</a>
    </div>`;

  const newNav = `<div class="nav-links">
      <a href="/cards" class="nav-link nav-link--vault">Card Vault</a>
      <a href="/compare" class="nav-link nav-link--compare">Compare</a>
      <a href="/market" class="nav-link nav-link--market">Market</a>
      <a href="/tools" class="nav-link nav-link--tools">Tools</a>
      <a href="/play" class="nav-link nav-link--play">Play</a>
      <a href="/blog" class="nav-link nav-link--blog">Blog</a>
      <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=5339146789&customid=C3Nav&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="nav-link nav-link--ebay">Shop eBay &#8599;</a>
    </div>`;

  if (c.includes(oldNav)) {
    c = c.replace(oldNav, newNav);
    changes.push('index.html: nav updated to 7-item coloured nav');
  } else {
    console.log('WARN: index.html old nav not found exactly - checking partial');
    if (c.includes('nav-link--generators')) {
      console.log('  Old generators link found - manual check needed');
    }
  }

  // Add nav CSS colour classes - inject after existing .nav-link--active rule
  const navCssAnchor = '.nav-link--active{color:#E8C86A!important;border-color:#C9A84C!important;background:rgba(201,168,76,.10)!important}';
  const navColourCss = `
.nav-link--vault{color:#C9A84C;border-color:rgba(201,168,76,.35)}.nav-link--vault:hover,.nav-link--vault.active{background:rgba(201,168,76,.1);border-color:#C9A84C;color:#E8C86A}
.nav-link--compare{color:#A78BFA;border-color:rgba(167,139,250,.35)}.nav-link--compare:hover,.nav-link--compare.active{background:rgba(167,139,250,.1);border-color:#A78BFA;color:#C4B5FD}
.nav-link--market{color:#4ADE80;border-color:rgba(74,222,128,.35)}.nav-link--market:hover,.nav-link--market.active{background:rgba(74,222,128,.1);border-color:#4ADE80;color:#86EFAC}
.nav-link--tools{color:#FB923C;border-color:rgba(251,146,60,.35)}.nav-link--tools:hover,.nav-link--tools.active{background:rgba(251,146,60,.1);border-color:#FB923C;color:#FDBA74}
.nav-link--play{color:#F472B6;border-color:rgba(244,114,182,.35)}.nav-link--play:hover,.nav-link--play.active{background:rgba(244,114,182,.1);border-color:#F472B6;color:#F9A8D4}`;

  if (c.includes(navCssAnchor) && !c.includes('.nav-link--vault{color:#C9A84C')) {
    c = c.replace(navCssAnchor, navCssAnchor + navColourCss);
    changes.push('index.html: nav colour CSS injected');
  }

  // Fix mission text
  const oldMission = `We manually confirm every product on amazon.com.au before it goes live. <strong>We found them so you don't have to.</strong> Every click earns a small commission that keeps the site running &#8212; at no extra cost to you.`;
  const newMission = `We help TCG players across Australia find the cards and products they are looking for, on eBay, Amazon, and beyond. When you buy through our links, a small commission comes back to C3 at no extra cost to you. That is how we keep the prices updated, the data live, and the tools free.`;

  if (c.includes(oldMission)) {
    c = c.replace(oldMission, newMission);
    changes.push('index.html: mission text updated (removed Amazon-specific wording)');
  } else {
    console.log('WARN: index.html mission text not found exactly');
  }

  // Update footer to match new nav pattern
  const oldFooterEtsy = `<a href="https://blasdigital.etsy.com" target="_blank" rel="noopener" class="footer-link">Etsy D&amp;D Tools</a>`;
  const newFooterLinks = `<a href="/cards" class="footer-link" style="color:#C9A84C">Card Vault</a>
      <a href="/compare" class="footer-link" style="color:#A78BFA">Compare</a>
      <a href="/market" class="footer-link" style="color:#4ADE80">Market</a>
      <a href="/tools" class="footer-link" style="color:#FB923C">Tools</a>
      <a href="/play" class="footer-link" style="color:#F472B6">Play</a>
      <a href="/blog" class="footer-link" style="color:#7ECBA1">Blog</a>
      <a href="/contact.html" class="footer-link">Contact</a>
      <a href="/legal.html" class="footer-link">Legal</a>
      <a href="https://blasdigital.etsy.com" target="_blank" rel="noopener" class="footer-link" style="color:#F97316">D&amp;D Tools on Etsy &#8599;</a>`;

  if (c.includes(oldFooterEtsy)) {
    c = c.replace(oldFooterEtsy, newFooterLinks);
    changes.push('index.html: footer links updated with colours');
  }

  fs.writeFileSync(file, c, 'utf8');
}

// ============================================================
// FIX 2: card-page.mjs — replace old minimal nav
// ============================================================
{
  const file = 'netlify/functions/card-page.mjs';
  let c = fs.readFileSync(file, 'utf8');

  const EPN = '${EPN_CAMPID}';
  const EBAY = `https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN}&customid=C3Nav&toolid=10001&mkevt=1`;

  const oldNav = `<nav class="site-nav">
  <a href="/" class="logo">C3</a>
  <a href="/">Home</a>
  <a href="/shop.html">Shop</a>
  <a href="/blog">Blog</a>
  <a href="/ev-calculator.html">EV Calculator</a>
  <a href="/cards/mtg">MTG Cards</a>
  <a href="/cards/mtg/random-commander">Random Commander</a>
  <a href="/tracker.html">Free Tracker</a>
</nav>`;

  const newNav = `<nav style="background:rgba(8,10,15,.97);backdrop-filter:blur(18px);border-bottom:1px solid #1e2235;padding:10px 0;position:sticky;top:0;z-index:100">
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
      <a href="${EBAY}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;padding:5px 9px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(96,165,250,.35);color:#60A5FA;background:rgba(96,165,250,.05);white-space:nowrap">Shop eBay &#8599;</a>
    </div>
  </div>
</nav>`;

  // Handle CRLF line endings
  const oldNavCRLF = oldNav.replace(/\n/g, '\r\n');
  if (c.includes(oldNavCRLF)) {
    c = c.replace(oldNavCRLF, newNav);
    changes.push('card-page.mjs: old minimal nav replaced with 7-item coloured nav');
  } else if (c.includes(oldNav)) {
    c = c.replace(oldNav, newNav);
    changes.push('card-page.mjs: old minimal nav replaced (LF)');
  } else {
    console.log('WARN: card-page.mjs old nav not found exactly');
  }

  fs.writeFileSync(file, c, 'utf8');
}

// ============================================================
// FIX 3: sitemap-static.mjs — add /tools and /play
// ============================================================
{
  const file = 'netlify/functions/sitemap-static.mjs';
  if (fs.existsSync(file)) {
    let c = fs.readFileSync(file, 'utf8');
    const anchor = `{ path: '/dnd',`;
    const newEntries = `{ path: '/tools',               priority: '0.8', changefreq: 'weekly'  },
  { path: '/play',                priority: '0.8', changefreq: 'weekly'  },
  { path: '/dnd',`;
    if (!c.includes("path: '/tools'") && c.includes(anchor)) {
      c = c.replace(anchor, newEntries);
      fs.writeFileSync(file, c, 'utf8');
      changes.push('sitemap-static.mjs: /tools and /play added');
    } else if (c.includes("path: '/tools'")) {
      changes.push('sitemap-static.mjs: already has /tools (skipped)');
    } else {
      console.log('WARN: sitemap-static.mjs anchor not found');
    }
  } else {
    console.log('WARN: sitemap-static.mjs not found');
  }
}

console.log('\nApplied ' + changes.length + ' fixes:');
changes.forEach(c => console.log('  - ' + c));
console.log('\nVerify:');
console.log('  findstr /n "nav-link--vault nav-link--play" src\\index.html');
console.log('  findstr /n "Card Vault" netlify\\functions\\card-page.mjs');
