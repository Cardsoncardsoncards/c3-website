// netlify/functions/shared/view-tracking.mjs
// Single source of truth for the client-side card-view logging snippet, injected
// into every game's card page (matching the shared/nav.mjs injectable-string
// pattern). Posts one view to /api/card-view on page load with a persistent
// localStorage session id. card_ref is scryfall_id for MTG (ambiguous slugs) and
// the unique slug for the other 31 games; the caller passes the right value.

// Escape a value for safe interpolation into a single-quoted JS string literal
// that lives inside an inline <script> (per the XSS audit standard): neutralise
// backslashes, quotes, '<' (so a value can't emit "</script>"), and line breaks.
// The U+2028/U+2029 line separators are built via String.fromCharCode so the
// source stays pure ASCII -- a raw line separator inside a regex literal is itself
// a line terminator and would break parsing.
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

// Returns the <script> string to inject into a card page's rendered HTML.
export function viewTrackingScript(game, cardRef) {
  return `<script>
(function(){
  var SESSION_KEY = 'c3_session';
  function getSession() {
    var s = localStorage.getItem(SESSION_KEY);
    if (!s) { s = Math.random().toString(36).slice(2); localStorage.setItem(SESSION_KEY, s); }
    return s;
  }
  fetch('/api/card-view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game: '${jsStr(game)}', cardRef: '${jsStr(cardRef)}', sessionId: getSession() })
  }).catch(function(){});
})();
</script>`;
}
