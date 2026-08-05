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
// WHAT THIS DELIBERATELY DOES NOT DO
// It does not preserve a stored slug when the record's computed base slug has changed, for
// example because the card was renamed upstream. Renames still move the slug, which is the
// existing behaviour and is out of scope here. This function only stops COLLISION RESOLUTION
// from moving slugs, which is the actual defect.

const LOOKUP_TIMEOUT_MS = 8000;

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

  // No collisions in this batch means no possible slug movement, so skip the lookup entirely.
  let owners = new Map();
  if (collidingBases.length) {
    owners = await fetchSlugOwners(table, collidingBases, supabaseUrl, serviceKey);
  }

  const slugById = new Map();
  for (const [base, group] of byBase) {
    if (group.length === 1) {
      slugById.set(group[0].id, base);
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
