// netlify/functions/sitemap-static.mjs
// Generates XML sitemap for all static pages, blog posts, quiz pages,
// generators, tools, and other non-card pages on C3.
// Registered in sitemap-index.xml as /api/sitemap-static

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const SITE_URL          = 'https://cardsoncardsoncards.com.au';

// Static pages with fixed priority
const STATIC_PAGES = [
  { path: '/',                    priority: '1.0', changefreq: 'daily'   },
  { path: '/cards',               priority: '0.9', changefreq: 'weekly'  },
  { path: '/cards/mtg',           priority: '0.9', changefreq: 'daily'   },
  { path: '/cards/pokemon',       priority: '0.9', changefreq: 'daily'   },
  { path: '/cards/yugioh',        priority: '0.9', changefreq: 'daily'   },
  { path: '/cards/lorcana',       priority: '0.9', changefreq: 'daily'   },
  { path: '/cards/onepiece',      priority: '0.8', changefreq: 'daily'   },
  { path: '/cards/riftbound',     priority: '0.8', changefreq: 'daily'   },
  { path: '/cards/dragonball',    priority: '0.8', changefreq: 'daily'   },
  { path: '/cards/starwars',      priority: '0.8', changefreq: 'daily'   },
  { path: '/compare',             priority: '0.8', changefreq: 'weekly'  },
  { path: '/generators',          priority: '0.8', changefreq: 'weekly'  },
  { path: '/quizzes',             priority: '0.8', changefreq: 'weekly'  },
  { path: '/quizzes/which-tcg',          priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/mtg-archetype',      priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/mtg-colour',         priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/pokemon-era',        priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/lorcana-ink',        priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/riftbound-champion', priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/investor-collector', priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/rarity',             priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/starwars-affiliation',  priority: '0.7', changefreq: 'monthly' },
  { path: '/quizzes/dragonball-character',  priority: '0.7', changefreq: 'monthly' },
  { path: '/blog',                priority: '0.8', changefreq: 'daily'   },
  { path: '/tracker.html',        priority: '0.8', changefreq: 'weekly'  },
  { path: '/ev-calculator.html',  priority: '0.7', changefreq: 'weekly'  },
  { path: '/calendar',            priority: '0.7', changefreq: 'weekly'  },
  { path: '/tools',               priority: '0.8', changefreq: 'weekly'  },
  { path: '/play',                priority: '0.8', changefreq: 'weekly'  },
  { path: '/dnd',                 priority: '0.6', changefreq: 'monthly' },
  { path: '/shop.html',           priority: '0.6', changefreq: 'weekly'  },
  { path: '/contact.html',        priority: '0.4', changefreq: 'monthly' },
  { path: '/legal.html',          priority: '0.3', changefreq: 'monthly' },
];

// Blog post slugs fetched from Supabase (blog post metadata not in Supabase,
// so we generate known range p001-p247 using Eleventy slug pattern)
// These are served at /blog/[slug]/ via Eleventy
// We fetch them dynamically by querying what pages exist -- but since blog
// posts are static markdown files not in Supabase, we include known ones
// as a hardcoded range. The Eleventy sitemap.xml already covers blog posts,
// so we keep this function focused on pages NOT in sitemap.xml.

export default async (req) => {
  const headers = {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=43200', // 12 hours
  };

  const today = new Date().toISOString().slice(0, 10);

  try {
    // Build static page entries
    const staticUrls = STATIC_PAGES.map(p =>
      `  <url>\n    <loc>${SITE_URL}${p.path}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
    ).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- C3 Static Pages, Tools, Quizzes, and Generators -->
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
