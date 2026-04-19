// Netlify Function: ebay-prices.js
// Fetches live eBay AU listing prices for TCG cards
// Credentials are stored as Netlify environment variables - never in code

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': 'https://cardsoncardsoncards.com.au',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const { query, limit = 10 } = event.queryStringParameters || {};

  if (!query) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'query parameter required' })
    };
  }

  try {
    // Step 1: Get OAuth token using Client Credentials flow
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('eBay credentials not configured');
    }

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

    // Step 2: Search eBay AU for listings
    const searchUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&filter=itemLocationCountry:AU,buyingOptions:{FIXED_PRICE}&limit=${limit}&sort=price`;

    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_AU',
        'X-EBAY-C-ENDUSERCTX': `affiliateCampaignId=${process.env.EBAY_CAMPAIGN_ID || '5339146789'}`
      }
    });

    const searchData = await searchResponse.json();

    if (!searchData.itemSummaries || searchData.itemSummaries.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ prices: [], average: null, count: 0 })
      };
    }

    // Step 3: Extract prices and calculate average
    const prices = searchData.itemSummaries
      .filter(item => item.price && item.price.value)
      .map(item => parseFloat(item.price.value));

    const average = prices.length > 0
      ? Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100
      : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        prices,
        average,
        count: prices.length,
        query
      })
    };

  } catch (error) {
    console.error('eBay API error:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch eBay prices', fallback: true })
    };
  }
};
