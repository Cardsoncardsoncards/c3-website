// netlify/functions/pokemon-card-page.mjs
// Serves dynamic Pokemon card pages at /cards/pokemon/[slug]
// Mirrors MTG card page structure, adapted for Pokemon TCG data from TCGdex

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EBAY_CLIENT_ID    = Netlify.env.get('EBAY_CLIENT_ID');
const EBAY_CLIENT_SECRET = Netlify.env.get('EBAY_CLIENT_SECRET');
const EPN_CAMPID        = '5339146789';
const AMAZON_TAG        = 'blasdigital-22';

// Energy type colours matching official Pokemon palette
const ENERGY_COLOURS = {
  Fire:      { bg: '#fd7d24', text: '#fff' },
  Water:     { bg: '#4592c4', text: '#fff' },
  Grass:     { bg: '#4dbd5f', text: '#fff' },
  Lightning: { bg: '#eed535', text: '#000' },
  Psychic:   { bg: '#a95dac', text: '#fff' },
  Fighting:  { bg: '#d56723', text: '#fff' },
  Darkness:  { bg: '#707070', text: '#fff' },
  Metal:     { bg: '#9eb7b8', text: '#000' },
  Dragon:    { bg: '#6f35fc', text: '#fff' },
  Colorless: { bg: '#b8b8b8', text: '#000' },
  Fairy:     { bg: '#ee99ac', text: '#000' },
};

// Rarity tiers — visual prominence ordering
const RARITY_TIER = {
  'Hyper Rare': 5, 'Special Illustration Rare': 5,
  'Illustration Rare': 4, 'Double Rare': 4,
  'Ultra Rare': 4, 'Rare Holo': 3,
  'Rare': 2, 'Uncommon': 1, 'Common': 0
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

async function getEbayListings(cardName, setName, token) {
  const q = encodeURIComponent(`${cardName} pokemon card ${setName}`);
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${q}&category_ids=183454&filter=buyingOptions%3A%7BFIXED_PRICE%7D&sort=price&limit=8`;
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

function energyPips(types) {
  if (!types || !types.length) return '';
  return types.map(t => {
    const c = ENERGY_COLOURS[t] || { bg: '#888', text: '#fff' };
    return `<span class="energy-pip" style="background:${c.bg};color:${c.text}" title="${t}">${t[0]}</span>`;
  }).join('');
}

function rarityClass(rarity) {
  const tier = RARITY_TIER[rarity] || 0;
  if (tier >= 5) return 'rarity-chase';
  if (tier >= 4) return 'rarity-ultra';
  if (tier >= 3) return 'rarity-holo';
  if (tier >= 2) return 'rarity-rare';
  return 'rarity-common';
}

export default async (req) => {
  const url = new URL(req.url);
  const slug = url.pathname.replace('/cards/pokemon/', '').replace(/^\/|\/$/g, '');

  if (!slug) {
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  }

  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=7200' };

  try {
    // Fetch card
    const cards = await supabaseGet(`pokemon_cards?slug=eq.${encodeURIComponent(slug)}&limit=1`);
    if (!cards || cards.length === 0) {
      return new Response(notFoundPage(slug), { status: 404, headers });
    }
    const card = cards[0];

    // Parallel: related cards from same set, eBay listings
    const [relatedCards, ebayToken] = await Promise.all([
      supabaseGet(`pokemon_cards?set_id=eq.${encodeURIComponent(card.set_id)}&slug=neq.${encodeURIComponent(slug)}&image_uri=not.is.null&limit=12&order=number.asc`).catch(() => []),
      (EBAY_CLIENT_ID && EBAY_CLIENT_SECRET) ? getEbayToken().catch(() => null) : Promise.resolve(null)
    ]);

    const ebayListings = ebayToken
      ? await getEbayListings(card.name, card.set_name, ebayToken).catch(() => [])
      : [];

    const priceAud = card.price_usd ? (card.price_usd * 1.58) : null;
    const pageUrl = encodeURIComponent(`https://cardsoncardsoncards.com.au/cards/pokemon/${card.slug}`);
    const shareText = encodeURIComponent(`${card.name} — ${priceAud ? '~AU$'+priceAud.toFixed(2) : 'check price'} on Cards on Cards on Cards (Australia)`);

    const breadcrumb = {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://cardsoncardsoncards.com.au" },
        { "@type": "ListItem", "position": 2, "name": "Pokemon Cards", "item": "https://cardsoncardsoncards.com.au/cards/pokemon" },
        { "@type": "ListItem", "position": 3, "name": card.set_name, "item": `https://cardsoncardsoncards.com.au/cards/pokemon/sets/${card.set_id}` },
        { "@type": "ListItem", "position": 4, "name": card.name, "item": `https://cardsoncardsoncards.com.au/cards/pokemon/${card.slug}` }
      ]
    };

    const productSchema = priceAud ? {
      "@context": "https://schema.org", "@type": "Product",
      "name": card.name,
      "description": card.description || `${card.name} Pokemon card from ${card.set_name}`,
      "image": card.image_uri || '',
      "offers": { "@type": "Offer", "priceCurrency": "AUD", "price": priceAud.toFixed(2), "availability": "https://schema.org/InStock", "url": `https://cardsoncardsoncards.com.au/cards/pokemon/${card.slug}` }
    } : null;

    const faqSchema = {
      "@context": "https://schema.org", "@type": "FAQPage",
      "mainEntity": [
        { "@type": "Question", "name": `What is ${card.name} worth in Australia?`, "acceptedAnswer": { "@type": "Answer", "text": priceAud ? `${card.name} from ${card.set_name} is currently worth approximately AU$${priceAud.toFixed(2)} based on recent eBay AU sales.` : `${card.name} pricing varies. Check eBay AU for the most current Australian prices.` }},
        { "@type": "Question", "name": `Is ${card.name} rare?`, "acceptedAnswer": { "@type": "Answer", "text": card.rarity ? `${card.name} is a ${card.rarity} card from ${card.set_name}.` : `Check the card details for rarity information.` }},
        { "@type": "Question", "name": `What set is ${card.name} from?`, "acceptedAnswer": { "@type": "Answer", "text": `${card.name} is from the ${card.set_name} set${card.series ? `, part of the ${card.series} series` : ''}.${card.number ? ` It is card number ${card.number}.` : ''}` }}
      ]
    };

    const ebaySearchUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(card.name+' pokemon')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;

    const relatedHTML = relatedCards.length ? `
    <section class="related-section" style="max-width:1100px;margin:0 auto 24px;padding:0 24px">
      <h2 style="font-size:18px;margin-bottom:16px">More from ${card.set_name}</h2>
      <div class="card-carousel">
        ${relatedCards.map(c => `
          <a href="/cards/pokemon/${c.slug}" class="mini-card">
            ${c.image_uri ? `<img src="${c.image_uri}" alt="${c.name}" loading="lazy" style="width:100%;border-radius:6px">` : `<div style="height:80px;background:var(--bg3);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--text2)">${c.name}</div>`}
            <div class="mini-card-name">${c.name}</div>
            <div class="mini-card-price">${c.price_usd ? '~AU$'+(c.price_usd*1.58).toFixed(2) : ''}</div>
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
            <div style="font-size:13px;color:var(--text);margin-bottom:6px;line-height:1.3">${item.title?.slice(0,60) || card.name}${item.title?.length > 60 ? '...' : ''}</div>
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
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${card.name} Price Australia | ${card.set_name} | Cards on Cards on Cards</title>
  <meta name="description" content="${card.name}${card.rarity ? ` (${card.rarity})` : ''} from ${card.set_name}${priceAud ? ` is currently ~AU$${priceAud.toFixed(2)}` : ''}. View price, set details, and buy on eBay AU. Australia's Pokemon card price guide.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/pokemon/${card.slug}">
  <meta property="og:title" content="${card.name} | ${card.set_name} | Pokemon Price AU">
  <meta property="og:description" content="${priceAud ? `~AU$${priceAud.toFixed(2)} — ` : ''}${card.name} from ${card.set_name}. ${card.rarity || ''} Pokemon card.">
  ${card.image_uri ? `<meta property="og:image" content="${card.image_uri}">` : ''}
  <script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>
  ${productSchema ? `<script type="application/ld+json">${JSON.stringify(productSchema)}</script>` : ''}
  <script type="application/ld+json">${JSON.stringify(faqSchema)}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg:#0f1117;--bg2:#1a1d2e;--bg3:#22263a;
      --accent:#f5a623;--accent2:#4dbd5f;--text:#e8eaf0;
      --text2:#9ba3c4;--border:#2d3254;--radius:12px;
      --pokemon-red:#e3350d;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;font-size:16px;line-height:1.6}
    a{color:var(--accent);text-decoration:none}
    a:hover{text-decoration:underline}
    nav{position:sticky;top:0;z-index:100;background:rgba(15,17,23,.92);backdrop-filter:blur(16px);border-bottom:1px solid var(--border);padding:10px 0}
    .nav-inner{max-width:1100px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .nav-logo{font-family:'Cinzel',serif;font-size:13px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.1em}
    .nav-links{display:flex;gap:6px;flex-wrap:wrap}
    .nav-link{font-size:12px;padding:5px 10px;border-radius:6px;border:1px solid var(--border);color:var(--text2);transition:all .2s}
    .nav-link:hover{color:var(--text);border-color:var(--text2);text-decoration:none}
    .nav-link.active{color:var(--accent2);border-color:var(--accent2);background:rgba(77,189,95,.08)}
    .card-hero{max-width:1100px;margin:0 auto;padding:32px 24px;display:grid;grid-template-columns:280px 1fr;gap:40px;align-items:start}
    @media(max-width:700px){.card-hero{grid-template-columns:1fr;gap:24px}}
    .card-image-col{position:sticky;top:80px}
    .card-image-wrap{position:relative;border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6)}
    .card-image-wrap img{width:100%;display:block;border-radius:12px}
    .card-image-placeholder{width:100%;padding-bottom:140%;background:var(--bg2);border:1px solid var(--border);border-radius:12px;display:flex;align-items:center;justify-content:center;color:var(--text2);font-size:14px}
    .rarity-badge{display:inline-block;padding:4px 12px;border-radius:100px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px}
    .rarity-chase{background:linear-gradient(135deg,#ffd700,#ff69b4);color:#000}
    .rarity-ultra{background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff}
    .rarity-holo{background:rgba(124,106,245,.25);border:1px solid var(--accent2);color:var(--accent2)}
    .rarity-rare{background:rgba(245,166,35,.12);border:1px solid var(--accent);color:var(--accent)}
    .rarity-common{background:var(--bg3);border:1px solid var(--border);color:var(--text2)}
    h1{font-family:'Cinzel',serif;font-size:clamp(22px,4vw,36px);font-weight:700;color:var(--text);line-height:1.15;margin-bottom:8px}
    .card-subtitle{font-size:14px;color:var(--text2);margin-bottom:20px}
    .energy-pips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
    .energy-pip{width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid rgba(255,255,255,.15)}
    .price-block{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:20px}
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
    .hp-bar-wrap{margin-top:6px}
    .hp-bar{height:4px;background:var(--bg3);border-radius:2px;overflow:hidden;margin-top:4px}
    .hp-fill{height:100%;background:var(--pokemon-red);border-radius:2px;transition:width .4s ease}
    .card-carousel{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:12px;cursor:grab;scrollbar-width:thin;scrollbar-color:var(--border) transparent}
    .card-carousel:active{cursor:grabbing}
    .mini-card{flex:0 0 120px;scroll-snap-align:start;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center;transition:border-color .2s}
    .mini-card:hover{border-color:var(--accent);text-decoration:none}
    .mini-card-name{font-size:10px;color:var(--text);margin-top:6px;line-height:1.3}
    .mini-card-price{font-size:11px;color:var(--accent);font-weight:700;margin-top:2px}
    .share-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
    .share-btn{padding:7px 14px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid var(--border);background:var(--bg3);color:var(--text2);transition:all .2s;font-family:'DM Sans',sans-serif;text-decoration:none;display:inline-block}
    .share-btn:hover{border-color:var(--accent);color:var(--accent);text-decoration:none}
    footer{border-top:1px solid var(--border);padding:32px 24px;text-align:center;font-size:13px;color:var(--text2)}
    footer a{color:var(--text2);margin:0 8px}
    .breadcrumb{max-width:1100px;margin:0 auto;padding:16px 24px 0;font-size:13px;color:var(--text2);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .breadcrumb a{color:var(--text2)}
    .breadcrumb a:hover{color:var(--accent)}
    .breadcrumb-sep{opacity:.4}
  </style>
</head>
<body>
<nav style="background:rgba(8,10,15,.97);border-bottom:1px solid #1e2235;padding:10px 0;position:sticky;top:0;z-index:100;backdrop-filter:blur(16px)">
  <div style="max-width:1200px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
    <a href="/" style="display:flex;align-items:center;gap:8px;text-decoration:none;font-family:'Cinzel',serif;font-size:12px;font-weight:700;letter-spacing:.1em;color:#C9A84C;text-transform:uppercase">
      <img src="/c3logo.png" alt="C3" style="height:28px;width:28px;border-radius:5px;object-fit:cover;flex-shrink:0">
      <span>Cards on Cards on Cards</span>
    </a>
    <div style="display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none">
      <a href="/" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(160,196,255,.35);color:#A0C4FF;white-space:nowrap">&#8592; Home</a>
      <a href="/cards" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(201,168,76,.35);color:#C9A84C;white-space:nowrap">Card Vault</a>
      <a href="/cards/pokemon" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(255,204,0,.35);color:#FFCC00;background:rgba(255,204,0,.08);white-space:nowrap">Pokemon</a>
      <a href="/cards/mtg" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid #1e2235;color:#A0A8C0;white-space:nowrap">MTG</a>
      <a href="/calendar" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(248,113,113,.35);color:#F87171;white-space:nowrap">Calendar</a>
      <a href="/generators" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(34,211,238,.35);color:#22D3EE;white-space:nowrap">Generators</a>
      <a href="/shop.html" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(201,168,76,.35);color:#C9A84C;white-space:nowrap">Shop</a>
      <a href="/tracker.html" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(192,132,252,.35);color:#C084FC;white-space:nowrap">Tracker</a>
    </div>
  </div>
</nav>

<div class="breadcrumb">
  <a href="/">Home</a><span class="breadcrumb-sep">/</span>
  <a href="/cards/pokemon">Pokemon Cards</a><span class="breadcrumb-sep">/</span>
  <a href="/cards/pokemon/sets/${card.set_id}">${card.set_name}</a><span class="breadcrumb-sep">/</span>
  <span>${card.name}</span>
</div>

<div class="card-hero">
  <div class="card-image-col">
    <div class="card-image-wrap">
      ${card.image_uri
        ? `<img src="${card.image_uri}" alt="${card.name} — ${card.set_name} Pokemon card" loading="eager">`
        : `<div class="card-image-placeholder"><span>No image available</span></div>`}
    </div>
    ${card.number && card.set_name ? `<p style="text-align:center;font-size:12px;color:var(--text2);margin-top:10px">${card.set_name} · #${card.number}</p>` : ''}
  </div>

  <div class="card-info-col">
    ${card.rarity ? `<span class="rarity-badge ${rarityClass(card.rarity)}">${card.rarity}</span>` : ''}
    <h1>${card.name}</h1>
    <p class="card-subtitle">${card.category || 'Pokemon'} · ${card.set_name}${card.series ? ` · ${card.series}` : ''}</p>

    ${card.types && card.types.length ? `<div class="energy-pips">${energyPips(card.types)}</div>` : ''}

    <div class="price-block">
        <div class="price-label">Current Price (AUD)</div>
        ${priceAud
          ? `<div class="price-main">~AU$${priceAud.toFixed(2)}</div>
             <div class="price-usd">US$${parseFloat(card.price_usd).toFixed(2)} converted at 1.58 &middot; Source: TCGPlayer market data</div>
             <div style="margin-top:8px;font-size:12px;color:var(--text2);line-height:1.5">Estimated AUD price based on USD market data. Actual AU prices vary. Check eBay AU sold listings for the most accurate Australian value.</div>`
          : ebayListings.length && ebayListings[0].price?.value
            ? `<div class="price-main" style="font-size:26px">From AU$${parseFloat(ebayListings[0].price.value).toFixed(2)}</div>
               <div class="price-usd">Current Buy It Now listing on eBay AU &middot; Not a confirmed sold price</div>
               <div style="margin-top:8px;font-size:12px;color:var(--text2);line-height:1.5">No third-party market price data is available for this card. The price shown is the lowest current Buy It Now listing on eBay AU. Check recent eBay AU sold listings for actual market value in Australia.</div>`
            : `<div class="price-main" style="color:var(--text2);font-size:20px">Check eBay AU</div>
               <div style="margin-top:8px;font-size:12px;color:var(--text2);line-height:1.5">Price data is not yet available for this card. Use the Buy on eBay AU button below to see current Australian listings and recent sold prices.</div>`
        }
      </div>
      ${priceAud
        ? `<div class="price-main">~AU$${priceAud.toFixed(2)}</div>
           <div class="price-usd">US$${parseFloat(card.price_usd).toFixed(2)} · Converted at 1 USD = 1.58 AUD</div>`
        : `<div class="price-main" style="color:var(--text2);font-size:20px">Price unavailable</div>
           <div class="price-usd">Check eBay AU for current pricing</div>`}
    </div>

    <div class="cta-group">
      <a href="${ebaySearchUrl}" target="_blank" rel="noopener" class="cta-btn cta-primary">Buy on eBay AU →</a>
      <a href="https://www.amazon.com.au/s?k=${encodeURIComponent(card.name+' pokemon '+card.set_name)}&tag=${AMAZON_TAG}" target="_blank" rel="noopener" class="cta-btn cta-secondary" style="border-color:#f90;color:#f90">Search Amazon AU →</a>
      <a href="/tracker.html" class="cta-btn cta-secondary">Track This Card's Value →</a>
    </div>

    <div class="share-bar">
      <span style="font-size:11px;color:var(--text2);font-weight:700;letter-spacing:.1em;text-transform:uppercase">Share</span>
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
    <div class="stats-grid">
      ${card.stage ? `<div class="stat-box"><div class="stat-label">Stage</div><div class="stat-value">${card.stage}</div></div>` : ''}
      ${card.hp ? `<div class="stat-box">
        <div class="stat-label">HP</div>
        <div class="stat-value">${card.hp}</div>
        <div class="hp-bar-wrap"><div class="hp-bar"><div class="hp-fill" style="width:${Math.min(100,(card.hp/340)*100)}%"></div></div></div>
      </div>` : ''}
      ${card.rarity ? `<div class="stat-box"><div class="stat-label">Rarity</div><div class="stat-value">${card.rarity}</div></div>` : ''}
      ${card.number ? `<div class="stat-box"><div class="stat-label">Card Number</div><div class="stat-value">#${card.number}</div></div>` : ''}
      ${card.set_name ? `<div class="stat-box"><div class="stat-label">Set</div><div class="stat-value">${card.set_name}</div></div>` : ''}
      ${card.series ? `<div class="stat-box"><div class="stat-label">Series</div><div class="stat-value">${card.series}</div></div>` : ''}
      ${card.illustrator ? `<div class="stat-box"><div class="stat-label">Illustrator</div><div class="stat-value">${card.illustrator}</div></div>` : ''}
    </div>
    ${card.description ? `<div style="margin-top:20px;padding:16px;background:var(--bg3);border-radius:8px;font-size:14px;line-height:1.7;color:var(--text2);font-style:italic">${card.description}</div>` : ''}
  </div>

  ${ebayHTML}

  <div class="section">
    <h2>About ${card.set_name}</h2>
    <p style="font-size:14px;color:var(--text2);line-height:1.7;margin-bottom:16px">
      ${card.name} is a card from the ${card.set_name}${card.series ? ` set, part of the ${card.series} series` : ' set'}.
      ${card.rarity ? `It is classified as a ${card.rarity} card.` : ''}
      ${card.number ? `Card number ${card.number} in the set.` : ''}
    </p>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <a href="/cards/pokemon/sets/${card.set_id}" class="cta-btn cta-secondary" style="display:inline-block;padding:8px 16px;font-size:13px">Browse all ${card.set_name} cards →</a>
      <a href="/blog/best-pokemon-booster-boxes-australia/" class="cta-btn cta-secondary" style="display:inline-block;padding:8px 16px;font-size:13px">Is ${card.set_name} worth opening? →</a>
    </div>
  </div>

  <div class="section" style="background:rgba(77,189,95,.04);border-color:rgba(77,189,95,.2)">
    <h2>Track This Card</h2>
    <p style="font-size:14px;color:var(--text2);margin-bottom:16px">Use the free C3 TCG Collection Tracker to monitor this card's value over time. Works for Pokemon, MTG, Lorcana, and more.</p>
    <a href="/tracker.html" class="cta-btn" style="display:inline-block;padding:10px 20px;background:rgba(77,189,95,.15);border:1px solid rgba(77,189,95,.4);color:#4dbd5f;border-radius:8px;font-weight:700">Get Free Tracker →</a>
  </div>

</div>

${relatedHTML}

<footer>
  <div style="margin-bottom:12px">
    <a href="/">Home</a>
    <a href="/cards/mtg">MTG Cards</a>
    <a href="/cards/pokemon">Pokemon Cards</a>
    <a href="/blog">Blog</a>
    <a href="/tracker.html">Free Tracker</a>
    <a href="/contact.html">Contact</a>
  </div>
  <p>© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
  <p style="margin-top:6px;font-size:11px;opacity:.5">Prices are estimates based on USD Scryfall/TCGdex data converted at approximately 1.58 AUD. Check eBay AU for live Australian pricing.</p>
</footer>
</body>
</html>`;

    return new Response(html, { status: 200, headers });

  } catch (err) {
    console.error('Pokemon card page error:', err.message);
    return new Response(`<html><body>Error loading card: ${err.message}</body></html>`, { status: 500, headers });
  }
};

function notFoundPage(slug) {
  return `<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><title>Card Not Found | Cards on Cards on Cards</title></head>
  <body style="background:#0f1117;color:#e8eaf0;font-family:sans-serif;text-align:center;padding:80px 24px">
    <h1 style="color:#f5a623;margin-bottom:16px">Card Not Found</h1>
    <p style="color:#9ba3c4;margin-bottom:24px">We couldn't find "${slug}" in our Pokemon card database.</p>
    <a href="/cards/pokemon" style="background:#f5a623;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none">Browse Pokemon Cards →</a>
  </body></html>`;
}

export const config = { path: '/cards/pokemon/:slug+' };
