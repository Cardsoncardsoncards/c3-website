// netlify/functions/shared/security-headers.mjs
//
// One definition of the security response headers every server-rendered page sends.
//
// WHY THIS EXISTS (task-140). `netlify.toml` already carries a `[[headers]]` block for `/*`
// setting X-Frame-Options, Referrer-Policy, Permissions-Policy and X-Content-Type-Options, and
// it looks like it covers the whole site. It does not. **Netlify applies `[[headers]]` to files
// served from the publish directory, not to responses a serverless function builds**, and this
// site renders 98 page functions in code. Measured live on 10 August 2026 before any change:
//
//   /            static    HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
//   /shop        static    the same five
//   /cards/lorcana/sets/fabled      dynamic   HSTS and X-Content-Type-Options ONLY
//   /cards/mtg/ragavan-nimble-pilferer  dynamic   HSTS and X-Content-Type-Options ONLY
//   /compare, /market, /account     dynamic   HSTS and X-Content-Type-Options ONLY
//
// So the config was right and the coverage was half the site. That is the same shape as C3L-136:
// a setting that reads as global and silently does not reach the place it matters.
//
// WHAT IS DELIBERATELY NOT HERE: Content-Security-Policy. A CSP cannot be written safely until
// every inline script, inline event handler and third-party origin is catalogued, which is
// task-141 and is an investigation, not a header. Shipping a guessed CSP would break the site's
// own inline handlers, and a CSP that has to be rolled back is worse than none.
//
// X-Content-Type-Options is included even though dynamic pages already show it, because nothing
// in this codebase sets it: it arrives from the platform. Setting it explicitly means the value
// is owned here rather than inherited from behaviour that could change.

export const SECURITY_HEADERS = {
  // Matches the static value in netlify.toml exactly. Nothing on this site is framed by anything
  // else, and the /account dashboard is the page where clickjacking would actually cost something.
  'X-Frame-Options': 'SAMEORIGIN',

  // Same value as the static block. Sends the full URL same-origin, origin only cross-origin,
  // and nothing at all when downgrading to http. Card pages carry the card name in the path, so
  // the cross-origin case is a real consideration: eBay affiliate links are outbound.
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // Same value as the static block. None of these pages ask for geolocation, camera or
  // microphone, so denying them costs nothing and closes the surface for injected content.
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',

  'X-Content-Type-Options': 'nosniff',
};

/** Merge the security headers into a header object, without letting them clobber a caller. */
export function withSecurityHeaders(headers = {}) {
  return { ...SECURITY_HEADERS, ...headers };
}
