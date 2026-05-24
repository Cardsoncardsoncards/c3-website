// netlify/functions/mtg-hub.mjs
// Serves: /cards/mtg
// Rebuilt 24 May 2026 -- carousel for Most Valuable, set browser moved below Commander, 40s speeds, 24 top cards

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

function esc(str) {
  return (str == null ? '' : String(str))
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

const SHOW_TYPES = new Set(['expansion','core','masters','draft_innovation','starter','archenemy','planechase','box','funny','spellbook']);

const ROTATING_SETS = ['Wilds of Eldraine','Lost Caverns of Ixalan','Murders at Karlov Manor','Outlaws of Thunder Junction'];
const ROTATION_DATE = 'Bloomburrow block rotates ~Sep 2026';

const UPCOMING = [
  { name: 'Marvel Super Heroes', date: '2026-06-01', type: 'Set Release' },
  { name: 'The Hobbit',          date: '2026-08-01', type: 'Set Release' },
  { name: 'Reality Fracture',    date: '2026-10-01', type: 'Set Release' },
  { name: 'Star Trek',           date: '2026-11-01', type: 'Set Release' },
];

const FORMATS = [
  { name: 'Standard',  color: '#4ADE80', sets: 'Duskmourn, Foundations, Aetherdrift, Tarkir: Dragonstorm', href: '/cards/mtg/banned/standard' },
  { name: 'Pioneer',   color: '#60A5FA', sets: 'Return to Ravnica onward, no fetchlands',                  href: '/cards/mtg/banned/pioneer' },
  { name: 'Modern',    color: '#FB923C', sets: 'Eighth Edition onward',                                     href: '/cards/mtg/banned/modern' },
  { name: 'Commander', color: '#F472B6', sets: 'All sets, own banned list',                                 href: '/cards/mtg/banned/commander' },
];

const EV_SETS = [
  { name: 'Modern Horizons 3',    ev: 'AU$420+', note: 'Highest EV box currently',    tier: 'high' },
  { name: 'Commander Masters',    ev: 'AU$280+', note: 'Strong reprint value',         tier: 'high' },
  { name: 'Murders at Karlov Manor', ev: 'AU$110+', note: 'Good for singles',          tier: 'mid' },
  { name: 'Tarkir: Dragonstorm',  ev: 'AU$130+', note: 'New release, high demand',    tier: 'high' },
];

export default async (req) => {
  const today = new Date(); today.setHours(0,0,0,0);
  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0,10);
  const twoDaysAgo   = new Date(Date.now() - 2 * 864e5).toISOString().slice(0,10);

  const [sets, topCards, snapNow, snapOld, latestSnap] = await Promise.allSettled([
    supabaseGet('mtg_sets?order=release_date.desc&limit=1000&digital=eq.false&select=set_code,set_name,set_slug,set_type,release_date'),
    supabaseGet('mtg_cards?order=price_usd.desc&limit=24&select=slug,name,image_uri_small,price_usd,price_aud&price_usd=gte.10&image_uri_small=not.is.null'),
    supabaseGet(`mtg_price_snapshots?select=scryfall_id,price_aud&snapshot_date=gte.${twoDaysAgo}&order=price_aud.desc&limit=3000`),
    supabaseGet(`mtg_price_snapshots?select=scryfall_id,price_aud&snapshot_date=gte.${sevenDaysAgo}&snapshot_date=lte.${sevenDaysAgo}&order=snapshot_date.asc&limit=3000`),
    supabaseGet('mtg_price_snapshots?select=snapshot_date&order=snapshot_date.desc&limit=1'),
  ]);

  const setsData      = sets.status === 'fulfilled'      ? sets.value      : [];
  const topCardsData  = topCards.status === 'fulfilled'   ? topCards.value  : [];
  const snapNowData   = snapNow.status === 'fulfilled'    ? snapNow.value   : [];
  const snapOldData   = snapOld.status === 'fulfilled'    ? snapOld.value   : [];
  const latestSnapData= latestSnap.status === 'fulfilled' ? latestSnap.value: [];

  const lastSynced = latestSnapData.length ? latestSnapData[0].snapshot_date : null;
  const syncLabel  = lastSynced ? `Prices last updated: ${lastSynced}` : 'Prices updated daily';

  const filteredSets = setsData.filter(s => SHOW_TYPES.has(s.set_type));
  const totalSets    = filteredSets.length;

  // Letter counts for A-Z buttons
  const letterCounts = {};
  filteredSets.forEach(s => {
    const fc = (s.set_name[0] || '').toUpperCase();
    const lk = /[0-9]/.test(fc) ? '0' : fc;
    letterCounts[lk] = (letterCounts[lk] || 0) + 1;
  });

  // Set list HTML
  const setListHTML = filteredSets.map(s => {
    const year = s.release_date ? s.release_date.slice(0,4) : '';
    const color = eraColor(year);
    const firstChar = (s.set_name[0] || '').toUpperCase();
    const lk = /[0-9]/.test(firstChar) ? '0' : firstChar;
    const safeName = esc(s.set_name.toLowerCase());
    const isNew = s.release_date && s.release_date >= new Date(Date.now() - 45*864e5).toISOString().slice(0,10);
    const newBadge = isNew ? '<span class="new-badge">NEW</span>' : '';
    return `<a href="/cards/mtg/sets/${esc(s.set_slug)}" class="set-item" data-letter="${lk}" data-name="${safeName}" style="border-left:3px solid ${color}">
      <span class="set-name">${esc(s.set_name)}${newBadge}</span>
      <span class="set-year">${year}</span>
    </a>`;
  }).join('');

  // Price movers from snapshots
  const nowMap = {};
  snapNowData.forEach(r => { if (r.price_aud) nowMap[r.scryfall_id] = parseFloat(r.price_aud); });
  const oldMap = {};
  snapOldData.forEach(r => { if (r.price_aud) oldMap[r.scryfall_id] = parseFloat(r.price_aud); });

  const movers = [];
  Object.entries(nowMap).forEach(([sid, nowPrice]) => {
    const oldPrice = oldMap[sid];
    if (!oldPrice || oldPrice < 2 || nowPrice < 2) return;
    const pct = ((nowPrice - oldPrice) / oldPrice) * 100;
    if (Math.abs(pct) > 5) movers.push({ sid, nowPrice, oldPrice, pct });
  });
  movers.sort((a,b) => Math.abs(b.pct) - Math.abs(a.pct));
  const gainers = movers.filter(m => m.pct > 0).slice(0,5);
  const losers  = movers.filter(m => m.pct < 0).slice(0,5);

  // Fetch card details for movers
  let moverDetails = {};
  const moverSids = [...gainers, ...losers].map(m => m.sid);
  if (moverSids.length > 0) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const url = `${SUPABASE_URL}/rest/v1/mtg_cards?select=scryfall_id,name,slug,image_uri_small,set_name&limit=20&scryfall_id=in.(${moverSids.map(s => '"'+s+'"').join(',')})`;
      const res = await fetch(url, { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) data.forEach(c => { moverDetails[c.scryfall_id] = c; });
      }
    } catch { clearTimeout(timer); }
  }

  function moverCardHTML(m, isGainer) {
    const c = moverDetails[m.sid];
    if (!c) return '';
    const arrow = isGainer ? '&#8593;' : '&#8595;';
    const col   = isGainer ? '#4ADE80' : '#f87171';
    const img   = c.image_uri_small ? `<img src="${esc(c.image_uri_small)}" alt="${esc(c.name)}" loading="lazy" style="width:40px;height:56px;object-fit:cover;border-radius:4px;flex-shrink:0">` : `<div style="width:40px;height:56px;background:var(--bg3);border-radius:4px;flex-shrink:0"></div>`;
    return `<a href="/cards/mtg/${esc(c.slug)}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;text-decoration:none;transition:border-color .2s" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
      ${img}
      <div style="min-width:0;flex:1">
        <div style="font-size:11.5px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.name)}</div>
        <div style="font-size:10px;color:var(--text2)">${esc(c.set_name||'')}</div>
        <div style="font-size:11px;color:var(--accent);font-weight:700">AU$${m.nowPrice.toFixed(0)}</div>
      </div>
      <div style="font-size:12px;font-weight:700;color:${col};flex-shrink:0">${arrow}${Math.abs(m.pct).toFixed(1)}%</div>
    </a>`;
  }

  const hasMovers = gainers.length > 0 || losers.length > 0;
  const gainerHTML = gainers.map(m => moverCardHTML(m,true)).filter(Boolean).join('');
  const loserHTML  = losers.map(m => moverCardHTML(m,false)).filter(Boolean).join('');

  // Top cards carousel (24 cards, doubled for infinite scroll)
  const carouselItems = topCardsData.map(c => {
    const price = c.price_aud > 0 ? parseFloat(c.price_aud) : (c.price_usd ? c.price_usd * 1.58 : 0);
    const priceStr = price > 0 ? 'AU$' + price.toFixed(0) : '';
    const img = c.image_uri_small ? `<img src="${esc(c.image_uri_small)}" alt="${esc(c.name)}" loading="lazy" onerror="this.onerror=null;this.style.opacity=0.3">` : `<div class="card-placeholder">&#9775;</div>`;
    const ebayUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(c.name+' mtg card')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
    return `<a href="/cards/mtg/${esc(c.slug)}" class="carousel-card">
      <div class="carousel-img-wrap">${img}</div>
      <div class="carousel-name">${esc(c.name)}</div>
      <div class="carousel-price">${priceStr}</div>
      <div class="carousel-buy-row"><a href="${ebayUrl}" target="_blank" rel="noopener" class="carousel-buy-btn" onclick="event.stopPropagation()">Buy eBay &#8599;</a></div>
    </a>`;
  }).join('');

  // Ticker -- filter past events
  const upcoming = UPCOMING.filter(e => new Date(e.date+'T00:00:00') >= today);
  const tickerItems = [...upcoming, ...upcoming].map(r => {
    const days = Math.round((new Date(r.date+'T00:00:00') - today) / 86400000);
    const label = days === 0 ? 'TODAY' : days === 1 ? 'TOMORROW' : 'IN ' + days + ' DAYS';
    return `<span class="ticker-item"><span class="ticker-badge">${label}</span><strong>${esc(r.name)}</strong> &middot; ${esc(r.type)}</span>`;
  }).join('');

  // Format ban list pills
  const formatPills = FORMATS.map(f =>
    `<a href="${f.href}" style="display:inline-flex;flex-direction:column;gap:3px;padding:10px 16px;background:var(--bg2);border:1px solid var(--border);border-left:3px solid ${f.color};border-radius:8px;text-decoration:none;min-width:150px;transition:all .2s" onmouseover="this.style.borderColor='${f.color}'" onmouseout="this.style.borderLeftColor='${f.color}';this.style.borderTopColor=this.style.borderRightColor=this.style.borderBottomColor='var(--border)'">
      <span style="font-size:13px;font-weight:700;color:${f.color}">${esc(f.name)}</span>
      <span style="font-size:11px;color:var(--text2)">${esc(f.sets)}</span>
    </a>`
  ).join('');

  // EV sets
  const evHTML = EV_SETS.map(s => {
    const col = s.tier === 'high' ? '#4ADE80' : '#FB923C';
    return `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px">
      <div style="font-size:18px;font-weight:800;color:${col};margin-bottom:2px">${esc(s.ev)}</div>
      <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:2px">${esc(s.name)}</div>
      <div style="font-size:11px;color:var(--text2)">${esc(s.note)}</div>
    </div>`;
  }).join('');

  // AZ buttons with counts
  const azLetters = ['0','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
  const azBtns = azLetters.map(l => {
    const label = l === '0' ? '0-9' : l;
    const count = letterCounts[l] ? `<span class="az-count">(${letterCounts[l]})</span>` : '';
    return `<button class="az-btn" onclick="filterAZ('${l}',this)">${label}${count}</button>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>MTG Card Prices Australia | AUD Prices Updated Daily | Cards on Cards on Cards</title>
  <meta name="description" content="Browse ${totalSets}+ MTG sets. Live AUD card prices, 7-day price trends, eBay AU buy links. Australia's most complete Magic: The Gathering price guide, updated daily.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/mtg">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <meta property="og:title" content="MTG Card Prices Australia | Cards on Cards on Cards">
  <meta property="og:description" content="${totalSets}+ sets, 96k+ cards. Live AUD prices and eBay AU buy links updated daily.">
  <meta property="og:image" content="https://cardsoncardsoncards.com.au/c3ogbanner.png">
  <meta property="og:url" content="https://cardsoncardsoncards.com.au/cards/mtg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <style>
    :root{--bg:#0A0C14;--bg2:#111420;--bg3:#181d2e;--gold:#C9A84C;--accent:#9898FF;--accent-rgb:152,152,255;--text:#e8eaf0;--text2:#9ba3c4;--border:#242840;--radius:12px;--silver:#A0A8C0}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6;min-height:100vh;overflow-x:hidden}
    body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(ellipse 70% 40% at 50% 0%,rgba(152,152,255,.05),transparent 60%)}
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
    .nav-link--active{color:var(--accent);border-color:rgba(152,152,255,.4);background:rgba(152,152,255,.07)}
    .nav-link--compare{color:#a78bfa;border-color:rgba(167,139,250,.3)}.nav-link--compare:hover{background:rgba(167,139,250,.06);border-color:#a78bfa}
    .nav-link--market{color:#4ADE80;border-color:rgba(74,222,128,.3)}.nav-link--market:hover{background:rgba(74,222,128,.06);border-color:#4ADE80}
    .nav-link--tools{color:#60A5FA;border-color:rgba(96,165,250,.3)}.nav-link--tools:hover{background:rgba(96,165,250,.06);border-color:#60A5FA}
    .nav-link--play{color:#F472B6;border-color:rgba(244,114,182,.3)}.nav-link--play:hover{background:rgba(244,114,182,.06);border-color:#F472B6}
    .nav-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.3)}.nav-link--blog:hover{background:rgba(126,203,161,.06);border-color:#7ECBA1}
    .nav-link--ebay{color:#4ADE80;border-color:rgba(74,222,128,.3);background:rgba(74,222,128,.05)}.nav-link--ebay:hover{background:rgba(74,222,128,.1);border-color:#4ADE80}
    /* TICKER */
    .release-ticker{background:rgba(152,152,255,.06);border-bottom:1px solid rgba(152,152,255,.15);height:36px;display:flex;align-items:center;overflow:hidden;position:relative}
    .ticker-fade-l{position:absolute;left:0;top:0;bottom:0;width:60px;background:linear-gradient(to right,#0f1117,transparent);z-index:2;pointer-events:none}
    .ticker-fade-r{position:absolute;right:0;top:0;bottom:0;width:60px;background:linear-gradient(to left,#0f1117,transparent);z-index:2;pointer-events:none}
    .ticker-label{font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);white-space:nowrap;padding:0 16px 0 20px;flex-shrink:0;z-index:3}
    .ticker-track{display:flex;animation:tickerScroll 50s linear infinite;flex-shrink:0}
    .ticker-track:hover{animation-play-state:paused}
    @keyframes tickerScroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
    .ticker-item{display:inline-flex;align-items:center;gap:8px;padding:0 28px;font-size:12px;color:var(--text2);white-space:nowrap}
    .ticker-item strong{color:var(--text)}
    .ticker-badge{font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;background:rgba(152,152,255,.15);color:var(--accent);letter-spacing:.06em}
    /* HERO */
    .hero{padding:52px 24px 36px;text-align:center;position:relative;z-index:1}
    .hero-eyebrow{font-size:10px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--gold);margin-bottom:12px}
    h1{font-family:'Cinzel',serif;font-size:clamp(24px,5vw,50px);font-weight:900;color:var(--text);margin-bottom:12px;line-height:1.1}
    .gold{color:var(--gold)}
    .hero-sub{font-size:14px;color:var(--text2);max-width:520px;margin:0 auto 8px}
    .stat-bar{display:flex;justify-content:center;border:1px solid var(--border);border-radius:12px;overflow:hidden;max-width:540px;margin:0 auto 32px;background:var(--bg2)}
    .stat-item{flex:1;padding:14px 10px;text-align:center;border-right:1px solid var(--border)}.stat-item:last-child{border-right:none}
    .stat-num{font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:var(--accent)}
    .stat-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text2);margin-top:2px}
    /* QUICK LINKS */
    .quick-links{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:28px;justify-content:center;padding:0 24px}
    .quick-link{display:inline-flex;align-items:center;gap:7px;padding:9px 18px;border-radius:10px;font-weight:700;font-size:12.5px;text-decoration:none;transition:all .2s;border:1px solid transparent}
    .quick-link:hover{opacity:.88;transform:translateY(-1px);text-decoration:none}
    /* ROTATION STRIP */
    .rotation-strip{display:flex;align-items:flex-start;gap:12px;background:rgba(251,146,60,.06);border:1px solid rgba(251,146,60,.2);border-radius:10px;padding:14px 16px;margin-bottom:20px}
    .rotation-icon{font-size:18px;flex-shrink:0;margin-top:2px}
    .rotation-sets{font-size:12.5px;color:var(--text2);margin-top:3px;line-height:1.5}
    /* CAROUSEL */
    .carousel-section{position:relative;z-index:1;margin-bottom:28px}
    .carousel-label{font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);margin-bottom:8px;padding:0 24px}
    .carousel-title{font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:var(--text);margin-bottom:16px;padding:0 24px}
    .carousel-source{font-size:11px;color:var(--text2);padding:6px 24px 0;opacity:.7}
    .carousel-track-wrap{overflow:hidden;position:relative}
    .carousel-track-wrap::before,.carousel-track-wrap::after{content:'';position:absolute;top:0;bottom:0;width:60px;z-index:2;pointer-events:none}
    .carousel-track-wrap::before{left:0;background:linear-gradient(to right,var(--bg),transparent)}
    .carousel-track-wrap::after{right:0;background:linear-gradient(to left,var(--bg),transparent)}
    .carousel-track{display:flex;gap:12px;padding:4px 24px 12px;animation:scrollLeft 50s linear infinite}
    .carousel-track:hover{animation-play-state:paused}
    @keyframes scrollLeft{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
    .carousel-card{flex-shrink:0;width:155px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center;text-decoration:none;transition:all .25s;display:block}
    .carousel-card:hover{border-color:var(--accent);transform:translateY(-4px);box-shadow:0 8px 20px rgba(152,152,255,.12);text-decoration:none}
    .carousel-img-wrap{height:130px;display:flex;align-items:center;justify-content:center;margin-bottom:7px;overflow:hidden}
    .carousel-img-wrap img{max-height:130px;max-width:100%;object-fit:contain;border-radius:4px;transition:transform .3s}
    .carousel-card:hover .carousel-img-wrap img{transform:scale(1.05)}
    .card-placeholder{width:80px;height:110px;background:var(--bg3);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--text2)}
    .carousel-name{font-size:11px;color:var(--text);font-weight:600;line-height:1.3;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .carousel-price{font-size:13px;color:var(--gold);font-weight:700;margin-top:3px}
    .carousel-buy-row{margin-top:6px}
    .carousel-buy-btn{font-size:10px;font-weight:700;color:#000;background:var(--gold);padding:3px 8px;border-radius:4px;letter-spacing:.04em;display:inline-block;text-decoration:none}
    /* CMD CAROUSEL */
    .cmd-track{display:flex;gap:10px;padding:4px 24px 12px;transition:none}
    .cmd-track.loaded{animation:scrollLeft 50s linear infinite}
    .cmd-track:hover{animation-play-state:paused}
    .cmd-card{flex-shrink:0;width:140px;display:block;text-decoration:none;border-radius:8px;overflow:hidden;background:var(--bg2);border:1px solid var(--border);transition:all .25s}
    .cmd-card:hover{border-color:#9898FF;transform:translateY(-3px);box-shadow:0 6px 18px rgba(152,152,255,.15);text-decoration:none}
    .cmd-card img{width:100%;display:block;aspect-ratio:745/1040;object-fit:cover}
    .cmd-card-body{padding:8px}
    .cmd-card-name{font-size:11px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px}
    .cmd-card-identity{font-size:10px;color:#9898FF}
    .cmd-card-cta{font-size:10px;color:var(--text2);margin-top:4px}
    @keyframes shimmer{0%{opacity:.4}50%{opacity:.8}100%{opacity:.4}}
    /* WRAP */
    .wrap{max-width:1200px;margin:0 auto;padding:0 24px;position:relative;z-index:1}
    /* SET BROWSER */
    .set-browser{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:32px}
    .az-row{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px}
    .az-btn{padding:5px 9px;border-radius:6px;font-size:11.5px;font-weight:700;cursor:pointer;border:1px solid var(--border);background:var(--bg3);color:var(--text2);font-family:'DM Sans',sans-serif;transition:all .2s;letter-spacing:.04em}
    .az-btn:hover{border-color:var(--accent);color:var(--accent)}
    .az-btn--active{background:var(--accent);color:#000;border-color:var(--accent)}
    .az-count{font-size:9px;opacity:.7;margin-left:2px}
    .era-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:middle}
    .new-badge{font-size:8px;font-weight:800;background:var(--gold);color:#000;border-radius:3px;padding:1px 5px;letter-spacing:.05em;margin-left:5px;vertical-align:middle}
    #set-list{display:none;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px}
    .set-item{display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 12px;text-decoration:none;transition:all .2s;min-width:0}
    .set-item:hover{background:rgba(152,152,255,.04);border-color:var(--accent);transform:translateX(2px)}
    .set-name{flex:1;font-size:12.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}
    .set-year{font-size:10px;color:var(--text2);flex-shrink:0}
    /* MOVERS */
    .movers-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .movers-col-title{font-size:13px;font-weight:700;color:var(--text2);margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em}
    .movers-cards{display:flex;flex-direction:column;gap:6px}
    /* GUIDES */
    .guides-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-bottom:48px}
    .guide-card{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;color:var(--text);display:block;text-decoration:none;transition:all .2s}
    .guide-card:hover{border-color:var(--accent);background:rgba(152,152,255,.04);text-decoration:none}
    .guide-title{font-weight:700;margin-bottom:4px;color:var(--gold)}
    .guide-desc{font-size:13px;color:var(--text2)}
    /* FMT STRIP */
    .fmt-strip{display:flex;flex-wrap:wrap;gap:8px}
    /* MISC */
    .price-source{font-size:11px;color:var(--text2);opacity:.65;margin-top:6px;padding:0 24px}
    input[type=text]{background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:9px 14px;border-radius:8px;font-size:14px;font-family:'DM Sans',sans-serif;width:100%;max-width:500px;transition:border-color .2s}
    input[type=text]::placeholder{color:var(--text2)}
    input[type=text]:focus{outline:none;border-color:var(--accent)}
    @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    .fade-up{animation:fadeUp .5s ease both}.fade-up-1{animation-delay:.08s}.fade-up-2{animation-delay:.16s}.fade-up-3{animation-delay:.24s}
    footer{border-top:1px solid var(--border);padding:28px 24px;text-align:center;font-size:12px;color:var(--text2);margin-top:40px;position:relative;z-index:1}
    footer a{color:var(--text2);margin:0 7px;text-decoration:none}footer a:hover{color:var(--text)}
    @media(max-width:600px){
      .nav-links{gap:2px}.nav-link{font-size:10px;padding:4px 7px}
      .hero{padding:36px 16px 24px}.quick-links{padding:0 12px}.wrap{padding:0 12px}
      .movers-grid{grid-template-columns:1fr}.guides-grid{grid-template-columns:1fr}
      #set-list{grid-template-columns:1fr}
    }
  </style>
</head>
<body>
<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo" title="Cards on Cards on Cards"><img src="/c3logo.png" alt="C3"></a>
    <div class="nav-search-wrap">
      <input class="nav-search-input" type="text" id="nav-q" placeholder="Search cards..." autocomplete="off" onkeydown="if(event.key==='Enter'){var v=this.value.trim();if(v)window.location='/search?q='+encodeURIComponent(v);}">
      <button class="nav-search-btn" onclick="var v=document.getElementById('nav-q').value.trim();if(v)window.location='/search?q='+encodeURIComponent(v);">&#128269;</button>
    </div>
    <div class="nav-links">
      <a href="/cards" class="nav-link nav-link--vault">Card Vault</a>
      <a href="/cards/mtg" class="nav-link nav-link--active">MTG</a>
      <a href="/compare" class="nav-link nav-link--compare">Compare</a>
      <a href="/market" class="nav-link nav-link--market">Market</a>
      <a href="/tools" class="nav-link nav-link--tools">Tools</a>
      <a href="/play" class="nav-link nav-link--play">Play</a>
      <a href="/blog" class="nav-link nav-link--blog">Blog</a>
      <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=C3Nav&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="nav-link nav-link--ebay">Shop eBay &#8599;</a>
    </div>
  </div>
</nav>

${upcoming.length ? `<div class="release-ticker">
  <div class="ticker-fade-l"></div>
  <div class="ticker-fade-r"></div>
  <span class="ticker-label">&#128197; Upcoming MTG</span>
  <div class="ticker-track">${tickerItems}</div>
</div>` : ''}

<div class="hero fade-up">
  <div class="hero-eyebrow">Card Vault -- MTG</div>
  <h1>MTG Card Prices <span class="gold">in Australia</span></h1>
  <p class="hero-sub">Australia's MTG price guide with live AUD pricing, 7-day price trends, and direct eBay AU buy links. Updated daily.</p>
  <div class="stat-bar">
    <div class="stat-item"><div class="stat-num">${totalSets}</div><div class="stat-label">Sets</div></div>
    <div class="stat-item"><div class="stat-num">96K+</div><div class="stat-label">Cards</div></div>
    <div class="stat-item"><div class="stat-num">AU$</div><div class="stat-label">Live Prices</div></div>
    <div class="stat-item"><div class="stat-num">Daily</div><div class="stat-label">Updates</div></div>
  </div>
</div>

<div class="quick-links fade-up fade-up-1">
  <a href="https://www.ebay.com.au/sch/i.html?_nkw=mtg+magic+gathering+cards&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=C3MTGHub&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="quick-link" style="background:var(--gold);color:#000">&#128722; Shop MTG on eBay &#8599;</a>
  <a href="/cards/mtg/random-commander" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#127922; Random Commander</a>
  <a href="/ev-calculator.html" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128202; EV Calculator</a>
  <a href="/compare" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128221; Compare Cards</a>
  <a href="/tracker.html" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128276; Set Price Alerts</a>
  <a href="/quizzes/mtg-archetype" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#127919; MTG Archetype Quiz &#8594;</a>
  <a href="/quizzes/mtg-colour" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#127914; MTG Colour Identity Quiz &#8594;</a>
  <a href="/quizzes/which-tcg-extended" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#127919; Which TCG Should I Play? &#8594;</a>
</div>

<div class="wrap">
  <div class="rotation-strip fade-up fade-up-1">
    <span class="rotation-icon">&#9888;&#65039;</span>
    <div>
      <div style="font-size:13px;font-weight:700;color:#FB923C;margin-bottom:3px">Standard Rotation Approaching</div>
      <div class="rotation-sets">The following sets will rotate out of Standard: <strong>${ROTATING_SETS.join(', ')}</strong>. ${ROTATION_DATE}. Sell rotation-vulnerable cards before prices drop.</div>
    </div>
  </div>

  <div style="margin-bottom:28px">
    <h2 style="font-size:11px;margin-bottom:12px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.08em">Format Ban Lists</h2>
    <div class="fmt-strip">${formatPills}</div>
  </div>
</div>

<!-- Commander Spotlight (full width) -->
<section class="carousel-section fade-up fade-up-2">
  <div class="carousel-label">Commander Spotlight</div>
  <div style="font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:var(--text);margin-bottom:16px;padding:0 24px">Your Next Commander Awaits</div>
  <div style="overflow:hidden;position:relative;mask-image:linear-gradient(to right,transparent,black 4%,black 96%,transparent);-webkit-mask-image:linear-gradient(to right,transparent,black 4%,black 96%,transparent)">
    <div id="cmd-mtg-carousel-track" class="cmd-track">
      <div style="min-width:140px;height:200px;background:rgba(152,152,255,.08);border-radius:8px;animation:shimmer 1.5s infinite"></div>
      <div style="min-width:140px;height:200px;background:rgba(152,152,255,.08);border-radius:8px;animation:shimmer 1.5s .1s infinite"></div>
      <div style="min-width:140px;height:200px;background:rgba(152,152,255,.08);border-radius:8px;animation:shimmer 1.5s .2s infinite"></div>
      <div style="min-width:140px;height:200px;background:rgba(152,152,255,.08);border-radius:8px;animation:shimmer 1.5s .3s infinite"></div>
      <div style="min-width:140px;height:200px;background:rgba(152,152,255,.08);border-radius:8px;animation:shimmer 1.5s .4s infinite"></div>
    </div>
  </div>
  <div style="text-align:center;margin-top:14px">
    <a href="/cards/mtg/random-commander" style="font-size:12px;color:var(--accent)">Generate a random Commander &rarr;</a>
  </div>
</section>

<!-- Most Valuable MTG Cards Carousel -->
<section class="carousel-section fade-up fade-up-3">
  <div class="carousel-label">Most Valuable</div>
  <div class="carousel-title">Top MTG Cards by Price (AUD)</div>
  <div class="carousel-track-wrap">
    <div id="mtg-top-cards-track" class="carousel-track" style="animation:none">
      <div style="min-width:155px;height:220px;background:rgba(152,152,255,.08);border-radius:10px;animation:shimmer 1.5s infinite;flex-shrink:0"></div>
      <div style="min-width:155px;height:220px;background:rgba(152,152,255,.08);border-radius:10px;animation:shimmer 1.5s .1s infinite;flex-shrink:0"></div>
      <div style="min-width:155px;height:220px;background:rgba(152,152,255,.08);border-radius:10px;animation:shimmer 1.5s .2s infinite;flex-shrink:0"></div>
      <div style="min-width:155px;height:220px;background:rgba(152,152,255,.08);border-radius:10px;animation:shimmer 1.5s .3s infinite;flex-shrink:0"></div>
      <div style="min-width:155px;height:220px;background:rgba(152,152,255,.08);border-radius:10px;animation:shimmer 1.5s .4s infinite;flex-shrink:0"></div>
    </div>
  </div>
  <p class="price-source" id="mtg-carousel-source" style="display:none">Prices sourced from Scryfall via TCGPlayer (USD), converted to AUD. Updated daily.</p>
</section>

<div class="wrap">

  <!-- Browse Sets (moved below carousels) -->
  <div class="set-browser fade-up fade-up-3" style="margin-bottom:32px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:4px">
    <div style="text-align:center;margin-bottom:16px">
      <h2 style="font-size:28px;font-family:'Cinzel',serif;font-weight:900;color:var(--text);margin-bottom:6px">Browse Every MTG Set</h2>
      <p style="font-size:13px;color:var(--text2)">${totalSets}+ expansions, core sets, and masters sets. Filter by letter or search by name.</p>
    </div>
    <div style="display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap">
      <span style="font-size:11px;color:var(--text2)"><span class="era-dot" style="background:#4ADE80"></span>2020 and newer</span>
      <span style="font-size:11px;color:var(--text2)"><span class="era-dot" style="background:#60A5FA"></span>2010 to 2019</span>
      <span style="font-size:11px;color:var(--text2)"><span class="era-dot" style="background:#C9A84C"></span>Pre-2010</span>
    </div>
    <div class="az-row">${azBtns}</div>
    <div style="margin-bottom:12px">
      <input type="text" id="set-search" placeholder="Search sets e.g. Bloomburrow, Tarkir, Modern Horizons..." oninput="filterSets(this.value)" autocomplete="off">
    </div>
    <div id="set-prompt" style="padding:20px 0;text-align:center;color:var(--text2);font-size:14px">Select a letter or search above to browse ${totalSets} sets</div>
    <div id="set-list">${setListHTML}</div>
  </div>

  <!-- Weekly Market Pulse -->
  <div id="mtg-pulse-wrap" style="margin-bottom:32px;display:none">
    <h2 style="font-size:20px;margin-bottom:4px">&#128200; Weekly Market Pulse</h2>
    <p style="color:var(--text2);font-size:13px;margin-bottom:4px">Biggest price movers across all MTG cards in the last 7 days.</p>
    <p style="font-size:11px;color:var(--text2);opacity:.65;margin-bottom:16px">Prices sourced from Scryfall via TCGPlayer (USD), converted to AUD.</p>
    <div class="movers-grid">
      <div><div class="movers-col-title"><span style="color:#4ADE80">&#8593;</span> Biggest Gainers</div><div id="mtg-gainers"></div></div>
      <div><div class="movers-col-title"><span style="color:#f87171">&#8595;</span> Biggest Losers</div><div id="mtg-losers"></div></div>
    </div>
  </div>

  <!-- Best Sets to Open -->
  <div style="margin-bottom:32px">
    <h2 style="font-size:20px;margin-bottom:4px">&#128230; Best MTG Sets to Open Right Now</h2>
    <p style="color:var(--text2);font-size:13px;margin-bottom:16px">Estimated box EV based on current singles prices. Always check the <a href="/ev-calculator.html" style="color:var(--accent)">EV Calculator</a> before buying.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">${evHTML}</div>
  </div>

  <!-- Tracker CTA -->
  <div style="background:rgba(152,152,255,.04);border:1px solid rgba(152,152,255,.15);border-radius:var(--radius);padding:22px;margin-bottom:32px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px">
    <div>
      <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:5px">Track Your MTG Collection</div>
      <p style="font-size:13px;color:var(--text2)">Free Google Sheets tracker. Know what you own and what it is worth in AUD.</p>
    </div>
    <a href="/tracker.html" style="display:inline-flex;align-items:center;gap:7px;padding:9px 20px;border-radius:8px;font-weight:700;font-size:13px;background:var(--gold);color:#000;text-decoration:none;transition:opacity .2s" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">Get Free Tracker &#8594;</a>
  </div>

  <!-- Guides -->
  <h2 style="font-size:18px;margin-bottom:16px">MTG Guides, Blogs and Quizzes</h2>
  <div class="guides-grid">
    <a href="/blog/best-mtg-booster-boxes-australia/" class="guide-card">
      <div class="guide-title">Best MTG Booster Boxes in Australia</div>
      <div class="guide-desc">Which boxes are worth opening right now and where to buy at the best price.</div>
    </a>
    <a href="/blog/mtg-singles-vs-booster-boxes-australia/" class="guide-card">
      <div class="guide-title">Singles vs Booster Boxes</div>
      <div class="guide-desc">Should you buy the card you want directly or gamble on packs? The honest answer.</div>
    </a>
    <a href="/blog/how-to-sell-mtg-cards-australia/" class="guide-card">
      <div class="guide-title">How to Sell MTG Cards in Australia</div>
      <div class="guide-desc">eBay, local stores, or buylist? Here is what actually gets you the best price.</div>
    </a>
    <a href="/ev-calculator.html" class="guide-card">
      <div class="guide-title">MTG EV Calculator</div>
      <div class="guide-desc">Is your booster box worth opening? Calculate expected value before you crack it.</div>
    </a>
    <a href="/quizzes/mtg-archetype" class="guide-card">
      <div class="guide-title">&#127919; MTG Archetype Quiz</div>
      <div class="guide-desc">Find out which MTG archetype matches your playstyle.</div>
    </a>
    <a href="/quizzes/mtg-colour" class="guide-card">
      <div class="guide-title">&#127914; MTG Colour Identity Quiz</div>
      <div class="guide-desc">Which colour or colour combination are you? Find out in 2 minutes.</div>
    </a>
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
  if (prompt) prompt.style.display = 'none';
}

function filterAZ(letter, btn) {
  currentLetter = letter;
  document.querySelectorAll('.az-btn').forEach(function(b) { b.classList.remove('az-btn--active'); });
  if (btn) btn.classList.add('az-btn--active');
  showSets();
  var search = (document.getElementById('set-search') || {}).value || '';
  applyFilters(letter, search.toLowerCase());
}

function filterSets(q) {
  showSets();
  applyFilters(currentLetter, q.toLowerCase());
}

function applyFilters(letter, search) {
  document.querySelectorAll('#set-list .set-item').forEach(function(el) {
    var nameMatch = !search || el.dataset.name.includes(search);
    var letterMatch = !letter || el.dataset.letter === letter;
    el.style.display = (nameMatch && letterMatch) ? '' : 'none';
  });
}
</script>


<script>
(function() {
  var SURL = '${SUPABASE_URL}';
  var SKEY = '${SUPABASE_ANON_KEY}';
  var EPN  = '5339146789';

  function sGet(path, cb) {
    fetch(SURL + '/rest/v1/' + path, {
      headers: { 'apikey': SKEY, 'Authorization': 'Bearer ' + SKEY }
    }).then(function(r) { return r.ok ? r.json() : []; }).then(cb).catch(function() { cb([]); });
  }

  function esc(s) {
    return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function loadTopCards() {
    var track = document.getElementById('mtg-top-cards-track');
    var src   = document.getElementById('mtg-carousel-source');
    if (!track) return;
    sGet('mtg_cards?order=price_usd.desc&limit=24&select=slug,name,image_uri_small,price_usd,price_aud&price_usd=gte.10&image_uri_small=not.is.null', function(cards) {
      if (!cards || !cards.length) { track.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:20px">Price data loading. Check back shortly.</div>'; return; }
      var html = '';
      for (var i=0;i<cards.length;i++) {
        var c = cards[i];
        var price = c.price_aud > 0 ? parseFloat(c.price_aud) : (c.price_usd ? (c.price_usd * 1.58) : 0);
        var priceStr = price > 0 ? 'AU$' + price.toFixed(0) : '';
        var ebay = 'https://www.ebay.com.au/sch/i.html?_nkw=' + encodeURIComponent(c.name + ' mtg card') + '&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=' + EPN + '&toolid=10001&mkevt=1';
        var img = c.image_uri_small ? '<img src="' + esc(c.image_uri_small) + '" alt="' + esc(c.name) + '" loading="eager" onerror="this.onerror=null;this.style.opacity=0.3">' : '<div class="card-placeholder">&#9775;</div>';
        html += '<a href="/cards/mtg/' + esc(c.slug) + '" class="carousel-card"><div class="carousel-img-wrap">' + img + '</div><div class="carousel-name">' + esc(c.name) + '</div><div class="carousel-price">' + priceStr + '</div><div class="carousel-buy-row"><a href="' + ebay + '" target="_blank" rel="noopener" class="carousel-buy-btn" onclick="event.stopPropagation()">Buy eBay &#8599;</a></div></a>';
      }
      track.innerHTML = html + html;
      track.style.animation = 'scrollLeft 50s linear infinite';
      if (src) src.style.display = '';
    });
  }

  function loadPulse() {
    var wrap = document.getElementById('mtg-pulse-wrap');
    var gEl  = document.getElementById('mtg-gainers');
    var lEl  = document.getElementById('mtg-losers');
    if (!wrap || !gEl || !lEl) return;
    function mCard(c, up) {
      var arrow = up ? '&#8593;' : '&#8595;';
      var col   = up ? '#4ADE80' : '#f87171';
      var pct   = Math.abs(parseFloat(c.price_change_7d||0)).toFixed(1);
      var price = c.price_aud ? 'AU$' + parseFloat(c.price_aud).toFixed(0) : '';
      var img   = c.image_uri_small ? '<img src="' + esc(c.image_uri_small) + '" alt="' + esc(c.name) + '" loading="lazy" style="width:40px;height:56px;object-fit:cover;border-radius:4px;flex-shrink:0">' : '<div style="width:40px;height:56px;background:var(--bg3);border-radius:4px;flex-shrink:0"></div>';
      return '<a href="/cards/mtg/' + esc(c.slug) + '" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;text-decoration:none;margin-bottom:6px" onmouseover="this.style.borderColor=\'var(--accent)\'" onmouseout="this.style.borderColor=\'var(--border)\'"><div style="width:40px;height:56px;background:var(--bg3);border-radius:4px;flex-shrink:0">' + img + '</div><div style="min-width:0;flex:1"><div style="font-size:11.5px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(c.name) + '</div><div style="font-size:10px;color:var(--text2)">' + esc(c.set_name||'') + '</div><div style="font-size:11px;color:var(--accent);font-weight:700">' + price + '</div></div><div style="font-size:12px;font-weight:700;color:' + col + ';flex-shrink:0">' + arrow + pct + '%</div></a>';
    }
    sGet('mtg_cards?order=price_change_7d.desc&price_change_7d=gt.5&price_aud=gt.5&price_change_7d=lt.5000&image_uri_small=not.is.null&limit=5&select=slug,name,image_uri_small,price_aud,price_change_7d,set_name', function(gainers) {
      sGet('mtg_cards?order=price_change_7d.asc&price_change_7d=lt.-5&price_aud=gt.5&image_uri_small=not.is.null&limit=5&select=slug,name,image_uri_small,price_aud,price_change_7d,set_name', function(losers) {
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


<script>
(function() {
  function buildCmdCard(c) {
    var img = c.image
      ? '<img src="' + c.image + '" alt="' + c.name.replace(/"/g,'&quot;') + '" loading="lazy">'
      : '<div style="aspect-ratio:745/1040;background:rgba(152,152,255,.1);display:flex;align-items:center;justify-content:center;font-size:28px">&#127922;</div>';
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
        for (var i = arr.length-1; i > 0; i--) { var j = Math.floor(Math.random()*(i+1)); var tmp=arr[i];arr[i]=arr[j];arr[j]=tmp; }
        var twenty = arr.slice(0,20);
        var html = '';
        for (var k=0;k<twenty.length;k++) html += buildCmdCard(twenty[k]);
        track.innerHTML = html + html;
        track.classList.add('loaded');
      })
      .catch(function() { track.innerHTML = '<p style="color:#A0A8C0;font-size:12px;padding:12px">Could not load commanders.</p>'; });
  }
  loadCommanders();
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

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600' }
  });
};

export const config = { path: '/cards/mtg' };
