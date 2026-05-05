// scripts/sync-yugioh-daily.mjs
// GitHub Actions daily sync — Yu-Gi-Oh! cards via YGOPRODeck API (free, no auth)
// Runs at 4am UTC daily
// YGOPRODeck API: https://db.ygoprodeck.com/api/v7/
// Rate limit: 20 req/sec — bulk download used instead of per-card calls

import crypto from 'crypto';

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const YGOPRO_BASE   = 'https://db.ygoprodeck.com/api/v7';
const BATCH_SIZE    = 200;

function slugify(name, id) {
  const base = name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base}-${id}`;
}

function hashRow(obj) {
  return crypto.createHash('md5').update(JSON.stringify(obj)).digest('hex');
}

async function supabaseUpsert(table, rows) {
  if (!rows.length) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(rows)
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase upsert ${table} failed ${res.status}: ${body.slice(0,200)}`);
  }
}

async function syncSets() {
  console.log('Fetching Yu-Gi-Oh sets...');
  const res = await fetch(`${YGOPRO_BASE}/cardsets.php`);
  if (!res.ok) throw new Error(`YGOPRODeck sets → ${res.status}`);
  const sets = await res.json();

  const rows = sets.map(s => ({
    set_name: s.set_name,
    set_code: s.set_code || null,
    num_of_cards: s.num_of_cards || null,
    tcg_date: s.tcg_date || null,
    updated_at: new Date().toISOString()
  }));

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await supabaseUpsert('yugioh_sets', rows.slice(i, i + BATCH_SIZE));
  }
  console.log(`Synced ${rows.length} Yu-Gi-Oh sets`);
}

async function syncCards() {
  // YGOPRODeck supports bulk download of all cards in one request
  // misc=yes adds views and more data; num=9999 gets max per page
  console.log('Fetching all Yu-Gi-Oh cards (bulk)...');
  const res = await fetch(`${YGOPRO_BASE}/cardinfo.php?misc=yes&num=9999&offset=0`);
  if (!res.ok) throw new Error(`YGOPRODeck cardinfo → ${res.status}`);
  const data = await res.json();
  const cards = data.data || [];
  console.log(`Fetched ${cards.length} cards from YGOPRODeck`);

  // Fetch existing hashes
  console.log('Fetching existing YuGiOh card hashes...');
  const existingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/yugioh_cards?select=id,data_hash&limit=100000`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  const existing = await existingRes.json();
  const hashMap = new Map((Array.isArray(existing) ? existing : []).map(r => [String(r.id), r.data_hash]));
  console.log(`Found ${hashMap.size} existing Yu-Gi-Oh cards`);

  let totalInserted = 0;
  let totalSkipped = 0;
  const batch = [];

  for (const card of cards) {
    // Primary image — YGOPRODeck stores card_images as array
    const img = card.card_images?.[0];
    const imageUri = img?.image_url || null;
    const imageUriSmall = img?.image_url_small || null;

    // Price — card_prices array from YGOPRODeck
    const priceRaw = card.card_prices?.[0]?.tcgplayer_price
      || card.card_prices?.[0]?.ebay_price
      || null;
    const priceUsd = priceRaw ? parseFloat(priceRaw) : null;

    const rowData = {
      name: card.name,
      type: card.type || null,
      race: card.race || null,
      attribute: card.attribute || null,
      atk: card.atk ?? null,
      def: card.def ?? null,
      level: card.level || card.rank || card.linkval || null,
      description: card.desc || null,
      image_uri: imageUri,
      image_uri_small: imageUriSmall,
      archetype: card.archetype || null,
      price_usd: priceUsd,
    };

    const hash = hashRow(rowData);
    const cardId = String(card.id);

    if (hashMap.get(cardId) === hash) {
      totalSkipped++;
      continue;
    }

    batch.push({
      id: card.id,
      slug: slugify(card.name, card.id),
      ...rowData,
      updated_at: new Date().toISOString(),
      data_hash: hash
    });
  }

  console.log(`Processing ${batch.length} changed cards (${totalSkipped} unchanged)...`);

  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    await supabaseUpsert('yugioh_cards', batch.slice(i, i + BATCH_SIZE));
    totalInserted += Math.min(BATCH_SIZE, batch.length - i);
    if (i % 2000 === 0) console.log(`  Progress: ${i}/${batch.length}`);
  }

  console.log(`Yu-Gi-Oh sync complete. Upserted: ${totalInserted}, Skipped: ${totalSkipped}`);
}

async function main() {
  console.log('=== Yu-Gi-Oh Daily Sync Start ===', new Date().toISOString());
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');

  await syncSets();
  await syncCards();

  console.log('=== Yu-Gi-Oh Daily Sync Complete ===', new Date().toISOString());
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
