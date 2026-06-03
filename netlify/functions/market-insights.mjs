// netlify/functions/market-insights.mjs
// C3 Market, free public TCG price movers hub at /market
// Free: top movers up and down across games. Teased: buy and sell signals (Seller report).
// Data: per-game Supabase cards tables (price_change_7d) + mtg_price_snapshots for MTG.

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID        = '5339146789';
const FETCH_TIMEOUT     = 8000;

// Every game maps to its Supabase {key}_cards table. MTG is special (snapshot join).
const GAME_CONFIG = {
  mtg:               { label: 'MTG',              color: '#C9A84C', path: '/cards/mtg' },
  pokemon:           { label: 'Pokemon',          color: '#EF4444', path: '/cards/pokemon' },
  yugioh:            { label: 'Yu-Gi-Oh',         color: '#8B5CF6', path: '/cards/yugioh' },
  lorcana:           { label: 'Lorcana',          color: '#3B82F6', path: '/cards/lorcana' },
  onepiece:          { label: 'One Piece',        color: '#F97316', path: '/cards/onepiece' },
  dragonball:        { label: 'Dragon Ball',      color: '#EAB308', path: '/cards/dragonball' },
  starwars:          { label: 'Star Wars',        color: '#38BDF8', path: '/cards/starwars' },
  riftbound:         { label: 'Riftbound',        color: '#818CF8', path: '/cards/riftbound' },
  digimon:           { label: 'Digimon',          color: '#06B6D4', path: '/cards/digimon' },
  finalfantasy:      { label: 'Final Fantasy',    color: '#8B5CF6', path: '/cards/finalfantasy' },
  grandarchive:      { label: 'Grand Archive',    color: '#10B981', path: '/cards/grandarchive' },
  sorcery:           { label: 'Sorcery',          color: '#D97706', path: '/cards/sorcery' },
  gundam:            { label: 'Gundam',           color: '#6366F1', path: '/cards/gundam' },
  hololive:          { label: 'Hololive',         color: '#F472B6', path: '/cards/hololive' },
  battlespiritssaga: { label: 'Battle Spirits',   color: '#14B8A6', path: '/cards/battlespiritssaga' },
  vanguard:          { label: 'Cardfight Vanguard', color: '#2563EB', path: '/cards/vanguard' },
  shadowverse:       { label: 'Shadowverse',      color: '#7C3AED', path: '/cards/shadowverse' },
  unionarena:        { label: 'Union Arena',      color: '#E11D48', path: '/cards/unionarena' },
  weissschwarz:      { label: 'Weiss Schwarz',    color: '#94A3B8', path: '/cards/weissschwarz' },
  alphaclash:        { label: 'Alpha Clash',      color: '#F59E0B', path: '/cards/alphaclash' },
  bakugan:           { label: 'Bakugan',          color: '#EA580C', path: '/cards/bakugan' },
  buddyfight:        { label: 'Buddyfight',       color: '#0EA5E9', path: '/cards/buddyfight' },
  forceofwill:       { label: 'Force of Will',    color: '#9333EA', path: '/cards/forceofwill' },
  gateruler:         { label: 'Gate Ruler',       color: '#0891B2', path: '/cards/gateruler' },
  godzilla:          { label: 'Godzilla',         color: '#84CC16', path: '/cards/godzilla' },
  metazoo:           { label: 'MetaZoo',          color: '#22C55E', path: '/cards/metazoo' },
  universus:         { label: 'Universus',        color: '#DB2777', path: '/cards/universus' },
  wixoss:            { label: 'Wixoss',           color: '#F43F5E', path: '/cards/wixoss' },
  wow:               { label: 'WoW TCG',          color: '#B45309', path: '/cards/wow' },
  warhammer:         { label: 'Warhammer',        color: '#DC2626', path: '/cards/warhammer' },
  dbsfusionworld:    { label: 'DBS Fusion World', color: '#F97316', path: '/cards/dbsfusionworld' },
  dragonballz:       { label: 'Dragon Ball Z',    color: '#EAB308', path: '/cards/dragonballz' },
};
// Non-MTG games to fan out for movers (MTG handled separately via snapshots).
const FANOUT_GAMES = Object.keys(GAME_CONFIG).filter(g => g !== 'mtg');

// ---------- helpers ----------
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function formatAUD(num) {
  if (!num || num <= 0) return 'N/A';
  return 'AU$' + parseFloat(num).toFixed(2);
}
function pctStr(pct) {
  const n = parseFloat(pct);
  return (n >= 0 ? '\u25B2' : '\u25BC') + ' ' + Math.abs(n).toFixed(1) + '%';
}

async function timedFetch(url, opts) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function supabaseGet(path) {
  try {
    const res = await timedFetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

// Build a tiny inline SVG sparkline from a price series
function sparkline(series, up) {
  if (!Array.isArray(series) || series.length < 3) return '';
  const w = 72, h = 22, pad = 2;
  const min = Math.min(...series), max = Math.max(...series);
  const range = (max - min) || 1;
  const pts = series.map((v, i) => {
    const x = pad + (i / (series.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((v - min) / range) * (h - 2 * pad);
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  const col = up ? '#22c55e' : '#ef4444';
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// ---------- data ----------
// Non-MTG movers come from each game's own Supabase cards table (price_change_7d/30d).
const MOVER_CAP = 400; // ignore junk outliers from bad source data
async function fetchTopMovers(game, direction = 'gainers', limit = 10, period = '7d') {
  const up = direction === 'gainers';
  const col = period === '30d' ? 'price_change_30d' : 'price_change_7d';
  const order = up ? `${col}.desc` : `${col}.asc`;
  const filter = up ? `${col}=gte.5` : `${col}=lte.-5`;
  const rows = await supabaseGet(
    `${game}_cards?price_aud=gt.1&rarity=not.is.null&rarity=neq.None&${filter}&order=${order}&limit=${limit + 15}` +
    `&select=name,slug,set_name,rarity,image_url,price_aud,${col}`
  );
  if (!Array.isArray(rows) || !rows.length) return [];
  return rows
    .filter(c => Math.abs(parseFloat(c[col])) <= MOVER_CAP)
    .slice(0, limit)
    .map(c => ({
      name: c.name || '',
      setName: c.set_name || '',
      priceAud: parseFloat(c.price_aud).toFixed(2),
      change7d: parseFloat(parseFloat(c[col]).toFixed(1)),
      rarity: c.rarity || '',
      image: c.image_url || '',
      slug: c.slug || '',
      spark: null,
      game,
    }));
}

async function fetchMTGTopMovers(direction = 'up', limit = 10, period = '7d') {
  try {
    const today = await supabaseGet(`mtg_price_snapshots?order=snapshot_date.desc&limit=1&select=snapshot_date`);
    if (!today.length) return [];
    const latestDate = today[0].snapshot_date;
    const days = period === '30d' ? 30 : 7;
    const d = new Date(latestDate);
    d.setDate(d.getDate() - days);
    const targetDate = d.toISOString().split('T')[0];

    // Nearest snapshot on or before the target date (data is not on every exact day)
    const priorRow = await supabaseGet(`mtg_price_snapshots?snapshot_date=lte.${targetDate}&order=snapshot_date.desc&limit=1&select=snapshot_date`);
    const compareDate = priorRow.length ? priorRow[0].snapshot_date : targetDate;

    const [latestSnaps, priorSnaps] = await Promise.all([
      supabaseGet(`mtg_price_snapshots?snapshot_date=eq.${latestDate}&price_aud=gt.1&select=scryfall_id,price_aud&order=price_aud.desc&limit=1500`),
      supabaseGet(`mtg_price_snapshots?snapshot_date=eq.${compareDate}&price_aud=gt.1&select=scryfall_id,price_aud&order=price_aud.desc&limit=1500`)
    ]);
    if (!latestSnaps.length || !priorSnaps.length) return [];

    const priorMap = {};
    priorSnaps.forEach(s => { priorMap[s.scryfall_id] = parseFloat(s.price_aud); });

    const movers = latestSnaps
      .filter(s => priorMap[s.scryfall_id] && priorMap[s.scryfall_id] > 0)
      .map(s => ({
        scryfall_id: s.scryfall_id,
        priceAud: parseFloat(s.price_aud),
        pct: ((parseFloat(s.price_aud) - priorMap[s.scryfall_id]) / priorMap[s.scryfall_id]) * 100
      }))
      .filter(s => direction === 'up' ? s.pct >= 5 : s.pct <= -5)
      .sort((a, b) => direction === 'up' ? b.pct - a.pct : a.pct - b.pct)
      .slice(0, limit);
    if (!movers.length) return [];

    const ids = movers.map(s => s.scryfall_id).join(',');
    const cards = await supabaseGet(`mtg_cards?scryfall_id=in.(${ids})&select=name,slug,set_name,rarity,image_uri_small,scryfall_id`);

    return movers.map(mover => {
      const card = cards.find(c => c.scryfall_id === mover.scryfall_id);
      if (!card) return null;
      return {
        name: card.name, setName: card.set_name, priceAud: mover.priceAud,
        change7d: parseFloat(mover.pct.toFixed(1)), rarity: card.rarity || '',
        image: card.image_uri_small || '', slug: card.slug, spark: null,
        scryfall_id: card.scryfall_id, game: 'mtg',
      };
    }).filter(Boolean);
  } catch (e) {
    console.error('fetchMTGTopMovers error:', e.message);
    return [];
  }
}

async function fetchMTGBuySignals(limit = 8) {
  try {
    const data = await supabaseGet(`mtg_price_snapshots?price_52w_low_aud=gt.1&order=price_aud.asc&limit=50&select=scryfall_id,price_aud,price_52w_high_aud,price_52w_low_aud`);
    const signals = data.filter(s => {
      if (!s.price_52w_high_aud || !s.price_52w_low_aud) return false;
      const range = s.price_52w_high_aud - s.price_52w_low_aud;
      if (range < 1) return false;
      return ((s.price_aud - s.price_52w_low_aud) / range) <= 0.20;
    }).slice(0, limit);
    if (!signals.length) return [];
    const ids = signals.map(s => s.scryfall_id).join(',');
    const cards = await supabaseGet(`mtg_cards?scryfall_id=in.(${ids})&select=name,slug,set_name,rarity,image_uri_small,scryfall_id`);
    return signals.map(snap => {
      const card = cards.find(c => c.scryfall_id === snap.scryfall_id);
      if (!card) return null;
      const discount = Math.round(((snap.price_52w_high_aud - snap.price_aud) / snap.price_52w_high_aud) * 100);
      return {
        name: card.name, setName: card.set_name, rarity: card.rarity || '',
        image: card.image_uri_small || '', slug: card.slug, priceAud: snap.price_aud,
        discount, spark: null, scryfall_id: card.scryfall_id, game: 'mtg',
      };
    }).filter(Boolean);
  } catch { return []; }
}

async function fetchMTGSellSignals(limit = 8) {
  try {
    const data = await supabaseGet(`mtg_price_snapshots?price_52w_high_aud=gt.2&order=price_aud.desc&limit=50&select=scryfall_id,price_aud,price_52w_high_aud,price_52w_low_aud`);
    const signals = data.filter(s => {
      if (!s.price_52w_high_aud || !s.price_52w_low_aud) return false;
      const range = s.price_52w_high_aud - s.price_52w_low_aud;
      if (range < 1) return false;
      return ((s.price_aud - s.price_52w_low_aud) / range) >= 0.80;
    }).slice(0, limit);
    if (!signals.length) return [];
    const ids = signals.map(s => s.scryfall_id).join(',');
    const cards = await supabaseGet(`mtg_cards?scryfall_id=in.(${ids})&select=name,slug,set_name,rarity,image_uri_small,scryfall_id`);
    return signals.map(snap => {
      const card = cards.find(c => c.scryfall_id === snap.scryfall_id);
      if (!card) return null;
      const nearHighPct = Math.round(((snap.price_aud - snap.price_52w_low_aud) / (snap.price_52w_high_aud - snap.price_52w_low_aud)) * 100);
      return {
        name: card.name, setName: card.set_name, rarity: card.rarity || '',
        image: card.image_uri_small || '', slug: card.slug, priceAud: snap.price_aud,
        nearHighPct, spark: null, scryfall_id: card.scryfall_id, game: 'mtg',
      };
    }).filter(Boolean);
  } catch { return []; }
}

// Batched sparkline series for MTG cards
async function fetchSparklines(ids) {
  if (!ids.length) return {};
  const d = new Date();
  d.setDate(d.getDate() - 16);
  const since = d.toISOString().split('T')[0];
  const rows = await supabaseGet(`mtg_price_snapshots?scryfall_id=in.(${ids.join(',')})&snapshot_date=gte.${since}&price_aud=gt.0&select=scryfall_id,snapshot_date,price_aud&order=snapshot_date.asc&limit=3000`);
  const map = {};
  rows.forEach(r => { (map[r.scryfall_id] = map[r.scryfall_id] || []).push(parseFloat(r.price_aud)); });
  return map;
}

// ---------- render ----------
function ebayUrl(name, game) {
  const kw = encodeURIComponent(name + ' ' + (game === 'mtg' ? 'mtg' : (GAME_CONFIG[game] ? GAME_CONFIG[game].label : game)));
  return `https://www.ebay.com.au/sch/i.html?_nkw=${kw}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
}

function cardRow(card, mode) {
  const cfg = GAME_CONFIG[card.game] || GAME_CONFIG.mtg;
  const cardPath = card.slug ? `${cfg.path}/${card.slug}` : null;
  const name = esc(card.name);
  const badge = mode === 'buy'
    ? `<span class="badge buy">${card.discount}% off high</span>`
    : mode === 'sell'
    ? `<span class="badge sell">Near ${card.nearHighPct}% of high</span>`
    : `<span class="badge ${parseFloat(card.change7d) >= 0 ? 'up' : 'down'}">${pctStr(card.change7d)}</span>`;
  const spark = card.spark ? sparkline(card.spark, parseFloat(card.change7d || 0) >= 0 || mode === 'buy') : '';
  return `<div class="row" data-game="${escAttr(card.game)}" data-name="${escAttr(card.name)}">
    <div class="row-img">${card.image ? `<img src="${escAttr(card.image)}" alt="${escAttr(card.name)}" loading="lazy">` : '<span class="ph"></span>'}</div>
    <div class="row-info">
      <div class="row-name">${cardPath ? `<a href="${escAttr(cardPath)}">${name}</a>` : name}</div>
      <div class="row-meta"><span class="gpill" style="background:${cfg.color}22;color:${cfg.color};border-color:${cfg.color}55">${esc(cfg.label)}</span>${card.setName ? `<span class="setn">${esc(card.setName)}</span>` : ''}${card.rarity ? `<span class="rar">${esc(card.rarity)}</span>` : ''}</div>
    </div>
    <div class="row-spark">${spark}</div>
    <div class="row-price">${formatAUD(card.priceAud)}${badge}</div>
    <div class="row-cta"><a href="${escAttr(ebayUrl(card.name, card.game))}" target="_blank" rel="noopener" class="ebay" onclick="gtag('event','market_mover_click',{event_label:'ebay'})">eBay AU &#8599;</a>${card.slug ? `<a href="/compare?cards=${escAttr(card.slug)}" class="cmp">Compare</a>` : ''}</div>
  </div>`;
}

function heroMover(card) {
  if (!card) return '';
  const cfg = GAME_CONFIG[card.game] || GAME_CONFIG.mtg;
  const cardPath = card.slug ? `${cfg.path}/${card.slug}` : null;
  const up = parseFloat(card.change7d) >= 0;
  const spark = card.spark ? sparkline(card.spark, up) : '';
  return `<div class="hero-mover" data-game="${escAttr(card.game)}">
    <div class="hm-img">${card.image ? `<img src="${escAttr(card.image)}" alt="${escAttr(card.name)}" loading="lazy">` : '<span class="ph"></span>'}</div>
    <div class="hm-body">
      <div class="hm-tag">Biggest mover this week</div>
      <div class="hm-name">${cardPath ? `<a href="${escAttr(cardPath)}">${esc(card.name)}</a>` : esc(card.name)}</div>
      <div class="row-meta"><span class="gpill" style="background:${cfg.color}22;color:${cfg.color};border-color:${cfg.color}55">${esc(cfg.label)}</span>${card.setName ? `<span class="setn">${esc(card.setName)}</span>` : ''}</div>
      <div class="hm-stats"><span class="hm-price">${formatAUD(card.priceAud)}</span><span class="badge ${up ? 'up' : 'down'} big">${pctStr(card.change7d)} 7d</span>${spark}</div>
      <div class="hm-cta"><a href="${escAttr(ebayUrl(card.name, card.game))}" target="_blank" rel="noopener" class="ebay" onclick="gtag('event','market_mover_click',{event_label:'hero_ebay'})">See it on eBay AU &#8599;</a></div>
    </div>
  </div>`;
}

function renderPage({ p7, p30, buySignals, sellSignals, updated }) {
  const hero = p7.gainers[0] || null;
  const top = p7.gainers[0];
  const callBody = top
    ? `This week the market is led by ${esc(top.name)}, ${parseFloat(top.change7d) >= 0 ? 'up' : 'down'} ${Math.abs(parseFloat(top.change7d)).toFixed(1)} per cent in seven days. The full read, what it means and where to list, is in the weekly Seller report.`
    : 'The full market read and this week\u2019s sell-side timing are in the weekly Seller report.';

  const gameTabs = ['all', ...Object.keys(GAME_CONFIG)].map(g => {
    const label = g === 'all' ? 'All games' : GAME_CONFIG[g].label;
    return `<button class="game-tab ${g === 'all' ? 'active' : ''}" data-game="${g}" onclick="filterGame('${g}')">${esc(label)}</button>`;
  }).join('');

  const rowsOrEmpty = (list, kind) => list.length
    ? list.map(c => cardRow(c, 'movers')).join('')
    : `<div class="empty">No ${kind} to show right now.</div>`;
  const up7   = rowsOrEmpty(p7.gainers, 'risers');
  const down7 = rowsOrEmpty(p7.losers, 'fallers');
  const up30  = rowsOrEmpty(p30.gainers, 'risers');
  const down30= rowsOrEmpty(p30.losers, 'fallers');
  const buyTease = buySignals.slice(0, 3).map(c => cardRow(c, 'buy')).join('');
  const sellTease = sellSignals.slice(0, 3).map(c => cardRow(c, 'sell')).join('');

  return `<!DOCTYPE html>
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
  .filter-inner{display:flex;gap:7px;overflow-x:auto;scrollbar-width:none;max-width:1140px;margin:0 auto;padding:0 20px}
  .filter-inner::-webkit-scrollbar{display:none}
  .game-tab{flex-shrink:0;background:transparent;border:1px solid var(--border);color:var(--silver);font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;padding:7px 14px;border-radius:20px;cursor:pointer;white-space:nowrap;transition:all .2s}
  .game-tab.active{background:var(--gold-soft);border-color:var(--gold-line);color:var(--gold)}
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
  .movers-toggle,.period-toggle{display:inline-flex;border:1.5px solid var(--border);border-radius:10px;overflow:hidden;vertical-align:middle}
  .period-toggle{margin-left:10px}
  .mt,.pt{background:transparent;border:none;color:var(--silver);font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;padding:9px 18px;cursor:pointer;transition:all .2s}
  .pt{padding:9px 14px;font-size:12px}
  .pt.active{background:var(--gold-soft);color:var(--gold)}
  .mt.active#t-up{background:rgba(34,197,94,.14);color:var(--green)}
  .mt.active#t-down{background:rgba(239,68,68,.14);color:var(--red)}
  .search-inner{max-width:1140px;margin:8px auto 0;padding:0 20px}
  #card-search{width:100%;max-width:320px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;color:var(--white);font-size:13px;padding:9px 13px;outline:none;font-family:'DM Sans',sans-serif}
  #card-search:focus{border-color:var(--gold-line)}
  .search-hint{font-size:11px;color:var(--muted);margin-left:10px}
  .section-h.up{color:var(--green)}.section-h.down{color:var(--red)}.section-h.signals{color:var(--gold)}
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
  .lockwrap{position:relative;margin-top:6px}
  .upsell{background:var(--bg2);border:1px solid var(--gold-line);border-radius:var(--radius);padding:26px;text-align:center;margin:10px 0 0}
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
  </div>
</nav>

<header class="hero">
  <div class="wrap">
    <div class="eyebrow">Market</div>
    <h1>The Australian TCG Market</h1>
    <p class="intro">Every day we track price movements across more than 30 trading card games and convert them to Australian dollars, so you can see what is rising, what is falling, and where the value is, in one place.</p>
    <span class="stamp"><span class="dot"></span>Updated ${esc(updated)}</span>
  </div>
</header>

<div class="filterbar">
  <div class="filter-inner">${gameTabs}</div>
  <div class="search-inner">
    <input type="text" id="card-search" placeholder="Jump to a card you own..." aria-label="Search movers by card name" oninput="searchCards(this.value)">
    <span class="search-hint" id="search-hint"></span>
  </div>
</div>

<main class="wrap">
  ${heroMover(hero)}

  <div class="call">
    <div class="lbl">The C3 Call</div>
    <p>${callBody} <a href="/pricing" onclick="gtag('event','market_upsell_click',{event_label:'call'})">See the Seller report &#8594;</a></p>
  </div>

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
  <div class="rows period-7d" id="sec-up-7">${up7}</div>
  <div class="rows period-7d" id="sec-down-7" style="display:none">${down7}</div>
  <div class="rows period-30d" id="sec-up-30" style="display:none">${up30}</div>
  <div class="rows period-30d" id="sec-down-30" style="display:none">${down30}</div>
  <div class="empty" id="empty-movers" style="display:none">No movers for this game in this period.</div>

  <div class="capture" id="capture">
    <h3>Get the weekly Top 5 Movers, free</h3>
    <p>The week\u2019s biggest Australian price moves, straight to your inbox. No card required.</p>
    <form id="cap-form">
      <input type="email" id="cap-email" placeholder="Your email address" required aria-label="Email address">
      <button type="submit">Join free</button>
    </form>
    <div class="msg" id="cap-msg"></div>
  </div>

  <div class="section-h signals">Buy and sell signals</div>
  <div class="section-sub">A taste of the signals. The full buy list and sell-side timing live in the Seller report.</div>
  <div class="rows">${buyTease}${sellTease}</div>

  <div class="upsell">
    <h3>Unlock every signal</h3>
    <p>The weekly Seller report gives you every buy signal, the full sell-side timing, the movers across your games, and the C3 Call, delivered to your inbox each week.</p>
    <a href="/pricing" class="btn-gold" onclick="gtag('event','market_upsell_click',{event_label:'panel'})">See the Seller plan</a>
  </div>
</main>

<footer>
  <div class="wrap">
    <div class="mission">Cards on Cards on Cards is Australia\u2019s TCG intelligence platform. Every price in AUD. Every signal built for the local market.</div>
    <div class="disc">Prices are indicative AUD market estimates and move constantly. C3 participates in the eBay Partner Network and may earn a small commission on purchases made through links, at no extra cost to you.</div>
  </div>
</footer>

<script>
  var curDir='up', curGame='all', curPeriod='7d', curSearch='';
  function activeSecId(){
    return 'sec-'+(curDir==='up'?'up':'down')+'-'+(curPeriod==='7d'?'7':'30');
  }
  function applyView(){
    // show only the active direction+period container
    var ids=['sec-up-7','sec-down-7','sec-up-30','sec-down-30'];
    var active=activeSecId();
    for(var n=0;n<ids.length;n++){
      document.getElementById(ids[n]).style.display = ids[n]===active?'':'none';
    }
    // toggle button states
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
    // filter rows in the active container by game + search
    var sec=document.getElementById(active);
    var rows=sec.querySelectorAll('.row'), vis=0;
    for(var j=0;j<rows.length;j++){
      var g=rows[j].getAttribute('data-game');
      var nm=(rows[j].getAttribute('data-name')||'').toLowerCase();
      var okGame=(curGame==='all'||g===curGame);
      var okSearch=(!curSearch||nm.indexOf(curSearch)!==-1);
      var show=okGame&&okSearch;
      rows[j].style.display=show?'':'none';
      if(show)vis++;
    }
    // hero only on all-games, rising, 7d, no search
    var hm=document.querySelector('.hero-mover');
    if(hm){hm.style.display=(curGame==='all'&&curDir==='up'&&curPeriod==='7d'&&!curSearch)?'':'none';}
    document.getElementById('empty-movers').style.display=vis===0?'':'none';
  }
  function showDir(d){curDir=d;applyView();gtag('event','market_dir_toggle',{event_label:d});}
  function showPeriod(p){curPeriod=p;applyView();gtag('event','market_period_toggle',{event_label:p});}
  function filterGame(g){curGame=g;applyView();gtag('event','market_filter',{event_label:g});}
  var searchTimer=null;
  function searchCards(v){
    curSearch=(v||'').trim().toLowerCase();
    var hint=document.getElementById('search-hint');
    if(searchTimer)clearTimeout(searchTimer);
    searchTimer=setTimeout(function(){
      applyView();
      if(curSearch){hint.textContent='Searching movers';}else{hint.textContent='';}
      gtag('event','market_search');
    },180);
  }
  (function(){
    var f=document.getElementById('cap-form');if(!f)return;
    f.addEventListener('submit',async function(e){
      e.preventDefault();
      var em=document.getElementById('cap-email').value.trim();
      var msg=document.getElementById('cap-msg');
      if(!em){msg.textContent='Please enter your email.';return;}
      msg.style.color='#A0A8C0';msg.textContent='Joining...';
      try{
        var r=await fetch('/.netlify/functions/email-subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em})});
        var d=await r.json();
        if(r.ok){msg.style.color='#22c55e';msg.textContent='You are in. Watch your inbox each week.';gtag('event','market_email_capture');}
        else{msg.style.color='#ef4444';msg.textContent=d.error||'Something went wrong.';}
      }catch(err){msg.style.color='#ef4444';msg.textContent='Something went wrong.';}
    });
  })();
</script>
</body>
</html>`;
}

// ---------- handler ----------
async function buildPeriod(period) {
  // MTG via snapshots + every other game via its cards table, in parallel
  const tasks = [
    fetchMTGTopMovers('up', 10, period),
    fetchMTGTopMovers('down', 10, period),
    ...FANOUT_GAMES.flatMap(g => [
      fetchTopMovers(g, 'gainers', 4, period),
      fetchTopMovers(g, 'losers', 4, period),
    ]),
  ];
  const res = await Promise.allSettled(tasks);
  const v = i => res[i].status === 'fulfilled' ? res[i].value : [];
  const ups = [v(0)], downs = [v(1)];
  for (let k = 0; k < FANOUT_GAMES.length; k++) {
    ups.push(v(2 + k * 2));
    downs.push(v(3 + k * 2));
  }
  const gainers = ups.flat().filter(c => parseFloat(c.change7d) >= 0.1)
    .sort((a, b) => b.change7d - a.change7d);
  const losers = downs.flat().filter(c => parseFloat(c.change7d) <= -0.1)
    .sort((a, b) => a.change7d - b.change7d);
  return { gainers, losers };
}

export default async (req) => {
  const updated = new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  const [p7, p30, buyRes, sellRes] = await Promise.all([
    buildPeriod('7d'),
    buildPeriod('30d'),
    fetchMTGBuySignals(8).catch(() => []),
    fetchMTGSellSignals(8).catch(() => []),
  ]);
  const buySignals = buyRes || [];
  const sellSignals = sellRes || [];

  // Sparklines for MTG cards across the visible 7d set + signals (one batched query)
  const mtgIds = [...p7.gainers, ...p7.losers, ...p30.gainers, ...p30.losers, ...buySignals, ...sellSignals]
    .filter(c => c.game === 'mtg' && c.scryfall_id)
    .map(c => c.scryfall_id);
  const sparkMap = await fetchSparklines([...new Set(mtgIds)]);
  [...p7.gainers, ...p7.losers, ...p30.gainers, ...p30.losers, ...buySignals, ...sellSignals].forEach(c => {
    if (c.game === 'mtg' && c.scryfall_id && sparkMap[c.scryfall_id]) c.spark = sparkMap[c.scryfall_id];
  });

  const html = renderPage({ p7, p30, buySignals, sellSignals, updated });

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
    }
  });
};

export const config = { path: '/market' };
