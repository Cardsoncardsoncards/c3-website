// netlify/functions/set-carousel.mjs
// Server-side Supabase query for set-specific card carousels
// Called by homepage and other pages to fetch top cards from a specific set
//
// Query params:
//   ?game=riftbound&set_id=500006&limit=16
//   ?game=lorcana&set_id=4500014&limit=16
//   ?game=mtg&set_code=msh&limit=20
//
// The tcgapi-backed games (riftbound, lorcana, pokemon, yugioh, onepiece, starwars,
// dragonball) all share one column shape: set_id, image_url, market_price, number.
// MTG does NOT. Its table came from Scryfall and uses set_code, image_uri, price_aud and
// collector_number, with no set_id column at all. The old single query shape here selected
// the tcgapi columns for every game, so ?game=mtg errored on a missing column and the
// carousel silently hid itself. Each game now carries its own column map (task-108) and
// the query is built from that, so adding a game means adding a config entry, not editing
// the query.
//
// Whatever the source columns, the JSON returned is always normalised to image_url +
// priceDisplay, because that is what buildCardEl on the homepage reads.

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const EPN_CAMPID        = '5339146789';
const USD_TO_AUD        = 1.45;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=1800'
    }
  });
}

// Per-game table, URL path and column map.
//   setCol    column the set filter applies to
//   imageCol  image column
//   priceCol  column to sort and price by
//   numberCol collector number column
//   priceIsAud  true when priceCol is already AUD, false when it needs the USD conversion
//   dedupeBySlug  MTG only. Every printing of a card is its own row but the card page is
//                 served per slug, so an undeduped top-20 shows the same card several times,
//                 each tile linking to the same page. Collapse by slug keeping the
//                 highest-priced printing, the same rule generate-sitemap-cards.mjs uses.
// Membership in this object is a CAPABILITY gate, not a display list: an unlisted game gets a
// 400 "Invalid game parameter" from this endpoint (see the cfg check below). So games are added
// here, never removed. task-118 adds dbsfusionworld (the Core Dragon Ball game), which was
// simply missing and therefore un-carouselable. dragonball is KEPT: it is Extended now, but
// removing it would 400 any caller still asking for it. There is nothing Core-specific in here
// to demote, this object carries no labels, colours or ordering.
const GAME_CONFIG = {
  riftbound:  { table: 'riftbound_cards',  path: '/cards/riftbound',  setCol: 'set_id', imageCol: 'image_url', priceCol: 'market_price', numberCol: 'number', priceIsAud: false },
  dbsfusionworld: { table: 'dbsfusionworld_cards', path: '/cards/dbsfusionworld', setCol: 'set_id', imageCol: 'image_url', priceCol: 'market_price', numberCol: 'number', priceIsAud: false },
  lorcana:    { table: 'lorcana_cards',    path: '/cards/lorcana',    setCol: 'set_id', imageCol: 'image_url', priceCol: 'market_price', numberCol: 'number', priceIsAud: false },
  pokemon:    { table: 'pokemon_cards',    path: '/cards/pokemon',    setCol: 'set_id', imageCol: 'image_url', priceCol: 'market_price', numberCol: 'number', priceIsAud: false },
  yugioh:     { table: 'yugioh_cards',     path: '/cards/yugioh',     setCol: 'set_id', imageCol: 'image_url', priceCol: 'market_price', numberCol: 'number', priceIsAud: false },
  onepiece:   { table: 'onepiece_cards',   path: '/cards/onepiece',   setCol: 'set_id', imageCol: 'image_url', priceCol: 'market_price', numberCol: 'number', priceIsAud: false },
  starwars:   { table: 'starwars_cards',   path: '/cards/starwars',   setCol: 'set_id', imageCol: 'image_url', priceCol: 'market_price', numberCol: 'number', priceIsAud: false },
  dragonball: { table: 'dragonball_cards', path: '/cards/dragonball', setCol: 'set_id', imageCol: 'image_url', priceCol: 'market_price', numberCol: 'number', priceIsAud: false },
  mtg:        { table: 'mtg_cards',        path: '/cards/mtg',        setCol: 'set_code', imageCol: 'image_uri', priceCol: 'price_aud', numberCol: 'collector_number', priceIsAud: true, dedupeBySlug: true },
};

export default async (req) => {
  const url   = new URL(req.url);
  const game  = (url.searchParams.get('game') || '').toLowerCase();
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '16'), 24);

  const cfg = GAME_CONFIG[game];
  if (!game || !cfg) {
    return json({ error: 'Invalid game parameter' }, 400);
  }

  // set_code is the MTG-shaped param, set_id the tcgapi-shaped one. Accept either and apply
  // it to whichever column this game actually keys its sets on, so the existing set_id callers
  // keep working untouched.
  const setValue = url.searchParams.get('set_code') || url.searchParams.get('set_id');

  // Deduping collapses rows, so fetch a deeper page first or a top-20 could come back short.
  const fetchLimit = cfg.dedupeBySlug ? Math.min(limit * 5, 120) : limit;

  let query = `${SUPABASE_URL}/rest/v1/${cfg.table}?`;
  if (setValue) {
    query += `${cfg.setCol}=eq.${encodeURIComponent(setValue)}&`;
  }
  // Filter: must have an image, must have a price, must be a real card not a sealed product
  query += `${cfg.imageCol}=not.is.null&${cfg.priceCol}=gt.0&rarity=not.is.null&rarity=neq.None`;
  query += `&order=${cfg.priceCol}.desc.nullslast&limit=${fetchLimit}`;
  // Every one of these tables also carries price_aud. The tcgapi games sort by market_price
  // (USD) but DISPLAY price_aud when it is populated, which is the behaviour that shipped, so
  // price_aud is always selected. For MTG it is the sort column, hence the dedupe of the list.
  const selectCols = [...new Set(
    ['slug', 'name', cfg.numberCol, cfg.imageCol, cfg.priceCol, 'price_aud', 'rarity', 'set_name']
  )];
  query += `&select=${selectCols.join(',')}`;

  try {
    const res = await fetch(query, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    if (!res.ok) {
      const err = await res.text();
      return json({ error: `Supabase error: ${err.slice(0, 200)}` }, 500);
    }

    let rows = await res.json();
    if (!Array.isArray(rows)) {
      return json({ error: 'Supabase returned a non-array payload' }, 500);
    }

    // Filter out sealed products server-side
    const sealedKeywords = ['booster box', 'booster case', 'elite trainer', 'display box', 'case (wave', 'booster set', 'display case', 'event kit', 'trove case', 'champion deck', 'display', 'sealed', 'bundle', 'collection box'];
    rows = rows.filter(c => {
      const nameLower = (c.name || '').toLowerCase();
      // Keep if rarity is set (individual cards always have rarity)
      if (c.rarity && c.rarity !== 'None' && c.rarity !== 'none') return true;
      // Reject if name contains sealed keywords
      return !sealedKeywords.some(kw => nameLower.includes(kw));
    });

    // MTG only: one row per printing, one card page per slug. Keep the dearest printing.
    if (cfg.dedupeBySlug) {
      const bySlug = new Map();
      for (const c of rows) {
        if (!c.slug) continue;
        const prev = bySlug.get(c.slug);
        if (!prev || parseFloat(c[cfg.priceCol]) > parseFloat(prev[cfg.priceCol])) {
          bySlug.set(c.slug, c);
        }
      }
      rows = [...bySlug.values()].sort(
        (a, b) => parseFloat(b[cfg.priceCol]) - parseFloat(a[cfg.priceCol])
      );
    }

    rows = rows.slice(0, limit);

    // Normalise to the shape the homepage carousel reads, whatever the source columns were.
    // priceDisplay keeps the original precedence exactly: a real price_aud renders as AU$X,
    // and only when it is missing does the USD market_price get converted and marked with a
    // tilde as an estimate. MTG sets price_aud as its own priceCol, so it takes the first arm.
    const cards = rows.map(c => {
      const aud    = parseFloat(c.price_aud);
      const source = parseFloat(c[cfg.priceCol]);
      let priceDisplay = '';
      if (Number.isFinite(aud) && aud > 0) {
        priceDisplay = `AU$${aud.toFixed(0)}`;
      } else if (Number.isFinite(source) && source > 0) {
        priceDisplay = `~AU$${(source * USD_TO_AUD).toFixed(0)}`;
      }
      return {
        slug:         c.slug,
        name:         c.name,
        rarity:       c.rarity,
        set_name:     c.set_name,
        number:       c[cfg.numberCol],
        image_url:    c[cfg.imageCol],
        price_aud:    Number.isFinite(aud) ? aud.toFixed(2) : null,
        cardUrl:      `${cfg.path}/${c.slug}`,
        ebayUrl:      `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(c.name)}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`,
        priceDisplay,
      };
    });

    return json({ cards, game, set: setValue, count: cards.length });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

export const config = { path: '/api/set-carousel' };
