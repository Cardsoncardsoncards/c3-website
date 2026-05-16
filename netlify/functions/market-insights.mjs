// netlify/functions/market-insights.mjs
// C3 Market Insights — Premium Collector/Seller Hub at /market
// Password protected (same as VIP: c3vip2026)
// Shows top movers, buy signals, sell signals, hold signals across all TCGs
// Data: tcgapi.dev top-movers endpoint + mtg_price_snapshots for MTG

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const TCGAPI_KEY        = Netlify.env.get('TCGAPI_KEY');
const EPN_CAMPID        = '5339146789';
const MARKET_PASSWORD   = 'c3vip2026';
const TCGAPI_BASE       = 'https://api.tcgapi.dev/v1';

const GAME_CONFIG = {
  pokemon:    { label: 'Pokemon',     color: '#EF4444', slug: 'pokemon',              path: '/cards/pokemon' },
  yugioh:     { label: 'Yu-Gi-Oh',    color: '#8B5CF6', slug: 'yugioh',               path: '/cards/yugioh' },
  lorcana:    { label: 'Lorcana',     color: '#3B82F6', slug: 'lorcana',              path: '/cards/lorcana' },
  onepiece:   { label: 'One Piece',   color: '#F97316', slug: 'onepiece',             path: '/cards/onepiece' },
  dragonball: { label: 'Dragon Ball', color: '#EAB308', slug: 'dragonball',           path: '/cards/dragonball' },
  starwars:   { label: 'Star Wars',   color: '#FFE81F', slug: 'starwars',             path: '/cards/starwars' },
  riftbound:  { label: 'Riftbound',   color: '#10B981', slug: 'riftbound',            path: '/cards/riftbound' },
  mtg:        { label: 'MTG',         color: '#C9A84C', slug: 'mtg',                  path: '/cards/mtg' },
};

const TCG_API_GAME_MAP = {
  pokemon: 'pokemon', yugioh: 'yugioh', lorcana: 'disney-lorcana',
  onepiece: 'one-piece-card-game', dragonball: 'dragon-ball-super',
  starwars: 'star-wars-unlimited', riftbound: 'riftbound-league-of-legends-trading-card-game',
};

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
  });
  if (!res.ok) return [];
  return res.json();
}

async function fetchTopMovers(game, direction = 'gainers', limit = 10) {
  if (!TCGAPI_KEY) return [];
  const tcgGame = TCG_API_GAME_MAP[game];
  if (!tcgGame) return [];
  try {
    const url = `${TCGAPI_BASE}/prices/top-movers?game=${tcgGame}&direction=${direction}&period=7d&limit=${limit}`;
    const res = await fetch(url, { headers: { 'X-API-Key': TCGAPI_KEY } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map(card => ({
      name: card.name || card.card_name,
      setName: card.set_name || card.set || '',
      price: card.market_price || card.price || 0,
      priceAud: ((card.market_price || card.price || 0) * 1.58).toFixed(2),
      change7d: card.price_change_7d || card.change_7d || 0,
      rarity: card.rarity || '',
      image: card.image_url || card.image || '',
      slug: card.slug || '',
      game,
    }));
  } catch { return []; }
}

async function fetchMTGTopMovers(direction = 'up', limit = 10) {
  // Compute movers by joining today vs 7 days ago snapshots
  // price_change_7d column is not populated, so we join two dates
  try {
    const today = await supabaseGet(
      `mtg_price_snapshots?order=snapshot_date.desc&limit=1&select=snapshot_date`
    );
    if (!today.length) return [];
    const latestDate = today[0].snapshot_date;

    // Get date 7 days ago from latest
    const d = new Date(latestDate);
    d.setDate(d.getDate() - 7);
    const weekAgoDate = d.toISOString().split('T')[0];

    // Fetch both dates in parallel - top 1500 by price each
    const [latestSnaps, weekAgoSnaps] = await Promise.all([
      supabaseGet(`mtg_price_snapshots?snapshot_date=eq.${latestDate}&price_aud=gt.1&select=scryfall_id,price_aud&order=price_aud.desc&limit=1500`),
      supabaseGet(`mtg_price_snapshots?snapshot_date=eq.${weekAgoDate}&price_aud=gt.1&select=scryfall_id,price_aud&order=price_aud.desc&limit=1500`)
    ]);

    if (!latestSnaps.length || !weekAgoSnaps.length) return [];

    // Build lookup map for week-ago prices
    const weekAgoMap = {};
    weekAgoSnaps.forEach(s => { weekAgoMap[s.scryfall_id] = parseFloat(s.price_aud); });

    // Compute % changes
    const movers = latestSnaps
      .filter(s => weekAgoMap[s.scryfall_id] && weekAgoMap[s.scryfall_id] > 0)
      .map(s => ({
        scryfall_id: s.scryfall_id,
        priceAud: parseFloat(s.price_aud),
        weekAgoAud: weekAgoMap[s.scryfall_id],
        pct: ((parseFloat(s.price_aud) - weekAgoMap[s.scryfall_id]) / weekAgoMap[s.scryfall_id]) * 100
      }))
      .filter(s => direction === 'up' ? s.pct >= 5 : s.pct <= -5)
      .sort((a, b) => direction === 'up' ? b.pct - a.pct : a.pct - b.pct)
      .slice(0, limit);

    if (!movers.length) return [];

    const ids = movers.map(s => s.scryfall_id).join(',');
    const cards = await supabaseGet(
      `mtg_cards?scryfall_id=in.(${ids})&select=name,slug,set_name,rarity,image_uri_small,price_aud,price_usd,scryfall_id`
    );

    return movers.map(mover => {
      const card = cards.find(c => c.scryfall_id === mover.scryfall_id);
      if (!card) return null;
      return {
        name: card.name,
        setName: card.set_name,
        price: card.price_usd || 0,
        priceAud: mover.priceAud,
        change7d: parseFloat(mover.pct.toFixed(1)),
        rarity: card.rarity || '',
        image: card.image_uri_small || '',
        slug: card.slug,
        game: 'mtg',
      };
    }).filter(Boolean);
  } catch (e) {
    console.error('fetchMTGTopMovers error:', e.message);
    return [];
  }
}

async function fetchMTGBuySignals(limit = 8) {
  // Cards near 52-week low — buying opportunity
  try {
    const data = await supabaseGet(
      `mtg_price_snapshots?price_52w_low_aud=gt.1&order=price_aud.asc&limit=50&select=scryfall_id,price_aud,price_52w_high_aud,price_52w_low_aud`
    );
    const signals = data.filter(s => {
      if (!s.price_52w_high_aud || !s.price_52w_low_aud) return false;
      const range = s.price_52w_high_aud - s.price_52w_low_aud;
      if (range < 1) return false;
      const pos = (s.price_aud - s.price_52w_low_aud) / range;
      return pos <= 0.20; // Near 52W low
    }).slice(0, limit);
    if (!signals.length) return [];
    const ids = signals.map(s => s.scryfall_id).join(',');
    const cards = await supabaseGet(`mtg_cards?scryfall_id=in.(${ids})&select=name,slug,set_name,rarity,image_uri_small,price_usd`);
    return signals.map(snap => {
      const card = cards.find(c => c.scryfall_id === snap.scryfall_id);
      if (!card) return null;
      const discount = Math.round(((snap.price_52w_high_aud - snap.price_aud) / snap.price_52w_high_aud) * 100);
      return { ...card, priceAud: snap.price_aud, high52w: snap.price_52w_high_aud, low52w: snap.price_52w_low_aud, discount, game: 'mtg' };
    }).filter(Boolean);
  } catch { return []; }
}

async function fetchMTGSellSignals(limit = 8) {
  // Cards near 52-week high — sell opportunity
  try {
    const data = await supabaseGet(
      `mtg_price_snapshots?price_52w_high_aud=gt.2&order=price_aud.desc&limit=50&select=scryfall_id,price_aud,price_52w_high_aud,price_52w_low_aud`
    );
    const signals = data.filter(s => {
      if (!s.price_52w_high_aud || !s.price_52w_low_aud) return false;
      const range = s.price_52w_high_aud - s.price_52w_low_aud;
      if (range < 1) return false;
      const pos = (s.price_aud - s.price_52w_low_aud) / range;
      return pos >= 0.80; // Near 52W high
    }).slice(0, limit);
    if (!signals.length) return [];
    const ids = signals.map(s => s.scryfall_id).join(',');
    const cards = await supabaseGet(`mtg_cards?scryfall_id=in.(${ids})&select=name,slug,set_name,rarity,image_uri_small,price_usd`);
    return signals.map(snap => {
      const card = cards.find(c => c.scryfall_id === snap.scryfall_id);
      if (!card) return null;
      const nearHighPct = Math.round(((snap.price_aud - snap.price_52w_low_aud) / (snap.price_52w_high_aud - snap.price_52w_low_aud)) * 100);
      return { ...card, priceAud: snap.price_aud, high52w: snap.price_52w_high_aud, low52w: snap.price_52w_low_aud, nearHighPct, game: 'mtg' };
    }).filter(Boolean);
  } catch { return []; }
}

function formatAUD(num) {
  if (!num || num <= 0) return 'N/A';
  return 'AU$' + parseFloat(num).toFixed(2);
}

function changeClass(pct) {
  return parseFloat(pct) >= 0 ? 'positive' : 'negative';
}

function changeStr(pct) {
  const n = parseFloat(pct);
  return (n >= 0 ? '▲' : '▼') + ' ' + Math.abs(n).toFixed(1) + '%';
}

function cardRow(card, mode = 'movers') {
  const cfg = GAME_CONFIG[card.game] || GAME_CONFIG.mtg;
  const cardPath = card.slug ? `${cfg.path}/${card.slug}` : null;
  const ebayUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(card.name + ' ' + (card.game === 'mtg' ? 'mtg' : card.game))}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;

  const extraBadge = mode === 'buy'
    ? `<span class="signal-badge signal-buy">▼${card.discount}% off high</span>`
    : mode === 'sell'
    ? `<span class="signal-badge signal-sell">▲ Near ${card.nearHighPct}% of 52W high</span>`
    : card.change7d ? `<span class="change-badge ${changeClass(card.change7d)}">${changeStr(card.change7d)} 7d</span>` : '';

  return `<div class="card-row" data-game="${card.game}">
    <div class="card-row-img">
      ${card.image ? `<img src="${card.image}" alt="${card.name}" loading="lazy">` : '<div class="img-placeholder"></div>'}
    </div>
    <div class="card-row-info">
      <div class="card-row-name">${cardPath ? `<a href="${cardPath}">${card.name}</a>` : card.name}</div>
      <div class="card-row-meta">
        <span class="game-pill" style="background:${cfg.color}22;color:${cfg.color};border-color:${cfg.color}44">${cfg.label}</span>
        ${card.setName ? `<span class="set-name">${card.setName}</span>` : ''}
        ${card.rarity ? `<span class="rarity-tag">${card.rarity}</span>` : ''}
      </div>
    </div>
    <div class="card-row-price">
      <div class="price-aud">${formatAUD(card.priceAud)}</div>
      ${extraBadge}
    </div>
    <div class="card-row-cta">
      <a href="${ebayUrl}" target="_blank" rel="noopener" class="buy-btn">eBay AU →</a>
      ${card.slug ? `<a href="/compare?cards=${card.slug}" class="compare-link">Compare</a>` : ''}
    </div>
  </div>`;
}

function renderPage({ gainers, losers, buySignals, sellSignals, selectedGame, updated }) {
  const gameOptions = ['all', ...Object.keys(GAME_CONFIG)].map(g => {
    const cfg = GAME_CONFIG[g];
    const label = g === 'all' ? 'All Games' : cfg.label;
    return `<button class="game-filter-btn ${selectedGame === g ? 'active' : ''}" onclick="filterGame('${g}')" data-game="${g}">${label}</button>`;
  }).join('');

  const gainersHTML = gainers.length
    ? gainers.map(c => cardRow(c, 'movers')).join('')
    : '<div class="empty-state">Not enough price history yet. Check back tomorrow.</div>';

  const losersHTML = losers.length
    ? losers.map(c => cardRow(c, 'movers')).join('')
    : '<div class="empty-state">Not enough data yet.</div>';

  const buyHTML = buySignals.length
    ? buySignals.map(c => cardRow(c, 'buy')).join('')
    : '<div class="empty-state">No strong buy signals today.</div>';

  const sellHTML = sellSignals.length
    ? sellSignals.map(c => cardRow(c, 'sell')).join('')
    : '<div class="empty-state">No strong sell signals today.</div>';

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>C3 Market Insights | TCG Price Movers Australia</title>
  <meta name="description" content="Track TCG price movers, buy and sell signals across MTG, Pokemon, Lorcana and more. Updated daily. Australia's TCG market intelligence hub.">
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <style>
    :root {
      --bg:#080b12;--bg2:#0f1420;--bg3:#161d2e;--bg4:#1e2638;
      --accent:#C9A84C;--accent2:#7c6af5;
      --green:#22c55e;--red:#ef4444;--orange:#f97316;
      --text:#e8eaf0;--text2:#8892b0;--border:#1e2638;--radius:10px;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6;min-height:100vh}
    body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;
      background:radial-gradient(ellipse 70% 35% at 50% -5%,rgba(201,168,76,.07),transparent 60%),
                 radial-gradient(ellipse 40% 25% at 85% 85%,rgba(124,106,245,.04),transparent 50%)}

    /* Nav */
    nav{background:rgba(8,11,18,.97);backdrop-filter:blur(20px);border-bottom:1px solid var(--border);padding:12px 0;position:sticky;top:0;z-index:100}
    .nav-inner{max-width:1200px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:16px}
    .nav-logo{font-family:'Cinzel',serif;font-size:13px;font-weight:700;color:var(--accent);letter-spacing:.12em;text-transform:uppercase;text-decoration:none}
    .nav-links{display:flex;gap:6px;flex-wrap:wrap}
    .nav-link{font-size:11px;padding:5px 10px;border-radius:6px;border:1px solid var(--border);color:var(--text2);text-decoration:none;font-weight:600;letter-spacing:.05em;text-transform:uppercase;transition:all .2s}
    .nav-link:hover{color:var(--text);border-color:var(--text2)}
    .nav-link.active{color:var(--accent);border-color:rgba(201,168,76,.4);background:rgba(201,168,76,.06)}

    /* Header */
    .page-header{max-width:1200px;margin:48px auto 32px;padding:0 24px;position:relative;z-index:1}
    .page-eyebrow{font-size:10px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--accent);margin-bottom:10px}
    .page-title{font-family:'Cinzel',serif;font-size:clamp(28px,5vw,48px);font-weight:900;color:var(--text);line-height:1.1;margin-bottom:12px}
    .page-title .gold{color:var(--accent)}
    .page-subtitle{font-size:15px;color:var(--text2);max-width:600px;margin-bottom:24px}
    .updated-badge{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--text2);background:var(--bg3);border:1px solid var(--border);border-radius:100px;padding:4px 12px}
    .updated-dot{width:6px;height:6px;border-radius:50%;background:var(--green);animation:pulse 2s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

    /* Premium badge */
    .premium-banner{background:linear-gradient(135deg,rgba(201,168,76,.12),rgba(124,106,245,.08));border:1px solid rgba(201,168,76,.25);border-radius:var(--radius);padding:14px 20px;margin-bottom:32px;display:flex;align-items:center;gap:12px;font-size:13px;color:var(--text2)}
    .premium-icon{font-size:20px}

    /* Game filter */
    .game-filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:32px;position:relative;z-index:1}
    .game-filter-btn{padding:7px 14px;border-radius:100px;border:1px solid var(--border);background:transparent;color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;font-family:'DM Sans',sans-serif;letter-spacing:.04em}
    .game-filter-btn:hover{border-color:var(--accent);color:var(--accent)}
    .game-filter-btn.active{background:var(--accent);border-color:var(--accent);color:#000}
    .top5-strip{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px 20px;margin-bottom:24px;position:relative;z-index:1}
    .top5-label{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);margin-bottom:12px}
    .top5-scroll{display:flex;gap:12px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}
    .top5-scroll::-webkit-scrollbar{display:none}
    .top5-card{flex:0 0 110px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center;text-decoration:none;transition:all .2s}
    .top5-card:hover{border-color:var(--accent);transform:translateY(-2px)}
    .top5-img{width:100%;border-radius:4px;max-height:90px;object-fit:contain;display:block;margin-bottom:4px}
    .top5-img-placeholder{height:70px;display:flex;align-items:center;justify-content:center;font-size:24px}
    .top5-name{font-size:10px;color:#e8eaf0;font-weight:600;line-height:1.3;margin-bottom:2px;font-family:sans-serif}
    .top5-change{font-size:11px;font-weight:700;margin-bottom:1px}
    .top5-up{color:#4caf50}
    .top5-down{color:#f44336}
    .top5-price{font-size:10px;color:var(--accent);font-weight:700;font-family:sans-serif}

    /* Section tabs */
    .section-tabs{display:flex;gap:4px;margin-bottom:20px;border-bottom:1px solid var(--border);position:relative;z-index:1}
    .tab-btn{padding:10px 20px;border:none;background:transparent;color:var(--text2);font-size:13px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .2s;font-family:'DM Sans',sans-serif}
    .tab-btn.active{color:var(--accent);border-bottom-color:var(--accent)}
    .tab-btn:hover:not(.active){color:var(--text)}

    /* Tab panels */
    .tab-panel{display:none;position:relative;z-index:1}
    .tab-panel.active{display:block}

    /* Card rows */
    .cards-list{display:flex;flex-direction:column;gap:8px}
    .card-row{display:grid;grid-template-columns:52px 1fr auto auto;gap:12px;align-items:center;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px;transition:all .2s}
    .card-row:hover{border-color:rgba(201,168,76,.25);background:var(--bg3)}
    .card-row-img img{width:52px;border-radius:6px;display:block}
    .img-placeholder{width:52px;height:72px;background:var(--bg3);border-radius:6px}
    .card-row-name{font-size:14px;font-weight:600;color:var(--text);margin-bottom:6px}
    .card-row-name a{color:var(--text);text-decoration:none}
    .card-row-name a:hover{color:var(--accent)}
    .card-row-meta{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
    .game-pill{font-size:10px;padding:2px 8px;border-radius:4px;font-weight:700;border:1px solid}
    .set-name{font-size:11px;color:var(--text2)}
    .rarity-tag{font-size:10px;color:var(--text2);background:var(--bg3);border-radius:3px;padding:1px 6px}
    .card-row-price{text-align:right}
    .price-aud{font-family:'Cinzel',serif;font-size:16px;font-weight:700;color:var(--accent);margin-bottom:4px}
    .change-badge{font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;display:inline-block}
    .change-badge.positive{background:rgba(34,197,94,.15);color:var(--green)}
    .change-badge.negative{background:rgba(239,68,68,.15);color:var(--red)}
    .signal-badge{font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;display:inline-block}
    .signal-buy{background:rgba(34,197,94,.15);color:var(--green)}
    .signal-sell{background:rgba(239,68,68,.15);color:var(--red)}
    .card-row-cta{display:flex;flex-direction:column;gap:6px;align-items:flex-end}
    .buy-btn{background:var(--accent);color:#000;padding:6px 12px;border-radius:6px;font-size:11px;font-weight:700;text-decoration:none;white-space:nowrap;transition:opacity .2s}
    .buy-btn:hover{opacity:.85;text-decoration:none}
    .compare-link{font-size:11px;color:var(--accent2);text-decoration:none;text-align:center}
    .compare-link:hover{text-decoration:underline}
    .empty-state{padding:32px;text-align:center;color:var(--text2);font-size:14px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius)}

    /* Section headers */
    .section-hd{margin-bottom:16px}
    .section-title{font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:var(--text);margin-bottom:4px}
    .section-sub{font-size:13px;color:var(--text2)}

    /* Signal explanation */
    .signal-explainer{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px}
    @media(max-width:680px){.signal-explainer{grid-template-columns:1fr}}
    .signal-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:16px}
    .signal-card-icon{font-size:24px;margin-bottom:8px}
    .signal-card-title{font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px}
    .signal-card-desc{font-size:12px;color:var(--text2);line-height:1.5}

    /* Responsive */
    @media(max-width:600px){
      .card-row{grid-template-columns:40px 1fr;grid-template-rows:auto auto}
      .card-row-price{grid-column:2;text-align:left}
      .card-row-cta{grid-column:1/-1;flex-direction:row;align-items:center}
    }

    /* Wrap */
    .content{max-width:1200px;margin:0 auto;padding:0 24px 64px;position:relative;z-index:1}

    /* Footer */
    footer{background:var(--bg2);border-top:1px solid var(--border);padding:32px 24px;text-align:center;color:var(--text2);font-size:13px;position:relative;z-index:1}
    footer a{color:var(--text2);margin:0 10px}

    /* Coming soon overlay */
    .coming-soon-overlay{position:fixed;inset:0;background:rgba(8,11,18,.97);z-index:1000;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;text-align:center;padding:24px}
    .coming-soon-title{font-family:'Cinzel',serif;font-size:32px;color:var(--accent)}
    .coming-soon-sub{color:var(--text2);font-size:15px;max-width:480px}
  </style>
</head>
<body>

<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo">C3</a>
    <div class="nav-links">
      <a href="/cards" class="nav-link nav-link--vault">Card Vault</a>
      <a href="/compare" class="nav-link nav-link--compare">Compare</a>
      <a href="/market" class="nav-link nav-link--market active">Market</a>
      <a href="/tools" class="nav-link nav-link--tools">Tools</a>
      <a href="/play" class="nav-link nav-link--play">Play</a>
      <a href="/blog" class="nav-link nav-link--blog">Blog</a>
      <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=C3Nav&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="nav-link nav-link--ebay">Shop eBay &#8599;</a>
    </div>
  </div>
</nav>

<div class="page-header">
  <div class="page-eyebrow">C3 Market Intelligence</div>
  <h1 class="page-title">TCG <span class="gold">Price Movers</span></h1>
  <p class="page-subtitle">Track what's going up, what's coming down, and where the buying and selling opportunities are across all TCGs in Australia. Updated daily.</p>
  <div class="updated-badge">
    <span class="updated-dot"></span>
    Updated ${updated}
  </div>
</div>

<div class="content">

  <div class="premium-banner">
    <span class="premium-icon">⚡</span>
    <div>
      <strong style="color:var(--accent)">Early Access</strong> — This feature is in development.
      Price history is building daily. MTG movers are powered by C3's own data. Non-MTG movers update as sync data accumulates.
      <a href="/tracker.html" style="color:var(--accent)">Join the waitlist</a> to be notified when this goes public.
    </div>
  </div>

  <div class="game-filters" id="game-filters">
    ${gameOptions}
  </div>

  ${gainers.filter(m => m.game === 'mtg' && m.change7d !== 0).length >= 2 ? `
  <div class="top5-strip" id="top5-strip">
    <div class="top5-label">📈 Biggest Movers This Week (MTG)</div>
    <div class="top5-scroll">
      ${gainers.filter(m => m.game === 'mtg' && m.change7d !== 0).slice(0, 5).map(c => `
        <a href="/cards/mtg/${c.slug}" class="top5-card" onclick="gtag('event','market_top5_clicked',{card:'${c.name.replace(/'/g,"\'")}'})" title="${c.name} — +${c.change7d}% this week">
          ${c.image ? `<img src="${c.image}" alt="${c.name}" class="top5-img" loading="lazy">` : '<div class="top5-img-placeholder">🃏</div>'}
          <div class="top5-name">${c.name.length > 18 ? c.name.slice(0,16)+'…' : c.name}</div>
          <div class="top5-change top5-up">+${c.change7d}%</div>
          <div class="top5-price">AU$${parseFloat(c.priceAud).toFixed(2)}</div>
        </a>`).join('')}
    </div>
  </div>` : ''}

  <div class="signal-explainer">
    <div class="signal-card">
      <div class="signal-card-icon">📈</div>
      <div class="signal-card-title">Top Gainers</div>
      <div class="signal-card-desc">Cards with the biggest price increases in the last 7 days. Consider selling if you hold these.</div>
    </div>
    <div class="signal-card">
      <div class="signal-card-icon">📉</div>
      <div class="signal-card-title">Top Losers</div>
      <div class="signal-card-desc">Cards dropping in price. Could be a buying opportunity if the card is fundamentally strong.</div>
    </div>
    <div class="signal-card">
      <div class="signal-card-icon">🎯</div>
      <div class="signal-card-title">Buy and Sell Signals</div>
      <div class="signal-card-desc">Cards near their 52-week low (buy signal) or 52-week high (sell signal) based on MTG price history.</div>
    </div>
  </div>

  <div class="section-tabs">
    <button class="tab-btn active" onclick="switchTab('gainers', this)">📈 Top Gainers (7d)</button>
    <button class="tab-btn" onclick="switchTab('losers', this)">📉 Top Losers (7d)</button>
    <button class="tab-btn" onclick="switchTab('buy', this)">🟢 Buy Signals (MTG)</button>
    <button class="tab-btn" onclick="switchTab('sell', this)">🔴 Sell Signals (MTG)</button>
  </div>

  <div id="tab-gainers" class="tab-panel active">
    <div class="section-hd">
      <div class="section-title">Biggest Gainers — Last 7 Days</div>
      <div class="section-sub">Cards with the strongest upward price movement. If you hold these, now may be a good time to sell.</div>
    </div>
    <div class="cards-list" id="gainers-list">
      ${gainersHTML}
    </div>
  </div>

  <div id="tab-losers" class="tab-panel">
    <div class="section-hd">
      <div class="section-title">Biggest Losers — Last 7 Days</div>
      <div class="section-sub">Cards with the largest price drops. Strong cards near support may be buying opportunities.</div>
    </div>
    <div class="cards-list" id="losers-list">
      ${losersHTML}
    </div>
  </div>

  <div id="tab-buy" class="tab-panel">
    <div class="section-hd">
      <div class="signal-card-title" style="font-family:'Cinzel',serif;font-size:18px;color:var(--text);margin-bottom:4px">Buy Signals — MTG</div>
      <div class="section-sub">MTG cards trading near their 52-week low. Could be undervalued relative to recent history. Always check format legality and EDHREC rank.</div>
    </div>
    <div class="cards-list">
      ${buyHTML}
    </div>
  </div>

  <div id="tab-sell" class="tab-panel">
    <div class="section-hd">
      <div class="signal-card-title" style="font-family:'Cinzel',serif;font-size:18px;color:var(--text);margin-bottom:4px">Sell Signals — MTG</div>
      <div class="section-sub">MTG cards trading near their 52-week high. If you hold these, the market may be at a good exit point.</div>
    </div>
    <div class="cards-list">
      ${sellHTML}
    </div>
  </div>

  <div style="margin-top:40px;padding:20px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);font-size:13px;color:var(--text2)">
    <strong style="color:var(--text)">Disclaimer:</strong> Price data sourced from TCGPlayer market data via tcgapi.dev and C3's own daily price snapshots. AUD prices are estimates based on USD conversion at approximately 1.58. This is market intelligence only — not financial advice. Always verify on eBay AU before buying or selling.
  </div>

</div>

<footer>
  <p><a href="/">Home</a><a href="/cards/mtg">MTG Cards</a><a href="/compare">Compare</a><a href="/market">Market</a><a href="/tracker.html">Tracker</a><a href="/blog">Blog</a><a href="/contact.html">Contact</a></p>
  <p style="margin-top:8px">© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
</footer>

<script>
// Access verified server-side

// Tab switching
function switchTab(tab, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  btn.classList.add('active');
  gtag('event', 'market_tab_switch', { tab });
}

// Game filter (client-side show/hide)
let activeGame = 'all';
function filterGame(game) {
  activeGame = game;
  document.querySelectorAll('.game-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.game === game));
  const strip = document.getElementById('top5-strip');
    if (strip) strip.style.display = (game === 'all' || game === 'mtg') ? '' : 'none';
    document.querySelectorAll('.card-row').forEach(row => {
    if (game === 'all') { row.style.display = ''; return; }
    row.style.display = (row.dataset.game === game) ? '' : 'none';
  });
  gtag('event', 'market_game_filter', { game });
}
</script>
</body>
</html>`;
}

export default async (req) => {
  const url = new URL(req.url);

  // Server-side password gate — password never exposed in page source
  const pwParam = url.searchParams.get('pw');
  if (pwParam !== MARKET_PASSWORD) {
    const loginHtml = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>C3 Market Insights — Early Access</title>
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;600&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#080b12;color:#e8eaf0;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:min-height:100vh;padding:24px;justify-content:center}
    .gate{text-align:center;max-width:400px;width:100%}
    h1{font-family:'Cinzel',serif;color:#C9A84C;font-size:24px;margin-bottom:12px}
    p{color:#8892b0;font-size:14px;margin-bottom:24px;line-height:1.6}
    input{width:100%;background:#0f1420;border:1px solid #2d3254;color:#e8eaf0;padding:12px 16px;border-radius:8px;font-size:15px;text-align:center;outline:none;margin-bottom:12px}
    input:focus{border-color:#C9A84C}
    button{width:100%;background:#C9A84C;color:#000;border:none;padding:13px;border-radius:8px;font-weight:700;font-size:15px;cursor:pointer}
    .links{margin-top:20px;font-size:12px;color:#8892b0}.links a{color:#C9A84C}
  </style>
</head>
<body>
<div class="gate">
  <div style="font-size:40px;margin-bottom:16px">⚡</div>
  <h1>C3 Market Insights</h1>
  <p>Track TCG price movers, buy and sell signals across all games. Early access only.</p>
  <form method="GET" action="/market">
    <input type="password" name="pw" placeholder="Enter access code" autocomplete="off">
    <button type="submit">Enter →</button>
  </form>
  <div class="links">No code? <a href="/tracker.html">Join the waitlist</a> or <a href="/contact.html">contact us</a>.</div>
</div>
</body>
</html>`;
    return new Response(loginHtml, {
      status: 401,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  // Serve page — password verified server-side
  const updated = new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  // Fetch all data in parallel
  const [
    mtgGainers, mtgLosers, buySignals, sellSignals,
    pokemonGainers, pokemonLosers,
    yugiohGainers, yugiohLosers,
    lorcanaGainers, lorcanaLosers,
    onepieceGainers, onepieceLosers,
    dragonballGainers, dragonballLosers,
    starwarsGainers, starwarsLosers,
    riftboundGainers, riftboundLosers,
  ] = await Promise.allSettled([
    fetchMTGTopMovers('up', 8),
    fetchMTGTopMovers('down', 8),
    fetchMTGBuySignals(8),
    fetchMTGSellSignals(8),
    fetchTopMovers('pokemon', 'gainers', 5),
    fetchTopMovers('pokemon', 'losers', 5),
    fetchTopMovers('yugioh', 'gainers', 5),
    fetchTopMovers('yugioh', 'losers', 5),
    fetchTopMovers('lorcana', 'gainers', 5),
    fetchTopMovers('lorcana', 'losers', 5),
    fetchTopMovers('onepiece', 'gainers', 5),
    fetchTopMovers('onepiece', 'losers', 5),
    fetchTopMovers('dragonball', 'gainers', 5),
    fetchTopMovers('dragonball', 'losers', 5),
    fetchTopMovers('starwars', 'gainers', 5),
    fetchTopMovers('starwars', 'losers', 5),
    fetchTopMovers('riftbound', 'gainers', 5),
    fetchTopMovers('riftbound', 'losers', 5),
  ]);

  const val = r => r.status === 'fulfilled' ? r.value : [];

  const gainers = [
    ...val(mtgGainers), ...val(pokemonGainers), ...val(yugiohGainers),
    ...val(lorcanaGainers), ...val(onepieceGainers), ...val(dragonballGainers),
    ...val(starwarsGainers), ...val(riftboundGainers),
  ].sort((a, b) => Math.abs(b.change7d) - Math.abs(a.change7d));

  const losers = [
    ...val(mtgLosers), ...val(pokemonLosers), ...val(yugiohLosers),
    ...val(lorcanaLosers), ...val(onepieceLosers), ...val(dragonballLosers),
    ...val(starwarsLosers), ...val(riftboundLosers),
  ].sort((a, b) => a.change7d - b.change7d);

  const html = renderPage({
    gainers,
    losers,
    buySignals: val(buySignals),
    sellSignals: val(sellSignals),
    selectedGame: 'all',
    updated,
  });

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
    }
  });
};

export const config = { path: '/market' };
