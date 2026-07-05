import { NAV_CSS, navHtml } from './shared/nav.mjs';
// netlify/functions/pokemon-set-page.mjs
// Serves /cards/pokemon/sets/:slug+

const SUPABASE_URL       = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY  = Netlify.env.get('SUPABASE_ANON_KEY');
const EBAY_CLIENT_ID     = Netlify.env.get('EBAY_CLIENT_ID');
const EBAY_CLIENT_SECRET = Netlify.env.get('EBAY_CLIENT_SECRET');
const EPN_CAMPID         = '5339146789';
const AMAZON_TAG         = 'blasdigital-22';
const FX_FALLBACK        = 1.45; // AUD/USD fallback rate - update periodically

async function supabaseGet(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      signal: controller.signal,
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error('supabase_http_' + res.status);
    return await res.json();
  } catch (e) { clearTimeout(timer); throw e; }
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
  return `<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Set Not Found | Pokemon | Cards on Cards on Cards</title><meta name="robots" content="noindex"><link rel="icon" type="image/png" href="/c3logo.png"><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0A0C14;color:#F0F2FF;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}.wrap{max-width:420px}.icon{font-size:48px;margin-bottom:16px}h1{color:#FBBF24;font-size:22px;margin-bottom:10px}p{color:#8892b0;font-size:14px;margin-bottom:24px;line-height:1.6}.btn{display:inline-block;background:#FBBF24;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;margin:4px}.btn-sec{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:#F0F2FF}</style></head><body><div class="wrap"><div class="icon">&#127183;</div><h1>Set Not Found</h1><p>We could not find the Pokemon set "${esc(setSlug)}". It may not be in our database yet.</p><a href="/cards/pokemon" class="btn">Browse All Pokemon Cards</a><a href="/" class="btn btn-sec">Back to Home</a></div></body></html>`;
}

export default async (req) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=900, s-maxage=1800' };
  const url = new URL(req.url);
  const setSlug = url.pathname.replace(/^\/cards\/pokemon\/sets\//, '').replace(/\/$/, '');
  if (!setSlug) return new Response(graceful404(''), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

  try {
    const [sets, ebayToken] = await Promise.allSettled([
      supabaseGet(`pokemon_sets?slug=eq.${encodeURIComponent(setSlug)}&limit=1&select=id,name,slug,release_date,card_count`),
      getEbayToken()
    ]);

    if (sets.status === 'rejected') return new Response('<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><title>Temporarily Unavailable</title></head><body style="background:#0A0C14;color:#F0F2FF;font-family:sans-serif;text-align:center;padding:60px 20px"><h1>Temporarily Unavailable</h1><p>Our data is briefly unavailable. Please try again shortly.</p></body></html>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '120' } });
    const setsVal = sets.value;
    const ebayTokenVal = ebayToken.status === 'fulfilled' ? ebayToken.value : null;

    if (!setsVal || !setsVal[0]) return new Response(graceful404(setSlug), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

    const set = setsVal[0];

    const [cardsRes, ebayRes] = await Promise.allSettled([
      supabaseGet(`pokemon_cards?set_id=eq.${set.id}&order=name.asc&limit=400&select=slug,name,number,image_url,market_price,price_aud,rarity,set_name,price_change_7d,price_change_30d`),
      getEbayListings(`${set.name} pokemon card`, ebayTokenVal)
    ]);

    const cards = cardsRes.status === 'fulfilled' ? (cardsRes.value || []) : [];
    const ebayListings = ebayRes.status === 'fulfilled' ? (ebayRes.value || []) : [];

    const toAud = (c) => c.price_aud > 0 ? parseFloat(c.price_aud) : c.market_price > 0 ? c.market_price * FX_FALLBACK : 0;
    const pricedCards = cards.filter(c => toAud(c) > 0);
    const top5 = [...pricedCards].sort((a,b) => toAud(b) - toAud(a)).slice(0, 5);
    const moversEligible = cards.filter(c => c.price_change_7d != null && parseFloat(c.price_aud||0) > 0.50);
    const gainers = [...moversEligible].filter(c => parseFloat(c.price_change_7d) > 0).sort((a,b) => parseFloat(b.price_change_7d)-parseFloat(a.price_change_7d)).slice(0,3);
    const losers  = [...moversEligible].filter(c => parseFloat(c.price_change_7d) < 0).sort((a,b) => parseFloat(a.price_change_7d)-parseFloat(b.price_change_7d)).slice(0,3);
    const showMovers = moversEligible.length >= 5;
    const rarities = [...new Set(cards.map(c => c.rarity).filter(r => r && r !== 'None'))].sort();
    const priced = pricedCards.length;

    const ebaySetURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name + ' pokemon')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
    const ebayBoxURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name + ' booster box')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
    const amazonURL  = `https://www.amazon.com.au/s?k=${encodeURIComponent(set.name + ' pokemon')}&tag=${AMAZON_TAG}`;

    const top5HTML = top5.length ? top5.map(c => {
      const aud = toAud(c);
      return `<a href="/cards/pokemon/${esc(c.slug)}" style="background:#0e1118;border:1px solid #1e2235;border-radius:10px;padding:12px;text-decoration:none;display:flex;flex-direction:column;align-items:center;gap:6px;transition:border-color .2s" onmouseover="this.style.borderColor='#FBBF24'" onmouseout="this.style.borderColor='#1e2235'">
        <img src="${esc(c.image_url)}" alt="${esc(c.name)}" style="width:80px;height:112px;object-fit:contain;border-radius:5px" loading="lazy">
        <div style="font-size:11px;color:#F0F2FF;text-align:center;font-weight:600;line-height:1.3">${esc(c.name)}</div>
        <div style="font-size:13px;color:#FBBF24;font-weight:700">AU$${aud.toFixed(2)}</div>
      </a>`;
    }).join('') : '<p style="color:#8892b0;font-size:14px">No priced cards yet.</p>';

    const allCardsHTML = cards.map(c => {
      const aud = toAud(c);
      const rar = esc((c.rarity||'').toLowerCase().replace(/ /g,'-'));
      return `<a class="card-item" href="/cards/pokemon/${esc(c.slug)}" data-name="${esc(c.name.toLowerCase())}" data-price="${aud.toFixed(2)}" data-rarity="${rar}" data-change7d="${c.price_change_7d||0}" data-number="${c.number||0}" style="background:#0e1118;border:1px solid #1e2235;border-radius:10px;padding:12px;text-decoration:none;display:flex;flex-direction:column;align-items:center;gap:6px;transition:border-color .2s" onmouseover="this.style.borderColor='#FBBF24'" onmouseout="this.style.borderColor='#1e2235'">
        <img src="${esc(c.image_url)}" alt="${esc(c.name)}" style="width:80px;height:112px;object-fit:contain;border-radius:5px" loading="lazy">
        <div style="font-size:11px;color:#F0F2FF;text-align:center;font-weight:600;line-height:1.3">${esc(c.name)}</div>
        ${aud > 0 ? `<div style="font-size:12px;color:#FBBF24;font-weight:700">AU$${aud.toFixed(2)}</div>` : '<div style="font-size:11px;color:#8892b0">No price</div>'}
      </a>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(set.name)} | Pokemon Set | Cards on Cards on Cards</title>
  <meta name="description" content="Browse all ${esc(set.name)} Pokemon cards with AUD prices. ${priced} cards priced on Cards on Cards on Cards.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/pokemon/sets/${esc(set.slug)}">
  <meta property="og:title" content="${esc(set.name)} | Pokemon | C3">
  <meta property="og:description" content="${priced} cards priced in AUD for ${esc(set.name)}.">
  <meta property="og:url" content="https://cardsoncardsoncards.com.au/cards/pokemon/sets/${esc(set.slug)}">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;600&display=swap" rel="stylesheet">
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0A0C14;color:#F0F2FF;font-family:'DM Sans',sans-serif;line-height:1.6}
    .ebay-btn{display:inline-block;background:#C9A84C;color:#000;padding:10px 20px;border-radius:8px;font-weight:700;text-decoration:none;font-size:13px}
    .cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}
    .filt-btn{background:rgba(255,255,255,.06);border:1px solid #1e2235;color:#8892b0;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .2s}
    .filt-btn.active,.filt-btn:hover{background:#FBBF24;border-color:#FBBF24;color:#000;font-weight:700}
    .wrap{max-width:1100px;margin:0 auto;padding:24px 16px}
    @media(max-width:600px){.cards-grid{grid-template-columns:repeat(auto-fill,minmax(90px,1fr))}}
  </style>
</head>
<body>
<style>${NAV_CSS}</style>${navHtml({ gameLabel: 'Pokemon TCG', gameHref: '/cards/pokemon' })}

<div class="wrap">
  <div style="font-size:12px;color:#8892b0;margin-bottom:12px"><a href="/" style="color:#8892b0;text-decoration:none">Home</a> &rsaquo; <a href="/cards/pokemon" style="color:#8892b0;text-decoration:none">Pokemon</a> &rsaquo; ${esc(set.name)}</div>

  <div style="margin-bottom:4px;font-size:11px;font-weight:700;letter-spacing:.08em;color:#FBBF24;text-transform:uppercase">Pokemon &middot; Set</div>
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
    <strong style="color:#F0F2FF">About this set:</strong> Pokemon card prices shown in AUD, converted from USD market data. Prices update daily via tcgapi.dev. Always check eBay AU for live Australian market pricing.
    <div style="margin-top:10px"><a href="/cards/pokemon" style="color:#FBBF24">Back to all Pokemon cards</a></div>
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
  document.querySelectorAll('a[href*="ebay"]').forEach(a=>a.addEventListener('click',()=>gtag('event','ebay_click',{game:'pokemon',set:'${esc(set.name)}'})));
}
</script>
</body>
</html>`;

    return new Response(html, { status: 200, headers });
  } catch (err) {
    console.error('[pokemon-set-page] Error:', err.message);
    return new Response(graceful404(setSlug), { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '120' } });
  }
};

export const config = { path: '/cards/pokemon/sets/:slug+', priority: 1 };
