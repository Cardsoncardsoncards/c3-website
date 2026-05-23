// netlify/functions/shadowverse-set-page.mjs
// Serves /cards/shadowverse/sets/:slug
// Auto-generated 20 May 2026 -- C3 standard set page

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID        = '5339146789';
const ACCENT            = '#8B5CF6';
const GAME_LABEL        = 'Shadowverse: Evolve';

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
  <title>Set Not Found | Shadowverse: Evolve | Cards on Cards on Cards</title>
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0A0C14;color:#F0F2FF;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}.wrap{max-width:420px}h1{color:#8B5CF6;font-size:22px;margin-bottom:10px}p{color:#8892b0;font-size:14px;margin-bottom:24px;line-height:1.6}.btn{display:inline-block;background:#8B5CF6;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;margin:4px}.btn-sec{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:#F0F2FF}</style>
</head>
<body><div class="wrap">
  <h1>Set Not Found</h1>
  <p>We couldn't find that Shadowverse: Evolve set. It may not be in our database yet.</p>
  <a href="/cards/shadowverse" class="btn">Browse All Shadowverse: Evolve Cards</a>
  <a href="/" class="btn btn-sec">Home</a>
</div></body></html>`;
}

export default async (req) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=900, s-maxage=1800' };
  const url     = new URL(req.url);
  const setSlug = url.pathname.replace(/^\/cards\/shadowverse\/sets\//, '').replace(/\/$/, '');

  if (!setSlug) return new Response(graceful404(''), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

  const [sets] = await Promise.allSettled([
    supabaseGet(`shadowverse_sets?slug=eq.${encodeURIComponent(setSlug)}&limit=1&select=id,name,slug,release_date,card_count`)
  ]);

  const setArr = sets.status === 'fulfilled' ? sets.value : [];
  const set    = setArr[0];
  if (!set) return new Response(graceful404(setSlug), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

  const cardsResult = await supabaseGet(`shadowverse_cards?set_id=eq.${set.id}&order=market_price.desc.nullslast&limit=200&select=slug,name,image_url,market_price,price_aud,rarity,number`).catch(() => []);
  const cards = Array.isArray(cardsResult) ? cardsResult : [];

  const toAud = c => c.price_aud > 0 ? parseFloat(c.price_aud) : c.market_price > 0 ? c.market_price * 1.58 : 0;
  const pricedCards = cards.filter(c => toAud(c) > 0);
  const top6 = pricedCards.slice(0, 6);

  const ebaySetURL = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(set.name+' shadowverse evolve card')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
  const today = new Date().toISOString().slice(0,10);

  const top6HTML = top6.map(c => {
    const aud = toAud(c);
    return `<a href="/cards/shadowverse/${c.slug}" style="flex:0 0 140px;background:#111420;border:1px solid rgba(var(--accent-rgb),.3);border-radius:10px;padding:10px;text-align:center;text-decoration:none;display:block;transition:all .2s" onmouseover="this.style.borderColor='#8B5CF6';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='#242840';this.style.transform='none'">
      <div style="font-size:11px;color:#e8eaf0;line-height:1.3;margin-bottom:4px;font-weight:600">${esc(c.name)}</div>
      ${c.image_url ? `<img src="${esc(c.image_url)}" alt="${esc(c.name)}" style="width:100%;border-radius:6px;max-height:140px;object-fit:contain;margin-bottom:6px" loading="lazy">` : ''}
      ${c.rarity ? `<div style="font-size:10px;color:#8B5CF6">${esc(c.rarity)}</div>` : ''}
      ${aud > 0 ? `<div style="font-size:12px;color:#C9A84C;font-weight:700">AU$${aud.toFixed(2)}</div>` : ''}
    </a>`;
  }).join('');

  const allCardsHTML = cards.map(c => {
    const aud = toAud(c);
    return `<a href="/cards/shadowverse/${c.slug}" style="background:#111420;border:1px solid #242840;border-radius:8px;padding:8px;text-align:center;display:block;text-decoration:none;transition:border-color .2s" onmouseover="this.style.borderColor='#8B5CF6'" onmouseout="this.style.borderColor='#242840'">
      <div style="font-size:10px;color:#e8eaf0;line-height:1.3;font-weight:600">${esc(c.name)}</div>
      ${c.image_url ? `<img src="${esc(c.image_url)}" alt="${esc(c.name)}" style="width:100%;border-radius:4px;max-height:120px;object-fit:contain;margin-bottom:4px" loading="lazy">` : ''}
      ${c.rarity ? `<div style="font-size:9px;color:#9ba3c4">${esc(c.rarity)}</div>` : ''}
      ${aud > 0 ? `<div style="font-size:11px;color:#8B5CF6;font-weight:700">AU$${aud.toFixed(0)}</div>` : ''}
    </a>`;
  }).join('');

  const sealedHTML = (() => {
    const SEALED_KEYS = ['booster box','booster pack','display','starter deck',
      'starter set','trial deck','trial set','box set','collection box','premium set'];
    const sealedItems = cards.filter(c => {
      const n = (c.name||'').toLowerCase();
      return SEALED_KEYS.some(k => n.includes(k)) && c.market_price > 0;
    });
    if (!sealedItems.length) return '';
    const itemsHTML = sealedItems.slice(0,4).map(p => {
      const price = p.price_aud > 0 ? `AU$${parseFloat(p.price_aud).toFixed(2)}` : `~AU$${(p.market_price*1.58).toFixed(2)}`;
      const low = p.low_price ? `Low: ~AU$${(p.low_price*1.58).toFixed(2)}` : '';
      return `<a href="/cards/shadowverse/${p.slug}" style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px;text-decoration:none;transition:border-color .2s" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="font-size:12px;font-weight:700;color:var(--text);line-height:1.3">${esc(p.name)}</div>
        ${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" style="width:100%;max-height:120px;object-fit:contain;border-radius:6px" loading="lazy">` : ''}
        <div style="font-size:15px;font-weight:900;color:var(--accent);font-family:'Cinzel',serif">${price}</div>
        ${low ? `<div style="font-size:11px;color:var(--text2)">${low}</div>` : ''}
        <div style="font-size:11px;color:#4ADE80;font-weight:600;margin-top:auto">View details &#8594;</div>
      </a>`;
    }).join('');
    return `<div style="background:rgba(var(--accent-rgb),.04);border:1px solid rgba(var(--accent-rgb),.15);border-radius:14px;padding:22px 24px;margin-bottom:32px">
      <div style="font-size:9px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);margin-bottom:8px">Sealed Product</div>
      <h2 style="font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:var(--text);margin-bottom:16px">Buy Sealed ${esc(set?.name||'')} Product</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:16px">${itemsHTML}</div>
      <a href="https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent((set?.name||'')+' shadowverse evolve booster')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:7px;padding:9px 18px;border-radius:8px;font-weight:700;font-size:12px;text-decoration:none;background:var(--accent);color:#000">&#128722; More sealed on eBay AU &#8599;</a>
    </div>`;
  })();

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(set.name)} | Shadowverse: Evolve Cards | Cards on Cards on Cards</title>
  <meta name="description" content="Browse all ${esc(set.name)} cards from Shadowverse: Evolve with live AUD prices and eBay AU buy links. Updated daily.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/shadowverse/sets/${esc(setSlug)}">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <meta property="og:title" content="${esc(set.name)} | Shadowverse: Evolve | C3">
  <meta property="og:description" content="${cards.length} cards from ${esc(set.name)} with live AUD prices.">
  <meta property="og:image" content="https://cardsoncardsoncards.com.au/c3-og-banner.png">
  <meta property="og:url" content="https://cardsoncardsoncards.com.au/cards/shadowverse/sets/${esc(setSlug)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <style>
    :root{--bg:#0A0C14;--bg2:#111420;--bg3:#181d2e;--gold:#C9A84C;--accent:#8B5CF6;--accent-rgb:139,92,246;--text:#e8eaf0;--text2:#9ba3c4;--border:#242840;--radius:12px}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6;min-height:100vh}
    a{color:inherit;text-decoration:none}a:hover{text-decoration:none}
    nav{background:rgba(8,10,15,.97);border-bottom:1px solid #1e2235;padding:12px 0;position:sticky;top:0;z-index:100;backdrop-filter:blur(18px)}
    .nav-inner{display:flex;align-items:center;max-width:1400px;margin:0 auto;padding:0 24px;gap:10px}
    .nav-logo{display:flex;align-items:center;gap:9px;text-decoration:none;flex-shrink:0}
    .nav-logo img{height:40px;width:40px;border-radius:8px;object-fit:cover}
    .nav-links{display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;flex-shrink:0;min-width:0}
    .nav-links::-webkit-scrollbar{display:none}
    .nav-link{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;transition:all .2s;border:1px solid #1e2235;color:#A0A8C0;white-space:nowrap}
    .nav-link:hover{color:#F0F2FF;border-color:#A0A8C0;background:rgba(255,255,255,.04);text-decoration:none}
    .nav-link--active{color:#C9A84C;border-color:rgba(201,168,76,.4);background:rgba(201,168,76,.06)}
    .nav-link--compare{color:#A78BFA;border-color:rgba(167,139,250,.35)}.nav-link--compare:hover{background:rgba(167,139,250,.1);border-color:#A78BFA}
    .nav-link--market{color:#4ADE80;border-color:rgba(74,222,128,.35)}.nav-link--market:hover{background:rgba(74,222,128,.1);border-color:#4ADE80}
    .nav-link--tools{color:#FB923C;border-color:rgba(251,146,60,.35)}.nav-link--tools:hover{background:rgba(251,146,60,.1);border-color:#FB923C}
    .nav-link--play{color:#F472B6;border-color:rgba(244,114,182,.35)}.nav-link--play:hover{background:rgba(244,114,182,.1);border-color:#F472B6}
    .nav-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.35)}.nav-link--blog:hover{background:rgba(126,203,161,.1);border-color:#7ECBA1}
    .nav-link--ebay{color:#60A5FA;border-color:rgba(96,165,250,.35);background:rgba(96,165,250,.05)}.nav-link--ebay:hover{background:rgba(96,165,250,.12);border-color:#60A5FA}
    .nav-search-wrap{flex:1;min-width:0;max-width:500px;position:relative;display:flex;align-items:center;gap:0}
    .nav-search-input{width:100%;background:rgba(255,255,255,.06);border:1px solid #1e2235;border-radius:7px 0 0 7px;padding:6px 12px;font-size:12px;color:#e8eaf0;font-family:sans-serif;outline:none;transition:border-color .2s}
    .nav-search-input:focus{border-color:rgba(201,168,76,.45);background:rgba(255,255,255,.09)}
    .nav-search-input::placeholder{color:#9ba3c4}
    .nav-search-btn{background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.35);border-left:none;border-radius:0 7px 7px 0;padding:6px 10px;color:#C9A84C;cursor:pointer;font-size:13px;transition:background .2s;flex-shrink:0}
    .nav-search-btn:hover{background:rgba(201,168,76,.3)}
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
    <a href="/" class="nav-logo" title="Cards on Cards on Cards"><img src="/c3logo.png" alt="C3 - Cards on Cards on Cards"></a>
    <div class="nav-search-wrap">
      <input class="nav-search-input" type="text" id="nav-q" placeholder="Search cards..." autocomplete="off" onkeydown="if(event.key==='Enter'){var v=this.value.trim();if(v)window.location='/search?q='+encodeURIComponent(v);}" >
      <button class="nav-search-btn" onclick="var v=document.getElementById('nav-q').value.trim();if(v)window.location='/search?q='+encodeURIComponent(v);">&#128269;</button>
    </div>
    <div class="nav-links">
      <a href="/cards" class="nav-link nav-link--active">Card Vault</a>
      <a href="/cards/shadowverse" class="nav-link" style="color:#8B5CF6;border-color:#8B5CF680;background:#8B5CF614">Shadowverse</a>
      <a href="/compare" class="nav-link nav-link--compare">Compare</a>
      <a href="/market" class="nav-link nav-link--market">Market</a>
      <a href="/tools" class="nav-link nav-link--tools">Tools</a>
      <a href="/play" class="nav-link nav-link--play">Play</a>
      <a href="/blog" class="nav-link nav-link--blog">Blog</a>
      <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=C3Nav&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="nav-link nav-link--ebay">Shop eBay &#8599;</a>
    </div>
  </div>
</nav>

<div class="wrap">
  <div style="margin-bottom:6px"><a href="/cards/shadowverse" style="color:var(--text2);font-size:13px">&larr; Back to Shadowverse: Evolve</a></div>
  <h1 style="font-family:'Cinzel',serif;font-size:clamp(20px,4vw,36px);font-weight:900;color:var(--text);margin-bottom:8px">${esc(set.name)}</h1>
  <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px;font-size:13px;color:var(--text2)">
    ${set.release_date ? `<span>Released: <strong style="color:var(--text)">${set.release_date.slice(0,10)}</strong></span>` : ''}
    ${set.card_count ? `<span>Cards in set: <strong style="color:var(--text)">${set.card_count}</strong></span>` : ''}
    ${cards.length ? `<span>In database: <strong style="color:var(--text)">${cards.length}</strong></span>` : ''}
    <span>Updated: <strong style="color:var(--text)">${today}</strong></span>
  </div>

  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:32px">
    <a href="${ebaySetURL}" target="_blank" rel="noopener" class="btn btn-primary">&#128722; Buy on eBay &#8599;</a>
    <a href="/cards/shadowverse" class="btn" style="background:var(--bg2);border:1px solid var(--border);color:var(--text)">&#8592; All Shadowverse: Evolve Sets</a>
  </div>

  ${top6.length ? `<div style="margin-bottom:32px">
    <h2 style="font-size:18px;font-weight:700;margin-bottom:16px">Most Valuable in ${esc(set.name)}</h2>
    <div style="display:flex;gap:10px;flex-wrap:wrap">${top6HTML}</div>
  </div>` : ''}

  ${cards.length ? `<div>
    <h2 style="font-size:18px;font-weight:700;margin-bottom:16px">All Cards (${cards.length})</h2>
    <div class="card-grid">${allCardsHTML}</div>
  </div>` : '<p style="color:var(--text2);padding:20px 0">No cards found for this set yet. Check back after tonight&#39;s sync.</p>'}

  
  ${sealedHTML}
</div>

<footer>
  <div style="margin-bottom:10px">
    <a href="/">Home</a><a href="/cards">Card Vault</a><a href="/cards/shadowverse">Shadowverse: Evolve</a>
    <a href="/blog">Blog</a><a href="/tracker.html">Tracker</a>
  </div>
  <p>&#169; 2026 Cards on Cards on Cards &middot; cardsoncardsoncards.com.au</p>
  <p style="margin-top:6px;font-size:11px;opacity:.5">Affiliate disclosure: this site earns commissions from eBay AU purchases via affiliate links at no extra cost to you. Not affiliated with Cygames.</p>
</footer>

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
<script>(function(){const urlInput=document.getElementById('bugPageUrl');if(urlInput)urlInput.value=window.location.href;const form=document.getElementById('bugReportForm');if(!form)return;form.addEventListener('submit',function(e){e.preventDefault();let btn=document.getElementById('bugSubmit');btn.disabled=true;btn.textContent='Sending...';const data=new FormData(form);fetch('/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data).toString()}).then(function(){document.getElementById('bugThanks').style.display='block';form.querySelector('select').style.display='none';form.querySelector('textarea').style.display='none';btn.style.display='none';setTimeout(function(){document.getElementById('bugModal').classList.remove('open');},2000);}).catch(function(){btn.disabled=false;btn.textContent='Submit Report';});});})()</script>
</body>
</html>`;

  return new Response(html, { status: 200, headers });
};

export const config = { path: '/cards/shadowverse/sets/:slug+', priority: 1 };
