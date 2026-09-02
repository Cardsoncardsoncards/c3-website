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
const FETCH_TIMEOUT = 20000; // per request, so one hung URL cannot park a worker forever
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

// task-batchA, 2 September 2026. C3L-76: the content-level checks below were run against the
// RAW response body, so they matched the site's own minified JavaScript as readily as its copy.
// Measured on a 40 URL live sample before this fix: 52 flags raised, 45 of them false, 86.5 per
// cent. Three distinct causes, all fixed here, none of them a fault of the pages flagged.
//
//   possible-empty-render   40 of 40 URLs, every single page. The /i regex matched the literal
//                           "loading" inside 'loading'!==document.readyState, a deferred-script
//                           snippet sitting just before </body> on every page on the site.
//   amazon-link-missing-tag 3 of 3. "amazon.com.au" was matched inside the GA4 outbound-click
//                           handler (href.includes('amazon.com.au')), not in any actual link.
//   em-or-en-dash           2 of 2. Both dashes came from upstream card type lines rendered from
//                           the database ("Rare Creature - Cat"), which C3 does not author and
//                           cannot edit. The no-dash rule governs repo source, not vendor data.
//
// So: strip script and style before any content-level test, test link attributes as links rather
// than as substrings of the whole document, and exclude the DB-rendered card-context block from
// the dash check. Structural tests (GA4, canonical, og:title) still read the full document,
// because those tags legitimately live in markup, and they were NOT producing false positives:
// all 7 missing-og-title hits in the same sample were real.

// Response body with script and style contents removed. Everything that reads page COPY goes
// through this, never the raw body.
function contentOnly(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
}

// Values of every href on the page, so link checks test links instead of substrings.
function hrefs(html) {
  // Backreference to the opening quote. A [^"']+ class stops at the first apostrophe,
  // so a double-quoted eBay URL containing a raw apostrophe (Mishra's Workshop, Kai'Sa,
  // Harpie's Feather Duster) was truncated mid-URL and then read as an affiliate link with
  // no campid. That invented 4 flags on the 40 URL sample. Verified: all 4 cleared by this.
  return [...html.matchAll(/href=(["'])(.*?)\1/g)].map(m => m[2]);
}

function flagChecks(url, html) {
  const flags = [];
  if (!html) return flags;
  const content = contentOnly(html);
  const links = hrefs(html);

  if (html.includes('siteid=15')) flags.push('siteid=15');

  // Structural: these are markup tags, so they are read from the full document on purpose.
  if (!html.includes('G-WR68HPE92S')) flags.push('missing-GA4');
  if (!html.includes('rel="canonical"') && !html.includes("rel='canonical'")) flags.push('missing-canonical');
  if (!/property=["']og:title["']/.test(html)) flags.push('missing-og-title');

  // Dashes: page copy only, and with the upstream type-line block removed. A dash inside a card
  // name or type line comes from the vendor feed, so flagging it asks for an edit that cannot be
  // made. What this still reports is C3-authored and actionable.
  const authored = content
    .replace(/<div class="card-context">[\s\S]*?<\/div>/gi, ' ')
    .replace(/<div class="card-meta">[\s\S]*?<\/div>/gi, ' ');
  if (authored.includes('\u2014') || authored.includes('\u2013')) flags.push('em-or-en-dash');

  // Affiliate links: judged per link. The old whole-page test also HID real breakage, because a
  // single correct campid anywhere on the page satisfied it for every other eBay link there.
  const ebayLinks = links.filter(h => h.includes('ebay.com.au') || h.includes('ebay.com/'));
  if (ebayLinks.some(h => !h.includes('campid=5339146789'))) flags.push('ebay-link-missing-campid');

  const amazonLinks = links.filter(h => h.includes('amazon.com.au'));
  if (amazonLinks.some(h => !h.includes('tag=blasdigital-22'))) flags.push('amazon-link-missing-tag');

  if (links.some(h => h.includes('amzn.to'))) flags.push('amzn.to-shortlink');

  // Empty render: a real empty render is a placeholder AND almost no copy. The marker on its own
  // is not evidence, which is what made this fire on all 40 sampled URLs.
  const visible = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const placeholder = /(No cards found|No sets found|Loading\u2026|Loading\.\.\.)/.test(visible);
  if (placeholder && visible.length < 1500) flags.push('possible-empty-render');

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
  // Audit point 5. There was no timeout here, so a single request that never resolved parked one
  // of the six workers for good and the crawl silently lost a sixth of its throughput, or hung.
  // A recorded timeout is more useful than a stall: it lands in the report as status 0.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'C3-owner-audit/1.0' },
      signal: controller.signal
    });
    clearTimeout(timer);
    const ms = Date.now() - t0;
    const ct = res.headers.get('content-type') || '';
    let html = '';
    // No res.ok gate here on purpose (audit point 6). Recording non-200 responses IS this tool's
    // job, and nothing it reads is JSON, so there is no parse to guard.
    if (ct.includes('html') || ct.includes('xml')) html = await res.text();
    return { status: res.status, ms, html, finalUrl: res.url };
  } catch (e) {
    clearTimeout(timer);
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

// How deep a URL sits in the site, counted in real path segments rather than in slashes.
//
// task-157 fix. The old test was u.split('/').length <= 6, applied to the WHOLE URL. A card page
// like https://cardsoncardsoncards.com.au/cards/pokemon/some-card splits into exactly six parts
// ('https:', '', host, 'cards', 'pokemon', 'some-card'), so every card page satisfied "<= 6" and
// was classified shallow. Shallow URLs bypass the cap, so sample mode quietly included every
// card page on the site: measured live at 53,774 URLs queued instead of a bounded sample, one
// Netlify function invocation per uncached page. The scheme and host were being counted as
// depth, which is what made an obviously deep URL look shallow.
//
// Counting path segments instead gives the depths the cap was always meant to describe:
//   /                            0   static
//   /market, /cards              1   static, hub
//   /cards/pokemon               2   game hub
//   /blog/some-post              2   static blog page
//   /cards/pokemon/some-card     3   CARD PAGE, must be capped
//   /cards/pokemon/sets/base     4   SET PAGE, must be capped
function pathDepth(u) {
  try {
    return new URL(u).pathname.split('/').filter(Boolean).length;
  } catch {
    return Infinity;   // unparseable, treat as deep so it can never bypass the cap
  }
}

// Hubs and static pages only. Anything three segments or deeper is an individual content page
// (a card or a set) and is subject to the sample cap.
const SHALLOW_MAX_DEPTH = 2;

// Sample mode only: how many deep links a single structural page may contribute by discovery.
// Enough to notice a hub linking to dead card pages, few enough that 32 game hubs cannot
// between them re-import the whole card catalogue.
const DEEP_LINKS_PER_PAGE = 5;

function sampleUrls(urlMap) {
  if (FULL) return [...urlMap.keys()];
  // Group by sitemap source; card sitemaps get capped, everything else fully included.
  const bySource = {};
  for (const [url, src] of urlMap) (bySource[src] ||= []).push(url);
  const out = [];
  for (const [src, list] of Object.entries(bySource)) {
    const isCardHeavy = list.length > 200; // heuristic: card sitemaps are huge
    if (!isCardHeavy) { out.push(...list); continue; }

    const shallow = [];
    const deep = [];
    for (const u of list) (pathDepth(u) <= SHALLOW_MAX_DEPTH ? shallow : deep).push(u);
    out.push(...shallow);

    // Evenly spaced sample of the deep pages, capped at exactly CARD_CAP. The old loop stepped
    // by floor(len/CAP), which overshoots whenever the division leaves a remainder (11,131 URLs
    // at a cap of 25 stepped 445 and yielded 26). Indexing the fraction directly cannot overrun.
    const take = Math.min(CARD_CAP, deep.length);
    for (let i = 0; i < take; i++) out.push(deep[Math.floor((i * deep.length) / take)]);

    console.log(`${src}: ${list.length} URLs, sampled ${shallow.length} shallow + ${take} of ${deep.length} deep pages`);
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

    // Discover internal links from key structural pages only (avoid explosion).
    //
    // task-157, second pass. Fixing the sitemap classifier bounded the sample to 1,954 URLs, but
    // the first real run still tested 5,382, because this discovery step queued everything it
    // found with no cap at all: 3,331 deep card and set pages walked in through here, 642 of them
    // from /cards/yugioh alone. That is the same uncapped-deep-page problem as the classifier
    // bug, just through the other door, so sample mode was still not actually bounded.
    //
    // Deep links are now sampled per parent rather than taken wholesale. Keeping a few preserves
    // the point of crawling a hub (catching a hub that links to dead card pages) while keeping
    // the total predictable. Shallow links stay uncapped: they are nav and structural pages,
    // there are few of them, and they are what the link graph is really for.
    // FULL mode is untouched, it is supposed to take everything.
    if (r.html && (source === 'seed' || pathDepth(url) <= SHALLOW_MAX_DEPTH)) {
      let deepTaken = 0;
      for (const link of extractInternalLinks(r.html, url)) {
        if (seen.has(link)) continue;
        if (!FULL && pathDepth(link) > SHALLOW_MAX_DEPTH) {
          if (deepTaken >= DEEP_LINKS_PER_PAGE) continue;
          deepTaken++;
        }
        seen.add(link);
        queue.push({ url: link, source: url });
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

  // allSettled, not all (audit point 9). A worker already swallows its own errors inside
  // fetchUrl, so this changes no behaviour today, but it means one unexpected throw cannot
  // abandon the other five mid-crawl and lose every result collected so far.
  await Promise.allSettled(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

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
