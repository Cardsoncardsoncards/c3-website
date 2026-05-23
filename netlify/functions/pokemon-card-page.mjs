// netlify/functions/pokemon-card-page.mjs
// Serves dynamic Pokemon card pages at /cards/pokemon/[slug]
// Mirrors MTG card page structure, adapted for Pokemon TCG data from TCGdex

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EBAY_CLIENT_ID    = Netlify.env.get('EBAY_CLIENT_ID');
const EBAY_CLIENT_SECRET = Netlify.env.get('EBAY_CLIENT_SECRET');
const EPN_CAMPID        = '5339146789';
const AMAZON_TAG        = 'blasdigital-22';

// Energy type colours matching official Pokemon palette
const ENERGY_COLOURS = {
  Fire:      { bg: '#fd7d24', text: '#fff' },
  Water:     { bg: '#4592c4', text: '#fff' },
  Grass:     { bg: '#4dbd5f', text: '#fff' },
  Lightning: { bg: '#eed535', text: '#000' },
  Psychic:   { bg: '#a95dac', text: '#fff' },
  Fighting:  { bg: '#d56723', text: '#fff' },
  Darkness:  { bg: '#707070', text: '#fff' },
  Metal:     { bg: '#9eb7b8', text: '#000' },
  Dragon:    { bg: '#6f35fc', text: '#fff' },
  Colorless: { bg: '#b8b8b8', text: '#000' },
  Fairy:     { bg: '#ee99ac', text: '#000' },
};

// Rarity tiers -- visual prominence ordering
const RARITY_TIER = {
  'Hyper Rare': 5, 'Special Illustration Rare': 5,
  'Illustration Rare': 4, 'Double Rare': 4,
  'Ultra Rare': 4, 'Rare Holo': 3,
  'Rare': 2, 'Uncommon': 1, 'Common': 0
};

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

async function getEbayToken() {
  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) return null;
  const creds = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope'
  });
  const data = await res.json();
  return data.access_token;
}

async function getEbayListings(cardName, setName, token) {
  const q = encodeURIComponent(`${cardName} pokemon card ${setName}`);
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${q}&category_ids=183454&filter=buyingOptions%3A%7BFIXED_PRICE%7D&sort=price&limit=6`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_AU',
      'X-EBAY-C-ENDUSERCTX': `affiliateCampaignId=${EPN_CAMPID}`
    }
  });
  const data = await res.json();
  return (data.itemSummaries || []).map(item => ({
    ...item,
    itemId: item.itemId?.includes('|') ? item.itemId.split('|')[1] : item.itemId
  }));
}

function energyPips(types) {
  if (!types || !types.length) return '';
  return types.map(t => {
    const c = ENERGY_COLOURS[t] || { bg: '#888', text: '#fff' };
    return `<span class="energy-pip" style="background:${c.bg};color:${c.text}" title="${t}">${t[0]}</span>`;
  }).join('');
}

function rarityClass(rarity) {
  const tier = RARITY_TIER[rarity] || 0;
  if (tier >= 5) return 'rarity-chase';
  if (tier >= 4) return 'rarity-ultra';
  if (tier >= 3) return 'rarity-holo';
  if (tier >= 2) return 'rarity-rare';
  return 'rarity-common';
}


async function handleSetPage(setSlug, headers) {
  const accent = '#f5a623';
  const [_psr0] = await Promise.allSettled([
    supabaseGet(`pokemon_sets?slug=eq.${encodeURIComponent(setSlug)}&limit=1&select=*`)
  ]);
  const sets = _psr0.status === 'fulfilled' ? _psr0.value : [];

  const notFoundHtml = `<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><title>Set Not Found | Pokemon | Cards on Cards on Cards</title><meta name="robots" content="noindex"><link rel="icon" type="image/png" href="/c3logo.png"></head><body style="background:#0A0C14;color:#F0F2FF;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:16px;padding:24px;text-align:center"><h1 style="font-family:'Cinzel',serif;color:${accent}">Set Not Found</h1><p style="color:#A0A8C0">We couldn't find Pokemon set "${setSlug}".</p><a href="/cards/pokemon" style="color:${accent}">← Browse All Pokemon</a></body></html>`;

  if (!sets || !sets[0]) return new Response(notFoundHtml, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  const set = sets[0];

  const cards = await supabaseGet(`pokemon_cards?set_id=eq.${encodeURIComponent(set.id)}&order=market_price.desc.nullslast&limit=400&select=slug,name,image_url,market_price,price_aud,number,rarity,price_change_7d`);

  const toAud = (c) => c.price_aud > 0 ? parseFloat(c.price_aud) : c.market_price > 0 ? c.market_price * 1.58 : 0;
  const isSingles = c => c.number !== null && c.number !== undefined && c.rarity !== 'None' && c.rarity !== null;
  const pricedCards = (cards || []).filter(c => isSingles(c) && toAud(c) > 0);
  const sealedCards = (cards || []).filter(c => !isSingles(c));
  const top5 = pricedCards.slice(0, 5);
  const ebaySetURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name + ' pokemon')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=5339146789&toolid=10001&mkevt=1`;
  const metaDesc = `Browse ${cards?.length || 0} Pokemon cards from ${set.name}. View card prices in AUD and buy on eBay AU. Updated daily.`;

  const top5HTML = top5.map(c => {
    const aud = toAud(c);
    return `<a href="/cards/pokemon/${c.slug}" style="flex:0 0 140px;background:#0e1118;border:1px solid rgba(245,166,35,.35);border-radius:10px;padding:10px;text-align:center;text-decoration:none;display:block">
      ${c.image_url ? `<img src="${c.image_url}" alt="${c.name}" style="width:100%;border-radius:6px;max-height:140px;object-fit:contain;margin-bottom:6px" loading="lazy">` : ''}
      <div style="font-size:11px;color:#e8eaf0;line-height:1.3;margin-bottom:4px;font-weight:600">${c.name}</div>
      ${aud > 0 ? `<div style="font-size:12px;color:#C9A84C;font-weight:700">AU$${aud.toFixed(2)}</div>` : ''}
    </a>`;
  }).join('');

  // Rarity colour for set page tiles
  function getRarityColour(r) {
    if (!r) return '#555';
    const rl = r.toLowerCase();
    if (rl.includes('hyper') || rl.includes('special illustration')) return '#ff69b4';
    if (rl.includes('illustration') || rl.includes('ultra') || rl.includes('double')) return '#7c3aed';
    if (rl.includes('holo')) return '#c9a84c';
    if (rl.includes('rare')) return '#f5a623';
    if (rl.includes('uncommon')) return '#4dbd5f';
    return '#555';
  }

  const allCardsHTML = (cards && cards.length) ? cards.filter(isSingles).map(c => {
    const aud = toAud(c);
    const rarityCol = getRarityColour(c.rarity);
    const ch7 = c.price_change_7d ? parseFloat(c.price_change_7d) : null;
    const trendDot = ch7 && Math.abs(ch7) >= 5
      ? `<div style="position:absolute;top:5px;left:5px;width:8px;height:8px;border-radius:50%;background:${ch7>0?'#4dbd5f':'#e57373'};box-shadow:0 0 4px ${ch7>0?'#4dbd5f':'#e57373'}44" title="${ch7>0?'+':''}${ch7.toFixed(1)}% this week"></div>`
      : '';
    return `<a href="/cards/pokemon/${c.slug}" style="background:#0e1118;border:1px solid #1e2235;border-radius:8px;padding:8px;text-decoration:none;text-align:center;display:block;position:relative;transition:border-color .2s" onmouseover="this.style.borderColor='${rarityCol}'" onmouseout="this.style.borderColor='#1e2235'">
      ${trendDot}
      ${c.image_url ? `<img src="${c.image_url}" alt="${c.name}" style="width:100%;border-radius:4px;max-height:120px;object-fit:contain;margin-bottom:4px" loading="lazy">` : `<div style="height:100px;background:#1e2235;border-radius:4px;margin-bottom:4px;display:flex;align-items:center;justify-content:center;font-size:20px">🃏</div>`}
      <div style="font-size:10px;color:#e8eaf0;line-height:1.3;font-weight:600">${c.name}</div>
      ${c.number ? `<div style="font-size:9px;color:#8892b0">#${c.number}</div>` : ''}
      ${c.rarity ? `<div style="font-size:9px;color:${rarityCol};font-weight:700;margin-top:2px;text-transform:uppercase;letter-spacing:.04em">${c.rarity}</div>` : ''}
      ${aud > 0 ? `<div style="font-size:11px;color:#C9A84C;font-weight:700;margin-top:2px">AU$${aud.toFixed(2)}</div>` : `<div style="font-size:9px;color:#555;margin-top:2px">no price</div>`}
    </a>`;
  }).join('') : `<div style="grid-column:1/-1;text-align:center;color:#8892b0;padding:32px;font-size:14px">Card list syncing -- check back after tonight's update.</div>`;

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${set.name} | Pokemon Set | Cards on Cards on Cards</title>
  <meta name="description" content="${metaDesc}">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/pokemon/sets/${setSlug}">
  <meta property="og:title" content="${set.name} | Pokemon | C3">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:site_name" content="Cards on Cards on Cards">
  <meta property="og:image" content="https://cardsoncardsoncards.com.au/c3ogbanner.png">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0A0C14;color:#F0F2FF;font-family:'DM Sans',sans-serif;line-height:1.6}
    nav{background:rgba(10,12,20,.97);backdrop-filter:blur(18px);border-bottom:1px solid #252840;padding:12px 0;position:sticky;top:0;z-index:100}
    .nav-inner{max-width:1100px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:12px}
    .nav-logo{display:flex;align-items:center;gap:9px;font-family:'Cinzel',serif;font-size:11.5px;font-weight:700;letter-spacing:.12em;color:#C9A84C;text-decoration:none;text-transform:uppercase;white-space:nowrap;flex-shrink:0}
    .nav-logo img{height:32px;width:32px;border-radius:6px;object-fit:cover}
    .nav-links{display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
    .nav-link{display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid #252840;color:#A0A8C0;white-space:nowrap}
    .nav-link--vault{color:#C9A84C;border-color:rgba(201,168,76,.35)}.nav-link--vault:hover,.nav-link--vault.active{background:rgba(201,168,76,.1);border-color:#C9A84C;color:#E8C86A}
    .nav-link--compare{color:#A78BFA;border-color:rgba(167,139,250,.35)}.nav-link--compare:hover,.nav-link--compare.active{background:rgba(167,139,250,.1);border-color:#A78BFA;color:#C4B5FD}
    .nav-link--market{color:#4ADE80;border-color:rgba(74,222,128,.35)}.nav-link--market:hover,.nav-link--market.active{background:rgba(74,222,128,.1);border-color:#4ADE80;color:#86EFAC}
    .nav-link--tools{color:#FB923C;border-color:rgba(251,146,60,.35)}.nav-link--tools:hover,.nav-link--tools.active{background:rgba(251,146,60,.1);border-color:#FB923C;color:#FDBA74}
    .nav-link--play{color:#F472B6;border-color:rgba(244,114,182,.35)}.nav-link--play:hover,.nav-link--play.active{background:rgba(244,114,182,.1);border-color:#F472B6;color:#F9A8D4}
    .nav-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.35)}.nav-link--blog:hover,.nav-link--blog.active{background:rgba(126,203,161,.1);border-color:#7ECBA1;color:#A5DFC0}
    .nav-link--ebay{color:#60A5FA;border-color:rgba(96,165,250,.35);background:rgba(96,165,250,.05)}.nav-link--ebay:hover{background:rgba(96,165,250,.12);border-color:#60A5FA;color:#93C5FD}
    .wrap{max-width:1200px;margin:0 auto;padding:0 20px 60px}
    .hero{padding:36px 0 24px;border-bottom:1px solid #1e2235;margin-bottom:28px}
    .hero-eyebrow{font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:${accent};margin-bottom:8px}
    .hero-title{font-family:'Cinzel',serif;font-size:clamp(22px,4vw,36px);font-weight:700;color:#F0F2FF;margin-bottom:8px}
    .hero-meta{display:flex;gap:12px;flex-wrap:wrap;font-size:13px;color:#8892b0}
    .cta-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:28px}
    .cta-btn{display:inline-flex;align-items:center;padding:11px 20px;border-radius:8px;font-weight:700;font-size:13px;text-decoration:none}
    .cta-primary{background:${accent};color:#000}
    .cta-secondary{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:#F0F2FF}
    .section-title{font-family:'Cinzel',serif;font-size:16px;color:#F0F2FF;margin-bottom:14px}
    .cards-scroll{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;margin-bottom:28px}
    .cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-bottom:28px}
    @media(max-width:600px){.cards-grid{grid-template-columns:repeat(auto-fill,minmax(90px,1fr))}}
  </style>
</head>
<body>
<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo"><img src="/c3logo.png" alt="C3"><span>Cards on Cards on Cards</span>
    <div class="nav-search-wrap" style="flex:1;min-width:0;max-width:480px;display:flex;align-items:center"><input type="text" id="nav-q" placeholder="Search cards..." autocomplete="off" onkeydown="if(event.key==='Enter'){var v=this.value.trim();if(v)window.location='/search?q='+encodeURIComponent(v);}" style="width:100%;background:rgba(255,255,255,.06);border:1px solid #1e2235;border-radius:7px 0 0 7px;padding:6px 12px;font-size:12px;color:#e8eaf0;font-family:sans-serif;outline:none"><button onclick="var v=document.getElementById('nav-q').value.trim();if(v)window.location='/search?q='+encodeURIComponent(v);" style="background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.35);border-left:none;border-radius:0 7px 7px 0;padding:6px 10px;color:#C9A84C;cursor:pointer;font-size:13px;flex-shrink:0">&#128269;</button></div></a>
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
<div class="wrap">
  <div class="hero">
    <div class="hero-eyebrow">Pokemon TCG · Set</div>
    <h1 class="hero-title">${set.name}</h1>
    <div class="hero-meta">
      ${set.release_date ? `<span>📅 Released: ${set.release_date.slice(0,10)}</span>` : ''}
      ${set.card_count ? `<span>🃏 ${set.card_count} cards</span>` : ''}
      ${pricedCards.length ? `<span>💰 ${pricedCards.length} priced</span>` : ''}
    </div>
    ${pricedCards.length >= 2 ? `
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:16px;padding:16px;background:#0e1118;border:1px solid rgba(245,166,35,.2);border-radius:10px">
      <div><div style="font-size:10px;color:#8892b0;text-transform:uppercase;letter-spacing:.1em">Set Total Value</div><div style="font-size:18px;font-weight:700;color:#f5a623;font-family:'Cinzel',serif">AU$${pricedCards.reduce((s,c)=>s+toAud(c),0).toFixed(0)}</div></div>
      <div style="width:1px;background:#1e2235"></div>
      <div><div style="font-size:10px;color:#8892b0;text-transform:uppercase;letter-spacing:.1em">Most Valuable</div><div style="font-size:14px;font-weight:700;color:#e8eaf0">${pricedCards[0].name}</div><div style="font-size:12px;color:#f5a623">AU$${toAud(pricedCards[0]).toFixed(2)}</div></div>
      <div style="width:1px;background:#1e2235"></div>
      <div><div style="font-size:10px;color:#8892b0;text-transform:uppercase;letter-spacing:.1em">Avg Card Value</div><div style="font-size:18px;font-weight:700;color:#e8eaf0;font-family:'Cinzel',serif">AU$${(pricedCards.reduce((s,c)=>s+toAud(c),0)/pricedCards.length).toFixed(2)}</div></div>
    </div>` : ''}
  </div>
  <div class="cta-row">
    <a href="${ebaySetURL}" target="_blank" rel="noopener" class="cta-btn cta-primary">Buy Cards on eBay AU →</a>
    <a href="https://www.amazon.com.au/s?k=${encodeURIComponent(set.name + ' pokemon')}&tag=blasdigital-22" target="_blank" rel="noopener" class="cta-btn cta-secondary" style="border-color:rgba(255,153,0,.35);color:#ff9900">Search Amazon AU →</a>
  </div>
  ${top5.length ? `<div style="margin-bottom:28px"><div class="section-title">Most Valuable Cards</div><div class="cards-scroll">${top5HTML}</div></div>` : ''}
  <div style="margin-bottom:28px">
    <div class="section-title">${pricedCards.length ? `Singles (${pricedCards.length})` : 'Cards'}</div>
    <div class="cards-grid">${allCardsHTML}</div>
  </div>
  <div style="background:#0e1118;border:1px solid #1e2235;border-radius:10px;padding:20px;font-size:13px;color:#8892b0">
    <strong style="color:#F0F2FF">About this set:</strong> Pokemon card prices in AUD. Updated daily.
    <div style="margin-top:10px"><a href="/cards/pokemon" style="color:${accent}">← Back to all Pokemon cards</a></div>
  </div>
</div>
<footer style="border-top:1px solid #252840;padding:24px;text-align:center;color:#8892b0;font-size:12px;margin-top:20px">
  <p><a href="/" style="color:#8892b0;margin:0 8px">Home</a><a href="/cards/pokemon" style="color:#8892b0;margin:0 8px">Pokemon</a><a href="/blog" style="color:#8892b0;margin:0 8px">Blog</a><a href="/tracker.html" style="color:#8892b0;margin:0 8px">Tracker</a></p>
  <p style="margin-top:8px">© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
</footer>
</body></html>`;

  return new Response(html, { status: 200, headers });
}


function esc(str) {
  return (str == null ? '' : String(str))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function getExchangeRate() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD', { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return 1.58;
    const data = await res.json();
    return data.rates?.AUD || 1.58;
  } catch { return 1.58; }
}
export default async (req) => {
  const url = new URL(req.url);
  const slug = url.pathname.replace('/cards/pokemon/', '').replace(/^\/|\/$/g, '');
  const AUD_RATE = await getExchangeRate();

  if (!slug) {
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  }

  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=7200' };



  if (slug.startsWith('sets/')) {
    const setSlug = slug.replace(/^sets\//, '').replace(/\/$/, '');
    return handleSetPage(setSlug, headers);
  }
  try {

    // Fetch card -- select all fields including price_change_7d, price_change_30d
    const cards = await supabaseGet(`pokemon_cards?slug=eq.${encodeURIComponent(slug)}&limit=1&select=*`);
    if (!cards || cards.length === 0) {
      return new Response(notFoundPage(slug), { status: 404, headers });
    }
    const card = cards[0];

    // Parallel: related cards, eBay token, price snapshots for sparkline (last 90 days)
    const [_psr0, _psr1, _psr2] = await Promise.allSettled([
      supabaseGet(`pokemon_cards?set_id=eq.${encodeURIComponent(card.set_id)}&slug=neq.${encodeURIComponent(slug)}&image_url=not.is.null&limit=12&order=number.asc&select=*`).catch(() => []),
      (EBAY_CLIENT_ID && EBAY_CLIENT_SECRET) ? getEbayToken().catch(() => null) : Promise.resolve(null),
      supabaseGet(`pokemon_price_snapshots?card_id=eq.${encodeURIComponent(card.id)}&order=snapshot_date.asc&limit=90&select=snapshot_date,price_aud,market_price`).catch(() => [])
    ]);
  const relatedCards = _psr0.status === 'fulfilled' ? _psr0.value : [];
  const ebayToken = _psr1.status === 'fulfilled' ? _psr1.value : [];
  const snapshots = _psr2.status === 'fulfilled' ? _psr2.value : [];

    const ebayListings = ebayToken
      ? await getEbayListings(card.name, card.set_name, ebayToken).catch(() => [])
      : [];

    // Use stored price_aud if available, fallback to conversion
    const priceAud = card.price_aud > 0 ? parseFloat(card.price_aud)
                   : card.market_price > 0 ? parseFloat(card.market_price) * 1.58
                   : null;
    const audRate = card.aud_rate ? parseFloat(card.aud_rate) : 1.58;

    // Price change badge
    const change7d = card.price_change_7d ? parseFloat(card.price_change_7d) : null;
    const change24h = card.price_change_24h ? parseFloat(card.price_change_24h) : null;
    function changeBadge(pct, label) {
      if (!pct || Math.abs(pct) < 0.5) return '';
      const up = pct > 0;
      const col = up ? '#4dbd5f' : '#e57373';
      const arrow = up ? '▲' : '▼';
      return `<span style="display:inline-flex;align-items:center;gap:3px;background:${col}18;border:1px solid ${col}44;color:${col};padding:2px 8px;border-radius:100px;font-size:11px;font-weight:700">${arrow} ${Math.abs(pct).toFixed(1)}% ${label}</span>`;
    }

    // Sparkline SVG -- simple line from snapshot data
    function buildSparkline(snaps) {
      if (!snaps || snaps.length < 2) return '';
      const prices = snaps.map(s => parseFloat(s.price_aud || (s.market_price * 1.58)) || 0).filter(p => p > 0);
      if (prices.length < 2) return '';
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const range = max - min || 1;
      const W = 160, H = 40, pad = 4;
      const pts = prices.map((p, i) => {
        const x = pad + (i / (prices.length - 1)) * (W - pad * 2);
        const y = H - pad - ((p - min) / range) * (H - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      const last = prices[prices.length - 1];
      const first = prices[0];
      const trendCol = last >= first ? '#4dbd5f' : '#e57373';
      return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="display:block;margin-top:8px">
        <polyline points="${pts}" fill="none" stroke="${trendCol}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${(pad + (prices.length-1)/(prices.length-1)*(W-pad*2)).toFixed(1)}" cy="${(H - pad - ((last-min)/range)*(H-pad*2)).toFixed(1)}" r="3" fill="${trendCol}"/>
      </svg>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text2);margin-top:2px">
        <span>${snaps[0].snapshot_date?.slice(5) || ''}</span>
        <span>${snaps[snaps.length-1].snapshot_date?.slice(5) || 'Today'}</span>
      </div>`;
    }

    const sparklineHTML = buildSparkline(snapshots);

    const pageUrl = encodeURIComponent(`https://cardsoncardsoncards.com.au/cards/pokemon/${card.slug}`);
    const shareText = encodeURIComponent(`${card.name} -- ${priceAud ? '~AU$'+priceAud.toFixed(2) : 'check price'} on Cards on Cards on Cards (Australia)`);

    const breadcrumb = {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://cardsoncardsoncards.com.au" },
        { "@type": "ListItem", "position": 2, "name": "Pokemon Cards", "item": "https://cardsoncardsoncards.com.au/cards/pokemon" },
        { "@type": "ListItem", "position": 3, "name": card.set_name, "item": `https://cardsoncardsoncards.com.au/cards/pokemon/sets/${card.set_id}` },
        { "@type": "ListItem", "position": 4, "name": card.name, "item": `https://cardsoncardsoncards.com.au/cards/pokemon/${card.slug}` }
      ]
    };

    const productSchema = priceAud ? {
      "@context": "https://schema.org", "@type": "Product",
      "name": card.name,
      "description": card.description || `${card.name} Pokemon card from ${card.set_name}`,
      "image": card.image_url || '',
      "offers": { "@type": "Offer", "priceCurrency": "AUD", "price": priceAud.toFixed(2), "availability": "https://schema.org/InStock", "url": `https://cardsoncardsoncards.com.au/cards/pokemon/${card.slug}` }
    } : null;

    const faqSchema = {
      "@context": "https://schema.org", "@type": "FAQPage",
      "mainEntity": [
        { "@type": "Question", "name": `What is ${card.name} worth in Australia?`, "acceptedAnswer": { "@type": "Answer", "text": priceAud ? `${card.name} from ${card.set_name} is currently worth approximately AU$${priceAud.toFixed(2)} based on recent eBay AU sales.` : `${card.name} pricing varies. Check eBay AU for the most current Australian prices.` }},
        { "@type": "Question", "name": `Is ${card.name} rare?`, "acceptedAnswer": { "@type": "Answer", "text": card.rarity ? `${card.name} is a ${card.rarity} card from ${card.set_name}.` : `Check the card details for rarity information.` }},
        { "@type": "Question", "name": `What set is ${card.name} from?`, "acceptedAnswer": { "@type": "Answer", "text": `${card.name} is from the ${card.set_name} set${card.series ? `, part of the ${card.series} series` : ''}.${card.number ? ` It is card number ${card.number}.` : ''}` }}
      ]
    };

    const ebaySearchUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(card.name+' pokemon')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;

    const relatedHTML = relatedCards.length ? `
    <section class="related-section" style="max-width:1100px;margin:0 auto 24px;padding:0 24px">
      <h2 style="font-size:18px;margin-bottom:16px">More from ${card.set_name}</h2>
      <div class="card-carousel">
        ${relatedCards.map(c => `
          <a href="/cards/pokemon/${c.slug}" class="mini-card">
            ${c.image_url ? `<img src="${c.image_url}" alt="${c.name}" loading="lazy" style="width:100%;border-radius:6px">` : `<div style="height:80px;background:var(--bg3);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--text2)">${c.name}</div>`}
            <div class="mini-card-name">${c.name}</div>
            <div class="mini-card-price">${c.market_price ? '~AU$'+(c.market_price*1.58).toFixed(2) : ''}</div>
          </a>`).join('')}
      </div>
    </section>` : '';

    const ebayHTML = ebayListings.length ? `
    <div class="section">
      <h2>Buy on eBay AU</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:16px">
        ${ebayListings.slice(0,6).map(item => {
          const price = item.price?.value ? `AU$${parseFloat(item.price.value).toFixed(2)}` : '';
          const epnUrl = `https://www.ebay.com.au/itm/${item.itemId}?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
          return `<a href="${epnUrl}" target="_blank" rel="noopener" style="display:block;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;text-decoration:none;transition:border-color .2s" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
            <div style="font-size:13px;color:var(--text);margin-bottom:6px;line-height:1.3">${item.title?.slice(0,60) || card.name}${item.title?.length > 60 ? '...' : ''}</div>
            <div style="font-size:16px;font-weight:700;color:var(--accent)">${price}</div>
          </a>`;
        }).join('')}
      </div>
      <a href="${ebaySearchUrl}" target="_blank" rel="noopener" class="cta-btn cta-secondary" style="display:inline-block;padding:10px 20px">See all listings on eBay AU →</a>
    </div>` : `
    <div class="section">
      <h2>Buy on eBay AU</h2>
      <a href="${ebaySearchUrl}" target="_blank" rel="noopener" class="cta-btn cta-primary">Search eBay AU for ${card.name} →</a>
    </div>`;

    const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${card.name} Price Australia | ${card.set_name} | Cards on Cards on Cards</title>
  <meta name="description" content="${card.name}${card.rarity ? ` (${card.rarity})` : ''} from ${card.set_name}${priceAud ? ` is currently ~AU$${priceAud.toFixed(2)}` : ''}. View price, set details, and buy on eBay AU. Australia's Pokemon card price guide.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/pokemon/${card.slug}">
  <meta property="og:title" content="${card.name} | ${card.set_name} | Pokemon Price AU">
  <meta property="og:description" content="${priceAud ? `~AU$${priceAud.toFixed(2)} -- ` : ''}${card.name} from ${card.set_name}. ${card.rarity || ''} Pokemon card.">
  ${card.image_url ? `<meta property="og:image" content="${card.image_url}">` : ''}
  <script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>
  ${productSchema ? `<script type="application/ld+json">${JSON.stringify(productSchema)}</script>` : ''}
  <script type="application/ld+json">${JSON.stringify(faqSchema)}</script>
  <link rel="icon" type="image/png" href="/c3logo.png">
  <meta property="og:image" content="${card.image_url || 'https://cardsoncardsoncards.com.au/c3-og-banner.png'}">
  <meta property="og:site_name" content="Cards on Cards on Cards">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <style>
    :root {
      --bg:#0f1117;--bg2:#1a1d2e;--bg3:#22263a;
      --accent:#f5a623;--accent2:#4dbd5f;--text:#e8eaf0;
      --text2:#9ba3c4;--border:#2d3254;--radius:12px;
      --pokemon-red:#e3350d;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;font-size:16px;line-height:1.6}
    a{color:var(--accent);text-decoration:none}
    a:hover{text-decoration:underline}
    nav{position:sticky;top:0;z-index:100;background:rgba(15,17,23,.92);backdrop-filter:blur(16px);border-bottom:1px solid var(--border);padding:10px 0}
    .nav-inner{max-width:1100px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .nav-logo{font-family:'Cinzel',serif;font-size:13px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.1em}
    .nav-links{display:flex;gap:6px;flex-wrap:wrap}
    .nav-link{font-size:12px;padding:5px 10px;border-radius:6px;border:1px solid var(--border);color:var(--text2);transition:all .2s}
    .nav-link:hover{color:var(--text);border-color:var(--text2);text-decoration:none}
    .nav-link.active{color:var(--accent2);border-color:var(--accent2);background:rgba(77,189,95,.08)}
    .card-hero{max-width:1100px;margin:0 auto;padding:32px 24px;display:grid;grid-template-columns:280px 1fr;gap:40px;align-items:start}
    @media(max-width:700px){.card-hero{grid-template-columns:1fr;gap:24px}}
    .card-image-col{position:sticky;top:80px}
    .card-image-wrap{position:relative;border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6)}
    .card-image-wrap img{width:100%;display:block;border-radius:12px}
    .card-image-placeholder{width:100%;padding-bottom:140%;background:var(--bg2);border:1px solid var(--border);border-radius:12px;display:flex;align-items:center;justify-content:center;color:var(--text2);font-size:14px}
    .rarity-badge{display:inline-block;padding:4px 12px;border-radius:100px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px}
    .rarity-chase{background:linear-gradient(135deg,#ffd700,#ff69b4);color:#000}
    .rarity-ultra{background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff}
    .rarity-holo{background:rgba(124,106,245,.25);border:1px solid var(--accent2);color:var(--accent2)}
    .rarity-rare{background:rgba(245,166,35,.12);border:1px solid var(--accent);color:var(--accent)}
    .rarity-common{background:var(--bg3);border:1px solid var(--border);color:var(--text2)}
    h1{font-family:'Cinzel',serif;font-size:clamp(22px,4vw,36px);font-weight:700;color:var(--text);line-height:1.15;margin-bottom:8px}
    .card-subtitle{font-size:14px;color:var(--text2);margin-bottom:20px}
    .energy-pips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
    .energy-pip{width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid rgba(255,255,255,.15)}
    .price-block{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:20px}
    .price-label{font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--text2);margin-bottom:6px}
    .price-main{font-family:'Cinzel',serif;font-size:36px;font-weight:700;color:var(--accent)}
    .price-usd{font-size:13px;color:var(--text2);margin-top:2px}
    .cta-group{display:flex;flex-direction:column;gap:10px;margin-bottom:20px}
    .cta-btn{display:block;text-align:center;padding:12px 20px;border-radius:8px;font-weight:700;font-size:14px;transition:opacity .2s;cursor:pointer;border:none;font-family:'DM Sans',sans-serif}
    .cta-btn:hover{opacity:.85;text-decoration:none}
    .cta-primary{background:var(--accent);color:#000}
    .cta-secondary{background:var(--bg3);border:1px solid var(--border);color:var(--text)}
    .card-sections{max-width:1100px;margin:0 auto;padding:0 24px 48px}
    .section{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:24px}
    .section h2{font-size:18px;margin-bottom:16px;color:var(--text)}
    .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}
    .stat-box{background:var(--bg3);border-radius:8px;padding:12px}
    .stat-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text2);margin-bottom:4px}
    .stat-value{font-size:15px;font-weight:700;color:var(--text)}
    .hp-bar-wrap{margin-top:6px}
    .hp-bar{height:4px;background:var(--bg3);border-radius:2px;overflow:hidden;margin-top:4px}
    .hp-fill{height:100%;background:var(--pokemon-red);border-radius:2px;transition:width .4s ease}
    .card-carousel{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:12px;cursor:grab;scrollbar-width:thin;scrollbar-color:var(--border) transparent}
    .card-carousel:active{cursor:grabbing}
    .mini-card{flex:0 0 120px;scroll-snap-align:start;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center;transition:border-color .2s}
    .mini-card:hover{border-color:var(--accent);text-decoration:none}
    .mini-card-name{font-size:10px;color:var(--text);margin-top:6px;line-height:1.3}
    .mini-card-price{font-size:11px;color:var(--accent);font-weight:700;margin-top:2px}
    .share-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
    .share-btn{padding:7px 14px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid var(--border);background:var(--bg3);color:var(--text2);transition:all .2s;font-family:'DM Sans',sans-serif;text-decoration:none;display:inline-block}
    .share-btn:hover{border-color:var(--accent);color:var(--accent);text-decoration:none}
    footer{border-top:1px solid var(--border);padding:32px 24px;text-align:center;font-size:13px;color:var(--text2)}
    footer a{color:var(--text2);margin:0 8px}
    .breadcrumb{max-width:1100px;margin:0 auto;padding:16px 24px 0;font-size:13px;color:var(--text2);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .breadcrumb a{color:var(--text2)}
    .breadcrumb a:hover{color:var(--accent)}
    .breadcrumb-sep{opacity:.4}
  </style>
</head>
<body>
<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo">Cards on Cards on Cards</a>
    <div class="nav-links">
      <a href="/" class="nav-link">← Home</a>
      <a href="/cards/mtg" class="nav-link">MTG Cards</a>
      <a href="/cards/pokemon" class="nav-link active">Pokemon</a>
      <a href="/compare" class="nav-link">Compare</a>
      <a href="/generators" class="nav-link">Generators</a>
      <a href="/shop.html" class="nav-link">Shop</a>
      <a href="/blog" class="nav-link">Blog</a>
      <a href="/tracker.html" class="nav-link">Tracker</a>
    </div>
  </div>
</nav>

<div class="breadcrumb">
  <a href="/">Home</a><span class="breadcrumb-sep">/</span>
  <a href="/cards/pokemon">Pokemon Cards</a><span class="breadcrumb-sep">/</span>
  <a href="/cards/pokemon/sets/${card.set_id}">${card.set_name}</a><span class="breadcrumb-sep">/</span>
  <span>${card.name}</span>
</div>

<div class="card-hero">
  <div class="card-image-col">
    <div class="card-image-wrap">
      ${card.image_url
        ? `<img src="${card.image_url}" alt="${card.name} -- ${card.set_name} Pokemon card" loading="eager">`
        : `<div class="card-image-placeholder"><span>No image available</span></div>`}
    </div>
    ${card.number && card.set_name ? `<p style="text-align:center;font-size:12px;color:var(--text2);margin-top:10px">${card.set_name} · #${card.number}</p>` : ''}
  </div>

  <div class="card-info-col">
    ${card.rarity ? `<span class="rarity-badge ${rarityClass(card.rarity)}">${card.rarity}</span>` : ''}
    <h1>${card.name}</h1>
    <p class="card-subtitle">${card.category || 'Pokemon'} · ${card.set_name}${card.series ? ` · ${card.series}` : ''}</p>

    ${card.types && card.types.length ? `<div class="energy-pips">${energyPips(card.types)}</div>` : ''}

    <div class="price-block">
      <div class="price-label">Current Price (AUD)</div>
      ${priceAud
        ? `<div class="price-main">AU$${priceAud.toFixed(2)}</div>
           <div class="price-usd" style="margin-top:4px">US$${parseFloat(card.market_price||0).toFixed(2)} · Rate: 1 USD = ${audRate.toFixed(4)} AUD</div>
           <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
             ${changeBadge(change24h,'24h')}
             ${changeBadge(change7d,'7d')}
           </div>
           ${sparklineHTML ? `<div style="margin-top:8px"><div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px">14-day trend</div>${sparklineHTML}</div>` : ''}`
        : `<div class="price-main" style="color:var(--text2);font-size:20px">Price unavailable</div>
           <div class="price-usd">Check eBay AU for current pricing</div>`}
    </div>

    <div class="cta-group">
      <a href="${ebaySearchUrl}" target="_blank" rel="noopener" class="cta-btn cta-primary" data-gtag-event="ebay_card_click" data-gtag-card="${card.name}" data-gtag-game="pokemon">Buy on eBay AU →</a>
      <a href="https://www.amazon.com.au/s?k=${encodeURIComponent(card.name+' pokemon '+card.set_name)}&tag=${AMAZON_TAG}" target="_blank" rel="noopener" class="cta-btn cta-secondary" style="border-color:#f90;color:#f90">Search Amazon AU →</a>
      <button id="c3-compare-btn" class="cta-btn cta-secondary" style="cursor:pointer;border-color:rgba(124,106,245,.4);color:#7c6af5" data-action="add-to-compare" data-slug="${card.slug}" data-name="${card.name.replace(/"/g,'&quot;')}" data-img="${(card.image_url||'').replace(/"/g,'&quot;')}" data-price="${card.price_aud > 0 ? 'AU$'+parseFloat(card.price_aud).toFixed(2) : 'N/A'}" data-game="pokemon">
        <span id="c3-compare-lbl">⚖️ Add to Compare</span>
      </button>
      <button class="cta-btn cta-secondary" style="cursor:pointer;border-color:rgba(77,189,95,.4);color:#4dbd5f" data-action="watch-card" data-card-name="${card.name.replace(/"/g,'&quot;')}" data-card-game="pokemon">
        🔔 Watch This Card
      </button>
    </div>

    <div class="share-bar">
      <span style="font-size:11px;color:var(--text2);font-weight:700;letter-spacing:.1em;text-transform:uppercase">Share</span>
      <button class="share-btn" style="background:#2d3254;color:#e8eaf0;border-color:#3d4270" data-action="copy-link">📋 Copy Link</button>
      <a class="share-btn" href="https://reddit.com/submit?url=${pageUrl}&title=${shareText}" target="_blank" rel="noopener" style="background:#ff450018;color:#ff4500;border-color:#ff450055">Reddit</a>
      <a class="share-btn" href="https://twitter.com/intent/tweet?text=${shareText}&url=${pageUrl}" target="_blank" rel="noopener" style="background:#00000055;color:#e8eaf0;border-color:#444">𝕏 Twitter</a>
      <a class="share-btn" href="https://wa.me/?text=${shareText}%20${pageUrl}" target="_blank" rel="noopener" style="background:#25d36618;color:#25d366;border-color:#25d36655">WhatsApp</a>
      <button class="share-btn" style="background:#5865f218;color:#5865f2;border-color:#5865f255" data-action="copy-discord">Discord</button>
    </div>
  </div>
</div>

<div class="card-sections">

  <div class="section">
    <h2>Card Details</h2>
    <div class="stats-grid">
      ${card.stage ? `<div class="stat-box"><div class="stat-label">Stage</div><div class="stat-value">${card.stage}</div></div>` : ''}
      ${card.hp ? `<div class="stat-box">
        <div class="stat-label">HP</div>
        <div class="stat-value">${card.hp}</div>
        <div class="hp-bar-wrap"><div class="hp-bar"><div class="hp-fill" style="width:${Math.min(100,(card.hp/340)*100)}%"></div></div></div>
      </div>` : ''}
      ${card.rarity ? `<div class="stat-box"><div class="stat-label">Rarity</div><div class="stat-value">${card.rarity}</div></div>` : ''}
      ${card.number ? `<div class="stat-box"><div class="stat-label">Card Number</div><div class="stat-value">#${card.number}</div></div>` : ''}
      ${card.set_name ? `<div class="stat-box"><div class="stat-label">Set</div><div class="stat-value">${card.set_name}</div></div>` : ''}
      ${card.series ? `<div class="stat-box"><div class="stat-label">Series</div><div class="stat-value">${card.series}</div></div>` : ''}
      ${card.illustrator ? `<div class="stat-box"><div class="stat-label">Illustrator</div><div class="stat-value">${card.illustrator}</div></div>` : ''}
    </div>
    ${card.description ? `<div style="margin-top:20px;padding:16px;background:var(--bg3);border-radius:8px;font-size:14px;line-height:1.7;color:var(--text2);font-style:italic">${card.description}</div>` : ''}
  </div>

  ${ebayHTML}

  <div class="section">
    <h2>About ${card.set_name}</h2>
    <p style="font-size:14px;color:var(--text2);line-height:1.7;margin-bottom:16px">
      ${card.name} is a card from the ${card.set_name}${card.series ? ` set, part of the ${card.series} series` : ' set'}.
      ${card.rarity ? `It is classified as a ${card.rarity} card.` : ''}
      ${card.number ? `Card number ${card.number} in the set.` : ''}
    </p>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <a href="/cards/pokemon/sets/${card.set_id}" class="cta-btn cta-secondary" style="display:inline-block;padding:8px 16px;font-size:13px">Browse all ${card.set_name} cards →</a>
      <a href="/blog/best-pokemon-booster-boxes-australia/" class="cta-btn cta-secondary" style="display:inline-block;padding:8px 16px;font-size:13px">Is ${card.set_name} worth opening? →</a>
    </div>
  </div>

  <div class="section" style="background:rgba(77,189,95,.04);border-color:rgba(77,189,95,.2)">
    <h2>Track This Card</h2>
    <p style="font-size:14px;color:var(--text2);margin-bottom:16px">Use the free C3 TCG Collection Tracker to monitor this card's value over time. Works for Pokemon, MTG, Lorcana, and more.</p>
    <a href="/tracker.html" class="cta-btn" style="display:inline-block;padding:10px 20px;background:rgba(77,189,95,.15);border:1px solid rgba(77,189,95,.4);color:#4dbd5f;border-radius:8px;font-weight:700">Get Free Tracker →</a>
  </div>

</div>

${relatedHTML}

<footer>
  <div style="margin-bottom:12px">
    <a href="/">Home</a>
    <a href="/cards/mtg">MTG Cards</a>
    <a href="/cards/pokemon">Pokemon Cards</a>
    <a href="/blog">Blog</a>
    <a href="/tracker.html">Free Tracker</a>
    <a href="/contact.html">Contact</a>
  </div>
  <p>© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
  <p style="margin-top:6px;font-size:11px;opacity:.5">Prices are estimates based on USD Scryfall/TCGdex data converted at approximately 1.58 AUD. Check eBay AU for live Australian pricing.</p>
</footer>
<div id="c3-compare-tray" style="position:fixed;bottom:0;left:0;right:0;z-index:900;background:#1a1d2e;border-top:1px solid #2d3254;padding:10px 24px;display:flex;align-items:center;gap:12px;font-family:sans-serif;font-size:13px;transform:translateY(100%);transition:transform .25s;box-shadow:0 -4px 24px rgba(0,0,0,.5)">
  <div id="c3-tray-cards" style="display:flex;gap:8px;flex:1;align-items:center;overflow-x:auto"></div>
  <span id="c3-tray-count" style="color:#9ba3c4;white-space:nowrap;font-size:12px"></span>
  <button onclick="goToCompare()" style="background:#7c6af5;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px;white-space:nowrap">⚖️ Compare Now</button>
  <button data-action="clear-tray" style="background:none;border:1px solid #2d3254;color:#9ba3c4;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;white-space:nowrap">Clear</button>
</div>

<script>
${(await import('fs')).readFileSync ? '' : ''}
const COMPARE_KEY='c3_compare_tray';
function getCompareTray(){try{return JSON.parse(localStorage.getItem(COMPARE_KEY)||'[]');}catch{return[];}}
function saveCompareTray(t){localStorage.setItem(COMPARE_KEY,JSON.stringify(t));}
function renderCompareTray(currentSlug,currentName){
  const tray=getCompareTray();
  const el=document.getElementById('c3-compare-tray');
  const cardsEl=document.getElementById('c3-tray-cards');
  const countEl=document.getElementById('c3-tray-count');
  if(!el||!cardsEl)return;
  if(!tray.length){el.style.transform='translateY(100%)';return;}
  el.style.transform='translateY(0)';
  countEl.textContent=tray.length+' of 5';
  cardsEl.innerHTML=tray.map(c=>\`<div style="display:flex;align-items:center;gap:6px;background:#22263a;border:1px solid #2d3254;border-radius:8px;padding:6px 10px">
    \${c.img?\`<img src="\${c.img}" style="width:28px;border-radius:3px" alt="\${c.name}">\`:''}
    <span style="font-size:12px;color:#e8eaf0;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${c.name}</span>
    <button onclick="removeFromCompare('\${c.slug}')" style="background:none;border:none;color:#9ba3c4;cursor:pointer;font-size:14px;padding:0 2px;line-height:1">×</button>
  </div>\`).join('');
  const btn=document.getElementById('c3-compare-btn');
  const lbl=document.getElementById('c3-compare-lbl');
  if(btn&&lbl){const inTray=tray.some(c=>c.slug===(currentSlug||'${card.slug}'));btn.style.borderColor=inTray?'#7c6af5':'';btn.style.color=inTray?'#7c6af5':'';lbl.textContent=inTray?'Added to Compare ✓':'⚖️ Add to Compare';}
}
function addToCompare(slug,name,img,price,game){
  let tray=getCompareTray();
  if(tray.some(c=>c.slug===slug)){removeFromCompare(slug);return;}
  if(tray.length>=5){alert('Maximum 5 cards. Remove one first.');return;}
  tray.push({slug,name,img,price,game});
  saveCompareTray(tray);
  renderCompareTray(slug,name);
  if(typeof gtag!=='undefined')gtag('event','card_added_to_tray',{card_name:name,game});
}
function removeFromCompare(slug){saveCompareTray(getCompareTray().filter(c=>c.slug!==slug));renderCompareTray('${card.slug}','${card.name.replace(/'/g,"\\'")}');}
function goToCompare(){const tray=getCompareTray();if(!tray.length)return;window.location.href='/compare?cards='+tray.map(c=>(c.game||'pokemon')+':'+c.slug).join(',');}
renderCompareTray('${card.slug}','${card.name.replace(/'/g,"\\'")}');

// Event delegation -- handles data-action buttons without inline onclick
document.addEventListener('click', function(e) {
  // Copy link
  if (e.target.closest('[data-action="copy-link"]')) {
    const btn = e.target.closest('[data-action="copy-link"]');
    navigator.clipboard.writeText(location.href).then(() => {
      btn.textContent = '✓ Copied';
      setTimeout(() => { btn.textContent = '📋 Copy Link'; }, 1500);
    });
  }

  // Add to compare
  const compareBtn = e.target.closest('[data-action="add-to-compare"]');
  if (compareBtn) {
    addToCompare(
      compareBtn.dataset.slug,
      compareBtn.dataset.name,
      compareBtn.dataset.img,
      compareBtn.dataset.price,
      compareBtn.dataset.game
    );
  }

  // Clear compare tray
  if (e.target.closest('[data-action="clear-tray"]')) {
    saveCompareTray([]);
    renderCompareTray();
  }

  // Copy for Discord
  if (e.target.closest('[data-action="copy-discord"]')) {
    const btn = e.target.closest('[data-action="copy-discord"]');
    navigator.clipboard.writeText(location.href).then(() => {
      btn.textContent = '\u2713 Copied';
      setTimeout(() => { btn.textContent = 'Discord'; }, 1500);
    });
  }

  // Watch this card -- open MailerLite modal
  if (e.target.closest('[data-action="watch-card"]')) {
    const btn = e.target.closest('[data-action="watch-card"]');
    const cardName = btn.dataset.cardName;
    const threshold = document.getElementById('watch-threshold-input')?.value || '10';
    document.getElementById('watch-modal').style.display = 'flex';
    document.getElementById('watch-card-name').textContent = cardName;
    document.getElementById('watch-card-input').value = cardName;
    document.getElementById('watch-threshold-input').value = threshold;
  }

  // Close watch modal
  if (e.target.closest('[data-action="close-watch-modal"]') || e.target.id === 'watch-modal') {
    document.getElementById('watch-modal').style.display = 'none';
  }

  // eBay click GA4
  const ebayBtn = e.target.closest('[data-gtag-event]');
  if (ebayBtn && typeof gtag !== 'undefined') {
    gtag('event', ebayBtn.dataset.gtagEvent, { card_name: ebayBtn.dataset.gtagCard, game: ebayBtn.dataset.gtagGame });
  }
});
</script>

<!-- Watch This Card Modal -->
<div id="watch-modal" style="display:none;position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.75);align-items:center;justify-content:center;padding:24px">
  <div style="background:#1a1d2e;border:1px solid #2d3254;border-radius:16px;padding:32px;max-width:440px;width:100%;position:relative">
    <button data-action="close-watch-modal" style="position:absolute;top:14px;right:16px;background:none;border:none;color:#9ba3c4;font-size:20px;cursor:pointer">×</button>
    <div style="font-size:20px;margin-bottom:8px">🔔 Watch This Card</div>
    <div style="font-size:15px;font-weight:700;color:#e8eaf0;margin-bottom:4px" id="watch-card-name"></div>
    <p style="font-size:13px;color:#9ba3c4;margin-bottom:20px;line-height:1.6">Get an email alert when this card's price changes by your chosen amount. Free, no spam.</p>
    <form action="https://landing.mailerlite.com/webforms/submit/mIFDGb" method="POST" target="_blank" style="display:flex;flex-direction:column;gap:12px">
      <input type="hidden" name="fields[watched_card]" id="watch-card-input" value="">
      <input type="hidden" name="ml-submit" value="1">
      <div>
        <label style="font-size:12px;color:#9ba3c4;display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em">Your Email</label>
        <input type="email" name="fields[email]" required placeholder="you@email.com" style="width:100%;background:#0f1117;border:1px solid #2d3254;color:#e8eaf0;padding:10px 14px;border-radius:8px;font-size:14px;font-family:'DM Sans',sans-serif">
      </div>
      <div>
        <label style="font-size:12px;color:#9ba3c4;display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em">Alert me when price changes by</label>
        <select name="fields[alert_threshold]" id="watch-threshold-input" style="width:100%;background:#0f1117;border:1px solid #2d3254;color:#e8eaf0;padding:10px 14px;border-radius:8px;font-size:14px;font-family:'DM Sans',sans-serif">
          <option value="5%">5% or more</option>
          <option value="10%" selected>10% or more</option>
          <option value="20%">20% or more</option>
          <option value="50%">50% or more (major moves only)</option>
        </select>
      </div>
      <button type="submit" style="background:#4dbd5f;color:#000;border:none;padding:12px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;font-family:'DM Sans',sans-serif">Set Price Alert →</button>
    </form>
    <p style="font-size:11px;color:#6b7494;margin-top:12px;text-align:center">Unsubscribe any time. We never sell your data.</p>
  </div>
</div>
<!-- REPORT BUG WIDGET -->
<style>.bug-float{position:fixed;bottom:20px;right:20px;z-index:9999}.bug-btn{display:flex;align-items:center;gap:6px;background:rgba(15,17,25,.95);border:1px solid rgba(201,168,76,.3);color:#C9A84C;padding:8px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;font-family:sans-serif;backdrop-filter:blur(12px);transition:all .2s;text-decoration:none;letter-spacing:.03em;box-shadow:0 4px 16px rgba(0,0,0,.4)}.bug-btn:hover{border-color:#C9A84C;background:rgba(201,168,76,.12);color:#E8C86A;text-decoration:none;transform:translateY(-2px)}.bug-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10000;align-items:center;justify-content:center;backdrop-filter:blur(4px)}.bug-modal.open{display:flex}.bug-box{background:#111420;border:1px solid #252840;border-radius:14px;padding:28px;width:100%;max-width:420px;margin:0 16px;position:relative}.bug-close{position:absolute;top:12px;right:14px;background:none;border:none;color:#9ba3c4;font-size:18px;cursor:pointer}.bug-form select,.bug-form textarea{width:100%;background:rgba(255,255,255,.05);border:1px solid #252840;border-radius:8px;color:#F0F2FF;font-family:sans-serif;font-size:13px;padding:9px 12px;margin-bottom:12px;outline:none}.bug-form select option{background:#e8eaf0;color:#111420}.bug-form select{background:#e8eaf0;color:#111420}.bug-hidden{display:none}.bug-submit{width:100%;padding:10px;background:#C9A84C;color:#0A0C14;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer}.bug-thanks{display:none;text-align:center;padding:12px 0}.bug-thanks p{color:#4ADE80;font-size:14px}</style>
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

    return new Response(html, { status: 200, headers });

  } catch (err) {
    console.error('Pokemon card page error:', err.message);
    return new Response(`<html><body>Error loading card: ${err.message}</body></html>`, { status: 500, headers });
  }
};

function notFoundPage(slug) {
  return `<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><title>Card Not Found | Cards on Cards on Cards</title></head>
  <body style="background:#0f1117;color:#e8eaf0;font-family:sans-serif;text-align:center;padding:80px 24px">
    <h1 style="color:#f5a623;margin-bottom:16px">Card Not Found</h1>
    <p style="color:#9ba3c4;margin-bottom:24px">We couldn't find "${slug}" in our Pokemon card database.</p>
    <a href="/cards/pokemon" style="background:#f5a623;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none">Browse Pokemon Cards →</a>
  </body></html>`;
}

export const config = { path: '/cards/pokemon/:slug+' };
