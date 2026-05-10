// netlify/functions/pokemon-hub.mjs
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

export default async (req) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=1800, s-maxage=3600' };

  const [sets, topCards] = await Promise.all([
    supabaseGet('pokemon_sets?order=release_date.desc&limit=200&select=id,name,series,release_date,logo_uri,card_count'),
    supabaseGet('pokemon_cards?order=market_price.desc&market_price=gt.0&image_url=not.is.null&rarity=not.is.null&rarity=neq.None&limit=24&select=slug,name,image_url,market_price,price_aud,set_name,rarity')
  ]);

  const cardCount = sets.reduce((a, s) => a + (s.card_count || 0), 0);
  const displayCount = cardCount > 1000 ? Math.round(cardCount/1000)*1000 : cardCount;

  const carouselHTML = topCards.map(c => `
    <a href="/cards/pokemon/${c.slug}" class="carousel-card">
      <div class="carousel-img-wrap">
        <img src="${c.image_url}" alt="${c.name}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=card-placeholder>${c.name[0]}</div>'">
      </div>
      <div class="carousel-name">${c.name}</div>
      ${c.rarity ? `<div class="carousel-rarity">${c.rarity}</div>` : ''}
      <div class="carousel-price">${c.price_aud ? `AU$${parseFloat(c.price_aud).toFixed(0)}` : c.market_price ? `~AU$${(c.market_price*1.58).toFixed(0)}` : ''}</div>
    </a>`).join('');

  const setListHTML = sets.length ? sets.map(s => `
    <a href="/cards/pokemon/sets/${encodeURIComponent(s.abbreviation||s.slug||s.id)}" class="set-tile" data-name="${s.name.toLowerCase().replace(/"/g,'&quot;')}">
      ${s.logo_uri ? `<img src="${s.logo_uri}" alt="${s.name}" class="set-logo" onerror="this.style.display='none'">` : ''}
      <span class="set-tile-name">${s.name}</span>
      ${s.release_date ? `<span class="set-tile-year">${s.release_date.slice(0,4)}</span>` : ''}
    </a>`).join('') : '<div class="sync-msg">Sets loading — check back after tonight\'s sync.</div>';

  return new Response(`<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Pokemon Card Prices Australia | Cards on Cards on Cards</title>
  <meta name="description" content="Browse ${sets.length}+ Pokemon TCG sets. Live AUD pricing, eBay AU buy links. Australia's Pokemon price guide updated daily.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/pokemon">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <style>
    :root{
      --bg:#0A0C14;--bg2:#111420;--bg3:#181d2e;--bg4:#1e2338;
      --gold:#C9A84C;--gold-dim:rgba(201,168,76,.3);
      --poke-yellow:#FFCC00;--poke-blue:#0075BE;--poke-red:#CC0000;
      --text:#e8eaf0;--text2:#9ba3c4;--border:#242840;--radius:12px;
      --silver:#A0A8C0;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6;min-height:100vh}
    body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;
      background:radial-gradient(ellipse 70% 40% at 50% 0%,rgba(255,204,0,.05),transparent 60%),
                 radial-gradient(ellipse 40% 30% at 10% 60%,rgba(0,117,190,.04),transparent 50%)}

    /* NAV */
    nav{background:rgba(10,12,20,.95);border-bottom:1px solid var(--border);padding:10px 0;position:sticky;top:0;z-index:100;backdrop-filter:blur(20px)}
    .nav-inner{max-width:1200px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .nav-logo{font-family:'Cinzel',serif;font-size:13px;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:.12em;text-decoration:none}
    .nav-links{display:flex;gap:5px;flex-wrap:wrap}
    .nav-link{font-size:11.5px;padding:5px 10px;border-radius:6px;border:1px solid var(--border);color:var(--silver);text-decoration:none;font-weight:600;letter-spacing:.04em;text-transform:uppercase;transition:all .2s}
    .nav-link:hover{color:var(--text);border-color:var(--silver);text-decoration:none}
    .nav-link--home{color:var(--silver)}
    .nav-link--mtg{color:#A78BFA;border-color:rgba(167,139,250,.3)}
    .nav-link--mtg:hover{background:rgba(167,139,250,.06);border-color:#A78BFA}
    .nav-link--pokemon{color:var(--poke-yellow);border-color:rgba(255,204,0,.4);background:rgba(255,204,0,.07)}
    .nav-link--lorcana{color:#38BDF8;border-color:rgba(56,189,248,.3)}
    .nav-link--lorcana:hover{background:rgba(56,189,248,.06);border-color:#38BDF8}
    .nav-link--yugioh{color:#C084FC;border-color:rgba(192,132,252,.3)}
    .nav-link--yugioh:hover{background:rgba(192,132,252,.06);border-color:#C084FC}
    .nav-link--calendar{color:#F87171;border-color:rgba(248,113,113,.3)}
    .nav-link--calendar:hover{background:rgba(248,113,113,.06);border-color:#F87171}
    .nav-link--generators{color:#22D3EE;border-color:rgba(34,211,238,.3)}
    .nav-link--generators:hover{background:rgba(34,211,238,.06);border-color:#22D3EE}
    .nav-link--shop{color:#4ADE80;border-color:rgba(74,222,128,.3)}
    .nav-link--shop:hover{background:rgba(74,222,128,.06);border-color:#4ADE80}
    .nav-link--tracker{color:#FB923C;border-color:rgba(251,146,60,.3)}
    .nav-link--tracker:hover{background:rgba(251,146,60,.06);border-color:#FB923C}

    /* HERO */
    .hero{padding:56px 24px 40px;text-align:center;position:relative;z-index:1}
    .hero-eyebrow{font-size:10px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--poke-yellow);margin-bottom:14px}
    h1{font-family:'Cinzel',serif;font-size:clamp(26px,5vw,52px);font-weight:900;color:var(--text);margin-bottom:14px;line-height:1.1}
    h1 span{color:var(--poke-yellow)}
    .hero-sub{font-size:15px;color:var(--text2);max-width:560px;margin:0 auto 32px}
    .stat-bar{display:flex;gap:0;justify-content:center;border:1px solid var(--border);border-radius:12px;overflow:hidden;max-width:560px;margin:0 auto 36px;background:var(--bg2)}
    .stat-item{flex:1;padding:16px 12px;text-align:center;border-right:1px solid var(--border);position:relative}
    .stat-item:last-child{border-right:none}
    .stat-num{font-family:'Cinzel',serif;font-size:20px;font-weight:700;color:var(--poke-yellow)}
    .stat-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text2);margin-top:2px}

    /* QUICK LINKS */
    .quick-links{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:32px;justify-content:center}
    .quick-link{display:inline-flex;align-items:center;gap:8px;padding:10px 20px;border-radius:10px;font-weight:700;font-size:13px;text-decoration:none;transition:all .2s;border:1px solid transparent}
    .quick-link:hover{opacity:.88;transform:translateY(-1px);text-decoration:none}

    /* CAROUSEL */
    .carousel-section{position:relative;z-index:1;margin-bottom:32px}
    .carousel-label{font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--poke-yellow);margin-bottom:10px;padding:0 24px}
    .carousel-title{font-family:'Cinzel',serif;font-size:20px;font-weight:700;color:var(--text);margin-bottom:20px;padding:0 24px}
    .carousel-track-wrap{overflow:hidden;position:relative}
    .carousel-track-wrap::before,.carousel-track-wrap::after{content:'';position:absolute;top:0;bottom:0;width:60px;z-index:2;pointer-events:none}
    .carousel-track-wrap::before{left:0;background:linear-gradient(to right,var(--bg),transparent)}
    .carousel-track-wrap::after{right:0;background:linear-gradient(to left,var(--bg),transparent)}
    .carousel-track{display:flex;gap:14px;padding:4px 24px 12px;animation:scrollLeft 40s linear infinite}
    .carousel-track:hover{animation-play-state:paused}
    @keyframes scrollLeft{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
    .carousel-card{flex-shrink:0;width:160px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center;text-decoration:none;transition:all .25s;display:block}
    .carousel-card:hover{border-color:var(--poke-yellow);transform:translateY(-4px);box-shadow:0 8px 24px rgba(255,204,0,.15);text-decoration:none}
    .carousel-img-wrap{height:140px;display:flex;align-items:center;justify-content:center;margin-bottom:8px;overflow:hidden}
    .carousel-img-wrap img{max-height:140px;max-width:100%;object-fit:contain;border-radius:4px;transition:transform .3s}
    .carousel-card:hover .carousel-img-wrap img{transform:scale(1.05)}
    .card-placeholder{width:80px;height:110px;background:var(--bg3);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:24px;color:var(--text2)}
    .carousel-name{font-size:11px;color:var(--text);font-weight:600;line-height:1.3;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .carousel-rarity{font-size:10px;color:var(--text2)}
    .carousel-price{font-size:13px;color:var(--poke-yellow);font-weight:700;margin-top:3px}

    /* SECTION */
    .wrap{max-width:1200px;margin:0 auto;padding:0 24px;position:relative;z-index:1}
    .section{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:24px}
    .section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px}
    .section-title{font-size:18px;font-weight:700;color:var(--text)}
    .section-hint{font-size:12px;color:var(--text2);font-style:italic}
    input{background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:9px 14px;border-radius:8px;font-size:14px;font-family:'DM Sans',sans-serif;width:100%;max-width:480px;transition:border-color .2s}
    input::placeholder{color:var(--text2)}
    input:focus{outline:none;border-color:var(--poke-yellow)}
    .btn{display:inline-flex;align-items:center;gap:7px;padding:9px 20px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;border:none;font-family:'DM Sans',sans-serif;transition:all .2s;text-decoration:none}
    .btn:hover{opacity:.85;text-decoration:none}
    .btn-primary{background:var(--poke-yellow);color:#000}
    #search-results{margin-top:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}

    /* SET GRID */
    .set-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;margin-top:12px}
    .set-tile{display:flex;align-items:center;gap:10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 12px;text-decoration:none;transition:all .2s;min-width:0}
    .set-tile:hover{border-color:var(--poke-yellow);background:rgba(255,204,0,.04);text-decoration:none;transform:translateX(2px)}
    .set-logo{height:28px;width:auto;object-fit:contain;flex-shrink:0}
    .set-tile-name{flex:1;font-size:12.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}
    .set-tile-year{font-size:10px;color:var(--text2);flex-shrink:0}
    .sync-msg{color:var(--text2);font-size:14px;padding:20px}

    /* ANIMATIONS */
    @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    .fade-up{animation:fadeUp .5s ease both}
    .fade-up-1{animation-delay:.1s}
    .fade-up-2{animation-delay:.2s}
    .fade-up-3{animation-delay:.3s}

    footer{border-top:1px solid var(--border);padding:32px 24px;text-align:center;font-size:13px;color:var(--text2);margin-top:48px;position:relative;z-index:1}
    footer a{color:var(--text2);margin:0 8px;text-decoration:none}
    footer a:hover{color:var(--text)}
  </style>
</head>
<body>
<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo">Cards on Cards on Cards</a>
    <div class="nav-links">
      <a href="/" class="nav-link nav-link--home">← Home</a>
      <a href="/cards/mtg" class="nav-link nav-link--mtg">MTG</a>
      <a href="/cards/pokemon" class="nav-link nav-link--pokemon">Pokemon</a>
      <a href="/cards/lorcana" class="nav-link nav-link--lorcana">Lorcana</a>
      <a href="/cards/yugioh" class="nav-link nav-link--yugioh">Yu-Gi-Oh</a>
      <a href="/calendar" class="nav-link nav-link--calendar">Calendar</a>
      <a href="/generators" class="nav-link nav-link--generators">Generators</a>
      <a href="/shop.html" class="nav-link nav-link--shop">Shop</a>
      <a href="/tracker.html" class="nav-link nav-link--tracker">Tracker</a>
    </div>
  </div>
</nav>

<div class="hero fade-up">
  <div class="hero-eyebrow">Card Vault — Pokemon TCG</div>
  <h1>Pokemon Card Prices <span>in Australia</span></h1>
  <p class="hero-sub">Live AUD pricing, eBay AU buy links, and set browsing for the Pokemon TCG. Updated daily.</p>
  <div class="stat-bar">
    <div class="stat-item"><div class="stat-num">${sets.length || '199'}</div><div class="stat-label">Sets</div></div>
    <div class="stat-item"><div class="stat-num">130k+</div><div class="stat-label">Cards</div></div>
    <div class="stat-item"><div class="stat-num">AU$</div><div class="stat-label">Live Prices</div></div>
    <div class="stat-item"><div class="stat-num">Daily</div><div class="stat-label">Updates</div></div>
  </div>
</div>

<div class="quick-links fade-up fade-up-1">
  <a href="https://www.ebay.com.au/sch/i.html?_nkw=pokemon+cards&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="quick-link" style="background:linear-gradient(135deg,var(--poke-yellow),#e6b800);color:#000">🛒 Shop Pokemon on eBay ↗</a>
  <a href="/tracker.html" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">📋 Free Tracker</a>
  <a href="/ev-calculator.html" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128202; EV Calculator &#8594;</a>
  <a href="/quizzes/pokemon-era" class="quick-link" style="background:rgba(255,204,0,.08);border-color:rgba(255,204,0,.3);color:#FFCC00">&#127919; Which Pokemon Era Are You? &#8594;</a>
  <a href="/blog/best-pokemon-booster-boxes-australia/" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">📦 Best Booster Boxes →</a>
  <a href="/blog/pokemon-tcg-beginners-guide-australia/" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">📖 Beginners Guide →</a>
</div>

${topCards.length ? `
<section class="carousel-section fade-up fade-up-2">
  <div class="carousel-label">Most Valuable</div>
  <div class="carousel-title">Top Pokemon Cards by Price (AUD)</div>
  <div class="carousel-track-wrap">
    <div class="carousel-track">${carouselHTML}${carouselHTML}</div>
  </div>
</section>` : ''}

<div class="wrap">

  <div class="section fade-up fade-up-2">
    <div class="section-header">
      <div class="section-title">Search Pokemon Cards</div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <input type="text" id="card-search" placeholder="Card name e.g. Charizard, Pikachu..." onkeyup="if(event.key==='Enter')searchCard()">
      <button class="btn btn-primary" onclick="searchCard()">Search</button>
    </div>
    <div id="search-results"></div>
  </div>

  <div class="section fade-up fade-up-3">
    <div class="section-header">
      <div class="section-title">Browse by Set</div>
      <div class="section-hint">Click any set to view cards and prices</div>
    </div>
    <input type="text" id="set-search" placeholder="Search sets e.g. Scarlet, Paldea..." oninput="filterSets(this.value)" style="margin-bottom:14px">
    <div id="set-list" class="set-grid">${setListHTML}</div>
  </div>

  <div style="background:rgba(255,204,0,.04);border:1px solid rgba(255,204,0,.15);border-radius:var(--radius);padding:24px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px">
    <div>
      <div style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:6px">Track Your Pokemon Collection</div>
      <p style="font-size:13px;color:var(--text2)">Free Google Sheets tracker. Know what you own and what it is worth.</p>
    </div>
    <a href="/tracker.html" class="btn btn-primary">Get Free Tracker →</a>
  </div>

</div>

<footer>
  <div style="margin-bottom:10px">
    <a href="/">Home</a><a href="/cards/mtg">MTG</a><a href="/cards/lorcana">Lorcana</a><a href="/cards/yugioh">Yu-Gi-Oh</a><a href="/blog">Blog</a><a href="/tracker.html">Tracker</a><a href="/calendar">Calendar</a>
  </div>
  <p>© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
  <p style="margin-top:6px;font-size:11px;opacity:.5">Not affiliated with The Pokemon Company. Card data via TCGdex. Prices converted to AUD at approximately 1.58.</p>
</footer>

<script>
window.C3_SUPA_URL = '${SUPABASE_URL}';
window.C3_SUPA_KEY = '${SUPABASE_ANON_KEY}';

function filterSets(q) {
  const lower = q.toLowerCase();
  document.querySelectorAll('#set-list .set-tile').forEach(el => {
    el.style.display = el.dataset.name.includes(lower) ? '' : 'none';
  });
}

async function searchCard() {
  const q = document.getElementById('card-search').value.trim();
  if (!q) return;
  const results = document.getElementById('search-results');
  results.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:12px 0">Searching...</div>';
  try {
    const url = window.C3_SUPA_URL + '/rest/v1/pokemon_cards?select=slug,name,image_url,market_price,price_aud,set_name,rarity&order=market_price.desc&rarity=not.is.null&rarity=neq.None&limit=24&name=ilike.*' + encodeURIComponent(q) + '*';
    const res = await fetch(url, { headers: { 'apikey': window.C3_SUPA_KEY } });
    const cards = await res.json();
    if (!cards.length) { results.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:12px 0">No cards found.</div>'; return; }
    results.innerHTML = cards.map(c => \`<a href="/cards/pokemon/\${c.slug}" style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center;display:block;text-decoration:none;transition:border-color .2s" onmouseover="this.style.borderColor='var(--poke-yellow)'" onmouseout="this.style.borderColor='var(--border)'">
      \${c.image_url ? \`<img src="\${c.image_url}" alt="\${c.name}" style="width:100%;border-radius:6px;max-height:140px;object-fit:contain">\` : ''}
      <div style="font-size:11px;color:var(--text);margin-top:4px;line-height:1.3">\${c.name}</div>
      \${c.rarity ? \`<div style="font-size:10px;color:var(--text2)">\${c.rarity}</div>\` : ''}
      <div style="font-size:12px;color:var(--poke-yellow);font-weight:700">\${c.price_aud ? 'AU$'+parseFloat(c.price_aud).toFixed(0) : c.market_price ? '~AU$'+(c.market_price*1.58).toFixed(0) : ''}</div>
    </a>\`).join('');
  } catch(e) {
    results.innerHTML = '<div style="color:#f88;font-size:13px">Search error. Try again.</div>';
  }
}
</script>
</body>
</html>`, { status: 200, headers });
};

export const config = { path: '/cards/pokemon' };
