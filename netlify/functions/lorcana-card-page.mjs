// netlify/functions/lorcana-card-page.mjs
// Serves dynamic Lorcana card pages at /cards/lorcana/[slug]
// Data from lorcana_cards table (synced via Lorcast API)

const SUPABASE_URL       = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY  = Netlify.env.get('SUPABASE_ANON_KEY');
const EBAY_CLIENT_ID     = Netlify.env.get('EBAY_CLIENT_ID');
const EBAY_CLIENT_SECRET = Netlify.env.get('EBAY_CLIENT_SECRET');
const EPN_CAMPID         = '5339146789';
const AMAZON_TAG         = 'blasdigital-22';

// Lorcana ink colours — official community palette
const INK_COLOURS = {
  Amber:    { bg: '#f5a623', text: '#000' },
  Amethyst: { bg: '#7c3aed', text: '#fff' },
  Emerald:  { bg: '#059669', text: '#fff' },
  Ruby:     { bg: '#dc2626', text: '#fff' },
  Sapphire: { bg: '#2563eb', text: '#fff' },
  Steel:    { bg: '#6b7280', text: '#fff' },
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

async function getEbayListings(cardName, version, token) {
  const q = encodeURIComponent(`${cardName}${version ? ' '+version : ''} lorcana`);
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

function loreIcons(lore) {
  if (!lore || lore < 1) return '';
  return '◆'.repeat(Math.min(lore, 4));
}


async function handleSetPage(setSlug, headers) {
  const accent = '#3B82F6';
  // Try slug first, then numeric id fallback
  let sets = await supabaseGet(`lorcana_sets?slug=eq.${encodeURIComponent(setSlug)}&limit=1`);
  if (!sets || !sets[0]) {
    sets = await supabaseGet(`lorcana_sets?id=eq.${encodeURIComponent(setSlug)}&limit=1`);
  }

  const notFoundHtml = `<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><title>Set Not Found | Lorcana | Cards on Cards on Cards</title><meta name="robots" content="noindex"><link rel="icon" type="image/png" href="/c3logo.png"></head><body style="background:#0A0C14;color:#F0F2FF;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:16px;padding:24px;text-align:center"><h1 style="font-family:'Cinzel',serif;color:${accent}">Set Not Found</h1><p style="color:#A0A8C0">We couldn't find Lorcana set "${setSlug}".</p><a href="/cards/lorcana" style="color:${accent}">← Browse All Lorcana</a></body></html>`;

  if (!sets || !sets[0]) return new Response(notFoundHtml, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  const set = sets[0];

  const cards = await supabaseGet(`lorcana_cards?set_id=eq.${encodeURIComponent(set.id)}&order=market_price.desc.nullslast&limit=400&select=slug,name,version,image_url,market_price,price_aud,rarity,ink,collector_number`);

  const toAud = (c) => c.price_aud > 0 ? parseFloat(c.price_aud) : c.market_price > 0 ? c.market_price * 1.58 : 0;
  const isSingles = c => c.number !== null && c.number !== undefined && c.rarity !== 'None' && c.rarity !== null;
  const pricedCards = (cards || []).filter(c => isSingles(c) && toAud(c) > 0);
  const sealedCards = (cards || []).filter(c => !isSingles(c));
  const top5 = pricedCards.slice(0, 5);
  const ebaySetURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name + ' lorcana')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=5339146789&toolid=10001&mkevt=1`;
  const metaDesc = `Browse ${cards?.length || 0} Lorcana cards from ${set.name}. View card prices in AUD and buy on eBay AU. Updated daily.`;

  const top5HTML = top5.map(c => {
    const aud = toAud(c);
    const fullName = c.version ? `${c.name} (${c.version})` : c.name;
    return `<a href="/cards/lorcana/${c.slug}" style="flex:0 0 140px;background:#0e1118;border:1px solid rgba(59,130,246,.35);border-radius:10px;padding:10px;text-align:center;text-decoration:none;display:block">
      ${c.image_url ? `<img src="${c.image_url}" alt="${fullName}" style="width:100%;border-radius:6px;max-height:140px;object-fit:contain;margin-bottom:6px" loading="lazy">` : ''}
      <div style="font-size:11px;color:#e8eaf0;line-height:1.3;margin-bottom:4px;font-weight:600">${fullName}</div>
      ${aud > 0 ? `<div style="font-size:12px;color:#C9A84C;font-weight:700">AU$${aud.toFixed(2)}</div>` : ''}
    </a>`;
  }).join('');

  const allCardsHTML = (cards && cards.length) ? cards.filter(isSingles).map(c => {
    const aud = toAud(c);
    const fullName = c.version ? `${c.name} (${c.version})` : c.name;
    return `<a href="/cards/lorcana/${c.slug}" style="background:#0e1118;border:1px solid #1e2235;border-radius:8px;padding:8px;text-decoration:none;text-align:center;display:block">
      ${c.image_url ? `<img src="${c.image_url}" alt="${fullName}" style="width:100%;border-radius:4px;max-height:120px;object-fit:contain;margin-bottom:4px" loading="lazy">` : `<div style="height:100px;background:#1e2235;border-radius:4px;margin-bottom:4px;display:flex;align-items:center;justify-content:center;font-size:20px">🃏</div>`}
      <div style="font-size:10px;color:#e8eaf0;line-height:1.3;font-weight:600">${fullName}</div>
      ${aud > 0 ? `<div style="font-size:11px;color:#C9A84C;font-weight:700;margin-top:2px">AU$${aud.toFixed(2)}</div>` : ''}
    </a>`;
  }).join('') : `<div style="grid-column:1/-1;text-align:center;color:#8892b0;padding:32px;font-size:14px">Card list syncing — check back after tonight's update.</div>`;

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${set.name} | Lorcana Set | Cards on Cards on Cards</title>
  <meta name="description" content="${metaDesc}">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/lorcana/sets/${setSlug}">
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
    .nav-inner{max-width:1100px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:12px}
    .nav-logo{display:flex;align-items:center;gap:9px;font-family:'Cinzel',serif;font-size:11.5px;font-weight:700;letter-spacing:.12em;color:#C9A84C;text-decoration:none;text-transform:uppercase;white-space:nowrap;flex-shrink:0}
    .nav-logo img{height:32px;width:32px;border-radius:6px;object-fit:cover}
    .nav-links{display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
    .nav-link{display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid #252840;color:#A0A8C0;white-space:nowrap}
    .wrap{max-width:1200px;margin:0 auto;padding:0 20px 60px}
    .hero{padding:36px 0 24px;border-bottom:1px solid #1e2235;margin-bottom:28px}
    .hero-eyebrow{font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:${accent};margin-bottom:8px}
    .hero-title{font-family:'Cinzel',serif;font-size:clamp(22px,4vw,36px);font-weight:700;color:#F0F2FF;margin-bottom:8px}
    .hero-meta{display:flex;gap:12px;flex-wrap:wrap;font-size:13px;color:#8892b0}
    .cta-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:28px}
    .cta-btn{display:inline-flex;align-items:center;padding:11px 20px;border-radius:8px;font-weight:700;font-size:13px;text-decoration:none}
    .cta-primary{background:${accent};color:#fff}
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
    <a href="/" class="nav-logo"><img src="/c3logo.png" alt="C3"><span>Cards on Cards on Cards</span></a>
    <div class="nav-links">
      <a href="/" class="nav-link">Home</a>
      <a href="/cards/lorcana" class="nav-link" style="color:${accent};border-color:rgba(59,130,246,.4)">Lorcana</a>
      <a href="/shop.html" class="nav-link">Shop</a>
      <a href="/compare" class="nav-link">Compare</a>
      <a href="/tracker.html" class="nav-link">Tracker</a>
    </div>
  </div>
</nav>
<div class="wrap">
  <div class="hero">
    <div class="hero-eyebrow">Disney Lorcana · Set</div>
    <h1 class="hero-title">${set.name}</h1>
    <div class="hero-meta">
      ${set.release_date ? `<span>Released: ${set.release_date.slice(0,10)}</span>` : ''}
      ${set.card_count ? `<span>${set.card_count} cards</span>` : ''}
      ${pricedCards.length ? `<span>${pricedCards.length} priced in AUD</span>` : ''}
    </div>
  </div>
  <div class="cta-row">
    <a href="${ebaySetURL}" target="_blank" rel="noopener" class="cta-btn cta-primary">Buy Cards on eBay AU →</a>
    <a href="https://www.amazon.com.au/s?k=${encodeURIComponent(set.name + ' lorcana')}&tag=blasdigital-22" target="_blank" rel="noopener" class="cta-btn cta-secondary" style="border-color:rgba(255,153,0,.35);color:#ff9900">Search Amazon AU →</a>
  </div>
  ${top5.length ? `<div style="margin-bottom:28px"><div class="section-title">Most Valuable Cards</div><div class="cards-scroll">${top5HTML}</div></div>` : ''}
  <div style="margin-bottom:28px">
    <div class="section-title">${pricedCards.length ? `Singles (${pricedCards.length})` : 'Cards'}</div>
    <div class="cards-grid">${allCardsHTML}</div>
  </div>
  <div style="background:#0e1118;border:1px solid #1e2235;border-radius:10px;padding:20px;font-size:13px;color:#8892b0">
    <strong style="color:#F0F2FF">About this set:</strong> Lorcana card prices in AUD. Updated daily.
    <div style="margin-top:10px"><a href="/cards/lorcana" style="color:${accent}">← Back to all Lorcana cards</a></div>
  </div>
</div>
<footer style="border-top:1px solid #252840;padding:24px;text-align:center;color:#8892b0;font-size:12px;margin-top:20px">
  <p><a href="/" style="color:#8892b0;margin:0 8px">Home</a><a href="/cards/lorcana" style="color:#8892b0;margin:0 8px">Lorcana</a><a href="/blog" style="color:#8892b0;margin:0 8px">Blog</a><a href="/tracker.html" style="color:#8892b0;margin:0 8px">Tracker</a></p>
  <p style="margin-top:8px">© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
</footer>
</body></html>`;

  return new Response(html, { status: 200, headers });
}

export default async (req) => {
  const url = new URL(req.url);
  const slug = url.pathname.replace('/cards/lorcana/', '').replace(/^\/|\/$/g, '');
  if (!slug) return new Response('Not found', { status: 404 });

  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=7200' };

  if (slug.startsWith('sets/')) {
    const setSlug = slug.replace(/^sets\//, '').replace(/\/$/, '');
    return handleSetPage(setSlug, headers);
  }

  try {
    const cards = await supabaseGet(`lorcana_cards?slug=eq.${encodeURIComponent(slug)}&limit=1`);
    if (!cards || cards.length === 0) return new Response(notFoundPage(slug), { status: 404, headers });
    const card = cards[0];

    const [relatedCards, ebayToken] = await Promise.all([
      supabaseGet(`lorcana_cards?set_id=eq.${encodeURIComponent(card.set_id)}&slug=neq.${encodeURIComponent(slug)}&image_url=not.is.null&limit=12&order=collector_number.asc`).catch(() => []),
      (EBAY_CLIENT_ID && EBAY_CLIENT_SECRET) ? getEbayToken().catch(() => null) : Promise.resolve(null)
    ]);

    const ebayListings = ebayToken
      ? await getEbayListings(card.name, card.version, ebayToken).catch(() => [])
      : [];

    const priceAud = card.market_price ? (card.market_price * 1.58) : null;
    const inkColour = INK_COLOURS[card.ink] || { bg: '#888', text: '#fff' };
    const fullName = card.version ? `${card.name} — ${card.version}` : card.name;
    const pageUrl = encodeURIComponent(`https://cardsoncardsoncards.com.au/cards/lorcana/${card.slug}`);
    const shareText = encodeURIComponent(`${fullName} Lorcana — ${priceAud ? '~AU$'+priceAud.toFixed(2) : 'check price'} on Cards on Cards on Cards`);
    const ebaySearchUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(card.name+' lorcana')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;

    const breadcrumb = {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://cardsoncardsoncards.com.au" },
        { "@type": "ListItem", "position": 2, "name": "Lorcana Cards", "item": "https://cardsoncardsoncards.com.au/cards/lorcana" },
        { "@type": "ListItem", "position": 3, "name": card.set_name, "item": `https://cardsoncardsoncards.com.au/cards/lorcana/sets/${card.set_code}` },
        { "@type": "ListItem", "position": 4, "name": fullName, "item": `https://cardsoncardsoncards.com.au/cards/lorcana/${card.slug}` }
      ]
    };

    const productSchema = priceAud ? {
      "@context": "https://schema.org", "@type": "Product",
      "name": fullName,
      "description": card.card_text || `${fullName} — ${card.rarity} Lorcana card from ${card.set_name}`,
      "image": card.image_url || '',
      "offers": { "@type": "Offer", "priceCurrency": "AUD", "price": priceAud.toFixed(2), "availability": "https://schema.org/InStock", "url": `https://cardsoncardsoncards.com.au/cards/lorcana/${card.slug}` }
    } : null;

    const relatedHTML = relatedCards.length ? `
    <section style="max-width:1100px;margin:0 auto 24px;padding:0 24px">
      <h2 style="font-size:18px;margin-bottom:16px">More from ${card.set_name}</h2>
      <div class="card-carousel">
        ${relatedCards.map(c => `
          <a href="/cards/lorcana/${c.slug}" class="mini-card">
            ${c.image_url ? `<img src="${c.image_url}" alt="${c.name}" loading="lazy" style="width:100%;border-radius:6px">` : `<div style="height:80px;background:var(--bg3);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--text2)">${c.name}</div>`}
            <div class="mini-card-name">${c.name}${c.version ? `<br><span style="opacity:.6">${c.version}</span>` : ''}</div>
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
            <div style="font-size:13px;color:var(--text);margin-bottom:6px;line-height:1.3">${(item.title||card.name).slice(0,60)}${(item.title||'').length>60?'...':''}</div>
            <div style="font-size:16px;font-weight:700;color:var(--accent)">${price}</div>
          </a>`;
        }).join('')}
      </div>
      <a href="${ebaySearchUrl}" target="_blank" rel="noopener" class="cta-btn cta-secondary" style="display:inline-block;padding:10px 20px">See all listings on eBay AU →</a>
    </div>` : `
    <div class="section">
      <h2>Buy on eBay AU</h2>
      <a href="${ebaySearchUrl}" target="_blank" rel="noopener" class="cta-btn cta-primary">Search eBay AU for ${fullName} →</a>
    </div>`;

    const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${fullName} Price Australia | ${card.set_name} Lorcana | Cards on Cards on Cards</title>
  <meta name="description" content="${fullName} (${card.rarity || 'Lorcana'}) from ${card.set_name}${priceAud ? ` — ~AU$${priceAud.toFixed(2)}` : ''}. View price, card details, and buy on eBay AU. Australia's Lorcana price guide.">
  <meta property="og:site_name" content="Cards on Cards on Cards">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/lorcana/${card.slug}">
  <meta property="og:title" content="${fullName} | ${card.set_name} Lorcana | Cards on Cards on Cards">
  ${card.image_url ? `<meta property="og:image" content="${card.image_url}">` : ''}
  <script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>
  ${productSchema ? `<script type="application/ld+json">${JSON.stringify(productSchema)}</script>` : ''}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#0f1117;--bg2:#1a1d2e;--bg3:#22263a;--accent:#f5a623;--text:#e8eaf0;--text2:#9ba3c4;--border:#2d3254;--radius:12px;--ink:${inkColour.bg}}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;font-size:16px;line-height:1.6}
    a{color:var(--accent);text-decoration:none}
    a:hover{text-decoration:underline}
    nav{position:sticky;top:0;z-index:100;background:rgba(15,17,23,.92);backdrop-filter:blur(16px);border-bottom:1px solid var(--border);padding:10px 0}
    .nav-inner{max-width:1100px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .nav-logo{font-family:'Cinzel',serif;font-size:13px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.1em}
    .nav-links{display:flex;gap:6px;flex-wrap:wrap}
    .nav-link{font-size:12px;padding:5px 10px;border-radius:6px;border:1px solid var(--border);color:var(--text2);transition:all .2s}
    .nav-link:hover,.nav-link.active{color:var(--ink);border-color:var(--ink);text-decoration:none}
    .card-hero{max-width:1100px;margin:0 auto;padding:32px 24px;display:grid;grid-template-columns:280px 1fr;gap:40px;align-items:start}
    @media(max-width:700px){.card-hero{grid-template-columns:1fr;gap:24px}}
    .card-image-col{position:sticky;top:80px}
    .card-image-wrap{position:relative;border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6)}
    .card-image-wrap img{width:100%;display:block;border-radius:12px}
    .ink-badge{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:100px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:12px;background:var(--ink);color:${inkColour.text}}
    h1{font-family:'Cinzel',serif;font-size:clamp(20px,4vw,34px);font-weight:700;color:var(--text);line-height:1.15;margin-bottom:4px}
    .card-version{font-size:18px;color:var(--text2);margin-bottom:8px}
    .card-subtitle{font-size:14px;color:var(--text2);margin-bottom:16px}
    .lore-gems{display:flex;gap:6px;margin-bottom:16px}
    .lore-gem{width:20px;height:20px;background:var(--ink);clip-path:polygon(50% 0%,100% 50%,50% 100%,0% 50%);opacity:.9}
    .price-block{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:20px;border-top:3px solid var(--ink)}
    .price-label{font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--text2);margin-bottom:6px}
    .price-main{font-family:'Cinzel',serif;font-size:36px;font-weight:700;color:var(--accent)}
    .price-usd{font-size:13px;color:var(--text2);margin-top:2px}
    .cta-group{display:flex;flex-direction:column;gap:10px;margin-bottom:20px}
    .cta-btn{display:block;text-align:center;padding:12px 20px;border-radius:8px;font-weight:700;font-size:14px;transition:opacity .2s;cursor:pointer;border:none;font-family:'DM Sans',sans-serif}
    .cta-btn:hover{opacity:.85;text-decoration:none}
    .cta-primary{background:var(--ink);color:${inkColour.text}}
    .cta-secondary{background:var(--bg3);border:1px solid var(--border);color:var(--text)}
    .card-sections{max-width:1100px;margin:0 auto;padding:0 24px 48px}
    .section{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:24px}
    .section h2{font-size:18px;margin-bottom:16px;color:var(--text)}
    .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}
    .stat-box{background:var(--bg3);border-radius:8px;padding:12px}
    .stat-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text2);margin-bottom:4px}
    .stat-value{font-size:15px;font-weight:700;color:var(--text)}
    .card-text-block{white-space:pre-line;font-size:14px;line-height:1.7;color:var(--text);padding:16px;background:var(--bg3);border-radius:8px;border-left:3px solid var(--ink)}
    .flavor-text{font-style:italic;color:var(--text2);font-size:13px;padding:12px 16px;border-top:1px solid var(--border);margin-top:12px}
    .card-carousel{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:12px;cursor:grab;scrollbar-width:thin;scrollbar-color:var(--border) transparent}
    .card-carousel:active{cursor:grabbing}
    .mini-card{flex:0 0 120px;scroll-snap-align:start;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center;transition:border-color .2s}
    .mini-card:hover{border-color:var(--ink);text-decoration:none}
    .mini-card-name{font-size:10px;color:var(--text);margin-top:6px;line-height:1.3}
    .mini-card-price{font-size:11px;color:var(--accent);font-weight:700;margin-top:2px}
    .share-btn{padding:7px 14px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid var(--border);background:var(--bg3);color:var(--text2);transition:all .2s;font-family:'DM Sans',sans-serif;text-decoration:none;display:inline-block}
    .share-btn:hover{border-color:var(--ink);color:var(--ink);text-decoration:none}
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
      <a href="/cards/lorcana" class="nav-link active">Lorcana</a>
      <a href="/shop.html" class="nav-link">Shop</a>
      <a href="/blog" class="nav-link">Blog</a>
      <a href="/compare" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(124,106,245,.35);color:#a78bfa;white-space:nowrap">Compare</a>
      <a href="/generators" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(201,168,76,.35);color:#C9A84C;white-space:nowrap">Generators</a>
      <a href="/tracker.html" class="nav-link">Tracker</a>
    </div>
  </div>
</nav>

<div class="breadcrumb">
  <a href="/">Home</a> / <a href="/cards/lorcana">Lorcana Cards</a> / <a href="/cards/lorcana/sets/${card.set_code}">${card.set_name}</a> / <span>${fullName}</span>
</div>

<div class="card-hero">
  <div class="card-image-col">
    <div class="card-image-wrap">
      ${card.image_url
        ? `<img src="${card.image_url}" alt="${fullName} Lorcana card" loading="eager">`
        : `<div style="width:100%;padding-bottom:140%;background:var(--bg2);border:1px solid var(--border);border-radius:12px;display:flex;align-items:center;justify-content:center;color:var(--text2)">No image</div>`}
    </div>
    ${card.collector_number ? `<p style="text-align:center;font-size:12px;color:var(--text2);margin-top:10px">${card.set_name} · #${card.collector_number}</p>` : ''}
  </div>

  <div>
    ${card.ink ? `<span class="ink-badge">◆ ${card.ink} Ink</span>` : ''}
    <h1>${card.name}</h1>
    ${card.version ? `<div class="card-version">${card.version}</div>` : ''}
    <p class="card-subtitle">${(card.type||[]).join(' · ')} · ${card.set_name} · ${card.rarity || 'Lorcana'}</p>

    ${card.lore ? `<div class="lore-gems" title="${card.lore} Lore">${'<div class="lore-gem"></div>'.repeat(Math.min(card.lore,4))}<span style="font-size:12px;color:var(--text2);margin-left:4px">${card.lore} Lore</span></div>` : ''}

    <div class="price-block">
      <div class="price-label">Current Price (AUD)</div>
      ${priceAud
        ? `<div class="price-main">~AU$${priceAud.toFixed(2)}</div>
           <div class="price-usd">US$${parseFloat(card.market_price).toFixed(2)} · Converted at 1.58 AUD</div>`
        : `<div class="price-main" style="color:var(--text2);font-size:20px">Check eBay AU</div>
           <div class="price-usd">Price data not yet available</div>`}
    </div>

    <div class="cta-group">
      <a href="${ebaySearchUrl}" target="_blank" rel="noopener" class="cta-btn cta-primary">Buy on eBay AU →</a>
      <a href="https://www.amazon.com.au/s?k=${encodeURIComponent(card.name+' lorcana')}&tag=${AMAZON_TAG}" target="_blank" rel="noopener" class="cta-btn cta-secondary" style="border-color:#f90;color:#f90">Search Amazon AU →</a>
      <a href="/tracker.html" class="cta-btn cta-secondary">Track This Card →</a>
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
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
    <div class="stats-grid">
      ${card.cost !== null ? `<div class="stat-box"><div class="stat-label">Ink Cost</div><div class="stat-value">${card.cost}${card.inkwell ? ' ✓' : ''}</div></div>` : ''}
      ${card.strength !== null ? `<div class="stat-box"><div class="stat-label">Strength</div><div class="stat-value">${card.strength}</div></div>` : ''}
      ${card.willpower !== null ? `<div class="stat-box"><div class="stat-label">Willpower</div><div class="stat-value">${card.willpower}</div></div>` : ''}
      ${card.lore ? `<div class="stat-box"><div class="stat-label">Lore</div><div class="stat-value">${'◆'.repeat(card.lore)}</div></div>` : ''}
      ${card.rarity ? `<div class="stat-box"><div class="stat-label">Rarity</div><div class="stat-value">${card.rarity}</div></div>` : ''}
      ${card.ink ? `<div class="stat-box"><div class="stat-label">Ink</div><div class="stat-value" style="color:var(--ink)">${card.ink}</div></div>` : ''}
      ${card.inkwell !== null ? `<div class="stat-box"><div class="stat-label">Inkwell</div><div class="stat-value">${card.inkwell ? 'Yes — Can be inkd' : 'No — Cannot be inkd'}</div></div>` : ''}
      ${card.move_cost !== null ? `<div class="stat-box"><div class="stat-label">Move Cost</div><div class="stat-value">${card.move_cost}</div></div>` : ''}
    </div>
    ${card.card_text ? `<div class="card-text-block" style="margin-top:20px">${card.card_text}</div>` : ''}
    ${card.flavor_text ? `<div class="flavor-text">${card.flavor_text}</div>` : ''}
  </div>

  ${ebayHTML}

  <div class="section">
    <h2>About This Card</h2>
    <p style="font-size:14px;color:var(--text2);line-height:1.7;margin-bottom:16px">
      ${fullName} is a ${card.rarity || ''} ${(card.type||[]).join('/')} card from ${card.set_name}.
      ${card.ink ? `It uses ${card.ink} ink` : ''}${card.inkwell ? ' and can be placed in your inkwell' : card.inkwell === false ? ' but cannot be placed in your inkwell' : ''}.
      ${card.lore ? `When challenged and a quest is successful, it provides ${card.lore} lore.` : ''}
    </p>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <a href="/cards/lorcana/sets/${card.set_code}" class="cta-btn cta-secondary" style="display:inline-block;padding:8px 16px;font-size:13px">Browse ${card.set_name} →</a>
      <a href="/blog/is-disney-lorcana-worth-starting-2026-australia/" class="cta-btn cta-secondary" style="display:inline-block;padding:8px 16px;font-size:13px">Is Lorcana worth it? →</a>
    </div>
  </div>

  <div class="section" style="background:rgba(245,166,35,.04);border-color:rgba(245,166,35,.2)">
    <h2>Track Your Lorcana Collection</h2>
    <p style="font-size:14px;color:var(--text2);margin-bottom:16px">The free C3 Tracker works for Lorcana, MTG, Pokemon and more. Track value, wishlist cards, and know when to sell.</p>
    <a href="/tracker.html" class="cta-btn" style="display:inline-block;padding:10px 20px;background:rgba(245,166,35,.12);border:1px solid rgba(245,166,35,.35);color:var(--accent);border-radius:8px;font-weight:700">Get Free Tracker →</a>
  </div>

</div>

${relatedHTML}

<footer>
  <div style="margin-bottom:12px">
    <a href="/">Home</a><a href="/cards/mtg">MTG</a><a href="/cards/lorcana">Lorcana</a><a href="/blog">Blog</a><a href="/tracker.html">Tracker</a><a href="/contact.html">Contact</a>
  </div>
  <p>© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
  <p style="margin-top:6px;font-size:11px;opacity:.5">Prices are estimates based on USD data converted at approximately 1.58 AUD. Check eBay AU for live pricing.</p>
</footer>
</body>
</html>`;

    return new Response(html, { status: 200, headers });

  } catch (err) {
    console.error('Lorcana card page error:', err.message);
    return new Response(`<html><body>Error: ${err.message}</body></html>`, { status: 500, headers });
  }
};

function notFoundPage(slug) {
  return `<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><title>Card Not Found | Cards on Cards on Cards</title></head>
  <body style="background:#0f1117;color:#e8eaf0;font-family:sans-serif;text-align:center;padding:80px 24px">
    <h1 style="color:#f5a623;margin-bottom:16px">Card Not Found</h1>
    <p style="color:#9ba3c4;margin-bottom:24px">We couldn't find "${slug}" in our Lorcana database.</p>
    <a href="/cards/lorcana" style="background:#f5a623;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none">Browse Lorcana Cards →</a>
  
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
  tray.push({slug,name,img,price,game:'lorcana'});saveCompareTray(tray);renderCompareTray();
  if(typeof gtag!=='undefined')gtag('event','card_added_to_tray',{card_name:name,game:'lorcana'});
}
function removeFromCompare(slug){saveCompareTray(getCompareTray().filter(c=>c.slug!==slug));renderCompareTray();}
function goToCompare(){const tray=getCompareTray();if(!tray.length)return;window.location.href='/compare?cards='+tray.map(c=>c.slug).join(',');}
renderCompareTray();
if(typeof gtag!=='undefined'){document.querySelectorAll('a[href*="ebay"]').forEach(a=>a.addEventListener('click',()=>gtag('event','ebay_card_click',{game:'lorcana'})));}
</script>
</body></html>`;
}

export const config = { path: '/cards/lorcana/:slug+' };
