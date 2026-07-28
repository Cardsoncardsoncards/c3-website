// netlify/functions/shared/html-escape.mjs
// The one HTML escaper for values that come out of the database and go into markup.
//
// Why this exists: card names routinely carry characters that are structural in HTML, and
// several call sites were interpolating them raw or escaping only the double quote. On
// /cards/mtg/henzie-toolbox-torre that produced, live:
//
//     <img id="card-front" src="..." alt="Henzie "Toolbox" Torre" width="300">
//
// The browser reads that as alt="Henzie " followed by two junk attributes, Toolbox and
// Torre". The image still renders, which is why it survived, but the accessible name is
// truncated to "Henzie", the alt text Google indexes is wrong, and the tag is invalid.
//
// Scale in the live data, counted 27 Jul 2026 across the games served:
//   double quote  6,370 names   weissschwarz 5,235, vanguard 562, yugioh 239, pokemon 179...
//   ampersand     2,100+ names  weissschwarz 1,032, pokemon 586, yugioh 276, mtg 62...
//   apostrophe    11,700+ names mtg alone has 6,133
//   < or >        zero, in every game
//
// The ampersand count is the reason a quote-only replace is not enough. A bare & is invalid
// in an attribute value, and a name containing a sequence like "&amp" or "&lt" would be
// re-read by the browser as a partial entity.
//
// This is NOT an XSS fix and should not be described as one. Card names come from Scryfall
// and tcgapi, not from user input, and no name in any game contains < or >. It is a
// correctness and accessibility fix. It escapes < and > anyway, because the next data source
// may not be as well behaved and the cost of covering them is nothing.
//
// Escape ORDER matters: & must be replaced first, or the & introduced by a later replacement
// gets double-escaped and &quot; renders as &amp;quot;.

const AMP = /&/g;
const LT = /</g;
const GT = />/g;
const DQ = /"/g;
const SQ = /'/g;

/**
 * Escape a value for interpolation into an HTML attribute delimited by single or double
 * quotes, or into element text. Covers the full structural set.
 * null and undefined become an empty string rather than the literal "null".
 * @param {*} value
 * @returns {string}
 */
export function escAttr(value) {
  return (value === null || value === undefined ? '' : String(value))
    .replace(AMP, '&amp;')
    .replace(LT, '&lt;')
    .replace(GT, '&gt;')
    .replace(DQ, '&quot;')
    .replace(SQ, '&#39;');
}

// Same transform, named for the element-text case so call sites read honestly about intent.
// Kept as an alias rather than a second implementation, so the two cannot drift.
export const escHtml = escAttr;

// task-155: the client-side twin of escAttr.
//
// task-151 escaped every card name the SERVER writes into markup, and deliberately stopped
// there. It could not reach the compare tray, which is rendered in the browser: the tray reads
// its entries back out of localStorage and rebuilds its own innerHTML long after the server has
// finished. So the same card names that are correctly escaped everywhere else on the page were
// still going in raw there, and a name like Henzie "Toolbox" Torre broke out of the alt
// attribute exactly as it used to server-side.
//
// This is a STRING containing a function definition, not a function, because it has to be
// interpolated into an inline <script> block. Emitting one shared definition is what stops the
// card pages from growing their own slightly different copies, which is how the server-side
// escaping drifted in the first place.
//
// Deliberately contains no backtick and no dollar-brace, so it is safe to interpolate into the
// server-side template literals the card pages are built from.
//
// Scope note: this is for HTML contexts (attribute values and element text). It is NOT correct
// for a value going into a JS string literal inside an attribute, e.g. onclick="f('VALUE')",
// because the HTML parser decodes the entity before JS sees it and &#39; would turn back into a
// quote. Those call sites pass slugs, which are already normalised to lowercase alphanumerics
// and hyphens, so they are left as they are rather than given a false sense of safety here.
export const CLIENT_ESCAPE_FN = [
  'function c3Esc(v){',
  "  return (v===null||v===undefined?'':String(v))",
  "    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')",
  "    .replace(/\"/g,'&quot;').replace(/'/g,'&#39;');",
  '}'
].join('\n');

export default escAttr;
