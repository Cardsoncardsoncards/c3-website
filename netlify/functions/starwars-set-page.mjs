// netlify/functions/starwars-set-page.mjs
// Serves /cards/starwars/sets/:slug+

const SUPABASE_URL       = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY  = Netlify.env.get('SUPABASE_ANON_KEY');
const EBAY_CLIENT_ID     = Netlify.env.get('EBAY_CLIENT_ID');
const EBAY_CLIENT_SECRET = Netlify.env.get('EBAY_CLIENT_SECRET');
const EPN_CAMPID         = '5339146789';
const AMAZON_TAG         = 'blasdigital-22';

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
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_AU', 'X-EBAY-C-ENDUSERCTX': `affiliateCampaignId=${EPN_CAMPID}` }
    });
    if (!res.ok) return [];
    const d = await res.json();
    return d.itemSummaries || [];
  } catch { return []; }
}

function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function graceful404(setSlug) {
  return `<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Set Not Found | Star Wars Unlimited | Cards on Cards on Cards</title><meta name="robots" content="noindex"><link rel="icon" type="image/png" href="/c3logo.png"><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0A0C14;color:#F0F2FF;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}.wrap{max-width:420px}.icon{font-size:48px;margin-bottom:16px}h1{color:#FFD700;font-size:22px;margin-bottom:10px}p{color:#8892b0;font-size:14px;margin-bottom:24px;line-height:1.6}.btn{display:inline-block;background:#FFD700;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;margin:4px}.btn-sec{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:#F0F2FF}</style></head><body><div class="wrap"><div class="icon">&#127183;</div><h1>Set Not Found</h1><p>We could not find the Star Wars Unlimited set "${esc(setSlug)}". It may not be in our database yet.</p><a href="/cards/starwars" class="btn">Browse All Star Wars Unlimited Cards</a><a href="/" class="btn btn-sec">Back to Home</a></div></body></html>`;
}

export default async (req) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=900, s-maxage=1800' };
  const url = new URL(req.url);
  const setSlug = url.pathname.replace(/^\/cards\/starwars\/sets\//, '').replace(/\/$/, '');
  if (!setSlug) return new Response(graceful404(''), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

  try {
    const [sets, ebayToken] = await Promise.allSettled([
      supabaseGet(`starwars_sets?slug=eq.${encodeURIComponent(setSlug)}&limit=1&select=id,name,slug,release_date,card_count`),
      getEbayToken()
    ]);

    const setsVal = sets.status === 'fulfilled' ? sets.value : [];
    const ebayTokenVal = ebayToken.status === 'fulfilled' ? ebayToken.value : null;

    if (!setsVal || !setsVal[0]) return new Response(graceful404(setSlug), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

    const set = setsVal[0];

    const [cardsRes, ebayRes] = await Promise.allSettled([
      supabaseGet(`starwars_cards?set_id=eq.${set.id}&order=name.asc&limit=400&select=slug,name,number,image_url,market_price,price_aud,rarity,set_name,price_change_7d,price_change_30d`),
      getEbayListings(`${set.name} star wars unlimited card`, ebayTokenVal)
    ]);

    const cards = cardsRes.status === 'fulfilled' ? (cardsRes.value || []) : [];
    const ebayListings = ebayRes.status === 'fulfilled' ? (ebayRes.value || []) : [];

    const toAud = (c) => c.price_aud > 0 ? parseFloat(c.price_aud) : c.market_price > 0 ? c.market_price * 1.58 : 0;
    const pricedCards = cards.filter(c => toAud(c) > 0);
    const top5 = [...pricedCards].sort((a,b) => toAud(b) - toAud(a)).slice(0, 5);
    const moversEligible = cards.filter(c => c.price_change_7d != null && parseFloat(c.price_aud||0) > 0.50);
    const gainers = [...moversEligible].filter(c => parseFloat(c.price_change_7d) > 0).sort((a,b) => parseFloat(b.price_change_7d)-parseFloat(a.price_change_7d)).slice(0,3);
    const losers  = [...moversEligible].filter(c => parseFloat(c.price_change_7d) < 0).sort((a,b) => parseFloat(a.price_change_7d)-parseFloat(b.price_change_7d)).slice(0,3);
    const showMovers = moversEligible.length >= 5;
    const rarities = [...new Set(cards.map(c => c.rarity).filter(r => r && r !== 'None'))].sort();
    const priced = pricedCards.length;

    const ebaySetURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name + ' star wars unlimited')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
    const ebayBoxURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name + ' booster box')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
    const amazonURL  = `https://www.amazon.com.au/s?k=${encodeURIComponent(set.name + ' star wars unlimited')}&tag=${AMAZON_TAG}`;

    const top5HTML = top5.length ? top5.map(c => {
      const aud = toAud(c);
      return `<a href="/cards/starwars/${esc(c.slug)}" style="background:#0e1118;border:1px solid #1e2235;border-radius:10px;padding:12px;text-decoration:none;display:flex;flex-direction:column;align-items:center;gap:6px;transition:border-color .2s" onmouseover="this.style.borderColor='#FFD700'" onmouseout="this.style.borderColor='#1e2235'">
        <img src="${esc(c.image_url)}" alt="${esc(c.name)}" style="width:80px;height:112px;object-fit:contain;border-radius:5px" loading="lazy">
        <div style="font-size:11px;color:#F0F2FF;text-align:center;font-weight:600;line-height:1.3">${esc(c.name)}</div>
        <div style="font-size:13px;color:#FFD700;font-weight:700">AU$${aud.toFixed(2)}</div>
      </a>`;
    }).join('') : '<p style="color:#8892b0;font-size:14px">No priced cards yet.</p>';

    const allCardsHTML = cards.map(c => {
      const aud = toAud(c);
      const rar = esc((c.rarity||'').toLowerCase().replace(/ /g,'-'));
      return `<a class="card-item" href="/cards/starwars/${esc(c.slug)}" data-name="${esc(c.name.toLowerCase())}" data-price="${aud.toFixed(2)}" data-rarity="${rar}" data-change7d="${c.price_change_7d||0}" data-number="${c.number||0}" style="background:#0e1118;border:1px solid #1e2235;border-radius:10px;padding:12px;text-decoration:none;display:flex;flex-direction:column;align-items:center;gap:6px;transition:border-color .2s" onmouseover="this.style.borderColor='#FFD700'" onmouseout="this.style.borderColor='#1e2235'">
        <img src="${esc(c.image_url)}" alt="${esc(c.name)}" style="width:80px;height:112px;object-fit:contain;border-radius:5px" loading="lazy">
        <div style="font-size:11px;color:#F0F2FF;text-align:center;font-weight:600;line-height:1.3">${esc(c.name)}</div>
        ${aud > 0 ? `<div style="font-size:12px;color:#FFD700;font-weight:700">AU$${aud.toFixed(2)}</div>` : '<div style="font-size:11px;color:#8892b0">No price</div>'}
      </a>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(set.name)} | Star Wars Unlimited Set | Cards on Cards on Cards</title>
  <meta name="description" content="Browse all ${esc(set.name)} Star Wars Unlimited cards with AUD prices. ${priced} cards priced on Cards on Cards on Cards.">
  <link rel="canonical" href="https://www.cardsoncardsoncards.com.au/cards/starwars/sets/${esc(set.slug)}">
  <meta property="og:title" content="${esc(set.name)} | Star Wars Unlimited | C3">
  <meta property="og:description" content="${priced} cards priced in AUD for ${esc(set.name)}.">
  <meta property="og:url" content="https://www.cardsoncardsoncards.com.au/cards/starwars/sets/${esc(set.slug)}">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;600&display=swap" rel="stylesheet">
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0A0C14;color:#F0F2FF;font-family:'DM Sans',sans-serif;line-height:1.6}
    .nav-bar{background:#080A12;border-bottom:1px solid #1e2235;padding:0 20px;display:flex;align-items:center;gap:16px;height:52px;position:sticky;top:0;z-index:100}
    .nav-logo{font-family:'Cinzel',serif;font-size:15px;font-weight:700;color:#C9A84C;text-decoration:none;flex-shrink:0}
    .nav-links{display:flex;gap:4px;flex-shrink:0}
    .nav-links a{color:#8892b0;font-size:12px;font-weight:600;text-decoration:none;padding:6px 10px;border-radius:6px;transition:color .2s}
    .nav-links a:hover{color:#F0F2FF}
    .nav-search{flex:1;min-width:0;max-width:400px;display:flex}
    .nav-search input{flex:1;max-width:300px;background:rgba(255,255,255,.06);border:1px solid #1e2235;border-radius:7px 0 0 7px;padding:6px 12px;font-size:12px;color:#e8eaf0;font-family:sans-serif;outline:none}
    .nav-search button{background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.35);border-left:none;border-radius:0 7px 7px 0;padding:6px 10px;color:#C9A84C;cursor:pointer;font-size:13px;flex-shrink:0}
    .ebay-btn{display:inline-block;background:#C9A84C;color:#000;padding:10px 20px;border-radius:8px;font-weight:700;text-decoration:none;font-size:13px}
    .cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}
    .filt-btn{background:rgba(255,255,255,.06);border:1px solid #1e2235;color:#8892b0;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .2s}
    .filt-btn.active,.filt-btn:hover{background:#FFD700;border-color:#FFD700;color:#000;font-weight:700}
    .wrap{max-width:1100px;margin:0 auto;padding:24px 16px}
    @media(max-width:600px){.nav-links{display:none}.cards-grid{grid-template-columns:repeat(auto-fill,minmax(90px,1fr))}}
  </style>
</head>
<body>
<nav class="nav-bar">
  <a href="/" class="nav-logo">C3</a>
  <div class="nav-links">
    <a href="/vault">CARD VAULT</a><a href="/compare">COMPARE</a><a href="/market">MARKET</a><a href="/tools">TOOLS</a><a href="/play">PLAY</a><a href="/blog">BLOG</a>
  </div>
  <div class="nav-search">
    <input type="text" id="nav-q" placeholder="Search cards..." autocomplete="off" onkeydown="if(event.key==='Enter'){var v=this.value.trim();if(v)window.location='/search?q='+encodeURIComponent(v);}">
    <button onclick="var v=document.getElementById('nav-q').value.trim();if(v)window.location='/search?q='+encodeURIComponent(v);">&#128269;</button>
  </div>
</nav>

<div class="wrap">
  <div style="font-size:12px;color:#8892b0;margin-bottom:12px"><a href="/" style="color:#8892b0;text-decoration:none">Home</a> &rsaquo; <a href="/cards/starwars" style="color:#8892b0;text-decoration:none">Star Wars Unlimited</a> &rsaquo; ${esc(set.name)}</div>

  <div style="margin-bottom:4px;font-size:11px;font-weight:700;letter-spacing:.08em;color:#FFD700;text-transform:uppercase">Star Wars Unlimited &middot; Set</div>
  <h1 style="font-family:'Cinzel',serif;font-size:clamp(20px,4vw,32px);font-weight:700;color:#F0F2FF;margin-bottom:8px">${esc(set.name)}</h1>
  <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:20px;font-size:13px;color:#8892b0">
    ${set.release_date ? `<span>Released: ${set.release_date}</span>` : ''}
    ${set.card_count ? `<span>${set.card_count} cards</span>` : ''}
    ${priced > 0 ? `<span>${priced} priced in AUD</span>` : ''}
  </div>

  <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:28px">
    <a href="${ebaySetURL}" class="ebay-btn" target="_blank" rel="noopener">Buy Cards on eBay AU &rarr;</a>
    <a href="${ebayBoxURL}" style="display:inline-block;border:1px solid #C9A84C;color:#C9A84C;padding:10px 20px;border-radius:8px;font-weight:700;text-decoration:none;font-size:13px" target="_blank" rel="noopener">Find Booster Box &rarr;</a>
    <a href="${amazonURL}" style="display:inline-block;border:1px solid #8892b0;color:#8892b0;padding:10px 20px;border-radius:8px;font-weight:700;text-decoration:none;font-size:13px" target="_blank" rel="noopener">Search Amazon AU &rarr;</a>
  </div>

  ${top5.length ? `<div style="margin-bottom:32px">
    <h2 style="font-family:'Cinzel',serif;font-size:16px;font-weight:700;color:#F0F2FF;margin-bottom:14px;text-transform:uppercase;letter-spacing:.05em">Most Valuable Cards</h2>
    <div style="display:flex;gap:10px;flex-wrap:wrap">${top5HTML}</div>
  </div>` : ''}

  ${showMovers && (gainers.length || losers.length) ? `<div style="background:#0e1118;border:1px solid #1e2235;border-radius:10px;padding:16px;margin-bottom:28px">
    <h2 style="font-family:'Cinzel',serif;font-size:14px;font-weight:700;color:#F0F2FF;margin-bottom:12px;text-transform:uppercase;letter-spacing:.05em">7-Day Price Movers</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div>${gainers.map(c => `<div style="font-size:12px;color:#4ADE80;padding:4px 0">&uarr; ${esc(c.name)} <span style="color:#F0F2FF">AU$${toAud(c).toFixed(2)}</span></div>`).join('')}</div>
      <div>${losers.map(c => `<div style="font-size:12px;color:#F87171;padding:4px 0">&darr; ${esc(c.name)} <span style="color:#F0F2FF">AU$${toAud(c).toFixed(2)}</span></div>`).join('')}</div>
    </div>
  </div>` : ''}

  <div>
    <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px">
      <h2 style="font-family:'Cinzel',serif;font-size:16px;font-weight:700;color:#F0F2FF;text-transform:uppercase;letter-spacing:.05em">Singles (${cards.length})</h2>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <input id="card-search" type="text" placeholder="Filter cards..." oninput="applyFilters()" style="background:rgba(255,255,255,.06);border:1px solid #1e2235;border-radius:7px;padding:6px 12px;font-size:12px;color:#e8eaf0;font-family:sans-serif;outline:none;width:160px">
        <select id="sort-sel" onchange="applyFilters()" style="background:#e8eaf0;border:1px solid #1e2235;border-radius:7px;padding:6px 10px;font-size:12px;color:#111420;font-family:'DM Sans',sans-serif;cursor:pointer">
          <option value="name-asc" selected>Name: A to Z</option>
          <option value="price-desc">Price: High to Low</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="gainers">Biggest Gainers &#9650;</option>
          <option value="losers">Biggest Losers &#9660;</option>
          <option value="name-desc">Name: Z to A</option>
          <option value="number">Card Number</option>
          <option value="rarity">By Rarity</option>
        </select>
        <span id="filter-count" style="font-size:12px;color:#8892b0;white-space:nowrap"></span>
      </div>
    </div>
    ${rarities.length > 1 ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
      <button class="filt-btn active" data-rarity="all" onclick="setRarity('all',this)">All Rarities</button>
      ${rarities.map(r => `<button class="filt-btn" data-rarity="${esc(r.toLowerCase().replace(/ /g,'-'))}" onclick="setRarity('${esc(r.toLowerCase().replace(/ /g,'-'))}',this)">${esc(r)}</button>`).join('')}
    </div>` : ''}
    <div class="cards-grid" id="cards-grid">${allCardsHTML}</div>
  </div>

  <div style="background:#0e1118;border:1px solid #1e2235;border-radius:10px;padding:20px;font-size:13px;color:#8892b0;margin-top:28px">
    <strong style="color:#F0F2FF">About this set:</strong> Star Wars Unlimited card prices shown in AUD, converted from USD market data. Prices update daily via tcgapi.dev. Always check eBay AU for live Australian market pricing.
    <div style="margin-top:10px"><a href="/cards/starwars" style="color:#FFD700">Back to all Star Wars Unlimited cards</a></div>
  </div>
</div>

<script>
let activeRarity = 'all';
function setRarity(r, btn) {
  activeRarity = r;
  document.querySelectorAll('.filt-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  applyFilters();
}
function applyFilters() {
  const sort   = document.getElementById('sort-sel')?.value || 'name-asc';
  const search = (document.getElementById('card-search')?.value || '').toLowerCase().trim();
  const grid   = document.getElementById('cards-grid');
  if (!grid) return;
  const items = [...grid.querySelectorAll('.card-item')];
  let visible = 0;
  items.forEach(el => {
    const show = (activeRarity === 'all' || el.dataset.rarity === activeRarity) && (!search || el.dataset.name.includes(search));
    el.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  const fc = document.getElementById('filter-count');
  if (fc) fc.textContent = visible + ' cards';
  const rarityOrder = ['common','uncommon','rare','super rare','double rare','ultra rare','secret rare','special rare','expansion rare','legendary','epic','showcase','enchanted','promo'];
  const vis = items.filter(el => el.style.display !== 'none');
  vis.sort((a, b) => {
    const pa = parseFloat(a.dataset.price) || 0;
    const pb = parseFloat(b.dataset.price) || 0;
    const ga = parseFloat(a.dataset.change7d || '-9999');
    const gb = parseFloat(b.dataset.change7d || '-9999');
    const na = a.dataset.name || '';
    const nb = b.dataset.name || '';
    const numa = isNaN(parseInt(a.dataset.number)) ? 9999 : parseInt(a.dataset.number);
    const numb = isNaN(parseInt(b.dataset.number)) ? 9999 : parseInt(b.dataset.number);
    const ra  = rarityOrder.indexOf(a.dataset.rarity);
    const rb2 = rarityOrder.indexOf(b.dataset.rarity);
    if (sort === 'price-desc') return pb - pa;
    if (sort === 'price-asc')  return pa - pb;
    if (sort === 'gainers')    return gb - ga;
    if (sort === 'losers')     return ga - gb;
    if (sort === 'name-asc')   return na.localeCompare(nb);
    if (sort === 'name-desc')  return nb.localeCompare(na);
    if (sort === 'number')     return numa - numb;
    if (sort === 'rarity')     return (ra < 0 ? 99 : ra) - (rb2 < 0 ? 99 : rb2);
    return 0;
  });
  vis.forEach(el => grid.appendChild(el));
}
document.addEventListener('DOMContentLoaded', applyFilters);
if(typeof gtag!=='undefined'){
  document.querySelectorAll('a[href*="ebay"]').forEach(a=>a.addEventListener('click',()=>gtag('event','ebay_click',{game:'starwars',set:'${esc(set.name)}'})));
}
</script>
</body>
</html>`;

    return new Response(html, { status: 200, headers });
  } catch (err) {
    console.error('[starwars-set-page] Error:', err.message);
    return new Response(graceful404(setSlug), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
};

export const config = { path: '/cards/starwars/sets/:slug+', priority: 1 };
