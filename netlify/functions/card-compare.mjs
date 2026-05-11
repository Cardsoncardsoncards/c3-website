// netlify/functions/card-compare.mjs
// Server-rendered Card Compare page at /compare
// Phase 1: MTG-only, up to 5 cards, full row set, winner logic, best value toggle
// Spec confirmed: separate page, query params, AUD only, all GA4 events, shareable URL

const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID = '5339146789';
const AMAZON_TAG = 'blasdigital-22';

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
  });
  if (!res.ok) return [];
  return res.json();
}

function formatAUD(num) {
  if (!num || num <= 0) return null;
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(num);
}

function formatLegalities(legalities) {
  if (!legalities) return {};
  try { return typeof legalities === 'string' ? JSON.parse(legalities) : legalities; } catch { return {}; }
}

async function fetchMTGCard(slug) {
  const cards = await supabaseGet(`mtg_cards?slug=eq.${encodeURIComponent(slug)}&limit=1`);
  if (!cards || cards.length === 0) return null;
  const card = cards[0];

  // Fetch price snapshots for 7d change
  let snapshots = [];
  try {
    snapshots = await supabaseGet(`mtg_price_snapshots?scryfall_id=eq.${card.scryfall_id}&order=snapshot_date.asc&limit=10`);
  } catch {}

  // Cheapest printing
  let cheapestPrinting = null;
  try {
    const printings = await supabaseGet(`mtg_cards?name=eq.${encodeURIComponent(card.name)}&slug=neq.${encodeURIComponent(slug)}&select=slug,set_name,price_aud,price_usd&order=price_aud.asc.nullslast&limit=1`);
    if (printings && printings.length > 0) {
      const p = printings[0];
      const priceAud = p.price_aud > 0 ? parseFloat(p.price_aud) : (p.price_usd ? p.price_usd * 1.58 : null);
      if (priceAud) cheapestPrinting = { slug: p.slug, setName: p.set_name, priceAud };
    }
  } catch {}

  // 7d change
  let sevenDayChange = null;
  if (snapshots.length >= 7) {
    const recent = snapshots.slice(-7);
    const first = parseFloat(recent[0]?.price_aud || 0);
    const last = parseFloat(recent[recent.length - 1]?.price_aud || 0);
    if (first && last) {
      const pct = ((last - first) / first) * 100;
      if (Math.abs(pct) >= 0.5) sevenDayChange = { pct: pct.toFixed(1), up: pct > 0 };
    }
  }

  // Spike badge
  const isSpiked = sevenDayChange && sevenDayChange.up && parseFloat(sevenDayChange.pct) >= 15;

  const priceAud = card.price_aud > 0 ? parseFloat(card.price_aud) : (card.price_usd ? card.price_usd * 1.58 : null);
  const priceAudFoil = card.price_usd_foil ? card.price_usd_foil * 1.58 : null;
  const legalities = formatLegalities(card.legalities);
  const latestSnap = snapshots[snapshots.length - 1];

  return {
    ...card,
    priceAud,
    priceAudFoil,
    legalities,
    sevenDayChange,
    isSpiked,
    cheapestPrinting,
    high52w: latestSnap?.price_52w_high_aud || null,
    low52w: latestSnap?.price_52w_low_aud || null,
    game: 'mtg',
    gameLabel: 'MTG',
    gameColor: '#C9A84C',
    cardPath: `/cards/mtg/${card.slug}`
  };
}

const SUGGESTED_COMPARISONS = [
  { label: 'Lightning Bolt vs Chain Lightning', slugs: 'lightning-bolt-m11,chain-lightning-commander-legends-battle-for-baldurs-gate', desc: 'Classic burn spell showdown' },
  { label: 'Sol Ring vs Arcane Signet', slugs: 'sol-ring-commander-2011,arcane-signet-throne-of-eldraine', desc: 'Commander mana rock debate' },
  { label: 'Counterspell vs Mana Leak', slugs: 'counterspell-tenth-edition,mana-leak-magic-2012', desc: 'Control staple comparison' },
  { label: 'Command Tower vs Exotic Orchard', slugs: 'command-tower-commander-2011,exotic-orchard-conflux', desc: 'Commander land efficiency' },
  { label: 'Rhystic Study vs Mystic Remora', slugs: 'rhystic-study-prophecy,mystic-remora-ice-age', desc: 'Best Commander card draw' },
];

const FORMATS = ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'commander'];

function renderCompareTable(cards) {
  if (!cards.length) return '';

  // Winner logic: for each row, find best column
  function getBestIdx(values, lowerIsBetter = false) {
    const valid = values.map((v, i) => ({ v, i })).filter(x => x.v !== null && x.v !== undefined);
    if (valid.length < 2) return -1;
    const best = lowerIsBetter ? Math.min(...valid.map(x => x.v)) : Math.max(...valid.map(x => x.v));
    const winners = valid.filter(x => x.v === best);
    return winners.length === 1 ? winners[0].i : -1;
  }

  const priceWinner = getBestIdx(cards.map(c => c.priceAud), true);
  const foilWinner = getBestIdx(cards.map(c => c.priceAudFoil), true);
  const edhWinner = getBestIdx(cards.map(c => c.edhrec_rank ? c.edhrec_rank : null), true);
  const highWinner = getBestIdx(cards.map(c => c.high52w));
  const cmcWinner = getBestIdx(cards.map(c => c.cmc !== null ? c.cmc : null), true);

  // Count wins per card for best value score
  const winCounts = cards.map((_, i) => [priceWinner, foilWinner, edhWinner, cmcWinner].filter(w => w === i).length);
  const totalRows = [priceWinner, foilWinner, edhWinner, cmcWinner].filter(w => w >= 0).length;

  function winClass(idx, winnerIdx) {
    return winnerIdx === idx ? 'row-winner' : '';
  }

  const colWidth = Math.floor(100 / (cards.length + 1));

  return `
  <div class="compare-table-wrap">
    <!-- Best value score toggle -->
    <div class="compare-controls">
      <label class="compare-toggle-label">
        <input type="checkbox" id="best-value-toggle" onchange="toggleBestValue(this.checked)">
        Show Best Value Score
      </label>
      <a href="/compare" class="compare-reset-link">Reset comparison</a>
    </div>

    <div class="compare-table">
      <!-- Header row: card images and names -->
      <div class="compare-row compare-row-header">
        <div class="compare-label-cell">Card</div>
        ${cards.map((card, i) => `
          <div class="compare-card-cell">
            <div class="compare-card-img-wrap">
              ${card.isSpiked ? '<span class="spike-badge" title="Price spiked 15%+ this week">📈</span>' : ''}
              <img src="${card.image_uri_small || card.image_uri_normal || ''}" alt="${card.name}" loading="lazy" class="compare-card-img">
            </div>
            <div class="compare-card-name"><a href="${card.cardPath}">${card.name}</a></div>
            <div class="compare-game-badge" style="background:${card.gameColor}22;color:${card.gameColor};border-color:${card.gameColor}44">${card.gameLabel}</div>
            <div class="compare-best-score" id="score-${i}" style="display:none">
              <span class="score-num">${winCounts[i]}</span>/<span class="score-total">${totalRows}</span> categories best
              ${winCounts[i] === Math.max(...winCounts) && winCounts[i] > 0 ? '<span class="best-value-badge">Best Value</span>' : ''}
            </div>
            <a href="${`https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(card.name + ' mtg')}&_sop=15&campid=${EPN_CAMPID}`}" target="_blank" rel="noopener" class="compare-ebay-btn" onclick="gtag('event','compare_ebay_clicked',{card_name:'${card.name.replace(/'/g,"\\'")}',column_position:${i}})">Find on eBay AU</a>
          </div>`).join('')}
      </div>

      <!-- Rarity row -->
      <div class="compare-row">
        <div class="compare-label-cell">Rarity</div>
        ${cards.map(card => `<div class="compare-val-cell"><span class="rarity-pill rarity-${card.rarity || 'common'}">${card.rarity ? card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1) : 'N/A'}</span></div>`).join('')}
      </div>

      <!-- NM Price row -->
      <div class="compare-row">
        <div class="compare-label-cell">NM Price (AUD)</div>
        ${cards.map((card, i) => `
          <div class="compare-val-cell ${winClass(i, priceWinner)}">
            <span class="compare-price-main">${formatAUD(card.priceAud) || 'N/A'}</span>
            ${card.sevenDayChange ? `<span class="compare-7d ${card.sevenDayChange.up ? 'up' : 'down'}">${card.sevenDayChange.up ? '▲' : '▼'} ${Math.abs(card.sevenDayChange.pct)}%</span>` : ''}
            ${winClass(i, priceWinner) ? '<span class="win-icon" title="Lowest price">★</span>' : ''}
          </div>`).join('')}
      </div>

      <!-- Foil Price row -->
      ${cards.some(c => c.priceAudFoil) ? `
      <div class="compare-row">
        <div class="compare-label-cell">Foil Price (AUD)</div>
        ${cards.map((card, i) => `
          <div class="compare-val-cell ${winClass(i, foilWinner)}">
            <span class="compare-price-foil">${formatAUD(card.priceAudFoil) || 'N/A'}</span>
            ${winClass(i, foilWinner) ? '<span class="win-icon" title="Lowest foil price">★</span>' : ''}
          </div>`).join('')}
      </div>` : ''}

      <!-- 52W range row -->
      <div class="compare-row">
        <div class="compare-label-cell">52W High / Low</div>
        ${cards.map(card => `
          <div class="compare-val-cell">
            <div class="compare-52w">
              <span class="compare-52w-high">${formatAUD(card.high52w) || '—'}</span>
              <span class="compare-52w-sep"> / </span>
              <span class="compare-52w-low">${formatAUD(card.low52w) || '—'}</span>
            </div>
          </div>`).join('')}
      </div>

      <!-- Cheapest printing row -->
      <div class="compare-row">
        <div class="compare-label-cell">Cheapest Printing</div>
        ${cards.map(card => `
          <div class="compare-val-cell">
            ${card.cheapestPrinting ? `
              <div class="cheapest-printing">
                <span class="cheapest-price">${formatAUD(card.cheapestPrinting.priceAud)}</span>
                <span class="cheapest-set">${card.cheapestPrinting.setName}</span>
                <a href="https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(card.name + ' ' + card.cheapestPrinting.setName + ' mtg')}&campid=${EPN_CAMPID}" target="_blank" rel="noopener" class="cheapest-btn" onclick="gtag('event','compare_cheapest_clicked',{card_name:'${card.name.replace(/'/g,"\\'")}',cheapest_set:'${(card.cheapestPrinting?.setName || '').replace(/'/g,"\\'")}',price:${card.cheapestPrinting?.priceAud || 0}})">→ Buy cheapest on eBay</a>
              </div>` : '<span class="compare-na">This is the cheapest printing</span>'}
          </div>`).join('')}
      </div>

      <!-- Format legality rows (MTG only) -->
      ${FORMATS.map(fmt => `
      <div class="compare-row">
        <div class="compare-label-cell legality-label">${fmt.charAt(0).toUpperCase() + fmt.slice(1)}</div>
        ${cards.map(card => {
          const status = card.legalities[fmt] || 'not_legal';
          return `<div class="compare-val-cell"><span class="legality-pip ${status === 'legal' ? 'pip-legal' : status === 'banned' ? 'pip-banned' : 'pip-no'}">${status === 'legal' ? '✓' : status === 'banned' ? '✗' : '–'}</span></div>`;
        }).join('')}
      </div>`).join('')}

      <!-- EDHREC rank row -->
      ${cards.some(c => c.edhrec_rank) ? `
      <div class="compare-row">
        <div class="compare-label-cell">EDHREC Rank</div>
        ${cards.map((card, i) => `
          <div class="compare-val-cell ${winClass(i, edhWinner)}">
            ${card.edhrec_rank ? `<span class="compare-edh">#${card.edhrec_rank.toLocaleString()}</span>` : '<span class="compare-na">N/A</span>'}
            ${winClass(i, edhWinner) ? '<span class="win-icon" title="Most played in Commander">★</span>' : ''}
          </div>`).join('')}
      </div>` : ''}

      <!-- Mana value row -->
      ${cards.some(c => c.cmc !== null) ? `
      <div class="compare-row">
        <div class="compare-label-cell">Mana Value</div>
        ${cards.map((card, i) => `
          <div class="compare-val-cell ${winClass(i, cmcWinner)}">
            ${card.cmc !== null ? card.cmc : '<span class="compare-na">—</span>'}
            ${winClass(i, cmcWinner) ? '<span class="win-icon" title="Lowest mana cost">★</span>' : ''}
          </div>`).join('')}
      </div>` : ''}

      <!-- Reserved List row -->
      ${cards.some(c => c.reserved) ? `
      <div class="compare-row">
        <div class="compare-label-cell">Reserved List</div>
        ${cards.map(card => `<div class="compare-val-cell">${card.reserved ? '<span class="reserve-badge">🔒 Yes</span>' : '—'}</div>`).join('')}
      </div>` : ''}

      <!-- Bottom eBay CTAs -->
      <div class="compare-row compare-row-cta">
        <div class="compare-label-cell"></div>
        ${cards.map((card, i) => `
          <div class="compare-card-cell">
            <a href="${`https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(card.name + ' mtg')}&_sop=15&campid=${EPN_CAMPID}`}" target="_blank" rel="noopener" class="compare-ebay-btn" onclick="gtag('event','compare_ebay_clicked',{card_name:'${card.name.replace(/'/g,"\\'")}',column_position:${i}})">Find on eBay AU</a>
          </div>`).join('')}
      </div>
    </div>
  </div>`;
}

function renderEmptyState() {
  const suggestions = SUGGESTED_COMPARISONS.map((s, i) => `
    <a href="/compare?cards=${s.slugs}" class="suggestion-card" onclick="gtag('event','compare_empty_suggestion_clicked',{label:'${s.label.replace(/'/g,"\\'")}'})" style="animation-delay:${i * 0.08}s">
      <div class="suggestion-label">${s.label}</div>
      <div class="suggestion-desc">${s.desc}</div>
    </a>`).join('');

  return `
  <div class="empty-state">
    <div class="empty-icon">⚖️</div>
    <h2>Compare MTG Cards Side by Side</h2>
    <p>Search for up to 5 cards to compare prices, format legality, EDHREC rank, and find the cheapest printing.</p>

    <div class="search-wrap">
      <input type="text" id="compare-search-input" class="compare-search-input" placeholder="Search for a card (e.g. Lightning Bolt)..." autocomplete="off" oninput="handleSearch(this.value)" onkeydown="handleSearchKey(event)">
      <div id="compare-search-results" class="compare-search-results" style="display:none"></div>
    </div>

    <div class="suggestions-label">Popular comparisons</div>
    <div class="suggestions-grid">${suggestions}</div>
  </div>`;
}

function renderPageHTML({ cards, slugs, title }) {
  const hasCards = cards.length > 0;
  const pageTitle = hasCards
    ? cards.map(c => c.name).join(' vs ') + ' | C3 Card Compare'
    : 'Card Compare | Cards on Cards on Cards';
  const pageDesc = hasCards
    ? `Compare ${cards.map(c => c.name).join(', ')} — prices, format legality, EDHREC rank, and cheapest printing in Australia.`
    : 'Compare MTG card prices side by side. Find the cheapest printing, check format legality, and buy on eBay AU.';

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${pageTitle}</title>
  <meta name="description" content="${pageDesc}">
  <link rel="canonical" href="https://cardsoncardsoncards.com.au/compare${slugs.length ? '?cards=' + slugs.join(',') : ''}">
  <meta property="og:title" content="${pageTitle}">
  <meta property="og:description" content="${pageDesc}">
  <meta property="og:image" content="https://cardsoncardsoncards.com.au/c3-og-banner.png">
  <link rel="icon" type="image/png" href="/c3logo.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg:#0f1117;--bg2:#1a1d2e;--bg3:#22263a;
      --accent:#C9A84C;--accent2:#7c6af5;
      --text:#e8eaf0;--text2:#9ba3c4;--border:#2d3254;
      --green:#4caf50;--red:#f44336;--radius:12px;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:Georgia,serif;line-height:1.6}
    a{color:var(--accent);text-decoration:none}
    a:hover{text-decoration:underline}

    /* Nav */
    .site-nav{background:var(--bg2);border-bottom:1px solid var(--border);padding:12px 24px;display:flex;align-items:center;gap:24px;flex-wrap:wrap}
    .site-nav .logo{font-family:'Cinzel',serif;font-weight:700;font-size:18px;color:var(--accent)}
    .site-nav a{color:var(--text2);font-size:14px;font-family:sans-serif}
    .site-nav a:hover{color:var(--text)}

    /* Page header */
    .compare-header{max-width:1200px;margin:32px auto 0;padding:0 24px}
    .compare-header h1{font-family:'Cinzel',serif;font-size:28px;color:var(--accent);margin-bottom:8px}
    .compare-header p{color:var(--text2);font-size:14px;font-family:sans-serif}

    /* Search bar */
    .search-wrap{position:relative;max-width:520px;margin:24px auto}
    .compare-search-input{width:100%;background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:12px 16px;border-radius:10px;font-size:15px;font-family:sans-serif;transition:border-color .18s;outline:none}
    .compare-search-input:focus{border-color:var(--accent)}
    .compare-search-results{position:absolute;top:calc(100% + 6px);left:0;right:0;background:var(--bg2);border:1px solid var(--border);border-radius:10px;z-index:200;max-height:360px;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.5)}
    .compare-result-item{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .12s;font-family:sans-serif}
    .compare-result-item:last-child{border-bottom:none}
    .compare-result-item:hover{background:var(--bg3)}
    .compare-result-img{width:32px;border-radius:4px;flex-shrink:0}
    .compare-result-name{font-size:13px;color:var(--text);font-weight:600}
    .compare-result-meta{font-size:11px;color:var(--text2)}
    .compare-result-price{font-size:12px;color:var(--accent);font-weight:700;margin-left:auto}
    .result-game-badge{font-size:10px;padding:1px 6px;border-radius:3px;font-weight:700;margin-left:6px}

    /* Controls bar */
    .compare-controls{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;font-family:sans-serif;font-size:13px}
    .compare-toggle-label{display:flex;align-items:center;gap:8px;color:var(--text2);cursor:pointer}
    .compare-toggle-label input{accent-color:var(--accent2);width:16px;height:16px}
    .compare-reset-link{color:var(--text2);font-size:12px}

    /* Compare table */
    .compare-table-wrap{max-width:1200px;margin:0 auto;padding:0 24px 48px;overflow-x:auto}
    .compare-table{min-width:600px;width:100%}
    .compare-row{display:grid;border-bottom:1px solid var(--border)}
    .compare-row:last-child{border-bottom:none}
    .compare-label-cell{padding:14px 16px;color:var(--text2);font-family:sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.06em;background:var(--bg2);border-right:1px solid var(--border);display:flex;align-items:center}
    .compare-card-cell{padding:16px 12px;background:var(--bg2);border-right:1px solid var(--border);text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px}
    .compare-card-cell:last-child{border-right:none}
    .compare-val-cell{padding:14px 12px;background:var(--bg2);border-right:1px solid var(--border);text-align:center;display:flex;align-items:center;justify-content:center;gap:6px;font-family:sans-serif;font-size:14px}
    .compare-val-cell:last-child{border-right:none}
    .row-winner{background:rgba(201,168,76,.08)!important;position:relative}
    .win-icon{color:var(--accent);font-size:12px}
    .compare-row-header .compare-label-cell{background:var(--bg3)}
    .compare-row-header .compare-card-cell{background:var(--bg3)}
    .compare-row-cta .compare-label-cell{background:var(--bg3)}
    .compare-row-cta .compare-card-cell{background:var(--bg3)}

    /* Card image */
    .compare-card-img-wrap{position:relative;display:inline-block}
    .compare-card-img{width:90px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.5)}
    .spike-badge{position:absolute;top:-6px;right:-6px;font-size:16px;filter:drop-shadow(0 0 4px rgba(245,166,35,.6))}
    .compare-card-name{font-size:14px;font-weight:600;color:var(--text);text-align:center;line-height:1.3}
    .compare-card-name a{color:var(--text)}
    .compare-game-badge{font-size:10px;padding:2px 8px;border-radius:4px;font-weight:700;font-family:sans-serif;border:1px solid}
    .compare-best-score{font-family:sans-serif;font-size:11px;color:var(--text2);text-align:center}
    .score-num{font-size:18px;font-weight:700;color:var(--accent)}
    .best-value-badge{display:block;background:var(--accent);color:#000;padding:3px 8px;border-radius:4px;font-size:10px;font-weight:700;margin-top:4px}

    /* eBay button */
    .compare-ebay-btn{display:block;background:var(--accent);color:#000;padding:8px 14px;border-radius:7px;font-weight:700;font-size:12px;font-family:sans-serif;text-align:center;transition:opacity .18s;white-space:nowrap}
    .compare-ebay-btn:hover{opacity:.85;text-decoration:none}

    /* Price cells */
    .compare-price-main{font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:var(--accent)}
    .compare-price-foil{font-family:'Cinzel',serif;font-size:16px;font-weight:700;color:var(--accent2)}
    .compare-7d{font-size:11px;padding:2px 6px;border-radius:4px;font-family:sans-serif;font-weight:700}
    .compare-7d.up{background:rgba(76,175,80,.18);color:#81c784}
    .compare-7d.down{background:rgba(244,67,54,.18);color:#e57373}
    .compare-52w{font-size:12px;font-family:sans-serif;line-height:1.5;text-align:center}
    .compare-52w-high{color:#81c784}
    .compare-52w-sep{color:var(--text2)}
    .compare-52w-low{color:#e57373}
    .compare-na{color:var(--text2);font-size:12px;font-family:sans-serif}
    .compare-edh{font-weight:700;font-size:14px;font-family:sans-serif}

    /* Rarity pills */
    .rarity-pill{padding:3px 10px;border-radius:5px;font-size:12px;font-weight:700;font-family:sans-serif}
    .rarity-mythic{background:#7a3a00;color:#ffcc88}
    .rarity-rare{background:#4a3a00;color:#ffd700}
    .rarity-uncommon{background:#1a2a3a;color:#aaccee}
    .rarity-common{background:#222;color:#aaa}

    /* Legality pips */
    .legality-pip{font-size:16px;font-weight:700}
    .pip-legal{color:#4caf50}
    .pip-banned{color:#f44336}
    .pip-no{color:#555}
    .legality-label{font-size:11px}

    /* Cheapest printing */
    .cheapest-printing{display:flex;flex-direction:column;align-items:center;gap:4px;font-family:sans-serif;text-align:center}
    .cheapest-price{font-weight:700;color:#81c784;font-size:14px}
    .cheapest-set{font-size:11px;color:var(--text2)}
    .cheapest-btn{background:rgba(76,175,80,.15);border:1px solid rgba(76,175,80,.4);color:#81c784;padding:5px 10px;border-radius:6px;font-size:11px;font-family:sans-serif;font-weight:600;white-space:nowrap;transition:all .18s}
    .cheapest-btn:hover{background:rgba(76,175,80,.25);text-decoration:none}

    /* Reserved list */
    .reserve-badge{font-size:12px;font-family:sans-serif;color:#ffcccc}

    /* Empty state */
    .empty-state{max-width:700px;margin:48px auto;padding:0 24px;text-align:center}
    .empty-icon{font-size:48px;margin-bottom:16px}
    .empty-state h2{font-family:'Cinzel',serif;font-size:24px;color:var(--accent);margin-bottom:12px}
    .empty-state p{color:var(--text2);font-size:15px;margin-bottom:28px;font-family:sans-serif}
    .suggestions-label{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--text2);font-family:sans-serif;margin:28px 0 12px}
    .suggestions-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;text-align:left}
    .suggestion-card{display:block;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;transition:all .18s;animation:fadeUp .3s both}
    .suggestion-card:hover{border-color:var(--accent);background:rgba(201,168,76,.06);text-decoration:none}
    .suggestion-label{font-size:13px;font-weight:700;color:var(--text);font-family:sans-serif;margin-bottom:4px}
    .suggestion-desc{font-size:11px;color:var(--text2);font-family:sans-serif}

    /* Share bar */
    .compare-share{display:flex;align-items:center;gap:10px;flex-wrap:wrap;max-width:1200px;margin:0 auto 24px;padding:0 24px;font-family:sans-serif;font-size:13px}
    .compare-share-label{color:var(--text2);font-size:12px}
    .share-btn{padding:7px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:none;transition:all .18s;white-space:nowrap}
    .share-copy{background:var(--bg3);border:1px solid var(--border);color:var(--text)}
    .share-copy:hover{border-color:var(--accent);color:var(--accent)}
    .share-discord{background:#5865F2;color:#fff}
    .share-reddit{background:#FF4500;color:#fff}
    .share-twitter{background:#000;color:#fff}

    /* Tray notice */
    .tray-notice{max-width:1200px;margin:0 auto 16px;padding:0 24px;font-family:sans-serif;font-size:13px;color:var(--text2)}
    .tray-notice a{color:var(--accent)}

    @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    @media(max-width:680px){
      .compare-card-img{width:60px}
      .compare-price-main{font-size:14px}
      .compare-label-cell{font-size:10px;padding:10px 8px}
      .compare-val-cell,.compare-card-cell{padding:10px 6px}
    }

    footer{background:var(--bg2);border-top:1px solid var(--border);padding:32px 24px;text-align:center;color:var(--text2);font-size:13px;font-family:sans-serif;margin-top:48px}
    footer a{color:var(--text2);margin:0 12px}
  </style>
</head>
<body>

<nav class="site-nav">
  <a href="/" class="logo">C3</a>
  <a href="/">Home</a>
  <a href="/shop.html">Shop</a>
  <a href="/blog">Blog</a>
  <a href="/ev-calculator.html">EV Calculator</a>
  <a href="/cards/mtg">MTG Cards</a>
  <a href="/cards/mtg/random-commander">Random Commander</a>
  <a href="/tracker.html">Free Tracker</a>
</nav>

<div class="compare-header">
  <h1>⚖️ Card Compare</h1>
  <p>Compare up to 5 MTG cards side by side. Prices in AUD, updated daily.</p>
</div>

${hasCards ? `
<!-- Search to add more cards -->
<div style="max-width:1200px;margin:20px auto 0;padding:0 24px">
  <div class="search-wrap" style="margin:0 0 16px">
    <input type="text" id="compare-search-input" class="compare-search-input" placeholder="Add another card to compare..." autocomplete="off" oninput="handleSearch(this.value)" onkeydown="handleSearchKey(event)">
    <div id="compare-search-results" class="compare-search-results" style="display:none"></div>
  </div>
</div>

<!-- Share bar -->
<div class="compare-share">
  <span class="compare-share-label">Share:</span>
  <button class="share-btn share-copy" onclick="copyShareUrl()" id="share-copy-btn">Copy Link</button>
  <button class="share-btn share-discord" onclick="copyDiscordShare()">Discord</button>
  <a href="https://reddit.com/submit?url=${encodeURIComponent('https://cardsoncardsoncards.com.au/compare?cards=' + slugs.join(','))}&title=${encodeURIComponent(cards.map(c => c.name).join(' vs ') + ' — MTG Price Compare (Australia)')}" target="_blank" rel="noopener" class="share-btn share-reddit">Reddit</a>
  <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(cards.map(c => c.name).join(' vs ') + ' — who wins? ' + 'https://cardsoncardsoncards.com.au/compare?cards=' + slugs.join(','))}" target="_blank" rel="noopener" class="share-btn share-twitter">𝕏 Twitter</a>
</div>

${renderCompareTable(cards)}
` : renderEmptyState()}

<footer>
  <p>
    <a href="/">Home</a>
    <a href="/cards/mtg">MTG Cards</a>
    <a href="/compare">Card Compare</a>
    <a href="/ev-calculator.html">EV Calculator</a>
    <a href="/tracker.html">Free Tracker</a>
    <a href="/blog">Blog</a>
    <a href="/contact.html">Contact</a>
  </p>
  <p style="margin-top:8px">Prices in AUD are estimates based on USD conversion at live rates. Card data via Scryfall. Not financial advice.</p>
  <p style="margin-top:8px">© 2026 Cards on Cards on Cards · <a href="https://cardsoncardsoncards.com.au">cardsoncardsoncards.com.au</a></p>
</footer>

<script>
// GA4
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-WR68HPE92S');

// Fire page load event
gtag('event', 'compare_page_load', {
  card_count: ${cards.length},
  games_included: 'mtg',
  is_cross_tcg: false
});

${cards.some(c => c.isSpiked) ? `gtag('event','compare_spiked_badge_seen',{cards:'${cards.filter(c=>c.isSpiked).map(c=>c.name).join(',')}'});` : ''}

// Best value toggle
function toggleBestValue(on) {
  document.querySelectorAll('[id^="score-"]').forEach(el => el.style.display = on ? '' : 'none');
  gtag('event', 'compare_best_value_toggled', { state: on ? 'on' : 'off' });
}

// Copy share URL
function copyShareUrl() {
  const url = window.location.href;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('share-copy-btn');
    btn.textContent = '✓ Copied!';
    setTimeout(() => btn.textContent = 'Copy Link', 2000);
  });
  gtag('event', 'compare_share_clicked', { card_count: ${cards.length}, method: 'copy' });
}

function copyDiscordShare() {
  const names = ${JSON.stringify(cards.map(c => c.name))};
  const prices = ${JSON.stringify(cards.map(c => c.priceAud ? '~AU$' + c.priceAud.toFixed(2) : 'N/A'))};
  const url = window.location.href;
  const text = names.map((n,i) => n + ' (' + prices[i] + ')').join(' vs ') + '\\n' + url;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.share-discord');
    if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => btn.textContent = 'Discord', 2000); }
  });
  gtag('event', 'compare_share_clicked', { card_count: ${cards.length}, method: 'discord' });
}

// Compare tray state (synced with localStorage from card pages)
const COMPARE_KEY = 'c3_compare_tray';
function getCompareTray() {
  try { return JSON.parse(localStorage.getItem(COMPARE_KEY) || '[]'); } catch { return []; }
}
function saveCompareTray(tray) { localStorage.setItem(COMPARE_KEY, JSON.stringify(tray)); }

// Card autocomplete search
let searchTimeout;
function handleSearch(val) {
  clearTimeout(searchTimeout);
  const results = document.getElementById('compare-search-results');
  if (!val || val.length < 2) { results.style.display = 'none'; return; }
  searchTimeout = setTimeout(async () => {
    try {
      const res = await fetch('/api/compare-search?q=' + encodeURIComponent(val) + '&game=mtg&limit=8');
      const data = await res.json();
      renderSearchResults(data);
    } catch {}
  }, 280);
}

function handleSearchKey(e) {
  if (e.key === 'Escape') {
    document.getElementById('compare-search-results').style.display = 'none';
  }
}

function renderSearchResults(items) {
  const el = document.getElementById('compare-search-results');
  if (!items || !items.length) { el.innerHTML = '<div style="padding:12px 16px;font-family:sans-serif;font-size:13px;color:#9ba3c4">No cards found</div>'; el.style.display = ''; return; }
  el.style.display = '';
  const currentSlugs = ${JSON.stringify(slugs)};
  el.innerHTML = items.slice(0, 8).map(card => {
    const inCompare = currentSlugs.includes(card.slug);
    return \`<div class="compare-result-item\${inCompare ? ' result-in-compare' : ''}" onclick="\${inCompare ? '' : 'addCardToCompare(\\'' + card.slug + '\\')'}">
      \${card.image ? \`<img class="compare-result-img" src="\${card.image}" alt="\${card.name}">\` : ''}
      <div>
        <div class="compare-result-name">\${card.name} \${inCompare ? '<span style="color:#9ba3c4;font-size:11px">(already added)</span>' : ''}</div>
        <div class="compare-result-meta">\${card.gameLabel}</div>
      </div>
      <div class="compare-result-price">\${card.priceDisplay || ''}</div>
    </div>\`;
  }).join('');
}

function addCardToCompare(slug) {
  const currentSlugs = ${JSON.stringify(slugs)};
  if (currentSlugs.length >= 5) { alert('Maximum 5 cards. Remove one first.'); return; }
  if (currentSlugs.includes(slug)) return;
  const newSlugs = [...currentSlugs, slug];
  const url = '/compare?cards=' + newSlugs.join(',');
  gtag('event', 'compare_card_added', { game: 'mtg', column_position: newSlugs.length });
  window.location.href = url;
}

// Close search on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap')) {
    const el = document.getElementById('compare-search-results');
    if (el) el.style.display = 'none';
  }
});
</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-WR68HPE92S"></script>
</body>
</html>`;
}

// --- Main handler ---
export default async (req) => {
  const url = new URL(req.url);
  const cardsParam = url.searchParams.get('cards') || '';
  const slugs = cardsParam ? cardsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5) : [];

  let cards = [];
  let title = 'Card Compare';

  if (slugs.length > 0) {
    const results = await Promise.allSettled(slugs.map(slug => fetchMTGCard(slug)));
    cards = results
      .filter(r => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value);

    if (cards.length > 0) {
      title = cards.map(c => c.name).join(' vs ');
    }
  }

  const html = renderPageHTML({ cards, slugs, title });

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      'X-Robots-Tag': 'index, follow'
    }
  });
};

export const config = { path: '/compare' };
