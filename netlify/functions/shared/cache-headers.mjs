import { SECURITY_HEADERS } from './security-headers.mjs';
// netlify/functions/shared/cache-headers.mjs
// Single definition of the CDN caching policy for public HTML pages, so the durations
// can be reviewed in one place instead of being read off 100 separate header literals.
//
// Why this exists (measured 8 August 2026, task-bot-caching):
// Every public page on this site was ALREADY cached before this module landed. 101 of the
// 101 HTML page functions that register a route set a shared-cache directive, all of them
// paired with a durable Netlify-CDN-Cache-Control. There was no coverage gap. What there
// was, was one asymmetry: card-page.mjs (MTG) carried stale-while-revalidate and the other
// 31 games' card pages did not.
//
// That gap is not cosmetic. Without stale-while-revalidate, the first request after
// s-maxage expires BLOCKS on a full origin render. A cold card page was measured at 2.97s.
// With it, that request is served the stale copy immediately and the refresh happens
// behind it, so no visitor ever waits for the regeneration. Verified live on MTG before
// this module was written: /cards/mtg/sengir-vampire served a copy with age 46100 (12.8
// hours stale) and the very next request 3 seconds later came back with age 3, which is
// the background revalidation completing and swapping the entry. So the pattern is proven
// on this site's own infrastructure, not just on paper.
//
// On the durations. They are deliberately far SHORTER than the rate the data behind them
// actually changes, which is the safe direction to be wrong in. Measured sync cadence on
// 8 August 2026: most games' <game>_cards had last been written 14 to 24 hours earlier,
// mtg_cards 21.5 hours, starwars 46.6, dbsfusionworld 41.6, and pokemon_cards 238 hours
// (its sync was deliberately retired in d17fa89, tracked as C3L-61). Nothing on this site
// updates faster than roughly hourly. An s-maxage of 1 to 2 hours therefore cannot serve a
// price that the database has since changed by more than one sync cycle.
//
// The browser-facing max-age is preserved from what each page already sent rather than
// tuned here. It is a separate question, and a real one: max-age=3600 means a returning
// visitor keeps their own copy for an hour even after the CDN has refreshed. Changing it
// is a behaviour change for real people, not a bot-load change, so it is left alone.

const HTML = 'text/html; charset=utf-8';

// Netlify serves the durable, cross-region cache from Netlify-CDN-Cache-Control and falls
// back to Cache-Control for anything that does not understand it. The ",durable" suffix is
// what opts the entry into the persistent tier, and it is appended only to the Netlify
// header: putting it on the standard Cache-Control would be an unknown token to every
// other cache in the path.
export function htmlCacheHeaders({ maxAge, sMaxAge, swr }) {
  return headers({ maxAge, sMaxAge, swr });
}

function headers({ maxAge, sMaxAge, swr }) {
  const parts = ['public'];
  if (maxAge != null) parts.push(`max-age=${maxAge}`);
  parts.push(`s-maxage=${sMaxAge}`);
  if (swr != null) parts.push(`stale-while-revalidate=${swr}`);
  const value = parts.join(', ');
  // task-140. Every page function in this repo builds its response headers through this one
  // function, via cardPageHeaders, mtgCardPageHeaders, setPageHeaders, hubPageHeaders or
  // htmlCacheHeaders directly, so it is the single place the security headers can be added
  // without editing 98 files. They are spread FIRST so a caller merging its own headers over
  // the result still wins, and so nothing here can silently override a Content-Type.
  return {
    ...SECURITY_HEADERS,
    'Content-Type': HTML,
    'Cache-Control': value,
    'Netlify-CDN-Cache-Control': `${value},durable`,
  };
}

// Card pages. s-maxage and max-age keep the values 29 of the 31 non-MTG card pages were
// already sending; only stale-while-revalidate is added. finalfantasy and unionarena were
// the two that diverged, at max-age=1800 and s-maxage=3600, and they are brought onto this
// policy: their sync cadence was measured at 21.1 and 20.6 hours, the same as everything
// else, so the shorter window reflected drift rather than a decision about their data.
export function cardPageHeaders() {
  return headers({ maxAge: 3600, sMaxAge: 7200, swr: 86400 });
}

// MTG's own card page is deliberately NOT moved onto this helper in the same change that
// introduces it. It already sends s-maxage=3600 with stale-while-revalidate=86400 and no
// max-age, it is the highest-traffic page on the site, and it is the live reference this
// whole policy was validated against. Changing the reference and the things measured
// against it at the same time would leave nothing to compare a regression to.
export function mtgCardPageHeaders() {
  return headers({ maxAge: null, sMaxAge: 3600, swr: 86400 });
}

// Set pages. All 31 *-set-page.mjs files were sending exactly the same literal, so this is
// a straight lift with stale-while-revalidate added and nothing else altered.
export function setPageHeaders() {
  return headers({ maxAge: 900, sMaxAge: 1800, swr: 86400 });
}

// Hub pages. 31 of the 33 hub files were on these durations. The other two are NOT moved
// onto this preset, and the reason is that their durations cannot be shown to be drift the
// way finalfantasy and unionarena's could:
//
//   yugioh-hub.mjs   max-age=300, s-maxage=300   arrived in 1a1fa87 alongside the durable
//                    rollout, with no comment. yugioh_cards is in the fast-syncing group
//                    (1.9 hours stale when measured), so a short window is at least
//                    consistent with its data, and raising it 12-fold on no evidence would
//                    be a behaviour change dressed up as a cleanup.
//   mtg-hub.mjs      s-maxage=3600, no max-age   the same shape MTG's card page uses, and
//                    MTG is the live reference this policy was validated against.
//
// Both instead call htmlCacheHeaders directly with their own numbers, so they gain
// stale-while-revalidate, which is purely additive, and keep every duration they had.
export function hubPageHeaders() {
  return headers({ maxAge: 1800, sMaxAge: 3600, swr: 86400 });
}
