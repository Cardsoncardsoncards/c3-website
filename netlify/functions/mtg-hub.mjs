// netlify/functions/mtg-hub.mjs
// Serves /cards/mtg — MTG Card Vault hub page
// Split from card-index.mjs. Set pages remain at card-index.mjs (/cards/mtg/sets/:slug)

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID        = '5339146789';
const GAME_COLOUR       = '#C9A84C';

const CALENDAR_EVENTS = [
  { date: '2026-05-23', name: 'Tarkir: Dragonstorm Release',      type: 'Set Release'  },
  { date: '2026-06-13', name: 'Final Fantasy',                     type: 'Set Release'  },
  { date: '2026-06-20', name: 'Pro Tour Marvel Super Heroes',      type: 'Pro Tour'     },
  { date: '2026-07-11', name: 'Edge of Eternities Previews',       type: 'Preview'      },
  { date: '2026-08-07', name: 'Edge of Eternities',                type: 'Set Release'  },
  { date: '2026-09-12', name: 'Australian Nationals',              type: 'Tournament'   },
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

export default async (req) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=1800, s-maxage=3600' };

  const [sets, topCards] = await Promise.all([
    supabaseGet('mtg_sets?order=released_at.desc&limit=800&select=id,name,slug,released_at,card_count,set_type'),
    supabaseGet('mtg_cards?order=price_aud.desc&price_aud=gt.0&image_uri_small=not.is.null&limit=24&select=slug,name,set_name,image_uri_small,price_aud,rarity,type_line')
  ]);

  // Filter sets to meaningful types only
  const SKIP_TYPES = new Set(['token','memorabilia','minigame','funny']);
  const filteredSets = sets.filter(s => !SKIP_TYPES.has(s.set_type));

  const tickerHTML = buildTickerHTML(CALENDAR_EVENTS);
  const azFilterHTML = buildAZFilter(filteredSets);

  const carouselHTML = topCards.length ? topCards.map(c => {
    const aud = c.price_aud ? parseFloat(c.price_aud).toFixed(0) : '';
    const ebayUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(c.name+' mtg')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
    return `<a href="/cards/mtg/${c.slug}" class="carousel-card">
      <div class="carousel-img-wrap">
        <img src="${c.image_uri_small}" alt="${c.name}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=card-placeholder>&#9876;&#65039;</div>'">
      </div>
      <div class="carousel-name">${c.name}</div>
      ${c.rarity ? `<div class="carousel-rarity">${c.rarity}</div>` : ''}
      <div class="carousel-price">${aud ? `AU$${aud}` : ''}</div>
      <div class="carousel-buy-row"><a href="${ebayUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="carousel-buy-btn">Buy eBay &#8599;</a></div>
    </a>`;
  }).join('') : '<div class="sync-msg">Cards sync daily after 10am AEST.</div>';

  const setListHTML = filteredSets.length ? filteredSets.map(s => {
    const name = s.name || '';
    const ch = name.trim()[0] ? name.trim()[0].toUpperCase() : '';
    const letterKey = /[A-Z]/.test(ch) ? ch : '0-9';
    const year = s.released_at ? s.released_at.slice(0,4) : '';
    const count = s.card_count ? ` &middot; ${s.card_count} cards` : '';
    return `<a href="/cards/mtg/sets/${encodeURIComponent(s.slug||s.id)}" class="set-tile" data-name="${name.toLowerCase().replace(/"/g,'&quot;')}" data-letter="${letterKey}">
      <span class="set-tile-name">${name}</span>
      <span class="set-tile-meta">${year}${count}</span>
    </a>`;
  }).join('') : '<div class="sync-msg">Sets sync daily after 10am AEST.</div>';

  return new Response(`<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>MTG Card Prices Australia | AUD Prices Updated Daily | C3</title>
  <meta name="description" content="Browse Magic: The Gathering card prices in AUD. ${filteredSets.length}+ sets, live eBay AU buy links. Australia's MTG price guide updated daily.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/mtg">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <meta property="og:image" content="https://cardsoncardsoncards.com.au/c3-og-banner.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap&display=swap" rel="stylesheet">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <style>
    :root{--bg:#0A0C14;--bg2:#111420;--bg3:#181d2e;--gold:#C9A84C;--gold-lit:#E8C86A;--gold-dim:#7A621E;--text:#e8eaf0;--text2:#9ba3c4;--border:#242840;--silver:#A0A8C0}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6;min-height:100vh;overflow-x:hidden}
    body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(ellipse 70% 40% at 50% 0%,rgba(201,168,76,.06),transparent 60%)}
    nav{background:rgba(10,12,20,.97);border-bottom:1px solid var(--border);padding:10px 0;position:sticky;top:0;z-index:100;backdrop-filter:blur(20px)}
    .nav-inner{max-width:1200px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:12px}
    .nav-logo{display:flex;align-items:center;gap:8px;text-decoration:none;font-family:'Cinzel',serif;font-size:11px;font-weight:700;letter-spacing:.12em;color:var(--gold);text-transform:uppercase;flex-shrink:0}
    .nav-logo img{height:30px;width:30px;border-radius:5px;object-fit:cover}
    .nav-links{display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
    .nav-links::-webkit-scrollbar{display:none}
    .nav-link{display:inline-flex;align-items:center;padding:5px 9px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid var(--border);color:var(--silver);white-space:nowrap;transition:all .2s}
    .nav-link:hover{color:var(--text);border-color:var(--silver);background:rgba(255,255,255,.04)}
    .nav-link--active{color:var(--gold);border-color:rgba(201,168,76,.4);background:rgba(201,168,76,.07)}
    .nav-link--compare{color:#A78BFA;border-color:rgba(167,139,250,.35)}.nav-link--compare:hover{background:rgba(167,139,250,.08);border-color:#A78BFA}
    .nav-link--market{color:#4ADE80;border-color:rgba(74,222,128,.35)}.nav-link--market:hover{background:rgba(74,222,128,.08);border-color:#4ADE80}
    .nav-link--tools{color:#FB923C;border-color:rgba(251,146,60,.35)}.nav-link--tools:hover{background:rgba(251,146,60,.08);border-color:#FB923C}
    .nav-link--play{color:#F472B6;border-color:rgba(244,114,182,.35)}.nav-link--play:hover{background:rgba(244,114,182,.08);border-color:#F472B6}
    .nav-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.35)}.nav-link--blog:hover{background:rgba(126,203,161,.08);border-color:#7ECBA1}
    .nav-link--ebay{color:#60A5FA;border-color:rgba(96,165,250,.35);background:rgba(96,165,250,.05)}.nav-link--ebay:hover{background:rgba(96,165,250,.12);border-color:#60A5FA}

    .release-ticker{background:rgba(201,168,76,.07);border-bottom:1px solid rgba(201,168,76,.15);height:36px;display:flex;align-items:center;overflow:hidden;position:relative}
    .release-ticker::before,.release-ticker::after{content:'';position:absolute;top:0;bottom:0;width:60px;z-index:2;pointer-events:none}
    .release-ticker::before{left:0;background:linear-gradient(to right,var(--bg),transparent)}
    .release-ticker::after{right:0;background:linear-gradient(to left,var(--bg),transparent)}
    .ticker-label{font-size:9px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--gold);white-space:nowrap;padding:0 16px 0 20px;flex-shrink:0;z-index:3}
    .ticker-track{display:flex;animation:tickerScroll 45s linear infinite;flex-shrink:0}
    .ticker-track:hover{animation-play-state:paused}
    @keyframes tickerScroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
    .ticker-item{display:inline-flex;align-items:center;gap:8px;padding:0 24px;font-size:12px;color:var(--text2);white-space:nowrap}
    .ticker-badge{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:2px 7px;border-radius:3px;background:rgba(201,168,76,.15);color:var(--gold);border:1px solid rgba(201,168,76,.3)}

    .wrap{max-width:1200px;margin:0 auto;padding:0 24px;position:relative;z-index:1}
    .hub-hero{padding:48px 0 32px;text-align:center}
    .hub-eyebrow{font-size:10px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--gold);margin-bottom:12px}
    .hub-title{font-family:'Cinzel',serif;font-size:clamp(26px,5vw,48px);font-weight:900;color:var(--text);line-height:1.1;margin-bottom:12px}
    .hub-title span{color:var(--gold)}
    .hub-sub{font-size:15px;color:var(--text2);max-width:520px;margin:0 auto 28px;line-height:1.6}
    .hub-stats{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
    .hub-stat{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 18px;text-align:center}
    .hub-stat-num{font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:var(--gold)}
    .hub-stat-label{font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.08em;margin-top:2px}
    .section-divider{height:1px;background:linear-gradient(90deg,transparent,rgba(201,168,76,.3),transparent);margin:32px 0}

    .carousel-section{padding:32px 0}
    .carousel-label{font-size:10px;font-weight:700;letter-spacing:.25em;text-transform:uppercase;color:var(--gold);margin-bottom:6px}
    .carousel-heading{font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:var(--text);margin-bottom:16px}
    .carousel-viewport{overflow:hidden;position:relative;border-radius:8px}
    .carousel-viewport::before,.carousel-viewport::after{content:'';position:absolute;top:0;bottom:0;width:48px;z-index:2;pointer-events:none}
    .carousel-viewport::before{left:0;background:linear-gradient(to right,var(--bg),transparent)}
    .carousel-viewport::after{right:0;background:linear-gradient(to left,var(--bg),transparent)}
    .carousel-scroll{display:flex;gap:12px;width:max-content;animation:carouselLeft 42s linear infinite}
    .carousel-scroll:hover{animation-play-state:paused}
    @keyframes carouselLeft{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
    .carousel-card{flex:0 0 148px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px;text-decoration:none;display:block;transition:border-color .2s,transform .2s}
    .carousel-card:hover{border-color:var(--gold);transform:translateY(-2px)}
    .carousel-img-wrap{width:100%;aspect-ratio:3/4;overflow:hidden;border-radius:6px;margin-bottom:8px;background:var(--bg3);display:flex;align-items:center;justify-content:center}
    .carousel-img-wrap img{width:100%;height:100%;object-fit:contain}
    .card-placeholder{font-size:28px;color:var(--border)}
    .carousel-name{font-size:11px;color:var(--text);font-weight:600;line-height:1.3;margin-bottom:3px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
    .carousel-rarity{font-size:10px;color:var(--text2);margin-bottom:3px}
    .carousel-price{font-size:11px;color:var(--gold);font-weight:700}
    .carousel-buy-row{margin-top:6px}
    .carousel-buy-btn{font-size:10px;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:.06em;text-decoration:none}
    .sync-msg{font-size:13px;color:var(--text2);padding:24px;text-align:center}

    .market-widget{background:var(--bg2);border:1px solid rgba(201,168,76,.2);border-radius:12px;padding:20px;margin-top:24px;position:relative;overflow:hidden}
    .market-widget::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent)}
    .market-widget-label{font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-bottom:12px}
    .market-cards{display:flex;gap:10px;flex-wrap:wrap}
    .market-card{flex:1;min-width:140px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;text-decoration:none;display:block;transition:border-color .2s}
    .market-card:hover{border-color:rgba(201,168,76,.4)}
    .market-card-name{font-size:12px;font-weight:600;color:var(--text);margin-bottom:4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .market-card-price{font-size:13px;font-weight:700;color:var(--gold)}
    .market-card-change{font-size:11px;margin-top:2px;font-weight:600}
    .change-up{color:#4ADE80}.change-down{color:#F87171}

    .format-bar{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0 0}
    .format-badge{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;border:1px solid var(--border);color:var(--text2);transition:all .2s}
    .format-badge:hover{border-color:var(--gold);color:var(--gold)}
    .format-badge span{font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(201,168,76,.15);color:var(--gold);font-weight:700}

    .sets-section{padding:32px 0 48px}
    .sets-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:12px}
    .sets-search{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px 14px;font-size:13px;color:var(--text);width:240px;outline:none;font-family:'DM Sans',sans-serif}
    .sets-search:focus{border-color:rgba(201,168,76,.4)}
    .sets-search::placeholder{color:var(--text2)}
    .az-filter{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:16px}
    .az-btn{background:var(--bg2);border:1px solid var(--border);border-radius:5px;padding:4px 8px;font-size:11px;font-weight:600;color:var(--text2);cursor:pointer;transition:all .15s;font-family:'DM Sans',sans-serif}
    .az-btn:hover,.az-btn--active{background:rgba(201,168,76,.1);border-color:rgba(201,168,76,.4);color:var(--gold)}
    .set-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
    .set-tile{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px 14px;text-decoration:none;display:flex;flex-direction:column;gap:4px;transition:all .2s}
    .set-tile:hover{border-color:rgba(201,168,76,.4);transform:translateY(-1px)}
    .set-tile-name{font-size:13px;font-weight:600;color:var(--text);line-height:1.3}
    .set-tile-meta{font-size:11px;color:var(--text2)}
    .no-results{font-size:13px;color:var(--text2);padding:24px;text-align:center;grid-column:1/-1;display:none}
    footer{border-top:1px solid var(--border);padding:32px 24px;text-align:center;font-size:12px;color:var(--text2)}
    footer a{color:var(--text2);margin:0 8px;text-decoration:none}
    footer a:hover{color:var(--text)}
  </style>
</head>
<body>
<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo">
      <img src="/c3logo.png" alt="C3">
      <span>Cards on Cards on Cards</span>
    </a>
    <div class="nav-links">
      <a href="/cards" class="nav-link">Card Vault</a>
      <a href="/cards/mtg" class="nav-link nav-link--active">MTG</a>
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

<div class="wrap">
  <div class="hub-hero">
    <div class="hub-eyebrow">C3 Card Vault</div>
    <h1 class="hub-title">Magic: The Gathering<br><span>Card Prices in Australia</span></h1>
    <p class="hub-sub">Browse ${filteredSets.length}+ sets and 96,000+ cards with live AUD pricing, eBay AU buy links, and 7-day price movement. Updated daily.</p>
    <div class="hub-stats">
      <div class="hub-stat"><div class="hub-stat-num">96,505</div><div class="hub-stat-label">Cards Tracked</div></div>
      <div class="hub-stat"><div class="hub-stat-num">${filteredSets.length}+</div><div class="hub-stat-label">Sets Indexed</div></div>
      <div class="hub-stat"><div class="hub-stat-num">Daily</div><div class="hub-stat-label">Price Updates</div></div>
      <div class="hub-stat"><div class="hub-stat-num">AUD</div><div class="hub-stat-label">Live FX Rate</div></div>
    </div>
    <div class="format-bar">
      <a href="/cards/mtg/sets/dft" class="format-badge">Tarkir: Dragonstorm <span>STANDARD</span></a>
      <a href="/cards/mtg/sets/fdn" class="format-badge">Foundations <span>STANDARD</span></a>
      <a href="/cards/mtg/random-commander" class="format-badge">&#129335; Random Commander</a>
      <a href="/ev-calculator.html" class="format-badge">&#128202; EV Calculator</a>
    </div>
  </div>
</div>

<div class="section-divider" style="margin:0 24px"></div>

<div class="wrap">
  <div class="carousel-section">
    <div class="carousel-label">Top Cards by Value</div>
    <div class="carousel-heading">MTG Chase Cards Right Now in Australia</div>
    <div class="carousel-viewport">
      <div class="carousel-scroll">${carouselHTML}${carouselHTML}</div>
    </div>

    <!-- Market Signal Widget -->
    <div class="market-widget" id="market-widget">
      <div class="market-widget-label">&#128200; What the Market Is Doing Right Now</div>
      <div class="market-cards" id="market-cards">
        <div style="font-size:12px;color:var(--text2);padding:8px">Loading market signals...</div>
      </div>
      <div style="margin-top:12px;font-size:11px;color:var(--text2)">Based on 7-day price movement in the C3 MTG price database. <a href="/market" style="color:var(--gold)">See full market report &rarr;</a></div>
    </div>
  </div>
</div>

<div class="section-divider" style="margin:0 24px"></div>

<div class="wrap">
  <div class="sets-section">
    <div class="sets-header">
      <div>
        <div style="font-size:10px;font-weight:700;letter-spacing:.25em;text-transform:uppercase;color:var(--gold);margin-bottom:6px">Browse Sets</div>
        <div style="font-family:'Cinzel',serif;font-size:20px;font-weight:700;color:var(--text)">${filteredSets.length} MTG Sets</div>
      </div>
      <input class="sets-search" type="text" id="set-search" placeholder="Search sets..." oninput="filterSets(this.value)">
    </div>
    <div class="az-filter" id="az-filter">${azFilterHTML}</div>
    <div class="set-grid" id="set-grid">
      ${setListHTML}
      <div class="no-results" id="no-results">No sets match your search.</div>
    </div>
  </div>

  <div style="background:linear-gradient(135deg,rgba(201,168,76,.06),rgba(201,168,76,.02));border:1px solid rgba(201,168,76,.2);border-radius:12px;padding:24px;margin-bottom:48px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px">
    <div>
      <div style="font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-bottom:6px">Find the best price before you buy</div>
      <div style="font-family:'Cinzel',serif;font-size:17px;font-weight:700;color:var(--text)">Compare Any Two Cards Side by Side</div>
      <div style="font-size:13px;color:var(--text2);margin-top:4px">Buy signals, 14-day sparklines, Card Kingdom buylist prices, and AUD pricing across all TCGs.</div>
    </div>
    <a href="/compare" style="display:inline-flex;align-items:center;gap:8px;padding:11px 22px;border-radius:10px;background:rgba(201,168,76,.12);border:1px solid rgba(201,168,76,.3);color:var(--gold);font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap">Open Card Compare &rarr;</a>
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
  <p style="margin-top:12px;font-size:11px;opacity:.4">&copy; 2026 Cards on Cards on Cards &middot; Prices updated daily in AUD &middot; Affiliate links may earn a commission</p>
</footer>

<script>
function filterAZ(letter, btn) {
  document.querySelectorAll('.az-btn').forEach(b => b.classList.remove('az-btn--active'));
  btn.classList.add('az-btn--active');
  document.getElementById('set-search').value = '';
  const tiles = document.querySelectorAll('.set-tile');
  let visible = 0;
  tiles.forEach(t => {
    const show = letter === 'All' || t.dataset.letter === letter;
    t.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  document.getElementById('no-results').style.display = visible === 0 ? 'block' : 'none';
}
function filterSets(q) {
  const term = q.toLowerCase().trim();
  document.querySelectorAll('.az-btn').forEach(b => b.classList.remove('az-btn--active'));
  document.querySelector('.az-btn').classList.add('az-btn--active');
  const tiles = document.querySelectorAll('.set-tile');
  let visible = 0;
  tiles.forEach(t => {
    const show = !term || t.dataset.name.includes(term);
    t.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  document.getElementById('no-results').style.display = visible === 0 ? 'block' : 'none';
}

// Market signal widget — top movers from MTG price snapshots
(async function() {
  try {
    const res = await fetch('/api/tcg-prices?game=mtg&limit=3');
    if (!res.ok) return;
    const data = await res.json();
    const cards = data.cards || data.movers || [];
    if (!cards.length) return;
    const el = document.getElementById('market-cards');
    el.innerHTML = cards.slice(0,3).map(c => {
      const price = parseFloat(c.price_aud || c.priceAud || 0);
      const change = parseFloat(c.change_7d || c.change || 0);
      const cls = change >= 0 ? 'change-up' : 'change-down';
      const sign = change >= 0 ? '+' : '';
      return '<a href="/cards/mtg/' + (c.slug||'') + '" class="market-card">'
        + '<div class="market-card-name">' + (c.name||'') + '</div>'
        + '<div class="market-card-price">AU$' + price.toFixed(2) + '</div>'
        + (change ? '<div class="market-card-change ' + cls + '">' + sign + change.toFixed(1) + '% this week</div>' : '')
        + '</a>';
    }).join('');
  } catch(e) {}
})();
</script>
</body>
</html>`, { status: 200, headers });
};

export const config = { path: '/cards/mtg' };
