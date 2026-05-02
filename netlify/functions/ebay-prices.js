// Netlify Function: ebay-prices.js
// Returns top chase cards from the latest MTG set spotlight
// Data: Scryfall (cards + USD price), Frankfurter (live USD->AUD FX)
// No eBay API used (Buy API approval blocked at production scale)
// Each card links to a search of the C3 eBay store with EPN tracking

// To rotate to a new set when one releases:
// 1. Update SET_QUERY (combined Scryfall query for the spotlight)
// 2. Update DISPLAY_NAME (umbrella name shown in the carousel title)
// 3. Update SEARCH_TERM (used in the eBay store search link)

const SET_QUERY = '(set:sos or set:soa or set:soc)';
const DISPLAY_NAME = 'Strixhaven';
const SEARCH_TERM = 'strixhaven';
const FALLBACK_FX = 1.55; // Used if Frankfurter call fails
const TOP_N = 12;

const EPN_CAMPID = '5339146789';

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
      const fxRes = await fetch('https://api.frankfurter.dev/v2/rate/USD/AUD');
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

    const sfRes = await fetch(scryfallUrl);
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

      // Build EPN-tracked search URL into the C3 eBay store for this card name
      const storeSearch = 'https://www.ebay.com.au/str/cardsoncardsoncards'
        + '?_nkw=' + encodeURIComponent(card.name)
        + '&mkcid=1&mkrid=705-53470-19255-0&siteid=15'
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
