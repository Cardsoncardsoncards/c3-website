// netlify/functions/shared/nav.mjs
// Shared nav for all C3 hub, set-page, and card-page functions.
// Import: import { NAV_CSS, NAV_HTML, navHtml } from '../shared/nav.mjs';
// Single source of truth. Update here, deploys everywhere.
// EPN campid: 5339146789 | GA4: G-WR68HPE92S | Amazon tag: blasdigital-22
//
// NAV_HTML  -> generic nav (homepage, tools, generic pages).
// navHtml({ gameLabel, gameHref }) -> same nav with an active per-game link
//   inserted after Card Vault, so hub/set/card pages keep the
//   "which game am I on" indicator when they migrate to this module.

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

  @media (max-width: 768px) {
    .nav-logo-text { display: none; }
    .nav-search-wrap { max-width: 140px; }
    .nav-link { padding: 5px 7px; font-size: 10px; }
    .nav-shop-btn { padding: 5px 7px; font-size: 10px; }
  }
`;

// Builds the nav. gameLink is an optional pre-rendered <a> inserted right
// after the Card Vault link (used by navHtml for per-game pages).
function buildNav(gameLink = '') {
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
  </div>
</nav>
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
`;
}

export const NAV_HTML = buildNav();

// Per-game variant: keeps the active-game indicator on hub/set/card pages.
export function navHtml({ gameLabel, gameHref } = {}) {
  const gameLink = (gameLabel && gameHref)
    ? `\n      <a href="${gameHref}" class="nav-link nav-link--game">${gameLabel}</a>`
    : '';
  return buildNav(gameLink);
}
