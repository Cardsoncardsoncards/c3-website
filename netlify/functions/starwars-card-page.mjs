// netlify/functions/starwars-card-page.mjs
// Serves /cards/starwars/:slug
// If slug starts with sets/, renders the set page inline (routing fix)

const SUPABASE_URL       = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY  = Netlify.env.get('SUPABASE_ANON_KEY');
const EBAY_CLIENT_ID     = Netlify.env.get('EBAY_CLIENT_ID');
const EBAY_CLIENT_SECRET = Netlify.env.get('EBAY_CLIENT_SECRET');
const EPN_CAMPID         = '5339146789';
const AMAZON_TAG         = 'blasdigital-22';
const ACCENT             = '#FFE81F';

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

async function getEbayListings(cardName, token, gameTag) {
  if (!token) return [];
  try {
    const q = encodeURIComponent(`${cardName} ${gameTag}`);
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${q}&category_ids=183454&filter=buyingOptions%3A%7BFIXED_PRICE%7D&sort=-price&limit=6`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_AU', 'X-EBAY-C-ENDUSERCTX': `affiliateCampaignId=${EPN_CAMPID}` } });
    if (!res.ok) return [];
    const d = await res.json();
    return d.itemSummaries || [];
  } catch { return []; }
}

async function handleSetPage(setSlug, headers) {
  const [sets, ebayToken] = await Promise.all([
    supabaseGet(`starwars_sets?slug=eq.${encodeURIComponent(setSlug)}&limit=1`),
    getEbayToken()
  ]);

  const notFound = `<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><title>Set Not Found | Star Wars Unlimited | Cards on Cards on Cards</title><meta name="robots" content="noindex"><link rel="icon" type="image/png" href="/c3logo.png"></head><body style="background:#0A0C14;color:#F0F2FF;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:16px;padding:24px;text-align:center"><h1 style="font-family:'Cinzel',serif;color:${ACCENT}">Set Not Found</h1><p style="color:#A0A8C0">We couldn't find Star Wars Unlimited set "${setSlug}".</p><a href="/cards/starwars" style="color:${ACCENT}">← Browse All Star Wars Unlimited</a></body></html>`;

  if (!sets || !sets[0]) return new Response(notFound, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  const set = sets[0];

  const [cards] = await Promise.all([
    supabaseGet(`starwars_cards?set_id=eq.${set.id}&order=market_price.desc.nullslast&limit=60&select=slug,name,number,image_url,market_price,price_aud,rarity,set_name`)
  ]);

  const toAud = (c) => c.price_aud > 0 ? parseFloat(c.price_aud) : c.market_price > 0 ? c.market_price * 1.58 : 0;
  const pricedCards = (cards || []).filter(c => toAud(c) > 0);
  const top5 = pricedCards.slice(0, 5);
  const ebaySetURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name + ' star wars unlimited')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
  const metaDesc = `Browse ${cards?.length || 0} Star Wars Unlimited cards from ${set.name}. View card prices in AUD and buy on eBay AU. Updated daily.`;

  const top5HTML = top5.map(c => {
    const aud = toAud(c);
    return `<a href="/cards/starwars/${c.slug}" style="flex:0 0 140px;background:#0e1118;border:1px solid rgba(249,115,22,.35);border-radius:10px;padding:10px;text-align:center;text-decoration:none;display:block">
      ${c.image_url ? `<img src="${c.image_url}" alt="${c.name}" style="width:100%;border-radius:6px;max-height:140px;object-fit:contain;margin-bottom:6px" loading="lazy">` : ''}
      <div style="font-size:11px;color:#e8eaf0;line-height:1.3;margin-bottom:4px;font-weight:600">${c.name}</div>
      ${aud > 0 ? `<div style="font-size:12px;color:#C9A84C;font-weight:700">AU$${aud.toFixed(2)}</div>` : ''}
    </a>`;
  }).join('');

  const allCardsHTML = cards && cards.length ? cards.map(c => {
    const aud = toAud(c);
    return `<a href="/cards/starwars/${c.slug}" style="background:#0e1118;border:1px solid #1e2235;border-radius:8px;padding:8px;text-decoration:none;text-align:center;display:block">
      ${c.image_url ? `<img src="${c.image_url}" alt="${c.name}" style="width:100%;border-radius:4px;max-height:120px;object-fit:contain;margin-bottom:4px" loading="lazy">` : `<div style="height:100px;background:#1e2235;border-radius:4px;margin-bottom:4px;display:flex;align-items:center;justify-content:center;font-size:20px">🃏</div>`}
      <div style="font-size:10px;color:#e8eaf0;line-height:1.3;font-weight:600">${c.name}</div>
      ${aud > 0 ? `<div style="font-size:11px;color:#C9A84C;font-weight:700;margin-top:2px">AU$${aud.toFixed(2)}</div>` : ''}
    </a>`;
  }).join('') : `<div style="grid-column:1/-1;text-align:center;color:#8892b0;padding:32px;font-size:14px">Card list syncing — check back after tonight's update.</div>`;

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${set.name} | Star Wars Unlimited Set | Cards on Cards on Cards</title>
  <meta name="description" content="${metaDesc}">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/starwars/sets/${setSlug}">
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
    .nav-inner{display:flex;align-items:center;justify-content:space-between;max-width:1100px;margin:0 auto;padding:0 24px;gap:12px}
    .nav-logo{display:flex;align-items:center;gap:9px;font-family:'Cinzel',serif;font-size:11.5px;font-weight:700;letter-spacing:.12em;color:#C9A84C;text-decoration:none;text-transform:uppercase;white-space:nowrap;flex-shrink:0}
    .nav-logo img{height:32px;width:32px;border-radius:6px;object-fit:cover}
    .nav-links{display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
    .nav-link{display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid #252840;color:#A0A8C0;white-space:nowrap}
    .wrap{max-width:1200px;margin:0 auto;padding:0 20px 60px}
    .hero{padding:36px 0 24px;border-bottom:1px solid #1e2235;margin-bottom:28px}
    .hero-eyebrow{font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:${ACCENT};margin-bottom:8px}
    .hero-title{font-family:'Cinzel',serif;font-size:clamp(22px,4vw,36px);font-weight:700;color:#F0F2FF;margin-bottom:8px}
    .hero-meta{display:flex;gap:12px;flex-wrap:wrap;font-size:13px;color:#8892b0}
    .cta-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:28px}
    .cta-btn{display:inline-flex;align-items:center;padding:11px 20px;border-radius:8px;font-weight:700;font-size:13px;text-decoration:none}
    .cta-primary{background:${ACCENT};color:#000}
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
    <a href="/" class="nav-logo"><img src="/c3logo.png" alt="C3 Logo"><span>Cards on Cards on Cards</span></a>
    <div class="nav-links">
      <a href="/" class="nav-link">Home</a>
      <a href="/cards/starwars" class="nav-link" style="color:${ACCENT};border-color:rgba(249,115,22,.4)">Star Wars Unlimited</a>
      <a href="/shop.html" class="nav-link">Shop</a>
      <a href="/compare" class="nav-link">Compare</a>
      <a href="/tracker.html" class="nav-link">Tracker</a>
    </div>
  </div>
</nav>
<div class="wrap">
  <div class="hero">
    <div class="hero-eyebrow">Star Wars Unlimited · Set</div>
    <h1 class="hero-title">${set.name}</h1>
    <div class="hero-meta">
      ${set.release_date ? `<span>Released: ${set.release_date.slice(0,10)}</span>` : ''}
      ${set.card_count ? `<span>${set.card_count} cards</span>` : ''}
      ${pricedCards.length ? `<span>${pricedCards.length} priced in AUD</span>` : ''}
    </div>
  </div>
  <div class="cta-row">
    <a href="${ebaySetURL}" target="_blank" rel="noopener" class="cta-btn cta-primary">Buy Cards on eBay AU →</a>
    <a href="https://www.amazon.com.au/s?k=${encodeURIComponent(set.name + ' star wars unlimited')}&tag=${AMAZON_TAG}" target="_blank" rel="noopener" class="cta-btn cta-secondary" style="border-color:rgba(255,153,0,.35);color:#ff9900">Search Amazon AU →</a>
  </div>
  ${top5.length ? `<div style="margin-bottom:28px"><div class="section-title">Most Valuable Cards</div><div class="cards-scroll">${top5HTML}</div></div>` : ''}
  <div style="margin-bottom:28px">
    <div class="section-title">${cards?.length ? `All Cards (${cards.length})` : 'Cards'}</div>
    <div class="cards-grid">${allCardsHTML}</div>
  </div>
  <div style="background:#0e1118;border:1px solid #1e2235;border-radius:10px;padding:20px;font-size:13px;color:#8892b0">
    <strong style="color:#F0F2FF">About this set:</strong> Star Wars Unlimited card prices in AUD. Updated daily via tcgapi.dev.
    <div style="margin-top:10px"><a href="/cards/starwars" style="color:${ACCENT}">← Back to all Star Wars Unlimited cards</a></div>
  </div>
</div>
<footer style="border-top:1px solid #252840;padding:24px;text-align:center;color:#8892b0;font-size:12px;margin-top:20px">
  <p><a href="/" style="color:#8892b0;margin:0 8px">Home</a><a href="/cards/starwars" style="color:#8892b0;margin:0 8px">Star Wars Unlimited</a><a href="/blog" style="color:#8892b0;margin:0 8px">Blog</a></p>
  <p style="margin-top:8px">© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
</footer>
</body></html>`;

  return new Response(html, { status: 200, headers });
}

export default async (req) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=900, s-maxage=1800' };
  const url = new URL(req.url);
  const slug = url.pathname.replace(/^\/cards\/starwars\//, '').replace(/\/$/, '');

  if (!slug) return new Response(`<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><title>Not Found | C3</title><link rel="icon" type="image/png" href="/c3logo.png"></head><body style="background:#0A0C14;color:#F0F2FF;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:16px"><h1>Not found</h1><a href="/cards/starwars" style="color:${ACCENT}">← Star Wars Unlimited</a></body></html>`, { status: 404, headers });

  if (slug.startsWith('sets/')) {
    const setSlug = slug.replace(/^sets\//, '').replace(/\/$/, '');
    return handleSetPage(setSlug, headers);
  }

  const [cards, ebayToken] = await Promise.all([
    supabaseGet(`starwars_cards?slug=eq.${encodeURIComponent(slug)}&limit=1&select=*`),
    getEbayToken()
  ]);

  const card = cards[0];
  if (!card) return new Response(`<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><title>Card Not Found | C3</title><link rel="icon" type="image/png" href="/c3logo.png"></head><body style="background:#0A0C14;color:#F0F2FF;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:16px"><h1>Card not found</h1><a href="/cards/starwars" style="color:${ACCENT}">← Back to Star Wars Unlimited</a></body></html>`, { status: 404, headers });

  const ebayListings = await getEbayListings(card.name, ebayToken, 'star wars unlimited');
  const priceAUD = card.price_aud ? parseFloat(card.price_aud) : (card.market_price ? parseFloat(card.market_price) * 1.58 : 0);
  const foilAUD  = card.foil_price_aud ? parseFloat(card.foil_price_aud) : (card.foil_market_price ? parseFloat(card.foil_market_price) * 1.58 : 0);
  const ebayBuyURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(card.name+' star wars unlimited')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;

  const ebayItemsHTML = ebayListings.map(item => `
    <a href="${item.itemWebUrl||'#'}?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1" target="_blank" rel="noopener sponsored" style="background:#111420;border:1px solid #252840;border-radius:10px;overflow:hidden;text-decoration:none;display:block">
      ${item.image?.imageUrl ? `<img src="${item.image.imageUrl}" alt="${(item.title||'').slice(0,40)}" style="width:100%;height:120px;object-fit:contain;background:#0d0f1a;padding:8px" loading="lazy">` : `<div style="height:120px;background:#0d0f1a;display:flex;align-items:center;justify-content:center">🃏</div>`}
      <div style="padding:10px">
        <div style="font-size:11px;color:#F0F2FF;line-height:1.3;margin-bottom:4px">${(item.title||'').slice(0,55)}</div>
        <div style="font-size:13px;color:${ACCENT};font-weight:700">${item.price?.value ? 'AU$'+parseFloat(item.price.value).toFixed(2) : ''}</div>
      </div>
    </a>`).join('');

  return new Response(`<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${card.name} Price Australia | Star Wars Unlimited | Cards on Cards on Cards</title>
  <meta name="description" content="${card.name} card price in Australia.${priceAUD > 0 ? ' Currently AU$'+priceAUD.toFixed(2)+'.' : ''} Live AUD pricing and eBay AU buy links.">
  <meta property="og:site_name" content="Cards on Cards on Cards">
  <meta property="og:image" content="https://cardsoncardsoncards.com.au/c3ogbanner.png">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/starwars/${card.slug}">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0A0C14;color:#F0F2FF;font-family:'DM Sans',sans-serif;line-height:1.6;overflow-x:hidden}
    body::before{content:'';position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse 80% 40% at 50% -10%,${ACCENT}0f,transparent 60%);z-index:0}
    nav{background:rgba(10,12,20,.97);backdrop-filter:blur(18px);border-bottom:1px solid #252840;padding:12px 0;position:sticky;top:0;z-index:100}
    .nav-inner{display:flex;align-items:center;justify-content:space-between;max-width:1100px;margin:0 auto;padding:0 24px;gap:12px}
    .nav-logo{display:flex;align-items:center;gap:9px;font-family:'Cinzel',serif;font-size:11.5px;font-weight:700;letter-spacing:.12em;color:#C9A84C;text-decoration:none;text-transform:uppercase;white-space:nowrap;flex-shrink:0}
    .nav-logo img{height:32px;width:32px;border-radius:6px;object-fit:cover}
    .nav-links{display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
    .nav-link{display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;transition:all .2s;border:1px solid #252840;color:#A0A8C0;white-space:nowrap}
    .wrap{max-width:1100px;margin:0 auto;padding:40px 24px 60px;position:relative;z-index:1}
    .card-layout{display:grid;grid-template-columns:280px 1fr;gap:40px;align-items:start}
    @media(max-width:640px){.card-layout{grid-template-columns:1fr}}
    .card-img-wrap{background:#111420;border:1px solid #252840;border-radius:14px;padding:16px;text-align:center}
    .card-img-wrap img{width:100%;border-radius:8px;display:block}
    h1{font-family:'Cinzel',serif;font-size:clamp(20px,4vw,32px);font-weight:900;color:#F0F2FF;line-height:1.1;margin-bottom:8px}
    .breadcrumb{font-size:12px;color:#7a8099;margin-bottom:16px}
    .breadcrumb a{color:${ACCENT};text-decoration:none}
    .price-block{background:#111420;border:1px solid ${ACCENT}40;border-radius:12px;padding:20px;margin:20px 0}
    .price-main{font-family:'Cinzel',serif;font-size:32px;font-weight:900;color:${ACCENT}}
    .price-label{font-size:11px;color:#7a8099;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px}
    .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0}
    .meta-item{background:#0d0f1a;border:1px solid #252840;border-radius:8px;padding:12px}
    .meta-label{font-size:10px;color:#7a8099;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px}
    .meta-value{font-size:13px;color:#F0F2FF;font-weight:600}
    .cta-bar{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0}
    .cta-btn{display:inline-flex;align-items:center;gap:8px;padding:11px 20px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none}
    .section-head{font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:#F0F2FF;margin:40px 0 20px}
    .ebay-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;margin-bottom:40px}
    footer{border-top:1px solid #252840;padding:32px 24px;text-align:center;font-size:12px;color:#7a8099;position:relative;z-index:1}
    footer a{color:#7a8099;margin:0 8px;text-decoration:none}
  </style>
</head>
<body>
<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo"><img src="/c3logo.png" alt="C3 Logo"><span>Cards on Cards on Cards</span></a>
    <div class="nav-links">
      <a href="/" class="nav-link">Home</a>
      <a href="/cards/starwars" class="nav-link" style="color:${ACCENT};border-color:${ACCENT}40">Star Wars Unlimited</a>
      <a href="/shop.html" class="nav-link">Shop</a>
      <a href="/compare" class="nav-link">Compare</a>
      <a href="/tracker.html" class="nav-link">Tracker</a>
    </div>
  </div>
</nav>
<div class="wrap">
  <div class="breadcrumb"><a href="/">Home</a> → <a href="/cards/starwars">Star Wars Unlimited</a>${card.set_name ? ` → <a href="/cards/starwars/sets/${encodeURIComponent(card.set_id||'')}">${card.set_name}</a>` : ''} → ${card.name}</div>
  <div class="card-layout">
    <div>
      <div class="card-img-wrap">
        ${card.image_url ? `<img src="${card.image_url}" alt="${card.name}" loading="eager">` : `<div style="height:280px;display:flex;align-items:center;justify-content:center;font-size:48px">🃏</div>`}
      </div>
    </div>
    <div>
      <h1>${card.name}</h1>
      ${card.set_name ? `<p style="color:#A0A8C0;font-size:14px;margin-bottom:4px">${card.set_name}${card.number ? ' · #'+card.number : ''}</p>` : ''}
      ${card.rarity ? `<p style="font-size:12px;color:#7a8099">${card.rarity}</p>` : ''}
      <div class="price-block">
        <div class="price-label">Market Price (AUD)</div>
        <div class="price-main">${priceAUD > 0 ? 'AU$'+priceAUD.toFixed(2) : 'Price Unavailable'}</div>
        ${foilAUD > 0 ? `<div style="font-size:13px;color:#A0A8C0;margin-top:8px">Foil: AU$${foilAUD.toFixed(2)}</div>` : ''}
        <div style="font-size:11px;color:#7a8099;margin-top:8px">Updated daily · Based on TCGPlayer market data</div>
      </div>
      <div class="meta-grid">
        ${card.rarity ? `<div class="meta-item"><div class="meta-label">Rarity</div><div class="meta-value">${card.rarity}</div></div>` : ''}
        ${card.number ? `<div class="meta-item"><div class="meta-label">Card Number</div><div class="meta-value">${card.number}</div></div>` : ''}
        ${card.set_name ? `<div class="meta-item"><div class="meta-label">Set</div><div class="meta-value">${card.set_name}</div></div>` : ''}
        <div class="meta-item"><div class="meta-label">Game</div><div class="meta-value">Star Wars Unlimited</div></div>
      </div>
      <div class="cta-bar">
        <a href="${ebayBuyURL}" target="_blank" rel="noopener" class="cta-btn" style="background:linear-gradient(135deg,${ACCENT},${ACCENT}aa);color:#000">🛒 Buy on eBay AU ↗</a>
        <a href="https://www.amazon.com.au/s?k=${encodeURIComponent(card.name+' star wars unlimited')}&tag=${AMAZON_TAG}" target="_blank" rel="noopener" class="cta-btn" style="background:rgba(255,153,0,.1);border:1px solid rgba(255,153,0,.35);color:#ff9900">Search Amazon AU →</a>
        <a href="/tracker.html" class="cta-btn" style="background:#111420;border:1px solid #252840;color:#F0F2FF">📋 Track Your Collection</a>
      </div>
    </div>
  </div>
  ${ebayListings.length ? `<h2 class="section-head">Buy ${card.name} on eBay Australia</h2><div class="ebay-grid">${ebayItemsHTML}</div>` : ''}
</div>
<footer>
  <p><a href="/">Home</a><a href="/cards/starwars">Star Wars Unlimited</a><a href="/shop.html">Shop</a><a href="/blog">Blog</a><a href="/tracker.html">Tracker</a></p>
  <p style="margin-top:8px">© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
  <p style="margin-top:6px;font-size:11px">Cards on Cards on Cards participates in affiliate programmes including Amazon Associates and eBay Partner Network.</p>
</footer>
<div id="c3-compare-tray" style="position:fixed;bottom:0;left:0;right:0;z-index:900;background:#1a1d2e;border-top:1px solid #2d3254;padding:10px 24px;display:flex;align-items:center;gap:12px;font-family:sans-serif;font-size:13px;transform:translateY(100%);transition:transform .25s;box-shadow:0 -4px 24px rgba(0,0,0,.5)">
  <div id="c3-tray-cards" style="display:flex;gap:8px;flex:1;align-items:center;overflow-x:auto"></div>
  <span id="c3-tray-count" style="color:#9ba3c4;white-space:nowrap;font-size:12px"></span>
  <button onclick="goToCompare()" style="background:#7c6af5;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px;white-space:nowrap">⚖️ Compare Now</button>
  <button onclick="saveCompareTray([]);renderCompareTray();" style="background:none;border:1px solid #2d3254;color:#9ba3c4;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;white-space:nowrap">Clear</button>
</div>
<script>
const COMPARE_KEY='c3_compare_tray';
function getCompareTray(){try{return JSON.parse(localStorage.getItem(COMPARE_KEY)||'[]');}catch{return[];}}
function saveCompareTray(t){localStorage.setItem(COMPARE_KEY,JSON.stringify(t));}
function renderCompareTray(){
  const tray=getCompareTray();const el=document.getElementById('c3-compare-tray');const cardsEl=document.getElementById('c3-tray-cards');const countEl=document.getElementById('c3-tray-count');
  if(!el||!cardsEl)return;
  if(!tray.length){el.style.transform='translateY(100%)';return;}
  el.style.transform='translateY(0)';countEl.textContent=tray.length+' of 5';
  cardsEl.innerHTML=tray.map(c=>'<div style="display:flex;align-items:center;gap:6px;background:#22263a;border:1px solid #2d3254;border-radius:8px;padding:6px 10px">'+(c.img?'<img src="'+c.img+'" style="width:28px;border-radius:3px">':'')+'<span style="font-size:12px;color:#e8eaf0;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+c.name+'</span><button onclick="removeFromCompare(\''+c.slug+'\')" style="background:none;border:none;color:#9ba3c4;cursor:pointer;font-size:14px;padding:0 2px">×</button></div>').join('');
}
function addToCompare(slug,name,img,price,game){
  let tray=getCompareTray();
  if(tray.some(c=>c.slug===slug)){removeFromCompare(slug);return;}
  if(tray.length>=5){alert('Maximum 5 cards. Remove one first.');return;}
  tray.push({slug,name,img,price,game:'starwars'});saveCompareTray(tray);renderCompareTray();
}
function removeFromCompare(slug){saveCompareTray(getCompareTray().filter(c=>c.slug!==slug));renderCompareTray();}
function goToCompare(){const tray=getCompareTray();if(!tray.length)return;window.location.href='/compare?cards='+tray.map(c=>c.slug).join(',');}
renderCompareTray();
</script>
</body>
</html>`, { status: 200, headers });
};

export const config = { path: '/cards/starwars/:slug+' };
