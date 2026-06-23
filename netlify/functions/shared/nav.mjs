// netlify/functions/shared/nav.mjs
// Shared nav for all C3 hub, set-page, and card-page functions.
// Import: import { NAV_CSS, NAV_HTML, navHtml } from './shared/nav.mjs';
// Single source of truth. Update here, deploys everywhere.
// EPN campid: 5339146789 | GA4: G-WR68HPE92S | Amazon tag: blasdigital-22
//
// NAV_HTML  -> generic nav (homepage, tools, generic pages).
// navHtml({ gameLabel, gameHref }) -> same nav with an active per-game link
//   inserted after Card Vault, so hub/set/card pages keep the
//   "which game am I on" indicator when they migrate to this module.
//
// Mobile (<=768px): the desktop link row is hidden and a hamburger button
// opens a right-side slide-out drawer with the same links stacked vertically.

const EPN_CAMPID = '5339146789';

export const NAV_CSS = `
  nav {
    background: rgba(8,10,15,.97);
    border-bottom: 1px solid #1e2235;
    padding: 10px 0;
    position: sticky;
    top: 0;
    z-index: 100;
    backdrop-filter: blur(18px);
  }
  .nav-inner {
    display: flex;
    align-items: center;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
    gap: 8px;
  }
  .nav-logo {
    display: flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
    flex-shrink: 0;
    margin-right: 8px;
  }
  .nav-logo img {
    height: 36px;
    width: 36px;
    border-radius: 8px;
    object-fit: cover;
  }
  .nav-logo-text {
    font-family: Cinzel, serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .1em;
    color: #C9A84C;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .nav-search-wrap {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    max-width: 280px;
  }
  .nav-search-input {
    width: 100%;
    background: rgba(255,255,255,.05);
    border: 1px solid #2d3254;
    border-radius: 6px;
    color: #e8eaf0;
    font-size: 12px;
    padding: 6px 10px;
    outline: none;
  }
  .nav-search-input:focus { border-color: rgba(201,168,76,.5); }
  .nav-search-btn {
    background: rgba(201,168,76,.15);
    border: 1px solid rgba(201,168,76,.3);
    border-radius: 6px;
    color: #C9A84C;
    cursor: pointer;
    font-size: 13px;
    padding: 5px 9px;
    flex-shrink: 0;
  }
  .nav-links {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    flex-shrink: 0;
  }
  .nav-links::-webkit-scrollbar { display: none; }
  .nav-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 9px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    text-decoration: none;
    letter-spacing: .05em;
    text-transform: uppercase;
    border: 1px solid #1e2235;
    color: #A0A8C0;
    white-space: nowrap;
    transition: all .18s;
    flex-shrink: 0;
  }
  .nav-link:hover {
    color: #F0F2FF;
    border-color: #A0A8C0;
    background: rgba(255,255,255,.04);
    text-decoration: none;
  }
  .nav-link--vault  { color:#C9A84C; border-color:rgba(201,168,76,.35); }
  .nav-link--vault:hover  { background:rgba(201,168,76,.08); border-color:#C9A84C; }
  .nav-link--game   { color:#C9A84C; border-color:rgba(201,168,76,.5); background:rgba(201,168,76,.08); }
  .nav-link--game:hover   { background:rgba(201,168,76,.16); border-color:#C9A84C; }
  .nav-link--compare{ color:#A78BFA; border-color:rgba(167,139,250,.35); }
  .nav-link--compare:hover{ background:rgba(167,139,250,.08); border-color:#A78BFA; }
  .nav-link--market { color:#4ADE80; border-color:rgba(74,222,128,.35); }
  .nav-link--market:hover { background:rgba(74,222,128,.08); border-color:#4ADE80; }
  .nav-link--tools  { color:#FB923C; border-color:rgba(251,146,60,.35); }
  .nav-link--tools:hover  { background:rgba(251,146,60,.08); border-color:#FB923C; }
  .nav-link--play   { color:#F472B6; border-color:rgba(244,114,182,.35); }
  .nav-link--play:hover   { background:rgba(244,114,182,.08); border-color:#F472B6; }
  .nav-link--blog   { color:#7ECBA1; border-color:rgba(126,203,161,.35); }
  .nav-link--blog:hover   { background:rgba(126,203,161,.08); border-color:#7ECBA1; }
  .nav-link--subscribe { color:#C9A84C; border-color:rgba(201,168,76,.5);
    background:rgba(201,168,76,.08); }
  .nav-link--subscribe:hover { background:rgba(201,168,76,.18); border-color:#C9A84C; }

  /* Shop dropdown -- click only, no hover */
  .nav-shop-wrap { position: relative; flex-shrink: 0; }
  .nav-shop-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 9px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: .05em;
    text-transform: uppercase;
    border: 1px solid rgba(201,168,76,.35);
    color: #C9A84C;
    background: rgba(201,168,76,.06);
    cursor: pointer;
    white-space: nowrap;
    transition: all .18s;
    user-select: none;
  }
  .nav-shop-btn:hover { background:rgba(201,168,76,.14); border-color:#C9A84C; }
  .nav-shop-arrow { font-size: 9px; transition: transform .2s; }
  .nav-shop-wrap.open .nav-shop-arrow { transform: rotate(180deg); }
  .nav-shop-dropdown {
    display: none;
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    background: #111420;
    border: 1px solid #2d3254;
    border-radius: 8px;
    min-width: 200px;
    z-index: 200;
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0,0,0,.5);
  }
  .nav-shop-wrap.open .nav-shop-dropdown { display: block; }
  .nav-shop-item {
    display: block;
    padding: 11px 16px;
    font-size: 12px;
    font-weight: 600;
    color: #e8eaf0;
    text-decoration: none;
    border-bottom: 1px solid #1e2235;
    transition: background .15s;
  }
  .nav-shop-item:last-child { border-bottom: none; }
  .nav-shop-item:hover { background: rgba(201,168,76,.1); color: #C9A84C;
    text-decoration: none; }
  .nav-shop-item-label { font-size: 10px; color: #9ba3c4; font-weight: 400;
    display: block; margin-top: 2px; text-transform: none; letter-spacing: 0; }

  /* Disclosure bar */
  .c3-disclosure-bar {
    background: rgba(8,10,15,.95);
    border-bottom: 1px solid rgba(96,165,250,.12);
    padding: 5px 20px;
    text-align: center;
    font-size: 11px;
    color: #6b7fa3;
    font-family: sans-serif;
    line-height: 1.4;
  }

  /* Beta banner */
  .c3-beta-bar {
    background: rgba(201,168,76,.07);
    border-bottom: 1px solid rgba(201,168,76,.2);
    padding: 6px 20px;
    text-align: center;
    font-size: 11px;
    color: #C9A84C;
    font-family: sans-serif;
    line-height: 1.4;
  }
  .c3-beta-bar a { color: #C9A84C; text-decoration: underline; }

  /* Mobile hamburger button (hidden on desktop) */
  .nav-burger {
    display: none;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    width: 38px;
    height: 38px;
    padding: 9px 8px;
    margin-left: auto;
    background: transparent;
    border: 1px solid #1e2235;
    border-radius: 6px;
    cursor: pointer;
    flex-shrink: 0;
  }
  .nav-burger span {
    display: block;
    width: 100%;
    height: 2px;
    border-radius: 2px;
    background: #F0F2FF;
    transition: transform .25s ease, opacity .25s ease;
  }

  /* Slide-out drawer + scrim (mobile) */
  .nav-scrim {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    opacity: 0;
    visibility: hidden;
    transition: opacity .25s ease, visibility .25s ease;
    z-index: 300;
  }
  .nav-scrim.open { opacity: 1; visibility: visible; }
  .nav-drawer {
    position: fixed;
    top: 0;
    right: 0;
    height: 100vh;
    height: 100dvh;
    width: 280px;
    max-width: 85vw;
    background: #0A0C14;
    border-left: 1px solid #1e2235;
    box-shadow: -8px 0 24px rgba(0,0,0,.5);
    z-index: 301;
    transform: translateX(100%);
    transition: transform .25s ease;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    display: flex;
    flex-direction: column;
    padding: 14px 16px 28px;
  }
  .nav-drawer.open { transform: translateX(0); }
  .nav-drawer-close {
    align-self: flex-end;
    width: 40px;
    height: 40px;
    background: transparent;
    border: none;
    color: #F0F2FF;
    font-size: 28px;
    line-height: 1;
    cursor: pointer;
  }
  .nav-drawer-links {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
  }
  .nav-drawer-link {
    display: block;
    padding: 13px 14px;
    border-radius: 8px;
    color: #F0F2FF;
    text-decoration: none;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: .04em;
    text-transform: uppercase;
    border: 1px solid transparent;
    transition: background .15s;
  }
  .nav-drawer-link:hover { background: rgba(255,255,255,.05); text-decoration: none; }
  .nav-drawer-link--vault { color: #C9A84C; }
  .nav-drawer-link--game { color: #C9A84C; }
  .nav-drawer-link--subscribe { color: #C9A84C; }
  .nav-drawer-sep { height: 1px; background: #1e2235; margin: 10px 4px; }
  .nav-drawer-ebay {
    margin-top: 6px;
    text-align: center;
    color: #C9A84C;
    border: 1px solid rgba(201,168,76,.5);
    background: rgba(201,168,76,.08);
  }
  .nav-drawer-ebay:hover { background: rgba(201,168,76,.18); border-color: #C9A84C; }

  @media (max-width: 768px) {
    .nav-logo-text { display: none; }
    .nav-search-wrap { max-width: 140px; }
    .nav-link { padding: 5px 7px; font-size: 10px; }
    .nav-shop-btn { padding: 5px 7px; font-size: 10px; }
    .nav-links { display: none; }
    .nav-burger { display: flex; }
  }
`;

// Builds the nav. gameLabel/gameHref are optional; when present an active
// per-game link is inserted after Card Vault in BOTH the desktop link row
// and the mobile drawer.
function buildNav(gameLabel = '', gameHref = '') {
  const hasGame = Boolean(gameLabel && gameHref);
  const gameLink = hasGame
    ? `\n      <a href="${gameHref}" class="nav-link nav-link--game">${gameLabel}</a>`
    : '';
  const drawerGameLink = hasGame
    ? `\n    <a href="${gameHref}" class="nav-drawer-link nav-drawer-link--game">${gameLabel}</a>`
    : '';
  return `
<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo" title="Cards on Cards on Cards">
      <img src="/c3logo.png" alt="C3">
      <span class="nav-logo-text">Cards on Cards on Cards</span>
    </a>
    <div class="nav-search-wrap">
      <input class="nav-search-input" type="text" id="nav-q"
        placeholder="Search cards..."
        autocomplete="off"
        onkeydown="if(event.key==='Enter'){var v=this.value.trim();if(v)window.location='/search?q='+encodeURIComponent(v);}">
      <button class="nav-search-btn"
        onclick="var v=document.getElementById('nav-q').value.trim();if(v)window.location='/search?q='+encodeURIComponent(v);">
        &#128269;
      </button>
    </div>
    <div class="nav-links">
      <a href="/cards"   class="nav-link nav-link--vault">Card Vault</a>${gameLink}
      <a href="/compare" class="nav-link nav-link--compare">Compare</a>
      <a href="/market"  class="nav-link nav-link--market">Market</a>
      <a href="/tools"   class="nav-link nav-link--tools">Tools</a>
      <a href="/play"    class="nav-link nav-link--play">Play</a>
      <a href="/blog"    class="nav-link nav-link--blog">Blog</a>
      <a href="/subscribe" class="nav-link nav-link--subscribe">Subscribe &#10024;</a>
      <div class="nav-shop-wrap" id="nav-shop-wrap">
        <button class="nav-shop-btn" onclick="(function(){var w=document.getElementById('nav-shop-wrap');w.classList.toggle('open');})()">
          Shop <span class="nav-shop-arrow">&#9660;</span>
        </button>
        <div class="nav-shop-dropdown">
          <a href="/shop" class="nav-shop-item">
            Booster Boxes and Sealed
            <span class="nav-shop-item-label">Amazon AU prices</span>
          </a>
          <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=C3NavShop&toolid=10001&mkevt=1"
            target="_blank" rel="noopener" class="nav-shop-item">
            Singles on eBay AU &#8599;
            <span class="nav-shop-item-label">28,000+ TCG singles listed</span>
          </a>
          <a href="/shop#cat-accessories" class="nav-shop-item">
            Accessories
            <span class="nav-shop-item-label">Sleeves, binders, deck boxes</span>
          </a>
          <a href="/shop#cat-dnd" class="nav-shop-item">
            D&amp;D
            <span class="nav-shop-item-label">Dungeons and Dragons products</span>
          </a>
          <a href="/calendar" class="nav-shop-item">
            Release Calendar
            <span class="nav-shop-item-label">Upcoming set release dates</span>
          </a>
        </div>
      </div>
    </div>
    <button class="nav-burger" id="nav-burger" type="button"
      aria-label="Open menu" aria-expanded="false" aria-controls="nav-drawer">
      <span></span><span></span><span></span>
    </button>
  </div>
</nav>
<div class="nav-scrim" id="nav-scrim"></div>
<aside class="nav-drawer" id="nav-drawer" aria-hidden="true" aria-label="Menu">
  <button class="nav-drawer-close" id="nav-drawer-close" type="button" aria-label="Close menu">&times;</button>
  <div class="nav-drawer-links">
    <a href="/cards" class="nav-drawer-link nav-drawer-link--vault">Card Vault</a>${drawerGameLink}
    <a href="/compare" class="nav-drawer-link">Compare</a>
    <a href="/market" class="nav-drawer-link">Market</a>
    <a href="/tools" class="nav-drawer-link">Tools</a>
    <a href="/play" class="nav-drawer-link">Play</a>
    <a href="/blog" class="nav-drawer-link">Blog</a>
    <a href="/subscribe" class="nav-drawer-link nav-drawer-link--subscribe">Subscribe &#10024;</a>
    <div class="nav-drawer-sep"></div>
    <a href="/shop" class="nav-drawer-link">Shop: Booster Boxes</a>
    <a href="/shop#cat-accessories" class="nav-drawer-link">Accessories</a>
    <a href="/shop#cat-dnd" class="nav-drawer-link">D&amp;D</a>
    <a href="/calendar" class="nav-drawer-link">Release Calendar</a>
    <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=C3NavDrawer&toolid=10001&mkevt=1"
      target="_blank" rel="noopener" class="nav-drawer-link nav-drawer-ebay">Singles on eBay AU &#8599;</a>
  </div>
</aside>
<div class="c3-disclosure-bar">
  As an eBay Partner Network affiliate, we earn from qualifying purchases made via eBay links on this site.
</div>
<script>
  // Close shop dropdown when clicking outside
  document.addEventListener('click', function(e) {
    var wrap = document.getElementById('nav-shop-wrap');
    if (wrap && !wrap.contains(e.target)) wrap.classList.remove('open');
  });
</script>
<script>
  // Mobile drawer: open/close on hamburger, close on scrim/close/ESC/link.
  (function(){
    var burger = document.getElementById('nav-burger');
    var drawer = document.getElementById('nav-drawer');
    var scrim  = document.getElementById('nav-scrim');
    var closeBtn = document.getElementById('nav-drawer-close');
    if (!burger || !drawer || !scrim) return;
    function openDrawer() {
      drawer.classList.add('open');
      scrim.classList.add('open');
      burger.setAttribute('aria-expanded', 'true');
      drawer.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
    function closeDrawer() {
      drawer.classList.remove('open');
      scrim.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
      drawer.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
    burger.addEventListener('click', function(e){ e.stopPropagation(); openDrawer(); });
    scrim.addEventListener('click', closeDrawer);
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeDrawer(); });
    drawer.addEventListener('click', function(e){
      var t = e.target;
      while (t && t !== drawer) { if (t.tagName === 'A') { closeDrawer(); break; } t = t.parentNode; }
    });
  })();
</script>
`;
}

export const NAV_HTML = buildNav();

// Per-game variant: keeps the active-game indicator on hub/set/card pages.
export function navHtml({ gameLabel, gameHref } = {}) {
  return buildNav(gameLabel, gameHref);
}
