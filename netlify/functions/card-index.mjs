// netlify/functions/card-index.mjs
// Serves:
// /cards/mtg - MTG card hub with search
// /cards/mtg/random-commander - Random commander generator
// /cards/mtg/sets/:setSlug - Set index pages

const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');

// ── Inline mana symbol SVGs (no external dependency) ──────────────────
// Minimal SVGs matching official MTG mana pip colours
const MANA_SVG = {
  W: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#F8F6D8" stroke="#C8C090" stroke-width="1"/><text x="8" y="12" text-anchor="middle" font-size="9" font-weight="bold" fill="#5A4A00">W</text></svg>`,
  U: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#C1D7E9" stroke="#7AAAC8" stroke-width="1"/><text x="8" y="12" text-anchor="middle" font-size="9" font-weight="bold" fill="#003366">U</text></svg>`,
  B: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#3A3A3A" stroke="#888" stroke-width="1"/><text x="8" y="12" text-anchor="middle" font-size="9" font-weight="bold" fill="#DDD">B</text></svg>`,
  R: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#E49977" stroke="#C06030" stroke-width="1"/><text x="8" y="12" text-anchor="middle" font-size="9" font-weight="bold" fill="#5A1000">R</text></svg>`,
  G: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#A3C095" stroke="#508040" stroke-width="1"/><text x="8" y="12" text-anchor="middle" font-size="9" font-weight="bold" fill="#1A3A00">G</text></svg>`,
  C: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#C7C7C7" stroke="#999" stroke-width="1"/><text x="8" y="12" text-anchor="middle" font-size="9" font-weight="bold" fill="#444">C</text></svg>`,
  0: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#C7C7C7" stroke="#999" stroke-width="1"/><text x="8" y="12" text-anchor="middle" font-size="9" font-weight="bold" fill="#444">0</text></svg>`,
  1: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#C7C7C7" stroke="#999" stroke-width="1"/><text x="8" y="12" text-anchor="middle" font-size="9" font-weight="bold" fill="#444">1</text></svg>`,
  2: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#C7C7C7" stroke="#999" stroke-width="1"/><text x="8" y="12" text-anchor="middle" font-size="9" font-weight="bold" fill="#444">2</text></svg>`,
  3: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#C7C7C7" stroke="#999" stroke-width="1"/><text x="8" y="12" text-anchor="middle" font-size="9" font-weight="bold" fill="#444">3</text></svg>`,
  4: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#C7C7C7" stroke="#999" stroke-width="1"/><text x="8" y="12" text-anchor="middle" font-size="9" font-weight="bold" fill="#444">4</text></svg>`,
  5: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#C7C7C7" stroke="#999" stroke-width="1"/><text x="8" y="12" text-anchor="middle" font-size="9" font-weight="bold" fill="#444">5</text></svg>`,
  '6plus': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#C7C7C7" stroke="#999" stroke-width="1"/><text x="8" y="12" text-anchor="middle" font-size="9" font-weight="bold" fill="#444">6+</text></svg>`,
};
// Wrap SVG string in a consistent sized container
function manaPip(key, size = 16) {
  const svg = MANA_SVG[key] || MANA_SVG['C'];
  return `<span style="display:inline-block;width:${size}px;height:${size}px;vertical-align:middle" title="${key}">${svg}</span>`;
}
function manaFilterPip(key) { return manaPip(key, 18); }

async function supabaseGet(path) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch(e) {
    return [];
  }
}

const NAV = `<nav style="background:#1a1d2e;border-bottom:1px solid #2d3254;padding:12px 24px;display:flex;align-items:center;gap:24px;flex-wrap:wrap">
  <a href="/" style="font-weight:bold;font-size:18px;color:#f5a623;text-decoration:none">C3</a>
  <a href="/" style="color:#9ba3c4;font-size:14px;text-decoration:none">Home</a>
  <a href="/shop.html" style="color:#9ba3c4;font-size:14px;text-decoration:none">Shop</a>
  <a href="/blog" style="color:#9ba3c4;font-size:14px;text-decoration:none">Blog</a>
  <a href="/ev-calculator.html" style="color:#9ba3c4;font-size:14px;text-decoration:none">EV Calculator</a>
  <a href="/cards/mtg" style="color:#f5a623;font-size:14px;text-decoration:none">MTG Cards</a>
  <a href="/cards/mtg/random-commander" style="color:#9ba3c4;font-size:14px;text-decoration:none">Random Commander</a>
  <a href="/tracker.html" style="color:#9ba3c4;font-size:14px;text-decoration:none">Free Tracker</a>
</nav>`;

const BASE_STYLES = `
  <style>
    :root { --bg:#0f1117;--bg2:#1a1d2e;--bg3:#22263a;--accent:#f5a623;--accent2:#7c6af5;--text:#e8eaf0;--text2:#9ba3c4;--border:#2d3254;--radius:12px; }
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:sans-serif;line-height:1.6}
    a{color:var(--accent);text-decoration:none} a:hover{text-decoration:underline}
    .wrap{max-width:1100px;margin:0 auto;padding:0 24px}
    .btn{display:inline-block;padding:10px 20px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;font-size:14px}
    .btn-primary{background:var(--accent);color:#000}
    .btn-secondary{background:var(--bg3);border:1px solid var(--border);color:var(--text)}
    input,select{background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:8px 12px;border-radius:6px;font-size:14px}
    footer{background:var(--bg2);border-top:1px solid var(--border);padding:24px;text-align:center;color:var(--text2);font-size:13px;margin-top:48px}
    footer a{color:var(--text2);margin:0 10px}
  </style>`;

// MTG Card Hub Page
function renderCardHub(sets, topCards) {

  // Group sets: parent sets (no parent_set_code) are top-level
  // Sub-sets (have parent_set_code) are children of their parent
  const parentMap = new Map();  // parent set_code -> parent set object
  const childMap  = new Map();  // parent set_code -> array of child sets

  sets.forEach(s => {
    if (!s.parent_set_code) {
      parentMap.set(s.set_code, s);
    } else {
      if (!childMap.has(s.parent_set_code)) childMap.set(s.parent_set_code, []);
      childMap.get(s.parent_set_code).push(s);
    }
  });

  // Sort parents A-Z
  const sortedParents = [...parentMap.values()].sort((a,b) => a.set_name.localeCompare(b.set_name));

  // Build the HTML for the set grid — parents show with sub-set count badge
  // Clicking a parent goes to its set page; sub-sets are revealed on hover/click
  const setListHTML = sortedParents.map(parent => {
    const children = (childMap.get(parent.set_code) || []).sort((a,b) => a.set_name.localeCompare(b.set_name));
    const childBadge = children.length ? `<span style="font-size:9px;background:rgba(201,168,76,.15);color:var(--gold);border-radius:4px;padding:1px 5px;margin-left:4px">+${children.length}</span>` : '';
    const childrenHTML = '';
    return `<div class="set-parent-item" data-name="${parent.set_name.toLowerCase()}${children.map(c=>' '+c.set_name.toLowerCase()).join('')}">
      <div style="display:flex;align-items:center;gap:4px">
        <a href="/cards/mtg/sets/${parent.set_slug}" class="set-list-item"
          style="flex:1;display:block;padding:7px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;text-decoration:none;font-size:12px;transition:border-color .15s"
          onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
          <span style="color:var(--text);font-weight:600">${parent.set_name}</span>
          <span style="color:var(--text2);font-size:10px;margin-left:6px">${parent.release_date?.slice(0,4)||''}</span>
          ${childBadge}
        </a>
        ${children.length ? `<button
          id="btn-${parent.set_code}"
          data-setcode="${parent.set_code}"
          data-setname="${parent.set_name.replace(/"/g,'&quot;')}"
          data-children="${JSON.stringify(children.map(c=>({url:'/cards/mtg/sets/'+c.set_slug,label:c.set_name,year:c.release_date?.slice(0,4)||''}))).replace(/"/g,'&quot;')}"
          onclick="handleToggle(this)"
          style="background:none;border:1px solid var(--border);color:var(--text2);width:26px;height:26px;border-radius:6px;cursor:pointer;font-size:14px;flex-shrink:0"
          title="Show variants">+</button>` : ''}
      </div>
    </div>`;
  }).join('');

  const topCardHTML = topCards.map(c => `
    <a href="/cards/mtg/${c.slug}" style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center;display:block;transition:border-color 0.2s" onmouseover="this.style.borderColor='#f5a623'" onmouseout="this.style.borderColor='#2d3254'">
      ${c.image_uri_small ? `<img src="${c.image_uri_small}" alt="${c.name}" style="width:100%;border-radius:6px">` : `<div style="height:80px;display:flex;align-items:center;justify-content:center;color:var(--text2);font-size:11px">${c.name}</div>`}
      <div style="font-size:11px;margin-top:4px;color:var(--text)">${c.name}</div>
      <div style="font-size:12px;color:var(--accent);font-weight:bold">${(c.price_usd && c.price_usd >= 3) ? `~AU$${(c.price_aud > 0 ? parseFloat(c.price_aud) : c.price_usd * 1.58).toFixed(0)}` : ''}</div>
    </a>`).join('');

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>MTG Card Prices Australia | Cards on Cards on Cards</title>
  <meta name="description" content="Browse Magic: The Gathering card prices in AUD. Australia's MTG price guide with live AUD conversion, 52-week price ranges, and eBay AU buy links.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/mtg">
  ${BASE_STYLES}
</head>
<body>
${NAV}
<div class="wrap" style="padding-top:32px">
  <h1 style="font-size:32px;margin-bottom:8px">MTG Card Prices in Australia</h1>
  <p style="color:var(--text2);margin-bottom:32px">Australia's MTG price guide with live AUD pricing, 52-week price ranges, and direct eBay AU buy links. Updated daily.</p>

  <!-- Search -->
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:32px">
    <h2 style="font-size:18px;margin-bottom:16px">Search Cards</h2>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <input type="text" id="card-search" placeholder="Card name e.g. Lightning Bolt" style="flex:1;min-width:200px" onkeyup="if(event.key==='Enter')searchCard()">
      <button class="btn btn-primary" onclick="searchCard()">Search</button>
      <a href="/cards/mtg/random-commander" class="btn btn-secondary">🎲 Random Commander</a>
      <a href="/cards/mtg/random" class="btn btn-secondary">🃏 Random Card</a>
    </div>
    <div id="search-results" style="margin-top:16px"></div>
  </div>

  <!-- Quick Access Badges -->
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:32px">
    <a href="/cards/mtg/random-commander" style="display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:10px;background:linear-gradient(135deg,#f5a623,#e8940f);color:#000;font-weight:700;font-size:13px;text-decoration:none;transition:opacity .2s" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">🎲 Random Commander</a>
    <a href="/ev-calculator.html" style="display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:10px;background:linear-gradient(135deg,#4a9eff,#2979d8);color:#fff;font-weight:700;font-size:13px;text-decoration:none;transition:opacity .2s" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">📊 EV Calculator</a>
    <a href="/tracker.html" style="display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:10px;background:linear-gradient(135deg,#4caf50,#388e3c);color:#fff;font-weight:700;font-size:13px;text-decoration:none;transition:opacity .2s" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">📋 Free Tracker</a>
    <a href="/shop.html" style="display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:10px;background:linear-gradient(135deg,#ff7043,#e64a19);color:#fff;font-weight:700;font-size:13px;text-decoration:none;transition:opacity .2s" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">🛒 Shop</a>
  </div>

  <!-- Commander Spotlight Carousel -->
  <div style="margin-bottom:32px;padding:24px;background:rgba(107,107,255,.04);border:1px solid rgba(107,107,255,.15);border-radius:var(--radius);overflow:hidden">
    <div style="text-align:center;margin-bottom:20px">
      <p style="font-size:10px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:#9898FF;margin-bottom:6px">Commander Spotlight</p>
      <h2 id="cmd-mtg-carousel-title" style="font-family:'Cinzel',serif;font-size:20px;color:var(--text1);margin:0">Your Next Commander Awaits</h2>
    </div>
    <div style="overflow:hidden;position:relative;mask-image:linear-gradient(to right,transparent,black 4%,black 96%,transparent);-webkit-mask-image:linear-gradient(to right,transparent,black 4%,black 96%,transparent)">
      <div id="cmd-mtg-carousel-track" class="cmd-track">
        <div style="min-width:140px;height:200px;background:rgba(107,107,255,.08);border-radius:8px;animation:shimmer 1.5s infinite"></div>
        <div style="min-width:140px;height:200px;background:rgba(107,107,255,.08);border-radius:8px;animation:shimmer 1.5s .1s infinite"></div>
        <div style="min-width:140px;height:200px;background:rgba(107,107,255,.08);border-radius:8px;animation:shimmer 1.5s .2s infinite"></div>
        <div style="min-width:140px;height:200px;background:rgba(107,107,255,.08);border-radius:8px;animation:shimmer 1.5s .3s infinite"></div>
        <div style="min-width:140px;height:200px;background:rgba(107,107,255,.08);border-radius:8px;animation:shimmer 1.5s .4s infinite"></div>
      </div>
    </div>
    <div style="text-align:center;margin-top:14px">
      <a href="/cards/mtg?page=random-commander" style="font-size:12px;color:#9898FF;text-decoration:none">Generate a random Commander → </a>
    </div>
  </div>

  <!-- Browse by Set — search + grouped alphabetical list -->
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:32px">
    <h2 style="font-size:18px;margin-bottom:12px">Browse by Set</h2>
    <div style="margin-bottom:12px">
      <input type="text" id="set-search" placeholder="Type a set name e.g. Strixhaven, Commander..."
        style="width:100%;max-width:500px;padding:8px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;box-sizing:border-box"
        oninput="filterSets(this.value)" autocomplete="off">
      <span style="font-size:11px;color:var(--text2);margin-left:12px">Sets with <span style="color:var(--gold)">+N</span> have sub-sets — click the + button to expand them</span>
    </div>
    <div id="set-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:4px">
      ${setListHTML}
    </div>
    <div id=\"set-child-drawer\" style=\"display:none;margin-top:8px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px\">
      <div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:10px\">
        <span id=\"set-drawer-title\" style=\"font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.08em\"></span>
        <button onclick=\"closeDrawer()\" style=\"background:none;border:none;color:var(--text2);cursor:pointer;font-size:18px;line-height:1\">&times;</button>
      </div>
      <div id=\"set-drawer-items\" style=\"display:flex;gap:8px;flex-wrap:wrap\"></div>
    </div>
  </div>

  <!-- Most Valuable Cards -->
  <div style="margin-bottom:32px">
    <h2 style="font-size:20px;margin-bottom:16px">🏆 Most Valuable MTG Cards (AUD)</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px">
      ${topCardHTML}
    </div>
    <p style="color:var(--text2);font-size:13px;margin-top:16px">Prices in AUD based on live USD conversion. Updated daily from Scryfall.</p>
  </div>

  <!-- Feature callouts -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px;margin-bottom:32px">
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:20px">
      <h3 style="color:var(--accent);margin-bottom:8px">📚 Set Browser</h3>
      <p style="color:var(--text2);font-size:14px">Browse every MTG set from Alpha to the latest release with all card prices in AUD.</p>
    </div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:20px">
      <h3 style="color:var(--accent);margin-bottom:8px">🛒 eBay AU Buy Links</h3>
      <p style="color:var(--text2);font-size:14px">Direct links to the cheapest Australian eBay listings for every card. No currency conversion needed.</p>
    </div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:20px">
      <h3 style="color:var(--accent);margin-bottom:8px">🎲 Random Commander</h3>
      <p style="color:var(--text2);font-size:14px">Filter by colour and mana value. Find your next Commander deck inspiration.</p>
    </div>
  </div>

  <!-- Links to blog and tools -->
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:32px">
    <h3 style="margin-bottom:16px">Related Guides</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
      <a href="/blog/best-mtg-booster-boxes-australia/" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px;color:var(--text);text-decoration:none;display:block">
        <div style="font-weight:bold;margin-bottom:4px;color:var(--accent)">Best MTG Booster Boxes in Australia</div>
        <div style="font-size:13px;color:var(--text2)">Which boxes are worth opening right now and where to buy at the best price.</div>
      </a>
      <a href="/blog/mtg-singles-vs-booster-boxes-australia/" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px;color:var(--text);text-decoration:none;display:block">
        <div style="font-weight:bold;margin-bottom:4px;color:var(--accent)">Singles vs Booster Boxes</div>
        <div style="font-size:13px;color:var(--text2)">Should you buy the card you want directly or gamble on packs? The honest answer.</div>
      </a>
      <a href="/blog/how-to-sell-mtg-cards-australia/" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px;color:var(--text);text-decoration:none;display:block">
        <div style="font-weight:bold;margin-bottom:4px;color:var(--accent)">How to Sell MTG Cards in Australia</div>
        <div style="font-size:13px;color:var(--text2)">eBay, local stores, or buylist? Here is what actually gets you the best price.</div>
      </a>
      <a href="/ev-calculator.html" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px;color:var(--text);text-decoration:none;display:block">
        <div style="font-weight:bold;margin-bottom:4px;color:var(--accent)">MTG EV Calculator</div>
        <div style="font-size:13px;color:var(--text2)">Is your booster box worth opening? Calculate expected value before you crack it.</div>
      </a>
    </div>
  </div>
</div>

<footer>
  <p><a href="/">Home</a><a href="/cards/mtg">MTG Cards</a><a href="/ev-calculator.html">EV Calculator</a><a href="/shop.html">Shop</a><a href="/blog">Blog</a><a href="/tracker.html">Free Tracker</a></p>
  <p style="margin-top:8px">© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
</footer>

<script>
async function searchCard() {
  const q = document.getElementById('card-search').value.trim();
  if (!q) return;
  const res = document.getElementById('search-results');
  res.innerHTML = '<p style="color:var(--text2)">Searching...</p>';
  try {
    const data = await fetch('${SUPABASE_URL}/rest/v1/mtg_cards?name=ilike.' + encodeURIComponent('%' + q + '%') + '&limit=8&select=slug,name,price_usd,image_uri_small&price_usd=gt.0&order=price_usd.desc', {
      headers: { 'apikey': '${SUPABASE_ANON_KEY}' }
    }).then(r => r.json());
    if (!data.length) { res.innerHTML = '<p style="color:var(--text2)">No cards found. <a href="https://www.ebay.com.au/sch/i.html?_nkw=' + encodeURIComponent(q + ' mtg') + '&campid=5339146789" target="_blank">Search eBay AU →</a></p>'; return; }
    res.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:8px">' +
      data.map(c => '<a href="/cards/mtg/' + c.slug + '" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center;display:block"><img src="' + (c.image_uri_small || '') + '" style="width:100%;border-radius:4px" alt="' + c.name + '"><div style="font-size:11px;margin-top:4px">' + c.name + '</div><div style="font-size:12px;color:var(--accent)">' + (c.price_usd ? '~AU$' + (c.price_usd * 1.58).toFixed(0) : '') + '</div></a>').join('') + '</div>';
  } catch { res.innerHTML = '<p style="color:#f44">Search error. Try again.</p>'; }
}

function filterSets(query) {
  const q = query.toLowerCase().trim();
  const items = document.querySelectorAll('.set-parent-item');
  items.forEach(item => {
    const name = item.dataset.name || '';
    const match = !q || name.includes(q);
    item.style.display = match ? '' : 'none';
    // If searching, auto-expand children so sub-set matches are visible
    if (q && match) {
      const children = item.querySelector('.set-children');
      if (children) children.style.display = '';
    }
  });
}

function handleToggle(btn) {
  const setCode = btn.dataset.setcode;
  const setName = btn.dataset.setname;
  const childrenData = JSON.parse(btn.dataset.children.replace(/&quot;/g,'"'));
  toggleChildren(setCode, setName, childrenData, btn);
}

let openSetCode = null;
function toggleChildren(setCode, setName, childrenData, btn) {
  const drawer = document.getElementById('set-child-drawer');
  const title  = document.getElementById('set-drawer-title');
  const items  = document.getElementById('set-drawer-items');
  if (!btn) btn = document.getElementById('btn-' + setCode);
  if (openSetCode === setCode) {
    drawer.style.display = 'none';
    if (btn) btn.textContent = '+';
    openSetCode = null;
    return;
  }
  if (openSetCode) {
    const prevBtn = document.getElementById('btn-' + openSetCode);
    if (prevBtn) prevBtn.textContent = '+';
  }
  openSetCode = setCode;
  title.textContent = setName + ' variants';
  items.innerHTML = childrenData.map(c =>
    '<a href="' + c.url + '" style="padding:6px 14px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;text-decoration:none;font-size:12px;color:var(--text);transition:border-color .15s" onmouseover="this.style.borderColor=\'var(--accent)\'" onmouseout="this.style.borderColor=\'var(--border)\'">' +
    c.label + ' <span style="font-size:10px;color:var(--text2)">(' + c.year + ')</span></a>'
  ).join('');
  drawer.style.display = '';
  if (btn) btn.textContent = '−';
  drawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function closeDrawer() {
  document.getElementById('set-child-drawer').style.display = 'none';
  if (openSetCode) {
    const btn = document.getElementById('btn-' + openSetCode);
    if (btn) btn.textContent = '+';
  }
  openSetCode = null;
}
</script>
<!-- GA4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>

<style>
@keyframes cmd-scroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.cmd-track{display:flex;gap:12px;width:max-content}
.cmd-track.loaded{animation:cmd-scroll 50s linear infinite}
.cmd-track:hover{animation-play-state:paused}
.cmd-card{display:inline-flex;flex-direction:column;min-width:140px;max-width:155px;background:rgba(107,107,255,.06);border:1px solid rgba(107,107,255,.2);border-radius:10px;overflow:hidden;text-decoration:none;transition:all .22s;flex-shrink:0}
.cmd-card:hover{transform:translateY(-3px);border-color:rgba(107,107,255,.5);box-shadow:0 8px 24px rgba(107,107,255,.15)}
.cmd-card img{width:100%;aspect-ratio:745/1040;object-fit:cover;display:block}
.cmd-card-body{padding:7px 9px 9px;display:flex;flex-direction:column;gap:2px}
.cmd-card-name{font-family:Cinzel,serif;font-size:9.5px;font-weight:700;color:#C0C0FF;line-height:1.3}
.cmd-card-identity{font-size:9px;color:rgba(160,168,192,.5)}
.cmd-card-cta{font-size:8.5px;font-weight:600;color:#9898FF;letter-spacing:.06em;text-transform:uppercase;margin-top:3px}
</style>
<script>
(function(){
  function buildCmdCard(c){
    return '<a href="'+c.cardVaultUrl+'" class="cmd-card">'
      +(c.image?'<img src="'+c.image+'" alt="'+c.name.replace(/"/g,'&quot;')+'" loading="lazy">':'<div style="aspect-ratio:745/1040;background:rgba(107,107,255,.1);display:flex;align-items:center;justify-content:center;font-size:28px">🎲</div>')
      +'<div class="cmd-card-body"><div class="cmd-card-name">'+c.name+'</div><div class="cmd-card-identity">'+c.identityName+'</div><div class="cmd-card-cta">View Card →</div></div></a>';
  }
  async function loadSetCommanders(){
    const track=document.getElementById('cmd-mtg-carousel-track');
    const titleEl=document.getElementById('cmd-mtg-carousel-title');
    if(!track)return;
    try{
      // mode=top returns 40 commanders — shuffle client-side so each load feels fresh
      const res=await fetch('/.netlify/functions/commander-carousel?mode=top');
      const data=await res.json();
      if(!data.commanders||data.commanders.length===0){track.innerHTML='<p style="color:#A0A8C0;font-size:12px;padding:12px">No commanders found.</p>';return;}
      // Fisher-Yates shuffle then take 20
      const arr=[...data.commanders];
      for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}
      const twenty=arr.slice(0,20);
      if(titleEl)titleEl.textContent='Your Next Commander Awaits';
      const html=twenty.map(buildCmdCard).join('');
      track.innerHTML=html+html;
      track.classList.add('loaded');
    }catch(e){track.innerHTML='<p style="color:#A0A8C0;font-size:12px;padding:12px">Could not load commanders.</p>';}
  }
  loadSetCommanders();
})();
</script>
</body></html>`;
}

// Random Commander Page
function renderRandomCommander() {
  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Random MTG Commander Generator Australia | Cards on Cards on Cards</title>
  <meta name="description" content="Generate 1 to 4 random Magic: The Gathering Commanders. Filter by colour identity and mana value. Share your results with friends.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/mtg/random-commander">
  ${BASE_STYLES}
  <style>
    .color-btn{width:38px;height:38px;border-radius:50%;border:2px solid transparent;cursor:pointer;font-size:15px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;transition:all .2s}
    .color-btn.selected{border-color:#f5a623;transform:scale(1.15);box-shadow:0 0 0 3px rgba(245,166,35,.4)}
    .count-btn{padding:6px 16px;border-radius:8px;border:1px solid var(--border);background:none;color:var(--text2);font-size:14px;font-weight:700;cursor:pointer;transition:all .2s}
    .count-btn.active{background:var(--accent);color:#000;border-color:var(--accent)}
    .cmc-btn{padding:6px 14px;border-radius:8px;border:1px solid var(--border);background:none;color:var(--text2);font-size:13px;font-weight:700;cursor:pointer;transition:all .2s}
    .cmc-btn.active{background:var(--accent);color:#000;border-color:var(--accent)}
    #results-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;margin:32px 0 24px}
    @media(max-width:480px){#results-grid{grid-template-columns:repeat(2,1fr)}}
    .cmd-result-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;overflow:hidden;position:relative;transition:border-color .2s}
    .cmd-result-card:hover{border-color:var(--accent)}
    .cmd-result-img{width:100%;display:block}
    .cmd-result-body{padding:12px}
    .cmd-result-name{font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;line-height:1.3}
    .cmd-result-type{font-size:11px;color:var(--text2);margin-bottom:6px}
    .cmd-result-price{font-size:14px;font-weight:700;color:var(--accent);margin-bottom:10px}
    .cmd-result-view{display:block;text-align:center;background:rgba(245,166,35,.1);border:1px solid rgba(245,166,35,.3);border-radius:6px;padding:6px;font-size:12px;color:var(--accent);text-decoration:none;margin-bottom:8px;transition:all .2s}
    .cmd-result-view:hover{background:var(--accent);color:#000}
    .cmd-regen-btn{width:100%;background:none;border:1px solid var(--border);color:var(--text2);border-radius:6px;padding:5px;font-size:11px;cursor:pointer;transition:all .2s}
    .cmd-regen-btn:hover{border-color:var(--accent);color:var(--accent)}
    .challenge-bar{background:linear-gradient(135deg,rgba(245,166,35,.12) 0%,rgba(124,106,245,.12) 100%);border:1px solid rgba(245,166,35,.35);border-radius:16px;padding:28px 24px;text-align:center;margin-bottom:32px;position:relative;overflow:hidden}
    .challenge-bar::before{content:'';position:absolute;top:-40px;right:-40px;width:140px;height:140px;background:radial-gradient(circle,rgba(245,166,35,.15),transparent 70%);pointer-events:none}
    .challenge-title{font-size:22px;font-weight:800;color:var(--text);margin-bottom:6px;letter-spacing:-.02em}
    .challenge-sub{font-size:14px;color:var(--text2);margin-bottom:20px;max-width:480px;margin-left:auto;margin-right:auto}
    .sbtn{display:inline-flex;align-items:center;gap:7px;padding:9px 18px;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;text-decoration:none;border:none;transition:all .15s;font-family:sans-serif}
    .sbtn:hover{opacity:.88;transform:translateY(-1px)}
    .sbtn-discord{background:#5865f2;color:#fff}
    .sbtn-reddit{background:#ff4500;color:#fff}
    .sbtn-twitter{background:#000;color:#fff}
    .sbtn-whatsapp{background:#25d366;color:#fff}
    .sbtn-copy{background:var(--bg3);border:1px solid var(--border);color:var(--text)}
    .sbtn-copy.copied{background:rgba(76,175,80,.15);border-color:#4caf50;color:#4caf50}
    .share-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
    #results-section{visibility:hidden;height:0;overflow:hidden}
    #results-section.visible{visibility:visible;height:auto;overflow:visible}
    .how-tip{background:rgba(245,166,35,.07);border:1px solid rgba(245,166,35,.2);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--text2);margin-top:10px;line-height:1.5}
    .how-tip strong{color:var(--accent)}
    .trust-bullets{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px}
    .trust-bullet{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text2)}
    .trust-bullet span{font-size:16px}
    .guide-card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px;text-decoration:none;display:block;transition:border-color .2s;border-left:3px solid transparent}
    .guide-card:hover{border-color:var(--accent)}
    .guide-card.g-amber{border-left-color:#f5a623}
    .guide-card.g-blue{border-left-color:#4a9eff}
    .guide-card.g-green{border-left-color:#4caf50}
    .guide-card.g-purple{border-left-color:#7c6af5}
    .guide-card-title{font-weight:700;font-size:14px;color:var(--text);margin-bottom:4px}
    .guide-card-desc{font-size:12px;color:var(--text2);line-height:1.4}
    /* Deal-in animation — cards slide from right and flip face-up */
    @keyframes dealIn{0%{transform:translateX(120px) rotateY(90deg);opacity:0}60%{transform:translateX(-6px) rotateY(-8deg);opacity:1}80%{transform:translateX(3px) rotateY(4deg)}100%{transform:translateX(0) rotateY(0deg);opacity:1}}
    @keyframes regenIn{0%{transform:scale(.88) rotateY(90deg);opacity:0}70%{transform:scale(1.04) rotateY(-6deg);opacity:1}100%{transform:scale(1) rotateY(0deg);opacity:1}}
    .cmd-result-card.deal-in{animation:dealIn .45s cubic-bezier(.22,.68,0,1.2) both}
    .cmd-result-card.regen-in{animation:regenIn .4s cubic-bezier(.22,.68,0,1.2) both}
    /* Skeleton shimmer while waiting */
    @keyframes cmdShimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}
    .cmd-skeleton{background:linear-gradient(90deg,var(--bg3) 25%,rgba(255,255,255,.04) 50%,var(--bg3) 75%);background-size:800px 100%;animation:cmdShimmer 1.4s infinite linear;border-radius:12px;min-height:300px}
  </style>
</head>
<body>
${NAV}
<div class="wrap" style="padding-top:32px">
  <div style="text-align:center;margin-bottom:32px">
    <div style="display:inline-block;background:linear-gradient(135deg,rgba(245,166,35,.15),rgba(124,106,245,.15));border:1px solid rgba(245,166,35,.3);border-radius:100px;padding:6px 16px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-bottom:14px">10,000+ Legendary Creatures</div>
    <h1 style="font-size:36px;margin-bottom:10px;font-weight:800;letter-spacing:-.02em">🎲 Random Commander Generator</h1>
    <p style="color:var(--text2);max-width:560px;margin:0 auto;font-size:15px">Roll your next Commander build. Filter by colour and mana value, reroll any slot, then dare a friend to top it.</p>
  </div>

  <!-- Pre-generate challenge teaser -->
  <div style="max-width:660px;margin:0 auto 20px;background:linear-gradient(90deg,rgba(124,106,245,.1),rgba(245,166,35,.08));border:1px solid rgba(124,106,245,.25);border-radius:10px;padding:12px 18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    <span style="font-size:20px">⚔️</span>
    <div style="flex:1;min-width:180px">
      <div style="font-size:13px;font-weight:700;color:var(--text)">Roll your pod. Dare a friend.</div>
      <div style="font-size:12px;color:var(--text2)">Generate 4 random Commanders and share the link — see who builds the better deck.</div>
    </div>
  </div>

  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:32px;max-width:660px;margin:0 auto 32px">

    <!-- Trust bullets -->
    <div class="trust-bullets">
      <div class="trust-bullet"><span>🎴</span> Pulls from 10,000+ legendary creatures</div>
      <div class="trust-bullet"><span>💰</span> Live AUD prices shown</div>
      <div class="trust-bullet"><span>🔄</span> Reroll any single slot</div>
    </div>

    <div style="margin-bottom:22px">
      <p style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text2);margin-bottom:10px">How many Commanders?</p>
      <div style="display:flex;gap:8px">
        ${[1,2,3,4].map(n => `<button class="count-btn${n===4?' active':''}" data-count="${n}" onclick="setCount(this,${n})">${n}</button>`).join('')}
      </div>
    </div>

    <div style="margin-bottom:6px">
      <p style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text2);margin-bottom:10px">Colour Identity (optional)</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="color-btn" style="background:#f9faf4;color:#333" data-color="W" onclick="toggleColor(this)" title="White">W</button>
        <button class="color-btn" style="background:#aae0fa;color:#003" data-color="U" onclick="toggleColor(this)" title="Blue">U</button>
        <button class="color-btn" style="background:#2a2a2a;color:#eee" data-color="B" onclick="toggleColor(this)" title="Black">B</button>
        <button class="color-btn" style="background:#f9aa8f;color:#500" data-color="R" onclick="toggleColor(this)" title="Red">R</button>
        <button class="color-btn" style="background:#9bd3ae;color:#030" data-color="G" onclick="toggleColor(this)" title="Green">G</button>
      </div>
      <div class="how-tip">🎨 <strong>How colour filtering works:</strong> Selecting W + B shows commanders whose identity fits <em>within</em> those colours — so mono-white, mono-black, and Orzhov (W/B) commanders all appear. Leave blank to roll from all 5 colours.</div>
    </div>

    <div style="margin-bottom:28px;margin-top:18px">
      <p style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text2);margin-bottom:10px">Max Mana Value (optional)</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${[2,3,4,5,6,7,'Any'].map(v => `<button class="cmc-btn${v==='Any'?' active':''}" data-cmc="${v}" onclick="setCmc(this,${v==='Any'?99:v})">${v}</button>`).join('')}
      </div>
    </div>

    <button class="btn btn-primary" id="generate-btn" style="font-size:16px;padding:14px;width:100%;letter-spacing:.02em" onclick="generateAll()">
      ✨ Generate 4 Commanders
    </button>
  </div>

  <div id="results-section">
    <div id="results-grid"></div>

    <div style="text-align:center;margin-bottom:28px">
      <button class="btn btn-secondary" style="padding:10px 28px" onclick="generateAll()">🎲 Generate All Again</button>
    </div>

    <!-- Challenge a Friend — upgraded -->
    <div class="challenge-bar">
      <div style="font-size:32px;margin-bottom:8px">⚔️</div>
      <div class="challenge-title">Think You Can Build Better?</div>
      <div class="challenge-sub">Send your friend this exact Commander pod and see who builds the stronger deck. No excuses — same pool, best builder wins.</div>
      <div class="share-row">
        <button class="sbtn sbtn-discord" onclick="shareDiscord()">Discord</button>
        <a class="sbtn sbtn-reddit" id="reddit-btn" href="#" target="_blank" rel="noopener">Reddit</a>
        <a class="sbtn sbtn-twitter" id="twitter-btn" href="#" target="_blank" rel="noopener">𝕏 Twitter</a>
        <a class="sbtn sbtn-whatsapp" id="whatsapp-btn" href="#" target="_blank" rel="noopener">WhatsApp</a>
        <button class="sbtn sbtn-copy" id="copy-btn" onclick="copyLink()">📋 Copy Link</button>
      </div>
    </div>
  </div>

  <!-- Related Guides — upgraded with coloured cards -->
  <div style="max-width:900px;margin:0 auto 48px">
    <h3 style="font-size:18px;font-weight:700;margin-bottom:16px">Explore More</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
      <a href="/cards/mtg/random-commander" class="guide-card g-amber">
        <div class="guide-card-title">🎲 Random Commander</div>
        <div class="guide-card-desc">Roll again with different filters. Find your next build.</div>
      </a>
      <a href="/blog/mtg-commander-decks-australia/" class="guide-card g-purple">
        <div class="guide-card-title">👑 Best Commander Decks AU</div>
        <div class="guide-card-desc">Top-rated precons and budget builds available in Australia.</div>
      </a>
      <a href="/ev-calculator.html" class="guide-card g-blue">
        <div class="guide-card-title">📊 EV Calculator</div>
        <div class="guide-card-desc">Is your next booster box actually worth cracking?</div>
      </a>
      <a href="/cards/mtg" class="guide-card g-green">
        <div class="guide-card-title">🃏 Browse All MTG Cards</div>
        <div class="guide-card-desc">Search 96,000+ cards with live AUD pricing.</div>
      </a>
    </div>
  </div>
</div>

<footer>
  <p><a href="/">Home</a><a href="/cards/mtg">MTG Cards</a><a href="/cards/mtg/random-commander">Random Commander</a><a href="/ev-calculator.html">EV Calculator</a><a href="/blog">Blog</a></p>
  <p style="margin-top:8px">© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
</footer>

<script>
window.C3_SUPA_URL = '${SUPABASE_URL}';
window.C3_SUPA_KEY = '${SUPABASE_ANON_KEY}';

let selectedColors = [];
let selectedCmc = 99;
let selectedCount = 4;
let currentSlugs = [];

(function() {
  const p = new URLSearchParams(location.search);
  if (p.get('colors')) {
    selectedColors = p.get('colors').split('');
    document.querySelectorAll('.color-btn').forEach(b => {
      if (selectedColors.includes(b.dataset.color)) b.classList.add('selected');
    });
  }
  if (p.get('cmc') && p.get('cmc') !== '99') {
    selectedCmc = parseInt(p.get('cmc'));
    document.querySelectorAll('.cmc-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.cmc == selectedCmc);
    });
  }
  if (p.get('count')) {
    selectedCount = parseInt(p.get('count')) || 4;
    document.querySelectorAll('.count-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.count) === selectedCount);
    });
  }
  updateGenerateBtn();
  if (p.get('auto') === '1') generateAll();
})();

function setCount(btn, n) {
  selectedCount = n;
  document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateGenerateBtn();
}

function updateGenerateBtn() {
  const btn = document.getElementById('generate-btn');
  if (btn) btn.textContent = '\u2728 Generate ' + selectedCount + ' Commander' + (selectedCount > 1 ? 's' : '');
}

function toggleColor(btn) {
  const color = btn.dataset.color;
  if (selectedColors.includes(color)) {
    selectedColors = selectedColors.filter(c => c !== color);
    btn.classList.remove('selected');
  } else {
    selectedColors.push(color);
    btn.classList.add('selected');
  }
}

function setCmc(btn, val) {
  selectedCmc = val;
  document.querySelectorAll('.cmc-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function fetchOneCommander(exclude) {
  // Build PostgREST query — no leading wildcard on type_line so the btree index can be used
  const filters = [];
  filters.push('select=name,type_line,image_uri_normal,image_uri_small,price_aud,price_usd,slug,color_identity,cmc');
  // Prefix match only — 'Legendary Creature%' uses the btree index, avoids full table scan
  filters.push('type_line=ilike.Legendary Creature*');
  // Skip digital cards
  filters.push('digital=eq.false');
  // CMC filter
  if (selectedCmc < 99) filters.push('cmc=lte.' + selectedCmc);
  // Exclude already-shown slugs
  if (exclude && exclude.length) {
    filters.push('slug=not.in.(' + exclude.map(encodeURIComponent).join(',') + ')');
  }
  // Colour identity: cd.{} uses the GIN index on color_identity text[]
  if (selectedColors.length) {
    filters.push('color_identity=cd.{' + selectedColors.join(',') + '}');
  }
  // Random offset gives variety without loading thousands of rows.
  // First fetch the count so we can pick a valid offset.
  const countFilters = filters.slice(1); // same filters minus select
  const countUrl = window.C3_SUPA_URL + '/rest/v1/mtg_cards?'
    + countFilters.join('&')
    + '&select=slug'
    + '&limit=1'
    + '&offset=0';

  let pool = 200; // fallback
  try {
    const countRes = await fetch(window.C3_SUPA_URL + '/rest/v1/mtg_cards?'
      + countFilters.join('&') + '&select=slug&limit=200', {
      headers: { 'apikey': window.C3_SUPA_KEY, 'Prefer': 'count=exact' }
    });
    const countHeader = countRes.headers.get('content-range');
    if (countHeader) {
      const total = parseInt(countHeader.split('/')[1], 10);
      if (!isNaN(total) && total > 0) pool = total;
    }
  } catch(e) { /* use fallback pool */ }

  const offset = Math.floor(Math.random() * Math.min(pool, 2000));
  filters.push('limit=1');
  filters.push('offset=' + offset);

  const queryString = filters.join('&');
  const url = window.C3_SUPA_URL + '/rest/v1/mtg_cards?' + queryString;

  try {
    const res = await fetch(url, {
      headers: { 'apikey': window.C3_SUPA_KEY }
    });
    if (!res.ok) {
      console.error('Supabase request failed:', res.status, await res.text());
      return null;
    }
    const cards = await res.json();
    if (!Array.isArray(cards) || cards.length === 0) return null;
    return cards[0];
  } catch (err) {
    console.error('Random commander fetch error:', err);
    return null;
  }
}

function cardHTML(card, index, animClass) {
  const price = card.price_aud > 0
    ? 'AU$' + parseFloat(card.price_aud).toFixed(2)
    : card.price_usd ? '~AU$' + (card.price_usd * 1.58).toFixed(2) : 'Price N/A';
  const img = card.image_uri_normal || card.image_uri_small || '';
  // Colour identity pips
  const ci = Array.isArray(card.color_identity) ? card.color_identity : [];
  const pipColours = { W:'#f9faf4', U:'#aae0fa', B:'#2a2a2a', R:'#f9aa8f', G:'#9bd3ae' };
  const pipText    = { W:'#333',    U:'#003',    B:'#eee',    R:'#500',    G:'#030' };
  const pipsHTML = ci.length
    ? '<div style="display:flex;gap:4px;margin-bottom:8px">' + ci.map(c =>
        '<span style="width:18px;height:18px;border-radius:50%;background:' + (pipColours[c]||'#888')
        + ';color:' + (pipText[c]||'#fff') + ';font-size:10px;font-weight:700;display:inline-flex;align-items:center;justify-content:center">' + c + '</span>'
      ).join('') + '</div>'
    : '<div style="display:flex;gap:4px;margin-bottom:8px"><span style="width:18px;height:18px;border-radius:50%;background:#888;color:#fff;font-size:10px;font-weight:700;display:inline-flex;align-items:center;justify-content:center">C</span></div>';
  const anim = animClass || 'deal-in';
  const delay = typeof index === 'number' ? (index * 0.15) + 's' : '0s';
  return '<div class="cmd-result-card ' + anim + '" id="card-slot-' + index + '" style="animation-delay:' + delay + '">'
    + (img ? '<img src="' + img + '" alt="' + card.name.replace(/"/g,'&quot;') + '" class="cmd-result-img">' : '')
    + '<div class="cmd-result-body">'
    + '<div class="cmd-result-name">' + card.name + '</div>'
    + '<div class="cmd-result-type">' + (card.type_line || '') + '</div>'
    + pipsHTML
    + '<div class="cmd-result-price">' + price + '</div>'
    + '<a href="/cards/mtg/' + card.slug + '" class="cmd-result-view" target="_blank">View Card \u2192</a>'
    + '<button class="cmd-regen-btn" onclick="regenOne(' + index + ')">\ud83d\udd04 Reroll this one</button>'
    + '</div></div>';
}

async function generateAll() {
  const grid = document.getElementById('results-grid');
  const section = document.getElementById('results-section');
  const btn = document.getElementById('generate-btn');
  btn.disabled = true;
  btn.textContent = '\u23f3 Rolling...';
  // Shimmer skeletons while fetching — more polished than static grey blocks
  grid.innerHTML = Array.from({length: selectedCount}, (_,i) =>
    '<div class="cmd-skeleton" style="animation-delay:' + (i * 0.08) + 's"></div>'
  ).join('');
  section.classList.add('visible');
  try {
    const fetched = await Promise.all(
      Array.from({length: selectedCount}, () => fetchOneCommander([]))
    );
    const results = fetched.filter(Boolean);
    currentSlugs = results.map(c => c.slug);
    if (results.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text2)">No commanders found with these filters. Try widening colour or mana value.</div>';
    } else {
      // Render cards — deal-in animation with staggered delays
      grid.innerHTML = results.map((c, i) => cardHTML(c, i, 'deal-in')).join('');
    }
    section.scrollIntoView({ behavior: 'smooth' });
    updateShareLinks(results);
    pushUrlState();
  } catch (err) {
    console.error('Generate failed:', err);
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#f88">Something went wrong. Open DevTools console for details and report back.</div>';
  } finally {
    btn.disabled = false;
    btn.textContent = '\u2728 Generate ' + selectedCount + ' Commander' + (selectedCount > 1 ? 's' : '');
  }
}

async function regenOne(index) {
  const slot = document.getElementById('card-slot-' + index);
  if (!slot) return;
  // Quick fade out, then replace with shimmer while fetching
  slot.style.transition = 'opacity .15s';
  slot.style.opacity = '0';
  setTimeout(() => {
    slot.outerHTML = '<div class="cmd-skeleton" id="card-slot-' + index + '" style="min-height:300px"></div>';
  }, 150);
  const card = await fetchOneCommander([...currentSlugs]);
  const target = document.getElementById('card-slot-' + index);
  if (!card) { if (target) target.outerHTML = '<div class="cmd-result-card" id="card-slot-' + index + '" style="min-height:300px;display:flex;align-items:center;justify-content:center;color:var(--text2);font-size:12px">No result — try again</div>'; return; }
  currentSlugs[index] = card.slug;
  if (target) target.outerHTML = cardHTML(card, index, 'regen-in');
}

function updateShareLinks(results) {
  const names = results.map(c => c.name).join(', ');
  const url = location.origin + '/cards/mtg/random-commander?colors='
    + (selectedColors.join('') || '') + '&cmc=' + selectedCmc + '&count=' + selectedCount + '&auto=1';
  const tweetText = encodeURIComponent('I just rolled ' + names + ' as my Commander pod. Can you beat it? Try the random generator: ' + url);
  const redditTitle = encodeURIComponent('Random Commander pod: ' + names + ' \u2014 try it yourself');
  const waText = encodeURIComponent('Check out my random Commander pod: ' + names + '. Think you can build better? ' + url);
  document.getElementById('twitter-btn').href = 'https://twitter.com/intent/tweet?text=' + tweetText;
  document.getElementById('reddit-btn').href = 'https://www.reddit.com/submit?url=' + encodeURIComponent(url) + '&title=' + redditTitle;
  document.getElementById('whatsapp-btn').href = 'https://wa.me/?text=' + waText;
}

function shareDiscord() {
  const url = location.origin + '/cards/mtg/random-commander?colors='
    + (selectedColors.join('') || '') + '&cmc=' + selectedCmc + '&count=' + selectedCount + '&auto=1';
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.querySelector('.sbtn-discord');
    const orig = btn.textContent;
    btn.textContent = '✅ Copied for Discord!';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  });
}

function pushUrlState() {
  const params = new URLSearchParams();
  if (selectedColors.length) params.set('colors', selectedColors.join(''));
  if (selectedCmc < 99) params.set('cmc', selectedCmc);
  params.set('count', selectedCount);
  history.replaceState({}, '', '/cards/mtg/random-commander?' + params);
}

function copyLink() {
  const url = location.origin + '/cards/mtg/random-commander?colors='
    + (selectedColors.join('') || '') + '&cmc=' + selectedCmc + '&count=' + selectedCount + '&auto=1';
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.textContent = '\u2705 Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '\ud83d\udccb Copy Link'; btn.classList.remove('copied'); }, 2000);
  });
}
</script>
<style>
@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.7}}
</style>
<!-- GA4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
</body></html>`;
}

// Set Index Page — P2 rebuild with full filter system
async function renderSetIndex(setSlug) {
  const sets = await supabaseGet(`mtg_sets?set_slug=eq.${setSlug}&limit=1&select=set_code,set_name,set_type,release_date,card_count,amazon_asin,parent_set_code,set_slug`);
  if (!sets || !sets[0]) return null;
  const set = sets[0];

  // Fetch related sets in parallel with cards:
  // - Sub-sets of this set (this is a parent)
  // - Sibling sets (share the same parent_set_code)
  // - Parent set info (if this is a sub-set)
  const [cards, subSets, siblingData] = await Promise.all([
    supabaseGet(
      `mtg_cards?set_code=eq.${set.set_code}&order=price_usd.desc.nullslast&limit=400` +
      `&select=slug,name,image_uri_small,price_usd,price_aud,rarity,collector_number,color_identity,type_line,cmc`
    ),
    // Sub-sets where this is the parent
    supabaseGet(`mtg_sets?parent_set_code=eq.${set.set_code}&select=set_code,set_name,set_slug,release_date&order=set_name.asc`),
    // Siblings + parent — if this set has a parent_set_code
    set.parent_set_code
      ? supabaseGet(`mtg_sets?or=(set_code.eq.${set.parent_set_code},parent_set_code.eq.${set.parent_set_code})&select=set_code,set_name,set_slug,release_date&order=set_name.asc`)
      : Promise.resolve([])
  ]);

  // Build related sets nav: parent + siblings + children
  const relatedSets = [];

  // If this is a sub-set: show parent and all siblings (excluding self)
  if (set.parent_set_code && siblingData.length) {
    const parent = siblingData.find(s => s.set_code === set.parent_set_code);
    const siblings = siblingData.filter(s => s.set_code !== set.set_code && s.set_code !== set.parent_set_code);
    if (parent) relatedSets.push({ ...parent, label: 'Parent' });
    siblings.forEach(s => relatedSets.push({ ...s, label: 'Variant' }));
  }

  // If this is a parent: show its sub-sets
  if (subSets.length) {
    subSets.forEach(s => relatedSets.push({ ...s, label: 'Sub-set' }));
  }

  const relatedSetsHTML = relatedSets.length ? `
    <div style="margin-bottom:24px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px">
      <p style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text2);margin-bottom:10px">Also in This Release</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${relatedSets.map(s => `<a href="/cards/mtg/sets/${s.set_slug}"
          style="padding:6px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;text-decoration:none;font-size:11px;transition:border-color .15s"
          onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
          <span style="color:var(--text2);font-size:9px;text-transform:uppercase;letter-spacing:.06em;margin-right:4px">${s.label}</span>
          <span style="color:var(--text);font-weight:600">${s.set_name}</span>
        </a>`).join('')}
      </div>
    </div>` : '';

  // Helper: convert price_usd to AUD
  const toAud = (c) => {
    if (c.price_aud && c.price_aud > 0) return parseFloat(c.price_aud);
    if (c.price_usd && c.price_usd > 0) return parseFloat(c.price_usd) * 1.58;
    return 0;
  };

  // Helper: extract primary card type from type_line
  const primaryType = (typeLine) => {
    if (!typeLine) return 'Other';
    const tl = typeLine.toLowerCase();
    if (tl.includes('land')) return 'Land';
    if (tl.includes('creature')) return 'Creature';
    if (tl.includes('planeswalker')) return 'Planeswalker';
    if (tl.includes('instant')) return 'Instant';
    if (tl.includes('sorcery')) return 'Sorcery';
    if (tl.includes('enchantment')) return 'Enchantment';
    if (tl.includes('artifact')) return 'Artifact';
    if (tl.includes('battle')) return 'Battle';
    return 'Other';
  };

  // Rarity colours and dots
  const rarityColour = { mythic:'#f5a623', rare:'#a855f7', uncommon:'#6ba3be', common:'#9ca3af' };

  // Colour identity key for data attribute: sorted WUBRG order, joined
  const colourKey = (ci) => {
    if (!ci || !ci.length) return 'C';
    if (ci.length > 1) return 'M'; // multicolour
    return ci[0];
  };

  // Top 5 spotlight — already sorted by price desc from query
  const top5 = cards.filter(c => toAud(c) > 0).slice(0, 5);
  const top5HTML = top5.map(c => {
    const aud = toAud(c);
    const rc = rarityColour[c.rarity] || '#9ca3af';
    return `<a href="/cards/mtg/${c.slug}" class="spotlight-card">
      <div class="spotlight-rarity-dot" style="background:${rc}"></div>
      ${c.image_uri_small
        ? `<img src="${c.image_uri_small}" alt="${c.name}" class="spotlight-img" loading="lazy">`
        : `<div class="spotlight-img-ph">${c.name}</div>`}
      <div class="spotlight-name">${c.name}</div>
      <div class="spotlight-price">~AU$${aud.toFixed(0)}</div>
      <div class="spotlight-cta">View Card →</div>
    </a>`;
  }).join('');

  // Context paragraph — top 2 named cards
  const topTwo = cards.filter(c => toAud(c) > 0).slice(0, 2);
  const contextText = topTwo.length >= 2
    ? `${set.set_name} contains ${cards.length} cards. The most valuable in this set are <strong>${topTwo[0].name}</strong> at ~AU$${toAud(topTwo[0]).toFixed(0)} and <strong>${topTwo[1].name}</strong> at ~AU$${toAud(topTwo[1]).toFixed(0)}. Prices are updated daily and displayed in AUD.`
    : `${set.set_name} contains ${cards.length} cards. Prices are updated daily and displayed in AUD.`;

  // Main card grid HTML — data attributes for all filter dimensions
  const cardGrid = cards.map(c => {
    const aud = toAud(c);
    const priceDisplay = aud >= 0.50 ? `~AU$${aud.toFixed(0)}` : '<span style="color:rgba(160,168,192,.35);font-size:9px">no price</span>';
    const rc = rarityColour[c.rarity] || '#9ca3af';
    const ciArr = Array.isArray(c.color_identity) ? c.color_identity : [];
    const ciKey = colourKey(ciArr);
    const ciRaw = ciArr.join(',');
    const type = primaryType(c.type_line);
    const cmc = c.cmc || 0;
    // Inline SVG pips — no external dependency
    const pipsHtml = ciArr.length
      ? ciArr.map(pip => manaPip(pip, 12)).join('')
      : manaPip('C', 12);
    return `<a href="/cards/mtg/${c.slug}"
        class="card-item"
        data-rarity="${c.rarity || ''}"
        data-price="${aud.toFixed(2)}"
        data-colour="${ciKey}"
        data-colour-raw="${ciRaw}"
        data-type="${type}"
        data-cmc="${cmc}">
      <div class="card-rarity-dot" style="background:${rc}"></div>
      <div class="card-colour-pips">${pipsHtml}</div>
      ${c.image_uri_small
        ? `<img src="${c.image_uri_small}" alt="${c.name}" class="card-img" loading="lazy">`
        : `<div class="card-img-ph">${c.name}</div>`}
      <div class="card-name">${c.name}</div>
      <div class="card-price">${priceDisplay}</div>
    </a>`;
  }).join('');

  const hasEVCalc = ['stx','sos','mh3','ltr','woe','mkm','otj','blb','dsk','fdn','dft','tdm'].includes(set.set_code);

  // Schema.org CollectionPage JSON-LD
  const schemaLD = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": `${set.set_name} Card Prices Australia`,
    "description": `All ${cards.length} cards from ${set.set_name} with current AUD prices. Updated daily.`,
    "url": `https://cardsoncardsoncards.com.au/cards/mtg/sets/${setSlug}`,
    "provider": { "@type": "Organization", "name": "Cards on Cards on Cards", "url": "https://cardsoncardsoncards.com.au" }
  });

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${set.set_name} Card Prices Australia | Cards on Cards on Cards</title>
  <meta name="description" content="Browse all ${cards.length} ${set.set_name} cards with live AUD pricing, colour identity filters, type filters and eBay AU buy links. Updated daily.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/mtg/sets/${setSlug}">
  <script type="application/ld+json">${schemaLD}</script>
  ${BASE_STYLES}
<style>
/* ── Spotlight top-5 ── */
.spotlight-row{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;margin-bottom:32px;scrollbar-width:thin}
.spotlight-card{flex:0 0 150px;background:var(--bg2);border:1px solid rgba(201,168,76,.25);border-radius:10px;padding:10px;text-align:center;text-decoration:none;position:relative;transition:all .2s}
.spotlight-card:hover{border-color:var(--accent);transform:translateY(-2px)}
.spotlight-rarity-dot{position:absolute;top:6px;right:6px;width:8px;height:8px;border-radius:50%}
.spotlight-img{width:100%;border-radius:6px;display:block}
.spotlight-img-ph{height:120px;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text2)}
.spotlight-name{font-size:10px;color:var(--text);margin-top:6px;line-height:1.3;font-weight:600}
.spotlight-price{font-family:'Cinzel',serif;font-size:14px;color:var(--accent);font-weight:700;margin-top:3px}
.spotlight-cta{font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;margin-top:3px}
/* ── Filter bar ── */
.filter-bar{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:18px 20px;margin-bottom:24px}
.filter-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.filter-row:last-child{margin-bottom:0}
.filter-label{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text2);min-width:90px;flex-shrink:0}
.filter-btn{padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:none;color:var(--text2);font-size:11px;font-weight:600;cursor:pointer;transition:all .18s;font-family:sans-serif;display:inline-flex;align-items:center;gap:4px}
.filter-btn:hover{border-color:var(--accent);color:var(--accent)}
.filter-btn.active{border-color:var(--accent);color:var(--accent);background:rgba(201,168,76,.1)}
.filter-btn.colour-btn{padding:4px 8px}
.filter-btn.colour-btn.active{box-shadow:0 0 0 2px var(--accent)}
.mana-pip-filter{width:18px;height:18px;vertical-align:middle}
.sort-select{background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:5px 10px;border-radius:6px;font-size:11px;font-family:sans-serif;cursor:pointer}
.filter-actions{display:flex;align-items:center;gap:12px;margin-top:4px}
.filter-count{font-size:12px;color:var(--text2)}
.clear-btn{background:none;border:1px solid var(--border);color:var(--text2);padding:5px 12px;border-radius:6px;font-size:11px;cursor:pointer;font-family:sans-serif}
.clear-btn:hover{border-color:#f44;color:#f44}
/* ── Card grid ── */
#card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
.card-item{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center;display:block;transition:border-color .2s;position:relative;text-decoration:none}
.card-item:hover{border-color:var(--accent)}
.card-rarity-dot{position:absolute;top:5px;right:5px;width:7px;height:7px;border-radius:50%}
.card-colour-pips{position:absolute;top:5px;left:5px;display:flex;gap:1px;flex-wrap:wrap;max-width:36px}
.mana-pip{width:12px;height:12px}
.card-img{width:100%;border-radius:5px;display:block;margin-top:2px}
.card-img-ph{height:70px;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text2)}
.card-name{font-size:10px;margin-top:4px;color:var(--text);line-height:1.2}
.card-price{font-size:11px;color:var(--accent);font-weight:700;margin-top:2px}
/* ── Context box ── */
.context-box{background:rgba(201,168,76,.04);border:1px solid rgba(201,168,76,.15);border-radius:10px;padding:16px 20px;margin-bottom:24px;font-size:13px;color:var(--text2);line-height:1.6}
.context-box strong{color:var(--accent)}
</style>
</head>
<body>
${NAV}
<div class="wrap" style="padding-top:32px">

  <!-- Breadcrumb -->
  <div style="font-size:12px;color:var(--text2);margin-bottom:16px">
    <a href="/" style="color:var(--text2)">Home</a> ›
    <a href="/cards" style="color:var(--text2)">Card Vault</a> ›
    <a href="/cards/mtg" style="color:var(--text2)">MTG Cards</a> ›
    <span style="color:var(--accent)">${set.set_name}</span>
  </div>

  <!-- Header -->
  <h1 style="font-family:'Cinzel',serif;font-size:clamp(22px,4vw,36px);margin-bottom:6px">${set.set_name} <span style="color:var(--accent)">Card Prices</span></h1>
  <p style="color:var(--text2);margin-bottom:20px;font-size:14px">${cards.length} cards · Released ${set.release_date ? new Date(set.release_date).toLocaleDateString('en-AU', {day:'numeric',month:'long',year:'numeric'}) : 'N/A'} · AUD prices updated daily</p>

  <!-- CTAs row -->
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px">
    ${hasEVCalc ? `<a href="/ev-calculator.html#${set.set_code}" style="background:rgba(124,106,245,.15);border:1px solid var(--accent2);color:var(--accent2);padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">📊 EV Calculator</a>` : ''}
    ${set.amazon_asin ? `<a href="https://www.amazon.com.au/dp/${set.amazon_asin}?tag=blasdigital-22" target="_blank" rel="noopener" style="background:#232f3e;border:1px solid #f90;color:#f90;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">📦 Buy Sealed on Amazon AU</a>` : ''}
    <a href="/blog" style="background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:9px 16px;border-radius:8px;font-size:13px;text-decoration:none">📖 Buying Guides</a>
    <a href="https://www.ebay.com.au/str/cardsoncardsoncards?_nkw=${encodeURIComponent(set.set_name)}&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=5339146789&customid=C3SetPage&toolid=10001&mkevt=1" target="_blank" rel="noopener" style="background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.3);color:#60a5fa;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">🛒 Buy Singles on eBay ↗</a>
  </div>

  <!-- Related sets (sub-sets, siblings, parent) -->
  ${relatedSetsHTML}

  <!-- Context paragraph -->
  <div class="context-box">${contextText}</div>

  <!-- Commander carousel for this set -->
  <div id="set-cmd-section" style="margin-bottom:28px;background:rgba(107,107,255,.04);border:1px solid rgba(107,107,255,.15);border-radius:12px;padding:20px;overflow:hidden">
    <p style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#9898FF;margin-bottom:10px;text-align:center">Commanders in this Set</p>
    <div style="overflow:hidden;position:relative;mask-image:linear-gradient(to right,transparent,black 4%,black 96%,transparent);-webkit-mask-image:linear-gradient(to right,transparent,black 4%,black 96%,transparent)">
      <div id="set-cmd-track" style="display:flex;gap:10px;width:max-content">
        <div style="min-width:120px;height:170px;background:rgba(107,107,255,.08);border-radius:8px"></div>
        <div style="min-width:120px;height:170px;background:rgba(107,107,255,.08);border-radius:8px"></div>
        <div style="min-width:120px;height:170px;background:rgba(107,107,255,.08);border-radius:8px"></div>
        <div style="min-width:120px;height:170px;background:rgba(107,107,255,.08);border-radius:8px"></div>
      </div>
    </div>
  </div>
  <style>
  @keyframes set-cmd-scroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
  .set-cmd-track-loaded{animation:set-cmd-scroll 45s linear infinite}
  .set-cmd-track-loaded:hover{animation-play-state:paused}
  .set-cmd-card{display:inline-flex;flex-direction:column;min-width:120px;max-width:130px;background:rgba(107,107,255,.06);border:1px solid rgba(107,107,255,.2);border-radius:8px;overflow:hidden;text-decoration:none;transition:all .2s;flex-shrink:0}
  .set-cmd-card:hover{border-color:rgba(107,107,255,.5);transform:translateY(-2px)}
  .set-cmd-card img{width:100%;aspect-ratio:745/1040;object-fit:cover;display:block}
  .set-cmd-card-body{padding:5px 7px 7px;display:flex;flex-direction:column;gap:2px}
  .set-cmd-card-name{font-size:9px;font-weight:700;color:#C0C0FF;line-height:1.2}
  .set-cmd-card-id{font-size:8px;color:rgba(160,168,192,.5)}
  </style>

  <!-- Filter bar -->
  <div class="filter-bar">

    <!-- Colour Identity — multi-select toggle, AND logic -->
    <div class="filter-row">
      <span class="filter-label">Colour</span>
      <button class="filter-btn colour-btn active" data-colour-filter="all" onclick="toggleColour(this,'all')">All</button>
      <button class="filter-btn colour-btn" data-colour-filter="W" onclick="toggleColour(this,'W')">${manaFilterPip('W')} White</button>
      <button class="filter-btn colour-btn" data-colour-filter="U" onclick="toggleColour(this,'U')">${manaFilterPip('U')} Blue</button>
      <button class="filter-btn colour-btn" data-colour-filter="B" onclick="toggleColour(this,'B')">${manaFilterPip('B')} Black</button>
      <button class="filter-btn colour-btn" data-colour-filter="R" onclick="toggleColour(this,'R')">${manaFilterPip('R')} Red</button>
      <button class="filter-btn colour-btn" data-colour-filter="G" onclick="toggleColour(this,'G')">${manaFilterPip('G')} Green</button>
      <button class="filter-btn colour-btn" data-colour-filter="C" onclick="toggleColour(this,'C')">${manaFilterPip('C')} Colourless</button>
    </div>

    <!-- Type — multi-select toggle -->
    <div class="filter-row">
      <span class="filter-label">Type</span>
      <button class="filter-btn active" data-type-filter="all" onclick="toggleType(this,'all')">All</button>
      <button class="filter-btn" data-type-filter="Creature" onclick="toggleType(this,'Creature')">Creature</button>
      <button class="filter-btn" data-type-filter="Instant" onclick="toggleType(this,'Instant')">Instant</button>
      <button class="filter-btn" data-type-filter="Sorcery" onclick="toggleType(this,'Sorcery')">Sorcery</button>
      <button class="filter-btn" data-type-filter="Artifact" onclick="toggleType(this,'Artifact')">Artifact</button>
      <button class="filter-btn" data-type-filter="Enchantment" onclick="toggleType(this,'Enchantment')">Enchantment</button>
      <button class="filter-btn" data-type-filter="Planeswalker" onclick="toggleType(this,'Planeswalker')">Planeswalker</button>
      <button class="filter-btn" data-type-filter="Land" onclick="toggleType(this,'Land')">Land</button>
      <button class="filter-btn" data-type-filter="Battle" onclick="toggleType(this,'Battle')">Battle</button>
    </div>

    <!-- Rarity — multi-select toggle -->
    <div class="filter-row">
      <span class="filter-label">Rarity</span>
      <button class="filter-btn active" data-rarity-filter="all" onclick="toggleRarity(this,'all')">All</button>
      <button class="filter-btn" data-rarity-filter="mythic" onclick="toggleRarity(this,'mythic')" style="color:#f5a623;border-color:rgba(245,166,35,.3)">◆ Mythic</button>
      <button class="filter-btn" data-rarity-filter="rare" onclick="toggleRarity(this,'rare')" style="color:#a855f7;border-color:rgba(168,85,247,.3)">◆ Rare</button>
      <button class="filter-btn" data-rarity-filter="uncommon" onclick="toggleRarity(this,'uncommon')" style="color:#6ba3be;border-color:rgba(107,163,190,.3)">◆ Uncommon</button>
      <button class="filter-btn" data-rarity-filter="common" onclick="toggleRarity(this,'common')" style="color:#9ca3af;border-color:rgba(156,163,175,.3)">◆ Common</button>
    </div>

    <!-- Mana Value — multi-select toggle -->
    <div class="filter-row">
      <span class="filter-label">Mana Value</span>
      <button class="filter-btn active" data-cmc-filter="all" onclick="toggleCmc(this,'all')">All</button>
      ${[0,1,2,3,4,5].map(n => `<button class="filter-btn" data-cmc-filter="${n}" onclick="toggleCmc(this,'${n}')">${manaPip(String(n), 16)} ${n}</button>`).join('')}
      <button class="filter-btn" data-cmc-filter="6" onclick="toggleCmc(this,'6')">${manaPip('6plus', 16)} 6+</button>
    </div>

    <!-- Sort + Price + Actions -->
    <div class="filter-row" style="justify-content:space-between">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <span class="filter-label">Sort</span>
        <select class="sort-select" id="sort-select" onchange="applyFilters()">
          <option value="price-desc">Price: High to Low</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="name-asc">Name: A to Z</option>
          <option value="name-desc">Name: Z to A</option>
          <option value="cmc-asc">Mana Value: Low to High</option>
          <option value="rarity-desc">Rarity: Mythic first</option>
        </select>
        <span class="filter-label" style="margin-left:12px">Price</span>
        <select class="sort-select" id="filter-price" onchange="applyFilters()">
          <option value="0">Any Price</option>
          <option value="1">AU$1+</option>
          <option value="5">AU$5+</option>
          <option value="10">AU$10+</option>
          <option value="20">AU$20+</option>
          <option value="50">AU$50+</option>
        </select>
      </div>
      <div class="filter-actions">
        <span class="filter-count" id="filter-count"></span>
        <button class="clear-btn" onclick="clearFilters()">Reset All</button>
      </div>
    </div>

  </div>

  <!-- Card grid -->
  <div id="card-grid">${cardGrid}</div>

  <!-- Buylist CTA -->
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:24px;margin-top:36px;text-align:center">
    <p style="font-size:15px;margin-bottom:8px">Pulled some ${set.set_name} cards worth selling?</p>
    <p style="font-size:13px;color:var(--text2);margin-bottom:16px">Join the C3 buylist waitlist and we will let you know when we start buying Australian TCG cards directly.</p>
    <a href="/tracker.html" style="background:var(--accent);color:#0A0C14;padding:10px 24px;border-radius:8px;font-weight:700;font-size:13px;text-decoration:none">Join the Buylist Waitlist →</a>
  </div>

</div>

<footer style="border-top:1px solid var(--border);padding:24px 0;margin-top:48px">
  <div style="max-width:1100px;margin:0 auto;padding:0 24px;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px">
    <div style="font-family:'Cinzel',serif;font-size:12px;color:var(--gold)">Cards on Cards on Cards</div>
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      <a href="/" style="font-size:12px;color:rgba(160,168,192,.4);text-decoration:none">Home</a>
      <a href="/cards" style="font-size:12px;color:rgba(160,168,192,.4);text-decoration:none">Card Vault</a>
      <a href="/cards/mtg" style="font-size:12px;color:rgba(160,168,192,.4);text-decoration:none">MTG Cards</a>
      <a href="/ev-calculator.html" style="font-size:12px;color:rgba(160,168,192,.4);text-decoration:none">EV Calculator</a>
      <a href="/shop.html" style="font-size:12px;color:rgba(160,168,192,.4);text-decoration:none">Shop</a>
      <a href="/blog" style="font-size:12px;color:rgba(160,168,192,.4);text-decoration:none">Blog</a>
    </div>
    <div style="font-size:11px;color:rgba(160,168,192,.25)">© 2026 Cards on Cards on Cards</div>
  </div>
</footer>

<script>
// ── Multi-select filter state (Sets of values) ──────────────────────
const selColours  = new Set(); // empty = all
const selTypes    = new Set();
const selRarities = new Set();
const selCmcs     = new Set();

const RARITY_ORDER = { mythic: 0, rare: 1, uncommon: 2, common: 3 };

// ── Generic multi-select toggle helper ──────────────────────────────
function toggleFilter(btn, val, selSet, allAttr, filterAttr) {
  if (val === 'all') {
    selSet.clear();
    document.querySelectorAll('[' + filterAttr + ']').forEach(b => b.classList.remove('active'));
    document.querySelector('[' + filterAttr + '="all"]').classList.add('active');
  } else {
    // Remove "All" active state
    document.querySelector('[' + filterAttr + '="all"]').classList.remove('active');
    if (selSet.has(val)) {
      selSet.delete(val);
      btn.classList.remove('active');
      if (selSet.size === 0) {
        document.querySelector('[' + filterAttr + '="all"]').classList.add('active');
      }
    } else {
      selSet.add(val);
      btn.classList.add('active');
    }
  }
  applyFilters();
}

function toggleColour(btn, val)  { toggleFilter(btn, val, selColours,  'data-colour-filter', 'data-colour-filter'); }
function toggleType(btn, val)    { toggleFilter(btn, val, selTypes,    'data-type-filter',   'data-type-filter'); }
function toggleRarity(btn, val)  { toggleFilter(btn, val, selRarities, 'data-rarity-filter', 'data-rarity-filter'); }
function toggleCmc(btn, val)     { toggleFilter(btn, val, selCmcs,     'data-cmc-filter',    'data-cmc-filter'); }

// ── Main filter + sort ───────────────────────────────────────────────
function applyFilters() {
  const minPrice = parseFloat(document.getElementById('filter-price').value) || 0;
  const sortVal  = document.getElementById('sort-select').value;
  const grid     = document.getElementById('card-grid');
  const cards    = Array.from(grid.querySelectorAll('.card-item'));

  let visible = 0;
  cards.forEach(card => {
    const rarity   = card.dataset.rarity || '';
    const price    = parseFloat(card.dataset.price) || 0;
    const colRaw   = (card.dataset.colourRaw || '').split(',').filter(Boolean);
    const colKey   = card.dataset.colour || 'C';
    const type     = card.dataset.type || '';
    const cmc      = parseInt(card.dataset.cmc, 10) || 0;

    // Colour: AND logic — card must contain ALL selected colours
    const colOk = selColours.size === 0
      ? true
      : [...selColours].every(sc => sc === 'C' ? colKey === 'C' : colRaw.includes(sc));

    // Type: OR logic — card matches ANY selected type
    const typeOk   = selTypes.size   === 0 || selTypes.has(type);

    // Rarity: OR logic
    const rarityOk = selRarities.size === 0 || selRarities.has(rarity);

    // CMC: OR logic (6+ buckets all cmc >= 6)
    const cmcOk    = selCmcs.size === 0 || [...selCmcs].some(sc =>
      sc === '6' ? cmc >= 6 : cmc === parseInt(sc, 10)
    );

    const priceOk = price >= minPrice;
    const show = colOk && typeOk && rarityOk && cmcOk && priceOk;
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });

  document.getElementById('filter-count').textContent = visible + ' cards';

  // Sort visible cards
  const visCards = cards.filter(c => c.style.display !== 'none');
  visCards.sort((a, b) => {
    const ap = parseFloat(a.dataset.price) || 0;
    const bp = parseFloat(b.dataset.price) || 0;
    const an = a.querySelector('.card-name')?.textContent || '';
    const bn = b.querySelector('.card-name')?.textContent || '';
    const ac = parseInt(a.dataset.cmc, 10) || 0;
    const bc = parseInt(b.dataset.cmc, 10) || 0;
    const ar = RARITY_ORDER[a.dataset.rarity] ?? 4;
    const br = RARITY_ORDER[b.dataset.rarity] ?? 4;
    if (sortVal === 'price-desc')  return bp - ap;
    if (sortVal === 'price-asc')   return ap - bp;
    if (sortVal === 'name-asc')    return an.localeCompare(bn);
    if (sortVal === 'name-desc')   return bn.localeCompare(an);
    if (sortVal === 'cmc-asc')     return ac - bc;
    if (sortVal === 'rarity-desc') return ar - br;
    return 0;
  });
  visCards.forEach(c => grid.appendChild(c));
}

function clearFilters() {
  selColours.clear(); selTypes.clear(); selRarities.clear(); selCmcs.clear();
  ['data-colour-filter','data-type-filter','data-rarity-filter','data-cmc-filter'].forEach(attr => {
    document.querySelectorAll('['+attr+']').forEach(b => b.classList.remove('active'));
    document.querySelector('['+attr+'="all"]').classList.add('active');
  });
  document.getElementById('filter-price').value = '0';
  document.getElementById('sort-select').value = 'price-desc';
  document.querySelectorAll('.card-item').forEach(c => c.style.display = '');
  document.getElementById('filter-count').textContent = '';
}

// ── Set commander carousel ───────────────────────────────────────────
(function() {
  function buildSetCmdCard(c) {
    return '<a href="' + c.cardVaultUrl + '" class="set-cmd-card">'
      + (c.image ? '<img src="' + c.image + '" alt="' + c.name.replace(/"/g,'&quot;') + '" loading="lazy">'
                 : '<div style="aspect-ratio:745/1040;background:rgba(107,107,255,.1);display:flex;align-items:center;justify-content:center;font-size:22px">🎲</div>')
      + '<div class="set-cmd-card-body"><div class="set-cmd-card-name">' + c.name + '</div><div class="set-cmd-card-id">' + c.identityName + '</div></div></a>';
  }
  async function loadSetCommanders() {
    const track   = document.getElementById('set-cmd-track');
    const section = document.getElementById('set-cmd-section');
    if (!track) return;
    try {
      // mode=set with this set's code — shows commanders from THIS set specifically
      const res  = await fetch('/.netlify/functions/commander-carousel?mode=set&setcode=${set.set_code}&limit=20');
      const data = await res.json();
      if (!data.commanders || data.commanders.length === 0) {
        // Hide the whole section — no legendary creatures in this set
        if (section) section.style.display = 'none';
        return;
      }
      const html = data.commanders.map(buildSetCmdCard).join('');
      track.innerHTML = html + html;
      track.classList.add('set-cmd-track-loaded');
    } catch(e) {
      if (section) section.style.display = 'none';
    }
  }
  loadSetCommanders();
})();
</script>

<!-- GA4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
</body></html>`;
}

// Main router
export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === '/cards/mtg' || path === '/cards/mtg/') {
    const [sets, topCards] = await Promise.all([
      supabaseGet('mtg_sets?order=set_name.asc&limit=1000&digital=eq.false'),
      supabaseGet('mtg_cards?order=price_usd.desc&limit=20&select=slug,name,image_uri_small,price_usd,price_aud&price_usd=gte.10')
    ]);
    return new Response(renderCardHub(sets, topCards), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600' }
    });
  }

  if (path === '/cards/mtg/random-commander') {
    return new Response(renderRandomCommander(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=86400' }
    });
  }

  if (path.startsWith('/cards/mtg/sets/')) {
    const setSlug = path.replace('/cards/mtg/sets/', '').replace(/\/$/, '');
    const html = await renderSetIndex(setSlug);
    if (!html) return new Response('<h1>Set not found</h1>', { status: 404, headers: { 'Content-Type': 'text/html' } });
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600' }
    });
  }

  return new Response('Not found', { status: 404 });
};

export const config = {
  path: ['/cards/mtg', '/cards/mtg/', '/cards/mtg/random-commander', '/cards/mtg/sets/:setSlug']
};
