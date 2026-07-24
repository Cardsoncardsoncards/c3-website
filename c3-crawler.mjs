// C3 Site Crawler, 4 Jul 2026 (recovered and committed to the repo 24 Jul 2026).
// Tests every sitemap URL plus internal links for status, and flags known issues.
// Requires Node 18+. No dependencies. Run from anywhere:
//   node c3-crawler.mjs                (sample mode: all hubs/sets/static, capped card pages)
//   node c3-crawler.mjs --full         (every URL, WARNING: burns Netlify function invocations)
//   node c3-crawler.mjs --cap 50       (change per-sitemap card page cap, default 25)
// Output: c3-crawl-report.csv and c3-crawl-summary.txt in the current directory.
// NOTE: every uncached page hit invokes a Netlify function. Sample mode exists to
// protect your own usage. Run --full only after cache headers are deployed.
//
// The sandbox reaches the live site through Node fetch (default curl fails here on a Windows
// schannel revocation-check quirk, which is not a real egress limit). See CLAUDE.md.

const BASE = 'https://cardsoncardsoncards.com.au';
const CONCURRENCY = 6;
const DELAY_MS = 150; // politeness gap per worker
const FULL = process.argv.includes('--full');
const capIdx = process.argv.indexOf('--cap');
const CARD_CAP = capIdx > -1 ? parseInt(process.argv[capIdx + 1], 10) || 25 : 25;

// One entry point: sitemap-index.xml fans out to sitemap-blog.xml, sitemap-cards.xml and the
// /api/sitemap-* function sitemaps, and getSitemapUrls() follows those nested <loc> links.
// (The old /sitemap.xml, /sitemap_index.xml and /sitemap-static.xml paths were retired and 404.)
const SITEMAP_CANDIDATES = [
  '/sitemap-index.xml',
];

const results = [];   // {url, status, ms, source, flags}
const seen = new Set();
const queue = [];

function flagChecks(url, html) {
  const flags = [];
  if (!html) return flags;
  if (html.includes('siteid=15')) flags.push('siteid=15');
  if (!html.includes('G-WR68HPE92S')) flags.push('missing-GA4');
  if (!html.includes('rel="canonical"') && !html.includes("rel='canonical'")) flags.push('missing-canonical');
  if (!/property=["']og:title["']/.test(html)) flags.push('missing-og-title');
  if (html.includes('\u2014') || html.includes('\u2013')) flags.push('em-or-en-dash');
  if (!html.includes('campid=5339146789') && html.includes('ebay.com.au')) flags.push('ebay-link-missing-campid');
  if (html.includes('amazon.com.au') && !html.includes('tag=blasdigital-22') && !html.includes('amzn.to')) flags.push('amazon-link-missing-tag');
  if (html.includes('amzn.to')) flags.push('amzn.to-shortlink');
  if (/(Loading|No cards found|No sets found)[\s\S]{0,200}<\/body>/i.test(html)) flags.push('possible-empty-render');
  return flags;
}

function extractInternalLinks(html, fromUrl) {
  const links = new Set();
  const re = /href=["']([^"'#>\s]+)["']/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = m[1];
    if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
    if (href.startsWith('//')) href = 'https:' + href;
    if (href.startsWith('/')) href = BASE + href;
    if (!href.startsWith(BASE)) continue; // external, skip status checks (affiliate links checked by flags only)
    href = href.split('#')[0].split('?')[0];
    if (href.length > BASE.length) links.add(href);
  }
  return [...links];
}

async function fetchUrl(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'C3-owner-audit/1.0' } });
    const ms = Date.now() - t0;
    const ct = res.headers.get('content-type') || '';
    let html = '';
    if (ct.includes('html') || ct.includes('xml')) html = await res.text();
    return { status: res.status, ms, html, finalUrl: res.url };
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, html: '', error: e.message };
  }
}

async function getSitemapUrls() {
  const urls = new Map(); // url -> source sitemap
  const smQueue = [];
  for (const path of SITEMAP_CANDIDATES) smQueue.push(BASE + path);
  const triedSitemaps = new Set();
  while (smQueue.length) {
    const sm = smQueue.shift();
    if (triedSitemaps.has(sm)) continue;
    triedSitemaps.add(sm);
    const { status, html } = await fetchUrl(sm);
    if (status !== 200 || !html) { console.log(`sitemap ${sm}: ${status}`); continue; }
    const locs = [...html.matchAll(/<loc>([^<]+)<\/loc>/g)].map(x => x[1].trim());
    for (const loc of locs) {
      if (loc.endsWith('.xml') || loc.includes('sitemap')) smQueue.push(loc);
      else urls.set(loc, sm);
    }
    console.log(`sitemap ${sm}: ${locs.length} entries`);
  }
  return urls;
}

function sampleUrls(urlMap) {
  if (FULL) return [...urlMap.keys()];
  // Group by sitemap source; card sitemaps get capped, everything else fully included.
  const bySource = {};
  for (const [url, src] of urlMap) (bySource[src] ||= []).push(url);
  const out = [];
  for (const [src, list] of Object.entries(bySource)) {
    const isCardHeavy = list.length > 200; // heuristic: card sitemaps are huge
    if (!isCardHeavy) { out.push(...list); continue; }
    // Keep all short URLs (hubs, set pages) and cap the deep card pages.
    const shallow = list.filter(u => u.split('/').length <= 6); // /cards/game/sets/slug depth
    const deep = list.filter(u => u.split('/').length > 6 || (u.split('/').length === 6 && !u.includes('/sets/')));
    const cardPages = list.filter(u => !shallow.includes(u));
    out.push(...shallow);
    // Evenly spaced sample of card pages
    const step = Math.max(1, Math.floor(cardPages.length / CARD_CAP));
    for (let i = 0; i < cardPages.length && out.length < 100000; i += step) out.push(cardPages[i]);
    console.log(`${src}: ${list.length} URLs, sampled ${shallow.length} shallow + ~${Math.min(CARD_CAP, cardPages.length)} card pages`);
  }
  return [...new Set(out)];
}

async function worker(id) {
  while (queue.length) {
    const item = queue.shift();
    if (!item) break;
    const { url, source } = item;
    const r = await fetchUrl(url);
    const flags = r.status === 200 ? flagChecks(url, r.html) : [];
    results.push({ url, status: r.status, ms: r.ms, source, flags: flags.join('|'), error: r.error || '' });
    if (r.status !== 200) console.log(`  [${r.status}] ${url} (found on: ${source})`);
    // Discover internal links from key structural pages only (avoid explosion)
    if (r.html && (source === 'seed' || url.split('/').length <= 5)) {
      for (const link of extractInternalLinks(r.html, url)) {
        if (!seen.has(link)) { seen.add(link); queue.push({ url: link, source: url }); }
      }
    }
    await new Promise(res => setTimeout(res, DELAY_MS));
  }
}

async function main() {
  console.log(`C3 crawler starting. Mode: ${FULL ? 'FULL (all URLs, this costs Netlify invocations)' : `SAMPLE (card pages capped at ~${CARD_CAP}/sitemap)`}`);

  // Seed pages: always test these regardless of sitemaps.
  // Updated 24 Jul 2026: /subscribe swapped for /account (subscribe.html is retired,
  // permanently 301-redirects to /account per the footer investigation), and the four bogus
  // /shop/*.html seeds were dropped (they always 404 and nothing on the site links to them).
  const seeds = ['/', '/cards', '/compare', '/market', '/tools', '/play', '/blog', '/calendar',
    '/shop', '/account', '/tracker', '/contact', '/legal', '/ev-calculator', '/quizzes/which-tcg'];
  for (const s of seeds) { const u = BASE + s; if (!seen.has(u)) { seen.add(u); queue.push({ url: u, source: 'seed' }); } }

  const urlMap = await getSitemapUrls();
  console.log(`Total sitemap URLs discovered: ${urlMap.size}`);
  for (const url of sampleUrls(urlMap)) {
    if (!seen.has(url)) { seen.add(url); queue.push({ url, source: 'sitemap' }); }
  }
  console.log(`URLs to test: ${queue.length}`);

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

  // Reports
  const csvLines = ['url,status,ms,source,flags,error'];
  for (const r of results) csvLines.push(`"${r.url}",${r.status},${r.ms},"${r.source}","${r.flags}","${r.error}"`);
  const fs = await import('fs');
  fs.writeFileSync('c3-crawl-report.csv', csvLines.join('\n'));

  const broken = results.filter(r => r.status !== 200);
  const slow = results.filter(r => r.status === 200 && r.ms > 3000);
  const flagged = results.filter(r => r.flags);
  const summary = [
    `C3 crawl summary, ${new Date().toISOString()}`,
    `Mode: ${FULL ? 'FULL' : 'SAMPLE'} | Tested: ${results.length} URLs`,
    ``,
    `BROKEN (${broken.length}):`,
    ...broken.map(r => `  [${r.status}] ${r.url} (linked from: ${r.source})`),
    ``,
    `SLOW over 3s (${slow.length}):`,
    ...slow.slice(0, 50).map(r => `  ${r.ms}ms ${r.url}`),
    ``,
    `FLAGGED (${flagged.length}):`,
    ...flagged.slice(0, 300).map(r => `  [${r.flags}] ${r.url}`),
    ``,
    `Full detail: c3-crawl-report.csv`,
  ].join('\n');
  fs.writeFileSync('c3-crawl-summary.txt', summary);
  console.log('\n' + summary.split('\n').slice(0, 40).join('\n'));
  console.log('\nDone. Reports: c3-crawl-report.csv, c3-crawl-summary.txt');
}

main();
