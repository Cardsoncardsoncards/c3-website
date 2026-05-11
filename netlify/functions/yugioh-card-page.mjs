// netlify/functions/yugioh-card-page.mjs
// Serves dynamic Yu-Gi-Oh card pages at /cards/yugioh/[slug]
// Data from yugioh_cards table (synced via YGOPRODeck API)

const SUPABASE_URL       = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY  = Netlify.env.get('SUPABASE_ANON_KEY');
const EBAY_CLIENT_ID     = Netlify.env.get('EBAY_CLIENT_ID');
const EBAY_CLIENT_SECRET = Netlify.env.get('EBAY_CLIENT_SECRET');
const EPN_CAMPID         = '5339146789';
const AMAZON_TAG         = 'blasdigital-22';

// Card type accent colours — based on official YGO frame colours
const TYPE_ACCENTS = {
  'Normal Monster':   { accent: '#c8a332', border: 'rgba(200,163,50,.3)' },
  'Effect Monster':   { accent: '#c47d1c', border: 'rgba(196,125,28,.3)' },
  'Ritual Monster':   { accent: '#4a6bcc', border: 'rgba(74,107,204,.3)' },
  'Fusion Monster':   { accent: '#7c4a8c', border: 'rgba(124,74,140,.3)' },
  'Synchro Monster':  { accent: '#e8e8e8', border: 'rgba(232,232,232,.3)' },
  'XYZ Monster':      { accent: '#3a3a3a', border: 'rgba(255,255,255,.2)' },
  'Link Monster':     { accent: '#004a8c', border: 'rgba(0,74,140,.3)' },
  'Pendulum Monster': { accent: '#4a9e5c', border: 'rgba(74,158,92,.3)' },
  'Spell Card':       { accent: '#1d8348', border: 'rgba(29,131,72,.3)' },
  'Trap Card':        { accent: '#9b2d6e', border: 'rgba(155,45,110,.3)' },
};

function getTypeAccent(type) {
  if (!type) return { accent: '#f5a623', border: 'rgba(245,166,35,.3)' };
  for (const [key, val] of Object.entries(TYPE_ACCENTS)) {
    if (type.includes(key)) return val;
  }
  return { accent: '#f5a623', border: 'rgba(245,166,35,.3)' };
}

// Attribute colours
const ATTR_COLOURS = {
  LIGHT:  '#f0d060', DARK: '#8040c0', FIRE: '#e05020',
  WATER:  '#2080e0', EARTH: '#805040', WIND: '#40c060',
  DIVINE: '#f0a020',
};

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
  });
  if (!res.ok) throw new Error(`Supabase: ${await res.text()}`);
  return res.json();
}

async function getEbayToken() {
  const creds = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope'
  });
  const data = await res.json();
  return data.access_token;
}

async function getEbayListings(cardName, token) {
  const q = encodeURIComponent(`${cardName} yugioh`);
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

export default async (req) => {
  const url = new URL(req.url);
  const slug = url.pathname.replace('/cards/yugioh/', '').replace(/^\/|\/$/g, '');
  if (!slug) return new Response('Not found', { status: 404 });

  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=7200' };

  // Route guard: /cards/yugioh/sets/* is handled by yugioh-set-page function
  if (slug.startsWith('sets/')) {
    return new Response('Not found', { status: 404, headers });
  }

  try {
    const cards = await supabaseGet(`yugioh_cards?slug=eq.${encodeURIComponent(slug)}&limit=1`);
    if (!cards || cards.length === 0) return new Response(notFoundPage(slug), { status: 404, headers });
    const card = cards[0];

    const [relatedCards, ebayToken] = await Promise.all([
      card.archetype
        ? supabaseGet(`yugioh_cards?archetype=eq.${encodeURIComponent(card.archetype)}&slug=neq.${encodeURIComponent(slug)}&image_url=not.is.null&limit=12&order=market_price.desc`).catch(() => [])
        : supabaseGet(`yugioh_cards?type=eq.${encodeURIComponent(card.type||'')}&slug=neq.${encodeURIComponent(slug)}&image_url=not.is.null&limit=12&order=market_price.desc`).catch(() => []),
      (EBAY_CLIENT_ID && EBAY_CLIENT_SECRET) ? getEbayToken().catch(() => null) : Promise.resolve(null)
    ]);

    const ebayListings = ebayToken
      ? await getEbayListings(card.name, ebayToken).catch(() => [])
      : [];

    const priceAud = card.market_price ? (card.market_price * 1.58) : null;
    const typeAccent = getTypeAccent(card.type);
    const attrColour = ATTR_COLOURS[card.attribute] || '#888';
    const pageUrl = encodeURIComponent(`https://cardsoncardsoncards.com.au/cards/yugioh/${card.slug}`);
    const shareText = encodeURIComponent(`${card.name} Yu-Gi-Oh — ${priceAud ? '~AU$'+priceAud.toFixed(2) : 'check price'} on Cards on Cards on Cards`);
    const ebaySearchUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(card.name+' yugioh')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;

    const breadcrumb = {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://cardsoncardsoncards.com.au" },
        { "@type": "ListItem", "position": 2, "name": "Yu-Gi-Oh Cards", "item": "https://cardsoncardsoncards.com.au/cards/yugioh" },
        { "@type": "ListItem", "position": 3, "name": card.name, "item": `https://cardsoncardsoncards.com.au/cards/yugioh/${card.slug}` }
      ]
    };

    const productSchema = priceAud ? {
      "@context": "https://schema.org", "@type": "Product",
      "name": card.name,
      "description": card.description?.slice(0,200) || `${card.name} Yu-Gi-Oh card`,
      "image": card.image_url || '',
      "offers": { "@type": "Offer", "priceCurrency": "AUD", "price": priceAud.toFixed(2), "availability": "https://schema.org/InStock", "url": `https://cardsoncardsoncards.com.au/cards/yugioh/${card.slug}` }
    } : null;

    const isMonster = card.type && card.type.includes('Monster');

    const relatedHTML = relatedCards.length ? `
    <section style="max-width:1100px;margin:0 auto 24px;padding:0 24px">
      <h2 style="font-size:18px;margin-bottom:16px">${card.archetype ? `More ${card.archetype} Cards` : 'Related Cards'}</h2>
      <div class="card-carousel">
        ${relatedCards.map(c => `
          <a href="/cards/yugioh/${c.slug}" class="mini-card">
            ${c.image_url ? `<img src="${c.image_url}" alt="${c.name}" loading="lazy" style="width:100%;border-radius:6px">` : ''}
            <div class="mini-card-name">${c.name}</div>
            ${c.market_price ? `<div class="mini-card-price">~AU$${(c.market_price*1.58).toFixed(2)}</div>` : ''}
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
            <div style="font-size:13px;color:var(--text);margin-bottom:6px;line-height:1.3">${(item.title||card.name).slice(0,60)}...</div>
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
  <link rel="icon" type="image/png" href="/c3logo.png">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${card.name} Price Australia | Yu-Gi-Oh | Cards on Cards on Cards</title>
  <meta name="description" content="${card.name}${card.type ? ` (${card.type})` : ''} Yu-Gi-Oh card${priceAud ? ` — ~AU$${priceAud.toFixed(2)}` : ''}. ${card.description?.slice(0,100) || 'View price, card details, and buy on eBay AU.'}">
  <meta property="og:site_name" content="Cards on Cards on Cards">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/yugioh/${card.slug}">
  <meta property="og:title" content="${card.name} | Yu-Gi-Oh Price AU | Cards on Cards on Cards">
  ${card.image_url ? `<meta property="og:image" content="${card.image_url}">` : ''}
  <script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>
  ${productSchema ? `<script type="application/ld+json">${JSON.stringify(productSchema)}</script>` : ''}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#0a0c10;--bg2:#141720;--bg3:#1c2030;--accent:${typeAccent.accent};--text:#e8eaf0;--text2:#9ba3c4;--border:#2d3254;--radius:12px}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;font-size:16px;line-height:1.6}
    a{color:var(--accent);text-decoration:none}
    a:hover{text-decoration:underline}
    nav{position:sticky;top:0;z-index:100;background:rgba(10,12,16,.95);backdrop-filter:blur(16px);border-bottom:1px solid var(--border);padding:10px 0}
    .nav-inner{max-width:1100px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .nav-logo{font-family:'Cinzel',serif;font-size:13px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.1em}
    .nav-links{display:flex;gap:6px;flex-wrap:wrap}
    .nav-link{font-size:12px;padding:5px 10px;border-radius:6px;border:1px solid var(--border);color:var(--text2);transition:all .2s}
    .nav-link:hover,.nav-link.active{color:var(--accent);border-color:var(--accent);text-decoration:none}
    .card-hero{max-width:1100px;margin:0 auto;padding:32px 24px;display:grid;grid-template-columns:260px 1fr;gap:40px;align-items:start}
    @media(max-width:700px){.card-hero{grid-template-columns:1fr;gap:24px}}
    .card-image-col{position:sticky;top:80px}
    .card-image-wrap{position:relative;border-radius:8px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.7),0 0 0 1px ${typeAccent.border}}
    .card-image-wrap img{width:100%;display:block;border-radius:8px}
    .type-badge{display:inline-block;padding:5px 14px;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px;background:rgba(0,0,0,.3);border:1px solid var(--accent);color:var(--accent)}
    h1{font-family:'Cinzel',serif;font-size:clamp(20px,4vw,34px);font-weight:700;color:var(--text);line-height:1.15;margin-bottom:8px}
    .card-subtitle{font-size:14px;color:var(--text2);margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:center}
    .attr-badge{padding:3px 10px;border-radius:4px;font-size:12px;font-weight:700;background:${attrColour}22;border:1px solid ${attrColour}55;color:${attrColour}}
    .atk-def{display:flex;gap:16px;margin-bottom:20px}
    .atk-def-stat{background:var(--bg2);border:1px solid var(--accent);border-radius:8px;padding:10px 20px;text-align:center}
    .atk-def-label{font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--accent);margin-bottom:4px}
    .atk-def-value{font-family:'Cinzel',serif;font-size:26px;font-weight:700;color:var(--text)}
    .price-block{background:var(--bg2);border:1px solid ${typeAccent.border};border-radius:var(--radius);padding:20px;margin-bottom:20px;border-top:2px solid var(--accent)}
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
    .card-desc{font-size:14px;line-height:1.75;color:var(--text);white-space:pre-line;padding:16px;background:var(--bg3);border-radius:8px;border-left:3px solid var(--accent)}
    .card-carousel{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:12px;cursor:grab;scrollbar-width:thin;scrollbar-color:var(--border) transparent}
    .card-carousel:active{cursor:grabbing}
    .mini-card{flex:0 0 110px;scroll-snap-align:start;background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:6px;text-align:center;transition:border-color .2s}
    .mini-card:hover{border-color:var(--accent);text-decoration:none}
    .mini-card-name{font-size:9px;color:var(--text);margin-top:6px;line-height:1.3}
    .mini-card-price{font-size:10px;color:var(--accent);font-weight:700;margin-top:2px}
    .share-btn{padding:7px 14px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid var(--border);background:var(--bg3);color:var(--text2);transition:all .2s;font-family:'DM Sans',sans-serif;text-decoration:none;display:inline-block}
    .share-btn:hover{border-color:var(--accent);color:var(--accent);text-decoration:none}
    footer{border-top:1px solid var(--border);padding:32px 24px;text-align:center;font-size:13px;color:var(--text2)}
    footer a{color:var(--text2);margin:0 8px}
    .breadcrumb{max-width:1100px;margin:0 auto;padding:16px 24px 0;font-size:13px;color:var(--text2);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .breadcrumb a{color:var(--text2)}
    .breadcrumb a:hover{color:var(--accent)}
  </style>

  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
</head>
<body>
<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo">Cards on Cards on Cards</a>
    <div class="nav-links">
      <a href="/" class="nav-link">← Home</a>
      <a href="/cards/mtg" class="nav-link">MTG</a>
      <a href="/cards/yugioh" class="nav-link active">Yu-Gi-Oh</a>
      <a href="/shop.html" class="nav-link">Shop</a>
      <a href="/blog" class="nav-link">Blog</a>
      <a href="/compare" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(124,106,245,.35);color:#a78bfa;white-space:nowrap">Compare</a>
      <a href="/generators" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(201,168,76,.35);color:#C9A84C;white-space:nowrap">Generators</a>
      <a href="/tracker.html" class="nav-link">Tracker</a>
    </div>
  </div>
</nav>

<div class="breadcrumb">
  <a href="/">Home</a> / <a href="/cards/yugioh">Yu-Gi-Oh Cards</a> / <span>${card.name}</span>
</div>

<div class="card-hero">
  <div class="card-image-col">
    <div class="card-image-wrap">
      ${card.image_url
        ? `<img src="${card.image_url}" alt="${card.name} Yu-Gi-Oh card" loading="eager">`
        : `<div style="width:100%;padding-bottom:145%;background:var(--bg2);border:1px solid var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text2)">No image</div>`}
    </div>
  </div>

  <div>
    ${card.type ? `<span class="type-badge">${card.type}</span>` : ''}
    <h1>${card.name}</h1>

    <div class="card-subtitle">
      ${card.attribute ? `<span class="attr-badge">${card.attribute}</span>` : ''}
      ${card.race ? `<span style="color:var(--text2)">${card.race}</span>` : ''}
      ${card.level ? `<span style="color:var(--text2)">Level ${card.level}</span>` : ''}
      ${card.archetype ? `<span style="color:var(--text2)">Archetype: ${card.archetype}</span>` : ''}
    </div>

    ${isMonster && (card.atk !== null || card.def !== null) ? `
    <div class="atk-def">
      ${card.atk !== null ? `<div class="atk-def-stat"><div class="atk-def-label">ATK</div><div class="atk-def-value">${card.atk}</div></div>` : ''}
      ${card.def !== null ? `<div class="atk-def-stat"><div class="atk-def-label">DEF</div><div class="atk-def-value">${card.def}</div></div>` : ''}
    </div>` : ''}

    <div class="price-block">
      <div class="price-label">Current Price (AUD)</div>
      ${priceAud
        ? `<div class="price-main">~AU$${priceAud.toFixed(2)}</div>
           <div class="price-usd">US$${parseFloat(card.market_price).toFixed(2)} TCGplayer · Converted at 1.58 AUD</div>`
        : `<div class="price-main" style="color:var(--text2);font-size:20px">Check eBay AU</div>
           <div class="price-usd">Price data not yet available</div>`}
    </div>

    <div class="cta-group">
      <a href="${ebaySearchUrl}" target="_blank" rel="noopener" class="cta-btn cta-primary">Buy on eBay AU →</a>
      <a href="${ebaySearchUrl}&_nkw=${encodeURIComponent(card.name+' yugioh 1st edition')}" target="_blank" rel="noopener" class="cta-btn cta-secondary">Search 1st Edition eBay AU →</a>
      <a href="/tracker.html" class="cta-btn cta-secondary">Track This Card →</a>
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <span style="font-size:11px;color:var(--text2);font-weight:700;letter-spacing:.1em;text-transform:uppercase;align-self:center">Share</span>
      <button class="share-btn" onclick="navigator.clipboard.writeText(location.href).then(()=>{this.textContent='✓ Copied';setTimeout(()=>this.textContent='Copy Link',1500)})">Copy Link</button>
      <a class="share-btn" href="https://reddit.com/submit?url=${pageUrl}&title=${shareText}" target="_blank" rel="noopener">Reddit</a>
      <a class="share-btn" href="https://twitter.com/intent/tweet?text=${shareText}&url=${pageUrl}" target="_blank" rel="noopener">𝕏 Twitter</a>
      <a class="share-btn" href="https://wa.me/?text=${shareText}%20${pageUrl}" target="_blank" rel="noopener">WhatsApp</a>
    </div>
  </div>
</div>

<div class="card-sections">

  <div class="section">
    <h2>Card Details</h2>
    <div class="stats-grid" style="margin-bottom:20px">
      ${card.type ? `<div class="stat-box"><div class="stat-label">Card Type</div><div class="stat-value">${card.type}</div></div>` : ''}
      ${card.attribute ? `<div class="stat-box"><div class="stat-label">Attribute</div><div class="stat-value" style="color:${attrColour}">${card.attribute}</div></div>` : ''}
      ${card.race ? `<div class="stat-box"><div class="stat-label">Type</div><div class="stat-value">${card.race}</div></div>` : ''}
      ${card.level ? `<div class="stat-box"><div class="stat-label">Level/Rank</div><div class="stat-value">${'★'.repeat(Math.min(card.level,12))}</div></div>` : ''}
      ${isMonster && card.atk !== null ? `<div class="stat-box"><div class="stat-label">ATK</div><div class="stat-value" style="color:var(--accent)">${card.atk}</div></div>` : ''}
      ${isMonster && card.def !== null ? `<div class="stat-box"><div class="stat-label">DEF</div><div class="stat-value">${card.def}</div></div>` : ''}
      ${card.archetype ? `<div class="stat-box"><div class="stat-label">Archetype</div><div class="stat-value">${card.archetype}</div></div>` : ''}
    </div>
    ${card.description ? `<div class="card-desc">${card.description}</div>` : ''}
  </div>

  ${ebayHTML}

  ${card.archetype ? `
  <div class="section" style="background:rgba(0,0,0,.2);border-color:${typeAccent.border}">
    <h2>${card.archetype} Archetype</h2>
    <p style="font-size:14px;color:var(--text2);line-height:1.7;margin-bottom:16px">
      ${card.name} is part of the ${card.archetype} archetype. Cards in the same archetype often work together as a coherent strategy. Archetype cards can be significantly affected in value by banlist changes — check the current TCG banlist before buying or selling.
    </p>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <a href="/blog/yugioh-booster-boxes-australia/" class="cta-btn cta-secondary" style="display:inline-block;padding:8px 16px;font-size:13px">Yu-Gi-Oh Booster Boxes AU →</a>
      <a href="/blog/yugioh-tcg-beginners-guide-australia/" class="cta-btn cta-secondary" style="display:inline-block;padding:8px 16px;font-size:13px">Yu-Gi-Oh Beginners Guide →</a>
    </div>
  </div>` : ''}

  <div class="section" style="background:rgba(245,166,35,.04);border-color:rgba(245,166,35,.2)">
    <h2>Track This Card</h2>
    <p style="font-size:14px;color:var(--text2);margin-bottom:16px">The free C3 Tracker works for Yu-Gi-Oh, MTG, Pokemon, Lorcana and more. Track your collection value and know when prices move.</p>
    <a href="/tracker.html" class="cta-btn" style="display:inline-block;padding:10px 20px;background:rgba(245,166,35,.12);border:1px solid rgba(245,166,35,.35);color:var(--accent);border-radius:8px;font-weight:700">Get Free Tracker →</a>
  </div>

</div>

${relatedHTML}

<footer>
  <div style="margin-bottom:12px">
    <a href="/">Home</a><a href="/cards/mtg">MTG</a><a href="/cards/yugioh">Yu-Gi-Oh</a><a href="/blog">Blog</a><a href="/tracker.html">Tracker</a><a href="/contact.html">Contact</a>
  </div>
  <p>© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
  <p style="margin-top:6px;font-size:11px;opacity:.5">Prices are estimates based on TCGplayer USD data converted at approximately 1.58 AUD. Check eBay AU for live Australian pricing.</p>
</footer>
</body>
</html>`;

    return new Response(html, { status: 200, headers });

  } catch (err) {
    console.error('Yu-Gi-Oh card page error:', err.message);
    return new Response(`<html><body>Error: ${err.message}</body></html>`, { status: 500, headers });
  }
};

function notFoundPage(slug) {
  return `<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><title>Card Not Found | Cards on Cards on Cards</title></head>
  <body style="background:#0a0c10;color:#e8eaf0;font-family:sans-serif;text-align:center;padding:80px 24px">
    <h1 style="color:#f5a623;margin-bottom:16px">Card Not Found</h1>
    <p style="color:#9ba3c4;margin-bottom:24px">We couldn't find "${slug}" in our Yu-Gi-Oh database.</p>
    <a href="/cards/yugioh" style="background:#f5a623;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none">Browse Yu-Gi-Oh Cards →</a>
  
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
  cardsEl.innerHTML=tray.map(c=>'<div style="display:flex;align-items:center;gap:6px;background:#22263a;border:1px solid #2d3254;border-radius:8px;padding:6px 10px">'+(c.img?'<img src="'+c.img+'" style="width:28px;border-radius:3px">':'')+'<span style="font-size:12px;color:#e8eaf0;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+c.name+'</span><button onclick="removeFromCompare(''+c.slug+'')" style="background:none;border:none;color:#9ba3c4;cursor:pointer;font-size:14px;padding:0 2px">×</button></div>').join('');
  const btn=document.getElementById('c3-compare-btn');const lbl=document.getElementById('c3-compare-lbl');
  if(btn&&lbl){const pageSlug=btn.dataset.slug;const inTray=tray.some(c=>c.slug===pageSlug);btn.style.borderColor=inTray?'#7c6af5':'rgba(124,106,245,.4)';btn.style.color='#7c6af5';lbl.textContent=inTray?'Added ✓':'⚖️ Add to Compare';}
}
function addToCompare(slug,name,img,price,game){
  let tray=getCompareTray();
  if(tray.some(c=>c.slug===slug)){removeFromCompare(slug);return;}
  if(tray.length>=5){alert('Maximum 5 cards. Remove one first.');return;}
  tray.push({slug,name,img,price,game:'yugioh'});saveCompareTray(tray);renderCompareTray();
  if(typeof gtag!=='undefined')gtag('event','card_added_to_tray',{card_name:name,game:'yugioh'});
}
function removeFromCompare(slug){saveCompareTray(getCompareTray().filter(c=>c.slug!==slug));renderCompareTray();}
function goToCompare(){const tray=getCompareTray();if(!tray.length)return;window.location.href='/compare?cards='+tray.map(c=>c.slug).join(',');}
renderCompareTray();
if(typeof gtag!=='undefined'){document.querySelectorAll('a[href*="ebay"]').forEach(a=>a.addEventListener('click',()=>gtag('event','ebay_card_click',{game:'yugioh'})));}
</script>
</body></html>`;
}

export const config = { path: '/cards/yugioh/:slug+' };
