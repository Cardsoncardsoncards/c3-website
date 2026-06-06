// netlify/functions/card-compare.mjs
// C3 Card Compare — v2 rebuild May 2026
// Features: verdict banner, stat strips, radar chart, game-aware legality,
// colour identity pips, Reserve List badge, combine cost, recent history (localStorage),
// slot customid eBay tracking, game chip active + placeholder feedback,
// 150ms CSS transitions, String.fromCharCode(10) safe newlines,
// buy/sell view toggle, pricing source picker (global + per-slot),
// help tooltips on/off toggle, price info tooltips, data source labels,
// sparkline timeframe label, ban status tooltips, CK buylist pricing

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

const MTG_FORMATS = ['standard','pioneer','modern','legacy','vintage','commander'];

async function supabaseGet(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    clearTimeout(timer);
    return [];
  }
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

async function fetchMTGCard(slug, usdToAud) {
  const cards = await supabaseGet(`mtg_cards?slug=eq.${encodeURIComponent(slug)}&order=price_aud.desc.nullslast&limit=1`);
  if (!cards || !cards[0]) return null;
  const card = cards[0];

  const [snapshots, cheapestPrinting] = await Promise.all([
    supabaseGet(`mtg_price_snapshots?scryfall_id=eq.${card.scryfall_id}&order=snapshot_date.asc&limit=14&select=snapshot_date,price_aud,price_usd,price_buy_ck_aud,price_buy_ck_usd`).catch(() => []),
    supabaseGet(`mtg_cards?name=eq.${encodeURIComponent(card.name)}&slug=neq.${encodeURIComponent(slug)}&select=slug,set_name,price_aud,price_usd&order=price_aud.asc.nullslast&limit=1`).catch(() => [])
  ]);

  const priceAud     = card.price_aud > 0 ? parseFloat(card.price_aud) : (card.price_usd ? parseFloat(card.price_usd) * usdToAud : null);
  const priceAudFoil = card.price_usd_foil ? parseFloat(card.price_usd_foil) * usdToAud : null;
  const priceUsd     = card.price_usd ? parseFloat(card.price_usd) : null;

  let sevenDayChange = null;
  let sparklinePoints = [];
  if (snapshots && snapshots.length >= 2) {
    sparklinePoints = snapshots.map(s => parseFloat(s.price_aud || 0)).filter(v => v > 0);
    if (sparklinePoints.length >= 2) {
      const first = sparklinePoints[0];
      const last  = sparklinePoints[sparklinePoints.length - 1];
      const pct   = ((last - first) / first) * 100;
      if (Math.abs(pct) >= 0.5) sevenDayChange = { pct: pct.toFixed(1), up: pct > 0 };
    }
  }

  // Buy signal from snapshots: price below 7d average = buyer-friendly
  let buySignal = null;
  if (snapshots && snapshots.length >= 3 && priceAud) {
    const recent = snapshots.slice(-7).map(s => parseFloat(s.price_aud || 0)).filter(v => v > 0);
    if (recent.length >= 2) {
      const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const pctVsAvg = ((priceAud - avg) / avg) * 100;
      if (pctVsAvg <= -3) buySignal = 'below-avg';
      else if (pctVsAvg >= 5) buySignal = 'above-avg';
    }
  }

  let cheapest = null;
  if (cheapestPrinting && cheapestPrinting[0]) {
    const p  = cheapestPrinting[0];
    const cp = p.price_aud > 0 ? parseFloat(p.price_aud) : (p.price_usd ? parseFloat(p.price_usd) * usdToAud : null);
    if (cp) cheapest = { slug: p.slug, setName: p.set_name, priceAud: cp };
  }

  try {
    const legalities    = card.legalities ? (typeof card.legalities === 'string' ? JSON.parse(card.legalities) : card.legalities) : {};
    const colorIdentity = card.color_identity || [];
    const keywords      = card.keywords || [];

    // CK buylist — latest snapshot value
    const latestCKSnap = snapshots && snapshots.length ? snapshots[snapshots.length - 1] : null;
    const ckBuylistAud = latestCKSnap && latestCKSnap.price_buy_ck_aud ? parseFloat(latestCKSnap.price_buy_ck_aud) : null;
    const ckBuylistUsd = latestCKSnap && latestCKSnap.price_buy_ck_usd ? parseFloat(latestCKSnap.price_buy_ck_usd) : null;
    const snapshotDate = latestCKSnap && latestCKSnap.snapshot_date ? latestCKSnap.snapshot_date : null;

    return {
      slug, game: 'mtg',
      name:         card.name,
      image:        card.image_uri_small || card.image_uri_normal || null,
      setName:      card.set_name || null,
      rarity:       card.rarity || null,
      priceAud, priceUsd, priceAudFoil,
      ckBuylistAud, ckBuylistUsd,
      snapshotDate,
      priceSource:  'Scryfall / TCGPlayer',
      priceType:    'buy',
      sevenDayChange,
      sparklinePoints,
      isSpiked: sevenDayChange && sevenDayChange.up && parseFloat(sevenDayChange.pct) >= 15,
      buySignal,
      cheapestPrinting: cheapest,
      high52w:      null,
      low52w:       null,
      legalities,
      edhrec_rank:  card.edhrec_rank || null,
      cmc:          card.cmc !== undefined && card.cmc !== null ? card.cmc : null,
      reserved:     card.reserved || false,
      type_line:    card.type_line || null,
      oracle_text:  card.oracle_text || null,
      flavor_text:  card.flavor_text || null,
      color_identity: colorIdentity,
      keywords,
      power:        card.power || null,
      toughness:    card.toughness || null,
      cardPath:     `/cards/mtg/${slug}`,
      ...GAME_CONFIG.mtg
    };
  } catch { return null; }
}

async function fetchNonMTGCard(game, slug, usdToAud, cfg) {
  const cards = await supabaseGet(`${cfg.table}?slug=eq.${encodeURIComponent(slug)}&limit=1`);
  if (!cards || !cards[0]) return null;
  const card = cards[0];

  const rawPrice = card.market_price ? parseFloat(card.market_price) : null;
  const priceAud = rawPrice ? rawPrice * usdToAud : null;
  const priceUsd = rawPrice;

  // Snapshots for non-MTG
  const snapshotTable = `${game}_price_snapshots`;
  const cardIdField   = game === 'pokemon' ? 'card_id' : 'card_id';
  let sparklinePoints = [];
  let sevenDayChange  = null;
  let buySignal       = null;
  try {
    const snaps = await supabaseGet(`${snapshotTable}?card_id=eq.${card.id}&order=snapshot_date.asc&limit=14`);
    if (snaps && snaps.length >= 2) {
      sparklinePoints = snaps.map(s => parseFloat(s.price_aud || s.price_usd * usdToAud || 0)).filter(v => v > 0);
      if (sparklinePoints.length >= 2) {
        const first = sparklinePoints[0];
        const last  = sparklinePoints[sparklinePoints.length - 1];
        const pct   = ((last - first) / first) * 100;
        if (Math.abs(pct) >= 0.5) sevenDayChange = { pct: pct.toFixed(1), up: pct > 0 };
      }
    }
  } catch {}

  let cheapest = null;
  try {
    const printings = await supabaseGet(`${cfg.table}?name=eq.${encodeURIComponent(card.name)}&slug=neq.${encodeURIComponent(slug)}&select=slug,set_name,market_price&order=market_price.asc.nullslast&limit=1`);
    if (printings && printings[0]) {
      const p  = printings[0];
      const cp = p.market_price ? parseFloat(p.market_price) * usdToAud : null;
      if (cp) cheapest = { slug: p.slug, setName: p.set_name, priceAud: cp };
    }
  } catch {}

  return {
    slug, game,
    name:           card.name,
    image:          card.image_url || null,
    setName:        card.set_name || null,
    rarity:         card.rarity || null,
    priceAud, priceUsd,
    priceAudFoil:   null,
    ckBuylistAud:   null,
    ckBuylistUsd:   null,
    snapshotDate:   card.last_price_update || null,
    priceSource:    'TCGapi',
    priceType:      'buy',
    sevenDayChange,
    sparklinePoints,
    isSpiked:       sevenDayChange && sevenDayChange.up && parseFloat(sevenDayChange?.pct || 0) >= 15,
    buySignal,
    cheapestPrinting: cheapest,
    high52w: null, low52w: null,
    legalities:     {},
    edhrec_rank:    null,
    cmc:            null,
    reserved:       false,
    type_line:      card.card_type || card.type || null,
    oracle_text:    null,
    flavor_text:    null,
    color_identity: [],
    keywords:       [],
    power: null, toughness: null,
    cardPath:       `/cards/${game}/${slug}`,
    ...cfg
  };
}

async function fetchCard(game, slug, usdToAud) {
  const cfg = GAME_CONFIG[game];
  if (!cfg) return null;
  if (game === 'mtg') return fetchMTGCard(slug, usdToAud);
  return fetchNonMTGCard(game, slug, usdToAud, cfg);
}

function fmtAUD(n) { if (!n || n <= 0) return null; return 'AU$' + n.toFixed(2); }
function fmtUSD(n) { if (!n || n <= 0) return null; return 'US$' + n.toFixed(2); }

function buildSparkline(points, w=80, h=24) {
  if (!points || points.length < 2) return '';
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1, pad = 2;
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (w - pad * 2));
  const ys = points.map(v => h - pad - ((v - min) / range) * (h - pad * 2));
  const d  = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const stroke = points[points.length - 1] >= points[0] ? '#4caf50' : '#f44336';
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block;overflow:visible"><path d="${d}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// Radar chart: 3 axes (Price, Trend, Rarity), applies to all games
function buildRadar(cards) {
  if (!cards || cards.length < 1) return '';
  const W = 200, CX = 100, CY = 100, R = 70;
  const AXES = ['Price','Trend','Rarity'];
  const N = AXES.length;

  function score(card) {
    const pScore = card.priceAud
      ? Math.max(1, Math.min(10, 10 - Math.log10(Math.max(card.priceAud, 1)) * 2.5))
      : 5;
    const tPct = card.sevenDayChange ? parseFloat(card.sevenDayChange.pct) : 0;
    const tScore = Math.min(10, Math.max(1, 5 + tPct * 0.3));
    const rarityMap = { common: 3, uncommon: 5, rare: 7, mythic: 9, legendary: 8, secret: 10 };
    const rScore = rarityMap[card.rarity?.toLowerCase()] || 5;
    return [pScore, tScore, rScore];
  }

  const colors = ['#C9A84C','#7c6af5','#4caf50','#EF4444','#3B82F6'];
  const bgLines = [];
  // Grid rings
  for (let r = 2; r <= 10; r += 2) {
    const pts = AXES.map((_, i) => {
      const a = (Math.PI * 2 * i / N) - Math.PI / 2;
      return `${(CX + Math.cos(a) * R * r / 10).toFixed(1)},${(CY + Math.sin(a) * R * r / 10).toFixed(1)}`;
    });
    bgLines.push(`<polygon points="${pts.join(' ')}" fill="none" stroke="#252840" stroke-width="0.5"/>`);
  }
  // Axis lines
  const axisLines = AXES.map((_, i) => {
    const a = (Math.PI * 2 * i / N) - Math.PI / 2;
    return `<line x1="${CX}" y1="${CY}" x2="${(CX + Math.cos(a) * R).toFixed(1)}" y2="${(CY + Math.sin(a) * R).toFixed(1)}" stroke="#252840" stroke-width="0.5"/>`;
  }).join('');
  // Axis labels
  const axisLabels = AXES.map((label, i) => {
    const a = (Math.PI * 2 * i / N) - Math.PI / 2;
    const lx = (CX + Math.cos(a) * (R + 16)).toFixed(1);
    const ly = (CY + Math.sin(a) * (R + 16)).toFixed(1);
    return `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" fill="#A0A8C0" font-size="7" font-family="DM Sans,sans-serif">${label}</text>`;
  }).join('');
  // Card polygons
  const polygons = cards.map((card, ci) => {
    const scores = score(card);
    const pts = scores.map((s, i) => {
      const a = (Math.PI * 2 * i / N) - Math.PI / 2;
      return `${(CX + Math.cos(a) * R * s / 10).toFixed(1)},${(CY + Math.sin(a) * R * s / 10).toFixed(1)}`;
    });
    const col = colors[ci] || '#888';
    return `<polygon points="${pts.join(' ')}" fill="${col}" fill-opacity="0.15" stroke="${col}" stroke-width="1.5"/>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${W}" width="${W}" height="${W}" style="display:block;margin:0 auto">${bgLines.join('')}${axisLines}${axisLabels}${polygons}</svg>`;
}

// Compute verdict: who wins overall
function computeVerdict(cards) {
  if (!cards || cards.length < 2) return null;
  const scores = cards.map(() => 0);
  // Price: lower wins
  const prices = cards.map(c => c.priceAud);
  const validPrices = prices.filter(p => p);
  if (validPrices.length > 1) {
    const minP = Math.min(...validPrices);
    prices.forEach((p, i) => { if (p === minP) scores[i] += 1; });
  }
  // EDHREC: lower rank wins
  const edh = cards.map(c => c.edhrec_rank);
  const validEdh = edh.filter(e => e);
  if (validEdh.length > 1) {
    const minE = Math.min(...validEdh);
    edh.forEach((e, i) => { if (e === minE) scores[i] += 2; });
  }
  // Formats legal
  cards.forEach((c, i) => {
    const fmts = c.game === 'mtg'
      ? Object.values(c.legalities || {}).filter(v => v === 'legal').length
      : 3;
    scores[i] += fmts * 0.3;
  });
  // Trend bonus
  cards.forEach((c, i) => {
    if (c.sevenDayChange && c.sevenDayChange.up) scores[i] += 0.5;
  });

  const maxScore = Math.max(...scores);
  const winnerIdx = scores.indexOf(maxScore);
  const winner = cards[winnerIdx];
  const loser  = cards.find((_, i) => i !== winnerIdx);

  // Build verdict sentence
  const reasons = [];
  if (winner.edhrec_rank && (!loser || !loser.edhrec_rank || winner.edhrec_rank < loser.edhrec_rank)) {
    reasons.push(`#${winner.edhrec_rank.toLocaleString()} EDHREC rank`);
  }
  if (winner.priceAud && loser && loser.priceAud && winner.priceAud < loser.priceAud) {
    reasons.push(`${fmtAUD(winner.priceAud)} vs ${fmtAUD(loser.priceAud)}`);
  }
  if (winner.game === 'mtg') {
    const fmts = Object.values(winner.legalities || {}).filter(v => v === 'legal').length;
    if (fmts > 0) reasons.push(`legal in ${fmts} format${fmts > 1 ? 's' : ''}`);
  }
  if (winner.reserved) reasons.push('Reserve List — never reprinted');

  const sentence = reasons.length
    ? `${winner.name} leads overall — ${reasons.slice(0, 2).join(', ')}.`
    : `${winner.name} leads on combined metrics.`;

  const ebayUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(winner.name + ' ' + winner.label)}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=verdict&toolid=10001&mkevt=1`;

  return { winner, winnerIdx, sentence, ebayUrl };
}

// Colour identity pip HTML
function colorPips(colorIdentity) {
  if (!colorIdentity || !colorIdentity.length) return '<span style="color:#5a6280;font-size:10px">Colourless</span>';
  const colors = { W:'#f9fafb', U:'#60a5fa', B:'#9ca3af', R:'#f87171', G:'#4ade80' };
  const labels = { W:'W', U:'U', B:'B', R:'R', G:'G' };
  return colorIdentity.map(c => {
    const col = colors[c] || '#888';
    return `<span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:${col};color:#000;font-size:9px;font-weight:700;margin-right:2px">${labels[c] || c}</span>`;
  }).join('');
}

function renderSlots(cards, allTokens, usdToAud) {
  const FREE_SLOTS = 2;
  const slots = Array(5).fill(null).map((_, i) => cards[i] || null);
  return slots.map((card, i) => {
    if (!card) {
      if (i >= FREE_SLOTS) {
        return `<div class="slot slot-locked" id="slot-${i}">
          <div class="slot-plus">&#x1F512;</div>
          <div class="slot-add-label">Subscribers only</div>
          <a href="https://buy.stripe.com/eVq5kCfTodTg81y1YXaIM01" class="slot-subscribe-cta" target="_blank" rel="noopener">Subscribe AU$14.95/month</a>
        </div>`;
      }
      return `<div class="slot slot-empty" id="slot-${i}" data-action="focus-search">
        <div class="slot-plus">+</div>
        <div class="slot-add-label">Add a card</div>
      </div>`;
    }

    const aud      = card.priceAud ? fmtAUD(card.priceAud) : 'N/A';
    const usd      = card.priceUsd ? fmtUSD(card.priceUsd) : null;
    const token    = `${card.game}:${card.slug}`;
    const removeTokens = allTokens.filter(t => t !== token).join(',');
    const removeUrl    = removeTokens.length ? `/compare?cards=${removeTokens}` : '/compare?cards=';
    const spark        = buildSparkline(card.sparklinePoints);

    // eBay URL with slot-level customid for attribution
    const ebayUrl = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(card.name + ' ' + card.label)}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=slot${i}&toolid=10001&mkevt=1`;

    const trendHtml = card.sevenDayChange
      ? `<span class="trend ${card.sevenDayChange.up ? 'trend-up' : 'trend-down'}">${card.sevenDayChange.up ? '▲' : '▼'} ${Math.abs(card.sevenDayChange.pct)}%</span>`
      : '';

    // Buy signal with percentage
    let buySignalHtml = '';
    if (card.buySignal === 'below-avg') {
      const recentPrices = card.sparklinePoints.slice(-7);
      const avg = recentPrices.length ? recentPrices.reduce((a,b) => a+b, 0) / recentPrices.length : card.priceAud;
      const pct = avg && card.priceAud ? Math.abs(((card.priceAud - avg) / avg) * 100).toFixed(1) : null;
      buySignalHtml = '<div class="buy-signal-good">↓ ' + (pct ? pct + '% ' : '') + 'below 7-day average</div>';
    } else if (card.buySignal === 'above-avg') {
      const recentPrices = card.sparklinePoints.slice(-7);
      const avg = recentPrices.length ? recentPrices.reduce((a,b) => a+b, 0) / recentPrices.length : card.priceAud;
      const pct = avg && card.priceAud ? Math.abs(((card.priceAud - avg) / avg) * 100).toFixed(1) : null;
      buySignalHtml = '<div class="buy-signal-warn">↑ ' + (pct ? pct + '% ' : '') + 'above 7-day average</div>';
    }

    const cheapestHtml = card.cheapestPrinting
      ? `<div class="slot-cheapest">Cheaper: <strong>${fmtAUD(card.cheapestPrinting.priceAud)}</strong> · ${card.cheapestPrinting.setName || ''}</div>`
      : '';

    const reservedHtml = card.reserved
      ? '<div class="reserved-badge">🔒 Reserve List</div>'
      : '';

    const pipsHtml = card.game === 'mtg' && card.color_identity && card.color_identity.length
      ? `<div class="color-pips">${colorPips(card.color_identity)}</div>`
      : '';

    const typeHtml = card.type_line
      ? `<div class="slot-type">${card.type_line}</div>`
      : '';

    return `<div class="slot slot-filled" id="slot-${i}" style="--game-color:${card.color}">
      <a href="${removeUrl}" class="slot-remove" data-gtag-game="${card.game}" data-gtag-card="${card.name.replace(/"/g,'&quot;')}" aria-label="Remove ${card.name}">×</a>
      ${card.isSpiked ? '<div class="spike-badge">📈 Spiked</div>' : ''}
      <div class="slot-img-wrap">
        ${card.image ? `<img src="${card.image}" alt="${card.name}" loading="lazy" class="slot-img">` : '<div class="slot-img-placeholder">🃏</div>'}
      </div>
      <div class="slot-game-badge" style="background:${card.color}22;color:${card.color};border-color:${card.color}55">${card.label}</div>
      <div class="slot-name"><a href="${card.cardPath}">${card.name}</a></div>
      ${typeHtml}
      ${card.setName ? `<div class="slot-set">${card.setName}</div>` : ''}
      ${pipsHtml}
      <div class="slot-price aud-val" data-aud="${card.priceAud || 0}" data-usd="${card.priceUsd || 0}">${aud}</div>
      ${usd ? `<div class="slot-price-usd usd-val" style="display:none">${usd}</div>` : ''}
      ${trendHtml}
      ${spark ? `<div class="slot-sparkline"><div class="sparkline-label">14-day trend</div>${spark}</div>` : ''}
      ${buySignalHtml}
      ${cheapestHtml}
      ${reservedHtml}
      <div class="price-source-row">
        <span class="price-source-label" title="Market buy price from ${card.priceSource}. Updated: ${card.snapshotDate || 'daily'}. Converted to AUD at live rate.">${card.priceSource} · Buy price <span class="info-icon help-item">?</span></span>
        <select class="slot-source-picker" data-slot="${i}" aria-label="Pricing source for this card">
          <option value="market" selected>Market (buy)</option>
          ${card.ckBuylistAud ? '<option value="ck">Card Kingdom buylist (sell)</option>' : ''}
        </select>
      </div>
      ${card.ckBuylistAud ? `<div class="ck-buylist-row help-item" title="Card Kingdom is a major US TCG retailer. This is what they pay YOU for this card — a sell price.">Sell to Card Kingdom: <strong>${fmtAUD(card.ckBuylistAud)}</strong> <span class="info-icon">?</span></div>` : ''}
      <a href="${ebayUrl}" target="_blank" rel="noopener" class="slot-buy-btn" style="background:${card.color}" data-gtag-game="${card.game}" data-gtag-card="${card.name.replace(/"/g,'&quot;')}" data-gtag-pos="${i}">Buy on eBay AU →</a>
      <div class="ebay-disclaimer help-item">eBay AU prices may vary from listed price</div>
      <button class="slot-versions-btn" data-game="${card.game}" data-name="${card.name.replace(/"/g,'&quot;')}" data-slot="${i}" aria-label="View other versions">⇄ Other versions</button>
      <div class="slot-versions-panel" id="versions-${i}" style="display:none"></div>
    </div>`;
  }).join('');
}

function renderStatStrips(cards) {
  if (!cards || cards.length < 2) return '';
  const prices = cards.map(c => c.priceAud).filter(p => p);
  const totalCost = cards.reduce((s, c) => s + (c.priceAud || 0), 0);
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const gap = maxPrice - minPrice;

  const edhWinner = cards.reduce((best, c) => {
    if (!c.edhrec_rank) return best;
    if (!best || c.edhrec_rank < best.edhrec_rank) return c;
    return best;
  }, null);

  const mostFormats = cards.reduce((best, c) => {
    const fmts = c.game === 'mtg' ? Object.values(c.legalities || {}).filter(v => v === 'legal').length : 3;
    if (!best || fmts > best.fmts) return { card: c, fmts };
    return best;
  }, null);

  const hasFoil  = cards.find(c => c.priceAudFoil);
  const hasTrend = cards.find(c => c.sevenDayChange);

  const strips = [
    {
      label: 'Combined cost',
      val: fmtAUD(totalCost) || '—',
      sub: `${cards.length} card${cards.length > 1 ? 's' : ''} total`
    },
    {
      label: 'Price gap',
      val: gap > 0 ? fmtAUD(gap) : '—',
      sub: gap > 0 && minPrice > 0 ? `${(maxPrice/minPrice).toFixed(1)}× difference` : 'Same price'
    },
    edhWinner ? {
      label: 'EDHREC leader',
      val: `#${edhWinner.edhrec_rank.toLocaleString()}`,
      sub: edhWinner.name,
      accent: true
    } : {
      label: 'Most formats',
      val: mostFormats ? mostFormats.fmts.toString() : '—',
      sub: mostFormats ? mostFormats.card.name : ''
    },
    hasFoil ? {
      label: 'Cheapest foil',
      val: fmtAUD(hasFoil.priceAudFoil) || '—',
      sub: hasFoil.name
    } : hasTrend ? {
      label: '7D trend',
      val: `${hasTrend.sevenDayChange.up ? '▲' : '▼'} ${Math.abs(hasTrend.sevenDayChange.pct)}%`,
      sub: hasTrend.name,
      trending: true,
      up: hasTrend.sevenDayChange.up
    } : {
      label: 'Cards compared',
      val: cards.length.toString(),
      sub: 'across ' + [...new Set(cards.map(c => c.game))].length + ' game(s)'
    }
  ];

  return `<div class="stat-strips">
    ${strips.map(s => `<div class="stat-strip">
      <div class="stat-strip-label">${s.label}</div>
      <div class="stat-strip-val${s.accent ? ' stat-accent' : s.trending ? (s.up ? ' stat-up' : ' stat-down') : ''}">${s.val}</div>
      <div class="stat-strip-sub">${s.sub}</div>
    </div>`).join('')}
  </div>`;
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
  const maxWins = Math.max(...winCounts);

  function cell(i, winIdx, content) {
    const isWin = winIdx === i;
    return `<td class="tbl-val${isWin ? ' tbl-win' : ''}">${content}${isWin ? '<span class="win-star">★</span>' : ''}</td>`;
  }

  const hasFoil     = cards.some(c => c.priceAudFoil);
  const hasEdh      = cards.some(c => c.edhrec_rank);
  const hasCmc      = cards.some(c => c.cmc !== null);
  const hasReserved = cards.some(c => c.reserved);
  const hasMtg      = cards.some(c => c.game === 'mtg');
  const hasColors   = cards.some(c => c.color_identity && c.color_identity.length);
  const hasPT       = cards.some(c => c.power || c.toughness);
  const hasCK       = cards.some(c => c.ckBuylistAud);
  const colCount    = cards.length + 1;

  const rarityRow = `<tr><th class="tbl-label">Rarity</th>${cards.map(c =>
    `<td class="tbl-val"><span class="rarity-pill rarity-${c.rarity || 'common'}">${c.rarity ? c.rarity.charAt(0).toUpperCase() + c.rarity.slice(1) : '—'}</span></td>`
  ).join('')}</tr>`;

  const priceRow = `<tr><th class="tbl-label">Price (AUD)</th>${cards.map((c, i) =>
    cell(i, priceWin, `<span class="tbl-price aud-val" data-aud="${c.priceAud || 0}" data-usd="${c.priceUsd || 0}">${fmtAUD(c.priceAud) || 'N/A'}</span>`)
  ).join('')}</tr>`;

  const foilRow = hasFoil ? `<tr><th class="tbl-label">Foil (AUD)</th>${cards.map((c, i) =>
    cell(i, foilWin, `<span class="tbl-price aud-val" data-aud="${c.priceAudFoil || 0}" data-usd="${c.priceAudFoil ? (c.priceAudFoil / 1.58).toFixed(2) : 0}">${fmtAUD(c.priceAudFoil) || '—'}</span>`)
  ).join('')}</tr>` : '';

  const trendRow = `<tr><th class="tbl-label">7D Trend</th>${cards.map(c => {
    if (!c.sevenDayChange) return `<td class="tbl-val tbl-dim">—</td>`;
    return `<td class="tbl-val"><span class="trend ${c.sevenDayChange.up ? 'trend-up' : 'trend-down'}">${c.sevenDayChange.up ? '▲' : '▼'} ${Math.abs(c.sevenDayChange.pct)}%</span></td>`;
  }).join('')}</tr>`;

  const cheapRow = `<tr><th class="tbl-label">Cheapest Printing</th>${cards.map(c => {
    if (!c.cheapestPrinting) return `<td class="tbl-val tbl-dim">This is cheapest</td>`;
    const eu = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(c.name+' '+c.cheapestPrinting.setName+' '+c.label)}&_sacat=183454&campid=${EPN_CAMPID}&customid=cheapest&mkevt=1`;
    return `<td class="tbl-val"><div class="cheapest-wrap"><span class="cheapest-price">${fmtAUD(c.cheapestPrinting.priceAud)}</span><span class="cheapest-set">${c.cheapestPrinting.setName || ''}</span><a href="${eu}" target="_blank" rel="noopener" class="cheapest-link">Buy cheapest →</a></div></td>`;
  }).join('')}</tr>`;

  const ckRow = hasCK ? `<tr><th class="tbl-label">Sell to Card Kingdom <span class="info-icon help-item" title="Card Kingdom (CK) is a major US TCG retailer. This is what they pay YOU for this card — converted to AUD at live rate. Card Kingdom buylist prices are updated daily.">?</span></th>${cards.map(c =>
    c.ckBuylistAud ? `<td class="tbl-val"><span class="cheapest-price">${fmtAUD(c.ckBuylistAud)}</span><span style="font-size:10px;color:var(--text3);display:block">Sell price · cardkingdom.com</span></td>` : '<td class="tbl-val tbl-dim">Not available</td>'
  ).join('')}</tr>` : '';

  const edhRow = hasEdh ? `<tr><th class="tbl-label">Community Ranking <span class="info-icon help-item" title="EDHREC (Elder Dragon Highlander RECommendations) tracks how often a card appears in Commander decks worldwide. Lower number = more popular. #1 means the most-played card in Commander.">?</span></th>${cards.map((c, i) =>
    cell(i, edhWin, c.edhrec_rank ? `<span class="tbl-edh">#${c.edhrec_rank.toLocaleString()}</span>` : '<span class="tbl-dim">N/A</span>')
  ).join('')}</tr>` : '';

  const cmcRow = hasCmc ? `<tr><th class="tbl-label">Mana Cost</th>${cards.map((c, i) =>
    cell(i, cmcWin, c.cmc !== null ? c.cmc : '<span class="tbl-dim">—</span>')
  ).join('')}</tr>` : '';

  const ptRow = hasPT ? `<tr><th class="tbl-label">Power / Toughness</th>${cards.map(c =>
    `<td class="tbl-val">${c.power && c.toughness ? `${c.power} / ${c.toughness}` : '<span class="tbl-dim">—</span>'}</td>`
  ).join('')}</tr>` : '';

  const reservedRow = hasReserved ? `<tr><th class="tbl-label">Reserve List <span class="info-icon help-item" title="The Reserved List is a Wizards of the Coast policy guaranteeing certain older MTG cards will never be reprinted. This makes them scarcer over time, which supports long-term value.">?</span></th>${cards.map(c =>
    `<td class="tbl-val">${c.reserved ? '<span class="reserve-badge" title="This card is on the Reserved List — it will never be officially reprinted, making it increasingly scarce.">🔒 Never reprinted</span>' : '—'}</td>`
  ).join('')}</tr>` : '';

  const colorsRow = hasColors ? `<tr><th class="tbl-label">Colour Identity</th>${cards.map(c =>
    `<td class="tbl-val">${c.color_identity && c.color_identity.length ? colorPips(c.color_identity) : '<span class="tbl-dim">—</span>'}</td>`
  ).join('')}</tr>` : '';

  // Game-aware legality — only show formats relevant to games in the tray
  const mtgCards = cards.filter(c => c.game === 'mtg');
  const legalityRows = hasMtg ? MTG_FORMATS.map(fmt => `
    <tr>
      <th class="tbl-label tbl-format">${fmt.charAt(0).toUpperCase() + fmt.slice(1)}</th>
      ${cards.map(c => {
        if (c.game !== 'mtg') return `<td class="tbl-val" style="background:var(--bg3)"><span style="font-size:10px;color:var(--text3)">N/A</span></td>`;
        const status = c.legalities[fmt] || 'not_legal';
        const banTip = status === 'banned' ? ' title="Banned in ' + fmt.charAt(0).toUpperCase() + fmt.slice(1) + ' — this card is not legal to play in this format. It was banned due to power level concerns."' : '';
        return '<td class="tbl-val"><span class="pip pip-' + (status === 'legal' ? 'legal' : status === 'banned' ? 'banned' : 'no') + '"' + banTip + '>' + (status === 'legal' ? '✓' : status === 'banned' ? 'Banned ⚠' : '–') + '</span></td>';
      }).join('')}
    </tr>`).join('') : '';

  const bestValueRow = `<tr class="tbl-best-row"><th class="tbl-label">C3 Best Value</th>${cards.map((c, i) => {
    const isWinner = winCounts[i] === maxWins && maxWins > 0;
    return `<td class="tbl-val">${isWinner ? '<span class="best-value-badge">👑 Best Value</span>' : `<span class="tbl-dim">${winCounts[i]} categor${winCounts[i] === 1 ? 'y' : 'ies'}</span>`}</td>`;
  }).join('')}</tr>`;

  return `<div class="tbl-wrap">
    <table class="compare-tbl">
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
        ${rarityRow}${priceRow}${foilRow}${ckRow}${trendRow}${cheapRow}
        ${edhRow}${cmcRow}${ptRow}${colorsRow}${reservedRow}
        ${legalityRows && hasMtg ? `<tr><td colspan="${colCount}" class="tbl-section-head">Format Legality <span style="font-size:10px;font-weight:400;color:var(--text3)">(MTG only — N/A = not applicable to this game)</span></td></tr>${legalityRows}` : ''}
        ${bestValueRow}
      </tbody>
    </table>
  </div>`;
}

function renderEmptyState() {
  const suggestions = [
    { label: 'Lightning Bolt vs Sol Ring', tokens: 'mtg:lightning-bolt,mtg:sol-ring', desc: 'Most played MTG cards ever', prices: 'AU$2 vs AU$8' },
    { label: 'Rhystic Study vs Mana Crypt', tokens: 'mtg:rhystic-study,mtg:mana-crypt', desc: 'Commander staple showdown', prices: 'AU$17 vs AU$120' },
    { label: 'Black Lotus vs Sol Ring', tokens: 'mtg:black-lotus,mtg:sol-ring', desc: 'Most valuable vs most played', prices: 'AU$80K+ vs AU$8' },
    { label: 'Counterspell vs Force of Will', tokens: 'mtg:counterspell,mtg:force-of-will', desc: 'Counter spell value compare', prices: 'AU$1 vs AU$85' },
    { label: 'Command Tower vs Sol Ring', tokens: 'mtg:command-tower,mtg:sol-ring', desc: 'Best Commander staples', prices: 'AU$1 vs AU$8' },
  ];

  const suggestionsHTML = suggestions.map((s, i) =>
    `<a href="/compare?cards=${s.tokens}" class="suggestion-card" style="animation-delay:${i * 0.07}s" data-suggestion-label="${s.label.replace(/"/g,'&quot;')}">` +
    `<div class="suggestion-label">${s.label}</div>` +
    `<div class="suggestion-prices">${s.prices}</div>` +
    `<div class="suggestion-desc">${s.desc}</div>` +
    `</a>`
  ).join('');

  return `<div class="empty-state">
    <div class="empty-icon">⚖️</div>
    <h2>Compare Cards Across All 8 TCGs</h2>
    <p>Search above to compare up to 2 cards free. Subscribers unlock all 5 slots. See AUD prices, trends, format legality and who wins on value.</p>
    <div class="suggestions-label">See it in action — try a comparison</div>
    <div class="suggestions-grid">${suggestionsHTML}</div>
    <div id="recent-comparisons" style="margin-top:24px;display:none">
      <div class="suggestions-label">Your recent comparisons</div>
      <div id="recent-list" class="suggestions-grid"></div>
    </div>
  </div>`;
}

function renderPage({ cards, allTokens, usdToAud }) {
  const hasCards  = cards.length > 0;
  const cardNames = cards.map(c => c.name);
  const pageTitle = hasCards
    ? cardNames.join(' vs ') + ' | C3 Card Compare'
    : 'C3 Card Compare | All 8 TCGs | Cards on Cards on Cards';
  const pageDesc  = hasCards
    ? `Compare ${cardNames.join(', ')} — AUD prices, trends, format legality and best value. Updated daily.`
    : 'Compare TCG card prices across MTG, Pokemon, Yu-Gi-Oh, Lorcana, One Piece, Dragon Ball, Star Wars and Riftbound.';
  const shareUrl  = `https://cardsoncardsoncards.com.au/compare${allTokens.length ? '?cards=' + allTokens.join(',') : ''}`;

  const verdict     = computeVerdict(cards);
  const statStrips  = hasCards && cards.length >= 2 ? renderStatStrips(cards) : '';
  const radar       = hasCards && cards.length >= 1 ? buildRadar(cards) : '';

  const gameChips = Object.entries(GAME_CONFIG).map(([g, cfg]) =>
    `<button class="game-chip" data-game="${g}" style="--gc:${cfg.color}">${cfg.label}</button>`
  ).join('');

  const verdictHtml = verdict ? `
  <div class="verdict-banner">
    <div class="verdict-icon">👑</div>
    <div class="verdict-text">
      <strong>${verdict.winner.name} leads.</strong> ${verdict.sentence}
    </div>
    <a href="${verdict.ebayUrl}" target="_blank" rel="noopener" class="verdict-cta">Buy ${verdict.winner.name} on eBay →</a>
  </div>` : '';

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
    .nav-link{display:inline-flex;align-items:center;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border:1px solid var(--border);color:var(--text2);white-space:nowrap;transition:all .15s}
    .nav-link--vault{color:#C9A84C;border-color:rgba(201,168,76,.35)}.nav-link--vault:hover,.nav-link--vault.active{background:rgba(201,168,76,.1);border-color:#C9A84C;color:#E8C86A}
    .nav-link--compare{color:#A78BFA;border-color:rgba(167,139,250,.35)}.nav-link--compare:hover,.nav-link--compare.active{background:rgba(167,139,250,.1);border-color:#A78BFA;color:#C4B5FD}
    .nav-link--market{color:#4ADE80;border-color:rgba(74,222,128,.35)}.nav-link--market:hover,.nav-link--market.active{background:rgba(74,222,128,.1);border-color:#4ADE80;color:#86EFAC}
    .nav-link--tools{color:#FB923C;border-color:rgba(251,146,60,.35)}.nav-link--tools:hover,.nav-link--tools.active{background:rgba(251,146,60,.1);border-color:#FB923C;color:#FDBA74}
    .nav-link--play{color:#F472B6;border-color:rgba(244,114,182,.35)}.nav-link--play:hover,.nav-link--play.active{background:rgba(244,114,182,.1);border-color:#F472B6;color:#F9A8D4}
    .nav-link--blog{color:#7ECBA1;border-color:rgba(126,203,161,.35)}.nav-link--blog:hover,.nav-link--blog.active{background:rgba(126,203,161,.1);border-color:#7ECBA1;color:#A5DFC0}
    .nav-link--ebay{color:#60A5FA;border-color:rgba(96,165,250,.35);background:rgba(96,165,250,.05)}.nav-link--ebay:hover{background:rgba(96,165,250,.12);border-color:#60A5FA;color:#93C5FD}
    .nav-link:hover{color:var(--text);border-color:var(--text2)}
    .nav-link--active{color:var(--accent);border-color:rgba(201,168,76,.4);background:rgba(201,168,76,.06)}

    /* VERDICT BANNER */
    .verdict-banner{max-width:1300px;margin:20px auto 0;padding:0 24px;display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,rgba(124,106,245,.1),rgba(201,168,76,.05));border:1px solid rgba(124,106,245,.25);border-radius:var(--radius);padding:16px 20px;max-width:1300px;margin:20px auto 0}
    .verdict-icon{font-size:24px;flex-shrink:0}
    .verdict-text{font-size:13px;color:var(--text2);flex:1;line-height:1.5}
    .verdict-text strong{color:var(--text)}
    .verdict-cta{flex-shrink:0;background:var(--accent);color:#000;font-size:12px;font-weight:700;padding:8px 16px;border-radius:8px;white-space:nowrap;transition:opacity .15s}
    .verdict-cta:hover{opacity:.85;text-decoration:none}

    /* PAGE HEADER */
    .page-header{max-width:1300px;margin:28px auto 0;padding:0 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px}
    .page-title{font-family:'Cinzel',serif;font-size:clamp(22px,4vw,32px);color:var(--accent)}
    .page-subtitle{font-size:13px;color:var(--text2);margin-top:4px}

    /* CURRENCY TOGGLE */
    .currency-toggle{display:flex;border:1px solid var(--border);border-radius:8px;overflow:hidden;flex-shrink:0}
    .currency-btn{padding:7px 16px;font-size:12px;font-weight:700;border:none;background:var(--bg3);color:var(--text2);transition:all .15s;letter-spacing:.05em}
    .currency-btn.active{background:var(--accent);color:#000}
    .currency-btn:hover:not(.active){background:var(--bg4);color:var(--text)}

    /* TOOLBAR */
    .toolbar{max-width:1300px;margin:16px auto 0;padding:0 24px;display:flex;flex-direction:column;gap:10px}
    .search-row{display:flex;gap:10px;align-items:center}
    .search-wrap{position:relative;flex:1;max-width:480px}
    .search-input{width:100%;background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:11px 16px;border-radius:10px;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color .15s}
    .search-input:focus{border-color:var(--accent)}
    .search-input.game-filtered{border-color:var(--active-chip-color,var(--accent))}
    .search-results{position:absolute;top:calc(100%+6px);left:0;right:0;background:var(--bg2);border:1px solid var(--border);border-radius:10px;z-index:300;max-height:380px;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,.6)}
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
    .game-chip{padding:5px 12px;border-radius:100px;font-size:11px;font-weight:700;border:1px solid color-mix(in srgb, var(--gc) 40%, transparent);background:color-mix(in srgb, var(--gc) 10%, transparent);color:var(--gc);transition:all .15s;letter-spacing:.03em}
    .game-chip:hover,.game-chip.active{background:var(--gc);color:#000}

    /* SLOTS */
    .slots-section{max-width:1300px;margin:20px auto 0;padding:0 24px}
    .slots-row{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
    @media(max-width:900px){.slots-row{grid-template-columns:repeat(3,1fr)}}
    @media(max-width:560px){.slots-row{grid-template-columns:repeat(2,1fr)}}
    .slot{border-radius:var(--radius);border:2px dashed var(--border);min-height:240px;display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px;position:relative;transition:all .15s}
    .slot-empty{cursor:pointer;justify-content:center}
    .slot-empty:hover{border-color:var(--accent);background:rgba(201,168,76,.04)}
    .slot-filled{border-style:solid;border-color:var(--game-color,var(--border));background:var(--bg2)}
    .slot-plus{font-size:28px;color:var(--text3)}
    .slot-locked{pointer-events:none;opacity:0.6;cursor:default}.slot-locked a.slot-subscribe-cta{pointer-events:all;display:block;margin-top:8px;font-size:11px;color:var(--gold, #C9A84C);text-decoration:underline;text-align:center}
    .slot-add-label{font-size:12px;color:var(--text3);text-align:center}
    .slot-remove{position:absolute;top:8px;right:10px;font-size:18px;color:var(--text3);line-height:1;transition:color .15s;text-decoration:none}
    .slot-remove:hover{color:var(--red);text-decoration:none}
    .spike-badge{font-size:10px;font-weight:700;background:rgba(245,166,35,.15);border:1px solid rgba(245,166,35,.4);color:#f5a623;padding:2px 7px;border-radius:4px;align-self:flex-start}
    .slot-img-wrap{width:100%;text-align:center;flex-shrink:0}
    .slot-img{width:100%;max-width:90px;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.4);transition:transform .15s}
    .slot-img:hover{transform:scale(1.04)}
    .slot-img-placeholder{font-size:36px;padding:12px 0}
    .slot-game-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;border:1px solid}
    .slot-name{font-size:12px;font-weight:700;color:var(--text);text-align:center;line-height:1.3}
    .slot-name a{color:var(--text)}
    .slot-type{font-size:9px;color:var(--text3);text-align:center;line-height:1.3}
    .slot-set{font-size:10px;color:var(--text3);text-align:center}
    .slot-price{font-family:'Cinzel',serif;font-size:17px;font-weight:700;color:var(--accent);transition:all .15s}
    .slot-price-usd{font-size:11px;color:var(--text2)}
    .trend{font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px}
    .trend-up{background:rgba(76,175,80,.15);color:#81c784}
    .trend-down{background:rgba(244,67,54,.15);color:#e57373}
    .slot-sparkline{opacity:.8}
    .buy-signal-good{font-size:10px;color:#81c784;background:rgba(76,175,80,.1);padding:2px 7px;border-radius:4px;text-align:center}
    .buy-signal-warn{font-size:10px;color:#e57373;background:rgba(244,67,54,.1);padding:2px 7px;border-radius:4px;text-align:center}
    .slot-cheapest{font-size:10px;color:var(--text2);text-align:center;line-height:1.4}
    .slot-cheapest strong{color:#81c784}
    .reserved-badge{font-size:10px;color:#ffcccc;background:rgba(255,204,204,.1);border:1px solid rgba(255,204,204,.2);padding:2px 7px;border-radius:4px}
    .color-pips{display:flex;justify-content:center;gap:2px;flex-wrap:wrap}
    .slot-buy-btn{display:block;width:100%;color:#000;font-weight:700;font-size:11px;padding:8px;border-radius:7px;text-align:center;text-decoration:none;transition:opacity .15s;white-space:nowrap;margin-top:2px}
    .slot-buy-btn:hover{opacity:.82;text-decoration:none}
    .slot-versions-btn{background:none;border:1px solid var(--border);color:var(--text2);font-size:10px;padding:4px 10px;border-radius:6px;width:100%;transition:all .15s}
    .slot-versions-btn:hover{border-color:var(--text2);color:var(--text)}
    .slot-versions-panel{width:100%;font-size:10px;max-height:160px;overflow-y:auto}
    .version-item{display:flex;justify-content:space-between;align-items:center;padding:5px 6px;border-radius:4px;cursor:pointer;gap:6px;transition:background .1s}
    .version-item:hover{background:var(--bg3)}
    .version-set{color:var(--text2);flex:1;text-align:left}
    .version-price{color:var(--accent);font-weight:700;white-space:nowrap}
    .version-select{color:var(--purple);font-size:9px;white-space:nowrap}
    .version-swap{font-size:10px;color:var(--text2);font-weight:600;white-space:nowrap;cursor:pointer;padding:2px 6px;border-radius:3px;border:1px solid var(--border);background:transparent;margin-right:4px}
    .version-compare{font-size:10px;color:var(--purple);font-weight:600;white-space:nowrap;cursor:pointer;padding:2px 6px;border-radius:3px;border:1px solid rgba(124,106,245,.35);background:rgba(124,106,245,.08)}
    .version-swap:hover{background:var(--bg3);color:var(--text)}
    .version-compare:hover{background:rgba(124,106,245,.18)}

    /* STAT STRIPS */
    .stat-strips{max-width:1300px;margin:20px auto 0;padding:0 24px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
    @media(max-width:700px){.stat-strips{grid-template-columns:repeat(2,1fr)}}
    .stat-strip{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px 14px}
    .stat-strip-label{font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
    .stat-strip-val{font-size:16px;font-weight:700;color:var(--text)}
    .stat-accent{color:var(--accent)}
    .stat-up{color:#81c784}
    .stat-down{color:#e57373}
    .stat-strip-sub{font-size:10px;color:var(--text3);margin-top:2px}

    /* SHARE BAR */
    .share-bar{max-width:1300px;margin:16px auto 0;padding:0 24px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .share-label{font-size:12px;color:var(--text2)}
    .share-btn{padding:7px 14px;border-radius:7px;font-size:12px;font-weight:600;border:none;cursor:pointer;transition:opacity .15s;white-space:nowrap}
    .share-btn:hover{opacity:.85}
    .share-copy{background:var(--bg3);border:1px solid var(--border);color:var(--text)}
    .share-discord{background:#5865F2;color:#fff}
    .share-twitter{background:#000;color:#fff}
    .share-reddit{background:#FF4500;color:#fff}

    /* COMPARISON TABLE */
    .tbl-section{max-width:1300px;margin:28px auto 0;padding:0 24px}
    .tbl-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
    .tbl-section-title{font-size:16px;font-weight:600;color:var(--text)}
    .tbl-wrap{overflow-x:auto;border-radius:var(--radius);border:1px solid var(--border)}
    .compare-tbl{width:100%;border-collapse:collapse;font-family:'DM Sans',sans-serif;font-size:13px}
    .compare-tbl th,.compare-tbl td{padding:11px 14px;border-bottom:1px solid var(--border);border-right:1px solid var(--border)}
    .compare-tbl tr:last-child th,.compare-tbl tr:last-child td{border-bottom:none}
    .compare-tbl th:last-child,.compare-tbl td:last-child{border-right:none}
    .tbl-label{background:var(--bg2);color:var(--text2);font-size:11px;text-transform:uppercase;letter-spacing:.07em;font-weight:600;white-space:nowrap;text-align:left;min-width:140px}
    .tbl-format{font-size:10px}
    .tbl-label-head{background:var(--bg3)}
    .tbl-card-head{background:var(--bg3);text-align:center;font-weight:700;color:var(--text);font-size:13px}
    .tbl-game-badge{display:block;font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;margin:3px auto 0;width:fit-content}
    .tbl-val{background:var(--bg2);text-align:center;color:var(--text)}
    .tbl-win{background:rgba(201,168,76,.07)!important}
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
    .rarity-legendary,.rarity-secret{background:#3a1a5a;color:#d8b4fe}
    .pip{font-size:13px;font-weight:700}
    .pip-legal{color:var(--green)}
    .pip-banned{color:var(--red);font-size:11px;background:rgba(244,67,54,.1);padding:2px 6px;border-radius:3px}
    .pip-no{color:var(--text3)}
    .cheapest-wrap{display:flex;flex-direction:column;align-items:center;gap:2px}
    .cheapest-price{color:#81c784;font-weight:700;font-size:13px}
    .cheapest-set{font-size:10px;color:var(--text2)}
    .cheapest-link{font-size:10px;color:var(--green);font-weight:600}
    .reserve-badge{font-size:11px;color:#ffcccc}
    .best-value-badge{background:var(--purple);color:#fff;padding:3px 10px;border-radius:5px;font-size:11px;font-weight:700}

    /* RADAR */
    .radar-section{max-width:1300px;margin:28px auto 0;padding:0 24px}
    .radar-inner{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:20px 24px;display:flex;align-items:center;gap:28px;flex-wrap:wrap}
    .radar-chart{flex-shrink:0}
    .radar-legend{display:flex;flex-direction:column;gap:8px}
    .radar-legend-item{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text2)}
    .radar-swatch{width:12px;height:12px;border-radius:2px;flex-shrink:0}

    /* MARKET TEASER */
    .market-teaser{max-width:1300px;margin:28px auto 0;padding:0 24px 48px}
    .market-teaser-inner{background:var(--bg2);border:1px solid rgba(124,106,245,.2);border-radius:var(--radius);padding:20px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .market-teaser-text{font-size:13px;color:var(--text2)}
    .market-teaser-text strong{color:var(--text)}
    .market-link-btn{display:inline-flex;align-items:center;gap:6px;background:rgba(124,106,245,.12);border:1px solid rgba(124,106,245,.35);color:#a78bfa;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;transition:all .15s}
    .market-link-btn:hover{background:rgba(124,106,245,.22);text-decoration:none}

    /* EMPTY STATE */
    .empty-state{max-width:720px;margin:48px auto;padding:0 24px;text-align:center}
    .empty-icon{font-size:52px;margin-bottom:16px}
    .empty-state h2{font-family:'Cinzel',serif;font-size:24px;color:var(--accent);margin-bottom:12px}
    .empty-state p{color:var(--text2);font-size:15px;margin-bottom:24px}
    .suggestions-label{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);margin:24px 0 12px}
    .suggestions-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;text-align:left;margin-bottom:8px}
    .suggestion-card{display:block;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;transition:all .15s;animation:fadeUp .3s both;text-decoration:none}
    .suggestion-card:hover{border-color:var(--accent);background:rgba(201,168,76,.05);text-decoration:none}
    .suggestion-label{font-size:13px;font-weight:600;color:var(--text);margin-bottom:3px}
    .suggestion-prices{font-size:12px;color:var(--accent);font-weight:700;margin-bottom:2px}
    .suggestion-desc{font-size:11px;color:var(--text2)}

    @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

    footer{background:var(--bg2);border-top:1px solid var(--border);padding:28px 24px;text-align:center;color:var(--text2);font-size:12px;margin-top:48px}
    footer a{color:var(--text2);margin:0 10px}
    footer a:hover{color:var(--text)}

    /* PAGE CONTROLS */
    .page-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .view-toggle{display:flex;border:1px solid var(--border);border-radius:8px;overflow:hidden}
    .view-btn{padding:7px 12px;font-size:11px;font-weight:700;border:none;background:var(--bg3);color:var(--text2);transition:all .15s;letter-spacing:.04em;cursor:pointer}
    .view-btn.active{background:var(--green);color:#000}
    .view-btn.active.sell-active{background:#7c6af5;color:#fff}
    .help-toggle-btn{padding:7px 12px;font-size:11px;font-weight:700;border:1px solid var(--border);border-radius:8px;background:var(--bg3);color:var(--text2);transition:all .15s;cursor:pointer}
    .help-toggle-btn.active{border-color:rgba(201,168,76,.4);color:var(--accent);background:rgba(201,168,76,.06)}

    /* PAGE LABEL ROW */
    .page-label-row{max-width:1300px;margin:10px auto 0;padding:0 24px;display:flex;align-items:center;gap:18px;flex-wrap:wrap}
    .page-label-item{font-size:12px;color:var(--text2)}

    /* SELL VIEW */
    .sell-view .slot-buy-btn{display:none}
    .sell-view .ck-buylist-row{font-size:13px;font-weight:700;color:#81c784;background:rgba(76,175,80,.1);border:1px solid rgba(76,175,80,.2);border-radius:6px;padding:8px;text-align:center;width:100%}
    .sell-view .slot-price.aud-val[data-source="market"]{opacity:.5}
    .sell-view-banner{max-width:1300px;margin:12px auto 0;padding:0 24px}
    .sell-view-inner{background:rgba(124,106,245,.08);border:1px solid rgba(124,106,245,.25);border-radius:var(--radius);padding:10px 16px;font-size:12px;color:var(--text2);display:flex;align-items:center;gap:10px}
    .sell-view-inner strong{color:#a78bfa}

    /* HELP ITEMS — hidden when help is off */
    body.help-off .help-item{display:none!important}
    body.help-off .ebay-disclaimer{display:none!important}
    body.help-off .price-source-label .info-icon{display:none!important}

    /* PRICE SOURCE ROW */
    .price-source-row{width:100%;display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:4px}
    .price-source-label{font-size:10px;color:var(--text3);display:flex;align-items:center;gap:3px}
    .slot-source-picker{font-size:9px;background:var(--bg3);border:1px solid var(--border);color:var(--text2);border-radius:4px;padding:2px 4px;cursor:pointer;max-width:120px}
    .ck-buylist-row{font-size:11px;color:#81c784;width:100%;text-align:center;padding:3px 0;cursor:default}
    .ck-buylist-row strong{font-weight:700}
    .ebay-disclaimer{font-size:10px;color:var(--text3);text-align:center;width:100%}

    /* INFO ICON */
    .info-icon{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;border:1px solid var(--text3);color:var(--text3);font-size:9px;font-weight:700;cursor:help;flex-shrink:0;line-height:1}
    .info-icon:hover{border-color:var(--accent);color:var(--accent)}

    /* SPARKLINE LABEL */
    .slot-sparkline{width:100%}
    .sparkline-label{font-size:9px;color:var(--text3);text-align:center;margin-bottom:2px}

    @media(max-width:640px){
      .page-header{flex-direction:column;align-items:flex-start}
      .page-controls{justify-content:flex-start}
      .share-bar{gap:6px}
      .verdict-banner{flex-direction:column;align-items:flex-start}
      .market-teaser-inner{flex-direction:column;text-align:center}
      .page-label-row{gap:10px}
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
      <a href="/cards" class="nav-link nav-link--vault">Card Prices</a>
      <a href="/compare" class="nav-link nav-link--compare active">Compare</a>
      <a href="/market" class="nav-link nav-link--market">Market</a>
      <a href="/tools" class="nav-link nav-link--tools">Tools</a>
      <a href="/play" class="nav-link nav-link--play">Play</a>
      <a href="/blog" class="nav-link nav-link--blog">Blog</a>
      <a href="https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${EPN_CAMPID}&customid=C3Nav&toolid=10001&mkevt=1" target="_blank" rel="noopener" class="nav-link nav-link--ebay">Shop eBay &#8599;</a>
    </div>
  </div>
</nav>

<div class="page-header">
  <div>
    <h1 class="page-title">⚖️ C3 Card Compare</h1>
    <p class="page-subtitle">Compare up to 2 cards free across all 8 TCGs. AUD prices, updated daily. Live rate: 1 USD = AU$${usdToAud.toFixed(4)}</p>
  </div>
  <div class="page-controls">
    <div class="currency-toggle" role="group" aria-label="Currency selector">
      <button class="currency-btn active" id="btn-aud" onclick="setCurrency('aud')" aria-pressed="true">AUD</button>
      <button class="currency-btn" id="btn-usd" onclick="setCurrency('usd')" aria-pressed="false">USD</button>
    </div>
    <div class="view-toggle" role="group" aria-label="Price view selector" title="Switch between buy prices (what you pay) and sell prices (what you receive)">
      <button class="view-btn active" id="btn-buy">📈 Buying</button>
      <button class="view-btn" id="btn-sell">💰 Selling</button>
    </div>
    <button class="help-toggle-btn" id="help-toggle-btn" title="Show or hide explanatory tooltips and labels across the page" aria-pressed="true">❓ Help on</button>
  </div>
</div>

<div class="page-label-row">
  <span class="page-label-item">⚖️ Compare up to 2 cards free</span>
  <span class="page-label-item">💰 AUD prices updated daily</span>
  <span class="page-label-item">🌏 8 TCGs supported</span>
  <span class="page-label-item">📊 Buy &amp; sell pricing</span>
</div>

<div class="toolbar">
  <div class="search-row">
    <div class="search-wrap">
      <input type="text" id="main-search" class="search-input" placeholder="${hasCards ? 'Add another card...' : 'Search any card from any TCG...'}" autocomplete="off" aria-label="Search for a card to compare" ${hasCards && cards.length >= 5 ? 'disabled placeholder="Maximum 5 cards reached"' : ''}>
      <div id="search-results" class="search-results" style="display:none" role="listbox" aria-label="Search results"></div>
    </div>
    ${hasCards ? `<a href="/compare?cards=" class="nav-link" style="white-space:nowrap;font-size:12px">Reset ×</a>` : ''}
  </div>
  <div class="game-chips" id="game-chips">${gameChips}</div>
</div>

${hasCards ? `
${verdictHtml}

<div id="sell-view-banner" class="sell-view-banner" style="display:none">
  <div class="sell-view-inner">
    <strong>💰 Sell view active</strong> — prices shown are what you could receive for these cards. Card Kingdom (CK) buylist prices are in USD converted to AUD. eBay sell prices will vary.
  </div>
</div>

<div class="slots-section">
  <div class="slots-row">${renderSlots(cards, allTokens, usdToAud)}</div>
</div>

${statStrips}

<div class="share-bar">
  <span class="share-label">Share:</span>
  <button class="share-btn share-copy" id="share-copy-btn" onclick="copyShareUrl()">Copy Link</button>
  <button class="share-btn share-discord" id="share-discord-btn" onclick="copyDiscordShare()">Discord</button>
  <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(cardNames.join(' vs ') + ' — price compare on C3 ' + shareUrl)}" target="_blank" rel="noopener" class="share-btn share-twitter">𝕏 Twitter</a>
  <a href="https://reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(cardNames.join(' vs ') + ' — TCG price compare Australia')}" target="_blank" rel="noopener" class="share-btn share-reddit">Reddit</a>
</div>

${cards.length >= 2 ? `
<div class="tbl-section">
  <div class="tbl-header">
    <div class="tbl-section-title">Side-by-Side Comparison</div>
  </div>
  ${renderCompareTable(cards)}
</div>

<div class="radar-section">
  <div class="radar-inner">
    <div class="radar-chart">${radar}</div>
    <div>
      <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:10px">Card Strength Profile</div>
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8892b0;line-height:1.5;margin:6px 0 10px;">Three axes, all games. Price: cheaper cards score higher. Trend: rising prices score higher. Rarity: rarer cards score higher. A larger shape means stronger overall value signal.</p>
      <div class="radar-legend">
        ${cards.map((c, i) => {
          const colors = ['#C9A84C','#7c6af5','#4caf50','#EF4444','#3B82F6'];
          return `<div class="radar-legend-item"><div class="radar-swatch" style="background:${colors[i] || '#888'}"></div><span>${c.name}</span></div>`;
        }).join('')}
      </div>
    </div>
  </div>
</div>
` : `<div style="max-width:1300px;margin:24px auto;padding:0 24px;font-size:13px;color:var(--text2)">Add at least 2 cards to see the comparison table.</div>`}

<div class="market-teaser">
  <div class="market-teaser-inner">
    <div class="market-teaser-text">
      <strong>📊 C3 Market</strong> — See which cards are gaining and losing value across all 8 TCGs this week.
    </div>
    <a href="/market" class="market-link-btn" onclick="gtag('event','compare_market_link_clicked',{from:'compare_page',card_count:${cards.length}})">View C3 Market →</a>
  </div>
</div>
` : renderEmptyState()}

<script type="application/json" id="compare-data">{"usdToAud":${usdToAud.toFixed(4)},"tokens":${JSON.stringify(allTokens)},"cardCount":${JSON.stringify(cards.length)}}</script>
<footer>
  <p>
    <a href="/">Home</a><a href="/compare">Compare</a><a href="/market">Market</a>
    <a href="/tracker">Tracker</a><a href="/blog">Blog</a><a href="/contact">Contact</a>
  </p>
  <p style="margin-top:8px">Prices in AUD at live rates. Card data via tcgapi.dev and Scryfall. Not financial advice.</p>
  <p style="margin-top:6px">© 2026 Cards on Cards on Cards · cardsoncardsoncards.com.au</p>
</footer>

<script>
(function() {
  var dataEl = document.getElementById('compare-data');
  var data = dataEl ? JSON.parse(dataEl.textContent) : {};
  window.USD_TO_AUD     = data.usdToAud || 1.58;
  window.CURRENT_TOKENS = data.tokens || [];
  window.CURRENT_CARDS  = data.cardCount || 0;
})();

var currentCurrency  = 'aud';
var activeGameFilter = null;
var searchTimeout;
var searchIndex = -1;

function setCurrency(cur) {
  currentCurrency = cur;
  document.getElementById('btn-aud').classList.toggle('active', cur === 'aud');
  document.getElementById('btn-usd').classList.toggle('active', cur === 'usd');
  document.getElementById('btn-aud').setAttribute('aria-pressed', cur === 'aud');
  document.getElementById('btn-usd').setAttribute('aria-pressed', cur === 'usd');
  document.querySelectorAll('.aud-val').forEach(function(el) {
    var aud = parseFloat(el.dataset.aud || 0);
    var usd = parseFloat(el.dataset.usd || 0);
    if (cur === 'usd' && usd > 0) el.textContent = 'US$' + usd.toFixed(2);
    else if (aud > 0) el.textContent = 'AU$' + aud.toFixed(2);
  });
  document.querySelectorAll('.usd-val').forEach(function(el) {
    el.style.display = cur === 'usd' ? 'none' : '';
  });
  gtag('event', 'compare_currency_toggled', { currency: cur });
}

// Buy / Sell view toggle
function setView(view) {
  var isSell = view === 'sell';
  document.getElementById('btn-buy').classList.toggle('active', !isSell);
  document.getElementById('btn-sell').classList.toggle('active', isSell);
  document.getElementById('btn-sell').classList.toggle('sell-active', isSell);
  document.getElementById('btn-buy').classList.toggle('sell-active', false);
  var banner = document.getElementById('sell-view-banner');
  if (banner) banner.style.display = isSell ? '' : 'none';
  document.body.classList.toggle('sell-view', isSell);
  // In sell view, show CK buylist rows more prominently
  document.querySelectorAll('.ck-buylist-row').forEach(function(el) {
    el.style.fontSize = isSell ? '14px' : '';
    el.style.fontWeight = isSell ? '700' : '';
  });
  gtag('event', 'compare_view_toggled', { view: view });
}

// Help tooltips toggle
function toggleHelp() {
  var isOn = !document.body.classList.contains('help-off');
  if (isOn) {
    document.body.classList.add('help-off');
    var btn = document.getElementById('help-toggle-btn');
    if (btn) { btn.textContent = '❓ Help off'; btn.classList.remove('active'); }
    try { localStorage.setItem('c3_help_off', '1'); } catch {}
  } else {
    document.body.classList.remove('help-off');
    var btn = document.getElementById('help-toggle-btn');
    if (btn) { btn.textContent = '❓ Help on'; btn.classList.add('active'); }
    try { localStorage.removeItem('c3_help_off'); } catch {}
  }
}

// Apply saved help preference on load
try {
  if (localStorage.getItem('c3_help_off') === '1') {
    document.body.classList.add('help-off');
    var helpBtn = document.getElementById('help-toggle-btn');
    if (helpBtn) { helpBtn.textContent = '❓ Help off'; helpBtn.classList.remove('active'); }
  } else {
    var helpBtn = document.getElementById('help-toggle-btn');
    if (helpBtn) helpBtn.classList.add('active');
  }
} catch {}

function setGameFilter(game) {
  var chips = document.querySelectorAll('.game-chip');
  var input = document.getElementById('main-search');
  if (activeGameFilter === game) {
    activeGameFilter = null;
    chips.forEach(function(c) { c.classList.remove('active'); });
    if (input) {
      input.classList.remove('game-filtered');
      input.placeholder = 'Add another card...';
      input.style.removeProperty('--active-chip-color');
    }
  } else {
    activeGameFilter = game;
    var cfg = {
      mtg:'#C9A84C',pokemon:'#EF4444',yugioh:'#8B5CF6',lorcana:'#3B82F6',
      onepiece:'#F97316',dragonball:'#EAB308',starwars:'#FFE81F',riftbound:'#10B981'
    };
    var labels = {
      mtg:'MTG',pokemon:'Pokemon',yugioh:'Yu-Gi-Oh',lorcana:'Lorcana',
      onepiece:'One Piece',dragonball:'Dragon Ball',starwars:'Star Wars',riftbound:'Riftbound'
    };
    chips.forEach(function(c) { c.classList.toggle('active', c.dataset.game === game); });
    if (input) {
      input.classList.add('game-filtered');
      input.placeholder = 'Search ' + (labels[game] || game) + ' cards...';
      input.style.setProperty('--active-chip-color', cfg[game] || 'var(--accent)');
      input.focus();
    }
  }
  if (input && input.value.length >= 2) handleSearch(input.value);
  gtag('event', 'compare_game_filter', { game: activeGameFilter || 'all' });
}

function handleSearch(val) {
  clearTimeout(searchTimeout);
  var el = document.getElementById('search-results');
  if (!val || val.length < 2) { if (el) el.style.display = 'none'; return; }
  if (el) { el.innerHTML = '<div style="padding:12px 16px;font-size:13px;color:var(--text2)">Searching across 32 games...</div>'; el.style.display = ''; }
  searchTimeout = setTimeout(function() {
    var game = activeGameFilter ? '&game=' + activeGameFilter : '';
    fetch('/api/compare-search?q=' + encodeURIComponent(val) + '&limit=10' + game)
      .then(function(r) { return r.json(); })
      .then(function(data) { renderResults(data); })
      .catch(function() {});
  }, 260);
}

function handleSearchKey(e) {
  var el = document.getElementById('search-results');
  var items = el ? el.querySelectorAll('.result-item') : [];
  if (e.key === 'ArrowDown') {
    searchIndex = Math.min(searchIndex + 1, items.length - 1);
    if (items[searchIndex]) items[searchIndex].focus();
    e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    searchIndex = Math.max(searchIndex - 1, -1);
    if (searchIndex >= 0) { if (items[searchIndex]) items[searchIndex].focus(); }
    else { var ms = document.getElementById('main-search'); if (ms) ms.focus(); }
    e.preventDefault();
  } else if (e.key === 'Escape') {
    if (el) el.style.display = 'none';
    searchIndex = -1;
  } else if (e.key === 'Enter') {
    var focused = el ? el.querySelector('.result-item:focus') : null;
    if (focused && focused.dataset.game) addCard(focused.dataset.game, focused.dataset.slug);
  }
}

function renderResults(items) {
  var el = document.getElementById('search-results');
  if (!el) return;
  if (!items || !items.length) {
    el.innerHTML = '<div style="padding:12px 16px;font-size:13px;color:var(--text2)">No cards found</div>';
    el.style.display = '';
    return;
  }
  el.style.display = '';
  el.innerHTML = items.slice(0, 10).map(function(card) {
    var token     = card.game + ':' + card.slug;
    var inCompare = CURRENT_TOKENS.indexOf(token) !== -1 || CURRENT_TOKENS.indexOf(card.slug) !== -1;
    var full      = CURRENT_CARDS >= 5;
    var canAdd    = !inCompare && !full;
    return '<div class="result-item" tabindex="0" role="option" aria-selected="false"' +
      (canAdd ? ' data-game="' + card.game + '" data-slug="' + card.slug + '"' : ' data-disabled="true"') + '>' +
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
  var token     = game + ':' + slug;
  var newTokens = CURRENT_TOKENS.filter(function(t) { return t !== token; }).concat([token]);
  gtag('event', 'compare_card_added', { game: game, position: newTokens.length });
  window.location.href = '/compare?cards=' + newTokens.join(',');
}

function focusSearch() {
  var el = document.getElementById('main-search');
  if (el && !el.disabled) el.focus();
}

function loadVersions(game, name, slotIdx) {
  var panel = document.getElementById('versions-' + slotIdx);
  if (!panel) return;
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
  panel.innerHTML = '<div style="padding:6px;color:var(--text2);font-size:10px">Loading...</div>';
  panel.style.display = '';
  fetch('/api/compare-search?q=' + encodeURIComponent(name) + '&game=' + game + '&printings=1&limit=20')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || !data.length) { panel.innerHTML = '<div style="padding:6px;color:var(--text2);font-size:10px">No other versions found</div>'; return; }
      panel.innerHTML = data.map(function(v) {
        return '<div class="version-item" data-game="' + game + '" data-slug="' + v.slug + '" data-slot="' + slotIdx + '" tabindex="0">' +
          '<span class="version-set">' + (v.setName || '—') + (v.collectorNumber ? ' #' + v.collectorNumber : '') + '</span>' +
          '<span class="version-price">' + (v.priceDisplay || 'N/A') + '</span>' +
          '<button class="version-swap" data-action="swap" data-game="' + game + '" data-slug="' + v.slug + '" data-slot="' + slotIdx + '">Swap</button>' +
          '<button class="version-compare" data-action="compare" data-game="' + game + '" data-slug="' + v.slug + '" data-slot="' + slotIdx + '">+ Compare</button>' +
          '</div>';
      }).join('');
    })
    .catch(function() { panel.innerHTML = '<div style="padding:6px;color:var(--text2);font-size:10px">Error loading</div>'; });
}

function switchVersion(game, newSlug, slotIdx) {
  var newToken  = game + ':' + newSlug;
  var newTokens = CURRENT_TOKENS.map(function(t, i) { return i === slotIdx ? newToken : t; });
  gtag('event', 'compare_version_switched', { game: game, position: slotIdx });
  window.location.href = '/compare?cards=' + newTokens.join(',');
}

function addVersionToSlot(game, newSlug, fromSlotIdx) {
  var newToken = game + ':' + newSlug;
  if (CURRENT_TOKENS.indexOf(newToken) !== -1) { return; }
  var maxSlots = 5;
  var emptyIdx = -1;
  for (var i = fromSlotIdx + 1; i < maxSlots; i++) {
    if (!CURRENT_TOKENS[i]) { emptyIdx = i; break; }
  }
  if (emptyIdx === -1) {
    for (var j = 0; j < fromSlotIdx; j++) {
      if (!CURRENT_TOKENS[j]) { emptyIdx = j; break; }
    }
  }
  if (emptyIdx === -1) {
    var newTokens = CURRENT_TOKENS.map(function(t, i) { return i === fromSlotIdx ? newToken : t; });
    window.location.href = '/compare?cards=' + newTokens.join(',');
    return;
  }
  var tokensToUse = CURRENT_TOKENS.slice();
  while (tokensToUse.length <= emptyIdx) { tokensToUse.push(''); }
  tokensToUse[emptyIdx] = newToken;
  var filtered = tokensToUse.filter(function(t) { return t && t.length > 0; });
  gtag('event', 'compare_version_added', { game: game, position: emptyIdx });
  window.location.href = '/compare?cards=' + filtered.join(',');
}

function copyShareUrl() {
  navigator.clipboard.writeText(window.location.href).then(function() {
    var btn = document.getElementById('share-copy-btn');
    if (btn) { btn.textContent = '✓ Copied!'; setTimeout(function() { btn.textContent = 'Copy Link'; }, 2000); }
  });
  gtag('event', 'compare_share_clicked', { method: 'copy', card_count: CURRENT_CARDS });
}

function copyDiscordShare() {
  var names  = document.querySelectorAll('.slot-name a');
  var prices = document.querySelectorAll('.slot-price');
  var parts  = [];
  names.forEach(function(el, i) {
    var price = prices[i] ? prices[i].textContent.trim() : '';
    parts.push(el.textContent.trim() + (price ? ' (' + price + ')' : ''));
  });
  var nl   = String.fromCharCode(10);
  var text = parts.join(' vs ') + nl + window.location.href;
  navigator.clipboard.writeText(text).then(function() {
    var btn = document.getElementById('share-discord-btn');
    if (btn) { btn.textContent = '✓ Copied!'; setTimeout(function() { btn.textContent = 'Discord'; }, 2000); }
  });
  gtag('event', 'compare_share_clicked', { method: 'discord', card_count: CURRENT_CARDS });
}

// Recent compare history via localStorage
function saveToHistory() {
  try {
    if (!CURRENT_TOKENS.length) return;
    var history = JSON.parse(localStorage.getItem('c3_compare_history') || '[]');
    var entry   = { tokens: CURRENT_TOKENS.join(','), ts: Date.now() };
    history     = history.filter(function(h) { return h.tokens !== entry.tokens; });
    history.unshift(entry);
    history     = history.slice(0, 5);
    localStorage.setItem('c3_compare_history', JSON.stringify(history));
  } catch {}
}

function loadRecentHistory() {
  try {
    var container = document.getElementById('recent-comparisons');
    var list      = document.getElementById('recent-list');
    if (!container || !list) return;
    var history   = JSON.parse(localStorage.getItem('c3_compare_history') || '[]');
    if (!history.length) return;
    list.innerHTML = history.map(function(h) {
      var labels = h.tokens.split(',').map(function(t) {
        var parts = t.split(':');
        return parts.length > 1 ? parts.slice(1).join(':').replace(/-/g, ' ') : t;
      });
      var title = labels.slice(0,2).map(function(l) { return l.charAt(0).toUpperCase() + l.slice(1); }).join(' vs ');
      return '<a href="/compare?cards=' + h.tokens + '" class="suggestion-card">' +
        '<div class="suggestion-label">' + title + '</div>' +
        '<div class="suggestion-desc">Click to view comparison</div>' +
        '</a>';
    }).join('');
    container.style.display = '';
  } catch {}
}

// Wire everything up
var mainSearch = document.getElementById('main-search');
if (mainSearch) {
  mainSearch.addEventListener('input', function(e) { handleSearch(e.target.value); });
  mainSearch.addEventListener('keydown', function(e) { handleSearchKey(e); });
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.search-wrap')) {
    var el = document.getElementById('search-results');
    if (el) el.style.display = 'none';
    searchIndex = -1;
  }
  var gameChip = e.target.closest('.game-chip[data-game]');
  if (gameChip) { setGameFilter(gameChip.dataset.game); return; }
  if (e.target.closest('[data-action="focus-search"]')) { focusSearch(); return; }
  var resultItem = e.target.closest('.result-item[data-game]');
  if (resultItem && !resultItem.dataset.disabled) { addCard(resultItem.dataset.game, resultItem.dataset.slug); return; }
  var swapBtn = e.target.closest('.version-swap[data-action="swap"]');
  if (swapBtn) { switchVersion(swapBtn.dataset.game, swapBtn.dataset.slug, parseInt(swapBtn.dataset.slot, 10)); return; }
  var compareBtn = e.target.closest('.version-compare[data-action="compare"]');
  if (compareBtn) { addVersionToSlot(compareBtn.dataset.game, compareBtn.dataset.slug, parseInt(compareBtn.dataset.slot, 10)); return; }
  var vBtn = e.target.closest('.slot-versions-btn');
  if (vBtn) { loadVersions(vBtn.dataset.game, vBtn.dataset.name, parseInt(vBtn.dataset.slot, 10)); return; }
  // Buy/sell view toggle
  if (e.target.id === 'btn-buy') { setView('buy'); return; }
  if (e.target.id === 'btn-sell') { setView('sell'); return; }
  // Help toggle
  if (e.target.id === 'help-toggle-btn') { toggleHelp(); return; }

  var suggCard = e.target.closest('.suggestion-card[data-suggestion-label]');
  if (suggCard && typeof gtag !== 'undefined') { gtag('event', 'compare_suggestion_clicked', { label: suggCard.dataset.suggestionLabel }); }
  var buyBtn = e.target.closest('.slot-buy-btn');
  if (buyBtn && typeof gtag !== 'undefined') {
    gtag('event', 'compare_ebay_clicked', {
      game: buyBtn.dataset.gtagGame || '',
      card: buyBtn.dataset.gtagCard || '',
      position: parseInt(buyBtn.dataset.gtagPos || '0', 10)
    });
  }
  var removeBtn = e.target.closest('.slot-remove');
  if (removeBtn && typeof gtag !== 'undefined') {
    gtag('event', 'compare_card_removed', { game: removeBtn.dataset.gtagGame || '', card: removeBtn.dataset.gtagCard || '' });
  }
});

saveToHistory();

// Per-slot source picker
document.querySelectorAll('.slot-source-picker').forEach(function(select) {
  select.addEventListener('change', function() {
    var slotIdx = this.dataset.slot;
    var val = this.value;
    var slot = document.getElementById('slot-' + slotIdx);
    if (!slot) return;
    var ckRow = slot.querySelector('.ck-buylist-row');
    var priceEl = slot.querySelector('.slot-price.aud-val');
    var sourceLabel = slot.querySelector('.price-source-label');
    if (val === 'ck') {
      // Show CK buylist price prominently, dim market price
      if (ckRow) ckRow.style.fontSize = '15px';
      if (priceEl) priceEl.style.opacity = '0.5';
      if (sourceLabel) sourceLabel.textContent = 'Card Kingdom buylist (sell) ';
      gtag('event', 'compare_source_switched', { slot: slotIdx, source: 'ck' });
    } else {
      if (ckRow) ckRow.style.fontSize = '';
      if (priceEl) priceEl.style.opacity = '';
      if (sourceLabel) sourceLabel.textContent = 'Market price (buy) ';
      gtag('event', 'compare_source_switched', { slot: slotIdx, source: 'market' });
    }
  });
});
loadRecentHistory();

var _games = [];
CURRENT_TOKENS.forEach(function(t) {
  var g = t.split(':')[0];
  if (_games.indexOf(g) === -1) _games.push(g);
});
gtag('event', 'compare_page_load', {
  card_count: CURRENT_CARDS,
  games: _games.join(','),
  is_cross_tcg: _games.length > 1
});
</script>
</body>
</html>`;
}

function parseToken(token) {
  if (token.includes(':')) {
    var idx  = token.indexOf(':');
    var game = token.slice(0, idx);
    var slug = token.slice(idx + 1);
    return { game: game, slug: slug };
  }
  return { game: 'mtg', slug: token };
}

export default async (req) => {
  const url           = new URL(req.url);
  const hasCardsParam = url.searchParams.has('cards');
  const cardsParam    = url.searchParams.get('cards') || '';
  const rawTokens     = cardsParam ? cardsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5) : [];

  // Only redirect to default comparison when the cards param is absent entirely.
  // An empty `?cards=` means the user cleared all slots and should see the empty state.
  if (!hasCardsParam) {
    return new Response(null, {
      status: 302,
      headers: { 'Location': '/compare?cards=mtg:generous-gift,mtg:sol-ring' }
    });
  }

  const [usdToAud, ...cardResults] = await Promise.all([
    getLiveRate(),
    ...rawTokens.map(token => {
      const { game, slug } = parseToken(token);
      return fetchCard(game, slug, 1.58);
    })
  ]);

  const cards = cardResults
    .filter(c => c !== null)
    .map(c => {
      if (c.game === 'mtg') return c;
      if (!c.priceUsd) return c;
      return {
        ...c,
        priceAud:     c.priceUsd ? parseFloat((c.priceUsd * usdToAud).toFixed(2)) : c.priceAud,
        priceAudFoil: c.priceAudFoil ? parseFloat((c.priceAudFoil / 1.58 * usdToAud).toFixed(2)) : null,
      };
    });

  const allTokens = cards.map(c => `${c.game}:${c.slug}`);
  const html      = renderPage({ cards, allTokens, usdToAud });

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
