// netlify/functions/market-insights.mjs
// C3 Market page - returns HTML shell instantly. All data loaded client-side via /api/market-data.
// Architecture: shell renders in <100ms, browser fetches game data on demand per tab click.

const EPN_CAMPID = '5339146789';

const GAME_CONFIG = {
  mtg:               { label: 'MTG',                color: '#C9A84C' },
  pokemon:           { label: 'Pokemon',            color: '#EF4444' },
  yugioh:            { label: 'Yu-Gi-Oh',           color: '#8B5CF6' },
  lorcana:           { label: 'Lorcana',            color: '#3B82F6' },
  onepiece:          { label: 'One Piece',          color: '#F97316' },
  dragonball:        { label: 'Dragon Ball',        color: '#EAB308' },
  starwars:          { label: 'Star Wars',          color: '#38BDF8' },
  riftbound:         { label: 'Riftbound',          color: '#818CF8' },
  digimon:           { label: 'Digimon',            color: '#06B6D4' },
  finalfantasy:      { label: 'Final Fantasy',      color: '#8B5CF6' },
  grandarchive:      { label: 'Grand Archive',      color: '#10B981' },
  sorcery:           { label: 'Sorcery',            color: '#D97706' },
  gundam:            { label: 'Gundam',             color: '#6366F1' },
  hololive:          { label: 'Hololive',           color: '#F472B6' },
  battlespiritssaga: { label: 'Battle Spirits',     color: '#14B8A6' },
  vanguard:          { label: 'Cardfight Vanguard', color: '#2563EB' },
  shadowverse:       { label: 'Shadowverse',        color: '#7C3AED' },
  unionarena:        { label: 'Union Arena',        color: '#E11D48' },
  weissschwarz:      { label: 'Weiss Schwarz',      color: '#94A3B8' },
  alphaclash:        { label: 'Alpha Clash',        color: '#F59E0B' },
  bakugan:           { label: 'Bakugan',            color: '#EA580C' },
  buddyfight:        { label: 'Buddyfight',         color: '#0EA5E9' },
  forceofwill:       { label: 'Force of Will',      color: '#9333EA' },
  gateruler:         { label: 'Gate Ruler',         color: '#0891B2' },
  godzilla:          { label: 'Godzilla',           color: '#84CC16' },
  metazoo:           { label: 'MetaZoo',            color: '#22C55E' },
  universus:         { label: 'Universus',          color: '#DB2777' },
  wixoss:            { label: 'Wixoss',             color: '#F43F5E' },
  wow:               { label: 'WoW TCG',            color: '#B45309' },
  warhammer:         { label: 'Warhammer',          color: '#DC2626' },
  dbsfusionworld:    { label: 'DBS Fusion World',   color: '#F97316' },
  dragonballz:       { label: 'Dragon Ball Z',      color: '#EAB308' },
};

// Top 8 shown as tabs. Rest go in dropdown.
const PRIMARY_GAMES = ['mtg','pokemon','yugioh','lorcana','onepiece','dragonball','starwars','riftbound'];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// "#C9A84C" -> "201,168,76" so tabs can tint via rgba(var(--tc), alpha)
function hexRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return '160,168,192';
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(',');
}

export default async (req) => {
  const primaryTabs = ['all', ...PRIMARY_GAMES].map(g => {
    const label = g === 'all' ? 'All games' : GAME_CONFIG[g].label;
    const tint = g === 'all' ? '' : ` style="--tc:${hexRgb(GAME_CONFIG[g].color)}"`;
    return `<button class="game-tab ${g === 'mtg' ? 'active' : ''}" data-game="${g}"${tint} onclick="filterGame('${g}')">${esc(label)}</button>`;
  }).join('');

  const dropdownOptions = Object.entries(GAME_CONFIG)
    .filter(([k]) => !PRIMARY_GAMES.includes(k))
    .map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`)
    .join('');

  const gameConfigJson = JSON.stringify(GAME_CONFIG);

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Australian TCG Price Movers, Updated Daily | Cards on Cards on Cards</title>
<meta name="description" content="Live AUD price movers across MTG, Pokemon, Lorcana, One Piece, Yu-Gi-Oh and more. See what is rising and falling in the Australian TCG market, updated daily.">
<link rel="canonical" href="https://cardsoncardsoncards.com.au/market">
<meta property="og:title" content="Australian TCG Price Movers, Updated Daily">
<meta property="og:description" content="See what is rising and falling across more than 30 trading card games in the Australian market, all in AUD, updated daily.">
<meta property="og:image" content="https://cardsoncardsoncards.com.au/c3-og-banner.png">
<link rel="icon" type="image/png" href="/c3logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
<style>
  :root{--bg:#080b12;--bg2:#0f1420;--gold:#C9A84C;--gold-soft:rgba(201,168,76,.12);--gold-line:rgba(201,168,76,.35);--white:#F0F2FF;--silver:#A0A8C0;--muted:#8892b0;--green:#22c55e;--red:#ef4444;--orange:#f97316;--border:#1e2235;--radius:12px}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--white);font-family:'DM Sans',sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
  a{color:inherit;text-decoration:none}
  .wrap{max-width:1140px;margin:0 auto;padding:0 20px}
  nav{background:rgba(8,11,18,.97);backdrop-filter:blur(20px);border-bottom:1px solid var(--border);padding:12px 0;position:sticky;top:0;z-index:100}
  .nav-inner{display:flex;align-items:center;justify-content:space-between;max-width:1140px;margin:0 auto;padding:0 20px;gap:12px;flex-wrap:nowrap}
  .nav-logo{display:flex;align-items:center;gap:9px;font-family:'Cinzel',serif;font-size:11.5px;font-weight:700;letter-spacing:.12em;color:var(--gold);text-transform:uppercase;white-space:nowrap;flex-shrink:0}
  .nav-logo img{height:32px;width:32px;border-radius:6px;object-fit:cover}
  .nav-links{display:flex;gap:3px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
  .nav-links::-webkit-scrollbar{display:none}
  .hamburger{display:none;background:transparent;border:1px solid var(--border);color:var(--silver);padding:6px 10px;border-radius:6px;cursor:pointer;font-size:16px;line-height:1;flex-shrink:0}
  .hamburger:focus{outline:none;border-color:var(--gold-line)}
  .nav-drawer{display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:200;background:rgba(8,11,18,.98);padding:20px;flex-direction:column;gap:10px}
  .nav-drawer.open{display:flex}
  .drawer-close{align-self:flex-end;background:transparent;border:1px solid var(--border);color:var(--silver);padding:6px 12px;border-radius:6px;cursor:pointer;font-size:14px;margin-bottom:10px}
  .drawer-link{display:block;padding:14px 16px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;border:1px solid var(--border);color:var(--silver);transition:all .2s}
  .drawer-link--vault{color:#C9A84C;border-color:rgba(201,168,76,.35)}
  .drawer-link--compare{color:#A78BFA;border-color:rgba(167,139,250,.35)}
  .drawer-link--market{color:#080b12;background:#4ADE80;border-color:#4ADE80;font-weight:700}
  .drawer-link--tools{color:#FB923C;border-color:rgba(251,146,60,.35)}
  .drawer-link--play{color:#F472B6;border-color:rgba(244,114,182,.35)}
  .drawer-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.35)}
  .drawer-link--pricing{color:var(--gold);border-color:var(--gold-line)}
  .drawer-link--ebay{color:#60A5FA;border-color:rgba(96,165,250,.35)}
  .nav-link{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:6px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;border:1px solid var(--border);color:var(--silver);white-space:nowrap;flex-shrink:0;transition:all .2s}
  .nav-link:hover{color:var(--white)}
  .nav-link--vault{color:#C9A84C;border-color:rgba(201,168,76,.35)}
  .nav-link--compare{color:#A78BFA;border-color:rgba(167,139,250,.35)}
  .nav-link--market{color:#080b12;background:#4ADE80;border-color:#4ADE80;font-weight:700}
  .nav-link--tools{color:#FB923C;border-color:rgba(251,146,60,.35)}
  .nav-link--play{color:#F472B6;border-color:rgba(244,114,182,.35)}
  .nav-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.35)}
  .nav-link--pricing{color:var(--gold);border-color:var(--gold-line)}
  .nav-link--ebay{color:#60A5FA;border-color:rgba(96,165,250,.35);background:rgba(96,165,250,.05)}
  .hero{text-align:center;padding:46px 0 18px}
  .eyebrow{font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);margin-bottom:12px}
  .hero h1{font-family:'Cinzel',serif;font-size:34px;font-weight:700;line-height:1.15;margin-bottom:12px}
  .hero .intro{font-size:15px;color:var(--silver);max-width:680px;margin:0 auto 14px}
  .stamp{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--muted);background:var(--bg2);border:1px solid var(--border);border-radius:20px;padding:5px 14px}
  .dot{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 0 3px rgba(34,197,94,.18)}
  .filterbar{position:sticky;top:57px;z-index:90;background:rgba(8,11,18,.96);backdrop-filter:blur(14px);border-bottom:1px solid var(--border);padding:11px 0}
  .filter-inner{display:flex;gap:7px;overflow-x:auto;scrollbar-width:none;max-width:1140px;margin:0 auto;padding:0 20px;align-items:center}
  .filter-inner::-webkit-scrollbar{display:none}
  .game-tab{flex-shrink:0;background:rgba(var(--tc,160,168,192),.12);border:1px solid rgba(var(--tc,160,168,192),.5);color:var(--silver);font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;padding:7px 14px;border-radius:20px;cursor:pointer;white-space:nowrap;transition:all .2s}
  .game-tab:hover{background:rgba(var(--tc,160,168,192),.2);border-color:rgba(var(--tc,160,168,192),.75);color:var(--white)}
  .game-tab.active{background:var(--gold-soft);border-color:var(--gold-line);color:var(--gold)}
  .more-games{background:var(--bg2);border:1px solid var(--border);color:var(--silver);font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;padding:7px 14px;border-radius:20px;cursor:pointer;flex-shrink:0}
  .more-games:focus{outline:none;border-color:var(--gold-line)}
  .hero-mover{display:flex;gap:20px;background:linear-gradient(135deg,var(--gold-soft),rgba(201,168,76,.02));border:1px solid var(--gold-line);border-radius:var(--radius);padding:20px;margin:26px 0}
  .hm-img img,.hm-img .ph{width:96px;height:134px;border-radius:8px;object-fit:cover;background:var(--bg2);display:block;flex-shrink:0}
  .hm-body{flex:1;min-width:0}
  .hm-tag{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);margin-bottom:6px}
  .hm-name{font-family:'Cinzel',serif;font-size:24px;font-weight:700;margin-bottom:8px}
  .hm-stats{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:12px 0}
  .hm-price{font-size:22px;font-weight:700}
  .hm-cta{margin-top:6px}
  .section-h{font-family:'Cinzel',serif;font-size:18px;font-weight:700;margin:30px 0 6px;display:flex;align-items:center;gap:9px}
  .movers-head{margin:30px 0 12px}
  .filter-hint{font-size:12px;color:var(--gold);opacity:.55;margin:20px 0 0;letter-spacing:.02em}
  .movers-toggle,.period-toggle{display:inline-flex;border:1.5px solid var(--border);border-radius:10px;overflow:hidden;vertical-align:middle}
  .period-toggle{margin-left:10px}
  .mt,.pt{background:transparent;border:none;color:var(--silver);font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;padding:9px 18px;cursor:pointer;transition:all .2s}
  .pt{padding:9px 14px;font-size:12px}
  .pt.active{background:var(--gold-soft);color:var(--gold)}
  .mt.active#t-up{background:rgba(34,197,94,.14);color:var(--green)}
  .mt.active#t-down{background:rgba(239,68,68,.14);color:var(--red)}
  .section-sub{font-size:13px;color:var(--muted);margin-bottom:12px}
  .rows{display:flex;flex-direction:column}
  .row{display:flex;align-items:center;gap:14px;padding:12px 4px;border-bottom:1px solid var(--border)}
  .row-img img,.row-img .ph{width:38px;height:53px;border-radius:5px;object-fit:cover;background:var(--bg2);display:block;flex-shrink:0}
  .row-info{flex:1;min-width:0}
  .row-name{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .row-name a:hover{color:var(--gold)}
  .row-meta{display:flex;align-items:center;gap:7px;margin-top:3px;flex-wrap:wrap}
  .gpill{font-size:10px;font-weight:700;border:1px solid;border-radius:5px;padding:1px 7px}
  .setn{font-size:11px;color:var(--muted)}.rar{font-size:10px;color:var(--silver);text-transform:uppercase;letter-spacing:.04em}
  .row-spark{flex-shrink:0;width:72px}
  .row-price{flex-shrink:0;text-align:right;font-size:14px;font-weight:700;min-width:96px;display:flex;flex-direction:column;align-items:flex-end;gap:3px}
  .badge{font-size:11px;font-weight:700;padding:2px 8px;border-radius:5px}
  .badge.up{color:var(--green);background:rgba(34,197,94,.12)}
  .badge.down{color:var(--red);background:rgba(239,68,68,.12)}
  .badge.buy{color:var(--gold);background:var(--gold-soft)}
  .badge.sell{color:var(--orange);background:rgba(249,115,22,.12)}
  .badge.big{font-size:13px;padding:4px 11px}
  .row-cta{flex-shrink:0;display:flex;flex-direction:column;gap:5px;align-items:flex-end}
  .ebay{font-size:11px;font-weight:600;color:#60A5FA}
  .cmp{font-size:11px;color:var(--muted)}
  .empty{color:var(--muted);font-size:13px;padding:18px 4px}
  .skeleton{background:var(--bg2);border-radius:8px;animation:pulse 1.4s ease-in-out infinite}
  .sk-row{display:flex;align-items:center;gap:14px;padding:12px 4px;border-bottom:1px solid var(--border)}
  .sk-img{width:38px;height:53px;border-radius:5px;flex-shrink:0}
  .sk-body{flex:1;display:flex;flex-direction:column;gap:8px}
  .sk-line{height:12px;border-radius:4px}
  .sk-w60{width:60%}.sk-w40{width:40%}
  .sk-price{width:64px;height:32px;border-radius:5px;flex-shrink:0}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  .call{background:var(--bg2);border:1px solid var(--border);border-left:3px solid var(--gold);border-radius:10px;padding:18px 20px;margin:8px 0 4px}
  .call .lbl{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);margin-bottom:6px}
  .call p{font-size:14px;color:var(--silver)}
  .call a{color:var(--gold);font-weight:600}
  .capture{background:linear-gradient(135deg,var(--gold-soft),rgba(201,168,76,.02));border:1px solid var(--gold-line);border-radius:var(--radius);padding:26px;text-align:center;margin:28px 0}
  .capture h3{font-family:'Cinzel',serif;font-size:19px;margin-bottom:6px}
  .capture p{font-size:13px;color:var(--silver);margin-bottom:16px}
  .capture form{display:flex;border:1.5px solid var(--gold-line);border-radius:10px;overflow:hidden;max-width:400px;margin:0 auto}
  .capture input{flex:1;background:rgba(255,255,255,.04);border:none;padding:12px 15px;color:var(--white);font-size:14px;outline:none;font-family:'DM Sans',sans-serif}
  .capture button{background:var(--gold-soft);border:none;border-left:1.5px solid var(--gold-line);color:var(--gold);padding:12px 18px;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}
  .capture .msg{font-size:12px;color:var(--silver);margin-top:10px;min-height:15px}
  .upsell{background:var(--bg2);border:1px solid var(--gold-line);border-radius:var(--radius);padding:26px;text-align:center;margin:10px 0 0}
  .signals-gate{position:relative;overflow:hidden;border-radius:12px;margin-bottom:6px}
  .signals-gate .rows{filter:blur(4px);pointer-events:none;user-select:none;opacity:0.6}
  .movers-gate{position:relative;overflow:hidden;border-radius:12px;margin-bottom:6px}
  .movers-gate .rows-locked{filter:blur(5px);pointer-events:none;user-select:none;opacity:0.55}
  .movers-overlay{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to bottom,transparent 0%,rgba(8,11,18,0.92) 40%,rgba(8,11,18,0.98) 100%);display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:20px;text-align:center;z-index:10}
  .movers-overlay h4{font-family:'Cinzel',serif;font-size:16px;color:var(--gold);margin-bottom:6px}
  .movers-overlay p{font-size:13px;color:var(--silver);margin-bottom:14px;max-width:400px}
  .upsell-sub{font-size:12px;color:var(--muted);margin-top:8px;text-align:center}
  .upsell h3{font-family:'Cinzel',serif;font-size:20px;margin-bottom:8px;color:var(--gold)}
  .upsell p{font-size:14px;color:var(--silver);max-width:520px;margin:0 auto 16px}
  .btn-gold{display:inline-block;background:var(--gold);color:#080b12;font-weight:700;font-size:14px;padding:12px 26px;border-radius:8px}
  footer{border-top:1px solid var(--border);margin-top:56px;padding:30px 0;text-align:center}
  footer .mission{font-size:13px;color:var(--muted);margin-bottom:10px}
  footer .disc{font-size:11px;color:var(--muted);max-width:680px;margin:0 auto}
  @media(max-width:640px){
    .hero h1{font-size:27px}
    .hero-mover{flex-direction:column}.hm-img img,.hm-img .ph{width:80px;height:112px}
    .row-spark{display:none}
    .row-cta .cmp{display:none}
    .row-price{min-width:80px}
    .nav-links{display:none}
    .hamburger{display:block}
  }
</style>
</head>
<body>
<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo"><img src="/c3logo.png" alt="C3">Cards on Cards on Cards</a>
    <div class="nav-links">
      <a href="/cards" class="nav-link nav-link--vault">Card Prices</a>
      <a href="/compare" class="nav-link nav-link--compare">Compare</a>
      <a href="/market" class="nav-link nav-link--market">Market</a>
      <a href="/tools" class="nav-link nav-link--tools">Tools</a>
      <a href="/play" class="nav-link nav-link--play">Play</a>
      <a href="/blog" class="nav-link nav-link--blog">Blog</a>
      <a href="/pricing" class="nav-link nav-link--pricing">Pricing</a>
      <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=C3Nav&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="nav-link nav-link--ebay">Shop eBay &#8599;</a>
    </div>
    <button class="hamburger" aria-label="Open menu" onclick="document.getElementById('nav-drawer').classList.add('open')">&#9776;</button>
  </div>
</nav>
<div class="nav-drawer" id="nav-drawer" role="dialog" aria-label="Navigation menu">
  <button class="drawer-close" onclick="document.getElementById('nav-drawer').classList.remove('open')">&#10005; Close</button>
  <a href="/cards" class="drawer-link drawer-link--vault">Card Prices</a>
  <a href="/compare" class="drawer-link drawer-link--compare">Compare</a>
  <a href="/market" class="drawer-link drawer-link--market">Market</a>
  <a href="/tools" class="drawer-link drawer-link--tools">Tools</a>
  <a href="/play" class="drawer-link drawer-link--play">Play</a>
  <a href="/blog" class="drawer-link drawer-link--blog">Blog</a>
  <a href="/pricing" class="drawer-link drawer-link--pricing">Pricing</a>
  <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=C3Nav&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="drawer-link drawer-link--ebay">Shop eBay &#8599;</a>
</div>

<header class="hero">
  <div class="wrap">
    <div class="eyebrow">Market</div>
    <h1>The Australian TCG Market</h1>
    <p class="intro">Every day we track price movements across more than 30 trading card games and convert them to Australian dollars, so you can see what is rising, what is falling, and where the value is, in one place.</p>
    <span class="stamp"><span class="dot"></span>Updated daily</span>
  </div>
</header>

<div class="filterbar">
  <div class="filter-inner">
    ${primaryTabs}
    <select class="more-games" id="more-games-select" onchange="filterGame(this.value);this.value=''">
      <option value="">More games...</option>
      ${dropdownOptions}
    </select>
  </div>
</div>

<main class="wrap">
  <div id="hero-zone"></div>

  <div class="call">
    <div class="lbl">The C3 Call</div>
    <p id="call-body">Loading market data...</p>
  </div>

  <div class="filter-hint">Select a game above to filter by TCG, or browse all movers below.</div>

  <div class="movers-head">
    <div class="movers-toggle" role="group" aria-label="Mover direction">
      <button id="t-up" class="mt active" onclick="showDir('up')">&#9650; Rising</button>
      <button id="t-down" class="mt" onclick="showDir('down')">&#9660; Falling</button>
    </div>
    <div class="period-toggle" role="group" aria-label="Time period">
      <button id="p-7" class="pt active" onclick="showPeriod('7d')">7 days</button>
      <button id="p-30" class="pt" onclick="showPeriod('30d')">30 days</button>
    </div>
    <div class="section-sub" id="movers-sub">Rising hardest over the last seven days, in AUD.</div>
  </div>

  <div id="movers-zone" style="margin-bottom:0">
    <div class="sk-row"><div class="sk-img skeleton"></div><div class="sk-body"><div class="sk-line sk-w60 skeleton"></div><div class="sk-line sk-w40 skeleton"></div></div><div class="sk-price skeleton"></div></div>
    <div class="sk-row"><div class="sk-img skeleton"></div><div class="sk-body"><div class="sk-line sk-w60 skeleton"></div><div class="sk-line sk-w40 skeleton"></div></div><div class="sk-price skeleton"></div></div>
    <div class="sk-row"><div class="sk-img skeleton"></div><div class="sk-body"><div class="sk-line sk-w60 skeleton"></div><div class="sk-line sk-w40 skeleton"></div></div><div class="sk-price skeleton"></div></div>
    <div class="sk-row"><div class="sk-img skeleton"></div><div class="sk-body"><div class="sk-line sk-w60 skeleton"></div><div class="sk-line sk-w40 skeleton"></div></div><div class="sk-price skeleton"></div></div>
    <div class="sk-row"><div class="sk-img skeleton"></div><div class="sk-body"><div class="sk-line sk-w60 skeleton"></div><div class="sk-line sk-w40 skeleton"></div></div><div class="sk-price skeleton"></div></div>
  </div>

  <div id="movers-gate-zone"></div>

  <div class="capture">
    <h3>Get the weekly Top 5 Movers, free</h3>
    <p>The week&#8217;s biggest Australian price moves, straight to your inbox. No card required.</p>
    <form id="cap-form">
      <input type="email" id="cap-email" placeholder="Your email address" required aria-label="Email address">
      <button type="submit">Join free</button>
    </form>
    <div class="msg" id="cap-msg"></div>
  </div>

  <div class="section-h signals">Buy and sell signals (52-week range)</div>
  <div class="section-sub">Cards near their 52-week low or high based on AU price history. Full signal list in the Seller report.</div>
  <div class="signals-gate">
    <div class="rows" id="signals-zone">
      <div class="sk-row"><div class="sk-img skeleton"></div><div class="sk-body"><div class="sk-line sk-w60 skeleton"></div><div class="sk-line sk-w40 skeleton"></div></div><div class="sk-price skeleton"></div></div>
      <div class="sk-row"><div class="sk-img skeleton"></div><div class="sk-body"><div class="sk-line sk-w60 skeleton"></div><div class="sk-line sk-w40 skeleton"></div></div><div class="sk-price skeleton"></div></div>
      <div class="sk-row"><div class="sk-img skeleton"></div><div class="sk-body"><div class="sk-line sk-w60 skeleton"></div><div class="sk-line sk-w40 skeleton"></div></div><div class="sk-price skeleton"></div></div>
    </div>
  </div>

  <div class="upsell">
    <h3>Unlock the full signal list</h3>
    <p>C3 Seller Intelligence gives you every buy signal, full sell-side timing, repricing movers across all games, and the weekly report delivered to your inbox every Monday.</p>
    <a href="https://buy.stripe.com/eVq5kCfTodTg81y1YXaIM01" class="btn-gold" target="_blank" rel="noopener" onclick="gtag('event','market_upsell_click',{event_label:'subscribe'})">Subscribe for AU&#36;14.95/month &#8599;</a>
    <p class="upsell-sub">Cancel any time. Billed monthly via Stripe.</p>
  </div>
</main>

<footer>
  <div class="wrap">
    <div class="mission">Cards on Cards on Cards is Australia&#8217;s TCG intelligence platform. Every price in AUD. Every signal built for the local market.</div>
    <div class="disc">Prices are indicative AUD market estimates and move constantly. C3 participates in the eBay Partner Network and may earn a small commission on purchases made through links, at no extra cost to you.</div>
  </div>
</footer>

<script>
(function(){
  var GAME_CONFIG = ${gameConfigJson};
  var EPN = '${EPN_CAMPID}';
  var curDir = 'up', curGame = 'mtg', curPeriod = '7d';
  var cache = {};
  var loading = false;

  function esc(s){
    return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function formatAUD(n){
    var v=parseFloat(n);
    return (isNaN(v)||v<=0)?'N/A':'AU\$'+v.toFixed(2);
  }
  function pctStr(pct){
    var n=parseFloat(pct);
    return (n>=0?'\u25B2':'\u25BC')+' '+Math.abs(n).toFixed(1)+'%';
  }
  function sparkSVG(series,up){
    if(!series||series.length<3)return '';
    var w=72,h=22,pad=2;
    var min=Math.min.apply(null,series),max=Math.max.apply(null,series);
    var range=(max-min)||1;
    var pts=series.map(function(v,i){
      var x=pad+(i/(series.length-1))*(w-2*pad);
      var y=h-pad-((v-min)/range)*(h-2*pad);
      return x.toFixed(1)+','+y.toFixed(1);
    }).join(' ');
    var col=up?'#22c55e':'#ef4444';
    return '<svg class="spark" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" aria-hidden="true"><polyline points="'+pts+'" fill="none" stroke="'+col+'" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }
  function ebayUrl(name,game){
    var label=GAME_CONFIG[game]?GAME_CONFIG[game].label:game;
    var kw=encodeURIComponent(name+' '+(game==='mtg'?'mtg':label));
    return 'https://www.ebay.com.au/sch/i.html?_nkw='+kw+'&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid='+EPN+'&toolid=10001&mkevt=1';
  }
  function cardRowHTML(card,mode){
    var cfg=GAME_CONFIG[card.game]||GAME_CONFIG.mtg;
    var path=card.slug?'/cards/'+card.game+'/'+card.slug:null;
    var name=esc(card.name);
    var badge=mode==='buy'
      ?'<span class="badge buy">'+card.discount+'% off high</span>'
      :mode==='sell'
      ?'<span class="badge sell">Near '+card.nearHighPct+'% of high</span>'
      :'<span class="badge '+(parseFloat(card.change7d)>=0?'up':'down')+'">'+pctStr(card.change7d)+'</span>';
    var spark=card.spark?sparkSVG(card.spark,parseFloat(card.change7d||0)>=0||mode==='buy'):'';
    var img=card.image?'<img src="'+esc(card.image)+'" alt="'+name+'" loading="lazy">':'<span class="ph"></span>';
    var nameHtml=path?'<a href="'+esc(path)+'">'+name+'</a>':name;
    var gpill='<span class="gpill" style="background:'+cfg.color+'22;color:'+cfg.color+';border-color:'+cfg.color+'55">'+esc(cfg.label)+'</span>';
    var setSpan=card.setName?'<span class="setn">'+esc(card.setName)+'</span>':'';
    var rarSpan=card.rarity?'<span class="rar">'+esc(card.rarity)+'</span>':'';
    var cmpLink=card.slug?'<a href="/compare?cards='+esc(card.game+':'+card.slug)+'" class="cmp">Compare</a>':'';
    return '<div class="row" data-game="'+esc(card.game)+'" data-name="'+esc(card.name)+'">'
      +'<div class="row-img">'+img+'</div>'
      +'<div class="row-info"><div class="row-name">'+nameHtml+'</div>'
      +'<div class="row-meta">'+gpill+setSpan+rarSpan+'</div></div>'
      +'<div class="row-spark">'+spark+'</div>'
      +'<div class="row-price">'+formatAUD(card.priceAud)+badge+'</div>'
      +'<div class="row-cta"><a href="'+esc(ebayUrl(card.name,card.game))+'" target="_blank" rel="noopener" class="ebay" onclick="gtag(\\'event\\',\\'market_mover_click\\',{event_label:\\'ebay\\'})">eBay AU &#8599;</a>'+cmpLink+'</div>'
      +'</div>';
  }
  function heroHTML(card){
    if(!card)return '';
    var cfg=GAME_CONFIG[card.game]||GAME_CONFIG.mtg;
    var path=card.slug?'/cards/'+card.game+'/'+card.slug:null;
    var up=parseFloat(card.change7d)>=0;
    var spark=card.spark?sparkSVG(card.spark,up):'';
    var img=card.image?'<img src="'+esc(card.image)+'" alt="'+esc(card.name)+'" loading="eager">':'<span class="ph"></span>';
    var nameHtml=path?'<a href="'+esc(path)+'">'+esc(card.name)+'</a>':esc(card.name);
    return '<div class="hero-mover">'
      +'<div class="hm-img">'+img+'</div>'
      +'<div class="hm-body">'
      +'<div class="hm-tag">Biggest mover this week</div>'
      +'<div class="hm-name">'+nameHtml+'</div>'
      +'<div class="row-meta"><span class="gpill" style="background:'+cfg.color+'22;color:'+cfg.color+';border-color:'+cfg.color+'55">'+esc(cfg.label)+'</span>'+(card.setName?'<span class="setn">'+esc(card.setName)+'</span>':'')+'</div>'
      +'<div class="hm-stats"><span class="hm-price">'+formatAUD(card.priceAud)+'</span><span class="badge '+(up?'up':'down')+' big">'+pctStr(card.change7d)+' 7d</span>'+spark+'</div>'
      +'<div class="hm-cta"><a href="'+esc(ebayUrl(card.name,card.game))+'" target="_blank" rel="noopener" class="ebay" onclick="gtag(\\'event\\',\\'market_mover_click\\',{event_label:\\'hero_ebay\\'})">See it on eBay AU &#8599;</a></div>'
      +'</div></div>';
  }
  function skeletonRows(n){
    var out='';
    for(var i=0;i<n;i++){
      out+='<div class="sk-row"><div class="sk-img skeleton"></div><div class="sk-body"><div class="sk-line sk-w60 skeleton"></div><div class="sk-line sk-w40 skeleton"></div></div><div class="sk-price skeleton"></div></div>';
    }
    return out;
  }
  function cacheKey(g,p){return g+'_'+p;}

  function renderMovers(data){
    var list=curDir==='up'?data.gainers:data.losers;
    var heroZone=document.getElementById('hero-zone');
    var moversZone=document.getElementById('movers-zone');
    var callBody=document.getElementById('call-body');
    if(!list||!list.length){
      heroZone.innerHTML='';
      moversZone.innerHTML='<div class="empty">No movers for this game in this period.</div>';
      document.getElementById('movers-gate-zone').innerHTML='';
      callBody.textContent='The full market read and this week\\'s sell-side timing are in the weekly Seller report.';
      return;
    }
    // Hero: all-games rising 7d only, minimum AU$5
    if(curGame==='all'&&curDir==='up'&&curPeriod==='7d'){
      var hero=null;
      for(var i=0;i<list.length;i++){if(parseFloat(list[i].priceAud)>=5){hero=list[i];break;}}
      heroZone.innerHTML=heroHTML(hero);
      if(hero){
        callBody.innerHTML='This week the market is led by '+esc(hero.name)+', '+(parseFloat(hero.change7d)>=0?'up':'down')+' '+Math.abs(parseFloat(hero.change7d)).toFixed(1)+' per cent in seven days. The full read, what it means and where to list, is in the weekly Seller report. <a href="/pricing" onclick="gtag(\\'event\\',\\'market_upsell_click\\',{event_label:\\'call\\'})">See the Seller report &#8594;</a>';
      }
    } else {
      heroZone.innerHTML='';
    }
    var FREE_ROWS = 3;
    var freeRows = list.slice(0, FREE_ROWS);
    var lockedRows = list.slice(FREE_ROWS);
    moversZone.innerHTML = '<div class="rows">' + freeRows.map(function(c){return cardRowHTML(c,'movers');}).join('') + '</div>';
    var gateZone = document.getElementById('movers-gate-zone');
    if (lockedRows.length > 0) {
      gateZone.innerHTML =
        '<div class="movers-gate">' +
          '<div class="rows-locked rows">' + lockedRows.map(function(c){return cardRowHTML(c,'movers');}).join('') + '</div>' +
          '<div class="movers-overlay">' +
            '<h4>Unlock the full movers list</h4>' +
            '<p>C3 Seller Intelligence gives you all movers across every game, buy and sell signals, and the weekly AU market report.</p>' +
            '<a href="https://buy.stripe.com/eVq5kCfTodTg81y1YXaIM01" class="btn-gold" target="_blank" rel="noopener" onclick="gtag(\\'event\\',\\'market_upsell_click\\',{event_label:\\'movers_gate\\'})">Subscribe for AU&#36;14.95/month &#8599;</a>' +
          '</div>' +
        '</div>';
    } else {
      gateZone.innerHTML = '';
    }
  }

  function loadData(game,period){
    var key=cacheKey(game,period);
    if(cache[key]){renderMovers(cache[key]);return;}
    if(loading)return;
    loading=true;
    document.getElementById('movers-zone').innerHTML=skeletonRows(5);
    fetch('/api/market-data?game='+encodeURIComponent(game)+'&period='+encodeURIComponent(period))
      .then(function(r){return r.json();})
      .then(function(data){
        loading=false;
        cache[key]=data;
        renderMovers(data);
      })
      .catch(function(){
        loading=false;
        document.getElementById('movers-zone').innerHTML='<div class="empty">Could not load data. Try refreshing.</div>';
        document.getElementById('movers-gate-zone').innerHTML='';
      });
  }

  function loadSignals(){
    fetch('/api/market-data?game=mtg_signals&period=7d')
      .then(function(r){return r.json();})
      .then(function(data){
        var zone=document.getElementById('signals-zone');
        var buy=(data.buySignals||[]).slice(0,3);
        var sell=(data.sellSignals||[]).slice(0,3);
        if(!buy.length&&!sell.length){
          zone.innerHTML='<div class="empty" style="filter:none;opacity:1">Signal data updates tonight.</div>';
        } else {
          zone.innerHTML=buy.map(function(c){return cardRowHTML(c,'buy');}).join('')
            +sell.map(function(c){return cardRowHTML(c,'sell');}).join('');
        }
      })
      .catch(function(){
        document.getElementById('signals-zone').innerHTML=skeletonRows(3);
      });
  }

  function updateToggles(){
    document.getElementById('t-up').classList.toggle('active',curDir==='up');
    document.getElementById('t-down').classList.toggle('active',curDir==='down');
    document.getElementById('p-7').classList.toggle('active',curPeriod==='7d');
    document.getElementById('p-30').classList.toggle('active',curPeriod==='30d');
    var per=curPeriod==='7d'?'seven days':'30 days';
    document.getElementById('movers-sub').textContent=curDir==='up'
      ?'Rising hardest over the last '+per+', in AUD.'
      :'Falling hardest over the last '+per+', in AUD. Clear stock before it drops further.';
    var tabs=document.querySelectorAll('.game-tab');
    for(var i=0;i<tabs.length;i++){tabs[i].classList.toggle('active',tabs[i].getAttribute('data-game')===curGame);}
  }

  window.showDir=function(d){curDir=d;updateToggles();var k=cacheKey(curGame,curPeriod);if(cache[k])renderMovers(cache[k]);else loadData(curGame,curPeriod);gtag('event','market_dir_toggle',{event_label:d});};
  window.showPeriod=function(p){curPeriod=p;updateToggles();loadData(curGame,curPeriod);gtag('event','market_period_toggle',{event_label:p});};
  window.filterGame=function(g){
    if(!g)return;
    curGame=g;
    updateToggles();
    document.getElementById('more-games-select').value='';
    loadData(curGame,curPeriod);
    gtag('event','market_filter',{event_label:g});
  };

  // Email capture
  (function(){
    var f=document.getElementById('cap-form');if(!f)return;
    f.addEventListener('submit',function(e){
      e.preventDefault();
      var em=document.getElementById('cap-email').value.trim();
      var msg=document.getElementById('cap-msg');
      if(!em){msg.textContent='Please enter your email.';return;}
      msg.style.color='#A0A8C0';msg.textContent='Joining...';
      fetch('/.netlify/functions/email-subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em})})
        .then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d};});})
        .then(function(res){
          if(res.ok){msg.style.color='#22c55e';msg.textContent='You are in. Watch your inbox each week.';gtag('event','market_email_capture');}
          else{msg.style.color='#ef4444';msg.textContent=res.d.error||'Something went wrong.';}
        })
        .catch(function(){msg.style.color='#ef4444';msg.textContent='Something went wrong.';});
    });
  })();

  // Boot
  updateToggles();
  loadData('mtg','7d');
  loadSignals();
})();
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
    }
  });
};

export const config = { path: '/market' };
