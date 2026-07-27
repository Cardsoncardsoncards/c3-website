// netlify/functions/shared/ebay-link.mjs
// The single place eBay Partner Network affiliate URLs are built.
//
// Why this exists: campid was already 100% consistent across the repo because it comes from
// shared constants, but mkevt, mkcid, mkrid and toolid were set by hand per file. That drifted,
// and 47 eBay URLs ended up missing at least one of them, which breaks attribution on those
// clicks. Building the URL in one place means a new eBay link cannot silently omit a parameter.
//
// Deliberately NOT included: the siteid parameter. The worldwide-routing change strips it so
// that international visitors are routed to their local eBay site automatically, and the audit
// standard in PROJECT.md lists it as something to remove rather than add. Nothing here should
// reintroduce it.
//
// Note for anything that runs in the browser: these helpers run at render time on the server.
// When the search term is only known client side, interpolate EBAY_PARAM_SUFFIX into the
// emitted script instead of calling these functions.

export const EPN_CAMPID  = '5339146789';
export const EBAY_MKRID  = '705-53470-19255-0';
export const EBAY_TOOLID = '10001';
// eBay category 183454 is TCG singles. Scoping a search to it keeps sealed product and
// merchandise out of results that are meant to be single cards.
export const EBAY_SACAT  = '183454';

const STORE_BASE  = 'https://www.ebay.com.au/str/cardsoncardsoncards';
const SEARCH_BASE = 'https://www.ebay.com.au/sch/i.html';

// Every tracking parameter EPN needs, in the order the rest of the site already uses them.
// customId is optional and is only for our own reporting breakdown inside EPN.
function trackingParams(customId) {
  const parts = [
    'mkcid=1',
    `mkrid=${EBAY_MKRID}`,
    `campid=${EPN_CAMPID}`
  ];
  if (customId) parts.push(`customid=${encodeURIComponent(customId)}`);
  parts.push(`toolid=${EBAY_TOOLID}`, 'mkevt=1');
  return parts.join('&');
}

// Ready made suffix for client side string concatenation, with no leading separator.
// Use as: '...?_nkw=' + encodeURIComponent(q) + '&' + EBAY_PARAM_SUFFIX
export const EBAY_PARAM_SUFFIX = trackingParams();

/**
 * eBay AU search URL for a card or product name.
 * @param {string} query      raw search term, encoded here, do not pre-encode
 * @param {object} [opts]
 * @param {string} [opts.customId] EPN customid for reporting
 * @param {boolean} [opts.sacat=true] scope to TCG singles (183454)
 * @param {string|number} [opts.sop] eBay sort order, e.g. 15 for price+postage lowest
 */
export function ebaySearchUrl(query, opts = {}) {
  const { customId, sacat = true, sop } = opts;
  let url = `${SEARCH_BASE}?_nkw=${encodeURIComponent(query)}`;
  if (sacat) url += `&_sacat=${EBAY_SACAT}`;
  if (sop !== undefined && sop !== null) url += `&_sop=${sop}`;
  return `${url}&${trackingParams(customId)}`;
}

/**
 * C3 eBay store URL. Pass a query to search within the store, omit it for the store front.
 * @param {string} [query]    raw search term, encoded here, do not pre-encode
 * @param {object} [opts]
 * @param {string} [opts.customId] EPN customid for reporting
 * @param {boolean} [opts.sacat=false] scope to TCG singles (183454)
 * @param {string|number} [opts.sop] eBay sort order
 */
export function ebayStoreUrl(query, opts = {}) {
  const { customId, sacat = false, sop } = opts;
  let url = STORE_BASE;
  const bits = [];
  if (query) bits.push(`_nkw=${encodeURIComponent(query)}`);
  if (sacat) bits.push(`_sacat=${EBAY_SACAT}`);
  if (sop !== undefined && sop !== null) bits.push(`_sop=${sop}`);
  bits.push(trackingParams(customId));
  return `${url}?${bits.join('&')}`;
}
