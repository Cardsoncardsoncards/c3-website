// netlify/functions/onepiece-card-page.mjs
// Serves /cards/onepiece/:slug
// Correct columns: market_price, price_aud, image_url, set_id, set_name

const SUPABASE_URL       = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY  = Netlify.env.get('SUPABASE_ANON_KEY');
const EBAY_CLIENT_ID     = Netlify.env.get('EBAY_CLIENT_ID');
const EBAY_CLIENT_SECRET = Netlify.env.get('EBAY_CLIENT_SECRET');
const EPN_CAMPID         = '5339146789';
const AMAZON_TAG         = 'blasdigital-22';

async function supabaseGet(path) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
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
    const q = encodeURIComponent(`${cardName} one piece card`);
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${q}&category_ids=183454&filter=buyingOptions%3A%7BFIXED_PRICE%7D&sort=price&limit=6`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_AU', 'X-EBAY-C-ENDUSERCTX': `affiliateCampaignId=${EPN_CAMPID}` } });
    if (!res.ok) return [];
    const d = await res.json();
    return (d.itemSummaries || []).map(item => ({ ...item, itemId: item.itemId?.includes('|') ? item.itemId.split('|')[1] : item.itemId }));
  } catch { return []; }
}

const NAV = `<nav style="background:rgba(10,12,20,.97);backdrop-filter:blur(18px);border-bottom:1px solid #252840;padding:12px 0;position:sticky;top:0;z-index:100">
  <div style="max-width:1100px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:12px">
    <a href="/" style="display:flex;align-items:center;gap:9px;font-family:'Cinzel',serif;font-size:11.5px;font-weight:700;letter-spacing:.12em;color:#C9A84C;text-decoration:none;text-transform:uppercase;white-space:nowrap;flex-shrink:0">
      <img src="/c3logo.png" alt="C3" style="height:32px;width:32px;border-radius:6px;object-fit:cover;flex-shrink:0">
      <span>Cards on Cards on Cards</span>
    </a>
    <div style="display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none">
      <a href="/" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(160,196,255,.35);color:#A0C4FF;white-space:nowrap">Home</a>
      <a href="/cards/onepiece" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(204,0,0,.4);color:#FF4444;background:rgba(204,0,0,.08);white-space:nowrap">One Piece</a>
      <a href="/shop.html" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(201,168,76,.35);color:#C9A84C;white-space:nowrap">Shop</a>
      <a href="/ev-calculator.html" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(96,165,250,.35);color:#60A5FA;white-space:nowrap">EV Calc</a>
      <a href="/compare" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(124,106,245,.35);color:#a78bfa;white-space:nowrap">Compare</a>
      <a href="/generators" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(201,168,76,.35);color:#C9A84C;white-space:nowrap">Generators</a>
      <a href="/tracker.html" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(192,132,252,.35);color:#C084FC;white-space:nowrap">Tracker</a>
      <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=C3Nav&toolid=10001&mkevt=1" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(96,165,250,.35);color:#60A5FA;white-space:nowrap">eBay</a>
      <a href="/contact.html" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(148,163,184,.35);color:#94A3B8;white-space:nowrap">Contact Us</a>
    </div>
  </div>
</nav>`;

function notFoundPage(slug) {
  return `<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><title>Card Not Found | Cards on Cards on Cards</title><link rel="icon" type="image/png" href="/c3logo.png"></head><body style="background:#0A0C14;color:#F0F2FF;font-family:sans-serif">${NAV}<div style="padding:80px 24px;text-align:center"><h1 style="font-family:'Cinzel',serif;color:#CC0000;margin-bottom:16px">Card Not Found</h1><p style="color:#A0A8C0;margin-bottom:24px">The card "${slug}" doesn't exist or hasn't synced yet.</p><a href="/cards/onepiece" style="display:inline-block;padding:10px 24px;background:rgba(204,0,0,.15);border:1px solid rgba(204,0,0,.4);color:#FF4444;border-radius:8px;text-decoration:none">Browse One Piece Cards</a></div></body></html>`;
}

export default async (req) => {
  const url = new URL(req.url);
  const slug = decodeURIComponent(url.pathname.replace('/cards/onepiece/', '').replace(/^\/|\/$/g, ''));
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=7200' };

  if (!slug || slug.startsWith('sets/')) return new Response('Not found', { status: 404, headers });

  try {
    const cards = await supabaseGet(`onepiece_cards?slug=eq.${encodeURIComponent(slug)}&limit=1`);
    if (!cards || cards.length === 0) return new Response(notFoundPage(slug), { status: 404, headers });
    const card = cards[0];

    const priceAud = parseFloat(card.price_aud) || (card.market_price ? card.market_price * 1.58 : null);
    const ebaySearchUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(card.name+' one piece card')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;

    const [relatedCards, ebayToken] = await Promise.all([
      supabaseGet(`onepiece_cards?set_id=eq.${card.set_id}&slug=neq.${encodeURIComponent(slug)}&market_price=gt.0&image_url=not.is.null&limit=12&order=market_price.desc`).catch(() => []),
      (EBAY_CLIENT_ID && EBAY_CLIENT_SECRET) ? getEbayToken().catch(() => null) : Promise.resolve(null)
    ]);

    const ebayListings = ebayToken ? await getEbayListings(card.name, ebayToken).catch(() => []) : [];

    const breadcrumb = { "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":"https://cardsoncardsoncards.com.au"},
      {"@type":"ListItem","position":2,"name":"One Piece Cards","item":"https://cardsoncardsoncards.com.au/cards/onepiece"},
      {"@type":"ListItem","position":3,"name":card.name,"item":`https://cardsoncardsoncards.com.au/cards/onepiece/${card.slug}`}
    ]};

    const productSchema = priceAud ? { "@context":"https://schema.org","@type":"Product","name":card.name,"image":card.image_url||'',
      "offers":{"@type":"Offer","priceCurrency":"AUD","price":priceAud.toFixed(2),"availability":"https://schema.org/InStock","url":`https://cardsoncardsoncards.com.au/cards/onepiece/${card.slug}`}
    } : null;

    const relatedHTML = relatedCards.length ? `
    <div style="max-width:1100px;margin:0 auto 32px;padding:0 24px">
      <h2 style="font-size:18px;margin-bottom:16px;font-family:'Cinzel',serif">More from ${card.set_name || 'this Set'}</h2>
      <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;scrollbar-width:none">
        ${relatedCards.map(c => {
          const rAud = parseFloat(c.price_aud) || (c.market_price ? c.market_price * 1.58 : 0);
          return `<a href="/cards/onepiece/${c.slug}" style="flex:0 0 130px;background:#161929;border:1px solid #252840;border-radius:8px;padding:8px;text-decoration:none;transition:border-color .2s" onmouseover="this.style.borderColor='#CC0000'" onmouseout="this.style.borderColor='#252840'">
            ${c.image_url ? `<img src="${c.image_url}" alt="${c.name}" loading="lazy" style="width:100%;border-radius:5px">` : ''}
            <div style="font-size:10px;color:#F0F2FF;margin-top:5px;line-height:1.3">${c.name}</div>
            ${rAud >= 0.50 ? `<div style="font-size:11px;color:#CC0000;font-weight:700;margin-top:2px">~AU$${rAud.toFixed(0)}</div>` : ''}
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
          const epnUrl = `https://www.ebay.com.au/itm/${item.itemId}?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
          return `<a href="${epnUrl}" target="_blank" rel="noopener" style="display:block;background:#161929;border:1px solid #252840;border-radius:8px;padding:12px;text-decoration:none;transition:border-color .2s" onmouseover="this.style.borderColor='#CC0000'" onmouseout="this.style.borderColor='#252840'">
            <div style="font-size:13px;color:#F0F2FF;margin-bottom:6px;line-height:1.3">${(item.title||card.name).slice(0,60)}...</div>
            <div style="font-size:16px;font-weight:700;color:#CC0000">${price}</div>
          </a>`;
        }).join('')}
      </div>` : ''}
      <a href="${ebaySearchUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:10px 20px;background:rgba(204,0,0,.12);border:1px solid rgba(204,0,0,.3);color:#CC0000;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">See all ${card.name} listings on eBay AU →</a>
    </div>`;

    const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${card.name} Price Australia | One Piece TCG | Cards on Cards on Cards</title>
  <meta name="description" content="${card.name} One Piece TCG card${priceAud ? ` — ~AU$${priceAud.toFixed(2)}` : ''}. ${card.rarity ? `${card.rarity}. ` : ''}View price and buy on eBay AU.">
  <meta property="og:site_name" content="Cards on Cards on Cards">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/onepiece/${card.slug}">
  <link rel="icon" type="image/png" href="/c3logo.png">
  ${card.image_url ? `<meta property="og:image" content="${card.image_url}">` : ''}
  <meta property="og:title" content="${card.name} | One Piece Price AU">
  <script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>
  ${productSchema ? `<script type="application/ld+json">${JSON.stringify(productSchema)}</script>` : ''}
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#0A0C14;--bg2:#111420;--bg3:#181d2e;--accent:#CC0000;--text:#F0F2FF;--text2:#A0A8C0;--border:#252840;--radius:12px}
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
    .cta-btn{display:inline-flex;align-items:center;gap:7px;padding:11px 20px;border-radius:9px;font-size:13px;font-weight:700;text-decoration:none;transition:opacity .2s}
    .cta-btn:hover{opacity:.85}
    .cta-primary{background:rgba(204,0,0,.15);border:1px solid rgba(204,0,0,.4);color:#FF4444}
    .cta-secondary{background:var(--bg2);border:1px solid var(--border);color:var(--text2)}
    .section{max-width:1100px;margin:0 auto 32px;padding:0 24px}
    .section h2{font-size:18px;margin-bottom:16px;font-family:'Cinzel',serif}
  </style>
</head>
<body>
${NAV}
<div class="card-hero">
  <div class="card-img-wrap">
    ${card.image_url ? `<img src="${card.image_url}" alt="${card.name}" loading="eager">` : `<div style="color:var(--text2);font-family:'Cinzel',serif;font-size:18px;padding:24px;text-align:center">${card.name}</div>`}
  </div>
  <div class="card-details">
    <div style="font-size:12px;color:var(--text2);margin-bottom:8px">
      <a href="/cards/onepiece" style="color:var(--text2);text-decoration:none">One Piece</a>
      ${card.set_name ? ` → <a href="/cards/onepiece/sets/${encodeURIComponent(card.set_id||'')}" style="color:var(--text2);text-decoration:none">${card.set_name}</a>` : ''}
    </div>
    <h1>${card.name}</h1>
    ${card.rarity ? `<div style="display:inline-block;background:rgba(204,0,0,.12);border:1px solid rgba(204,0,0,.3);color:#FF4444;font-size:11px;font-weight:700;padding:3px 10px;border-radius:4px;margin-bottom:8px;text-transform:uppercase">${card.rarity}</div>` : ''}
    <div class="price-tag">${priceAud ? `~AU$${priceAud.toFixed(2)}` : 'Price not available'}</div>
    ${card.low_price ? `<div style="font-size:13px;color:var(--text2);margin-bottom:8px">Low: ~AU$${(card.low_price*1.58).toFixed(2)} · Foil: ${card.foil_market_price ? `~AU$${(card.foil_market_price*1.58).toFixed(2)}` : 'N/A'}</div>` : ''}
    <div class="meta-grid">
      ${card.number ? `<div class="meta-item"><div class="meta-label">Card Number</div><div class="meta-value">${card.number}</div></div>` : ''}
      ${card.set_name ? `<div class="meta-item"><div class="meta-label">Set</div><div class="meta-value">${card.set_name}</div></div>` : ''}
      ${card.rarity ? `<div class="meta-item"><div class="meta-label">Rarity</div><div class="meta-value">${card.rarity}</div></div>` : ''}
      <div class="meta-item"><div class="meta-label">Price (AUD)</div><div class="meta-value" style="color:var(--accent)">${priceAud ? `AU$${priceAud.toFixed(2)}` : 'N/A'}</div></div>
    </div>
    <div class="cta-row">
      <a href="${ebaySearchUrl}" target="_blank" rel="noopener" class="cta-btn cta-primary">🛒 Buy on eBay AU →</a>
      <a href="/tracker.html" class="cta-btn cta-secondary">📋 Track Collection</a>
    </div>
    <p style="font-size:11px;color:rgba(160,168,192,.4);margin-top:12px">Prices in AUD. Updated daily. eBay links may earn affiliate commission.</p>
  </div>
</div>

${relatedHTML}
${ebayHTML}

<footer style="border-top:1px solid var(--border);padding:24px;text-align:center;color:var(--text2);font-size:12px;margin-top:20px">
  <p><a href="/" style="color:var(--text2);margin:0 8px">Home</a><a href="/cards/onepiece" style="color:var(--text2);margin:0 8px">One Piece</a><a href="/blog" style="color:var(--text2);margin:0 8px">Blog</a><a href="/tracker.html" style="color:var(--text2);margin:0 8px">Tracker</a></p>
  <p style="margin-top:8px">© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
  <p style="margin-top:6px;font-size:11px">One Piece Card Game © Bandai. C3 is not affiliated with Bandai.</p>
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
  cardsEl.innerHTML=tray.map(c=>'<div style="display:flex;align-items:center;gap:6px;background:#22263a;border:1px solid #2d3254;border-radius:8px;padding:6px 10px">'+(c.img?'<img src="'+c.img+'" style="width:28px;border-radius:3px">':'')+'<span style="font-size:12px;color:#e8eaf0;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+c.name+'</span><button onclick="removeFromCompare(''+c.slug+'')" style="background:none;border:none;color:#9ba3c4;cursor:pointer;font-size:14px;padding:0 2px">×</button></div>').join('');
  const btn=document.getElementById('c3-compare-btn');const lbl=document.getElementById('c3-compare-lbl');
  if(btn&&lbl){const pageSlug=btn.dataset.slug;const inTray=tray.some(c=>c.slug===pageSlug);btn.style.borderColor=inTray?'#7c6af5':'rgba(124,106,245,.4)';btn.style.color='#7c6af5';lbl.textContent=inTray?'Added ✓':'⚖️ Add to Compare';}
}
function addToCompare(slug,name,img,price,game){
  let tray=getCompareTray();
  if(tray.some(c=>c.slug===slug)){removeFromCompare(slug);return;}
  if(tray.length>=5){alert('Maximum 5 cards. Remove one first.');return;}
  tray.push({slug,name,img,price,game:'onepiece'});saveCompareTray(tray);renderCompareTray();
  if(typeof gtag!=='undefined')gtag('event','card_added_to_tray',{card_name:name,game:'onepiece'});
}
function removeFromCompare(slug){saveCompareTray(getCompareTray().filter(c=>c.slug!==slug));renderCompareTray();}
function goToCompare(){const tray=getCompareTray();if(!tray.length)return;window.location.href='/compare?cards='+tray.map(c=>c.slug).join(',');}
renderCompareTray();
if(typeof gtag!=='undefined'){document.querySelectorAll('a[href*="ebay"]').forEach(a=>a.addEventListener('click',()=>gtag('event','ebay_card_click',{game:'onepiece'})));}
</script>
</body>
</html>`;

    return new Response(html, { status: 200, headers });
  } catch (err) {
    console.error('[onepiece-card-page]', err.message);
    return new Response(notFoundPage(slug), { status: 404, headers });
  }
};

export const config = { path: '/cards/onepiece/:slug+' };
