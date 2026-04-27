// Netlify Function: ebay-prices.js
// Returns top 20 most expensive listings from the C3 eBay store for carousel display
// Credentials stored as Netlify environment variables

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=1800' // 30 min cache
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
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenResponse = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope'
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      throw new Error('Failed to obtain eBay access token');
    }

    // Step 2: Search by seller, sorted by price descending, limit 20
    const searchUrl = 'https://api.ebay.com/buy/browse/v1/item_summary/search' +
      '?filter=sellers:{cardsoncardsoncards},buyingOptions:{FIXED_PRICE}' +
      '&sort=-price' +
      '&limit=20' +
      '&fieldgroups=MATCHING_ITEMS';

    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_AU',
        'X-EBAY-C-ENDUSERCTX': `affiliateCampaignId=${campId}`
      }
    });

    const searchData = await searchResponse.json();

    if (!searchData.itemSummaries || searchData.itemSummaries.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ listings: [] })
      };
    }

    // Step 3: Map to carousel-ready format with EPN affiliate links
    const listings = searchData.itemSummaries.map(item => {
      const price = item.price ? parseFloat(item.price.value) : 0;
      const itemId = item.itemId || '';
      // Build EPN affiliate URL
      const epnUrl = `https://www.ebay.com.au/itm/${itemId}?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=${campId}&customid=C3Carousel&toolid=10001&mkevt=1`;
      const image = item.image ? item.image.imageUrl : null;

      return {
        id: itemId,
        title: item.title || '',
        price: price,
        url: epnUrl,
        image: image
      };
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ listings })
    };

  } catch (error) {
    console.error('eBay carousel error:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ listings: [], error: error.message })
    };
  }
};
