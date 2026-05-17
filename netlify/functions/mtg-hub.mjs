// netlify/functions/mtg-hub.mjs
// Serves: /cards/mtg  — MTG hub with set browser, search, and A-Z filter

const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID = Netlify.env.get('EPN_CAMPID') || '5339146789';

async function supabaseGet(path) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

export default async () => {
  const [sets, topCards] = await Promise.all([
    supabaseGet('mtg_sets?order=set_name.asc&limit=1000&digital=eq.false'),
    supabaseGet('mtg_cards?order=price_usd.desc&limit=20&select=slug,name,image_uri_small,price_usd,price_aud&price_usd=gte.10')
  ]);

  // Group sets: parents (no parent_set_code) and children
  const parentMap = new Map();
  const childMap  = new Map();
  sets.forEach(s => {
    if (!s.parent_set_code) {
      parentMap.set(s.set_code, s);
    } else {
      if (!childMap.has(s.parent_set_code)) childMap.set(s.parent_set_code, []);
      childMap.get(s.parent_set_code).push(s);
    }
  });
  const sortedParents = [...parentMap.values()].sort((a, b) => a.set_name.localeCompare(b.set_name));

  const setListHTML = sortedParents.map(parent => {
    const children = (childMap.get(parent.set_code) || []).sort((a, b) => a.set_name.localeCompare(b.set_name));
    const childBadge = children.length
      ? `<span style="font-size:9px;background:rgba(201,168,76,.15);color:#C9A84C;border-radius:4px;padding:1px 5px;margin-left:4px">+${children.length}</span>`
      : '';
    const firstLetter = (parent.set_name[0] || '').toUpperCase();
    const letterKey = /[0-9]/.test(firstLetter) ? '0' : firstLetter;
    const childrenJson = JSON.stringify(
      children.map(c => ({ url: '/cards/mtg/sets/' + c.set_slug, label: c.set_name, year: c.release_date ? c.release_date.slice(0, 4) : '' }))
    ).replace(/"/g, '&quot;');
    return `<div class="set-parent-item" data-name="${parent.set_name.toLowerCase()}${children.map(c => ' ' + c.set_name.toLowerCase()).join('')}" data-letter="${letterKey}">
      <div style="display:flex;align-items:center;gap:4px">
        <a href="/cards/mtg/sets/${parent.set_slug}" style="flex:1;display:block;padding:7px 12px;background:#22263a;border:1px solid #2d3254;border-radius:6px;text-decoration:none;font-size:12px;transition:border-color .15s" onmouseover="this.style.borderColor='#f5a623'" onmouseout="this.style.borderColor='#2d3254'">
          <span style="color:#e8eaf0;font-weight:600">${parent.set_name}</span>
          <span style="color:#9ba3c4;font-size:10px;margin-left:6px">${parent.release_date ? parent.release_date.slice(0, 4) : ''}</span>
          ${childBadge}
        </a>
        ${children.length ? `<button
          id="btn-${parent.set_code}"
          data-setcode="${parent.set_code}"
          data-setname="${parent.set_name.replace(/"/g, '&quot;')}"
          data-children="${childrenJson}"
          onclick="handleToggle(this)"
          style="background:none;border:1px solid #2d3254;color:#9ba3c4;width:26px;height:26px;border-radius:6px;cursor:pointer;font-size:14px;flex-shrink:0"
          title="Show variants">+</button>` : ''}
      </div>
    </div>`;
  }).join('');

  const topCardHTML = topCards.map(c => {
    const price = c.price_aud > 0 ? parseFloat(c.price_aud) : (c.price_usd ? c.price_usd * 1.58 : 0);
    const priceStr = (c.price_usd && c.price_usd >= 3 && price > 0) ? `~AU$${price.toFixed(0)}` : '';
    return `<a href="/cards/mtg/${c.slug}" style="background:#1a1d2e;border:1px solid #2d3254;border-radius:8px;padding:8px;text-align:center;display:block;transition:border-color 0.2s" onmouseover="this.style.borderColor='#f5a623'" onmouseout="this.style.borderColor='#2d3254'">
      ${c.image_uri_small ? `<img src="${c.image_uri_small}" alt="${c.name}" style="width:100%;border-radius:6px" loading="lazy">` : `<div style="height:80px;display:flex;align-items:center;justify-content:center;color:#9ba3c4;font-size:11px">${c.name}</div>`}
      <div style="font-size:11px;margin-top:4px;color:#e8eaf0">${c.name}</div>
      <div style="font-size:12px;color:#f5a623;font-weight:bold">${priceStr}</div>
    </a>`;
  }).join('');

  const totalSets = sortedParents.length;

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>MTG Card Prices Australia | Cards on Cards on Cards</title>
  <meta name="description" content="Browse Magic: The Gathering card prices in AUD. Australia's MTG price guide with live AUD conversion, 52-week price ranges, and eBay AU buy links.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/mtg">
  <meta property="og:image" content="https://cardsoncardsoncards.com.au/c3-og-banner.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#0f1117;--bg2:#1a1d2e;--bg3:#22263a;--accent:#f5a623;--text:#e8eaf0;--text2:#9ba3c4;--border:#2d3254;--radius:12px;--gold:#C9A84C}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:sans-serif;line-height:1.6}
    a{color:var(--accent);text-decoration:none}
    a:hover{text-decoration:underline}
    .wrap{max-width:1100px;margin:0 auto;padding:0 24px}
    .btn{display:inline-block;padding:10px 20px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;font-size:14px;text-decoration:none}
    .btn-primary{background:var(--accent);color:#000}
    .btn-secondary{background:var(--bg3);border:1px solid var(--border);color:var(--text)}
    input{background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:8px 12px;border-radius:6px;font-size:14px}
    footer{background:var(--bg2);border-top:1px solid var(--border);padding:24px;text-align:center;color:var(--text2);font-size:13px;margin-top:48px}
    footer a{color:var(--text2);margin:0 10px}
    nav{background:rgba(8,10,15,.97);border-bottom:1px solid #1e2235;padding:12px 0;position:sticky;top:0;z-index:100;backdrop-filter:blur(18px)}
    .nav-inner{display:flex;align-items:center;justify-content:space-between;max-width:1100px;margin:0 auto;padding:0 24px;gap:12px}
    .nav-logo{display:flex;align-items:center;gap:9px;text-decoration:none;flex-shrink:0}
    .nav-logo img{height:40px;width:40px;border-radius:8px;object-fit:cover}
    .nav-links{display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
    .nav-links::-webkit-scrollbar{display:none}
    .nav-link{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;transition:all .2s;border:1px solid #1e2235;color:#A0A8C0;white-space:nowrap}
    .nav-link:hover{color:#F0F2FF;border-color:#A0A8C0;background:rgba(255,255,255,.04);text-decoration:none}
    .nav-link--active,.nav-link--vault{color:#C9A84C;border-color:rgba(201,168,76,.4);background:rgba(201,168,76,.06)}
    .nav-link--compare{color:#A78BFA;border-color:rgba(167,139,250,.35)}.nav-link--compare:hover{background:rgba(167,139,250,.1);border-color:#A78BFA}
    .nav-link--market{color:#4ADE80;border-color:rgba(74,222,128,.35)}.nav-link--market:hover{background:rgba(74,222,128,.1);border-color:#4ADE80}
    .nav-link--tools{color:#FB923C;border-color:rgba(251,146,60,.35)}.nav-link--tools:hover{background:rgba(251,146,60,.1);border-color:#FB923C}
    .nav-link--play{color:#F472B6;border-color:rgba(244,114,182,.35)}.nav-link--play:hover{background:rgba(244,114,182,.1);border-color:#F472B6}
    .nav-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.35)}.nav-link--blog:hover{background:rgba(126,203,161,.1);border-color:#7ECBA1}
    .nav-link--ebay{color:#60A5FA;border-color:rgba(96,165,250,.35);background:rgba(96,165,250,.05)}.nav-link--ebay:hover{background:rgba(96,165,250,.12);border-color:#60A5FA}
    /* A-Z filter buttons */
    .az-btn{padding:4px 8px;border-radius:5px;border:1px solid #2d3254;background:none;color:#9ba3c4;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;min-width:28px}
    .az-btn:hover,.az-btn.active{background:#f5a623;border-color:#f5a623;color:#000}
    /* Commander carousel */
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
    @keyframes shimmer{0%,100%{opacity:.4}50%{opacity:.8}}
  </style>
</head>
<body>
<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo"><img src="/c3logo.png" alt="C3"><span style="font-family:Cinzel,serif;font-size:11.5px;font-weight:700;letter-spacing:.12em;color:#C9A84C;text-transform:uppercase">Cards on Cards on Cards</span></a>
    <div class="nav-links">
      <a href="/cards" class="nav-link nav-link--vault nav-link--active">Card Vault</a>
      <a href="/cards/mtg" class="nav-link" style="color:#C9A84C;border-color:rgba(201,168,76,.4)">MTG</a>
      <a href="/card-compare.html" class="nav-link nav-link--compare">Compare</a>
      <a href="/market.html" class="nav-link nav-link--market">Market</a>
      <a href="/tools.html" class="nav-link nav-link--tools">Tools</a>
      <a href="/play.html" class="nav-link nav-link--play">Play</a>
      <a href="/blog" class="nav-link nav-link--blog">Blog</a>
      <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=C3Nav&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="nav-link nav-link--ebay">Shop eBay &#8599;</a>
    </div>
  </div>
</nav>

<div class="wrap" style="padding-top:32px">
  <h1 style="font-size:32px;margin-bottom:8px">MTG Card Prices in Australia</h1>
  <p style="color:var(--text2);margin-bottom:32px">Australia's MTG price guide with live AUD pricing, 52-week price ranges, and direct eBay AU buy links. Updated daily.</p>

  <!-- Quick Access -->
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:32px">
    <a href="https://www.ebay.com.au/sch/i.html?_nkw=mtg+magic+gathering+cards&campid=${EPN_CAMPID}&customid=C3MTGHub" target="_blank" rel="noopener" class="btn btn-primary">&#128722; Shop MTG on eBay &#8599;</a>
    <a href="/cards/mtg/random-commander" class="btn btn-secondary">&#127922; Random Commander</a>
    <a href="/ev-calculator.html" class="btn btn-secondary">&#128202; EV Calculator</a>
    <a href="/card-compare.html" class="btn btn-secondary">&#128203; Compare Cards</a>
    <a href="/blog/best-mtg-booster-boxes-australia/" class="btn btn-secondary">&#128230; Best MTG Boxes</a>
  </div>

  <!-- Commander Carousel -->
  <div style="margin-bottom:32px;padding:24px;background:rgba(107,107,255,.04);border:1px solid rgba(107,107,255,.15);border-radius:var(--radius);overflow:hidden">
    <div style="text-align:center;margin-bottom:20px">
      <p style="font-size:10px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:#9898FF;margin-bottom:6px">Commander Spotlight</p>
      <h2 id="cmd-mtg-carousel-title" style="font-family:'Cinzel',serif;font-size:20px;color:var(--text);margin:0">Your Next Commander Awaits</h2>
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
      <a href="/cards/mtg/random-commander" style="font-size:12px;color:#9898FF;text-decoration:none">Generate a random Commander &rarr;</a>
    </div>
  </div>

  <!-- Card Search -->
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:32px">
    <h2 style="font-size:18px;margin-bottom:16px">Search MTG Cards</h2>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <input type="text" id="card-search" placeholder="Card name e.g. Black Lotus, Lightning Bolt..." style="flex:1;min-width:200px" onkeyup="if(event.key==='Enter')searchCard()">
      <button class="btn btn-primary" onclick="searchCard()">Search</button>
    </div>
    <div id="search-results" style="margin-top:16px"></div>
  </div>

  <!-- Browse by Set -->
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:32px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px">
      <h2 style="font-size:18px">${totalSets}+ MTG Sets</h2>
      <span style="color:var(--text2);font-size:12px">Click any set to view cards and prices</span>
    </div>

    <!-- A-Z Filter -->
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px" id="az-filter-row">
      <button class="az-btn active" onclick="filterAZ('all',this)">All</button>
      <button class="az-btn" onclick="filterAZ('0',this)">0-9</button>
      <button class="az-btn" onclick="filterAZ('A',this)">A</button>
      <button class="az-btn" onclick="filterAZ('B',this)">B</button>
      <button class="az-btn" onclick="filterAZ('C',this)">C</button>
      <button class="az-btn" onclick="filterAZ('D',this)">D</button>
      <button class="az-btn" onclick="filterAZ('E',this)">E</button>
      <button class="az-btn" onclick="filterAZ('F',this)">F</button>
      <button class="az-btn" onclick="filterAZ('G',this)">G</button>
      <button class="az-btn" onclick="filterAZ('H',this)">H</button>
      <button class="az-btn" onclick="filterAZ('I',this)">I</button>
      <button class="az-btn" onclick="filterAZ('J',this)">J</button>
      <button class="az-btn" onclick="filterAZ('K',this)">K</button>
      <button class="az-btn" onclick="filterAZ('L',this)">L</button>
      <button class="az-btn" onclick="filterAZ('M',this)">M</button>
      <button class="az-btn" onclick="filterAZ('N',this)">N</button>
      <button class="az-btn" onclick="filterAZ('O',this)">O</button>
      <button class="az-btn" onclick="filterAZ('P',this)">P</button>
      <button class="az-btn" onclick="filterAZ('Q',this)">Q</button>
      <button class="az-btn" onclick="filterAZ('R',this)">R</button>
      <button class="az-btn" onclick="filterAZ('S',this)">S</button>
      <button class="az-btn" onclick="filterAZ('T',this)">T</button>
      <button class="az-btn" onclick="filterAZ('U',this)">U</button>
      <button class="az-btn" onclick="filterAZ('V',this)">V</button>
      <button class="az-btn" onclick="filterAZ('W',this)">W</button>
      <button class="az-btn" onclick="filterAZ('X',this)">X</button>
      <button class="az-btn" onclick="filterAZ('Y',this)">Y</button>
      <button class="az-btn" onclick="filterAZ('Z',this)">Z</button>
    </div>

    <!-- Set Name Search -->
    <div style="margin-bottom:12px">
      <input type="text" id="set-search" placeholder="Search sets e.g. Bloomburrow, Tarkir, Modern Horizons..."
        style="width:100%;max-width:500px"
        oninput="filterSets(this.value)" autocomplete="off">
      <span style="font-size:11px;color:var(--text2);margin-left:12px">Sets with <span style="color:var(--gold)">+N</span> have sub-sets</span>
    </div>

    <div id="set-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:4px">
      ${setListHTML}
    </div>

    <!-- Sub-set drawer -->
    <div id="set-child-drawer" style="display:none;margin-top:8px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span id="set-drawer-title" style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.08em"></span>
        <button onclick="closeDrawer()" style="background:none;border:none;color:var(--text2);cursor:pointer;font-size:18px;line-height:1">&times;</button>
      </div>
      <div id="set-drawer-items" style="display:flex;gap:8px;flex-wrap:wrap"></div>
    </div>
  </div>

  <!-- Most Valuable Cards -->
  <div style="margin-bottom:32px">
    <h2 style="font-size:20px;margin-bottom:16px">&#127942; Most Valuable MTG Cards (AUD)</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px">
      ${topCardHTML}
    </div>
    <p style="color:var(--text2);font-size:13px;margin-top:16px">Prices in AUD based on live USD conversion. Updated daily from Scryfall.</p>
  </div>

  <!-- Feature callouts -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px;margin-bottom:32px">
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:20px">
      <h3 style="color:var(--accent);margin-bottom:8px">&#128218; Set Browser</h3>
      <p style="color:var(--text2);font-size:14px">Browse every MTG set from Alpha to the latest release with all card prices in AUD.</p>
    </div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:20px">
      <h3 style="color:var(--accent);margin-bottom:8px">&#128722; eBay AU Buy Links</h3>
      <p style="color:var(--text2);font-size:14px">Direct links to Australian eBay listings for every card. No currency conversion needed.</p>
    </div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:20px">
      <h3 style="color:var(--accent);margin-bottom:8px">&#127922; Random Commander</h3>
      <p style="color:var(--text2);font-size:14px">Generate a random Commander for your next deck build. Filter by colour identity and budget.</p>
    </div>
  </div>

  <!-- Related blog posts -->
  <div style="margin-bottom:48px">
    <h2 style="font-size:18px;margin-bottom:16px">MTG Guides</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">
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
  <p><a href="/">Home</a><a href="/cards">Card Vault</a><a href="/cards/mtg">MTG Cards</a><a href="/ev-calculator.html">EV Calculator</a><a href="/blog">Blog</a><a href="/tracker.html">Free Tracker</a></p>
  <p style="margin-top:8px;font-size:12px">Prices updated daily. All prices in AUD. &copy; 2026 Cards on Cards on Cards &middot; Affiliate links may earn a small commission.</p>
</footer>

<script>
function searchCard() {
  var q = document.getElementById('card-search').value.trim();
  if (!q) return;
  var res = document.getElementById('search-results');
  res.innerHTML = '<p style="color:#9ba3c4">Searching...</p>';
  fetch('${SUPABASE_URL}/rest/v1/mtg_cards?name=ilike.' + encodeURIComponent('%' + q + '%') + '&limit=8&select=slug,name,price_usd,image_uri_small&price_usd=gt.0&order=price_usd.desc', {
    headers: { 'apikey': '${SUPABASE_ANON_KEY}' }
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if (!data || !data.length) {
      res.innerHTML = '<p style="color:#9ba3c4">No cards found. <a href="https://www.ebay.com.au/sch/i.html?_nkw=' + encodeURIComponent(q + ' mtg') + '&campid=${EPN_CAMPID}" target="_blank">Search eBay AU &rarr;</a></p>';
      return;
    }
    res.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:8px">' +
      data.map(function(c){
        return '<a href="/cards/mtg/' + c.slug + '" style="background:#22263a;border:1px solid #2d3254;border-radius:8px;padding:8px;text-align:center;display:block">' +
          '<img src="' + (c.image_uri_small || '') + '" style="width:100%;border-radius:4px" alt="' + c.name + '">' +
          '<div style="font-size:11px;margin-top:4px">' + c.name + '</div>' +
          '<div style="font-size:12px;color:#f5a623">' + (c.price_usd ? '~AU$' + (c.price_usd * 1.58).toFixed(0) : '') + '</div></a>';
      }).join('') + '</div>';
  })
  .catch(function(){ res.innerHTML = '<p style="color:#f44">Search error. Try again.</p>'; });
}

function filterAZ(letter, btn) {
  var allBtns = document.querySelectorAll('.az-btn');
  allBtns.forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  var items = document.querySelectorAll('.set-parent-item');
  items.forEach(function(item){
    if (letter === 'all') {
      item.style.display = '';
    } else {
      item.style.display = (item.dataset.letter === letter) ? '' : 'none';
    }
  });
  document.getElementById('set-search').value = '';
}

function filterSets(query) {
  var q = query.toLowerCase().trim();
  var allBtns = document.querySelectorAll('.az-btn');
  allBtns.forEach(function(b){ b.classList.remove('active'); });
  document.querySelector('.az-btn').classList.add('active');
  var items = document.querySelectorAll('.set-parent-item');
  items.forEach(function(item){
    var name = item.dataset.name || '';
    item.style.display = (!q || name.includes(q)) ? '' : 'none';
  });
}

var openSetCode = null;
function handleToggle(btn) {
  var setCode = btn.dataset.setcode;
  var setName = btn.dataset.setname;
  var childrenData = JSON.parse(btn.dataset.children.replace(/&quot;/g, '"'));
  toggleChildren(setCode, setName, childrenData, btn);
}

function toggleChildren(setCode, setName, childrenData, btn) {
  var drawer = document.getElementById('set-child-drawer');
  var title  = document.getElementById('set-drawer-title');
  var items  = document.getElementById('set-drawer-items');
  if (!btn) btn = document.getElementById('btn-' + setCode);
  if (openSetCode === setCode) {
    drawer.style.display = 'none';
    if (btn) btn.textContent = '+';
    openSetCode = null;
    return;
  }
  if (openSetCode) {
    var prevBtn = document.getElementById('btn-' + openSetCode);
    if (prevBtn) prevBtn.textContent = '+';
  }
  openSetCode = setCode;
  title.textContent = setName + ' variants';
  items.innerHTML = childrenData.map(function(c){
    return '<a href="' + c.url + '" style="padding:6px 14px;background:#1a1d2e;border:1px solid #2d3254;border-radius:6px;text-decoration:none;font-size:12px;color:#e8eaf0;transition:border-color .15s" onmouseover="this.style.borderColor=\'#f5a623\'" onmouseout="this.style.borderColor=\'#2d3254\'">' +
      c.label + ' <span style="font-size:10px;color:#9ba3c4">(' + c.year + ')</span></a>';
  }).join('');
  drawer.style.display = '';
  if (btn) btn.textContent = '\u2212';
  drawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeDrawer() {
  document.getElementById('set-child-drawer').style.display = 'none';
  if (openSetCode) {
    var btn = document.getElementById('btn-' + openSetCode);
    if (btn) btn.textContent = '+';
  }
  openSetCode = null;
}
</script>

<script>
(function(){
  function buildCmdCard(c) {
    return '<a href="' + c.cardVaultUrl + '" class="cmd-card">'
      + (c.image ? '<img src="' + c.image + '" alt="' + c.name.replace(/"/g, '&quot;') + '" loading="lazy">'
                 : '<div style="aspect-ratio:745/1040;background:rgba(107,107,255,.1);display:flex;align-items:center;justify-content:center;font-size:28px">&#127922;</div>')
      + '<div class="cmd-card-body"><div class="cmd-card-name">' + c.name + '</div><div class="cmd-card-identity">' + c.identityName + '</div><div class="cmd-card-cta">View Card &rarr;</div></div></a>';
  }
  function loadCommanders() {
    var track = document.getElementById('cmd-mtg-carousel-track');
    if (!track) return;
    fetch('/.netlify/functions/commander-carousel?mode=top')
      .then(function(r){ return r.json(); })
      .then(function(data){
        if (!data.commanders || data.commanders.length === 0) {
          track.innerHTML = '<p style="color:#A0A8C0;font-size:12px;padding:12px">No commanders found.</p>';
          return;
        }
        var arr = data.commanders.slice();
        for (var i = arr.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
        var twenty = arr.slice(0, 20);
        var html = twenty.map(buildCmdCard).join('');
        track.innerHTML = html + html;
        track.classList.add('loaded');
      })
      .catch(function(){
        track.innerHTML = '<p style="color:#A0A8C0;font-size:12px;padding:12px">Could not load commanders.</p>';
      });
  }
  loadCommanders();
})();
</script>

<!-- GA4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600' }
  });
};

export const config = {
  path: '/cards/mtg'
};
