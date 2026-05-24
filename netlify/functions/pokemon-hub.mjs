// netlify/functions/pokemon-hub.mjs
// Serves /cards/pokemon
// Rebuilt 24 May 2026 -- era dots, rotation warning, market pulse, hidden sets, 24-card carousel, guides

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID        = '5339146789';

const ACCENT     = '#FFCC00';
const ACCENT_RGB = '255,204,0';
const CANONICAL  = 'https://cardsoncardsoncards.com.au/cards/pokemon';

// Pokemon eras: used for era dots, legend and filter buttons
const ERAS = [
  { key: 'sv',  label: 'Scarlet and Violet', years: [2023,9999], color: '#4ADE80' },
  { key: 'ss',  label: 'Sword and Shield',   years: [2020,2022], color: '#60A5FA' },
  { key: 'sm',  label: 'Sun and Moon',       years: [2017,2019], color: '#A78BFA' },
  { key: 'xy',  label: 'XY',                 years: [2013,2016], color: '#FB923C' },
  { key: 'bw',  label: 'Black and White',    years: [2011,2012], color: '#94A3B8' },
  { key: 'classic', label: 'Classic',        years: [0,2010],    color: '#C9A84C' },
];

function eraForYear(year) {
  if (!year) return ERAS[5];
  const y = parseInt(year,10);
  return ERAS.find(e => y >= e.years[0] && y <= e.years[1]) || ERAS[5];
}

// Rotation warning -- sets rotating out of Standard next cycle
const ROTATING_SETS = ['Scarlet and Violet Base Set','Paldea Evolved','Obsidian Flames'];
const ROTATION_NOTE = 'Expected rotation late 2026. Sell rotation-vulnerable cards before prices drop.';

// Upcoming Pokemon events -- past events filtered at runtime
const CALENDAR_EVENTS = [
  { date: '2026-07-17', name: 'Mega Evolution: Pitch Black', type: 'Set Release' },
  { date: '2026-08-01', name: 'Pokemon World Championships', type: 'Tournament' },
  { date: '2026-09-01', name: 'Mega Evolution: Ascended Heroes', type: 'Set Release' },
];

function esc(str) {
  return (str==null?'':String(str))
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
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
  } catch(e) { clearTimeout(timer); return []; }
}

export default async (req) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=1800, s-maxage=3600' };
  const today = new Date(); today.setHours(0,0,0,0);
  const cutoff45 = new Date(Date.now()-45*864e5).toISOString().slice(0,10);

  const [setsR, topCardsR, gainersR, losersR] = await Promise.allSettled([
    supabaseGet('pokemon_sets?order=release_date.desc&limit=400&select=id,name,slug,release_date,card_count'),
    supabaseGet('pokemon_cards?order=price_aud.desc&price_aud=gt.0&image_url=not.is.null&rarity=not.is.null&rarity=neq.None&limit=24&select=slug,name,image_url,price_aud,rarity,set_name'),
    supabaseGet('pokemon_cards?order=price_change_7d.desc&price_change_7d=gt.5&price_aud=gt.5&image_url=not.is.null&price_change_7d=lt.5000&limit=5&select=slug,name,image_url,price_aud,price_change_7d,set_name'),
    supabaseGet('pokemon_cards?order=price_change_7d.asc&price_change_7d=lt.-5&price_aud=gt.5&image_url=not.is.null&limit=5&select=slug,name,image_url,price_aud,price_change_7d,set_name'),
  ]);

  const sets    = setsR.status==='fulfilled'    ? setsR.value    : [];
  const topCards= topCardsR.status==='fulfilled' ? topCardsR.value : [];
  const gainers = gainersR.status==='fulfilled'  ? gainersR.value : [];
  const losers  = losersR.status==='fulfilled'   ? losersR.value  : [];

  // Last updated label
  const lastUpdated = topCards.length && topCards[0] ? (topCards[0].updated_at||'').slice(0,10) : '';
  const syncLabel = lastUpdated ? `Prices last updated: ${lastUpdated}` : 'Prices updated daily';

  // Ticker -- future events only
  const upcomingEvents = CALENDAR_EVENTS.filter(e => new Date(e.date+'T00:00:00') >= today);
  const tickerItems = [...upcomingEvents,...upcomingEvents].map(e => {
    const days = Math.round((new Date(e.date+'T00:00:00')-today)/86400000);
    const label = days===0?'TODAY':days===1?'TOMORROW':`IN ${days} DAYS`;
    return `<span class="ticker-item"><span class="ticker-badge">${label}</span><strong>${esc(e.name)}</strong> &middot; ${esc(e.type)}</span>`;
  }).join('');

  // Top cards carousel -- 24 cards doubled
  const carouselHTML = topCards.map(c => {
    const price = c.price_aud ? 'AU$'+parseFloat(c.price_aud).toFixed(0) : '';
    const ebayUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent((c.name||'pokemon card')+' pokemon')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
    return `<a href="/cards/pokemon/${esc(c.slug)}" class="carousel-card">
      <div class="carousel-img-wrap">
        <img src="${esc(c.image_url)}" alt="${esc(c.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=card-placeholder>&#128248;</div>'">
      </div>
      <div class="carousel-name">${esc(c.name)}</div>
      ${c.rarity?`<div class="carousel-rarity">${esc(c.rarity)}</div>`:''}
      <div class="carousel-price">${price}</div>
      <div class="carousel-buy-row"><a href="${ebayUrl}" target="_blank" rel="noopener" class="carousel-buy-btn" onclick="event.stopPropagation()">Buy eBay &#8599;</a></div>
    </a>`;
  }).join('');

  // Mover card HTML
  function moverCard(c, isGainer) {
    const arrow = isGainer ? '&#8593;' : '&#8595;';
    const col   = isGainer ? '#4ADE80' : '#f87171';
    const pct   = Math.abs(parseFloat(c.price_change_7d||0)).toFixed(1);
    const price = c.price_aud ? 'AU$'+parseFloat(c.price_aud).toFixed(0) : '';
    return `<a href="/cards/pokemon/${esc(c.slug)}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;text-decoration:none;transition:border-color .2s" onmouseover="this.style.borderColor='${ACCENT}'" onmouseout="this.style.borderColor='var(--border)'">
      ${c.image_url?`<img src="${esc(c.image_url)}" alt="${esc(c.name)}" loading="lazy" style="width:40px;height:56px;object-fit:cover;border-radius:4px;flex-shrink:0">`:'<div style="width:40px;height:56px;background:var(--bg3);border-radius:4px;flex-shrink:0"></div>'}
      <div style="min-width:0;flex:1">
        <div style="font-size:11.5px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.name)}</div>
        <div style="font-size:10px;color:var(--text2)">${esc(c.set_name||'')}</div>
        <div style="font-size:11px;color:${ACCENT};font-weight:700">${price}</div>
      </div>
      <div style="font-size:12px;font-weight:700;color:${col};flex-shrink:0">${arrow}${pct}%</div>
    </a>`;
  }

  const gainerHTML = gainers.map(c => moverCard(c,true)).join('');
  const loserHTML  = losers.map(c => moverCard(c,false)).join('');
  const hasMovers  = gainers.length>0 || losers.length>0;

  // Set list with era dots
  const setListHTML = sets.length ? sets.map(s => {
    const name = s.name||'';
    const year = s.release_date ? parseInt(s.release_date.slice(0,4),10) : 0;
    const era  = eraForYear(year);
    const ch   = name.trim()[0] ? name.trim()[0].toUpperCase() : '';
    const lk   = /[A-Z]/.test(ch) ? ch : '0-9';
    const isNew = s.release_date && s.release_date >= cutoff45;
    const newBadge = isNew ? '<span class="new-badge">NEW</span>' : '';
    return `<a href="/cards/pokemon/sets/${esc(s.slug||s.id)}" class="set-tile" data-name="${esc(name.toLowerCase())}" data-letter="${lk}" data-era="${era.key}" style="border-left:3px solid ${era.color}">
      <span class="set-tile-name">${esc(name)}${newBadge}</span>
      <span class="set-tile-meta">${year||''}${s.card_count?' &middot; '+s.card_count+' cards':''}</span>
    </a>`;
  }).join('') : '<div class="sync-msg">Sets loading -- check back after tonight\'s sync.</div>';

  // Era filter buttons
  const eraButtons = ERAS.map(e =>
    `<button class="az-btn era-btn" data-era="${e.key}" onclick="filterEra('${e.key}',this)" style="border-color:${e.color}40;color:${e.color}">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${e.color};margin-right:5px;vertical-align:middle"></span>${e.label}
    </button>`
  ).join('');

  // A-Z buttons dynamically from sets
  const letters = new Set();
  sets.forEach(s => {
    const ch = (s.name||'').trim()[0];
    if (ch) letters.add(/[A-Z]/.test(ch.toUpperCase()) ? ch.toUpperCase() : '0-9');
  });
  const azLetters = ['0-9',...[...letters].filter(l=>l!=='0-9').sort()];
  const azButtons = azLetters.map(l => `<button class="az-btn" onclick="filterAZ('${l}',this)">${l}</button>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Pokemon Card Prices Australia | AUD Prices Updated Daily | C3</title>
  <meta name="description" content="Browse ${sets.length||'216'}+ Pokemon TCG sets. Live AUD card prices, eBay AU buy links. Australia's most complete Pokemon price guide, updated daily.">
  <link rel="canonical" href="${CANONICAL}">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <meta property="og:title" content="Pokemon Card Prices Australia | Cards on Cards on Cards">
  <meta property="og:description" content="${sets.length||'216'}+ sets, 130k+ cards. Live AUD prices and eBay AU buy links updated daily.">
  <meta property="og:image" content="https://cardsoncardsoncards.com.au/c3ogbanner.png">
  <meta property="og:url" content="${CANONICAL}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <style>
    :root{--bg:#0A0C14;--bg2:#111420;--bg3:#181d2e;--gold:#C9A84C;--accent:${ACCENT};--accent-rgb:${ACCENT_RGB};--text:#e8eaf0;--text2:#9ba3c4;--border:#242840;--radius:12px;--silver:#A0A8C0}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6;min-height:100vh;overflow-x:hidden}
    body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(ellipse 70% 40% at 50% 0%,rgba(${ACCENT_RGB},.05),transparent 60%)}
    a{color:inherit;text-decoration:none}a:hover{text-decoration:none}
    nav{background:rgba(10,12,20,.97);border-bottom:1px solid var(--border);padding:10px 0;position:sticky;top:0;z-index:100;backdrop-filter:blur(20px)}
    .nav-inner{max-width:1200px;margin:0 auto;padding:0 20px;display:flex;align-items:center;gap:8px}
    .nav-logo{display:flex;align-items:center;flex-shrink:0}.nav-logo img{height:34px;width:34px;border-radius:6px;object-fit:cover}
    .nav-search-wrap{flex:1;min-width:0;max-width:400px;display:flex}
    .nav-search-input{flex:1;max-width:300px;background:rgba(255,255,255,.06);border:1px solid #1e2235;border-radius:7px 0 0 7px;padding:6px 12px;font-size:12px;color:#e8eaf0;font-family:sans-serif;outline:none}
    .nav-search-btn{background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.35);border-left:none;border-radius:0 7px 7px 0;padding:6px 10px;color:#C9A84C;cursor:pointer;font-size:13px;flex-shrink:0}
    .nav-links{display:flex;gap:3px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;flex-shrink:0}
    .nav-links::-webkit-scrollbar{display:none}
    .nav-link{font-size:11px;padding:5px 9px;border-radius:6px;border:1px solid var(--border);color:var(--silver);font-weight:600;letter-spacing:.04em;text-transform:uppercase;transition:all .2s;white-space:nowrap;text-decoration:none}
    .nav-link:hover{color:var(--text);border-color:var(--silver);background:rgba(255,255,255,.04)}
    .nav-link--vault{color:var(--gold);border-color:rgba(201,168,76,.3)}.nav-link--vault:hover{background:rgba(201,168,76,.06);border-color:var(--gold)}
    .nav-link--active{color:var(--accent);border-color:rgba(${ACCENT_RGB},.4);background:rgba(${ACCENT_RGB},.07)}
    .nav-link--compare{color:#a78bfa;border-color:rgba(167,139,250,.3)}.nav-link--compare:hover{background:rgba(167,139,250,.06);border-color:#a78bfa}
    .nav-link--market{color:#4ADE80;border-color:rgba(74,222,128,.3)}.nav-link--market:hover{background:rgba(74,222,128,.06);border-color:#4ADE80}
    .nav-link--tools{color:#60A5FA;border-color:rgba(96,165,250,.3)}.nav-link--tools:hover{background:rgba(96,165,250,.06);border-color:#60A5FA}
    .nav-link--play{color:#F472B6;border-color:rgba(244,114,182,.3)}.nav-link--play:hover{background:rgba(244,114,182,.06);border-color:#F472B6}
    .nav-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.3)}.nav-link--blog:hover{background:rgba(126,203,161,.06);border-color:#7ECBA1}
    .nav-link--ebay{color:#4ADE80;border-color:rgba(74,222,128,.3);background:rgba(74,222,128,.05)}.nav-link--ebay:hover{background:rgba(74,222,128,.1);border-color:#4ADE80}
    .release-ticker{background:rgba(${ACCENT_RGB},.06);border-bottom:1px solid rgba(${ACCENT_RGB},.15);height:34px;display:flex;align-items:center;overflow:hidden;position:relative}
    .release-ticker::before,.release-ticker::after{content:'';position:absolute;top:0;bottom:0;width:50px;z-index:2;pointer-events:none}
    .release-ticker::before{left:0;background:linear-gradient(to right,var(--bg),transparent)}
    .release-ticker::after{right:0;background:linear-gradient(to left,var(--bg),transparent)}
    .ticker-label{font-size:9px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--accent);white-space:nowrap;padding:0 14px 0 18px;flex-shrink:0;z-index:3}
    .ticker-track{display:flex;animation:tickerScroll 50s linear infinite}
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
    .rotation-strip{display:flex;align-items:flex-start;gap:12px;background:rgba(251,146,60,.06);border:1px solid rgba(251,146,60,.2);border-radius:10px;padding:14px 16px;margin-bottom:20px}
    .carousel-section{position:relative;z-index:1;margin-bottom:28px}
    .carousel-label{font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);margin-bottom:8px;padding:0 24px}
    .carousel-title{font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:var(--text);margin-bottom:16px;padding:0 24px}
    .carousel-source{font-size:11px;color:var(--text2);padding:6px 24px 0;opacity:.65}
    .carousel-track-wrap{overflow:hidden;position:relative}
    .carousel-track-wrap::before,.carousel-track-wrap::after{content:'';position:absolute;top:0;bottom:0;width:60px;z-index:2;pointer-events:none}
    .carousel-track-wrap::before{left:0;background:linear-gradient(to right,var(--bg),transparent)}
    .carousel-track-wrap::after{right:0;background:linear-gradient(to left,var(--bg),transparent)}
    .carousel-track{display:flex;gap:12px;padding:4px 24px 12px;animation:scrollLeft 50s linear infinite}
    .carousel-track:hover{animation-play-state:paused}
    @keyframes scrollLeft{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
    .carousel-card{flex-shrink:0;width:155px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center;text-decoration:none;transition:all .25s;display:block}
    .carousel-card:hover{border-color:var(--accent);transform:translateY(-4px);box-shadow:0 8px 20px rgba(${ACCENT_RGB},.12);text-decoration:none}
    .carousel-img-wrap{height:130px;display:flex;align-items:center;justify-content:center;margin-bottom:7px;overflow:hidden}
    .carousel-img-wrap img{max-height:130px;max-width:100%;object-fit:contain;border-radius:4px;transition:transform .3s}
    .carousel-card:hover .carousel-img-wrap img{transform:scale(1.05)}
    .card-placeholder{width:80px;height:110px;background:var(--bg3);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--text2)}
    .carousel-name{font-size:11px;color:var(--text);font-weight:600;line-height:1.3;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .carousel-rarity{font-size:10px;color:var(--text2);margin-bottom:2px}
    .carousel-price{font-size:13px;color:var(--accent);font-weight:700;margin-top:3px}
    .carousel-buy-row{margin-top:6px}
    .carousel-buy-btn{font-size:10px;font-weight:700;color:#000;background:var(--accent);padding:3px 8px;border-radius:4px;letter-spacing:.04em;display:inline-block;text-decoration:none}
    .wrap{max-width:1200px;margin:0 auto;padding:0 24px;position:relative;z-index:1}
    .section{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:22px;margin-bottom:20px}
    .section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px}
    .section-title{font-size:17px;font-weight:700;color:var(--text)}
    .section-hint{font-size:12px;color:var(--text2)}
    input[type=text]{background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:9px 14px;border-radius:8px;font-size:14px;font-family:'DM Sans',sans-serif;width:100%;max-width:500px;transition:border-color .2s}
    input[type=text]::placeholder{color:var(--text2)}
    input[type=text]:focus{outline:none;border-color:var(--accent)}
    .az-row{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px}
    .az-btn{padding:5px 9px;border-radius:6px;font-size:11.5px;font-weight:700;cursor:pointer;border:1px solid var(--border);background:var(--bg3);color:var(--text2);font-family:'DM Sans',sans-serif;transition:all .2s;letter-spacing:.04em}
    .az-btn:hover{border-color:var(--accent);color:var(--accent)}
    .az-btn--active{background:var(--accent);color:#000;border-color:var(--accent)}
    .era-btn.az-btn--active{background:transparent;font-weight:800}
    .set-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:5px;margin-top:8px}
    .set-tile{display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 12px;text-decoration:none;transition:all .2s;min-width:0}
    .set-tile:hover{border-color:var(--accent);background:rgba(${ACCENT_RGB},.04);text-decoration:none;transform:translateX(2px)}
    .set-tile-name{flex:1;font-size:12.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}
    .set-tile-meta{font-size:10px;color:var(--text2);flex-shrink:0;white-space:nowrap}
    .new-badge{font-size:8px;font-weight:800;background:var(--accent);color:#000;border-radius:3px;padding:1px 5px;letter-spacing:.05em;margin-left:5px;vertical-align:middle}
    .era-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:middle}
    .sync-msg{color:var(--text2);font-size:14px;padding:20px}
    .movers-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:32px}
    .movers-col-title{font-size:13px;font-weight:700;color:var(--text2);margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em}
    .movers-cards{display:flex;flex-direction:column;gap:6px}
    .guides-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-bottom:48px}
    .guide-card{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;color:var(--text);display:block;text-decoration:none;transition:all .2s}
    .guide-card:hover{border-color:var(--accent);background:rgba(${ACCENT_RGB},.04);text-decoration:none}
    .guide-title{font-weight:700;margin-bottom:4px;color:var(--accent)}
    .guide-desc{font-size:13px;color:var(--text2)}
    @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    @keyframes shimmer{0%,100%{opacity:1}50%{opacity:.45}}
    .fade-up{animation:fadeUp .5s ease both}.fade-up-1{animation-delay:.08s}.fade-up-2{animation-delay:.16s}.fade-up-3{animation-delay:.24s}
    footer{border-top:1px solid var(--border);padding:28px 24px;text-align:center;font-size:12px;color:var(--text2);margin-top:40px;position:relative;z-index:1}
    footer a{color:var(--text2);margin:0 7px;text-decoration:none}footer a:hover{color:var(--text)}
    @media(max-width:600px){
      .nav-links{gap:2px}.nav-link{font-size:10px;padding:4px 7px}
      .hero{padding:36px 16px 24px}.quick-links{padding:0 12px}.wrap{padding:0 12px}
      .set-grid{grid-template-columns:1fr}.movers-grid{grid-template-columns:1fr}.guides-grid{grid-template-columns:1fr}
    }
  </style>
</head>
<body>
<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo" title="Cards on Cards on Cards"><img src="/c3logo.png" alt="C3 - Cards on Cards on Cards"></a>
    <div class="nav-search-wrap">
      <input class="nav-search-input" type="text" id="nav-q" placeholder="Search cards..." autocomplete="off" onkeydown="if(event.key==='Enter'){var v=this.value.trim();if(v)window.location='/search?q='+encodeURIComponent(v);}">
      <button class="nav-search-btn" onclick="var v=document.getElementById('nav-q').value.trim();if(v)window.location='/search?q='+encodeURIComponent(v);">&#128269;</button>
    </div>
    <div class="nav-links">
      <a href="/cards" class="nav-link nav-link--vault">Card Vault</a>
      <a href="/cards/pokemon" class="nav-link nav-link--active">Pokemon</a>
      <a href="/compare" class="nav-link nav-link--compare">Compare</a>
      <a href="/market" class="nav-link nav-link--market">Market</a>
      <a href="/tools" class="nav-link nav-link--tools">Tools</a>
      <a href="/play" class="nav-link nav-link--play">Play</a>
      <a href="/blog" class="nav-link nav-link--blog">Blog</a>
      <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=C3Nav&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="nav-link nav-link--ebay">Shop eBay &#8599;</a>
    </div>
  </div>
</nav>

${upcomingEvents.length ? `<div class="release-ticker">
  <span class="ticker-label">&#128248; Pokemon TCG</span>
  <div class="ticker-track">${tickerItems}</div>
</div>` : ''}

<div class="hero fade-up">
  <div class="hero-eyebrow">Card Vault &middot; Pokemon TCG</div>
  <h1>Pokemon Card Prices <span>in Australia</span></h1>
  <p class="hero-sub">Pokemon TCG card prices in AUD. Browse by set or search by card name. eBay AU buy links updated daily.</p>
  <div class="stat-bar">
    <div class="stat-item"><div class="stat-num">${sets.length||'216'}</div><div class="stat-label">Sets</div></div>
    <div class="stat-item"><div class="stat-num">130K+</div><div class="stat-label">Cards</div></div>
    <div class="stat-item"><div class="stat-num">AU$</div><div class="stat-label">Live Prices</div></div>
    <div class="stat-item"><div class="stat-num">Daily</div><div class="stat-label">Updates</div></div>
  </div>
</div>

<div class="quick-links fade-up fade-up-1">
  <a href="https://www.ebay.com.au/sch/i.html?_nkw=pokemon+cards&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="quick-link" style="background:linear-gradient(135deg,#b89800,${ACCENT});color:#000">&#128722; Shop Pokemon on eBay &#8599;</a>
  <a href="/tracker.html" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128203; Free Tracker</a>
  <a href="/ev-calculator.html" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128202; EV Calculator &#8594;</a>
  <a href="/compare" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128221; Compare Cards</a>
  <a href="/blog/best-pokemon-booster-boxes-australia/" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128230; Best Booster Boxes &#8594;</a>
  <a href="/blog/pokemon-tcg-beginners-guide-australia/" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128214; Beginners Guide &#8594;</a>
  <a href="/blog/are-pokemon-booster-boxes-investment-australia/" class="quick-link" style="background:rgba(${ACCENT_RGB},.08);border-color:rgba(${ACCENT_RGB},.3);color:var(--accent)">&#128200; Are Pokemon Cards an Investment? &#8594;</a>
  <a href="/quizzes/pokemon-era" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#127919; Pokemon Era Quiz &#8594;</a>
  <a href="/quizzes/which-tcg-extended" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#127919; Which TCG Should I Play? &#8594;</a>
</div>

<div class="wrap">
  <!-- Rotation Warning -->
  <div class="rotation-strip fade-up fade-up-1">
    <span style="font-size:18px;flex-shrink:0;margin-top:2px">&#9888;&#65039;</span>
    <div>
      <div style="font-size:13px;font-weight:700;color:#FB923C;margin-bottom:3px">Standard Rotation Approaching</div>
      <div style="font-size:12.5px;color:var(--text2);line-height:1.5">The following sets are expected to rotate out of Standard next cycle: <strong>${ROTATING_SETS.join(', ')}</strong>. ${ROTATION_NOTE}</div>
    </div>
  </div>
</div>

<!-- Most Valuable Pokemon Cards Carousel -->
<section class="carousel-section fade-up fade-up-2">
  <div class="carousel-label">Most Valuable</div>
  <div class="carousel-title">Top Pokemon Cards by Price (AUD)</div>
  <div class="carousel-track-wrap">
    <div id="pokemon-top-cards-track" class="carousel-track" style="animation:none">
      <div style="min-width:155px;height:220px;background:rgba(255,204,0,.06);border-radius:10px;animation:shimmer 1.5s infinite;flex-shrink:0"></div>
      <div style="min-width:155px;height:220px;background:rgba(255,204,0,.06);border-radius:10px;animation:shimmer 1.5s .1s infinite;flex-shrink:0"></div>
      <div style="min-width:155px;height:220px;background:rgba(255,204,0,.06);border-radius:10px;animation:shimmer 1.5s .2s infinite;flex-shrink:0"></div>
      <div style="min-width:155px;height:220px;background:rgba(255,204,0,.06);border-radius:10px;animation:shimmer 1.5s .3s infinite;flex-shrink:0"></div>
      <div style="min-width:155px;height:220px;background:rgba(255,204,0,.06);border-radius:10px;animation:shimmer 1.5s .4s infinite;flex-shrink:0"></div>
    </div>
  </div>
  <p class="carousel-source" id="pokemon-carousel-source" style="display:none">Prices sourced from TCGPlayer (USD), converted to AUD. Updated daily.</p>
</section>

<div class="wrap">

  <!-- Weekly Market Pulse -->
  <div id="pokemon-pulse-wrap" style="margin-bottom:32px;display:none">
    <h2 style="font-size:20px;margin-bottom:4px">&#128200; Weekly Market Pulse</h2>
    <p style="color:var(--text2);font-size:13px;margin-bottom:4px">Biggest price movers across all Pokemon cards in the last 7 days.</p>
    <p style="font-size:11px;color:var(--text2);opacity:.65;margin-bottom:16px">Prices sourced from TCGPlayer (USD), converted to AUD.</p>
    <div class="movers-grid">
      <div><div class="movers-col-title"><span style="color:#4ADE80">&#8593;</span> Biggest Gainers</div><div id="pokemon-gainers"></div></div>
      <div><div class="movers-col-title"><span style="color:#f87171">&#8595;</span> Biggest Losers</div><div id="pokemon-losers"></div></div>
    </div>
  </div>

  <!-- Browse Sets -->
  <div class="section fade-up fade-up-3" style="margin-bottom:32px">
    <div class="section-header">
      <div class="section-title">Browse ${sets.length||'216'}+ Sets</div>
      <div class="section-hint">Click any set to view cards and prices</div>
    </div>

    <!-- Era legend and filter -->
    <div style="margin-bottom:12px">
      <div style="font-size:11px;color:var(--text2);margin-bottom:8px">Sets are colour coded by era to help you find the right generation quickly. Click an era to filter.</div>
      <div class="az-row" style="margin-bottom:8px">
        ${eraButtons}
      </div>
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px">
    </div>

    <!-- A-Z filter -->
    <div class="az-row" id="az-row">${azButtons}</div>

    <!-- Set search -->
    <input type="text" id="set-search" placeholder="Search sets e.g. Scarlet, Paldea, Temporal Forces..." oninput="filterSets(this.value)" style="margin-bottom:12px;max-width:500px">

    <!-- Default prompt -->
    <div id="set-prompt" style="padding:20px 0;text-align:center;color:var(--text2);font-size:14px">Select an era, a letter, or search above to browse ${sets.length||'216'} sets</div>

    <!-- Set list -->
    <div id="set-list" class="set-grid" style="display:none">${setListHTML}</div>
  </div>

  <!-- Tracker CTA -->
  <div style="background:rgba(${ACCENT_RGB},.04);border:1px solid rgba(${ACCENT_RGB},.15);border-radius:var(--radius);padding:22px;margin-bottom:32px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px">
    <div>
      <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:5px">Track Your Pokemon Collection</div>
      <p style="font-size:13px;color:var(--text2)">Free Google Sheets tracker. Know what you own and what it is worth in AUD.</p>
    </div>
    <a href="/tracker.html" style="display:inline-flex;align-items:center;gap:7px;padding:9px 20px;border-radius:8px;font-weight:700;font-size:13px;background:var(--accent);color:#000;text-decoration:none">Get Free Tracker &#8594;</a>
  </div>

  <!-- Guides -->
  <h2 style="font-size:18px;margin-bottom:16px">Pokemon Guides, Blogs and Quizzes</h2>
  <div class="guides-grid">
    <a href="/blog/best-pokemon-booster-boxes-australia/" class="guide-card">
      <div class="guide-title">Best Pokemon Booster Boxes in Australia</div>
      <div class="guide-desc">Which boxes are worth opening right now and where to buy at the best price.</div>
    </a>
    <a href="/blog/are-pokemon-booster-boxes-investment-australia/" class="guide-card">
      <div class="guide-title">Are Pokemon Cards an Investment?</div>
      <div class="guide-desc">The honest data-backed answer for Australian collectors and speculators.</div>
    </a>
    <a href="/blog/pokemon-tcg-beginners-guide-australia/" class="guide-card">
      <div class="guide-title">Pokemon TCG Beginners Guide</div>
      <div class="guide-desc">New to Pokemon? Learn how the game works, what sets to start with, and where to buy in Australia.</div>
    </a>
    <a href="/ev-calculator.html" class="guide-card">
      <div class="guide-title">Pokemon EV Calculator</div>
      <div class="guide-desc">Is your booster box worth opening? Calculate expected value before you crack it.</div>
    </a>
    <a href="/quizzes/pokemon-era" class="guide-card">
      <div class="guide-title">&#127919; Pokemon Era Quiz</div>
      <div class="guide-desc">Which Pokemon era matches your collector soul? Base Set, EX era, or Scarlet and Violet?</div>
    </a>
    <a href="/quizzes/which-tcg-extended" class="guide-card">
      <div class="guide-title">&#127919; Which TCG Should I Play?</div>
      <div class="guide-desc">Not sure which TCG is right for you? Take the quiz and find out in 2 minutes.</div>
    </a>
  </div>

</div>

<footer>
  <div style="margin-bottom:10px">
    <a href="/">Home</a><a href="/cards">Card Vault</a><a href="/cards/mtg">MTG</a>
    <a href="/cards/pokemon">Pokemon</a><a href="/cards/lorcana">Lorcana</a>
    <a href="/cards/yugioh">Yu-Gi-Oh</a><a href="/cards/onepiece">One Piece</a>
    <a href="/blog">Blog</a><a href="/tracker.html">Tracker</a><a href="/calendar.html">Calendar</a>
  </div>
  <p>&#169; 2026 Cards on Cards on Cards &middot; cardsoncardsoncards.com.au</p>
  <p style="margin-top:6px;font-size:11px;opacity:.5">Affiliate disclosure: this site earns commissions from eBay AU and Amazon AU purchases made through affiliate links at no extra cost to you. Not affiliated with The Pokemon Company. USD prices converted to AUD at approximately 1.58.</p>
</footer>

<script>
let activeAZ = null;
let activeEra = null;

function filterAZ(letter, btn) {
  activeAZ = letter;
  activeEra = null;
  document.querySelectorAll('.az-btn:not(.era-btn)').forEach(b => b.classList.remove('az-btn--active'));
  document.querySelectorAll('.era-btn').forEach(b => b.classList.remove('az-btn--active'));
  if (btn) btn.classList.add('az-btn--active');
  showList();
  applyFilters();
}

function filterEra(era, btn) {
  activeEra = era;
  activeAZ = null;
  document.querySelectorAll('.az-btn').forEach(b => b.classList.remove('az-btn--active'));
  if (btn) btn.classList.add('az-btn--active');
  showList();
  applyFilters();
}

function filterSets(q) {
  if (q) showList();
  applyFilters(q);
}

function showList() {
  document.getElementById('set-list').style.display = 'grid';
  const p = document.getElementById('set-prompt');
  if (p) p.style.display = 'none';
}

function applyFilters(q) {
  const search = q !== undefined ? q : (document.getElementById('set-search')||{}).value||'';
  const lower  = search.toLowerCase();
  document.querySelectorAll('#set-list .set-tile').forEach(el => {
    const nameMatch   = !lower    || el.dataset.name.includes(lower);
    const letterMatch = !activeAZ || el.dataset.letter === activeAZ;
    const eraMatch    = !activeEra|| el.dataset.era === activeEra;
    el.style.display  = (nameMatch && letterMatch && eraMatch) ? '' : 'none';
  });
}
</script>

<script>
(function() {
  var SURL = '${SUPABASE_URL}';
  var SKEY = '${SUPABASE_ANON_KEY}';
  var EPN  = '5339146789';
  function sGet(path, cb) {
    fetch(SURL + '/rest/v1/' + path, { headers: { 'apikey': SKEY, 'Authorization': 'Bearer ' + SKEY } })
      .then(function(r) { return r.ok ? r.json() : []; }).then(cb).catch(function() { cb([]); });
  }
  function esc(s) { return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function loadTopCards() {
    var track = document.getElementById('pokemon-top-cards-track');
    var src   = document.getElementById('pokemon-carousel-source');
    if (!track) return;
    sGet('pokemon_cards?order=price_aud.desc&price_aud=gt.0&image_url=not.is.null&rarity=not.is.null&rarity=neq.None&limit=24&select=slug,name,image_url,price_aud,rarity,set_name', function(cards) {
      if (!cards || !cards.length) { track.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:20px">Price data loading. Check back shortly.</div>'; return; }
      var html = '';
      for (var i=0;i<cards.length;i++) {
        var c = cards[i];
        var price = c.price_aud ? 'AU$' + parseFloat(c.price_aud).toFixed(0) : '';
        var ebay = 'https://www.ebay.com.au/sch/i.html?_nkw=' + encodeURIComponent((c.name||'pokemon card') + ' pokemon') + '&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=' + EPN + '&toolid=10001&mkevt=1';
        var img = c.image_url ? '<img src="' + esc(c.image_url) + '" alt="' + esc(c.name) + '" loading="eager" onerror="this.parentElement.innerHTML=\'<div class=card-placeholder>&#128248;</div>\'">' : '<div class="card-placeholder">&#128248;</div>';
        html += '<a href="/cards/pokemon/' + esc(c.slug) + '" class="carousel-card"><div class="carousel-img-wrap">' + img + '</div><div class="carousel-name">' + esc(c.name) + '</div>' + (c.rarity ? '<div class="carousel-rarity">' + esc(c.rarity) + '</div>' : '') + '<div class="carousel-price">' + price + '</div><div class="carousel-buy-row"><a href="' + ebay + '" target="_blank" rel="noopener" class="carousel-buy-btn" onclick="event.stopPropagation()">Buy eBay &#8599;</a></div></a>';
      }
      track.innerHTML = html + html;
      track.style.animation = 'scrollLeft 50s linear infinite';
      if (src) src.style.display = '';
    });
  }

  function loadPulse() {
    var wrap = document.getElementById('pokemon-pulse-wrap');
    var gEl  = document.getElementById('pokemon-gainers');
    var lEl  = document.getElementById('pokemon-losers');
    if (!wrap || !gEl || !lEl) return;
    function mCard(c, up) {
      var arrow = up ? '&#8593;' : '&#8595;';
      var col   = up ? '#4ADE80' : '#f87171';
      var pct   = Math.abs(parseFloat(c.price_change_7d||0)).toFixed(1);
      var price = c.price_aud ? 'AU$' + parseFloat(c.price_aud).toFixed(0) : '';
      var img   = c.image_url ? '<img src="' + esc(c.image_url) + '" alt="' + esc(c.name) + '" loading="lazy" style="width:40px;height:56px;object-fit:cover;border-radius:4px;flex-shrink:0">' : '<div style="width:40px;height:56px;background:var(--bg3);border-radius:4px;flex-shrink:0"></div>';
      return '<a href="/cards/pokemon/' + esc(c.slug) + '" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;text-decoration:none;margin-bottom:6px" onmouseover="this.style.borderColor=\'var(--accent)\'" onmouseout="this.style.borderColor=\'var(--border)\'"><div>' + img + '</div><div style="min-width:0;flex:1"><div style="font-size:11.5px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(c.name) + '</div><div style="font-size:10px;color:var(--text2)">' + esc(c.set_name||'') + '</div><div style="font-size:11px;color:var(--accent);font-weight:700">' + price + '</div></div><div style="font-size:12px;font-weight:700;color:' + col + ';flex-shrink:0">' + arrow + pct + '%</div></a>';
    }
    sGet('pokemon_cards?order=price_change_7d.desc&price_change_7d=gt.5&price_aud=gt.5&price_change_7d=lt.5000&image_url=not.is.null&limit=5&select=slug,name,image_url,price_aud,price_change_7d,set_name', function(gainers) {
      sGet('pokemon_cards?order=price_change_7d.asc&price_change_7d=lt.-5&price_aud=gt.5&image_url=not.is.null&limit=5&select=slug,name,image_url,price_aud,price_change_7d,set_name', function(losers) {
        if (!gainers.length && !losers.length) return;
        gEl.innerHTML = gainers.map(function(c){return mCard(c,true);}).join('') || '<p style="color:var(--text2);font-size:13px">No significant gainers this week.</p>';
        lEl.innerHTML = losers.map(function(c){return mCard(c,false);}).join('') || '<p style="color:var(--text2);font-size:13px">No significant losers this week.</p>';
        wrap.style.display = '';
      });
    });
  }

  loadTopCards();
  loadPulse();
})();
</script>

<!-- REPORT BUG WIDGET -->
<style>.bug-float{position:fixed;bottom:20px;right:20px;z-index:9999}.bug-btn{display:flex;align-items:center;gap:6px;background:rgba(15,17,25,.95);border:1px solid rgba(201,168,76,.3);color:#C9A84C;padding:8px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;font-family:sans-serif;backdrop-filter:blur(12px);transition:all .2s;text-decoration:none;letter-spacing:.03em;box-shadow:0 4px 16px rgba(0,0,0,.4)}.bug-btn:hover{border-color:#C9A84C;background:rgba(201,168,76,.12);color:#E8C86A;text-decoration:none;transform:translateY(-2px)}.bug-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10000;align-items:center;justify-content:center;backdrop-filter:blur(4px)}.bug-modal.open{display:flex}.bug-box{background:#111420;border:1px solid #252840;border-radius:14px;padding:28px;width:100%;max-width:420px;margin:0 16px;position:relative}.bug-box h3{font-family:'Cinzel',serif;font-size:17px;font-weight:700;color:#F0F2FF;margin-bottom:4px}.bug-box p{font-size:12px;color:#9ba3c4;margin-bottom:18px}.bug-close{position:absolute;top:12px;right:14px;background:none;border:none;color:#9ba3c4;font-size:18px;cursor:pointer;line-height:1;padding:4px}.bug-form select,.bug-form textarea{width:100%;background:rgba(255,255,255,.05);border:1px solid #252840;border-radius:8px;color:#F0F2FF;font-family:'DM Sans',sans-serif;font-size:13px;padding:9px 12px;margin-bottom:12px;outline:none;transition:border-color .2s}.bug-form select:focus,.bug-form textarea:focus{border-color:rgba(201,168,76,.5)}.bug-form textarea{resize:vertical;min-height:80px;max-height:160px}.bug-form select option{background:#e8eaf0;color:#111420}.bug-form select{background:#e8eaf0;color:#111420}.bug-hidden{display:none}.bug-submit{width:100%;padding:10px;background:#C9A84C;color:#0A0C14;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:opacity .2s}.bug-submit:hover{opacity:.85}.bug-submit:disabled{opacity:.5;cursor:not-allowed}.bug-thanks{display:none;text-align:center;padding:12px 0}.bug-thanks p{color:#4ADE80;font-size:14px;font-weight:600}</style>
<div class="bug-float"><a class="bug-btn" onclick="document.getElementById('bugModal').classList.add('open');return false" href="#">&#x1F41B; Report a Bug</a></div>
<div class="bug-modal" id="bugModal" onclick="if(event.target===this)this.classList.remove('open')">
  <div class="bug-box">
    <button class="bug-close" onclick="document.getElementById('bugModal').classList.remove('open')">&#x2715;</button>
    <h3>&#x1F41B; Report a Bug</h3>
    <p>Spotted something wrong? Takes 20 seconds.</p>
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
</body>
</html>`;

  return new Response(html, { status: 200, headers });
};

export const config = { path: '/cards/pokemon' };
