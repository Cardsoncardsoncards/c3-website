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

// Standard rotation: sets that rotate with the next Standard update
// Duskmourn and older sets rotate when the next set (post-Tarkir) releases
const ROTATING_SETS = ['Wilds of Eldraine','Lost Caverns of Ixalan','Murders at Karlov Manor','Outlaws of Thunder Junction'];
const ROTATION_DATE = 'Bloomburrow block rotates ~Sep 2026';

// Upcoming MTG releases 2026-2027 (static - update each session as needed)
const UPCOMING = [
  { name: 'Marvel Super Heroes', date: 'Jun 2026', code: 'msh' },
  { name: 'The Hobbit', date: 'Aug 2026', code: 'hob' },
  { name: 'Reality Fracture', date: 'Oct 2026', code: 'rfr' },
  { name: 'Star Trek', date: 'Nov 2026', code: 'trk' },
];

// Format ban list pills
const FORMATS = [
  { name: 'Standard',  color: '#4ADE80', sets: 'Duskmourn, Foundations, Aetherdrift, Tarkir: Dragonstorm', href: '/cards/mtg/banned/standard' },
  { name: 'Pioneer',   color: '#60A5FA', sets: 'Return to Ravnica onward, no fetchlands', href: '/cards/mtg/banned/pioneer' },
  { name: 'Modern',    color: '#A78BFA', sets: 'Eighth Edition onward', href: '/cards/mtg/banned/modern' },
  { name: 'Commander', color: '#F97316', sets: 'All sets, own banned list', href: '/cards/mtg/banned/commander' },
];

// Best sets to open: static EV rankings updated periodically
// Based on average card value vs box price on eBay AU
const EV_SETS = [
  { name: 'Modern Horizons 3',      ev: 'AU$420+', note: 'Highest EV box currently', color: '#4ADE80', slug: 'modern-horizons-3' },
  { name: 'Commander Masters',       ev: 'AU$280+', note: 'Strong reprint value',     color: '#60A5FA', slug: 'commander-masters' },
  { name: 'Murders at Karlov Manor', ev: 'AU$110+', note: 'Good for singles',         color: '#A78BFA', slug: 'murders-at-karlov-manor' },
  { name: 'Tarkir: Dragonstorm',     ev: 'AU$130+', note: 'New release, high demand', color: '#F97316', slug: 'tarkir-dragonstorm' },
];


function esc(str) {
  return (str == null ? '' : String(str))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export default async (req) => {
  const SEALED_KEYS = ['booster box','booster pack',' case','bundle','display','starter deck'];

  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const twoDaysAgo   = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);

  // Fetch all data in parallel - single batch, no sequential calls
  const [sets, topCards, snapNow, snapOld, latestSnap, randomCards] = await Promise.allSettled([
    supabaseGet('mtg_sets?order=release_date.desc&limit=1000&digital=eq.false&select=set_code,set_name,set_slug,set_type,release_date'),
    supabaseGet(`mtg_cards?order=price_usd.desc&limit=12&select=slug,name,image_uri_small,price_usd,price_aud&price_usd=gte.10&image_uri_small=not.is.null`),
    supabaseGet(`mtg_price_snapshots?select=scryfall_id,price_aud&snapshot_date=gte.${twoDaysAgo}&order=price_aud.desc&limit=3000`),
    supabaseGet(`mtg_price_snapshots?select=scryfall_id,price_aud&snapshot_date=gte.${sevenDaysAgo}&snapshot_date=lte.${sevenDaysAgo}&order=snapshot_date.asc&limit=3000`),
    supabaseGet(`mtg_price_snapshots?select=snapshot_date&order=snapshot_date.desc&limit=1`),
    supabaseGet(`mtg_cards?select=slug,name,image_uri_small&image_uri_small=not.is.null&limit=1&offset=${Math.floor(Math.random()*90000)}`)
  ]);

  const setsData      = sets.status === 'fulfilled'      ? sets.value      : [];
  const topCardsData  = topCards.status === 'fulfilled'   ? topCards.value  : [];
  const snapNowData   = snapNow.status === 'fulfilled'    ? snapNow.value   : [];
  const snapOldData   = snapOld.status === 'fulfilled'    ? snapOld.value   : [];
  const latestSnapData= latestSnap.status === 'fulfilled' ? latestSnap.value: [];
  const randomCard    = randomCards.status === 'fulfilled' && randomCards.value.length ? randomCards.value[0] : null;

  // Last sync date for trust signal
  const lastSynced = latestSnapData.length ? latestSnapData[0].snapshot_date : null;
  const syncLabel = lastSynced ? `Prices last updated: ${lastSynced}` : 'Prices updated daily';

  // Filter to main set types only
  const filteredSets = setsData.filter(s => SHOW_TYPES.has(s.set_type));
  const totalSets = filteredSets.length;

  // Count sets per letter for AZ button labels
  const letterCounts = {};
  filteredSets.forEach(function(s) {
    const fc = (s.set_name[0] || '').toUpperCase();
    const lk = /[0-9]/.test(fc) ? '0' : fc;
    letterCounts[lk] = (letterCounts[lk] || 0) + 1;
  });

  // Build set list HTML
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

  // Top cards grid with 7-day sparkline arrows
  // Single batched sparkline query for top card scryfall_ids
  let sparkMap = {};
  if (topCardsData.length > 0) {
    const controller2 = new AbortController();
    const timer2 = setTimeout(() => controller2.abort(), 6000);
    try {
      const slugList = topCardsData.map(c => '"' + c.slug.replace(/"/g,'') + '"').join(',');
      const sparkUrl = new URL(`${SUPABASE_URL}/rest/v1/mtg_cards`);
      sparkUrl.searchParams.set('select', 'slug,scryfall_id');
      const sparkFetchUrl = sparkUrl.toString() + '&slug=in.(' + slugList + ')';
      const sRes = await fetch(sparkFetchUrl, {
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        signal: controller2.signal
      });
      clearTimeout(timer2);
      if (sRes.ok) {
        const sData = await sRes.json();
        if (Array.isArray(sData)) {
          // Build slug->sid map then cross-ref snapshots
          const slugToSid = {};
          sData.forEach(r => { if (r.scryfall_id) slugToSid[r.slug] = r.scryfall_id; });
          const nowMap2 = {};
          snapNowData.forEach(r => { if (r.price_aud) nowMap2[r.scryfall_id] = parseFloat(r.price_aud); });
          const oldMap2 = {};
          snapOldData.forEach(r => { if (r.price_aud) oldMap2[r.scryfall_id] = parseFloat(r.price_aud); });
          topCardsData.forEach(c => {
            const sid = slugToSid[c.slug];
            if (!sid) return;
            const now = nowMap2[sid], old = oldMap2[sid];
            if (now && old && old > 0) {
              sparkMap[c.slug] = ((now - old) / old) * 100;
            }
          });
        }
      }
    } catch { clearTimeout(timer2); }
  }

  const topCardHTML = topCardsData.map(function(c) {
    const price = c.price_aud > 0 ? parseFloat(c.price_aud) : (c.price_usd ? c.price_usd * 1.58 : 0);
    const priceStr = price > 0 ? '~AU$' + price.toFixed(0) : '';
    const pct = sparkMap[c.slug];
    let sparkEl = '';
    if (pct !== undefined) {
      const up = pct > 0;
      const color = up ? '#4ADE80' : '#f87171';
      const arrow = up ? '&#8593;' : '&#8595;';
      sparkEl = `<div style="font-size:10px;font-weight:700;color:${color}">${arrow}${Math.abs(pct).toFixed(1)}% 7d</div>`;
    }
    return `<a href="/cards/mtg/${c.slug}" class="top-card">
      ${c.image_uri_small ? `<img src="${c.image_uri_small}" alt="${c.name.replace(/"/g,'&quot;')}" loading="lazy">` : `<div class="top-card-placeholder">${c.name.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`}
      <div class="top-card-name">${c.name.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
      <div class="top-card-price">${priceStr}</div>
      ${sparkEl}
    </a>`;
  }).join('');

  // Price movers
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
  movers.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

  const gainers = movers.filter(m => m.pct > 0).slice(0, 5);
  const losers  = movers.filter(m => m.pct < 0).slice(0, 5);

  let moverDetails = {};
  const moverSids = [...gainers, ...losers].map(m => m.sid);
  if (moverSids.length > 0) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/mtg_cards`);
    url.searchParams.set('select', 'scryfall_id,name,slug,image_uri_small,set_name');
    url.searchParams.set('limit', '20');
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
        if (Array.isArray(data)) data.forEach(c => { moverDetails[c.scryfall_id] = c; });
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

  // Release ticker (doubled for seamless loop)
  const tickerItems = [...UPCOMING, ...UPCOMING].map(r =>
    `<span class="ticker-item"><strong>${r.name.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</strong> &middot; ${r.date}</span>`
  ).join('');

  // Format pills
  const formatPills = FORMATS.map(f =>
    `<a href="${f.href}" class="fmt-pill" style="border-color:${f.color}44;color:${f.color}">
      <span class="fmt-pill-name">${f.name}</span>
      <span class="fmt-pill-sets">${f.sets}</span>
    </a>`
  ).join('');

  // Best sets to open HTML
  const evHTML = EV_SETS.map(s =>
    `<a href="/cards/mtg/sets/${s.slug}" class="ev-set-card" style="border-color:${s.color}33">
      <div style="font-size:13px;font-weight:700;color:${s.color};margin-bottom:2px">${s.ev}</div>
      <div style="font-size:12px;font-weight:600;color:var(--text)">${s.name.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
      <div style="font-size:11px;color:var(--text2);margin-top:2px">${s.note}</div>
    </a>`
  ).join('');

  // Random card button HTML
  const randomCardHTML = randomCard
    ? `<a href="/cards/mtg/${randomCard.slug}" class="quick-link" id="random-card-btn" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#127922; Random Card</a>`
    : `<button class="quick-link" id="random-card-btn" onclick="fetchRandomCard()" style="background:var(--bg2);border-color:var(--border);color:var(--text);cursor:pointer;font-family:inherit">&#127922; Random Card</button>`;

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
  <meta property="og:image" content="https://cardsoncardsoncards.com.au/c3ogbanner.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#0f1117;--bg2:#1a1d2e;--bg3:#22263a;--accent:#C9A84C;--text:#e8eaf0;--text2:#9ba3c4;--border:#2d3254;--radius:12px;--gold:#C9A84C}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6}
    body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(ellipse 70% 40% at 50% 0%,rgba(201,168,76,.05),transparent 60%)}
    a{color:var(--accent);text-decoration:none}
    a:hover{text-decoration:underline}
    .wrap{max-width:1200px;margin:0 auto;padding:0 24px;position:relative;z-index:1}
    .btn{display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border-radius:8px;font-weight:700;cursor:pointer;border:none;font-size:13px;text-decoration:none;transition:opacity .2s}
    .btn:hover{opacity:.85;text-decoration:none}
    .btn-primary{background:var(--accent);color:#000}
    .btn-secondary{background:var(--bg3);border:1px solid var(--border);color:var(--text)}
    /* STAT BAR */
    .stat-bar{display:flex;gap:0;justify-content:center;border:1px solid var(--border);border-radius:12px;overflow:hidden;max-width:540px;margin:0 auto 32px;background:var(--bg2)}
    .stat-item{flex:1;padding:14px 10px;text-align:center;border-right:1px solid var(--border)}.stat-item:last-child{border-right:none}
    .stat-num{font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:var(--accent)}
    .stat-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text2);margin-top:2px}
    /* QUICK LINKS */
    .quick-link{display:inline-flex;align-items:center;gap:7px;padding:9px 18px;border-radius:10px;font-weight:700;font-size:12.5px;text-decoration:none;transition:all .2s;border:1px solid transparent}
    .quick-link:hover{opacity:.88;transform:translateY(-1px);text-decoration:none}
    input{background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:8px 12px;border-radius:6px;font-size:14px;width:100%}
    footer{background:var(--bg2);border-top:1px solid var(--border);padding:24px;text-align:center;color:var(--text2);font-size:13px;margin-top:48px;position:relative;z-index:1}
    footer a{color:var(--text2);margin:0 10px}
    /* NAV */
    nav{background:rgba(8,10,15,.97);border-bottom:1px solid #1e2235;padding:12px 0;position:sticky;top:0;z-index:100;backdrop-filter:blur(18px)}
    .nav-inner{display:flex;align-items:center;max-width:1200px;margin:0 auto;padding:0 24px;gap:10px}
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
    /* ROTATION WARNING */
    .rotation-strip{background:rgba(251,146,60,.06);border:1px solid rgba(251,146,60,.2);border-radius:8px;padding:12px 16px;margin-bottom:24px;display:flex;align-items:flex-start;gap:10px}
    .rotation-icon{font-size:16px;flex-shrink:0;margin-top:1px}
    .rotation-sets{font-size:12px;color:var(--text2);margin-top:3px}
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
    /* EV SETS */
    .ev-set-card{background:var(--bg2);border:1px solid;border-radius:8px;padding:14px;text-decoration:none;display:block;transition:all .2s}
    .ev-set-card:hover{background:var(--bg3);text-decoration:none;transform:translateY(-1px)}
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
      <a href="/tools" class="nav-link nav-link--tools">Tools</a>
      <a href="/play" class="nav-link nav-link--play">Play</a>
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

<div style="padding:52px 24px 36px;text-align:center;position:relative;z-index:1">
  <div style="font-size:10px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--gold);margin-bottom:12px">Card Vault -- MTG</div>
  <h1 style="font-family:'Cinzel',serif;font-size:clamp(24px,5vw,50px);font-weight:900;color:var(--text);margin-bottom:12px;line-height:1.1">MTG Card Prices <span style="color:var(--gold)">in Australia</span></h1>
  <p style="font-size:14px;color:var(--text2);max-width:520px;margin:0 auto 8px">Australia's MTG price guide with live AUD pricing, 52-week price ranges, and direct eBay AU buy links. Updated daily.</p>
</div>
<div class="wrap">

  <!-- Stat Bar -->
  <div class="stat-bar">
    <div class="stat-item"><div class="stat-num">${totalSets}</div><div class="stat-label">Sets</div></div>
    <div class="stat-item"><div class="stat-num">96K+</div><div class="stat-label">Cards</div></div>
    <div class="stat-item"><div class="stat-num">AU$</div><div class="stat-label">Live Prices</div></div>
    <div class="stat-item"><div class="stat-num">Daily</div><div class="stat-label">Updates</div></div>
  </div>

  <!-- Standard Rotation Warning -->
  <div class="rotation-strip">
    <span class="rotation-icon">&#9888;&#65039;</span>
    <div>
      <div style="font-size:13px;font-weight:700;color:#FB923C;margin-bottom:3px">Standard Rotation Approaching</div>
      <div class="rotation-sets">The following sets will rotate out of Standard: <strong>${ROTATING_SETS.join(', ')}</strong>. ${ROTATION_DATE}. Sell rotation-vulnerable cards before prices drop.</div>
    </div>
  </div>

  <!-- Quick Access -->
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:28px">
    <a href="https://www.ebay.com.au/sch/i.html?_nkw=mtg+magic+gathering+cards&campid=${EPN_CAMPID}&customid=C3MTGHub&mkevt=1" target="_blank" rel="noopener" class="quick-link" style="background:var(--accent);color:#000">&#128722; Shop MTG on eBay &#8599;</a>
    <a href="/cards/mtg/random-commander" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#127922; Random Commander</a>
    ${randomCardHTML}
    <a href="/ev-calculator.html" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128202; EV Calculator</a>
    <a href="/compare" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128203; Compare Cards</a>
    <a href="/tracker.html" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128276; Set Price Alerts</a>
    <a href="/quizzes/mtg-archetype" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#127919; MTG Archetype Quiz &#8594;</a>
    <a href="/quizzes/mtg-colour" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#127914; MTG Colour Identity Quiz &#8594;</a>
  <a href="/quizzes/which-tcg-extended" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#127919; Which TCG Should I Play? &#8594;</a>
  </div>

  <!-- Format Ban Lists Strip -->
  <div style="margin-bottom:28px">
    <h2 style="font-size:11px;margin-bottom:12px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.08em">Format Ban Lists</h2>
    <div class="fmt-strip">${formatPills}</div>
  </div>

</div>

<!-- Commander Carousel (full-width) -->
<section class="carousel-section" style="position:relative;z-index:1;margin-bottom:28px">
  <div style="font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#9898FF;margin-bottom:8px;padding:0 24px">Commander Spotlight</div>
  <div style="font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:var(--text);margin-bottom:16px;padding:0 24px">Your Next Commander Awaits</div>
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
</section>

<div class="wrap">

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

  <!-- Most Valuable MTG Cards -->
  <div style="margin-bottom:32px">
    <h2 style="font-size:20px;margin-bottom:4px">&#127942; Most Valuable MTG Cards (AUD)</h2>
    <p style="color:var(--text2);font-size:13px;margin-bottom:16px">Live AUD prices with 7-day trend. Click any card for full price history.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px">
      ${topCardHTML}
    </div>
    <p style="color:var(--text2);font-size:12px;margin-top:12px">${syncLabel}. Based on USD/AUD conversion.</p>
  </div>

  <!-- Best Sets to Open -->
  <div style="margin-bottom:32px">
    <h2 style="font-size:20px;margin-bottom:4px">&#128230; Best MTG Sets to Open Right Now</h2>
    <p style="color:var(--text2);font-size:13px;margin-bottom:16px">Estimated box EV based on current singles prices. Always check the <a href="/ev-calculator.html" style="color:var(--accent)">EV Calculator</a> before buying.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
      ${evHTML}
    </div>
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

  <!-- MTG Guides -->
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
    if (currentLetter) { hideSets(); currentLetter = null; }
    return;
  }
  currentLetter = null;
  var btns2 = document.querySelectorAll('.az-btn');
  for (var i = 0; i < btns2.length; i++) btns2[i].classList.remove('active');
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

function fetchRandomCard() {
  let btn = document.getElementById('random-card-btn');
  if (btn) btn.textContent = 'Loading...';
  fetch('/api/card-search?q=a&limit=1&game=mtg')
    .then(function(r) { return r.json(); })
    .catch(function() { return []; })
    .then(function(data) {
      var cards = Array.isArray(data) ? data : [];
      if (cards.length && cards[0].url) {
        window.location = cards[0].url;
      } else {
        window.location = '/cards/mtg';
      }
    });
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
<!-- REPORT BUG WIDGET -->
<style>.bug-float{position:fixed;bottom:20px;right:20px;z-index:9999}.bug-btn{display:flex;align-items:center;gap:6px;background:rgba(15,17,25,.95);border:1px solid rgba(201,168,76,.3);color:#C9A84C;padding:8px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;font-family:sans-serif;backdrop-filter:blur(12px);transition:all .2s;text-decoration:none;letter-spacing:.03em}.bug-btn:hover{border-color:#C9A84C;background:rgba(201,168,76,.12);color:#E8C86A;text-decoration:none}.bug-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10000;align-items:center;justify-content:center;backdrop-filter:blur(4px)}.bug-modal.open{display:flex}.bug-box{background:#111420;border:1px solid #252840;border-radius:14px;padding:28px;width:100%;max-width:420px;margin:0 16px;position:relative}.bug-close{position:absolute;top:12px;right:14px;background:none;border:none;color:#9ba3c4;font-size:18px;cursor:pointer}.bug-form select,.bug-form textarea{width:100%;background:rgba(255,255,255,.05);border:1px solid #252840;border-radius:8px;color:#F0F2FF;font-family:sans-serif;font-size:13px;padding:9px 12px;margin-bottom:12px;outline:none}.bug-form select option{background:#e8eaf0;color:#111420}.bug-form select{background:#e8eaf0;color:#111420}.bug-hidden{display:none}.bug-submit{width:100%;padding:10px;background:#C9A84C;color:#0A0C14;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer}.bug-thanks{display:none;text-align:center;padding:12px 0}.bug-thanks p{color:#4ADE80;font-size:14px}</style>
<div class="bug-float"><a class="bug-btn" onclick="document.getElementById('bugModal').classList.add('open');return false" href="#">&#x1F41B; Report a Bug</a></div>
<div class="bug-modal" id="bugModal" onclick="if(event.target===this)this.classList.remove('open')">
  <div class="bug-box">
    <button class="bug-close" onclick="document.getElementById('bugModal').classList.remove('open')">&#x2715;</button>
    <h3 style="font-family:'Cinzel',serif;font-size:17px;font-weight:700;color:#F0F2FF;margin-bottom:4px">&#x1F41B; Report a Bug</h3>
    <p style="font-size:12px;color:#9ba3c4;margin-bottom:18px">Spotted something wrong? Takes 20 seconds.</p>
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
