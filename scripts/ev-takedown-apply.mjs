// scripts/ev-takedown-apply.mjs
// Task 24 Piece 3. Applies the "under review" treatment to the UNAUDITED EV calculator pages.
//
// Mechanism, per the task file: noindex + a visible banner + the buy/avoid verdict genuinely
// removed from the HTML. Not CSS-hidden: the verdict markup is deleted and replaced, so there is
// nothing left in the source for a scraper to read.
//
// The 5 pages Task 17 audited individually are EXCLUDED and left exactly as they are.
//
// Every replacement is an exact string match. If any page does not match, that page is reported
// and left untouched rather than being transformed by a looser pattern.

import fs from 'fs';
import path from 'path';

const DIR = 'ev-calculator';

// Task 17 opened these five and logged their defects individually. Left alone.
const AUDITED = new Set([
  'mtg-warhammer-40k.html',
  'mtg-commander-legends-2020.html',
  'mtg-final-fantasy.html',
  'mtg-modern-horizons-3.html',
  'mtg-zendikar-rising.html',
]);

const ROBOTS = '<meta name="robots" content="noindex,follow">';

// follow, not nofollow: the page should stop being indexed, but its outbound and internal links
// are still legitimate and there is no reason to strip their equity on the way out.
const BANNER = `    <div style="border-radius:10px;padding:18px 22px;margin-bottom:24px;background:rgba(245,158,11,.10);border:1px solid rgba(245,158,11,.45)">
      <div style="font-size:11px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#F59E0B;margin-bottom:8px">Under review</div>
      <div style="font-size:15px;font-weight:700;line-height:1.35;margin-bottom:6px">Do not rely on the numbers on this page.</div>
      <div style="font-size:13px;opacity:.85;line-height:1.5">This calculator's product data, meaning its pack structure, slot contents and which chase cards can actually appear, has not been verified against the publisher's official product record. The buy or avoid verdict this page used to show has been removed for that reason. Card prices elsewhere on C3 are unaffected.</div>
    </div>`;

// --- Template A: 42 pages ---------------------------------------------------------------------
const A_MARKUP = `    <div class="verdict-banner" id="verdict-banner">
      <div class="verdict-label" id="verdict-label">Verdict</div>
      <div class="verdict-text" id="verdict-text"></div>
      <div class="verdict-sub" id="verdict-sub"></div>
    </div>`;

const A_JS = `  const banner = document.getElementById('verdict-banner');
  banner.className = 'verdict-banner ' + verdictClass;
  document.getElementById('verdict-label').textContent = 'Verdict for ' + packs + ' pack' + (packs > 1 ? 's' : '');
  document.getElementById('verdict-text').innerHTML = verdict;
  document.getElementById('verdict-sub').textContent = verdictSub;`;

const A_JS_NEW = `  // task-24: the verdict block was REMOVED from this page, not hidden, so there is nothing to
  // write into here. verdictClass and verdictSub are still computed above and deliberately left
  // in place, so restoring the verdict after the catalogue rebuild is a revert of this hunk.`;

const A_CTA = `  document.getElementById('cta-worth').style.display = (verdictClass === 'worth') ? 'block' : 'none';
  document.getElementById('cta-avoid').style.display = (verdictClass !== 'worth') ? 'block' : 'none';`;

const A_CTA_NEW = `  // task-24: both call-to-action blocks are verdict-driven, so they are suppressed with it. The
  // "worth opening, grab it on Amazon" block is the verdict's actionable form and leaving it live
  // while disclaiming the verdict would have been the halfway fix. Markup and affiliate URLs are
  // untouched, so nothing is lost, they simply never display while the page is under review.
  document.getElementById('cta-worth').style.display = 'none';
  document.getElementById('cta-avoid').style.display = 'none';`;

// --- Template B: mtg-secrets-of-strixhaven.html only, an older template -------------------------
// Its verdict text and its CTA block are both built by JS, so nothing verdict-shaped sits in the
// static HTML to begin with. Removing the markup alone would leave the JS writing to null and
// throwing, taking the whole calculator down with it. So the four element lookups are replaced by
// one inert stub: the existing if/else runs untouched, writes into nothing, and cannot throw. The
// branch logic is deliberately left intact so restoring this page is a revert of two hunks.
const B_MARKUP = `    <div class="verdict" id="verdictBlock">
      <div class="verdict-label" id="verdictLabel"></div>
      <div class="verdict-title" id="verdictTitle"></div>
      <div class="verdict-sub" id="verdictSub"></div>
    </div>`;

const B_JS = `  const verdictBlock = document.getElementById('verdictBlock');
  const verdictLabel = document.getElementById('verdictLabel');
  const verdictTitle = document.getElementById('verdictTitle');
  const verdictSub = document.getElementById('verdictSub');
  const ctaBlock = document.getElementById('ctaBlock');`;

const B_JS_NEW = `  // task-24: the verdict block was REMOVED from this page and the CTA block is left empty while
  // it is under review. These five lookups now resolve to one inert stub so the branch logic
  // below still runs and still cannot throw, while rendering nothing at all.
  const _inert = { textContent: '', innerHTML: '', className: '', classList: { add() {} } };
  const verdictBlock = _inert, verdictLabel = _inert, verdictTitle = _inert,
        verdictSub = _inert, ctaBlock = _inert;`;

let changed = 0, skippedAudited = 0, failed = [];

for (const file of fs.readdirSync(DIR).filter(f => f.endsWith('.html')).sort()) {
  if (AUDITED.has(file)) { skippedAudited++; continue; }
  const p = path.join(DIR, file);
  let s = fs.readFileSync(p, 'utf8');
  const before = s;
  const problems = [];

  // These files ship with CRLF terminators. The needles and replacements below are written with
  // LF, so both are converted to match the file rather than the file being rewritten to LF, which
  // would turn every one of these into a whole-file diff and bury the actual change.
  const crlf = s.includes('\r\n');
  const nl = (t) => crlf ? t.replace(/\r?\n/g, '\r\n') : t.replace(/\r\n/g, '\n');

  // 1. noindex, inserted after the <title> line
  if (!s.includes('name="robots"')) {
    const m = s.match(/^(.*<\/title>)$/m);
    if (m) s = s.replace(m[1], `${m[1]}\n${ROBOTS}`);
    else problems.push('no </title> line');
  }

  // 2 + 3. verdict markup out, banner in; verdict JS neutralised
  if (s.includes(nl(A_MARKUP))) {
    s = s.replace(nl(A_MARKUP), nl(BANNER));
    if (s.includes(nl(A_JS))) s = s.replace(nl(A_JS), nl(A_JS_NEW)); else problems.push('template A JS not found');
    if (s.includes(nl(A_CTA))) s = s.replace(nl(A_CTA), nl(A_CTA_NEW)); else problems.push('template A CTA toggle not found');
  } else if (s.includes(nl(B_MARKUP))) {
    s = s.replace(nl(B_MARKUP), nl(BANNER));
    if (s.includes(nl(B_JS))) s = s.replace(nl(B_JS), nl(B_JS_NEW)); else problems.push('template B JS not found');
    if (s.includes('id="verdictBlock"')) problems.push('template B verdict markup survived');
  } else {
    problems.push('no known verdict markup');
  }

  if (problems.length) { failed.push(`${file}: ${problems.join('; ')}`); continue; }
  if (s === before) { failed.push(`${file}: no change produced`); continue; }
  fs.writeFileSync(p, s);
  changed++;
}

console.log(`changed: ${changed}`);
console.log(`skipped (Task 17 audited, left alone): ${skippedAudited}`);
console.log(`failed / untouched: ${failed.length}`);
failed.forEach(f => console.log('  ' + f));
process.exit(failed.length ? 1 : 0);
