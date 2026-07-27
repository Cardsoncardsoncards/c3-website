// scripts/generate-sitemap-cards.mjs
// Runs at build time (before Eleventy) via npm run build
// Fetches all MTG card slugs from Supabase and writes sitemap-cards.xml
// Also writes sitemap-pokemon.xml, sitemap-lorcana.xml, sitemap-yugioh.xml
// This replaces the timing-out Netlify Function approach
//
// Price thresholds (balance SEO value vs crawl budget):
//   MTG: one file, sitemap-cards.xml. A slug is submitted when its RESOLVED printing (see
//        shared/card-resolver.mjs) is AU$5.00 or more, which is the same gate card-page.mjs
//        uses for noindex since task-150. The old two-file $2.00 / $0.25-$1.99 split and
//        sitemap-cards-2.xml were retired in task-82.
//   Pokemon/Lorcana/YuGiOh: any card with an image

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const SITE_URL     = 'https://cardsoncardsoncards.com.au';
const PAGE_SIZE    = 1000;
const OUT_DIR      = '.'; // write to repo root — passthrough to _site

import { writeFileSync } from 'fs';

// The one shared rule for resolving an ambiguous card slug to a single printing, so the
// sitemap cannot disagree with the card page about which printing a URL represents.
import { PRICED_FILTER, MTG_RULE_COLUMNS, pickNewestPriced } from '../netlify/functions/shared/card-resolver.mjs';

// Retry-with-backoff for transient Supabase failures (5xx, 429, network errors).
// Exponential backoff: 0.5s, 1s, 2s, 4s. Client errors (other 4xx) fail fast —
// they will not self-heal. If every attempt fails the error propagates to
// main()'s catch, which exits non-zero so the build fails LOUDLY rather than
// shipping an empty/partial sitemap. This decouples transient blips (retried
// and usually recovered) from genuine outages (still block the deploy).
const MAX_RETRIES = 4;
async function fetchWithRetry(url, options, label) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (res.status < 500 && res.status !== 429) {
        throw new Error(`Supabase ${label} fetch failed: ${res.status} (non-retryable)`);
      }
      lastErr = new Error(`Supabase ${label} fetch failed: ${res.status}`);
    } catch (e) {
      if (/non-retryable/.test(e.message)) throw e; // client error — do not retry
      lastErr = e;                                   // network error — retryable
    }
    if (attempt < MAX_RETRIES) {
      const delayMs = 500 * 2 ** attempt;
      console.warn(`  ${label}: attempt ${attempt + 1}/${MAX_RETRIES + 1} failed (${lastErr.message}) — retrying in ${delayMs}ms`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

// Cursor-based pagination — avoids Supabase timeout on large offsets
// Uses id > last_seen_id pattern which uses the primary key index efficiently
async function fetchAll(table, select, filters = '') {
  const allRows = [];
  let lastId = null;
  let page = 0;

  while (true) {
    const cursorFilter = lastId ? `&id=gt.${lastId}` : '';
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}&${filters}${cursorFilter}&order=id.asc&limit=${PAGE_SIZE}`;
    const res = await fetchWithRetry(url, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    }, table);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    allRows.push(...rows);
    lastId = rows[rows.length - 1].id;
    page++;
    if (rows.length < PAGE_SIZE) break;
    if (page % 10 === 0) console.log(`  ${table}: fetched ${allRows.length} rows...`);
  }
  return allRows;
}

function buildSitemap(urls, comment) {
  const today = new Date().toISOString().split('T')[0];
  const urlXml = urls.map(({ loc, lastmod, priority }) =>
    `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod || today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>${priority || '0.7'}</priority>\n  </url>`
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- ${comment} — Generated: ${new Date().toISOString()} -->
${urlXml}
</urlset>`;
}

async function generateMtgSitemap() {
  console.log('Generating MTG card sitemap (single file)...');

  // The sitemap must submit exactly what the card page considers indexable, no more and no
  // less. Two things about that had drifted, and both are fixed here.
  //
  // 1. THRESHOLD. task-150 raised the noindex gate from AU$1.00 to AU$5.00 in all 32
  //    card-page functions but did not touch this script, which was still submitting from
  //    AU$1.00. That put the site straight back into the task-81 failure it documents below:
  //    10,554 MTG URLs submitted, 5,119 of them (48.5%) noindexed by the page itself.
  //
  // 2. WHICH PRINTING. This used to keep the highest-priced printing per slug. The card page
  //    resolves "newest priced, priced first" via shared/card-resolver.mjs, so the two
  //    disagreed on 25.5% of priced slugs and the sitemap could submit a URL on the strength
  //    of a printing the page never shows.
  //
  // ORDER OF OPERATIONS MATTERS. The price gate is applied AFTER resolving the printing, not
  // as a query filter before it, because those are not equivalent. A slug whose newest priced
  // printing is AU$3 but which also has an older AU$50 printing would survive a pre-filter of
  // >= 5.00 (the AU$50 row passes), then get submitted, while the page resolves to the AU$3
  // printing and noindexes it. Resolving first and gating second is what makes the two agree.
  //
  // Historical note kept for context: this originally filtered on price_usd (>= 0.25, split
  // into two files at the $2.00 line), a different column in a different currency. USD 0.25 is
  // about AU$0.36, so 9,589 of MTG's 20,094 submitted URLs were noindexed (task-81). One file
  // is enough now: the eligible set is far inside Google's 50,000-per-sitemap limit.
  const INDEX_THRESHOLD_AUD = 5.00; // must track the noindex gate in card-page.mjs

  // Fetch only priced printings, which is the resolver's first pass. A slug with no priced
  // printing anywhere resolves to a null price on the page and is noindexed, so it has no
  // business in a sitemap.
  const all = await fetchAll(
    'mtg_cards',
    `id,slug,updated_at,${MTG_RULE_COLUMNS}`,
    `${PRICED_FILTER}&slug=not.is.null`
  );

  // Group by slug, then apply the one shared rule to pick each winner.
  const grouped = new Map();
  for (const c of all) {
    if (!c.slug || !c.slug.trim()) continue;
    if (!grouped.has(c.slug)) grouped.set(c.slug, []);
    grouped.get(c.slug).push(c);
  }

  const bySlug = new Map();
  let belowThreshold = 0;
  for (const [slug, rows] of grouped) {
    const winner = pickNewestPriced(rows);
    if (!winner) continue;
    const price = parseFloat(winner.price_aud) || 0;
    // Gate on the resolved printing, exactly as the page does.
    if (price < INDEX_THRESHOLD_AUD) { belowThreshold++; continue; }
    bySlug.set(slug, { slug, price, updated_at: winner.updated_at });
  }
  console.log(`  MTG: ${all.length} priced rows -> ${grouped.size} distinct slugs -> ${bySlug.size} submitted (${belowThreshold} below AU$${INDEX_THRESHOLD_AUD.toFixed(2)}, would be noindexed)`);

  const urls = [...bySlug.values()].map(c => ({
    loc: `${SITE_URL}/cards/mtg/${c.slug}`,
    lastmod: c.updated_at ? c.updated_at.slice(0, 10) : null,
    priority: c.price >= 20 ? '0.9' : c.price >= 5 ? '0.8' : '0.7'
  }));

  // Sanity guard: this file should always contain thousands of cards. An empty result means
  // the query silently returned nothing (e.g. a partial Supabase outage) — treat it as a hard
  // failure rather than shipping an empty sitemap that de-indexes every MTG card page.
  if (urls.length === 0) {
    throw new Error('mtg_cards (AU$5.00+ resolved) returned 0 rows, refusing to write an empty sitemap-cards.xml');
  }

  if (urls.length >= 50000) {
    throw new Error(`mtg_cards returned ${urls.length} URLs — exceeds the 50,000 per-sitemap limit, must be split again`);
  }

  writeFileSync(`${OUT_DIR}/sitemap-cards.xml`, buildSitemap(urls, `MTG card pages: ${urls.length} cards at AU$1.00+`));
  console.log(`  MTG: ${urls.length} URLs written to sitemap-cards.xml`);

  return urls.length;
}

// NOTE: pokemon / lorcana / yugioh / onepiece / riftbound / starwars / dragonball
// are no longer generated statically here. Each is served at runtime by its
// /api/sitemap-<game> Netlify Function and referenced directly from
// sitemap-index.xml. The old build-time generators swallowed Supabase failures
// and shipped empty (or missing) sitemaps — removing them eliminates that
// failure mode. Only MTG stays static (its URL count times out the Function).

async function main() {
  console.log('=== Sitemap Generation Start ===', new Date().toISOString());

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    // Local builds have no Supabase credentials (they live only in Netlify env).
    // Do NOT overwrite the committed sitemap-cards*.xml artifacts with empty
    // fallbacks — that silently de-indexes every MTG card page. Leave the
    // existing files in place and let Eleventy pass them through unchanged.
    console.warn('Missing SUPABASE_URL or key — skipping build-time sitemap regeneration (local build). Existing sitemaps left untouched.');
    return;
  }

  // Only MTG is generated statically: its ~50k URLs time out the Netlify
  // Function approach, so it is built ahead of Eleventy. Every other game
  // (pokemon, lorcana, yugioh, onepiece, riftbound, starwars, dragonball) is
  // served at runtime by its /api/sitemap-* function and referenced directly
  // from sitemap-index.xml — no static generation needed here.
  //
  // Credentials are present, so a fetch failure below MUST fail the build
  // (see the non-zero exit in main().catch) rather than ship an empty sitemap.
  // A failed build keeps the previous good deploy — and its good sitemaps — live.
  const mtg = await generateMtgSitemap();
  console.log(`=== Sitemap Generation Complete === Total MTG URLs: ${mtg}`);
}

main().catch(err => {
  // Credentials were present but generation failed (Supabase error / empty result).
  // Exit non-zero so Netlify fails the deploy instead of publishing empty sitemaps.
  console.error('Sitemap generation FAILED:', err.message);
  process.exit(1);
});
