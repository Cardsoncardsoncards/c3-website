// scripts/generate-sitemap-cards.mjs
// Runs at build time (before Eleventy) via npm run build
// Fetches all MTG card slugs from Supabase and writes sitemap-cards.xml
// Also writes sitemap-pokemon.xml, sitemap-lorcana.xml, sitemap-yugioh.xml
// This replaces the timing-out Netlify Function approach
//
// Price thresholds (balance SEO value vs crawl budget):
//   MTG: $0.25 USD (~50k cards)
//   Pokemon/Lorcana/YuGiOh: any card with an image

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const SITE_URL     = 'https://cardsoncardsoncards.com.au';
const PAGE_SIZE    = 1000;
const OUT_DIR      = '.'; // write to repo root — passthrough to _site

import { writeFileSync, readdirSync, existsSync } from 'fs';

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
  console.log('Generating MTG card sitemap...');
  const cards = await fetchAll(
    'mtg_cards',
    'id,slug,price_usd,updated_at',
    'price_usd=gte.0.25&slug=not.is.null'
  );

  const urls = cards
    .filter(c => c.slug && c.slug.trim())
    .map(c => {
      const price = parseFloat(c.price_usd) || 0;
      return {
        loc: `${SITE_URL}/cards/mtg/${c.slug}`,
        lastmod: c.updated_at ? c.updated_at.slice(0, 10) : null,
        priority: price >= 20 ? '0.9' : price >= 5 ? '0.8' : '0.7'
      };
    });

  writeFileSync(`${OUT_DIR}/sitemap-cards.xml`, buildSitemap(urls, `MTG card pages: ${urls.length} cards at USD$0.25+`));
  console.log(`  MTG: ${urls.length} URLs written to sitemap-cards.xml`);
  return urls.length;
}

async function generatePokemonSitemap() {
  console.log('Generating Pokemon card sitemap...');
  try {
    const cards = await fetchAll(
      'pokemon_cards',
      'id,slug,updated_at',
      'slug=not.is.null&image_url=not.is.null'
    );
    if (!cards.length) { console.log('  Pokemon: no cards yet, skipping'); return 0; }

    const urls = cards
      .filter(c => c.slug && c.slug.trim())
      .map(c => ({
        loc: `${SITE_URL}/cards/pokemon/${c.slug}`,
        lastmod: c.updated_at ? c.updated_at.slice(0, 10) : null,
        priority: '0.7'
      }));

    writeFileSync(`${OUT_DIR}/sitemap-pokemon.xml`, buildSitemap(urls, `Pokemon card pages: ${urls.length} cards`));
    console.log(`  Pokemon: ${urls.length} URLs written to sitemap-pokemon.xml`);
    return urls.length;
  } catch (e) {
    console.log(`  Pokemon sitemap skipped: ${e.message}`);
    return 0;
  }
}

async function generateLorcanaSitemap() {
  console.log('Generating Lorcana card sitemap...');
  try {
    const cards = await fetchAll(
      'lorcana_cards',
      'id,slug,updated_at',
      'slug=not.is.null&image_url=not.is.null'
    );
    if (!cards.length) { console.log('  Lorcana: no cards yet, skipping'); return 0; }

    const urls = cards
      .filter(c => c.slug && c.slug.trim())
      .map(c => ({
        loc: `${SITE_URL}/cards/lorcana/${c.slug}`,
        lastmod: c.updated_at ? c.updated_at.slice(0, 10) : null,
        priority: '0.7'
      }));

    writeFileSync(`${OUT_DIR}/sitemap-lorcana.xml`, buildSitemap(urls, `Lorcana card pages: ${urls.length} cards`));
    console.log(`  Lorcana: ${urls.length} URLs written to sitemap-lorcana.xml`);
    return urls.length;
  } catch (e) {
    console.log(`  Lorcana sitemap skipped: ${e.message}`);
    return 0;
  }
}

async function generateYugiohSitemap() {
  console.log('Generating Yu-Gi-Oh card sitemap...');
  try {
    const cards = await fetchAll(
      'yugioh_cards',
      'id,slug,updated_at',
      'slug=not.is.null&image_url=not.is.null'
    );
    if (!cards.length) { console.log('  YuGiOh: no cards yet, skipping'); return 0; }

    const urls = cards
      .filter(c => c.slug && c.slug.trim())
      .map(c => ({
        loc: `${SITE_URL}/cards/yugioh/${c.slug}`,
        lastmod: c.updated_at ? c.updated_at.slice(0, 10) : null,
        priority: '0.7'
      }));

    writeFileSync(`${OUT_DIR}/sitemap-yugioh.xml`, buildSitemap(urls, `Yu-Gi-Oh card pages: ${urls.length} cards`));
    console.log(`  Yu-Gi-Oh: ${urls.length} URLs written to sitemap-yugioh.xml`);
    return urls.length;
  } catch (e) {
    console.log(`  YuGiOh sitemap skipped: ${e.message}`);
    return 0;
  }
}

// sitemap-index.xml is maintained in the repo root and NOT overwritten by this script.
// It includes all runtime /api/sitemap-* endpoints plus build-time XML files.


async function generateBlogSitemap() {
  console.log('Generating blog sitemap...');
  const today = new Date().toISOString().split('T')[0];
  const SITE_URL = 'https://cardsoncardsoncards.com.au';

  // Dead slugs that redirect — exclude from sitemap
  const DEAD_SLUGS = new Set([
    'lorcana-booster-box-guide', 'one-piece-starter-guide', 'pokemon-booster-box-guide',
    'mtg-tmnt-australia-guide', 'star-wars-unlimited-guide', 'what-is-riftbound',
    'dragon-shield-vs-ultra-pro', 'toploaders-vs-magnetic-holders',
    'what-is-magic-the-gathering-australia', 'best-card-binders-australia'
  ]);

  try {
    const blogDir = './src/blog';
    if (!existsSync(blogDir)) {
      console.log('  Blog dir not found, skipping blog sitemap');
      return 0;
    }
    const files = readdirSync(blogDir).filter(f => f.endsWith('.md'));
    const urls = files
      .map(f => f.replace(/^p\d+-/, '').replace(/\.md$/, ''))
      .filter(slug => slug && !DEAD_SLUGS.has(slug))
      .map(slug => `  <url>\n    <loc>${SITE_URL}/blog/${slug}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`)
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Blog posts: ${files.length} posts — Generated: ${new Date().toISOString()} -->
${urls}
</urlset>`;
    writeFileSync(`${OUT_DIR}/sitemap-blog.xml`, xml);
    console.log(`  Blog: ${files.length} posts written to sitemap-blog.xml`);
    return files.length;
  } catch (err) {
    console.error('  Blog sitemap error:', err.message);
    writeFileSync(`${OUT_DIR}/sitemap-blog.xml`, '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- Blog sitemap generation failed --></urlset>');
    return 0;
  }
}

async function main() {
  console.log('=== Sitemap Generation Start ===', new Date().toISOString());

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or key — writing empty MTG sitemap as fallback');
    writeFileSync(`${OUT_DIR}/sitemap-cards.xml`, '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- Build-time generation failed: missing env vars --></urlset>');
    return;
  }

  const mtg     = await generateMtgSitemap();
  const pokemon  = await generatePokemonSitemap();
  const lorcana  = await generateLorcanaSitemap();
  const yugioh   = await generateYugiohSitemap();

  // sitemap-index.xml not overwritten — managed in repo root

  const total = mtg + pokemon + lorcana + yugioh;
  console.log(`=== Sitemap Generation Complete === Total URLs: ${total}`);
}

main().catch(err => { console.error('Sitemap generation failed:', err.message); process.exit(0); }); // exit 0 — don't block build
