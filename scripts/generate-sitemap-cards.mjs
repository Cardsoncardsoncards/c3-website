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


async function generateOnePieceSitemap() {
  console.log('Generating One Piece card sitemap...');
  try {
    const cards = await fetchAll('onepiece_cards', 'id,slug,updated_at', 'slug=not.is.null&image_url=not.is.null');
    if (!cards.length) { console.log('  One Piece: no cards yet, skipping'); return 0; }
    const urls = cards.filter(c => c.slug && c.slug.trim()).map(c => ({
      loc: `${SITE_URL}/cards/onepiece/${c.slug}`,
      lastmod: c.updated_at ? c.updated_at.slice(0, 10) : null, priority: '0.7'
    }));
    writeFileSync(`${OUT_DIR}/sitemap-onepiece.xml`, buildSitemap(urls, `One Piece card pages: ${urls.length} cards`));
    console.log(`  One Piece: ${urls.length} URLs written to sitemap-onepiece.xml`);
    return urls.length;
  } catch (err) { console.error('  One Piece sitemap error:', err.message); return 0; }
}

async function generateRiftboundSitemap() {
  console.log('Generating Riftbound card sitemap...');
  try {
    const cards = await fetchAll('riftbound_cards', 'id,slug,updated_at', 'slug=not.is.null&image_url=not.is.null');
    if (!cards.length) { console.log('  Riftbound: no cards yet, skipping'); return 0; }
    const urls = cards.filter(c => c.slug && c.slug.trim()).map(c => ({
      loc: `${SITE_URL}/cards/riftbound/${c.slug}`,
      lastmod: c.updated_at ? c.updated_at.slice(0, 10) : null, priority: '0.7'
    }));
    writeFileSync(`${OUT_DIR}/sitemap-riftbound.xml`, buildSitemap(urls, `Riftbound card pages: ${urls.length} cards`));
    console.log(`  Riftbound: ${urls.length} URLs written to sitemap-riftbound.xml`);
    return urls.length;
  } catch (err) { console.error('  Riftbound sitemap error:', err.message); return 0; }
}

async function generateStarWarsSitemap() {
  console.log('Generating Star Wars card sitemap...');
  try {
    const cards = await fetchAll('starwars_cards', 'id,slug,updated_at', 'slug=not.is.null&image_url=not.is.null');
    if (!cards.length) { console.log('  Star Wars: no cards yet, skipping'); return 0; }
    const urls = cards.filter(c => c.slug && c.slug.trim()).map(c => ({
      loc: `${SITE_URL}/cards/starwars/${c.slug}`,
      lastmod: c.updated_at ? c.updated_at.slice(0, 10) : null, priority: '0.7'
    }));
    writeFileSync(`${OUT_DIR}/sitemap-starwars.xml`, buildSitemap(urls, `Star Wars card pages: ${urls.length} cards`));
    console.log(`  Star Wars: ${urls.length} URLs written to sitemap-starwars.xml`);
    return urls.length;
  } catch (err) { console.error('  Star Wars sitemap error:', err.message); return 0; }
}

async function generateDragonBallSitemap() {
  console.log('Generating Dragon Ball Super card sitemap...');
  try {
    const cards = await fetchAll('dragonball_cards', 'id,slug,updated_at', 'slug=not.is.null&image_url=not.is.null');
    if (!cards.length) { console.log('  Dragon Ball: no cards yet, skipping'); return 0; }
    const urls = cards.filter(c => c.slug && c.slug.trim()).map(c => ({
      loc: `${SITE_URL}/cards/dragonball/${c.slug}`,
      lastmod: c.updated_at ? c.updated_at.slice(0, 10) : null, priority: '0.7'
    }));
    writeFileSync(`${OUT_DIR}/sitemap-dragonball.xml`, buildSitemap(urls, `Dragon Ball card pages: ${urls.length} cards`));
    console.log(`  Dragon Ball: ${urls.length} URLs written to sitemap-dragonball.xml`);
    return urls.length;
  } catch (err) { console.error('  Dragon Ball sitemap error:', err.message); return 0; }
}

async function main() {
  console.log('=== Sitemap Generation Start ===', new Date().toISOString());

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or key — writing empty MTG sitemaps as fallback');
    writeFileSync(`${OUT_DIR}/sitemap-cards.xml`, '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- Build-time generation failed: missing env vars --></urlset>');
    writeFileSync(`${OUT_DIR}/sitemap-cards-2.xml`, '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- Build-time generation failed: missing env vars --></urlset>');
    return;
  }

  const mtg        = await generateMtgSitemap();
  const pokemon    = await generatePokemonSitemap();
  const lorcana    = await generateLorcanaSitemap();
  const yugioh     = await generateYugiohSitemap();
  const onepiece   = await generateOnePieceSitemap();
  const riftbound  = await generateRiftboundSitemap();
  const starwars   = await generateStarWarsSitemap();
  const dragonball = await generateDragonBallSitemap();

  // sitemap-index.xml not overwritten — managed in repo root

  const total = mtg + pokemon + lorcana + yugioh + onepiece + riftbound + starwars + dragonball;
  console.log(`=== Sitemap Generation Complete === Total URLs: ${total}`);
}

main().catch(err => { console.error('Sitemap generation failed:', err.message); process.exit(0); }); // exit 0 — don't block build
