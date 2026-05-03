// commander-carousel.mjs
// Returns top commanders for the carousel on the homepage and set pages
// Uses Scryfall API (free, no auth required)
//
// Query params:
//   ?mode=top        — top commanders by EDHREC rank (homepage default)
//   ?mode=set&set=sos — commanders from a specific set, sorted by EDHREC rank
//   ?limit=20        — number of commanders to return (default 20, max 40)
//
// Rotation: update SET_QUERY and SET_DISPLAY_NAME below when new sets release

const SET_QUERY = '(set:sos or set:soa or set:soc)';
const SET_DISPLAY_NAME = 'Secrets of Strixhaven';
const CACHE_SECONDS = 3600; // 1 hour — client shuffles for per-load variety

const EPN_CAMPID = '5339146789';
const EBAY_MKRID = '705-53470-19255-0';
const EBAY_SITEID = '15';

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
  return `https://www.ebay.com.au/str/cardsoncardsoncards?_nkw=${encodeURIComponent(cardName)}&mkcid=1&mkrid=${EBAY_MKRID}&siteid=${EBAY_SITEID}&campid=${EPN_CAMPID}&customid=${customId}&toolid=10001&mkevt=1`;
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

export const handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${CACHE_SECONDS}`
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const params = event.queryStringParameters || {};
  const mode = params.mode || 'top';
  // For top mode: fetch 40 so client can shuffle and show 20 unique each load
  // For set mode: fetch 20 (set has limited legendary creatures anyway)
  const limit = mode === 'top' ? 40 : Math.min(parseInt(params.limit || '20', 10), 40);

  try {
    let query;
    let displayTitle;
    let customId;

    if (mode === 'set') {
      // Use dynamic setcode param if provided (e.g. ?mode=set&setcode=2xm)
      // Falls back to the hardcoded spotlight set if no setcode given
      const setcode = params.setcode ? params.setcode.trim().toLowerCase() : null;
      if (setcode) {
        // Single set code — show all legendary creatures from this set
        query = `set:${setcode} t:legendary t:creature`;
        displayTitle = `Commanders in This Set`;
      } else {
        // Fallback: use the hardcoded spotlight set (Strixhaven)
        query = `${SET_QUERY} t:legendary t:creature`;
        displayTitle = `Commanders from ${SET_DISPLAY_NAME}`;
      }
      customId = 'C3SetCmdCarousel';
    } else {
      // Top commanders globally — fetch 40, client shuffles to show 20 different each load
      query = 't:legendary t:creature f:commander';
      displayTitle = 'Your Next Commander Awaits';
      customId = 'C3TopCmdCarousel';
    }

    const scryfallUrl = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=edhrec&dir=asc&unique=cards`;

    const res = await fetch(scryfallUrl);
    if (!res.ok) {
      console.error('Scryfall error:', res.status);
      return { statusCode: 200, headers, body: JSON.stringify({ commanders: [], title: displayTitle, error: 'scryfall_' + res.status }) };
    }

    const data = await res.json();
    if (!data.data || data.data.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ commanders: [], title: displayTitle }) };
    }

    const commanders = data.data
      .filter(c => c.image_uris || (c.card_faces && c.card_faces[0] && c.card_faces[0].image_uris))
      .slice(0, limit)
      .map(c => formatCard(c, customId));

    console.log(`Commander carousel [${mode}]: returning ${commanders.length} commanders`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        commanders,
        title: displayTitle,
        setDisplayName: SET_DISPLAY_NAME,
        mode
      })
    };

  } catch (err) {
    console.error('Commander carousel error:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ commanders: [], title: 'Top Commanders', error: err.message })
    };
  }
};
