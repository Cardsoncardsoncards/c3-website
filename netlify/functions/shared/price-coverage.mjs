// netlify/functions/shared/price-coverage.mjs
// Measured price coverage for a game's card table, read live rather than hardcoded.
//
// Why this exists: the "Most Valuable" carousel on a game hub ranks by market_price, so it can
// only ever see the priced subset of a table. On a game where most rows are unpriced, the cards
// it shows as "top by price" are simply the ones that happen to have a price, which reads as a
// claim about the whole set and is not one. This module supplies the number needed to say so on
// the page.
//
// It is read live on every render for a reason: coverage moves every time a sync job runs. The
// three figures that prompted this work (warhammer, dragonballz, wow) had each already drifted
// from the numbers in the task that requested it, within days. A hardcoded percentage is a
// claim with a shelf life, and this repo has enough of those.
//
// Fails to null, never to a guess. A caller that gets null must render no disclosure at all
// rather than a wrong one.

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');

// PostgREST returns the row count in Content-Range as "start-end/total" (or "* /total" when the
// window is empty, which limit=0 makes it). Asking for limit=0 means no rows cross the wire, so
// this costs a count and nothing else.
async function countRows(table, filter) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const qs = `select=id&limit=0${filter ? `&${filter}` : ''}`;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
      signal: controller.signal,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'count=exact',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const range = res.headers.get('content-range');
    if (!range) return null;
    const total = parseInt(range.split('/')[1], 10);
    return Number.isFinite(total) ? total : null;
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

// Returns { total, priced, pct } or null. pct is a Number rounded to one decimal place.
// Note market_price is the unpriced marker on every game except MTG: it is NULL when there is no
// price, never 0. Verified against warhammer_cards, dragonballz_cards and wow_cards, all of which
// have zero rows at market_price = 0.
export async function priceCoverage(table) {
  const [total, priced] = await Promise.all([
    countRows(table, ''),
    countRows(table, 'market_price=not.is.null'),
  ]);
  if (total === null || priced === null || total === 0) return null;
  return { total, priced, pct: Math.round((priced / total) * 1000) / 10 };
}

// The one wording, so the three hubs cannot drift apart. gameLabel is already trusted display
// text from the calling hub's own constants, not database input, so it is interpolated as is.
export function coverageNoteHtml(coverage, gameLabel) {
  if (!coverage) return '';
  return `<p style="text-align:center;color:var(--text2);font-size:12px;max-width:640px;margin:0 auto 16px;line-height:1.5;padding:0 16px">`
    + `<strong>Partial pricing:</strong> only ${coverage.pct}% of ${gameLabel} cards `
    + `(${coverage.priced.toLocaleString('en-AU')} of ${coverage.total.toLocaleString('en-AU')}) currently have market pricing data. `
    + `This ranking sees only those cards, so it is not a ranking of the full set.`
    + `</p>`;
}
