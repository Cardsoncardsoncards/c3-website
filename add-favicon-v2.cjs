// add-favicon-v2.cjs
// Run from repo root: node add-favicon-v2.cjs
// Adds <link rel="icon"> and fixes /c3-logo.png -> /c3logo.png on remaining files.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = __dirname;
const FAVICON_TAG = '<link rel="icon" type="image/png" href="/c3logo.png">';
const INSERT_AFTER = '<meta name="viewport"';

// Files missed by v1 (correct paths)
const FILES = [
  'src/calendar.html',
  'src/tracker.html',
  'src/blog.njk',
];

let faviconAdded = 0;
let logoFixed = 0;
let alreadyHad = 0;

for (const relPath of FILES) {
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
    const viewportIdx = content.indexOf(INSERT_AFTER);
    if (viewportIdx === -1) {
      console.log(`  [WARN - no viewport meta] ${relPath} - skipping favicon insert`);
    } else {
      const lineEnd = content.indexOf('\n', viewportIdx);
      const insertAt = lineEnd + 1;
      content = content.slice(0, insertAt) + FAVICON_TAG + '\n' + content.slice(insertAt);
      changed = true;
      faviconAdded++;
      console.log(`  [FAVICON] ${relPath}`);
    }
  } else {
    alreadyHad++;
    console.log(`  [ALREADY HAD] ${relPath}`);
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
