// sync-once.cjs - v7 - CommonJS, uses stream-json properly
// Usage: node sync-once.cjs

const { createClient } = require('@supabase/supabase-js');
const { createWriteStream, existsSync, unlinkSync, createReadStream } = require('fs');
const { pipeline } = require('stream/promises');
const { chain } = require('stream-chain');
const { parser } = require('stream-json');
const { streamArray } = require('stream-json/streamers/StreamArray');

const SUPABASE_URL = 'https://owaroeqchreuffbyakqx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93YXJvZXFjaHJldWZmYnlha3F4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMxMzg1MCwiZXhwIjoyMDkyODg5ODUwfQ.Yk5lYa6A6vRn0DhKVhrT6r7fcM3xRcy6d8TAjaItKn4';
const BATCH_SIZE = 250;
const TEMP_FILE = 'scryfall-bulk.json';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('Starting MTG card sync v7...\n');

  let audRate = 1.55;
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await res.json();
    audRate = data.rates?.AUD ?? 1.55;
  } catch {
    console.log('Rate fetch failed, using 1.55');
  }
  console.log('AUD rate:', audRate);

  if (!existsSync(TEMP_FILE)) {
    const bulkRes = await fetch('https://api.scryfall.com/bulk-data');
    const bulkData = await bulkRes.json();
    const defaultCards = bulkData.data?.find(d => d.type === 'default_cards');
    const bulkUrl = defaultCards?.download_uri;
    if (!bulkUrl) throw new Error('No bulk URL');
    console.log('Downloading:', bulkUrl);
    const fileRes = await fetch(bulkUrl);
    if (!fileRes.ok) throw new Error('Download failed: ' + fileRes.status);
    await pipeline(fileRes.body, createWriteStream(TEMP_FILE));
    console.log('Download complete.');
  } else {
    console.log('Using existing file:', TEMP_FILE);
  }

  console.log('Parsing and inserting...\n');

  let batch = [];
  let totalInserted = 0;
  let totalProcessed = 0;
  const setsMap = new Map();

  const upsert = async (rows) => {
    if (!rows.length) return;
    const { error } = await supabase.from('mtg_cards').upsert(rows, { onConflict: 'scryfall_id' });
    if (error) console.error('\nCard upsert error:', error.message);
    else totalInserted += rows.length;
    process.stdout.write(`\rProcessed: ${totalProcessed} | Inserted: ${totalInserted}...`);
  };

  await new Promise((resolve, reject) => {
    const pipeline = chain([
      createReadStream(TEMP_FILE),
      parser(),
      streamArray()
    ]);

    pipeline.on('data', async ({ value: c }) => {
      totalProcessed++;
      if (c.digital || c.lang !== 'en') return;
      if (['token','emblem','art_series','reversible_card'].includes(c.layout)) return;

      if (c.set && c.set_name && !setsMap.has(c.set)) {
        setsMap.set(c.set, {
          set_code: c.set,
          set_name: c.set_name,
          name: c.set_name,
          set_type: c.set_type || '',
          release_date: c.released_at || null,
          card_count: c.set_size || 0,
          digital: false,
          icon_svg_uri: c.set_icon_svg_uri || null
        });
      }

      const priceUsd = parseFloat(c.prices?.usd || c.prices?.usd_foil || '0') || 0;
      const priceAud = priceUsd > 0 ? Math.round(priceUsd * audRate * 100) / 100 : 0;
      const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

      batch.push({
        scryfall_id: c.id,
        name: c.name,
        slug,
        set_code: c.set,
        set_name: c.set_name,
        collector_number: c.collector_number,
        rarity: c.rarity,
        type_line: c.type_line || '',
        mana_cost: c.mana_cost || '',
        cmc: c.cmc || 0,
        color_identity: c.color_identity || [],
        image_uri_small: c.image_uris?.small || c.card_faces?.[0]?.image_uris?.small || null,
        image_uri_normal: c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal || null,
        price_usd: priceUsd,
        price_aud: priceAud,
        foil: c.foil || false,
        nonfoil: c.nonfoil !== undefined ? c.nonfoil : true,
        legalities: c.legalities || {},
        oracle_text: c.oracle_text || c.card_faces?.[0]?.oracle_text || '',
        released_at: c.released_at || null,
        updated_at: new Date().toISOString()
      });

      if (batch.length >= BATCH_SIZE) {
        pipeline.pause();
        const toFlush = [...batch];
        batch = [];
        await upsert(toFlush);
        pipeline.resume();
      }
    });

    pipeline.on('end', resolve);
    pipeline.on('error', reject);
  });

  await upsert(batch);
  batch = [];

  console.log('\n\nUpserting sets...');
  const setsArray = Array.from(setsMap.values());
  for (let i = 0; i < setsArray.length; i += 100) {
    const { error } = await supabase.from('mtg_sets').upsert(setsArray.slice(i, i+100), { onConflict: 'set_code' });
    if (error) console.error('Sets error:', error.message);
  }

  try { unlinkSync(TEMP_FILE); } catch {}

  console.log(`Sets: ${setsArray.length}`);
  console.log(`\nDone. Processed: ${totalProcessed} | Inserted: ${totalInserted}`);
  console.log('Visit cardsoncardsoncards.com.au/cards/mtg');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
