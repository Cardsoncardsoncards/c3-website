// Stable slug assignment for the per-game sync jobs (C3L-55).
//
// THE PROBLEM THIS EXISTS TO SOLVE
// Every <game>_cards and <game>_sets table carries a UNIQUE index on slug alone, while the
// syncs upsert with resolution=merge-duplicates and no on_conflict, so PostgREST conflicts on
// the PRIMARY KEY instead. Those two disagree. Any time the sync decides to give a slug to a
// different row than the one currently holding it, Postgres aborts the whole batch with a
// 23505 and the game stops syncing. That is what froze weissschwarz for 8 days (C3L-48).
//
// WHY THE PREVIOUS TWO ATTEMPTS WERE NOT ENOUGH
// 1. The original guard deduped in arrival order, so the winner changed whenever the upstream
//    API returned a colliding pair in a different order (C3L-48).
// 2. lowest-id-wins removed that flapping but assumed any future colliding row would arrive
//    with a HIGHER id. Upstream ids are not monotonic: measured on onepiece, the set released
//    2026-09-18 holds card ids from 2153581 while sets released 2026-07-31 and 2026-08-22 hold
//    ids from 2163005 and 2164207. A newer product can carry lower ids, and when one lands in
//    an existing colliding group it takes the bare slug off a live row (C3L-55).
//
// THE RULE, and both readings stated plainly per protocol Section 19 point 1:
//
//   RULE 1, principled and the actual fix. Whichever record currently owns a slug in the
//   database keeps it. This is not a heuristic that happens to match the data, it is the
//   invariant the constraint needs: a slug that is already live never moves to another record,
//   so a URL that works today keeps working and the upsert can never try to relocate a taken
//   slug. It holds no matter what ids arrive later, which is exactly what lowest-id-wins could
//   not promise.
//
//   RULE 2, the bootstrap tiebreak, genuinely arbitrary and labelled as such. When a colliding
//   group has NO stored owner yet (a new pair arriving together for the first time), something
//   still has to break the tie, and the lowest id does. That choice is arbitrary: there is no
//   sense in which the lower id is the more canonical record. It is defensible only because
//   nothing is at stake at that moment, no URL is live to protect, and the choice needs to be
//   deterministic so two runs agree. Note what happens next: the moment it is written, RULE 1
//   takes over and freezes it permanently. So the arbitrary decision is made exactly once per
//   group, on a group that has no history, and never revisited. That is the whole reason it is
//   acceptable here when it was not acceptable as the general rule.
//
//   RULE 3, added 11 August 2026 for C3L-56. A record that already owns `${base}-${id}` keeps
//   it even when it is now the ONLY claimant of that base.
//
//   Why this was missing: RULES 1 and 2 only ever ran for a base slug with more than one
//   record in the batch. A group of one took the bare slug unconditionally, with no database
//   lookup at all. That is correct for a record that has always been alone, and wrong for one
//   that was suffixed earlier and whose colliding partner has since disappeared upstream: it
//   is alone now, so it gets the bare slug, and the suffixed URL that has been live and
//   indexed until that moment starts returning 404. Measured on 11 August: 3 rows in
//   `weissschwarz_cards` are in exactly that state.
//
//   This is the same principle as RULE 1, applied to the case RULE 1 could not see. A slug
//   that is live never moves. The cost is that those records keep a suffix they no longer
//   strictly need, which is the deliberate trade: a permanently uglier URL that works beats a
//   tidier one that 404s.
//
// WHAT THIS DELIBERATELY DOES NOT DO
// It does not preserve a stored slug when the record's computed base slug has changed, for
// example because the card was renamed upstream. Renames still move the slug, which is the
// existing behaviour and is out of scope here. This function only stops COLLISION RESOLUTION
// from moving slugs, which is the actual defect.

const LOOKUP_TIMEOUT_MS = 8000;

// RULE 3's lookup is deliberately a different shape from RULE 1's, for cost reasons that were
// measured rather than assumed. RULE 1 asks about a handful of colliding bases, so a
// `slug=in.(...)` chunked at 100 is right. RULE 3 needs to know the stored slug of EVERY record
// in the batch, and doing that the same way costs one request per 100 rows: on the two largest
// tables using this module (yugioh 47,071 rows, pokemon 31,847) that is 470 and 318 extra
// requests per run, against a 15 minute function ceiling that the Pokemon sync ALREADY hits
// (its last run refreshed 166 of 231 sets and spent 654s). That is the cost that made C3L-56
// look not worth fixing.
//
// Reading id and slug for the whole table once, 1,000 rows at a time, costs 48 requests on the
// largest table instead of 470, and is then reused by every per-set call in the same run. That
// is what makes the permanent fix affordable.
const STORED_PAGE      = 1000;
const STORED_MAX_ROWS  = 200000;   // safety stop, well above the largest table
const STORED_TTL_MS    = 15 * 60 * 1000;   // a run's own budget; a warm container must not reuse yesterday's

const storedSlugCache = new Map();   // table -> { at: epochMs, byId: Map|null }

/**
 * Stored slug for every row of `table`, keyed by String(id).
 *
 * FAILS SOFT ON PURPOSE, and this is the load-bearing safety property of RULE 3. RULE 1's
 * lookup throws, because getting collision resolution wrong writes a duplicate slug and aborts
 * the batch with a 23505, which is the outage this module exists to prevent. RULE 3 cannot
 * cause that: the worst case of not knowing is assigning the bare slug, which is exactly what
 * this module did before today. So a failure here degrades to the old behaviour instead of
 * taking down a sync, and 31 sync functions import this file.
 */
async function fetchStoredSlugs(table, supabaseUrl, serviceKey) {
  const hit = storedSlugCache.get(table);
  if (hit && (Date.now() - hit.at) < STORED_TTL_MS) return hit.byId;

  const byId = new Map();
  try {
    let offset = 0;
    for (;;) {
      const url = `${supabaseUrl}/rest/v1/${table}?select=id,slug&order=id.asc&limit=${STORED_PAGE}&offset=${offset}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
      let rows;
      try {
        const res = await fetch(url, {
          headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` },
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 120)}`);
        rows = await res.json();
      } finally {
        clearTimeout(timeout);
      }
      if (!Array.isArray(rows)) throw new Error('non-array response');
      for (const row of rows) {
        if (row && row.id !== undefined && row.id !== null) byId.set(String(row.id), row.slug);
      }
      if (rows.length < STORED_PAGE) break;
      offset += STORED_PAGE;
      if (offset >= STORED_MAX_ROWS) {
        console.warn(`[slug-assign] stored slug scan on ${table} stopped at ${STORED_MAX_ROWS} rows`);
        break;
      }
    }
    storedSlugCache.set(table, { at: Date.now(), byId });
    return byId;
  } catch (err) {
    // Degrade to pre-RULE-3 behaviour rather than failing the sync. Logged loudly, because
    // silently losing slug preservation is the kind of thing this register keeps finding.
    console.warn(`[slug-assign] stored slug scan on ${table} failed, RULE 3 disabled for this run: ${err.message}`);
    storedSlugCache.set(table, { at: Date.now(), byId: null });
    return null;
  }
}

// Fetch the current owner of each candidate bare slug. Only called when a batch actually has a
// collision, which is rare, so a healthy run adds no database round trips at all.
async function fetchSlugOwners(table, slugs, supabaseUrl, serviceKey) {
  const owners = new Map();
  const CHUNK = 100;
  for (let i = 0; i < slugs.length; i += CHUNK) {
    const chunk = slugs.slice(i, i + CHUNK);
    // Built by hand rather than with URLSearchParams, which percent-encodes the characters
    // PostgREST filters rely on.
    // Most slugs reaching here come from slugify() and are [a-z0-9-], but NOT all of them:
    // the weissschwarz sets path uses `s.slug || slugify(...)`, so an upstream-supplied slug
    // goes in raw. A value carrying a double quote, backslash or comma would break out of the
    // quoted list and corrupt the filter. Anything outside the safe set is dropped from the
    // lookup rather than escaped, which is the fail-safe direction: an unlooked-up slug is
    // simply treated as having no stored owner, so the bootstrap tiebreak applies and nothing
    // is written from a malformed query.
    const safe = chunk.filter(s => /^[A-Za-z0-9._~-]+$/.test(s));
    const dropped = chunk.length - safe.length;
    if (dropped) {
      console.warn(`[slug-assign] ${dropped} slug(s) on ${table} skipped from owner lookup, unsafe characters for a PostgREST filter`);
    }
    if (!safe.length) continue;
    const list = safe.map(s => `"${s}"`).join(',');
    const url = `${supabaseUrl}/rest/v1/${table}?select=id,slug&slug=in.(${list})`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) {
        throw new Error(`slug owner lookup on ${table} failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      const rows = await res.json();
      for (const row of rows) owners.set(row.slug, row.id);
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }
  return owners;
}

// items: array of records, each with an .id
// baseSlugFor: (item) => the slug it would get if nothing collided
// Returns a Map of id to final slug.
export async function assignStableSlugs({ items, baseSlugFor, table, supabaseUrl, serviceKey }) {
  const byBase = new Map();
  for (const item of items) {
    const base = baseSlugFor(item);
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(item);
  }

  const collidingBases = [];
  for (const [base, group] of byBase) {
    if (group.length > 1) collidingBases.push(base);
  }

  // No collisions in this batch means no possible slug movement THROUGH RULE 1, so skip that
  // lookup entirely. RULE 3's lookup is separate and is decided below on its own terms.
  let owners = new Map();
  if (collidingBases.length) {
    owners = await fetchSlugOwners(table, collidingBases, supabaseUrl, serviceKey);
  }

  // RULE 3 (C3L-56). Only needed if some base in this batch has exactly one claimant, which is
  // the only case that previously bypassed every lookup. A batch that is entirely collisions
  // pays nothing extra.
  let stored = null;
  const hasLoneGroup = [...byBase.values()].some(g => g.length === 1);
  if (hasLoneGroup) {
    stored = await fetchStoredSlugs(table, supabaseUrl, serviceKey);
  }

  const slugById = new Map();
  for (const [base, group] of byBase) {
    if (group.length === 1) {
      // RULE 3: this record is the only claimant now, but if it is ALREADY stored under the
      // suffixed form then that suffixed URL is live. Keep it. Compared against this record's
      // own `${base}-${id}` specifically, not against "any suffix", so a slug that merely
      // happens to end in digits (a Pokemon card number such as 105/124, which slugifies to
      // `105-124`) is never mistaken for an id suffix. That exact confusion is what made
      // C3L-56 read as 5 orphans when it is 3.
      const only = group[0];
      const suffixed = `${base}-${only.id}`;
      const current = stored ? stored.get(String(only.id)) : undefined;
      slugById.set(only.id, current === suffixed ? suffixed : base);
      continue;
    }
    // RULE 1: if one of these records already owns the bare slug, it keeps it.
    const ownerId = owners.get(base);
    let winner = ownerId === undefined ? null : group.find(item => item.id === ownerId);
    // RULE 2: nothing owns it yet, so break the tie on the lowest id, once, and let the write
    // freeze it.
    if (!winner) {
      winner = group.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
    }
    for (const item of group) {
      slugById.set(item.id, item.id === winner.id ? base : `${base}-${item.id}`);
    }
  }
  return slugById;
}
