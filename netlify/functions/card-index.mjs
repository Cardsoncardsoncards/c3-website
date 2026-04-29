// netlify/functions/card-index.mjs
// Serves:
// /cards/mtg - MTG card hub with search
// /cards/mtg/random-commander - Random commander generator
// /cards/mtg/sets/:setSlug - Set index pages

const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
  });
  return res.json();
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
      <div style="font-size:12px;color:var(--accent);font-weight:bold">${c.price_usd ? `~AU$${(c.price_aud > 0 ? parseFloat(c.price_aud) : c.price_usd * 1.39).toFixed(0)}` : ''}</div>
    </a>`).join('');

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>MTG Card Prices Australia | Cards on Cards on Cards</title>
  <meta name="description" content="Browse Magic: The Gathering card prices in AUD. Australia's only MTG price guide with live AUD conversion, 90-day price history, and eBay AU buy links.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/mtg">
  ${BASE_STYLES}
</head>
<body>
${NAV}
<div class="wrap" style="padding-top:32px">
  <h1 style="font-size:32px;margin-bottom:8px">MTG Card Prices in Australia</h1>
  <p style="color:var(--text2);margin-bottom:32px">Australia's first MTG price guide with live AUD pricing, 90-day price history, and direct eBay AU buy links. Updated daily.</p>

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
      <h3 style="color:var(--accent);margin-bottom:8px">📊 90-Day Price History</h3>
      <p style="color:var(--text2);font-size:14px">Every card page shows AUD price trends so you know the best time to buy or sell.</p>
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
    <h3 style="margin-bottom:12px">Related Guides</h3>
    <div style="display:flex;flex-wrap:wrap;gap:12px">
      <a href="/blog/best-mtg-booster-boxes-australia/">Best MTG Booster Boxes Australia</a>
      <a href="/blog/mtg-singles-vs-booster-boxes-australia/">Singles vs Booster Boxes</a>
      <a href="/blog/how-to-sell-mtg-cards-australia/">How to Sell MTG Cards in Australia</a>
      <a href="/ev-calculator.html">MTG EV Calculator</a>
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
    const data = await fetch('${SUPABASE_URL}/rest/v1/mtg_cards?name=ilike.*' + encodeURIComponent(q) + '*&limit=8&select=slug,name,price_usd,image_uri_small', {
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
      <a href="/blog/best-mtg-commander-decks-australia/">Best MTG Commander Decks Australia</a>
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

async function generateCommander() {
  const btn = document.querySelector('[onclick="generateCommander()"]');
  btn.textContent = '⏳ Finding commander...';
  btn.disabled = true;
  try {
    const params = new URLSearchParams();
    if (selectedColors.length) params.set('colors', selectedColors.join(''));
    if (selectedCmc < 99) params.set('maxCmc', selectedCmc);
    const res = await fetch('/api/random-commander?' + params);
    const data = await res.json();
    if (!data.slug) { alert('No commanders found with those filters. Try fewer restrictions.'); return; }
    const cardRes = await fetch('${SUPABASE_URL}/rest/v1/mtg_cards?slug=eq.' + data.slug + '&select=name,type_line,image_uri_normal,image_uri_small,price_aud,price_usd,slug', {
      headers: { 'apikey': '${SUPABASE_ANON_KEY}' }
    });
    const cards = await cardRes.json();
    if (!cards[0]) return;
    const card = cards[0];
    document.getElementById('commander-img').src = card.image_uri_normal || card.image_uri_small || '';
    document.getElementById('commander-img').alt = card.name;
    document.getElementById('commander-name').textContent = card.name;
    document.getElementById('commander-type').textContent = card.type_line || '';
    document.getElementById('commander-price').textContent = card.price_aud > 0 ? 'AU$' + parseFloat(card.price_aud).toFixed(2) : (card.price_usd ? '~AU$' + (card.price_usd * 1.39).toFixed(2) : 'Price N/A');
    document.getElementById('commander-link').href = '/cards/mtg/' + card.slug;
    document.getElementById('commander-card').style.display = 'block';
    document.getElementById('commander-card').scrollIntoView({ behavior: 'smooth' });
  } catch(e) { alert('Something went wrong. Try again.'); }
  finally { btn.textContent = '✨ Generate Commander'; btn.disabled = false; }
}
</script>
<!-- GA4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
</body></html>`;
}

// Set Index Page
async function renderSetIndex(setSlug) {
  const sets = await supabaseGet(`mtg_sets?set_slug=eq.${setSlug}&limit=1`);
  if (!sets || !sets[0]) return null;
  const set = sets[0];
  const cards = await supabaseGet(`mtg_cards?set_code=eq.${set.set_code}&order=price_usd.desc.nullslast&limit=300&select=slug,name,image_uri_small,price_usd,rarity,collector_number`);

  const cardGrid = cards.map(c => `
    <a href="/cards/mtg/${c.slug}" style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center;display:block;transition:border-color 0.2s" onmouseover="this.style.borderColor='#f5a623'" onmouseout="this.style.borderColor='#2d3254'">
      ${c.image_uri_small ? `<img src="${c.image_uri_small}" alt="${c.name}" style="width:100%;border-radius:6px" loading="lazy">` : `<div style="height:70px;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--text2)">${c.name}</div>`}
      <div style="font-size:11px;margin-top:4px;color:var(--text);line-height:1.2">${c.name}</div>
      <div style="font-size:12px;color:var(--accent);font-weight:bold">${c.price_usd ? `~AU$${(c.price_aud > 0 ? parseFloat(c.price_aud) : c.price_usd * 1.39).toFixed(0)}` : ''}</div>
    </a>`).join('');

  const hasEVCalc = ['stx','mh3','ltr','woe','mkm','otj','blb','dsk','fdn','dft','tdm'].includes(set.set_code);

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${set.set_name} Card Prices Australia | Cards on Cards on Cards</title>
  <meta name="description" content="Browse all ${set.set_name} card prices in AUD. ${cards.length} cards with live Australian pricing, eBay AU buy links, and 90-day price history.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/mtg/sets/${setSlug}">
  ${BASE_STYLES}
</head>
<body>
${NAV}
<div class="wrap" style="padding-top:32px">
  <div style="font-size:13px;color:var(--text2);margin-bottom:16px">
    <a href="/">Home</a> › <a href="/cards/mtg">MTG Cards</a> › ${set.set_name}
  </div>
  <h1 style="font-size:28px;margin-bottom:8px">${set.set_name} Card Prices (AUD)</h1>
  <p style="color:var(--text2);margin-bottom:24px">${cards.length} cards · Released ${set.release_date || 'N/A'} · Prices in AUD updated daily</p>

  <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:32px">
    ${hasEVCalc ? `<a href="/ev-calculator.html#${set.set_code}" style="background:rgba(124,106,245,0.15);border:1px solid var(--accent2);color:var(--accent2);padding:10px 20px;border-radius:8px;font-weight:bold">📊 ${set.set_name} EV Calculator</a>` : ''}
    ${set.amazon_asin ? `<a href="https://www.amazon.com.au/dp/${set.amazon_asin}?tag=blasdigital-22" target="_blank" rel="noopener" style="background:#232f3e;border:1px solid #f90;color:#f90;padding:10px 20px;border-radius:8px;font-weight:bold">📦 Buy Sealed on Amazon AU</a>` : ''}
    <a href="/blog" style="background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:10px 20px;border-radius:8px">📖 Read Our Guides</a>
  </div>

  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px">
    ${cardGrid}
  </div>

  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-top:32px;text-align:center">
    💰 Want to sell your ${set.set_name} cards? <a href="/tracker.html">Join the C3 buylist waitlist</a>
  </div>
</div>

<footer>
  <p><a href="/">Home</a><a href="/cards/mtg">MTG Cards</a><a href="/ev-calculator.html">EV Calculator</a><a href="/shop.html">Shop</a><a href="/blog">Blog</a></p>
  <p style="margin-top:8px">© 2026 Cards on Cards on Cards</p>
</footer>
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
