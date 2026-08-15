// netlify/functions/sitemap-static.mjs
// Generates XML sitemap for all static pages, hub pages, quizzes, generators, tools
// Registered in sitemap-index.xml as /api/sitemap-static
// Updated: 20 May 2026 -- added 24 new TCG hub pages

const SITE_URL = 'https://cardsoncardsoncards.com.au';

const STATIC_PAGES = [
  // Core
  { path: '/',                    priority: '1.0', changefreq: 'daily'   },
  { path: '/cards',               priority: '0.9', changefreq: 'weekly'  },

  // TCG Hubs -- all 32 games
  { path: '/cards/mtg',           priority: '0.9', changefreq: 'daily'   },
  { path: '/cards/pokemon',       priority: '0.9', changefreq: 'daily'   },
  { path: '/cards/yugioh',        priority: '0.9', changefreq: 'daily'   },
  { path: '/cards/lorcana',       priority: '0.9', changefreq: 'daily'   },
  { path: '/cards/onepiece',      priority: '0.8', changefreq: 'daily'   },
  { path: '/cards/riftbound',     priority: '0.8', changefreq: 'daily'   },
  { path: '/cards/dragonball',    priority: '0.8', changefreq: 'daily'   },
  { path: '/cards/starwars',      priority: '0.8', changefreq: 'daily'   },
  { path: '/cards/digimon',       priority: '0.8', changefreq: 'daily'   },
  { path: '/cards/vanguard',      priority: '0.8', changefreq: 'daily'   },
  { path: '/cards/weissschwarz',  priority: '0.8', changefreq: 'daily'   },
  { path: '/cards/finalfantasy',  priority: '0.7', changefreq: 'daily'   },
  { path: '/cards/forceofwill',   priority: '0.7', changefreq: 'daily'   },
  { path: '/cards/buddyfight',    priority: '0.7', changefreq: 'daily'   },
  { path: '/cards/shadowverse',   priority: '0.7', changefreq: 'daily'   },
  { path: '/cards/dbsfusionworld',priority: '0.7', changefreq: 'daily'   },
  { path: '/cards/wow',           priority: '0.7', changefreq: 'daily'   },
  { path: '/cards/unionarena',    priority: '0.7', changefreq: 'daily'   },
  { path: '/cards/universus',     priority: '0.7', changefreq: 'daily'   },
  { path: '/cards/metazoo',       priority: '0.7', changefreq: 'daily'   },
  { path: '/cards/grandarchive',  priority: '0.7', changefreq: 'daily'   },
  { path: '/cards/wixoss',        priority: '0.7', changefreq: 'daily'   },
  { path: '/cards/sorcery',       priority: '0.7', changefreq: 'daily'   },
  { path: '/cards/hololive',      priority: '0.6', changefreq: 'daily'   },
  { path: '/cards/alphaclash',    priority: '0.6', changefreq: 'daily'   },
  { path: '/cards/gundam',        priority: '0.6', changefreq: 'daily'   },
  { path: '/cards/battlespiritssaga',                  priority: '0.6', changefreq: 'daily' },
  { path: '/cards/dragonballz',   priority: '0.6', changefreq: 'daily'   },
  { path: '/cards/bakugan',       priority: '0.6', changefreq: 'daily'   },
  { path: '/cards/godzilla',      priority: '0.6', changefreq: 'daily'   },
  { path: '/cards/warhammer',     priority: '0.6', changefreq: 'daily'   },
  { path: '/cards/gateruler',     priority: '0.6', changefreq: 'daily'   },

  // Tools and features
  //
  // /compare is deliberately NOT listed. A bare GET /compare 302-redirects to
  // /compare?cards=mtg:generous-gift,mtg:sol-ring, an arbitrary demo comparison. There is no
  // param-free canonical URL to submit, and submitting a demo state as canonical would be
  // wrong, so it is excluded until the bare route renders a landing state of its own.
  { path: '/market',              priority: '0.8', changefreq: 'daily'   },
  { path: '/generators',          priority: '0.8', changefreq: 'weekly'  },
  { path: '/quizzes',             priority: '0.8', changefreq: 'weekly'  },
  { path: '/blog',                priority: '0.8', changefreq: 'daily'   },
  // task-22 (C3L-65): /tracker and /shop were submitted here in their .html form while the
  // pages themselves carry <link rel="canonical"> pointing at the CLEAN route. Verified live
  // before the change: /tracker.html 200 canonical=/tracker, /shop.html 200 canonical=/shop.
  // Submitting a URL that the page then disclaims is a conflicting signal, so the sitemap was
  // brought onto the canonical each page already declares rather than a new URL strategy being
  // chosen here. Both clean routes verified 200 and self-canonical live. /tracker resolves via
  // the netlify.toml 200 rewrite, /shop via Netlify's pretty-URL default.
  { path: '/tracker',             priority: '0.8', changefreq: 'weekly'  },
  // /ev-calculator.html has the SAME conflict (canonical=/ev-calculator) and is deliberately
  // left alone: this batch excludes the EV pages and anything EV-adjacent. Logged as C3L-65.
  { path: '/ev-calculator',       priority: '0.7', changefreq: 'weekly'  },
  { path: '/calendar',            priority: '0.7', changefreq: 'weekly'  },
  { path: '/shop',                priority: '0.6', changefreq: 'weekly'  },

  // Section hubs and key pages. All were live, indexable and in NO sitemap at all until
  // task-84, including /tools and /play, the hub pages for the entire tools and quizzes
  // sections, and /methodology, which had never been submitted since it was built.
  { path: '/tools',               priority: '0.8', changefreq: 'weekly'  },
  { path: '/play',                priority: '0.8', changefreq: 'weekly'  },
  { path: '/pricing',             priority: '0.8', changefreq: 'weekly'  },
  { path: '/methodology',                              priority: '0.7', changefreq: 'monthly' },
  { path: '/subscribe',                                priority: '0.6', changefreq: 'monthly' },
  // QR destination on the parcel insert card. Not linked from the nav or any other page, so
  // this sitemap entry is the only way Google will ever discover it.
  { path: '/welcome',                                  priority: '0.6', changefreq: 'monthly' },
  { path: '/mtg-strixhaven',                           priority: '0.6', changefreq: 'monthly' },

  // Quizzes
  { path: '/quizzes/which-tcg',                        priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/mtg-archetype',                    priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/mtg-colour',                       priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/pokemon-era',                      priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/lorcana-ink',                      priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/riftbound-champion',               priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/investor-collector',               priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/rarity',                           priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/starwars-affiliation',             priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/dragonball-character',             priority: '0.7', changefreq: 'monthly' },

  // The other 19 quizzes. Task-83 found 29 quiz pages live and indexable but only 10 in
  // any sitemap. Each of these was verified HTTP 200 with no noindex before being added.
  { path: '/quizzes/bang-dream-band',                  priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/collector-or-player',              priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/digimon-partner',                  priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/dragonball-warrior',               priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/ebay-or-buylist',                  priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/grand-archive-class',              priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/lorcana-character',                priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/mtg-commander',                    priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/onepiece-character',               priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/onepiece-crew',                    priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/pokemon-archetype',                priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/sorcery-realm',                    priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/tcg-budget',                       priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/vanguard-clan',                    priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/weissschwarz-collect',             priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/weissschwarz-series',              priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/which-tcg-extended',               priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/yugioh-archetype',                 priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/yugioh-deck',                      priority: '0.7', changefreq: 'monthly' },

  // The 43 /ev-calculator/<set>.html pages used to be listed here. They were removed because
  // all 43 carry <meta name="robots" content="noindex"> (C3L-98), and submitting a noindex URL
  // in a sitemap asks Google to crawl a page we are telling it not to index. The files are
  // still served at 200 so existing links and bookmarks keep working, they are just no longer
  // advertised. Re-add this block when the catalogue comes back and the noindex comes off.

  // Misc
  { path: '/dnd',                                      priority: '0.6', changefreq: 'monthly' },
  { path: '/contact.html',                             priority: '0.4', changefreq: 'monthly' },
  { path: '/legal.html',                               priority: '0.3', changefreq: 'monthly' },
];

export default async (req) => {
  const headers = {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=43200', 'Netlify-CDN-Cache-Control': 'public, max-age=43200,durable',
  };

  const today = new Date().toISOString().slice(0, 10);

  try {
    const staticUrls = STATIC_PAGES.map(p =>
      `  <url>\n    <loc>${SITE_URL}${p.path}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
    ).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- C3 Static Pages, Hub Pages, Tools, Quizzes (32 TCGs) -->
  <!-- Generated: ${new Date().toISOString()} -->
  <!-- Total: ${STATIC_PAGES.length} pages -->
${staticUrls}
</urlset>`;

    return new Response(xml, { status: 200, headers });

  } catch (err) {
    console.error('[sitemap-static] error:', err.message);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- Error: ${err.message} --></urlset>`,
      { status: 200, headers }
    );
  }
};

export const config = { path: '/api/sitemap-static' };
