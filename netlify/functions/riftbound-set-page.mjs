// netlify/functions/riftbound-set-page.mjs
// Serves /cards/riftbound/sets/:setCode
// Correct columns: market_price, image_url, price_aud, set_id

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EBAY_CLIENT_ID    = Netlify.env.get('EBAY_CLIENT_ID');
const EBAY_CLIENT_SECRET= Netlify.env.get('EBAY_CLIENT_SECRET');
const EPN_CAMPID        = '5339146789';

async function supabaseGet(path) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
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
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&category_ids=183454&filter=buyingOptions%3A%7BFIXED_PRICE%7D&sort=-price&limit=8`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_AU' } });
    if (!res.ok) return [];
    const d = await res.json();
    return d.itemSummaries || [];
  } catch { return []; }
}

const NAV = `<nav style="background:rgba(10,12,20,.97);backdrop-filter:blur(18px);border-bottom:1px solid #252840;padding:12px 0;position:sticky;top:0;z-index:100">
  <div style="max-width:1100px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:12px">
    <a href="/" style="display:flex;align-items:center;gap:9px;font-family:'Cinzel',serif;font-size:11.5px;font-weight:700;letter-spacing:.12em;color:#C9A84C;text-decoration:none;text-transform:uppercase;white-space:nowrap;flex-shrink:0">
      <img src="/c3logo.png" alt="C3" style="height:32px;width:32px;border-radius:6px;object-fit:cover;flex-shrink:0">
      <span>Cards on Cards on Cards</span>
    </a>
    <div style="display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none">
      <a href="/" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(160,196,255,.35);color:#A0C4FF;white-space:nowrap">Home</a>
      <a href="/cards/riftbound" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(201,168,76,.4);color:#E8C97A;background:rgba(201,168,76,.08);white-space:nowrap">Riftbound</a>
      <a href="/shop.html" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(201,168,76,.35);color:#C9A84C;white-space:nowrap">Shop</a>
      <a href="/ev-calculator.html" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(96,165,250,.35);color:#60A5FA;white-space:nowrap">EV Calc</a>
      <a href="/tracker.html" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(192,132,252,.35);color:#C084FC;white-space:nowrap">Tracker</a>
      <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=C3Nav&toolid=10001&mkevt=1" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(96,165,250,.35);color:#60A5FA;white-space:nowrap">eBay</a>
      <a href="/contact.html" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(148,163,184,.35);color:#94A3B8;white-space:nowrap">Contact Us</a>
    </div>
  </div>
</nav>`;

export default async (req) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=900, s-maxage=1800' };
  const url = new URL(req.url);
  const setCode = decodeURIComponent(url.pathname.replace(/^\/cards\/onepiece\/sets\//, '').replace(/\/$/, ''));

  if (!setCode) {
    return new Response(`<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><title>Set Not Found | Cards on Cards on Cards</title></head><body style="background:#0A0C14;color:#F0F2FF;font-family:sans-serif;padding:60px 24px;text-align:center">${NAV}<h1 style="font-family:'Cinzel',serif;color:#C9A84C;margin-top:60px">Set Not Found</h1><p style="color:#A0A8C0;margin-top:16px">This Riftbound set doesn't exist or hasn't been synced yet.</p><a href="/cards/riftbound" style="display:inline-block;margin-top:24px;padding:10px 24px;background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.4);color:#E8C97A;border-radius:8px;text-decoration:none">Browse All Sets</a></body></html>`, { status: 404, headers });
  }

  // Try to find set by abbreviation first, then slug, then id
  let sets = await supabaseGet(`riftbound_sets?abbreviation=eq.${encodeURIComponent(setCode)}&limit=1`);
  if (!sets || !sets[0]) sets = await supabaseGet(`riftbound_sets?slug=eq.${encodeURIComponent(setCode)}&limit=1`);
  if (!sets || !sets[0]) sets = await supabaseGet(`riftbound_sets?id=eq.${encodeURIComponent(setCode)}&limit=1`);

  if (!sets || !sets[0]) {
    return new Response(`<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><title>Set Not Found | Cards on Cards on Cards</title><link rel="icon" type="image/png" href="/c3logo.png"></head><body style="background:#0A0C14;color:#F0F2FF;font-family:sans-serif">${NAV}<div style="padding:80px 24px;text-align:center"><h1 style="font-family:'Cinzel',serif;color:#C9A84C;margin-bottom:16px">Set Not Found</h1><p style="color:#A0A8C0;margin-bottom:24px">The set "${setCode}" doesn't exist or hasn't synced yet. Try again after 10am AEST.</p><a href="/cards/riftbound" style="display:inline-block;padding:10px 24px;background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.4);color:#E8C97A;border-radius:8px;text-decoration:none">Browse All Riftbound Sets</a></div></body></html>`, { status: 404, headers });
  }

  const set = sets[0];

  // Fetch cards for this set using set_id
  const [cards, ebayToken] = await Promise.all([
    supabaseGet(`riftbound_cards?set_id=eq.${set.id}&order=market_price.desc.nullslast&select=id,slug,name,number,rarity,image_url,market_price,price_aud,low_price&limit=500`),
    getEbayToken()
  ]);

  const ebaySearchURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name+' riftbound card')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
  const ebayBoxURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name+' Riftbound booster box')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
  const ebayListings = await getEbayListings(`${set.name} riftbound card`, ebayToken);

  const toAud = (c) => parseFloat(c.price_aud) || (c.market_price ? c.market_price * 1.58 : 0);
  const pricedCards = cards.filter(c => toAud(c) >= 0.50);
  const top5 = pricedCards.slice(0, 5);
  const rarities = [...new Set(cards.map(c => c.rarity).filter(Boolean))].sort();

  const releaseDate = set.release_date ? new Date(set.release_date).toLocaleDateString('en-AU', {day:'numeric',month:'long',year:'numeric'}) : null;

  const contextText = pricedCards.length >= 2
    ? `${set.name} contains ${cards.length} Riftbound cards. The most valuable are <strong>${pricedCards[0].name}</strong> at ~AU$${toAud(pricedCards[0]).toFixed(0)} and <strong>${pricedCards[1].name}</strong> at ~AU$${toAud(pricedCards[1]).toFixed(0)}. Prices updated daily.`
    : `${set.name} contains ${cards.length} Riftbound cards. Prices updated daily in AUD.`;

  const top5HTML = top5.map(c => {
    const aud = toAud(c);
    return `<a href="/cards/riftbound/${c.slug}" style="flex:0 0 150px;background:#0e1118;border:1px solid rgba(201,168,76,.25);border-radius:10px;padding:10px;text-align:center;text-decoration:none;display:block;transition:all .2s" onmouseover="this.style.borderColor='#C9A84C';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='rgba(201,168,76,.25)';this.style.transform='none'">
      ${c.image_url ? `<img src="${c.image_url}" alt="${c.name}" style="width:100%;border-radius:6px;display:block" loading="lazy">` : `<div style="height:120px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#7a8099">${c.name}</div>`}
      <div style="font-size:10px;color:#F0F2FF;margin-top:6px;line-height:1.3;font-weight:600">${c.name}</div>
      <div style="font-family:'Cinzel',serif;font-size:14px;color:#C9A84C;font-weight:700;margin-top:3px">~AU$${aud.toFixed(0)}</div>
    </a>`;
  }).join('');

  const cardGrid = cards.map(c => {
    const aud = toAud(c);
    const priceDisplay = aud >= 0.50 ? `~AU$${aud.toFixed(0)}` : `<span style="color:rgba(160,168,192,.35);font-size:9px">no price</span>`;
    return `<a href="/cards/riftbound/${c.slug}" class="card-item" data-rarity="${(c.rarity||'').toLowerCase()}" data-price="${aud.toFixed(2)}">
      ${c.image_url ? `<img src="${c.image_url}" alt="${c.name}" style="width:100%;border-radius:5px;display:block;margin-top:2px" loading="lazy">` : `<div style="height:70px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#7a8099">${c.name}</div>`}
      <div style="font-size:10px;margin-top:4px;color:#F0F2FF;line-height:1.2">${c.name}</div>
      ${c.number ? `<div style="font-size:9px;color:#7a8099">${c.number}</div>` : ''}
      <div style="font-size:11px;color:#C9A84C;font-weight:700;margin-top:2px">${priceDisplay}</div>
    </a>`;
  }).join('');

  const rarityFilterHTML = rarities.length ? `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <span style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#7a8099;min-width:70px">Rarity</span>
      <button class="filt-btn active" data-rarity-filter="all" onclick="setFilter('rarity','all',this)">All</button>
      ${rarities.map(r => `<button class="filt-btn" data-rarity-filter="${r.toLowerCase()}" onclick="setFilter('rarity','${r.toLowerCase()}',this)">${r}</button>`).join('')}
    </div>` : '';

  const ebayCarouselHTML = ebayListings.length ? `
    <div style="margin-top:40px;padding:28px;background:rgba(201,168,76,.04);border:1px solid rgba(201,168,76,.15);border-radius:14px">
      <p style="font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#C9A84C;margin-bottom:6px">Live eBay AU Listings</p>
      <h2 style="font-family:'Cinzel',serif;font-size:18px;color:#F0F2FF;margin-bottom:16px">${set.name} on eBay Australia</h2>
      <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:12px">
        ${ebayListings.map(item => {
          const price = item.price?.value ? `AU$${parseFloat(item.price.value).toFixed(2)}` : '';
          const epnUrl = `https://www.ebay.com.au/itm/${item.itemId}?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
          return `<a href="${epnUrl}" target="_blank" rel="noopener sponsored" style="flex:0 0 160px;background:#161929;border:1px solid #252840;border-radius:12px;overflow:hidden;text-decoration:none;display:flex;flex-direction:column;transition:all .22s" onmouseover="this.style.borderColor='rgba(201,168,76,.4)'" onmouseout="this.style.borderColor='#252840'">
            ${item.image?.imageUrl ? `<img src="${item.image.imageUrl}" alt="${(item.title||'').slice(0,40)}" style="width:100%;height:120px;object-fit:contain;background:#0d0f1a;padding:8px" loading="lazy">` : `<div style="height:120px;background:#0d0f1a;display:flex;align-items:center;justify-content:center;font-size:24px">🃏</div>`}
            <div style="padding:9px 11px;flex:1;display:flex;flex-direction:column;gap:4px">
              <div style="font-size:11px;color:#F0F2FF;line-height:1.35;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;flex:1">${item.title||''}</div>
              <div style="font-family:'Cinzel',serif;font-size:13px;font-weight:700;color:#C9A84C;margin-top:4px">${price}</div>
              <div style="font-size:10px;color:rgba(160,168,192,.5)">View on eBay ↗</div>
            </div>
          </a>`;
        }).join('')}
      </div>
      <div style="text-align:right;margin-top:8px"><a href="${ebaySearchURL}" target="_blank" rel="noopener" style="font-size:12px;color:#C9A84C;text-decoration:none;opacity:.7">View all listings ↗</a></div>
    </div>` : `<div style="margin-top:32px;text-align:center;padding:20px;background:#0e1118;border:1px solid #1e2235;border-radius:12px">
      <a href="${ebaySearchURL}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:rgba(201,168,76,.12);border:1px solid rgba(201,168,76,.3);color:#C9A84C;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">Shop ${set.name} on eBay AU ↗</a>
    </div>`;

  const schemaLD = JSON.stringify({"@context":"https://schema.org","@type":"CollectionPage","name":`${set.name} Riftbound Card Prices Australia`,"description":`Browse all ${cards.length} ${set.name} Riftbound cards with AUD prices and eBay AU buy links.`,"url":`https://cardsoncardsoncards.com.au/cards/riftbound/sets/${setCode}`});

  return new Response(`<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${set.name} Card Prices Australia | Riftbound | Cards on Cards on Cards</title>
<meta name="description" content="Browse all ${cards.length} ${set.name} Riftbound cards with AUD prices. Live pricing and eBay AU buy links updated daily.">
<link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/riftbound/sets/${setCode}">
<link rel="icon" type="image/png" href="/c3logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
<script type="application/ld+json">${schemaLD}</script>
<style>
:root{--bg:#0A0C14;--bg2:#111420;--bg3:#181d2e;--text:#F0F2FF;--text2:#A0A8C0;--border:#252840;--accent:#C9A84C;}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6;overflow-x:hidden}
.wrap{max-width:1100px;margin:0 auto;padding:0 24px;position:relative;z-index:1}
.card-item{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px;text-decoration:none;display:block;transition:border-color .15s;position:relative}
.card-item:hover{border-color:var(--accent)}
.card-item.hidden{display:none}
.filt-btn{padding:5px 12px;border-radius:6px;border:1px solid var(--border);background:none;color:var(--text2);font-size:11px;font-weight:600;cursor:pointer;transition:all .15s;font-family:'DM Sans',sans-serif}
.filt-btn.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.filt-btn:hover:not(.active){border-color:var(--accent);color:var(--accent)}
</style>
</head>
<body>
${NAV}
<div class="wrap" style="padding-top:32px">
  <div style="margin-bottom:8px">
    <a href="/cards/riftbound" style="font-size:12px;color:var(--text2);text-decoration:none">← All Riftbound Sets</a>
  </div>
  <h1 style="font-family:'Cinzel',serif;font-size:clamp(22px,4vw,36px);margin-bottom:6px">${set.name} <span style="color:var(--accent)">Card Prices</span></h1>
  <p style="color:var(--text2);margin-bottom:20px;font-size:14px">${cards.length} cards${set.abbreviation ? ` · ${set.abbreviation}` : ''}${releaseDate ? ` · Released ${releaseDate}` : ''} · AUD prices updated daily</p>
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:28px">
    <a href="${ebaySearchURL}" target="_blank" rel="noopener" style="background:rgba(201,168,76,.12);border:1px solid rgba(201,168,76,.3);color:#C9A84C;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">🛒 Buy Singles on eBay AU ↗</a>
    <a href="${ebayBoxURL}" target="_blank" rel="noopener" style="background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.3);color:#60A5FA;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">📦 Buy Booster Box ↗</a>
    <a href="/blog/best-riftbound-australia-beginners-guide/" style="background:var(--bg2);border:1px solid var(--border);color:var(--text2);padding:9px 16px;border-radius:8px;font-size:13px;text-decoration:none">📖 Is it Worth Opening?</a>
  </div>
  <div style="background:rgba(201,168,76,.04);border:1px solid rgba(201,168,76,.15);border-radius:10px;padding:16px 20px;margin-bottom:24px;font-size:13px;color:var(--text2);line-height:1.6">${contextText}</div>
  ${top5.length ? `<div style="margin-bottom:32px"><p style="font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--text2);margin-bottom:14px">Top Cards by Value</p><div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px">${top5HTML}</div></div>` : ''}
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:18px 20px;margin-bottom:24px">
    ${rarityFilterHTML}
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:${rarities.length?'10px':'0'}">
      <span style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#7a8099;min-width:70px">Sort</span>
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
      <p style="font-size:13px;color:var(--text2);margin-top:8px">${set.name} contains ${cards.length} Riftbound cards in the C3 database.</p>
    </details>
    <details style="margin-top:12px;padding-bottom:4px">
      <summary style="cursor:pointer;font-size:14px;font-weight:600">What is the most valuable ${set.name} card?</summary>
      <p style="font-size:13px;color:var(--text2);margin-top:8px">${pricedCards.length ? `The most valuable card is <strong style="color:var(--text)">${pricedCards[0].name}</strong> at ~AU$${toAud(pricedCards[0]).toFixed(2)}.` : 'Check eBay AU for current prices.'}</p>
    </details>
  </div>
</div>
<footer style="border-top:1px solid var(--border);padding:24px;text-align:center;color:var(--text2);font-size:12px;margin-top:20px">
  <p><a href="/" style="color:var(--text2);margin:0 8px">Home</a><a href="/cards/riftbound" style="color:var(--text2);margin:0 8px">Riftbound</a><a href="/blog" style="color:var(--text2);margin:0 8px">Blog</a><a href="/tracker.html" style="color:var(--text2);margin:0 8px">Tracker</a></p>
  <p style="margin-top:8px">© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
  <p style="margin-top:6px;font-size:11px">Riftbound Card Game © Riot Games. C3 is not affiliated with Riot Games.</p>
</footer>
<script>
let activeRarity='all',minPrice=0;
function setFilter(dim,val,btn){
  document.querySelectorAll('[data-'+dim+'-filter]').forEach(function(b){b.classList.remove('active')});
  btn.classList.add('active');
  if(dim==='rarity') activeRarity=val;
  applyFilters();
}
function applyFilters(){
  const sortMode=document.getElementById('sort-sel').value;
  minPrice=parseFloat(document.getElementById('price-sel').value)||0;
  const grid=document.getElementById('card-grid');
  const items=[...grid.querySelectorAll('.card-item')];
  let visible=0;
  items.forEach(function(el){
    const match=(activeRarity==='all'||el.dataset.rarity===activeRarity)&&(parseFloat(el.dataset.price)||0)>=minPrice;
    el.classList.toggle('hidden',!match);
    if(match) visible++;
  });
  document.getElementById('filter-count').textContent=visible+' cards';
  const vis=items.filter(function(el){return !el.classList.contains('hidden')});
  vis.sort(function(a,b){
    if(sortMode==='price-desc') return (parseFloat(b.dataset.price)||0)-(parseFloat(a.dataset.price)||0);
    if(sortMode==='price-asc') return (parseFloat(a.dataset.price)||0)-(parseFloat(b.dataset.price)||0);
    return a.textContent.localeCompare(b.textContent);
  });
  vis.forEach(function(el){grid.appendChild(el)});
}
function clearFilters(){activeRarity='all';minPrice=0;document.querySelectorAll('.filt-btn').forEach(function(b){b.classList.remove('active')});document.querySelectorAll('[data-rarity-filter="all"]').forEach(function(b){b.classList.add('active')});document.getElementById('sort-sel').value='price-desc';document.getElementById('price-sel').value='0';applyFilters();}
applyFilters();
</script>
</body>
</html>`, { status: 200, headers });
};

export const config = { path: '/cards/riftbound/sets/:setCode+' };
