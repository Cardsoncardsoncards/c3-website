// netlify/functions/sorcery-card-page.mjs
// Serves /cards/sorcery/:slug
// Sorcery: Contested Realm individual card pages with AUD pricing and affiliate links
// Built: 20 May 2026

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID        = '5339146789';
const AMAZON_TAG        = 'blasdigital-22';
const ACCENT            = '#A78BFA';
const ACCENT_RGB        = '167,139,250';
const GAME_LABEL        = 'Sorcery: Contested Realm';
const GAME_KEY          = 'sorcery';

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
  const ebayUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(cardName+' sorcery contested realm card')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(cardName)} | Sorcery: Contested Realm | Cards on Cards on Cards</title>
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0A0C14;color:#F0F2FF;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}.wrap{max-width:440px}h1{color:#A78BFA;font-size:24px;margin-bottom:12px;font-family:'Cinzel',serif}p{color:#8892b0;font-size:14px;margin-bottom:24px;line-height:1.6}.btn{display:inline-block;background:#A78BFA;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;margin:4px}.btn-sec{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:#F0F2FF}</style>
</head>
<body><div class="wrap">
  <h1>${esc(cardName)}</h1>
  <p>We could not find that Sorcery: Contested Realm card. It may not be in our database yet.</p>
  <a href="${ebayUrl}" target="_blank" rel="noopener" class="btn">Search eBay AU &#8599;</a>
  <a href="/cards/sorcery" class="btn btn-sec">Browse Sorcery: Contested Realm</a>
</div></body></html>`;
}

export default async (req) => {
  const url     = new URL(req.url);
  const slug    = url.pathname.replace(/^\/cards\/sorcery\//, '').replace(/\/$/, '');

  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=1800, s-maxage=3600'
  };

  if (!slug || slug === '') {
    return Response.redirect('https://cardsoncardsoncards.com.au/cards/sorcery', 302);
  }

  // Parallel: fetch card + set info
  const [cardResult] = await Promise.allSettled([
    supabaseGet(`sorcery_cards?slug=eq.${encodeURIComponent(slug)}&limit=1&select=*`)
  ]);

  const cardArr = cardResult.status === 'fulfilled' ? cardResult.value : [];
  const card    = cardArr[0];

  if (!card) {
    return new Response(graceful404(slug), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

  // Parallel supporting data
  const [relatedResult, setResult] = await Promise.allSettled([
    card.set_id
      ? supabaseGet(`sorcery_cards?set_id=eq.${card.set_id}&slug=neq.${encodeURIComponent(slug)}&order=market_price.desc.nullslast&limit=12&select=slug,name,image_url,market_price,rarity`)
      : Promise.resolve([]),
    card.set_id
      ? supabaseGet(`sorcery_sets?id=eq.${card.set_id}&limit=1&select=id,name,slug,release_date`)
      : Promise.resolve([])
  ]);

  const relatedCards = relatedResult.status === 'fulfilled' ? relatedResult.value : [];
  const setArr       = setResult.status === 'fulfilled' ? setResult.value : [];
  const set          = setArr[0] || null;

  const priceAud     = card.price_aud > 0 ? parseFloat(card.price_aud) : card.market_price > 0 ? card.market_price * 1.58 : null;
  const priceDisplay = priceAud ? `AU$${priceAud.toFixed(2)}` : 'Price TBC';
  const customAttrs  = parseCustomAttrs(card.custom_attributes);

  const ebayCardUrl  = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent((card.name||slug.replace(/-/g,' '))+' sorcery contested realm card')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
  const amazonUrl    = `https://www.amazon.com.au/s?k=${encodeURIComponent((card.name||'')+' sorcery contested realm card')}&tag=${AMAZON_TAG}`;
  const setPageUrl   = set?.slug ? `/cards/sorcery/sets/${esc(set.slug)}` : `/cards/sorcery`;

  const relatedHTML = relatedCards.length ? relatedCards.map(c => {
    const p = c.price_aud > 0 ? parseFloat(c.price_aud) : c.market_price > 0 ? (c.market_price*1.58) : 0;
    return `<a href="/cards/sorcery/${c.slug}" style="background:#111420;border:1px solid #242840;border-radius:8px;padding:8px;text-align:center;display:block;text-decoration:none;transition:border-color .2s" onmouseover="this.style.borderColor='#A78BFA'" onmouseout="this.style.borderColor='#242840'">
      ${c.image_url ? `<img src="${esc(c.image_url)}" alt="${esc(c.name)}" style="width:100%;border-radius:5px;max-height:110px;object-fit:contain;margin-bottom:4px" loading="lazy">` : `<div style="height:80px;background:#0d0f1a;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:18px;color:#9ba3c4;margin-bottom:4px">&#127183;</div>`}
      <div style="font-size:10px;color:#e8eaf0;line-height:1.3;font-weight:600">${esc(c.name)}</div>
      ${c.rarity ? `<div style="font-size:9px;color:#9ba3c4">${esc(c.rarity)}</div>` : ''}
      ${p > 0 ? `<div style="font-size:11px;color:#A78BFA;font-weight:700">AU$${p.toFixed(0)}</div>` : ''}
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
  <title>${esc(card.name)} Price Australia | ${esc(card.set_name||'Sorcery: Contested Realm')} | Cards on Cards on Cards</title>
  <meta name="description" content="${esc(card.name)} from ${esc(card.set_name||'Sorcery: Contested Realm')}. ${priceDisplay} AUD. Buy on eBay AU. Australia's Sorcery: Contested Realm price guide.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/sorcery/${esc(slug)}">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <meta property="og:title" content="${esc(card.name)} | Sorcery: Contested Realm | Cards on Cards on Cards">
  <meta property="og:description" content="${esc(card.name)} - ${priceDisplay} AUD. Buy on eBay AU.">
  <meta property="og:image" content="${card.image_url ? esc(card.image_url) : 'https://cardsoncardsoncards.com.au/c3-og-banner.png'}">
  <meta property="og:url" content="https://cardsoncardsoncards.com.au/cards/sorcery/${esc(slug)}">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://cardsoncardsoncards.com.au"},{"@type":"ListItem","position":2,"name":"Sorcery: Contested Realm","item":"https://cardsoncardsoncards.com.au/cards/sorcery"},{"@type":"ListItem","position":3,"name":"${(card.name||'').replace(/"/g,'&quot;')}","item":"https://cardsoncardsoncards.com.au/cards/sorcery/${esc(slug)}"}]}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <style>
    :root{--bg:#0A0C14;--bg2:#111420;--bg3:#181d2e;--accent:#A78BFA;--accent-rgb:167,139,250;--gold:#C9A84C;--text:#e8eaf0;--text2:#9ba3c4;--border:#242840;--radius:12px}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6;min-height:100vh}
    body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(ellipse 60% 40% at 50% 0%,rgba(var(--accent-rgb),.05),transparent 60%)}
    a{color:inherit;text-decoration:none}
    nav{background:rgba(10,12,20,.97);border-bottom:1px solid var(--border);padding:10px 0;position:sticky;top:0;z-index:100;backdrop-filter:blur(20px)}
    .nav-inner{max-width:1200px;margin:0 auto;padding:0 20px;display:flex;align-items:center;gap:8px}
    .nav-logo{display:flex;align-items:center;gap:8px;text-decoration:none;flex-shrink:0}
    .nav-logo img{height:34px;width:34px;border-radius:6px;object-fit:cover}
    .nav-links{display:flex;gap:3px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;flex-shrink:0}
    .nav-links::-webkit-scrollbar{display:none}
    .nav-link{font-size:11px;padding:5px 9px;border-radius:6px;border:1px solid var(--border);color:#A0A8C0;text-decoration:none;font-weight:600;letter-spacing:.04em;text-transform:uppercase;transition:all .2s;white-space:nowrap}
    .nav-link:hover{color:var(--text);border-color:#A0A8C0;background:rgba(255,255,255,.04)}
    .nav-link--home{color:#A0C4FF;border-color:rgba(160,196,255,.3)}.nav-link--home:hover{background:rgba(160,196,255,.06)}
    .nav-link--vault{color:var(--gold);border-color:rgba(201,168,76,.3)}.nav-link--vault:hover{background:rgba(201,168,76,.06)}
    .nav-link--game{color:var(--accent);border-color:rgba(var(--accent-rgb),.4);background:rgba(var(--accent-rgb),.07)}
    .nav-link--ebay{color:#4ADE80;border-color:rgba(74,222,128,.3);background:rgba(74,222,128,.05)}.nav-link--ebay:hover{background:rgba(74,222,128,.1)}
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
<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo"><img src="/c3logo.png" alt="C3 - Cards on Cards on Cards"></a>
    <div class="nav-links">
      <a href="/" class="nav-link nav-link--home">Home</a>
      <a href="/cards" class="nav-link nav-link--vault">Card Vault</a>
      <a href="/cards/sorcery" class="nav-link nav-link--game">Sorcery: Contested Realm</a>
      <a href="${ebayCardUrl}" target="_blank" rel="noopener" class="nav-link nav-link--ebay">Buy on eBay &#8599;</a>
    </div>
  </div>
</nav>

<div class="wrap">
  <div class="breadcrumb">
    <a href="/">Home</a> &rsaquo;
    <a href="/cards">Card Vault</a> &rsaquo;
    <a href="/cards/sorcery">Sorcery: Contested Realm</a> &rsaquo;
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
        <div class="cta-row">
          <a href="${ebayCardUrl}" target="_blank" rel="noopener" class="btn btn-primary">&#128722; Buy on eBay AU &#8599;</a>
          <a href="${amazonUrl}" target="_blank" rel="noopener" class="btn btn-ebay">Amazon AU &#8599;</a>
          <a href="/compare?cards=sorcery:${esc(slug)}" class="btn btn-ghost">&#9878; Compare</a>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Where to Buy ${esc(card.name)} in Australia</div>
        <p style="font-size:13px;color:var(--text2);line-height:1.6">${esc(card.name)} is a Sorcery: Contested Realm card from ${esc(card.set_name||'this set')}${card.rarity ? `, classified as ${esc(card.rarity)}` : ''}. The estimated price is ${priceDisplay} AUD, converted from US market data and updated daily. Buy directly on eBay AU for the best local pricing and fast shipping.</p>
      </div>
    </div>
  </div>

  ${attrsHTML}

  ${relatedCards.length ? `<div class="section">
    <div class="section-title">More Cards from ${esc(set?.name||card.set_name||'This Set')}</div>
    <div class="related-grid">${relatedHTML}</div>
    ${set ? `<div style="margin-top:14px;text-align:center"><a href="${setPageUrl}" style="font-size:13px;color:var(--accent);font-weight:600">View all cards in this set &#8594;</a></div>` : ''}
  </div>` : ''}

  <div style="background:rgba(var(--accent-rgb),.04);border:1px solid rgba(var(--accent-rgb),.15);border-radius:var(--radius);padding:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;margin-bottom:20px">
    <div>
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px">Track Your Sorcery: Contested Realm Collection</div>
      <div style="font-size:13px;color:var(--text2)">Free Google Sheets tracker -- know what you own and what it is worth.</div>
    </div>
    <a href="/tracker.html" class="btn btn-primary">Get Free Tracker &#8594;</a>
  </div>
</div>

<footer>
  <div style="margin-bottom:8px">
    <a href="/">Home</a><a href="/cards">Card Vault</a><a href="/cards/sorcery">Sorcery: Contested Realm</a>
    ${set ? `<a href="${setPageUrl}">${esc(set.name)}</a>` : ''}
    <a href="/blog">Blog</a><a href="/tracker.html">Tracker</a>
  </div>
  <p>&#169; 2026 Cards on Cards on Cards &middot; cardsoncardsoncards.com.au</p>
  <p style="margin-top:6px;font-size:11px;opacity:.5">Affiliate disclosure: this site earns commissions from eBay AU and Amazon AU purchases made via affiliate links at no extra cost to you. Prices are estimates based on US market data converted to AUD at approximately 1.58.</p>
</footer>
<script>
document.querySelectorAll('a[href*="ebay"]').forEach(a => a.addEventListener('click', () => {
  if (typeof gtag !== 'undefined') gtag('event','ebay_card_click',{card_name:'${(card.name||'').replace(/'/g,"\\'")}',game:'sorcery'});
}));
</script>
</body>
</html>`;

  return new Response(html, { status: 200, headers });
};

export const config = { path: '/cards/sorcery/:slug+' };
