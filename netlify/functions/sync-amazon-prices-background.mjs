// netlify/functions/sync-amazon-prices-background.mjs
// Nightly sync: calls the Amazon Creators API (OAuth2) for all active ASINs
// Updates current_price_aud and image_url in amazon_products
// Inserts a price history row into amazon_price_history on every run
// Scheduled: 2:00 UTC daily
// Background function: 15 min timeout
// Auth: OAuth2 client_credentials (AMAZON_PA_CREDENTIAL_ID + AMAZON_PA_SECRET)
// Note: PA-API 5.0 (AWS Sig V4) was retired 15 May 2026; this uses the Creators API.

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const PA_CREDENTIAL_ID     = Netlify.env.get('AMAZON_PA_CREDENTIAL_ID');
const PA_SECRET            = Netlify.env.get('AMAZON_PA_SECRET');
const PARTNER_TAG          = Netlify.env.get('AMAZON_PA_PARTNER_TAG') || 'blasdigital-22';
const MARKETPLACE          = Netlify.env.get('AMAZON_PA_MARKETPLACE') || 'www.amazon.com.au';
const MAX_RUNTIME_MS       = 13 * 60 * 1000;
const BATCH_SIZE           = 10;

// Module-level OAuth token cache (tokens expire in 3600s)
let _tokenCache = null;
let _tokenExpiresAt = 0;

async function getAmazonToken() {
  if (_tokenCache && Date.now() < _tokenExpiresAt - 60000) return _tokenCache;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: PA_CREDENTIAL_ID,
        client_secret: PA_SECRET,
        scope: 'creatorsapi::default'
      })
    });
    clearTimeout(timer);
    if (!res.ok) {
      const err = await res.text();
      console.error('[amazon-sync] token error:', res.status, err);
      return null;
    }
    const data = await res.json();
    _tokenCache = data.access_token;
    _tokenExpiresAt = Date.now() + (data.expires_in * 1000);
    return _tokenCache;
  } catch (e) {
    clearTimeout(timer);
    console.error('[amazon-sync] token fetch failed:', e.message);
    return null;
  }
}

async function fetchAmazonProducts(asins, token) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch('https://creatorsapi.amazon/catalog/v1/getItems', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'x-marketplace': MARKETPLACE
      },
      body: JSON.stringify({
        itemIds: asins,
        itemIdType: 'ASIN',
        resources: [
          'images.primary.large',
          'itemInfo.title',
          'offersV2.listings.price',
          'itemInfo.features'
        ],
        partnerTag: PARTNER_TAG,
        partnerType: 'Associates',
        marketplace: MARKETPLACE
      })
    });
    clearTimeout(timer);
    if (!res.ok) {
      const err = await res.text();
      console.error('[amazon-sync] getItems error:', res.status, err);
      return [];
    }
    const data = await res.json();
    return data.itemsResult?.items || [];
  } catch (e) {
    clearTimeout(timer);
    console.error('[amazon-sync] getItems failed:', e.message);
    return [];
  }
}

async function supabaseGet(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        'apikey':        SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Supabase GET ${res.status}`);
    return res.json();
  } catch (e) { clearTimeout(timer); throw e; }
}

async function supabaseUpsert(rows) {
  if (!rows.length) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/amazon_products`, {
      method:  'POST',
      headers: {
        'apikey':        SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'resolution=merge-duplicates,return=minimal'
      },
      body:   JSON.stringify(rows),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) { const err = await res.text(); throw new Error(`Upsert ${res.status}: ${err}`); }
  } catch (e) { clearTimeout(timer); throw e; }
}

async function insertPriceHistory(rows) {
  if (!rows.length) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/amazon_price_history`, {
      method:  'POST',
      headers: {
        'apikey':        SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal'
      },
      body:   JSON.stringify(rows),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) { const err = await res.text(); throw new Error(`History insert ${res.status}: ${err}`); }
  } catch (e) { clearTimeout(timer); }
}

export default async (req) => {
  if (!PA_CREDENTIAL_ID || !PA_SECRET) {
    return new Response(JSON.stringify({ error: 'Missing Amazon Creators API credentials' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const startTime = Date.now();
  const log = [];
  let updated = 0, failed = 0, notFound = 0, priceHistoryRows = 0;

  // Obtain the OAuth token up front; abort the whole run if auth fails.
  const token = await getAmazonToken();
  if (!token) {
    console.error('[amazon-sync] could not obtain access token -- aborting');
    return new Response(JSON.stringify({ error: 'token_failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  let products;
  try {
    products = await supabaseGet('amazon_products?is_active=eq.true&select=asin,game,product_name&order=priority.asc');
  } catch (e) {
    return new Response(JSON.stringify({ error: `Failed to fetch products: ${e.message}` }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  log.push(`Loaded ${products.length} active ASINs`);

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      log.push(`Time limit reached at batch ${i}`);
      break;
    }
    const batch = products.slice(i, i + BATCH_SIZE);
    const asins = batch.map(p => p.asin);
    await new Promise(r => setTimeout(r, 200));

    const items = await fetchAmazonProducts(asins, token);

    const itemMap = {};
    for (const item of items) {
      const key = item.asin || item.ASIN;
      if (key) itemMap[key] = item;
    }

    const updates = [];
    const history = [];
    const now = new Date().toISOString();

    for (const product of batch) {
      const item = itemMap[product.asin];
      if (!item) { notFound++; continue; }
      const imageUrl = item.images?.primary?.large?.url || null;
      const priceRaw = item.offersV2?.listings?.[0]?.price?.amount || null;
      const price = priceRaw ? parseFloat(priceRaw) : null;
      updates.push({ asin: product.asin, image_url: imageUrl, current_price_aud: price, last_synced: now });
      if (price) history.push({ asin: product.asin, price_aud: price, source: 'amazon', recorded_at: now });
    }

    if (updates.length) {
      try {
        await supabaseUpsert(updates);
        updated += updates.length;
      } catch (e) {
        log.push(`Upsert error: ${e.message}`);
        failed += updates.length;
      }
    }
    await insertPriceHistory(history);
    priceHistoryRows += history.length;
    log.push(`Batch ${i}: ${updates.length} updated, ${history.length} prices recorded`);
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log('[amazon-sync] complete:', { updated, priceHistoryRows, elapsed });
  return new Response(JSON.stringify({ updated, failed, notFound, priceHistoryRows, elapsed, log }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
};

export const config = { schedule: '0 2 * * *' };
