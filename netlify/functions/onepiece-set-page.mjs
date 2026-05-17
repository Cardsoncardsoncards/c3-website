// netlify/functions/onepiece-set-page.mjs
// Serves /cards/onepiece/sets/:slug+
// Set page for One Piece TCG

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EBAY_CLIENT_ID    = Netlify.env.get('EBAY_CLIENT_ID');
const EBAY_CLIENT_SECRET = Netlify.env.get('EBAY_CLIENT_SECRET');
const EPN_CAMPID        = '5339146789';
const AMAZON_TAG        = 'blasdigital-22';

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
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_AU', 'X-EBAY-C-ENDUSERCTX': `affiliateCampaignId=${EPN_CAMPID}` }
    });
    if (!res.ok) return [];
    const d = await res.json();
    return d.itemSummaries || [];
  } catch { return []; }
}

function graceful404(setSlug) {
  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Set Not Found | One Piece | Cards on Cards on Cards</title>
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;600&display=swap" rel="stylesheet">
  <style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0A0C14;color:#F0F2FF;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}.wrap{max-width:420px}.icon{font-size:48px;margin-bottom:16px}h1{font-family:'Cinzel',serif;color:#EF4444;font-size:22px;margin-bottom:10px}p{color:#8892b0;font-size:14px;margin-bottom:24px;line-height:1.6}.btn{display:inline-block;background:#EF4444;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;margin:4px}.btn-sec{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:#F0F2FF}</style>
</head>
<body><div class="wrap"><div class="icon">🃏</div><h1>Set Not Found</h1><p>We couldn't find the One Piece set "${setSlug}". It may not be in our database yet.</p><a href="/cards/onepiece" class="btn">Browse All One Piece Cards</a><a href="/" class="btn btn-sec">← Home</a></div></body>
</html>`;
}

export default async (req) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=900, s-maxage=1800' };
  const url = new URL(req.url);
  const setSlug = url.pathname.replace(/^\/cards\/onepiece\/sets\//, '').replace(/\/$/, '');

  if (!setSlug) return new Response(graceful404(''), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

  try {
    const [sets, ebayToken] = await Promise.all([
      supabaseGet(`onepiece_sets?slug=eq.${encodeURIComponent(setSlug)}&limit=1`),
      getEbayToken()
    ]);

    if (!sets || !sets[0]) return new Response(graceful404(setSlug), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

    const set = sets[0];

    const [cards, ebayListings] = await Promise.all([
      supabaseGet(`onepiece_cards?set_id=eq.${set.id}&order=market_price.desc.nullslast&limit=60&select=slug,name,number,image_url,market_price,price_aud,rarity,set_name,price_change_7d`),
      getEbayListings(`${set.name}  one piece tcg`, ebayToken)
    ]);

    const toAud = (c) => c.price_aud > 0 ? parseFloat(c.price_aud) : c.market_price > 0 ? c.market_price * 1.58 : 0;
    const pricedCards = (cards || []).filter(c => toAud(c) > 0);
    const top5 = pricedCards.slice(0, 5);
    const today = new Date().toISOString().slice(0, 10);

    const ebaySetURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name + ' one piece')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
    const ebayBoxURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name + ' booster box')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;

    const top5HTML = top5.map(c => {
      const aud = toAud(c);
      return `<a href="/cards/onepiece/${c.slug}" style="flex:0 0 140px;background:#0e1118;border:1px solid rgba(239,68,68,.35);border-radius:10px;padding:10px;text-align:center;text-decoration:none;transition:all .2s;display:block" onmouseover="this.style.borderColor='#EF4444';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='rgba(239,68,68,.35)';this.style.transform='none'">
        ${c.image_url ? `<img src="${c.image_url}" alt="${c.name}" style="width:100%;border-radius:6px;max-height:140px;object-fit:contain;margin-bottom:6px" loading="lazy">` : ''}
        <div style="font-size:11px;color:#e8eaf0;line-height:1.3;margin-bottom:4px;font-weight:600">${c.name}</div>
        ${c.rarity ? `<div style="font-size:10px;color:#EF4444;margin-bottom:3px">${c.rarity}</div>` : ''}
        ${aud > 0 ? `<div style="font-size:12px;color:#C9A84C;font-weight:700">AU$${aud.toFixed(2)}</div>` : ''}
      </a>`;
    }).join('');

    const allCardsHTML = cards && cards.length ? cards.map(c => {
      const aud = toAud(c);
      const ch7 = c.price_change_7d ? parseFloat(c.price_change_7d) : null;
      const trendDot = ch7 && Math.abs(ch7) >= 5 ? `<div style="position:absolute;top:4px;left:4px;width:7px;height:7px;border-radius:50%;background:${ch7>0?'#4dbd5f':'#e57373'}" title="${ch7>0?'+':''}${ch7.toFixed(1)}% this week"></div>` : '';
      return `<a href="/cards/onepiece/${c.slug}" style="background:#0e1118;border:1px solid #1e2235;border-radius:8px;padding:8px;text-decoration:none;text-align:center;display:block;transition:all .2s;position:relative" onmouseover="this.style.borderColor=\'#C9A84C\'" onmouseout="this.style.borderColor=\'#1e2235\'">${trendDot}
        ${c.image_url ? `<img src="${c.image_url}" alt="${c.name}" style="width:100%;border-radius:4px;max-height:120px;object-fit:contain;margin-bottom:4px" loading="lazy">` : `<div style="height:100px;background:#1e2235;border-radius:4px;margin-bottom:4px;display:flex;align-items:center;justify-content:center;font-size:20px">🃏</div>`}
        <div style="font-size:10px;color:#e8eaf0;line-height:1.3;font-weight:600">${c.name}</div>
        ${c.number ? `<div style="font-size:9px;color:#8892b0;margin-top:1px">#${c.number}</div>` : ''}
        ${c.rarity ? `<div style="font-size:9px;color:#C9A84C;font-weight:700;margin-top:1px;text-transform:uppercase;letter-spacing:.04em">${c.rarity}</div>` : ''}
        ${aud > 0 ? `<div style="font-size:11px;color:#C9A84C;font-weight:700;margin-top:2px">AU$${aud.toFixed(2)}</div>` : ''}
      </a>`;
    }).join('') : `<div style="grid-column:1/-1;text-align:center;color:#8892b0;padding:32px;font-size:14px">Card list syncing, check back after tonight's update.</div>`;

    const ebayListingsHTML = ebayListings.length ? ebayListings.slice(0,4).map(item => {
      const price = item.price?.value ? `AU$${parseFloat(item.price.value).toFixed(2)}` : '';
      const epnUrl = item.itemAffiliateWebUrl || item.itemWebUrl || '#';
      return `<a href="${epnUrl}" target="_blank" rel="noopener" style="background:#0e1118;border:1px solid #1e2235;border-radius:8px;padding:12px;text-decoration:none;display:flex;gap:10px;align-items:center;transition:border-color .2s" onmouseover="this.style.borderColor='#EF4444'" onmouseout="this.style.borderColor='#1e2235'">
        ${item.image?.imageUrl ? `<img src="${item.image.imageUrl}" alt="${item.title}" style="width:50px;height:50px;object-fit:contain;border-radius:4px;flex-shrink:0">` : ''}
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;color:#e8eaf0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.title||''}</div>
          ${price ? `<div style="font-size:13px;color:#C9A84C;font-weight:700;margin-top:3px">${price}</div>` : ''}
          <div style="font-size:10px;color:#8892b0;margin-top:2px">eBay AU · Buy now</div>
        </div>
      </a>`;
    }).join('') : '';

    const metaDesc = `Browse ${cards?.length||0} One Piece cards from ${set.name}. View card prices in AUD, find the most valuable cards and buy on eBay AU. Updated daily.`;


    const setSchemaLD = {
      "@context": "https://schema.org", "@type": "CollectionPage",
      "name": `${set.name} One Piece Card Prices Australia`,
      "description": `Browse all ${cards?.length||0} ${set.name} One Piece cards with AUD prices and eBay AU buy links.`,
      "url": `https://cardsoncardsoncards.com.au/cards/onepiece/sets/${setSlug}`,
      "breadcrumb": {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://cardsoncardsoncards.com.au" },
          { "@type": "ListItem", "position": 2, "name": "One Piece", "item": "https://cardsoncardsoncards.com.au/cards/onepiece" },
          { "@type": "ListItem", "position": 3, "name": set.name, "item": `https://cardsoncardsoncards.com.au/cards/onepiece/sets/${setSlug}` }
        ]
      }
    };
    return new Response(`<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${set.name} | One Piece Set | Cards on Cards on Cards</title>
  <meta name="description" content="${metaDesc}">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/onepiece/sets/${setSlug}">
  <script type="application/ld+json">${JSON.stringify(setSchemaLD)}</script>

  <meta property="og:title" content="${set.name} | One Piece | C3">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:url" content="https://cardsoncardsoncards.com.au/cards/onepiece/sets/${setSlug}">
  <meta property="og:site_name" content="Cards on Cards on Cards">
  <meta property="og:image" content="https://cardsoncardsoncards.com.au/c3-og-banner.png">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0A0C14;color:#F0F2FF;font-family:'DM Sans',sans-serif;line-height:1.6;min-height:100vh}
    a{color:inherit}
    .wrap{max-width:1200px;margin:0 auto;padding:0 20px 60px}
    .hero{padding:36px 0 24px;border-bottom:1px solid #1e2235;margin-bottom:28px}
    .hero-eyebrow{font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#EF4444;margin-bottom:8px}
    .hero-title{font-family:'Cinzel',serif;font-size:clamp(22px,4vw,36px);font-weight:700;color:#F0F2FF;margin-bottom:8px}
    .hero-meta{display:flex;gap:12px;flex-wrap:wrap;font-size:13px;color:#8892b0;align-items:center}
    .meta-badge{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.35);color:#EF4444;padding:3px 10px;border-radius:100px;font-size:11px;font-weight:700}
    .section-title{font-family:'Cinzel',serif;font-size:16px;color:#F0F2FF;margin-bottom:14px}
    .cta-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:28px}
    .cta-btn{display:inline-flex;align-items:center;padding:11px 20px;border-radius:8px;font-weight:700;font-size:13px;text-decoration:none;transition:opacity .2s}
    .cta-primary{background:#EF4444;color:#000}
    .cta-secondary{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:#F0F2FF}
    .cards-scroll{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;scrollbar-width:thin;margin-bottom:28px}
    .cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-bottom:28px}
    .ebay-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;margin-bottom:28px}
    .section{margin-bottom:32px}
    nav{background:rgba(8,10,15,.97);border-bottom:1px solid #1e2235;padding:10px 0;position:sticky;top:0;z-index:100;backdrop-filter:blur(16px)}
    .nav-inner{max-width:1200px;margin:0 auto;padding:0 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .nav-logo{font-family:'Cinzel',serif;font-size:12px;font-weight:700;letter-spacing:.1em;color:#C9A84C;text-transform:uppercase;text-decoration:none;display:flex;align-items:center;gap:8px}
    .nav-links{display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
    .nav-link{display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid #1e2235;color:#A0A8C0;white-space:nowrap;transition:all .2s}
    .nav-link--vault{color:#C9A84C;border-color:rgba(201,168,76,.35)}.nav-link--vault:hover,.nav-link--vault.active{background:rgba(201,168,76,.1);border-color:#C9A84C;color:#E8C86A}
    .nav-link--compare{color:#A78BFA;border-color:rgba(167,139,250,.35)}.nav-link--compare:hover,.nav-link--compare.active{background:rgba(167,139,250,.1);border-color:#A78BFA;color:#C4B5FD}
    .nav-link--market{color:#4ADE80;border-color:rgba(74,222,128,.35)}.nav-link--market:hover,.nav-link--market.active{background:rgba(74,222,128,.1);border-color:#4ADE80;color:#86EFAC}
    .nav-link--tools{color:#FB923C;border-color:rgba(251,146,60,.35)}.nav-link--tools:hover,.nav-link--tools.active{background:rgba(251,146,60,.1);border-color:#FB923C;color:#FDBA74}
    .nav-link--play{color:#F472B6;border-color:rgba(244,114,182,.35)}.nav-link--play:hover,.nav-link--play.active{background:rgba(244,114,182,.1);border-color:#F472B6;color:#F9A8D4}
    .nav-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.35)}.nav-link--blog:hover,.nav-link--blog.active{background:rgba(126,203,161,.1);border-color:#7ECBA1;color:#A5DFC0}
    .nav-link--ebay{color:#60A5FA;border-color:rgba(96,165,250,.35);background:rgba(96,165,250,.05)}.nav-link--ebay:hover{background:rgba(96,165,250,.12);border-color:#60A5FA;color:#93C5FD}
    .nav-link.active{border-color:rgba(239,68,68,.35);color:#EF4444;background:rgba(239,68,68,.08)}
    @media(max-width:600px){.cards-grid{grid-template-columns:repeat(auto-fill,minmax(90px,1fr))}}
  </style>
</head>
<body>
<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo"><img src="/c3logo.png" alt="C3" style="height:24px;border-radius:4px"> C3</a>
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
    <div class="hero-eyebrow">One Piece · Set</div>
    <h1 class="hero-title">${set.name}</h1>
    <div class="hero-meta">
      <span class="meta-badge">One Piece</span>
      ${set.release_date ? `<span>Released: ${set.release_date.slice(0,10)}</span>` : ''}
      ${set.card_count ? `<span>${set.card_count} cards</span>` : ''}
      ${cards?.length ? `<span>${pricedCards.length} priced in AUD</span>` : ''}
    </div>
    ${pricedCards.length >= 2 ? `
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:16px;padding:16px;background:#0e1118;border:1px solid #C9A84C22;border-radius:10px">
      <div><div style="font-size:10px;color:#8892b0;text-transform:uppercase;letter-spacing:.1em">Set Total Value</div><div style="font-size:18px;font-weight:700;color:#C9A84C;font-family:'Cinzel',serif">AU$${pricedCards.reduce((s,c)=>s+(c.price_aud>0?parseFloat(c.price_aud):c.market_price>0?parseFloat(c.market_price)*1.58:0),0).toFixed(0)}</div></div>
      <div style="width:1px;background:#1e2235"></div>
      <div><div style="font-size:10px;color:#8892b0;text-transform:uppercase;letter-spacing:.1em">Most Valuable</div><div style="font-size:14px;font-weight:700;color:#e8eaf0">${pricedCards[0].name}</div><div style="font-size:12px;color:#C9A84C">AU$${(pricedCards[0].price_aud>0?parseFloat(pricedCards[0].price_aud):pricedCards[0].market_price>0?parseFloat(pricedCards[0].market_price)*1.58:0).toFixed(2)}</div></div>
      <div style="width:1px;background:#1e2235"></div>
      <div><div style="font-size:10px;color:#8892b0;text-transform:uppercase;letter-spacing:.1em">Avg Card Value</div><div style="font-size:18px;font-weight:700;color:#e8eaf0;font-family:'Cinzel',serif">AU$${(pricedCards.reduce((s,c)=>s+(c.price_aud>0?parseFloat(c.price_aud):c.market_price>0?parseFloat(c.market_price)*1.58:0),0)/pricedCards.length).toFixed(2)}</div></div>
    </div>` : ''}
  </div>

  <div class="cta-row">
    <a href="${ebaySetURL}" target="_blank" rel="noopener" class="cta-btn cta-primary" onclick="if(typeof gtag!=='undefined')gtag('event','ebay_set_click',{set_name:'${set.name}',game:'onepiece'})">Buy Cards on eBay AU →</a>
    <a href="${ebayBoxURL}" target="_blank" rel="noopener" class="cta-btn cta-secondary">Find Booster Box →</a>
    <a href="https://www.amazon.com.au/s?k=${encodeURIComponent(set.name + ' One Piece')}&tag=${AMAZON_TAG}" target="_blank" rel="noopener" class="cta-btn cta-secondary" style="border-color:rgba(255,153,0,.35);color:#ff9900">Search Amazon AU →</a>
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

  ${top5.length ? `<div class="section">
    <div class="section-title">Most Valuable Cards</div>
    <div class="cards-scroll">${top5HTML}</div>
  </div>` : ''}

  ${ebayListingsHTML ? `<div class="section">
    <div class="section-title">Live eBay AU Listings</div>
    <div class="ebay-grid">${ebayListingsHTML}</div>
    <a href="${ebaySetURL}" target="_blank" rel="noopener" style="font-size:13px;color:#EF4444;text-decoration:none">See all listings on eBay AU →</a>
  </div>` : ''}

  <div class="section">
    <div class="section-title">${cards?.length ? `All Cards (${cards.length})` : 'Cards'}</div>
    <div class="cards-grid">${allCardsHTML}</div>
  </div>

  <div style="background:#0e1118;border:1px solid #1e2235;border-radius:10px;padding:20px;font-size:13px;color:#8892b0">
    <strong style="color:#F0F2FF">About this set:</strong> One Piece card prices shown in AUD, converted from USD market data at approximately 1.58x. Prices update daily via tcgapi.dev. Always check eBay AU for live Australian market pricing before buying or selling.
    <div style="margin-top:10px"><a href="/cards/onepiece" style="color:#EF4444">← Back to all One Piece cards</a></div>
  </div>
</div>

<script>
if(typeof gtag!=='undefined'){
  document.querySelectorAll('a[href*="ebay"]').forEach(a=>a.addEventListener('click',()=>gtag('event','ebay_click',{game:'onepiece',set:'${set.name}'})));
}
</script>
</body>
</html>`, { status: 200, headers });

  } catch (err) {
    console.error('[onepiece-set-page.mjs] Error:', err.message);
    return new Response(graceful404(setSlug), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
};

export const config = { path: '/cards/onepiece/sets/:slug+' };
