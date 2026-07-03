import { NAV_CSS, navHtml } from './shared/nav.mjs';
// netlify/functions/dbsfusionworld-set-page.mjs
// C3 set-page v4 -- full MVP rebuild
// Serves /cards/dbsfusionworld/sets/:slug+

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EBAY_CLIENT_ID    = Netlify.env.get('EBAY_CLIENT_ID');
const EBAY_CLIENT_SECRET = Netlify.env.get('EBAY_CLIENT_SECRET');
const EPN_CAMPID        = '5339146789';
const AMAZON_TAG        = 'blasdigital-22';

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

function esc(s) {
  return (s == null ? '' : String(s))
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function graceful404(setSlug) {
  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Set Not Found | DBS Fusion World | Cards on Cards on Cards</title>
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;600&display=swap" rel="stylesheet">
  <style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0A0C14;color:#F0F2FF;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}.wrap{max-width:420px}.icon{font-size:48px;margin-bottom:16px}h1{font-family:'Cinzel',serif;color:#10B981;font-size:22px;margin-bottom:10px}p{color:#8892b0;font-size:14px;margin-bottom:24px;line-height:1.6}.btn{display:inline-block;background:#10B981;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;margin:4px}.btn-sec{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:#F0F2FF}</style>
</head>
<body><div class="wrap"><div class="icon">🃏</div><h1>Set Not Found</h1><p>We could not find the DBS Fusion World set "${setSlug}". It may not be in our database yet.</p><a href="/cards/dbsfusionworld" class="btn">Browse All Fusion World Cards</a><a href="/" class="btn btn-sec">← Home</a></div></body>
</html>`;
}

export default async (req) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=900, s-maxage=1800' };
  const url = new URL(req.url);
  const setSlug = url.pathname.replace(/^\/cards\/dbsfusionworld\/sets\//, '').replace(/\/$/, '');

  if (!setSlug) return new Response(graceful404(''), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

  try {
    const [setsR, ebayTokenR] = await Promise.allSettled([
      supabaseGet(`dbsfusionworld_sets?slug=eq.${encodeURIComponent(setSlug)}&limit=1`),
      getEbayToken()
    ]);
    const sets = setsR.status === 'fulfilled' ? setsR.value : [];
    const ebayToken = ebayTokenR.status === 'fulfilled' ? ebayTokenR.value : null;

    if (!sets || !sets[0]) return new Response(graceful404(setSlug), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

    const set = sets[0];

    const [cardsR, ebayListingsR] = await Promise.allSettled([
      supabaseGet(`dbsfusionworld_cards?set_id=eq.${set.id}&rarity=neq.None&order=name.asc&limit=200&select=slug,name,number,image_url,market_price,price_aud,rarity,set_name,price_change_7d,price_change_30d`),
      getEbayListings(`${set.name} dragon ball fusion world card`, ebayToken)
    ]);
    const cards = cardsR.status === 'fulfilled' ? cardsR.value : [];
    const ebayListings = ebayListingsR.status === 'fulfilled' ? ebayListingsR.value : [];

    const toAud = (c) => c.price_aud > 0 ? parseFloat(c.price_aud) : c.market_price > 0 ? c.market_price * 1.45 : 0;
    const pricedCards = (cards || []).filter(c => toAud(c) > 0);
    const top5 = pricedCards.slice(0, 5);
    // Biggest movers: min AU$0.50 price, need 5+ eligible cards to show panel
    const moversEligible = (cards||[]).filter(c => c.price_change_7d != null && parseFloat(c.price_aud||0) > 0.50);
    const gainers = [...moversEligible].filter(c => parseFloat(c.price_change_7d) > 0).sort((a,b) => parseFloat(b.price_change_7d)-parseFloat(a.price_change_7d)).slice(0,3);
    const losers  = [...moversEligible].filter(c => parseFloat(c.price_change_7d) < 0).sort((a,b) => parseFloat(a.price_change_7d)-parseFloat(b.price_change_7d)).slice(0,3);
    const showMovers = moversEligible.length >= 5;
    const rarities = [...new Set((cards||[]).map(c => c.rarity).filter(r => r && r !== 'None'))].sort();
    const today = new Date().toISOString().slice(0, 10);

    const ebaySetURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name + ' dbs fusion world')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
    const ebayBoxURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name + ' booster box')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;


    function moverCard(c, isGainer) {
      const aud = toAud(c);
      const pct = Math.abs(parseFloat(c.price_change_7d||0)).toFixed(1);
      const arrow = isGainer ? '&#9650;' : '&#9660;';
      const col = isGainer ? '#10B981' : '#F87171';
      return `<a href="/cards/dbsfusionworld/${c.slug}" style="background:#0e1118;border:1px solid #1e2235;border-radius:8px;padding:10px 12px;text-decoration:none;display:flex;align-items:center;gap:10px;transition:border-color .2s" onmouseover="this.style.borderColor='${col}'" onmouseout="this.style.borderColor='#1e2235'">
        ${c.image_url ? `<img src="${c.image_url}" alt="${c.name.replace(/"/g,'')}" style="width:40px;height:56px;object-fit:contain;border-radius:4px;flex-shrink:0">` : ''}
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;color:#e8eaf0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.name}</div>
          ${c.rarity ? `<div style="font-size:10px;color:#8892b0;margin-top:1px">${c.rarity}</div>` : ''}
          <div style="font-size:13px;font-weight:700;margin-top:3px;color:#10B981">${aud > 0 ? `AU$${aud.toFixed(2)}` : ''}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:14px;font-weight:700;color:${col}">${arrow} ${pct}%</div>
          <div style="font-size:10px;color:#8892b0;margin-top:2px">7 days</div>
        </div>
      </a>`;
    }

    const moversHTML = showMovers ? `
    <div style="background:linear-gradient(135deg,rgba(16,185,129,.06),rgba(16,185,129,.02));border:1px solid rgba(16,185,129,.2);border-radius:12px;padding:20px;margin-bottom:28px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
        <div style="font-family:'Cinzel',serif;font-size:15px;font-weight:700;color:#F0F2FF">&#128200; This Week's Movers</div>
        <div style="font-size:11px;color:#8892b0;background:#1e2235;padding:3px 8px;border-radius:4px">7-day % change</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#10B981;margin-bottom:8px">&#9650; Biggest Gainers</div>
          <div style="display:flex;flex-direction:column;gap:6px">${gainers.length ? gainers.map(c => moverCard(c, true)).join('') : '<div style="font-size:13px;color:#8892b0;padding:8px 0">No significant gainers this week</div>'}</div>
        </div>
        <div>
          <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#F87171;margin-bottom:8px">&#9660; Biggest Losers</div>
          <div style="display:flex;flex-direction:column;gap:6px">${losers.length ? losers.map(c => moverCard(c, false)).join('') : '<div style="font-size:13px;color:#8892b0;padding:8px 0">No significant losers this week</div>'}</div>
        </div>
      </div>
    </div>` : '';

        const top5HTML = top5.map(c => {
      const aud = toAud(c);
      return `<a href="/cards/dbsfusionworld/${c.slug}" style="flex:0 0 140px;background:#0e1118;border:1px solid rgba(16,185,129,.35);border-radius:10px;padding:10px;text-align:center;text-decoration:none;transition:all .2s;display:block" onmouseover="this.style.borderColor='#10B981';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='rgba(16,185,129,.35)';this.style.transform='none'">
        <div style="font-size:11px;color:#e8eaf0;line-height:1.3;margin-bottom:4px;font-weight:600">${c.name}</div>
        ${c.image_url ? `<img src="${c.image_url}" alt="${esc(c.name)}" style="width:100%;border-radius:6px;max-height:140px;object-fit:contain;margin-bottom:6px" loading="lazy">` : ''}
        ${c.rarity ? `<div style="font-size:10px;color:#10B981;margin-bottom:3px">${c.rarity}</div>` : ''}
        ${aud > 0 ? `<div style="font-size:12px;color:#C9A84C;font-weight:700">AU$${aud.toFixed(2)}</div>` : ''}
      </a>`;
    }).join('');

    const allCardsHTML = cards && cards.length ? cards.map(c => {
      const aud = toAud(c);
      return `<a href="/cards/dbsfusionworld/${c.slug}" class="card-item" data-rarity="${(c.rarity||'none').toLowerCase().replace(/ /g,'-')}" data-price="${aud}" data-change7d="${c.price_change_7d||''}" data-name="${(c.name||'').toLowerCase().replace(/"/g,'')}" data-number="${c.number||''}" style="background:#0e1118;border:1px solid #1e2235;border-radius:8px;padding:8px;text-decoration:none;text-align:center;display:block;transition:all .2s" onmouseover="this.style.borderColor='#10B981'" onmouseout="this.style.borderColor='#1e2235'">
        <div style="font-size:10px;color:#e8eaf0;line-height:1.3;font-weight:600">${c.name}</div>
        ${c.image_url ? `<img src="${c.image_url}" alt="${esc(c.name)}" style="width:100%;border-radius:4px;max-height:120px;object-fit:contain;margin-bottom:4px" loading="lazy">` : `<div style="height:100px;background:#1e2235;border-radius:4px;margin-bottom:4px;display:flex;align-items:center;justify-content:center;font-size:20px">🃏</div>`}
        ${aud > 0 ? `<div style="font-size:11px;color:#C9A84C;font-weight:700;margin-top:2px">AU$${aud.toFixed(2)}</div>` : ''}
      </a>`;
    }).join('') : `<div style="grid-column:1/-1;text-align:center;color:#8892b0;padding:32px;font-size:14px">Card list syncing, check back after tonight's update.</div>`;

    const ebayListingsHTML = ebayListings.length ? ebayListings.slice(0,4).map(item => {
      const price = item.price?.value ? `AU$${parseFloat(item.price.value).toFixed(2)}` : '';
      const epnUrl = item.itemAffiliateWebUrl || item.itemWebUrl || '#';
      return `<a href="${epnUrl}" target="_blank" rel="noopener" style="background:#0e1118;border:1px solid #1e2235;border-radius:8px;padding:12px;text-decoration:none;display:flex;gap:10px;align-items:center;transition:border-color .2s" onmouseover="this.style.borderColor='#10B981'" onmouseout="this.style.borderColor='#1e2235'">
        ${item.image?.imageUrl ? `<img src="${item.image.imageUrl}" alt="${esc(item.title||'')}" style="width:50px;height:50px;object-fit:contain;border-radius:4px;flex-shrink:0">` : ''}
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;color:#e8eaf0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.title||''}</div>
          ${price ? `<div style="font-size:13px;color:#C9A84C;font-weight:700;margin-top:3px">${price}</div>` : ''}
          <div style="font-size:10px;color:#8892b0;margin-top:2px">eBay AU · Buy now</div>
        </div>
      </a>`;
    }).join('') : '';

    const metaDesc = `Browse ${cards?.length||0} DBS Fusion World cards from ${set.name}. View card prices in AUD, find the most valuable cards and buy on eBay AU. Updated daily.`;


    const setSchemaLD = {
      "@context": "https://schema.org", "@type": "CollectionPage",
      "name": `${set.name} DBS Fusion World Card Prices Australia`,
      "description": `Browse all ${cards?.length||0} ${set.name} DBS Fusion World cards with AUD prices and eBay AU buy links.`,
      "url": `https://cardsoncardsoncards.com.au/cards/dbsfusionworld/sets/${setSlug}`,
      "breadcrumb": {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://cardsoncardsoncards.com.au" },
          { "@type": "ListItem", "position": 2, "name": "DBS Fusion World", "item": "https://cardsoncardsoncards.com.au/cards/dbsfusionworld" },
          { "@type": "ListItem", "position": 3, "name": set.name, "item": `https://cardsoncardsoncards.com.au/cards/dbsfusionworld/sets/${setSlug}` }
        ]
      }
    };
    return new Response(`<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${set.name} | DBS Fusion World Set | Cards on Cards on Cards</title>
  <meta name="description" content="${metaDesc}">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/dbsfusionworld/sets/${setSlug}">
  <script type="application/ld+json">${JSON.stringify(setSchemaLD)}</script>

  <meta property="og:title" content="${set.name} | DBS Fusion World | C3">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:url" content="https://cardsoncardsoncards.com.au/cards/dbsfusionworld/sets/${setSlug}">
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
    .hero-eyebrow{font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#10B981;margin-bottom:8px}
    .hero-title{font-family:'Cinzel',serif;font-size:clamp(22px,4vw,36px);font-weight:700;color:#F0F2FF;margin-bottom:8px}
    .hero-meta{display:flex;gap:12px;flex-wrap:wrap;font-size:13px;color:#8892b0;align-items:center}
    .meta-badge{background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.35);color:#10B981;padding:3px 10px;border-radius:100px;font-size:11px;font-weight:700}
    .section-title{font-family:'Cinzel',serif;font-size:16px;color:#F0F2FF;margin-bottom:14px}
    .cta-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:28px}
    .cta-btn{display:inline-flex;align-items:center;padding:11px 20px;border-radius:8px;font-weight:700;font-size:13px;text-decoration:none;transition:opacity .2s}
    .cta-primary{background:#10B981;color:#000}
    .cta-secondary{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:#F0F2FF}
    .cards-scroll{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;scrollbar-width:thin;margin-bottom:28px}
    .cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-bottom:28px}
    .ebay-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;margin-bottom:28px}
    .section{margin-bottom:32px}
    @media(max-width:600px){.cards-grid{grid-template-columns:repeat(auto-fill,minmax(90px,1fr))}}
    .filt-btn{padding:5px 10px;border-radius:6px;border:1px solid #2a3050;background:none;color:#8892b0;font-size:11px;font-weight:600;cursor:pointer;transition:all .18s;font-family:'DM Sans',sans-serif}
    .filt-btn:hover,.filt-btn.active{border-color:#10B981;color:#10B981;background:rgba(16,185,129,.08)}
  </style>
</head>
<body>
<style>${NAV_CSS}</style>${navHtml({ gameLabel: 'DBS Fusion World', gameHref: '/cards/dbsfusionworld' })}

<div class="wrap">
  <div class="hero">
    <div class="hero-eyebrow">DBS Fusion World · Set</div>
    <h1 class="hero-title">${set.name}</h1>
    <div class="hero-meta">
      <span class="meta-badge">DBS Fusion World</span>
      ${set.release_date ? `<span>Released: ${set.release_date.slice(0,10)}</span>` : ''}
      ${set.card_count ? `<span>${set.card_count} cards</span>` : ''}
      ${cards?.length ? `<span>${pricedCards.length} priced in AUD</span>` : ''}
    </div>
  </div>


  <div class="cta-row">
    <a href="${ebaySetURL}" target="_blank" rel="noopener" class="cta-btn cta-primary" onclick="if(typeof gtag!=='undefined')gtag('event','ebay_set_click',{set_name:'${set.name}',game:'dbsfusionworld'})">Buy Cards on eBay AU →</a>
    <a href="${ebayBoxURL}" target="_blank" rel="noopener" class="cta-btn cta-secondary">Find Booster Box →</a>
    <a href="https://www.amazon.com.au/s?k=${encodeURIComponent(set.name + ' DBS Fusion World')}&tag=${AMAZON_TAG}" target="_blank" rel="noopener" class="cta-btn cta-secondary" style="border-color:rgba(255,153,0,.35);color:#ff9900">Search Amazon AU →</a>
  </div>

  ${top5.length ? `<div class="section">
    <div class="section-title">Most Valuable Cards</div>
    <div class="cards-scroll">${top5HTML}</div>
  </div>` : ''}

  ${moversHTML}
  ${ebayListingsHTML ? `<div class="section">
    <div class="section-title">Live eBay AU Listings</div>
    <div class="ebay-grid">${ebayListingsHTML}</div>
    <a href="${ebaySetURL}" target="_blank" rel="noopener" style="font-size:13px;color:#10B981;text-decoration:none">See all listings on eBay AU →</a>
  </div>` : ''}

  ${(() => {
    const SEALED_KEYS = ['booster box','booster pack','display','starter deck','starter set','trial deck','trial set','box set','collection box','premium set'];
    const sealedItems = (cards||[]).filter(c => { const n = (c.name||'').toLowerCase(); return SEALED_KEYS.some(k => n.includes(k)) && c.market_price > 0; });
    if (!sealedItems.length) return '';
    const itemsHTML = sealedItems.slice(0,4).map(p => {
      const price = p.price_aud > 0 ? `AU$${parseFloat(p.price_aud).toFixed(2)}` : `~AU$${(p.market_price*1.45).toFixed(2)}`;
      const low = p.low_price ? `Low: ~AU$${(p.low_price*1.45).toFixed(2)}` : '';
      const nm = (p.name||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return `<a href="/cards/dbsfusionworld/${p.slug}" style="background:#0e1118;border:1px solid #1e2235;border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px;text-decoration:none;transition:border-color .2s" onmouseover="this.style.borderColor='#EF4444'" onmouseout="this.style.borderColor='#1e2235'">
        ${p.image_url ? `<img src="${p.image_url.replace(/"/g,'&quot;')}" alt="${nm.replace(/"/g,'&quot;')}" style="width:100%;max-height:120px;object-fit:contain;border-radius:6px" loading="lazy">` : ''}
        <div style="font-size:12px;font-weight:700;color:#e8eaf0;line-height:1.3">${nm}</div>
        <div style="font-size:15px;font-weight:900;color:#EF4444;font-family:'Cinzel',serif">${price}</div>
        ${low ? `<div style="font-size:11px;color:#8892b0">${low}</div>` : ''}
      </a>`;
    }).join('');
    const setNm = (set.name||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<div class="section" style="background:#EF44440a;border:1px solid #EF444426;border-radius:14px;padding:22px 24px;margin-bottom:32px">
      <div style="font-size:9px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#EF4444;margin-bottom:8px">Sealed Product</div>
      <h2 style="font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:#F0F2FF;margin-bottom:16px">Buy Sealed ${setNm} Product</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:16px">${itemsHTML}</div>
      <a href="https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent((set.name||'')+' dbs fusion world booster')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:7px;padding:9px 18px;border-radius:8px;font-weight:700;font-size:12px;text-decoration:none;background:#EF4444;color:#fff">&#128722; More sealed on eBay AU &#8599;</a>
    </div>`;
  })()}

  <div class="section">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px">
      <div class="section-title">${cards?.length ? `Singles (${cards.length})` : 'Singles'}</div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <input type="text" id="card-search" placeholder="Search cards..." oninput="applyFilters()" style="background:#1e2235;border:1px solid #2a3050;color:#e8eaf0;padding:6px 12px;border-radius:6px;font-size:12px;font-family:'DM Sans',sans-serif;width:155px">
        <select id="sort-sel" onchange="applyFilters()" style="background:#1e2235;border:1px solid #2a3050;color:#e8eaf0;padding:6px 10px;border-radius:6px;font-size:12px;font-family:'DM Sans',sans-serif;cursor:pointer">
          <option value="name-asc" selected>Name: A to Z</option>
          <option value="number">Card Number</option>
          <option value="price-desc">Price: High to Low</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="gainers">Biggest Gainers &#9650;</option>
          <option value="losers">Biggest Losers &#9660;</option>
          <option value="name-desc">Name: Z to A</option>
          <option value="rarity">By Rarity</option>
        </select>
        <span id="filter-count" style="font-size:12px;color:#8892b0;white-space:nowrap"></span>
      </div>
    </div>
    ${rarities.length > 1 ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
      <button class="filt-btn active" data-rarity="all" onclick="setRarity('all',this)">All Rarities</button>
      ${rarities.map(r => `<button class="filt-btn" data-rarity="${r.toLowerCase().replace(/ /g,'-')}" onclick="setRarity('${r.toLowerCase().replace(/ /g,'-')}',this)">${r}</button>`).join('')}
    </div>` : ''}
    <div class="cards-grid" id="cards-grid">${allCardsHTML}</div>
  </div>

  <div style="background:#0e1118;border:1px solid #1e2235;border-radius:10px;padding:20px;font-size:13px;color:#8892b0">
    <strong style="color:#F0F2FF">About this set:</strong> DBS Fusion World card prices in AUD, converted from USD at approximately 1.45x. Updated daily.
    <div style="margin-top:10px"><a href="/cards/dbsfusionworld" style="color:#10B981">Browse all DBS Fusion World sets</a></div>
  </div>
</div>

<script>
if(typeof gtag!=='undefined'){
  document.querySelectorAll('a[href*="ebay"]').forEach(a=>a.addEventListener('click',()=>gtag('event','ebay_click',{game:'dbsfusionworld',set:'${set.name}'})));
}

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
    const show = (activeRarity === 'all' || el.dataset.rarity === activeRarity)
              && (!search || el.dataset.name.includes(search));
    el.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  const fc = document.getElementById('filter-count');
  if (fc) fc.textContent = visible + ' cards';
  const rarityOrder = ['common','uncommon','rare','super rare','double rare','ultra rare','secret rare','special rare','expansion rare','legendary','epic','showcase','enchanted','promo'];
  const vis = items.filter(el => el.style.display !== 'none');
  vis.sort((a, b) => {
    const pa = parseFloat(a.dataset.price)   || 0;
    const pb = parseFloat(b.dataset.price)   || 0;
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

</script>
<!-- REPORT BUG WIDGET -->
<style>.bug-float{position:fixed;bottom:20px;right:20px;z-index:9999}.bug-btn{display:flex;align-items:center;gap:6px;background:rgba(15,17,25,.95);border:1px solid rgba(201,168,76,.3);color:#C9A84C;padding:8px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;font-family:sans-serif;backdrop-filter:blur(12px);transition:all .2s;text-decoration:none;letter-spacing:.03em;box-shadow:0 4px 16px rgba(0,0,0,.4)}.bug-btn:hover{border-color:#C9A84C;background:rgba(201,168,76,.12);color:#E8C86A;text-decoration:none;transform:translateY(-2px)}.bug-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10000;align-items:center;justify-content:center;backdrop-filter:blur(4px)}.bug-modal.open{display:flex}.bug-box{background:#111420;border:1px solid #252840;border-radius:14px;padding:28px;width:100%;max-width:420px;margin:0 16px;position:relative}.bug-box h3{font-family:'Cinzel',serif;font-size:17px;font-weight:700;color:#F0F2FF;margin-bottom:4px}.bug-box p{font-size:12px;color:#9ba3c4;margin-bottom:18px}.bug-close{position:absolute;top:12px;right:14px;background:none;border:none;color:#9ba3c4;font-size:18px;cursor:pointer;line-height:1;padding:4px}.bug-form select,.bug-form textarea{width:100%;background:rgba(255,255,255,.05);border:1px solid #252840;border-radius:8px;color:#F0F2FF;font-family:'DM Sans',sans-serif;font-size:13px;padding:9px 12px;margin-bottom:12px;outline:none;transition:border-color .2s}.bug-form select:focus,.bug-form textarea:focus{border-color:rgba(201,168,76,.5)}.bug-form textarea{resize:vertical;min-height:80px;max-height:160px}.bug-form select option{background:#e8eaf0;color:#111420}.bug-form select{background:#e8eaf0;color:#111420}.bug-hidden{display:none}.bug-submit{width:100%;padding:10px;background:#C9A84C;color:#0A0C14;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:opacity .2s}.bug-submit:hover{opacity:.85}.bug-submit:disabled{opacity:.5;cursor:not-allowed}.bug-thanks{display:none;text-align:center;padding:12px 0}.bug-thanks p{color:#4ADE80;font-size:14px;font-weight:600}</style>
<div class="bug-float"><a class="bug-btn" onclick="document.getElementById('bugModal').classList.add('open');return false" href="#">&#x1F41B; Report a Bug</a></div>
<div class="bug-modal" id="bugModal" onclick="if(event.target===this)this.classList.remove('open')">
  <div class="bug-box">
    <button class="bug-close" onclick="document.getElementById('bugModal').classList.remove('open')">&#x2715;</button>
    <h3>&#x1F41B; Report a Bug</h3><p>Spotted something wrong? Takes 20 seconds.</p>
    <form class="bug-form" id="bugReportForm" name="bug-report" method="POST" data-netlify="true" netlify-honeypot="bot-field">
      <input type="hidden" name="form-name" value="bug-report"><input class="bug-hidden" name="bot-field">
      <input type="hidden" name="page_url" id="bugPageUrl">
      <select name="issue_type" required><option value="" disabled selected>What type of issue?</option><option value="wrong_price">Wrong price</option><option value="missing_card">Missing card or set</option><option value="broken_link">Broken link</option><option value="other">Other</option></select>
      <textarea name="description" placeholder="Describe the issue briefly" maxlength="200" required></textarea>
      <div class="bug-thanks" id="bugThanks"><p>&#x2713; Thanks, we will look into it.</p></div>
      <button type="submit" class="bug-submit" id="bugSubmit">Submit Report</button>
    </form>
  </div>
</div>
<script>(function(){var urlInput=document.getElementById('bugPageUrl');if(urlInput)urlInput.value=window.location.href;var form=document.getElementById('bugReportForm');if(!form)return;form.addEventListener('submit',function(e){e.preventDefault();var btn=document.getElementById('bugSubmit');btn.disabled=true;btn.textContent='Sending...';var data=new FormData(form);fetch('/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data).toString()}).then(function(){document.getElementById('bugThanks').style.display='block';form.querySelector('select').style.display='none';form.querySelector('textarea').style.display='none';btn.style.display='none';setTimeout(function(){document.getElementById('bugModal').classList.remove('open');},2000);}).catch(function(){btn.disabled=false;btn.textContent='Submit Report';});});})()</script>
</body>
</html>`, { status: 200, headers });

  } catch (err) {
    console.error('[dbsfusionworld-set-page.mjs] Error:', err.message);
    return new Response(graceful404(setSlug), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
};

export const config = { path: '/cards/dbsfusionworld/sets/:slug+', priority: 1 };
