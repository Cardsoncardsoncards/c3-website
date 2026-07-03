import { NAV_CSS, navHtml } from './shared/nav.mjs';
// netlify/functions/weissschwarz-property-hub.mjs
// Serves /cards/weissschwarz/:property (licensed property landing page)
// Built to Weiss Schwarz hub standard -- 3 July 2026

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID        = '5339146789';

const GAME_LABEL  = 'Weiss Schwarz';
const ACCENT      = '#1D4ED8';
const ACCENT_RGB  = '29,78,216';
const EMOJI       = '&#127794;';
const SITE        = 'https://cardsoncardsoncards.com.au';

function esc(str) {
  return (str == null ? '' : String(str))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

function isNew(releaseDateStr) {
  if (!releaseDateStr) return false;
  const cutoff = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
  return releaseDateStr >= cutoff;
}

function propertyLabel(slug) {
  return String(slug || '')
    .split('-')
    .map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : '')
    .join(' ')
    .trim();
}

function sharedCSS() {
  return `
    :root{--bg:#0A0C14;--bg2:#111420;--bg3:#181d2e;--gold:#C9A84C;--accent:${ACCENT};--accent-rgb:${ACCENT_RGB};--text:#e8eaf0;--text2:#9ba3c4;--border:#242840;--radius:12px;--silver:#A0A8C0}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6;min-height:100vh;overflow-x:hidden}
    body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(ellipse 70% 40% at 50% 0%,rgba(${ACCENT_RGB},.05),transparent 60%)}
    a{color:inherit;text-decoration:none}a:hover{text-decoration:none}
    .hero{padding:52px 24px 36px;text-align:center;position:relative;z-index:1}
    .hero-eyebrow{font-size:10px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--accent);margin-bottom:12px}
    h1{font-family:'Cinzel',serif;font-size:clamp(24px,5vw,50px);font-weight:900;color:var(--text);margin-bottom:12px;line-height:1.1}
    h1 span{color:var(--accent)}
    .hero-sub{font-size:14px;color:var(--text2);max-width:520px;margin:0 auto 28px}
    .stat-bar{display:flex;justify-content:center;border:1px solid var(--border);border-radius:12px;overflow:hidden;max-width:540px;margin:0 auto 32px;background:var(--bg2)}
    .stat-item{flex:1;padding:14px 10px;text-align:center;border-right:1px solid var(--border)}.stat-item:last-child{border-right:none}
    .stat-num{font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:var(--accent)}
    .stat-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text2);margin-top:2px}
    .quick-links{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:28px;justify-content:center;padding:0 24px}
    .quick-link{display:inline-flex;align-items:center;gap:7px;padding:9px 18px;border-radius:10px;font-weight:700;font-size:12.5px;text-decoration:none;transition:all .2s;border:1px solid transparent}
    .quick-link:hover{opacity:.88;transform:translateY(-1px);text-decoration:none}
    .back-link{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--text2);margin-bottom:8px}
    .back-link:hover{color:var(--accent)}
    .carousel-card{width:100%;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center;display:block}
    .carousel-card:hover{border-color:var(--accent);transform:translateY(-4px);box-shadow:0 8px 20px rgba(${ACCENT_RGB},.12)}
    .carousel-img-wrap{height:150px;display:flex;align-items:center;justify-content:center;margin-bottom:7px;overflow:hidden}
    .carousel-img-wrap img{max-height:150px;max-width:100%;object-fit:contain;border-radius:4px;transition:transform .3s}
    .carousel-card:hover .carousel-img-wrap img{transform:scale(1.05)}
    .carousel-name{font-size:11px;color:var(--text);font-weight:600;line-height:1.3;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .carousel-rarity{font-size:10px;color:var(--text2);margin-bottom:2px}
    .carousel-price{font-size:13px;color:var(--accent);font-weight:700;margin-top:3px}
    .carousel-buy-row{margin-top:6px}
    .carousel-buy-btn{font-size:10px;font-weight:700;color:#fff;background:var(--accent);padding:3px 8px;border-radius:4px;letter-spacing:.04em;display:inline-block}
    .card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:12px;margin-top:8px}
    .wrap{max-width:1200px;margin:0 auto;padding:0 24px;position:relative;z-index:1}
    .section{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:22px;margin-bottom:20px}
    .btn{display:inline-flex;align-items:center;gap:7px;padding:9px 20px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;border:none;font-family:'DM Sans',sans-serif;transition:all .2s;text-decoration:none}
    .btn:hover{opacity:.85;text-decoration:none}
    .btn-primary{background:var(--accent);color:#fff}
    .set-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:5px;margin-top:8px}
    .set-tile{display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--bg3);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:8px;padding:8px 12px;text-decoration:none;transition:all .2s;min-width:0}
    .set-tile:hover{border-color:var(--accent);background:rgba(${ACCENT_RGB},.04);text-decoration:none;transform:translateX(2px)}
    .set-tile-name{flex:1;font-size:12.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}
    .set-tile-meta{font-size:10px;color:var(--text2);flex-shrink:0;white-space:nowrap}
    .new-badge{font-size:8px;font-weight:800;background:var(--accent);color:#fff;border-radius:3px;padding:1px 5px;letter-spacing:.05em;margin-left:5px;vertical-align:middle}
    .sync-msg{color:var(--text2);font-size:14px;padding:20px}
    @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    .fade-up{animation:fadeUp .5s ease both}.fade-up-1{animation-delay:.08s}.fade-up-2{animation-delay:.16s}.fade-up-3{animation-delay:.24s}
    footer{border-top:1px solid var(--border);padding:28px 24px;text-align:center;font-size:12px;color:var(--text2);margin-top:40px;position:relative;z-index:1}
    footer a{color:var(--text2);margin:0 7px;text-decoration:none}footer a:hover{color:var(--text)}
    @media(max-width:600px){.hero{padding:36px 16px 24px}.quick-links{padding:0 12px}.wrap{padding:0 12px}.set-grid{grid-template-columns:1fr}}`;
}

export default async (req) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=1800, s-maxage=3600' };

  const url      = new URL(req.url);
  const rawProp  = url.pathname.replace(/^\/cards\/weissschwarz\/series\//, '').replace(/\/$/, '');
  const propSlug = rawProp.toLowerCase().replace(/[^a-z0-9-]/g, '');

  function notFound(message) {
    const body = `<!DOCTYPE html>
<html lang="en-AU"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Property Not Found | Weiss Schwarz | C3</title>
<meta name="robots" content="noindex">
<link rel="icon" type="image/png" href="/c3logo.png">
<style>${sharedCSS()}</style></head>
<body><style>${NAV_CSS}</style>${navHtml({ gameLabel: 'Weiss Schwarz', gameHref: '/cards/weissschwarz' })}
<div class="hero"><h1>Property <span>Not Found</span></h1><p class="hero-sub">${esc(message)}</p>
<a href="/cards/weissschwarz" class="btn btn-primary">Browse all Weiss Schwarz properties &#8594;</a></div>
</body></html>`;
    return new Response(body, { status: 404, headers });
  }

  if (!propSlug) return notFound('No property was specified. Pick one from the directory.');

  const sets = await supabaseGet(`weissschwarz_sets?property=eq.${propSlug}&order=release_date.desc&select=id,name,slug,release_date,card_count`);

  if (!sets.length) return notFound('We could not find any Weiss Schwarz sets for that property yet.');

  const label     = propertyLabel(propSlug) || 'Weiss Schwarz';
  const setIds     = sets.map(s => s.id).filter(id => id != null);
  const totalCards = sets.reduce((sum, s) => sum + (parseInt(s.card_count, 10) || 0), 0);
  const canonical  = `${SITE}/cards/weissschwarz/series/${propSlug}`;

  let topCards = [];
  if (setIds.length) {
    const [cardsRes] = await Promise.allSettled([
      supabaseGet(`weissschwarz_cards?set_id=in.(${setIds.join(',')})&order=market_price.desc&market_price=gt.0&image_url=not.is.null&limit=24&select=slug,name,image_url,market_price,price_aud,rarity,set_name`)
    ]);
    const rawCards = cardsRes.status === 'fulfilled' ? cardsRes.value : [];
    const SEALED = ['booster box','booster pack',' case','bundle','display','sealed product','starter deck','starter set','trial deck','box set','collection box','premium set','gift set'];
    topCards = rawCards.filter(c => { const n = (c.name || '').toLowerCase(); return !SEALED.some(k => n.includes(k)); });
  }

  const ebaySearch = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(label + ' Weiss Schwarz')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;

  function cardTile(c) {
    const price = c.price_aud ? `AU$${parseFloat(c.price_aud).toFixed(0)}` : c.market_price ? `~AU$${(c.market_price * 1.45).toFixed(0)}` : '';
    const ebay  = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(c.name + ' Weiss Schwarz card')}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
    return `<div class="carousel-card"><a href="/cards/weissschwarz/${esc(c.slug)}" style="display:block;text-decoration:none"><div class="carousel-img-wrap"><img src="${esc(c.image_url)}" alt="${esc(c.name).replace(/"/g,'&quot;')}" loading="lazy" onerror="this.onerror=null;this.style.opacity=0.3"></div><div class="carousel-name">${esc(c.name)}</div>${c.rarity?`<div class="carousel-rarity">${esc(c.rarity)}</div>`:''}<div class="carousel-price">${price}</div></a><div class="carousel-buy-row"><a href="${ebay}" target="_blank" rel="noopener" class="carousel-buy-btn">Buy eBay &#8599;</a></div></div>`;
  }
  const cardGridHTML = topCards.map(cardTile).join('');

  const setListHTML = sets.map(s => {
    const name     = s.name || '';
    const year     = s.release_date ? s.release_date.slice(0, 4) : '';
    const newBadge = isNew(s.release_date) ? '<span class="new-badge">NEW</span>' : '';
    return `<a href="/cards/weissschwarz/sets/${encodeURIComponent(s.slug || s.id)}" class="set-tile"><span class="set-tile-name">${esc(name)}${newBadge}</span><span class="set-tile-meta">${year}${s.card_count?' &middot; '+s.card_count+' cards':''}</span></a>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(label)} Weiss Schwarz Cards and Sets | AUD Prices | C3</title>
  <meta name="description" content="${esc(label)} Weiss Schwarz card prices in AUD. Browse every ${esc(label)} set and buy singles on eBay AU.">
  <link rel="canonical" href="${canonical}">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <meta property="og:title" content="${esc(label)} Weiss Schwarz Cards | Cards on Cards on Cards">
  <meta property="og:description" content="${esc(label)} Weiss Schwarz card prices in AUD. Browse sets and buy on eBay AU.">
  <meta property="og:image" content="${SITE}/c3ogbanner.png">
  <meta property="og:url" content="${canonical}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <style>${sharedCSS()}</style>
</head>
<body>
<style>${NAV_CSS}</style>${navHtml({ gameLabel: 'Weiss Schwarz', gameHref: '/cards/weissschwarz' })}

<div class="hero fade-up">
  <div class="hero-eyebrow">Card Vault &middot; Weiss Schwarz</div>
  <h1>${esc(label)} <span>Weiss Schwarz</span></h1>
  <p class="hero-sub">Every ${esc(label)} Weiss Schwarz set and its most valuable cards, priced in AUD. eBay AU buy links updated daily.</p>
  <div class="stat-bar">
    <div class="stat-item"><div class="stat-num">${sets.length}</div><div class="stat-label">Sets</div></div>
    <div class="stat-item"><div class="stat-num">${totalCards || '?'}</div><div class="stat-label">Cards</div></div>
    <div class="stat-item"><div class="stat-num">AU$</div><div class="stat-label">Live Prices</div></div>
    <div class="stat-item"><div class="stat-num">Daily</div><div class="stat-label">Updates</div></div>
  </div>
</div>

<div class="quick-links fade-up fade-up-1">
  <a href="${ebaySearch}" target="_blank" rel="noopener" class="quick-link" style="background:linear-gradient(135deg,#1a1a2e,${ACCENT});color:#fff">&#128722; Shop ${esc(label)} on eBay &#8599;</a>
  <a href="/tracker.html" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128203; Free Tracker</a>
  <a href="/ev-calculator.html" class="quick-link" style="background:var(--bg2);border-color:var(--border);color:var(--text)">&#128202; EV Calculator &#8594;</a>
</div>

<div class="wrap">
  <a href="/cards/weissschwarz" class="back-link">&#8592; All Weiss Schwarz properties</a>

  <div class="section fade-up fade-up-2">
    <div style="text-align:center;margin-bottom:16px">
      <h2 style="font-family:'Cinzel',serif;font-size:22px;font-weight:700;color:var(--text);margin-bottom:6px">${esc(label)} Sets</h2>
      <p style="font-size:13px;color:var(--text2)">${sets.length} set${sets.length===1?'':'s'} in the ${esc(label)} property, newest first.</p>
    </div>
    <div class="set-grid">${setListHTML}</div>
  </div>

  ${topCards.length ? `<div class="section fade-up fade-up-3">
    <div style="text-align:center;margin-bottom:16px">
      <h2 style="font-family:'Cinzel',serif;font-size:22px;font-weight:700;color:var(--text);margin-bottom:6px">Top ${esc(label)} Cards by Price</h2>
      <p style="font-size:13px;color:var(--text2)">Most valuable ${esc(label)} singles across all sets, in AUD.</p>
    </div>
    <div class="card-grid">${cardGridHTML}</div>
    <p style="text-align:center;color:var(--text2);font-size:11px;margin-top:14px">Prices sourced from TCGPlayer (USD), converted to AUD at approximately 1.45. Updated daily.</p>
  </div>` : ''}

  <div style="background:rgba(${ACCENT_RGB},.04);border:1px solid rgba(${ACCENT_RGB},.15);border-radius:var(--radius);padding:22px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px">
    <div>
      <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:5px">Track Your Weiss Schwarz Collection</div>
      <p style="font-size:13px;color:var(--text2)">Free Google Sheets tracker. Know what you own and what it is worth in AUD.</p>
    </div>
    <a href="/tracker.html" class="btn btn-primary">Get Free Tracker &#8594;</a>
  </div>
</div>

<footer>
  <div style="margin-bottom:10px">
    <a href="/">Home</a><a href="/cards">Card Vault</a><a href="/cards/weissschwarz">Weiss Schwarz</a>
    <a href="/cards/pokemon">Pokemon</a><a href="/cards/mtg">MTG</a>
    <a href="/cards/yugioh">Yu-Gi-Oh</a><a href="/cards/lorcana">Lorcana</a>
    <a href="/blog">Blog</a><a href="/tracker.html">Tracker</a>
  </div>
  <p>&#169; 2026 Cards on Cards on Cards &middot; cardsoncardsoncards.com.au</p>
  <p style="margin-top:6px;font-size:11px;opacity:.5">Affiliate disclosure: this site earns commissions from eBay AU and Amazon AU purchases made through affiliate links at no extra cost to you. USD prices converted to AUD at approximately 1.45.</p>
</footer>

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
<script>(function(){var u=document.getElementById('bugPageUrl');if(u)u.value=window.location.href;var f=document.getElementById('bugReportForm');if(!f)return;f.addEventListener('submit',function(e){e.preventDefault();var b=document.getElementById('bugSubmit');b.disabled=true;b.textContent='Sending...';var d=new FormData(f);fetch('/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(d).toString()}).then(function(){document.getElementById('bugThanks').style.display='block';f.querySelector('select').style.display='none';f.querySelector('textarea').style.display='none';b.style.display='none';setTimeout(function(){document.getElementById('bugModal').classList.remove('open');},2000);}).catch(function(){b.disabled=false;b.textContent='Submit Report';});});})();</script>
</body></html>`;

  return new Response(html, { status: 200, headers });
};

export const config = { path: '/cards/weissschwarz/series/:property' };
