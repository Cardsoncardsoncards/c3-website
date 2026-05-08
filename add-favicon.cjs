// add-favicon.cjs
// Run from repo root: node add-favicon.cjs
// Adds <link rel="icon"> to all HTML files and blog.njk that are missing it.
// Also fixes /c3-logo.png -> /c3logo.png sitewide.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = __dirname;
const FAVICON_TAG = '<link rel="icon" type="image/png" href="/c3logo.png">';
const INSERT_AFTER = '<meta name="viewport"';

// Files to process (relative to repo root)
const HTML_FILES = [
  'blog.html',
  'calendar.html',
  'cards.html',
  'contact.html',
  'content-engine.html',
  'ev-calculator.html',
  'index.html',
  'legal.html',
  'mtg-strixhaven.html',
  'shop.html',
  'tracker.html',
  'vip.html',
];

// Also process the Eleventy template
const NJK_FILES = [
  'blog.njk',
];

const ALL_FILES = [...HTML_FILES, ...NJK_FILES];

let faviconAdded = 0;
let logoFixed = 0;
let alreadyHad = 0;

for (const relPath of ALL_FILES) {
  const filePath = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(filePath)) {
    console.log(`  [SKIP - not found] ${relPath}`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Fix wrong logo path
  if (content.includes('/c3-logo.png')) {
    content = content.replaceAll('/c3-logo.png', '/c3logo.png');
    changed = true;
    logoFixed++;
    console.log(`  [LOGO FIX] ${relPath}`);
  }

  // Add favicon if missing
  if (!content.includes('rel="icon"')) {
    // Insert after the viewport meta line
    const viewportIdx = content.indexOf(INSERT_AFTER);
    if (viewportIdx === -1) {
      console.log(`  [WARN - no viewport meta found] ${relPath} - skipping favicon insert`);
    } else {
      // Find end of that line
      const lineEnd = content.indexOf('\n', viewportIdx);
      const insertAt = lineEnd + 1;
      content = content.slice(0, insertAt) + FAVICON_TAG + '\n' + content.slice(insertAt);
      changed = true;
      faviconAdded++;
      console.log(`  [FAVICON] ${relPath}`);
    }
  } else {
    alreadyHad++;
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

console.log(`\n========================================`);
console.log(`Done.`);
console.log(`  Favicon added:    ${faviconAdded}`);
console.log(`  Logo path fixed:  ${logoFixed}`);
console.log(`  Already had icon: ${alreadyHad}`);
console.log(`========================================`);
