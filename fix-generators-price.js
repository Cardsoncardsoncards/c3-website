// fix-generators-price.js
// Run from repo root: node fix-generators-price.js
const fs = require('fs');
const path = 'src/generators.html';
let content = fs.readFileSync(path, 'utf8');

// The previous fix broke the price line by splitting it across two lines.
// Find and replace the broken fragment with the correct single-line version.
const broken = content.indexOf("result-price\">${c.price_aud ? 'AU</div>");
if (broken === -1) {
  console.log('Broken pattern not found - checking current state:');
  const idx = content.indexOf('result-price');
  console.log(content.slice(idx, idx + 200));
  process.exit(1);
}

// Find the end of the broken fragment (ends with the closing </div> on line 954)
const brokenEnd = content.indexOf("'Price TBC'}</div>", broken) + "'Price TBC'}</div>".length;
const brokenFull = content.slice(broken, brokenEnd);
console.log('Broken fragment found:', JSON.stringify(brokenFull.slice(0, 80)));

const fixed = 'result-price">${c.price_aud ? ("AU$" + parseFloat(c.price_aud).toFixed(2)) : "Price TBC"}</div>';
content = content.slice(0, broken) + fixed + content.slice(brokenEnd);

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed. Verifying...');

const verify = content.indexOf('result-price">${c.price_aud');
console.log('Line context:', content.slice(verify, verify + 100));
