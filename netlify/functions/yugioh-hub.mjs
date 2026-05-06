// netlify/functions/yugioh-hub.mjs
// Serves /cards/yugioh — Yu-Gi-Oh card hub

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

const ATTR_COLOURS = { LIGHT:'#f0d060', DARK:'#8040c0', FIRE:'#e05020', WATER:'#2080e0', EARTH:'#805040', WIND:'#40c060', DIVINE:'#f0a020' };

export default async (req) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=1800, s-maxage=3600' };

  const [sets, topCards, archetypes] = await Promise.all([
    supabaseGet('yugioh_sets?order=tcg_date.desc&limit=200'),
    supabaseGet('yugioh_cards?order=price_usd.desc&price_usd=gt.0&image_uri=not.is.null&limit=20&select=slug,name,image_uri,image_uri_small,price_usd,type,attribute,archetype'),
    supabaseGet('yugioh_cards?select=archetype&archetype=not.is.null&order=price_usd.desc&limit=500')
  ]);

  const hasData = sets.length > 0 || topCards.length > 0;

  const archMap = new Map();
  archetypes.forEach(c => { if (c.archetype) archMap.set(c.archetype, (archMap.get(c.archetype)||0)+1); });
  const topArchetypes = [...archMap.entries()].sort((a,b) => b[1]-a[1]).slice(0,12).map(([name]) => name);

  const setListHTML = sets.length ? sets.map(s => `
    <a href="/cards/yugioh?set=${encodeURIComponent(s.set_name)}" style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;display:block;text-decoration:none;transition:border-color .2s" onmouseover="this.style.borderColor='var(--ygo-gold)'" onmouseout="this.style.borderColor='var(--border)'"
         data-name="${s.set_name.toLowerCase().replace(/"/g,'&quot;')}">
      <div style="font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.set_name}
        ${s.tcg_date ? `<span style="font-size:10px;color:var(--text2);margin-left:6px">${s.tcg_date.slice(0,4)}</span>` : ''}
      </div>
      ${s.set_code ? `<div style="font-size:10px;color:var(--text2)">${s.set_code}</div>` : ''}
    </a>`).join('') : '<div style="color:var(--text2);font-size:14px;padding:20px">Sets loading — check back after tonight\'s sync.</div>';

  const topCardHTML = topCards.map(c => {
    const attrColour = ATTR_COLOURS[c.attribute] || '#888';
    return `<a href="/cards/yugioh/${c.slug}" style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center;display:block;transition:border-color .2s" onmouseover="this.style.borderColor='var(--ygo-gold)'" onmouseout="this.style.borderColor='var(--border)'">
      ${c.image_uri_small||c.image_uri ? `<img src="${c.image_uri_small||c.image_uri}" alt="${c.name}" style="width:100%;border-radius:4px;max-height:160px;object-fit:contain" loading="lazy">` : ''}
      ${c.attribute ? `<div style="font-size:9px;color:${attrColour};margin-top:4px;font-weight:700;letter-spacing:.05em">${c.attribute}</div>` : ''}
      <div style="font-size:11px;color:var(--text);line-height:1.3;margin-top:2px">${c.name}</div>
      <div style="font-size:12px;color:var(--ygo-gold);font-weight:700">${c.price_usd ? `~AU$${(c.price_usd*1.58).toFixed(0)}` : ''}</div>
    </a>`;
  }).join('');

  const ebayStoreURL = `https://www.ebay.com.au/sch/i.html?_nkw=yugioh+cards&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Yu-Gi-Oh Card Prices Australia | Cards on Cards on Cards</title>
  <meta name="description" content="Browse Yu-Gi-Oh card prices in AUD. Australia's Yu-Gi-Oh price guide with live AUD conversion, archetype browsing, and eBay AU buy links.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/yugioh">
  <link rel="icon" href="/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#08090f;--bg2:#0f1120;--bg3:#161928;--ygo-gold:#c8a332;--ygo-purple:#6B2D8B;--text:#e8eaf0;--text2:#9ba3c4;--border:#2d3254;--radius:12px}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6}
    a{color:var(--ygo-gold);text-decoration:none} a:hover{text-decoration:underline}
    .wrap{max-width:1100px;margin:0 auto;padding:0 24px}
    nav{background:rgba(8,9,15,.97);border-bottom:1px solid var(--border);padding:10px 0;position:sticky;top:0;z-index:100;backdrop-filter:blur(16px)}
    .nav-inner{max-width:1100px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .nav-logo{font-family:'Cinzel',serif;font-size:13px;font-weight:700;color:var(--ygo-gold);text-transform:uppercase;letter-spacing:.1em}
    .nav-links{display:flex;gap:6px;flex-wrap:wrap}
    .nav-link{font-size:12px;padding:5px 10px;border-radius:6px;border:1px solid var(--border);color:var(--text2);transition:all .2s}
    .nav-link:hover{color:var(--text);border-color:var(--text2);text-decoration:none}
    .nav-link.active{color:var(--ygo-purple);border-color:var(--ygo-purple);background:rgba(107,45,139,.06)}
    .hero{padding:48px 24px 40px;text-align:center;position:relative;z-index:1}
    h1{font-family:'Cinzel',serif;font-size:clamp(28px,5vw,48px);font-weight:700;color:var(--text);margin-bottom:12px}
    h1 span{color:var(--ygo-gold)}
    .hero-sub{font-size:16px;color:var(--text2);max-width:600px;margin:0 auto 32px}
    .stat-bar{display:flex;gap:0;justify-content:center;border:1px solid var(--border);border-radius:12px;overflow:hidden;max-width:480px;margin:0 auto 40px}
    .stat-item{flex:1;padding:14px 20px;text-align:center;border-right:1px solid var(--border)}
    .stat-item:last-child{border-right:none}
    .stat-num{font-family:'Cinzel',serif;font-size:22px;font-weight:700;color:var(--ygo-gold)}
    .stat-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text2);margin-top:2px}
    .section{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:28px}
    .section-title{font-size:18px;font-weight:700;color:var(--text);margin-bottom:16px}
    .section-title-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
    input{background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:9px 14px;border-radius:8px;font-size:14px;font-family:'DM Sans',sans-serif;width:100%;max-width:480px}
    input::placeholder{color:var(--text2)}
    input:focus{outline:none;border-color:var(--ygo-gold)}
    .btn{display:inline-block;padding:9px 20px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;border:none;font-family:'DM Sans',sans-serif;transition:opacity .2s}
    .btn:hover{opacity:.85;text-decoration:none}
    .btn-primary{background:var(--ygo-gold);color:#000}
    .attr-filter{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
    .attr-btn{padding:4px 12px;border-radius:100px;font-size:11px;font-weight:700;cursor:pointer;border:2px solid transparent;transition:all .2s;background:none}
    .attr-btn.active{border-color:currentColor;background:rgba(255,255,255,.06)}
    .archetype-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
    .arch-chip{padding:5px 12px;border-radius:100px;font-size:11px;background:var(--bg3);border:1px solid var(--border);color:var(--text2);cursor:pointer;transition:all .2s}
    .arch-chip:hover{border-color:var(--ygo-gold);color:var(--ygo-gold)}
    .quick-links{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:28px}
    .quick-link{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:10px;font-weight:700;font-size:13px;text-decoration:none;transition:opacity .2s}
    .quick-link:hover{opacity:.85;text-decoration:none}
    .top-cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}
    .set-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:4px;margin-top:12px}
    .card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:12px}
    footer{border-top:1px solid var(--border);padding:28px 24px;text-align:center;font-size:13px;color:var(--text2);margin-top:48px}
    footer a{color:var(--text2);margin:0 8px}
    #search-results{margin-top:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
    #archetype-results{margin-top:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}
  
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
      <a href="/cards/lorcana" class="nav-link">Lorcana</a>
      <a href="/cards/yugioh" class="nav-link active">Yu-Gi-Oh</a>
            <a href="/calendar" class="nav-link nav-link--calendar">Calendar</a>
      <a href="/generators" class="nav-link nav-link--generators">Generators</a>
      <a href="/shop.html" class="nav-link">Shop</a>
      <a href="/tracker.html" class="nav-link">Tracker</a>
    </div>
  </div>
</nav>

<div class="hero">
  <h1>Yu-Gi-Oh Card Prices <span>in Australia</span></h1>
  <p class="hero-sub">Live AUD pricing, eBay AU buy links, archetype browsing, and set search for the Yu-Gi-Oh TCG. Updated daily.</p>
  <div class="stat-bar">
    <div class="stat-item"><div class="stat-num">200+</div><div class="stat-label">Sets</div></div>
    <div class="stat-item"><div class="stat-num">12K+</div><div class="stat-label">Cards</div></div>
    <div class="stat-item"><div class="stat-num">AU$</div><div class="stat-label">Live Prices</div></div>
    <div class="stat-item"><div class="stat-num">Daily</div><div class="stat-label">Updates</div></div>
  </div>
</div>

<div class="wrap">

  <div class="quick-links">
    <a href="/tracker.html" class="quick-link" style="background:var(--ygo-gold);color:#000">📋 Free Tracker</a>
    <a href="${ebayStoreURL}" target="_blank" rel="noopener sponsored" class="quick-link" style="background:var(--bg2);border:1px solid var(--border);color:var(--text)">🛒 Shop Yu-Gi-Oh on eBay ↗</a>
    <a href="/blog/yugioh-tcg-beginners-guide-australia/" class="quick-link" style="background:var(--bg2);border:1px solid var(--border);color:var(--text)">📖 Beginners Guide →</a>
    <a href="/blog/yugioh-booster-boxes-australia/" class="quick-link" style="background:var(--bg2);border:1px solid var(--border);color:var(--text)">📦 Best Booster Boxes →</a>
  </div>

  ${topCards.length ? `
  <div class="section">
    <div class="section-title">Most Valuable Yu-Gi-Oh Cards (AUD)</div>
    <div class="top-cards-grid">${topCardHTML}</div>
  </div>` : ''}

  <div class="section">
    <div class="section-title">Search Yu-Gi-Oh Cards</div>
    <div class="attr-filter">
      ${Object.entries(ATTR_COLOURS).map(([attr, colour]) =>
        `<button class="attr-btn" style="color:${colour}" onclick="filterByAttr('${attr}',this)">${attr}</button>`
      ).join('')}
      <button class="attr-btn active" style="color:var(--text2)" onclick="clearAttr(this)">All</button>
    </div>
    ${topArchetypes.length ? `
    <div style="font-size:11px;color:var(--text2);margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em">Popular Archetypes</div>
    <div class="archetype-chips">
      ${topArchetypes.map(a => `<span class="arch-chip" onclick="searchArchetype('${a.replace(/'/g,"\\'")}')  ">${a}</span>`).join('')}
    </div>` : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <input type="text" id="card-search" placeholder="Card name e.g. Blue-Eyes, Dark Magician..." onkeyup="if(event.key==='Enter')searchCard()">
      <button class="btn btn-primary" onclick="searchCard()">Search</button>
    </div>
    <div id="search-results"></div>
    <div id="archetype-results"></div>
  </div>

  <div class="section">
    <div class="section-title">Browse by Set</div>
    <input type="text" id="set-search" placeholder="Search sets e.g. Legacy of Destruction..." oninput="filterSets(this.value)" style="margin-bottom:12px">
    <div id="set-list" class="set-grid">${setListHTML}</div>
  </div>

  ${!hasData ? `
  <div style="text-align:center;padding:40px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:28px">
    <div style="font-size:32px;margin-bottom:12px">👁️</div>
    <h2 style="font-size:20px;margin-bottom:8px;color:var(--ygo-gold)">Yu-Gi-Oh Cards Syncing</h2>
    <p style="color:var(--text2);font-size:14px;max-width:400px;margin:0 auto 20px">The first Yu-Gi-Oh sync is running overnight. Check back tomorrow.</p>
    <a href="/tracker.html" class="btn btn-primary">Get the Free Tracker →</a>
  </div>` : ''}

</div>

<footer>
  <div style="margin-bottom:10px">
    <a href="/">Home</a><a href="/cards/mtg">MTG</a><a href="/cards/pokemon">Pokemon</a><a href="/cards/lorcana">Lorcana</a><a href="/cards/yugioh">Yu-Gi-Oh</a><a href="/blog">Blog</a><a href="/tracker.html">Tracker</a>
  </div>
  <p>© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
  <p style="margin-top:6px;font-size:11px;opacity:.5">Not affiliated with Konami. Card data via YGOPRODeck. Prices converted to AUD at approximately 1.58.</p>
</footer>

<script>
window.C3_SUPA_URL = '${SUPABASE_URL}';
window.C3_SUPA_KEY = '${SUPABASE_ANON_KEY}';
let activeAttr = null;

function filterSets(q) {
  const lower = q.toLowerCase();
  document.querySelectorAll('#set-list [data-name]').forEach(el => {
    el.style.display = el.dataset.name.includes(lower) ? '' : 'none';
  });
}

function filterByAttr(attr, btn) {
  activeAttr = attr;
  document.querySelectorAll('.attr-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  searchCard();
}

function clearAttr(btn) {
  activeAttr = null;
  document.querySelectorAll('.attr-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('search-results').innerHTML = '';
}

async function searchArchetype(arch) {
  const res2 = document.getElementById('archetype-results');
  const res1 = document.getElementById('search-results');
  res2.innerHTML = '<div style="color:var(--text2);font-size:13px">Loading...</div>';
  res1.innerHTML = '';
  try {
    const url = window.C3_SUPA_URL + '/rest/v1/yugioh_cards?archetype=eq.' + encodeURIComponent(arch) + '&select=slug,name,image_uri_small,image_uri,price_usd,type,attribute&order=price_usd.desc&limit=24';
    const res = await fetch(url, { headers: { 'apikey': window.C3_SUPA_KEY } });
    const cards = await res.json();
    if (!cards.length) { res2.innerHTML = '<div style="color:var(--text2);font-size:13px">No cards found.</div>'; return; }
    const attrColours = ${JSON.stringify(ATTR_COLOURS)};
    res2.innerHTML = \`<div style="font-size:13px;font-weight:700;color:var(--ygo-gold);margin-bottom:8px">\${arch} archetype</div>\` +
      cards.map(c => {
        const colour = attrColours[c.attribute] || '#888';
        return \`<a href="/cards/yugioh/\${c.slug}" style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center;display:block">
          \${c.image_uri_small||c.image_uri ? \`<img src="\${c.image_uri_small||c.image_uri}" alt="\${c.name}" style="width:100%;border-radius:4px;max-height:130px;object-fit:contain" loading="lazy">\` : ''}
          \${c.attribute ? \`<div style="font-size:9px;color:\${colour};margin-top:3px;font-weight:700">\${c.attribute}</div>\` : ''}
          <div style="font-size:10px;color:var(--text);line-height:1.3;margin-top:2px">\${c.name}</div>
          <div style="font-size:11px;color:var(--ygo-gold);font-weight:700">\${c.price_usd ? '~AU$'+(c.price_usd*1.58).toFixed(0) : ''}</div>
        </a>\`;
      }).join('');
  } catch(e) {
    res2.innerHTML = '<div style="color:#f88;font-size:13px">Error loading archetype.</div>';
  }
}

async function searchCard() {
  const q = document.getElementById('card-search').value.trim();
  if (!q && !activeAttr) return;
  const results = document.getElementById('search-results');
  document.getElementById('archetype-results').innerHTML = '';
  results.innerHTML = '<div style="color:var(--text2);font-size:13px">Searching...</div>';
  try {
    let url = window.C3_SUPA_URL + '/rest/v1/yugioh_cards?select=slug,name,image_uri_small,image_uri,price_usd,type,attribute&order=price_usd.desc&limit=24';
    if (q) url += '&name=ilike.*' + encodeURIComponent(q) + '*';
    if (activeAttr) url += '&attribute=eq.' + encodeURIComponent(activeAttr);
    const res = await fetch(url, { headers: { 'apikey': window.C3_SUPA_KEY } });
    const cards = await res.json();
    if (!cards.length) { results.innerHTML = '<div style="color:var(--text2);font-size:13px">No cards found.</div>'; return; }
    const attrColours = ${JSON.stringify(ATTR_COLOURS)};
    results.innerHTML = cards.map(c => {
      const colour = attrColours[c.attribute] || '#888';
      return \`<a href="/cards/yugioh/\${c.slug}" style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center;display:block">
        \${c.image_uri_small||c.image_uri ? \`<img src="\${c.image_uri_small||c.image_uri}" alt="\${c.name}" style="width:100%;border-radius:4px;max-height:130px;object-fit:contain" loading="lazy">\` : ''}
        \${c.attribute ? \`<div style="font-size:9px;color:\${colour};margin-top:3px;font-weight:700">\${c.attribute}</div>\` : ''}
        <div style="font-size:11px;color:var(--text);line-height:1.3;margin-top:2px">\${c.name}</div>
        <div style="font-size:12px;color:var(--ygo-gold);font-weight:700">\${c.price_usd ? '~AU$'+(c.price_usd*1.58).toFixed(0) : ''}</div>
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

export const config = { path: '/cards/yugioh' };
