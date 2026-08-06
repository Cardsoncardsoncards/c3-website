// scripts/lib/set-card-data.mjs
// Phase 1 of the MTG set blog generator.
//
// Exports getSetCardData(setName, mode) which returns the deduped top 20 cards
// for one MTG set, in one of two modes:
//
//   'expensive' -> ranked by the highest price_aud across that card name's
//                  printings in the set (descending).
//   'played'    -> ranked by the lowest edhrec_rank across that card name's
//                  printings in the set (ascending, lower is more played).
//
// Dedup is by card NAME within the set. A set routinely carries the same card
// several times (showcase, borderless, extended art, surge foil), and a top 20
// that lists Smaug four times is not a top 20. The representative row for a
// name is the highest priced printing in 'expensive' mode and the lowest
// ranked printing in 'played' mode, with the remaining printings' prices kept
// in other_prices so a post can say "four printings, the rest sit lower".
//
// Prices are price_aud. MTG is the schema exception in this repo: mtg_cards
// uses image_uri and price_aud, not image_url and market_price.
//
// This module reads only. It never writes a file.

import { createClient } from '@supabase/supabase-js';

// The project ref is public (it is in CLAUDE.md and in every browser request).
// The key is not, and is only ever read from the environment.
const DEFAULT_SUPABASE_URL = 'https://owaroeqchreuffbyakqx.supabase.co';

const PAGE_SIZE = 1000; // PostgREST caps a single response at 1000 rows.

// A set needs at least this many rows carrying an edhrec_rank before a
// "most played" post is worth generating.
export const MIN_EDHREC_ROWS = 10;

// Below this many distinct priced names, an "expensive" post has nothing to say.
export const MIN_PRICED_NAMES = 5;

let cachedClient = null;

function getClient() {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!key) {
    throw new Error(
      'No Supabase key found. Set SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY) ' +
      'in the environment, for example: node --env-file=.env <script>'
    );
  }

  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}

// Columns the post assembly actually needs. Never select *.
const SELECT_COLUMNS = [
  'name',
  'price_aud',
  'image_uri',
  'slug',
  'edhrec_rank',
  'rarity',
  'collector_number',
  'released_at',
  'set_release_date',
].join(',');

// mtg_cards has NO index on set_name, and the table is ~99k rows, so filtering
// on set_name is a sequential scan and hits the statement timeout. There IS an
// index on (set_code, collector_number), so every read goes through set_code
// and the ordering below is covered by that same index. set_name maps 1:1 to
// set_code across the whole table (verified: zero names carry two codes), so
// resolving through mtg_sets loses nothing.
const setCodeCache = new Map();

export async function resolveSetCode(setName) {
  if (setCodeCache.has(setName)) return setCodeCache.get(setName);

  const supabase = getClient();
  const { data, error } = await supabase
    .from('mtg_sets')
    .select('set_code,set_name')
    .eq('set_name', setName)
    .limit(1);

  if (error) throw new Error(`Supabase read failed for mtg_sets "${setName}": ${error.message}`);

  const code = data && data.length ? data[0].set_code : null;
  setCodeCache.set(setName, code);
  return code;
}

/**
 * Pull every row for one set, paging past the 1000 row PostgREST cap.
 * Ordered by collector_number so paging is stable between requests.
 *
 * @param {string} setName
 * @param {string} [setCode] pass it in if already known to skip the lookup
 */
export async function fetchSetRows(setName, setCode) {
  const supabase = getClient();
  const code = setCode || await resolveSetCode(setName);

  if (!code) {
    throw new Error(
      `No set_code found in mtg_sets for set_name "${setName}". ` +
      'Reading mtg_cards by set_name alone is unindexed and times out, so this is fatal.'
    );
  }

  const rows = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('mtg_cards')
      .select(SELECT_COLUMNS)
      .eq('set_code', code)
      .order('collector_number', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Supabase read failed for "${setName}" (${code}): ${error.message}`);
    }
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  return rows;
}

// mtg_cards stores "no price" as 0, not NULL. Across the whole table not one
// row has a NULL price_aud, while 15,630 of 98,739 sit at exactly 0. So an
// "IS NOT NULL" price filter is a no op here, and a 0 handed to the post
// generator would be quoted as a real AU$0.00 asking price. Anything at or
// below zero is therefore treated as unpriced.
function toPrice(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

// Numeric where possible so "10" sorts after "9", falling back to string
// compare for collector numbers like "312b" or "SLD-4".
function collectorSortKey(value) {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

/**
 * Group raw rows by card name.
 * Each group carries every printing of that name found in the set.
 */
function groupByName(rows) {
  const groups = new Map();

  for (const row of rows) {
    if (!row.name) continue;
    if (!groups.has(row.name)) groups.set(row.name, []);
    groups.get(row.name).push({
      ...row,
      price_aud: toPrice(row.price_aud),
    });
  }

  return groups;
}

/**
 * Build one output entry from ALL printings of a single name.
 *
 * `printings` is always the complete list for that name in the set, never a
 * pre-filtered subset, so printing_count means the same thing in both modes.
 * `pick` receives that complete list and is responsible for narrowing it to
 * the candidates its mode can rank.
 */
function buildEntry(name, printings, pick) {
  const prices = printings
    .map(p => p.price_aud)
    .filter(p => p !== null)
    .sort((a, b) => b - a);

  const rep = pick(printings);

  // The representative printing is chosen on price or rank, and the cheapest
  // or least played printing is sometimes the one missing artwork. Fall back
  // to any sibling printing that does have an image rather than shipping a
  // post with a broken image tag.
  const image = rep.image_uri || printings.find(p => p.image_uri)?.image_uri || null;
  const slug = rep.slug || printings.find(p => p.slug)?.slug || null;

  const ranks = printings
    .map(p => p.edhrec_rank)
    .filter(r => r !== null && r !== undefined);

  return {
    name,
    priced_printing_count: prices.length,
    // The headline price is the highest priced printing of this name in this
    // set, in BOTH modes, so that a price quoted in a blurb means the same
    // thing whichever post it appears in.
    price_aud: prices.length ? prices[0] : null,
    other_prices: prices.slice(1),
    printing_count: printings.length,
    edhrec_rank: ranks.length ? Math.min(...ranks) : null,
    image_uri: image,
    slug,
    url: slug ? `/cards/mtg/${slug}` : null,
    rarity: rep.rarity ?? null,
    released_at: rep.released_at || rep.set_release_date || null,
  };
}

/**
 * getSetCardData
 *
 * @param {string} setName  exact mtg_cards.set_name value
 * @param {'expensive'|'played'} mode
 * @returns {Promise<{
 *   setName: string, mode: string, skipped: boolean, skipReason: string|null,
 *   entries: Array<object>, stats: object
 * }>}
 *
 * A skipped result is not an error. It carries skipped:true plus a human
 * readable skipReason, and an empty entries array, so the orchestrator can
 * log it and move to the next set.
 */
export async function getSetCardData(setName, mode, setCode) {
  if (mode !== 'expensive' && mode !== 'played') {
    throw new Error(`Unknown mode "${mode}". Expected 'expensive' or 'played'.`);
  }

  const rows = await fetchSetRows(setName, setCode);

  const stats = {
    total_rows: rows.length,
    priced_rows: rows.filter(r => toPrice(r.price_aud) !== null).length,
    zero_priced_rows: rows.filter(r => Number(r.price_aud) === 0).length,
    edhrec_rows: rows.filter(r => r.edhrec_rank !== null && r.edhrec_rank !== undefined).length,
    distinct_names: new Set(rows.map(r => r.name)).size,
  };

  const skip = (reason) => ({
    setName, mode, skipped: true, skipReason: reason, entries: [], stats,
  });

  if (rows.length === 0) {
    return skip(`no rows found in mtg_cards for set_name "${setName}"`);
  }

  const groups = groupByName(rows);

  if (mode === 'expensive') {
    // Only names with at least one real price can be ranked on price. The full
    // printing list is kept so printing_count stays honest.
    const priced = [...groups.entries()]
      .filter(([, printings]) => printings.some(p => p.price_aud !== null));

    stats.priced_names = priced.length;

    if (priced.length < MIN_PRICED_NAMES) {
      return skip(
        `only ${priced.length} distinct priced cards, need at least ${MIN_PRICED_NAMES}`
      );
    }

    const entries = priced
      .map(([name, printings]) => buildEntry(name, printings, (list) => {
        // Highest price wins. Ties break on the lower collector number so the
        // same run always picks the same printing.
        return [...list]
          .filter(p => p.price_aud !== null)
          .sort((a, b) =>
            (b.price_aud - a.price_aud) ||
            (collectorSortKey(a.collector_number) - collectorSortKey(b.collector_number))
          )[0];
      }))
      .sort((a, b) => (b.price_aud - a.price_aud) || a.name.localeCompare(b.name))
      .slice(0, 20);

    return { setName, mode, skipped: false, skipReason: null, entries, stats };
  }

  // mode === 'played'
  if (stats.edhrec_rows < MIN_EDHREC_ROWS) {
    return skip(
      `only ${stats.edhrec_rows} rows carry an edhrec_rank, need at least ${MIN_EDHREC_ROWS}`
    );
  }

  // A "most played" entry still has to show a price, so a name needs both a
  // rank and at least one priced printing to qualify.
  const rankable = [];
  let droppedUnpriced = 0;

  for (const [name, printings] of groups.entries()) {
    const ranked = printings.filter(
      p => p.edhrec_rank !== null && p.edhrec_rank !== undefined
    );
    if (ranked.length === 0) continue;

    if (!printings.some(p => p.price_aud !== null)) {
      droppedUnpriced += 1;
      continue;
    }
    rankable.push([name, printings, ranked]);
  }

  stats.rankable_names = rankable.length;
  stats.dropped_unpriced_names = droppedUnpriced;

  if (rankable.length === 0) {
    return skip('no cards carry both an edhrec_rank and a price');
  }

  const entries = rankable
    .map(([name, printings]) => buildEntry(name, printings, (list) => {
      // Lowest edhrec_rank wins, ties break on collector number.
      return [...list]
        .filter(p => p.edhrec_rank !== null && p.edhrec_rank !== undefined)
        .sort((a, b) =>
          (a.edhrec_rank - b.edhrec_rank) ||
          (collectorSortKey(a.collector_number) - collectorSortKey(b.collector_number))
        )[0];
    }))
    .sort((a, b) => (a.edhrec_rank - b.edhrec_rank) || a.name.localeCompare(b.name))
    .slice(0, 20);

  return { setName, mode, skipped: false, skipReason: null, entries, stats };
}

/**
 * List the mainline MTG sets (expansion + core), newest first.
 * Used by the phase 4 orchestrator. Kept here so the set list and the card
 * data come from the same module.
 */
export async function listMainlineSets() {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('mtg_sets')
    .select('set_name,set_code,set_type,release_date,card_count')
    .in('set_type', ['expansion', 'core'])
    .order('release_date', { ascending: false });

  if (error) throw new Error(`Supabase read failed for mtg_sets: ${error.message}`);
  return data || [];
}

// --- CLI test harness -------------------------------------------------
// node --env-file=.env scripts/lib/set-card-data.mjs "The Hobbit" expensive
// Prints results only. Writes nothing.

const invokedDirectly =
  process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/lib/set-card-data.mjs');

if (invokedDirectly) {
  const [, , setArg, modeArg] = process.argv;

  const targets = setArg
    ? [[setArg, modeArg || 'expensive']]
    : [
        ['The Hobbit', 'expensive'],
        ['The Hobbit', 'played'],
        ['Foundations', 'expensive'],
        ['Foundations', 'played'],
        ['The List', 'expensive'],
      ];

  for (const [setName, mode] of targets) {
    const result = await getSetCardData(setName, mode);

    console.log('\n' + '='.repeat(72));
    console.log(`SET: ${setName}   MODE: ${mode}`);
    console.log('stats:', JSON.stringify(result.stats));

    if (result.skipped) {
      console.log(`SKIPPED: ${result.skipReason}`);
      continue;
    }

    console.log(`entries returned: ${result.entries.length}`);
    const uniq = new Set(result.entries.map(e => e.name)).size;
    console.log(`distinct names:   ${uniq}${uniq === result.entries.length ? ' (ok)' : ' (DUPLICATES)'}`);
    console.log('-'.repeat(72));

    result.entries.forEach((e, i) => {
      const rank = mode === 'played' ? ` edhrec#${e.edhrec_rank}` : '';
      const others = e.other_prices.length
        ? `  others: ${e.other_prices.map(p => p.toFixed(2)).join(', ')}`
        : '';
      console.log(
        `${String(i + 1).padStart(2)}. ${e.name}\n` +
        `    AU$${e.price_aud === null ? 'n/a' : e.price_aud.toFixed(2)}${rank}` +
        `  printings: ${e.printing_count}${others}`
      );
      console.log(`    ${e.url}   image: ${e.image_uri ? 'yes' : 'MISSING'}`);
    });
  }
}
