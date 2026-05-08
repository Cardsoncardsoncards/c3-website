// netlify/functions/onepiece-hub.mjs
// Serves /cards/onepiece
// Correct columns: market_price, image_url, price_aud

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

const NAV_STYLES = `
<link rel="icon" type="image/png" href="/c3logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
nav{background:rgba(10,12,20,.97);backdrop-filter:blur(18px);border-bottom:1px solid #252840;padding:12px 0;position:sticky;top:0;z-index:100}
.nav-inner{display:flex;align-items:center;justify-content:space-between;max-width:1100px;margin:0 auto;padding:0 24px;gap:12px}
.nav-logo{display:flex;align-items:center;gap:9px;font-family:'Cinzel',serif;font-size:11.5px;font-weight:700;letter-spacing:.12em;color:#C9A84C;text-decoration:none;text-transform:uppercase;white-space:nowrap;flex-shrink:0}
.nav-logo img{height:32px;width:32px;border-radius:6px;object-fit:cover;flex-shrink:0}
.nav-links{display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
.nav-links::-webkit-scrollbar{display:none}
.nav-link{display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;transition:all .2s;border:1px solid #252840;color:#A0A8C0;white-space:nowrap}
.nav-link:hover{color:#F0F2FF;border-color:#A0A8C0;background:rgba(255,255,255,.04)}
.nav-link--home{color:#A0C4FF;border-color:rgba(160,196,255,.35)}
.nav-link--home:hover{background:rgba(160,196,255,.06);border-color:#A0C4FF;color:#C8DDFF}
.nav-link--shop{color:#C9A84C;border-color:rgba(201,168,76,.35)}
.nav-link--shop:hover{background:rgba(201,168,76,.06);border-color:#C9A84C;color:#E8C86A}
.nav-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.35)}
.nav-link--blog:hover{background:rgba(126,203,161,.06);border-color:#7ECBA1;color:#A5DFC0}
.nav-link--ev{color:#60A5FA;border-color:rgba(96,165,250,.35)}
.nav-link--ev:hover{background:rgba(96,165,250,.06);border-color:#60A5FA;color:#93C5FD}
.nav-link--tracker{color:#C084FC;border-color:rgba(192,132,252,.35)}
.nav-link--tracker:hover{background:rgba(192,132,252,.06);border-color:#C084FC;color:#D8B4FE}
.nav-link--ebay{color:#60A5FA;border-color:rgba(96,165,250,.35)}
.nav-link--ebay:hover{background:rgba(96,165,250,.06);border-color:#60A5FA;color:#93C5FD}
.nav-link--dnd{color:#F97316;border-color:rgba(249,115,22,.35)}
.nav-link--dnd:hover{background:rgba(249,115,22,.06);border-color:#F97316;color:#FB923C}
.nav-link--contact{color:#94A3B8;border-color:rgba(148,163,184,.35)}
.nav-link--contact:hover{background:rgba(148,163,184,.06);border-color:#94A3B8;color:#CBD5E1}
</style>`;

const NAV_HTML = `<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo"><img src="/c3logo.png" alt="C3 Logo"><span>Cards on Cards on Cards</span></a>
    <div class="nav-links">
      <a href="/" class="nav-link nav-link--home">Home</a>
      <a href="/shop.html" class="nav-link nav-link--shop">Shop</a>
      <a href="/blog" class="nav-link nav-link--blog">Blog</a>
      <a href="/ev-calculator.html" class="nav-link nav-link--ev">EV Calc</a>
      <a href="/tracker.html" class="nav-link nav-link--tracker">Tracker</a>
      <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=5339146789&customid=C3Nav&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="nav-link nav-link--ebay">eBay</a>
      <a href="https://blasdigital.etsy.com" target="_blank" rel="noopener" class="nav-link nav-link--dnd">D&amp;D Tools ↗</a>
      <a href="/contact.html" class="nav-link nav-link--contact">Contact Us</a>
    </div>
  </div>
</nav>`;

export default async (req) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=1800, s-maxage=3600' };

  const [sets, topCards] = await Promise.all([
    supabaseGet('onepiece_sets?order=release_date.desc&limit=300&select=id,name,slug,abbreviation,card_count,release_date'),
    supabaseGet('onepiece_cards?order=market_price.desc&market_price=gt.0&image_url=not.is.null&limit=24&select=slug,name,number,image_url,market_price,price_aud,rarity,set_name')
  ]);

  const carouselHTML = topCards.length ? topCards.map(c => `
    <a href="/cards/onepiece/${c.slug}" class="carousel-card">
      <div class="carousel-img-wrap">
        <img src="${c.image_url}" alt="${c.name}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=card-placeholder>${(c.name||'?')[0]}</div>'">
      </div>
      <div class="carousel-name">${c.name}</div>
      ${c.rarity ? `<div class="carousel-rarity">${c.rarity}</div>` : ''}
      <div class="carousel-price">${c.price_aud ? `AU$${parseFloat(c.price_aud).toFixed(0)}` : c.market_price ? `~AU$${(c.market_price*1.58).toFixed(0)}` : ''}</div>
    </a>`).join('') : '<div class="sync-msg">Cards load after sync — check back after 10am AEST.</div>';

  const setListHTML = sets.length ? sets.map(s => `
    <a href="/cards/onepiece/sets/${encodeURIComponent(s.abbreviation||s.slug||s.id)}" class="set-tile" data-name="${(s.name||'').toLowerCase()}">
      <span class="set-tile-name">${s.name}</span>
      ${s.release_date ? `<span class="set-tile-year">${s.release_date.slice(0,4)}</span>` : ''}
    </a>`).join('') : '<div class="sync-msg">Sets load after sync — check back after 10am AEST.</div>';

  return new Response(`<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>One Piece Card Prices Australia | Cards on Cards on Cards</title>
  <meta name="description" content="Browse One Piece TCG card prices in AUD. Live AUD pricing and eBay AU buy links. Australia's One Piece TCG price guide updated daily.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/onepiece">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  ${NAV_STYLES}
  <style>
    :root{--bg:#0A0C14;--bg2:#111420;--bg3:#181d2e;--gold:#C9A84C;--gold-dim:rgba(201,168,76,.3);--op-red:#CC0000;--text:#F0F2FF;--text2:#A0A8C0;--border:#252840;}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6;overflow-x:hidden}
    body::before{content:'';position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse 80% 40% at 50% -10%,rgba(204,0,0,.07),transparent 60%);z-index:0}
    .wrap{max-width:1100px;margin:0 auto;padding:0 24px;position:relative;z-index:1}
    .hero{padding:56px 24px 36px;text-align:center;position:relative;z-index:1}
    .hero-eyebrow{font-size:10px;font-weight:700;letter-spacing:.35em;text-transform:uppercase;color:var(--op-red);margin-bottom:12px}
    h1{font-family:'Cinzel',serif;font-size:clamp(26px,5vw,48px);font-weight:900;color:var(--text);line-height:1.1;margin-bottom:12px}
    h1 span{color:var(--op-red)}
    .hero-sub{font-size:15px;color:var(--text2);max-width:540px;margin:0 auto 24px}
    .stat-bar{display:flex;justify-content:center;gap:32px;flex-wrap:wrap;margin-top:20px}
    .stat-item{text-align:center}
    .stat-num{font-family:'Cinzel',serif;font-size:20px;font-weight:700;color:var(--op-red)}
    .stat-label{font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.08em;margin-top:2px}
    .gold-divider{width:100%;height:1px;background:linear-gradient(90deg,transparent,var(--gold-dim),var(--gold),var(--gold-dim),transparent);margin:40px 0}
    .section-label{font-size:10px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--text2);margin-bottom:12px;padding:0 24px;display:block}
    .section-title{font-family:'Cinzel',serif;font-size:20px;font-weight:700;color:var(--text);margin-bottom:20px;padding:0 24px}
    .carousel-outer{overflow:hidden;margin-bottom:48px}
    .carousel-track{display:flex;gap:12px;overflow-x:auto;padding:0 24px 16px;scrollbar-width:none;scroll-snap-type:x mandatory}
    .carousel-track::-webkit-scrollbar{display:none}
    .carousel-card{flex:0 0 160px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px;text-decoration:none;scroll-snap-align:start;transition:border-color .2s,transform .2s;display:block}
    .carousel-card:hover{border-color:var(--op-red);transform:translateY(-2px)}
    .carousel-img-wrap{width:100%;aspect-ratio:2/3;overflow:hidden;border-radius:6px;background:var(--bg3);margin-bottom:8px;display:flex;align-items:center;justify-content:center}
    .carousel-img-wrap img{width:100%;height:100%;object-fit:cover}
    .card-placeholder{font-family:'Cinzel',serif;font-size:24px;color:var(--text2)}
    .carousel-name{font-size:11px;font-weight:600;color:var(--text);line-height:1.3;margin-bottom:3px}
    .carousel-rarity{font-size:10px;color:var(--text2);margin-bottom:3px}
    .carousel-price{font-family:'Cinzel',serif;font-size:13px;font-weight:700;color:var(--op-red)}
    .quick-links{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;padding:0 24px 40px;position:relative;z-index:1}
    .quick-link{display:inline-flex;align-items:center;gap:7px;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none;transition:opacity .2s;border:1px solid transparent}
    .quick-link:hover{opacity:.85}
    .set-grid-wrap{padding:0 24px 48px;position:relative;z-index:1}
    .set-search{width:100%;max-width:400px;padding:9px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;margin-bottom:20px;display:block;font-family:'DM Sans',sans-serif}
    .set-search:focus{outline:none;border-color:var(--op-red)}
    .set-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
    .set-tile{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px 14px;text-decoration:none;display:flex;justify-content:space-between;align-items:center;transition:border-color .15s}
    .set-tile:hover{border-color:var(--op-red)}
    .set-tile.hidden{display:none}
    .set-tile-name{font-size:12px;color:var(--text);font-weight:600;line-height:1.3}
    .set-tile-year{font-size:10px;color:var(--text2);white-space:nowrap;margin-left:8px;flex-shrink:0}
    .sync-msg{font-size:13px;color:var(--text2);padding:20px;text-align:center;grid-column:1/-1}
    footer{border-top:1px solid var(--border);padding:32px 24px;text-align:center;font-size:12px;color:var(--text2);margin-top:48px;position:relative;z-index:1}
    footer a{color:var(--text2);margin:0 8px;text-decoration:none}
    footer a:hover{color:var(--text)}
    .footer-disclaimer{max-width:900px;margin:12px auto 0;font-size:11px;color:rgba(120,128,153,.5);line-height:1.7}
  </style>
</head>
<body>
${NAV_HTML}
<div class="hero">
  <div class="hero-eyebrow">Card Vault — One Piece TCG</div>
  <h1>One Piece Card Prices <span>in Australia</span></h1>
  <p class="hero-sub">One Piece TCG card prices in AUD. Browse by set or character. eBay AU buy links updated daily.</p>
  <div class="stat-bar">
    <div class="stat-item"><div class="stat-num">${sets.length || '70+'}</div><div class="stat-label">Sets</div></div>
    <div class="stat-item"><div class="stat-num">6k+</div><div class="stat-label">Cards</div></div>
    <div class="stat-item"><div class="stat-num">AU$</div><div class="stat-label">Live Prices</div></div>
    <div class="stat-item"><div class="stat-num">Daily</div><div class="stat-label">Updates</div></div>
  </div>
</div>

<div class="quick-links">
  <a href="https://www.ebay.com.au/sch/i.html?_nkw=one+piece+card+game&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="quick-link" style="background:linear-gradient(135deg,#CC0000,#990000);color:#fff">🛒 Shop One Piece on eBay ↗</a>
  <a href="/tracker.html" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">📋 Free Tracker</a>
  <a href="/blog/one-piece-card-game-australia-beginners-guide/" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">📖 Beginners Guide →</a>
</div>

<div class="gold-divider"></div>

<div style="position:relative;z-index:1;margin-bottom:48px">
  <span class="section-label">Top Cards by Value</span>
  <h2 class="section-title">Most Valuable One Piece Cards</h2>
  <div class="carousel-outer">
    <div class="carousel-track">${carouselHTML}</div>
  </div>
</div>

<div class="set-grid-wrap">
  <span class="section-label">Browse by Set</span>
  <input type="text" class="set-search" placeholder="Search sets..." oninput="filterSets(this.value)">
  <div class="set-grid" id="set-grid">${setListHTML}</div>
</div>

<footer>
  <p><a href="/">Home</a><a href="/shop.html">Shop</a><a href="/blog">Blog</a><a href="/ev-calculator.html">EV Calc</a><a href="/tracker.html">Tracker</a><a href="/cards/onepiece">One Piece</a></p>
  <p style="margin-top:8px">© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
  <div class="footer-disclaimer">Cards on Cards on Cards participates in affiliate programmes including Amazon Associates and eBay Partner Network. Purchases through links may earn a commission at no extra cost to you.</div>
</footer>

<script>
function filterSets(q) {
  const term = (q || '').toLowerCase();
  document.querySelectorAll('#set-grid .set-tile').forEach(function(el) {
    el.classList.toggle('hidden', term.length > 0 && !el.dataset.name.includes(term));
  });
}
</script>
</body>
</html>`, { status: 200, headers });
};

export const config = { path: '/cards/onepiece' };
