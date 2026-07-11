// netlify/functions/tcg-releases.mjs
// Serves upcoming set releases from the tcg_releases table for the calendar page.
//
// The calendar keeps its hand-maintained EVENTS array as the source of truth: those
// entries carry descriptions, buy/sell price windows, hub links and AU timing context
// that tcg_releases simply does not have (set_code, street_date, description, publisher,
// image_url, msrp_aud and ebay_search_url are NULL on every row today). This endpoint is
// therefore ADDITIVE: the page uses it only to fill gaps for games the curated list does
// not cover, and never to replace a curated entry. Deduplication happens client-side.
//
// Caveat that must not be lost: these dates are US/TCGplayer street dates. The table's
// is_au_release flag is true on every row and is not trustworthy, so it is ignored here
// and the calendar labels these entries as US street dates rather than AU release dates.

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');

// Rows that are not real, dated set releases a collector would plan around.
// Currently catches MTG's "URL/Convention Promos" style filler.
const JUNK_PATTERNS = [
  /promo/i,
  /convention/i,
  /^url\//i
];

function isJunk(setName) {
  const name = String(setName || '').trim();
  if (!name) return true;
  return JUNK_PATTERNS.some(re => re.test(name));
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=1800, s-maxage=3600'
    }
  });
}

export default async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return json({ error: 'Supabase env vars missing', releases: [] }, 500);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const today = new Date().toISOString().slice(0, 10);
    const path = `tcg_releases?select=game,set_name,release_date,slug&release_date=gte.${today}&order=release_date.asc&limit=200`;

    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) {
      return json({ error: `Supabase ${res.status}`, releases: [] }, 502);
    }

    const rows = await res.json();
    const releases = (Array.isArray(rows) ? rows : [])
      .filter(r => r.release_date && !isJunk(r.set_name))
      .map(r => ({
        game:     String(r.game || '').toLowerCase(),
        name:     String(r.set_name || '').trim(),
        date:     r.release_date,
        slug:     r.slug || null,
        dateType: 'us_street'   // never claim this is an AU date
      }));

    return json({ releases, count: releases.length, filtered: (rows.length || 0) - releases.length });

  } catch (e) {
    clearTimeout(timer);
    return json({ error: e.message, releases: [] }, 500);
  }
};

export const config = { path: '/api/tcg-releases' };
