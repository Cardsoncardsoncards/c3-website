// Netlify Function: ebay-prices.js
// Returns top chase cards from the latest MTG set spotlight
// Data: Scryfall (cards + USD price), Frankfurter (live USD->AUD FX)
// No eBay API used (Buy API approval blocked at production scale)
// Each card links to a search of the C3 eBay store with EPN tracking

// Scryfall requires a custom User-Agent. Requests sent with a default HTTP library agent are
// rejected outright with 400 bad_request / subcode generic_user_agent. This function sent no
// headers at all, so from whenever that was enforced it returned zero listings on every blog
// post and the carousel showed its fallback state. Verified 27 Jul 2026: the identical query
// returns 200 with a User-Agent and 400 without. Matches commander-carousel.mjs, which already
// does this correctly. Do not remove the header.
const SCRYFALL_UA = 'CardsOnCardsOnCards/1.0 (https://cardsoncardsoncards.com.au)';

// To rotate to a new set when one releases:
// 1. Update SET_QUERY (combined Scryfall query for the spotlight)
// 2. Update DISPLAY_NAME (umbrella name shown in the carousel title)
// 3. Update SEARCH_TERM (used in the eBay store search link)
//
// ROTATION DEBT, be aware before repeating it. This was pinned to Duskmourn (Sept 2024) and
// sat there for roughly two years, because the rotation above is manual and nothing prompts
// it. Rotated 27 Jul 2026 to Marvel Super Heroes, the newest RELEASED expansion plus its
// commander set, which is the same pairing shape the Duskmourn pin used.
//
// A set-agnostic query would remove this debt permanently, but the obvious formulations are
// wrong in a way worth recording: ordering by release date, or filtering on year, surfaces
// UNRELEASED sets (Star Trek 2026-11-13, Reality Fracture 2026-10-02, The Hobbit 2026-08-14
// all came back when tested). Those cards have no eBay listings to buy, which is worse for a
// storefront carousel than showing an old set. Any dynamic version has to exclude future
// releases explicitly. Left as a follow-up rather than guessed at here.
const SET_QUERY = '(set:msh or set:msc)';
const DISPLAY_NAME = 'Marvel Super Heroes';
const SEARCH_TERM = 'marvel super heroes mtg';
const FALLBACK_FX = 1.55; // Used if Frankfurter call fails
const TOP_N = 12;
const FETCH_TIMEOUT_MS = 8000;

const EPN_CAMPID = '5339146789';

// CLAUDE.md requires an AbortController and timeout on every fetch. Neither call here had one,
// so a hung upstream would stall the function on all 522 blog posts.
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
  } finally {
    clearTimeout(timer);
  }
}

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Step 1: Live USD -> AUD rate (Frankfurter, free, no auth)
    let fx = FALLBACK_FX;
    try {
      const fxRes = await fetchWithTimeout('https://api.frankfurter.dev/v2/rate/USD/AUD');
      if (fxRes.ok) {
        const fxData = await fxRes.json();
        if (fxData && fxData.rate && typeof fxData.rate === 'number') {
          fx = fxData.rate;
        }
      }
    } catch (fxErr) {
      console.log('FX fetch failed, using fallback:', fxErr.message);
    }
    console.log('USD->AUD rate:', fx);

    // Step 2: Scryfall search (all sub-sets in one query, sorted by USD desc)
    const scryfallUrl = 'https://api.scryfall.com/cards/search'
      + '?q=' + encodeURIComponent(SET_QUERY)
      + '&order=usd&dir=desc&unique=cards';

    const sfRes = await fetchWithTimeout(scryfallUrl, {
      headers: { 'User-Agent': SCRYFALL_UA, 'Accept': 'application/json' }
    });
    if (!sfRes.ok) {
      console.log('Scryfall HTTP error:', sfRes.status);
      return { statusCode: 200, headers, body: JSON.stringify({ listings: [], setName: DISPLAY_NAME, setSearchTerm: SEARCH_TERM, error: 'scryfall_status_' + sfRes.status }) };
    }
    const sfData = await sfRes.json();
    if (!sfData.data || !Array.isArray(sfData.data) || sfData.data.length === 0) {
      console.log('Scryfall returned no cards for query:', SET_QUERY);
      return { statusCode: 200, headers, body: JSON.stringify({ listings: [], setName: DISPLAY_NAME, setSearchTerm: SEARCH_TERM }) };
    }

    // Step 3: Filter to cards with valid USD prices, take top N
    const priced = sfData.data.filter(function(c) {
      return c.prices && c.prices.usd && parseFloat(c.prices.usd) > 0;
    });
    if (priced.length === 0) {
      console.log('No cards with USD prices in result set');
      return { statusCode: 200, headers, body: JSON.stringify({ listings: [], setName: DISPLAY_NAME, setSearchTerm: SEARCH_TERM }) };
    }

    const top = priced.slice(0, TOP_N);

    const listings = top.map(function(card) {
      const usd = parseFloat(card.prices.usd);
      const aud = +(usd * fx).toFixed(2);
      // Use small art crop if available, fall back to normal image
      let image = null;
      if (card.image_uris) {
        image = card.image_uris.normal || card.image_uris.large || card.image_uris.small || null;
      } else if (card.card_faces && Array.isArray(card.card_faces) && card.card_faces[0] && card.card_faces[0].image_uris) {
        // Double-faced cards put images on each face
        image = card.card_faces[0].image_uris.normal || card.card_faces[0].image_uris.large || null;
      }

      // Build EPN-tracked search URL into the C3 eBay store for this card name.
      // _sacat=183454 = CCG Individual Cards category (matches sch/i.html links used
      // sitewide); _sop=16 = eBay sort code for price + postage highest first.
      // NOTE: store (/str/) search param support for _sacat/_sop should be
      // browser-verified on the live carousel after deploy; item search (/sch/i.html)
      // is confirmed to honour both. Seller filter and campid left untouched.
      const storeSearch = 'https://www.ebay.com.au/str/cardsoncardsoncards'
        + '?_nkw=' + encodeURIComponent(card.name)
        + '&_sacat=183454&_sop=16'
        + '&mkcid=1&mkrid=705-53470-19255-0'
        + '&campid=' + EPN_CAMPID
        + '&customid=C3SpotlightCarousel&toolid=10001&mkevt=1';

      return {
        id: card.id,
        title: card.name + ' (' + (card.set_name || DISPLAY_NAME) + ')',
        price: aud,
        url: storeSearch,
        image: image
      };
    });

    console.log('Returning', listings.length, 'listings. Top price AUD:', listings[0] ? listings[0].price : 'none');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        listings: listings,
        setName: DISPLAY_NAME,
        setSearchTerm: SEARCH_TERM,
        fx: fx
      })
    };

  } catch (error) {
    console.error('Spotlight carousel error:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ listings: [], setName: DISPLAY_NAME, setSearchTerm: SEARCH_TERM, error: error.message })
    };
  }
};
