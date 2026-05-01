// Netlify Function: ebay-prices.js
// Returns top 20 most expensive individual card listings from the C3 eBay store
// Strategy: paginate seller listings, filter client-side, sort, slice top 20

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
    const SELLER = 'cardsoncardsoncards';

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

    // Step 2: Try multiple search strategies, log everything for diagnosis
    const allListings = [];
    const maxPages = 3;
    const limitPerPage = 200;

    for (let page = 0; page < maxPages; page++) {
      const offset = page * limitPerPage;
      const filter = 'sellers%3A%7B' + SELLER + '%7D%2CbuyingOptions%3A%7BFIXED_PRICE%7D';
      const searchUrl = 'https://api.ebay.com/buy/browse/v1/item_summary/search' +
        '?q=a' +
        '&filter=' + filter +
        '&sort=-price' +
        '&limit=' + limitPerPage +
        '&offset=' + offset;

      console.log('Page', page, 'URL:', searchUrl);

      const searchResponse = await fetch(searchUrl, {
        headers: {
          'Authorization': 'Bearer ' + tokenData.access_token,
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_AU',
          'X-EBAY-C-ENDUSERCTX': 'affiliateCampaignId=' + campId
        }
      });

      const searchData = await searchResponse.json();
      console.log('Page', page, 'http:', searchResponse.status, '| total:', searchData.total || 0, '| returned:', (searchData.itemSummaries || []).length);

      if (searchData.errors) {
        console.log('eBay errors:', JSON.stringify(searchData.errors).substring(0, 500));
      }

      if (!searchData.itemSummaries || searchData.itemSummaries.length === 0) {
        if (page === 0) {
          console.log('First page empty. Full response:', JSON.stringify(searchData).substring(0, 1000));
        }
        break;
      }

      if (page === 0 && searchData.itemSummaries.length > 0) {
        const sample = searchData.itemSummaries[0];
        console.log('First item seller:', sample.seller ? sample.seller.username : 'NO_SELLER_FIELD');
        console.log('First item title:', (sample.title || '').substring(0, 80));
      }

      for (const item of searchData.itemSummaries) {
        allListings.push(item);
      }

      if (searchData.itemSummaries.length < limitPerPage) {
        break;
      }
    }

    console.log('Total raw listings collected:', allListings.length);

    // Client-side seller filter as safety net
    const sellerListings = allListings.filter(function(item) {
      if (!item.seller || !item.seller.username) return false;
      return item.seller.username.toLowerCase() === SELLER.toLowerCase();
    });

    console.log('After seller filter:', sellerListings.length);

    // Sort by price desc, take top 20
    sellerListings.sort(function(a, b) {
      const priceA = a.price ? parseFloat(a.price.value) : 0;
      const priceB = b.price ? parseFloat(b.price.value) : 0;
      return priceB - priceA;
    });

    const top20 = sellerListings.slice(0, 20);

    const listings = top20.map(function(item) {
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
