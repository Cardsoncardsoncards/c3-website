// netlify/functions/shared/card-resolver.mjs
// The ONE rule for turning an ambiguous card slug into a single card row.
//
// task-153 UPDATE, READ THIS BEFORE ADDING A CALLER. This module now answers two DIFFERENT
// questions, and picking the wrong one reintroduces the bug below in a subtler form:
//
//   resolveCardBySlug()  "given only a name, which printing should we show?"  A RULE.
//     Correct for surfaces that genuinely only ever hold a slug: the MTG card page itself
//     (someone browsing, following nothing), /compare's legacy slug links, and the sitemap.
//
//   resolveFollowCard()  "which printing did this person actually follow?"    A STORED FACT.
//     Correct for every surface holding a follow row: the confirmation email, the confirm
//     page, the account dashboard and the alert emails. It falls back to the rule when a
//     follow has no printing recorded, so it is never worse than resolveCardBySlug.
//
// If you are reading a follows row, call resolveFollowCard. The rule below is a fallback, not
// a default. Making the surfaces agree with EACH OTHER (task-152) is not the same as making
// them agree with WHAT THE PERSON CLICKED, which is what storing the printing achieves.
//
// Why this exists: slug is not unique in mtg_cards. Every printing is its own row while the
// card page is served per slug, so something has to choose. Seven surfaces were each choosing
// independently, and they disagreed. The card page picked one printing, while the confirmation
// email, the confirm page, the account page, the alert emails, /compare and the sitemap all
// picked another. A follow on Ragavan, Nimble Pilferer displayed the Final Fantasy crossover
// printing on the card page and the Modern Horizons 2 printing (AU$86.79) everywhere else,
// consistently with each other and consistently wrong against the screen.
//
// THE RULE, and it is the only one now: "newest priced, priced first".
//   1. A priced printing always beats an unpriced one. An unpriced row leaves priceAud null,
//      which suppresses Product schema and ships the page noindex.
//   2. Among priced printings the most recently released wins, so the headline reflects the
//      printing a buyer is most likely holding rather than an Alpha or Beta copy.
//   3. price_aud descending is the tiebreak, because 14.7% of priced slugs have more than one
//      printing sharing their newest release date. Without it those fall back to an arbitrary
//      row, which is the original bug.
// This is NOT "dearest". Do not reintroduce a bare order=price_aud.desc lookup anywhere.
//
// MTG IS THE EXCEPTION, and the branch below is load bearing, not defensive padding.
// Only mtg_cards has released_at and price_usd. Every other game's table has market_price and
// no released_at at all, so applying the MTG ordering to them is a hard PostgREST 400
// (42703, column does not exist), verified against the live API. Those 31 tables also have
// ZERO duplicate slugs (max one row per slug, because the tcgapi syncs already suffix
// colliding slugs with the card id), so there is nothing to disambiguate for them and a plain
// slug lookup is both correct and sufficient.
//
// Callers pass their OWN authenticated getter as `fetcher`. The module deliberately does not
// own the HTTP call or read any environment variable: the function callers each already have
// a getter bound to the right key (anon for public reads, service for the follow paths), and
// scripts/generate-sitemap-cards.mjs runs at build time where Netlify.env does not exist.
// Owning the fetch would mean either duplicating auth or crashing on import in the build.

import { GAME_TABLES, GAME_PRINTING_COL } from './game-meta.mjs';

// A priced printing, expressed once for the query path and once for the in-memory path.
export const PRICED_FILTER = 'or=(price_aud.gt.0,price_usd.not.is.null)';
export const NEWEST_FIRST  = 'order=released_at.desc.nullslast,price_aud.desc.nullslast';

// Columns the in-memory comparator needs. Bulk consumers that dedupe locally must select
// these, or the rule silently degrades to whatever order the rows arrived in.
export const MTG_RULE_COLUMNS = 'released_at,price_aud,price_usd';

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

/** Does this row carry a usable price, by the same test card-page.mjs uses for priceAud? */
export function isPriced(row) {
  if (!row) return false;
  return num(row.price_aud) > 0 || (row.price_usd !== null && row.price_usd !== undefined);
}

/**
 * In-memory comparator implementing the rule. Sort ASCENDING with this and the winner is
 * first, matching what the PostgREST ordering above returns.
 * For bulk consumers that already hold every row and must not make one request per slug.
 */
export function compareNewestPriced(a, b) {
  const ap = isPriced(a), bp = isPriced(b);
  if (ap !== bp) return ap ? -1 : 1;              // priced first
  const ar = a.released_at || '', br = b.released_at || '';
  if (ar !== br) return ar < br ? 1 : -1;         // newest first, nulls last
  return num(b.price_aud) - num(a.price_aud);     // dearest as the tiebreak only
}

/** Pick the single winning row from a set of rows for one slug. */
export function pickNewestPriced(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  let best = rows[0];
  for (let i = 1; i < rows.length; i++) {
    if (compareNewestPriced(rows[i], best) < 0) best = rows[i];
  }
  return best;
}

/**
 * Resolve one slug to one row.
 *
 * @param {(path: string) => Promise<object[]>} fetcher caller's authenticated PostgREST getter
 * @param {string} game   game key, e.g. 'mtg'
 * @param {string} slug   card slug
 * @param {object} [opts]
 * @param {string} [opts.select='*'] PostgREST select list. Ordering does not require the
 *        ordered columns to be selected, so a narrow select is fine here.
 * @returns {Promise<object|null>}
 */
export async function resolveCardBySlug(fetcher, game, slug, opts = {}) {
  const table = GAME_TABLES[game];
  if (!table || !slug) return null;
  const select = opts.select || '*';
  const base = `${table}?slug=eq.${encodeURIComponent(slug)}&select=${select}`;

  // Non-MTG: slugs are unique, and released_at/price_usd do not exist on these tables.
  if (game !== 'mtg') {
    const rows = await fetcher(`${base}&limit=1`);
    return (Array.isArray(rows) && rows[0]) || null;
  }

  const priced = await fetcher(`${base}&${PRICED_FILTER}&${NEWEST_FIRST}&limit=1`);
  if (Array.isArray(priced) && priced.length) return priced[0];

  // No priced printing anywhere (963 MTG slugs). Still render, just without a price.
  const any = await fetcher(`${base}&${NEWEST_FIRST}&limit=1`);
  return (Array.isArray(any) && any[0]) || null;
}

/**
 * Resolve the card for a FOLLOW row: the exact printing it recorded, or the shared rule.
 *
 * task-153. resolveCardBySlug() above answers "which printing should we show for this slug",
 * which is a rule, a best guess made from a name. This answers the different and better
 * question "which printing did this person actually follow", which is a stored fact whenever
 * one exists. Every surface that holds a follow row should call THIS, not resolveCardBySlug.
 *
 * The fallback is not defensive padding, it is reached by real rows:
 *   - the follows that predate task-153 have printing_id null (the MTG one deliberately stays
 *     null, because which printing it meant was never recorded and guessing it would be a
 *     fabrication), and
 *   - a printing can vanish from under a stored id when a sync drops or replaces a row.
 * Both land on exactly the pre-task-153 behaviour rather than on an error or a blank card.
 *
 * @param {(path: string) => Promise<object[]>} fetcher caller's authenticated PostgREST getter
 * @param {string} game        game key, e.g. 'mtg'
 * @param {string} slug        card slug, used for the fallback
 * @param {string|null} printingId  follows.printing_id, or null/'' when the row has none
 * @param {object} [opts]
 * @param {string} [opts.select='*']
 * @returns {Promise<object|null>}
 */
export async function resolveFollowCard(fetcher, game, slug, printingId, opts = {}) {
  const table = GAME_TABLES[game];
  if (!table) return null;

  const col = GAME_PRINTING_COL[game];
  if (printingId && col) {
    const select = opts.select || '*';
    try {
      const rows = await fetcher(
        `${table}?${col}=eq.${encodeURIComponent(printingId)}&select=${select}&limit=1`
      );
      if (Array.isArray(rows) && rows[0]) return rows[0];
    } catch {
      // Fall through to the slug rule rather than failing the whole surface on one lookup.
    }
  }

  return resolveCardBySlug(fetcher, game, slug, opts);
}

/**
 * Batch form of resolveFollowCard for one game, for surfaces holding many follows at once.
 *
 * Splits the follows into those that recorded a printing and those that did not, then makes
 * at most two requests per game: one `in.(...)` over the stored printing ids, and one
 * resolveCardsBySlugs for the remainder. It stays proportional to the number of GAMES a
 * person follows, not the number of CARDS, which is the property the account page needs.
 *
 * @param {(path: string) => Promise<object[]>} fetcher
 * @param {string} game
 * @param {Array<{card_slug: string, printing_id?: string|null}>} follows rows for this game
 * @param {object} [opts]
 * @param {string} [opts.select='*']
 * @returns {Promise<{byPrinting: Map<string, object>, bySlug: Map<string, object>}>}
 */
export async function resolveFollowCards(fetcher, game, follows, opts = {}) {
  const table = GAME_TABLES[game];
  const col   = GAME_PRINTING_COL[game];
  const byPrinting = new Map();
  const bySlug     = new Map();
  const rowsIn = Array.isArray(follows) ? follows : [];
  if (!table || !rowsIn.length) return { byPrinting, bySlug };

  let select = opts.select || '*';
  const withPrinting = rowsIn.filter(f => f && f.printing_id);
  const ids = [...new Set(withPrinting.map(f => String(f.printing_id)))];

  // The returned rows must carry the key column, or they cannot be indexed back onto a follow.
  if (ids.length && col && select !== '*' && !select.split(',').includes(col)) {
    select += `,${col}`;
  }

  const jobs = [];

  if (ids.length && col) {
    const list = ids.map(v => `"${v}"`).join(',');
    jobs.push(
      fetcher(`${table}?select=${select}&${col}=in.(${encodeURIComponent(list)})`)
        .then(rows => {
          for (const r of (Array.isArray(rows) ? rows : [])) {
            if (r && r[col] !== null && r[col] !== undefined) byPrinting.set(String(r[col]), r);
          }
        })
        .catch(() => { /* the per-follow fallback below covers a failed batch */ })
    );
  }

  // Anything with no stored printing, plus anything whose stored printing no longer exists,
  // still needs the slug rule. The miss set can only be computed after the batch resolves.
  const slugsAlways = rowsIn.filter(f => f && !f.printing_id).map(f => f.card_slug);

  await Promise.all(jobs);

  const slugsMissed = withPrinting
    .filter(f => !byPrinting.has(String(f.printing_id)))
    .map(f => f.card_slug);

  const needSlug = [...new Set([...slugsAlways, ...slugsMissed].filter(Boolean))];
  if (needSlug.length) {
    const picked = await resolveCardsBySlugs(fetcher, game, needSlug, { select: opts.select || '*' })
      .catch(() => new Map());
    for (const [slug, r] of picked) if (r) bySlug.set(slug, r);
  }

  return { byPrinting, bySlug };
}

/**
 * Resolve many slugs for one game in a single round trip, then apply the same rule locally.
 * Used where a per-slug query would mean one request per row, e.g. the account page listing
 * up to 100 follows.
 *
 * @returns {Promise<Map<string, object>>} slug -> winning row
 */
export async function resolveCardsBySlugs(fetcher, game, slugs, opts = {}) {
  const table = GAME_TABLES[game];
  const out = new Map();
  const unique = [...new Set((slugs || []).filter(Boolean))];
  if (!table || !unique.length) return out;

  let select = opts.select || '*';
  // The local comparator needs these, and only MTG has them.
  if (game === 'mtg' && select !== '*') {
    for (const c of MTG_RULE_COLUMNS.split(',')) {
      if (!select.split(',').includes(c)) select += `,${c}`;
    }
  }

  const list = unique.map(s => `"${s}"`).join(',');
  const rows = await fetcher(
    `${table}?select=${select}&slug=in.(${encodeURIComponent(list)})`
  );

  const grouped = new Map();
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!r || !r.slug) continue;
    if (!grouped.has(r.slug)) grouped.set(r.slug, []);
    grouped.get(r.slug).push(r);
  }
  for (const [slug, list2] of grouped) out.set(slug, pickNewestPriced(list2));
  return out;
}
