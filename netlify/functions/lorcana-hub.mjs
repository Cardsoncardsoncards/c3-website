// netlify/functions/lorcana-hub.mjs
// Serves /cards/lorcana — Lorcana card hub

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID        = '5339146789';

async function supabaseGet(path) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch(e) { return []; }
}

const INK_COLOURS = { Amber:'#f5a623', Amethyst:'#7c3aed', Emerald:'#059669', Ruby:'#dc2626', Sapphire:'#2563eb', Steel:'#6b7280' };

export default async (req) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=1800, s-maxage=3600' };

  const [sets, topCards] = await Promise.all([
    supabaseGet('lorcana_sets?order=released_at.desc&limit=100'),
    supabaseGet('lorcana_cards?order=price_usd.desc&price_usd=gt.0&image_uri=not.is.null&limit=20&select=slug,name,version,image_uri,price_usd,ink,rarity')
  ]);

  const hasData = sets.length > 0 || topCards.length > 0;

  const setListHTML = sets.length ? sets.map(s => {
    return `<a href="/cards/lorcana/sets/${encodeURIComponent(s.code || s.id)}" style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;display:flex;align-items:center;gap:8px;text-decoration:none;transition:border-color .2s" onmouseover="this.style.borderColor='var(--lorcana-blue)'" onmouseout="this.style.borderColor='var(--border)'" data-name="${s.name.toLowerCase().replace(/"/g,'&quot;')}">
      <span style="flex:1;font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.name}${s.released_at ? `<span style="font-size:10px;color:var(--text2);margin-left:6px">${s.released_at.slice(0,4)}</span>` : ''}</span>
    </a>`;
  }).join('') : '<div style="color:var(--text2);font-size:14px;padding:20px">Sets loading — check back after tonight\'s sync.</div>';

  const topCardHTML = topCards.map(c => {
    const inkColour = INK_COLOURS[c.ink] || '#888';
    const fullName = c.version ? `${c.name} — ${c.version}` : c.name;
    return `<a href="/cards/lorcana/${c.slug}" style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center;display:block;transition:border-color .2s;border-top:2px solid ${inkColour}" onmouseover="this.style.borderColor='${inkColour}'" onmouseout="this.style.borderColor='var(--border)';this.style.borderTopColor='${inkColour}'">
      ${c.image_uri ? `<img src="${c.image_uri}" alt="${fullName}" style="width:100%;border-radius:6px;max-height:160px;object-fit:contain" loading="lazy">` : `<div style="height:80px;display:flex;align-items:center;justify-content:center;color:var(--text2);font-size:11px">${c.name}</div>`}
      <div style="font-size:10px;color:${inkColour};margin-top:4px;font-weight:700">${c.ink || ''}</div>
      <div style="font-size:11px;color:var(--text);line-height:1.3">${c.name}</div>
      ${c.version ? `<div style="font-size:10px;color:var(--text2)">${c.version}</div>` : ''}
      <div style="font-size:12px;color:var(--lorcana-gold);font-weight:700">${c.price_usd ? `~AU$${(c.price_usd*1.58).toFixed(0)}` : ''}</div>
    </a>`;
  }).join('');

  const ebayStoreURL = `https://www.ebay.com.au/sch/i.html?_nkw=lorcana&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Disney Lorcana Card Prices Australia | Cards on Cards on Cards</title>
  <meta name="description" content="Browse Disney Lorcana card prices in AUD. Australia's Lorcana price guide with live AUD conversion and eBay AU buy links.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/lorcana">
  <link rel="icon" href="/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#0d0f18;--bg2:#161a2a;--bg3:#1e2235;--lorcana-blue:#0189C4;--lorcana-gold:#F5B202;--text:#e8eaf0;--text2:#9ba3c4;--border:#2d3254;--radius:12px}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6}
    a{color:var(--lorcana-blue);text-decoration:none} a:hover{text-decoration:underline}
    .wrap{max-width:1100px;margin:0 auto;padding:0 24px}
    nav{background:rgba(13,15,24,.95);border-bottom:1px solid var(--border);padding:10px 0;position:sticky;top:0;z-index:100;backdrop-filter:blur(16px)}
    .nav-inner{max-width:1100px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .nav-logo{font-family:'Cinzel',serif;font-size:13px;font-weight:700;color:var(--lorcana-gold);text-transform:uppercase;letter-spacing:.1em}
    .nav-links{display:flex;gap:6px;flex-wrap:wrap}
    .nav-link{font-size:12px;padding:5px 10px;border-radius:6px;border:1px solid var(--border);color:var(--text2);transition:all .2s}
    .nav-link:hover{color:var(--text);border-color:var(--text2);text-decoration:none}
    .nav-link.active{color:var(--lorcana-blue);border-color:var(--lorcana-blue);background:rgba(1,137,196,.06)}
    .hero{padding:48px 24px 40px;text-align:center;position:relative;z-index:1}
    h1{font-family:'Cinzel',serif;font-size:clamp(28px,5vw,48px);font-weight:700;color:var(--text);margin-bottom:12px}
    h1 span{color:var(--lorcana-gold)}
    .hero-sub{font-size:16px;color:var(--text2);max-width:600px;margin:0 auto 32px}
    .stat-bar{display:flex;gap:0;justify-content:center;border:1px solid var(--border);border-radius:12px;overflow:hidden;max-width:480px;margin:0 auto 40px}
    .stat-item{flex:1;padding:14px 20px;text-align:center;border-right:1px solid var(--border)}
    .stat-item:last-child{border-right:none}
    .stat-num{font-family:'Cinzel',serif;font-size:22px;font-weight:700;color:var(--lorcana-gold)}
    .stat-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text2);margin-top:2px}
    .section{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:28px}
    .section-title{font-size:18px;font-weight:700;color:var(--text);margin-bottom:16px}
    input{background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:9px 14px;border-radius:8px;font-size:14px;font-family:'DM Sans',sans-serif;width:100%;max-width:480px}
    input::placeholder{color:var(--text2)}
    input:focus{outline:none;border-color:var(--lorcana-blue)}
    .btn{display:inline-block;padding:9px 20px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;border:none;font-family:'DM Sans',sans-serif;transition:opacity .2s}
    .btn:hover{opacity:.85;text-decoration:none}
    .btn-primary{background:var(--lorcana-blue);color:#fff}
    .ink-filter{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
    .ink-btn{padding:5px 14px;border-radius:100px;font-size:12px;font-weight:700;cursor:pointer;border:2px solid transparent;transition:all .2s;background:none}
    .ink-btn.active{border-color:currentColor;background:rgba(255,255,255,.06)}
    .quick-links{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:28px}
    .quick-link{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:10px;font-weight:700;font-size:13px;text-decoration:none;transition:opacity .2s}
    .quick-link:hover{opacity:.85;text-decoration:none}
    .top-cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
    .set-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:4px;margin-top:12px}
    footer{border-top:1px solid var(--border);padding:28px 24px;text-align:center;font-size:13px;color:var(--text2);margin-top:48px}
    footer a{color:var(--text2);margin:0 8px}
    #search-results{margin-top:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
  
.nav-link--calendar{color:#F87171;border-color:rgba(248,113,113,.35)}.nav-link--calendar:hover{color:#FCA5A5;border-color:#F87171;background:rgba(248,113,113,.06)}
.nav-link--generators{color:#22D3EE;border-color:rgba(34,211,238,.35)}.nav-link--generators:hover{color:#67E8F9;border-color:#22D3EE;background:rgba(34,211,238,.06)}
  </style>
</head>
<body>
<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo">Cards on Cards on Cards</a>
    <div class="nav-links">
      <a href="/" class="nav-link">← Home</a>
      <a href="/cards/mtg" class="nav-link">MTG</a>
      <a href="/cards/pokemon" class="nav-link">Pokemon</a>
      <a href="/cards/lorcana" class="nav-link active">Lorcana</a>
      <a href="/cards/yugioh" class="nav-link">Yu-Gi-Oh</a>
            <a href="/calendar" class="nav-link nav-link--calendar">Calendar</a>
      <a href="/generators" class="nav-link nav-link--generators">Generators</a>
      <a href="/shop.html" class="nav-link">Shop</a>
      <a href="/tracker.html" class="nav-link">Tracker</a>
    </div>
  </div>
</nav>

<div class="hero">
  <h1>Lorcana Card Prices <span>in Australia</span></h1>
  <p class="hero-sub">Disney Lorcana card pricing in AUD. Live conversion, eBay AU buy links, and browse by ink colour or set.</p>
  <div class="stat-bar">
    <div class="stat-item"><div class="stat-num">${sets.length || '—'}</div><div class="stat-label">Sets</div></div>
    <div class="stat-item"><div class="stat-num">6</div><div class="stat-label">Ink Colours</div></div>
    <div class="stat-item"><div class="stat-num">AU$</div><div class="stat-label">Live Prices</div></div>
    <div class="stat-item"><div class="stat-num">Daily</div><div class="stat-label">Updates</div></div>
  </div>
</div>

<div class="wrap">

  <div class="quick-links">
    <a href="/tracker.html" class="quick-link" style="background:linear-gradient(135deg,#0189C4,#0070a8);color:#fff">📋 Free Tracker</a>
    <a href="${ebayStoreURL}" target="_blank" rel="noopener sponsored" class="quick-link" style="background:var(--bg2);border:1px solid var(--border);color:var(--text)">🛒 Shop Lorcana on eBay ↗</a>
    <a href="/blog/is-disney-lorcana-worth-starting-2026-australia/" class="quick-link" style="background:var(--bg2);border:1px solid var(--border);color:var(--text)">Is Lorcana Worth It? →</a>
    <a href="/blog/best-lorcana-booster-boxes-australia/" class="quick-link" style="background:var(--bg2);border:1px solid var(--border);color:var(--text)">Best Booster Boxes →</a>
  </div>

  ${topCards.length ? `
  <div class="section">
    <div class="section-title">Most Valuable Lorcana Cards (AUD)</div>
    <div class="top-cards-grid">${topCardHTML}</div>
  </div>` : ''}

  <div class="section">
    <div class="section-title">Search Lorcana Cards</div>
    <div class="ink-filter">
      ${Object.entries(INK_COLOURS).map(([ink, colour]) =>
        `<button class="ink-btn" style="color:${colour}" onclick="filterByInk('${ink}',this)">${ink}</button>`
      ).join('')}
      <button class="ink-btn active" style="color:var(--text2)" onclick="clearInk(this)">All Inks</button>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <input type="text" id="card-search" placeholder="Card name e.g. Elsa, Moana..." onkeyup="if(event.key==='Enter')searchCard()">
      <button class="btn btn-primary" onclick="searchCard()">Search</button>
    </div>
    <div id="search-results"></div>
  </div>

  <div class="section">
    <div class="section-title">Browse by Set</div>
    <input type="text" id="set-search" placeholder="Search sets e.g. First Chapter, Rise..." oninput="filterSets(this.value)" style="margin-bottom:12px">
    <div id="set-list" class="set-grid">${setListHTML}</div>
  </div>

  ${!hasData ? `
  <div style="text-align:center;padding:40px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:28px">
    <div style="font-size:32px;margin-bottom:12px">🏰</div>
    <h2 style="font-size:20px;margin-bottom:8px;color:var(--lorcana-gold)">Lorcana Cards Syncing</h2>
    <p style="color:var(--text2);font-size:14px;max-width:400px;margin:0 auto 20px">The first Lorcana sync is running overnight. Check back tomorrow.</p>
    <a href="/tracker.html" class="btn btn-primary">Get the Free Tracker →</a>
  </div>` : ''}

</div>

<footer>
  <div style="margin-bottom:10px">
    <a href="/">Home</a><a href="/cards/mtg">MTG</a><a href="/cards/pokemon">Pokemon</a><a href="/cards/lorcana">Lorcana</a><a href="/cards/yugioh">Yu-Gi-Oh</a><a href="/blog">Blog</a><a href="/tracker.html">Tracker</a>
  </div>
  <p>© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
  <p style="margin-top:6px;font-size:11px;opacity:.5">Not affiliated with Disney or Ravensburger. Card data via Lorcast API. Prices converted to AUD at approximately 1.58.</p>
</footer>

<script>
window.C3_SUPA_URL = '${SUPABASE_URL}';
window.C3_SUPA_KEY = '${SUPABASE_ANON_KEY}';
let activeInk = null;

function filterSets(q) {
  const lower = q.toLowerCase();
  document.querySelectorAll('#set-list [data-name]').forEach(el => {
    el.style.display = el.dataset.name.includes(lower) ? '' : 'none';
  });
}

function filterByInk(ink, btn) {
  activeInk = ink;
  document.querySelectorAll('.ink-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  searchCard();
}

function clearInk(btn) {
  activeInk = null;
  document.querySelectorAll('.ink-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  searchCard();
}

async function searchCard() {
  const q = document.getElementById('card-search').value.trim();
  if (!q && !activeInk) return;
  const results = document.getElementById('search-results');
  results.innerHTML = '<div style="color:var(--text2);font-size:13px">Searching...</div>';
  try {
    let url = window.C3_SUPA_URL + '/rest/v1/lorcana_cards?select=slug,name,version,image_uri,price_usd,ink,rarity&order=price_usd.desc&limit=24';
    if (q) url += '&name=ilike.*' + encodeURIComponent(q) + '*';
    if (activeInk) url += '&ink=eq.' + encodeURIComponent(activeInk);
    const res = await fetch(url, { headers: { 'apikey': window.C3_SUPA_KEY } });
    const cards = await res.json();
    if (!cards.length) { results.innerHTML = '<div style="color:var(--text2);font-size:13px">No cards found.</div>'; return; }
    const inkColours = ${JSON.stringify(INK_COLOURS)};
    results.innerHTML = cards.map(c => {
      const colour = inkColours[c.ink] || '#888';
      const fullName = c.version ? c.name + ' — ' + c.version : c.name;
      return \`<a href="/cards/lorcana/\${c.slug}" style="background:var(--bg2);border:1px solid var(--border);border-top:2px solid \${colour};border-radius:8px;padding:8px;text-align:center;display:block">
        \${c.image_uri ? \`<img src="\${c.image_uri}" alt="\${fullName}" style="width:100%;border-radius:6px;max-height:140px;object-fit:contain" loading="lazy">\` : ''}
        <div style="font-size:10px;color:\${colour};margin-top:4px;font-weight:700">\${c.ink||''}</div>
        <div style="font-size:11px;color:var(--text);line-height:1.3">\${c.name}</div>
        \${c.version ? \`<div style="font-size:10px;color:var(--text2)">\${c.version}</div>\` : ''}
        <div style="font-size:12px;color:var(--lorcana-gold);font-weight:700">\${c.price_usd ? '~AU$'+(c.price_usd*1.58).toFixed(2) : ''}</div>
      </a>\`;
    }).join('');
  } catch(e) {
    results.innerHTML = '<div style="color:#f88;font-size:13px">Search error. Try again.</div>';
  }
}
</script>

<script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
</body>
</html>`;

  return new Response(html, { status: 200, headers });
};

export const config = { path: '/cards/lorcana' };
