const fs = require('fs');
const path = require('path');

const BLOG_DIR = path.join(__dirname, '../src/blog');
const OUTPUT_PATH = path.join(__dirname, '../_site/sitemap-blog.xml');
const BASE_URL = 'https://cardsoncardsoncards.com.au';

// Read all blog post markdown files
const files = fs.readdirSync(BLOG_DIR)
  .filter(f => f.endsWith('.md'))
  .sort();

const urls = [];
const skipped = [];

for (const file of files) {
  const content = fs.readFileSync(path.join(BLOG_DIR, file), 'utf8');

  // Only emit posts that Eleventy actually BUILDS. Its permalink rule in .eleventy.js is:
  //
  //   if (data.tags && data.tags.includes('post')) return `/blog/${slug}/`;
  //   return false;   // <- no page is generated
  //
  // This script previously emitted every .md file in the directory with no such check, so
  // the sitemap listed 569 URLs while only 500 pages existed. The other 69 (posts written
  // without `tags: post` in their frontmatter) were submitted to Google and returned 404.
  // Mirror the permalink rule here so the sitemap can never over-claim again.
  const hasPostTag = /^tags:\s*(post\s*$|.*\bpost\b)/m.test(content);
  const hasExplicitPermalink = /^permalink:\s*\S/m.test(content);

  if (!hasPostTag && !hasExplicitPermalink) {
    skipped.push(file);
    continue;
  }

  // Extract date from frontmatter
  const dateMatch = content.match(/^date:\s*(\d{4}-\d{2}-\d{2})/m);
  const date = dateMatch ? dateMatch[1] : '2026-01-01';

  // Derive slug: strip pNNN- prefix and .md extension (matches Eleventy permalink rule)
  const slug = file.replace(/^p\d+-/, '').replace(/\.md$/, '');

  urls.push({ slug, date });
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(({ slug, date }) => `  <url>
    <loc>${BASE_URL}/blog/${slug}/</loc>
    <lastmod>${date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`).join('\n')}
</urlset>`;

// Ensure _site directory exists
fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, xml);
console.log(`Generated sitemap-blog.xml with ${urls.length} URLs`);
if (skipped.length) {
  // Loud, not silent: these .md files exist but Eleventy will not build them, so they are
  // deliberately kept out of the sitemap. If one of them SHOULD be live, it is missing
  // `tags: post` in its frontmatter.
  console.log(`  skipped ${skipped.length} .md file(s) with no "tags: post" (not built by Eleventy, so not submitted)`);
}
