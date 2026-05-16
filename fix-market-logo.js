// fix-market-logo.js
// Run from repo root: node fix-market-logo.js
const fs = require('fs');

// Fix 1: market-insights.mjs logo
{
  const file = 'netlify/functions/market-insights.mjs';
  let c = fs.readFileSync(file, 'utf8');

  const oldLogo = `<a href="/" class="nav-logo">C3</a>`;
  const newLogo = `<a href="/" class="nav-logo"><img src="/c3logo.png" alt="C3" style="height:32px;width:32px;border-radius:6px;object-fit:cover;flex-shrink:0;margin-right:8px"><span>Cards on Cards on Cards</span></a>`;

  if (c.includes(oldLogo)) {
    c = c.replace(oldLogo, newLogo);
    // Also update the nav-logo CSS to flex
    const oldLogoCSS = `.nav-logo{font-family:'Cinzel',serif;font-size:13px;font-weight:700;color:var(--accent);letter-spacing:.12em;text-transform:uppercase;text-decoration:none}`;
    const newLogoCSS = `.nav-logo{display:flex;align-items:center;font-family:'Cinzel',serif;font-size:11.5px;font-weight:700;color:#C9A84C;letter-spacing:.12em;text-transform:uppercase;text-decoration:none;white-space:nowrap;flex-shrink:0}`;
    if (c.includes(oldLogoCSS)) {
      c = c.replace(oldLogoCSS, newLogoCSS);
      console.log('FIXED: market-insights.mjs logo image + CSS');
    } else {
      console.log('FIXED: market-insights.mjs logo image (CSS not found - check manually)');
    }
    fs.writeFileSync(file, c, 'utf8');
  } else {
    console.log('WARN: market-insights old logo not found');
    const idx = c.indexOf('nav-logo');
    if (idx !== -1) console.log('Context:', c.slice(idx, idx + 100));
  }
}

// Fix 2: Check all hub files for same text logo issue
const hubs = [
  'netlify/functions/pokemon-hub.mjs',
  'netlify/functions/lorcana-hub.mjs',
  'netlify/functions/onepiece-hub.mjs',
  'netlify/functions/dragonball-hub.mjs',
  'netlify/functions/starwars-hub.mjs',
  'netlify/functions/riftbound-hub.mjs',
  'netlify/functions/yugioh-hub.mjs',
  'netlify/functions/card-compare.mjs',
  'netlify/functions/card-index.mjs',
];

const oldLogoText = `class="nav-logo">C3</a>`;
const newLogoFull = `class="nav-logo"><img src="/c3logo.png" alt="C3" style="height:32px;width:32px;border-radius:6px;object-fit:cover;flex-shrink:0;margin-right:8px"><span>Cards on Cards on Cards</span></a>`;

for (const file of hubs) {
  if (!fs.existsSync(file)) continue;
  let c = fs.readFileSync(file, 'utf8');
  if (c.includes(oldLogoText)) {
    c = c.replace(oldLogoText, newLogoFull);
    fs.writeFileSync(file, c, 'utf8');
    console.log('FIXED logo: ' + file);
  }
}

console.log('Done.');
