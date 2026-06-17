import { NAV_CSS, navHtml } from './shared/nav.mjs';
// netlify/functions/unionarena-card-page.mjs
// Serves /cards/unionarena/:slug
// Union Arena individual card pages with AUD pricing and affiliate links
// Built: 20 May 2026

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID        = '5339146789';
const AMAZON_TAG        = 'blasdigital-22';
const ACCENT            = '#10B981';
const ACCENT_RGB        = '16,185,129';
const GAME_LABEL        = 'Union Arena';
const GAME_KEY          = 'unionarena';

function esc(str) {
  return (str == null ? '' : String(str))
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

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
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) { clearTimeout(timer); return []; }
}

function parseCustomAttrs(raw) {
  if (!raw) return null;
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (typeof obj !== 'object' || Array.isArray(obj)) return null;
    const entries = Object.entries(obj).filter(([k, v]) => v != null && v !== '' && v !== false);
    return entries.length ? entries : null;
  } catch { return null; }
}

function graceful404(slug) {
  const cardName = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const ebayUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(cardName+' union arena card')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(cardName)} | Union Arena | Cards on Cards on Cards</title>
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0A0C14;color:#F0F2FF;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}.wrap{max-width:440px}h1{color:#10B981;font-size:24px;margin-bottom:12px;font-family:'Cinzel',serif}p{color:#8892b0;font-size:14px;margin-bottom:24px;line-height:1.6}.btn{display:inline-block;background:#10B981;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;margin:4px}.btn-sec{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:#F0F2FF}</style>
</head>
<body><div class="wrap">
  <h1>${esc(cardName)}</h1>
  <p>We could not find that Union Arena card. It may not be in our database yet.</p>
  <a href="${ebayUrl}" target="_blank" rel="noopener" class="btn">Search eBay AU &#8599;</a>
  <a href="/cards/unionarena" class="btn btn-sec">Browse Union Arena</a>
</div></body></html>`;
}


async function getExchangeRate() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD', { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return 1.58;
    const data = await res.json();
    return data.rates?.AUD || 1.58;
  } catch { return 1.58; }
}
export default async (req) => {
  const url     = new URL(req.url);
  const slug    = url.pathname.replace(/^\/cards\/unionarena\//, '').replace(/\/$/, '');
  const AUD_RATE = await getExchangeRate();

  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=1800, s-maxage=3600'
  };

  if (!slug || slug === '') {
    return Response.redirect('https://cardsoncardsoncards.com.au/cards/unionarena', 302);
  }

  // Parallel: fetch card + set info
  const [cardResult] = await Promise.allSettled([
    supabaseGet(`unionarena_cards?slug=eq.${encodeURIComponent(slug)}&limit=1&select=*`)
  ]);

  const cardArr = cardResult.status === 'fulfilled' ? cardResult.value : [];
  const card    = cardArr[0];

  if (!card) {
    return new Response(graceful404(slug), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

  // Parallel supporting data
  const [relatedResult, sealedResult, setResult, prevNextResult] = await Promise.allSettled([
    // Singles only (no sealed products)
    card.set_id
      ? supabaseGet(`unionarena_cards?set_id=eq.${card.set_id}&slug=neq.${encodeURIComponent(slug)}&order=market_price.desc.nullslast&limit=12&select=slug,name,image_url,market_price,price_aud,rarity&$unionarena_filter`)
      : Promise.resolve([]),
    // Sealed products for this set
    card.set_id
      ? supabaseGet(`unionarena_cards?set_id=eq.${card.set_id}&select=slug,name,image_url,market_price,price_aud,low_price&order=market_price.desc.nullslast&limit=6`)
      : Promise.resolve([]),
    // Set info
    card.set_id
      ? supabaseGet(`unionarena_sets?id=eq.${card.set_id}&limit=1&select=id,name,slug,release_date`)
      : Promise.resolve([]),
    // Prev/next by card number
    card.set_id
      ? supabaseGet(`unionarena_cards?set_id=eq.${card.set_id}&select=slug,name,number&order=number.asc&limit=500`)
      : Promise.resolve([])
  ]);

  const relatedCardsRaw = relatedResult.status === 'fulfilled' ? relatedResult.value : [];
  const sealedRaw       = sealedResult.status  === 'fulfilled' ? sealedResult.value  : [];
  const setArr          = setResult.status      === 'fulfilled' ? setResult.value     : [];
  const allSetCards     = prevNextResult.status === 'fulfilled' ? prevNextResult.value : [];
  const set             = setArr[0] || null;

  // Split singles vs sealed products
  const SEALED_KEYS = ['booster box', 'booster pack', ' case', 'bundle', 'display', 'sealed product', 'starter deck', 'starter set', 'trial deck', 'trial set', 'deck set', 'box set', 'collection box', 'premium set', 'gift set', 'booster display'];
  const relatedCards = relatedCardsRaw.filter(c => {
    const n = (c.name||'').toLowerCase();
    return !SEALED_KEYS.some(k => n.includes(k));
  });
  const sealedCards = sealedRaw.filter(c => {
    const n = (c.name||'').toLowerCase();
    return SEALED_KEYS.some(k => n.includes(k)) && c.market_price > 0;
  });

  // Prev/next by number
  const cardIdx  = allSetCards.findIndex(c => c.slug === slug);
  const prevCard = cardIdx > 0 ? allSetCards[cardIdx - 1] : null;
  const nextCard = cardIdx >= 0 && cardIdx < allSetCards.length - 1 ? allSetCards[cardIdx + 1] : null;

  const priceAud     = card.price_aud > 0 ? parseFloat(card.price_aud) : card.market_price > 0 ? card.market_price * 1.58 : null;

  // Social share
  const pageUrl   = encodeURIComponent(`https://cardsoncardsoncards.com.au/cards/unionarena/${slug}`);
  const shareText = encodeURIComponent(`${card.name} -- ${priceAud ? 'AU$'+priceAud.toFixed(2) : 'check price'} on Cards on Cards on Cards (Australia)`);
  const shareBar  = `<button onclick="navigator.clipboard.writeText('https://cardsoncardsoncards.com.au/cards/unionarena/${slug}').then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Discord',1500)})" style="padding:6px 12px;background:#5865F2;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">Discord</button>
    <a href="https://reddit.com/submit?url=${pageUrl}&title=${shareText}" target="_blank" rel="noopener" style="padding:6px 12px;background:#FF4500;color:#fff;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none">Reddit</a>
    <a href="https://twitter.com/intent/tweet?text=${shareText}&url=${pageUrl}" target="_blank" rel="noopener" style="padding:6px 12px;background:#000;color:#fff;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none">&#120143; Twitter</a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=${pageUrl}" target="_blank" rel="noopener" style="padding:6px 12px;background:#1877F2;color:#fff;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none">Facebook</a>
    <a href="https://wa.me/?text=${shareText}%20${pageUrl}" target="_blank" rel="noopener" style="padding:6px 12px;background:#25D366;color:#fff;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none">WhatsApp</a>
    <button onclick="navigator.clipboard.writeText('https://cardsoncardsoncards.com.au/cards/unionarena/${slug}').then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy Link',1500)})" style="padding:6px 12px;background:#111420;border:1px solid #242840;color:#e8eaf0;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">Copy Link</button>`;  const priceDisplay = priceAud ? `AU$${priceAud.toFixed(2)}` : 'Price TBC';
  const customAttrs  = parseCustomAttrs(card.custom_attributes);

  const ebayCardUrl  = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent((card.name||slug.replace(/-/g,' '))+' union arena card')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
  const amazonUrl    = `https://www.amazon.com.au/s?k=${encodeURIComponent((card.name||'')+' union arena card')}&tag=${AMAZON_TAG}`;
  const setPageUrl   = set?.slug ? `/cards/unionarena/sets/${esc(set.slug)}` : `/cards/unionarena`;

  const relatedHTML = relatedCards.length ? relatedCards.map(c => {
    const p = c.price_aud > 0 ? parseFloat(c.price_aud) : c.market_price > 0 ? (c.market_price*1.58) : 0;
    return `<a href="/cards/unionarena/${c.slug}" style="background:#111420;border:1px solid #242840;border-radius:8px;padding:8px;text-align:center;display:block;text-decoration:none;transition:border-color .2s" onmouseover="this.style.borderColor='#10B981'" onmouseout="this.style.borderColor='#242840'">
      ${c.image_url ? `<img src="${esc(c.image_url)}" alt="${esc(c.name)}" style="width:100%;border-radius:5px;max-height:110px;object-fit:contain;margin-bottom:4px" loading="lazy">` : `<div style="height:80px;background:#0d0f1a;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:18px;color:#9ba3c4;margin-bottom:4px">&#127183;</div>`}
      <div style="font-size:10px;color:#e8eaf0;line-height:1.3;font-weight:600">${esc(c.name)}</div>
      ${c.rarity ? `<div style="font-size:9px;color:#9ba3c4">${esc(c.rarity)}</div>` : ''}
      ${p > 0 ? `<div style="font-size:11px;color:#10B981;font-weight:700">AU$${p.toFixed(0)}</div>` : ''}
    </a>`;
  }).join('') : '';

  const attrsHTML = customAttrs ? `
  <div style="background:#111420;border:1px solid #242840;border-radius:12px;padding:20px;margin-bottom:20px">
    <h2 style="font-size:15px;font-weight:700;color:#e8eaf0;margin-bottom:12px">Card Details</h2>
    <dl style="display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font-size:13px">
      ${customAttrs.map(([k,v]) => `<dt style="color:#9ba3c4;white-space:nowrap">${esc(String(k).replace(/_/g,' '))}</dt><dd style="color:#e8eaf0">${esc(String(v))}</dd>`).join('')}
    </dl>
  </div>` : '';

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(card.name)} Price Australia | ${esc(card.set_name||'Union Arena')} | Cards on Cards on Cards</title>
  <meta name="description" content="${esc(card.name)} from ${esc(card.set_name||'Union Arena')}. ${priceDisplay} AUD. Buy on eBay AU. Australia's Union Arena price guide.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/unionarena/${esc(slug)}">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <meta property="og:title" content="${esc(card.name)} | Union Arena | Cards on Cards on Cards">
  <meta property="og:description" content="${esc(card.name)} - ${priceDisplay} AUD. Buy on eBay AU.">
  <meta property="og:image" content="${card.image_url ? esc(card.image_url) : 'https://cardsoncardsoncards.com.au/c3-og-banner.png'}">
  <meta property="og:url" content="https://cardsoncardsoncards.com.au/cards/unionarena/${esc(slug)}">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://cardsoncardsoncards.com.au"},{"@type":"ListItem","position":2,"name":"Union Arena","item":"https://cardsoncardsoncards.com.au/cards/unionarena"},{"@type":"ListItem","position":3,"name":"${(card.name||'').replace(/"/g,'&quot;')}","item":"https://cardsoncardsoncards.com.au/cards/unionarena/${esc(slug)}"}]}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <style>
    :root{--bg:#0A0C14;--bg2:#111420;--bg3:#181d2e;--accent:#10B981;--accent-rgb:16,185,129;--gold:#C9A84C;--text:#e8eaf0;--text2:#9ba3c4;--border:#242840;--radius:12px}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6;min-height:100vh}
    body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(ellipse 60% 40% at 50% 0%,rgba(var(--accent-rgb),.05),transparent 60%)}
    a{color:inherit;text-decoration:none}
    .wrap{max-width:1100px;margin:0 auto;padding:24px;position:relative;z-index:1}
    .card-layout{display:grid;grid-template-columns:280px 1fr;gap:28px;align-items:start;margin-bottom:32px}
    @media(max-width:720px){.card-layout{grid-template-columns:1fr}}
    .card-image-col{position:sticky;top:20px}
    .card-image-col img{width:100%;border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,.7);display:block}
    .card-image-placeholder{width:100%;aspect-ratio:2.5/3.5;background:var(--bg2);border:1px solid var(--border);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:64px}
    .card-info h1{font-family:'Cinzel',serif;font-size:clamp(20px,3vw,30px);font-weight:900;color:var(--text);margin-bottom:6px;line-height:1.1}
    .card-meta{font-size:13px;color:var(--text2);margin-bottom:14px}
    .card-meta a{color:var(--accent)}
    .badges{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
    .badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:.04em}
    .badge-rarity-mythic,.badge-rarity-mythicrare{background:#7a3a00;color:#ffcc88}
    .badge-rarity-rare{background:#4a3a00;color:#ffd700}
    .badge-rarity-uncommon,.badge-rarity-superrare,.badge-rarity-ultra{background:#1a2a3a;color:#aaccee}
    .badge-rarity-common{background:#222;color:#aaa}
    .badge-rarity-secret,.badge-rarity-secretrare{background:rgba(167,139,250,.15);color:#a78bfa;border:1px solid rgba(167,139,250,.3)}
    .badge-rarity{background:var(--bg3);color:var(--text2);border:1px solid var(--border)}
    .price-block{background:var(--bg2);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:var(--radius);padding:20px;margin-bottom:16px}
    .price-main{font-size:38px;font-weight:900;color:var(--accent);font-family:'Cinzel',serif}
    .price-sub{font-size:13px;color:var(--text2);margin-top:4px}
    .cta-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
    .btn{display:inline-flex;align-items:center;gap:7px;padding:11px 20px;border-radius:8px;font-weight:700;font-size:13px;text-decoration:none;transition:all .2s;border:none;cursor:pointer;font-family:'DM Sans',sans-serif}
    .btn:hover{opacity:.85}
    .btn-primary{background:var(--accent);color:#000}
    .btn-ebay{background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.3);color:#4ADE80}
    .btn-ghost{background:var(--bg3);border:1px solid var(--border);color:var(--text2)}
    .section{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:20px}
    .section-title{font-size:15px;font-weight:700;color:var(--text);margin-bottom:14px}
    .related-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}
    .breadcrumb{font-size:12px;color:var(--text2);margin-bottom:16px}
    .breadcrumb a{color:var(--text2)}
    .breadcrumb a:hover{color:var(--text)}
    footer{border-top:1px solid var(--border);padding:28px 24px;text-align:center;font-size:12px;color:var(--text2);margin-top:40px;position:relative;z-index:1}
    footer a{color:var(--text2);margin:0 7px}footer a:hover{color:var(--text)}
    @media(max-width:600px){.wrap{padding:16px}.card-image-col{position:static}}
  </style>
</head>
<body>
<style>${NAV_CSS}</style>${navHtml({ gameLabel: 'Union Arena', gameHref: '/cards/unionarena' })}

<div class="wrap">
  <div class="breadcrumb">
    <a href="/">Home</a> &rsaquo;
    <a href="/cards">Card Vault</a> &rsaquo;
    <a href="/cards/unionarena">Union Arena</a> &rsaquo;
    ${set ? `<a href="${setPageUrl}">${esc(set.name)}</a> &rsaquo;` : ''}
    <span style="color:var(--text)">${esc(card.name)}</span>
  </div>

  <div class="card-layout">
    <div class="card-image-col">
      ${card.image_url
        ? `<img src="${esc(card.image_url)}" alt="${esc(card.name)}" loading="eager">`
        : `<div class="card-image-placeholder">&#127183;</div>`}
    </div>

    <div class="card-info">
      <h1>${esc(card.name)}</h1>
      <p class="card-meta">
        ${set ? `<a href="${setPageUrl}">${esc(set.name)}</a>` : esc(card.set_name||'')}
        ${card.number ? ` &middot; #${esc(card.number)}` : ''}
        ${card.card_type ? ` &middot; ${esc(card.card_type)}` : ''}
      </p>

      ${card.rarity ? `<div class="badges"><span class="badge badge-rarity badge-rarity-${esc(card.rarity.toLowerCase().replace(/\s+/g,''))}">${esc(card.rarity)}</span></div>` : ''}

      <div class="price-block">
        <div class="price-main">${priceDisplay}</div>
        <div class="price-sub">Estimated AUD &middot; Based on TCGPlayer market price &middot; Updated daily</div>
        <!-- AUD/USD toggle + expanded price breakdown -->
        ${AUD_RATE ? `<div style="font-size:11px;color:#9ba3c4;font-family:sans-serif;margin-top:4px">Rate: 1 USD = AU$${AUD_RATE.toFixed(4)} (live)</div>` : ''}
        ${card.market_price > 0 ? `
        <div style="margin-top:12px;background:#111420;border:1px solid #242840;border-radius:10px;padding:14px;font-family:sans-serif">
          <div style="font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#9ba3c4;margin-bottom:10px">Price Breakdown</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">
            <div><div style="color:#9ba3c4;font-size:10px;margin-bottom:2px">Market Price</div><div style="font-weight:700;color:var(--accent)">AU$${(card.price_aud > 0 ? parseFloat(card.price_aud) : card.market_price * (AUD_RATE||1.58)).toFixed(2)}</div><div style="color:#9ba3c4;font-size:10px">US$${parseFloat(card.market_price).toFixed(2)}</div></div>
            ${card.low_price > 0 ? `<div><div style="color:#9ba3c4;font-size:10px;margin-bottom:2px">Low Price</div><div style="font-weight:700;color:#4ADE80">AU$${(card.low_price * (AUD_RATE||1.58)).toFixed(2)}</div><div style="color:#9ba3c4;font-size:10px">US$${parseFloat(card.low_price).toFixed(2)}</div></div>` : ''}
            ${card.median_price > 0 ? `<div><div style="color:#9ba3c4;font-size:10px;margin-bottom:2px">Median</div><div style="font-weight:700;color:#e8eaf0">AU$${(card.median_price * (AUD_RATE||1.58)).toFixed(2)}</div></div>` : ''}
            ${card.buylist_price > 0 ? `<div><div style="color:#9ba3c4;font-size:10px;margin-bottom:2px">Buylist (Sell)</div><div style="font-weight:700;color:#F472B6">US$${parseFloat(card.buylist_price).toFixed(2)}</div></div>` : ''}
          </div>
          ${card.price_change_7d ? `<div style="margin-top:8px;font-size:11px;color:${parseFloat(card.price_change_7d) >= 0 ? '#4ADE80' : '#F87171'};font-weight:600">${parseFloat(card.price_change_7d) >= 0 ? '▲' : '▼'} ${Math.abs(parseFloat(card.price_change_7d)).toFixed(1)}% this week</div>` : ''}
          ${card.price_change_30d ? `<div style="font-size:11px;color:${parseFloat(card.price_change_30d) >= 0 ? '#4ADE80' : '#F87171'};font-weight:600">${parseFloat(card.price_change_30d) >= 0 ? '▲' : '▼'} ${Math.abs(parseFloat(card.price_change_30d)).toFixed(1)}% this month</div>` : ''}
          ${card.total_listings > 0 ? `<div style="margin-top:6px;font-size:11px;color:#9ba3c4">${card.total_listings} listings on TCGPlayer</div>` : ''}
        </div>` : ''}

        <div class="cta-row">
          <a href="${ebayCardUrl}" target="_blank" rel="noopener" class="btn btn-primary">&#128722; Buy on eBay AU &#8599;</a>
          <a href="${amazonUrl}" target="_blank" rel="noopener" class="btn btn-ebay">Amazon AU &#8599;</a>
          <a href="/compare?cards=unionarena:${esc(slug)}" class="btn btn-ghost">&#9878; Compare</a>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Where to Buy ${esc(card.name)} in Australia</div>
        <p style="font-size:13px;color:var(--text2);line-height:1.6">${esc(card.name)} is a Union Arena card from ${esc(card.set_name||'this set')}${card.rarity ? `, classified as ${esc(card.rarity)}` : ''}. The estimated price is ${priceDisplay} AUD, converted from US market data and updated daily. Buy directly on eBay AU for the best local pricing and fast shipping.</p>
      </div>
    </div>
  </div>

  ${attrsHTML}

  
  <!-- SEALED PRODUCTS CAROUSEL -->
  ${sealedCards.length ? `<div style="margin-bottom:24px">
    <div style="font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);margin-bottom:8px;padding:0 0 0 4px">Sealed Product</div>
    <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:8px;scrollbar-width:none">
      ${sealedCards.map(p => {
        const sp = p.price_aud > 0 ? parseFloat(p.price_aud) : p.market_price > 0 ? (p.market_price * (AUD_RATE||1.58)) : 0;
        const sl = p.low_price > 0 ? (p.low_price * (AUD_RATE||1.58)) : 0;
        return `<a href="/cards/unionarena/${p.slug}" style="flex-shrink:0;width:150px;background:#111420;border:1px solid #242840;border-radius:8px;padding:10px;text-decoration:none;display:block">
          ${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" style="width:100%;max-height:100px;object-fit:contain;border-radius:4px;margin-bottom:6px" loading="lazy">` : ''}
          <div style="font-size:11px;color:#e8eaf0;font-weight:600;line-height:1.3;margin-bottom:4px">${esc(p.name)}</div>
          ${sp > 0 ? `<div style="font-size:13px;font-weight:900;color:var(--accent)">AU$${sp.toFixed(2)}</div>` : ''}
          ${sl > 0 ? `<div style="font-size:10px;color:#9ba3c4">Low: AU$${sl.toFixed(2)}</div>` : ''}
        </a>`;
      }).join('')}
    </div>
  </div>` : ''}
  ${relatedCards.length ? `<div class="section">
    <div class="section-title">More Cards from ${esc(set?.name||card.set_name||'This Set')}</div>
    <div class="related-grid">${relatedHTML}</div>
    ${set ? `<div style="margin-top:14px;text-align:center"><a href="${setPageUrl}" style="font-size:13px;color:var(--accent);font-weight:600">View all cards in this set &#8594;</a></div>` : ''}
  </div>` : ''}

  <div style="background:rgba(var(--accent-rgb),.04);border:1px solid rgba(var(--accent-rgb),.15);border-radius:var(--radius);padding:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;margin-bottom:20px">
    <div>
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px">Track Your Union Arena Collection</div>
      <div style="font-size:13px;color:var(--text2)">Free Google Sheets tracker -- know what you own and what it is worth.</div>
    </div>
    <a href="/tracker.html" class="btn btn-primary">Get Free Tracker &#8594;</a>
  </div>
</div>


  <!-- SOCIAL SHARE -->
  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:14px 20px;background:rgba(201,168,76,.04);border-top:1px solid rgba(201,168,76,.1);font-family:sans-serif">
    <span style="font-size:11px;color:#9ba3c4;text-transform:uppercase;letter-spacing:.08em">Share</span>
    ${shareBar}
  </div>
<footer>
  <div style="margin-bottom:8px">
    <a href="/">Home</a><a href="/cards">Card Vault</a><a href="/cards/unionarena">Union Arena</a>
    ${set ? `<a href="${setPageUrl}">${esc(set.name)}</a>` : ''}
    <a href="/blog">Blog</a><a href="/tracker.html">Tracker</a>
  </div>
  <p>&#169; 2026 Cards on Cards on Cards &middot; cardsoncardsoncards.com.au</p>
  <p style="margin-top:6px;font-size:11px;opacity:.5">Affiliate disclosure: this site earns commissions from eBay AU and Amazon AU purchases made via affiliate links at no extra cost to you. Prices are estimates based on US market data converted to AUD at approximately 1.58.</p>
</footer>
<script>
document.querySelectorAll('a[href*="ebay"]').forEach(a => a.addEventListener('click', () => {
  if (typeof gtag !== 'undefined') gtag('event','ebay_card_click',{card_name:'${(card.name||'').replace(/'/g,"\\'")}',game:'unionarena'});
}));
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
      <textarea name="description" placeholder="Describe the issue briefly (e.g. Charizard ex showing wrong price)" maxlength="200" required></textarea>
      <div class="bug-thanks" id="bugThanks"><p>&#x2713; Thanks, we will look into it.</p></div>
      <button type="submit" class="bug-submit" id="bugSubmit">Submit Report</button>
    </form>
  </div>
</div>
<script>(function(){const urlInput=document.getElementById('bugPageUrl');if(urlInput)urlInput.value=window.location.href;const form=document.getElementById('bugReportForm');if(!form)return;form.addEventListener('submit',function(e){e.preventDefault();let btn=document.getElementById('bugSubmit');btn.disabled=true;btn.textContent='Sending...';const data=new FormData(form);fetch('/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data).toString()}).then(function(){document.getElementById('bugThanks').style.display='block';form.querySelector('select').style.display='none';form.querySelector('textarea').style.display='none';btn.style.display='none';setTimeout(function(){document.getElementById('bugModal').classList.remove('open');},2000);}).catch(function(){btn.disabled=false;btn.textContent='Submit Report';});});})();</script>
</body>
</html>`;

  return new Response(html, { status: 200, headers });
};

export const config = { path: '/cards/unionarena/:slug+', excludedPath: '/cards/unionarena/sets/*' };
