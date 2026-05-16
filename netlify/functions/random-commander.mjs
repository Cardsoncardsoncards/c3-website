// netlify/functions/random-commander.mjs
// Serves: /cards/mtg/random-commander
// Standalone - split from card-index.mjs for reliability

const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID = '5339146789';

const NAV_CSS = `
  nav{background:rgba(8,10,15,.97);border-bottom:1px solid #1e2235;padding:12px 0;position:sticky;top:0;z-index:100;backdrop-filter:blur(18px)}
  .nav-inner{display:flex;align-items:center;justify-content:space-between;max-width:1100px;margin:0 auto;padding:0 24px;gap:12px}
  .nav-logo{display:flex;align-items:center;gap:9px;text-decoration:none;flex-shrink:0}
  .nav-logo img{height:40px;width:40px;border-radius:8px;object-fit:cover;transition:box-shadow .2s}
  .nav-logo:hover img{box-shadow:0 0 12px rgba(201,168,76,.5)}
  .nav-links{display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
  .nav-links::-webkit-scrollbar{display:none}
  .nav-link{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;transition:all .2s;border:1px solid #1e2235;color:#A0A8C0;white-space:nowrap}
  .nav-link:hover{color:#F0F2FF;border-color:#A0A8C0;background:rgba(255,255,255,.04);text-decoration:none}
  .nav-link--active{color:#C9A84C;border-color:rgba(201,168,76,.4);background:rgba(201,168,76,.06)}
  /* === C3 NAV COLOURS === */
    .nav-link--vault{color:#C9A84C;border-color:rgba(201,168,76,.35)}.nav-link--vault:hover,.nav-link--vault.active{background:rgba(201,168,76,.1);border-color:#C9A84C;color:#E8C86A}
    .nav-link--compare{color:#A78BFA;border-color:rgba(167,139,250,.35)}.nav-link--compare:hover,.nav-link--compare.active{background:rgba(167,139,250,.1);border-color:#A78BFA;color:#C4B5FD}
    .nav-link--market{color:#4ADE80;border-color:rgba(74,222,128,.35)}.nav-link--market:hover,.nav-link--market.active{background:rgba(74,222,128,.1);border-color:#4ADE80;color:#86EFAC}
    .nav-link--tools{color:#FB923C;border-color:rgba(251,146,60,.35)}.nav-link--tools:hover,.nav-link--tools.active{background:rgba(251,146,60,.1);border-color:#FB923C;color:#FDBA74}
    .nav-link--play{color:#F472B6;border-color:rgba(244,114,182,.35)}.nav-link--play:hover,.nav-link--play.active{background:rgba(244,114,182,.1);border-color:#F472B6;color:#F9A8D4}
    .nav-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.35)}.nav-link--blog:hover,.nav-link--blog.active{background:rgba(126,203,161,.1);border-color:#7ECBA1;color:#A5DFC0}
    .nav-link--ebay{color:#60A5FA;border-color:rgba(96,165,250,.35);background:rgba(96,165,250,.05)}.nav-link--ebay:hover{background:rgba(96,165,250,.12);border-color:#60A5FA;color:#93C5FD}
  .nav-link--calendar{color:#F87171;border-color:rgba(248,113,113,.35)}.nav-link--calendar:hover{background:rgba(248,113,113,.06);border-color:#F87171}
  .nav-link--generators{color:#22D3EE;border-color:rgba(34,211,238,.35)}.nav-link--generators:hover{background:rgba(34,211,238,.06);border-color:#22D3EE}
  .nav-link--quiz{color:#F472B6;border-color:rgba(244,114,182,.35)}.nav-link--quiz:hover{background:rgba(244,114,182,.06);border-color:#F472B6}
  .nav-link--dnd{color:#A78BFA;border-color:rgba(139,92,246,.35)}.nav-link--dnd:hover{background:rgba(139,92,246,.06);border-color:#A78BFA}
  .nav-link--contact{color:#94A3B8;border-color:rgba(148,163,184,.35)}.nav-link--contact:hover{background:rgba(148,163,184,.06);border-color:#94A3B8}
`;

const NAV = `<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo"><img src="/c3logo.png" alt="C3"></a>
    <div class="nav-links">
      <a href="/cards" class="nav-link nav-link--vault active">Card Vault</a>
      <a href="/compare" class="nav-link nav-link--compare">Compare</a>
      <a href="/market" class="nav-link nav-link--market">Market</a>
      <a href="/tools" class="nav-link nav-link--tools">Tools</a>
      <a href="/play" class="nav-link nav-link--play">Play</a>
      <a href="/blog" class="nav-link nav-link--blog">Blog</a>
      <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=C3Nav&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="nav-link nav-link--ebay">Shop eBay &#8599;</a>
    </div>
  </div>
</nav>`;

const BASE_STYLES = `
  <style>
  ${NAV_CSS}
    :root { --bg:#0f1117;--bg2:#1a1d2e;--bg3:#22263a;--accent:#f5a623;--accent2:#7c6af5;--text:#e8eaf0;--text2:#9ba3c4;--border:#2d3254;--radius:12px; }
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:sans-serif;line-height:1.6}
    a{color:var(--accent);text-decoration:none} a:hover{text-decoration:underline}
    .wrap{max-width:1100px;margin:0 auto;padding:0 24px}
    .btn{display:inline-block;padding:10px 20px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;font-size:14px}
    .btn-primary{background:var(--accent);color:#000}
    .btn-secondary{background:var(--bg3);border:1px solid var(--border);color:var(--text)}
    input,select{background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:8px 12px;border-radius:6px;font-size:14px}
    footer{background:var(--bg2);border-top:1px solid var(--border);padding:24px;text-align:center;color:var(--text2);font-size:13px;margin-top:48px}
    footer a{color:var(--text2);margin:0 10px}
  </style>`;

// MTG Card Hub Page

function renderRandomCommander() {
  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Random MTG Commander Generator Australia | Cards on Cards on Cards</title>
  <meta name="description" content="Generate 1 to 4 random Magic: The Gathering Commanders. Filter by colour identity and mana value. Share your results with friends.">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/mtg/random-commander">
  ${BASE_STYLES}
  <style>
    .color-btn{width:38px;height:38px;border-radius:50%;border:2px solid transparent;cursor:pointer;font-size:15px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;transition:all .2s}
    .color-btn.selected{border-color:#f5a623;transform:scale(1.15);box-shadow:0 0 0 3px rgba(245,166,35,.4)}
    .count-btn{padding:6px 16px;border-radius:8px;border:1px solid var(--border);background:none;color:var(--text2);font-size:14px;font-weight:700;cursor:pointer;transition:all .2s}
    .count-btn.active{background:var(--accent);color:#000;border-color:var(--accent)}
    .cmc-btn{padding:6px 14px;border-radius:8px;border:1px solid var(--border);background:none;color:var(--text2);font-size:13px;font-weight:700;cursor:pointer;transition:all .2s}
    .cmc-btn.active{background:var(--accent);color:#000;border-color:var(--accent)}
    #results-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;margin:32px 0 24px}
    @media(max-width:480px){#results-grid{grid-template-columns:repeat(2,1fr)}}
    .cmd-result-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;overflow:hidden;position:relative;transition:border-color .2s}
    .cmd-result-card:hover{border-color:var(--accent)}
    .cmd-result-img{width:100%;display:block}
    .cmd-result-body{padding:12px}
    .cmd-result-name{font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;line-height:1.3}
    .cmd-result-type{font-size:11px;color:var(--text2);margin-bottom:6px}
    .cmd-result-price{font-size:14px;font-weight:700;color:var(--accent);margin-bottom:10px}
    .cmd-result-view{display:block;text-align:center;background:rgba(245,166,35,.1);border:1px solid rgba(245,166,35,.3);border-radius:6px;padding:6px;font-size:12px;color:var(--accent);text-decoration:none;margin-bottom:8px;transition:all .2s}
    .cmd-result-view:hover{background:var(--accent);color:#000}
    .cmd-regen-btn{width:100%;background:none;border:1px solid var(--border);color:var(--text2);border-radius:6px;padding:5px;font-size:11px;cursor:pointer;transition:all .2s}
    .cmd-regen-btn:hover{border-color:var(--accent);color:var(--accent)}
    .challenge-bar{background:linear-gradient(135deg,rgba(245,166,35,.12) 0%,rgba(124,106,245,.12) 100%);border:1px solid rgba(245,166,35,.35);border-radius:16px;padding:28px 24px;text-align:center;margin-bottom:32px;position:relative;overflow:hidden}
    .challenge-bar::before{content:'';position:absolute;top:-40px;right:-40px;width:140px;height:140px;background:radial-gradient(circle,rgba(245,166,35,.15),transparent 70%);pointer-events:none}
    .challenge-title{font-size:22px;font-weight:800;color:var(--text);margin-bottom:6px;letter-spacing:-.02em}
    .challenge-sub{font-size:14px;color:var(--text2);margin-bottom:20px;max-width:480px;margin-left:auto;margin-right:auto}
    .sbtn{display:inline-flex;align-items:center;gap:7px;padding:9px 18px;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;text-decoration:none;border:none;transition:all .15s;font-family:sans-serif}
    .sbtn:hover{opacity:.88;transform:translateY(-1px)}
    .sbtn-discord{background:#5865f2;color:#fff}
    .sbtn-reddit{background:#ff4500;color:#fff}
    .sbtn-twitter{background:#000;color:#fff}
    .sbtn-whatsapp{background:#25d366;color:#fff}
    .sbtn-copy{background:var(--bg3);border:1px solid var(--border);color:var(--text)}
    .sbtn-copy.copied{background:rgba(76,175,80,.15);border-color:#4caf50;color:#4caf50}
    .share-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
    #results-section{visibility:hidden;height:0;overflow:hidden}
    #results-section.visible{visibility:visible;height:auto;overflow:visible}
    .how-tip{background:rgba(245,166,35,.07);border:1px solid rgba(245,166,35,.2);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--text2);margin-top:10px;line-height:1.5}
    .how-tip strong{color:var(--accent)}
    .trust-bullets{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px}
    .trust-bullet{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text2)}
    .trust-bullet span{font-size:16px}
    .guide-card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px;text-decoration:none;display:block;transition:border-color .2s;border-left:3px solid transparent}
    .guide-card:hover{border-color:var(--accent)}
    .guide-card.g-amber{border-left-color:#f5a623}
    .guide-card.g-blue{border-left-color:#4a9eff}
    .guide-card.g-green{border-left-color:#4caf50}
    .guide-card.g-purple{border-left-color:#7c6af5}
    .guide-card-title{font-weight:700;font-size:14px;color:var(--text);margin-bottom:4px}
    .guide-card-desc{font-size:12px;color:var(--text2);line-height:1.4}
  </style>
</head>
<body>
${NAV}
<div class="wrap" style="padding-top:32px">
  <div style="text-align:center;margin-bottom:32px">
    <div style="display:inline-block;background:linear-gradient(135deg,rgba(245,166,35,.15),rgba(124,106,245,.15));border:1px solid rgba(245,166,35,.3);border-radius:100px;padding:6px 16px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-bottom:14px">3,000+ Legendary Creatures</div>
    <h1 style="font-size:36px;margin-bottom:10px;font-weight:800;letter-spacing:-.02em">🎲 Random Commander Generator</h1>
    <p style="color:var(--text2);max-width:560px;margin:0 auto;font-size:15px">Roll your next Commander build. Filter by colour and mana value, reroll any slot, then dare a friend to top it.</p>
  </div>

  <!-- Pre-generate challenge teaser -->
  <div style="max-width:660px;margin:0 auto 20px;background:linear-gradient(90deg,rgba(124,106,245,.1),rgba(245,166,35,.08));border:1px solid rgba(124,106,245,.25);border-radius:10px;padding:12px 18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    <span style="font-size:20px">⚔️</span>
    <div style="flex:1;min-width:180px">
      <div style="font-size:13px;font-weight:700;color:var(--text)">Roll your pod. Dare a friend.</div>
      <div style="font-size:12px;color:var(--text2)">Generate 4 random Commanders and share the link — see who builds the better deck.</div>
    </div>
  </div>

  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:32px;max-width:660px;margin:0 auto 32px">

    <!-- Trust bullets -->
    <div class="trust-bullets">
      <div class="trust-bullet"><span>🎴</span> Pulls from 3,000+ legendary creatures</div>
      <div class="trust-bullet"><span>💰</span> Live AUD prices shown</div>
      <div class="trust-bullet"><span>🔄</span> Reroll any single slot</div>
    </div>

    <div style="margin-bottom:22px">
      <p style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text2);margin-bottom:10px">How many Commanders?</p>
      <div style="display:flex;gap:8px">
        ${[1,2,3,4].map(n => `<button class="count-btn${n===4?' active':''}" data-count="${n}" onclick="setCount(this,${n})">${n}</button>`).join('')}
      </div>
    </div>

    <div style="margin-bottom:6px">
      <p style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text2);margin-bottom:10px">Colour Identity (optional)</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="color-btn" style="background:#f9faf4;color:#333" data-color="W" onclick="toggleColor(this)" title="White">W</button>
        <button class="color-btn" style="background:#aae0fa;color:#003" data-color="U" onclick="toggleColor(this)" title="Blue">U</button>
        <button class="color-btn" style="background:#2a2a2a;color:#eee" data-color="B" onclick="toggleColor(this)" title="Black">B</button>
        <button class="color-btn" style="background:#f9aa8f;color:#500" data-color="R" onclick="toggleColor(this)" title="Red">R</button>
        <button class="color-btn" style="background:#9bd3ae;color:#030" data-color="G" onclick="toggleColor(this)" title="Green">G</button>
      </div>
      <div class="how-tip">🎨 <strong>How colour filtering works:</strong> Selecting W + B shows commanders whose identity fits <em>within</em> those colours — so mono-white, mono-black, and Orzhov (W/B) commanders all appear. Leave blank to roll from all 5 colours.</div>
    </div>

    <div style="margin-bottom:28px;margin-top:18px">
      <p style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text2);margin-bottom:10px">Max Mana Value (optional)</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${[2,3,4,5,6,7,'Any'].map(v => `<button class="cmc-btn${v==='Any'?' active':''}" data-cmc="${v}" onclick="setCmc(this,${v==='Any'?99:v})">${v}</button>`).join('')}
      </div>
    </div>

    <button class="btn btn-primary" id="generate-btn" style="font-size:16px;padding:14px;width:100%;letter-spacing:.02em" onclick="generateAll()">
      ✨ Generate 4 Commanders
    </button>
  </div>

  <div id="results-section">
    <div id="results-grid"></div>

    <div style="text-align:center;margin-bottom:28px">
      <button class="btn btn-secondary" style="padding:10px 28px" onclick="generateAll()">🎲 Generate All Again</button>
    </div>

    <!-- Challenge a Friend — upgraded -->
    <div class="challenge-bar">
      <div style="font-size:32px;margin-bottom:8px">⚔️</div>
      <div class="challenge-title">Think You Can Build Better?</div>
      <div class="challenge-sub">Send your friend this exact Commander pod and see who builds the stronger deck. No excuses — same pool, best builder wins.</div>
      <div class="share-row">
        <button class="sbtn sbtn-discord" onclick="shareDiscord()">Discord</button>
        <a class="sbtn sbtn-reddit" id="reddit-btn" href="#" target="_blank" rel="noopener">Reddit</a>
        <a class="sbtn sbtn-twitter" id="twitter-btn" href="#" target="_blank" rel="noopener">𝕏 Twitter</a>
        <a class="sbtn sbtn-whatsapp" id="whatsapp-btn" href="#" target="_blank" rel="noopener">WhatsApp</a>
        <button class="sbtn sbtn-copy" id="copy-btn" onclick="copyLink()">📋 Copy Link</button>
      </div>
    </div>
  </div>

  <!-- Related Guides — upgraded with coloured cards -->
  <div style="max-width:900px;margin:0 auto 48px">
    <h3 style="font-size:18px;font-weight:700;margin-bottom:16px">Explore More</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
      <a href="/cards/mtg/random-commander" class="guide-card g-amber">
        <div class="guide-card-title">🎲 Random Commander</div>
        <div class="guide-card-desc">Roll again with different filters. Find your next build.</div>
      </a>
      <a href="/blog/mtg-commander-decks-australia/" class="guide-card g-purple">
        <div class="guide-card-title">👑 Best Commander Decks AU</div>
        <div class="guide-card-desc">Top-rated precons and budget builds available in Australia.</div>
      </a>
      <a href="/ev-calculator.html" class="guide-card g-blue">
        <div class="guide-card-title">📊 EV Calculator</div>
        <div class="guide-card-desc">Is your next booster box actually worth cracking?</div>
      </a>
      <a href="/cards/mtg" class="guide-card g-green">
        <div class="guide-card-title">🃏 Browse All MTG Cards</div>
        <div class="guide-card-desc">Search 96,000+ cards with live AUD pricing.</div>
      </a>
    </div>
  </div>
</div>

<footer>
  <p><a href="/">Home</a><a href="/cards/mtg">MTG Cards</a><a href="/cards/mtg/random-commander">Random Commander</a><a href="/ev-calculator.html">EV Calculator</a><a href="/blog">Blog</a></p>
  <p style="margin-top:8px">© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
</footer>

<script>
window.C3_SUPA_URL = '${SUPABASE_URL}';
window.C3_SUPA_KEY = '${SUPABASE_ANON_KEY}';

let selectedColors = [];
let selectedCmc = 99;
let selectedCount = 4;
let currentSlugs = [];

(function() {
  const p = new URLSearchParams(location.search);
  if (p.get('colors')) {
    selectedColors = p.get('colors').split('');
    document.querySelectorAll('.color-btn').forEach(b => {
      if (selectedColors.includes(b.dataset.color)) b.classList.add('selected');
    });
  }
  if (p.get('cmc') && p.get('cmc') !== '99') {
    selectedCmc = parseInt(p.get('cmc'));
    document.querySelectorAll('.cmc-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.cmc == selectedCmc);
    });
  }
  if (p.get('count')) {
    selectedCount = parseInt(p.get('count')) || 4;
    document.querySelectorAll('.count-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.count) === selectedCount);
    });
  }
  updateGenerateBtn();
  if (p.get('auto') === '1') generateAll();
})();

function setCount(btn, n) {
  selectedCount = n;
  document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateGenerateBtn();
}

function updateGenerateBtn() {
  const btn = document.getElementById('generate-btn');
  if (btn) btn.textContent = '\u2728 Generate ' + selectedCount + ' Commander' + (selectedCount > 1 ? 's' : '');
}

function toggleColor(btn) {
  const color = btn.dataset.color;
  if (selectedColors.includes(color)) {
    selectedColors = selectedColors.filter(c => c !== color);
    btn.classList.remove('selected');
  } else {
    selectedColors.push(color);
    btn.classList.add('selected');
  }
}

function setCmc(btn, val) {
  selectedCmc = val;
  document.querySelectorAll('.cmc-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function fetchOneCommander(exclude) {
  // Build PostgREST query manually — URLSearchParams URL-encodes special chars that PostgREST needs literal
  const filters = [];
  filters.push('select=name,type_line,image_uri_normal,image_uri_small,price_aud,price_usd,slug,color_identity,cmc');
  // Legendary Creature filter — use 'like' with wildcards (case insensitive via ilike but we need URL-safe)
  filters.push('type_line=ilike.*Legendary*Creature*');
  // Skip digital
  filters.push('digital=eq.false');
  // CMC filter
  if (selectedCmc < 99) filters.push('cmc=lte.' + selectedCmc);
  // Exclude already-shown slugs (only add filter if list is non-empty)
  if (exclude && exclude.length) {
    // PostgREST in.() needs comma-separated values, slugs are URL-safe already
    filters.push('slug=not.in.(' + exclude.map(encodeURIComponent).join(',') + ')');
  }
  // Colour identity: card colour_identity must be contained by selected colours
  if (selectedColors.length) {
    // PostgREST array contained-by: cd.{W,U} — braces stay literal
    filters.push('color_identity=cd.{' + selectedColors.join(',') + '}');
  }
  filters.push('limit=500');

  const queryString = filters.join('&');
  const url = window.C3_SUPA_URL + '/rest/v1/mtg_cards?' + queryString;

  try {
    const res = await fetch(url, {
      headers: {
        'apikey': window.C3_SUPA_KEY
      }
    });
    if (!res.ok) {
      console.error('Supabase request failed:', res.status, await res.text());
      return null;
    }
    const cards = await res.json();
    if (!Array.isArray(cards) || cards.length === 0) return null;
    return cards[Math.floor(Math.random() * cards.length)];
  } catch (err) {
    console.error('Random commander fetch error:', err);
    return null;
  }
}

function cardHTML(card, index) {
  const price = card.price_aud > 0
    ? 'AU$' + parseFloat(card.price_aud).toFixed(2)
    : card.price_usd ? '~AU$' + (card.price_usd * 1.58).toFixed(2) : 'Price N/A';
  const img = card.image_uri_normal || card.image_uri_small || '';
  // Colour identity pips
  const ci = Array.isArray(card.color_identity) ? card.color_identity : [];
  const pipColours = { W:'#f9faf4', U:'#aae0fa', B:'#2a2a2a', R:'#f9aa8f', G:'#9bd3ae' };
  const pipText    = { W:'#333',    U:'#003',    B:'#eee',    R:'#500',    G:'#030' };
  const pipsHTML = ci.length
    ? '<div style="display:flex;gap:4px;margin-bottom:8px">' + ci.map(c =>
        '<span style="width:18px;height:18px;border-radius:50%;background:' + (pipColours[c]||'#888')
        + ';color:' + (pipText[c]||'#fff') + ';font-size:10px;font-weight:700;display:inline-flex;align-items:center;justify-content:center">' + c + '</span>'
      ).join('') + '</div>'
    : '<div style="display:flex;gap:4px;margin-bottom:8px"><span style="width:18px;height:18px;border-radius:50%;background:#888;color:#fff;font-size:10px;font-weight:700;display:inline-flex;align-items:center;justify-content:center">C</span></div>';
  return '<div class="cmd-result-card" id="card-slot-' + index + '">'
    + (img ? '<img src="' + img + '" alt="' + card.name.replace(/"/g,'&quot;') + '" class="cmd-result-img">' : '')
    + '<div class="cmd-result-body">'
    + '<div class="cmd-result-name">' + card.name + '</div>'
    + '<div class="cmd-result-type">' + (card.type_line || '') + '</div>'
    + pipsHTML
    + '<div class="cmd-result-price">' + price + '</div>'
    + '<a href="/cards/mtg/' + card.slug + '" class="cmd-result-view" target="_blank">View Card \u2192</a>'
    + '<button class="cmd-regen-btn" onclick="regenOne(' + index + ')">\ud83d\udd04 Reroll this one</button>'
    + '</div></div>';
}

async function generateAll() {
  const grid = document.getElementById('results-grid');
  const section = document.getElementById('results-section');
  const btn = document.getElementById('generate-btn');
  btn.disabled = true;
  btn.textContent = '\u23f3 Rolling...';
  grid.innerHTML = Array.from({length: selectedCount}, (_,i) =>
    '<div class="cmd-result-card" style="height:300px;background:var(--bg3);border-radius:12px;opacity:' + (0.4 + i*0.1) + '"></div>'
  ).join('');
  section.classList.add('visible');
  try {
    const fetched = await Promise.all(
      Array.from({length: selectedCount}, () => fetchOneCommander([]))
    );
    const results = fetched.filter(Boolean);
    currentSlugs = results.map(c => c.slug);
    if (results.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text2)">No commanders found with these filters. Try widening colour or mana value.</div>';
    } else {
      grid.innerHTML = results.map((c, i) => cardHTML(c, i)).join('');
    }
    section.scrollIntoView({ behavior: 'smooth' });
    updateShareLinks(results);
    pushUrlState();
  } catch (err) {
    console.error('Generate failed:', err);
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#f88">Something went wrong. Open DevTools console for details and report back.</div>';
  } finally {
    btn.disabled = false;
    btn.textContent = '\u2728 Generate ' + selectedCount + ' Commander' + (selectedCount > 1 ? 's' : '');
  }
}

async function regenOne(index) {
  const slot = document.getElementById('card-slot-' + index);
  if (!slot) return;
  slot.style.opacity = '0.4';
  const card = await fetchOneCommander([...currentSlugs]);
  if (!card) { slot.style.opacity = '1'; return; }
  currentSlugs[index] = card.slug;
  slot.outerHTML = cardHTML(card, index);
}

function updateShareLinks(results) {
  const names = results.map(c => c.name).join(', ');
  const url = location.origin + '/cards/mtg/random-commander?colors='
    + (selectedColors.join('') || '') + '&cmc=' + selectedCmc + '&count=' + selectedCount + '&auto=1';
  const tweetText = encodeURIComponent('I just rolled ' + names + ' as my Commander pod. Can you beat it? Try the random generator: ' + url);
  const redditTitle = encodeURIComponent('Random Commander pod: ' + names + ' \u2014 try it yourself');
  const waText = encodeURIComponent('Check out my random Commander pod: ' + names + '. Think you can build better? ' + url);
  document.getElementById('twitter-btn').href = 'https://twitter.com/intent/tweet?text=' + tweetText;
  document.getElementById('reddit-btn').href = 'https://www.reddit.com/submit?url=' + encodeURIComponent(url) + '&title=' + redditTitle;
  document.getElementById('whatsapp-btn').href = 'https://wa.me/?text=' + waText;
}

function shareDiscord() {
  const url = location.origin + '/cards/mtg/random-commander?colors='
    + (selectedColors.join('') || '') + '&cmc=' + selectedCmc + '&count=' + selectedCount + '&auto=1';
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.querySelector('.sbtn-discord');
    const orig = btn.textContent;
    btn.textContent = '✅ Copied for Discord!';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  });
}

function pushUrlState() {
  const params = new URLSearchParams();
  if (selectedColors.length) params.set('colors', selectedColors.join(''));
  if (selectedCmc < 99) params.set('cmc', selectedCmc);
  params.set('count', selectedCount);
  history.replaceState({}, '', '/cards/mtg/random-commander?' + params);
}

function copyLink() {
  const url = location.origin + '/cards/mtg/random-commander?colors='
    + (selectedColors.join('') || '') + '&cmc=' + selectedCmc + '&count=' + selectedCount + '&auto=1';
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.textContent = '\u2705 Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '\ud83d\udccb Copy Link'; btn.classList.remove('copied'); }, 2000);
  });
}
</script>
<style>
@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.7}}
</style>
<!-- GA4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
</body></html>`;
}

export default async (req) => {
  return new Response(renderRandomCommander(), {
    headers: { 
      'Content-Type': 'text/html; charset=utf-8', 
      'Cache-Control': 'public, s-maxage=86400' 
    }
  });
};

export const config = {
  path: '/cards/mtg/random-commander'
};