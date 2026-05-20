// netlify/functions/wixoss-set-page.mjs
// Serves /cards/wixoss/sets/:slug
// Auto-generated 20 May 2026 -- C3 standard set page

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID        = '5339146789';
const ACCENT            = '#F43F5E';
const GAME_LABEL        = 'Wixoss TCG';

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

function graceful404(slug) {
  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Set Not Found | Wixoss TCG | Cards on Cards on Cards</title>
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0A0C14;color:#F0F2FF;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}.wrap{max-width:420px}h1{color:#F43F5E;font-size:22px;margin-bottom:10px}p{color:#8892b0;font-size:14px;margin-bottom:24px;line-height:1.6}.btn{display:inline-block;background:#F43F5E;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;margin:4px}.btn-sec{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:#F0F2FF}</style>
</head>
<body><div class="wrap">
  <h1>Set Not Found</h1>
  <p>We couldn't find that Wixoss TCG set. It may not be in our database yet.</p>
  <a href="/cards/wixoss" class="btn">Browse All Wixoss TCG Cards</a>
  <a href="/" class="btn btn-sec">Home</a>
</div></body></html>`;
}

export default async (req) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=900, s-maxage=1800' };
  const url     = new URL(req.url);
  const setSlug = url.pathname.replace(/^\/cards\/wixoss\/sets\//, '').replace(/\/$/, '');

  if (!setSlug) return new Response(graceful404(''), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

  const [sets] = await Promise.allSettled([
    supabaseGet(`wixoss_sets?slug=eq.${encodeURIComponent(setSlug)}&limit=1&select=id,name,slug,release_date,card_count`)
  ]);

  const setArr = sets.status === 'fulfilled' ? sets.value : [];
  const set    = setArr[0];
  if (!set) return new Response(graceful404(setSlug), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

  const cardsResult = await supabaseGet(`wixoss_cards?set_id=eq.${set.id}&order=market_price.desc.nullslast&limit=200&select=slug,name,image_url,market_price,price_aud,rarity,number`).catch(() => []);
  const cards = Array.isArray(cardsResult) ? cardsResult : [];

  const toAud = c => c.price_aud > 0 ? parseFloat(c.price_aud) : c.market_price > 0 ? c.market_price * 1.58 : 0;
  const pricedCards = cards.filter(c => toAud(c) > 0);
  const top6 = pricedCards.slice(0, 6);

  const ebaySetURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name+' wixoss card')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
  const today = new Date().toISOString().slice(0,10);

  const top6HTML = top6.map(c => {
    const aud = toAud(c);
    return `<a href="/cards/wixoss/${c.slug}" style="flex:0 0 140px;background:#111420;border:1px solid rgba(var(--accent-rgb),.3);border-radius:10px;padding:10px;text-align:center;text-decoration:none;display:block;transition:all .2s" onmouseover="this.style.borderColor='#F43F5E';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='#242840';this.style.transform='none'">
      ${c.image_url ? `<img src="${esc(c.image_url)}" alt="${esc(c.name)}" style="width:100%;border-radius:6px;max-height:140px;object-fit:contain;margin-bottom:6px" loading="lazy">` : ''}
      <div style="font-size:11px;color:#e8eaf0;line-height:1.3;margin-bottom:4px;font-weight:600">${esc(c.name)}</div>
      ${c.rarity ? `<div style="font-size:10px;color:#F43F5E">${esc(c.rarity)}</div>` : ''}
      ${aud > 0 ? `<div style="font-size:12px;color:#C9A84C;font-weight:700">AU$${aud.toFixed(2)}</div>` : ''}
    </a>`;
  }).join('');

  const allCardsHTML = cards.map(c => {
    const aud = toAud(c);
    return `<a href="/cards/wixoss/${c.slug}" style="background:#111420;border:1px solid #242840;border-radius:8px;padding:8px;text-align:center;display:block;text-decoration:none;transition:border-color .2s" onmouseover="this.style.borderColor='#F43F5E'" onmouseout="this.style.borderColor='#242840'">
      ${c.image_url ? `<img src="${esc(c.image_url)}" alt="${esc(c.name)}" style="width:100%;border-radius:4px;max-height:120px;object-fit:contain;margin-bottom:4px" loading="lazy">` : ''}
      <div style="font-size:10px;color:#e8eaf0;line-height:1.3;font-weight:600">${esc(c.name)}</div>
      ${c.rarity ? `<div style="font-size:9px;color:#9ba3c4">${esc(c.rarity)}</div>` : ''}
      ${aud > 0 ? `<div style="font-size:11px;color:#F43F5E;font-weight:700">AU$${aud.toFixed(0)}</div>` : ''}
    </a>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(set.name)} | Wixoss TCG Cards | Cards on Cards on Cards</title>
  <meta name="description" content="Browse all ${esc(set.name)} cards from Wixoss TCG with live AUD prices and eBay AU buy links. Updated daily.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/wixoss/sets/${esc(setSlug)}">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <meta property="og:title" content="${esc(set.name)} | Wixoss TCG | C3">
  <meta property="og:description" content="${cards.length} cards from ${esc(set.name)} with live AUD prices.">
  <meta property="og:image" content="https://cardsoncardsoncards.com.au/c3-og-banner.png">
  <meta property="og:url" content="https://cardsoncardsoncards.com.au/cards/wixoss/sets/${esc(setSlug)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <style>
    :root{--bg:#0A0C14;--bg2:#111420;--bg3:#181d2e;--gold:#C9A84C;--accent:#F43F5E;--accent-rgb:244,63,94;--text:#e8eaf0;--text2:#9ba3c4;--border:#242840;--radius:12px}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6;min-height:100vh}
    a{color:inherit;text-decoration:none}a:hover{text-decoration:none}
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
    .wrap{max-width:1200px;margin:0 auto;padding:24px}
    .card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:20px}
    .btn{display:inline-flex;align-items:center;gap:7px;padding:9px 20px;border-radius:8px;font-weight:700;font-size:13px;text-decoration:none;transition:all .2s;border:none;cursor:pointer;font-family:'DM Sans',sans-serif}
    .btn:hover{opacity:.85}.btn-primary{background:var(--accent);color:#000}
    footer{border-top:1px solid var(--border);padding:28px 24px;text-align:center;font-size:12px;color:var(--text2);margin-top:40px}
    footer a{color:var(--text2);margin:0 7px}footer a:hover{color:var(--text)}
    @media(max-width:600px){.wrap{padding:16px}.card-grid{grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:7px}}
  </style>
</head>
<body>
<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo"><img src="/c3logo.png" alt="C3"></a>
    <div class="nav-links">
      <a href="/" class="nav-link nav-link--home">Home</a>
      <a href="/cards" class="nav-link nav-link--vault">Card Vault</a>
      <a href="/cards/wixoss" class="nav-link nav-link--game">Wixoss TCG</a>
      <a href="${ebaySetURL}" target="_blank" rel="noopener" class="nav-link nav-link--ebay">Buy on eBay &#8599;</a>
    </div>
  </div>
</nav>

<div class="wrap">
  <div style="margin-bottom:6px"><a href="/cards/wixoss" style="color:var(--text2);font-size:13px">&larr; Back to Wixoss TCG</a></div>
  <h1 style="font-family:'Cinzel',serif;font-size:clamp(20px,4vw,36px);font-weight:900;color:var(--text);margin-bottom:8px">${esc(set.name)}</h1>
  <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px;font-size:13px;color:var(--text2)">
    ${set.release_date ? `<span>Released: <strong style="color:var(--text)">${set.release_date.slice(0,10)}</strong></span>` : ''}
    ${set.card_count ? `<span>Cards in set: <strong style="color:var(--text)">${set.card_count}</strong></span>` : ''}
    ${cards.length ? `<span>In database: <strong style="color:var(--text)">${cards.length}</strong></span>` : ''}
    <span>Updated: <strong style="color:var(--text)">${today}</strong></span>
  </div>

  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:32px">
    <a href="${ebaySetURL}" target="_blank" rel="noopener" class="btn btn-primary">&#128722; Buy on eBay &#8599;</a>
    <a href="/cards/wixoss" class="btn" style="background:var(--bg2);border:1px solid var(--border);color:var(--text)">&#8592; All Wixoss TCG Sets</a>
  </div>

  ${top6.length ? `<div style="margin-bottom:32px">
    <h2 style="font-size:18px;font-weight:700;margin-bottom:16px">Most Valuable in ${esc(set.name)}</h2>
    <div style="display:flex;gap:10px;flex-wrap:wrap">${top6HTML}</div>
  </div>` : ''}

  ${cards.length ? `<div>
    <h2 style="font-size:18px;font-weight:700;margin-bottom:16px">All Cards (${cards.length})</h2>
    <div class="card-grid">${allCardsHTML}</div>
  </div>` : '<p style="color:var(--text2);padding:20px 0">No cards found for this set yet. Check back after tonight&#39;s sync.</p>'}
</div>

<footer>
  <div style="margin-bottom:10px">
    <a href="/">Home</a><a href="/cards">Card Vault</a><a href="/cards/wixoss">Wixoss TCG</a>
    <a href="/blog">Blog</a><a href="/tracker.html">Tracker</a>
  </div>
  <p>&#169; 2026 Cards on Cards on Cards &middot; cardsoncardsoncards.com.au</p>
  <p style="margin-top:6px;font-size:11px;opacity:.5">Affiliate disclosure: this site earns commissions from eBay AU purchases via affiliate links at no extra cost to you. Not affiliated with Takara Tomy.</p>
</footer>
</body>
</html>`;

  return new Response(html, { status: 200, headers });
};

export const config = { path: '/cards/wixoss/sets/:slug+' };
