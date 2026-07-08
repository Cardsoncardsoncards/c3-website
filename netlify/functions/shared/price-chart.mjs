// netlify/functions/shared/price-chart.mjs
// Single-line interactive price-history chart, ported verbatim from MTG's
// buildPriceChart in card-page.mjs with the foil series removed (no non-MTG game
// has foil price data -- foil_price_aud / foil_price are 0 across all 22 games).
// Matches the shared/nav.mjs + shared/view-tracking.mjs injectable-string pattern:
//   - priceChartHtml(snapshots, fxRate) returns the SVG + legend markup
//   - PRICE_CHART_SCRIPT is the hover-wiring <script> (crosshair + dot + tooltip)
// Axes are computed from the actual data range (identical maths to MTG). MTG keeps
// its own dual-line chart untouched; this module is used only by the 22 others.

// Plotted AUD value for a snapshot row: prefer stored price_aud, else convert
// market_price at the given FX rate (mirrors the existing sparkline fallback).
function audValue(p, fxRate) {
  const a = parseFloat(p.price_aud);
  if (a > 0) return a;
  const m = parseFloat(p.market_price);
  return m > 0 ? m * fxRate : 0;
}

export function priceChartHtml(snapshots, fxRate = 1.45) {
  if (!snapshots || snapshots.length < 2) return '';
  const points = snapshots.slice(-90);
  const prices = points.map(p => audValue(p, fxRate));
  const positive = prices.filter(p => p > 0);
  if (positive.length < 2) return '';

  const maxPrice = Math.max(...positive) * 1.15;
  const minPrice = Math.min(...positive) * 0.85;
  const w = 700, h = 220, pad = { t: 20, r: 20, b: 40, l: 60 };
  const chartW = w - pad.l - pad.r;
  const chartH = h - pad.t - pad.b;
  const n = points.length;

  function toX(i) { return pad.l + (i / (n - 1)) * chartW; }
  function toY(val) { return pad.t + chartH - ((val - minPrice) / (maxPrice - minPrice)) * chartH; }

  const linePath = prices.map((p, i) => (p > 0 ? `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(p)}` : '')).filter(Boolean).join(' ');

  const dates = points.map(p => new Date(p.snapshot_date));
  const labelIdxs = [0, Math.floor(n / 3), Math.floor(2 * n / 3), n - 1];
  const dateLabels = labelIdxs.map(i => {
    const d = dates[i];
    return `<text x="${toX(i)}" y="${h - 5}" text-anchor="middle" fill="#888" font-size="11">${d.getDate()} ${d.toLocaleString('en-AU', { month: 'short' })}</text>`;
  }).join('');

  const yLabels = [minPrice, (minPrice + maxPrice) / 2, maxPrice].map(v => {
    const y = toY(v);
    return `<text x="${pad.l - 5}" y="${y + 4}" text-anchor="end" fill="#888" font-size="11">$${v.toFixed(0)}</text>
            <line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="#333" stroke-width="0.5" stroke-dasharray="4"/>`;
  }).join('');

  // Embed point data for the JS tooltip (single price series, no foil).
  const priceData = JSON.stringify(points.map(p => ({
    d: p.snapshot_date ? String(p.snapshot_date).slice(0, 10) : '',
    nf: audValue(p, fxRate)
  })));

  return `
  <svg id="price-chart-svg" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:700px;cursor:crosshair" data-prices='${priceData}' data-padl="${pad.l}" data-padr="${pad.r}" data-padt="${pad.t}" data-padb="${pad.b}" data-chartw="${chartW}" data-charth="${chartH}" data-n="${n}" data-min="${minPrice}" data-max="${maxPrice}" data-w="${w}" data-h="${h}">
    <defs>
      <linearGradient id="gradNF" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f5a623" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#f5a623" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${yLabels}
    ${dateLabels}
    ${linePath ? `<path d="${linePath}" stroke="#f5a623" stroke-width="2" fill="none"/>` : ''}
    <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + chartH}" stroke="#555" stroke-width="1"/>
    <line x1="${pad.l}" y1="${pad.t + chartH}" x2="${pad.l + chartW}" y2="${pad.t + chartH}" stroke="#555" stroke-width="1"/>
    <!-- Tooltip overlay -->
    <rect id="chart-overlay" x="${pad.l}" y="${pad.t}" width="${chartW}" height="${chartH}" fill="transparent" style="cursor:crosshair"/>
    <g id="chart-tooltip-group" class="chart-tooltip-group" style="display:none;pointer-events:none">
      <line id="chart-tooltip-line" x1="0" y1="${pad.t}" x2="0" y2="${pad.t + chartH}" stroke="rgba(255,255,255,0.25)" stroke-width="1" stroke-dasharray="3"/>
      <circle id="chart-tooltip-dot-nf" r="4" fill="#f5a623" stroke="#fff" stroke-width="1.5"/>
      <rect id="chart-tooltip-bg" rx="5" ry="5" fill="#1a1d2e" stroke="#2d3254" stroke-width="1"/>
      <text id="chart-tooltip-date" fill="#9ba3c4" font-size="10" font-family="sans-serif"/>
      <text id="chart-tooltip-nf" fill="#f5a623" font-size="11" font-family="sans-serif" font-weight="bold"/>
    </g>
  </svg>
  <div class="chart-legend" style="display:flex;gap:16px;justify-content:center;margin-top:8px;font-size:11px;color:#9ba3c4;font-family:sans-serif">
    <span style="color:#f5a623">&#9644; AUD Price</span>
  </div>`;
}

// Hover-wiring script, ported from card-page.mjs (foil row removed). Self-contained
// IIFE: finds #price-chart-svg on the page and attaches mousemove/mouseleave to the
// overlay to drive the crosshair, dot, and date/price tooltip. Safe no-op if absent.
export const PRICE_CHART_SCRIPT = `<script>
(function(){
  var svg = document.getElementById('price-chart-svg');
  if (!svg) return;
  var overlay = document.getElementById('chart-overlay');
  var tooltipGroup = document.getElementById('chart-tooltip-group');
  var tooltipLine = document.getElementById('chart-tooltip-line');
  var tooltipDotNF = document.getElementById('chart-tooltip-dot-nf');
  var tooltipBg = document.getElementById('chart-tooltip-bg');
  var tooltipDate = document.getElementById('chart-tooltip-date');
  var tooltipNF = document.getElementById('chart-tooltip-nf');
  if (!overlay || !tooltipGroup) return;
  var priceData = JSON.parse(svg.dataset.prices || '[]');
  var padL = parseFloat(svg.dataset.padl), padT = parseFloat(svg.dataset.padt);
  var chartW = parseFloat(svg.dataset.chartw), chartH = parseFloat(svg.dataset.charth);
  var n = parseFloat(svg.dataset.n);
  var minP = parseFloat(svg.dataset.min), maxP = parseFloat(svg.dataset.max);
  var svgW = parseFloat(svg.dataset.w);
  function toX(i){ return padL + (i / (n - 1)) * chartW; }
  function toY(val){ return padT + chartH - ((val - minP) / (maxP - minP)) * chartH; }
  overlay.addEventListener('mousemove', function(e){
    var rect = svg.getBoundingClientRect();
    var scaleX = svgW / rect.width;
    var mouseX = (e.clientX - rect.left) * scaleX;
    var relX = mouseX - padL;
    var idx = Math.max(0, Math.min(n - 1, Math.round((relX / chartW) * (n - 1))));
    var pt = priceData[idx];
    if (!pt) return;
    var cx = toX(idx);
    var cyNF = pt.nf > 0 ? toY(pt.nf) : null;
    tooltipLine.setAttribute('x1', cx); tooltipLine.setAttribute('x2', cx);
    if (cyNF !== null) { tooltipDotNF.setAttribute('cx', cx); tooltipDotNF.setAttribute('cy', cyNF); tooltipDotNF.style.display = ''; }
    else { tooltipDotNF.style.display = 'none'; }
    var dateStr = pt.d ? new Date(pt.d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '';
    var nfStr = pt.nf > 0 ? 'AU$' + pt.nf.toFixed(2) : '';
    tooltipDate.textContent = dateStr;
    tooltipNF.textContent = nfStr;
    var lineCount = 1 + (nfStr ? 1 : 0);
    var bw = 96, bh = lineCount * 14 + 12;
    var bx = cx + 8 > svgW - bw - padL ? cx - bw - 8 : cx + 8;
    var by = cyNF !== null ? Math.max(padT, cyNF - bh / 2) : padT + 10;
    tooltipBg.setAttribute('x', bx); tooltipBg.setAttribute('y', by);
    tooltipBg.setAttribute('width', bw); tooltipBg.setAttribute('height', bh);
    tooltipDate.setAttribute('x', bx + 8); tooltipDate.setAttribute('y', by + 12);
    tooltipNF.setAttribute('x', bx + 8); tooltipNF.setAttribute('y', by + 25);
    tooltipGroup.style.display = '';
  });
  overlay.addEventListener('mouseleave', function(){ tooltipGroup.style.display = 'none'; });
})();
</script>`;
