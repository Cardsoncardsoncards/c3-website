// netlify/functions/starwars-hub.mjs
const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID        = '5339146789';

const CALENDAR_EVENTS = []; // No confirmed AU Star Wars events in current data

async function supabaseGet(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      signal: controller.signal,
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) { clearTimeout(timer); return []; }
}

function buildAZFilter(sets) {
  const letters = new Set();
  sets.forEach(s => {
    const ch = (s.name||'').trim()[0];
    if (ch) letters.add(/[A-Z]/.test(ch.toUpperCase()) ? ch.toUpperCase() : '0-9');
  });
  const sorted = ['All', '0-9', ...[...letters].filter(l => l !== '0-9').sort()];
  return sorted.map(l => `<button class="az-btn${l==='All'?' az-btn--active':''}" onclick="filterAZ('${l}',this)">${l}</button>`).join('');
}


function esc(str) {
  return (str == null ? '' : String(str))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export default async (req) => {
  // Hub carousel: singles filtered by price thresholds. Sealed products excluded by market_price range.
  const SEALED_KEYS = ['booster box','booster pack',' case','bundle','display','starter deck','sealed'];

  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=1800, s-maxage=3600' };

  const [_psr0, _psr1] = await Promise.allSettled([
    supabaseGet('starwars_sets?order=release_date.desc&limit=300&select=id,name,slug,abbreviation,card_count,release_date'),
    supabaseGet('starwars_cards?order=market_price.desc&market_price=gt.0&image_url=not.is.null&rarity=neq.None&limit=24&select=slug,name,number,image_url,market_price,price_aud,rarity,set_name')
  ]);
  const sets = _psr0.status === 'fulfilled' ? _psr0.value : [];
  const topCards = _psr1.status === 'fulfilled' ? _psr1.value : [];

  const azFilterHTML = buildAZFilter(sets);

  const carouselHTML = topCards.length ? topCards.map(c => `
    <a href="/cards/starwars/${c.slug}" class="carousel-card">
      <div class="carousel-img-wrap">
        <img src="${c.image_url}" alt="${c.name}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=card-placeholder>&#128640;</div>'">
      </div>
      <div class="carousel-name">${c.name}</div>
      ${c.rarity ? `<div class="carousel-rarity">${c.rarity}</div>` : ''}
      <div class="carousel-price">${c.price_aud ? `AU$${parseFloat(c.price_aud).toFixed(0)}` : c.market_price ? `~AU$${(c.market_price*1.58).toFixed(0)}` : ''}</div>
      <div class="carousel-buy-row"><span class="carousel-buy-btn">Buy eBay &#8599;</span></div>
    </a>`).join('') : '<div class="sync-msg">Cards sync daily after 10am AEST.</div>';

  const setListHTML = sets.length ? sets.map(s => {
    const name = s.name || '';
    const ch = name.trim()[0] ? name.trim()[0].toUpperCase() : '';
    const letterKey = /[A-Z]/.test(ch) ? ch : '0-9';
    return `<a href="/cards/starwars/sets/${encodeURIComponent(s.abbreviation||s.slug||s.id)}" class="set-tile" data-name="${name.toLowerCase().replace(/"/g,'&quot;')}" data-letter="${letterKey}">
      <span class="set-tile-name">${name}</span>
      <span class="set-tile-meta">${s.release_date ? s.release_date.slice(0,4) : ''}${s.card_count ? ' &middot; '+s.card_count : ''}</span>
    </a>`;
  }).join('') : '<div class="sync-msg">Sets sync daily after 10am AEST.</div>';

  return new Response(`<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Star Wars Unlimited Card Prices Australia | C3</title>
  <meta name="description" content="Browse ${sets.length}+ Star Wars Unlimited sets. Live AUD card prices, eBay AU buy links. Australia's Star Wars Unlimited price guide updated daily.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/starwars">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <meta property="og:image" content="https://cardsoncardsoncards.com.au/c3-og-banner.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <style>
    :root{--bg:#0A0C14;--bg2:#111420;--bg3:#181d2e;--gold:#C9A84C;--accent:#FFE81F;--text:#e8eaf0;--text2:#9ba3c4;--border:#242840;--radius:12px;--silver:#A0A8C0}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6;min-height:100vh;overflow-x:hidden}
    body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(ellipse 70% 40% at 50% 0%,rgba(255,232,31,.04),transparent 60%)}
    nav{background:rgba(10,12,20,.97);border-bottom:1px solid var(--border);padding:10px 0;position:sticky;top:0;z-index:100;backdrop-filter:blur(20px)}
    .nav-inner{max-width:1200px;margin:0 auto;padding:0 20px;display:flex;align-items:center;justify-content:space-between;gap:8px}
    .nav-logo{display:flex;align-items:center;gap:8px;text-decoration:none;flex-shrink:0}
    .nav-logo img{height:34px;width:34px;border-radius:6px;object-fit:cover}
    .nav-links{display:flex;gap:3px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
    .nav-links::-webkit-scrollbar{display:none}
    .nav-link{font-size:11px;padding:5px 9px;border-radius:6px;border:1px solid var(--border);color:var(--silver);text-decoration:none;font-weight:600;letter-spacing:.04em;text-transform:uppercase;transition:all .2s;white-space:nowrap}
    .nav-link:hover{color:var(--text);border-color:var(--silver);background:rgba(255,255,255,.04);text-decoration:none}
    /* === C3 NAV COLOURS === */
    .nav-link--vault{color:#C9A84C;border-color:rgba(201,168,76,.35)}.nav-link--vault:hover,.nav-link--vault.active{background:rgba(201,168,76,.1);border-color:#C9A84C;color:#E8C86A}
    .nav-link--compare{color:#A78BFA;border-color:rgba(167,139,250,.35)}.nav-link--compare:hover,.nav-link--compare.active{background:rgba(167,139,250,.1);border-color:#A78BFA;color:#C4B5FD}
    .nav-link--market{color:#4ADE80;border-color:rgba(74,222,128,.35)}.nav-link--market:hover,.nav-link--market.active{background:rgba(74,222,128,.1);border-color:#4ADE80;color:#86EFAC}
    .nav-link--tools{color:#FB923C;border-color:rgba(251,146,60,.35)}.nav-link--tools:hover,.nav-link--tools.active{background:rgba(251,146,60,.1);border-color:#FB923C;color:#FDBA74}
    .nav-link--play{color:#F472B6;border-color:rgba(244,114,182,.35)}.nav-link--play:hover,.nav-link--play.active{background:rgba(244,114,182,.1);border-color:#F472B6;color:#F9A8D4}
    .nav-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.35)}.nav-link--blog:hover,.nav-link--blog.active{background:rgba(126,203,161,.1);border-color:#7ECBA1;color:#A5DFC0}
    .nav-link--ebay{color:#60A5FA;border-color:rgba(96,165,250,.35);background:rgba(96,165,250,.05)}.nav-link--ebay:hover{background:rgba(96,165,250,.12);border-color:#60A5FA;color:#93C5FD}
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
    .carousel-card{flex-shrink:0;width:155px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center;text-decoration:none;transition:all .25s;display:block}
    .carousel-card:hover{border-color:var(--accent);transform:translateY(-4px);box-shadow:0 8px 20px rgba(255,232,31,.10);text-decoration:none}
    .carousel-img-wrap{height:130px;display:flex;align-items:center;justify-content:center;margin-bottom:7px;overflow:hidden}
    .carousel-img-wrap img{max-height:130px;max-width:100%;object-fit:contain;border-radius:4px;transition:transform .3s}
    .carousel-card:hover .carousel-img-wrap img{transform:scale(1.05)}
    .card-placeholder{width:80px;height:110px;background:var(--bg3);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--text2)}
    .carousel-name{font-size:11px;color:var(--text);font-weight:600;line-height:1.3;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .carousel-rarity{font-size:10px;color:var(--text2)}
    .carousel-price{font-size:13px;color:var(--accent);font-weight:700;margin-top:3px}
    .carousel-buy-row{margin-top:6px}
    .carousel-buy-btn{font-size:10px;font-weight:700;color:#000;background:var(--accent);padding:3px 8px;border-radius:4px;letter-spacing:.04em}
    .wrap{max-width:1200px;margin:0 auto;padding:0 24px;position:relative;z-index:1}
    .section{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:22px;margin-bottom:20px}
    .section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px}
    .section-title{font-size:17px;font-weight:700;color:var(--text)}
    .section-hint{font-size:12px;color:var(--text2)}
    input[type=text]{background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:9px 14px;border-radius:8px;font-size:14px;font-family:'DM Sans',sans-serif;width:100%;max-width:440px;transition:border-color .2s}
    input[type=text]::placeholder{color:var(--text2)}
    input[type=text]:focus{outline:none;border-color:var(--accent)}
    .btn{display:inline-flex;align-items:center;gap:7px;padding:9px 20px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;border:none;font-family:'DM Sans',sans-serif;transition:all .2s;text-decoration:none}
    .btn:hover{opacity:.85;text-decoration:none}
    .btn-primary{background:var(--accent);color:#000}
    #search-results{margin-top:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(135px,1fr));gap:8px}
    .az-row{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:14px}
    .az-btn{padding:5px 9px;border-radius:6px;font-size:11.5px;font-weight:700;cursor:pointer;border:1px solid var(--border);background:var(--bg3);color:var(--text2);font-family:'DM Sans',sans-serif;transition:all .2s;letter-spacing:.04em}
    .az-btn:hover{border-color:var(--accent);color:var(--accent)}
    .az-btn--active{background:var(--accent);color:#000;border-color:var(--accent)}
    .set-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:5px;margin-top:8px}
    .set-tile{display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--bg3);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:8px;padding:8px 12px;text-decoration:none;transition:all .2s;min-width:0}
    .set-tile:hover{border-color:var(--accent);background:rgba(255,232,31,.04);text-decoration:none;transform:translateX(2px)}
    .set-tile-name{flex:1;font-size:12.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}
    .set-tile-meta{font-size:10px;color:var(--text2);flex-shrink:0;white-space:nowrap}
    .sync-msg{color:var(--text2);font-size:14px;padding:20px}
    @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    .fade-up{animation:fadeUp .5s ease both}.fade-up-1{animation-delay:.08s}.fade-up-2{animation-delay:.16s}.fade-up-3{animation-delay:.24s}
    footer{border-top:1px solid var(--border);padding:28px 24px;text-align:center;font-size:12px;color:var(--text2);margin-top:40px;position:relative;z-index:1}
    footer a{color:var(--text2);margin:0 7px;text-decoration:none}footer a:hover{color:var(--text)}
  </style>
</head>
<body>
<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo"><img src="/c3logo.png" alt="C3"></a>
    <div style="flex:1;min-width:0;max-width:400px;display:flex"><input type="text" id="nav-q" placeholder="Search cards..." autocomplete="off" onkeydown="if(event.key==='Enter'){var v=this.value.trim();if(v)window.location='/search?q='+encodeURIComponent(v);}" style="flex:1;max-width:300px;background:rgba(255,255,255,.06);border:1px solid #1e2235;border-radius:7px 0 0 7px;padding:6px 12px;font-size:12px;color:#e8eaf0;font-family:sans-serif;outline:none"><button onclick="var v=document.getElementById('nav-q').value.trim();if(v)window.location='/search?q='+encodeURIComponent(v);" style="background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.35);border-left:none;border-radius:0 7px 7px 0;padding:6px 10px;color:#C9A84C;cursor:pointer;font-size:13px;flex-shrink:0">&#128269;</button></div>
    <div class="nav-links">
      <a href="/cards" class="nav-link nav-link--vault active">Card Vault</a>
      <a href="/compare" class="nav-link nav-link--compare">Compare</a>
      <a href="/market" class="nav-link nav-link--market">Market</a>
      <a href="/tools" class="nav-link nav-link--tools">Tools</a>
      <a href="/play" class="nav-link nav-link--play">Play</a>
      <a href="/blog" class="nav-link nav-link--blog">Blog</a>
      <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=C3Nav&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="nav-link nav-link--ebay">Shop eBay &#8599;</a>
    </div>
  </div>
</nav>
<div class="release-ticker" style="background:rgba(255,232,31,.06);border-bottom:1px solid rgba(255,232,31,.15);height:36px;display:flex;align-items:center;overflow:hidden;position:relative">
  <div style="position:absolute;top:0;bottom:0;left:0;width:60px;z-index:2;background:linear-gradient(to right,#0A0C14,transparent);pointer-events:none"></div>
  <div style="position:absolute;top:0;bottom:0;right:0;width:60px;z-index:2;background:linear-gradient(to left,#0A0C14,transparent);pointer-events:none"></div>
  <span style="font-size:9px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#FFE81F;white-space:nowrap;padding:0 16px 0 20px;flex-shrink:0;z-index:3">&#128640; Star Wars</span>
  <div style="display:flex;animation:swTicker 38s linear infinite;flex-shrink:0" onmouseenter="this.style.animationPlayState='paused'" onmouseleave="this.style.animationPlayState='running'">
    <span style="display:inline-flex;align-items:center;gap:8px;padding:0 24px;font-size:12px;color:#9ba3c4;white-space:nowrap"><strong>Twilight of the Republic</strong> &middot; Jun 2026</span>
    <span style="display:inline-flex;align-items:center;gap:8px;padding:0 24px;font-size:12px;color:#9ba3c4;white-space:nowrap"><strong>Shadows of the Galaxy II</strong> &middot; Aug 2026</span>
    <span style="display:inline-flex;align-items:center;gap:8px;padding:0 24px;font-size:12px;color:#9ba3c4;white-space:nowrap"><a href="/calendar" style="color:#FFE81F;text-decoration:none;font-weight:600">View full release calendar &rarr;</a></span>
    <span style="display:inline-flex;align-items:center;gap:8px;padding:0 24px;font-size:12px;color:#9ba3c4;white-space:nowrap"><strong>Twilight of the Republic</strong> &middot; Jun 2026</span>
    <span style="display:inline-flex;align-items:center;gap:8px;padding:0 24px;font-size:12px;color:#9ba3c4;white-space:nowrap"><strong>Shadows of the Galaxy II</strong> &middot; Aug 2026</span>
    <span style="display:inline-flex;align-items:center;gap:8px;padding:0 24px;font-size:12px;color:#9ba3c4;white-space:nowrap"><a href="/calendar" style="color:#FFE81F;text-decoration:none;font-weight:600">View full release calendar &rarr;</a></span>
  </div>
</div>
<style>@keyframes swTicker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}</style>
<div class="hero fade-up">
  <div class="hero-eyebrow">Card Vault &#8212; Star Wars Unlimited</div>
  <h1>Star Wars Unlimited <span>Card Prices AU</span></h1>
  <p class="hero-sub">Star Wars Unlimited card prices in AUD. Browse every set from Spark of Rebellion to the latest release. eBay AU buy links updated daily.</p>
  <div class="stat-bar">
    <div class="stat-item"><div class="stat-num">${sets.length || '26'}</div><div class="stat-label">Sets</div></div>
    <div class="stat-item"><div class="stat-num">6K+</div><div class="stat-label">Cards</div></div>
    <div class="stat-item"><div class="stat-num">AU$</div><div class="stat-label">Live Prices</div></div>
    <div class="stat-item"><div class="stat-num">Daily</div><div class="stat-label">Updates</div></div>
  </div>
</div>
<div class="quick-links fade-up fade-up-1">
  <a href="https://www.ebay.com.au/sch/i.html?_nkw=star+wars+unlimited+tcg&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="quick-link" style="background:linear-gradient(135deg,#1d4ed8,var(--accent));color:#000">&#128722; Shop Star Wars on eBay &#8599;</a>
  <a href="/tracker.html" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128203; Free Tracker</a>
  <a href="/quizzes/starwars-affiliation" class="quick-link" style="background:rgba(255,232,31,.08);border-color:rgba(255,232,31,.3);color:var(--accent)">&#9889; Light Side or Dark Side? &#8594;</a>
  <a href="/blog/star-wars-unlimited-beginners-guide-australia/" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128214; Beginners Guide &#8594;</a>
</div>
${topCards.length ? `
<section class="carousel-section fade-up fade-up-2">
  <div class="carousel-label">Most Valuable</div>
  <div class="carousel-title">Top Star Wars Unlimited Cards by Price (AUD)</div>
  <div class="carousel-track-wrap">
    <div class="carousel-track">${carouselHTML}${carouselHTML}</div>
  </div>
</section>` : ''}
<div class="wrap">
  <div class="section fade-up fade-up-2">
    <div class="section-header"><div class="section-title">Search Star Wars Cards</div></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <input type="text" id="card-search" placeholder="Card name e.g. Luke Skywalker, Darth Vader..." onkeyup="if(event.key==='Enter')searchCard()">
      <button class="btn btn-primary" onclick="searchCard()">Search</button>
    </div>
    <div id="search-results"></div>
  </div>
  <div class="section fade-up fade-up-3">
    <div class="section-header">
      <div class="section-title">Browse by Set</div>
      <div class="section-hint">Click any set to view cards and prices</div>
    </div>
    <div class="az-row">${azFilterHTML}</div>
    <input type="text" id="set-search" placeholder="Search sets e.g. Spark of Rebellion, Shadows of the Galaxy..." oninput="filterSets(this.value)" style="margin-bottom:12px">
    <div id="set-list" class="set-grid">${setListHTML}</div>
  </div>
  <div style="background:rgba(255,232,31,.04);border:1px solid rgba(255,232,31,.15);border-radius:var(--radius);padding:22px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px">
    <div>
      <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:5px">Track Your Star Wars Collection</div>
      <p style="font-size:13px;color:var(--text2)">Free Google Sheets tracker. Know what you own and what it is worth.</p>
    </div>
    <a href="/tracker.html" class="btn btn-primary">Get Free Tracker &#8594;</a>
  </div>
</div>
<footer>
  <div style="margin-bottom:10px">
    <a href="/">Home</a><a href="/cards">Card Vault</a><a href="/cards/starwars">Star Wars</a>
    <a href="/cards/pokemon">Pokemon</a><a href="/cards/mtg">MTG</a><a href="/blog">Blog</a>
    <a href="/tracker.html">Tracker</a><a href="/calendar">Calendar</a>
  </div>
  <p>&#169; 2026 Cards on Cards on Cards &middot; cardsoncardsoncards.com.au</p>
  <p style="margin-top:6px;font-size:11px;opacity:.5">Not affiliated with Lucasfilm or Fantasy Flight Games. Prices converted to AUD at approximately 1.58.</p>
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
  const search = q !== undefined ? q : (document.getElementById('set-search') ? document.getElementById('set-search').value : '');
  const lower = search.toLowerCase();
  document.querySelectorAll('#set-list .set-tile').forEach(el => {
    const nameMatch = !lower || el.dataset.name.includes(lower);
    const letterMatch = activeAZ === 'All' || el.dataset.letter === activeAZ;
    el.style.display = (nameMatch && letterMatch) ? '' : 'none';
  });
}
async function searchCard() {
  const q = document.getElementById('card-search').value.trim();
  if (!q) return;
  const results = document.getElementById('search-results');
  results.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:12px 0">Searching...</div>';
  try {
    const res = await fetch('/api/compare-search?q=' + encodeURIComponent(q) + '&game=starwars&limit=24');
    const data = await res.json();
    const cards = data.results || data.cards || data || [];
    if (!cards.length) { results.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:12px 0">No cards found.</div>'; return; }
    results.innerHTML = cards.map(c => {
      const img = c.image_url || '';
      const price = c.price_aud ? 'AU$'+parseFloat(c.price_aud).toFixed(0) : c.market_price ? '~AU$'+(c.market_price*1.58).toFixed(0) : '';
      return '<a href="/cards/starwars/'+c.slug+'" style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center;display:block;text-decoration:none;transition:border-color .2s" onmouseover="this.style.borderColor=\\'var(--accent)\\'" onmouseout="this.style.borderColor=\\'var(--border)\\'">'
        + (img ? '<img src="'+img+'" alt="'+c.name.replace(/"/g,'')+'" style="width:100%;border-radius:6px;max-height:130px;object-fit:contain">' : '')
        + '<div style="font-size:11px;color:var(--text);margin-top:4px;line-height:1.3">'+c.name+'</div>'
        + '<div style="font-size:12px;color:var(--accent);font-weight:700">'+price+'</div>'
        + '</a>';
    }).join('');
  } catch(e) { results.innerHTML = '<div style="color:#f88;font-size:13px">Search error. Try again.</div>'; }
}
</script>
<!-- REPORT BUG WIDGET -->
<style>.bug-float{position:fixed;bottom:20px;right:20px;z-index:9999}.bug-btn{display:flex;align-items:center;gap:6px;background:rgba(15,17,25,.95);border:1px solid rgba(201,168,76,.3);color:#C9A84C;padding:8px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;font-family:sans-serif;backdrop-filter:blur(12px);transition:all .2s;text-decoration:none;letter-spacing:.03em}.bug-btn:hover{border-color:#C9A84C;background:rgba(201,168,76,.12);color:#E8C86A;text-decoration:none}.bug-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10000;align-items:center;justify-content:center;backdrop-filter:blur(4px)}.bug-modal.open{display:flex}.bug-box{background:#111420;border:1px solid #252840;border-radius:14px;padding:28px;width:100%;max-width:420px;margin:0 16px;position:relative}.bug-close{position:absolute;top:12px;right:14px;background:none;border:none;color:#9ba3c4;font-size:18px;cursor:pointer}.bug-form select,.bug-form textarea{width:100%;background:rgba(255,255,255,.05);border:1px solid #252840;border-radius:8px;color:#F0F2FF;font-family:sans-serif;font-size:13px;padding:9px 12px;margin-bottom:12px;outline:none}.bug-hidden{display:none}.bug-submit{width:100%;padding:10px;background:#C9A84C;color:#0A0C14;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer}.bug-thanks{display:none;text-align:center;padding:12px 0}.bug-thanks p{color:#4ADE80;font-size:14px}</style>
<div class="bug-float"><a class="bug-btn" onclick="document.getElementById('bugModal').classList.add('open');return false" href="#">&#x1F41B; Report a Bug</a></div>
<div class="bug-modal" id="bugModal" onclick="if(event.target===this)this.classList.remove('open')">
  <div class="bug-box">
    <button class="bug-close" onclick="document.getElementById('bugModal').classList.remove('open')">&#x2715;</button>
    <h3 style="font-family:'Cinzel',serif;font-size:17px;font-weight:700;color:#F0F2FF;margin-bottom:4px">&#x1F41B; Report a Bug</h3>
    <p style="font-size:12px;color:#9ba3c4;margin-bottom:18px">Spotted something wrong? Takes 20 seconds.</p>
    <form class="bug-form" id="bugReportForm" name="bug-report" method="POST" data-netlify="true" netlify-honeypot="bot-field">
      <input type="hidden" name="form-name" value="bug-report"><input class="bug-hidden" name="bot-field">
      <input type="hidden" name="page_url" id="bugPageUrl">
      <select name="issue_type" required><option value="" disabled selected>What type of issue?</option><option value="wrong_price">Wrong price</option><option value="missing_card">Missing card or set</option><option value="broken_link">Broken link</option><option value="other">Other</option></select>
      <textarea name="description" placeholder="Describe the issue briefly" maxlength="200" required></textarea>
      <div class="bug-thanks" id="bugThanks"><p>&#x2713; Thanks, we will look into it.</p></div>
      <button type="submit" class="bug-submit" id="bugSubmit">Submit Report</button>
    </form>
  </div>
</div>
<script>(function(){var u=document.getElementById('bugPageUrl');if(u)u.value=window.location.href;var f=document.getElementById('bugReportForm');if(!f)return;f.addEventListener('submit',function(e){e.preventDefault();var b=document.getElementById('bugSubmit');b.disabled=true;b.textContent='Sending...';var d=new FormData(f);fetch('/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(d).toString()}).then(function(){document.getElementById('bugThanks').style.display='block';f.querySelector('select').style.display='none';f.querySelector('textarea').style.display='none';b.style.display='none';setTimeout(function(){document.getElementById('bugModal').classList.remove('open');},2000);}).catch(function(){b.disabled=false;b.textContent='Submit Report';});});})();</script>
</body>
</html>`, { status: 200, headers });
};

export const config = { path: '/cards/starwars' };
