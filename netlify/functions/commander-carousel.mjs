// commander-carousel.mjs
// Returns commanders for the carousel on the homepage and set pages
// Uses Scryfall API (free, no auth required)
// Netlify v2 function format (default async req handler returning a Response)
//
// Query params:
//   ?mode=top        - 2 random commanders from each of the last 10 released sets
//   ?mode=set&setcode=sos - commanders from a specific set, sorted by EDHREC rank
//   ?limit=20        - number of commanders to return (default 20, max 40)
//
// task-155 rebuild (mode=top only). It used to be a flat "top 40 by EDHREC rank", which is
// dominated by the same handful of perennial staples and barely changes month to month. It now
// returns 2 random commanders from each of the last 10 RELEASED sets, so the carousel spreads
// across recent Magic instead of the all-time list, and the pick rotates on its own.
//
// Three sources of rotation, deliberately layered:
//   1. The set list is derived live from Scryfall, so a new set enters and the tenth drops out
//      with no code change. This is what SET_QUERY/SET_DISPLAY_NAME used to need a manual edit
//      for, and that manual step is now gone for mode=top.
//   2. The 2-per-set pick is random per cache period.
//   3. The homepage shuffles again client-side on every load.
//
// mode=set is UNCHANGED. card-index.mjs calls it per set page and expects the old behaviour.

const SET_QUERY = '(set:sos or set:soa or set:soc)';
const SET_DISPLAY_NAME = 'Secrets of Strixhaven';
const CACHE_SECONDS = 3600; // 1 hour - client shuffles for per-load variety

// mode=top shape: 10 sets x 2 commanders = the 20 the homepage renders.
// Verified against Scryfall on 28 Jul 2026: the thinnest of the last 10 sets (Edge of
// Eternities) still carries 15 legendary creatures, so 2 per set is never short.
const RECENT_SET_COUNT   = 10;
const COMMANDERS_PER_SET = 2;

// Only these count as "released MTG sets". Promos, tokens, masterpieces, Alchemy and the rest
// of Scryfall's 24 set_type values are not sets a player would name, and digital-only sets have
// no paper singles to sell.
const SET_TYPES = ['expansion', 'core'];

// Scryfall pages search results at 175. The last 10 sets hold ~548 legendary creatures, so all
// 10 sets are only guaranteed to appear after 4 pages. Cold, that measured 7.6s, which is why
// netlify.toml gives this function a raised timeout. PAGE_BUDGET_MS stops paging and uses
// whatever arrived rather than letting a slow Scryfall run the whole function out of time.
const MAX_PAGES      = 4;
const PAGE_BUDGET_MS = 12000;
const FETCH_TIMEOUT  = 8000;

const EPN_CAMPID = '5339146789';
const EBAY_MKRID = '705-53470-19255-0';

// Colour identity symbol map for display
const COLOUR_SYMBOLS = {
  W: '☀️', U: '💧', B: '💀', R: '🔥', G: '🌲'
};

// Guild/wedge name lookup for colour identity combos
const IDENTITY_NAMES = {
  'W':    'Mono White',
  'U':    'Mono Blue',
  'B':    'Mono Black',
  'R':    'Mono Red',
  'G':    'Mono Green',
  'WU':   'Azorius',
  'UB':   'Dimir',
  'BR':   'Rakdos',
  'RG':   'Gruul',
  'GW':   'Selesnya',
  'WB':   'Orzhov',
  'UR':   'Izzet',
  'BG':   'Golgari',
  'WR':   'Boros',
  'GU':   'Simic',
  'WUB':  'Esper',
  'UBR':  'Grixis',
  'BRG':  'Jund',
  'RGW':  'Naya',
  'GWU':  'Bant',
  'WBG':  'Abzan',
  'URW':  'Jeskai',
  'BGU':  'Sultai',
  'RWB':  'Mardu',
  'GUR':  'Temur',
  'WUBR': 'Yore-Tiller',
  'UBRG': 'Glint-Eye',
  'BRGW': 'Dune-Brood',
  'RGWU': 'Ink-Treader',
  'GWUB': 'Witch-Maw',
  'WUBRG': '5 Colour',
  '': 'Colourless'
};

function getIdentityName(colours) {
  if (!colours || colours.length === 0) return 'Colourless';
  const sorted = [...colours].sort((a, b) => 'WUBRG'.indexOf(a) - 'WUBRG'.indexOf(b));
  const key = sorted.join('');
  return IDENTITY_NAMES[key] || key;
}

function buildEbayLink(cardName, customId = 'C3CmdCarousel') {
  // The eBay site id param is deliberately absent: pinning it breaks worldwide routing and is a
  // standing audit failure (audit point 10). mkrid already carries the AU routing.
  // The literal is not written out even in a comment, so a content scan cannot false-positive
  // on this file the way task-154 found blog pages tripping on a script string.
  return `https://www.ebay.com.au/str/cardsoncardsoncards?_nkw=${encodeURIComponent(cardName)}&mkcid=1&mkrid=${EBAY_MKRID}&campid=${EPN_CAMPID}&customid=${customId}&toolid=10001&mkevt=1`;
}

function buildCardSlug(card) {
  // Match the slug format used by card-page.mjs: lowercase, hyphens, no special chars
  return card.name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function formatCard(card, customId) {
  let image = null;
  if (card.image_uris) {
    image = card.image_uris.normal || card.image_uris.large || card.image_uris.small || null;
  } else if (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris) {
    image = card.card_faces[0].image_uris.normal || card.card_faces[0].image_uris.large || null;
  }

  const colourIdentity = card.color_identity || [];
  const identityName = getIdentityName(colourIdentity);
  const slug = buildCardSlug(card);

  return {
    id: card.id,
    name: card.name,
    slug: slug,
    image: image,
    colourIdentity: colourIdentity,
    identityName: identityName,
    edhrecRank: card.edhrec_rank || 99999,
    setName: card.set_name || SET_DISPLAY_NAME,
    setCode: card.set || '',
    typeLine: card.type_line || '',
    oracleText: (card.oracle_text || '').slice(0, 120) + ((card.oracle_text || '').length > 120 ? '...' : ''),
    cardVaultUrl: `/cards/mtg/${slug}`,
    ebayUrl: buildEbayLink(card.name, customId)
  };
}

const SCRYFALL_HEADERS = {
  'User-Agent': 'CardsOnCardsOnCards/1.0 (https://cardsoncardsoncards.com.au)',
  'Accept': 'application/json'
};

// Every Scryfall call goes through here so the AbortController timeout is never forgotten.
async function scryfallGet(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: SCRYFALL_HEADERS });
    clearTimeout(timer);
    if (!res.ok) {
      console.error('Scryfall error:', res.status, url);
      return null;
    }
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    console.error('Scryfall fetch failed:', e.message);
    return null;
  }
}

// Fisher-Yates. Used for the per-set pick, so the 2 chosen commanders vary per cache period.
function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// The last RECENT_SET_COUNT sets that have actually come out, newest first.
// released_at is compared as a plain YYYY-MM-DD string, which is what Scryfall returns and what
// sorts correctly lexicographically, so no Date parsing is needed.
async function getRecentSetCodes() {
  const data = await scryfallGet('https://api.scryfall.com/sets');
  if (!data || !Array.isArray(data.data)) return [];
  const today = new Date().toISOString().slice(0, 10);
  return data.data
    .filter(s => SET_TYPES.includes(s.set_type) && !s.digital && s.released_at && s.released_at <= today)
    .sort((a, b) => b.released_at.localeCompare(a.released_at))
    .slice(0, RECENT_SET_COUNT)
    .map(s => s.code);
}

// Walk the paged search result, stopping at MAX_PAGES or when the time budget runs out.
// Returns whatever was collected, which is always usable even if a page was missed.
async function fetchAllPages(query) {
  const started = Date.now();
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=set&dir=asc&unique=cards`;
  const cards = [];
  for (let page = 0; page < MAX_PAGES && url; page++) {
    if (Date.now() - started > PAGE_BUDGET_MS) {
      console.warn(`Commander carousel: page budget spent after ${page} pages`);
      break;
    }
    const data = await scryfallGet(url);
    if (!data || !Array.isArray(data.data)) break;
    cards.push(...data.data);
    url = data.has_more ? data.next_page : null;
  }
  return cards;
}

export default async (req) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${CACHE_SECONDS}`
  };

  if (req.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  const url = new URL(req.url);
  const params = url.searchParams;
  const mode = params.get('mode') || 'top';
  // top mode builds exactly RECENT_SET_COUNT x COMMANDERS_PER_SET (20) and the 40 here is only
  // a ceiling, so the existing ?limit=40 callers keep every card they are already given.
  // For set mode: 20 (a single set has limited legendary creatures anyway)
  const limit = mode === 'top' ? 40 : Math.min(parseInt(params.get('limit') || '20', 10), 40);

  // A commander tile is an image tile. No image, no tile.
  const hasImage = c => c.image_uris || (c.card_faces && c.card_faces[0] && c.card_faces[0].image_uris);

  try {
    let commanders;
    let displayTitle;

    if (mode === 'set') {
      // UNCHANGED from the pre-task-155 behaviour. One set, ordered by EDHREC rank.
      const customId = 'C3SetCmdCarousel';
      const setcode = params.get('setcode') ? params.get('setcode').trim().toLowerCase() : null;
      let query;
      if (setcode) {
        // Single set code - show all legendary creatures from this set
        query = `set:${setcode} t:legendary t:creature`;
        displayTitle = `Commanders in This Set`;
      } else {
        // Fallback: use the hardcoded spotlight set (Strixhaven)
        query = `${SET_QUERY} t:legendary t:creature`;
        displayTitle = `Commanders from ${SET_DISPLAY_NAME}`;
      }

      const scryfallUrl = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=edhrec&dir=asc&unique=cards`;
      const data = await scryfallGet(scryfallUrl);
      if (!data || !Array.isArray(data.data) || data.data.length === 0) {
        return new Response(
          JSON.stringify({ commanders: [], title: displayTitle }),
          { status: 200, headers }
        );
      }
      commanders = data.data.filter(hasImage).slice(0, limit).map(c => formatCard(c, customId));

    } else {
      // task-155: 2 random commanders from each of the last 10 released sets.
      const customId = 'C3TopCmdCarousel';
      displayTitle = 'Your Next Commander Awaits';

      const setCodes = await getRecentSetCodes();
      if (setCodes.length === 0) {
        return new Response(
          JSON.stringify({ commanders: [], title: displayTitle, error: 'no_recent_sets' }),
          { status: 200, headers }
        );
      }

      const query = `(${setCodes.map(c => `set:${c}`).join(' or ')}) t:legendary t:creature`;
      const all = await fetchAllPages(query);

      // Bucket by set, then take COMMANDERS_PER_SET at random from each. Iterating setCodes
      // (not the buckets) keeps the output in newest-set-first order and silently tolerates a
      // set that returned nothing because a page was dropped on the time budget.
      const bySet = new Map();
      for (const card of all) {
        if (!hasImage(card)) continue;
        if (!bySet.has(card.set)) bySet.set(card.set, []);
        bySet.get(card.set).push(card);
      }

      const picked = [];
      for (const code of setCodes) {
        const pool = bySet.get(code);
        if (!pool || pool.length === 0) continue;
        picked.push(...shuffle(pool).slice(0, COMMANDERS_PER_SET));
      }

      console.log(`Commander carousel [top]: ${setCodes.length} sets, ${all.length} legendary creatures, ${bySet.size} sets represented`);
      commanders = picked.slice(0, limit).map(c => formatCard(c, customId));
    }

    console.log(`Commander carousel [${mode}]: returning ${commanders.length} commanders`);

    return new Response(
      JSON.stringify({
        commanders,
        title: displayTitle,
        setDisplayName: SET_DISPLAY_NAME,
        mode
      }),
      { status: 200, headers }
    );

  } catch (err) {
    console.error('Commander carousel error:', err.message);
    return new Response(
      JSON.stringify({ commanders: [], title: 'Top Commanders', error: err.message }),
      { status: 500, headers }
    );
  }
};

export const config = { path: '/commander-carousel' };
