// netlify/functions/mtg-hub.mjs
// Serves: /cards/mtg

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID        = Netlify.env.get('EPN_CAMPID') || '5339146789';

async function supabaseGet(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) { clearTimeout(timer); return []; }
}

function eraColor(year) {
  if (!year) return '#C9A84C';
  const y = parseInt(year, 10);
  if (y >= 2020) return '#4ADE80';
  if (y >= 2010) return '#60A5FA';
  return '#C9A84C';
}

// Only show main release types on hub - no promo/token/commander sub-sets
const SHOW_TYPES = new Set(['expansion','core','masters','draft_innovation','starter','archenemy','planechase','box','funny','spellbook']);

// Upcoming MTG releases 2026 (static - update each session as needed)
const UPCOMING = [
  { name: 'Tarkir: Dragonstorm', date: 'Apr 2026', code: 'tdm' },
  { name: 'Final Fantasy', date: 'Jun 2026', code: 'fft' },
  { name: 'Edge of Eternities', date: 'Jul 2026', code: 'ede' },
  { name: 'Mordenkainen Monsters Multiverse', date: 'Sep 2026', code: 'mmm' },
  { name: 'Return to Thunder Junction', date: 'Nov 2026', code: 'rtj' },
];

// Format legality (current Standard sets as of mid-2026)
const FORMATS = [
  { name: 'Standard',  color: '#4ADE80', sets: 'Duskmourn, Foundations, Aetherdrift, Tarkir: Dragonstorm', href: '/cards/mtg/banned/standard' },
  { name: 'Pioneer',   color: '#60A5FA', sets: 'Return to Ravnica onward, no fetchlands', href: '/cards/mtg/banned/pioneer' },
  { name: 'Modern',    color: '#A78BFA', sets: 'Eighth Edition onward', href: '/cards/mtg/banned/modern' },
  { name: 'Commander', color: '#F97316', sets: 'All sets, own banned list', href: '/cards/mtg/banned/commander' },
];

export default async () => {
  // Fetch sets, top cards, and price movers in parallel
  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const twoDaysAgo   = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);

  const [sets, topCards, snapNow, snapOld] = await Promise.all([
    supabaseGet('mtg_sets?order=release_date.desc&limit=1000&digital=eq.false&select=set_code,set_name,set_slug,set_type,release_date'),
    supabaseGet(`mtg_cards?order=price_usd.desc&limit=12&select=slug,name,image_uri_small,price_usd,price_aud&price_usd=gte.10&image_uri_small=not.is.null`),
    supabaseGet(`mtg_price_snapshots?select=scryfall_id,price_aud&snapshot_date=gte.${twoDaysAgo}&order=price_aud.desc&limit=3000`),
    supabaseGet(`mtg_price_snapshots?select=scryfall_id,price_aud&snapshot_date=gte.${sevenDaysAgo}&snapshot_date=lte.${sevenDaysAgo}&order=snapshot_date.asc&limit=3000`)
  ]);

  // Filter to main set types only
  const filteredSets = sets.filter(s => SHOW_TYPES.has(s.set_type));
  const totalSets = filteredSets.length;

  // Count sets per letter for AZ button labels
  const letterCounts = {};
  filteredSets.forEach(function(s) {
    const fc = (s.set_name[0] || '').toUpperCase();
    const lk = /[0-9]/.test(fc) ? '0' : fc;
    letterCounts[lk] = (letterCounts[lk] || 0) + 1;
  });

  // Build set list (hidden by default, revealed by filter)
  const setListHTML = filteredSets.map(function(s) {
    const year = s.release_date ? s.release_date.slice(0, 4) : '';
    const color = eraColor(year);
    const firstChar = (s.set_name[0] || '').toUpperCase();
    const letterKey = /[0-9]/.test(firstChar) ? '0' : firstChar;
    const safeName = s.set_name.toLowerCase().replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    const isNew = s.release_date && s.release_date >= new Date(Date.now() - 45*864e5).toISOString().slice(0,10);
    const newBadge = isNew ? '<span class="new-badge">NEW</span>' : '';
    return `<a href="/cards/mtg/sets/${s.set_slug}" class="set-item" data-letter="${letterKey}" data-name="${safeName}" style="border-left:3px solid ${color}">
      <span class="set-name">${s.set_name.replace(/</g,'&lt;').replace(/>/g,'&gt;')}${newBadge}</span>
      <span class="set-year">${year}</span>
    </a>`;
  }).join('');

  // Top cards grid
  const topCardHTML = topCards.map(function(c) {
    const price = c.price_aud > 0 ? parseFloat(c.price_aud) : (c.price_usd ? c.price_usd * 1.58 : 0);
    const priceStr = price > 0 ? '~AU$' + price.toFixed(0) : '';
    return `<a href="/cards/mtg/${c.slug}" class="top-card">
      ${c.image_uri_small ? `<img src="${c.image_uri_small}" alt="${c.name.replace(/"/g,'&quot;')}" loading="lazy">` : `<div class="top-card-placeholder">${c.name.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`}
      <div class="top-card-name">${c.name.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
      <div class="top-card-price">${priceStr}</div>
    </a>`;
  }).join('');

  // Compute price movers using snapshot data
  const nowMap = {};
  snapNow.forEach(r => { if (r.price_aud) nowMap[r.scryfall_id] = parseFloat(r.price_aud); });
  const oldMap = {};
  snapOld.forEach(r => { if (r.price_aud) oldMap[r.scryfall_id] = parseFloat(r.price_aud); });

  // Find cards with significant movement
  const movers = [];
  Object.entries(nowMap).forEach(([sid, nowPrice]) => {
    const oldPrice = oldMap[sid];
    if (!oldPrice || oldPrice < 2 || nowPrice < 2) return;
    const pct = ((nowPrice - oldPrice) / oldPrice) * 100;
    if (Math.abs(pct) > 5) movers.push({ sid, nowPrice, oldPrice, pct });
  });
  movers.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

  const gainers = movers.filter(m => m.pct > 0).slice(0, 5);
  const losers  = movers.filter(m => m.pct < 0).slice(0, 5);

  // Fetch card details for movers
  let moverDetails = {};
  const moverSids = [...gainers, ...losers].map(m => m.sid);
  if (moverSids.length > 0) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/mtg_cards`);
    url.searchParams.set('select', 'scryfall_id,name,slug,image_uri_small,set_name');
    url.searchParams.set('limit', '20');
    // in() filter appended manually - searchParams encodes parens/quotes breaking PostgREST
    const moverFetchUrl = url.toString() + '&scryfall_id=in.(' + moverSids.map(s => '"' + s + '"').join(',') + ')';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(moverFetchUrl, {
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          data.forEach(c => { moverDetails[c.scryfall_id] = c; });
        }
      }
    } catch { clearTimeout(timer); }
  }

  function moverCardHTML(m, isGainer) {
    const card = moverDetails[m.sid];
    if (!card) return '';
    const pctStr = (isGainer ? '+' : '') + m.pct.toFixed(1) + '%';
    const pctColor = isGainer ? '#4ADE80' : '#f87171';
    const imgEl = card.image_uri_small
      ? `<img src="${card.image_uri_small}" alt="${card.name.replace(/"/g,'&quot;')}" loading="lazy">`
      : `<div class="mover-no-img">?</div>`;
    return `<a href="/cards/mtg/${card.slug}" class="mover-card">
      <div class="mover-img">${imgEl}</div>
      <div class="mover-info">
        <div class="mover-name">${card.name.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        <div class="mover-set">${(card.set_name||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        <div class="mover-prices">
          <span style="font-size:11px;color:var(--text2)">AU$${m.oldPrice.toFixed(0)}</span>
          <span style="font-size:13px;font-weight:700;color:var(--text)">AU$${m.nowPrice.toFixed(0)}</span>
          <span style="font-size:12px;font-weight:700;color:${pctColor}">${pctStr}</span>
        </div>
      </div>
    </a>`;
  }

  const gainerHTML = gainers.map(m => moverCardHTML(m, true)).filter(Boolean).join('');
  const loserHTML  = losers.map(m => moverCardHTML(m, false)).filter(Boolean).join('');
  const hasMovers  = gainerHTML || loserHTML;

  // Release ticker items (doubled for seamless loop)
  const tickerItems = [...UPCOMING, ...UPCOMING].map(r =>
    `<span class="ticker-item"><strong>${r.name}</strong> &middot; ${r.date}</span>`
  ).join('');

  // Format legality pills
  const formatPills = FORMATS.map(f =>
    `<a href="${f.href}" class="fmt-pill" style="border-color:${f.color}44;color:${f.color}">
      <span class="fmt-pill-name">${f.name}</span>
      <span class="fmt-pill-sets">${f.sets}</span>
    </a>`
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>MTG Card Prices Australia | Cards on Cards on Cards</title>
  <meta name="description" content="Browse Magic: The Gathering card prices in AUD. Australia's MTG price guide with live AUD conversion, 52-week price ranges, and eBay AU buy links.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/mtg">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <meta property="og:title" content="MTG Card Prices Australia | Cards on Cards on Cards">
  <meta property="og:description" content="Browse Magic: The Gathering card prices in AUD. Live pricing, 52-week ranges, and eBay AU buy links. Updated daily.">
  <meta property="og:image" content="https://cardsoncardsoncards.com.au/c3-og-banner.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#0f1117;--bg2:#1a1d2e;--bg3:#22263a;--accent:#f5a623;--text:#e8eaf0;--text2:#9ba3c4;--border:#2d3254;--radius:12px;--gold:#C9A84C}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:sans-serif;line-height:1.6}
    a{color:var(--accent);text-decoration:none}
    a:hover{text-decoration:underline}
    .wrap{max-width:1400px;margin:0 auto;padding:0 24px}
    .btn{display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border-radius:8px;font-weight:700;cursor:pointer;border:none;font-size:13px;text-decoration:none;transition:opacity .2s}
    .btn:hover{opacity:.85;text-decoration:none}
    .btn-primary{background:var(--accent);color:#000}
    .btn-secondary{background:var(--bg3);border:1px solid var(--border);color:var(--text)}
    input{background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:8px 12px;border-radius:6px;font-size:14px;width:100%}
    footer{background:var(--bg2);border-top:1px solid var(--border);padding:24px;text-align:center;color:var(--text2);font-size:13px;margin-top:48px}
    footer a{color:var(--text2);margin:0 10px}
    /* NAV */
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
    /* RELEASE TICKER */
    @keyframes ticker-scroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
    .release-ticker{background:rgba(201,168,76,.06);border-bottom:1px solid rgba(201,168,76,.15);height:36px;display:flex;align-items:center;overflow:hidden;position:relative}
    .ticker-fade-l{position:absolute;left:0;top:0;bottom:0;width:60px;background:linear-gradient(to right,#0f1117,transparent);z-index:2;pointer-events:none}
    .ticker-fade-r{position:absolute;right:0;top:0;bottom:0;width:60px;background:linear-gradient(to left,#0f1117,transparent);z-index:2;pointer-events:none}
    .ticker-label{font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);white-space:nowrap;padding:0 16px 0 20px;flex-shrink:0;z-index:3}
    .ticker-track{display:flex;animation:ticker-scroll 36s linear infinite;flex-shrink:0}
    .ticker-track:hover{animation-play-state:paused}
    .ticker-item{display:inline-flex;align-items:center;gap:8px;padding:0 28px;font-size:12px;color:var(--text2);white-space:nowrap}
    .ticker-item strong{color:var(--text)}
    /* FORMAT PILLS */
    .fmt-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-bottom:32px}
    .fmt-pill{display:flex;flex-direction:column;gap:2px;padding:10px 14px;border-radius:8px;border:1px solid;background:rgba(255,255,255,.03);text-decoration:none;transition:all .2s}
    .fmt-pill:hover{background:rgba(255,255,255,.06);text-decoration:none;transform:translateY(-1px)}
    .fmt-pill-name{font-size:13px;font-weight:700}
    .fmt-pill-sets{font-size:10px;color:var(--text2);line-height:1.3}
    /* MOVERS */
    .movers-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:32px}
    .movers-col{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:16px}
    .movers-col-title{font-size:13px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:8px}
    .mover-card{display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);text-decoration:none;transition:opacity .2s}
    .mover-card:last-child{border-bottom:none}
    .mover-card:hover{opacity:.8;text-decoration:none}
    .mover-img{width:36px;flex-shrink:0}
    .mover-img img{width:36px;border-radius:3px;display:block}
    .mover-no-img{width:36px;height:50px;background:var(--bg3);border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--text2)}
    .mover-info{flex:1;min-width:0}
    .mover-name{font-size:11px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .mover-set{font-size:9px;color:var(--text2);margin-bottom:2px}
    .mover-prices{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    /* SET LIST */
    .set-item{background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:7px 10px;text-decoration:none;color:var(--text);display:flex;align-items:center;gap:6px;transition:border-color .15s}
    .set-item:hover{border-color:var(--accent);text-decoration:none;color:var(--text)}
    .set-name{font-weight:600;font-size:12px;flex:1}
    .set-year{font-size:10px;color:var(--text2);flex-shrink:0}
    .new-badge{font-size:8px;font-weight:800;background:var(--gold);color:#000;border-radius:3px;padding:1px 4px;letter-spacing:.05em;flex-shrink:0}
    /* AZ FILTER */
    .az-btn{padding:4px 8px;border-radius:5px;border:1px solid var(--border);background:none;color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;min-width:28px}
    .az-btn:hover{background:var(--bg3);border-color:var(--text2);color:var(--text)}
    .az-btn.active{background:var(--accent);border-color:var(--accent);color:#000}
    .az-count{font-size:9px;opacity:.7;margin-left:2px}
    /* ERA LEGEND */
    .era-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}
    /* TOP CARDS */
    .top-card{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center;display:block;transition:border-color .2s;text-decoration:none}
    .top-card:hover{border-color:var(--accent);text-decoration:none}
    .top-card img{width:100%;border-radius:6px}
    .top-card-placeholder{height:80px;display:flex;align-items:center;justify-content:center;color:var(--text2);font-size:11px}
    .top-card-name{font-size:11px;margin-top:4px;color:var(--text)}
    .top-card-price{font-size:12px;color:var(--accent);font-weight:bold}
    /* COMMANDER CAROUSEL */
    @keyframes cmd-scroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
    @keyframes shimmer{0%,100%{opacity:.4}50%{opacity:.8}}
    .cmd-track{display:flex;gap:12px;width:max-content}
    .cmd-track.loaded{animation:cmd-scroll 50s linear infinite}
    .cmd-track:hover{animation-play-state:paused}
    .cmd-card{display:inline-flex;flex-direction:column;min-width:140px;max-width:155px;background:rgba(107,107,255,.06);border:1px solid rgba(107,107,255,.2);border-radius:10px;overflow:hidden;text-decoration:none;transition:all .22s;flex-shrink:0}
    .cmd-card:hover{transform:translateY(-3px);border-color:rgba(107,107,255,.5);box-shadow:0 8px 24px rgba(107,107,255,.15);text-decoration:none}
    .cmd-card img{width:100%;aspect-ratio:745/1040;object-fit:cover;display:block}
    .cmd-card-body{padding:7px 9px 9px;display:flex;flex-direction:column;gap:2px}
    .cmd-card-name{font-family:Cinzel,serif;font-size:9.5px;font-weight:700;color:#C0C0FF;line-height:1.3}
    .cmd-card-identity{font-size:9px;color:rgba(160,168,192,.5)}
    .cmd-card-cta{font-size:8.5px;font-weight:600;color:#9898FF;letter-spacing:.06em;text-transform:uppercase;margin-top:3px}
    /* MOBILE */
    @media(max-width:768px){
      .nav-search-wrap{max-width:200px}
      .nav-links{display:none}
      .wrap{padding:0 12px}
      .movers-grid{grid-template-columns:1fr}
      .fmt-strip{grid-template-columns:1fr 1fr}
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
      <a href="/cards" class="nav-link nav-link--active">Card Vault</a>
      <a href="/cards/mtg" class="nav-link" style="color:#C9A84C;border-color:rgba(201,168,76,.5);background:rgba(201,168,76,.08)">MTG</a>
      <a href="/compare" class="nav-link nav-link--compare">Compare</a>
      <a href="/market" class="nav-link nav-link--market">Market</a>
      <a href="/tools.html" class="nav-link nav-link--tools">Tools</a>
      <a href="/play.html" class="nav-link nav-link--play">Play</a>
      <a href="/blog" class="nav-link nav-link--blog">Blog</a>
      <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=C3Nav&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="nav-link nav-link--ebay">Shop eBay &#8599;</a>
    </div>
  </div>
</nav>

<!-- Release Calendar Ticker -->
<div class="release-ticker">
  <div class="ticker-fade-l"></div>
  <div class="ticker-fade-r"></div>
  <span class="ticker-label">&#128197; Upcoming</span>
  <div class="ticker-track">${tickerItems}</div>
</div>

<div class="wrap" style="padding-top:28px">
  <h1 style="font-size:32px;margin-bottom:8px">MTG Card Prices in Australia</h1>
  <p style="color:var(--text2);margin-bottom:28px">Australia's MTG price guide with live AUD pricing, 52-week price ranges, and direct eBay AU buy links. Updated daily.</p>

  <!-- Quick Access -->
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:28px">
    <a href="https://www.ebay.com.au/sch/i.html?_nkw=mtg+magic+gathering+cards&campid=${EPN_CAMPID}&customid=C3MTGHub" target="_blank" rel="noopener" class="btn btn-primary">&#128722; Shop MTG on eBay &#8599;</a>
    <a href="/cards/mtg/random-commander" class="btn btn-secondary">&#127922; Random Commander</a>
    <a href="/ev-calculator.html" class="btn btn-secondary">&#128202; EV Calculator</a>
    <a href="/compare" class="btn btn-secondary">&#128203; Compare Cards</a>
  </div>

  <!-- Format Ban Lists Strip -->
  <div style="margin-bottom:28px">
    <h2 style="font-size:11px;margin-bottom:12px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.08em">Format Ban Lists</h2>
    <div class="fmt-strip">${formatPills}</div>
  </div>

  <!-- Commander Carousel -->
  <div style="margin-bottom:32px;padding:24px;background:rgba(107,107,255,.04);border:1px solid rgba(107,107,255,.15);border-radius:var(--radius);overflow:hidden">
    <div style="text-align:center;margin-bottom:20px">
      <p style="font-size:10px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:#9898FF;margin-bottom:6px">Commander Spotlight</p>
      <h2 style="font-family:Cinzel,serif;font-size:20px;color:var(--text);margin:0">Your Next Commander Awaits</h2>
    </div>
    <div style="overflow:hidden;position:relative;mask-image:linear-gradient(to right,transparent,black 4%,black 96%,transparent);-webkit-mask-image:linear-gradient(to right,transparent,black 4%,black 96%,transparent)">
      <div id="cmd-mtg-carousel-track" class="cmd-track">
        <div style="min-width:140px;height:200px;background:rgba(107,107,255,.08);border-radius:8px;animation:shimmer 1.5s infinite"></div>
        <div style="min-width:140px;height:200px;background:rgba(107,107,255,.08);border-radius:8px;animation:shimmer 1.5s .1s infinite"></div>
        <div style="min-width:140px;height:200px;background:rgba(107,107,255,.08);border-radius:8px;animation:shimmer 1.5s .2s infinite"></div>
        <div style="min-width:140px;height:200px;background:rgba(107,107,255,.08);border-radius:8px;animation:shimmer 1.5s .3s infinite"></div>
        <div style="min-width:140px;height:200px;background:rgba(107,107,255,.08);border-radius:8px;animation:shimmer 1.5s .4s infinite"></div>
      </div>
    </div>
    <div style="text-align:center;margin-top:14px">
      <a href="/cards/mtg/random-commander" style="font-size:12px;color:#9898FF">Generate a random Commander &rarr;</a>
    </div>
  </div>

  ${hasMovers ? `<!-- Weekly Market Pulse -->
  <div style="margin-bottom:32px">
    <h2 style="font-size:20px;margin-bottom:4px">&#128200; Weekly Market Pulse</h2>
    <p style="color:var(--text2);font-size:13px;margin-bottom:16px">Biggest price movers across all MTG cards in the last 7 days.</p>
    <div class="movers-grid">
      <div class="movers-col">
        <div class="movers-col-title"><span style="color:#4ADE80">&#8593;</span> Biggest Gainers</div>
        ${gainerHTML || '<p style="color:var(--text2);font-size:13px">No significant gainers this week.</p>'}
      </div>
      <div class="movers-col">
        <div class="movers-col-title"><span style="color:#f87171">&#8595;</span> Biggest Losers</div>
        ${loserHTML || '<p style="color:var(--text2);font-size:13px">No significant losers this week.</p>'}
      </div>
    </div>
  </div>` : ''}

  <!-- Most Valuable Cards -->
  <div style="margin-bottom:32px">
    <h2 style="font-size:20px;margin-bottom:16px">&#127942; Most Valuable MTG Cards (AUD)</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px">
      ${topCardHTML}
    </div>
    <p style="color:var(--text2);font-size:13px;margin-top:16px">Prices in AUD based on live USD conversion. Updated daily.</p>
  </div>

  <!-- Set Browser -->
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:32px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px">
      <h2 style="font-size:18px">${totalSets}+ MTG Sets</h2>
      <span style="font-size:12px;color:var(--text2)">Click any set to view cards and prices</span>
    </div>

    <!-- Era legend -->
    <div style="display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap">
      <span style="font-size:11px;color:var(--text2)"><span class="era-dot" style="background:#4ADE80"></span>2020 and newer</span>
      <span style="font-size:11px;color:var(--text2)"><span class="era-dot" style="background:#60A5FA"></span>2010 to 2019</span>
      <span style="font-size:11px;color:var(--text2)"><span class="era-dot" style="background:#C9A84C"></span>Pre-2010</span>
    </div>

    <!-- A-Z Filter -->
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px">
      <button class="az-btn" onclick="filterAZ('0',this)">0-9${letterCounts['0'] ? '<span class="az-count">('+letterCounts['0']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('A',this)">A${letterCounts['A'] ? '<span class="az-count">('+letterCounts['A']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('B',this)">B${letterCounts['B'] ? '<span class="az-count">('+letterCounts['B']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('C',this)">C${letterCounts['C'] ? '<span class="az-count">('+letterCounts['C']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('D',this)">D${letterCounts['D'] ? '<span class="az-count">('+letterCounts['D']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('E',this)">E${letterCounts['E'] ? '<span class="az-count">('+letterCounts['E']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('F',this)">F${letterCounts['F'] ? '<span class="az-count">('+letterCounts['F']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('G',this)">G${letterCounts['G'] ? '<span class="az-count">('+letterCounts['G']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('H',this)">H${letterCounts['H'] ? '<span class="az-count">('+letterCounts['H']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('I',this)">I${letterCounts['I'] ? '<span class="az-count">('+letterCounts['I']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('J',this)">J${letterCounts['J'] ? '<span class="az-count">('+letterCounts['J']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('K',this)">K${letterCounts['K'] ? '<span class="az-count">('+letterCounts['K']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('L',this)">L${letterCounts['L'] ? '<span class="az-count">('+letterCounts['L']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('M',this)">M${letterCounts['M'] ? '<span class="az-count">('+letterCounts['M']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('N',this)">N${letterCounts['N'] ? '<span class="az-count">('+letterCounts['N']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('O',this)">O${letterCounts['O'] ? '<span class="az-count">('+letterCounts['O']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('P',this)">P${letterCounts['P'] ? '<span class="az-count">('+letterCounts['P']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('Q',this)">Q${letterCounts['Q'] ? '<span class="az-count">('+letterCounts['Q']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('R',this)">R${letterCounts['R'] ? '<span class="az-count">('+letterCounts['R']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('S',this)">S${letterCounts['S'] ? '<span class="az-count">('+letterCounts['S']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('T',this)">T${letterCounts['T'] ? '<span class="az-count">('+letterCounts['T']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('U',this)">U${letterCounts['U'] ? '<span class="az-count">('+letterCounts['U']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('V',this)">V${letterCounts['V'] ? '<span class="az-count">('+letterCounts['V']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('W',this)">W${letterCounts['W'] ? '<span class="az-count">('+letterCounts['W']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('X',this)">X${letterCounts['X'] ? '<span class="az-count">('+letterCounts['X']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('Y',this)">Y${letterCounts['Y'] ? '<span class="az-count">('+letterCounts['Y']+')</span>' : ''}</button>
      <button class="az-btn" onclick="filterAZ('Z',this)">Z${letterCounts['Z'] ? '<span class="az-count">('+letterCounts['Z']+')</span>' : ''}</button>
    </div>

    <!-- Set name search -->
    <div style="margin-bottom:12px">
      <input type="text" id="set-search" placeholder="Search sets e.g. Bloomburrow, Tarkir, Modern Horizons..." oninput="filterSets(this.value)" autocomplete="off" style="max-width:500px;width:100%">
    </div>

    <!-- Default prompt -->
    <div id="set-prompt" style="padding:20px 0;text-align:center;color:var(--text2);font-size:14px">
      Select a letter or search above to browse ${totalSets} sets
    </div>

    <!-- Set list (hidden by default) -->
    <div id="set-list" style="display:none;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px">
      ${setListHTML}
    </div>
  </div>

  <!-- Blog guides -->
  <div style="margin-bottom:48px">
    <h2 style="font-size:18px;margin-bottom:16px">MTG Guides</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">
      <a href="/blog/best-mtg-booster-boxes-australia/" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px;color:var(--text);display:block;text-decoration:none">
        <div style="font-weight:bold;margin-bottom:4px;color:var(--accent)">Best MTG Booster Boxes in Australia</div>
        <div style="font-size:13px;color:var(--text2)">Which boxes are worth opening right now and where to buy at the best price.</div>
      </a>
      <a href="/blog/mtg-singles-vs-booster-boxes-australia/" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px;color:var(--text);display:block;text-decoration:none">
        <div style="font-weight:bold;margin-bottom:4px;color:var(--accent)">Singles vs Booster Boxes</div>
        <div style="font-size:13px;color:var(--text2)">Should you buy the card you want directly or gamble on packs? The honest answer.</div>
      </a>
      <a href="/blog/how-to-sell-mtg-cards-australia/" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px;color:var(--text);display:block;text-decoration:none">
        <div style="font-weight:bold;margin-bottom:4px;color:var(--accent)">How to Sell MTG Cards in Australia</div>
        <div style="font-size:13px;color:var(--text2)">eBay, local stores, or buylist? Here is what actually gets you the best price.</div>
      </a>
      <a href="/ev-calculator.html" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px;color:var(--text);display:block;text-decoration:none">
        <div style="font-weight:bold;margin-bottom:4px;color:var(--accent)">MTG EV Calculator</div>
        <div style="font-size:13px;color:var(--text2)">Is your booster box worth opening? Calculate expected value before you crack it.</div>
      </a>
    </div>
  </div>
</div>

<footer>
  <p><a href="/">Home</a><a href="/cards">Card Vault</a><a href="/cards/mtg">MTG Cards</a><a href="/cards/mtg/banned">MTG Banned</a><a href="/ev-calculator.html">EV Calculator</a><a href="/blog">Blog</a><a href="/tracker.html">Free Tracker</a></p>
  <p style="margin-top:8px;font-size:12px">Prices updated daily. All prices in AUD. &copy; 2026 Cards on Cards on Cards &middot; Affiliate links may earn a small commission.</p>
</footer>

<script>
var currentLetter = null;

function showSets() {
  var list = document.getElementById('set-list');
  var prompt = document.getElementById('set-prompt');
  list.style.display = 'grid';
  prompt.style.display = 'none';
}

function hideSets() {
  var list = document.getElementById('set-list');
  var prompt = document.getElementById('set-prompt');
  list.style.display = 'none';
  prompt.style.display = 'block';
}

function filterAZ(letter, btn) {
  var btns = document.querySelectorAll('.az-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
  btn.classList.add('active');
  document.getElementById('set-search').value = '';
  currentLetter = letter;
  showSets();
  var items = document.querySelectorAll('.set-item');
  for (var j = 0; j < items.length; j++) {
    items[j].style.display = items[j].dataset.letter === letter ? '' : 'none';
  }
}

function filterSets(query) {
  var q = query.toLowerCase().trim();
  if (!q) {
    var btns = document.querySelectorAll('.az-btn');
    for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
    if (currentLetter) {
      hideSets();
      currentLetter = null;
    }
    return;
  }
  currentLetter = null;
  var btns = document.querySelectorAll('.az-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
  showSets();
  var items = document.querySelectorAll('.set-item');
  var any = false;
  for (var j = 0; j < items.length; j++) {
    var name = items[j].dataset.name || '';
    var show = name.indexOf(q) !== -1;
    items[j].style.display = show ? '' : 'none';
    if (show) any = true;
  }
  if (!any) {
    document.getElementById('set-prompt').style.display = 'block';
    document.getElementById('set-prompt').textContent = 'No sets found for "' + query + '"';
    document.getElementById('set-list').style.display = 'none';
  }
}
</script>

<script>
(function() {
  function buildCmdCard(c) {
    var img = c.image
      ? '<img src="' + c.image + '" alt="' + c.name.replace(/"/g, '&quot;') + '" loading="lazy">'
      : '<div style="aspect-ratio:745/1040;background:rgba(107,107,255,.1);display:flex;align-items:center;justify-content:center;font-size:28px">&#127922;</div>';
    return '<a href="' + c.cardVaultUrl + '" class="cmd-card">'
      + img
      + '<div class="cmd-card-body">'
      + '<div class="cmd-card-name">' + c.name.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>'
      + '<div class="cmd-card-identity">' + (c.identityName||'').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>'
      + '<div class="cmd-card-cta">View Card &rarr;</div>'
      + '</div></a>';
  }
  function loadCommanders() {
    var track = document.getElementById('cmd-mtg-carousel-track');
    if (!track) return;
    fetch('/.netlify/functions/commander-carousel?mode=top')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.commanders || !data.commanders.length) { track.innerHTML = '<p style="color:#A0A8C0;font-size:12px;padding:12px">No commanders found.</p>'; return; }
        var arr = data.commanders.slice();
        for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(Math.random()*(i+1)); var tmp=arr[i];arr[i]=arr[j];arr[j]=tmp; }
        var twenty = arr.slice(0, 20);
        var html = '';
        for (var k = 0; k < twenty.length; k++) html += buildCmdCard(twenty[k]);
        track.innerHTML = html + html;
        track.classList.add('loaded');
      })
      .catch(function() { track.innerHTML = '<p style="color:#A0A8C0;font-size:12px;padding:12px">Could not load commanders.</p>'; });
  }
  loadCommanders();
})();
</script>

<!-- GA4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600' }
  });
};

export const config = { path: '/cards/mtg' };
