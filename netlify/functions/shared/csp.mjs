// netlify/functions/shared/csp.mjs
//
// Content-Security-Policy for the CSP PILOT. Applied to ONE page type on purpose
// (mtg-banned.mjs, /cards/mtg/banned/:format?) and deliberately not sitewide.
//
// WHY A PILOT. A re-derived count on 11 August 2026 found 1,336 inline event handlers across
// netlify/functions and 1,037 across src/*.html. A sitewide CSP shipped blind would break an
// unknown share of those silently, because a CSP violation does not throw where the developer
// can see it: the handler simply never runs, the page looks fine, and the button does nothing.
// That is the exact silent-failure shape this register keeps recording.
//
// TWO THINGS ABOUT THIS POLICY THAT ARE EASY TO GET WRONG, both load bearing:
//
// 1. script-src carries a NONCE and NOT 'unsafe-inline'. That is the point of the exercise.
//    Note that adding a nonce makes browsers IGNORE 'unsafe-inline' in the same directive, so
//    the two cannot be combined as a belt-and-braces measure. Once a nonce is present, every
//    inline script without it is blocked, which is why the page's inline handler had to move.
//
// 2. style-src carries 'unsafe-inline' and deliberately NO nonce, which looks like a mistake
//    and is not. A nonce cannot authorise a `style="..."` ATTRIBUTE, only a <style> element,
//    and the piloted page carries 18 inline style attributes. Adding a nonce here would switch
//    off 'unsafe-inline' by the same rule as above and break every one of them. Removing style
//    attributes is a much larger job than removing handlers and is out of scope for the pilot.
//    So this policy hardens scripts, which is where injection actually executes, and does not
//    yet harden styles. Stated plainly rather than presented as a complete CSP.
//
// object-src 'none' and base-uri 'self' are the two cheap directives that close base-tag
// injection and legacy plugin execution, and neither costs this site anything.

/** Fresh per response. Must never be reused across requests or it stops being a nonce. */
export function makeNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[^A-Za-z0-9]/g, '');
}

/**
 * @param {string} nonce value from makeNonce(), which must also appear on every inline <script>
 * @returns {string} the header value
 */
export function cspHeader(nonce) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    // GA4 loads gtag/js from googletagmanager. The inline bootstrap carries the nonce.
    `script-src 'self' 'nonce-${nonce}' https://www.googletagmanager.com`,
    // GA4 beacons. Region-sharded hosts are why these are wildcards rather than exact.
    "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
    // Card art comes from several upstreams per game (Scryfall for MTG, tcgapi and others
    // elsewhere) and data: covers inline SVG placeholders.
    "img-src 'self' data: https:",
    // See note 2 above. NO nonce here, on purpose.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "form-action 'self'",
    "upgrade-insecure-requests"
  ].join('; ');
}
