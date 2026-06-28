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

for (const file of files) {
  const content = fs.readFileSync(path.join(BLOG_DIR, file), 'utf8');

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
