// netlify/functions/enrich-apitcg-stats-background.mjs
// One-off bulk backfill of gameplay stats from apitcg.com into custom_attributes
// for 5 games: Digimon, Gundam, Union Arena, Riftbound, Dragon Ball Fusion World.
//
// Unlike the per-card enrichment pattern used for the task-48 games, apitcg.com
// supports bulk pagination (100 cards per request), so the whole catalogue for a
// game is pulled in a few dozen requests and joined in memory. Roughly 219 requests
// covers all 5 games, well inside the Free plan's 1,000/month quota.
//
// Join: apitcg `code` to the C3 `number` column, both normalised with trim + uppercase.
// Validated match rates: Digimon 100%, Gundam 100%, DBFW 100%, Union Arena 99%, Riftbound 95%.
// Riftbound misses are token cards (codes like "T01 // T05") that C3 does not stock.
//
// apitcg `code` is NOT unique: promos and reprints of a card share the base card's
// code (Gundam is the worst case, roughly half of any page). Gameplay attributes are
// identical across those variants and only Rarity differs, so the map keeps the FIRST
// entry seen per code and counts the collapsed duplicates for the log.
//
// Trigger: manual POST with an x-sync-secret header, same as sync-sales-history.mjs.
// Not scheduled. Once the backfill is complete, a much lighter periodic re-run
// (monthly, to pick up new sets) could be scheduled later if wanted, but that is a
// separate decision and no schedule entry is added to netlify.toml here.
//
// Pass ?dryRun=1 to report match rates without writing anything.

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const APITCG_API_KEY       = Netlify.env.get('APITCG_API_KEY');
const SYNC_SECRET          = Netlify.env.get('SYNC_SECRET');

const GAMES = [
  { game: 'digimon',        slug: 'digimon',                        table: 'digimon_cards'        },
  { game: 'gundam',         slug: 'gundam',                         table: 'gundam_cards'         },
  { game: 'unionarena',     slug: 'union-arena',                    table: 'unionarena_cards'     },
  { game: 'riftbound',      slug: 'riftbound',                      table: 'riftbound_cards'      },
  { game: 'dbsfusionworld', slug: 'dragon-ball-super-fusion-world', table: 'dbsfusionworld_cards' },
];

const PAGE_SIZE     = 100;   // apitcg max per request
const UPSERT_CHUNK  = 300;   // rows per Supabase write
const SUPABASE_PAGE = 1000;  // rows per Supabase read
const MAX_PAGES     = 200;   // per-game runaway guard
const CALL_DELAY_MS = 120;

let apitcgRequests = 0;

function normaliseCode(value) {
  return String(value == null ? '' : value).trim().toUpperCase();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Thrown when apitcg reports the monthly quota is gone. That cannot recover part way
// through a run, so it aborts everything rather than letting each remaining game spend
// more requests discovering the same wall (the first live run burned 22 that way).
class QuotaExhaustedError extends Error {}

async function apitcgGetPage(slug, page) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const url = `https://api.apitcg.com/api/products?tcg=${encodeURIComponent(slug)}&type=card&limit=${PAGE_SIZE}&page=${page}`;
    const res = await fetch(url, {
      headers: { 'x-api-key': APITCG_API_KEY },
      signal: controller.signal
    });
    clearTimeout(timer);
    apitcgRequests++;
    if (res.status === 429) {
      throw new QuotaExhaustedError(`apitcg 429: ${(await res.text()).slice(0, 200)}`);
    }
    if (!res.ok) throw new Error(`apitcg ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    return Array.isArray(body.data) ? body.data : [];
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function supabaseGet(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// Upserts only id + custom_attributes. Every id here already exists (it was just read
// back from this table), so PostgREST takes the ON CONFLICT DO UPDATE path and touches
// only the custom_attributes column. No other column is written.
async function supabaseUpsert(table, rows) {
  if (!rows.length) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(rows),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Upsert ${table} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// Pull every card for one game from apitcg and key it by normalised code.
async function buildAttributeMap(slug, log) {
  const map = new Map();
  let fetched = 0;
  let duplicates = 0;
  let page = 1;

  while (page <= MAX_PAGES) {
    const cards = await apitcgGetPage(slug, page);
    if (cards.length === 0) break;
    fetched += cards.length;

    for (const card of cards) {
      const code = normaliseCode(card.code);
      if (!code) continue;
      if (!card.attributes || typeof card.attributes !== 'object') continue;
      if (map.has(code)) { duplicates++; continue; }  // first entry wins
      map.set(code, card.attributes);
    }

    if (cards.length < PAGE_SIZE) break;  // short page means end of data
    page++;
    await sleep(CALL_DELAY_MS);
  }

  if (page > MAX_PAGES) log.push(`  WARNING: hit MAX_PAGES guard (${MAX_PAGES}), data may be truncated`);
  log.push(`  apitcg: ${fetched} cards fetched, ${map.size} unique codes, ${duplicates} duplicate codes collapsed`);
  return map;
}

// Read every row of a C3 table, paging through with select=id,number only.
async function readCardRows(table) {
  const rows = [];
  let offset = 0;
  while (true) {
    const page = await supabaseGet(
      `${table}?select=id,number&number=not.is.null&order=id.asc&limit=${SUPABASE_PAGE}&offset=${offset}`
    );
    if (!Array.isArray(page) || page.length === 0) break;
    rows.push(...page);
    if (page.length < SUPABASE_PAGE) break;
    offset += SUPABASE_PAGE;
  }
  return rows;
}

async function enrichGame(cfg, dryRun, log) {
  const { game, slug, table } = cfg;
  log.push(`--- ${game.toUpperCase()} (${slug}) ---`);

  const requestsBefore = apitcgRequests;
  const attrMap = await buildAttributeMap(slug, log);

  const rows = await readCardRows(table);
  const matched = [];
  let unmatched = 0;

  for (const row of rows) {
    const attributes = attrMap.get(normaliseCode(row.number));
    if (!attributes) { unmatched++; continue; }
    matched.push({ id: row.id, custom_attributes: attributes });
  }

  const requestsUsed = apitcgRequests - requestsBefore;
  const pct = rows.length ? ((matched.length / rows.length) * 100).toFixed(1) : '0.0';
  log.push(`  C3: ${rows.length} rows read, ${matched.length} matched (${pct}%), ${unmatched} unmatched`);
  log.push(`  apitcg requests used: ${requestsUsed}`);

  if (dryRun) {
    log.push(`  DRY RUN: no rows written`);
    return { game, apitcgCards: attrMap.size, requestsUsed, rows: rows.length, matched: matched.length, unmatched, written: 0 };
  }

  let written = 0;
  for (let i = 0; i < matched.length; i += UPSERT_CHUNK) {
    const chunk = matched.slice(i, i + UPSERT_CHUNK);
    await supabaseUpsert(table, chunk);
    written += chunk.length;
  }
  log.push(`  wrote custom_attributes to ${written} rows`);

  return { game, apitcgCards: attrMap.size, requestsUsed, rows: rows.length, matched: matched.length, unmatched, written };
}

export default async (req) => {
  // This is a Netlify background function: it returns 202 with an empty body
  // immediately and the Response below is discarded. Logs are therefore the ONLY
  // channel for results, so every line is console.log'd as well as collected.
  const secret = req.headers.get('x-sync-secret');
  if (secret !== SYNC_SECRET) {
    console.warn('[enrich-apitcg] Unauthorized: bad or missing x-sync-secret');
    return new Response('Unauthorized', { status: 401 });
  }
  if (!APITCG_API_KEY) {
    console.error('[enrich-apitcg] APITCG_API_KEY not configured');
    return new Response('APITCG_API_KEY not configured', { status: 500 });
  }

  const url = new URL(req.url);
  const dryRun     = url.searchParams.get('dryRun') === '1';
  const gameFilter = url.searchParams.get('game') || null;

  const log = {
    lines: [],
    push(line) {
      console.log(`[enrich-apitcg] ${line}`);
      this.lines.push(line);
    }
  };
  const results = [];
  apitcgRequests = 0;

  const gamesToProcess = gameFilter
    ? GAMES.filter(g => g.game === gameFilter)
    : GAMES;

  if (gamesToProcess.length === 0) {
    console.error(`[enrich-apitcg] Unknown game: ${gameFilter}`);
    return new Response(`Unknown game: ${gameFilter}`, { status: 400 });
  }

  log.push(dryRun ? 'DRY RUN: matching only, no writes' : 'LIVE RUN: writing custom_attributes');

  let quotaExhausted = false;

  for (const cfg of gamesToProcess) {
    try {
      results.push(await enrichGame(cfg, dryRun, log));
    } catch (e) {
      log.push(`  ERROR (${cfg.game}): ${e.message}`);
      results.push({ game: cfg.game, error: e.message });
      if (e instanceof QuotaExhaustedError) {
        // Every remaining game would just spend more requests hitting the same wall.
        quotaExhausted = true;
        log.push('  ABORTING RUN: apitcg monthly quota is exhausted. Nothing further will be attempted.');
        log.push('  The quota is per apitcg account and resets monthly. Rotating the key does NOT reset it.');
        break;
      }
      // Any other single-game failure should not abort the rest of the run.
    }
  }

  const summary = {
    dryRun,
    quotaExhausted,
    totalApitcgRequests: apitcgRequests,
    quotaNote: 'Free plan allows 1000 requests/month, per account, resets monthly',
    totalMatched:   results.reduce((n, r) => n + (r.matched   || 0), 0),
    totalUnmatched: results.reduce((n, r) => n + (r.unmatched || 0), 0),
    totalWritten:   results.reduce((n, r) => n + (r.written   || 0), 0),
    results,
    log: log.lines
  };

  console.log(`[enrich-apitcg] SUMMARY ${JSON.stringify(summary)}`);

  return new Response(JSON.stringify(summary, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
};

export const config = {};
