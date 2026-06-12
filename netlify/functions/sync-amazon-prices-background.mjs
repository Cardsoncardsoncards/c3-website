// netlify/functions/sync-amazon-prices-background.mjs
// Nightly sync: calls Amazon PA API (Creators API) for all active ASINs
// Updates current_price_aud and image_url in amazon_products
// Inserts a price history row into amazon_price_history on every run
// Scheduled: 2:00 UTC daily
// Background function: 15 min timeout
// Auth: AWS Signature Version 4 using AMAZON_PA_CREDENTIAL_ID + AMAZON_PA_SECRET

import { createHmac, createHash } from 'crypto';

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const PA_CREDENTIAL_ID     = Netlify.env.get('AMAZON_PA_CREDENTIAL_ID');
const PA_SECRET            = Netlify.env.get('AMAZON_PA_SECRET');
const PARTNER_TAG          = Netlify.env.get('AMAZON_PA_PARTNER_TAG') || 'blasdigital-22';
const MARKETPLACE          = Netlify.env.get('AMAZON_PA_MARKETPLACE') || 'www.amazon.com.au';
const REGION               = 'us-east-1';
const SERVICE              = 'ProductAdvertisingAPI';
const MAX_RUNTIME_MS       = 13 * 60 * 1000;
const BATCH_SIZE           = 10;

function getAmzDate() {
  return new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
}

function sha256Hex(str) {
  return createHash('sha256').update(str, 'utf8').digest('hex');
}

function hmacSha256(key, str) {
  return createHmac('sha256', key).update(str, 'utf8').digest();
}

function getSigningKey(secret, dateStamp) {
  const kDate    = hmacSha256('AWS4' + secret, dateStamp);
  const kRegion  = hmacSha256(kDate, REGION);
  const kService = hmacSha256(kRegion, SERVICE);
  return hmacSha256(kService, 'aws4_request');
}

async function paApiRequest(asins) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const amzDate   = getAmzDate();
    const dateStamp = amzDate.slice(0, 8);
    const payload   = JSON.stringify({
      ItemIds:     asins,
      Resources:   ['Images.Primary.Large', 'ItemInfo.Title', 'Offers.Listings.Price'],
      PartnerTag:  PARTNER_TAG,
      PartnerType: 'Associates',
      Marketplace: MARKETPLACE
    });
    const payloadHash      = sha256Hex(payload);
    const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${MARKETPLACE}\nx-amz-date:${amzDate}\nx-amz-target:com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems\n`;
    const signedHeaders    = 'content-type;host;x-amz-date;x-amz-target';
    const canonicalRequest = `POST\n/paapi5/getitems\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const credentialScope  = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
    const stringToSign     = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;
    const signingKey       = getSigningKey(PA_SECRET, dateStamp);
    const signature        = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    const authHeader       = `AWS4-HMAC-SHA256 Credential=${PA_CREDENTIAL_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const res = await fetch(`https://${MARKETPLACE}/paapi5/getitems`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json; charset=utf-8',
        'Host':          MARKETPLACE,
        'X-Amz-Date':   amzDate,
        'X-Amz-Target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems',
        'Authorization': authHeader
      },
      body:   payload,
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      const err = await res.text();
      return { error: `PA API ${res.status}: ${err}`, items: [] };
    }
    const data = await res.json();
    return { items: data.ItemsResult?.Items || [], error: null };
  } catch (e) {
    clearTimeout(timer);
    return { error: e.message, items: [] };
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
    return new Response(JSON.stringify({ error: 'Missing Amazon PA API credentials' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const startTime = Date.now();
  const log = [];
  let updated = 0, failed = 0, notFound = 0;

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
    await new Promise(r => setTimeout(r, 1100));

    const { items, error } = await paApiRequest(asins);
    if (error) {
      log.push(`Batch ${i}: error: ${error}`);
      failed += batch.length;
      continue;
    }

    const itemMap = {};
    for (const item of items) itemMap[item.ASIN] = item;

    const updates = [];
    const history = [];
    const now = new Date().toISOString();

    for (const product of batch) {
      const item = itemMap[product.asin];
      if (!item) { notFound++; continue; }
      const image = item.Images?.Primary?.Large?.URL || null;
      const priceRaw = item.Offers?.Listings?.[0]?.Price?.Amount || null;
      const price = priceRaw ? parseFloat(priceRaw) : null;
      updates.push({ asin: product.asin, image_url: image, current_price_aud: price, last_synced: now });
      if (price) history.push({ asin: product.asin, price_aud: price, recorded_at: now });
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
    log.push(`Batch ${i}: ${updates.length} updated, ${history.length} prices recorded`);
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  return new Response(JSON.stringify({ updated, failed, notFound, elapsed, log }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
};

export const config = { schedule: '0 2 * * *' };
