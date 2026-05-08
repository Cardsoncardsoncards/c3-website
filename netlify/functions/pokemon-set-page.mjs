// netlify/functions/pokemon-set-page.mjs
// Serves /cards/pokemon/sets/:setId

const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EBAY_CLIENT_ID = Netlify.env.get('EBAY_CLIENT_ID');
const EBAY_CLIENT_SECRET = Netlify.env.get('EBAY_CLIENT_SECRET');
const EPN_CAMPID = '5339146789';

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
  });
  if (!res.ok) return [];
  return res.json();
}

async function getEbayToken() {
  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) return null;
  try {
    const creds = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);
    const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope'
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d.access_token || null;
  } catch { return null; }
}

async function getEbayListings(q, token) {
  if (!token) return [];
  try {
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&category_ids=183454&filter=buyingOptions%3A%7BFIXED_PRICE%7D&sort=-price&limit=10`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_AU' } });
    if (!res.ok) return [];
    const d = await res.json();
    return d.itemSummaries || [];
  } catch { return []; }
}

const NAV = `<nav style="background:rgba(8,10,15,.97);border-bottom:1px solid #1e2235;padding:10px 0;position:sticky;top:0;z-index:100;backdrop-filter:blur(16px)">
  <div style="max-width:1200px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
    <a href="/" style="display:flex;align-items:center;gap:8px;text-decoration:none;font-family:'Cinzel',serif;font-size:12px;font-weight:700;letter-spacing:.1em;color:#C9A84C;text-transform:uppercase">
      <img src="/c3-logo.png" alt="C3" style="height:28px;width:28px;border-radius:5px;object-fit:cover;flex-shrink:0">
      <span>Cards on Cards on Cards</span>
    </a>
    <div style="display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none">
      <a href="/" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(160,196,255,.35);color:#A0C4FF;white-space:nowrap">← Home</a>
      <a href="/cards" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(201,168,76,.35);color:#C9A84C;white-space:nowrap">Card Vault</a>
      <a href="/cards/pokemon" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(255,204,0,.35);color:#FFCC00;background:rgba(255,204,0,.08);white-space:nowrap">Pokemon</a>
      <a href="/cards/mtg" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid #1e2235;color:#A0A8C0;white-space:nowrap">MTG</a>
      <a href="/calendar" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(248,113,113,.35);color:#F87171;white-space:nowrap">Calendar</a>
      <a href="/generators" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(34,211,238,.35);color:#22D3EE;white-space:nowrap">Generators</a>
      <a href="/shop.html" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(201,168,76,.35);color:#C9A84C;white-space:nowrap">Shop</a>
      <a href="/tracker.html" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(192,132,252,.35);color:#C084FC;white-space:nowrap">Tracker</a>
    </div>
  </div>
</nav>`;

const getRarityColour = (r) => {
  if (!r) return '#9ca3af';
  const rl = r.toLowerCase();
  if (rl.includes('rainbow') || rl.includes('gold')) return '#f5a623';
  if (rl.includes('secret') || rl.includes('hyper')) return '#f5a623';
  if (rl.includes('ultra') || rl.includes('ex') || rl.includes('vmax') || rl.includes('vstar')) return '#f5a623';
  if (rl.includes('holo') || rl.includes('rare')) return '#a855f7';
  if (rl.includes('uncommon')) return '#4ade80';
  return '#9ca3af';
};

export default async (req) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=900, s-maxage=1800' };
  const url = new URL(req.url);
  const setId = url.pathname.replace(/^\/cards\/pokemon\/sets\//, '').replace(/\/$/, '');
  if (!setId) return new Response('Not found', { status: 404, headers });

  const [sets, cards, ebayToken] = await Promise.all([
    supabaseGet(`pokemon_sets?id=eq.${encodeURIComponent(setId)}&limit=1`),
    supabaseGet(`pokemon_cards?set_id=eq.${encodeURIComponent(setId)}&order=market_price.desc.nullslast&limit=400&select=slug,name,image_url,market_price,price_aud,number`),
    getEbayToken()
  ]);

  if (!sets || !sets[0]) return new Response('Set not found', { status: 404, headers });
  const set = sets[0];

  const ebayListings = await getEbayListings(`${set.name} pokemon card`, ebayToken);
  const ebaySearchURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name+' pokemon')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
  const ebayBoxURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name+' pokemon booster box')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;

  const toAud = (c) => c.market_price && c.market_price > 0 ? parseFloat(c.market_price) * 1.58 : 0;
  const pricedCards = cards.filter(c => toAud(c) > 0);
  const top5 = pricedCards.slice(0, 5);
  const rarities = [...new Set(cards.map(c => c.rarity).filter(Boolean))].sort();
  const types = []; // category and rarity columns have no data in pokemon_cards

  const topTwo = pricedCards.slice(0, 2);
  const contextText = topTwo.length >= 2
    ? `${set.name} contains ${cards.length} cards. The most valuable are <strong>${topTwo[0].name}</strong> at ~AU$${toAud(topTwo[0]).toFixed(0)} and <strong>${topTwo[1].name}</strong> at ~AU$${toAud(topTwo[1]).toFixed(0)}. Prices are converted from USD daily.`
    : `${set.name} contains ${cards.length} cards. Prices are converted from USD to AUD daily.`;

  const top5HTML = top5.map(c => {
    const aud = toAud(c);
    const rc = getRarityColour(c.rarity);
    return `<a href="/cards/pokemon/${c.slug}" style="flex:0 0 150px;background:#0e1118;border:1px solid rgba(255,204,0,.2);border-radius:10px;padding:10px;text-align:center;text-decoration:none;position:relative;transition:all .2s;display:block" onmouseover="this.style.borderColor='#FFCC00';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='rgba(255,204,0,.2)';this.style.transform='none'">
      <div style="position:absolute;top:6px;right:6px;width:8px;height:8px;border-radius:50%;background:${rc}"></div>
      ${c.image_url ? `<img src="${c.image_url}" alt="${c.name}" style="width:100%;border-radius:6px;display:block" loading="lazy">` : `<div style="height:120px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#7a8099">${c.name}</div>`}
      <div style="font-size:10px;color:#F0F2FF;margin-top:6px;line-height:1.3;font-weight:600">${c.name}</div>
      <div style="font-family:'Cinzel',serif;font-size:14px;color:#FFCC00;font-weight:700;margin-top:3px">~AU$${aud.toFixed(0)}</div>
    </a>`;
  }).join('');

  const cardGrid = cards.map(c => {
    const aud = toAud(c);
    const priceDisplay = aud >= 0.50 ? `~AU$${aud.toFixed(0)}` : `<span style="color:rgba(160,168,192,.35);font-size:9px">no price</span>`;
    const rc = getRarityColour(c.rarity);
    return `<a href="/cards/pokemon/${c.slug}" class="card-item" data-price="${aud.toFixed(2)}">
      <div style="position:absolute;top:5px;right:5px;width:7px;height:7px;border-radius:50%;background:${rc}"></div>
      ${c.image_url ? `<img src="${c.image_url}" alt="${c.name}" style="width:100%;border-radius:5px;display:block;margin-top:2px" loading="lazy">` : `<div style="height:70px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#7a8099">${c.name}</div>`}
      <div style="font-size:10px;margin-top:4px;color:#F0F2FF;line-height:1.2">${c.name}</div>
      <div style="font-size:11px;color:#FFCC00;font-weight:700;margin-top:2px">${priceDisplay}</div>
    </a>`;
  }).join('');

  const ebayCarouselHTML = ebayListings.length ? `
    <div style="margin-top:40px;padding:28px;background:rgba(255,204,0,.04);border:1px solid rgba(255,204,0,.12);border-radius:14px">
      <p style="font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#FFCC00;margin-bottom:6px">Live eBay AU Listings</p>
      <h2 style="font-family:'Cinzel',serif;font-size:18px;color:#F0F2FF;margin-bottom:16px">${set.name} on eBay Australia</h2>
      <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:12px;scroll-snap-type:x mandatory">
        ${ebayListings.map(item => {
          const price = item.price?.value ? `AU$${parseFloat(item.price.value).toFixed(2)}` : '';
          const epnUrl = `https://www.ebay.com.au/itm/${item.itemId}?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
          return `<a href="${epnUrl}" target="_blank" rel="noopener sponsored" style="flex:0 0 160px;background:#161929;border:1px solid #252840;border-radius:12px;overflow:hidden;text-decoration:none;display:flex;flex-direction:column;scroll-snap-align:start;transition:all .22s" onmouseover="this.style.borderColor='rgba(255,204,0,.4)'" onmouseout="this.style.borderColor='#252840'">
            ${item.image?.imageUrl ? `<img src="${item.image.imageUrl}" alt="${(item.title||'').slice(0,40)}" style="width:100%;height:120px;object-fit:contain;background:#0d0f1a;padding:8px" loading="lazy">` : `<div style="height:120px;background:#0d0f1a;display:flex;align-items:center;justify-content:center;font-size:24px">🃏</div>`}
            <div style="padding:9px 11px;flex:1;display:flex;flex-direction:column;gap:4px">
              <div style="font-size:11px;color:#F0F2FF;line-height:1.35;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;flex:1">${item.title||''}</div>
              <div style="font-family:'Cinzel',serif;font-size:13px;font-weight:700;color:#FFCC00;margin-top:4px">${price}</div>
              <div style="font-size:10px;color:rgba(160,168,192,.5)">View on eBay ↗</div>
            </div>
          </a>`;
        }).join('')}
      </div>
      <div style="text-align:right;margin-top:8px">
        <a href="${ebaySearchURL}" target="_blank" rel="noopener" style="font-size:12px;color:#FFCC00;text-decoration:none;opacity:.7">View all ${set.name} listings on eBay ↗</a>
      </div>
    </div>` : `
    <div style="margin-top:32px;text-align:center;padding:20px;background:#0e1118;border:1px solid #1e2235;border-radius:12px">
      <p style="font-size:14px;color:#7a8099;margin-bottom:12px">Find ${set.name} cards on eBay Australia</p>
      <a href="${ebaySearchURL}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:rgba(255,204,0,.12);border:1px solid rgba(255,204,0,.3);color:#FFCC00;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">Shop ${set.name} on eBay AU ↗</a>
    </div>`;

  const rarityFilterHTML = '' && rarities.length ? `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <span style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#7a8099;min-width:90px">Rarity</span>
      <button class="filt-btn active" data-rarity-filter="all" onclick="setFilter('rarity','all',this)">All</button>
      ${rarities.map(r => { const rs = r.toLowerCase().replace(/[^a-z0-9 ]/g,''); return `<button class="filt-btn" data-rarity-filter="${rs}" onclick="setFilter('rarity','${rs}',this)">${r}</button>`; }).join('')}
    </div>` : '';

  const typeFilterHTML = '' && types.length > 1 ? `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <span style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#7a8099;min-width:90px">Type</span>
      <button class="filt-btn active" data-type-filter="all" onclick="setFilter('type','all',this)">All</button>
      ${types.map(t => `<button class="filt-btn" data-type-filter="${t.toLowerCase()}" onclick="setFilter('type','${t.toLowerCase()}',this)">${t}</button>`).join('')}
    </div>` : '';

  const releaseDate = set.release_date ? new Date(set.release_date).toLocaleDateString('en-AU', {day:'numeric',month:'long',year:'numeric'}) : null;

  const schemaLD = JSON.stringify({
    "@context":"https://schema.org","@type":"CollectionPage",
    "name":`${set.name} Pokemon Card Prices Australia`,
    "description":`Browse all ${cards.length} ${set.name} Pokemon cards with AUD prices and eBay AU buy links.`,
    "url":`https://cardsoncardsoncards.com.au/cards/pokemon/sets/${setId}`
  });

  const faqSchema = JSON.stringify({
    "@context":"https://schema.org","@type":"FAQPage",
    "mainEntity":[
      {"@type":"Question","name":`How many cards are in ${set.name}?`,"acceptedAnswer":{"@type":"Answer","text":`${set.name} contains ${cards.length} cards in the C3 database.`}},
      {"@type":"Question","name":`What is the most valuable ${set.name} Pokemon card?`,"acceptedAnswer":{"@type":"Answer","text":pricedCards.length ? `The most valuable ${set.name} card is ${pricedCards[0].name} at approximately AU$${toAud(pricedCards[0]).toFixed(2)}.` : `Check eBay AU for current ${set.name} card prices.`}},
      {"@type":"Question","name":`Where can I buy ${set.name} cards in Australia?`,"acceptedAnswer":{"@type":"Answer","text":`You can buy ${set.name} Pokemon cards on eBay AU with Australian shipping, or find sealed product on Amazon AU.`}}
    ]
  });

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${set.name} Card Prices Australia | Pokemon TCG | Cards on Cards on Cards</title>
<meta name="description" content="Browse all ${cards.length} ${set.name} Pokemon cards with live AUD pricing and eBay AU buy links. Filter by rarity and type. Updated daily.">
<link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/pokemon/sets/${setId}">
<link rel="icon" href="/favicon.ico">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<script type="application/ld+json">${schemaLD}</script>
<script type="application/ld+json">${faqSchema}</script>
<style>
:root{--bg:#080a0f;--bg2:#0e1118;--bg3:#141720;--border:#1e2235;--text:#F0F2FF;--text2:#7a8099;--accent:#FFCC00}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1200px;margin:0 auto;padding:0 24px 80px}
.card-item{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center;display:block;transition:border-color .2s;position:relative;text-decoration:none}
.card-item:hover{border-color:var(--accent)}
.card-item.hidden{display:none}
.filt-btn{padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:none;color:var(--text2);font-size:11px;font-weight:600;cursor:pointer;transition:all .18s;font-family:'DM Sans',sans-serif}
.filt-btn:hover{border-color:var(--accent);color:var(--accent)}
.filt-btn.active{border-color:var(--accent);color:var(--accent);background:rgba(255,204,0,.1)}
</style>
</head>
<body>
${NAV}
<div class="wrap" style="padding-top:32px">

  <div style="font-size:12px;color:var(--text2);margin-bottom:16px">
    <a href="/" style="color:var(--text2)">Home</a> ›
    <a href="/cards" style="color:var(--text2)">Card Vault</a> ›
    <a href="/cards/pokemon" style="color:var(--text2)">Pokemon TCG</a> ›
    <span style="color:var(--accent)">${set.name}</span>
  </div>

  ${set.logo_uri ? `<img src="${set.logo_uri}" alt="${set.name}" style="height:60px;object-fit:contain;margin-bottom:12px;display:block">` : ''}
  <h1 style="font-family:'Cinzel',serif;font-size:clamp(22px,4vw,36px);margin-bottom:6px">${set.name} <span style="color:var(--accent)">Card Prices</span></h1>
  <p style="color:var(--text2);margin-bottom:20px;font-size:14px">${cards.length} cards${releaseDate ? ` · Released ${releaseDate}` : ''} · AUD prices updated daily</p>

  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:28px">
    <a href="${ebaySearchURL}" target="_blank" rel="noopener" style="background:rgba(255,204,0,.12);border:1px solid rgba(255,204,0,.3);color:#FFCC00;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">🛒 Buy Singles on eBay AU ↗</a>
    <a href="${ebayBoxURL}" target="_blank" rel="noopener" style="background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.3);color:#60A5FA;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">📦 Buy Booster Box ↗</a>
    <a href="/blog/best-pokemon-booster-boxes-australia/" style="background:var(--bg2);border:1px solid var(--border);color:var(--text2);padding:9px 16px;border-radius:8px;font-size:13px;text-decoration:none">📖 Is it Worth Opening?</a>
    <a href="/ev-calculator.html" style="background:rgba(251,146,60,.1);border:1px solid rgba(251,146,60,.3);color:#FB923C;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">📊 EV Calculator</a>
  </div>

  <div style="background:rgba(255,204,0,.04);border:1px solid rgba(255,204,0,.15);border-radius:10px;padding:16px 20px;margin-bottom:24px;font-size:13px;color:var(--text2);line-height:1.6">${contextText}</div>

  ${top5.length ? `
  <div style="margin-bottom:32px">
    <p style="font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--text2);margin-bottom:14px">Top Cards by Value</p>
    <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;scroll-snap-type:x mandatory">
      ${top5HTML}
    </div>
  </div>` : ''}

  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:18px 20px;margin-bottom:24px">
    ${rarityFilterHTML}
    ${typeFilterHTML}
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#7a8099;min-width:90px">Sort</span>
      <select id="sort-sel" onchange="applyFilters()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:5px 10px;border-radius:6px;font-size:11px;font-family:'DM Sans',sans-serif;cursor:pointer">
        <option value="price-desc">Price: High to Low</option>
        <option value="price-asc">Price: Low to High</option>
        <option value="name-asc">Name: A to Z</option>
        <option value="number-asc">Card Number</option>
      </select>
      <select id="price-sel" onchange="applyFilters()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:5px 10px;border-radius:6px;font-size:11px;font-family:'DM Sans',sans-serif;cursor:pointer">
        <option value="0">Any Price</option>
        <option value="1">AU$1+</option>
        <option value="5">AU$5+</option>
        <option value="20">AU$20+</option>
        <option value="50">AU$50+</option>
      </select>
      <span id="filter-count" style="font-size:12px;color:var(--text2);margin-left:8px"></span>
      <button onclick="clearFilters()" style="background:none;border:1px solid var(--border);color:var(--text2);padding:5px 12px;border-radius:6px;font-size:11px;cursor:pointer;font-family:'DM Sans',sans-serif;margin-left:auto">Reset</button>
    </div>
  </div>

  <div id="card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:36px">${cardGrid}</div>

  ${ebayCarouselHTML}

  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:24px;margin-top:36px">
    <h2 style="font-family:'Cinzel',serif;font-size:16px;margin-bottom:8px">Frequently Asked Questions</h2>
    <details style="margin-top:12px;border-bottom:1px solid var(--border);padding-bottom:12px">
      <summary style="cursor:pointer;font-size:14px;font-weight:600;color:var(--text)">How many cards are in ${set.name}?</summary>
      <p style="font-size:13px;color:var(--text2);margin-top:8px">${set.name} contains ${cards.length} cards in the C3 database.</p>
    </details>
    <details style="margin-top:12px;border-bottom:1px solid var(--border);padding-bottom:12px">
      <summary style="cursor:pointer;font-size:14px;font-weight:600;color:var(--text)">What is the most valuable ${set.name} card?</summary>
      <p style="font-size:13px;color:var(--text2);margin-top:8px">${pricedCards.length ? `The most valuable ${set.name} card is <strong style="color:var(--text)">${pricedCards[0].name}</strong> at approximately AU$${toAud(pricedCards[0]).toFixed(2)}.` : `Check eBay AU for current prices.`}</p>
    </details>
    <details style="margin-top:12px;padding-bottom:4px">
      <summary style="cursor:pointer;font-size:14px;font-weight:600;color:var(--text)">Where can I buy ${set.name} cards in Australia?</summary>
      <p style="font-size:13px;color:var(--text2);margin-top:8px">You can buy ${set.name} Pokemon cards on <a href="${ebaySearchURL}" target="_blank" rel="noopener">eBay AU</a> with Australian shipping, or find sealed product on Amazon AU.</p>
    </details>
  </div>

</div>

<footer style="border-top:1px solid var(--border);padding:24px;text-align:center;color:var(--text2);font-size:12px;margin-top:20px">
  <p><a href="/" style="color:var(--text2);margin:0 8px">Home</a><a href="/cards" style="color:var(--text2);margin:0 8px">Card Vault</a><a href="/cards/pokemon" style="color:var(--text2);margin:0 8px">Pokemon TCG</a><a href="/blog" style="color:var(--text2);margin:0 8px">Blog</a><a href="/tracker.html" style="color:var(--text2);margin:0 8px">Tracker</a></p>
  <p style="margin-top:8px">© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
  <p style="margin-top:6px;font-size:11px">Pokemon card data via TCGdex. Prices in AUD are estimates based on USD conversion. Not financial advice.</p>
</footer>

<script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
<script>
let activeRarity='all',activeType='all',minPrice=0,sortMode='price-desc';

function setFilter(dim,val,btn){
  document.querySelectorAll('[data-'+dim+'-filter]').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  if(dim==='rarity') activeRarity=val;
  if(dim==='type') activeType=val;
  applyFilters();
}

function applyFilters(){
  sortMode=document.getElementById('sort-sel').value;
  minPrice=parseFloat(document.getElementById('price-sel').value)||0;
  const grid=document.getElementById('card-grid');
  const items=[...grid.querySelectorAll('.card-item')];
  let visible=0;
  items.forEach(el=>{
    const r=el.dataset.rarity||'';
    const t=el.dataset.type||'';
    const p=parseFloat(el.dataset.price)||0;
    const rMatch=activeRarity==='all'||r===activeRarity;
    const tMatch=activeType==='all'||t===activeType;
    const pMatch=p>=minPrice;
    const show=rMatch&&tMatch&&pMatch;
    el.classList.toggle('hidden',!show);
    if(show) visible++;
  });
  document.getElementById('filter-count').textContent=visible+' cards';
  const vis=items.filter(el=>!el.classList.contains('hidden'));
  vis.sort((a,b)=>{
    if(sortMode==='price-desc') return (parseFloat(b.dataset.price)||0)-(parseFloat(a.dataset.price)||0);
    if(sortMode==='price-asc') return (parseFloat(a.dataset.price)||0)-(parseFloat(b.dataset.price)||0);
    if(sortMode==='name-asc') return (a.querySelector('div:nth-child(2)')?.textContent||'').localeCompare(b.querySelector('div:nth-child(2)')?.textContent||'');
    return 0;
  });
  vis.forEach(el=>grid.appendChild(el));
}

function clearFilters(){
  activeRarity='all';activeType='all';minPrice=0;
  document.querySelectorAll('.filt-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('[data-rarity-filter="all"],[data-type-filter="all"]').forEach(b=>b.classList.add('active'));
  document.getElementById('sort-sel').value='price-desc';
  document.getElementById('price-sel').value='0';
  applyFilters();
}

applyFilters();
</script>
</body>
</html>`;

  return new Response(html, { status: 200, headers });
};

export const config = { path: '/cards/pokemon/sets/:setId+' };
