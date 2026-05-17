// netlify/functions/mtg-hub.mjs
// Serves /cards/mtg
// Pattern: identical to lorcana-hub.mjs (confirmed working)
// All HTML pre-built into variables BEFORE the Response template literal

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID        = '5339146789';

const CALENDAR_EVENTS = [
  { date: '2026-06-13', name: 'Final Fantasy',               type: 'Set Release' },
  { date: '2026-06-20', name: 'Pro Tour Marvel Super Heroes', type: 'Pro Tour'    },
  { date: '2026-08-07', name: 'Edge of Eternities',          type: 'Set Release' },
  { date: '2026-09-12', name: 'Australian Nationals',        type: 'Tournament'  },
];

async function supabaseGet(path) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch(e) { return []; }
}

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((new Date(dateStr + 'T00:00:00') - today) / 86400000);
}

function buildTickerHTML(events) {
  const today = new Date(); today.setHours(0,0,0,0);
  const upcoming = events.filter(e => new Date(e.date + 'T00:00:00') >= today)
    .sort((a,b) => a.date.localeCompare(b.date));
  if (!upcoming.length) return '';
  const items = upcoming.map(e => {
    const days = daysUntil(e.date);
    const label = days === 0 ? 'TODAY' : days === 1 ? 'TOMORROW' : `IN ${days} DAYS`;
    return `<span class="ticker-item"><span class="ticker-badge">${label}</span><strong>${e.name}</strong> &middot; ${e.type}</span>`;
  });
  const doubled = [...items, ...items].join('');
  return `<div class="release-ticker"><span class="ticker-label">&#9876;&#65039; MTG</span><div class="ticker-track">${doubled}</div></div>`;
}

function buildAZFilter(sets) {
  const letters = new Set();
  sets.forEach(s => {
    const ch = (s.name || '').trim()[0];
    if (ch) letters.add(/[A-Z]/.test(ch.toUpperCase()) ? ch.toUpperCase() : '0-9');
  });
  const sorted = ['All', '0-9', ...[...letters].filter(l => l !== '0-9').sort()];
  return sorted.map(l => `<button class="az-btn${l==='All'?' az-btn--active':''}" onclick="filterAZ('${l}',this)">${l}</button>`).join('');
}

const SKIP_TYPES = new Set(['token','memorabilia','minigame','funny']);

export default async (req) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=1800, s-maxage=3600' };

  const [allSets, topCards] = await Promise.all([
    supabaseGet('mtg_sets?order=released_at.desc&limit=800&select=id,name,slug,released_at,card_count,set_type'),
    supabaseGet('mtg_cards?order=price_aud.desc&price_aud=gt.5&image_uri_small=not.is.null&limit=24&select=slug,name,set_name,image_uri_small,price_aud,rarity')
  ]);

  const sets = allSets.filter(s => !SKIP_TYPES.has(s.set_type));
  const tickerHTML = buildTickerHTML(CALENDAR_EVENTS);
  const azFilterHTML = buildAZFilter(sets);

  const carouselHTML = topCards.map(c => {
    const aud = c.price_aud ? `AU$${parseFloat(c.price_aud).toFixed(0)}` : '';
    const ebayUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(c.name+' mtg')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
    return `<a href="/cards/mtg/${c.slug}" class="carousel-card">`
      + `<div class="carousel-img-wrap"><img src="${c.image_uri_small}" alt="${c.name.replace(/"/g,'')}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=card-placeholder>&#9876;</div>'"></div>`
      + `<div class="carousel-name">${c.name}</div>`
      + (c.rarity ? `<div class="carousel-rarity">${c.rarity}</div>` : '')
      + `<div class="carousel-price">${aud}</div>`
      + `<div class="carousel-buy-row"><a href="${ebayUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="carousel-buy-btn">Buy eBay &#8599;</a></div>`
      + `</a>`;
  }).join('');

  const setListHTML = sets.length ? sets.map(s => {
    const name = s.name || '';
    const ch = name.trim()[0] ? name.trim()[0].toUpperCase() : '';
    const letterKey = /[A-Z]/.test(ch) ? ch : '0-9';
    const year = s.released_at ? s.released_at.slice(0,4) : '';
    const count = s.card_count ? ` &middot; ${s.card_count} cards` : '';
    return `<a href="/cards/mtg/sets/${encodeURIComponent(s.slug||s.id)}" class="set-tile" data-name="${name.toLowerCase().replace(/"/g,'&quot;')}" data-letter="${letterKey}">`
      + `<span class="set-tile-name">${name}</span>`
      + `<span class="set-tile-meta">${year}${count}</span>`
      + `</a>`;
  }).join('') : '<div class="sync-msg">Sets loading. Check back after tonight's sync.</div>';

  return new Response(`<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>MTG Card Prices Australia | AUD Prices Updated Daily | C3</title>
  <meta name="description" content="Browse Magic: The Gathering card prices in AUD. ${sets.length}+ sets, live eBay AU buy links. Australia's MTG price guide updated daily.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/mtg">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <meta property="og:image" content="https://cardsoncardsoncards.com.au/c3-og-banner.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <style>
    :root{--bg:#0A0C14;--bg2:#111420;--bg3:#181d2e;--gold:#C9A84C;--accent:#C9A84C;--text:#e8eaf0;--text2:#9ba3c4;--border:#242840;--silver:#A0A8C0}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6;min-height:100vh;overflow-x:hidden}
    body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(ellipse 70% 40% at 50% 0%,rgba(201,168,76,.05),transparent 60%)}
    nav{background:rgba(10,12,20,.97);border-bottom:1px solid var(--border);padding:10px 0;position:sticky;top:0;z-index:100;backdrop-filter:blur(20px)}
    .nav-inner{max-width:1200px;margin:0 auto;padding:0 20px;display:flex;align-items:center;justify-content:space-between;gap:8px}
    .nav-logo{display:flex;align-items:center;gap:8px;text-decoration:none;flex-shrink:0}
    .nav-logo img{height:34px;width:34px;border-radius:6px;object-fit:cover}
    .nav-links{display:flex;gap:3px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
    .nav-links::-webkit-scrollbar{display:none}
    .nav-link{font-size:11px;padding:5px 9px;border-radius:6px;border:1px solid var(--border);color:var(--silver);text-decoration:none;font-weight:600;letter-spacing:.04em;text-transform:uppercase;transition:all .2s;white-space:nowrap}
    .nav-link:hover{color:var(--text);border-color:var(--silver);background:rgba(255,255,255,.04);text-decoration:none}
    .nav-link--vault{color:#C9A84C;border-color:rgba(201,168,76,.35)}.nav-link--vault:hover{background:rgba(201,168,76,.1);border-color:#C9A84C;color:#E8C86A}
    .nav-link--mtg{color:#C9A84C;border-color:rgba(201,168,76,.4);background:rgba(201,168,76,.08)}
    .nav-link--compare{color:#A78BFA;border-color:rgba(167,139,250,.35)}.nav-link--compare:hover{background:rgba(167,139,250,.1);border-color:#A78BFA}
    .nav-link--market{color:#4ADE80;border-color:rgba(74,222,128,.35)}.nav-link--market:hover{background:rgba(74,222,128,.1);border-color:#4ADE80}
    .nav-link--tools{color:#FB923C;border-color:rgba(251,146,60,.35)}.nav-link--tools:hover{background:rgba(251,146,60,.1);border-color:#FB923C}
    .nav-link--play{color:#F472B6;border-color:rgba(244,114,182,.35)}.nav-link--play:hover{background:rgba(244,114,182,.1);border-color:#F472B6}
    .nav-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.35)}.nav-link--blog:hover{background:rgba(126,203,161,.1);border-color:#7ECBA1}
    .nav-link--ebay{color:#60A5FA;border-color:rgba(96,165,250,.35);background:rgba(96,165,250,.05)}.nav-link--ebay:hover{background:rgba(96,165,250,.12);border-color:#60A5FA}
    .release-ticker{background:rgba(201,168,76,.06);border-bottom:1px solid rgba(201,168,76,.15);height:34px;display:flex;align-items:center;overflow:hidden;position:relative}
    .release-ticker::before,.release-ticker::after{content:'';position:absolute;top:0;bottom:0;width:50px;z-index:2;pointer-events:none}
    .release-ticker::before{left:0;background:linear-gradient(to right,var(--bg),transparent)}
    .release-ticker::after{right:0;background:linear-gradient(to left,var(--bg),transparent)}
    .ticker-label{font-size:9px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--accent);white-space:nowrap;padding:0 14px 0 18px;flex-shrink:0;z-index:3}
    .ticker-track{display:flex;gap:0;animation:tickerScroll 40s linear infinite}
    .ticker-track:hover{animation-play-state:paused}
    @keyframes tickerScroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
    .ticker-item{display:inline-flex;align-items:center;gap:8px;padding:0 24px;font-size:11.5px;color:var(--silver);white-space:nowrap}
    .ticker-badge{font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;background:rgba(201,168,76,.15);color:var(--accent);letter-spacing:.06em}
    .hero{padding:52px 24px 36px;text-align:center;position:relative;z-index:1}
    .hero-eyebrow{font-size:10px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--accent);margin-bottom:12px}
    h1{font-family:'Cinzel',serif;font-size:clamp(24px,5vw,50px);font-weight:900;color:var(--text);margin-bottom:12px;line-height:1.1}
    h1 span{color:var(--accent)}
    .hero-sub{font-size:14px;color:var(--text2);max-width:520px;margin:0 auto 28px}
    .stat-bar{display:flex;gap:0;justify-content:center;border:1px solid var(--border);border-radius:12px;overflow:hidden;max-width:540px;margin:0 auto 32px;background:var(--bg2)}
    .stat-item{flex:1;padding:14px 10px;text-align:center;border-right:1px solid var(--border)}.stat-item:last-child{border-right:none}
    .stat-num{font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:var(--accent)}
    .stat-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text2);margin-top:2px}
    .quick-links{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:28px;justify-content:center;padding:0 24px}
    .quick-link{display:inline-flex;align-items:center;gap:7px;padding:9px 18px;border-radius:10px;font-weight:700;font-size:12.5px;text-decoration:none;transition:all .2s;border:1px solid transparent}
    .quick-link:hover{opacity:.88;transform:translateY(-1px);text-decoration:none}
    .carousel-section{position:relative;z-index:1;margin-bottom:28px}
    .carousel-label{font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);margin-bottom:8px;padding:0 24px}
    .carousel-title{font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:var(--text);margin-bottom:16px;padding:0 24px}
    .carousel-track-wrap{overflow:hidden;position:relative}
    .carousel-track-wrap::before,.carousel-track-wrap::after{content:'';position:absolute;top:0;bottom:0;width:60px;z-index:2;pointer-events:none}
    .carousel-track-wrap::before{left:0;background:linear-gradient(to right,var(--bg),transparent)}
    .carousel-track-wrap::after{right:0;background:linear-gradient(to left,var(--bg),transparent)}
    .carousel-track{display:flex;gap:12px;padding:4px 24px 12px;animation:scrollLeft 40s linear infinite}
    .carousel-track:hover{animation-play-state:paused}
    @keyframes scrollLeft{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
    .carousel-card{flex-shrink:0;width:148px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center;text-decoration:none;transition:all .25s;display:block}
    .carousel-card:hover{border-color:var(--accent);transform:translateY(-4px);box-shadow:0 8px 20px rgba(201,168,76,.12);text-decoration:none}
    .carousel-img-wrap{width:100%;aspect-ratio:3/4;overflow:hidden;border-radius:6px;margin-bottom:8px;background:var(--bg3);display:flex;align-items:center;justify-content:center}
    .carousel-img-wrap img{width:100%;height:100%;object-fit:contain}
    .card-placeholder{font-size:28px}
    .carousel-name{font-size:11px;color:var(--text);font-weight:600;line-height:1.3;margin-bottom:3px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
    .carousel-rarity{font-size:10px;color:var(--text2);margin-bottom:3px}
    .carousel-price{font-size:12px;font-weight:700;color:var(--accent)}
    .carousel-buy-row{margin-top:6px}
    .carousel-buy-btn{font-size:10px;font-weight:700;color:var(--accent);text-decoration:none;text-transform:uppercase;letter-spacing:.05em}
    .sync-msg{font-size:13px;color:var(--text2);padding:24px;text-align:center}
    .wrap{max-width:1200px;margin:0 auto;padding:0 24px;position:relative;z-index:1}
    .section{padding:28px 0}
    .section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px}
    .section-title{font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:var(--text)}
    .az-filter{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:14px}
    .az-btn{background:var(--bg2);border:1px solid var(--border);border-radius:5px;padding:4px 9px;font-size:11px;font-weight:600;color:var(--text2);cursor:pointer;transition:all .15s;font-family:'DM Sans',sans-serif}
    .az-btn:hover,.az-btn--active{background:rgba(201,168,76,.1);border-color:rgba(201,168,76,.4);color:var(--accent)}
    .set-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
    .set-tile{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px 14px;text-decoration:none;display:flex;flex-direction:column;gap:4px;transition:all .2s}
    .set-tile:hover{border-color:rgba(201,168,76,.4);transform:translateY(-1px);text-decoration:none}
    .set-tile-name{font-size:13px;font-weight:600;color:var(--text);line-height:1.3}
    .set-tile-meta{font-size:11px;color:var(--text2)}
    .no-results{font-size:13px;color:var(--text2);padding:24px;text-align:center;grid-column:1/-1;display:none}
    .search-input{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px 14px;font-size:13px;color:var(--text);width:240px;outline:none;font-family:'DM Sans',sans-serif}
    .search-input::placeholder{color:var(--text2)}
    .search-input:focus{border-color:rgba(201,168,76,.4)}
    .cta-banner{background:linear-gradient(135deg,rgba(201,168,76,.06),rgba(201,168,76,.02));border:1px solid rgba(201,168,76,.2);border-radius:12px;padding:24px;margin-bottom:40px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px}
    .cta-banner-title{font-family:'Cinzel',serif;font-size:16px;font-weight:700;color:var(--text);margin-bottom:4px}
    .cta-banner-sub{font-size:13px;color:var(--text2)}
    .cta-banner-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 20px;border-radius:9px;background:rgba(201,168,76,.12);border:1px solid rgba(201,168,76,.3);color:var(--accent);font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap}
    .cta-banner-btn:hover{background:rgba(201,168,76,.2);text-decoration:none}
    footer{border-top:1px solid var(--border);padding:28px 24px;text-align:center;font-size:12px;color:var(--text2)}
    footer a{color:var(--text2);margin:0 8px;text-decoration:none}
    footer a:hover{color:var(--text)}
  </style>
</head>
<body>
<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo"><img src="/c3logo.png" alt="C3"></a>
    <div class="nav-links">
      <a href="/cards" class="nav-link nav-link--vault">Card Vault</a>
      <a href="/cards/mtg" class="nav-link nav-link--mtg">MTG</a>
      <a href="/compare" class="nav-link nav-link--compare">Compare</a>
      <a href="/market" class="nav-link nav-link--market">Market</a>
      <a href="/tools" class="nav-link nav-link--tools">Tools</a>
      <a href="/play" class="nav-link nav-link--play">Play</a>
      <a href="/blog" class="nav-link nav-link--blog">Blog</a>
      <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=MTGHub&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="nav-link nav-link--ebay">Shop eBay &#8599;</a>
    </div>
  </div>
</nav>
${tickerHTML}
<div class="hero">
  <div class="hero-eyebrow">Card Vault &middot; Magic: The Gathering</div>
  <h1>MTG Card Prices <span>in Australia</span></h1>
  <p class="hero-sub">Magic: The Gathering card prices in AUD. Browse every set with live eBay AU buy links. Updated daily.</p>
  <div class="stat-bar">
    <div class="stat-item"><div class="stat-num">${sets.length || '700'}+</div><div class="stat-label">Sets</div></div>
    <div class="stat-item"><div class="stat-num">96K+</div><div class="stat-label">Cards</div></div>
    <div class="stat-item"><div class="stat-num">AU$</div><div class="stat-label">Live Prices</div></div>
    <div class="stat-item"><div class="stat-num">Daily</div><div class="stat-label">Updates</div></div>
  </div>
</div>
<div class="quick-links">
  <a href="https://www.ebay.com.au/sch/i.html?_nkw=mtg+magic+the+gathering+cards&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="quick-link" style="background:linear-gradient(135deg,#7a621e,var(--accent));color:#000">&#128722; Shop MTG on eBay &#8599;</a>
  <a href="/cards/mtg/random-commander" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#129335; Random Commander</a>
  <a href="/ev-calculator.html" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128202; EV Calculator &#8594;</a>
  <a href="/compare" class="quick-link" style="background:rgba(201,168,76,.08);border-color:rgba(201,168,76,.3);color:var(--accent)">&#9878; Compare Cards &#8594;</a>
  <a href="/blog/best-mtg-booster-boxes-australia/" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128214; Best MTG Boxes &#8594;</a>
</div>
${topCards.length ? `<section class="carousel-section">
  <div class="carousel-label">Most Valuable</div>
  <div class="carousel-title">Top MTG Cards by Price (AUD)</div>
  <div class="carousel-track-wrap">
    <div class="carousel-track">${carouselHTML}${carouselHTML}</div>
  </div>
</section>` : ''}
<div class="wrap">
  <div class="section">
    <div class="section-header">
      <div class="section-title">${sets.length}+ MTG Sets</div>
      <input type="text" class="search-input" placeholder="Search sets..." oninput="filterSets(this.value)">
    </div>
    <div class="az-filter" id="az-filter">${azFilterHTML}</div>
    <div class="set-grid" id="set-grid">
      ${setListHTML}
      <div class="no-results" id="no-results">No sets match your search.</div>
    </div>
  </div>
  <div class="cta-banner">
    <div>
      <div class="cta-banner-title">Compare Any Two MTG Cards</div>
      <div class="cta-banner-sub">Buy signals, 14-day price trends, Card Kingdom buylist prices and AUD pricing.</div>
    </div>
    <a href="/compare" class="cta-banner-btn">Open Card Compare &rarr;</a>
  </div>
</div>
<footer>
  <a href="/">Home</a>
  <a href="/cards" style="color:#C9A84C">Card Vault</a>
  <a href="/cards/mtg" style="color:#C9A84C">MTG</a>
  <a href="/cards/pokemon">Pokemon</a>
  <a href="/cards/lorcana">Lorcana</a>
  <a href="/cards/yugioh">Yu-Gi-Oh</a>
  <a href="/compare">Compare</a>
  <a href="/market">Market</a>
  <a href="/blog">Blog</a>
  <p style="margin-top:10px;font-size:11px;opacity:.4">&copy; 2026 Cards on Cards on Cards &middot; cardsoncardsoncards.com.au &middot; Affiliate links may earn a commission at no extra cost to you.</p>
</footer>
<script>
let activeAZ = 'All';
function filterAZ(letter, btn) {
  activeAZ = letter;
  document.querySelectorAll('.az-btn').forEach(b => b.classList.remove('az-btn--active'));
  if (btn) btn.classList.add('az-btn--active');
  applyFilters();
}
function filterSets(q) { applyFilters(q); }
function applyFilters(q) {
  const search = (q !== undefined ? q : (document.querySelector('.search-input')||{}).value||'').toLowerCase().trim();
  const tiles = document.querySelectorAll('.set-tile');
  let visible = 0;
  tiles.forEach(function(t) {
    const matchLetter = activeAZ === 'All' || t.dataset.letter === activeAZ;
    const matchSearch = !search || t.dataset.name.includes(search);
    const show = matchLetter && matchSearch;
    t.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  var nr = document.getElementById('no-results');
  if (nr) nr.style.display = visible === 0 ? 'block' : 'none';
}
</script>
</body>
</html>`, { status: 200, headers });
};

export const config = { path: '/cards/mtg' };
