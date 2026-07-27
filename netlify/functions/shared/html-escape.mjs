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

export default escAttr;
