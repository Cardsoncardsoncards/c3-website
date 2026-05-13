// netlify/functions/card-compare.mjs
// C3 Card Compare — /compare
// All 8 games, 5 card slots, version picker, AUD/USD toggle, sparklines (MTG), shareable URL
// URL format: /compare?cards=mtg:slug1,pokemon:slug2  (legacy ?cards=slug1 assumes MTG)

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EXCHANGE_KEY      = Netlify.env.get('EXCHANGE_RATE_API_KEY');
const EPN_CAMPID        = '5339146789';
const AMAZON_TAG        = 'blasdigital-22';

const GAME_CONFIG = {
  mtg:        { label: 'MTG',         color: '#C9A84C', table: 'mtg_cards',       hubPath: '/cards/mtg'        },
  pokemon:    { label: 'Pokemon',     color: '#EF4444', table: 'pokemon_cards',    hubPath: '/cards/pokemon'    },
  yugioh:     { label: 'Yu-Gi-Oh',   color: '#8B5CF6', table: 'yugioh_cards',     hubPath: '/cards/yugioh'     },
  lorcana:    { label: 'Lorcana',     color: '#3B82F6', table: 'lorcana_cards',    hubPath: '/cards/lorcana'    },
  onepiece:   { label: 'One Piece',   color: '#F97316', table: 'onepiece_cards',   hubPath: '/cards/onepiece'   },
  dragonball: { label: 'Dragon Ball', color: '#EAB308', table: 'dragonball_cards', hubPath: '/cards/dragonball' },
  starwars:   { label: 'Star Wars',   color: '#FFE81F', table: 'starwars_cards',   hubPath: '/cards/starwars'   },
  riftbound:  { label: 'Riftbound',   color: '#10B981', table: 'riftbound_cards',  hubPath: '/cards/riftbound'  },
};

async function supabaseGet(path) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

async function getLiveRate() {
  if (!EXCHANGE_KEY) return 1.58;
  try {
    const res = await fetch(`https://v6.exchangerate-api.com/v6/${EXCHANGE_KEY}/pair/USD/AUD`);
    if (!res.ok) return 1.58;
    const d = await res.json();
    return d.conversion_rate || 1.58;
  } catch { return 1.58; }
}

async function fetchCard(game, slug, usdToAud) {
  const cfg = GAME_CONFIG[game];
  if (!cfg) return null;

  if (game === 'mtg') return fetchMTGCard(slug, usdToAud);
  return fetchNonMTGCard(game, slug, usdToAud, cfg);
}

async function fetchMTGCard(slug, usdToAud) {
  const cards = await supabaseGet(`mtg_cards?slug=eq.${encodeURIComponent(slug)}&limit=1`);
  if (!cards || !cards[0]) return null;
  const card = cards[0];

  const [snapshots, cheapestPrinting] = await Promise.all([
    supabaseGet(`mtg_price_snapshots?scryfall_id=eq.${card.scryfall_id}&order=snapshot_date.asc&limit=10`).catch(() => []),
    supabaseGet(`mtg_cards?name=eq.${encodeURIComponent(card.name)}&slug=neq.${encodeURIComponent(slug)}&select=slug,set_name,price_aud,price_usd&order=price_aud.asc.nullslast&limit=1`).catch(() => [])
  ]);

  const priceAud     = card.price_aud > 0 ? parseFloat(card.price_aud) : (card.price_usd ? parseFloat(card.price_usd) * usdToAud : null);
  const priceAudFoil = card.price_usd_foil ? parseFloat(card.price_usd_foil) * usdToAud : null;
  const priceUsd     = card.price_usd ? parseFloat(card.price_usd) : null;

  // 7-day change from snapshots
  let sevenDayChange = null;
  let sparklinePoints = [];
  if (snapshots && snapshots.length >= 2) {
    sparklinePoints = snapshots.slice(-7).map(s => parseFloat(s.price_aud || 0)).filter(v => v > 0);
    if (sparklinePoints.length >= 2) {
      const first = sparklinePoints[0];
      const last  = sparklinePoints[sparklinePoints.length - 1];
      const pct   = ((last - first) / first) * 100;
      if (Math.abs(pct) >= 0.5) sevenDayChange = { pct: pct.toFixed(1), up: pct > 0 };
    }
  }

  const latestSnap = snapshots && snapshots.length ? snapshots[snapshots.length - 1] : null;

  let cheapest = null;
  if (cheapestPrinting && cheapestPrinting[0]) {
    const p = cheapestPrinting[0];
    const cp = p.price_aud > 0 ? parseFloat(p.price_aud) : (p.price_usd ? parseFloat(p.price_usd) * usdToAud : null);
    if (cp) cheapest = { slug: p.slug, setName: p.set_name, priceAud: cp };
  }

  try {
    const legalities = card.legalities
      ? (typeof card.legalities === 'string' ? JSON.parse(card.legalities) : card.legalities)
      : {};

    return {
      slug, game: 'mtg',
      name: card.name,
      image: card.image_uri_small || card.image_uri_normal || null,
      setName: card.set_name || null,
      rarity: card.rarity || null,
      priceAud, priceUsd, priceAudFoil,
      sevenDayChange,
      sparklinePoints,
      isSpiked: sevenDayChange && sevenDayChange.up && parseFloat(sevenDayChange.pct) >= 15,
      cheapestPrinting: cheapest,
      high52w: latestSnap?.price_52w_high_aud ? parseFloat(latestSnap.price_52w_high_aud) : null,
      low52w:  latestSnap?.price_52w_low_aud  ? parseFloat(latestSnap.price_52w_low_aud)  : null,
      legalities,
      edhrec_rank: card.edhrec_rank || null,
      cmc: card.cmc !== undefined && card.cmc !== null ? card.cmc : null,
      reserved: card.reserved || false,
      type_line: card.type_line || null,
      cardPath: `/cards/mtg/${slug}`,
      ...GAME_CONFIG.mtg
    };
  } catch { return null; }
}

async function fetchNonMTGCard(game, slug, usdToAud, cfg) {
  const priceCol = 'market_price';
  const imgCol   = 'image_url';
  const cards    = await supabaseGet(`${cfg.table}?slug=eq.${encodeURIComponent(slug)}&limit=1`);
  if (!cards || !cards[0]) return null;
  const card = cards[0];

  const rawPrice = card[priceCol] ? parseFloat(card[priceCol]) : null;
  const priceAud = rawPrice ? rawPrice * usdToAud : null;
  const priceUsd = rawPrice;

  // Cheapest printing for non-MTG
  let cheapest = null;
  try {
    const printings = await supabaseGet(`${cfg.table}?name=eq.${encodeURIComponent(card.name)}&slug=neq.${encodeURIComponent(slug)}&select=slug,set_name,${priceCol}&order=${priceCol}.asc.nullslast&limit=1`);
    if (printings && printings[0]) {
      const p = printings[0];
      const cp = p[priceCol] ? parseFloat(p[priceCol]) * usdToAud : null;
      if (cp) cheapest = { slug: p.slug, setName: p.set_name, priceAud: cp };
    }
  } catch {}

  return {
    slug, game,
    name: card.name,
    image: card[imgCol] || null,
    setName: card.set_name || null,
    rarity: card.rarity || null,
    priceAud, priceUsd,
    priceAudFoil: null,
    sevenDayChange: null,
    sparklinePoints: [],
    isSpiked: false,
    cheapestPrinting: cheapest,
    high52w: null, low52w: null,
    legalities: {},
    edhrec_rank: null,
    cmc: null,
    reserved: false,
    type_line: card.card_type || card.type || null,
    cardPath: `/cards/${game}/${slug}`,
    ...cfg
  };
}

function fmtAUD(n) {
  if (!n || n <= 0) return null;
  return 'AU$' + n.toFixed(2);
}

function fmtUSD(n) {
  if (!n || n <= 0) return null;
  return 'US$' + n.toFixed(2);
}

// SVG sparkline — 7 data points, 80x24 viewBox
function buildSparkline(points) {
  if (!points || points.length < 2) return '';
  const min  = Math.min(...points);
  const max  = Math.max(...points);
  const range = max - min || 1;
  const w    = 80, h = 24, pad = 2;
  const xs   = points.map((_, i) => pad + (i / (points.length - 1)) * (w - pad * 2));
  const ys   = points.map(v => h - pad - ((v - min) / range) * (h - pad * 2));
  const d    = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const trending = points[points.length - 1] >= points[0];
  const stroke   = trending ? '#4caf50' : '#f44336';
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block;overflow:visible"><path d="${d}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

const MTG_FORMATS = ['standard','pioneer','modern','legacy','vintage','commander'];

function renderSlots(cards, allTokens, usdToAud) {
  const slots = Array(5).fill(null).map((_, i) => cards[i] || null);

  return slots.map((card, i) => {
    if (!card) {
      return `<div class="slot slot-empty" id="slot-${i}" onclick="focusSearch()">
        <div class="slot-plus">+</div>
        <div class="slot-empty-text">Add a card</div>
      </div>`;
    }

    const aud     = card.priceAud ? fmtAUD(card.priceAud) : 'N/A';
    const usd     = card.priceUsd ? fmtUSD(card.priceUsd) : null;
    const token   = `${card.game}:${card.slug}`;
    const removeTokens = allTokens.filter(t => t !== token).join(',');
    const removeUrl    = removeTokens.length ? `/compare?cards=${removeTokens}` : '/compare';
    const spark        = buildSparkline(card.sparklinePoints);
    const trendArrow   = card.sevenDayChange
      ? `<span class="trend ${card.sevenDayChange.up ? 'trend-up' : 'trend-down'}">${card.sevenDayChange.up ? '▲' : '▼'} ${Math.abs(card.sevenDayChange.pct)}%</span>`
      : '';

    const ebayUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(card.name + ' ' + card.label)}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;

    return `<div class="slot slot-filled" id="slot-${i}" style="--game-color:${card.color}">
      <a href="${removeUrl}" class="slot-remove" title="Remove card" onclick="gtag('event','compare_card_removed',{game:'${card.game}',card:'${card.name.replace(/'/g,"\\'")}'})" aria-label="Remove ${card.name}">×</a>
      ${card.isSpiked ? '<div class="spike-badge" title="Price up 15%+ this week">📈 Spiked</div>' : ''}
      <div class="slot-img-wrap">
        ${card.image ? `<img src="${card.image}" alt="${card.name}" loading="lazy" class="slot-img">` : `<div class="slot-img-placeholder">🃏</div>`}
      </div>
      <div class="slot-game-badge" style="background:${card.color}22;color:${card.color};border-color:${card.color}55">${card.label}</div>
      <div class="slot-name"><a href="${card.cardPath}">${card.name}</a></div>
      ${card.setName ? `<div class="slot-set">${card.setName}</div>` : ''}
      <div class="slot-price aud-val" data-aud="${card.priceAud || 0}" data-usd="${card.priceUsd || 0}">${aud}</div>
      ${usd ? `<div class="slot-price-usd usd-val" style="display:none">${usd}</div>` : ''}
      ${trendArrow}
      ${spark ? `<div class="slot-sparkline" title="7-day price trend">${spark}</div>` : ''}
      ${card.cheapestPrinting ? `<div class="slot-cheapest">Cheapest: <strong>${fmtAUD(card.cheapestPrinting.priceAud)}</strong> · ${card.cheapestPrinting.setName || ''}</div>` : ''}
      <a href="${ebayUrl}" target="_blank" rel="noopener" class="slot-buy-btn" onclick="gtag('event','compare_ebay_clicked',{game:'${card.game}',card:'${card.name.replace(/'/g,"\\'")}',position:${i}})">Buy on eBay AU →</a>
      <button class="slot-versions-btn" onclick="loadVersions('${card.game}','${card.name.replace(/'/g,"\\'")}',${i})" aria-label="View other versions of ${card.name}">⇄ Other versions</button>
      <div class="slot-versions-panel" id="versions-${i}" style="display:none"></div>
    </div>`;
  }).join('');
}

function renderCompareTable(cards) {
  if (cards.length < 2) return '';

  function winnerIdx(vals, lowerBetter = false) {
    const valid = vals.map((v, i) => ({ v, i })).filter(x => x.v !== null && x.v !== undefined && x.v > 0);
    if (valid.length < 2) return -1;
    const best = lowerBetter ? Math.min(...valid.map(x => x.v)) : Math.max(...valid.map(x => x.v));
    const winners = valid.filter(x => x.v === best);
    return winners.length === 1 ? winners[0].i : -1;
  }

  const priceWin = winnerIdx(cards.map(c => c.priceAud), true);
  const foilWin  = winnerIdx(cards.map(c => c.priceAudFoil), true);
  const edhWin   = winnerIdx(cards.map(c => c.edhrec_rank), true);
  const cmcWin   = winnerIdx(cards.map(c => c.cmc !== null ? c.cmc : null), true);

  const winCounts = cards.map((_, i) =>
    [priceWin, foilWin, edhWin, cmcWin].filter(w => w === i).length
  );
  const maxWins   = Math.max(...winCounts);

  function cell(i, winIdx, content) {
    const isWin = winIdx === i;
    return `<td class="tbl-val${isWin ? ' tbl-win' : ''}">${content}${isWin ? '<span class="win-star" title="Best in category">★</span>' : ''}</td>`;
  }

  const hasFoil      = cards.some(c => c.priceAudFoil);
  const hasEdh       = cards.some(c => c.edhrec_rank);
  const hasCmc       = cards.some(c => c.cmc !== null);
  const hasReserved  = cards.some(c => c.reserved);
  const hasMtg       = cards.some(c => c.game === 'mtg');

  const rarityRow = `<tr><th class="tbl-label">Rarity</th>${cards.map(c =>
    `<td class="tbl-val"><span class="rarity-pill rarity-${c.rarity || 'common'}">${c.rarity ? c.rarity.charAt(0).toUpperCase() + c.rarity.slice(1) : '—'}</span></td>`
  ).join('')}</tr>`;

  const priceRow = `<tr><th class="tbl-label">Price (AUD)</th>${cards.map((c, i) =>
    cell(i, priceWin, `<span class="tbl-price aud-val" data-aud="${c.priceAud || 0}" data-usd="${c.priceUsd || 0}">${fmtAUD(c.priceAud) || 'N/A'}</span>`)
  ).join('')}</tr>`;

  const foilRow = hasFoil ? `<tr><th class="tbl-label">Foil Price (AUD)</th>${cards.map((c, i) =>
    cell(i, foilWin, `<span class="tbl-price aud-val" data-aud="${c.priceAudFoil || 0}" data-usd="${c.priceAudFoil ? (c.priceAudFoil / 1.58).toFixed(2) : 0}">${fmtAUD(c.priceAudFoil) || '—'}</span>`)
  ).join('')}</tr>` : '';

  const rangeRow = `<tr><th class="tbl-label">52W Range</th>${cards.map(c => {
    if (!c.high52w && !c.low52w) return `<td class="tbl-val tbl-dim">—</td>`;
    return `<td class="tbl-val"><span class="range-high">${fmtAUD(c.high52w) || '—'}</span><span class="range-sep"> / </span><span class="range-low">${fmtAUD(c.low52w) || '—'}</span></td>`;
  }).join('')}</tr>`;

  const cheapRow = `<tr><th class="tbl-label">Cheapest Printing</th>${cards.map(c => {
    if (!c.cheapestPrinting) return `<td class="tbl-val tbl-dim">This is cheapest</td>`;
    const ebayUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(c.name + ' ' + c.cheapestPrinting.setName + ' ' + c.label)}&_sacat=183454&campid=${EPN_CAMPID}&mkevt=1`;
    return `<td class="tbl-val"><div class="cheapest-wrap"><span class="cheapest-price">${fmtAUD(c.cheapestPrinting.priceAud)}</span><span class="cheapest-set">${c.cheapestPrinting.setName || ''}</span><a href="${ebayUrl}" target="_blank" rel="noopener" class="cheapest-link">Buy cheapest →</a></div></td>`;
  }).join('')}</tr>`;

  const trendRow = `<tr><th class="tbl-label">7D Trend</th>${cards.map(c => {
    if (!c.sevenDayChange) return `<td class="tbl-val tbl-dim">—</td>`;
    return `<td class="tbl-val"><span class="trend ${c.sevenDayChange.up ? 'trend-up' : 'trend-down'}">${c.sevenDayChange.up ? '▲' : '▼'} ${Math.abs(c.sevenDayChange.pct)}%</span></td>`;
  }).join('')}</tr>`;

  const edhRow = hasEdh ? `<tr><th class="tbl-label">EDHREC Rank</th>${cards.map((c, i) =>
    cell(i, edhWin, c.edhrec_rank ? `<span class="tbl-edh">#${c.edhrec_rank.toLocaleString()}</span>` : '<span class="tbl-dim">N/A</span>')
  ).join('')}</tr>` : '';

  const cmcRow = hasCmc ? `<tr><th class="tbl-label">Mana Value</th>${cards.map((c, i) =>
    cell(i, cmcWin, c.cmc !== null ? c.cmc : '<span class="tbl-dim">—</span>')
  ).join('')}</tr>` : '';

  const reservedRow = hasReserved ? `<tr><th class="tbl-label">Reserved List</th>${cards.map(c =>
    `<td class="tbl-val">${c.reserved ? '<span class="reserve-badge">🔒 Yes</span>' : '—'}</td>`
  ).join('')}</tr>` : '';

  const legalityRows = hasMtg ? MTG_FORMATS.map(fmt => `
    <tr>
      <th class="tbl-label tbl-format">${fmt.charAt(0).toUpperCase() + fmt.slice(1)}</th>
      ${cards.map(c => {
        if (c.game !== 'mtg') return `<td class="tbl-val tbl-dim">—</td>`;
        const status = c.legalities[fmt] || 'not_legal';
        return `<td class="tbl-val"><span class="pip pip-${status === 'legal' ? 'legal' : status === 'banned' ? 'banned' : 'no'}">${status === 'legal' ? '✓' : status === 'banned' ? 'Banned' : '–'}</span></td>`;
      }).join('')}
    </tr>`).join('') : '';

  const bestValueRow = `<tr class="tbl-best-row"><th class="tbl-label">C3 Best Value</th>${cards.map((c, i) => {
    const isWinner = winCounts[i] === maxWins && maxWins > 0;
    return `<td class="tbl-val">${isWinner ? '<span class="best-value-badge">👑 Best Value</span>' : `<span class="tbl-dim">${winCounts[i]} categories</span>`}</td>`;
  }).join('')}</tr>`;

  const colCount = cards.length + 1;

  return `<div class="tbl-wrap">
    <table class="compare-tbl" style="grid-template-columns:160px ${Array(cards.length).fill('1fr').join(' ')}">
      <thead>
        <tr>
          <th class="tbl-label tbl-label-head"></th>
          ${cards.map(c => `<th class="tbl-card-head" style="--game-color:${c.color}">
            <a href="${c.cardPath}" style="color:inherit">${c.name}</a>
            <span class="tbl-game-badge" style="background:${c.color}22;color:${c.color}">${c.label}</span>
          </th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rarityRow}${priceRow}${foilRow}${rangeRow}${trendRow}${cheapRow}
        ${edhRow}${cmcRow}${reservedRow}
        ${legalityRows ? `<tr><td colspan="${colCount}" class="tbl-section-head">Format Legality (MTG)</td></tr>${legalityRows}` : ''}
        ${bestValueRow}
      </tbody>
    </table>
  </div>`;
}

function renderEmptyState() {
  const suggestions = [
    { label: 'Lightning Bolt vs Sol Ring', tokens: 'mtg:lightning-bolt,mtg:sol-ring', desc: 'Most played MTG cards ever' },
    { label: 'Rhystic Study vs Mana Crypt', tokens: 'mtg:rhystic-study,mtg:mana-crypt', desc: 'Commander staple showdown' },
    { label: 'Counterspell vs Black Lotus', tokens: 'mtg:counterspell,mtg:black-lotus', desc: 'Cheap vs the most valuable card in history' },
    { label: 'Sol Ring vs Command Tower', tokens: 'mtg:sol-ring,mtg:command-tower', desc: 'Best Commander staples compared' },
    { label: 'Rhystic Study vs Counterspell', tokens: 'mtg:rhystic-study,mtg:counterspell', desc: 'Draw vs counter — which is worth more?' },
  ];

  const suggestionsHTML = suggestions.map((s, i) =>
    `<a href="/compare?cards=${s.tokens}" class="suggestion-card" style="animation-delay:${i * 0.07}s" onclick="gtag('event','compare_suggestion_clicked',{label:'${s.label.replace(/'/g, "\\'")}'})">`+
    `<div class="suggestion-label">${s.label}</div>`+
    `<div class="suggestion-desc">${s.desc}</div>`+
    `</a>`
  ).join('');

  return `<div class="empty-state">
    <div class="empty-icon">⚖️</div>
    <h2>Compare Cards Across All 8 TCGs</h2>
    <p>Use the search bar above to find up to 5 cards from any game. Compare AUD prices, trends, formats, and find the best deal on eBay AU.</p>
    <div class="suggestions-label">Popular comparisons to try</div>
    <div class="suggestions-grid">${suggestionsHTML}</div>
    <div class="market-teaser">
      <span>📊 See what's moving across all TCGs this week</span>
      <a href="/market" class="market-link" onclick="gtag('event','compare_market_link_clicked',{from:'empty_state'})">C3 Market →</a>
    </div>
  </div>`;
}

function renderPage({ cards, allTokens, usdToAud }) {
  const hasCards   = cards.length > 0;
  const cardNames  = cards.map(c => c.name);
  const pageTitle  = hasCards
    ? cardNames.join(' vs ') + ' | C3 Card Compare'
    : 'C3 Card Compare | All 8 TCGs | Cards on Cards on Cards';
  const pageDesc   = hasCards
    ? `Compare ${cardNames.join(', ')} — AUD prices, trends, format legality and best value. Updated daily.`
    : 'Compare TCG card prices across MTG, Pokemon, Yu-Gi-Oh, Lorcana, One Piece, Dragon Ball, Star Wars and Riftbound. AUD pricing, updated daily.';
  const shareUrl   = `https://cardsoncardsoncards.com.au/compare${allTokens.length ? '?cards=' + allTokens.join(',') : ''}`;

  const gameChips = Object.entries(GAME_CONFIG).map(([g, cfg]) =>
    `<button class="game-chip" data-game="${g}" style="--gc:${cfg.color}" onclick="setGameFilter('${g}')">${cfg.label}</button>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${pageTitle}</title>
  <meta name="description" content="${pageDesc}">
  <link rel="canonical" href="${shareUrl}">
  <meta property="og:title" content="${pageTitle}">
  <meta property="og:description" content="${pageDesc}">
  <meta property="og:image" content="https://cardsoncardsoncards.com.au/c3ogbanner.png">
  <meta property="og:url" content="${shareUrl}">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-WR68HPE92S');</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root{
      --bg:#0A0C14;--bg2:#111422;--bg3:#181d2e;--bg4:#1e2338;
      --accent:#C9A84C;--purple:#7c6af5;
      --text:#F0F2FF;--text2:#A0A8C0;--text3:#5a6280;
      --border:#252840;--radius:12px;
      --green:#4caf50;--red:#f44336;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6;overflow-x:hidden}
    a{color:var(--accent);text-decoration:none}
    a:hover{text-decoration:underline}
    button{font-family:'DM Sans',sans-serif;cursor:pointer}

    /* NAV */
    nav{background:rgba(10,12,20,.97);backdrop-filter:blur(18px);border-bottom:1px solid var(--border);padding:12px 0;position:sticky;top:0;z-index:200}
    .nav-inner{display:flex;align-items:center;justify-content:space-between;max-width:1300px;margin:0 auto;padding:0 24px;gap:12px}
    .nav-logo{display:flex;align-items:center;gap:9px;font-family:'Cinzel',serif;font-size:11.5px;font-weight:700;letter-spacing:.12em;color:var(--accent);text-decoration:none;text-transform:uppercase;white-space:nowrap;flex-shrink:0}
    .nav-logo img{height:32px;width:32px;border-radius:6px;object-fit:cover}
    .nav-links{display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
    .nav-link{display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid var(--border);color:var(--text2);white-space:nowrap;transition:all .2s}
    .nav-link:hover{color:var(--text);border-color:var(--text2)}
    .nav-link--active{color:var(--accent);border-color:rgba(201,168,76,.4);background:rgba(201,168,76,.06)}

    /* PAGE HEADER */
    .page-header{max-width:1300px;margin:32px auto 0;padding:0 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px}
    .page-title{font-family:'Cinzel',serif;font-size:clamp(22px,4vw,32px);color:var(--accent)}
    .page-subtitle{font-size:13px;color:var(--text2);margin-top:4px}

    /* CURRENCY TOGGLE */
    .currency-toggle{display:flex;align-items:center;gap:0;border:1px solid var(--border);border-radius:8px;overflow:hidden;flex-shrink:0}
    .currency-btn{padding:7px 16px;font-size:12px;font-weight:700;border:none;background:var(--bg3);color:var(--text2);transition:all .18s;letter-spacing:.05em}
    .currency-btn.active{background:var(--accent);color:#000}
    .currency-btn:hover:not(.active){background:var(--bg4);color:var(--text)}

    /* TOOLBAR (search + game chips) */
    .toolbar{max-width:1300px;margin:20px auto 0;padding:0 24px;display:flex;flex-direction:column;gap:12px}
    .search-row{display:flex;gap:10px;align-items:center}
    .search-wrap{position:relative;flex:1;max-width:480px}
    .search-input{width:100%;background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:11px 16px;border-radius:10px;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color .18s}
    .search-input:focus{border-color:var(--accent)}
    .search-results{position:absolute;top:calc(100% + 6px);left:0;right:0;background:var(--bg2);border:1px solid var(--border);border-radius:10px;z-index:300;max-height:380px;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,.6)}
    .result-item{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .12s}
    .result-item:last-child{border-bottom:none}
    .result-item:hover,.result-item:focus{background:var(--bg3);outline:none}
    .result-img{width:32px;border-radius:4px;flex-shrink:0;object-fit:contain}
    .result-name{font-size:13px;font-weight:600;color:var(--text)}
    .result-meta{font-size:11px;color:var(--text2)}
    .result-price{font-size:12px;color:var(--accent);font-weight:700;margin-left:auto;white-space:nowrap}
    .result-badge{font-size:10px;padding:1px 5px;border-radius:3px;font-weight:700;margin-left:4px}
    .result-added{color:var(--text3);font-size:11px}
    .game-chips{display:flex;gap:6px;flex-wrap:wrap}
    .game-chip{padding:5px 12px;border-radius:100px;font-size:11px;font-weight:700;border:1px solid color-mix(in srgb, var(--gc) 40%, transparent);background:color-mix(in srgb, var(--gc) 10%, transparent);color:var(--gc);transition:all .18s;letter-spacing:.03em}
    .game-chip:hover,.game-chip.active{background:var(--gc);color:#000}

    /* SLOTS */
    .slots-section{max-width:1300px;margin:24px auto 0;padding:0 24px}
    .slots-row{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
    @media(max-width:900px){.slots-row{grid-template-columns:repeat(3,1fr)}}
    @media(max-width:560px){.slots-row{grid-template-columns:repeat(2,1fr)}}
    .slot{border-radius:var(--radius);border:2px dashed var(--border);min-height:220px;display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px;position:relative;transition:all .22s}
    .slot-empty{cursor:pointer;justify-content:center}
    .slot-empty:hover{border-color:var(--accent);background:rgba(201,168,76,.04)}
    .slot-filled{border-style:solid;border-color:var(--game-color,var(--border));background:var(--bg2)}
    .slot-plus{font-size:28px;color:var(--text3)}
    .slot-empty-text{font-size:12px;color:var(--text3);text-align:center}
    .slot-remove{position:absolute;top:8px;right:10px;font-size:18px;color:var(--text3);line-height:1;transition:color .15s;text-decoration:none}
    .slot-remove:hover{color:var(--red);text-decoration:none}
    .spike-badge{font-size:10px;font-weight:700;background:rgba(245,166,35,.15);border:1px solid rgba(245,166,35,.4);color:#f5a623;padding:2px 7px;border-radius:4px;align-self:flex-start}
    .slot-img-wrap{width:100%;text-align:center;flex-shrink:0}
    .slot-img{width:100%;max-width:90px;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.4)}
    .slot-img-placeholder{font-size:36px;padding:12px 0}
    .slot-game-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;border:1px solid}
    .slot-name{font-size:12px;font-weight:600;color:var(--text);text-align:center;line-height:1.3}
    .slot-name a{color:var(--text)}
    .slot-set{font-size:10px;color:var(--text3);text-align:center}
    .slot-price{font-family:'Cinzel',serif;font-size:16px;font-weight:700;color:var(--accent)}
    .slot-price-usd{font-size:11px;color:var(--text2)}
    .trend{font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px}
    .trend-up{background:rgba(76,175,80,.15);color:#81c784}
    .trend-down{background:rgba(244,67,54,.15);color:#e57373}
    .slot-sparkline{opacity:.8}
    .slot-cheapest{font-size:10px;color:var(--text2);text-align:center;line-height:1.4}
    .slot-cheapest strong{color:#81c784}
    .slot-buy-btn{display:block;width:100%;background:var(--game-color,var(--accent));color:#000;font-weight:700;font-size:11px;padding:8px;border-radius:7px;text-align:center;text-decoration:none;transition:opacity .18s;white-space:nowrap}
    .slot-buy-btn:hover{opacity:.85;text-decoration:none}
    .slot-versions-btn{background:none;border:1px solid var(--border);color:var(--text2);font-size:10px;padding:4px 10px;border-radius:6px;width:100%;transition:all .18s}
    .slot-versions-btn:hover{border-color:var(--text2);color:var(--text)}
    .slot-versions-panel{width:100%;font-size:10px;max-height:140px;overflow-y:auto}
    .version-item{display:flex;justify-content:space-between;align-items:center;padding:4px 6px;border-radius:4px;cursor:pointer;gap:6px}
    .version-item:hover{background:var(--bg3)}
    .version-set{color:var(--text2);flex:1;text-align:left}
    .version-price{color:var(--accent);font-weight:700;white-space:nowrap}
    .version-select{color:var(--purple);font-size:9px;white-space:nowrap}

    /* COMPARISON TABLE */
    .tbl-section{max-width:1300px;margin:32px auto 0;padding:0 24px}
    .tbl-section-title{font-family:'Cinzel',serif;font-size:16px;color:var(--text);margin-bottom:16px;display:flex;align-items:center;gap:10px}
    .tbl-wrap{overflow-x:auto;border-radius:var(--radius);border:1px solid var(--border)}
    .compare-tbl{width:100%;border-collapse:collapse;font-family:'DM Sans',sans-serif;font-size:13px}
    .compare-tbl th,.compare-tbl td{padding:12px 14px;border-bottom:1px solid var(--border);border-right:1px solid var(--border)}
    .compare-tbl tr:last-child th,.compare-tbl tr:last-child td{border-bottom:none}
    .compare-tbl th:last-child,.compare-tbl td:last-child{border-right:none}
    .tbl-label{background:var(--bg2);color:var(--text2);font-size:11px;text-transform:uppercase;letter-spacing:.07em;font-weight:600;white-space:nowrap;text-align:left;min-width:140px}
    .tbl-format{font-size:10px}
    .tbl-label-head{background:var(--bg3)}
    .tbl-card-head{background:var(--bg3);text-align:center;font-weight:700;color:var(--text);font-size:13px}
    .tbl-game-badge{display:block;font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;margin:3px auto 0;width:fit-content}
    .tbl-val{background:var(--bg2);text-align:center;color:var(--text)}
    .tbl-win{background:rgba(201,168,76,.06)!important}
    .win-star{color:var(--accent);font-size:11px;margin-left:4px}
    .tbl-dim{color:var(--text3)}
    .tbl-price{font-weight:700}
    .tbl-edh{font-weight:700}
    .tbl-section-head{background:var(--bg3);color:var(--text2);font-size:10px;text-transform:uppercase;letter-spacing:.1em;padding:6px 14px!important;font-weight:600;text-align:left}
    .tbl-best-row td,.tbl-best-row th{background:rgba(124,106,245,.05)!important;border-top:1px solid rgba(124,106,245,.2)}
    .rarity-pill{padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700}
    .rarity-mythic{background:#7a3a00;color:#ffcc88}
    .rarity-rare{background:#4a3a00;color:#ffd700}
    .rarity-uncommon{background:#1a2a3a;color:#aaccee}
    .rarity-common{background:#222;color:#aaa}
    .pip{font-size:13px;font-weight:700}
    .pip-legal{color:var(--green)}
    .pip-banned{color:var(--red);font-size:11px}
    .pip-no{color:var(--text3)}
    .range-high{color:#81c784;font-size:12px}
    .range-sep{color:var(--text3)}
    .range-low{color:#e57373;font-size:12px}
    .cheapest-wrap{display:flex;flex-direction:column;align-items:center;gap:2px}
    .cheapest-price{color:#81c784;font-weight:700;font-size:13px}
    .cheapest-set{font-size:10px;color:var(--text2)}
    .cheapest-link{font-size:10px;color:var(--green);font-weight:600}
    .reserve-badge{font-size:11px;color:#ffcccc}
    .best-value-badge{background:var(--purple);color:#fff;padding:3px 10px;border-radius:5px;font-size:11px;font-weight:700}

    /* SHARE BAR */
    .share-bar{max-width:1300px;margin:20px auto 0;padding:0 24px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .share-label{font-size:12px;color:var(--text2)}
    .share-btn{padding:7px 14px;border-radius:7px;font-size:12px;font-weight:600;border:none;cursor:pointer;transition:all .18s;white-space:nowrap}
    .share-copy{background:var(--bg3);border:1px solid var(--border);color:var(--text)}
    .share-copy:hover{border-color:var(--accent);color:var(--accent)}
    .share-discord{background:#5865F2;color:#fff}
    .share-twitter{background:#000;color:#fff}
    .share-reddit{background:#FF4500;color:#fff}

    /* MARKET TEASER */
    .market-teaser{max-width:1300px;margin:32px auto 0;padding:0 24px 48px}
    .market-teaser-inner{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:20px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .market-teaser-text{font-size:13px;color:var(--text2)}
    .market-teaser-text strong{color:var(--text)}
    .market-link-btn{display:inline-flex;align-items:center;gap:6px;background:rgba(124,106,245,.12);border:1px solid rgba(124,106,245,.35);color:#a78bfa;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;transition:all .18s}
    .market-link-btn:hover{background:rgba(124,106,245,.22);text-decoration:none}

    /* EMPTY STATE */
    .empty-state{max-width:680px;margin:48px auto;padding:0 24px;text-align:center}
    .empty-icon{font-size:52px;margin-bottom:16px}
    .empty-state h2{font-family:'Cinzel',serif;font-size:24px;color:var(--accent);margin-bottom:12px}
    .empty-state p{color:var(--text2);font-size:15px;margin-bottom:24px}
    .empty-search-wrap{position:relative;margin-bottom:16px}
    .suggestions-label{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);margin:24px 0 12px}
    .suggestions-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;text-align:left;margin-bottom:24px}
    .suggestion-card{display:block;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;transition:all .18s;animation:fadeUp .3s both;text-decoration:none}
    .suggestion-card:hover{border-color:var(--accent);background:rgba(201,168,76,.05);text-decoration:none}
    .suggestion-label{font-size:13px;font-weight:600;color:var(--text);margin-bottom:3px}
    .suggestion-desc{font-size:11px;color:var(--text2)}
    .market-teaser{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;font-size:13px;color:var(--text2);padding-bottom:0}
    .market-link{color:var(--purple);font-weight:700}

    @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

    footer{background:var(--bg2);border-top:1px solid var(--border);padding:28px 24px;text-align:center;color:var(--text2);font-size:12px;margin-top:48px}
    footer a{color:var(--text2);margin:0 10px}
    footer a:hover{color:var(--text)}

    @media(max-width:640px){
      .page-header{flex-direction:column;align-items:flex-start}
      .share-bar{gap:6px}
      .market-teaser-inner{flex-direction:column;text-align:center}
    }
  </style>
</head>
<body>

<nav>
  <div class="nav-inner">
    <a href="/" class="nav-logo">
      <img src="/c3logo.png" alt="C3 Logo">
      <span>Cards on Cards on Cards</span>
    </a>
    <div class="nav-links">
      <a href="/" class="nav-link">Home</a>
      <a href="/cards/mtg" class="nav-link">MTG</a>
      <a href="/cards/pokemon" class="nav-link">Pokemon</a>
      <a href="/compare" class="nav-link nav-link--active">Compare</a>
      <a href="/market" class="nav-link">Market</a>
      <a href="/tracker.html" class="nav-link">Tracker</a>
      <a href="/shop.html" class="nav-link">Shop</a>
      <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=C3Nav&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="nav-link">eBay</a>
    </div>
  </div>
</nav>

<div class="page-header">
  <div>
    <h1 class="page-title">⚖️ C3 Card Compare</h1>
    <p class="page-subtitle">Compare up to 5 cards across all 8 TCGs. AUD prices, updated daily. Live rate: 1 USD = AU$${usdToAud.toFixed(4)}</p>
  </div>
  <div class="currency-toggle" role="group" aria-label="Currency selector">
    <button class="currency-btn active" id="btn-aud" onclick="setCurrency('aud')" aria-pressed="true">AUD</button>
    <button class="currency-btn" id="btn-usd" onclick="setCurrency('usd')" aria-pressed="false">USD</button>
  </div>
</div>

<div class="toolbar">
  <div class="search-row">
    <div class="search-wrap">
      <input type="text" id="main-search" class="search-input" placeholder="${hasCards ? 'Add another card...' : 'Search any card from any TCG...'}" autocomplete="off" aria-label="Search for a card to compare" ${hasCards && cards.length >= 5 ? 'disabled placeholder="Maximum 5 cards reached"' : ''}>
      <div id="search-results" class="search-results" style="display:none" role="listbox" aria-label="Search results"></div>
    </div>
    ${hasCards ? `<a href="/compare" class="nav-link" style="white-space:nowrap;font-size:12px">Reset ×</a>` : ''}
  </div>
  <div class="game-chips" id="game-chips">${gameChips}</div>
</div>

${hasCards ? `
<div class="slots-section">
  <div class="slots-row">${renderSlots(cards, allTokens, usdToAud)}</div>
</div>

<div class="share-bar">
  <span class="share-label">Share:</span>
  <button class="share-btn share-copy" id="share-copy-btn" onclick="copyShareUrl()">Copy Link</button>
  <button class="share-btn share-discord" onclick="copyDiscordShare()">Discord</button>
  <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(cardNames.join(' vs ') + ' — price compare on C3 ' + shareUrl)}" target="_blank" rel="noopener" class="share-btn share-twitter">𝕏 Twitter</a>
  <a href="https://reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(cardNames.join(' vs ') + ' — TCG price compare Australia')}" target="_blank" rel="noopener" class="share-btn share-reddit">Reddit</a>
</div>

${cards.length >= 2 ? `
<div class="tbl-section">
  <div class="tbl-section-title">Side-by-Side Comparison</div>
  ${renderCompareTable(cards)}
</div>` : `<div style="max-width:1300px;margin:24px auto;padding:0 24px;font-size:13px;color:var(--text2)">Add at least 2 cards to see the comparison table.</div>`}

<div class="market-teaser">
  <div class="market-teaser-inner">
    <div class="market-teaser-text">
      <strong>📊 C3 Market</strong> — See which cards are gaining and losing value across all 8 TCGs this week.
    </div>
    <a href="/market" class="market-link-btn" onclick="gtag('event','compare_market_link_clicked',{from:'compare_page',card_count:${cards.length}})">View C3 Market →</a>
  </div>
</div>
` : renderEmptyState()}

<footer>
  <p>
    <a href="/">Home</a><a href="/compare">Compare</a><a href="/market">Market</a>
    <a href="/tracker.html">Tracker</a><a href="/blog">Blog</a><a href="/contact.html">Contact</a>
  </p>
  <p style="margin-top:8px">Prices in AUD converted at live rates. Card data via tcgapi.dev and Scryfall. Not financial advice.</p>
  <p style="margin-top:6px">© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
</footer>

<script>
// State
const USD_TO_AUD = ${usdToAud.toFixed(4)};
const CURRENT_TOKENS = ${JSON.stringify(allTokens)};
const CURRENT_CARDS  = ${JSON.stringify(cards.length)};
let currentCurrency  = 'aud';
let activeGameFilter = null;
let searchTimeout;
let searchIndex = -1;

// Currency toggle
function setCurrency(cur) {
  currentCurrency = cur;
  document.getElementById('btn-aud').classList.toggle('active', cur === 'aud');
  document.getElementById('btn-usd').classList.toggle('active', cur === 'usd');
  document.getElementById('btn-aud').setAttribute('aria-pressed', cur === 'aud');
  document.getElementById('btn-usd').setAttribute('aria-pressed', cur === 'usd');

  // Update all price elements
  document.querySelectorAll('.aud-val').forEach(el => {
    const aud = parseFloat(el.dataset.aud || 0);
    const usd = parseFloat(el.dataset.usd || 0);
    if (cur === 'usd' && usd > 0) {
      el.textContent = 'US$' + usd.toFixed(2);
    } else if (aud > 0) {
      el.textContent = 'AU$' + aud.toFixed(2);
    }
  });
  document.querySelectorAll('.usd-val').forEach(el => {
    el.style.display = cur === 'usd' ? 'none' : '';
  });
  gtag('event', 'compare_currency_toggled', { currency: cur });
}

// Game filter chips
function setGameFilter(game) {
  const chips = document.querySelectorAll('.game-chip');
  if (activeGameFilter === game) {
    activeGameFilter = null;
    chips.forEach(c => c.classList.remove('active'));
  } else {
    activeGameFilter = game;
    chips.forEach(c => c.classList.toggle('active', c.dataset.game === game));
  }
  const input = document.getElementById('main-search');
  if (input && input.value.length >= 2) handleSearch(input.value);
  gtag('event', 'compare_game_filter', { game: activeGameFilter || 'all' });
}

// Search
function handleSearch(val) {
  clearTimeout(searchTimeout);
  const el = document.getElementById('search-results');
  if (!val || val.length < 2) { if(el) el.style.display = 'none'; return; }
  searchTimeout = setTimeout(async () => {
    try {
      const game = activeGameFilter ? '&game=' + activeGameFilter : '';
      const res  = await fetch('/api/compare-search?q=' + encodeURIComponent(val) + '&limit=10' + game);
      const data = await res.json();
      renderResults(data);
    } catch {}
  }, 260);
}

function handleSearchKey(e) {
  const el = document.getElementById('search-results');
  const items = el ? el.querySelectorAll('.result-item') : [];
  if (e.key === 'ArrowDown') { searchIndex = Math.min(searchIndex + 1, items.length - 1); items[searchIndex]?.focus(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { searchIndex = Math.max(searchIndex - 1, -1); if(searchIndex >= 0) items[searchIndex]?.focus(); else document.getElementById('main-search')?.focus(); e.preventDefault(); }
  else if (e.key === 'Escape') { if(el) el.style.display = 'none'; searchIndex = -1; }
}

function renderResults(items) {
  const el = document.getElementById('search-results');
  if (!el) return;
  if (!items || !items.length) {
    el.innerHTML = '<div style="padding:12px 16px;font-size:13px;color:var(--text2)">No cards found</div>';
    el.style.display = '';
    return;
  }
  el.style.display = '';
  el.innerHTML = items.slice(0, 10).map(card => {
    const token     = card.game + ':' + card.slug;
    const inCompare = CURRENT_TOKENS.includes(token) || CURRENT_TOKENS.includes(card.slug);
    const full      = CURRENT_CARDS >= 5;
    return '<div class="result-item" tabindex="0" role="option" aria-selected="false"' +
      (inCompare || full ? '' : ' onclick="addCard(\'' + card.game + '\',\'' + card.slug + '\')" onkeydown="if(event.key===\'Enter\')addCard(\'' + card.game + '\',\'' + card.slug + '\')"') + '>' +
      (card.image ? '<img class="result-img" src="' + card.image + '" alt="' + card.name + '" loading="lazy">' : '') +
      '<div><div class="result-name">' + card.name +
        '<span class="result-badge" style="background:' + card.gameColor + '22;color:' + card.gameColor + '">' + card.gameLabel + '</span>' +
        (inCompare ? '<span class="result-added"> (added)</span>' : '') +
        (full && !inCompare ? '<span class="result-added"> (slots full)</span>' : '') +
      '</div>' +
      (card.setName ? '<div class="result-meta">' + card.setName + '</div>' : '') +
      '</div>' +
      '<div class="result-price">' + (card.priceDisplay || 'N/A') + '</div>' +
      '</div>';
  }).join('');
}

function addCard(game, slug) {
  if (CURRENT_CARDS >= 5) return;
  const token     = game + ':' + slug;
  const newTokens = [...CURRENT_TOKENS.filter(t => t !== token), token];
  gtag('event', 'compare_card_added', { game, position: newTokens.length });
  window.location.href = '/compare?cards=' + newTokens.join(',');
}

function focusSearch() {
  const el = document.getElementById('main-search');
  if (el && !el.disabled) el.focus();
}

// Version picker
async function loadVersions(game, name, slotIdx) {
  const panel = document.getElementById('versions-' + slotIdx);
  if (!panel) return;
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
  panel.innerHTML = '<div style="padding:6px;color:var(--text2);font-size:10px">Loading...</div>';
  panel.style.display = '';
  try {
    const res  = await fetch('/api/compare-search?q=' + encodeURIComponent(name) + '&game=' + game + '&printings=1&limit=20');
    const data = await res.json();
    if (!data || !data.length) { panel.innerHTML = '<div style="padding:6px;color:var(--text2);font-size:10px">No other versions found</div>'; return; }
    panel.innerHTML = data.map(v =>
      '<div class="version-item" onclick="switchVersion(\'' + game + '\',\'' + v.slug + '\',' + slotIdx + ')" tabindex="0" onkeydown="if(event.key===\'Enter\')switchVersion(\'' + game + '\',\'' + v.slug + '\',' + slotIdx + ')">' +
      '<span class="version-set">' + (v.setName || '—') + '</span>' +
      '<span class="version-price">' + (v.priceDisplay || 'N/A') + '</span>' +
      '<span class="version-select">Select →</span>' +
      '</div>'
    ).join('');
  } catch { panel.innerHTML = '<div style="padding:6px;color:var(--text2);font-size:10px">Error loading versions</div>'; }
}

function switchVersion(game, newSlug, slotIdx) {
  // Replace the token at the slot position
  const currentToken = CURRENT_TOKENS[slotIdx];
  const newToken     = game + ':' + newSlug;
  const newTokens    = CURRENT_TOKENS.map((t, i) => i === slotIdx ? newToken : t);
  gtag('event', 'compare_version_switched', { game, position: slotIdx });
  window.location.href = '/compare?cards=' + newTokens.join(',');
}

// Share functions
function copyShareUrl() {
  navigator.clipboard.writeText(window.location.href).then(() => {
    const btn = document.getElementById('share-copy-btn');
    if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => btn.textContent = 'Copy Link', 2000); }
  });
  gtag('event', 'compare_share_clicked', { method: 'copy', card_count: CURRENT_CARDS });
}

function copyDiscordShare() {
  const names  = document.querySelectorAll('.slot-name a');
  const prices = document.querySelectorAll('.slot-price');
  const parts  = [];
  names.forEach((el, i) => {
    const price = prices[i] ? prices[i].textContent.trim() : '';
    parts.push(el.textContent.trim() + (price ? ' (' + price + ')' : ''));
  });
  const text = parts.join(' vs ') + '\n' + window.location.href;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.share-discord');
    if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => btn.textContent = 'Discord', 2000); }
  });
  gtag('event', 'compare_share_clicked', { method: 'discord', card_count: CURRENT_CARDS });
}

// Wire search input events after script loads (avoids "not defined" errors)
const mainSearch = document.getElementById('main-search');
if (mainSearch) {
  mainSearch.addEventListener('input', e => handleSearch(e.target.value));
  mainSearch.addEventListener('keydown', e => handleSearchKey(e));
}

// Close search on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap') && !e.target.closest('.empty-search-wrap')) {
    const el = document.getElementById('search-results');
    if (el) el.style.display = 'none';
    searchIndex = -1;
  }
});

// GA4 page load event
const _games = [...new Set(CURRENT_TOKENS.map(t => t.split(':')[0]))];
gtag('event', 'compare_page_load', {
  card_count: CURRENT_CARDS,
  games: _games.join(','),
  is_cross_tcg: _games.length > 1
});
</script>
</body>
</html>`;
}

// Parse token: "mtg:slug" or legacy "slug" (assumes MTG)
function parseToken(token) {
  if (token.includes(':')) {
    const idx  = token.indexOf(':');
    const game = token.slice(0, idx);
    const slug = token.slice(idx + 1);
    return { game, slug };
  }
  return { game: 'mtg', slug: token };
}

export default async (req) => {
  const url        = new URL(req.url);
  const cardsParam = url.searchParams.get('cards') || '';
  const rawTokens  = cardsParam ? cardsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5) : [];

  // Fetch live exchange rate and cards in parallel
  const [usdToAud, ...cardResults] = await Promise.all([
    getLiveRate(),
    ...rawTokens.map(token => {
      const { game, slug } = parseToken(token);
      return fetchCard(game, slug, 1.58); // use fallback rate for initial fetch, live rate for display
    })
  ]);

  // Now re-compute prices with live rate (fetchCard already used 1.58 fallback, recalculate)
  const cards = cardResults
    .filter(c => c !== null)
    .map(c => {
      // MTG: priceAud comes directly from price_aud column (already AUD) — do not recalculate
      // Non-MTG: priceAud was computed as market_price * 1.58 fallback — update to live rate
      if (c.game === 'mtg') return c;
      if (!c.priceUsd) return c;
      return {
        ...c,
        priceAud:     c.priceUsd ? parseFloat((c.priceUsd * usdToAud).toFixed(2)) : c.priceAud,
        priceAudFoil: c.priceAudFoil ? parseFloat((c.priceAudFoil / 1.58 * usdToAud).toFixed(2)) : null,
      };
    });

  // Rebuild tokens from successfully fetched cards (preserving order)
  const allTokens = cards.map(c => `${c.game}:${c.slug}`);

  const html = renderPage({ cards, allTokens, usdToAud });

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=900',
      'X-Robots-Tag': 'index, follow'
    }
  });
};

export const config = { path: '/compare' };
