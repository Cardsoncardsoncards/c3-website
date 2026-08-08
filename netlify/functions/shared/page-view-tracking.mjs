// netlify/functions/shared/page-view-tracking.mjs
//
// Task B. The non-card twin of shared/view-tracking.mjs.
//
// WHY THIS EXISTS. requestFingerprint() had exactly two call sites, card-api.mjs and
// account.mjs, so the only pages this site has ever recorded request provenance for are card
// pages and the signup form. Measured 8 August 2026: GA4 reported 18,814 sessions in 24
// hours while card_views recorded ZERO card views in the preceding hour. The traffic is
// real, it executes JavaScript, and it is not on card pages, so nothing in the database has
// ever seen it. This closes that hole for hub, set, blog and static pages.
//
// It deliberately mirrors view-tracking.mjs rather than inventing a second pattern: same
// localStorage session id under the same key, so a visitor who reads a blog post and then a
// card page is one session across both tables and not two strangers.
//
// It records the PATH and never the query string. Paths on this site are public and already
// in the sitemap, whereas a query string can carry a search term someone typed, and this
// table is not the place for that.

// Escape for safe interpolation into a single-quoted JS string inside an inline <script>,
// identical to view-tracking.mjs. U+2028/U+2029 are built with String.fromCharCode so the
// source stays pure ASCII: a raw line separator inside a regex literal is itself a line
// terminator and would break parsing.
const LS = new RegExp(String.fromCharCode(0x2028), 'g');
const PS = new RegExp(String.fromCharCode(0x2029), 'g');
function jsStr(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/</g, '\\x3C')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(LS, '\\u2028')
    .replace(PS, '\\u2029');
}

/**
 * Returns the <script> string to inject into a non-card page.
 * @param {string} pageType one of 'hub', 'set', 'blog', 'static', 'tool'
 */
export function pageViewTrackingScript(pageType) {
  return `<script>
(function(){
  var SESSION_KEY = 'c3_session';
  function getSession() {
    var s = localStorage.getItem(SESSION_KEY);
    if (!s) { s = Math.random().toString(36).slice(2); localStorage.setItem(SESSION_KEY, s); }
    return s;
  }
  fetch('/api/page-view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: location.pathname,
      pageType: '${jsStr(pageType)}',
      sessionId: getSession()
    })
  }).catch(function(){});
})();
</script>`;
}

// The self-classifying variant, appended once inside shared/nav.mjs so that all 102 dynamic
// page functions are covered by a single edit rather than 102 separate ones.
//
// It works out its own page type from the path instead of taking it as an argument, because
// nav.mjs is called from hub, set, card, tool and account pages alike and threading a new
// required argument through every one of them is exactly the 102-file change this avoids.
//
// CARD PAGES DELIBERATELY POST NOTHING. They already log to card_views through
// view-tracking.mjs, and firing both would put two POSTs on every card view and record the
// same visit in two tables. The path shape is what distinguishes them, and the segment counts
// below are read off the real route configs, not guessed:
//   /cards                      1 segment   the static index
//   /cards/mtg                  2           hub
//   /cards/mtg/black-lotus      3           CARD PAGE, skipped
//   /cards/mtg/sets/alpha       4           set page
//   /cards/weissschwarz/series/x 4          the Weiss Schwarz property hub
export const NAV_PAGE_VIEW_SCRIPT = `<script>
(function(){
  var p = location.pathname.split('/').filter(Boolean);
  // A three segment /cards/ path is a card page and is already covered by card_views.
  if (p.length === 3 && p[0] === 'cards') return;
  var t = 'other';
  if (p.length === 0) t = 'static';
  else if (p[0] === 'cards') t = (p.length === 1) ? 'static' : (p.length === 2 ? 'hub' : 'set');
  else if (p[0] === 'blog') t = 'blog';
  else if (['compare','market','search','account','tools','play','calendar','welcome','subscribe','shop','pricing'].indexOf(p[0]) !== -1) t = 'tool';
  var SESSION_KEY = 'c3_session';
  function getSession() {
    var s = localStorage.getItem(SESSION_KEY);
    if (!s) { s = Math.random().toString(36).slice(2); localStorage.setItem(SESSION_KEY, s); }
    return s;
  }
  fetch('/api/page-view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: location.pathname, pageType: t, sessionId: getSession() })
  }).catch(function(){});
})();
</script>`;
