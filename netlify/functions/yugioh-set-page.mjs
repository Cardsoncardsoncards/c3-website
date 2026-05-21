// netlify/functions/yugioh-set-page.mjs
// Serves /cards/yugioh/sets/:setCode

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
    const tokenController = new AbortController();
    const tokenTimeout = setTimeout(() => tokenController.abort(), 4000);
    const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      signal: tokenController.signal,
      headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope'
    });
    clearTimeout(tokenTimeout);
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

const ATTR_COLOURS = {'LIGHT':'#FFD700','DARK':'#9966CC','FIRE':'#FF4500','WATER':'#1E90FF','EARTH':'#8B6914','WIND':'#00CC66','DIVINE':'#FFD700'};

const NAV = `<nav style="background:rgba(8,10,15,.97);backdrop-filter:blur(18px);border-bottom:1px solid #1e2235;padding:10px 0;position:sticky;top:0;z-index:100">
  <div style="display:flex;align-items:center;justify-content:space-between;max-width:1140px;margin:0 auto;padding:0 20px;gap:12px;flex-wrap:nowrap">
    <a href="/" style="display:flex;align-items:center;gap:9px;font-family:'Cinzel',serif;font-size:11.5px;font-weight:700;letter-spacing:.12em;color:#C9A84C;text-decoration:none;text-transform:uppercase;white-space:nowrap;flex-shrink:0">
      <img src="/c3logo.png" alt="C3" style="height:32px;width:32px;border-radius:6px;object-fit:cover;flex-shrink:0">
      <span>Cards on Cards on Cards</span>
    </a>
    <div style="display:flex;gap:3px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none">
      <a href="/cards" style="display:inline-flex;align-items:center;padding:5px 9px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(201,168,76,.35);color:#C9A84C;white-space:nowrap">Card Vault</a>
      <a href="/compare" style="display:inline-flex;align-items:center;padding:5px 9px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(167,139,250,.35);color:#A78BFA;white-space:nowrap">Compare</a>
      <a href="/market" style="display:inline-flex;align-items:center;padding:5px 9px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(74,222,128,.35);color:#4ADE80;white-space:nowrap">Market</a>
      <a href="/tools" style="display:inline-flex;align-items:center;padding:5px 9px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(251,146,60,.35);color:#FB923C;white-space:nowrap">Tools</a>
      <a href="/play" style="display:inline-flex;align-items:center;padding:5px 9px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(244,114,182,.35);color:#F472B6;white-space:nowrap">Play</a>
      <a href="/blog" style="display:inline-flex;align-items:center;padding:5px 9px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(126,203,161,.35);color:#7ECBA1;white-space:nowrap">Blog</a>
      <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=C3Nav&toolid=10001&mkevt=1" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;padding:5px 9px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(96,165,250,.35);color:#60A5FA;background:rgba(96,165,250,.05);white-space:nowrap">Shop eBay &#8599;</a>
    </div>
  </div>
</nav>`;

export default async (req) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=900, s-maxage=1800' };
  const url = new URL(req.url);
  const setCode = url.pathname.replace(/^\/cards\/yugioh\/sets\//, '').replace(/\/$/, '').toLowerCase();
  if (!setCode) return new Response(`<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Set Not Found | Yu-Gi-Oh | Cards on Cards on Cards</title>
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;600&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0A0C14;color:#F0F2FF;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}
    .wrap{max-width:420px}
    .icon{font-size:48px;margin-bottom:16px}
    h1{font-family:'Cinzel',serif;color:#c8a332;font-size:22px;margin-bottom:10px}
    p{color:#8892b0;font-size:14px;margin-bottom:24px;line-height:1.6}
    .btn{display:inline-block;background:#c8a332;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;margin:4px}
    .btn-sec{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:#F0F2FF}
  </style>
</head>
<body>
<div class="wrap">
  <div class="icon">🃏</div>
  <h1>Set Not Found</h1>
  <p>This Yu-Gi-Oh set page isn't available yet. Browse all Yu-Gi-Oh cards or return home.</p>
  <a href="/cards/yugioh" class="btn">Browse All Yu-Gi-Oh Cards</a>
  <a href="/" class="btn btn-sec">← Home</a>
</div>
</body>
</html>`, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

  try {
  const [sets, ebayToken] = await Promise.all([
    supabaseGet(`yugioh_sets?abbreviation=ilike.${encodeURIComponent(setCode)}&limit=1`).then(r =>
      r.length ? r : supabaseGet(`yugioh_sets?slug=eq.${encodeURIComponent(setCode)}&limit=1`)
    ),
    getEbayToken()
  ]);

  if (!sets || !sets[0]) return new Response(`<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Set Not Found | Yu-Gi-Oh | Cards on Cards on Cards</title>
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;600&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0A0C14;color:#F0F2FF;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}
    .wrap{max-width:420px}
    .icon{font-size:48px;margin-bottom:16px}
    h1{font-family:'Cinzel',serif;color:#c8a332;font-size:22px;margin-bottom:10px}
    p{color:#8892b0;font-size:14px;margin-bottom:24px;line-height:1.6}
    .btn{display:inline-block;background:#c8a332;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;margin:4px}
    .btn-sec{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:#F0F2FF}
  </style>
</head>
<body>
<div class="wrap">
  <div class="icon">🃏</div>
  <h1>Set Not Found</h1>
  <p>This Yu-Gi-Oh set page isn't available yet. Browse all Yu-Gi-Oh cards or return home.</p>
  <a href="/cards/yugioh" class="btn">Browse All Yu-Gi-Oh Cards</a>
  <a href="/" class="btn btn-sec">← Home</a>
</div>
</body>
</html>`, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  const set = sets[0];

  // yugioh_cards has no set linkage column - cannot filter by set
  const cards = [];

  const ebaySearchURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name+' yugioh')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
  const ebayBoxURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name+' yugioh booster box')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
  const ebayListings = await getEbayListings(`${set.name} yugioh card`, ebayToken);

  const toAud = (c) => c.market_price && c.market_price > 0 ? parseFloat(c.market_price) * 1.58 : 0;
  const pricedCards = cards.filter(c => toAud(c) > 0);
  const top5 = pricedCards.slice(0, 5);
  const rarities = [...new Set(cards.map(c => c.rarity).filter(Boolean))].sort();
  const attributes = [...new Set(cards.map(c => c.attribute).filter(Boolean))].sort();

  const topTwo = pricedCards.slice(0, 2);
  const contextText = topTwo.length >= 2
    ? `${set.name} contains ${cards.length} Yu-Gi-Oh cards. The most valuable are <strong>${topTwo[0].name}</strong> at ~AU$${toAud(topTwo[0]).toFixed(0)} and <strong>${topTwo[1].name}</strong> at ~AU$${toAud(topTwo[1]).toFixed(0)}. Prices converted daily.`
    : `${set.name} contains ${cards.length} Yu-Gi-Oh cards. Prices updated daily in AUD.`;

  const top5HTML = top5.map(c => {
    const aud = toAud(c);
    const ac = ATTR_COLOURS[c.attribute] || '#c8a332';
    return `<a href="/cards/yugioh/${c.slug}" style="flex:0 0 150px;background:#0e1118;border:1px solid rgba(200,163,50,.25);border-radius:10px;padding:10px;text-align:center;text-decoration:none;position:relative;transition:all .2s;display:block" onmouseover="this.style.borderColor='#c8a332';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='rgba(200,163,50,.25)';this.style.transform='none'">
      ${c.attribute ? `<div style="position:absolute;top:6px;left:6px;background:${ac};color:#000;font-size:8px;font-weight:700;padding:2px 5px;border-radius:3px">${c.attribute}</div>` : ''}
      ${(c.image_url) ? `<img src="${c.image_url}" alt="${c.name}" style="width:100%;border-radius:6px;display:block" loading="lazy">` : `<div style="height:120px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#7a8099">${c.name}</div>`}
      <div style="font-size:10px;color:#F0F2FF;margin-top:6px;line-height:1.3;font-weight:600">${c.name}</div>
      <div style="font-family:'Cinzel',serif;font-size:14px;color:#c8a332;font-weight:700;margin-top:3px">~AU$${aud.toFixed(0)}</div>
    </a>`;
  }).join('');

  const cardGrid = cards.map(c => {
    const aud = toAud(c);
    const priceDisplay = aud >= 0.50 ? `~AU$${aud.toFixed(0)}` : `<span style="color:rgba(160,168,192,.35);font-size:9px">no price</span>`;
    const ac = ATTR_COLOURS[c.attribute] || '#888';
    return `<a href="/cards/yugioh/${c.slug}" class="card-item" data-rarity="${(c.rarity||'').toLowerCase()}" data-attr="${(c.attribute||'').toLowerCase()}" data-price="${aud.toFixed(2)}">
      <div style="position:absolute;top:5px;right:5px;width:7px;height:7px;border-radius:50%;background:${ac}"></div>
      ${(c.image_url) ? `<img src="${c.image_url}" alt="${c.name}" style="width:100%;border-radius:5px;display:block;margin-top:2px" loading="lazy">` : `<div style="height:70px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#7a8099">${c.name}</div>`}
      <div style="font-size:10px;margin-top:4px;color:#F0F2FF;line-height:1.2">${c.name}</div>
      <div style="font-size:11px;color:#c8a332;font-weight:700;margin-top:2px">${priceDisplay}</div>
    </a>`;
  }).join('');

  const ebayCarouselHTML = ebayListings.length ? `
    <div style="margin-top:40px;padding:28px;background:rgba(200,163,50,.04);border:1px solid rgba(200,163,50,.15);border-radius:14px">
      <p style="font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#c8a332;margin-bottom:6px">Live eBay AU Listings</p>
      <h2 style="font-family:'Cinzel',serif;font-size:18px;color:#F0F2FF;margin-bottom:16px">${set.name} on eBay Australia</h2>
      <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:12px">
        ${ebayListings.map(item => {
          const price = item.price?.value ? `AU$${parseFloat(item.price.value).toFixed(2)}` : '';
          const epnUrl = `https://www.ebay.com.au/itm/${item.itemId}?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
          return `<a href="${epnUrl}" target="_blank" rel="noopener sponsored" style="flex:0 0 160px;background:#161929;border:1px solid #252840;border-radius:12px;overflow:hidden;text-decoration:none;display:flex;flex-direction:column;transition:all .22s" onmouseover="this.style.borderColor='rgba(200,163,50,.4)'" onmouseout="this.style.borderColor='#252840'">
            ${item.image?.imageUrl ? `<img src="${item.image.imageUrl}" alt="${(item.title||'').slice(0,40)}" style="width:100%;height:120px;object-fit:contain;background:#0d0f1a;padding:8px" loading="lazy">` : `<div style="height:120px;background:#0d0f1a;display:flex;align-items:center;justify-content:center;font-size:24px">👁</div>`}
            <div style="padding:9px 11px;flex:1;display:flex;flex-direction:column;gap:4px">
              <div style="font-size:11px;color:#F0F2FF;line-height:1.35;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;flex:1">${item.title||''}</div>
              <div style="font-family:'Cinzel',serif;font-size:13px;font-weight:700;color:#c8a332;margin-top:4px">${price}</div>
              <div style="font-size:10px;color:rgba(160,168,192,.5)">View on eBay ↗</div>
            </div>
          </a>`;
        }).join('')}
      </div>
      <div style="text-align:right;margin-top:8px"><a href="${ebaySearchURL}" target="_blank" rel="noopener" style="font-size:12px;color:#c8a332;text-decoration:none;opacity:.7">View all listings ↗</a></div>
    </div>` : `<div style="margin-top:32px;text-align:center;padding:20px;background:#0e1118;border:1px solid #1e2235;border-radius:12px">
      <a href="${ebaySearchURL}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:rgba(200,163,50,.12);border:1px solid rgba(200,163,50,.3);color:#c8a332;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">Shop ${set.name} on eBay AU ↗</a>
    </div>`;

  const attrFilterHTML = attributes.length ? `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <span style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#7a8099;min-width:90px">Attribute</span>
      <button class="filt-btn active" data-attr-filter="all" onclick="setFilter('attr','all',this)">All</button>
      ${attributes.map(a => { const ac = ATTR_COLOURS[a]||'#c8a332'; return `<button class="filt-btn" data-attr-filter="${a.toLowerCase()}" onclick="setFilter('attr','${a.toLowerCase()}',this)" style="border-color:${ac}40;color:${ac}">${a}</button>`; }).join('')}
    </div>` : '';

  const rarityFilterHTML = rarities.length ? `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <span style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#7a8099;min-width:90px">Rarity</span>
      <button class="filt-btn active" data-rarity-filter="all" onclick="setFilter('rarity','all',this)">All</button>
      ${rarities.map(r => { const rs = r.toLowerCase().replace(/[^a-z0-9 ]/g,''); return `<button class="filt-btn" data-rarity-filter="${rs}" onclick="setFilter('rarity','${rs}',this)">${r}</button>`; }).join('')}
    </div>` : '';

  const releaseDate = set.tcg_date ? new Date(set.tcg_date).toLocaleDateString('en-AU', {day:'numeric',month:'long',year:'numeric'}) : null;
  const schemaLD = JSON.stringify({"@context":"https://schema.org","@type":"CollectionPage","name":`${set.name} Yu-Gi-Oh Card Prices Australia`,"description":`Browse all ${cards.length} ${set.name} Yu-Gi-Oh cards with AUD prices and eBay AU buy links.`,"url":`https://cardsoncardsoncards.com.au/cards/yugioh/sets/${setCode}`});

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${set.name} Card Prices Australia | Yu-Gi-Oh | Cards on Cards on Cards</title>
<meta name="description" content="Browse all ${cards.length} ${set.name} Yu-Gi-Oh cards with live AUD pricing. Filter by attribute and rarity. eBay AU buy links. Updated daily.">
<link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/yugioh/sets/${setCode}">
<meta property="og:image" content="https://cardsoncardsoncards.com.au/c3-og-banner.png">
<link rel="icon" href="/favicon.ico">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<script type="application/ld+json">${schemaLD}</script>
<style>
:root{--bg:#080a0f;--bg2:#0e1118;--bg3:#141720;--border:#1e2235;--text:#F0F2FF;--text2:#7a8099;--accent:#c8a332}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1200px;margin:0 auto;padding:0 24px 80px}
.card-item{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center;display:block;transition:border-color .2s;position:relative;text-decoration:none}
.card-item:hover{border-color:var(--accent)}
.card-item.hidden{display:none}
.filt-btn{padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:none;color:var(--text2);font-size:11px;font-weight:600;cursor:pointer;transition:all .18s;font-family:'DM Sans',sans-serif}
.filt-btn:hover,.filt-btn.active{border-color:var(--accent);color:var(--accent);background:rgba(200,163,50,.1)}
</style>
</head>
<body>
${NAV}
<div class="wrap" style="padding-top:32px">
  <div style="font-size:12px;color:var(--text2);margin-bottom:16px">
    <a href="/" style="color:var(--text2)">Home</a> ›
    <a href="/cards" style="color:var(--text2)">Card Vault</a> ›
    <a href="/cards/yugioh" style="color:var(--text2)">Yu-Gi-Oh TCG</a> ›
    <span style="color:var(--accent)">${set.name}</span>
  </div>
  <h1 style="font-family:'Cinzel',serif;font-size:clamp(22px,4vw,36px);margin-bottom:6px">${set.name} <span style="color:var(--accent)">Card Prices</span></h1>
  <p style="color:var(--text2);margin-bottom:20px;font-size:14px">${cards.length} cards${set.set_code ? ` · ${set.set_code}` : ''}${releaseDate ? ` · Released ${releaseDate}` : ''} · AUD prices updated daily</p>
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:28px">
    <a href="${ebaySearchURL}" target="_blank" rel="noopener" style="background:rgba(200,163,50,.12);border:1px solid rgba(200,163,50,.3);color:#c8a332;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">🛒 Buy Singles on eBay AU ↗</a>
    <a href="${ebayBoxURL}" target="_blank" rel="noopener" style="background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.3);color:#60A5FA;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">📦 Buy Booster Box ↗</a>
    <a href="/blog/yugioh-booster-boxes-australia/" style="background:var(--bg2);border:1px solid var(--border);color:var(--text2);padding:9px 16px;border-radius:8px;font-size:13px;text-decoration:none">📖 Is it Worth Opening?</a>
  </div>
  <div style="background:linear-gradient(135deg,rgba(201,168,76,.05),rgba(201,168,76,.02));border:1px solid rgba(201,168,76,.18);border-radius:12px;padding:20px 24px;margin-bottom:28px;position:relative;overflow:hidden">
    <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,rgba(201,168,76,.5),transparent)"></div>
    <div style="font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#C9A84C;margin-bottom:10px">&#128230; Sealed Product</div>
    <div style="font-family:'Cinzel',serif;font-size:15px;font-weight:700;color:#F0F2FF;margin-bottom:8px">Singles vs Sealed: Know Before You Buy</div>
    <p style="font-size:13px;color:#7a8099;line-height:1.6;margin-bottom:14px">Buying singles is cheaper if you want specific cards. Sealed boxes are for the opening experience and the chance at chase pulls. Run the EV before you open any box.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <a href="${ebayBoxURL}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;background:rgba(201,168,76,.1);border:1px solid rgba(201,168,76,.3);color:#C9A84C;font-size:12px;font-weight:700;text-decoration:none">Find Sealed on eBay AU &#8599;</a>
      <a href="/ev-calculator.html" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;background:rgba(251,146,60,.08);border:1px solid rgba(251,146,60,.25);color:#FB923C;font-size:12px;font-weight:700;text-decoration:none">Run the EV Calculator &#8594;</a>
      <a href="/compare" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.25);color:#A78BFA;font-size:12px;font-weight:700;text-decoration:none">Compare Card Prices &#8594;</a>
    </div>
  </div>
  <div style="background:rgba(200,163,50,.04);border:1px solid rgba(200,163,50,.15);border-radius:10px;padding:16px 20px;margin-bottom:24px;font-size:13px;color:var(--text2);line-height:1.6">${contextText}</div>
  ${top5.length ? `<div style="margin-bottom:32px"><p style="font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--text2);margin-bottom:14px">Top Cards by Value</p><div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px">${top5HTML}</div></div>` : ''}
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:18px 20px;margin-bottom:24px">
    ${attrFilterHTML}
    ${rarityFilterHTML}
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#7a8099;min-width:90px">Sort</span>
      <select id="sort-sel" onchange="applyFilters()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:5px 10px;border-radius:6px;font-size:11px;font-family:'DM Sans',sans-serif;cursor:pointer">
        <option value="price-desc">Price: High to Low</option>
        <option value="price-asc">Price: Low to High</option>
        <option value="name-asc">Name: A to Z</option>
      </select>
      <select id="price-sel" onchange="applyFilters()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:5px 10px;border-radius:6px;font-size:11px;font-family:'DM Sans',sans-serif;cursor:pointer">
        <option value="0">Any Price</option><option value="1">AU$1+</option><option value="5">AU$5+</option><option value="20">AU$20+</option><option value="50">AU$50+</option>
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
      <summary style="cursor:pointer;font-size:14px;font-weight:600">How many cards in ${set.name}?</summary>
      <p style="font-size:13px;color:var(--text2);margin-top:8px">${set.name} contains ${cards.length} Yu-Gi-Oh cards in the C3 database.</p>
    </details>
    <details style="margin-top:12px;padding-bottom:4px">
      <summary style="cursor:pointer;font-size:14px;font-weight:600">What is the most valuable ${set.name} card?</summary>
      <p style="font-size:13px;color:var(--text2);margin-top:8px">${pricedCards.length ? `The most valuable card is <strong style="color:var(--text)">${pricedCards[0].name}</strong> at ~AU$${toAud(pricedCards[0]).toFixed(2)}.` : 'Check eBay AU for current prices.'}</p>
    </details>
  </div>
</div>
<footer style="border-top:1px solid var(--border);padding:24px;text-align:center;color:var(--text2);font-size:12px;margin-top:20px">
  <p><a href="/" style="color:var(--text2);margin:0 8px">Home</a><a href="/cards" style="color:var(--text2);margin:0 8px">Card Vault</a><a href="/cards/yugioh" style="color:var(--text2);margin:0 8px">Yu-Gi-Oh</a><a href="/blog" style="color:var(--text2);margin:0 8px">Blog</a></p>
  <p style="margin-top:8px">© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
  <p style="margin-top:6px;font-size:11px">Yu-Gi-Oh and all related characters © Kazuki Takahashi / Shueisha. Published by Konami. C3 is not affiliated with Konami.</p>
</footer>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
<script>
let activeAttr='all',activeRarity='all',minPrice=0;
function setFilter(dim,val,btn){
  document.querySelectorAll('[data-'+dim+'-filter]').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  if(dim==='attr') activeAttr=val;
  if(dim==='rarity') activeRarity=val;
  applyFilters();
}
function applyFilters(){
  const sortMode=document.getElementById('sort-sel').value;
  minPrice=parseFloat(document.getElementById('price-sel').value)||0;
  const grid=document.getElementById('card-grid');
  const items=[...grid.querySelectorAll('.card-item')];
  let visible=0;
  items.forEach(el=>{
    const match=(activeAttr==='all'||el.dataset.attr===activeAttr)&&(activeRarity==='all'||el.dataset.rarity===activeRarity)&&(parseFloat(el.dataset.price)||0)>=minPrice;
    el.classList.toggle('hidden',!match);
    if(match) visible++;
  });
  document.getElementById('filter-count').textContent=visible+' cards';
  const vis=items.filter(el=>!el.classList.contains('hidden'));
  vis.sort((a,b)=>{
    if(sortMode==='price-desc') return (parseFloat(b.dataset.price)||0)-(parseFloat(a.dataset.price)||0);
    if(sortMode==='price-asc') return (parseFloat(a.dataset.price)||0)-(parseFloat(b.dataset.price)||0);
    return 0;
  });
  vis.forEach(el=>grid.appendChild(el));
}
function clearFilters(){activeAttr='all';activeRarity='all';minPrice=0;document.querySelectorAll('.filt-btn').forEach(b=>b.classList.remove('active'));document.querySelectorAll('[data-attr-filter="all"],[data-rarity-filter="all"]').forEach(b=>b.classList.add('active'));document.getElementById('sort-sel').value='price-desc';document.getElementById('price-sel').value='0';applyFilters();}
applyFilters();
</script>
</body>
</html>`;
  return new Response(html, { status: 200, headers });
  } catch(err) {
    console.error('[yugioh-set-page] Error:', err.message);
    return new Response('<html><body style="background:#0A0C14;color:#F0F2FF;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh"><div style="text-align:center"><h1 style="color:#c8a332">Temporarily Unavailable</h1><p>Please try again in a moment.</p><a href="/cards/yugioh" style="color:#c8a332">Browse Yu-Gi-Oh Cards</a></div></body></html>', { status: 503, headers: {'Content-Type':'text/html'} });
  }
};
export const config = { path: '/cards/yugioh/sets/:setCode+' };
