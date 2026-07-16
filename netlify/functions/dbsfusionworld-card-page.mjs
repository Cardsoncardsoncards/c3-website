import { MANAGE_FOLLOWS_LINK } from './shared/follow-links.mjs';

import { NAV_CSS, navHtml } from './shared/nav.mjs';
import { viewTrackingScript } from './shared/view-tracking.mjs';
import { priceChartHtml, PRICE_CHART_SCRIPT } from './shared/price-chart.mjs';
// netlify/functions/dbsfusionworld-card-page.mjs
// Serves /cards/dbsfusionworld/:slug
// If slug starts with sets/, renders the set page inline (routing fix)

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
    if (!res.ok) throw new Error('supabase_http_' + res.status);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
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

async function getEbayListings(cardName, token) {
  if (!token) return [];
  try {
    const q = encodeURIComponent(`${cardName} dragon ball fusion world card`);
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${q}&category_ids=183454&filter=buyingOptions%3A%7BFIXED_PRICE%7D&sort=price&limit=6`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_AU', 'X-EBAY-C-ENDUSERCTX': `affiliateCampaignId=${EPN_CAMPID}` } });
    if (!res.ok) return [];
    const d = await res.json();
    return (d.itemSummaries || []).map(item => ({ ...item, itemId: item.itemId?.includes('|') ? item.itemId.split('|')[1] : item.itemId }));
  } catch { return []; }
}

function notFoundPage(slug) {
  return `<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><title>Card Not Found | Cards on Cards on Cards</title><link rel="icon" type="image/png" href="/c3logo.png"></head><body style="background:#0A0C14;color:#F0F2FF;font-family:sans-serif"><style>${NAV_CSS}</style>${navHtml({ gameLabel: 'DBS Fusion World', gameHref: '/cards/dbsfusionworld' })}<div style="padding:80px 24px;text-align:center"><h1 style="font-family:'Cinzel',serif;color:#C9A84C;margin-bottom:16px">Card Not Found</h1><p style="color:#A0A8C0;margin-bottom:24px">The card "${slug}" doesn't exist or hasn't synced yet.</p><a href="/cards/dbsfusionworld" style="display:inline-block;padding:10px 24px;background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.4);color:#E8C97A;border-radius:8px;text-decoration:none">Browse DBS Fusion World Cards</a></div></body></html>`;
}

function setNotFoundPage(setSlug) {
  return `<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><title>Set Not Found | DBS Fusion World | Cards on Cards on Cards</title><meta name="robots" content="noindex"><link rel="icon" type="image/png" href="/c3logo.png"><link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;600&display=swap" rel="stylesheet"></head><body style="background:#0A0C14;color:#F0F2FF;font-family:'DM Sans',sans-serif"><style>${NAV_CSS}</style>${navHtml({ gameLabel: 'DBS Fusion World', gameHref: '/cards/dbsfusionworld' })}<div style="display:flex;align-items:center;justify-content:center;min-height:60vh;padding:24px;text-align:center"><div><div style="font-size:48px;margin-bottom:16px">🃏</div><h1 style="font-family:'Cinzel',serif;color:#E53935;font-size:22px;margin-bottom:10px">Set Not Found</h1><p style="color:#8892b0;font-size:14px;margin-bottom:24px">We couldn't find the DBS Fusion World set "${setSlug}".</p><a href="/cards/dbsfusionworld" style="display:inline-block;background:#E53935;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;margin:4px">Browse All Fusion World</a><a href="/" style="display:inline-block;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:#F0F2FF;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;margin:4px">← Home</a></div></div></body></html>`;
}

async function handleSetPage(setSlug, htmlHeaders) {
  const accent = '#E53935';
  const [_psr0, _psr1] = await Promise.allSettled([
    supabaseGet(`dbsfusionworld_sets?slug=eq.${encodeURIComponent(setSlug)}&limit=1&select=*`),
    getEbayToken()
  ]);
  if (_psr0.status === 'rejected') return new Response('<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><title>Temporarily Unavailable</title></head><body style="background:#0A0C14;color:#F0F2FF;font-family:sans-serif;text-align:center;padding:60px 20px"><h1>Temporarily Unavailable</h1><p>Our data is briefly unavailable. Please try again shortly.</p></body></html>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '120' } });
  const sets = _psr0.value;
  const ebayToken = _psr1.status === 'fulfilled' ? _psr1.value : [];

  if (!sets || !sets[0]) return new Response(setNotFoundPage(setSlug), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  const set = sets[0];

  const [_psr2, _psr3] = await Promise.allSettled([
    supabaseGet(`dbsfusionworld_cards?set_id=eq.${set.id}&order=market_price.desc.nullslast&limit=400&select=slug,name,number,image_url,market_price,price_aud,rarity,set_name`),
    ebayToken ? getEbayListings(set.name + ' dbs fusion world', ebayToken).catch(() => []) : []
  ]);
  const cards = _psr2.status === 'fulfilled' ? _psr2.value : [];
  const ebayListings = _psr3.status === 'fulfilled' ? _psr3.value : [];

  const toAud = (c) => c.price_aud > 0 ? parseFloat(c.price_aud) : c.market_price > 0 ? c.market_price * 1.45 : 0;
  const isSingles = c => c.number !== null && c.number !== undefined && c.rarity !== 'None' && c.rarity !== null;
  const pricedCards = (cards || []).filter(c => isSingles(c) && toAud(c) > 0);
  const sealedCards = (cards || []).filter(c => !isSingles(c));
  const top5 = [...pricedCards].sort((a,b) => toAud(b) - toAud(a)).slice(0, 5);

  const ebaySetURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name + ' dbs fusion world')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
  const metaDesc = `Browse ${cards?.length || 0} DBS Fusion World cards from ${set.name}. View card prices in AUD and buy on eBay AU. Updated daily.`;

  const top5HTML = top5.map(c => {
    const aud = toAud(c);
    return `<a href="/cards/dbsfusionworld/${c.slug}" style="flex:0 0 140px;background:#0e1118;border:1px solid rgba(16,185,129,.35);border-radius:10px;padding:10px;text-align:center;text-decoration:none;display:block">
      ${c.image_url ? `<img src="${c.image_url}" alt="${esc(c.name)}" style="width:100%;border-radius:6px;max-height:140px;object-fit:contain;margin-bottom:6px" loading="lazy">` : ''}
      <div style="font-size:11px;color:#e8eaf0;line-height:1.3;margin-bottom:4px;font-weight:600">${esc(c.name)}</div>
      ${c.rarity ? `<div style="font-size:10px;color:${accent};margin-bottom:3px">${c.rarity}</div>` : ''}
      ${aud > 0 ? `<div style="font-size:12px;color:#C9A84C;font-weight:700">AU$${aud.toFixed(2)}</div>` : ''}
    </a>`;
  }).join('');

  const allCardsHTML = (cards && cards.length) ? cards.filter(isSingles).map(c => {
    const aud = toAud(c);
    return `<a href="/cards/dbsfusionworld/${c.slug}" style="background:#0e1118;border:1px solid #1e2235;border-radius:8px;padding:8px;text-decoration:none;text-align:center;display:block">
      ${c.image_url ? `<img src="${c.image_url}" alt="${esc(c.name)}" style="width:100%;border-radius:4px;max-height:120px;object-fit:contain;margin-bottom:4px" loading="lazy">` : `<div style="height:100px;background:#1e2235;border-radius:4px;margin-bottom:4px;display:flex;align-items:center;justify-content:center;font-size:20px">🃏</div>`}
      <div style="font-size:10px;color:#e8eaf0;line-height:1.3;font-weight:600">${esc(c.name)}</div>
      ${aud > 0 ? `<div style="font-size:11px;color:#C9A84C;font-weight:700;margin-top:2px">AU$${aud.toFixed(2)}</div>` : ''}
    </a>`;
  }).join('') : `<div style="grid-column:1/-1;text-align:center;color:#8892b0;padding:32px;font-size:14px">Card list syncing -- check back after tonight's update.</div>`;

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${set.name} | DBS Fusion World Set | Cards on Cards on Cards</title>
  <meta name="description" content="${metaDesc}">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/dbsfusionworld/sets/${setSlug}">
  <meta property="og:title" content="${set.name} | DBS Fusion World | C3">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:site_name" content="Cards on Cards on Cards">
  <meta property="og:image" content="https://cardsoncardsoncards.com.au/c3ogbanner.png">
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
    .hero-eyebrow{font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:${accent};margin-bottom:8px}
    .hero-title{font-family:'Cinzel',serif;font-size:clamp(22px,4vw,36px);font-weight:700;color:#F0F2FF;margin-bottom:8px}
    .hero-meta{display:flex;gap:12px;flex-wrap:wrap;font-size:13px;color:#8892b0;align-items:center}
    .meta-badge{background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.35);color:${accent};padding:3px 10px;border-radius:100px;font-size:11px;font-weight:700}
    .section-title{font-family:'Cinzel',serif;font-size:16px;color:#F0F2FF;margin-bottom:14px}
    .cta-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:28px}
    .cta-btn{display:inline-flex;align-items:center;padding:11px 20px;border-radius:8px;font-weight:700;font-size:13px;text-decoration:none}
    .cta-primary{background:${accent};color:#000}
    .cta-secondary{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:#F0F2FF}
    .cta-follow{background:rgba(201,168,76,.12);border:1px solid rgba(201,168,76,.35);color:#C9A84C}
    .cards-scroll{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;margin-bottom:28px}
    .cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-bottom:28px}
    .section{margin-bottom:32px}
    @media(max-width:600px){.cards-grid{grid-template-columns:repeat(auto-fill,minmax(90px,1fr))}}
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
      ${pricedCards.length ? `<span>${pricedCards.length} priced in AUD</span>` : ''}
    </div>
  </div>


  <div class="cta-row">
    <a href="${ebaySetURL}" target="_blank" rel="noopener" class="cta-btn cta-primary">Buy on eBay AU →</a>
    <a href="https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name + ' dbs fusion world booster box')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&campid=${EPN_CAMPID}&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="cta-btn cta-secondary">Find Booster Box →</a>
    <a href="https://www.amazon.com.au/s?k=${encodeURIComponent(set.name + ' DBS Fusion World')}&tag=${AMAZON_TAG}" target="_blank" rel="noopener" class="cta-btn cta-secondary" style="border-color:rgba(255,153,0,.35);color:#ff9900">Amazon AU →</a>
  </div>

  ${top5.length ? `<div class="section"><div class="section-title">Most Valuable Cards</div><div class="cards-scroll">${top5HTML}</div></div>` : ''}

  <div class="section">
    <div class="section-title">${pricedCards.length ? `Singles (${pricedCards.length})` : 'Cards'}</div>
    <div class="cards-grid">${allCardsHTML}</div>
  </div>

  <div style="background:#0e1118;border:1px solid #1e2235;border-radius:10px;padding:20px;font-size:13px;color:#8892b0">
    <strong style="color:#F0F2FF">About this set:</strong> DBS Fusion World card prices shown in AUD, converted from USD market data. Prices update daily via tcgapi.dev.
    <div style="margin-top:10px"><a href="/cards/dbsfusionworld" style="color:${accent}">← Back to all DBS Fusion World cards</a></div>
  </div>
</div>
<footer style="border-top:1px solid #1e2235;padding:24px;text-align:center;color:#8892b0;font-size:12px;margin-top:20px">
  <div style="text-align:center;margin:16px 0"><a href="https://buy.stripe.com/3cIdR836CeXk95C475aIM02" target="_blank" rel="noopener" style="background:#C9A84C;color:#0A0C14;padding:9px 20px;border-radius:20px;font-weight:700;text-decoration:none;font-size:13px;display:inline-block">&#10084;&#65039; Support C3</a></div>
  <p><a href="/" style="color:#8892b0;margin:0 8px">Home</a><a href="/cards/dbsfusionworld" style="color:#8892b0;margin:0 8px">DBS Fusion World</a><a href="/blog" style="color:#8892b0;margin:0 8px">Blog</a><a href="/tracker.html" style="color:#8892b0;margin:0 8px">Tracker</a></p>
  <p style="margin-top:8px">© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
</footer>
</body></html>`;

  return new Response(html, { status: 200, headers: htmlHeaders });
}


function esc(str) {
  return (str == null ? '' : String(str))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default async (req) => {
  const url = new URL(req.url);
  const slug = url.pathname.replace('/cards/dbsfusionworld/', '').replace(/^\/|\/$/g, '');
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=7200', 'Netlify-CDN-Cache-Control': 'public, max-age=3600, s-maxage=7200,durable' };

  if (!slug) return new Response(notFoundPage(''), { status: 404, headers });

  if (slug.startsWith('sets/')) {
    const setSlug = slug.replace(/^sets\//, '').replace(/\/$/, '');
    return handleSetPage(setSlug, headers);
  }

  try {
    const cards = await supabaseGet(`dbsfusionworld_cards?slug=eq.${encodeURIComponent(slug)}&limit=1&select=*`);
    if (!cards || cards.length === 0) return new Response(notFoundPage(slug), { status: 404, headers });
    const card = cards[0];

    const snapshots = await supabaseGet(`dbsfusionworld_price_snapshots?card_id=eq.${encodeURIComponent(card.id)}&order=snapshot_date.asc&limit=90&select=snapshot_date,price_aud,market_price`).catch(() => []);
    const priceChartHTML = priceChartHtml(snapshots);
    const _setRows = card.set_id ? await supabaseGet(`dbsfusionworld_sets?id=eq.${card.set_id}&limit=1&select=slug`).catch(() => []) : [];
    const setUrl = (Array.isArray(_setRows) && _setRows[0] && _setRows[0].slug) ? `/cards/dbsfusionworld/sets/${_setRows[0].slug}` : `/cards/dbsfusionworld`;

    const priceAud = parseFloat(card.price_aud) || (card.market_price ? card.market_price * 1.45 : null);
    const pageUrl = encodeURIComponent(`https://cardsoncardsoncards.com.au/cards/dbsfusionworld/${card.slug}`);
    const shareText = encodeURIComponent(`${card.name} DBS Fusion World Card Game -- ${priceAud ? 'AU$'+priceAud.toFixed(2) : 'check price'} on Cards on Cards on Cards`);
    const ebaySearchUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(card.name+' dragon ball fusion world card')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;

    const [_psr0, _psr1] = await Promise.allSettled([
      supabaseGet(`dbsfusionworld_cards?set_id=eq.${card.set_id}&slug=neq.${encodeURIComponent(slug)}&market_price=gt.0&image_url=not.is.null&limit=12&order=market_price.desc&select=*`).catch(() => []),
      (EBAY_CLIENT_ID && EBAY_CLIENT_SECRET) ? getEbayToken().catch(() => null) : Promise.resolve(null)
    ]);
  const relatedCards = _psr0.status === 'fulfilled' ? _psr0.value : [];
  const ebayToken = _psr1.status === 'fulfilled' ? _psr1.value : [];

    const ebayListings = ebayToken ? await getEbayListings(card.name, ebayToken).catch(() => []) : [];

    const breadcrumb = { "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":"https://cardsoncardsoncards.com.au"},
      {"@type":"ListItem","position":2,"name":"DBS Fusion World Cards","item":"https://cardsoncardsoncards.com.au/cards/dbsfusionworld"},
      {"@type":"ListItem","position":3,"name":card.name,"item":`https://cardsoncardsoncards.com.au/cards/dbsfusionworld/${card.slug}`}
    ]};

    const productSchema = priceAud ? { "@context":"https://schema.org","@type":"Product","name":card.name,"image":card.image_url||'',
      "offers":{"@type":"Offer","priceCurrency":"AUD","price":priceAud.toFixed(2),"availability":"https://schema.org/InStock","url":`https://cardsoncardsoncards.com.au/cards/dbsfusionworld/${card.slug}`}
    } : null;

    const relatedHTML = relatedCards.length ? `
    <div style="max-width:1100px;margin:0 auto 32px;padding:0 24px">
      <h2 style="font-size:18px;margin-bottom:16px;font-family:'Cinzel',serif">More from ${card.set_name || 'this Set'}</h2>
      <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;scrollbar-width:none">
        ${relatedCards.map(c => {
          const rAud = parseFloat(c.price_aud) || (c.market_price ? c.market_price * 1.45 : 0);
          return `<a href="/cards/dbsfusionworld/${c.slug}" style="flex:0 0 130px;background:#161929;border:1px solid #252840;border-radius:8px;padding:8px;text-decoration:none">
            ${c.image_url ? `<img src="${c.image_url}" alt="${esc(c.name)}" loading="lazy" style="width:100%;border-radius:5px">` : ''}
            <div style="font-size:10px;color:#F0F2FF;margin-top:5px;line-height:1.3">${esc(c.name)}</div>
            ${rAud >= 0.50 ? `<div style="font-size:11px;color:#C9A84C;font-weight:700;margin-top:2px">~AU$${rAud.toFixed(0)}</div>` : ''}
          </a>`;
        }).join('')}
      </div>
    </div>` : '';

    const ebayHTML = `
    <div style="max-width:1100px;margin:0 auto 32px;padding:0 24px">
      <h2 style="font-size:18px;margin-bottom:16px;font-family:'Cinzel',serif">Buy on eBay AU</h2>
      ${ebayListings.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:16px">
        ${ebayListings.slice(0,6).map(item => {
          const price = item.price?.value ? `AU$${parseFloat(item.price.value).toFixed(2)}` : '';
          const epnUrl = `https://www.ebay.com.au/itm/${item.itemId}?mkcid=1&mkrid=705-53470-19255-0&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
          return `<a href="${epnUrl}" target="_blank" rel="noopener" style="display:block;background:#161929;border:1px solid #252840;border-radius:8px;padding:12px;text-decoration:none">
            <div style="font-size:13px;color:#F0F2FF;margin-bottom:6px;line-height:1.3">${(item.title||card.name).slice(0,60)}...</div>
            <div style="font-size:16px;font-weight:700;color:#C9A84C">${price}</div>
          </a>`;
        }).join('')}
      </div>` : ''}
      <a href="${ebaySearchUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:10px 20px;background:rgba(201,168,76,.12);border:1px solid rgba(201,168,76,.3);color:#C9A84C;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">See all ${card.name} listings on eBay AU →</a>
    </div>`;

    const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${card.name} Price Australia | DBS Fusion World | Cards on Cards on Cards</title>
  <meta name="description" content="${card.name} DBS Fusion World card${priceAud ? ` -- ~AU$${priceAud.toFixed(2)}` : ''}. ${card.rarity ? `${card.rarity}. ` : ''}View price and buy on eBay AU.">
  <meta property="og:site_name" content="Cards on Cards on Cards">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/dbsfusionworld/${card.slug}">
  ${(!priceAud || priceAud < 1.00) ? '<meta name="robots" content="noindex, follow">' : ''}
  <link rel="icon" type="image/png" href="/c3logo.png">
  ${card.image_url ? `<meta property="og:image" content="${card.image_url}">` : ''}
  <meta property="og:title" content="${card.name} | DBS Fusion World Price AU">
  <script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>
  ${productSchema ? `<script type="application/ld+json">${JSON.stringify(productSchema)}</script>` : ''}
  <script type="application/ld+json">${JSON.stringify({"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":`What is ${card.name} worth in Australia?`,"acceptedAnswer":{"@type":"Answer","text": priceAud ? `As of ${new Date().toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'})}, ${card.name} has a market price of approximately AU$${priceAud.toFixed(2)}, based on daily-updated market pricing data.` : `${card.name} pricing varies. Check eBay AU for the most current Australian prices.`}},{"@type":"Question","name":`Where can I buy ${card.name} in Australia?`,"acceptedAnswer":{"@type":"Answer","text":`You can buy ${card.name} on eBay AU and from Australian TCG retailers. This page links to live eBay AU listings and shows the AUD price history.`}}]})}</script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#0A0C14;--bg2:#111420;--bg3:#181d2e;--accent:#C9A84C;--text:#F0F2FF;--text2:#A0A8C0;--border:#252840;--radius:12px}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6;overflow-x:hidden}
    .card-hero{max-width:1100px;margin:0 auto;padding:40px 24px;display:grid;grid-template-columns:300px 1fr;gap:40px;align-items:start}
    @media(max-width:680px){.card-hero{grid-template-columns:1fr;padding:24px 16px}}
    .card-img-wrap{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;aspect-ratio:2/3;display:flex;align-items:center;justify-content:center}
    .card-img-wrap img{width:100%;height:100%;object-fit:contain;padding:12px}
    .card-details h1{font-family:'Cinzel',serif;font-size:clamp(22px,4vw,36px);margin-bottom:8px;line-height:1.1}
    .price-tag{font-family:'Cinzel',serif;font-size:28px;font-weight:900;color:var(--accent);margin:16px 0}
    .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:20px 0}
    .meta-item{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 14px}
    .meta-label{font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--text2);margin-bottom:4px}
    .meta-value{font-size:14px;color:var(--text);font-weight:600}
    .cta-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}
    .cta-btn{display:inline-flex;align-items:center;gap:7px;padding:11px 20px;border-radius:9px;font-size:13px;font-weight:700;text-decoration:none}
    .cta-primary{background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.4);color:#E8C97A}
    .cta-secondary{background:var(--bg2);border:1px solid var(--border);color:var(--text2)}
  </style>
</head>
<body>
<style>${NAV_CSS}</style>${navHtml({ gameLabel: 'DBS Fusion World', gameHref: '/cards/dbsfusionworld' })}
<div class="card-hero">
  <div class="card-img-wrap">
    ${card.image_url ? `<img src="${card.image_url}" alt="${esc(card.name)}" loading="eager">` : `<div style="color:var(--text2);font-family:'Cinzel',serif;font-size:18px;padding:24px;text-align:center">${esc(card.name)}</div>`}
  </div>
  <div class="card-details">
    <div style="font-size:12px;color:var(--text2);margin-bottom:8px">
      <a href="/cards/dbsfusionworld" style="color:var(--text2);text-decoration:none">DBS Fusion World</a>
      ${card.set_name ? ` → <a href="${setUrl}" style="color:var(--text2);text-decoration:none">${card.set_name}</a>` : ''}
    </div>
    <h1>${esc(card.name)}</h1>
    ${card.rarity ? `<div style="display:inline-block;background:rgba(201,168,76,.12);border:1px solid rgba(201,168,76,.3);color:#E8C97A;font-size:11px;font-weight:700;padding:3px 10px;border-radius:4px;margin-bottom:8px;text-transform:uppercase">${card.rarity}</div>` : ''}
    <div class="price-tag">${priceAud ? `~AU$${priceAud.toFixed(2)}` : 'Price not available'}</div>
    <div class="meta-grid">
      ${card.number ? `<div class="meta-item"><div class="meta-label">Card Number</div><div class="meta-value">${card.number}</div></div>` : ''}
      ${card.set_name ? `<div class="meta-item"><div class="meta-label">Set</div><div class="meta-value">${card.set_name}</div></div>` : ''}
      ${card.rarity ? `<div class="meta-item"><div class="meta-label">Rarity</div><div class="meta-value">${card.rarity}</div></div>` : ''}
      <div class="meta-item"><div class="meta-label">Price (AUD)</div><div class="meta-value" style="color:var(--accent)">${priceAud ? `AU$${priceAud.toFixed(2)}` : 'N/A'}</div></div>
    </div>
    ${priceChartHTML ? `<div style="margin:16px 0"><div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text2);margin-bottom:8px;font-family:sans-serif">Price History (AUD)</div>${priceChartHTML}${PRICE_CHART_SCRIPT}</div>` : ''}
    <div class="cta-row">
      <a href="${ebaySearchUrl}" target="_blank" rel="noopener" class="cta-btn cta-primary">🛒 Buy on eBay AU →</a>
      <a href="/tracker.html" class="cta-btn cta-secondary">📋 Track Collection</a>
      <button class="cta-btn cta-follow" id="follow-btn" onclick="openFollow()">🔔 Follow this card</button>
    </div>
    <div id="follow-box" style="display:none;margin-top:12px;padding:14px;background:rgba(201,168,76,.05);border:1px solid rgba(201,168,76,.25);border-radius:8px">
      <div style="font-size:13px;color:#e8eaf0;margin-bottom:8px">Email me when this card's price moves significantly.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input id="follow-email" type="email" placeholder="you@example.com" style="flex:1;min-width:200px;padding:9px 12px;border-radius:6px;border:1px solid #242840;background:#0d1117;color:#e8eaf0;font-size:13px">
        <button id="follow-submit" onclick="submitFollow()" style="padding:9px 16px;border-radius:6px;border:none;background:#C9A84C;color:#0A0C14;font-weight:700;font-size:13px;cursor:pointer">Follow</button>
      </div>
      <div id="follow-msg" style="font-size:12px;color:#9ba3c4;margin-top:8px"></div>
      <div style="font-size:11px;color:rgba(160,168,192,.5);margin-top:6px">One confirmation email, then alerts on significant moves. Prices are estimates, see our <a href="/methodology" style="color:#C9A84C">methodology</a>.</div>
      ${MANAGE_FOLLOWS_LINK}
    </div>
    <script>
      var FOLLOW_SLUG = ${JSON.stringify(card.slug)};
      var FOLLOW_NAME = ${JSON.stringify(card.name)};
      function openFollow(){ var b=document.getElementById('follow-box'); if(b) b.style.display = (b.style.display==='none' ? 'block' : 'none'); }
      function submitFollow(){
        var emailEl=document.getElementById('follow-email');
        var msg=document.getElementById('follow-msg');
        var btn=document.getElementById('follow-submit');
        var email=(emailEl.value||'').trim();
        var at=email.indexOf('@');
        if(at<1 || email.lastIndexOf('.')<at){ msg.textContent='Please enter a valid email address.'; return; }
        btn.disabled=true; btn.textContent='Saving...';
        fetch('/api/card-follow',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({email:email,game:'dbsfusionworld',cardSlug:FOLLOW_SLUG,cardName:FOLLOW_NAME})
        }).then(function(r){ return r.json(); }).then(function(d){
          if(d && d.ok){
            msg.textContent = d.alreadyFollowing ? 'You are already following this card.' : 'Check your inbox to confirm.';
            emailEl.style.display='none'; btn.style.display='none';
          } else {
            msg.textContent = (d && d.error) || 'Something went wrong. Please try again.';
            btn.disabled=false; btn.textContent='Follow';
          }
        }).catch(function(){ msg.textContent='Something went wrong. Please try again.'; btn.disabled=false; btn.textContent='Follow'; });
      }
    </script>
    <p style="font-size:11px;color:rgba(160,168,192,.4);margin-top:12px">Prices in AUD. <a href="/methodology" style="color:inherit;text-decoration:underline">Updated daily</a>. eBay links may earn affiliate commission.</p>
    <style>
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
    .helpful-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 18px;background:rgba(201,168,76,.04);border:1px solid rgba(201,168,76,.10);border-radius:8px;margin:20px 0;font-family:sans-serif;font-size:13px;color:var(--text2)}
    .helpful-btn{background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;transition:all .18s}
    .helpful-btn:hover,.helpful-btn.voted{border-color:var(--accent);color:var(--accent)}
    </style>
    <div class="share-bar">
      <span class="share-bar-label">Share</span>
      <button class="share-btn share-discord" onclick="navigator.clipboard.writeText(location.href).then(()=>{this.textContent='✓ Copied';setTimeout(()=>this.textContent='Discord',1500)})">Discord</button>
      <a href="https://reddit.com/submit?url=${pageUrl}&title=${shareText}" target="_blank" rel="noopener" class="share-btn share-reddit">Reddit</a>
      <a href="https://twitter.com/intent/tweet?text=${shareText}&url=${pageUrl}" target="_blank" rel="noopener" class="share-btn share-twitter">𝕏 Twitter</a>
      <a href="https://www.facebook.com/sharer/sharer.php?u=${pageUrl}" target="_blank" rel="noopener" class="share-btn share-facebook">Facebook</a>
      <a href="https://wa.me/?text=${shareText}%20${pageUrl}" target="_blank" rel="noopener" class="share-btn share-whatsapp">WhatsApp</a>
      <button class="share-btn share-copy" onclick="navigator.clipboard.writeText(location.href).then(()=>{this.textContent='✓ Copied!';setTimeout(()=>this.textContent='Copy Link',1500)})">Copy Link</button>
    </div>
    <div class="helpful-bar" id="helpful-bar">
      <span>Was this page helpful?</span>
      <button class="helpful-btn" onclick="voteHelpful(1,this)">👍 Yes</button>
      <button class="helpful-btn" onclick="voteHelpful(0,this)">👎 No</button>
    </div>
  </div>
</div>

${(() => {
  const raw = card.custom_attributes;
  let ca = raw;
  if (typeof raw === 'string') { try { ca = JSON.parse(raw); } catch { ca = null; } }
  if (!ca || typeof ca !== 'object') return '';
  // Preferred display order. apitcg attributes is a dynamic object, so any key
  // actually present but not listed here is appended after these.
  const PREFERRED = ['CardType', 'Color', 'Cost', 'Character Traits', 'Combo Power', 'Power'];
  const SKIP = new Set(['Description', 'Flavor Text', 'Number', 'Name']);
  const clean = v => String(v == null ? '' : v).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const labelFor = k => k.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  const shown = k => !SKIP.has(k) && clean(ca[k]) !== '';
  const keys = [
    ...PREFERRED.filter(k => Object.prototype.hasOwnProperty.call(ca, k) && shown(k)),
    ...Object.keys(ca).filter(k => !PREFERRED.includes(k) && shown(k))
  ];
  if (!keys.length) return '';
  const boxes = keys.map(k => {
    const val = clean(ca[k]);
    const wide = val.length > 60 ? ' cd-box-wide' : '';
    return `<div class="cd-box${wide}"><div class="cd-label">${esc(labelFor(k))}</div><div class="cd-value">${esc(val)}</div></div>`;
  });
  return `<style>.cd-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-top:4px}.cd-box{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:8px;padding:12px}.cd-box-wide{grid-column:1/-1}.cd-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#9ba3c4;margin-bottom:4px}.cd-value{font-size:15px;font-weight:700;color:#e8eaf0}.cd-box-wide .cd-value{font-size:13px;font-weight:600;line-height:1.5}</style>
  <div style="max-width:1100px;margin:0 auto 24px;padding:20px 24px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.08);border-radius:12px"><h2 style="font-size:18px;margin-bottom:16px">Card Details</h2><div class="cd-grid">${boxes.join('')}</div></div>`;
})()}

${relatedHTML}
${ebayHTML}

<footer style="border-top:1px solid var(--border);padding:24px;text-align:center;color:var(--text2);font-size:12px;margin-top:20px">
  <div style="text-align:center;margin:16px 0"><a href="https://buy.stripe.com/3cIdR836CeXk95C475aIM02" target="_blank" rel="noopener" style="background:#C9A84C;color:#0A0C14;padding:9px 20px;border-radius:20px;font-weight:700;text-decoration:none;font-size:13px;display:inline-block">&#10084;&#65039; Support C3</a></div>
  <p><a href="/" style="color:var(--text2);margin:0 8px">Home</a><a href="/cards/dbsfusionworld" style="color:var(--text2);margin:0 8px">DBS Fusion World</a><a href="/blog" style="color:var(--text2);margin:0 8px">Blog</a><a href="/tracker.html" style="color:var(--text2);margin:0 8px">Tracker</a></p>
  <p style="margin-top:8px">© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
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
  tray.push({slug,name,img,price,game:'dbsfusionworld'});saveCompareTray(tray);renderCompareTray();
}
function removeFromCompare(slug){saveCompareTray(getCompareTray().filter(c=>c.slug!==slug));renderCompareTray();}
function goToCompare(){const tray=getCompareTray();if(!tray.length)return;window.location.href='/compare?cards='+tray.map(c=>(c.game||'dbsfusionworld')+':'+c.slug).join(',');}
renderCompareTray();
function voteHelpful(val, btn) {
  document.querySelectorAll('.helpful-btn').forEach(b => b.classList.remove('voted'));
  btn.classList.add('voted');
  btn.textContent = val === 1 ? '👍 Thanks!' : '👎 Noted';
  if (typeof gtag !== 'undefined') gtag('event', 'page_helpful', { value: val, page: window.location.pathname });
  setTimeout(() => { const bar = document.getElementById('helpful-bar'); if (bar) bar.innerHTML = '<span style="color:var(--text2);font-size:13px;font-family:sans-serif">Thanks for the feedback!</span>'; }, 800);
}
document.addEventListener('click',function(e){
  if(e.target.closest('[data-action="copy-discord"]')){
    const btn=e.target.closest('[data-action="copy-discord"]');
    navigator.clipboard.writeText(location.href).then(()=>{btn.textContent='✓ Copied';setTimeout(()=>{btn.textContent='Discord';},1500);});
  }
  if(e.target.closest('[data-action="copy-link"]')){
    const btn=e.target.closest('[data-action="copy-link"]');
    navigator.clipboard.writeText(location.href).then(()=>{btn.textContent='✓ Copied';setTimeout(()=>{btn.textContent='📋 Copy Link';},1500);});
  }
});
</script>
<!-- REPORT BUG WIDGET -->
<style>.bug-float{position:fixed;bottom:20px;right:20px;z-index:9999}.bug-btn{display:flex;align-items:center;gap:6px;background:rgba(15,17,25,.95);border:1px solid rgba(201,168,76,.3);color:#C9A84C;padding:8px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;font-family:sans-serif;backdrop-filter:blur(12px);transition:all .2s;text-decoration:none;letter-spacing:.03em;box-shadow:0 4px 16px rgba(0,0,0,.4)}.bug-btn:hover{border-color:#C9A84C;background:rgba(201,168,76,.12);color:#E8C86A;text-decoration:none;transform:translateY(-2px)}.bug-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10000;align-items:center;justify-content:center;backdrop-filter:blur(4px)}.bug-modal.open{display:flex}.bug-box{background:#111420;border:1px solid #252840;border-radius:14px;padding:28px;width:100%;max-width:420px;margin:0 16px;position:relative}.bug-close{position:absolute;top:12px;right:14px;background:none;border:none;color:#9ba3c4;font-size:18px;cursor:pointer}.bug-form select,.bug-form textarea{width:100%;background:rgba(255,255,255,.05);border:1px solid #252840;border-radius:8px;color:#F0F2FF;font-family:sans-serif;font-size:13px;padding:9px 12px;margin-bottom:12px;outline:none}.bug-form select option{background:#e8eaf0;color:#111420}.bug-form select{background:#e8eaf0;color:#111420}.bug-hidden{display:none}.bug-submit{width:100%;padding:10px;background:#C9A84C;color:#0A0C14;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer}.bug-thanks{display:none;text-align:center;padding:12px 0}.bug-thanks p{color:#4ADE80;font-size:14px}</style>
<div class="bug-float"><a class="bug-btn" onclick="document.getElementById('bugModal').classList.add('open');return false" href="#">&#x1F41B; Report a Bug</a></div>
<div class="bug-modal" id="bugModal" onclick="if(event.target===this)this.classList.remove('open')">
  <div class="bug-box">
    <button class="bug-close" onclick="document.getElementById('bugModal').classList.remove('open')">&#x2715;</button>
    <h3 style="font-family:'Cinzel',serif;font-size:17px;font-weight:700;color:#F0F2FF;margin-bottom:4px">&#x1F41B; Report a Bug</h3>
    <p style="font-size:12px;color:#9ba3c4;margin-bottom:18px">Spotted something wrong? Takes 20 seconds.</p>
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
<script>(function(){const u=document.getElementById('bugPageUrl');if(u)u.value=window.location.href;const f=document.getElementById('bugReportForm');if(!f)return;f.addEventListener('submit',function(e){e.preventDefault();const b=document.getElementById('bugSubmit');b.disabled=true;b.textContent='Sending...';const d=new FormData(f);fetch('/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(d).toString()}).then(function(){document.getElementById('bugThanks').style.display='block';f.querySelector('select').style.display='none';f.querySelector('textarea').style.display='none';b.style.display='none';setTimeout(function(){document.getElementById('bugModal').classList.remove('open');},2000);}).catch(function(){b.disabled=false;b.textContent='Submit Report';});});})();</script>
${viewTrackingScript('dbsfusionworld', card.slug)}
</body>
</html>`;

    return new Response(html, { status: 200, headers });
  } catch (err) {
    console.error('[dbsfusionworld-card-page]', err.message);
    return new Response(notFoundPage(slug), { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '120' } });
  }
};

export const config = { path: '/cards/dbsfusionworld/:slug+', excludedPath: '/cards/dbsfusionworld/sets/*' };
