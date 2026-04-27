// Netlify Function: ebay-prices.js
// Returns top 20 most expensive individual card listings from the C3 eBay store

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=1800'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;
    const campId = process.env.EBAY_CAMPAIGN_ID || '5339146789';

    if (!clientId || !clientSecret) {
      throw new Error('eBay credentials not configured');
    }

    // Step 1: Get OAuth token
    const credentials = Buffer.from(clientId + ':' + clientSecret).toString('base64');
    const tokenResponse = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + credentials,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope'
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      throw new Error('Failed to obtain eBay access token');
    }

    // Step 2: category_ids=183454 = CCG Individual Cards
    // Toys & Hobbies > Collectible Card Games > CCG Individual Cards
    // Covers MTG, Pokemon, Lorcana, One Piece, Riftbound, Dragon Ball, Yu-Gi-Oh
    // No q= keyword needed - category_ids satisfies Browse API requirement
    const filter = 'sellers%3A%7Bcardsoncardsoncards%7D%2CbuyingOptions%3A%7BFIXED_PRICE%7D';
    const searchUrl = 'https://api.ebay.com/buy/browse/v1/item_summary/search' +
      '?category_ids=183454' +
      '&filter=' + filter +
      '&sort=-price' +
      '&limit=20';

    console.log('Search URL:', searchUrl);

    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': 'Bearer ' + tokenData.access_token,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_AU',
        'X-EBAY-C-ENDUSERCTX': 'affiliateCampaignId=' + campId
      }
    });

    const searchData = await searchResponse.json();
    console.log('Status:', searchResponse.status, '| Total:', searchData.total || 0);

    if (!searchData.itemSummaries || searchData.itemSummaries.length === 0) {
      console.log('No items. Response:', JSON.stringify(searchData).substring(0, 500));
      return { statusCode: 200, headers, body: JSON.stringify({ listings: [] }) };
    }

    const listings = searchData.itemSummaries.map(function(item) {
      const price = item.price ? parseFloat(item.price.value) : 0;
      const itemId = item.itemId || '';
      const epnUrl = 'https://www.ebay.com.au/itm/' + itemId +
        '?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=' + campId +
        '&customid=C3Carousel&toolid=10001&mkevt=1';
      const image = item.image ? item.image.imageUrl : null;
      return { id: itemId, title: item.title || '', price: price, url: epnUrl, image: image };
    });

    console.log('Returning', listings.length, 'listings. Top price:', listings[0] ? listings[0].price : 'none');
    return { statusCode: 200, headers, body: JSON.stringify({ listings: listings }) };

  } catch (error) {
    console.error('eBay carousel error:', error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ listings: [], error: error.message }) };
  }
};
