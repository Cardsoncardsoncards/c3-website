// scripts/generate-sitemap-cards.mjs
// Runs at build time (before Eleventy) via npm run build
// Fetches all MTG card slugs from Supabase and writes sitemap-cards.xml
// Also writes sitemap-pokemon.xml, sitemap-lorcana.xml, sitemap-yugioh.xml
// This replaces the timing-out Netlify Function approach
//
// Price thresholds (balance SEO value vs crawl budget):
//   MTG: split into two files to stay under Google's 50,000 URL per sitemap limit
//     sitemap-cards.xml   = $2.00+ (~17,000 cards)
//     sitemap-cards-2.xml = $0.25-$1.99 (~33,000 cards)
//   Pokemon/Lorcana/YuGiOh: any card with an image

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const SITE_URL     = 'https://cardsoncardsoncards.com.au';
const PAGE_SIZE    = 1000;
const OUT_DIR      = '.'; // write to repo root — passthrough to _site

import { writeFileSync } from 'fs';

// Cursor-based pagination — avoids Supabase timeout on large offsets
// Uses id > last_seen_id pattern which uses the primary key index efficiently
async function fetchAll(table, select, filters = '') {
  const allRows = [];
  let lastId = null;
  let page = 0;

  while (true) {
    const cursorFilter = lastId ? `&id=gt.${lastId}` : '';
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}&${filters}${cursorFilter}&order=id.asc&limit=${PAGE_SIZE}`;
    const res = await fetch(url, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    if (!res.ok) throw new Error(`Supabase ${table} fetch failed: ${res.status}`);
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
  console.log('Generating MTG card sitemaps (split into 2 files)...');

  // File 1: $2.00+ high value cards
  const cards1 = await fetchAll(
    'mtg_cards',
    'id,slug,price_usd,updated_at',
    'price_usd=gte.2.00&slug=not.is.null'
  );
  const urls1 = cards1
    .filter(c => c.slug && c.slug.trim())
    .map(c => {
      const price = parseFloat(c.price_usd) || 0;
      return {
        loc: `${SITE_URL}/cards/mtg/${c.slug}`,
        lastmod: c.updated_at ? c.updated_at.slice(0, 10) : null,
        priority: price >= 20 ? '0.9' : price >= 5 ? '0.8' : '0.7'
      };
    });
  // Sanity guard: the high-value file should always contain thousands of cards.
  // An empty result here means the query silently returned nothing (e.g. a
  // partial Supabase outage) — treat it as a hard failure rather than shipping
  // an empty sitemap that de-indexes every MTG card page.
  if (urls1.length === 0) {
    throw new Error('mtg_cards ($2.00+) returned 0 rows — refusing to write an empty sitemap-cards.xml');
  }
  writeFileSync(`${OUT_DIR}/sitemap-cards.xml`, buildSitemap(urls1, `MTG card pages: ${urls1.length} cards at USD$2.00+`));
  console.log(`  MTG part 1: ${urls1.length} URLs written to sitemap-cards.xml`);

  // File 2: $0.25-$1.99 budget cards
  const cards2 = await fetchAll(
    'mtg_cards',
    'id,slug,price_usd,updated_at',
    'price_usd=gte.0.25&price_usd=lt.2.00&slug=not.is.null'
  );
  const urls2 = cards2
    .filter(c => c.slug && c.slug.trim())
    .map(c => ({
      loc: `${SITE_URL}/cards/mtg/${c.slug}`,
      lastmod: c.updated_at ? c.updated_at.slice(0, 10) : null,
      priority: '0.7'
    }));
  writeFileSync(`${OUT_DIR}/sitemap-cards-2.xml`, buildSitemap(urls2, `MTG card pages: ${urls2.length} cards at USD$0.25-$1.99`));
  console.log(`  MTG part 2: ${urls2.length} URLs written to sitemap-cards-2.xml`);

  return urls1.length + urls2.length;
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
