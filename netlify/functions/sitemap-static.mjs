// netlify/functions/sitemap-static.mjs
// Generates XML sitemap for all static pages, hub pages, quizzes, generators, tools
// Registered in sitemap-index.xml as /api/sitemap-static
// Updated: 20 May 2026 -- added 24 new TCG hub pages

const SITE_URL = 'https://cardsoncardsoncards.com.au';

const STATIC_PAGES = [
  // Core
  { path: '/',                    priority: '1.0', changefreq: 'daily'   },
  { path: '/cards',               priority: '0.9', changefreq: 'weekly'  },

  // TCG Hubs -- all 27 games
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
  { path: '/cards/battlespiritssaga', priority: '0.6', changefreq: 'daily' },
  { path: '/cards/dragonballz',   priority: '0.6', changefreq: 'daily'   },
  { path: '/cards/bakugan',       priority: '0.6', changefreq: 'daily'   },
  { path: '/cards/godzilla',      priority: '0.6', changefreq: 'daily'   },
  { path: '/cards/warhammer',     priority: '0.6', changefreq: 'daily'   },
  { path: '/cards/gateruler',     priority: '0.6', changefreq: 'daily'   },

  // Tools and features
  { path: '/compare',             priority: '0.8', changefreq: 'weekly'  },
  { path: '/market',              priority: '0.8', changefreq: 'daily'   },
  { path: '/generators',          priority: '0.8', changefreq: 'weekly'  },
  { path: '/quizzes',             priority: '0.8', changefreq: 'weekly'  },
  { path: '/blog',                priority: '0.8', changefreq: 'daily'   },
  { path: '/tracker.html',        priority: '0.8', changefreq: 'weekly'  },
  { path: '/ev-calculator.html',  priority: '0.7', changefreq: 'weekly'  },
  { path: '/calendar',            priority: '0.7', changefreq: 'weekly'  },
  { path: '/shop.html',           priority: '0.6', changefreq: 'weekly'  },

  // Quizzes
  { path: '/quizzes/which-tcg',             priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/mtg-archetype',         priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/mtg-colour',            priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/pokemon-era',           priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/lorcana-ink',           priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/riftbound-champion',    priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/investor-collector',    priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/rarity',               priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/starwars-affiliation',  priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/dragonball-character',  priority: '0.7', changefreq: 'monthly' },

  // Misc
  { path: '/dnd',                 priority: '0.6', changefreq: 'monthly' },
  { path: '/contact.html',        priority: '0.4', changefreq: 'monthly' },
  { path: '/legal.html',          priority: '0.3', changefreq: 'monthly' },
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
  <!-- C3 Static Pages, Hub Pages, Tools, Quizzes (27 TCGs) -->
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
