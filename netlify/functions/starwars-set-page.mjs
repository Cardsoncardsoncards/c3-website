// netlify/functions/starwars-set-page.mjs
// Serves /cards/starwars/sets/:setCode

const SUPABASE_URL       = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY  = Netlify.env.get('SUPABASE_ANON_KEY');
const EBAY_CLIENT_ID     = Netlify.env.get('EBAY_CLIENT_ID');
const EBAY_CLIENT_SECRET = Netlify.env.get('EBAY_CLIENT_SECRET');
const EPN_CAMPID         = '5339146789';

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
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&category_ids=183454&filter=buyingOptions%3A%7BFIXED_PRICE%7D&sort=-price&limit=8`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_AU' } });
    if (!res.ok) return [];
    const d = await res.json();
    return d.itemSummaries || [];
  } catch { return []; }
}

export default async (req) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=900, s-maxage=1800' };
  const url = new URL(req.url);
  const setCode = url.pathname.replace(/^\/cards\/starwars\/sets\//, '').replace(/\/$/, '');
  if (!setCode) return new Response('Not found', { status: 404, headers });

  const [setsById, setsbySlug, ebayToken] = await Promise.all([
    supabaseGet(`starwars_sets?id=eq.${encodeURIComponent(setCode)}&limit=1`),
    supabaseGet(`starwars_sets?slug=eq.${encodeURIComponent(setCode)}&limit=1`),
    getEbayToken()
  ]);

  const set = (setsById.length ? setsById : setsbySlug)[0];
  if (!set) return new Response(`<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><title>Set Not Found | C3</title><link rel="icon" type="image/png" href="/c3logo.png"></head><body style="background:#0A0C14;color:#F0F2FF;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:16px"><h1>Set not found</h1><a href="/cards/starwars" style="color:#FFE81F">← Back to Star Wars Unlimited</a></body></html>`, { status: 404, headers });

  const cards = await supabaseGet(`starwars_cards?set_id=eq.${encodeURIComponent(set.id)}&order=market_price.desc.nullslast&limit=500&select=slug,name,number,image_url,market_price,price_aud,rarity,set_name,custom_attributes`);

  const ebaySearchURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name+' star wars unlimited')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
  const ebayBoxURL   = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name+' star wars unlimited booster box')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
  const ebayListings = await getEbayListings(`${set.name} star wars unlimited`, ebayToken);

  const toAud = c => c.price_aud ? parseFloat(c.price_aud) : (c.market_price ? parseFloat(c.market_price) * 1.58 : 0);
  const pricedCards = cards.filter(c => toAud(c) > 0).sort((a,b) => toAud(b) - toAud(a));
  const top5 = pricedCards.slice(0,5);
  const rarities = [...new Set(cards.map(c => c.rarity).filter(Boolean))].sort();

  const topCardsHTML = top5.map(c => `
    <a href="/cards/starwars/${c.slug}" style="flex:0 0 140px;background:#111420;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px;text-align:center;text-decoration:none;transition:all .2s;display:block" onmouseover="this.style.borderColor='#FFE81F';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='rgba(255,255,255,.1)';this.style.transform='none'">
      ${c.image_url ? `<img src="${c.image_url}" alt="${c.name}" style="width:100%;border-radius:6px;display:block" loading="lazy">` : `<div style="height:100px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#7a8099">${c.name}</div>`}
      <div style="font-size:10px;color:#F0F2FF;margin-top:6px;line-height:1.3;font-weight:600">${c.name}</div>
      <div style="font-size:11px;color:#FFE81F;font-weight:700;margin-top:3px">AU$${toAud(c).toFixed(2)}</div>
    </a>`).join('');

  const allCardsHTML = cards.map(c => `
    <a href="/cards/starwars/${c.slug}" class="card-item" data-rarity="${(c.rarity||'').toLowerCase()}" data-price="${toAud(c).toFixed(2)}">
      ${c.image_url ? `<img src="${c.image_url}" alt="${c.name}" style="width:100%;border-radius:5px;display:block" loading="lazy">` : `<div style="height:80px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#7a8099;text-align:center;padding:4px">${c.name}</div>`}
      <div style="font-size:10px;margin-top:4px;color:#F0F2FF;line-height:1.2">${c.name}</div>
      ${c.number ? `<div style="font-size:9px;color:#7a8099">${c.number}</div>` : ''}
      ${toAud(c) > 0 ? `<div style="font-size:10px;color:#FFE81F;font-weight:700;margin-top:2px">AU$${toAud(c).toFixed(2)}</div>` : ''}
    </a>`).join('');

  const ebayItemsHTML = ebayListings.slice(0,6).map(item => `
    <a href="${item.itemWebUrl||'#'}?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1" target="_blank" rel="noopener sponsored" style="background:#111420;border:1px solid #252840;border-radius:10px;overflow:hidden;text-decoration:none;transition:border-color .2s;display:block" onmouseover="this.style.borderColor='#FFE81F'" onmouseout="this.style.borderColor='#252840'">
      ${item.image?.imageUrl ? `<img src="${item.image.imageUrl}" alt="${(item.title||'').slice(0,40)}" style="width:100%;height:140px;object-fit:contain;background:#0d0f1a;padding:8px" loading="lazy">` : `<div style="height:140px;background:#0d0f1a;display:flex;align-items:center;justify-content:center;font-size:24px">🃏</div>`}
      <div style="padding:10px">
        <div style="font-size:11px;color:#F0F2FF;line-height:1.3;margin-bottom:6px">${(item.title||'').slice(0,60)}</div>
        <div style="font-size:13px;color:#FFE81F;font-weight:700">${item.price?.value ? 'AU$'+parseFloat(item.price.value).toFixed(2) : ''}</div>
      </div>
    </a>`).join('');

  const totalValue = pricedCards.reduce((s,c) => s + toAud(c), 0);
  const avgValue = pricedCards.length ? totalValue / pricedCards.length : 0;

  return new Response(`<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${set.name} Card Prices Australia | Star Wars Unlimited | Cards on Cards on Cards</title>
  <meta name="description" content="Browse all ${cards.length} cards in ${set.name}. Live AUD prices, card images, and eBay AU buy links. Australia's Star Wars Unlimited price guide.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/starwars/sets/${encodeURIComponent(set.slug||set.id)}">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0A0C14;color:#F0F2FF;font-family:'DM Sans',sans-serif;line-height:1.6;overflow-x:hidden}
    body::before{content:'';position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse 80% 40% at 50% -10%,#FFE81F0f,transparent 60%);z-index:0}
    nav{background:rgba(10,12,20,.97);backdrop-filter:blur(18px);border-bottom:1px solid #252840;padding:12px 0;position:sticky;top:0;z-index:100}
    .nav-inner{display:flex;align-items:center;justify-content:space-between;max-width:1100px;margin:0 auto;padding:0 24px;gap:12px}
    .nav-logo{display:flex;align-items:center;gap:9px;font-family:'Cinzel',serif;font-size:11.5px;font-weight:700;letter-spacing:.12em;color:#C9A84C;text-decoration:none;text-transform:uppercase;white-space:nowrap;flex-shrink:0}
    .nav-logo img{height:32px;width:32px;border-radius:6px;object-fit:cover}
    .nav-links{display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
    .nav-links::-webkit-scrollbar{display:none}
    .nav-link{display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;transition:all .2s;border:1px solid #252840;color:#A0A8C0;white-space:nowrap}
    .nav-link:hover{color:#F0F2FF;border-color:#A0A8C0}
    .wrap{max-width:1100px;margin:0 auto;padding:0 24px;position:relative;z-index:1}
    h1{font-family:'Cinzel',serif;font-size:clamp(22px,4vw,40px);font-weight:900;color:#F0F2FF;line-height:1.1;margin-bottom:10px}
    h1 span{color:#FFE81F}
    .breadcrumb{font-size:12px;color:#7a8099;margin-bottom:16px}
    .breadcrumb a{color:#FFE81F;text-decoration:none}
    .stat-bar{display:flex;gap:24px;flex-wrap:wrap;margin:24px 0;padding:20px;background:#111420;border:1px solid #252840;border-radius:12px}
    .stat-item{text-align:center;flex:1;min-width:80px}
    .stat-num{font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:#FFE81F}
    .stat-label{font-size:11px;color:#7a8099;text-transform:uppercase;letter-spacing:.08em}
    .section-head{font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:#F0F2FF;margin:40px 0 20px}
    .top-cards{display:flex;gap:12px;overflow-x:auto;padding-bottom:16px;scrollbar-width:none}
    .top-cards::-webkit-scrollbar{display:none}
    .filter-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:center}
    .filter-btn{padding:6px 12px;border-radius:6px;font-size:11px;font-weight:600;border:1px solid #252840;background:transparent;color:#A0A8C0;cursor:pointer;transition:all .2s;text-transform:uppercase;letter-spacing:.05em}
    .filter-btn.active,.filter-btn:hover{border-color:#FFE81F;color:#FFE81F;background:rgba(255,255,255,.04)}
    .card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px}
    .card-item{background:#111420;border:1px solid #252840;border-radius:8px;padding:8px;text-decoration:none;transition:all .2s;display:block}
    .card-item:hover{border-color:#FFE81F;transform:translateY(-2px)}
    .card-item.hidden{display:none}
    .ebay-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:40px}
    .cta-bar{display:flex;gap:10px;flex-wrap:wrap;margin:24px 0 40px}
    .cta-btn{display:inline-flex;align-items:center;gap:8px;padding:11px 20px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none;transition:opacity .2s}
    .cta-btn:hover{opacity:.85}
    footer{border-top:1px solid #252840;padding:32px 24px;text-align:center;font-size:12px;color:#7a8099;margin-top:48px;position:relative;z-index:1}
    footer a{color:#7a8099;margin:0 8px;text-decoration:none}
    footer a:hover{color:#F0F2FF}
    .footer-disclaimer{max-width:900px;margin:12px auto 0;font-size:11px;color:rgba(120,128,153,.5);line-height:1.7}
  </style>
</head>
<body>
<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo"><img src="/c3logo.png" alt="C3 Logo"><span>Cards on Cards on Cards</span></a>
    <div class="nav-links">
      <a href="/" class="nav-link">Home</a>
      <a href="/cards/starwars" class="nav-link" style="color:#FFE81F;border-color:#FFE81F40">Star Wars Unlimited</a>
      <a href="/shop.html" class="nav-link">Shop</a>
      <a href="/blog" class="nav-link">Blog</a>
      <a href="/ev-calculator.html" class="nav-link">EV Calc</a>
      <a href="/calendar" class="nav-link">Calendar</a>
      <a href="/quizzes" class="nav-link">Quizzes</a>
      <a href="/tracker.html" class="nav-link">Tracker</a>
    </div>
  </div>
</nav>

<div class="wrap" style="padding-top:40px;padding-bottom:60px">
  <div class="breadcrumb"><a href="/">Home</a> → <a href="/cards/starwars">Star Wars Unlimited</a> → ${set.name}</div>

  <h1>${set.name} <span>Card Prices</span></h1>
  <p style="color:#A0A8C0;font-size:15px;margin-bottom:8px">${set.name} — all ${cards.length} cards with live AUD prices and eBay AU buy links. Updated daily.</p>
  ${set.release_date ? `<p style="font-size:12px;color:#7a8099;margin-bottom:0">Released: ${set.release_date}</p>` : ''}

  <div class="stat-bar">
    <div class="stat-item"><div class="stat-num">${cards.length}</div><div class="stat-label">Cards</div></div>
    <div class="stat-item"><div class="stat-num">${pricedCards.length}</div><div class="stat-label">With Prices</div></div>
    <div class="stat-item"><div class="stat-num">AU$${avgValue > 0 ? avgValue.toFixed(2) : 'N/A'}</div><div class="stat-label">Avg Card Value</div></div>
    <div class="stat-item"><div class="stat-num">${top5[0] ? 'AU$'+toAud(top5[0]).toFixed(0) : 'N/A'}</div><div class="stat-label">Top Card Value</div></div>
  </div>

  <div class="cta-bar">
    <a href="${ebayBoxURL}" target="_blank" rel="noopener" class="cta-btn" style="background:linear-gradient(135deg,#FFE81F,#FFE81Faa);color:#0A0C14">🛒 Buy ${set.name} Booster Box on eBay ↗</a>
    <a href="${ebaySearchURL}" target="_blank" rel="noopener" class="cta-btn" style="background:#111420;border:1px solid #252840;color:#F0F2FF">🔍 All ${set.name} Singles on eBay AU ↗</a>
    <a href="/quizzes/starwars-affiliation" class="cta-btn" style="background:#111420;border:1px solid #252840;color:#FFE81F">⚔️ Light Side or Dark Side?</a>
  </div>

  ${top5.length ? `<h2 class="section-head">Most Valuable Cards</h2><div class="top-cards">${topCardsHTML}</div>` : ''}

  ${ebayListings.length ? `<h2 class="section-head">Live on eBay Australia</h2><div class="ebay-grid">${ebayItemsHTML}</div>` : ''}

  <h2 class="section-head">All Cards — ${set.name} (${cards.length})</h2>

  ${rarities.length > 1 ? `<div class="filter-bar">
    <button class="filter-btn active" onclick="filterCards('',this)">All</button>
    ${rarities.map(r => `<button class="filter-btn" onclick="filterCards('${r.toLowerCase()}',this)">${r}</button>`).join('')}
  </div>` : ''}

  <div class="card-grid" id="card-grid">${allCardsHTML}</div>
</div>

<footer>
  <p><a href="/">Home</a><a href="/cards/starwars">Star Wars Unlimited</a><a href="/shop.html">Shop</a><a href="/blog">Blog</a><a href="/ev-calculator.html">EV Calc</a><a href="/tracker.html">Tracker</a></p>
  <p style="margin-top:8px">© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
  <div class="footer-disclaimer">Cards on Cards on Cards participates in affiliate programmes including Amazon Associates and eBay Partner Network. Purchases through links may earn a commission at no extra cost to you.</div>
</footer>

<script>
function filterCards(rarity, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#card-grid .card-item').forEach(function(el) {
    el.classList.toggle('hidden', rarity !== '' && el.dataset.rarity !== rarity);
  });
}
</script>
</body>
</html>`, { status: 200, headers });
};

export const config = { path: '/cards/starwars/sets/:setCode+' };
