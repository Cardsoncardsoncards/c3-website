// netlify/functions/universus-hub.mjs
// Serves /cards/universus
// Rebuilt to Pokemon hub standard -- 28 May 2026

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID        = '5339146789';

const GAME_LABEL  = 'UniVersus';
const ACCENT      = '#14B8A6';
const ACCENT_RGB  = '20,184,166';
const EMOJI       = '&#9884;';
const SET_PH      = 'Street Fighter, Cowboy Bebop...';
const CANONICAL   = 'https://cardsoncardsoncards.com.au/cards/universus';

const CALENDAR_EVENTS = [];

function esc(str) {
  return (str == null ? '' : String(str))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(dateStr + 'T00:00:00') - today) / 86400000);
}

function buildTickerHTML(events) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const upcoming = events
    .filter(e => new Date(e.date + 'T00:00:00') >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!upcoming.length) return '';
  const items = upcoming.map(e => {
    const days = daysUntil(e.date);
    const label = days === 0 ? 'TODAY' : days === 1 ? 'TOMORROW' : `IN ${days} DAYS`;
    return `<span class="ticker-item"><span class="ticker-badge">${label}</span><strong>${esc(e.name)}</strong> &middot; ${esc(e.type)}</span>`;
  });
  const fill = [...items, ...items, ...items, ...items, ...items, ...items].join('');
  return `<div class="release-ticker"><span class="ticker-label">${EMOJI} ${GAME_LABEL}</span><div class="ticker-track">${fill}</div></div>`;
}

function isNew(releaseDateStr) {
  if (!releaseDateStr) return false;
  const cutoff = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
  return releaseDateStr >= cutoff;
}

function buildAZButtons(sets) {
  const letters = new Set();
  sets.forEach(s => {
    const ch = (s.name || '').trim()[0];
    if (ch) letters.add(/[A-Z]/.test(ch.toUpperCase()) ? ch.toUpperCase() : '0-9');
  });
  return ['All', '0-9', ...[...letters].filter(l => l !== '0-9').sort()]
    .map(l => `<button class="az-btn${l === 'All' ? ' az-btn--active' : ''}" onclick="filterAZ('${l}',this)">${l}</button>`)
    .join('');
}

function sharedCSS() {
  return `
    :root{--bg:#0A0C14;--bg2:#111420;--bg3:#181d2e;--gold:#C9A84C;--accent:${ACCENT};--accent-rgb:${ACCENT_RGB};--text:#e8eaf0;--text2:#9ba3c4;--border:#242840;--radius:12px;--silver:#A0A8C0}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6;min-height:100vh;overflow-x:hidden}
    body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(ellipse 70% 40% at 50% 0%,rgba(${ACCENT_RGB},.05),transparent 60%)}
    a{color:inherit;text-decoration:none}a:hover{text-decoration:none}
    nav{background:rgba(10,12,20,.97);border-bottom:1px solid var(--border);padding:10px 0;position:sticky;top:0;z-index:100;backdrop-filter:blur(20px)}
    .nav-inner{max-width:1200px;margin:0 auto;padding:0 20px;display:flex;align-items:center;gap:8px}
    .nav-logo{display:flex;align-items:center;gap:8px;text-decoration:none;flex-shrink:0}
    .nav-logo img{height:34px;width:34px;border-radius:6px;object-fit:cover}
    .nav-links{display:flex;gap:3px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;flex-shrink:0}
    .nav-links::-webkit-scrollbar{display:none}
    .nav-link{font-size:11px;padding:5px 9px;border-radius:6px;border:1px solid var(--border);color:var(--silver);text-decoration:none;font-weight:600;letter-spacing:.04em;text-transform:uppercase;transition:all .2s;white-space:nowrap}
    .nav-link:hover{color:var(--text);border-color:var(--silver);background:rgba(255,255,255,.04);text-decoration:none}
    .nav-link--active{color:var(--gold);border-color:rgba(201,168,76,.3)}
    .nav-link--compare{color:#a78bfa;border-color:rgba(167,139,250,.3)}.nav-link--compare:hover{background:rgba(167,139,250,.06);border-color:#a78bfa}
    .nav-link--market{color:#4ADE80;border-color:rgba(74,222,128,.3)}.nav-link--market:hover{background:rgba(74,222,128,.06);border-color:#4ADE80}
    .nav-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.3)}.nav-link--blog:hover{background:rgba(126,203,161,.06);border-color:#7ECBA1}
    .nav-link--ebay{color:#4ADE80;border-color:rgba(74,222,128,.3);background:rgba(74,222,128,.05)}.nav-link--ebay:hover{background:rgba(74,222,128,.1);border-color:#4ADE80}
    .release-ticker{background:rgba(${ACCENT_RGB},.06);border-bottom:1px solid rgba(${ACCENT_RGB},.15);height:34px;display:flex;align-items:center;overflow:hidden;position:relative}
    .release-ticker::before,.release-ticker::after{content:'';position:absolute;top:0;bottom:0;width:50px;z-index:2;pointer-events:none}
    .release-ticker::before{left:0;background:linear-gradient(to right,var(--bg),transparent)}
    .release-ticker::after{right:0;background:linear-gradient(to left,var(--bg),transparent)}
    .ticker-label{font-size:9px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--accent);white-space:nowrap;padding:0 14px 0 18px;flex-shrink:0;z-index:3}
    .ticker-track{display:flex;animation:tickerScroll 40s linear infinite}
    .ticker-track:hover{animation-play-state:paused}
    @keyframes tickerScroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
    .ticker-item{display:inline-flex;align-items:center;gap:8px;padding:0 24px;font-size:11.5px;color:var(--silver);white-space:nowrap}
    .ticker-badge{font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;background:rgba(${ACCENT_RGB},.15);color:var(--accent);letter-spacing:.06em}
    .hero{padding:52px 24px 36px;text-align:center;position:relative;z-index:1}
    .hero-eyebrow{font-size:10px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--accent);margin-bottom:12px}
    h1{font-family:'Cinzel',serif;font-size:clamp(24px,5vw,50px);font-weight:900;color:var(--text);margin-bottom:12px;line-height:1.1}
    h1 span{color:var(--accent)}
    .hero-sub{font-size:14px;color:var(--text2);max-width:520px;margin:0 auto 28px}
    .stat-bar{display:flex;justify-content:center;border:1px solid var(--border);border-radius:12px;overflow:hidden;max-width:540px;margin:0 auto 32px;background:var(--bg2)}
    .stat-item{flex:1;padding:14px 10px;text-align:center;border-right:1px solid var(--border)}.stat-item:last-child{border-right:none}
    .stat-num{font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:var(--accent)}
    .stat-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text2);margin-top:2px}
    .quick-links{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:28px;justify-content:center;padding:0 24px}
    .quick-link{display:inline-flex;align-items:center;gap:7px;padding:9px 18px;border-radius:10px;font-weight:700;font-size:12.5px;text-decoration:none;transition:all .2s;border:1px solid transparent}
    .quick-link:hover{opacity:.88;transform:translateY(-1px);text-decoration:none}
    .guide-card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;text-decoration:none;display:block;transition:all .2s}
    .guide-card:hover{border-color:var(--accent);transform:translateY(-2px);text-decoration:none}
    .guide-title{font-size:13px;font-weight:700;color:var(--accent);margin-bottom:5px}
    .guide-desc{font-size:11px;color:var(--text2);line-height:1.5}
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
    .carousel-card{flex-shrink:0;width:155px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center;display:block}
    .carousel-card:hover{border-color:var(--accent);transform:translateY(-4px);box-shadow:0 8px 20px rgba(${ACCENT_RGB},.12)}
    .carousel-img-wrap{height:130px;display:flex;align-items:center;justify-content:center;margin-bottom:7px;overflow:hidden}
    .carousel-img-wrap img{max-height:130px;max-width:100%;object-fit:contain;border-radius:4px;transition:transform .3s}
    .carousel-card:hover .carousel-img-wrap img{transform:scale(1.05)}
    .carousel-name{font-size:11px;color:var(--text);font-weight:600;line-height:1.3;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .carousel-rarity{font-size:10px;color:var(--text2);margin-bottom:2px}
    .carousel-price{font-size:13px;color:var(--accent);font-weight:700;margin-top:3px}
    .carousel-buy-row{margin-top:6px}
    .carousel-buy-btn{font-size:10px;font-weight:700;color:#000;background:var(--accent);padding:3px 8px;border-radius:4px;letter-spacing:.04em;display:inline-block}
    .wrap{max-width:1200px;margin:0 auto;padding:0 24px;position:relative;z-index:1}
    .section{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:22px;margin-bottom:20px}
    .btn{display:inline-flex;align-items:center;gap:7px;padding:9px 20px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;border:none;font-family:'DM Sans',sans-serif;transition:all .2s;text-decoration:none}
    .btn:hover{opacity:.85;text-decoration:none}
    .btn-primary{background:var(--accent);color:#000}
    .az-row{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:14px}
    .az-btn{padding:5px 9px;border-radius:6px;font-size:11.5px;font-weight:700;cursor:pointer;border:1px solid var(--border);background:var(--bg3);color:var(--text2);font-family:'DM Sans',sans-serif;transition:all .2s;letter-spacing:.04em}
    .az-btn:hover{border-color:var(--accent);color:var(--accent)}
    .az-btn--active{background:var(--accent);color:#000;border-color:var(--accent)}
    .set-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:5px;margin-top:8px}
    .set-tile{display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--bg3);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:8px;padding:8px 12px;text-decoration:none;transition:all .2s;min-width:0}
    .set-tile:hover{border-color:var(--accent);background:rgba(${ACCENT_RGB},.04);text-decoration:none;transform:translateX(2px)}
    .set-tile-name{flex:1;font-size:12.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}
    .set-tile-meta{font-size:10px;color:var(--text2);flex-shrink:0;white-space:nowrap}
    .new-badge{font-size:8px;font-weight:800;background:var(--accent);color:#000;border-radius:3px;padding:1px 5px;letter-spacing:.05em;margin-left:5px;vertical-align:middle}
    .sync-msg{color:var(--text2);font-size:14px;padding:20px}
    input[type=text]{background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:9px 14px;border-radius:8px;font-size:14px;font-family:'DM Sans',sans-serif;width:100%;max-width:440px;transition:border-color .2s}
    input[type=text]::placeholder{color:var(--text2)}
    input[type=text]:focus{outline:none;border-color:var(--accent)}
    @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    .fade-up{animation:fadeUp .5s ease both}.fade-up-1{animation-delay:.08s}.fade-up-2{animation-delay:.16s}.fade-up-3{animation-delay:.24s}
    footer{border-top:1px solid var(--border);padding:28px 24px;text-align:center;font-size:12px;color:var(--text2);margin-top:40px;position:relative;z-index:1}
    footer a{color:var(--text2);margin:0 7px;text-decoration:none}footer a:hover{color:var(--text)}
    @media(max-width:600px){.nav-links{gap:2px}.nav-link{font-size:10px;padding:4px 7px}.hero{padding:36px 16px 24px}.quick-links{padding:0 12px}.wrap{padding:0 12px}.set-grid{grid-template-columns:1fr}}`;
}

export default async (req) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=1800, s-maxage=3600' };

  const [setsRes, cardsRes, gainersRes, losersRes] = await Promise.allSettled([
    supabaseGet('universus_sets?order=release_date.desc&limit=100&select=id,name,slug,release_date,card_count'),
    supabaseGet('universus_cards?order=market_price.desc&market_price=gt.0&image_url=not.is.null&rarity=not.is.null&rarity=neq.None&limit=24&select=slug,name,image_url,market_price,price_aud,rarity,set_name,updated_at'),
    supabaseGet('universus_cards?order=price_change_7d.desc&price_change_7d=gt.5&market_price=gt.1&price_change_7d=lt.5000&image_url=not.is.null&limit=5&select=slug,name,image_url,market_price,price_aud,price_change_7d,set_name'),
    supabaseGet('universus_cards?order=price_change_7d.asc&price_change_7d=lt.-5&market_price=gt.1&image_url=not.is.null&limit=5&select=slug,name,image_url,market_price,price_aud,price_change_7d,set_name')
  ]);

  const sets    = setsRes.status  === 'fulfilled' ? setsRes.value  : [];
  let rawCards  = cardsRes.status === 'fulfilled' ? cardsRes.value : [];

  const gainers = gainersRes.status === 'fulfilled' ? gainersRes.value : [];
  const losers  = losersRes.status  === 'fulfilled' ? losersRes.value  : [];

  const SEALED = ['booster box','booster pack',' case','bundle','display','sealed product','starter deck','starter set','trial deck','box set','collection box','premium set','gift set'];
  const topCards = rawCards.filter(c => { const n = (c.name||'').toLowerCase(); return !SEALED.some(k => n.includes(k)); });

  const lastUpdated = topCards.length && topCards[0].updated_at ? topCards[0].updated_at.slice(0,10) : null;
  const syncLabel   = lastUpdated ? `Prices updated ${lastUpdated}` : 'Prices updated daily';
  const tickerHTML  = buildTickerHTML(CALENDAR_EVENTS);
  const azButtons   = buildAZButtons(sets);

  function carouselCard(c, suffix) {
    const price = c.price_aud ? `AU$${parseFloat(c.price_aud).toFixed(0)}` : c.market_price ? `~AU$${(c.market_price*1.58).toFixed(0)}` : '';
    const ebay  = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(c.name+' UniVersus card')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
    return `<div class="carousel-card"><a href="/cards/universus/${esc(c.slug)}" style="display:block;text-decoration:none"><div class="carousel-img-wrap"><img src="${esc(c.image_url)}${suffix}" alt="${esc(c.name).replace(/"/g,'&quot;')}" loading="eager" onerror="this.onerror=null;this.style.opacity=0.3"></div><div class="carousel-name">${esc(c.name)}</div>${c.rarity?`<div class="carousel-rarity">${esc(c.rarity)}</div>`:''}<div class="carousel-price">${price}</div></a><div class="carousel-buy-row"><a href="${ebay}" target="_blank" rel="noopener" class="carousel-buy-btn">Buy eBay &#8599;</a></div></div>`;
  }
  const carouselHTML  = topCards.map(c => carouselCard(c, '')).join('');
  const carouselHTML2 = topCards.map(c => carouselCard(c, '#c2')).join('');

  function moverCard(c, isGainer) {
    const arrow = isGainer ? '&#8593;' : '&#8595;';
    const col   = isGainer ? '#4ADE80' : '#f87171';
    const pct   = Math.abs(parseFloat(c.price_change_7d||0)).toFixed(1);
    const price = c.price_aud ? 'AU$'+parseFloat(c.price_aud).toFixed(0) : c.market_price ? '~AU$'+(c.market_price*1.58).toFixed(0) : '';
    return `<a href="/cards/universus/${esc(c.slug)}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;text-decoration:none">${c.image_url?`<img src="${esc(c.image_url)}" alt="" loading="lazy" style="width:40px;height:56px;object-fit:cover;border-radius:4px;flex-shrink:0">`:'<div style="width:40px;height:56px;background:var(--bg3);border-radius:4px;flex-shrink:0"></div>'}<div style="min-width:0;flex:1"><div style="font-size:11.5px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.name)}</div><div style="font-size:10px;color:var(--text2)">${esc(c.set_name||'')}</div><div style="font-size:11px;color:var(--accent);font-weight:700">${price}</div></div><div style="font-size:12px;font-weight:700;color:${col};flex-shrink:0">${arrow}${pct}%</div></a>`;
  }
  const gainerHTML = gainers.map(c => moverCard(c, true)).join('');
  const loserHTML  = losers.map(c => moverCard(c, false)).join('');
  const hasMovers  = gainers.length > 0 || losers.length > 0;

  const setListHTML = sets.length ? sets.map(s => {
    const name      = s.name || '';
    const ch        = name.trim()[0] ? name.trim()[0].toUpperCase() : '';
    const letterKey = /[A-Z]/.test(ch) ? ch : '0-9';
    const year      = s.release_date ? s.release_date.slice(0,4) : '';
    const newBadge  = isNew(s.release_date) ? '<span class="new-badge">NEW</span>' : '';
    return `<a href="/cards/universus/sets/${encodeURIComponent(s.slug||s.id)}" class="set-tile" data-name="${esc(name.toLowerCase())}" data-letter="${letterKey}"><span class="set-tile-name">${esc(name)}${newBadge}</span><span class="set-tile-meta">${year}${s.card_count?' &middot; '+s.card_count+' cards':''}</span></a>`;
  }).join('') : '<div class="sync-msg">Sets loading -- check back after tonight\'s sync.</div>';

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>UniVersus Card Prices Australia | AUD Prices Updated Daily | C3</title>
  <meta name="description" content="UniVersus TCG card prices in AUD. Browse sets and buy on eBay AU.">
  <link rel="canonical" href="${CANONICAL}">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <meta property="og:title" content="UniVersus Card Prices Australia | Cards on Cards on Cards">
  <meta property="og:description" content="UniVersus TCG card prices in AUD. Browse sets and buy on eBay AU.">
  <meta property="og:image" content="https://cardsoncardsoncards.com.au/c3ogbanner.png">
  <meta property="og:url" content="${CANONICAL}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <style>${sharedCSS()}</style>
</head>
<body>
<nav><div class="nav-inner">
  <a href="/" class="nav-logo" title="Cards on Cards on Cards"><img src="/c3logo.png" alt="C3"></a>
  <div class="nav-links">
    <a href="/cards" class="nav-link nav-link--active">Card Vault</a>
    <a href="/cards/universus" class="nav-link" style="color:${ACCENT};border-color:${ACCENT}80;background:${ACCENT}14">UniVersus</a>
    <a href="/compare" class="nav-link nav-link--compare">Compare</a>
    <a href="/market" class="nav-link nav-link--market">Market</a>
    <a href="/tools" class="nav-link" style="color:#22D3EE;border-color:rgba(34,211,238,.3)">Tools</a>
    <a href="/play" class="nav-link" style="color:#F472B6;border-color:rgba(244,114,182,.3)">Play</a>
    <a href="/blog" class="nav-link nav-link--blog">Blog</a>
    <div class="nav-dropdown"><a href="/shop" class="nav-link nav-link--shop" style="display:inline-block;padding:6px 11px;border-radius:7px;font-size:13px;font-weight:600;color:#C9A84C;text-decoration:none">Shop &#9662;</a><div class="nav-dropdown-menu"><a href="/shop" class="nav-dropdown-item">Sealed Product</a><a href="https://www.ebay.com.au/str/cardsoncardsoncards?campid=${EPN_CAMPID}&customid=nav-shop&mkevt=1&mkcid=1&mkrid=705-53470-19255-0&siteid=15&toolid=10001" class="nav-dropdown-item" target="_blank" rel="noopener">Singles on eBay &#8599;</a><a href="https://blasdigital.etsy.com" class="nav-dropdown-item" target="_blank" rel="noopener">Tools on Etsy &#8599;</a></div></div><style>.nav-dropdown{position:relative;display:inline-block}.nav-dropdown-menu{display:none;position:absolute;top:100%;left:0;background:#0d1117;border:1px solid #1e2235;border-radius:8px;min-width:180px;z-index:1000;padding:6px 0;box-shadow:0 8px 24px rgba(0,0,0,0.4)}.nav-dropdown:hover .nav-dropdown-menu{display:block}.nav-dropdown-item{display:block;padding:9px 16px;color:#c4c9d4;font-size:13px;font-weight:500;text-decoration:none;white-space:nowrap}.nav-dropdown-item:hover{color:#c9a84c;background:#1a1f2e}</style>
  </div>
</div></nav>

${tickerHTML}

<div class="hero fade-up">
  <div class="hero-eyebrow">Card Vault -- UniVersus</div>
  <h1>UniVersus Card Prices <span>in Australia</span></h1>
  <p class="hero-sub">UniVersus card prices in AUD. Browse by set or search by card name. eBay AU buy links updated daily.</p>
  <div class="stat-bar">
    <div class="stat-item"><div class="stat-num">${sets.length||'?'}</div><div class="stat-label">Sets</div></div>
    <div class="stat-item"><div class="stat-num">8k+</div><div class="stat-label">Cards</div></div>
    <div class="stat-item"><div class="stat-num">AU$</div><div class="stat-label">Live Prices</div></div>
    <div class="stat-item"><div class="stat-num">Daily</div><div class="stat-label">Updates</div></div>
  </div>
  <p style="font-size:11px;color:var(--text2);margin-top:-20px">${syncLabel}</p>
</div>

<div class="quick-links fade-up fade-up-1">
  <a href="https://www.ebay.com.au/sch/i.html?_nkw=universus+tcg+card&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="quick-link" style="background:linear-gradient(135deg,#1a1a2e,${ACCENT});color:#fff">&#128722; Shop UniVersus on eBay &#8599;</a>
  <a href="/tracker.html" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128203; Free Tracker</a>
  <a href="/ev-calculator.html" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128202; EV Calculator &#8594;</a>
  <a href="/compare" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#9781; Compare Cards</a>
</div>

${topCards.length ? `<section class="carousel-section fade-up fade-up-2">
  <div class="carousel-label">Most Valuable</div>
  <div class="carousel-title">Top UniVersus Cards by Price (AUD)</div>
  <div class="carousel-track-wrap"><div class="carousel-track">${carouselHTML}${carouselHTML2}</div></div>
</section>
<p style="text-align:center;color:var(--text2);font-size:11px;margin-top:-12px;margin-bottom:16px">Prices sourced from TCGPlayer (USD), converted to AUD. Updated daily.</p>` : ''}

<div class="wrap">
${hasMovers ? `<div style="margin-bottom:28px">
  <h2 style="font-size:20px;margin-bottom:4px">&#128200; Weekly Market Pulse</h2>
  <p style="color:var(--text2);font-size:13px;margin-bottom:8px">Biggest price movers across all UniVersus cards in the last 7 days.</p>
  <p style="color:var(--text2);font-size:11px;margin-bottom:16px">Prices sourced from TCGPlayer (USD), converted to AUD.</p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:16px">
      <div style="font-size:13px;font-weight:700;margin-bottom:12px"><span style="color:#4ADE80">&#8593;</span> Biggest Gainers</div>
      <div style="display:flex;flex-direction:column;gap:8px">${gainerHTML||'<p style="color:var(--text2);font-size:13px">No significant gainers this week.</p>'}</div>
    </div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:16px">
      <div style="font-size:13px;font-weight:700;margin-bottom:12px"><span style="color:#f87171">&#8595;</span> Biggest Losers</div>
      <div style="display:flex;flex-direction:column;gap:8px">${loserHTML||'<p style="color:var(--text2);font-size:13px">No significant losers this week.</p>'}</div>
    </div>
  </div>
</div>` : ''}

  <div class="section fade-up fade-up-3">
    <div style="text-align:center;margin-bottom:16px">
      <h2 style="font-family:'Cinzel',serif;font-size:24px;font-weight:700;color:var(--text);margin-bottom:6px">Browse Every UniVersus Set</h2>
      <p style="font-size:13px;color:var(--text2)">${sets.length||'?'} sets. Pick a letter or search to explore.</p>
    </div>
    <div class="az-row">${azButtons}</div>
    <input type="text" id="set-search" placeholder="${esc(SET_PH)}" oninput="filterSets(this.value)" style="margin-bottom:12px">
    <p id="set-prompt" style="color:var(--text2);font-size:13px;text-align:center;padding:20px 0">Select a letter or search above to browse sets</p>
    <div id="set-list" class="set-grid" style="display:none">${setListHTML}</div>
  </div>

  <div style="margin-bottom:28px">
    <h2 style="font-size:18px;margin-bottom:16px">UniVersus Guides and Resources</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
      <a href="/ev-calculator.html" class="guide-card"><div class="guide-title">Booster Box EV Calculator</div><div class="guide-desc">Is your UniVersus box worth opening? Calculate expected value before you crack it.</div></a>
      <a href="/quizzes/which-tcg-extended" class="guide-card"><div class="guide-title">&#127919; Which TCG Should I Play?</div><div class="guide-desc">Not sure which TCG is right for you? Take the quiz and find out in 2 minutes.</div></a>
      <a href="/tracker.html" class="guide-card"><div class="guide-title">Free Collection Tracker</div><div class="guide-desc">Track your UniVersus collection value in AUD with our free Google Sheets tracker.</div></a>
    </div>
  </div>

  <div style="background:rgba(${ACCENT_RGB},.04);border:1px solid rgba(${ACCENT_RGB},.15);border-radius:var(--radius);padding:22px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px">
    <div>
      <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:5px">Track Your UniVersus Collection</div>
      <p style="font-size:13px;color:var(--text2)">Free Google Sheets tracker. Know what you own and what it is worth in AUD.</p>
    </div>
    <a href="/tracker.html" class="btn btn-primary">Get Free Tracker &#8594;</a>
  </div>
</div>

<footer>
  <div style="margin-bottom:10px">
    <a href="/">Home</a><a href="/cards">Card Vault</a><a href="/cards/universus">UniVersus</a>
    <a href="/cards/pokemon">Pokemon</a><a href="/cards/mtg">MTG</a>
    <a href="/cards/yugioh">Yu-Gi-Oh</a><a href="/cards/lorcana">Lorcana</a>
    <a href="/blog">Blog</a><a href="/tracker.html">Tracker</a>
  </div>
  <p>&#169; 2026 Cards on Cards on Cards &middot; cardsoncardsoncards.com.au</p>
  <p style="margin-top:6px;font-size:11px;opacity:.5">Affiliate disclosure: this site earns commissions from eBay AU and Amazon AU purchases made through affiliate links at no extra cost to you. USD prices converted to AUD at approximately 1.58.</p>
</footer>

<script>
let activeAZ = null;
function filterAZ(letter, btn) {
  activeAZ = (letter === 'All') ? null : letter;
  document.querySelectorAll('.az-btn').forEach(b => b.classList.remove('az-btn--active'));
  if (btn) btn.classList.add('az-btn--active');
  showSetList(); applyFilters();
}
function filterSets(q) { if (q && q.length > 0) showSetList(); applyFilters(q); }
function showSetList() {
  document.getElementById('set-list').style.display = 'grid';
  const p = document.getElementById('set-prompt'); if (p) p.style.display = 'none';
}
function applyFilters(q) {
  const search = q !== undefined ? q : (document.getElementById('set-search')||{}).value || '';
  const lower = search.toLowerCase();
  document.querySelectorAll('#set-list .set-tile').forEach(el => {
    const nameMatch   = !lower || el.dataset.name.includes(lower);
    const letterMatch = !activeAZ || el.dataset.letter === activeAZ;
    el.style.display = (nameMatch && letterMatch) ? '' : 'none';
  });
}
</script>
<style>.bug-float{position:fixed;bottom:20px;right:20px;z-index:9999}.bug-btn{display:flex;align-items:center;gap:6px;background:rgba(15,17,25,.95);border:1px solid rgba(201,168,76,.3);color:#C9A84C;padding:8px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;font-family:sans-serif;backdrop-filter:blur(12px);transition:all .2s;text-decoration:none;letter-spacing:.03em;box-shadow:0 4px 16px rgba(0,0,0,.4)}.bug-btn:hover{border-color:#C9A84C;background:rgba(201,168,76,.12);color:#E8C86A;text-decoration:none;transform:translateY(-2px)}.bug-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10000;align-items:center;justify-content:center;backdrop-filter:blur(4px)}.bug-modal.open{display:flex}.bug-box{background:#111420;border:1px solid #252840;border-radius:14px;padding:28px;width:100%;max-width:420px;margin:0 16px;position:relative}.bug-box h3{font-family:'Cinzel',serif;font-size:17px;font-weight:700;color:#F0F2FF;margin-bottom:4px}.bug-box p{font-size:12px;color:#9ba3c4;margin-bottom:18px}.bug-close{position:absolute;top:12px;right:14px;background:none;border:none;color:#9ba3c4;font-size:18px;cursor:pointer;line-height:1;padding:4px}.bug-form select,.bug-form textarea{width:100%;background:rgba(255,255,255,.05);border:1px solid #252840;border-radius:8px;color:#F0F2FF;font-family:'DM Sans',sans-serif;font-size:13px;padding:9px 12px;margin-bottom:12px;outline:none;transition:border-color .2s}.bug-form select:focus,.bug-form textarea:focus{border-color:rgba(201,168,76,.5)}.bug-form textarea{resize:vertical;min-height:80px;max-height:160px}.bug-form select option{background:#e8eaf0;color:#111420}.bug-form select{background:#e8eaf0;color:#111420}.bug-hidden{display:none}.bug-submit{width:100%;padding:10px;background:#C9A84C;color:#0A0C14;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:opacity .2s}.bug-submit:hover{opacity:.85}.bug-submit:disabled{opacity:.5;cursor:not-allowed}.bug-thanks{display:none;text-align:center;padding:12px 0}.bug-thanks p{color:#4ADE80;font-size:14px;font-weight:600}</style>
<div class="bug-float"><a class="bug-btn" onclick="document.getElementById('bugModal').classList.add('open');return false" href="#">&#x1F41B; Report a Bug</a></div>
<div class="bug-modal" id="bugModal" onclick="if(event.target===this)this.classList.remove('open')">
  <div class="bug-box">
    <button class="bug-close" onclick="document.getElementById('bugModal').classList.remove('open')">&#x2715;</button>
    <h3>&#x1F41B; Report a Bug</h3><p>Spotted something wrong? Takes 20 seconds.</p>
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
<script>(function(){const u=document.getElementById('bugPageUrl');if(u)u.value=window.location.href;const f=document.getElementById('bugReportForm');if(!f)return;f.addEventListener('submit',function(e){e.preventDefault();const b=document.getElementById('bugSubmit');b.disabled=true;b.textContent='Sending...';const d=new FormData(f);fetch('/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(d).toString()}).then(function(){document.getElementById('bugThanks').style.display='block';f.querySelector('select').style.display='none';f.querySelector('textarea').style.display='none';b.style.display='none';setTimeout(function(){document.getElementById('bugModal').classList.remove('open');},2000);}).catch(function(){b.disabled=false;b.textContent='Submit Report';});});})();</script>
</body></html>`;

  return new Response(html, { status: 200, headers });
};

export const config = { path: '/cards/universus' };
