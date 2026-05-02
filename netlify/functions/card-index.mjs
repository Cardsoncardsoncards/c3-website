// netlify/functions/card-index.mjs
// Serves:
// /cards/mtg - MTG card hub with search
// /cards/mtg/random-commander - Random commander generator
// /cards/mtg/sets/:setSlug - Set index pages

const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');

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
  const setOptionsHTML = sets.map(s => `<option value="${s.set_slug}">${s.set_name} (${s.release_date?.slice(0,4) || ''})</option>`).join('');

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

  <!-- Browse by Set -->
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:32px">
    <h2 style="font-size:18px;margin-bottom:16px">Browse by Set</h2>
    <select id="set-picker" style="width:100%;max-width:400px" onchange="if(this.value)window.location='/cards/mtg/sets/'+this.value">
      <option value="">Select a set...</option>
      ${setOptionsHTML}
    </select>
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
  <meta name="description" content="Generate a random Magic: The Gathering Commander. Filter by colour identity and mana value. Find your next Commander deck inspiration.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/mtg/random-commander">
  ${BASE_STYLES}
  <style>
    .color-btn{width:36px;height:36px;border-radius:50%;border:2px solid transparent;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;transition:all 0.2s}
    .color-btn.selected{border-color:#f5a623;transform:scale(1.15);box-shadow:0 0 0 3px rgba(245,166,35,0.5);background-color:rgba(245,166,35,0.15) !important;color:#fff !important}
    #commander-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:24px;display:none;max-width:500px;margin:0 auto}
    #commander-img{width:200px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.6)}
  </style>
</head>
<body>
${NAV}
<div class="wrap" style="padding-top:32px;text-align:center">
  <h1 style="font-size:32px;margin-bottom:8px">🎲 Random Commander Generator</h1>
  <p style="color:var(--text2);margin-bottom:32px;max-width:600px;margin-left:auto;margin-right:auto">Find your next Commander deck inspiration. Filter by colour identity and mana value, or go completely random.</p>

  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:32px;max-width:600px;margin:0 auto 32px">
    <h2 style="font-size:18px;margin-bottom:20px">Filter (optional)</h2>

    <div style="margin-bottom:20px">
      <p style="color:var(--text2);font-size:13px;margin-bottom:10px">Colour Identity</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="color-btn" style="background:#f9faf4;color:#000" data-color="W" onclick="toggleColor(this)" title="White">W</button>
        <button class="color-btn" style="background:#aae0fa;color:#000" data-color="U" onclick="toggleColor(this)" title="Blue">U</button>
        <button class="color-btn" style="background:#2a2a2a;color:#fff" data-color="B" onclick="toggleColor(this)" title="Black">B</button>
        <button class="color-btn" style="background:#f9aa8f;color:#000" data-color="R" onclick="toggleColor(this)" title="Red">R</button>
        <button class="color-btn" style="background:#9bd3ae;color:#000" data-color="G" onclick="toggleColor(this)" title="Green">G</button>
      </div>
    </div>

    <div style="margin-bottom:24px">
      <p style="color:var(--text2);font-size:13px;margin-bottom:10px">Max Mana Value</p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        ${[2,3,4,5,6,7,'Any'].map(v => `<button class="btn btn-secondary cmc-btn" style="padding:6px 14px;font-size:13px" data-cmc="${v}" onclick="setCmc(this,${v === 'Any' ? 99 : v})">${v}</button>`).join('')}
      </div>
    </div>

    <button class="btn btn-primary" style="font-size:18px;padding:14px 40px;width:100%" onclick="generateCommander()">
      ✨ Generate Commander
    </button>
  </div>

  <div id="commander-card">
    <img id="commander-img" src="" alt="">
    <h2 id="commander-name" style="font-size:22px;margin:16px 0 4px"></h2>
    <p id="commander-type" style="color:var(--text2);font-size:14px;margin-bottom:12px"></p>
    <p id="commander-price" style="color:var(--accent);font-size:18px;font-weight:bold;margin-bottom:16px"></p>
    <div style="display:flex;gap:10px;flex-direction:column">
      <a id="commander-link" href="#" class="btn btn-primary">View Full Card Page →</a>
      <button class="btn btn-secondary" onclick="generateCommander()">🎲 Generate Another</button>
    </div>
  </div>

  <div style="max-width:600px;margin:32px auto 0;text-align:left">
    <h3 style="margin-bottom:12px">Related Guides</h3>
    <div style="display:flex;flex-wrap:wrap;gap:10px">
      <a href="/blog/mtg-commander-decks-australia/">Best MTG Commander Decks Australia</a>
      <a href="/blog/free-mtg-collection-tracker-australia/">Free MTG Collection Tracker</a>
      <a href="/cards/mtg">Browse All MTG Cards</a>
      <a href="/ev-calculator.html">EV Calculator</a>
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
  document.querySelectorAll('.cmc-btn').forEach(b => { b.classList.remove('btn-primary'); b.classList.add('btn-secondary'); });
  btn.classList.remove('btn-secondary');
  btn.classList.add('btn-primary');
}

let lastCommanderSlug = null;

function showMsg(text, color) {
  let el = document.getElementById('commander-msg');
  if (!el) {
    el = document.createElement('p');
    el.id = 'commander-msg';
    el.style = 'text-align:center;font-size:14px;margin-top:16px;font-family:sans-serif';
    const card = document.getElementById('commander-card');
    if (card) card.before(el);
    else document.querySelector('.wrap').appendChild(el);
  }
  el.textContent = text;
  el.style.color = color || 'var(--text2)';
}

async function generateCommander() {
  const btns = document.querySelectorAll('[onclick="generateCommander()"]');
  btns.forEach(b => { b.textContent = '\u23f3 Finding commander...'; b.disabled = true; });
  showMsg('', '');
  try {
    const params = new URLSearchParams();
    if (selectedColors.length) params.set('colors', selectedColors.join(''));
    if (selectedCmc < 99) params.set('maxCmc', selectedCmc);
    if (lastCommanderSlug) params.set('exclude', lastCommanderSlug);

    let res = await fetch('/api/random-commander?' + params);
    let data = await res.json();

    // Retry without CMC if no results found
    if (!data.slug && selectedCmc < 99) {
      const retryParams = new URLSearchParams();
      if (selectedColors.length) retryParams.set('colors', selectedColors.join(''));
      if (lastCommanderSlug) retryParams.set('exclude', lastCommanderSlug);
      res = await fetch('/api/random-commander?' + retryParams);
      data = await res.json();
      if (data.slug) showMsg('No commanders at CMC ' + selectedCmc + ' \u2014 showing any mana value instead.', 'var(--text2)');
    }

    if (!data.slug) {
      showMsg('No commanders found with those filters. Try fewer colour restrictions.', '#f5a623');
      return;
    }

    lastCommanderSlug = data.slug;

    const cardRes = await fetch(window.C3_SUPA_URL + '/rest/v1/mtg_cards?slug=eq.' + data.slug + '&select=name,type_line,image_uri_normal,image_uri_small,price_aud,price_usd,slug', {
      headers: { 'apikey': window.C3_SUPA_KEY }
    });
    const cards = await cardRes.json();
    if (!cards[0]) return;
    const card = cards[0];
    document.getElementById('commander-img').src = card.image_uri_normal || card.image_uri_small || '';
    document.getElementById('commander-img').alt = card.name;
    document.getElementById('commander-name').textContent = card.name;
    document.getElementById('commander-type').textContent = card.type_line || '';
    document.getElementById('commander-price').textContent = card.price_aud > 0 ? 'AU$' + parseFloat(card.price_aud).toFixed(2) : (card.price_usd ? '~AU$' + (card.price_usd * 1.58).toFixed(2) : 'Price N/A');
    document.getElementById('commander-link').href = '/cards/mtg/' + card.slug;
    document.getElementById('commander-card').style.display = 'block';
    document.getElementById('commander-card').scrollIntoView({ behavior: 'smooth' });
  } catch(e) { showMsg('Something went wrong. Try again.', '#f44336'); }
  finally { btns.forEach(b => { b.textContent = '\u2728 Generate Commander'; b.disabled = false; }); }
}
</script>
<!-- GA4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
</body></html>`;
}

// Set Index Page — P2 rebuild with full filter system
async function renderSetIndex(setSlug) {
  const sets = await supabaseGet(`mtg_sets?set_slug=eq.${setSlug}&limit=1`);
  if (!sets || !sets[0]) return null;
  const set = sets[0];

  // Expanded SELECT: add color_identity, type_line, cmc for filters
  const cards = await supabaseGet(
    `mtg_cards?set_code=eq.${set.set_code}&order=price_usd.desc.nullslast&limit=400` +
    `&select=slug,name,image_uri_small,price_usd,price_aud,rarity,collector_number,color_identity,type_line,cmc`
  );

  if (!cards || !cards.length) return null;

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
    const priceDisplay = aud >= 1 ? `~AU$${aud.toFixed(0)}` : '';
    const rc = rarityColour[c.rarity] || '#9ca3af';
    const ciArr = Array.isArray(c.color_identity) ? c.color_identity : [];
    const ciKey = colourKey(ciArr);
    const ciRaw = ciArr.join(',');
    const type = primaryType(c.type_line);
    const cmc = c.cmc || 0;
    return `<a href="/cards/mtg/${c.slug}"
        class="card-item"
        data-rarity="${c.rarity || ''}"
        data-price="${aud.toFixed(2)}"
        data-colour="${ciKey}"
        data-colour-raw="${ciRaw}"
        data-type="${type}"
        data-cmc="${cmc}">
      <div class="card-rarity-dot" style="background:${rc}"></div>
      <div class="card-colour-pips">${ciArr.length
        ? ciArr.map(pip => `<img src="https://img.scryfall.com/symbology/${pip}.svg" alt="${pip}" class="mana-pip">`).join('')
        : `<img src="https://img.scryfall.com/symbology/C.svg" alt="C" class="mana-pip">`
      }</div>
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

  <!-- Context paragraph -->
  <div class="context-box">${contextText}</div>

  <!-- Top 5 spotlight -->
  <div style="margin-bottom:28px">
    <p style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);margin-bottom:12px">Most Valuable Cards</p>
    <div class="spotlight-row">${top5HTML}</div>
  </div>

  <!-- Filter bar -->
  <div class="filter-bar">

    <!-- Colour Identity -->
    <div class="filter-row">
      <span class="filter-label">Colour</span>
      <button class="filter-btn colour-btn active" data-colour-filter="all" onclick="setColour(this,'all')">All</button>
      <button class="filter-btn colour-btn" data-colour-filter="W" onclick="setColour(this,'W')"><img src="https://img.scryfall.com/symbology/W.svg" class="mana-pip-filter" alt="White"> White</button>
      <button class="filter-btn colour-btn" data-colour-filter="U" onclick="setColour(this,'U')"><img src="https://img.scryfall.com/symbology/U.svg" class="mana-pip-filter" alt="Blue"> Blue</button>
      <button class="filter-btn colour-btn" data-colour-filter="B" onclick="setColour(this,'B')"><img src="https://img.scryfall.com/symbology/B.svg" class="mana-pip-filter" alt="Black"> Black</button>
      <button class="filter-btn colour-btn" data-colour-filter="R" onclick="setColour(this,'R')"><img src="https://img.scryfall.com/symbology/R.svg" class="mana-pip-filter" alt="Red"> Red</button>
      <button class="filter-btn colour-btn" data-colour-filter="G" onclick="setColour(this,'G')"><img src="https://img.scryfall.com/symbology/G.svg" class="mana-pip-filter" alt="Green"> Green</button>
      <button class="filter-btn colour-btn" data-colour-filter="C" onclick="setColour(this,'C')"><img src="https://img.scryfall.com/symbology/C.svg" class="mana-pip-filter" alt="Colourless"> Colourless</button>
      <button class="filter-btn colour-btn" data-colour-filter="M" onclick="setColour(this,'M')">🌈 Multicolour</button>
    </div>

    <!-- Type -->
    <div class="filter-row">
      <span class="filter-label">Type</span>
      <button class="filter-btn active" data-type-filter="all" onclick="setType(this,'all')">All</button>
      <button class="filter-btn" data-type-filter="Creature" onclick="setType(this,'Creature')">Creature</button>
      <button class="filter-btn" data-type-filter="Instant" onclick="setType(this,'Instant')">Instant</button>
      <button class="filter-btn" data-type-filter="Sorcery" onclick="setType(this,'Sorcery')">Sorcery</button>
      <button class="filter-btn" data-type-filter="Artifact" onclick="setType(this,'Artifact')">Artifact</button>
      <button class="filter-btn" data-type-filter="Enchantment" onclick="setType(this,'Enchantment')">Enchantment</button>
      <button class="filter-btn" data-type-filter="Planeswalker" onclick="setType(this,'Planeswalker')">Planeswalker</button>
      <button class="filter-btn" data-type-filter="Land" onclick="setType(this,'Land')">Land</button>
      <button class="filter-btn" data-type-filter="Battle" onclick="setType(this,'Battle')">Battle</button>
    </div>

    <!-- Rarity -->
    <div class="filter-row">
      <span class="filter-label">Rarity</span>
      <button class="filter-btn active" data-rarity-filter="all" onclick="setRarity(this,'all')">All</button>
      <button class="filter-btn" data-rarity-filter="mythic" onclick="setRarity(this,'mythic')" style="color:#f5a623;border-color:rgba(245,166,35,.3)">◆ Mythic</button>
      <button class="filter-btn" data-rarity-filter="rare" onclick="setRarity(this,'rare')" style="color:#a855f7;border-color:rgba(168,85,247,.3)">◆ Rare</button>
      <button class="filter-btn" data-rarity-filter="uncommon" onclick="setRarity(this,'uncommon')" style="color:#6ba3be;border-color:rgba(107,163,190,.3)">◆ Uncommon</button>
      <button class="filter-btn" data-rarity-filter="common" onclick="setRarity(this,'common')" style="color:#9ca3af;border-color:rgba(156,163,175,.3)">◆ Common</button>
    </div>

    <!-- Mana Value -->
    <div class="filter-row">
      <span class="filter-label">Mana Value</span>
      <button class="filter-btn active" data-cmc-filter="all" onclick="setCmc(this,'all')">All</button>
      ${[0,1,2,3,4,5,6].map(n => `<button class="filter-btn" data-cmc-filter="${n}" onclick="setCmc(this,'${n}')">${n === 6 ? '6+' : n}<img src="https://img.scryfall.com/symbology/${n}.svg" class="mana-pip-filter" alt="${n}" style="margin-left:2px"></button>`).join('')}
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
// ── State ──────────────────────────────────────────────────
let activeColour = 'all';
let activeType   = 'all';
let activeRarity = 'all';
let activeCmc    = 'all';

// Rarity sort order
const RARITY_ORDER = { mythic: 0, rare: 1, uncommon: 2, common: 3 };

// ── Filter setters ─────────────────────────────────────────
function setColour(btn, val) {
  activeColour = val;
  document.querySelectorAll('[data-colour-filter]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyFilters();
}
function setType(btn, val) {
  activeType = val;
  document.querySelectorAll('[data-type-filter]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyFilters();
}
function setRarity(btn, val) {
  activeRarity = val;
  document.querySelectorAll('[data-rarity-filter]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyFilters();
}
function setCmc(btn, val) {
  activeCmc = val;
  document.querySelectorAll('[data-cmc-filter]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyFilters();
}

// ── Main filter + sort ─────────────────────────────────────
function applyFilters() {
  const minPrice = parseFloat(document.getElementById('filter-price').value) || 0;
  const sortVal  = document.getElementById('sort-select').value;
  const grid     = document.getElementById('card-grid');
  const cards    = Array.from(grid.querySelectorAll('.card-item'));

  let visible = 0;
  cards.forEach(card => {
    const rarity  = card.dataset.rarity || '';
    const price   = parseFloat(card.dataset.price) || 0;
    const colour  = card.dataset.colour || 'C';
    const colRaw  = card.dataset.colourRaw || '';
    const type    = card.dataset.type || '';
    const cmc     = parseInt(card.dataset.cmc, 10) || 0;

    // Colour filter: 'M' = multicolour, letter = that colour in raw list, 'all' = show all
    const colOk =
      activeColour === 'all' ? true :
      activeColour === 'M'   ? colour === 'M' :
                               colRaw.split(',').includes(activeColour);

    const typeOk   = activeType   === 'all' || type === activeType;
    const rarityOk = activeRarity === 'all' || rarity === activeRarity;
    const cmcOk    = activeCmc    === 'all' || (activeCmc === '6' ? cmc >= 6 : cmc === parseInt(activeCmc, 10));
    const priceOk  = price >= minPrice;

    const show = colOk && typeOk && rarityOk && cmcOk && priceOk;
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });

  document.getElementById('filter-count').textContent = visible + ' cards';

  // Sort visible cards
  const visible_cards = cards.filter(c => c.style.display !== 'none');
  visible_cards.sort((a, b) => {
    const ap = parseFloat(a.dataset.price) || 0;
    const bp = parseFloat(b.dataset.price) || 0;
    const aName = a.querySelector('.card-name')?.textContent || '';
    const bName = b.querySelector('.card-name')?.textContent || '';
    const aCmc  = parseInt(a.dataset.cmc, 10) || 0;
    const bCmc  = parseInt(b.dataset.cmc, 10) || 0;
    const aRar  = RARITY_ORDER[a.dataset.rarity] ?? 4;
    const bRar  = RARITY_ORDER[b.dataset.rarity] ?? 4;

    if (sortVal === 'price-desc') return bp - ap;
    if (sortVal === 'price-asc')  return ap - bp;
    if (sortVal === 'name-asc')   return aName.localeCompare(bName);
    if (sortVal === 'name-desc')  return bName.localeCompare(aName);
    if (sortVal === 'cmc-asc')    return aCmc - bCmc;
    if (sortVal === 'rarity-desc') return aRar - bRar;
    return 0;
  });

  // Re-append in sorted order (hidden cards stay hidden)
  visible_cards.forEach(c => grid.appendChild(c));
}

function clearFilters() {
  activeColour = 'all'; activeType = 'all'; activeRarity = 'all'; activeCmc = 'all';
  document.querySelectorAll('[data-colour-filter],[data-type-filter],[data-rarity-filter],[data-cmc-filter]')
    .forEach(b => b.classList.remove('active'));
  document.querySelector('[data-colour-filter="all"]').classList.add('active');
  document.querySelector('[data-type-filter="all"]').classList.add('active');
  document.querySelector('[data-rarity-filter="all"]').classList.add('active');
  document.querySelector('[data-cmc-filter="all"]').classList.add('active');
  document.getElementById('filter-price').value = '0';
  document.getElementById('sort-select').value = 'price-desc';
  document.querySelectorAll('.card-item').forEach(c => c.style.display = '');
  document.getElementById('filter-count').textContent = '';
}
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
      supabaseGet('mtg_sets?order=release_date.desc&limit=200&digital=eq.false'),
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
