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
  // less. card-page.mjs noindexes any card where priceAud < 1.00, and every other game's
  // card page applies the identical rule. So the sole filter here is price_aud >= 1.00, in
  // AUD, matching the render-time rule exactly.
  //
  // Previously this filtered on price_usd (>= 0.25, split into two files at the $2.00 line),
  // which is a different column in a different currency. USD 0.25 is about AU$0.36, so the
  // sitemap was submitting thousands of URLs the page itself then told Google not to index:
  // 9,589 of MTG's 20,094 submitted URLs were noindexed (task-81).
  //
  // Two files are no longer needed. The eligible set is ~10,500 URLs, comfortably inside
  // Google's 50,000-per-sitemap limit, so sitemap-cards-2.xml is retired.
  //
  // slug is NOT unique in mtg_cards: every printing is its own row while the card page is
  // served per slug, so dedupe by slug, keeping the highest-priced printing (matching how
  // the follow-alert checker resolves an ambiguous slug).
  const all = await fetchAll(
    'mtg_cards',
    'id,slug,price_aud,updated_at',
    'price_aud=gte.1.00&slug=not.is.null'
  );

  const bySlug = new Map();
  for (const c of all) {
    if (!c.slug || !c.slug.trim()) continue;
    const price = parseFloat(c.price_aud) || 0;
    const existing = bySlug.get(c.slug);
    if (!existing || price > existing.price) {
      bySlug.set(c.slug, { slug: c.slug, price, updated_at: c.updated_at });
    }
  }
  console.log(`  MTG: ${all.length} rows -> ${bySlug.size} distinct slugs (${all.length - bySlug.size} duplicate rows collapsed)`);

  const urls = [...bySlug.values()].map(c => ({
    loc: `${SITE_URL}/cards/mtg/${c.slug}`,
    lastmod: c.updated_at ? c.updated_at.slice(0, 10) : null,
    priority: c.price >= 20 ? '0.9' : c.price >= 5 ? '0.8' : '0.7'
  }));

  // Sanity guard: this file should always contain thousands of cards. An empty result means
  // the query silently returned nothing (e.g. a partial Supabase outage) — treat it as a hard
  // failure rather than shipping an empty sitemap that de-indexes every MTG card page.
  if (urls.length === 0) {
    throw new Error('mtg_cards (AU$1.00+) returned 0 rows — refusing to write an empty sitemap-cards.xml');
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
