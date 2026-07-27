// netlify/functions/shared/url-slug.mjs
// Turning a URL path segment back into the slug value stored in the database.
//
// The bug this fixes: url.pathname is PERCENT-ENCODED. Every set page read the slug with
//   url.pathname.replace(/^\/cards\/<game>\/sets\//, '').replace(/\/$/, '')
// and then passed the result straight to encodeURIComponent() for the PostgREST filter. For a
// slug containing any non-ASCII character that double-encodes:
//
//   stored slug   dz-ps01-premium-deckset-“jewel-knight”
//   requested     /cards/vanguard/sets/dz-ps01-premium-deckset-%e2%80%9cjewel-knight%e2%80%9d
//   pathname      ...-%e2%80%9cjewel-knight%e2%80%9d      (still encoded)
//   then encoded  ...-%25e2%2580%259cjewel-knight...      (the % became %25)
//
// which can never match, so the page 404s. Pure ASCII slugs have nothing percent-encoded, so
// they survive the round trip untouched. That is exactly why slugs containing ~ or _ work
// (both are RFC 3986 unreserved characters) while smart quotes and en dashes do not.
//
// decodeURIComponent THROWS a URIError on a malformed sequence, for example a lone "%" in a
// hand-typed or truncated URL. Left unguarded that turns a 404 into a 500, so the decode is
// wrapped and falls back to the raw segment.

/**
 * Decode one path segment into the raw slug value. Never throws.
 * @param {string} segment percent-encoded path segment
 * @returns {string}
 */
export function decodeSlugSegment(segment) {
  const s = segment == null ? '' : String(segment);
  try {
    return decodeURIComponent(s);
  } catch {
    // Malformed percent sequence. Return it unchanged so the lookup simply misses and the
    // caller renders its normal "not found" page, rather than throwing a 500.
    return s;
  }
}

export default decodeSlugSegment;
