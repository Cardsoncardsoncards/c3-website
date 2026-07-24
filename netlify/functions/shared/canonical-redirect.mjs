// netlify/functions/shared/canonical-redirect.mjs
// task-146: retire legacy URL forms with a 301 instead of serving a 404.
//
// Two legacy forms were confirmed live against the site:
//
//   1. Numeric set IDs. The site used to link /cards/<game>/sets/<numeric set_id>. Those links
//      were fixed in cedd586 (28 Jun), but Google still holds the URLs and they 404 today
//      (verified: /cards/lorcana/sets/4500020 is 404 while /cards/lorcana/sets/hyperia-city
//      is 200). There is one such URL per set, so this is the largest single 404 population.
//
//   2. Mixed-case slugs. Slug matching is case sensitive, so /cards/pokemon/XY-Primal-Clash...
//      404s while the lowercase form resolves.
//
// Both helpers are PURE FALLBACKS: they are only ever called on the path that was already
// going to return 404, so a working URL is never touched or slowed. Each returns a Response
// to send, or null to mean "no canonical form, carry on and 404 as before".

function redirect(to) {
  return new Response('', {
    status: 301,
    headers: {
      Location: to,
      // Permanent, but kept revalidatable rather than immutable so that a future slug change
      // is not pinned into CDN caches indefinitely.
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

// /cards/<game>/sets/<numeric id>  ->  /cards/<game>/sets/<slug>
// supabaseGet is the caller's own helper (each set page already has one) so this module does
// not need its own Supabase credentials or fetch policy.
export async function numericSetRedirect(setSlug, table, basePath, supabaseGet) {
  const id = String(setSlug == null ? '' : setSlug);
  if (!/^\d+$/.test(id)) return null;
  try {
    const rows = await supabaseGet(`${table}?id=eq.${encodeURIComponent(id)}&select=slug&limit=1`);
    const slug = Array.isArray(rows) && rows[0] ? rows[0].slug : null;
    return slug ? redirect(`${basePath}/${slug}`) : null;
  } catch {
    // A lookup failure must not turn a 404 into a 500. Fall through to the normal 404.
    return null;
  }
}

// Any path carrying uppercase characters -> the canonical all-lowercase form.
// Cannot loop: the target has no uppercase left, so it can never re-trigger this rule.
export function lowercaseRedirect(pathname, search) {
  if (typeof pathname !== 'string') return null;
  const lower = pathname.toLowerCase();
  if (lower === pathname) return null;
  return redirect(lower + (search || ''));
}
