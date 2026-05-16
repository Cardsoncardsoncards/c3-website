// fix-generators-and-yugioh.js
// Run from repo root: node fix-generators-and-yugioh.js
const fs = require('fs');
const changes = [];

// ============================================================
// FIX 1: Revert generators.html image field back to c.image_url
// (random-card.mjs returns image_url, not image)
// ============================================================
{
  const file = 'src/generators.html';
  let c = fs.readFileSync(file, 'utf8');

  // Revert Fix 1a: c.image -> c.image_url
  const old1a = 'const imgHtml = c.image';
  const new1a = 'const imgHtml = c.image_url';
  if (c.includes(old1a) && !c.includes('const imgHtml = c.image_url')) {
    c = c.replace(old1a, new1a);
    changes.push('generators: imgHtml condition reverted to c.image_url');
  }

  // Revert Fix 1b: c.image in src -> c.image_url
  const old1b = '? `<img src="${c.image}"';
  const new1b = '? `<img src="${c.image_url}"';
  if (c.includes(old1b)) {
    c = c.replace(old1b, new1b);
    changes.push('generators: img src reverted to c.image_url');
  }

  // Revert Fix 2: price back to c.priceDisplay (random-card.mjs returns this)
  const old2 = '${c.price_aud ? (\"AU$\" + parseFloat(c.price_aud).toFixed(2)) : \"Price TBC\"}';
  const new2 = '${c.priceDisplay}';
  if (c.includes(old2)) {
    c = c.replace(old2, new2);
    changes.push('generators: price reverted to c.priceDisplay');
  }

  // Also check for the single-quote version from fix-generators-price.js
  const old2b = "${c.price_aud ? ('AU$' + parseFloat(c.price_aud).toFixed(2)) : 'Price TBC'}";
  if (c.includes(old2b)) {
    c = c.replace(old2b, '${c.priceDisplay}');
    changes.push('generators: price reverted to c.priceDisplay (alt pattern)');
  }

  fs.writeFileSync(file, c, 'utf8');
}

// ============================================================
// FIX 2: random-card.mjs - fix yugioh all-rarity returning empty
// When rarity=all, don't apply any rarity filter at all
// ============================================================
{
  const file = 'netlify/functions/random-card.mjs';
  let c = fs.readFileSync(file, 'utf8');

  // Replace baseRarity filter - when 'all', use empty string not a rarity filter
  const old = `    const baseRarity = \`&rarity=not.is.null&rarity=neq.None\`;
    // Game-specific rarity mappings based on actual DB values
    const rarityMap = {`;

  const fix = `    const baseRarity = \`\`; // No rarity filter when 'all' selected - let all cards through
    // Game-specific rarity mappings based on actual DB values
    const rarityMap = {`;

  if (c.includes(old)) {
    c = c.replace(old, fix);
    changes.push('random-card: yugioh all-rarity baseRarity now empty (no filter)');
  } else {
    // Try alternate pattern
    const old2 = "const baseRarity = `&rarity=not.is.null&rarity=neq.None`;";
    if (c.includes(old2)) {
      c = c.replace(old2, "const baseRarity = ``; // No filter for 'all'");
      changes.push('random-card: yugioh all-rarity fixed (alt pattern)');
    } else {
      console.log('WARN: baseRarity pattern not found in random-card.mjs');
    }
  }

  fs.writeFileSync(file, c, 'utf8');
}

console.log('\nApplied ' + changes.length + ' fixes:');
changes.forEach(c => console.log('  - ' + c));
console.log('\nVerify:');
console.log('  findstr /n "image_url priceDisplay" src\\generators.html');
console.log('  findstr /n "baseRarity" netlify\\functions\\random-card.mjs');
