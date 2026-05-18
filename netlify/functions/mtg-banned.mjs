// netlify/functions/mtg-banned.mjs
// Serves: /cards/mtg/banned and /cards/mtg/banned/:format

const EPN_CAMPID = Netlify.env.get('EPN_CAMPID') || '5339146789';
const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');

const FORMATS = {
  standard: {
    label: 'Standard',
    color: '#4ADE80',
    description: 'Standard rotates yearly. As of mid-2026, Standard has zero active bans. Cards listed here were banned during their Standard-legal period before rotating out.',
    cards: [
      { name: 'Invoke Despair', slug: 'invoke-despair', reason: 'Banned during Kamigawa-Dominaria Standard (2023). Dominated every midrange and control matchup. Now rotated out of Standard.' },
      { name: 'Fable of the Mirror-Breaker', slug: 'fable-of-the-mirror-breaker-reflection-of-kiki-jiki', reason: 'Banned during Kamigawa-Dominaria Standard (2023). Three-mana saga that appeared in nearly every red deck. Now rotated out of Standard.' },
      { name: 'The One Ring', slug: 'the-one-ring', reason: 'Banned in Standard and Pioneer (2023). Produced too much card advantage with no real downside in midrange decks. Now rotated out of Standard.' },
    ]
  },
  pioneer: {
    label: 'Pioneer',
    color: '#60A5FA',
    description: 'Pioneer covers sets from Return to Ravnica (2012) onward. No fetchlands allowed.',
    cards: [
      { name: "Smuggler's Copter", slug: 'smugglers-copter', reason: 'Two-mana vehicle that drew cards and attacked freely. Appeared in every aggressive deck, warping the format.' },
      { name: 'Oko, Thief of Crowns', slug: 'oko-thief-of-crowns', reason: 'Three-mana planeswalker that dominated every format it entered. Banned across Standard, Pioneer, and Modern.' },
      { name: 'Nexus of Fate', slug: 'nexus-of-fate', reason: 'Enabled infinite turns through shuffle loops. Created non-games where opponents could not win.' },
      { name: 'Winota, Joiner of Forces', slug: 'winota-joiner-of-forces', reason: 'Generated too much free value cheating creatures into play. Created explosive unbeatable turns.' },
      { name: 'Expressive Iteration', slug: 'expressive-iteration', reason: 'Two-mana card selection spell too powerful for Pioneer. Appeared in every blue-red deck.' },
      { name: 'Fires of Invention', slug: 'fires-of-invention', reason: 'Let players cast spells without spending mana, enabling broken combinations across multiple decks.' },
      { name: 'Inverter of Truth', slug: 'inverter-of-truth', reason: "Combined with Thassa's Oracle to create an instant-win combo too consistent and fast to interact with." },
      { name: 'Kethis, the Hidden Hand', slug: 'kethis-the-hidden-hand', reason: 'Enabled a legendary-based combo winning on turn three or four consistently.' },
      { name: 'Walking Ballista', slug: 'walking-ballista', reason: 'Combo win condition with Heliod. Banned to break up the combo rather than remove Heliod itself.' },
      { name: 'Underworld Breach', slug: 'underworld-breach', reason: 'Enabled powerful graveyard loops generating infinite value with minimal setup.' },
    ]
  },
  modern: {
    label: 'Modern',
    color: '#A78BFA',
    description: 'Modern covers sets from Eighth Edition (2003) onward. A powerful non-rotating format. Ban list last updated November 2025 - no changes to Modern at that announcement.',
    cards: [
      { name: 'Hogaak, Arisen Necropolis', slug: 'hogaak-arisen-necropolis', reason: 'Eight-mana creature costing no mana. Dominated Modern for months and won the Pro Tour before being banned.' },
      { name: 'Faithless Looting', slug: 'faithless-looting', legalIn: 'Legacy, Vintage', reason: 'Best enabler for graveyard strategies. Banned to weaken multiple problematic archetypes simultaneously.' },
      { name: 'Birthing Pod', slug: 'birthing-pod', legalIn: 'Legacy, Commander', reason: 'Four-mana artifact tutoring creatures into play. Enabled too-consistent creature combo decks.' },
      { name: 'Splinter Twin', slug: 'splinter-twin', legalIn: 'Legacy, Commander', reason: 'Created an instant-win combo with Deceiver Exarch. Banned to promote diversity.' },
      { name: 'Summer Bloom', slug: 'summer-bloom', reason: 'Enabled Amulet Bloom combo to win on turn two too consistently.' },
      { name: 'Blazing Shoal', slug: 'blazing-shoal', reason: 'Could deal lethal damage on turn two by pitching high-cost red cards to pump an infect creature.' },
      { name: 'Cloudpost', slug: 'cloudpost', reason: 'Generated too much mana in multiples. Created games with insurmountable resource advantages.' },
      { name: "Green Sun's Zenith", slug: 'green-suns-zenith', legalIn: 'Legacy, Vintage', reason: 'One-mana tutor finding any green creature. Too efficient and consistent for Modern.' },
      { name: 'Ponder', slug: 'ponder', legalIn: 'Legacy, Vintage, Commander', reason: 'One-mana cantrip too powerful for Modern. Legal in Legacy and Vintage.' },
      { name: 'Preordain', slug: 'preordain', legalIn: 'Legacy, Vintage, Commander', reason: 'Same reasoning as Ponder. One-mana blue card selection too efficient for Modern.' },
      { name: 'Gitaxian Probe', slug: 'gitaxian-probe', legalIn: 'Legacy, Vintage', reason: 'Free blue card giving perfect information and fuelling storm counts. Too efficient in too many strategies.' },
      { name: 'Golgari Grave-Troll', slug: 'golgari-grave-troll', reason: 'Powerful dredge card enabling Dredge to be too consistent and fast.' },
      { name: 'Deathrite Shaman', slug: 'deathrite-shaman', legalIn: 'Legacy, Vintage', reason: 'One-mana creature doing too much. Appeared in every deck running green or black.' },
      { name: "Lurrus of the Dream-Den", slug: 'lurrus-of-the-dream-den', reason: 'Companion warped deck building across every format. Banned in Modern and Legacy.' },
      { name: "Tibalt's Trickery", slug: 'tibalts-trickery', reason: 'Enabled a combo countering your own spell to cheat a huge threat into play on turn one.' },
      { name: 'Simian Spirit Guide', slug: 'simian-spirit-guide', legalIn: 'Legacy, Vintage, Commander', reason: 'Free mana powering out too many problematic decks including Ad Nauseam and Belcher variants.' },
      { name: 'Rite of Flame', slug: 'rite-of-flame', reason: 'Ritual effect powering out Storm combo too quickly and consistently.' },
      { name: 'Punishing Fire', slug: 'punishing-fire', reason: 'With Grove of the Burnwillows created a recurring removal engine locking out creature-based decks.' },
    ]
  },
  commander: {
    label: 'Commander',
    color: '#F97316',
    description: 'Commander bans are managed by the independent Rules Committee, not Wizards of the Coast.',
    cards: [
      { name: 'Ancestral Recall', slug: 'ancestral-recall', legalIn: 'Vintage only (Restricted to 1 copy)', reason: 'One of the Power Nine. Drawing three cards for one mana is too powerful for any multiplayer format.' },
      { name: 'Black Lotus', slug: 'black-lotus', legalIn: 'Vintage only (Restricted to 1 copy)', reason: 'Produces three mana of any colour for zero cost. Banned in every sanctioned format except Vintage.' },
      { name: 'Channel', slug: 'channel', legalIn: 'Vintage, Legacy', reason: 'Converts life points to mana at a devastating rate. Enables turn-one kills with Fireball variants.' },
      { name: 'Emrakul, the Aeons Torn', slug: 'emrakul-the-aeons-torn', reason: 'Taking an extra turn and granting protection from coloured spells is too oppressive when cheated into play.' },
      { name: 'Erayo, Soratami Ascendant', slug: 'erayo-soratami-ascendant', reason: 'As a commander, easily locks opponents out of casting spells entirely, creating non-games.' },
      { name: 'Fastbond', slug: 'fastbond', reason: 'Enables playing unlimited lands per turn for one life each. Fuels too many degenerate combos.' },
      { name: 'Flash', slug: 'flash', reason: 'Two-mana instant that with Protean Hulk enables a reliable turn-one or two kill.' },
      { name: 'Golos, Tireless Pilgrim', slug: 'golos-tireless-pilgrim', reason: 'As a commander, too generically powerful. Appeared in every five-colour deck regardless of theme.' },
      { name: 'Griselbrand', slug: 'griselbrand', reason: 'As a commander, drawing cards equal to life paid is too powerful, enabling drawing most of the deck.' },
      { name: 'Hullbreacher', slug: 'hullbreacher', reason: "Replaced opponents' card draws with treasures, creating oppressive lock states in multiplayer." },
      { name: 'Iona, Shield of Emeria', slug: 'iona-shield-of-emeria', reason: 'Naming a colour prevents opponents casting spells of that colour. Completely locks out mono-colour decks.' },
      { name: 'Karakas', slug: 'karakas', reason: 'Bouncing legendary creatures for free is too oppressive when used repeatedly against commanders.' },
      { name: 'Leovold, Emissary of Trest', slug: 'leovold-emissary-of-trest', reason: 'As a commander, combined card draw restriction with damage replacement created frustrating lock states.' },
      { name: 'Library of Alexandria', slug: 'library-of-alexandria', reason: 'Draws an extra card per turn for free. Too powerful in a format where card advantage is paramount.' },
      { name: 'Limited Resources', slug: 'limited-resources', reason: 'Caps total lands in play at five. Used to prevent opponents ever reaching meaningful mana.' },
      { name: 'Lutri, the Spellchaser', slug: 'lutri-the-spellchaser', reason: 'Banned as a companion only (updated Feb 2026). Can be played in the 99 or as your commander, but cannot be used as a companion. Free companion with no restriction in singleton was unfair.' },
      { name: 'Paradox Engine', slug: 'paradox-engine', reason: 'Untapped all non-land permanents whenever a spell was cast. Enabled too-easy infinite mana combos.' },
      { name: 'Primeval Titan', slug: 'primeval-titan', reason: 'As a commander, fetching two lands every attack created insurmountable advantages too quickly.' },
      { name: 'Prophet of Kruphix', slug: 'prophet-of-kruphix', reason: "Gave all creatures flash and untapped all permanents on opponents' turns. Too oppressive in multiplayer." },
      { name: 'Recurring Nightmare', slug: 'recurring-nightmare', reason: 'Returned creatures from the graveyard repeatedly at minimal cost. Generated too much value over time.' },
      { name: 'Rofellos, Llanowar Emissary', slug: 'rofellos-llanowar-emissary', reason: 'As a commander, generated enormous mana in green decks from the command zone too consistently.' },
      { name: 'Sundering Titan', slug: 'sundering-titan', reason: 'Destroyed multiple lands entering and leaving play. Too punishing in a format built around many basics.' },
      { name: 'Sylvan Primordial', slug: 'sylvan-primordial', reason: 'Destroyed a non-land permanent and fetched a forest for each opponent. Too powerful in multiplayer.' },
      { name: 'Time Vault', slug: 'time-vault', reason: 'Generates infinite extra turns when combined with untap effects. No fair use case in Commander.' },
      { name: 'Time Walk', slug: 'time-walk', legalIn: 'Vintage only (Restricted to 1 copy)', reason: 'Two-mana extra turn spell. Part of the Power Nine. Too powerful for any multiplayer format.' },
      { name: 'Tinker', slug: 'tinker', reason: 'Sacrifices an artifact to tutor any artifact into play. Fetches Blightsteel Colossus for a single blue mana.' },
      { name: 'Tolarian Academy', slug: 'tolarian-academy', reason: 'Produces mana equal to artifacts you control. Generates enormous mana in artifact-heavy decks.' },
      { name: 'Trade Secrets', slug: 'trade-secrets', reason: 'Two players draw unlimited cards in a loop. Used in coordinated play to give one player a huge advantage.' },
      { name: 'Upheaval', slug: 'upheaval', reason: 'Returned all permanents to hand. Used with floating mana to reset the board while keeping a mana advantage.' },
      { name: "Yawgmoth's Bargain", slug: 'yawgmoths-bargain', reason: 'Pay life to draw cards. Draws the entire deck for a trivial life cost in life-gain focused strategies.' },
    ]
  }
};

async function getCardImages(slugs) {
  if (!slugs.length) return {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/mtg_cards`);
    url.searchParams.set('select', 'slug,image_uri_small,name');
    url.searchParams.set('limit', '100');
    // slug in() filter appended manually - searchParams encodes parens/quotes breaking PostgREST
    const fetchUrl = url.toString() + '&slug=in.(' + slugs.map(s => '"' + s + '"').join(',') + ')';
    const res = await fetch(fetchUrl, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return {};
    const data = await res.json();
    const map = {};
    if (Array.isArray(data)) {
      data.forEach(c => { if (c.image_uri_small) map[c.slug] = c.image_uri_small; });
    }
    return map;
  } catch { clearTimeout(timer); return {}; }
}

export default async (req) => {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/\/$/, '').split('/');
  const formatKey = parts[parts.length - 1].toLowerCase();
  const format = FORMATS[formatKey] || null;

  // Fetch card images for the active format
  let imageMap = {};
  if (format) {
    const slugs = format.cards.map(c => c.slug);
    imageMap = await getCardImages(slugs);
  }

  const formatTabs = Object.entries(FORMATS).map(([key, f]) => {
    const active = key === formatKey;
    return `<a href="/cards/mtg/banned/${key}" class="fmt-tab${active ? ' fmt-tab--active' : ''}" style="${active ? `border-color:${f.color};color:${f.color};background:${f.color}15` : ''}">${f.label}</a>`;
  }).join('');

  const cardGrid = format ? format.cards.map(card => {
    const img = imageMap[card.slug]
      ? `<img src="${imageMap[card.slug]}" alt="${card.name.replace(/"/g,'&quot;')}" loading="lazy">`
      : `<div class="card-no-img">&#128683;</div>`;
    const ebayUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(card.name + ' mtg')}&_sacat=183454&campid=${EPN_CAMPID}&mkevt=1`;
    const legalBadge = card.legalIn ? `<div class="ban-legal-in">&#9989; Legal in: ${card.legalIn.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>` : '';
    return `<div class="ban-card">
      <div class="ban-card-img">${img}</div>
      <div class="ban-card-info">
        <div class="ban-card-name">${card.name.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        <div class="ban-card-reason">${card.reason.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        ${legalBadge}
        <a href="${ebayUrl}" target="_blank" rel="noopener" class="ban-card-link">Find on eBay AU &#8599;</a>
      </div>
    </div>`;
  }).join('') : '';

  const overviewCards = Object.entries(FORMATS).map(([key, f]) => {
    return `<a href="/cards/mtg/banned/${key}" class="fmt-overview-card" style="border-color:${f.color}33">
      <div class="fmt-overview-icon" style="background:${f.color}18;color:${f.color};border-color:${f.color}33">&#128683;</div>
      <div class="fmt-overview-label">${f.label}</div>
      <div class="fmt-overview-count">${f.cards.length} banned</div>
      <div class="fmt-overview-desc">${f.description}</div>
      <div class="fmt-overview-cta" style="color:${f.color}">View list &rarr;</div>
    </a>`;
  }).join('');

  const pageTitle = format
    ? `MTG ${format.label} Banned List | Cards on Cards on Cards`
    : 'MTG Banned Cards by Format | Cards on Cards on Cards';
  const pageDesc = format
    ? `Complete list of cards banned in MTG ${format.label} as of 2026. Includes ban reasons for each card. Australian prices and eBay AU buy links.`
    : 'Complete MTG banned card lists for Standard, Pioneer, Modern, and Commander. Includes ban reasons for every banned card. Australian prices and eBay AU buy links.';

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${pageTitle}</title>
  <meta name="description" content="${pageDesc}">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/cards/mtg/banned${format ? '/' + formatKey : ''}">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <meta property="og:title" content="${pageTitle}">
  <meta property="og:description" content="${pageDesc}">
  <meta property="og:image" content="https://cardsoncardsoncards.com.au/c3-og-banner.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&display=swap" rel="stylesheet">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <style>
    :root{--bg:#0f1117;--bg2:#1a1d2e;--bg3:#22263a;--accent:#f5a623;--text:#e8eaf0;--text2:#9ba3c4;--border:#2d3254;--radius:12px;--gold:#C9A84C}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:sans-serif;line-height:1.6}
    a{color:var(--accent);text-decoration:none}
    a:hover{text-decoration:underline}
    .wrap{max-width:1100px;margin:0 auto;padding:0 24px}
    footer{background:var(--bg2);border-top:1px solid var(--border);padding:24px;text-align:center;color:var(--text2);font-size:13px;margin-top:48px}
    footer a{color:var(--text2);margin:0 10px}
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
    /* PAGE */
    .page-header{padding:32px 0 24px}
    .breadcrumb{font-size:12px;color:var(--text2);margin-bottom:12px}
    .breadcrumb a{color:var(--text2)}
    .breadcrumb a:hover{color:var(--text)}
    /* FORMAT TABS */
    .fmt-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:32px}
    .fmt-tab{padding:8px 20px;border-radius:8px;border:1px solid var(--border);color:var(--text2);font-size:13px;font-weight:600;text-decoration:none;transition:all .2s}
    .fmt-tab:hover{color:var(--text);border-color:var(--text2);text-decoration:none}
    .fmt-tab--active{font-weight:700}
    /* FORMAT OVERVIEW */
    .fmt-overview{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:40px}
    .fmt-overview-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:20px;text-decoration:none;transition:all .2s;display:flex;flex-direction:column;gap:8px}
    .fmt-overview-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.3);text-decoration:none}
    .fmt-overview-icon{width:40px;height:40px;border-radius:8px;border:1px solid;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
    .fmt-overview-label{font-family:Cinzel,serif;font-size:15px;font-weight:700;color:var(--text)}
    .fmt-overview-count{font-size:12px;color:var(--text2);font-weight:600}
    .fmt-overview-desc{font-size:12px;color:var(--text2);line-height:1.5;flex:1}
    .fmt-overview-cta{font-size:12px;font-weight:700;margin-top:auto}
    /* FORMAT DETAIL */
    .format-header{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:24px}
    .format-header h2{font-family:Cinzel,serif;font-size:22px;margin-bottom:8px}
    .format-header p{color:var(--text2);font-size:14px}
    .ban-count{display:inline-block;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);color:#f87171;border-radius:6px;padding:2px 10px;font-size:12px;font-weight:700;margin-left:8px}
    /* BAN CARD GRID */
    .ban-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
    .ban-card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;overflow:hidden;display:flex;gap:12px;padding:12px;transition:border-color .2s}
    .ban-card:hover{border-color:rgba(239,68,68,.4)}
    .ban-card-img{width:60px;flex-shrink:0}
    .ban-card-img img{width:60px;border-radius:4px;display:block}
    .card-no-img{width:60px;height:84px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:22px}
    .ban-card-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
    .ban-card-name{font-size:13px;font-weight:700;color:var(--text)}
    .ban-card-reason{font-size:11px;color:var(--text2);line-height:1.5;flex:1}
    .ban-card-link{font-size:11px;color:#60A5FA;font-weight:600;text-decoration:none;margin-top:4px}
    .ban-legal-in{font-size:10px;color:#4ADE80;font-weight:600;margin-top:2px}
    .ban-card-link:hover{text-decoration:underline}
    @media(max-width:600px){.ban-grid{grid-template-columns:1fr}.nav-links{display:none}.fmt-overview{grid-template-columns:1fr 1fr}}
  </style>
</head>
<body>
<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo" title="Cards on Cards on Cards"><img src="/c3logo.png" alt="C3 - Cards on Cards on Cards"></a>
    <div class="nav-search-wrap">
      <input class="nav-search-input" type="text" id="nav-q" placeholder="Search cards..." autocomplete="off" onkeydown="if(event.key==='Enter'){var v=this.value.trim();if(v)window.location='/search?q='+encodeURIComponent(v);}">
      <button class="nav-search-btn" onclick="var v=document.getElementById('nav-q').value.trim();if(v)window.location='/search?q='+encodeURIComponent(v);">&#128269;</button>
    </div>
    <div class="nav-links">
      <a href="/cards" class="nav-link nav-link--active">Card Vault</a>
      <a href="/cards/mtg" class="nav-link" style="color:#C9A84C;border-color:rgba(201,168,76,.5);background:rgba(201,168,76,.08)">MTG</a>
      <a href="/compare" class="nav-link nav-link--compare">Compare</a>
      <a href="/market" class="nav-link nav-link--market">Market</a>
      <a href="/tools.html" class="nav-link nav-link--tools">Tools</a>
      <a href="/play.html" class="nav-link nav-link--play">Play</a>
      <a href="/blog" class="nav-link nav-link--blog">Blog</a>
      <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=C3Nav&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="nav-link nav-link--ebay">Shop eBay &#8599;</a>
    </div>
  </div>
</nav>

<div class="wrap" style="padding-top:28px;padding-bottom:48px">
  <div class="breadcrumb">
    <a href="/">Home</a> &rsaquo; <a href="/cards">Card Vault</a> &rsaquo; <a href="/cards/mtg">MTG</a> &rsaquo; ${format ? `<a href="/cards/mtg/banned">Banned Cards</a> &rsaquo; ${format.label}` : 'Banned Cards'}
  </div>

  <div class="page-header">
    <h1 style="font-family:Cinzel,serif;font-size:clamp(22px,4vw,32px);margin-bottom:8px">MTG Banned Cards</h1>
    <p style="color:var(--text2);font-size:15px">Banned lists for Standard, Pioneer, Modern, and Commander with ban reasons. <strong style="color:var(--text2)">Last updated May 2026.</strong> Always verify with the <a href="https://magic.wizards.com/en/banned-restricted-list" target="_blank" rel="noopener" style="color:var(--gold)">official Wizards list</a> before tournament play.</p>
  </div>

  <div class="fmt-tabs">${formatTabs}</div>

  ${format ? `
  <div class="format-header">
    <h2 style="color:${format.color}">${format.label} Banned List <span class="ban-count">${format.cards.length} banned</span></h2>
    <p>${format.description}</p>
  </div>
  <div class="ban-grid">${cardGrid}</div>
  ` : `
  <p style="color:var(--text2);margin-bottom:28px;font-size:14px">Select a format below to view its complete banned list with ban reasons for every card.</p>
  <div class="fmt-overview">${overviewCards}</div>
  `}
</div>

<footer>
  <p><a href="/">Home</a><a href="/cards">Card Vault</a><a href="/cards/mtg">MTG Cards</a><a href="/cards/mtg/banned">MTG Banned</a><a href="/blog">Blog</a><a href="/tracker.html">Free Tracker</a></p>
  <p style="margin-top:8px;font-size:12px">Ban lists current as of 2026. All prices in AUD. &copy; 2026 Cards on Cards on Cards &middot; Affiliate links may earn a small commission.</p>
</footer>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=86400' }
  });
};

export const config = { path: '/cards/mtg/banned/:format?' };
