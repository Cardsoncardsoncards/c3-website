// scripts/sync-lorcana-daily.mjs
// GitHub Actions daily sync — Lorcana cards via Lorcast API (free, no auth)
// Runs at 4am UTC daily alongside Pokemon sync
// Lorcast API: https://api.lorcast.com/

import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const LORCAST_BASE = 'https://api.lorcast.com';
const BATCH_SIZE   = 100;
const DELAY_MS     = 200;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function slugify(name, version, id) {
  const full = version ? `${name} ${version}` : name;
  const base = full
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const shortId = id.replace('crd_', '').slice(0, 8);
  return `${base}-${shortId}`;
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

async function lorcastGet(path) {
  const res = await fetch(`${LORCAST_BASE}${path}`);
  if (!res.ok) throw new Error(`Lorcast ${path} → ${res.status}`);
  return res.json();
}

async function syncSets() {
  console.log('Fetching Lorcana sets from Lorcast...');
  const data = await lorcastGet('/v0/sets');
  const sets = data.results || [];

  const rows = sets.map(s => ({
    id: s.id,
    name: s.name,
    code: s.code,
    released_at: s.released_at || null,
    updated_at: new Date().toISOString()
  }));

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await supabaseUpsert('lorcana_sets', rows.slice(i, i + BATCH_SIZE));
  }
  console.log(`Synced ${rows.length} Lorcana sets`);
  return sets;
}

async function syncCards(sets) {
  let totalInserted = 0;
  let totalSkipped = 0;

  // Fetch existing hashes
  console.log('Fetching existing Lorcana card hashes...');
  const existingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/lorcana_cards?select=id,data_hash&limit=100000`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  const existing = await existingRes.json();
  const hashMap = new Map((Array.isArray(existing) ? existing : []).map(r => [r.id, r.data_hash]));
  console.log(`Found ${hashMap.size} existing Lorcana cards`);

  for (const set of sets) {
    try {
      await sleep(DELAY_MS);
      console.log(`  Fetching set ${set.code}: ${set.name}`);
      const data = await lorcastGet(`/v0/sets/${set.code}/cards`);
      const cards = Array.isArray(data) ? data : (data.results || []);
      if (!cards.length) continue;

      const batch = [];

      for (const card of cards) {
        const imageUri = card.image_uris?.digital?.normal
          || card.image_uris?.digital?.large
          || card.image_uris?.digital?.small
          || null;

        const rowData = {
          name: card.name,
          version: card.version || null,
          set_id: set.id,
          set_name: set.name,
          set_code: set.code,
          collector_number: card.collector_number || null,
          rarity: card.rarity || null,
          ink: card.ink || null,
          type: Array.isArray(card.type) ? card.type : (card.type ? [card.type] : []),
          cost: card.cost || null,
          inkwell: card.inkwell || false,
          strength: card.strength || null,
          willpower: card.willpower || null,
          lore: card.lore || null,
          move_cost: card.move_cost || null,
          card_text: card.text || null,
          flavor_text: card.flavor_text || null,
          image_uri: imageUri,
          price_usd: null, // Lorcast doesn't include prices — eBay Browse API covers this
          tcgplayer_id: card.tcgplayer_id || null,
        };

        const hash = crypto.createHash('md5').update(JSON.stringify(rowData)).digest('hex');

        if (hashMap.get(card.id) === hash) {
          totalSkipped++;
          continue;
        }

        batch.push({
          id: card.id,
          slug: slugify(card.name, card.version, card.id),
          ...rowData,
          updated_at: new Date().toISOString(),
          data_hash: hash
        });
      }

      if (batch.length) {
        for (let i = 0; i < batch.length; i += BATCH_SIZE) {
          await supabaseUpsert('lorcana_cards', batch.slice(i, i + BATCH_SIZE));
        }
        totalInserted += batch.length;
      }

      console.log(`  ${set.name}: ${batch.length} upserted, ${cards.length - batch.length} skipped`);
    } catch (err) {
      console.error(`  Set ${set.code} error: ${err.message}`);
    }
  }

  console.log(`Lorcana sync complete. Upserted: ${totalInserted}, Skipped: ${totalSkipped}`);
}

async function main() {
  console.log('=== Lorcana Daily Sync Start ===', new Date().toISOString());
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');

  const sets = await syncSets();
  await syncCards(sets);

  console.log('=== Lorcana Daily Sync Complete ===', new Date().toISOString());
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
