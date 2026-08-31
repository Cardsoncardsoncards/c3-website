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

  /* Account (task-110). Deliberately NOT an eighth pill inside .nav-links: that row already
     carries seven pills plus the Shop dropdown, and .nav-links is display:none on mobile, so
     an Account pill in there would simply vanish on phones. It sits OUTSIDE that group, at the
     far right of nav-inner next to the burger, which keeps it visible at every width and reads
     as account chrome rather than as another destination in the browse group. */
  .nav-account {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
    padding: 5px 10px;
    margin-left: 6px;
    border-radius: 6px;
    border: 1px solid rgba(160,168,192,.3);
    color: #A0A8C0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: .05em;
    text-transform: uppercase;
    text-decoration: none;
    white-space: nowrap;
    transition: all .2s;
  }
  .nav-account:hover {
    color: #F0F2FF;
    border-color: #C9A84C;
    background: rgba(201,168,76,.08);
    text-decoration: none;
  }

  @media (max-width: 768px) {
    .nav-logo-text { display: none; }
    .nav-search-wrap { max-width: 140px; }
    .nav-link { padding: 5px 7px; font-size: 10px; }
    .nav-links { display: none; }
    .nav-burger { display: flex; }
    /* Keep the icon, drop the word, so it costs almost no width next to the burger. */
    .nav-account { padding: 5px 8px; margin-left: 2px; }
    .nav-account-text { display: none; }
  }
`;

// Builds the nav. gameLabel/gameHref are optional; when present an active
// per-game link is inserted after Card Vault in BOTH the desktop link row
// and the mobile drawer.
// `nonce` is optional and defaults to empty. When empty, buildNav emits exactly the markup it
// always did apart from the three inline handlers below moving into the script block, so the 101
// pages that call NAV_HTML or navHtml() without a nonce are unaffected. When a page ships a
// Content-Security-Policy (see shared/csp.mjs) it passes its per-response nonce and these
// scripts become the only inline scripts the browser will run. A nonce attribute on a page with
// no CSP is inert, which is what makes this safe to add everywhere at once.
function buildNav(gameLabel = '', gameHref = '', nonce = '') {
  const nonceAttr = nonce ? ` nonce="${nonce}"` : '';
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
        data-nav-search-input>
      <button class="nav-search-btn"
        data-nav-search-go>
        &#128269;
      </button>
    </div>
    <div class="nav-links">
      <a href="/cards"   class="nav-link nav-link--vault">Card Prices</a>${gameLink}
      <a href="/compare" class="nav-link nav-link--compare">Compare</a>
      <a href="/blog"    class="nav-link nav-link--blog">Blog</a>
      <a href="/search"  class="nav-link nav-link--search">Search</a>
    </div>
    <a href="/account" class="nav-account" title="Your C3 account">
      &#128100;<span class="nav-account-text">Account</span>
    </a>
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
    <a href="/cards" class="nav-drawer-link nav-drawer-link--vault">Card Prices</a>${drawerGameLink}
    <a href="/compare" class="nav-drawer-link">Compare</a>
    <a href="/blog" class="nav-drawer-link">Blog</a>
    <a href="/search" class="nav-drawer-link">Search</a>
    <div class="nav-drawer-sep"></div>
    <a href="/account" class="nav-drawer-link">&#128100; Your Account</a>
    <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&campid=${EPN_CAMPID}&customid=C3NavDrawer&toolid=10001&mkevt=1"
      target="_blank" rel="noopener" class="nav-drawer-link nav-drawer-ebay">Singles on eBay AU &#8599;</a>
  </div>
</aside>
<div class="c3-disclosure-bar">
  As an eBay Partner Network affiliate, we earn from qualifying purchases made via eBay links on this site.
</div>
<script${nonceAttr}>
  // CSP pilot. These behaviours were inline onkeydown/onclick attributes until 11 August
  // 2026. An inline handler is an inline SCRIPT as far as CSP is concerned, so a policy without
  // 'unsafe-inline' silently stops them running: the search box would look normal and do nothing
  // on Enter. Delegated off document so the markup needs no handler attribute at all.
  // It read "three behaviours" until 31 August 2026. The third was the shop dropdown toggle,
  // removed with the dropdown itself in NAV-01, so two remain: Enter in the box, and the button.
  function c3NavSearch() {
    var i = document.getElementById('nav-q');
    var v = i && i.value.trim();
    if (v) window.location = '/search?q=' + encodeURIComponent(v);
  }
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter') return;
    if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-nav-search-input')) {
      e.preventDefault();
      c3NavSearch();
    }
  });
  document.addEventListener('click', function(e) {
    var t = e.target.closest ? e.target.closest('[data-nav-search-go]') : null;
    if (!t) return;
    c3NavSearch();
  });
</script>
<script${nonceAttr}>
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

// Task B. The page-view tracker rides along with the nav, and this is a deliberate choice
// worth explaining rather than a convenience.
//
// The problem it solves: requestFingerprint() had only two call sites, so the only pages this
// site had ever recorded request provenance for were card pages and the signup form. On
// 8 August 2026 GA4 reported 18,814 sessions in 24 hours while card_views recorded ZERO card
// views in the preceding hour, meaning the traffic that matters was entirely on pages the
// database had never seen.
//
// Why here: every one of the 102 dynamic page functions already renders navHtml() or
// NAV_HTML, and it lands immediately inside <body>, which is a valid place for a script.
// Attaching it here covers all 102 in one edit instead of 102 separate injections, each of
// which would be a chance to put it in the wrong template. It is the same reasoning that put
// the nav itself here.
//
// The script classifies its own page and SKIPS card pages, which already log to card_views,
// so nothing is recorded twice and no card page gains a second POST. See
// shared/page-view-tracking.mjs for the segment-count rules.
import { NAV_PAGE_VIEW_SCRIPT, navPageViewScript } from './page-view-tracking.mjs';

export const NAV_HTML = buildNav() + NAV_PAGE_VIEW_SCRIPT;

// Per-game variant: keeps the active-game indicator on hub/set/card pages.
export function navHtml({ gameLabel, gameHref, nonce } = {}) {
  return buildNav(gameLabel, gameHref, nonce) + navPageViewScript(nonce);
}
