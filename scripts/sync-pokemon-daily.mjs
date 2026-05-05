// scripts/sync-pokemon-daily.mjs
// GitHub Actions daily sync — Pokemon cards via TCGdex (free, no auth)
// Fetches ALL 14 languages using bulk set endpoint — one call per set per language
// First run: ~130,000+ cards across all languages and variants
// Incremental runs: only changed cards upserted via data_hash diffing

import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TCGDEX_BASE  = 'https://api.tcgdex.net/v2';
const BATCH_SIZE   = 200;
const DELAY_MS     = 150;

// All 14 TCGdex languages — English first (most complete, establishes primary slugs)
const LANGUAGES = [
  'en', 'fr', 'es', 'de', 'it', 'pt',
  'ja', 'zh-hans', 'zh-hant', 'ko',
  'id', 'th', 'pl', 'ru'
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function slugify(name, cardId) {
  const base = (name || 'card')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const shortId = cardId.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 40);
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
    throw new Error(`Supabase upsert ${table} failed ${res.status}: ${body.slice(0, 200)}`);
  }
}

async function tcgdexGet(path, lang = 'en') {
  const url = `${TCGDEX_BASE}/${lang}${path}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TCGdex ${url} → ${res.status}`);
  return res.json();
}

async function syncSets() {
  console.log('Fetching Pokemon sets (English)...');
  const sets = await tcgdexGet('/sets', 'en');
  if (!Array.isArray(sets)) throw new Error('Expected array from /sets');

  const rows = sets.map(s => ({
    id: s.id,
    name: s.name,
    series: s.serie?.name || null,
    card_count: s.cardCount?.total || null,
    logo_uri: s.logo ? `https://assets.tcgdex.net/en/${s.id}/logo` : null,
    symbol_uri: s.symbol ? `https://assets.tcgdex.net/en/${s.id}/symbol` : null,
    release_date: s.releaseDate || null,
    updated_at: new Date().toISOString()
  }));

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await supabaseUpsert('pokemon_sets', rows.slice(i, i + BATCH_SIZE));
  }
  console.log(`Synced ${rows.length} sets`);
  return sets;
}

async function syncAllLanguages(sets) {
  let grandTotal = 0;
  let grandSkipped = 0;

  // Load all existing hashes once — avoids repeated Supabase calls
  console.log('Loading existing card hashes...');
  let allExisting = [];
  let offset = 0;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/pokemon_cards?select=id,data_hash&limit=1000&offset=${offset}`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    allExisting.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }
  const hashMap = new Map(allExisting.map(r => [r.id, r.data_hash]));
  console.log(`Loaded ${hashMap.size} existing card hashes`);

  for (const lang of LANGUAGES) {
    console.log(`\n--- Language: ${lang} ---`);
    let langTotal = 0;
    let langSkipped = 0;
    const langBatch = [];

    for (const setMeta of sets) {
      try {
        await sleep(DELAY_MS);

        // Bulk endpoint — returns full set with all cards
        const set = await tcgdexGet(`/sets/${setMeta.id}`, lang);
        if (!set || !set.cards || !set.cards.length) continue;

        for (const card of set.cards) {
          const cardId = `${lang}-${setMeta.id}-${card.localId}`;
          const imageUri = card.image ? `${card.image}/high.webp` : null;
          const priceUsd = card.variants?.normal?.market
            || card.variants?.holofoil?.market
            || card.variants?.reverseHolofoil?.market
            || null;

          const rowData = {
            name: card.name || '',
            set_id: setMeta.id,
            set_name: set.name,
            series: set.serie?.name || null,
            number: card.localId?.toString() || null,
            rarity: card.rarity || null,
            category: card.category || null,
            types: card.types || [],
            hp: card.hp || null,
            image_uri: imageUri,
            illustrator: card.illustrator || null,
            stage: card.stage || null,
            description: card.description || null,
            price_usd: priceUsd ? parseFloat(priceUsd) : null,
          };

          const hash = hashRow({ ...rowData, lang });
          if (hashMap.get(cardId) === hash) {
            langSkipped++;
            continue;
          }

          langBatch.push({
            id: cardId,
            slug: slugify(card.name || 'card', cardId),
            ...rowData,
            updated_at: new Date().toISOString(),
            data_hash: hash
          });

          // Flush in batches to avoid memory buildup
          if (langBatch.length >= BATCH_SIZE) {
            await supabaseUpsert('pokemon_cards', langBatch.splice(0, BATCH_SIZE));
            langTotal += BATCH_SIZE;
          }
        }
      } catch (err) {
        console.error(`  [${lang}/${setMeta.id}] ${err.message}`);
      }
    }

    // Flush remaining
    if (langBatch.length) {
      await supabaseUpsert('pokemon_cards', langBatch);
      langTotal += langBatch.length;
    }

    console.log(`  ${lang}: +${langTotal} upserted, ${langSkipped} unchanged`);
    grandTotal += langTotal;
    grandSkipped += langSkipped;
  }

  console.log(`\nPokemon sync complete. Upserted: ${grandTotal}, Unchanged: ${grandSkipped}`);
}

async function main() {
  console.log('=== Pokemon Daily Sync Start ===', new Date().toISOString());
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  const sets = await syncSets();
  await syncAllLanguages(sets);
  console.log('=== Pokemon Daily Sync Complete ===', new Date().toISOString());
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
