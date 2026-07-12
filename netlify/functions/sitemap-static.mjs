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
  { path: '/tracker.html',        priority: '0.8', changefreq: 'weekly'  },
  { path: '/ev-calculator.html',  priority: '0.7', changefreq: 'weekly'  },
  { path: '/calendar',            priority: '0.7', changefreq: 'weekly'  },
  { path: '/shop.html',           priority: '0.6', changefreq: 'weekly'  },

  // Section hubs and key pages. All were live, indexable and in NO sitemap at all until
  // task-84, including /tools and /play, the hub pages for the entire tools and quizzes
  // sections, and /methodology, which had never been submitted since it was built.
  { path: '/tools',               priority: '0.8', changefreq: 'weekly'  },
  { path: '/play',                priority: '0.8', changefreq: 'weekly'  },
  { path: '/pricing',             priority: '0.8', changefreq: 'weekly'  },
  { path: '/methodology',                              priority: '0.7', changefreq: 'monthly' },
  { path: '/subscribe',                                priority: '0.6', changefreq: 'monthly' },
  { path: '/mtg-strixhaven.html',                      priority: '0.6', changefreq: 'monthly' },

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

  // Booster Box EV Calculator, one page per set. These were only ever discoverable via the
  // stale sitemap.xml, which task-84 retires. A fixed set of 43 static files under
  // /ev-calculator/, not DB-driven, so hardcoding them here will not silently go out of date
  // as games or sets are added.
  { path: '/ev-calculator/mtg-adventures-in-the-forgotten-realms.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-aetherdrift.html',       priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-assassins-creed.html',   priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-avatar-the-last-airbender.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-bloomburrow.html',       priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-commander-legends-2020.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-commander-legends-baldurs-gate.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-commander-masters.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-core-set-2021.html',     priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-dominaria-united.html',  priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-double-masters-2022.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-duskmourn.html',         priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-edge-of-eternities.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-final-fantasy.html',     priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-iconic-masters.html',    priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-ikoria-lair-of-behemoths.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-innistrad-crimson-vow.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-innistrad-midnight-hunt.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-jumpstart-2020.html',    priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-kaldheim.html',          priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-kamigawa-neon-dynasty.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-lord-of-the-rings.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-lorwyn-eclipsed.html',   priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-lost-caverns-of-ixalan.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-march-of-the-machine.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-modern-horizons-1.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-modern-horizons-2.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-modern-horizons-3.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-murders-at-karlov-manor.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-outlaws-of-thunder-junction.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-phyrexia-all-will-be-one.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-secrets-of-strixhaven.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-streets-of-new-capenna.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-strixhaven-school-of-mages.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-tarkir-dragonstorm.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-the-brothers-war.html',  priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-theros-beyond-death.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-time-spiral-remastered.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-tmnt.html',              priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-ultimate-masters.html',  priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-warhammer-40k.html',     priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-wilds-of-eldraine.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/ev-calculator/mtg-zendikar-rising.html',   priority: '0.6', changefreq: 'monthly' },

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
