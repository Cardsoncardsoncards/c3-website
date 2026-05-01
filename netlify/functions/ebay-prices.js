// Netlify Function: ebay-prices.js
// Returns top chase cards from the latest MTG set, priced in AUD
// Data: Scryfall (free, no auth) + Frankfurter (free FX, no auth)
// Output shape preserved for backward compatibility with index.html and shop.html
//
// To switch sets when a new release drops, change the SET_CODE constant below.
// Scryfall set codes: https://scryfall.com/sets

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600' // 1 hour cache
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // ============================================================
  // CONFIG: Change SET_CODE when a new MTG set drops
  // Verify codes at scryfall.com/sets
  // Secrets of Strixhaven main set: 'sos' (released 2026-04-24, 368 cards)
  // Companion sets: 'soc' (Commander precons), 'soa' (Mystical Archive)
  // ============================================================
  const SET_CODE = 'sos';
  const SET_DISPLAY_NAME = 'Secrets of Strixhaven';
  const TOP_N = 12;
  const FALLBACK_USD_TO_AUD = 1.55;
  const CAMPID = process.env.EBAY_CAMPAIGN_ID || '5339146789';
  const STORE_SLUG = 'cardsoncardsoncards';

  try {
    // Step 1: Get USD/AUD exchange rate from Frankfurter (free, no auth)
    let usdToAud = FALLBACK_USD_TO_AUD;
    try {
      const fxResponse = await fetch('https://api.frankfurter.dev/v2/rate/USD/AUD');
      if (fxResponse.ok) {
        const fxData = await fxResponse.json();
        if (fxData && typeof fxData.rate === 'number' && fxData.rate > 0) {
          usdToAud = fxData.rate;
          console.log('FX rate USD->AUD:', usdToAud);
        }
      }
    } catch (fxErr) {
      console.log('FX fetch failed, using fallback rate:', FALLBACK_USD_TO_AUD, '| reason:', fxErr.message);
    }

    // Step 2: Query Scryfall for cards in the set, sorted by USD price desc
    // unique=cards collapses different printings of the same card to one entry
    // order=usd + dir=desc gives us the most expensive first
    const scryfallUrl = 'https://api.scryfall.com/cards/search' +
      '?q=' + encodeURIComponent('set:' + SET_CODE) +
      '&order=usd' +
      '&dir=desc' +
      '&unique=cards';

    console.log('Scryfall URL:', scryfallUrl);

    const scryResponse = await fetch(scryfallUrl, {
      headers: {
        'User-Agent': 'C3-Cards/1.0 (cardsoncardsoncards.com.au)',
        'Accept': 'application/json'
      }
    });

    if (!scryResponse.ok) {
      throw new Error('Scryfall HTTP ' + scryResponse.status);
    }

    const scryData = await scryResponse.json();
    if (!scryData.data || !Array.isArray(scryData.data) || scryData.data.length === 0) {
      console.log('Scryfall returned no cards for set:', SET_CODE);
      return { statusCode: 200, headers, body: JSON.stringify({ listings: [] }) };
    }

    console.log('Scryfall total cards in set:', scryData.total_cards || scryData.data.length);

    // Step 3: Filter to cards with valid USD prices, take top N
    const priced = scryData.data.filter(function(card) {
      if (!card.prices) return false;
      const usd = parseFloat(card.prices.usd);
      return !isNaN(usd) && usd > 0;
    });

    console.log('Cards with USD prices:', priced.length);

    if (priced.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ listings: [] }) };
    }

    const topCards = priced.slice(0, TOP_N);

    // Step 4: Build listing objects matching the shape index.html and shop.html expect
    // Existing frontend reads: id, title, price, url, image
    // We slot AUD price into the existing price field so no frontend change needed
    const listings = topCards.map(function(card) {
      const usdPrice = parseFloat(card.prices.usd);
      const audPrice = Math.round(usdPrice * usdToAud * 100) / 100;

      // Best-effort image: prefer normal image_uris.normal, fall back to small or card_faces[0] for double-faced cards
      let image = null;
      if (card.image_uris && card.image_uris.normal) {
        image = card.image_uris.normal;
      } else if (card.image_uris && card.image_uris.small) {
        image = card.image_uris.small;
      } else if (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris && card.card_faces[0].image_uris.normal) {
        image = card.card_faces[0].image_uris.normal;
      }

      // Build store search URL with EPN tracking. eBay's store search will show
      // matching listings if the store has them; if not, the same page offers
      // a "search all eBay" option to the user.
      const cardNameQuery = encodeURIComponent(card.name);
      const epnUrl = 'https://www.ebay.com.au/str/' + STORE_SLUG +
        '?_nkw=' + cardNameQuery +
        '&mkcid=1&mkrid=705-53470-19255-0&siteid=15' +
        '&campid=' + CAMPID +
        '&customid=ChaseCarousel' +
        '&toolid=10001&mkevt=1';

      // Use Scryfall card id as the listing id so GA4 events stay unique
      return {
        id: card.id || '',
        title: card.name + ' (' + SET_DISPLAY_NAME + ')',
        price: audPrice,
        url: epnUrl,
        image: image
      };
    });

    console.log('Returning', listings.length, 'cards. Top:', listings[0] ? listings[0].title + ' @ AU$' + listings[0].price : 'none');

    return { statusCode: 200, headers, body: JSON.stringify({ listings: listings }) };

  } catch (error) {
    console.error('Chase carousel error:', error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ listings: [], error: error.message }) };
  }
};
