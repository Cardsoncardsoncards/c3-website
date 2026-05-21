// netlify/functions/search-page.mjs
// Serves: /search?q=lightning+bolt
// Full search results page across all 7 games with card pages

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID        = Netlify.env.get('EPN_CAMPID') || '5339146789';

const SEARCHABLE_GAMES = [
  { game: 'mtg',       table: 'mtg_cards',      imgCol: 'image_uri_small', priceCol: 'price_aud',    isAud: true,  label: 'MTG',       color: '#C9A84C', emoji: '🃏' },
  { game: 'pokemon',   table: 'pokemon_cards',   imgCol: 'image_url',       priceCol: 'market_price', isAud: false, label: 'Pokemon',   color: '#EF4444', emoji: '⚡' },
  { game: 'yugioh',    table: 'yugioh_cards',    imgCol: 'image_url',       priceCol: 'market_price', isAud: false, label: 'Yu-Gi-Oh',  color: '#8B5CF6', emoji: '👁' },
  { game: 'lorcana',   table: 'lorcana_cards',   imgCol: 'image_url',       priceCol: 'market_price', isAud: false, label: 'Lorcana',   color: '#3B82F6', emoji: '✨' },
  { game: 'onepiece',  table: 'onepiece_cards',  imgCol: 'image_url',       priceCol: 'market_price', isAud: false, label: 'One Piece', color: '#F97316', emoji: '⚓' },
  { game: 'starwars',  table: 'starwars_cards',  imgCol: 'image_url',       priceCol: 'market_price', isAud: false, label: 'Star Wars', color: '#FFE81F', emoji: '🌟' },
  { game: 'riftbound', table: 'riftbound_cards', imgCol: 'image_url',       priceCol: 'market_price', isAud: false, label: 'Riftbound', color: '#10B981', emoji: '⚔' },
];

async function searchGame(cfg, query, limit) {
  // ilike value appended manually - URLSearchParams.set encodes * to %2A breaking PostgREST wildcard
  const baseUrl = new URL(`${SUPABASE_URL}/rest/v1/${cfg.table}`);
  baseUrl.searchParams.set('select', `slug,name,${cfg.imgCol},${cfg.priceCol},set_name,rarity`);
  baseUrl.searchParams.set('order', `${cfg.priceCol}.desc.nullslast`);
  baseUrl.searchParams.set('limit', String(limit));
  const searchUrl = baseUrl.toString() + '&name=ilike.*' + encodeURIComponent(query) + '*';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(searchUrl, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : []).map(card => {
      const rawPrice = card[cfg.priceCol] ? parseFloat(card[cfg.priceCol]) : null;
      const priceAud = rawPrice ? (cfg.isAud ? rawPrice : rawPrice * 1.58) : null;
      return {
        slug:      card.slug,
        name:      card.name,
        game:      cfg.game,
        label:     cfg.label,
        color:     cfg.color,
        emoji:     cfg.emoji,
        image:     card[cfg.imgCol] || null,
        setName:   card.set_name || null,
        rarity:    card.rarity || null,
        priceAud,
        priceStr:  priceAud ? 'AU$' + priceAud.toFixed(0) : null,
        cardPath:  `/cards/${cfg.game}/${card.slug}`
      };
    });
  } catch { clearTimeout(timer); return []; }
}

function cardHTML(c, rank) {
  const img = c.image
    ? `<img src="${c.image}" alt="${c.name.replace(/"/g,'&quot;')}" loading="lazy" onerror="this.style.display='none'">`
    : `<div class="card-no-img">${c.emoji}</div>`;
  const badge = `<span class="game-badge" style="background:${c.color}22;color:${c.color};border-color:${c.color}44">${c.label}</span>`;
  const price = c.priceStr
    ? `<div class="card-price">${c.priceStr}</div>`
    : `<div class="card-price no-price">N/A</div>`;
  const set = c.setName ? `<div class="card-set">${c.setName.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>` : '';
  const topBadge = rank === 0 ? `<div class="top-badge">&#127942; Top Find</div>` : '';
  const rarityNorm = (c.rarity || 'unknown').toLowerCase().replace(/[^a-z0-9]/g,'-');
  return `<a href="${c.cardPath}" class="result-card${rank === 0 ? ' result-card--top' : ''}" data-price="${c.priceAud || 0}" data-name="${c.name.replace(/"/g,'&quot;')}" data-rarity="${rarityNorm}" data-game="${c.game}">
    <div class="card-img-wrap">${img}</div>
    ${topBadge}
    <div class="card-info">
      ${badge}
      <div class="card-name">${c.name.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>
      ${set}
      ${price}
    </div>
  </a>`;
}

export default async (req) => {
  const url   = new URL(req.url);
  const query = (url.searchParams.get('q') || '').trim();
  // Sanitise for safe HTML interpolation - strip tags, limit length
  const safeQuery = query.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c])).slice(0, 100);
  const gameFilter = url.searchParams.get('game') || '';

  const tables = gameFilter
    ? SEARCHABLE_GAMES.filter(g => g.game === gameFilter)
    : SEARCHABLE_GAMES;

  let results = [];
  let totalByGame = {};

  if (query.length >= 2) {
    const settled = await Promise.allSettled(tables.map(g => searchGame(g, query, 40)));
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value.length) {
        results.push(...r.value);
      }
    });
    results.sort((a, b) => (b.priceAud || 0) - (a.priceAud || 0));
    // Count after sort so tab counts reflect what is actually displayed
    results.forEach(r => { totalByGame[r.game] = (totalByGame[r.game] || 0) + 1; });
  }

  const hasResults = results.length > 0;
  const resultsHTML = hasResults
    ? results.map((c, i) => cardHTML(c, i)).join('')
    : query.length >= 2
      ? `<div class="no-results">
          <div style="font-size:40px;margin-bottom:16px">🔍</div>
          <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:8px">No cards found for "${safeQuery}"</div>
          <div style="color:var(--text2);margin-bottom:24px">Try a different spelling or search on eBay AU directly.</div>
          <a href="https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(query + ' card')}&_sacat=183454&campid=${EPN_CAMPID}&mkevt=1" target="_blank" rel="noopener" class="btn-ebay">Search eBay AU &rarr;</a>
         </div>`
      : `<div class="no-results"><div style="font-size:40px;margin-bottom:16px">🃏</div><div style="color:var(--text2)">Type a card name above to search across all games.</div></div>`;

  const gameFilterTabs = SEARCHABLE_GAMES.map(g => {
    const count = totalByGame[g.game] || 0;
    const active = gameFilter === g.game ? ' tab-active' : '';
    const href = query ? `/search?q=${encodeURIComponent(query)}&game=${g.game}` : `/search?game=${g.game}`;
    return `<a href="${href}" class="tab${active}" style="${active ? `border-color:${g.color};color:${g.color}` : ''}">${g.emoji} ${g.label}${count ? ` <span class="tab-count">${count}</span>` : ''}</a>`;
  }).join('');
  const allActive = !gameFilter ? ' tab-active' : '';
  const allHref = query ? `/search?q=${encodeURIComponent(query)}` : '/search';

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${safeQuery ? `"${safeQuery}" | Card Search` : 'Search Cards'} | Cards on Cards on Cards</title>
  <meta name="description" content="${safeQuery ? `Search results for "${safeQuery}" across MTG, Pokemon, Yu-Gi-Oh, Lorcana, One Piece, Star Wars and Riftbound. Live AUD prices.` : 'Search all TCG cards across MTG, Pokemon, Yu-Gi-Oh, Lorcana, One Piece, Star Wars and Riftbound. Live AUD prices.'}">
  <meta name="robots" content="noindex,follow">
  <meta property="og:title" content="Search TCG Cards | Cards on Cards on Cards">
  <meta property="og:description" content="Search MTG, Pokemon, Yu-Gi-Oh, Lorcana, One Piece, Star Wars and Riftbound card prices in AUD.">
  <meta property="og:image" content="https://cardsoncardsoncards.com.au/c3-og-banner.png">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/search">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <style>
    :root{--bg:#0A0C14;--bg2:#111420;--bg3:#181d2e;--gold:#C9A84C;--text:#e8eaf0;--text2:#9ba3c4;--border:#242840;--radius:12px}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;min-height:100vh;overflow-x:hidden}
    body::before{content:'';position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse 80% 40% at 50% -5%,rgba(201,168,76,.06),transparent 60%)}
    a{color:var(--gold);text-decoration:none}
    /* NAV */
    nav{background:rgba(10,12,20,.97);border-bottom:1px solid var(--border);padding:10px 0;position:sticky;top:0;z-index:100;backdrop-filter:blur(20px)}
    .nav-inner{max-width:1400px;margin:0 auto;padding:0 20px;display:flex;align-items:center;gap:12px}
    .nav-logo{display:flex;align-items:center;gap:8px;text-decoration:none;flex-shrink:0}
    .nav-logo img{height:34px;width:34px;border-radius:6px;object-fit:cover}
    /* GLOBAL SEARCH in nav */
    .nav-search-wrap{flex:1;min-width:0;max-width:480px}
    .nav-search-input{width:100%;background:rgba(255,255,255,.06);border:1px solid var(--border);border-radius:8px;padding:7px 36px 7px 14px;font-size:13px;color:var(--text);font-family:'DM Sans',sans-serif;transition:border-color .2s;outline:none}
    .nav-search-input:focus{border-color:rgba(201,168,76,.5);background:rgba(255,255,255,.08)}
    .nav-search-input::placeholder{color:var(--text2)}
    .nav-links{display:flex;gap:3px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;flex-shrink:0}
    .nav-links::-webkit-scrollbar{display:none}
    .nav-link{font-size:11px;padding:5px 9px;border-radius:6px;border:1px solid var(--border);color:#A0A8C0;text-decoration:none;font-weight:600;letter-spacing:.04em;text-transform:uppercase;transition:all .2s;white-space:nowrap}
    .nav-link:hover{color:var(--text);border-color:#A0A8C0;background:rgba(255,255,255,.04)}
    .nav-link--vault{color:var(--gold);border-color:rgba(201,168,76,.3)}.nav-link--vault:hover{background:rgba(201,168,76,.06)}
    .nav-link--compare{color:#A78BFA;border-color:rgba(167,139,250,.35)}.nav-link--compare:hover{background:rgba(167,139,250,.1)}
    .nav-link--market{color:#4ADE80;border-color:rgba(74,222,128,.35)}.nav-link--market:hover{background:rgba(74,222,128,.1)}
    .nav-link--tools{color:#FB923C;border-color:rgba(251,146,60,.35)}.nav-link--tools:hover{background:rgba(251,146,60,.1)}
    .nav-link--play{color:#F472B6;border-color:rgba(244,114,182,.35)}.nav-link--play:hover{background:rgba(244,114,182,.1)}
    .nav-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.35)}.nav-link--blog:hover{background:rgba(126,203,161,.1)}
    .nav-link--ebay{color:#60A5FA;border-color:rgba(96,165,250,.35);background:rgba(96,165,250,.05)}.nav-link--ebay:hover{background:rgba(96,165,250,.12)}
    /* PAGE */
    .search-hero{text-align:center;margin-bottom:32px}
    .search-hero h1{font-family:'Cinzel',serif;font-size:clamp(22px,4vw,36px);color:var(--gold);margin-bottom:16px}
    .search-bar-wrap{display:flex;gap:0;max-width:640px;margin:0 auto}
    .search-bar-input{flex:1;background:var(--bg3);border:1px solid var(--border);border-right:none;border-radius:10px 0 0 10px;padding:14px 18px;font-size:15px;color:var(--text);font-family:'DM Sans',sans-serif;outline:none;transition:border-color .2s}
    .search-bar-input:focus{border-color:rgba(201,168,76,.5)}
    .search-bar-input::placeholder{color:var(--text2)}
    .search-bar-btn{background:var(--gold);color:#0A0C14;border:none;border-radius:0 10px 10px 0;padding:14px 24px;font-family:'Cinzel',serif;font-size:13px;font-weight:700;cursor:pointer;transition:opacity .2s;white-space:nowrap}
    .search-bar-btn:hover{opacity:.85}
    /* GAME TABS */
    .tabs-wrap{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--border)}
    .tab{padding:6px 14px;border-radius:20px;border:1px solid var(--border);color:var(--text2);font-size:12px;font-weight:600;text-decoration:none;transition:all .2s;white-space:nowrap}
    .tab:hover{color:var(--text);border-color:var(--text2)}
    .tab-active{color:var(--gold);border-color:var(--gold);background:rgba(201,168,76,.08)}
    .tab-count{background:rgba(255,255,255,.1);border-radius:10px;padding:1px 6px;font-size:10px;margin-left:4px}
    /* RESULTS */
    .results-meta{font-size:13px;color:var(--text2);margin-bottom:20px}
    .results-meta strong{color:var(--text)}
    .results-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px}
    .result-card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;overflow:hidden;text-decoration:none;transition:all .2s;display:flex;flex-direction:column;position:relative}
    .result-card:hover{border-color:var(--gold);transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.4)}
    .card-img-wrap{aspect-ratio:2/3;background:var(--bg3);overflow:hidden;display:flex;align-items:center;justify-content:center}
    .card-img-wrap img{width:100%;height:100%;object-fit:cover}
    .card-no-img{font-size:36px;color:var(--text2)}
    .card-info{padding:10px;flex:1;display:flex;flex-direction:column;gap:4px}
    .game-badge{font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:4px;border:1px solid;display:inline-block;width:fit-content}
    .card-name{font-size:12px;font-weight:600;color:var(--text);line-height:1.3}
    .card-set{font-size:10px;color:var(--text2)}
    .card-price{font-size:13px;font-weight:700;color:var(--gold);margin-top:auto;padding-top:4px}
    .no-results{text-align:center;padding:60px 24px;color:var(--text2)}
    .btn-ebay{display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.35);color:#60A5FA;border-radius:8px;font-weight:700;text-decoration:none;transition:all .2s}
    .btn-ebay:hover{background:rgba(96,165,250,.2)}
    footer{border-top:1px solid var(--border);padding:24px;text-align:center;font-size:12px;color:var(--text2);margin-top:48px}
    footer a{color:var(--text2);margin:0 8px}footer a:hover{color:var(--text)}
    /* SORT + FILTER */
    .controls-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:20px;padding:12px 16px;background:var(--bg2);border:1px solid var(--border);border-radius:10px}
    .controls-label{font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.08em;white-space:nowrap}
    .sort-select{background:var(--bg3);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;outline:none}
    .rarity-chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
    .rarity-chip{padding:3px 10px;border-radius:12px;border:1px solid var(--border);background:none;color:var(--text2);font-size:11px;font-weight:600;cursor:pointer;transition:all .15s}
    .rarity-chip:hover{color:var(--text);border-color:var(--text)}
    .rarity-chip.active{background:var(--gold);border-color:var(--gold);color:#000}
    /* LAYOUT */
    .content-wrap{display:flex;gap:24px;align-items:flex-start;max-width:1400px;margin:0 auto;padding:0 20px}
    .main-col{flex:1;min-width:0}
    .sidebar{width:240px;flex-shrink:0;position:sticky;top:80px}
    .sidebar-card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px}
    .sidebar-title{font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px}
    .sidebar-result{display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);text-decoration:none}
    .sidebar-result:last-child{border-bottom:none}
    .sidebar-result img{width:32px;height:44px;object-fit:cover;border-radius:3px;flex-shrink:0}
    .sidebar-result-info{min-width:0}
    .sidebar-result-name{font-size:11px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sidebar-result-price{font-size:11px;color:var(--gold);font-weight:700}
    .sidebar-result-game{font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em}
    /* TOP RESULT */
    .result-card--top{border-color:var(--gold);box-shadow:0 0 16px rgba(201,168,76,.2)}
    .top-badge{position:absolute;top:6px;left:6px;background:var(--gold);color:#000;font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px;letter-spacing:.05em}
    .no-price{color:var(--text2) !important}
    @media(max-width:900px){.sidebar{display:none}.content-wrap{padding:0 16px}}
    @media(max-width:600px){.results-grid{grid-template-columns:repeat(auto-fill,minmax(130px,1fr))}.nav-links{display:none}.controls-bar{padding:8px 12px}}
  </style>
</head>
<body>
<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo"><img src="/c3logo.png" alt="C3"></a>
    <div class="nav-search-wrap">
      <form action="/search" method="get" style="display:flex;gap:0;width:100%">
        <input class="nav-search-input" type="text" name="q" value="${safeQuery}" placeholder="Search cards across all TCGs..." autocomplete="off" style="border-radius:7px 0 0 7px;padding-right:8px">
        <button type="submit" class="nav-search-btn" style="border-radius:0 7px 7px 0;border:1px solid rgba(201,168,76,.35);border-left:none;background:rgba(201,168,76,.15);color:#C9A84C;cursor:pointer;padding:6px 10px;font-size:13px;flex-shrink:0">&#128269;</button>
      </form>
    </div>
    <div class="nav-links">
      <a href="/cards" class="nav-link nav-link--vault">Card Vault</a>
      <a href="/compare" class="nav-link nav-link--compare">Compare</a>
      <a href="/market" class="nav-link nav-link--market">Market</a>
      <a href="/tools" class="nav-link nav-link--tools">Tools</a>
      <a href="/play" class="nav-link nav-link--play">Play</a>
      <a href="/blog" class="nav-link nav-link--blog">Blog</a>
      <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=C3Nav&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="nav-link nav-link--ebay">Shop eBay &#8599;</a>
    </div>
  </div>
</nav>

<div class="search-hero" style="max-width:1400px;margin:0 auto;padding:32px 20px 0">
  <h1>Search TCG Cards</h1>
  <form action="/search" method="get">
    <div class="search-bar-wrap">
      <input class="search-bar-input" type="text" name="q" value="${safeQuery}" placeholder="Card name e.g. Pikachu, Lightning Bolt, Lola..." autocomplete="off" autofocus>
      <button type="submit" class="search-bar-btn">Search</button>
    </div>
  </form>
</div>

<div class="content-wrap">
<div class="main-col">
  ${query.length >= 2 ? `
  <div class="tabs-wrap">
    <a href="${allHref}" class="tab${allActive}" style="${!gameFilter ? 'color:var(--gold);border-color:var(--gold);background:rgba(201,168,76,.08)' : ''}">All Games${results.length ? ` <span class="tab-count">${results.length}</span>` : ''}</a>
    ${gameFilterTabs}
  </div>
  <div class="results-meta">
    ${hasResults
      ? `<strong>${results.length}</strong> result${results.length !== 1 ? 's' : ''} for "<strong>${safeQuery}</strong>"${gameFilter ? ` in ${SEARCHABLE_GAMES.find(g=>g.game===gameFilter)?.label || gameFilter}` : ' across all games'}`
      : ''}
  </div>` : ''}

  ${hasResults ? `<div class="controls-bar">
    <span class="controls-label">Sort:</span>
    <select class="sort-select" onchange="sortResults(this.value)">
      <option value="price-desc">Price: High to Low</option>
      <option value="price-asc">Price: Low to High</option>
      <option value="name-asc">Name: A to Z</option>
    </select>
    <span class="controls-label" style="margin-left:8px">Rarity:</span>
    <div class="rarity-chips" id="rarity-chips"></div>
  </div>` : ''}
  <div class="results-grid" id="results-grid">${resultsHTML}</div>
</div>
<!-- SIDEBAR - inside content-wrap so flexbox positions it beside main-col -->
<div class="sidebar" id="sidebar" style="display:${hasResults ? '' : 'none'}">
  <div class="sidebar-card">
    <div class="sidebar-title">Top by Game</div>
    <div id="sidebar-tops"></div>
  </div>
  <div class="sidebar-card" style="background:rgba(201,168,76,.04);border-color:rgba(201,168,76,.2)">
    <div class="sidebar-title" style="color:var(--gold)">Quick Links</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      <a href="/compare" style="font-size:12px;color:var(--text2)">&#128203; Compare Prices</a>
      <a href="/ev-calculator.html" style="font-size:12px;color:var(--text2)">&#128202; EV Calculator</a>
      <a href="/tracker.html" style="font-size:12px;color:var(--text2)">&#128196; Free Tracker</a>
      <a href="/market" style="font-size:12px;color:var(--text2)">&#128200; Market Insights</a>
    </div>
  </div>
</div>
</div>

<footer>
  <div style="margin-bottom:8px">
    <a href="/">Home</a><a href="/cards">Card Vault</a><a href="/compare">Compare</a>
    <a href="/market">Market</a><a href="/blog">Blog</a><a href="/tracker.html">Tracker</a>
  </div>
  <p>&#169; 2026 Cards on Cards on Cards &middot; cardsoncardsoncards.com.au &middot; Prices in AUD updated daily</p>
  <p style="margin-top:6px;font-size:11px;opacity:.5">Affiliate links may earn a small commission at no extra cost to you.</p>
</footer>

<script>
// Build rarity chips and sidebar from rendered results
(function(){
  var grid = document.getElementById('results-grid');
  if (!grid) return;
  var cards = Array.from(grid.querySelectorAll('.result-card'));
  if (!cards.length) return;

  // Build rarity chips
  var rarities = {};
  cards.forEach(function(el) {
    var r = el.dataset.rarity || 'unknown';
    rarities[r] = (rarities[r] || 0) + 1;
  });
  var chipsEl = document.getElementById('rarity-chips');
  if (chipsEl) {
    var allChip = document.createElement('button');
    allChip.className = 'rarity-chip active';
    allChip.textContent = 'All';
    allChip.onclick = function() { filterRarity('all', this); };
    chipsEl.appendChild(allChip);
    Object.keys(rarities).sort().forEach(function(r) {
      if (r === 'unknown') return;
      var chip = document.createElement('button');
      chip.className = 'rarity-chip';
      chip.textContent = r.replace(/-/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();})+' ('+rarities[r]+')';
      chip.onclick = function() { filterRarity(r, this); };
      chipsEl.appendChild(chip);
    });
  }

  // Build sidebar top-by-game
  var sidebar = document.getElementById('sidebar-tops');
  if (sidebar) {
    var seen = {};
    var tops = [];
    cards.forEach(function(el) {
      var g = el.dataset.game;
      if (!seen[g] && parseFloat(el.dataset.price) > 0) {
        seen[g] = true;
        tops.push(el);
      }
    });
    tops.slice(0, 7).forEach(function(el) {
      var img = el.querySelector('img');
      var name = el.querySelector('.card-name');
      var price = el.querySelector('.card-price');
      var badge = el.querySelector('.game-badge');
      var a = document.createElement('a');
      a.href = el.href;
      a.className = 'sidebar-result';
      a.innerHTML = (img ? '<img src="'+img.src+'" alt="">' : '<div style="width:32px;height:44px;background:var(--bg3);border-radius:3px;flex-shrink:0"></div>')
        + '<div class="sidebar-result-info">'
        + '<div class="sidebar-result-game">'+(badge ? badge.textContent : '')+'</div>'
        + '<div class="sidebar-result-name">'+(name ? name.textContent : '')+'</div>'
        + '<div class="sidebar-result-price">'+(price ? price.textContent : '')+'</div>'
        + '</div>';
      sidebar.appendChild(a);
    });
  }
})();

function sortResults(val) {
  var grid = document.getElementById('results-grid');
  if (!grid) return;
  var cards = Array.from(grid.querySelectorAll('.result-card'));
  cards.sort(function(a, b) {
    if (val === 'price-desc') return parseFloat(b.dataset.price||0) - parseFloat(a.dataset.price||0);
    if (val === 'price-asc') return parseFloat(a.dataset.price||0) - parseFloat(b.dataset.price||0);
    if (val === 'name-asc') return (a.dataset.name||'').localeCompare(b.dataset.name||'');
    return 0;
  });
  cards.forEach(function(c) { grid.appendChild(c); });
}

function filterRarity(rarity, btn) {
  var chips = document.querySelectorAll('.rarity-chip');
  chips.forEach(function(c) { c.classList.remove('active'); });
  btn.classList.add('active');
  var cards = document.querySelectorAll('.result-card');
  cards.forEach(function(c) {
    c.style.display = (rarity === 'all' || c.dataset.rarity === rarity) ? '' : 'none';
  });
}

// Submit on Enter in the hero search bar is handled by the form
// Track search events
if ('${query.replace(/'/g,"\\'").replace(/</g,'').replace(/>/g,'')}') {
  gtag('event', 'search', { search_term: '${query.replace(/'/g,"\\'").replace(/</g,'').replace(/>/g,'')}', results_count: ${results.length} });
}
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=300' }
  });
};

export const config = { path: '/search' };
