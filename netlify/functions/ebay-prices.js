// Netlify Function: ebay-prices.js
// Fetches top 20 most expensive live listings from C3 eBay store
// Credentials stored as Netlify environment variables - never in code

const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
let cache = { data: null, timestamp: 0 };

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': 'https://cardsoncardsoncards.com.au',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Return cached data if fresh
  const now = Date.now();
  if (cache.data && (now - cache.timestamp) < CACHE_DURATION) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(cache.data)
    };
  }

  try {
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;

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

    // Step 2: Search C3 store listings sorted by price descending
    const searchUrl = 'https://api.ebay.com/buy/browse/v1/item_summary/search' +
      '?q=card' +
      '&filter=sellers%3A%7Bcardsoncardsoncards%7D' +
      '&sort=-price' +
      '&limit=20';

    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_AU',
        'X-EBAY-C-ENDUSERCTX': `affiliateCampaignId=5339146789`
      }
    });

    const searchData = await searchResponse.json();

    if (!searchData.itemSummaries || searchData.itemSummaries.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ listings: [], count: 0 })
      };
    }

    // Step 3: Map to clean listing objects
    const listings = searchData.itemSummaries.map(item => ({
      id: item.itemId,
      title: item.title,
      price: parseFloat(item.price.value),
      currency: item.price.currency,
      image: item.image ? item.image.imageUrl : null,
      url: item.itemAffiliateWebUrl || item.itemWebUrl,
      condition: item.condition || 'Not specified'
    }));

    // Sort by price descending (API sort not always reliable)
    listings.sort((a, b) => b.price - a.price);

    const result = { listings, count: listings.length };

    // Update cache
    cache = { data: result, timestamp: now };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('eBay API error:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch eBay listings', fallback: true, detail: error.message })
    };
  }
};