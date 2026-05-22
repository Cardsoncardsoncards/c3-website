// netlify/functions/lorcana-set-page.mjs
// Serves /cards/lorcana/sets/:setCode

const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EBAY_CLIENT_ID = Netlify.env.get('EBAY_CLIENT_ID');
const EBAY_CLIENT_SECRET = Netlify.env.get('EBAY_CLIENT_SECRET');
const EPN_CAMPID = '5339146789';

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
    return await res.json();
  } catch { clearTimeout(timer); return []; }
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

const INK_COLOURS = {
  'Amber':    { bg:'#F59E0B', text:'#000' },
  'Amethyst': { bg:'#8B5CF6', text:'#fff' },
  'Emerald':  { bg:'#10B981', text:'#fff' },
  'Ruby':     { bg:'#EF4444', text:'#fff' },
  'Sapphire': { bg:'#3B82F6', text:'#fff' },
  'Steel':    { bg:'#6B7280', text:'#fff' },
};

const NAV = `<nav style="background:rgba(8,10,15,.97);border-bottom:1px solid #1e2235;padding:10px 0;position:sticky;top:0;z-index:100;backdrop-filter:blur(16px)">
  <div style="max-width:1200px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
    <a href="/" style="display:flex;align-items:center;gap:8px;text-decoration:none;font-family:'Cinzel',serif;font-size:12px;font-weight:700;letter-spacing:.1em;color:#C9A84C;text-transform:uppercase">
      <img src="/c3-logo.png" alt="C3" style="height:28px;width:28px;border-radius:5px;object-fit:cover;flex-shrink:0">
      <span>Cards on Cards on Cards</span>
    </a>
    <div style="flex:1;min-width:0;max-width:480px;display:flex;align-items:center"><input type="text" id="nav-q" placeholder="Search cards..." autocomplete="off" onkeydown="if(event.key==='Enter'){var v=this.value.trim();if(v)window.location='/search?q='+encodeURIComponent(v);}" style="width:100%;background:rgba(255,255,255,.06);border:1px solid #1e2235;border-radius:7px 0 0 7px;padding:6px 12px;font-size:12px;color:#e8eaf0;font-family:sans-serif;outline:none"><button onclick="var v=document.getElementById('nav-q').value.trim();if(v)window.location='/search?q='+encodeURIComponent(v);" style="background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.35);border-left:none;border-radius:0 7px 7px 0;padding:6px 10px;color:#C9A84C;cursor:pointer;font-size:13px;flex-shrink:0">&#128269;</button></div>
    <div style="display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none">
      <a href="/" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(160,196,255,.35);color:#A0C4FF;white-space:nowrap">← Home</a>
      <a href="/cards" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(201,168,76,.35);color:#C9A84C;white-space:nowrap">Card Vault</a>
      <a href="/cards/lorcana" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(1,137,196,.35);color:#0189C4;background:rgba(1,137,196,.08);white-space:nowrap">Lorcana</a>
      <a href="/cards/pokemon" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid #1e2235;color:#A0A8C0;white-space:nowrap">Pokemon</a>
      <a href="/calendar" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(248,113,113,.35);color:#F87171;white-space:nowrap">Calendar</a>
      <a href="/generators" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(34,211,238,.35);color:#22D3EE;white-space:nowrap">Generators</a>
      <a href="/shop.html" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(201,168,76,.35);color:#C9A84C;white-space:nowrap">Shop</a>
      <a href="/tracker.html" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(192,132,252,.35);color:#C084FC;white-space:nowrap">Tracker</a>
    </div>
  </div>
</nav>`;

export default async (req) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=900, s-maxage=1800' };
  const url = new URL(req.url);
  const setCode = url.pathname.replace(/^\/cards\/lorcana\/sets\//, '').replace(/\/$/, '').toLowerCase();
  if (!setCode) return new Response(`<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Set Not Found | Lorcana | Cards on Cards on Cards</title>
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;600&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0A0C14;color:#F0F2FF;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}
    .wrap{max-width:420px}
    .icon{font-size:48px;margin-bottom:16px}
    h1{font-family:'Cinzel',serif;color:#3B82F6;font-size:22px;margin-bottom:10px}
    p{color:#8892b0;font-size:14px;margin-bottom:24px;line-height:1.6}
    .btn{display:inline-block;background:#3B82F6;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;margin:4px}
    .btn-sec{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:#F0F2FF}
  </style>
</head>
<body>
<div class="wrap">
  <div class="icon">🃏</div>
  <h1>Set Not Found</h1>
  <p>This Lorcana set page isn't available yet. Browse all Lorcana cards or return home.</p>
  <a href="/cards/lorcana" class="btn">Browse All Lorcana Cards</a>
  <a href="/" class="btn btn-sec">← Home</a>
</div>
</body>
</html>`, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

  let sets, ebayToken, cards;
  try {
    [sets, ebayToken] = await Promise.all([
      // Slug first (most common URL), then numeric id, then abbreviation fallback
      supabaseGet(`lorcana_sets?slug=eq.${encodeURIComponent(setCode)}&limit=1`).then(r =>
        r.length ? r : supabaseGet(`lorcana_sets?id=eq.${encodeURIComponent(setCode)}&limit=1`)
      ).then(r =>
        r.length ? r : supabaseGet(`lorcana_sets?abbreviation=ilike.${encodeURIComponent(setCode)}&limit=1`)
      ),
      getEbayToken()
    ]);
  } catch (e) {
    console.error('[lorcana-set-page] fetch error:', e.message);
    sets = []; ebayToken = null;
  }

  let set = sets && sets[0];
  try {
    cards = set ? await supabaseGet(`lorcana_cards?set_id=eq.${encodeURIComponent(set.id)}&order=market_price.desc.nullslast&limit=60&select=slug,name,image_url,market_price,price_aud,rarity,ink`) : [];
  } catch (e) {
    console.error('[lorcana-set-page] cards fetch error:', e.message);
    cards = [];
  }

  if (!set) return new Response(`<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Set Not Found | Lorcana | Cards on Cards on Cards</title>
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;600&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0A0C14;color:#F0F2FF;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}
    .wrap{max-width:420px}
    .icon{font-size:48px;margin-bottom:16px}
    h1{font-family:'Cinzel',serif;color:#3B82F6;font-size:22px;margin-bottom:10px}
    p{color:#8892b0;font-size:14px;margin-bottom:24px;line-height:1.6}
    .btn{display:inline-block;background:#3B82F6;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;margin:4px}
    .btn-sec{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:#F0F2FF}
  </style>
</head>
<body>
<div class="wrap">
  <div class="icon">🃏</div>
  <h1>Set Not Found</h1>
  <p>This Lorcana set page isn't available yet. Browse all Lorcana cards or return home.</p>
  <a href="/cards/lorcana" class="btn">Browse All Lorcana Cards</a>
  <a href="/" class="btn btn-sec">← Home</a>
</div>
</body>
</html>`, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

  const ebaySearchURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name+' lorcana')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
  const ebayBoxURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name+' lorcana booster box')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
  const ebayListings = await getEbayListings(`${set.name} lorcana card`, ebayToken);

  const toAud = (c) => c.market_price && c.market_price > 0 ? parseFloat(c.market_price) * 1.58 : 0;
  const pricedCards = cards.filter(c => toAud(c) > 0);
  const top5 = pricedCards.slice(0, 5);
  const rarities = [...new Set(cards.map(c => c.rarity).filter(Boolean))].sort();
  const inks = [...new Set(cards.map(c => c.ink).filter(Boolean))].sort();

  const topTwo = pricedCards.slice(0, 2);
  const contextText = topTwo.length >= 2
    ? `${set.name} contains ${cards.length} Lorcana cards. The most valuable are <strong>${topTwo[0].version ? topTwo[0].name+' - '+topTwo[0].version : topTwo[0].name}</strong> at ~AU$${toAud(topTwo[0]).toFixed(0)} and <strong>${topTwo[1].version ? topTwo[1].name+' - '+topTwo[1].version : topTwo[1].name}</strong> at ~AU$${toAud(topTwo[1]).toFixed(0)}. Prices updated daily.`
    : `${set.name} contains ${cards.length} Lorcana cards. Prices are converted from USD to AUD daily.`;

  const top5HTML = top5.map(c => {
    const aud = toAud(c);
    const fullName = c.version ? `${c.name} - ${c.version}` : c.name;
    const ink = INK_COLOURS[c.ink] || { bg:'#888', text:'#fff' };
    return `<a href="/cards/lorcana/${c.slug}" style="flex:0 0 150px;background:#0e1118;border:1px solid rgba(1,137,196,.25);border-radius:10px;padding:10px;text-align:center;text-decoration:none;position:relative;transition:all .2s;display:block" onmouseover="this.style.borderColor='#0189C4';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='rgba(1,137,196,.25)';this.style.transform='none'">
      <div style="position:absolute;top:6px;left:6px;background:${ink.bg};color:${ink.text};font-size:8px;font-weight:700;padding:2px 6px;border-radius:4px;text-transform:uppercase">${c.ink||''}</div>
      ${c.image_url ? `<img src="${c.image_url}" alt="${fullName}" style="width:100%;border-radius:6px;display:block" loading="lazy">` : `<div style="height:120px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#7a8099">${fullName}</div>`}
      <div style="font-size:10px;color:#F0F2FF;margin-top:6px;line-height:1.3;font-weight:600">${fullName}</div>
      <div style="font-family:'Cinzel',serif;font-size:14px;color:#0189C4;font-weight:700;margin-top:3px">~AU$${aud.toFixed(0)}</div>
    </a>`;
  }).join('');

  const cardGrid = cards.map(c => {
    const aud = toAud(c);
    const priceDisplay = aud >= 0.50 ? `~AU$${aud.toFixed(0)}` : `<span style="color:rgba(160,168,192,.35);font-size:9px">no price</span>`;
    const fullName = c.version ? `${c.name} - ${c.version}` : c.name;
    const ink = INK_COLOURS[c.ink] || { bg:'#888' };
    return `<a href="/cards/lorcana/${c.slug}" class="card-item" data-rarity="${(c.rarity||'').toLowerCase()}" data-ink="${(c.ink||'').toLowerCase()}" data-price="${aud.toFixed(2)}">
      <div style="position:absolute;top:5px;right:5px;width:7px;height:7px;border-radius:50%;background:${ink.bg}"></div>
      ${c.image_url ? `<img src="${c.image_url}" alt="${fullName}" style="width:100%;border-radius:5px;display:block;margin-top:2px" loading="lazy">` : `<div style="height:70px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#7a8099">${fullName}</div>`}
      <div style="font-size:10px;margin-top:4px;color:#F0F2FF;line-height:1.2">${fullName}</div>
      <div style="font-size:11px;color:#0189C4;font-weight:700;margin-top:2px">${priceDisplay}</div>
    </a>`;
  }).join('');

  const ebayCarouselHTML = ebayListings.length ? `
    <div style="margin-top:40px;padding:28px;background:rgba(1,137,196,.04);border:1px solid rgba(1,137,196,.15);border-radius:14px">
      <p style="font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#0189C4;margin-bottom:6px">Live eBay AU Listings</p>
      <h2 style="font-family:'Cinzel',serif;font-size:18px;color:#F0F2FF;margin-bottom:16px">${set.name} on eBay Australia</h2>
      <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:12px">
        ${ebayListings.map(item => {
          const price = item.price?.value ? `AU$${parseFloat(item.price.value).toFixed(2)}` : '';
          const epnUrl = `https://www.ebay.com.au/itm/${item.itemId}?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
          return `<a href="${epnUrl}" target="_blank" rel="noopener sponsored" style="flex:0 0 160px;background:#161929;border:1px solid #252840;border-radius:12px;overflow:hidden;text-decoration:none;display:flex;flex-direction:column;transition:all .22s" onmouseover="this.style.borderColor='rgba(1,137,196,.4)'" onmouseout="this.style.borderColor='#252840'">
            ${item.image?.imageUrl ? `<img src="${item.image.imageUrl}" alt="${(item.title||'').slice(0,40)}" style="width:100%;height:120px;object-fit:contain;background:#0d0f1a;padding:8px" loading="lazy">` : `<div style="height:120px;background:#0d0f1a;display:flex;align-items:center;justify-content:center;font-size:24px">🏰</div>`}
            <div style="padding:9px 11px;flex:1;display:flex;flex-direction:column;gap:4px">
              <div style="font-size:11px;color:#F0F2FF;line-height:1.35;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;flex:1">${item.title||''}</div>
              <div style="font-family:'Cinzel',serif;font-size:13px;font-weight:700;color:#0189C4;margin-top:4px">${price}</div>
              <div style="font-size:10px;color:rgba(160,168,192,.5)">View on eBay ↗</div>
            </div>
          </a>`;
        }).join('')}
      </div>
      <div style="text-align:right;margin-top:8px">
        <a href="${ebaySearchURL}" target="_blank" rel="noopener" style="font-size:12px;color:#0189C4;text-decoration:none;opacity:.7">View all ${set.name} listings on eBay ↗</a>
      </div>
    </div>` : `<div style="margin-top:32px;text-align:center;padding:20px;background:#0e1118;border:1px solid #1e2235;border-radius:12px">
      <a href="${ebaySearchURL}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:rgba(1,137,196,.12);border:1px solid rgba(1,137,196,.3);color:#0189C4;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">Shop ${set.name} on eBay AU ↗</a>
    </div>`;

  const inkFilterHTML = inks.length ? `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <span style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#7a8099;min-width:90px">Ink</span>
      <button class="filt-btn active" data-ink-filter="all" onclick="setFilter('ink','all',this)">All</button>
      ${inks.map(ink => { const ic = INK_COLOURS[ink] || {bg:'#888'}; return `<button class="filt-btn" data-ink-filter="${ink.toLowerCase()}" onclick="setFilter('ink','${ink.toLowerCase()}',this)" style="border-color:${ic.bg}40;color:${ic.bg}">${ink}</button>`; }).join('')}
    </div>` : '';

  const rarityFilterHTML = rarities.length ? `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <span style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#7a8099;min-width:90px">Rarity</span>
      <button class="filt-btn active" data-rarity-filter="all" onclick="setFilter('rarity','all',this)">All</button>
      ${rarities.map(r => { const rs = r.toLowerCase().replace(/[^a-z0-9 ]/g,''); return `<button class="filt-btn" data-rarity-filter="${rs}" onclick="setFilter('rarity','${rs}',this)">${r}</button>`; }).join('')}
    </div>` : '';

  const releaseDate = set.released_at ? new Date(set.released_at).toLocaleDateString('en-AU', {day:'numeric',month:'long',year:'numeric'}) : null;

  const schemaLD = JSON.stringify({
    "@context":"https://schema.org","@type":"CollectionPage",
    "name":`${set.name} Lorcana Card Prices Australia`,
    "description":`Browse all ${cards.length} ${set.name} Disney Lorcana cards with AUD prices and eBay AU buy links.`,
    "url":`https://cardsoncardsoncards.com.au/cards/lorcana/sets/${setCode}`
  });

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${set.name} Card Prices Australia | Disney Lorcana | Cards on Cards on Cards</title>
<meta name="description" content="Browse all ${cards.length} ${set.name} Disney Lorcana cards with live AUD pricing. Filter by ink colour and rarity. eBay AU buy links. Updated daily.">
<link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/lorcana/sets/${setCode}">
<meta property="og:image" content="https://cardsoncardsoncards.com.au/c3-og-banner.png">
<link rel="icon" href="/c3logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<script type="application/ld+json">${schemaLD}</script>
<style>
:root{--bg:#080a0f;--bg2:#0e1118;--bg3:#141720;--border:#1e2235;--text:#F0F2FF;--text2:#7a8099;--accent:#0189C4}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1200px;margin:0 auto;padding:0 24px 80px}
.card-item{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center;display:block;transition:border-color .2s;position:relative;text-decoration:none}
.card-item:hover{border-color:var(--accent)}
.card-item.hidden{display:none}
.filt-btn{padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:none;color:var(--text2);font-size:11px;font-weight:600;cursor:pointer;transition:all .18s;font-family:'DM Sans',sans-serif}
.filt-btn:hover,.filt-btn.active{border-color:var(--accent);color:var(--accent);background:rgba(1,137,196,.1)}
</style>
</head>
<body>
${NAV}
<div class="wrap" style="padding-top:32px">
  <div style="font-size:12px;color:var(--text2);margin-bottom:16px">
    <a href="/" style="color:var(--text2)">Home</a> ›
    <a href="/cards" style="color:var(--text2)">Card Vault</a> ›
    <a href="/cards/lorcana" style="color:var(--text2)">Disney Lorcana</a> ›
    <span style="color:var(--accent)">${set.name}</span>
  </div>
  <h1 style="font-family:'Cinzel',serif;font-size:clamp(22px,4vw,36px);margin-bottom:6px">${set.name} <span style="color:var(--accent)">Card Prices</span></h1>
  <p style="color:var(--text2);margin-bottom:20px;font-size:14px">${cards.length} cards${releaseDate ? ` · Released ${releaseDate}` : ''} · AUD prices updated daily</p>
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:28px">
    <a href="${ebaySearchURL}" target="_blank" rel="noopener" style="background:rgba(1,137,196,.12);border:1px solid rgba(1,137,196,.3);color:#0189C4;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">🛒 Buy Singles on eBay AU ↗</a>
    <a href="${ebayBoxURL}" target="_blank" rel="noopener" style="background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.3);color:#60A5FA;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">📦 Buy Booster Box ↗</a>
    <a href="/blog/best-lorcana-booster-boxes-australia/" style="background:var(--bg2);border:1px solid var(--border);color:var(--text2);padding:9px 16px;border-radius:8px;font-size:13px;text-decoration:none">📖 Is it Worth Opening?</a>
  </div>
  <div style="background:rgba(1,137,196,.04);border:1px solid rgba(1,137,196,.15);border-radius:10px;padding:16px 20px;margin-bottom:24px;font-size:13px;color:var(--text2);line-height:1.6">${contextText}</div>
  ${top5.length ? `<div style="margin-bottom:32px"><p style="font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--text2);margin-bottom:14px">Top Cards by Value</p><div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px">${top5HTML}</div></div>` : ''}
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:18px 20px;margin-bottom:24px">
    ${inkFilterHTML}
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
  ${(() => {
    const SEALED_KEYS = ['booster box','booster pack','display','starter deck','starter set','trial deck','trial set','box set','collection box','premium set'];
    const sealedItems = (cards||[]).filter(c => { const n = (c.name||'').toLowerCase(); return SEALED_KEYS.some(k => n.includes(k)) && c.market_price > 0; });
    if (!sealedItems.length) return '';
    const itemsHTML = sealedItems.slice(0,4).map(p => {
      const price = p.price_aud > 0 ? `AU$${parseFloat(p.price_aud).toFixed(2)}` : `~AU$${(p.market_price*1.58).toFixed(2)}`;
      const low = p.low_price ? `Low: ~AU$${(p.low_price*1.58).toFixed(2)}` : '';
      const nm = (p.name||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return `<a href="/cards/lorcana/${p.slug}" style="background:#0e1118;border:1px solid #1e2235;border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px;text-decoration:none;transition:border-color .2s" onmouseover="this.style.borderColor='#38BDF8'" onmouseout="this.style.borderColor='#1e2235'">
        ${p.image_url ? `<img src="${p.image_url.replace(/"/g,'&quot;')}" alt="${nm.replace(/"/g,'&quot;')}" style="width:100%;max-height:120px;object-fit:contain;border-radius:6px" loading="lazy">` : ''}
        <div style="font-size:12px;font-weight:700;color:#e8eaf0;line-height:1.3">${nm}</div>
        <div style="font-size:15px;font-weight:900;color:#38BDF8;font-family:'Cinzel',serif">${price}</div>
        ${low ? `<div style="font-size:11px;color:#8892b0">${low}</div>` : ''}
      </a>`;
    }).join('');
    const setNm = (set.name||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<div style="background:#38BDF80a;border:1px solid #38BDF826;border-radius:14px;padding:22px 24px;margin-bottom:32px">
      <div style="font-size:9px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#38BDF8;margin-bottom:8px">Sealed Product</div>
      <h2 style="font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:#F0F2FF;margin-bottom:16px">Buy Sealed ${setNm} Product</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:16px">${itemsHTML}</div>
      <a href="https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent((set.name||'')+' lorcana booster')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:7px;padding:9px 18px;border-radius:8px;font-weight:700;font-size:12px;text-decoration:none;background:#38BDF8;color:#000">&#128722; More sealed on eBay AU &#8599;</a>
    </div>`;
  })()}
  <div id="card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:36px">${cardGrid}</div>
  ${ebayCarouselHTML}
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:24px;margin-top:36px">
    <h2 style="font-family:'Cinzel',serif;font-size:16px;margin-bottom:8px">Frequently Asked Questions</h2>
    <details style="margin-top:12px;border-bottom:1px solid var(--border);padding-bottom:12px">
      <summary style="cursor:pointer;font-size:14px;font-weight:600">How many cards in ${set.name}?</summary>
      <p style="font-size:13px;color:var(--text2);margin-top:8px">${set.name} contains ${cards.length} Lorcana cards.</p>
    </details>
    <details style="margin-top:12px;padding-bottom:4px">
      <summary style="cursor:pointer;font-size:14px;font-weight:600">What is the most valuable ${set.name} card?</summary>
      <p style="font-size:13px;color:var(--text2);margin-top:8px">${pricedCards.length ? `The most valuable card is <strong style="color:var(--text)">${pricedCards[0].version ? pricedCards[0].name+' - '+pricedCards[0].version : pricedCards[0].name}</strong> at ~AU$${toAud(pricedCards[0]).toFixed(2)}.` : 'Check eBay AU for current prices.'}</p>
    </details>
  </div>
</div>
<footer style="border-top:1px solid var(--border);padding:24px;text-align:center;color:var(--text2);font-size:12px;margin-top:20px">
  <p><a href="/" style="color:var(--text2);margin:0 8px">Home</a><a href="/cards" style="color:var(--text2);margin:0 8px">Card Vault</a><a href="/cards/lorcana" style="color:var(--text2);margin:0 8px">Lorcana</a><a href="/blog" style="color:var(--text2);margin:0 8px">Blog</a></p>
  <p style="margin-top:8px">© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
  <p style="margin-top:6px;font-size:11px">Disney Lorcana and all related characters are © Disney. Published by Ravensburger. C3 is not affiliated with Disney or Ravensburger.</p>
</footer>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
<script>
let activeInk='all',activeRarity='all',minPrice=0;
function setFilter(dim,val,btn){
  document.querySelectorAll('[data-'+dim+'-filter]').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  if(dim==='ink') activeInk=val;
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
    const match=(activeInk==='all'||el.dataset.ink===activeInk)&&(activeRarity==='all'||el.dataset.rarity===activeRarity)&&(parseFloat(el.dataset.price)||0)>=minPrice;
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
function clearFilters(){activeInk='all';activeRarity='all';minPrice=0;document.querySelectorAll('.filt-btn').forEach(b=>b.classList.remove('active'));document.querySelectorAll('[data-ink-filter="all"],[data-rarity-filter="all"]').forEach(b=>b.classList.add('active'));document.getElementById('sort-sel').value='price-desc';document.getElementById('price-sel').value='0';applyFilters();}
applyFilters();
</script>
<!-- REPORT BUG WIDGET -->
<style>.bug-float{position:fixed;bottom:20px;right:20px;z-index:9999}.bug-btn{display:flex;align-items:center;gap:6px;background:rgba(15,17,25,.95);border:1px solid rgba(201,168,76,.3);color:#C9A84C;padding:8px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;font-family:sans-serif;backdrop-filter:blur(12px);transition:all .2s;text-decoration:none;letter-spacing:.03em;box-shadow:0 4px 16px rgba(0,0,0,.4)}.bug-btn:hover{border-color:#C9A84C;background:rgba(201,168,76,.12);color:#E8C86A;text-decoration:none;transform:translateY(-2px)}.bug-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10000;align-items:center;justify-content:center;backdrop-filter:blur(4px)}.bug-modal.open{display:flex}.bug-box{background:#111420;border:1px solid #252840;border-radius:14px;padding:28px;width:100%;max-width:420px;margin:0 16px;position:relative}.bug-box h3{font-family:'Cinzel',serif;font-size:17px;font-weight:700;color:#F0F2FF;margin-bottom:4px}.bug-box p{font-size:12px;color:#9ba3c4;margin-bottom:18px}.bug-close{position:absolute;top:12px;right:14px;background:none;border:none;color:#9ba3c4;font-size:18px;cursor:pointer;line-height:1;padding:4px}.bug-form select,.bug-form textarea{width:100%;background:rgba(255,255,255,.05);border:1px solid #252840;border-radius:8px;color:#F0F2FF;font-family:'DM Sans',sans-serif;font-size:13px;padding:9px 12px;margin-bottom:12px;outline:none;transition:border-color .2s}.bug-form select:focus,.bug-form textarea:focus{border-color:rgba(201,168,76,.5)}.bug-form textarea{resize:vertical;min-height:80px;max-height:160px}.bug-form select option{background:#e8eaf0;color:#111420}.bug-form select{background:#e8eaf0;color:#111420}.bug-hidden{display:none}.bug-submit{width:100%;padding:10px;background:#C9A84C;color:#0A0C14;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:opacity .2s}.bug-submit:hover{opacity:.85}.bug-submit:disabled{opacity:.5;cursor:not-allowed}.bug-thanks{display:none;text-align:center;padding:12px 0}.bug-thanks p{color:#4ADE80;font-size:14px;font-weight:600}</style>
<div class="bug-float"><a class="bug-btn" onclick="document.getElementById('bugModal').classList.add('open');return false" href="#">&#x1F41B; Report a Bug</a></div>
<div class="bug-modal" id="bugModal" onclick="if(event.target===this)this.classList.remove('open')">
  <div class="bug-box">
    <button class="bug-close" onclick="document.getElementById('bugModal').classList.remove('open')">&#x2715;</button>
    <h3>&#x1F41B; Report a Bug</h3><p>Spotted something wrong? Takes 20 seconds.</p>
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
<script>(function(){var urlInput=document.getElementById('bugPageUrl');if(urlInput)urlInput.value=window.location.href;var form=document.getElementById('bugReportForm');if(!form)return;form.addEventListener('submit',function(e){e.preventDefault();var btn=document.getElementById('bugSubmit');btn.disabled=true;btn.textContent='Sending...';var data=new FormData(form);fetch('/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data).toString()}).then(function(){document.getElementById('bugThanks').style.display='block';form.querySelector('select').style.display='none';form.querySelector('textarea').style.display='none';btn.style.display='none';setTimeout(function(){document.getElementById('bugModal').classList.remove('open');},2000);}).catch(function(){btn.disabled=false;btn.textContent='Submit Report';});});})()</script>
</body>
</html>`;
  return new Response(html, { status: 200, headers });
};
export const config = { path: '/cards/lorcana/sets/:setCode+' };
