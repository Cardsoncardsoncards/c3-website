// netlify/functions/mtg-hub.mjs
// Serves: /cards/mtg

const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID = Netlify.env.get('EPN_CAMPID') || '5339146789';

async function supabaseGet(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    clearTimeout(timer);
    return [];
  }
}

function eraColor(year) {
  if (!year) return '#C9A84C';
  const y = parseInt(year, 10);
  if (y >= 2020) return '#4ADE80';
  if (y >= 2010) return '#60A5FA';
  return '#C9A84C';
}

export default async () => {
  const [sets, topCards] = await Promise.all([
    supabaseGet('mtg_sets?order=set_name.asc&limit=1000&digital=eq.false&select=set_code,set_name,set_slug,set_type,release_date,parent_set_code'),
    supabaseGet('mtg_cards?order=price_usd.desc&limit=20&select=slug,name,image_uri_small,price_usd,price_aud&price_usd=gte.10')
  ]);

  const parentMap = new Map();
  const childMap  = new Map();
  sets.forEach(function(s) {
    if (!s.parent_set_code) {
      parentMap.set(s.set_code, s);
    } else {
      if (!childMap.has(s.parent_set_code)) childMap.set(s.parent_set_code, []);
      childMap.get(s.parent_set_code).push(s);
    }
  });
  const sortedParents = Array.from(parentMap.values()).sort(function(a, b) {
    return a.set_name.localeCompare(b.set_name);
  });

  const setListHTML = sortedParents.map(function(parent) {
    const children = (childMap.get(parent.set_code) || []).sort(function(a, b) {
      return a.set_name.localeCompare(b.set_name);
    });
    const year = parent.release_date ? parent.release_date.slice(0, 4) : '';
    const color = eraColor(year);
    const firstChar = (parent.set_name[0] || '').toUpperCase();
    const letterKey = /[0-9]/.test(firstChar) ? '0' : firstChar;
    const childBadge = children.length
      ? `<span class="child-badge">+${children.length}</span>`
      : '';
    const childrenData = JSON.stringify(
      children.map(function(c) {
        return { url: '/cards/mtg/sets/' + c.set_slug, label: c.set_name, year: c.release_date ? c.release_date.slice(0, 4) : '' };
      })
    ).replace(/"/g, '&quot;');
    const toggleBtn = children.length
      ? `<button id="btn-${parent.set_code}" class="toggle-btn" data-setcode="${parent.set_code}" data-setname="${parent.set_name.replace(/"/g, '&quot;')}" data-children="${childrenData}" onclick="handleToggle(this)">+</button>`
      : '';
    return `<div class="set-item" data-name="${parent.set_name.toLowerCase().replace(/"/g,'&quot;').replace(/'/g,'&#39;')}${children.map(function(c){ return ' ' + c.set_name.toLowerCase().replace(/"/g,'&quot;'); }).join('')}" data-letter="${letterKey}" style="border-left:3px solid ${color}">
      <div class="set-item-inner">
        <a href="/cards/mtg/sets/${parent.set_slug}" class="set-link">
          <span class="set-name">${parent.set_name.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</span>
          <span class="set-year">${year}</span>
          ${childBadge}
        </a>
        ${toggleBtn}
      </div>
    </div>`;
  }).join('');

  const topCardHTML = topCards.map(function(c) {
    const price = c.price_aud > 0 ? parseFloat(c.price_aud) : (c.price_usd ? c.price_usd * 1.58 : 0);
    const priceStr = (c.price_usd && c.price_usd >= 3 && price > 0) ? '~AU$' + price.toFixed(0) : '';
    return `<a href="/cards/mtg/${c.slug}" class="top-card">
      ${c.image_uri_small ? `<img src="${c.image_uri_small}" alt="${c.name.replace(/"/g,'&quot;')}" loading="lazy">` : `<div class="top-card-placeholder">${c.name.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>`}
      <div class="top-card-name">${c.name.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>
      <div class="top-card-price">${priceStr}</div>
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
  <link rel="icon" type="image/png" href="/c3logo.png">
  <meta property="og:title" content="MTG Card Prices Australia | Cards on Cards on Cards">
  <meta property="og:description" content="Browse Magic: The Gathering card prices in AUD. Live pricing, 52-week ranges, and eBay AU buy links. Updated daily.">
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
    .btn{display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border-radius:8px;font-weight:700;cursor:pointer;border:none;font-size:13px;text-decoration:none;transition:opacity .2s}
    .btn:hover{opacity:.85;text-decoration:none}
    .btn-primary{background:var(--accent);color:#000}
    .btn-secondary{background:var(--bg3);border:1px solid var(--border);color:var(--text)}
    input{background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:8px 12px;border-radius:6px;font-size:14px;width:100%}
    footer{background:var(--bg2);border-top:1px solid var(--border);padding:24px;text-align:center;color:var(--text2);font-size:13px;margin-top:48px}
    footer a{color:var(--text2);margin:0 10px}
    /* NAV */
    nav{background:rgba(8,10,15,.97);border-bottom:1px solid #1e2235;padding:12px 0;position:sticky;top:0;z-index:100;backdrop-filter:blur(18px)}
    .nav-inner{display:flex;align-items:center;max-width:1100px;margin:0 auto;padding:0 24px;gap:10px}
    .nav-logo{display:flex;align-items:center;gap:9px;text-decoration:none;flex-shrink:0}
    .nav-logo img{height:40px;width:40px;border-radius:8px;object-fit:cover}
    .nav-links{display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;flex-shrink:0;min-width:0}
    .nav-links::-webkit-scrollbar{display:none}
    .nav-link{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;transition:all .2s;border:1px solid #1e2235;color:#A0A8C0;white-space:nowrap}
    .nav-link:hover{color:#F0F2FF;border-color:#A0A8C0;background:rgba(255,255,255,.04);text-decoration:none}
    .nav-link--active{color:#C9A84C;border-color:rgba(201,168,76,.4);background:rgba(201,168,76,.06)}
    .nav-link--compare{color:#A78BFA;border-color:rgba(167,139,250,.35)}.nav-link--compare:hover{background:rgba(167,139,250,.1);border-color:#A78BFA}
    .nav-link--market{color:#4ADE80;border-color:rgba(74,222,128,.35)}.nav-link--market:hover{background:rgba(74,222,128,.1);border-color:#4ADE80}
    .nav-link--tools{color:#FB923C;border-color:rgba(251,146,60,.35)}.nav-link--tools:hover{background:rgba(251,146,60,.1);border-color:#FB923C}
    .nav-link--play{color:#F472B6;border-color:rgba(244,114,182,.35)}.nav-link--play:hover{background:rgba(244,114,182,.1);border-color:#F472B6}
    .nav-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.35)}.nav-link--blog:hover{background:rgba(126,203,161,.1);border-color:#7ECBA1}
    .nav-link--ebay{color:#60A5FA;border-color:rgba(96,165,250,.35);background:rgba(96,165,250,.05)}.nav-link--ebay:hover{background:rgba(96,165,250,.12);border-color:#60A5FA}
    /* NAV SEARCH */
    .nav-search-wrap{flex:1;min-width:0;max-width:320px;position:relative;display:flex;align-items:center;gap:0}
    .nav-search-input{width:100%;background:rgba(255,255,255,.06);border:1px solid #1e2235;border-radius:7px 0 0 7px;padding:6px 12px;font-size:12px;color:#e8eaf0;font-family:sans-serif;outline:none;transition:border-color .2s}
    .nav-search-input:focus{border-color:rgba(201,168,76,.45);background:rgba(255,255,255,.09)}
    .nav-search-input::placeholder{color:#9ba3c4}
    .nav-search-btn{background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.35);border-left:none;border-radius:0 7px 7px 0;padding:6px 10px;color:#C9A84C;cursor:pointer;font-size:13px;transition:background .2s;flex-shrink:0}
    .nav-search-btn:hover{background:rgba(201,168,76,.3)}
    /* SET LIST */
    .set-item{background:var(--bg3);border:1px solid var(--border);border-radius:6px;overflow:hidden;transition:border-color .15s}
    .set-item:hover{border-color:var(--accent)}
    .set-item-inner{display:flex;align-items:center;gap:4px}
    .set-link{flex:1;display:block;padding:7px 10px;text-decoration:none;color:var(--text)}
    .set-link:hover{text-decoration:none;color:var(--text)}
    .set-name{font-weight:600;font-size:12px;color:var(--text)}
    .set-year{font-size:10px;color:var(--text2);margin-left:6px}
    .child-badge{font-size:9px;background:rgba(201,168,76,.15);color:var(--gold);border-radius:4px;padding:1px 5px;margin-left:4px}
    .toggle-btn{background:none;border:1px solid var(--border);color:var(--text2);width:26px;height:26px;border-radius:6px;cursor:pointer;font-size:14px;flex-shrink:0;margin-right:4px;transition:border-color .15s}
    .toggle-btn:hover{border-color:var(--accent);color:var(--accent)}
    /* AZ FILTER */
    .az-btn{padding:4px 8px;border-radius:5px;border:1px solid var(--border);background:none;color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;min-width:28px}
    .az-btn:hover{background:var(--bg3);border-color:var(--text2);color:var(--text)}
    .az-btn.active{background:var(--accent);border-color:var(--accent);color:#000}
    /* TOP CARDS */
    .top-card{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center;display:block;transition:border-color .2s;text-decoration:none}
    .top-card:hover{border-color:var(--accent);text-decoration:none}
    .top-card img{width:100%;border-radius:6px}
    .top-card-placeholder{height:80px;display:flex;align-items:center;justify-content:center;color:var(--text2);font-size:11px}
    .top-card-name{font-size:11px;margin-top:4px;color:var(--text)}
    .top-card-price{font-size:12px;color:var(--accent);font-weight:bold}
    /* ERA LEGEND */
    .era-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}
    /* DRAWER */
    .drawer-link{padding:6px 14px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;text-decoration:none;font-size:12px;color:var(--text);display:inline-block;transition:border-color .15s}
    .drawer-link:hover{border-color:var(--accent);text-decoration:none}
    /* COMMANDER CAROUSEL */
    @keyframes cmd-scroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
    @keyframes shimmer{0%,100%{opacity:.4}50%{opacity:.8}}
    .cmd-track{display:flex;gap:12px;width:max-content}
    .cmd-track.loaded{animation:cmd-scroll 50s linear infinite}
    .cmd-track:hover{animation-play-state:paused}
    .cmd-card{display:inline-flex;flex-direction:column;min-width:140px;max-width:155px;background:rgba(107,107,255,.06);border:1px solid rgba(107,107,255,.2);border-radius:10px;overflow:hidden;text-decoration:none;transition:all .22s;flex-shrink:0}
    .cmd-card:hover{transform:translateY(-3px);border-color:rgba(107,107,255,.5);box-shadow:0 8px 24px rgba(107,107,255,.15);text-decoration:none}
    .cmd-card img{width:100%;aspect-ratio:745/1040;object-fit:cover;display:block}
    .cmd-card-body{padding:7px 9px 9px;display:flex;flex-direction:column;gap:2px}
    .cmd-card-name{font-family:Cinzel,serif;font-size:9.5px;font-weight:700;color:#C0C0FF;line-height:1.3}
    .cmd-card-identity{font-size:9px;color:rgba(160,168,192,.5)}
    .cmd-card-cta{font-size:8.5px;font-weight:600;color:#9898FF;letter-spacing:.06em;text-transform:uppercase;margin-top:3px}
    /* MOBILE */
    @media(max-width:768px){
      .nav-search-wrap{max-width:140px}
      .nav-search-input{font-size:11px;padding:5px 8px}
      .nav-links{display:none}
      .wrap{padding:0 12px}
      #set-list{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
    }
  </style>
</head>
<body>
<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo"><img src="/c3logo.png" alt="C3"><span style="font-family:Cinzel,serif;font-size:11.5px;font-weight:700;letter-spacing:.12em;color:#C9A84C;text-transform:uppercase">Cards on Cards on Cards</span></a>
    <div class="nav-search-wrap">
      <input class="nav-search-input" type="text" id="nav-q" placeholder="Search cards..." autocomplete="off" onkeydown="if(event.key==='Enter'){var v=this.value.trim();if(v)window.location='/search?q='+encodeURIComponent(v);}">
      <button class="nav-search-btn" onclick="var v=document.getElementById('nav-q').value.trim();if(v)window.location='/search?q='+encodeURIComponent(v);">&#128269;</button>
    </div>
    <div class="nav-links">
      <a href="/cards" class="nav-link nav-link--active">Card Vault</a>
      <a href="/cards/mtg" class="nav-link" style="color:#C9A84C;border-color:rgba(201,168,76,.5);background:rgba(201,168,76,.08)">MTG</a>
      <a href="/compare" class="nav-link nav-link--compare">Compare</a>
      <a href="/market" class="nav-link nav-link--market">Market</a>
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
    <a href="/compare" class="btn btn-secondary">&#128203; Compare Cards</a>
    <a href="/blog/best-mtg-booster-boxes-australia/" class="btn btn-secondary">&#128230; Best MTG Boxes</a>
  </div>

  <!-- Commander Carousel -->
  <div style="margin-bottom:32px;padding:24px;background:rgba(107,107,255,.04);border:1px solid rgba(107,107,255,.15);border-radius:var(--radius);overflow:hidden">
    <div style="text-align:center;margin-bottom:20px">
      <p style="font-size:10px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:#9898FF;margin-bottom:6px">Commander Spotlight</p>
      <h2 id="cmd-mtg-carousel-title" style="font-family:Cinzel,serif;font-size:20px;color:var(--text);margin:0">Your Next Commander Awaits</h2>
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
      <a href="/cards/mtg/random-commander" style="font-size:12px;color:#9898FF">Generate a random Commander &rarr;</a>
    </div>
  </div>

  <!-- Set Browser -->
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:32px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px">
      <h2 style="font-size:18px">${totalSets}+ MTG Sets</h2>
      <span style="font-size:12px;color:var(--text2)">Click any set to view cards and prices</span>
    </div>

    <!-- Era legend -->
    <div style="display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap">
      <span style="font-size:11px;color:var(--text2)"><span class="era-dot" style="background:#4ADE80"></span>2020 and newer</span>
      <span style="font-size:11px;color:var(--text2)"><span class="era-dot" style="background:#60A5FA"></span>2010 to 2019</span>
      <span style="font-size:11px;color:var(--text2)"><span class="era-dot" style="background:#C9A84C"></span>Pre-2010</span>
    </div>

    <!-- A-Z Filter -->
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px">
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

    <!-- Set name search -->
    <div style="margin-bottom:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <input type="text" id="set-search" placeholder="Search sets e.g. Bloomburrow, Tarkir, Modern Horizons..." oninput="filterSets(this.value)" autocomplete="off" style="max-width:500px;width:100%">
      <span style="font-size:11px;color:var(--text2);white-space:nowrap">Sets with <span style="color:var(--gold)">+N</span> have sub-sets</span>
    </div>

    <div id="set-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px">
      ${setListHTML || '<p style="color:var(--text2);font-size:13px;padding:12px 0">Sets syncing, check back shortly.</p>'}
    </div>

    <!-- Sub-set drawer -->
    <div id="set-child-drawer" style="display:none;margin-top:10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px">
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
      <p style="color:var(--text2);font-size:14px">Generate a random Commander for your next deck. Filter by colour identity and budget.</p>
    </div>
  </div>

  <!-- Blog guides -->
  <div style="margin-bottom:48px">
    <h2 style="font-size:18px;margin-bottom:16px">MTG Guides</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">
      <a href="/blog/best-mtg-booster-boxes-australia/" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px;color:var(--text);display:block;text-decoration:none">
        <div style="font-weight:bold;margin-bottom:4px;color:var(--accent)">Best MTG Booster Boxes in Australia</div>
        <div style="font-size:13px;color:var(--text2)">Which boxes are worth opening right now and where to buy at the best price.</div>
      </a>
      <a href="/blog/mtg-singles-vs-booster-boxes-australia/" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px;color:var(--text);display:block;text-decoration:none">
        <div style="font-weight:bold;margin-bottom:4px;color:var(--accent)">Singles vs Booster Boxes</div>
        <div style="font-size:13px;color:var(--text2)">Should you buy the card you want directly or gamble on packs? The honest answer.</div>
      </a>
      <a href="/blog/how-to-sell-mtg-cards-australia/" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px;color:var(--text);display:block;text-decoration:none">
        <div style="font-weight:bold;margin-bottom:4px;color:var(--accent)">How to Sell MTG Cards in Australia</div>
        <div style="font-size:13px;color:var(--text2)">eBay, local stores, or buylist? Here is what actually gets you the best price.</div>
      </a>
      <a href="/ev-calculator.html" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px;color:var(--text);display:block;text-decoration:none">
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
function filterAZ(letter, btn) {
  var btns = document.querySelectorAll('.az-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
  btn.classList.add('active');
  document.getElementById('set-search').value = '';
  var items = document.querySelectorAll('.set-item');
  for (var j = 0; j < items.length; j++) {
    items[j].style.display = (letter === 'all' || items[j].dataset.letter === letter) ? '' : 'none';
  }
}

function filterSets(query) {
  var q = query.toLowerCase().trim();
  var btns = document.querySelectorAll('.az-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
  btns[0].classList.add('active');
  var items = document.querySelectorAll('.set-item');
  for (var j = 0; j < items.length; j++) {
    var name = items[j].dataset.name || '';
    items[j].style.display = (!q || name.indexOf(q) !== -1) ? '' : 'none';
  }
}

var openSetCode = null;
function handleToggle(btn) {
  var setCode = btn.dataset.setcode;
  var setName = btn.dataset.setname;
  var raw = btn.dataset.children.replace(/&quot;/g, '"');
  var childrenData = JSON.parse(raw);
  toggleChildren(setCode, setName, childrenData, btn);
}

function toggleChildren(setCode, setName, childrenData, btn) {
  var drawer = document.getElementById('set-child-drawer');
  var titleEl = document.getElementById('set-drawer-title');
  var itemsEl = document.getElementById('set-drawer-items');
  if (!btn) btn = document.getElementById('btn-' + setCode);
  if (openSetCode === setCode) {
    drawer.style.display = 'none';
    if (btn) btn.textContent = '+';
    openSetCode = null;
    return;
  }
  if (openSetCode) {
    var prev = document.getElementById('btn-' + openSetCode);
    if (prev) prev.textContent = '+';
  }
  openSetCode = setCode;
  titleEl.textContent = setName + ' variants';
  var html = '';
  for (var i = 0; i < childrenData.length; i++) {
    var c = childrenData[i];
    html += '<a href="' + c.url + '" class="drawer-link">' + c.label.replace(/</g,'&lt;').replace(/>/g,'&gt;') + ' <span style="font-size:10px;color:#9ba3c4">(' + c.year + ')</span></a>';
  }
  itemsEl.innerHTML = html;
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
(function() {
  function buildCmdCard(c) {
    var img = c.image
      ? '<img src="' + c.image + '" alt="' + c.name.replace(/"/g, '&quot;') + '" loading="lazy">'
      : '<div style="aspect-ratio:745/1040;background:rgba(107,107,255,.1);display:flex;align-items:center;justify-content:center;font-size:28px">&#127922;</div>';
    return '<a href="' + c.cardVaultUrl + '" class="cmd-card">'
      + img
      + '<div class="cmd-card-body">'
      + '<div class="cmd-card-name">' + c.name.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>'
      + '<div class="cmd-card-identity">' + (c.identityName||'').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>'
      + '<div class="cmd-card-cta">View Card &rarr;</div>'
      + '</div></a>';
  }
  function loadCommanders() {
    var track = document.getElementById('cmd-mtg-carousel-track');
    if (!track) return;
    fetch('/.netlify/functions/commander-carousel?mode=top')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.commanders || !data.commanders.length) {
          track.innerHTML = '<p style="color:#A0A8C0;font-size:12px;padding:12px">No commanders found.</p>';
          return;
        }
        var arr = data.commanders.slice();
        for (var i = arr.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
        var twenty = arr.slice(0, 20);
        var html = '';
        for (var k = 0; k < twenty.length; k++) html += buildCmdCard(twenty[k]);
        track.innerHTML = html + html;
        track.classList.add('loaded');
      })
      .catch(function() {
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
