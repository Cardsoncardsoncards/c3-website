// netlify/functions/vanguard-hub.mjs
// Serves /cards/vanguard
// Auto-generated 20 May 2026 -- C3 standard hub

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID        = '5339146789';

const GAME_LABEL  = 'Cardfight Vanguard';
const ACCENT      = '#DC2626';
const ACCENT_RGB  = '220,38,38';
const EMOJI       = '&#9876;';
const SEARCH_PH   = "Blaster Blade, Shadow Paladin, Dragonic Overlord...";
const SET_PH      = "V-BT01, D-BT01, Trial Deck...";
const CANONICAL   = 'https://cardsoncardsoncards.com.au/cards/vanguard';

const CALENDAR_EVENTS = [];

function esc(str) {
  return (str == null ? '' : String(str))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  const doubled = [...items, ...items].join('');
  return `<div class="release-ticker">
  <span class="ticker-label">${EMOJI} ${GAME_LABEL}</span>
  <div class="ticker-track">${doubled}</div>
</div>`;
}

function isNew(d) {
  if (!d) return false;
  return d >= new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
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

function css() {
  return `
    :root{--bg:#0A0C14;--bg2:#111420;--bg3:#181d2e;--gold:#C9A84C;--accent:${ACCENT};--accent-rgb:${ACCENT_RGB};--text:#e8eaf0;--text2:#9ba3c4;--border:#242840;--radius:12px;--silver:#A0A8C0}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6;min-height:100vh;overflow-x:hidden}
    body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(ellipse 70% 40% at 50% 0%,rgba(var(--accent-rgb),.05),transparent 60%)}
    a{color:inherit;text-decoration:none}a:hover{text-decoration:none}
    nav{background:rgba(8,10,15,.97);border-bottom:1px solid #1e2235;padding:12px 0;position:sticky;top:0;z-index:100;backdrop-filter:blur(18px)}
    .nav-inner{display:flex;align-items:center;max-width:1400px;margin:0 auto;padding:0 24px;gap:10px}
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
    .nav-search-wrap{flex:1;min-width:0;max-width:500px;position:relative;display:flex;align-items:center;gap:0}
    .nav-search-input{width:100%;background:rgba(255,255,255,.06);border:1px solid #1e2235;border-radius:7px 0 0 7px;padding:6px 12px;font-size:12px;color:#e8eaf0;font-family:sans-serif;outline:none;transition:border-color .2s}
    .nav-search-input:focus{border-color:rgba(201,168,76,.45);background:rgba(255,255,255,.09)}
    .nav-search-input::placeholder{color:#9ba3c4}
    .nav-search-btn{background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.35);border-left:none;border-radius:0 7px 7px 0;padding:6px 10px;color:#C9A84C;cursor:pointer;font-size:13px;transition:background .2s;flex-shrink:0}
    .nav-search-btn:hover{background:rgba(201,168,76,.3)}
    .nav-link{font-size:11px;padding:5px 9px;border-radius:6px;border:1px solid var(--border);color:var(--silver);text-decoration:none;font-weight:600;letter-spacing:.04em;text-transform:uppercase;transition:all .2s;white-space:nowrap}
    .nav-link:hover{color:var(--text);border-color:var(--silver);background:rgba(255,255,255,.04);text-decoration:none}
    .nav-link--home{color:#A0C4FF;border-color:rgba(160,196,255,.3)}.nav-link--home:hover{background:rgba(160,196,255,.06);border-color:#A0C4FF}
    .nav-link--vault{color:var(--gold);border-color:rgba(201,168,76,.3)}.nav-link--vault:hover{background:rgba(201,168,76,.06);border-color:var(--gold)}
    .nav-link--compare{color:#a78bfa;border-color:rgba(167,139,250,.3)}.nav-link--compare:hover{background:rgba(167,139,250,.06);border-color:#a78bfa}
    .nav-link--market{color:#4ADE80;border-color:rgba(74,222,128,.3)}.nav-link--market:hover{background:rgba(74,222,128,.06);border-color:#4ADE80}
    .nav-link--shop{color:var(--gold);border-color:rgba(201,168,76,.3)}.nav-link--shop:hover{background:rgba(201,168,76,.06);border-color:var(--gold)}
    .nav-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.3)}.nav-link--blog:hover{background:rgba(126,203,161,.06);border-color:#7ECBA1}
    .nav-link--ev{color:#60A5FA;border-color:rgba(96,165,250,.3)}.nav-link--ev:hover{background:rgba(96,165,250,.06);border-color:#60A5FA}
    .nav-link--tracker{color:#FB923C;border-color:rgba(251,146,60,.3)}.nav-link--tracker:hover{background:rgba(251,146,60,.06);border-color:#FB923C}
    .nav-link--quiz{color:#F472B6;border-color:rgba(244,114,182,.3)}.nav-link--quiz:hover{background:rgba(244,114,182,.06);border-color:#F472B6}
    .nav-link--calendar{color:#F87171;border-color:rgba(248,113,113,.3)}.nav-link--calendar:hover{background:rgba(248,113,113,.06);border-color:#F87171}
    .nav-link--generators{color:#22D3EE;border-color:rgba(34,211,238,.3)}.nav-link--generators:hover{background:rgba(34,211,238,.06);border-color:#22D3EE}
    .nav-link--ebay{color:#4ADE80;border-color:rgba(74,222,128,.3);background:rgba(74,222,128,.05)}.nav-link--ebay:hover{background:rgba(74,222,128,.1);border-color:#4ADE80}
    .release-ticker{background:rgba(var(--accent-rgb),.06);border-bottom:1px solid rgba(var(--accent-rgb),.15);height:34px;display:flex;align-items:center;overflow:hidden;position:relative}
    .release-ticker::before,.release-ticker::after{content:'';position:absolute;top:0;bottom:0;width:50px;z-index:2;pointer-events:none}
    .release-ticker::before{left:0;background:linear-gradient(to right,var(--bg),transparent)}
    .release-ticker::after{right:0;background:linear-gradient(to left,var(--bg),transparent)}
    .ticker-label{font-size:9px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--accent);white-space:nowrap;padding:0 14px 0 18px;flex-shrink:0;z-index:3}
    .ticker-track{display:flex;animation:tickerScroll 40s linear infinite}
    .ticker-track:hover{animation-play-state:paused}
    @keyframes tickerScroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
    .ticker-item{display:inline-flex;align-items:center;gap:8px;padding:0 24px;font-size:11.5px;color:var(--silver);white-space:nowrap}
    .ticker-badge{font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;background:rgba(var(--accent-rgb),.15);color:var(--accent);letter-spacing:.06em}
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
    .carousel-card:hover{border-color:var(--accent);transform:translateY(-4px);box-shadow:0 8px 20px rgba(var(--accent-rgb),.12);text-decoration:none}
    .carousel-img-wrap{height:130px;display:flex;align-items:center;justify-content:center;margin-bottom:7px;overflow:hidden}
    .carousel-img-wrap img{max-height:130px;max-width:100%;object-fit:contain;border-radius:4px;transition:transform .3s}
    .carousel-card:hover .carousel-img-wrap img{transform:scale(1.05)}
    .card-placeholder{width:80px;height:110px;background:var(--bg3);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--text2)}
    .carousel-name{font-size:11px;color:var(--text);font-weight:600;line-height:1.3;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .carousel-rarity{font-size:10px;color:var(--text2);margin-bottom:2px}
    .carousel-price{font-size:13px;color:var(--accent);font-weight:700;margin-top:3px}
    .carousel-buy-row{margin-top:6px}
    .carousel-buy-btn{font-size:10px;font-weight:700;color:#000;background:var(--accent);padding:3px 8px;border-radius:4px;letter-spacing:.04em;display:inline-block}
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
    .set-tile:hover{border-color:var(--accent);background:rgba(var(--accent-rgb),.04);text-decoration:none;transform:translateX(2px)}
    .set-tile-name{flex:1;font-size:12.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}
    .set-tile-meta{font-size:10px;color:var(--text2);flex-shrink:0;white-space:nowrap}
    .new-badge{font-size:8px;font-weight:800;background:var(--accent);color:#000;border-radius:3px;padding:1px 5px;letter-spacing:.05em;margin-left:5px;vertical-align:middle}
    .sync-msg{color:var(--text2);font-size:14px;padding:20px}
    @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    .fade-up{animation:fadeUp .5s ease both}.fade-up-1{animation-delay:.08s}.fade-up-2{animation-delay:.16s}.fade-up-3{animation-delay:.24s}
    footer{border-top:1px solid var(--border);padding:28px 24px;text-align:center;font-size:12px;color:var(--text2);margin-top:40px;position:relative;z-index:1}
    footer a{color:var(--text2);margin:0 7px;text-decoration:none}footer a:hover{color:var(--text)}
    @media(max-width:600px){.nav-links{gap:2px}.nav-link{font-size:10px;padding:4px 7px}.hero{padding:36px 16px 24px}.quick-links{padding:0 12px}.wrap{padding:0 12px}.set-grid{grid-template-columns:1fr}}
  `;
}

export default async (req) => {
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=1800, s-maxage=3600'
  };

  const [setsResult, topCardsResult] = await Promise.allSettled([
    supabaseGet('vanguard_sets?order=release_date.desc&limit=400&select=id,name,slug,abbreviation,release_date,card_count'),
    supabaseGet('vanguard_cards?order=market_price.desc&market_price=gt.0.5&market_price=lt.200&image_url=not.is.null&limit=24&select=slug,name,image_url,market_price,price_aud,rarity,set_name,updated_at')
  ]);

  const sets     = setsResult.status     === 'fulfilled' ? setsResult.value     : [];
  const topCardsRaw = topCardsResult.status === 'fulfilled' ? topCardsResult.value : [];
  const SEALED_KEYWORDS = ['booster box','booster pack',' case','bundle','display','sealed product',
    'starter deck','starter set','trial deck','trial set','deck set',
    'box set','collection box','premium set','gift set','booster display'];
  const topCards = topCardsRaw.filter(c => {
    const n = (c.name||'').toLowerCase();
    return !SEALED_KEYWORDS.some(k => n.includes(k));
  });

  const lastUpdated = topCards.length && topCards[0].updated_at ? topCards[0].updated_at.slice(0,10) : null;
  const syncLabel   = lastUpdated ? `Prices updated ${lastUpdated}` : 'Prices updated daily';

  const tickerHTML = buildTickerHTML(CALENDAR_EVENTS);
  const azButtons  = buildAZButtons(sets);

  const carouselHTML = topCards.map(c => {
    const price = c.price_aud ? `AU$${parseFloat(c.price_aud).toFixed(0)}` : c.market_price ? `~AU$${(c.market_price*1.58).toFixed(0)}` : '';
    const ebay  = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(c.name+' cardfight vanguard card')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
    return `<a href="/cards/vanguard/${c.slug}" class="carousel-card">
      <div class="carousel-img-wrap"><img src="${esc(c.image_url)}" alt="${esc(c.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=card-placeholder>&#9876;</div>'"></div>
      <div class="carousel-name">${esc(c.name)}</div>
      ${c.rarity ? `<div class="carousel-rarity">${esc(c.rarity)}</div>` : ''}
      <div class="carousel-price">${price}</div>
      <div class="carousel-buy-row"><a href="${ebay}" target="_blank" rel="noopener" class="carousel-buy-btn" onclick="event.stopPropagation()">Buy eBay &#8599;</a></div>
    </a>`;
  }).join('');

  const setListHTML = sets.length ? sets.map(s => {
    const name      = s.name || '';
    const ch        = name.trim()[0] ? name.trim()[0].toUpperCase() : '';
    const letterKey = /[A-Z]/.test(ch) ? ch : '0-9';
    const year      = s.release_date ? s.release_date.slice(0,4) : '';
    const newBadge  = isNew(s.release_date) ? '<span class="new-badge">NEW</span>' : '';
    return `<a href="/cards/vanguard/sets/${encodeURIComponent(s.slug||s.id)}" class="set-tile" data-name="${esc(name.toLowerCase())}" data-letter="${letterKey}">
      <span class="set-tile-name">${esc(name)}${newBadge}</span>
      <span class="set-tile-meta">${year}${s.card_count ? ' &middot; '+s.card_count+' cards' : ''}</span>
    </a>`;
  }).join('') : '<div class="sync-msg">Sets loading -- check back after tonight&#39;s sync.</div>';

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Cardfight Vanguard Card Prices Australia | AUD Prices Updated Daily | C3</title>
  <meta name="description" content="Browse ${sets.length||'266'}+ Cardfight Vanguard sets. Live AUD card prices and eBay AU buy links updated daily. Australia's Cardfight Vanguard price guide.">
  <link rel="canonical" href="${CANONICAL}">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <meta property="og:title" content="Cardfight Vanguard Card Prices Australia | Cards on Cards on Cards">
  <meta property="og:description" content="${sets.length||'266'}+ Cardfight Vanguard sets with live AUD prices and eBay AU buy links.">
  <meta property="og:image" content="https://cardsoncardsoncards.com.au/c3-og-banner.png">
  <meta property="og:url" content="${CANONICAL}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <style>${css()}</style>
</head>
<body>
<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo" title="Cards on Cards on Cards"><img src="/c3logo.png" alt="C3 - Cards on Cards on Cards"></a>
    <div class="nav-search-wrap">
      <input class="nav-search-input" type="text" id="nav-q" placeholder="Search cards..." autocomplete="off" onkeydown="if(event.key==='Enter'){var v=this.value.trim();if(v)window.location='/search?q='+encodeURIComponent(v);}" >
      <button class="nav-search-btn" onclick="var v=document.getElementById('nav-q').value.trim();if(v)window.location='/search?q='+encodeURIComponent(v);">&#128269;</button>
    </div>
    <div class="nav-links">
      <a href="/cards" class="nav-link nav-link--active">Card Vault</a>
      <a href="/cards/vanguard" class="nav-link" style="color:#DC2626;border-color:#DC262680;background:#DC262614">Vanguard</a>
      <a href="/compare" class="nav-link nav-link--compare">Compare</a>
      <a href="/market" class="nav-link nav-link--market">Market</a>
      <a href="/tools" class="nav-link nav-link--tools">Tools</a>
      <a href="/play" class="nav-link nav-link--play">Play</a>
      <a href="/blog" class="nav-link nav-link--blog">Blog</a>
      <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=C3Nav&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="nav-link nav-link--ebay">Shop eBay &#8599;</a>
    </div>
  </div>
</nav>

${tickerHTML}

<div class="hero fade-up">
  <div class="hero-eyebrow">Card Vault -- Cardfight Vanguard</div>
  <h1>Cardfight Vanguard Card Prices <span>in Australia</span></h1>
  <p class="hero-sub">Cardfight Vanguard card prices in AUD. Browse by set or search by card name. eBay AU buy links updated daily.</p>
  <div class="stat-bar">
    <div class="stat-item"><div class="stat-num">${sets.length||'266'}</div><div class="stat-label">Sets</div></div>
    <div class="stat-item"><div class="stat-num">24k+</div><div class="stat-label">Cards</div></div>
    <div class="stat-item"><div class="stat-num">AU$</div><div class="stat-label">Live Prices</div></div>
    <div class="stat-item"><div class="stat-num">Daily</div><div class="stat-label">Updates</div></div>
  </div>
  <p style="font-size:11px;color:var(--text2);margin-top:-20px">${syncLabel}</p>
</div>

<div class="quick-links fade-up fade-up-1">
  <a href="https://www.ebay.com.au/sch/i.html?_nkw=cardfight+vanguard+cards&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=5339146789&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="quick-link" style="background:var(--accent);color:#000">&#128722; Shop Cardfight Vanguard on eBay &#8599;</a>
  <a href="/tracker.html" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128203; Free Tracker</a>
  <a href="/ev-calculator.html" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128202; EV Calculator &#8594;</a>
  <a href="/blog/cardfight-vanguard-beginners-guide-australia/" class="quick-link" style="background:rgba(var(--accent-rgb),.08);border-color:rgba(var(--accent-rgb),.3);color:var(--accent)">&#128214; Beginners Guide &#8594;</a>
  <a href="/blog/best-vanguard-booster-boxes-australia/" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128230; Best Vanguard Boxes &#8594;</a>
</div>

${topCards.length ? `<section class="carousel-section fade-up fade-up-2">
  <div class="carousel-label">Most Valuable</div>
  <div class="carousel-title">Top Cardfight Vanguard Cards by Price (AUD)</div>
  <div class="carousel-track-wrap">
    <div class="carousel-track">${carouselHTML}${carouselHTML}</div>
  </div>
</section>` : ''}

<div class="wrap">
  <div class="section fade-up fade-up-2">
    <div class="section-header"><div class="section-title">Search Cardfight Vanguard Cards</div></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <input type="text" id="card-search" placeholder="${SEARCH_PH}" onkeyup="if(event.key==='Enter')searchCard()">
      <button class="btn btn-primary" onclick="searchCard()">Search</button>
    </div>
    <div id="search-results"></div>
  </div>

  <div class="section fade-up fade-up-3">
    <div class="section-header">
      <div class="section-title">Browse ${sets.length||'266'} Sets</div>
      <div class="section-hint">Click any set to view cards and prices</div>
    </div>
    <div class="az-row">${azButtons}</div>
    <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">
  <button class="vg-type-btn filter-btn active" data-type="All" onclick="filterVGType('All')">All</button>
  <button class="vg-type-btn filter-btn" data-type="Main Booster" onclick="filterVGType('Main Booster')">Main Boosters</button>
  <button class="vg-type-btn filter-btn" data-type="Special Series" onclick="filterVGType('Special Series')">Special Series</button>
  <button class="vg-type-btn filter-btn" data-type="Lyrical Monasterio" onclick="filterVGType('Lyrical Monasterio')">Lyrical Monasterio</button>
  <button class="vg-type-btn filter-btn" data-type="Trial Deck" onclick="filterVGType('Trial Deck')">Trial Decks</button>
  <button class="vg-type-btn filter-btn" data-type="Collaboration" onclick="filterVGType('Collaboration')">Collaborations</button>
</div>
    <input type="text" id="set-search" placeholder="${SET_PH}" oninput="filterSets(this.value)" style="margin-bottom:12px">
    <div id="set-list" class="set-grid">${setListHTML}</div>
  </div>

  <div style="background:rgba(var(--accent-rgb),.04);border:1px solid rgba(var(--accent-rgb),.15);border-radius:var(--radius);padding:22px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px">
    <div>
      <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:5px">Track Your Cardfight Vanguard Collection</div>
      <p style="font-size:13px;color:var(--text2)">Free Google Sheets tracker. Know what you own and what it is worth in AUD.</p>
    </div>
    <a href="/tracker.html" class="btn btn-primary">Get Free Tracker &#8594;</a>
  </div>
</div>

<footer>
  <div style="margin-bottom:10px">
    <a href="/">Home</a><a href="/cards">Card Vault</a><a href="/cards/vanguard">Cardfight Vanguard</a>
    <a href="/cards/mtg">MTG</a><a href="/cards/pokemon">Pokemon</a><a href="/cards/yugioh">Yu-Gi-Oh</a>
    <a href="/blog">Blog</a><a href="/tracker.html">Tracker</a><a href="/calendar">Calendar</a>
  </div>
  <p>&#169; 2026 Cards on Cards on Cards &middot; cardsoncardsoncards.com.au</p>
  <p style="margin-top:6px;font-size:11px;opacity:.5">Affiliate disclosure: this site earns commissions from eBay AU and Amazon AU purchases made through affiliate links at no extra cost to you. Not affiliated with Bushiroad. USD prices converted to AUD at approximately 1.58.</p>
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
  var vgType = typeof vgCurrentType !== 'undefined' ? vgCurrentType : 'All';
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
    const res = await fetch('/api/compare-search?q=' + encodeURIComponent(q) + '&game=vanguard&limit=24');
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();
    const cards = data.results || data.cards || (Array.isArray(data) ? data : []);
    if (!cards.length) { results.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:12px 0">No cards found. Try a different name.</div>'; return; }
    results.innerHTML = cards.map(c => {
      const img = c.image_url || c.image || '';
      const price = c.price_aud ? 'AU$'+parseFloat(c.price_aud).toFixed(0) : c.market_price ? '~AU$'+(c.market_price*1.58).toFixed(0) : c.priceAud ? 'AU$'+parseFloat(c.priceAud).toFixed(0) : '';
      const safeName = (c.name||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      return '<a href="/cards/vanguard/'+c.slug+'" style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center;display:block;text-decoration:none;transition:border-color .2s" onmouseover="this.style.borderColor=\'var(--accent)\'" onmouseout="this.style.borderColor=\'var(--border)\'">'
        +(img ? '<img src="'+img.replace(/"/g,'')+'" alt="'+safeName+'" style="width:100%;border-radius:6px;max-height:130px;object-fit:contain" loading="lazy">' : '')
        +'<div style="font-size:11px;color:var(--text);margin-top:4px;line-height:1.3">'+safeName+'</div>'
        +(c.rarity ? '<div style="font-size:10px;color:var(--text2)">'+(c.rarity||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>' : '')
        +'<div style="font-size:12px;color:var(--accent);font-weight:700">'+price+'</div>'
        +'</a>';
    }).join('');
  } catch(e) {
    results.innerHTML = '<div style="color:#f88;font-size:13px">Search error. Please try again.</div>';
  }
}
</script>
<script>
function vgTypeOf(setName) {
  var n = (setName||'').toUpperCase();
  if (n.indexOf('DZ-LBT') > -1 || n.indexOf('LYRICAL') > -1) return 'Lyrical Monasterio';
  if (n.indexOf('DZ-TB') > -1 || n.indexOf('TOUKEN') > -1 || n.indexOf('BUDDYFIGHT') > -1) return 'Collaboration';
  if (n.indexOf('DZ-TD') > -1 || n.indexOf('START DECK') > -1 || n.indexOf('TRIAL DECK') > -1) return 'Trial Deck';
  if (n.indexOf('DZ-SS') > -1 || n.indexOf('SPECIAL SERIES') > -1 || n.indexOf('FESTIVAL') > -1 || n.indexOf('MASTER DECKSET') > -1 || n.indexOf('STRIDE DECKSET') > -1) return 'Special Series';
  if (n.indexOf('DZ-BT') > -1 || n.indexOf('BOOSTER') > -1) return 'Main Booster';
  return 'Other';
}
function filterVGByType(type) {
  document.querySelectorAll('.set-tile').forEach(function(el) {
    var name = el.dataset.name || el.textContent || '';
    el.style.display = (type === 'All' || vgTypeOf(name) === type) ? '' : 'none';
  });
  document.querySelectorAll('.vg-type-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.type === type);
  });
}
</script>

<!-- REPORT BUG WIDGET -->
<style>
  .bug-float{position:fixed;bottom:20px;right:20px;z-index:9999}
  .bug-btn{display:flex;align-items:center;gap:6px;background:rgba(15,17,25,.95);border:1px solid rgba(201,168,76,.3);color:#C9A84C;padding:8px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;font-family:sans-serif;backdrop-filter:blur(12px);transition:all .2s;text-decoration:none;letter-spacing:.03em;box-shadow:0 4px 16px rgba(0,0,0,.4)}
  .bug-btn:hover{border-color:#C9A84C;background:rgba(201,168,76,.12);color:#E8C86A;text-decoration:none;transform:translateY(-2px)}
  .bug-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10000;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
  .bug-modal.open{display:flex}
  .bug-box{background:#111420;border:1px solid #252840;border-radius:14px;padding:28px;width:100%;max-width:420px;margin:0 16px;position:relative}
  .bug-box h3{font-family:'Cinzel',serif;font-size:17px;font-weight:700;color:#F0F2FF;margin-bottom:4px}
  .bug-box p{font-size:12px;color:#9ba3c4;margin-bottom:18px}
  .bug-close{position:absolute;top:12px;right:14px;background:none;border:none;color:#9ba3c4;font-size:18px;cursor:pointer;line-height:1;padding:4px}
  .bug-form select,.bug-form textarea{width:100%;background:rgba(255,255,255,.05);border:1px solid #252840;border-radius:8px;color:#F0F2FF;font-family:'DM Sans',sans-serif;font-size:13px;padding:9px 12px;margin-bottom:12px;outline:none;transition:border-color .2s}
  .bug-form select:focus,.bug-form textarea:focus{border-color:rgba(201,168,76,.5)}
  .bug-form textarea{resize:vertical;min-height:80px;max-height:160px}
  .bug-form select option{background:#e8eaf0;color:#111420}.bug-form select{background:#e8eaf0;color:#111420}
  .bug-hidden{display:none}
  .bug-submit{width:100%;padding:10px;background:#C9A84C;color:#0A0C14;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:opacity .2s}
  .bug-submit:hover{opacity:.85}
  .bug-submit:disabled{opacity:.5;cursor:not-allowed}
  .bug-thanks{display:none;text-align:center;padding:12px 0}
  .bug-thanks p{color:#4ADE80;font-size:14px;font-weight:600}
</style>
<div class="bug-float">
  <a class="bug-btn" onclick="document.getElementById('bugModal').classList.add('open');return false" href="#">&#x1F41B; Report a Bug</a>
</div>
<div class="bug-modal" id="bugModal" onclick="if(event.target===this)this.classList.remove('open')">
  <div class="bug-box">
    <button class="bug-close" onclick="document.getElementById('bugModal').classList.remove('open')">&#x2715;</button>
    <h3>&#x1F41B; Report a Bug</h3>
    <p>Spotted something wrong? Takes 20 seconds.</p>
    <form class="bug-form" id="bugReportForm" name="bug-report" method="POST" data-netlify="true" netlify-honeypot="bot-field">
      <input type="hidden" name="form-name" value="bug-report">
      <input class="bug-hidden" name="bot-field">
      <input type="hidden" name="page_url" id="bugPageUrl">
      <select name="issue_type" required>
        <option value="" disabled selected>What type of issue?</option>
        <option value="wrong_price">Wrong price</option>
        <option value="missing_card">Missing card or set</option>
        <option value="broken_link">Broken link</option>
        <option value="other">Other</option>
      </select>
      <textarea name="description" placeholder="Describe the issue briefly (e.g. Charizard ex showing wrong price)" maxlength="200" required></textarea>
      <div class="bug-thanks" id="bugThanks"><p>&#x2713; Thanks, we will look into it.</p></div>
      <button type="submit" class="bug-submit" id="bugSubmit">Submit Report</button>
    </form>
  </div>
</div>
<script>
(function(){
  const urlInput = document.getElementById('bugPageUrl');
  if(urlInput) urlInput.value = window.location.href;
  const form = document.getElementById('bugReportForm');
  if(!form) return;
  form.addEventListener('submit', function(e){
    e.preventDefault();
    let btn = document.getElementById('bugSubmit');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    const data = new FormData(form);
    fetch('/', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body: new URLSearchParams(data).toString()})
      .then(function(){
        document.getElementById('bugThanks').style.display='block';
        form.querySelector('select').style.display='none';
        form.querySelector('textarea').style.display='none';
        btn.style.display='none';
        setTimeout(function(){document.getElementById('bugModal').classList.remove('open');},2000);
      })
      .catch(function(){btn.disabled=false;btn.textContent='Submit Report';});
  });
})();
</script>
</body>
</html>`;

  return new Response(html, { status: 200, headers });
};

export const config = { path: '/cards/vanguard' };
