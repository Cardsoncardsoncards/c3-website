// netlify/functions/card-page.mjs
// Serves dynamic MTG card pages at /cards/mtg/[slug]
// Server-renders full HTML with all card data, price history, and interlinking

const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const EBAY_CLIENT_ID = Netlify.env.get('EBAY_CLIENT_ID');
const EBAY_CLIENT_SECRET = Netlify.env.get('EBAY_CLIENT_SECRET');
const EPN_CAMPID = '5339146789';
const AMAZON_TAG = 'blasdigital-22';

// --- Helpers ---

async function supabaseGet(path, useService = false) {
  const key = useService ? SUPABASE_SERVICE_KEY : SUPABASE_ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`Supabase error: ${await res.text()}`);
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

async function getEbayListing(cardName, token, fromStore = true) {
  const q = encodeURIComponent(`${cardName} mtg`);
  const sellerFilter = fromStore ? '%2Csellers%3A%7Bcardsoncardsoncards%7D' : '';
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${q}&category_ids=183454&filter=buyingOptions%3A%7BFIXED_PRICE%7D${sellerFilter}&sort=price&limit=3`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_AU',
      'X-EBAY-C-ENDUSERCTX': `affiliateCampaignId=${EPN_CAMPID}`
    }
  });
  const data = await res.json();
  const items = data.itemSummaries || [];
  // Extract numeric itemId from Browse API format (v1|123456|0 -> 123456)
  return items.map(item => ({
    ...item,
    itemId: item.itemId && item.itemId.includes('|') ? item.itemId.split('|')[1] : item.itemId
  }));
}

function formatAUD(num) {
  if (!num || num === 0) return null;
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(num);
}

function formatLegalities(legalities) {
  if (!legalities) return {};
  try {
    return typeof legalities === 'string' ? JSON.parse(legalities) : legalities;
  } catch { return {}; }
}

function formatManaSymbols(manaCost) {
  if (!manaCost) return '';
  return manaCost.replace(/\{([^}]+)\}/g, (_, sym) => {
    const s = sym.toLowerCase().replace('/', '');
    const colors = { w: '#f9faf4', u: '#aae0fa', b: '#cbc2bf', r: '#f9aa8f', g: '#9bd3ae' };
    const bg = colors[s] || '#ccc';
    return `<span class="mana-pip" style="background:${bg}" title="{${sym}}">${sym}</span>`;
  });
}

function getSellVerdict(priceAud, high52w, low52w) {
  if (!priceAud || !high52w || !low52w) return null;
  const range = high52w - low52w;
  if (range === 0) return null;
  const position = (priceAud - low52w) / range;
  if (position >= 0.85) return { label: 'Near 52-week high', advice: 'Potentially good time to sell', class: 'verdict-sell' };
  if (position <= 0.20) return { label: 'Near 52-week low', advice: 'Consider holding or buying', class: 'verdict-buy' };
  return { label: 'Mid-range price', advice: 'Price is within normal range', class: 'verdict-neutral' };
}

function getEdhrecLabel(rank) {
  if (!rank) return null;
  if (rank <= 50) return 'Commander staple';
  if (rank <= 200) return 'Very popular in Commander';
  if (rank <= 500) return 'Popular in Commander';
  if (rank <= 1000) return 'Played in Commander';
  if (rank <= 3000) return 'Occasionally played in Commander';
  return 'Niche Commander card';
}

function buildPriceChart(snapshots) {
  if (!snapshots || snapshots.length < 2) return '';
  const points = snapshots.slice(-90);
  const prices = points.map(p => parseFloat(p.price_aud || 0));
  const pricesFoil = points.map(p => parseFloat(p.price_aud_foil || 0));
  const usdRates = points.map(p => parseFloat(p.aud_usd_rate || 1.58));
  const maxPrice = Math.max(...prices, ...pricesFoil) * 1.15;
  const minPrice = Math.min(...prices.filter(p => p > 0), ...pricesFoil.filter(p => p > 0)) * 0.85;
  const w = 700, h = 220, pad = { t: 20, r: 20, b: 40, l: 60 };
  const chartW = w - pad.l - pad.r;
  const chartH = h - pad.t - pad.b;
  const n = points.length;

  function toX(i) { return pad.l + (i / (n - 1)) * chartW; }
  function toY(val) { return pad.t + chartH - ((val - minPrice) / (maxPrice - minPrice)) * chartH; }

  const nonFoilPath = prices.map((p, i) => (p > 0 ? `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(p)}` : '')).filter(Boolean).join(' ');
  const foilPath = pricesFoil.map((p, i) => (p > 0 ? `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(p)}` : '')).filter(Boolean).join(' ');

  const dates = points.map(p => new Date(p.snapshot_date));
  const labelIdxs = [0, Math.floor(n / 3), Math.floor(2 * n / 3), n - 1];
  const dateLabels = labelIdxs.map(i => {
    const d = dates[i];
    return `<text x="${toX(i)}" y="${h - 5}" text-anchor="middle" fill="#888" font-size="11">${d.getDate()} ${d.toLocaleString('en-AU', { month: 'short' })}</text>`;
  }).join('');

  const yLabels = [minPrice, (minPrice + maxPrice) / 2, maxPrice].map(v => {
    const y = toY(v);
    return `<text x="${pad.l - 5}" y="${y + 4}" text-anchor="end" fill="#888" font-size="11">$${v.toFixed(0)}</text>
            <line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="#333" stroke-width="0.5" stroke-dasharray="4"/>`;
  }).join('');

  return `
  <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:700px">
    <defs>
      <linearGradient id="gradNF" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f5a623" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#f5a623" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${yLabels}
    ${dateLabels}
    ${nonFoilPath ? `<path d="${nonFoilPath}" stroke="#f5a623" stroke-width="2" fill="none"/>` : ''}
    ${foilPath ? `<path d="${foilPath}" stroke="#7c6af5" stroke-width="2" fill="none" stroke-dasharray="5,3"/>` : ''}
    <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + chartH}" stroke="#555" stroke-width="1"/>
    <line x1="${pad.l}" y1="${pad.t + chartH}" x2="${pad.l + chartW}" y2="${pad.t + chartH}" stroke="#555" stroke-width="1"/>
  </svg>
  <div class="chart-legend">
    <span class="legend-nf">&#9644; AUD Non-foil</span>
    <span class="legend-foil">&#9644; AUD Foil</span>
  </div>`;
}

function renderHTML({ card, snapshots, relatedCards, sealedProducts, prevCard, nextCard, ebayListings, likeCount }) {
  const legalities = formatLegalities(card.legalities);
  const priceAud = card.price_aud > 0 ? parseFloat(card.price_aud) : (card.price_usd ? card.price_usd * 1.58 : null);
  const priceAudFoil = card.price_usd_foil ? card.price_usd_foil * 1.58 : null;
  const latestSnap = snapshots[snapshots.length - 1];
  const high52w = latestSnap?.price_52w_high_aud;
  const low52w = latestSnap?.price_52w_low_aud;
  const verdict = getSellVerdict(priceAud, high52w, low52w);
  const edhrecLabel = getEdhrecLabel(card.edhrec_rank);
  const isReserved = card.reserved;
  const isDoubleFaced = card.card_faces && card.card_faces.length > 1;
  const blogPosts = card.related_blog_posts || [];
  const setSlug = card.set_code;
  const hasEVCalc = ['stx', 'mh3', 'ltr', 'woe', 'mkm', 'otj', 'blb', 'dsk', 'fdn', 'dft', 'tdm'].includes(card.set_code);


  // Auto-generated context paragraph
  const legalFormats = ['standard','pioneer','modern','legacy','vintage','commander'].filter(f => legalities[f] === 'legal');
  const legalStr = legalFormats.length ? legalFormats.slice(0,3).map(f=>f.charAt(0).toUpperCase()+f.slice(1)).join(', ') + (legalFormats.length > 3 ? ' and more' : '') : 'no major formats';
  const trendStr = (() => {
    if (snapshots.length < 7) return '';
    const recent = snapshots.slice(-7).map(s => parseFloat(s.price_aud || 0));
    const avg = recent.reduce((a,b)=>a+b,0)/recent.length;
    const first = recent[0], last = recent[recent.length-1];
    if (last > first * 1.05) return ' The price has been trending up over the last week.';
    if (last < first * 0.95) return ' The price has dipped recently — potentially a good buying window.';
    return ' The price has been stable recently.';
  })();
  const edhStr = card.edhrec_rank ? (card.edhrec_rank <= 200 ? ' It is a Commander format staple.' : card.edhrec_rank <= 1000 ? ' It sees regular play in Commander.' : '') : '';
  const contextPara = \`<div class="card-context"><strong>\${card.name}</strong> is a \${card.rarity ? card.rarity.charAt(0).toUpperCase()+card.rarity.slice(1)+' ' : ''}\${card.type_line || 'card'} from <strong>\${card.set_name}</strong>.\${edhStr} Legal in \${legalStr}.\${trendStr} Prices shown are estimates based on US market data (Scryfall/TCGPlayer) converted to AUD. <a href="\${ebayAllUrl}" target="_blank" rel="noopener" style="color:var(--accent)">Check current eBay AU prices →</a></div>\`;

  
  // Share bar
  const pageUrl = encodeURIComponent(\`https://cardsoncardsoncards.com.au/cards/mtg/\${card.slug}\`);
  const shareText = encodeURIComponent(\`\${card.name} — \${priceAud ? '~AU$'+priceAud.toFixed(2) : 'check price'} on Cards on Cards on Cards (Australia)\`);
  const shareBar = \`<div class="share-bar">
    <span class="share-bar-label">Share</span>
    <button class="share-btn share-discord" onclick="navigator.clipboard.writeText('https://cardsoncardsoncards.com.au/cards/mtg/\${card.slug}').then(()=>{this.textContent='✓ Copied';setTimeout(()=>this.textContent='Discord',1500)})">Discord</button>
    <a href="https://reddit.com/submit?url=\${pageUrl}&title=\${shareText}" target="_blank" rel="noopener" class="share-btn share-reddit">Reddit</a>
    <a href="https://twitter.com/intent/tweet?text=\${shareText}&url=\${pageUrl}" target="_blank" rel="noopener" class="share-btn share-twitter">𝕏 Twitter</a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=\${pageUrl}" target="_blank" rel="noopener" class="share-btn share-facebook">Facebook</a>
    <a href="https://wa.me/?text=\${shareText}%20\${pageUrl}" target="_blank" rel="noopener" class="share-btn share-whatsapp">WhatsApp</a>
    <button class="share-btn share-copy" onclick="navigator.clipboard.writeText('https://cardsoncardsoncards.com.au/cards/mtg/\${card.slug}').then(()=>{this.textContent='✓ Copied!';setTimeout(()=>this.textContent='Copy Link',1500)})">Copy Link</button>
  </div>\`;

  const legalityBadges = ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'commander']
    .map(fmt => {
      const status = legalities[fmt] || 'not_legal';
      const label = status === 'legal' ? '✓' : status === 'banned' ? '✗' : '–';
      const cls = status === 'legal' ? 'legal' : status === 'banned' ? 'banned' : 'not-legal';
      return `<div class="legality-badge ${cls}"><span class="fmt-name">${fmt.charAt(0).toUpperCase() + fmt.slice(1)}</span><span class="fmt-status">${label}</span></div>`;
    }).join('');

  const ebayStoreListings = ebayListings.store || [];
  const ebayAllListings = ebayListings.all || [];
  const primaryEbay = ebayStoreListings.length > 0 ? ebayStoreListings : ebayAllListings;
  const fallbackEbay = ebayStoreListings.length > 0 ? ebayAllListings : [];

  const ebayStoreUrl = `https://www.ebay.com.au/str/cardsoncardsoncards?_nkw=${encodeURIComponent(card.name + ' mtg')}&campid=${EPN_CAMPID}`;
  const ebayAllUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(card.name + ' mtg')}&_sop=15&campid=${EPN_CAMPID}`;

  const relatedCardsHTML = relatedCards.length > 0 ? `
  <section class="related-cards">
    <h2>More Cards From ${card.set_name}</h2>
    <div class="card-carousel" id="related-carousel">
      ${relatedCards.map(c => `
        <a href="/cards/mtg/${c.slug}" class="mini-card">
          ${c.image_uri_small ? `<img src="${c.image_uri_small}" alt="${c.name}" loading="lazy">` : `<div class="mini-card-placeholder">${c.name}</div>`}
          <div class="mini-card-name">${c.name}</div>
          <div class="mini-card-price">${c.price_usd ? formatAUD(c.price_usd * 1.58) : 'N/A'}</div>
        </a>`).join('')}
    </div>
  </section>` : '';

  const sealedHTML = sealedProducts.length > 0 ? `
  <section class="sealed-products">
    <h2>Buy ${card.set_name} Sealed</h2>
    <div class="card-carousel" id="sealed-carousel">
      ${sealedProducts.map(p => `
        <a href="https://www.amazon.com.au/dp/${p.asin}?tag=${AMAZON_TAG}" class="sealed-card" target="_blank" rel="noopener">
          <div class="sealed-name">${p.name}</div>
          <div class="sealed-cta">View on Amazon AU →</div>
        </a>`).join('')}
    </div>
  </section>` : '';

  const blogHTML = blogPosts.length > 0 ? `
  <section class="blog-links">
    <h3>Related Guides</h3>
    <ul>
      ${blogPosts.map(p => `<li><a href="${p.url}">${p.title}</a></li>`).join('')}
    </ul>
  </section>` : '';

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      { "@type": "Question", "name": `What is ${card.name} worth in Australia?`, "acceptedAnswer": { "@type": "Answer", "text": priceAud ? `${card.name} is currently worth approximately ${formatAUD(priceAud)} AUD based on recent eBay AU sales and Scryfall pricing data.` : `${card.name} pricing varies. Check eBay AU for the most current Australian prices.` }},
      { "@type": "Question", "name": `Is ${card.name} legal in Commander?`, "acceptedAnswer": { "@type": "Answer", "text": legalities.commander === 'legal' ? `Yes, ${card.name} is legal in Commander (EDH).` : `No, ${card.name} is not legal in Commander.` }},
      { "@type": "Question", "name": `What sets was ${card.name} printed in?`, "acceptedAnswer": { "@type": "Answer", "text": `${card.name} was most recently printed in ${card.set_name}. Check all printings on this page for the full list.` }},
      { "@type": "Question", "name": `Should I buy or sell ${card.name} now?`, "acceptedAnswer": { "@type": "Answer", "text": verdict ? `${verdict.label}. ${verdict.advice} based on the 90-day AUD price trend.` : `Check the price history chart on this page to assess the current trend before buying or selling.` }}
    ]
  };

  const productSchema = priceAud ? {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": card.name,
    "description": card.oracle_text || `${card.name} Magic: The Gathering card`,
    "image": card.image_uri_normal || card.image_uri_small || '',
    "offers": {
      "@type": "Offer",
      "priceCurrency": "AUD",
      "price": priceAud.toFixed(2),
      "availability": "https://schema.org/InStock",
      "url": `https://cardsoncardsoncards.com.au/cards/mtg/${card.slug}`
    }
  } : null;

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://cardsoncardsoncards.com.au" },
      { "@type": "ListItem", "position": 2, "name": "MTG Cards", "item": "https://cardsoncardsoncards.com.au/cards/mtg" },
      { "@type": "ListItem", "position": 3, "name": card.set_name, "item": `https://cardsoncardsoncards.com.au/cards/mtg/sets/${setSlug}` },
      { "@type": "ListItem", "position": 4, "name": card.name, "item": `https://cardsoncardsoncards.com.au/cards/mtg/${card.slug}` }
    ]
  };

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${card.name} Price Australia | ${card.set_name} | Cards on Cards on Cards</title>
  <meta name="description" content="${card.name} is ${priceAud ? `currently ${formatAUD(priceAud)} AUD` : 'available'}. View price history, all printings, format legality, and buy on eBay AU. Australia's MTG price guide.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/mtg/${card.slug}">
  <meta property="og:title" content="${card.name} Price Australia | Cards on Cards on Cards">
  <meta property="og:description" content="${priceAud ? `${card.name} — ${formatAUD(priceAud)} AUD. ` : ''}MTG card price guide for Australia.">
  ${(card.image_uri_normal || card.image_uri_small) ? `<meta property="og:image" content="${card.image_uri_normal || card.image_uri_small}">` : ''}
  <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
  ${productSchema ? `<script type="application/ld+json">${JSON.stringify(productSchema)}</script>` : ''}
  <script type="application/ld+json">${JSON.stringify(faqSchema)}</script>
  <style>
    :root {
      --bg: #0f1117; --bg2: #1a1d2e; --bg3: #22263a;
      --accent: #f5a623; --accent2: #7c6af5; --text: #e8eaf0;
      --text2: #9ba3c4; --border: #2d3254; --green: #4caf50;
      --red: #f44336; --radius: 12px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: 'Georgia', serif; line-height: 1.6; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* Nav */
    .site-nav { background: var(--bg2); border-bottom: 1px solid var(--border); padding: 12px 24px; display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
    .site-nav .logo { font-weight: bold; font-size: 18px; color: var(--accent); }
    .site-nav a { color: var(--text2); font-size: 14px; font-family: sans-serif; }
    .site-nav a:hover { color: var(--text); }

    /* Breadcrumb */
    .breadcrumb { padding: 12px 24px; font-size: 13px; color: var(--text2); font-family: sans-serif; }
    .breadcrumb a { color: var(--text2); }

    /* Card header */
    .card-header { display: grid; grid-template-columns: auto 1fr; gap: 32px; max-width: 1100px; margin: 32px auto; padding: 0 24px; align-items: start; }
    @media (max-width: 700px) { .card-header { grid-template-columns: 1fr; } }

    .card-image-wrap { position: relative; width: 240px; }
    @media (max-width: 700px) { .card-image-wrap { width: 100%; max-width: 280px; margin: 0 auto; } }
    .card-image-wrap img { width: 100%; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.6); }
    .card-image-back { display: none; }
    .flip-btn { display: none; background: var(--bg3); border: 1px solid var(--border); color: var(--text); padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; margin-top: 8px; width: 100%; }
    ${isDoubleFaced ? '.flip-btn { display: block; }' : ''}

    .card-info h1 { font-size: 28px; font-weight: bold; margin-bottom: 4px; }
    .card-meta { color: var(--text2); font-size: 14px; font-family: sans-serif; margin-bottom: 16px; }
    .card-badges { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .badge { padding: 4px 10px; border-radius: 6px; font-size: 12px; font-family: sans-serif; font-weight: 600; }
    .badge-reserved { background: #7c1f1f; color: #ffcccc; }
    .badge-rarity-mythic { background: #7a3a00; color: #ffcc88; }
    .badge-rarity-rare { background: #4a3a00; color: #ffd700; }
    .badge-rarity-uncommon { background: #1a2a3a; color: #aaccee; }
    .badge-rarity-common { background: #222; color: #aaa; }
    .badge-edhrec { background: var(--bg3); color: var(--accent2); border: 1px solid var(--accent2); }

    /* Price block */
    .price-block { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; margin-bottom: 20px; }
    .price-main { font-size: 36px; font-weight: bold; color: var(--accent); }
    .price-foil { font-size: 18px; color: var(--accent2); margin-top: 4px; display: none; }
    .foil-toggle { display: flex; gap: 12px; margin-bottom: 12px; }
    .foil-toggle button { background: var(--bg3); border: 1px solid var(--border); color: var(--text2); padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; transition: all 0.2s; }
    .foil-toggle button.active { background: var(--accent); color: #000; border-color: var(--accent); }
    .price-stats { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 12px; font-family: sans-serif; font-size: 13px; }
    .price-stat { text-align: center; }
    .price-stat-label { color: var(--text2); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    .price-stat-value { font-weight: bold; margin-top: 2px; }
    .price-4x { color: var(--text2); font-size: 13px; margin-top: 8px; font-family: sans-serif; }
    .verdict { padding: 8px 14px; border-radius: 6px; font-size: 13px; font-family: sans-serif; margin-top: 10px; }
    .verdict-sell { background: rgba(76,175,80,0.15); border: 1px solid rgba(76,175,80,0.4); color: #81c784; }
    .verdict-buy { background: rgba(100,100,245,0.15); border: 1px solid rgba(100,100,245,0.4); color: #9fa8da; }
    .verdict-neutral { background: rgba(100,100,100,0.15); border: 1px solid #444; color: var(--text2); }
    .condition-guide { margin-top: 10px; font-size: 12px; color: var(--text2); font-family: sans-serif; }

    /* CTAs */
    .cta-group { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
    .cta-btn { display: block; text-align: center; padding: 12px 20px; border-radius: 8px; font-weight: bold; font-size: 15px; font-family: sans-serif; transition: opacity 0.2s; }
    .cta-btn:hover { opacity: 0.85; text-decoration: none; }
    .cta-primary { background: var(--accent); color: #000; }
    .cta-secondary { background: var(--bg3); border: 1px solid var(--border); color: var(--text); }
    .cta-amazon { background: #232f3e; border: 1px solid #f90; color: #f90; }
    .cta-like { background: var(--bg3); border: 1px solid var(--border); color: var(--text2); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .cta-like.liked { border-color: #e91e8c; color: #e91e8c; }
    .cta-collection { background: var(--bg3); border: 1px dashed var(--border); color: var(--text2); font-size: 13px; }
    .cta-ev { background: rgba(124,106,245,0.15); border: 1px solid var(--accent2); color: var(--accent2); }

    /* Nav prev/next */
    .card-nav { display: flex; gap: 12px; margin-bottom: 20px; font-family: sans-serif; font-size: 13px; }
    .card-nav a { background: var(--bg3); border: 1px solid var(--border); padding: 6px 14px; border-radius: 6px; color: var(--text2); }
    .card-nav a:hover { color: var(--text); text-decoration: none; }

    /* Sections */
    .card-sections { max-width: 1100px; margin: 0 auto; padding: 0 24px 48px; }
    .section { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; margin-bottom: 24px; }
    .section h2 { font-size: 18px; margin-bottom: 16px; color: var(--text); }
    .section h3 { font-size: 15px; margin-bottom: 12px; color: var(--text2); font-family: sans-serif; }

    /* Price chart */
    .chart-legend { display: flex; gap: 20px; font-size: 12px; color: var(--text2); margin-top: 8px; font-family: sans-serif; }
    .legend-nf { color: #f5a623; }
    .legend-foil { color: #7c6af5; }

    /* Card details */
    .oracle-text { white-space: pre-line; font-size: 15px; line-height: 1.7; margin-bottom: 12px; }
    .flavor-text { font-style: italic; color: var(--text2); font-size: 14px; border-top: 1px solid var(--border); padding-top: 10px; margin-top: 10px; }
    .card-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; font-family: sans-serif; font-size: 13px; }
    .card-stat { background: var(--bg3); border-radius: 8px; padding: 10px; }
    .card-stat-label { color: var(--text2); font-size: 11px; text-transform: uppercase; margin-bottom: 4px; }
    .card-stat-value { font-weight: bold; }
    .mana-pip { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; font-size: 11px; font-weight: bold; color: #000; margin: 0 1px; }
    .keyword-badges { display: flex; flex-wrap: wrap; gap: 6px; }
    .keyword-badge { background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; padding: 3px 8px; font-size: 12px; font-family: sans-serif; }

    /* Legalities */
    .legality-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px; }
    .legality-badge { border-radius: 8px; padding: 8px; text-align: center; font-family: sans-serif; font-size: 12px; }
    .legality-badge.legal { background: rgba(76,175,80,0.15); border: 1px solid rgba(76,175,80,0.4); }
    .legality-badge.banned { background: rgba(244,67,54,0.15); border: 1px solid rgba(244,67,54,0.4); }
    .legality-badge.not-legal { background: var(--bg3); border: 1px solid var(--border); color: var(--text2); }
    .fmt-name { display: block; font-weight: 600; }
    .fmt-status { font-size: 16px; }

    /* Related carousels */
    .related-cards, .sealed-products { max-width: 1100px; margin: 0 auto 24px; padding: 0 24px; }
    .related-cards h2, .sealed-products h2 { font-size: 18px; margin-bottom: 16px; }
    .card-carousel { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 12px; animation: scroll-carousel 40s linear infinite; }
    .card-carousel:hover { animation-play-state: paused; }
    @keyframes scroll-carousel { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
    .mini-card { flex: 0 0 140px; scroll-snap-align: start; background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 8px; text-align: center; transition: border-color 0.2s; }
    .mini-card:hover { border-color: var(--accent); text-decoration: none; }
    .mini-card img { width: 100%; border-radius: 6px; }
    .mini-card-name { font-size: 11px; color: var(--text); margin-top: 6px; line-height: 1.3; }
    .mini-card-price { font-size: 12px; color: var(--accent); font-weight: bold; margin-top: 2px; }
    .sealed-card { flex: 0 0 180px; scroll-snap-align: start; background: var(--bg2); border: 1px solid #f90; border-radius: 8px; padding: 16px; text-align: center; }
    .sealed-name { font-size: 13px; font-weight: bold; margin-bottom: 8px; }
    .sealed-cta { font-size: 12px; color: #f90; }

    /* Blog links */
    .blog-links { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; max-width: 1100px; margin: 0 auto 24px; }
    .blog-links h3 { margin-bottom: 12px; font-family: sans-serif; }
    .blog-links ul { list-style: none; }
    .blog-links li { padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 14px; font-family: sans-serif; }
    .blog-links li:last-child { border-bottom: none; }

    /* Price alert */
    .price-alert-form { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .price-alert-form input { flex: 1; min-width: 160px; background: var(--bg3); border: 1px solid var(--border); color: var(--text); padding: 8px 12px; border-radius: 6px; font-size: 13px; }
    .price-alert-form button { background: var(--accent); color: #000; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 13px; }

    /* Buylist */
    .buylist-cta { background: var(--bg3); border: 1px dashed var(--border); border-radius: 8px; padding: 16px; text-align: center; font-family: sans-serif; font-size: 14px; color: var(--text2); }
    .buylist-cta a { color: var(--accent); }


    /* Share Bar */
    .share-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:20px 0;padding:16px;background:rgba(201,168,76,.05);border:1px solid rgba(201,168,76,.12);border-radius:10px;font-family:sans-serif}
    .share-bar-label{font-size:12px;color:var(--text2);text-transform:uppercase;letter-spacing:.08em;margin-right:4px;white-space:nowrap}
    .share-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;border:none;cursor:pointer;transition:all .18s;white-space:nowrap}
    .share-btn:hover{transform:translateY(-1px);text-decoration:none;opacity:.9}
    .share-discord{background:#5865F2;color:#fff}
    .share-reddit{background:#FF4500;color:#fff}
    .share-twitter{background:#000;color:#fff}
    .share-facebook{background:#1877F2;color:#fff}
    .share-whatsapp{background:#25D366;color:#fff}
    .share-copy{background:var(--bg3);border:1px solid var(--border);color:var(--text)}
    .share-copy:hover{border-color:var(--accent);color:var(--accent)}
    /* Feedback */
    .feedback-tab{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:998;background:var(--accent);color:#000;font-size:11px;font-weight:700;letter-spacing:.06em;padding:10px 8px;border-radius:8px 0 0 8px;cursor:pointer;writing-mode:vertical-rl;font-family:sans-serif;border:none;transition:background .18s}
    .feedback-tab:hover{background:#E8C86A}
    .feedback-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:9999;align-items:center;justify-content:center}
    .feedback-overlay.open{display:flex}
    .feedback-modal{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:28px;max-width:420px;width:90%;font-family:sans-serif}
    .feedback-stars{display:flex;gap:8px;margin-bottom:14px}
    .feedback-star{font-size:26px;cursor:pointer;opacity:.35;transition:opacity .15s;background:none;border:none;padding:0;color:var(--accent)}
    .feedback-star.active{opacity:1}
    /* Context paragraph */
    .card-context{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:20px 24px;margin-bottom:24px;font-family:sans-serif;font-size:14px;line-height:1.7;color:var(--text2)}
    .card-context strong{color:var(--text)}
    /* Watch button */
    .cta-watch{background:var(--bg3);border:1px solid var(--border);color:var(--text2);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .2s}
    .cta-watch:hover,.cta-watch.watching{border-color:#e91e8c;color:#e91e8c}
    /* Collection counter */
    .collection-counter{display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;font-family:sans-serif;font-size:13px;margin-top:8px}
    .counter-btn{background:var(--bg2);border:1px solid var(--border);color:var(--text);width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;transition:border-color .18s}
    .counter-btn:hover{border-color:var(--accent);color:var(--accent)}
    /* Helpful bar */
    .helpful-bar{display:flex;align-items:center;gap:12px;padding:14px 18px;background:rgba(201,168,76,.04);border:1px solid rgba(201,168,76,.10);border-radius:8px;margin:20px 0;font-family:sans-serif;font-size:13px;color:var(--text2)}
    .helpful-btn{background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;transition:all .18s}
    .helpful-btn:hover,.helpful-btn.voted{border-color:var(--accent);color:var(--accent)}
    /* Newsletter inline */
    .newsletter-inline{background:rgba(124,106,245,.08);border:1px solid rgba(124,106,245,.25);border-radius:10px;padding:18px 20px;margin:24px 0;font-family:sans-serif}
    .newsletter-inline h4{font-size:14px;color:var(--accent2);margin-bottom:6px}
    .newsletter-inline p{font-size:13px;color:var(--text2);margin-bottom:12px}
    .newsletter-inline-form{display:flex;gap:8px;flex-wrap:wrap}
    .newsletter-inline-form input{flex:1;min-width:180px;background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:8px 12px;border-radius:6px;font-size:13px}
    .newsletter-inline-form button{background:var(--accent2);color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px}
    /* Price disclaimer */
    .price-disclaimer{font-size:11px;color:var(--text2);background:rgba(255,255,255,.03);border-radius:6px;padding:8px 12px;margin-top:8px;font-family:sans-serif;line-height:1.5}

    /* Footer */
    footer { background: var(--bg2); border-top: 1px solid var(--border); padding: 32px 24px; text-align: center; color: var(--text2); font-size: 13px; font-family: sans-serif; }
    footer a { color: var(--text2); margin: 0 12px; }
  </style>
</head>
<body>

<nav class="site-nav">
  <a href="/" class="logo">C3</a>
  <a href="/">Home</a>
  <a href="/shop.html">Shop</a>
  <a href="/blog">Blog</a>
  <a href="/ev-calculator.html">EV Calculator</a>
  <a href="/cards/mtg">MTG Cards</a>
  <a href="/cards/mtg/random-commander">Random Commander</a>
  <a href="/tracker.html">Free Tracker</a>
</nav>

<div class="breadcrumb">
  <a href="/">Home</a> › <a href="/cards/mtg">MTG Cards</a> › <a href="/cards/mtg/sets/${setSlug}">${card.set_name}</a> › ${card.name}
</div>

${contextPara}
<div class="card-header">
  <div class="card-image-wrap">
    <img id="card-front" src="${card.image_uri_normal || card.image_uri_small || ''}" alt="${card.name}" width="240">
    ${isDoubleFaced && card.card_faces?.[1]?.image_uris?.normal ? `<img id="card-back" class="card-image-back" src="${card.card_faces[1].image_uris.normal}" alt="${card.name} back face" width="240" style="display:none">` : ''}
    ${isDoubleFaced ? `<button class="flip-btn" onclick="flipCard()">⟳ Flip Card</button>` : ''}
  </div>

  <div class="card-info">
    <h1>${card.name}</h1>
    <div class="card-meta">${card.type_line || ''} · ${card.set_name} · ${card.rarity ? card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1) : ''} · Artist: ${card.artist || 'Unknown'}</div>

    <div class="card-badges">
      ${isReserved ? '<span class="badge badge-reserved">🔒 Reserved List</span>' : ''}
      ${card.rarity ? `<span class="badge badge-rarity-${card.rarity}">${card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1)}</span>` : ''}
      ${edhrecLabel ? `<span class="badge badge-edhrec">⚔️ ${edhrecLabel}</span>` : ''}
    </div>

    <div class="card-nav">
      ${prevCard ? `<a href="/cards/mtg/${prevCard.slug}">← ${prevCard.name}</a>` : ''}
      <a href="/cards/mtg/sets/${setSlug}">All ${card.set_name} Cards</a>
      ${nextCard ? `<a href="/cards/mtg/${nextCard.slug}">${nextCard.name} →</a>` : ''}
      <a href="/cards/mtg/random">Random Card</a>
    </div>

    <div class="price-block">
      <div class="foil-toggle">
        <button class="active" onclick="showPrice('nf',this)">Non-Foil</button>
        ${priceAudFoil ? `<button onclick="showPrice('foil',this)">Foil</button>` : ''}
        ${card.price_usd_etched ? `<button onclick="showPrice('etched',this)">Etched</button>` : ''}
      </div>
      <div class="price-main" id="price-display">${priceAud ? formatAUD(priceAud) : 'Price N/A'}</div>
      <div class="price-main" id="price-foil-display" style="display:none;color:var(--accent2)">${priceAudFoil ? formatAUD(priceAudFoil) : ''}</div>
      <div style="font-size:13px;color:var(--text2);font-family:sans-serif;margin-top:4px">USD ${card.price_usd ? `$${card.price_usd}` : 'N/A'} · Rate: 1 USD = ~1.58 AUD</div>

      ${(high52w || low52w) ? `
      <div class="price-stats">
        <div class="price-stat"><div class="price-stat-label">52W High</div><div class="price-stat-value">${formatAUD(high52w) || 'N/A'}</div></div>
        <div class="price-stat"><div class="price-stat-label">Current</div><div class="price-stat-value">${formatAUD(priceAud) || 'N/A'}</div></div>
        <div class="price-stat"><div class="price-stat-label">52W Low</div><div class="price-stat-value">${formatAUD(low52w) || 'N/A'}</div></div>
      </div>` : ''}

      ${priceAud ? `<div class="price-4x">4x copies = ${formatAUD(priceAud * 4)} AUD (full playset)</div>` : ''}

      ${verdict ? `<div class="verdict ${verdict.class}">📊 ${verdict.label} — ${verdict.advice}</div>` : ''}

      <div class="condition-guide">
        ${priceAud ? `Condition guide: NM ${formatAUD(priceAud)} · LP ${formatAUD(priceAud * 0.80)} · Played ${formatAUD(priceAud * 0.60)}` : ''}
      </div>
      <div class="price-disclaimer">
        Est. value based on US market data (Scryfall/TCGPlayer) converted at ~1.58 AUD/USD. eBay AU prices may differ.
        <a href="${ebayAllUrl}" target="_blank" rel="noopener" style="color:var(--accent)">Check eBay AU live prices →</a>
      </div>
    </div>

    <div class="cta-group">
      <a href="${ebayAllUrl}" class="cta-btn cta-primary" target="_blank" rel="noopener">🔍 Find on eBay AU</a>

      ${card.amazon_asin ? `<a href="https://www.amazon.com.au/dp/${card.amazon_asin}?tag=${AMAZON_TAG}" class="cta-btn cta-amazon" target="_blank" rel="noopener">📦 Buy Sealed on Amazon AU</a>` : ''}

      ${hasEVCalc ? `<a href="/ev-calculator.html#${card.set_code}" class="cta-btn cta-ev">📊 ${card.set_name} EV Calculator</a>` : ''}

      <button class="cta-btn cta-watch" id="watch-btn" onclick="toggleWatch('${card.scryfall_id}','${card.name.replace(/'/g,"\'")}')">
        <span id="watch-icon">☆</span> <span id="watch-label">Watch this card</span>
      </button>
      <div class="collection-counter">
        <span style="color:var(--text2)">My copies:</span>
        <button class="counter-btn" onclick="adjustCount(-1)">−</button>
        <span id="copy-count" style="font-weight:700;min-width:20px;text-align:center">0</span>
        <button class="counter-btn" onclick="adjustCount(1)">+</button>
        <span id="copy-value" style="color:var(--accent);font-size:12px"></span>
      </div>

      <button class="cta-btn cta-collection" onclick="document.getElementById('collection-modal').style.display='flex'">
        + Add to Collection (Coming Soon — Join Waitlist)
      </button>
    </div>
    ${shareBar}
  </div>
</div>

<div class="card-sections">

  <!-- Price History Chart -->
  ${snapshots.length > 1 ? `
  <div class="section">
    <h2>Price History (AUD)</h2>
    ${buildPriceChart(snapshots)}
    <p style="font-size:12px;color:var(--text2);margin-top:12px;font-family:sans-serif">
      Prices updated daily. Sourced from Scryfall. AUD conversion at live rate.
      <a href="https://scryfall.com/card/${card.set_code}/${card.collector_number}" target="_blank" rel="noopener" style="color:var(--text2)">Card data via Scryfall ↗</a>
    </p>
  </div>` : ''}

  <!-- Price Alert -->
  <div class="section">
    <h3>🔔 Price Alert</h3>
    <p style="font-size:13px;color:var(--text2);font-family:sans-serif;margin-bottom:12px">Get notified when ${card.name} drops below your target price in AUD.</p>
    <div class="price-alert-form">
      <input type="email" id="alert-email" placeholder="your@email.com">
      <input type="number" id="alert-price" placeholder="Target AUD price" step="0.50">
      <button onclick="submitPriceAlert('${card.scryfall_id}', '${card.name}')">Notify Me</button>
    </div>
    <div id="alert-msg" style="font-size:13px;margin-top:8px;font-family:sans-serif"></div>
  </div>

  <!-- Card Details -->
  <div class="section">
    <h2>Card Details</h2>
    ${card.oracle_text ? `<div class="oracle-text">${card.oracle_text}</div>` : ''}
    ${card.flavor_text ? `<div class="flavor-text">${card.flavor_text}</div>` : ''}
    <div class="card-stats-grid" style="margin-top:16px">
      ${card.mana_cost ? `<div class="card-stat"><div class="card-stat-label">Mana Cost</div><div class="card-stat-value">${formatManaSymbols(card.mana_cost)}</div></div>` : ''}
      ${card.cmc !== null ? `<div class="card-stat"><div class="card-stat-label">Mana Value</div><div class="card-stat-value">${card.cmc}</div></div>` : ''}
      ${card.power ? `<div class="card-stat"><div class="card-stat-label">Power / Toughness</div><div class="card-stat-value">${card.power} / ${card.toughness}</div></div>` : ''}
      ${card.loyalty ? `<div class="card-stat"><div class="card-stat-label">Starting Loyalty</div><div class="card-stat-value">${card.loyalty}</div></div>` : ''}
      <div class="card-stat"><div class="card-stat-label">Set</div><div class="card-stat-value"><a href="/cards/mtg/sets/${setSlug}">${card.set_name}</a></div></div>
      <div class="card-stat"><div class="card-stat-label">Collector #</div><div class="card-stat-value">${card.collector_number}</div></div>
      ${card.artist ? `<div class="card-stat"><div class="card-stat-label">Artist</div><div class="card-stat-value">${card.artist}</div></div>` : ''}
      ${card.edhrec_rank ? `<div class="card-stat"><div class="card-stat-label">EDHREC Rank</div><div class="card-stat-value">#${card.edhrec_rank.toLocaleString()}</div></div>` : ''}
    </div>
    ${card.keywords?.length > 0 ? `
    <div style="margin-top:16px">
      <div class="card-stat-label" style="font-family:sans-serif;font-size:11px;text-transform:uppercase;color:var(--text2);margin-bottom:8px">Keywords</div>
      <div class="keyword-badges">${card.keywords.map(k => `<span class="keyword-badge">${k}</span>`).join('')}</div>
    </div>` : ''}
  </div>

  <!-- Rulings -->
  ${card.rulings?.length > 0 ? `
  <div class="section">
    <h2>Official Rulings</h2>
    ${card.rulings.map(r => `
    <div style="padding:10px 0;border-bottom:1px solid var(--border);font-size:14px">
      <div style="color:var(--text2);font-size:11px;font-family:sans-serif;margin-bottom:4px">${r.published_at}</div>
      <div>${r.comment}</div>
    </div>`).join('')}
  </div>` : ''}

  <!-- Format Legality -->
  <div class="section">
    <h2>Format Legality</h2>
    <div class="legality-grid">${legalityBadges}</div>
  </div>


  <div class="newsletter-inline">
    <h4>📬 Weekly AUD Price Alerts</h4>
    <p>Get notified when cards you're watching drop in price. Australian prices, no spam.</p>
    <div class="newsletter-inline-form">
      <input type="email" id="nl-email" placeholder="your@email.com">
      <button onclick="subscribeNewsletter()">Subscribe Free</button>
    </div>
    <div id="nl-msg" style="font-size:12px;margin-top:6px;color:var(--text2)"></div>
  </div>
  <div class="helpful-bar" id="helpful-bar">
    <span>Was this page helpful?</span>
    <button class="helpful-btn" onclick="voteHelpful(1,this)">👍 Yes</button>
    <button class="helpful-btn" onclick="voteHelpful(0,this)">👎 No</button>
  </div>
</div>

${relatedCardsHTML}
${sealedHTML}
${blogHTML}

<div style="max-width:1100px;margin:0 auto 32px;padding:0 24px">
  <div class="buylist-cta">
    💰 Want to sell your ${card.name}? <a href="/tracker.html">Join the C3 buylist waitlist</a> and be first to know when we launch.
  </div>
</div>


<!-- Feedback Tab -->
<button class="feedback-tab" onclick="document.getElementById('feedback-overlay').classList.add('open')">Give Feedback</button>
<div id="feedback-overlay" class="feedback-overlay" onclick="if(event.target===this)this.classList.remove('open')">
  <div class="feedback-modal">
    <h3 style="margin-bottom:6px;color:var(--text)">Share Your Feedback</h3>
    <p style="font-size:13px;color:var(--text2);margin-bottom:14px">Help us build a better site for the Australian TCG community.</p>
    <div class="feedback-stars" id="feedback-stars">
      <button class="feedback-star" onclick="setFeedbackRating(1)">★</button>
      <button class="feedback-star" onclick="setFeedbackRating(2)">★</button>
      <button class="feedback-star" onclick="setFeedbackRating(3)">★</button>
      <button class="feedback-star" onclick="setFeedbackRating(4)">★</button>
      <button class="feedback-star" onclick="setFeedbackRating(5)">★</button>
    </div>
    <textarea id="feedback-text" style="width:100%;background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:10px;border-radius:8px;font-size:13px;resize:vertical;min-height:80px;margin-bottom:10px;font-family:sans-serif" placeholder="What can we improve? What features would you like?"></textarea>
    <input type="email" id="feedback-email" style="width:100%;background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:9px 12px;border-radius:8px;font-size:13px;margin-bottom:12px;font-family:sans-serif" placeholder="Email (optional — if you'd like a reply)">
    <button style="width:100%;background:var(--accent);color:#000;border:none;padding:10px;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px" onclick="submitFeedback()">Send Feedback</button>
    <button style="width:100%;background:none;border:none;color:var(--text2);margin-top:8px;cursor:pointer;font-size:12px" onclick="document.getElementById('feedback-overlay').classList.remove('open')">Cancel</button>
    <div id="feedback-msg" style="font-size:13px;margin-top:8px;text-align:center;font-family:sans-serif"></div>
  </div>
</div>

<!-- Collection Waitlist Modal -->
<div id="collection-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:999;align-items:center;justify-content:center">
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:32px;max-width:400px;width:90%">
    <h3 style="margin-bottom:12px">Collection Tracking — Coming Soon</h3>
    <p style="font-size:14px;color:var(--text2);margin-bottom:16px;font-family:sans-serif">Join the waitlist and be first to track your collection on C3 with live AUD valuations.</p>
    <input type="email" id="waitlist-email" placeholder="your@email.com" style="width:100%;background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:10px;border-radius:6px;margin-bottom:10px;font-size:14px">
    <button onclick="joinWaitlist('${card.scryfall_id}','${card.name.replace(/'/g, "\\'")}')" style="width:100%;background:var(--accent);color:#000;border:none;padding:10px;border-radius:6px;font-weight:bold;cursor:pointer">Join Waitlist</button>
    <button onclick="document.getElementById('collection-modal').style.display='none'" style="width:100%;background:none;border:none;color:var(--text2);margin-top:8px;cursor:pointer;font-size:13px">Cancel</button>
    <div id="waitlist-msg" style="font-size:13px;margin-top:8px;font-family:sans-serif;text-align:center"></div>
  </div>
</div>

<footer>
  <p style="margin-bottom:12px">
    <a href="/">Home</a>
    <a href="/cards/mtg">MTG Cards</a>
    <a href="/cards/mtg/sets/${setSlug}">${card.set_name}</a>
    <a href="/ev-calculator.html">EV Calculator</a>
    <a href="/shop.html">Shop</a>
    <a href="/blog">Blog</a>
    <a href="/tracker.html">Free Tracker</a>
    <a href="/contact.html">Contact</a>
  </p>
  <p>Card data via <a href="https://scryfall.com/card/${card.set_code}/${card.collector_number}" target="_blank" rel="noopener">Scryfall</a>. Prices in AUD are estimates based on USD conversion at live rates. Not financial advice.</p>
  <p style="margin-top:8px">© 2026 Cards on Cards on Cards · <a href="https://cardsoncardsoncards.com.au">cardsoncardsoncards.com.au</a></p>
</footer>

<script>
// Foil toggle
let currentMode = 'nf';
const prices = {
  nf: ${JSON.stringify(priceAud)},
  foil: ${JSON.stringify(priceAudFoil)},
  etched: ${JSON.stringify(card.price_usd_etched ? card.price_usd_etched * (snapshots[0]?.aud_usd_rate || 1.58) : null)}
};
function showPrice(mode, btn) {
  currentMode = mode;
  document.querySelectorAll('.foil-toggle button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const val = prices[mode];
  const formatted = val ? new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(val) : 'N/A';
  const mainEl = document.getElementById('price-display');
  const foilEl = document.getElementById('price-foil-display');
  if (mode === 'nf') {
    mainEl.style.display = '';
    mainEl.textContent = formatted;
    if (foilEl) foilEl.style.display = 'none';
  } else {
    mainEl.style.display = 'none';
    if (foilEl) { foilEl.style.display = ''; foilEl.textContent = formatted; }
  }
}

// Double-faced card flip
let showingFront = true;
function flipCard() {
  showingFront = !showingFront;
  document.getElementById('card-front').style.display = showingFront ? '' : 'none';
  const back = document.getElementById('card-back');
  if (back) back.style.display = showingFront ? 'none' : '';
}

// Like button
const SESSION_KEY = 'c3_session';
function getSession() {
  let s = localStorage.getItem(SESSION_KEY);
  if (!s) { s = Math.random().toString(36).slice(2); localStorage.setItem(SESSION_KEY, s); }
  return s;
}
const likedCards = JSON.parse(localStorage.getItem('c3_liked') || '{}');
function initLike() {
  const btn = document.getElementById('like-btn');
  const icon = document.getElementById('like-icon');
  if (likedCards['${card.scryfall_id}']) { btn.classList.add('liked'); icon.textContent = '♥'; }
}
async function toggleLike(scryfallId) {
  const session = getSession();
  const liked = likedCards[scryfallId];
  const method = liked ? 'DELETE' : 'POST';
  const icon = document.getElementById('like-icon');
  const btn = document.getElementById('like-btn');
  const countEl = document.getElementById('like-count');
  try {
    if (!liked) {
      await fetch('/api/card-like', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({scryfallId, sessionId: session}) });
      likedCards[scryfallId] = true;
      btn.classList.add('liked');
      icon.textContent = '♥';
      countEl.textContent = parseInt(countEl.textContent) + 1;
    } else {
      await fetch('/api/card-like', { method: 'DELETE', headers: {'Content-Type':'application/json'}, body: JSON.stringify({scryfallId, sessionId: session}) });
      delete likedCards[scryfallId];
      btn.classList.remove('liked');
      icon.textContent = '♡';
      countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
    }
    localStorage.setItem('c3_liked', JSON.stringify(likedCards));
  } catch(e) { console.error('Like error:', e); }
}

// Price alert
async function submitPriceAlert(scryfallId, cardName) {
  const email = document.getElementById('alert-email').value;
  const price = document.getElementById('alert-price').value;
  const msg = document.getElementById('alert-msg');
  if (!email || !price) { msg.textContent = 'Please enter email and target price.'; msg.style.color = '#f44'; return; }
  try {
    const res = await fetch('/api/price-alert', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({scryfallId, cardName, email, targetPriceAud: parseFloat(price)}) });
    msg.textContent = res.ok ? '✓ You will be notified when the price drops.' : 'Something went wrong. Try again.';
    msg.style.color = res.ok ? '#4caf50' : '#f44';
  } catch { msg.textContent = 'Something went wrong.'; msg.style.color = '#f44'; }
}

// Collection waitlist
async function joinWaitlist(scryfallId, cardName) {
  const email = document.getElementById('waitlist-email').value;
  const msg = document.getElementById('waitlist-msg');
  if (!email) { msg.textContent = 'Please enter your email.'; return; }
  try {
    const res = await fetch('/api/collection-waitlist', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({email, sourceCardId: scryfallId, sourceCardName: cardName}) });
    msg.textContent = res.ok ? "✓ You're on the waitlist!" : 'Something went wrong.';
    msg.style.color = res.ok ? '#4caf50' : '#f44';
  } catch { msg.textContent = 'Something went wrong.'; }
}

// Track page view
fetch('/api/card-view', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({scryfallId: '${card.scryfall_id}', sessionId: getSession()}) }).catch(()=>{});


// Watch this card
const watchedCards = JSON.parse(localStorage.getItem('c3_watched') || '{}');
function toggleWatch(scryfallId, cardName) {
  const btn = document.getElementById('watch-btn');
  const icon = document.getElementById('watch-icon');
  const label = document.getElementById('watch-label');
  if (watchedCards[scryfallId]) {
    delete watchedCards[scryfallId];
    btn.classList.remove('watching');
    icon.textContent = '☆';
    label.textContent = 'Watch this card';
  } else {
    watchedCards[scryfallId] = { name: cardName, addedAt: Date.now() };
    btn.classList.add('watching');
    icon.textContent = '★';
    label.textContent = 'Watching';
    if(typeof gtag !== 'undefined') gtag('event','card_watch',{card_name: cardName});
  }
  localStorage.setItem('c3_watched', JSON.stringify(watchedCards));
}
function initWatch() {
  const btn = document.getElementById('watch-btn');
  const icon = document.getElementById('watch-icon');
  const label = document.getElementById('watch-label');
  if (watchedCards['${card.scryfall_id}']) {
    btn.classList.add('watching');
    icon.textContent = '★';
    label.textContent = 'Watching';
  }
}

// Collection counter
const COLLECTION_KEY = 'c3_collection';
let collection = JSON.parse(localStorage.getItem(COLLECTION_KEY) || '{}');
function adjustCount(delta) {
  const current = collection['${card.scryfall_id}'] || 0;
  const newVal = Math.max(0, current + delta);
  collection['${card.scryfall_id}'] = newVal;
  localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection));
  document.getElementById('copy-count').textContent = newVal;
  const val = newVal > 0 && ${JSON.stringify(priceAud)} ? '= ' + new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(newVal * ${JSON.stringify(priceAud || 0)}) : '';
  document.getElementById('copy-value').textContent = val;
}
function initCollection() {
  const count = collection['${card.scryfall_id}'] || 0;
  document.getElementById('copy-count').textContent = count;
  if (count > 0 && ${JSON.stringify(priceAud)}) {
    document.getElementById('copy-value').textContent = '= ' + new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(count * ${JSON.stringify(priceAud || 0)});
  }
}

// Newsletter subscribe
async function subscribeNewsletter() {
  const email = document.getElementById('nl-email').value.trim();
  const msg = document.getElementById('nl-msg');
  if (!email) { msg.textContent = 'Please enter your email.'; msg.style.color='var(--accent)'; return; }
  try {
    const res = await fetch('/api/newsletter', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({email})
    });
    msg.textContent = res.ok ? '✓ Subscribed! Check your inbox.' : 'Something went wrong. Try again.';
    msg.style.color = res.ok ? '#4caf50' : '#f44';
  } catch { msg.textContent = 'Something went wrong.'; msg.style.color='#f44'; }
}

// Helpful vote
function voteHelpful(val, btn) {
  document.querySelectorAll('.helpful-btn').forEach(b => b.classList.remove('voted'));
  btn.classList.add('voted');
  btn.textContent = val === 1 ? '👍 Thanks!' : '👎 Noted';
  if(typeof gtag !== 'undefined') gtag('event','page_helpful',{value:val,page:window.location.pathname});
  setTimeout(()=>{const bar=document.getElementById('helpful-bar');if(bar)bar.innerHTML='<span style="color:var(--text2);font-size:13px;font-family:sans-serif">Thanks for the feedback!</span>';},800);
}

// Feedback widget
let feedbackRating = 0;
function setFeedbackRating(val) {
  feedbackRating = val;
  document.querySelectorAll('.feedback-star').forEach((s,i) => s.classList.toggle('active', i < val));
}
async function submitFeedback() {
  const text = document.getElementById('feedback-text').value.trim();
  const email = document.getElementById('feedback-email').value.trim();
  const msg = document.getElementById('feedback-msg');
  if (!text && !feedbackRating) { msg.textContent = 'Please add a rating or message.'; msg.style.color='var(--accent)'; return; }
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ rating: feedbackRating, text, email, page: window.location.pathname, cardName: '${card.name}' })
    });
    msg.textContent = res.ok ? '✓ Thanks! Your feedback helps us improve.' : 'Something went wrong.';
    msg.style.color = res.ok ? '#4caf50' : '#f44';
    if(res.ok) setTimeout(() => document.getElementById('feedback-overlay').classList.remove('open'), 2000);
  } catch { msg.textContent = 'Something went wrong.'; msg.style.color='#f44'; }
}

initWatch();
initCollection();

initLike();

// GA4
if (typeof gtag !== 'undefined') {
  document.querySelectorAll('a[href*="ebay"]').forEach(a => a.addEventListener('click', () => gtag('event','ebay_card_click',{card_name:'${card.name}'})));
  document.querySelectorAll('a[href*="amazon"]').forEach(a => a.addEventListener('click', () => gtag('event','amazon_click',{card_name:'${card.name}'})));
}
</script>
<!-- Global site tag (gtag.js) - Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
</body>
</html>`;
}

// --- Main handler ---

export default async (req, context) => {
  const url = new URL(req.url);
  const slug = url.pathname.replace('/cards/mtg/', '').replace(/\/$/, '');

  if (!slug || slug === 'random') {
    // Redirect to a random card
    try {
      const count = await supabaseGet('mtg_cards?select=count', false);
      const total = count[0]?.count || 1000;
      const offset = Math.floor(Math.random() * Math.min(total, 10000));
      const card = await supabaseGet(`mtg_cards?select=slug&limit=1&offset=${offset}&price_usd=gte.0.5`, false);
      if (card[0]?.slug) {
        return Response.redirect(`https://cardsoncardsoncards.com.au/cards/mtg/${card[0].slug}`, 302);
      }
    } catch {}
    return Response.redirect('https://cardsoncardsoncards.com.au/cards/mtg', 302);
  }

  try {
    // Fetch card data
    const cards = await supabaseGet(
      `mtg_cards?slug=eq.${encodeURIComponent(slug)}&limit=1`,
      false
    );

    if (!cards || cards.length === 0) {
      // Card not found - show graceful not found page
      return new Response(renderNotFound(slug), {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    const card = cards[0];

    // Parallel fetches for all supporting data
    const [snapshots, relatedData, prevNextData, likeData] = await Promise.allSettled([
      supabaseGet(`mtg_price_snapshots?scryfall_id=eq.${card.scryfall_id}&order=snapshot_date.asc&limit=90`, false),
      supabaseGet(`mtg_cards?set_code=eq.${card.set_code}&price_usd=gte.0.5&order=price_usd.desc&limit=20&scryfall_id=neq.${card.scryfall_id}`, false),
      supabaseGet(`mtg_cards?set_code=eq.${card.set_code}&select=slug,name,collector_number&order=collector_number.asc`, false),
      supabaseGet(`mtg_card_like_counts?scryfall_id=eq.${card.scryfall_id}`, false)
    ]);

    const snapshotData = snapshots.status === 'fulfilled' ? snapshots.value : [];
    const allSetCards = relatedData.status === 'fulfilled' ? relatedData.value : [];
    const prevNextCards = prevNextData.status === 'fulfilled' ? prevNextData.value : [];
    const likeCount = likeData.status === 'fulfilled' ? (likeData.value[0]?.total_likes || 0) : 0;

    // Split related cards: top 5 by price + 5 random (no duplicates)
    const topFive = allSetCards.slice(0, 5);
    const remaining = allSetCards.slice(5);
    const shuffled = remaining.sort(() => Math.random() - 0.5).slice(0, 5);
    const relatedCards = [...topFive, ...shuffled];

    // Sealed products for this set (use set's amazon_asin if available)
    const setData = await supabaseGet(`mtg_sets?set_code=eq.${card.set_code}&limit=1`, false).catch(() => []);
    const sealedProducts = setData[0]?.amazon_asin ? [{ asin: setData[0].amazon_asin, name: `${card.set_name} Booster Box` }] : [];

    // Prev/next card by collector number
    const collNum = parseInt(card.collector_number) || 0;
    const prevCard = prevNextCards.filter(c => parseInt(c.collector_number) < collNum).pop() || null;
    const nextCard = prevNextCards.find(c => parseInt(c.collector_number) > collNum) || null;

    // eBay listings - store first, then cheapest AU
    let ebayListings = { store: [], all: [] };
    try {
      const token = await getEbayToken();
      const [storeListings, allListings] = await Promise.all([
        getEbayListing(card.name, token, true),
        getEbayListing(card.name, token, false)
      ]);
      ebayListings.store = storeListings;
      ebayListings.all = allListings.filter(l => !storeListings.some(s => s.itemId === l.itemId));
    } catch (e) {
      console.error('eBay fetch error:', e.message);
    }

    const html = renderHTML({ card, snapshots: snapshotData, relatedCards, sealedProducts, prevCard, nextCard, ebayListings, likeCount });

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        'X-Robots-Tag': 'index, follow'
      }
    });

  } catch (err) {
    console.error('[card-page] Error:', err.message);
    return new Response('<h1>Something went wrong</h1>', { status: 500, headers: { 'Content-Type': 'text/html' }});
  }
};

function renderNotFound(slug) {
  const cardName = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const ebayUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(cardName + ' mtg')}&campid=${EPN_CAMPID}`;
  return `<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><title>${cardName} | Cards on Cards on Cards</title>
  <meta name="description" content="We are building the full Australian MTG card database. In the meantime, search eBay AU for ${cardName}.">
  <style>body{background:#0f1117;color:#e8eaf0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}a{color:#f5a623}</style>
  </head><body>
  <div>
    <h1 style="font-size:32px;margin-bottom:12px">${cardName}</h1>
    <p style="color:#9ba3c4;margin-bottom:24px">We are building the full Australian MTG price database. This card's page is coming soon.</p>
    <a href="${ebayUrl}" style="background:#f5a623;color:#000;padding:12px 24px;border-radius:8px;font-weight:bold;text-decoration:none" target="_blank">Search eBay AU for ${cardName}</a>
    <br><br>
    <a href="/cards/mtg" style="color:#9ba3c4">Browse all MTG cards</a> ·
    <a href="/cards/mtg/random" style="color:#9ba3c4">Random card</a>
  </div>
  </body></html>`;
}

export const config = {
  path: '/cards/mtg/:slug+',
  cache: 'manual'
};
