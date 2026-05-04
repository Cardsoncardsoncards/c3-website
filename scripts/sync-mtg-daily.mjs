// scripts/sync-mtg-daily.mjs
// Runs daily via GitHub Actions
// Streams Scryfall bulk data, upserts to mtg_cards, mtg_sets, mtg_price_snapshots
// Schema-matched to live Supabase as of 4 May 2026

import { createClient } from '@supabase/supabase-js';
import { createWriteStream, existsSync, unlinkSync, createReadStream } from 'fs';
import { pipeline as streamPipeline } from 'stream/promises';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray.js';

// --- Config ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const CARD_BATCH_SIZE = 250;
const SNAPSHOT_BATCH_SIZE = 500;
const SET_BATCH_SIZE = 100;
const MIN_SNAPSHOT_USD = 0.50;
const TEMP_FILE = 'scryfall-bulk.json';

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('FATAL: SUPABASE_URL and SUPABASE_SECRET_KEY env vars are required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

// --- Helpers ---

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function getExchangeRate() {
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await res.json();
    return data.rates?.AUD || 1.55;
  } catch {
    console.warn('Exchange rate fetch failed, using fallback 1.55');
    return 1.55;
  }
}

async function downloadBulkFile() {
  console.log('Fetching Scryfall bulk data index...');
  const bulkRes = await fetch('https://api.scryfall.com/bulk-data', {
    headers: { 'User-Agent': 'CardsonCardsonCards/1.0 (cardsoncardsoncards.com.au)' }
  });
  const bulkData = await bulkRes.json();
  const defaultCards = bulkData.data?.find(d => d.type === 'default_cards');
  if (!defaultCards?.download_uri) throw new Error('Could not find default_cards bulk URL');

  console.log('Downloading:', defaultCards.download_uri);
  const fileRes = await fetch(defaultCards.download_uri, {
    headers: { 'User-Agent': 'CardsonCardsonCards/1.0 (cardsoncardsoncards.com.au)' }
  });
  if (!fileRes.ok) throw new Error('Bulk download failed: ' + fileRes.status);

  await streamPipeline(fileRes.body, createWriteStream(TEMP_FILE));
  console.log('Bulk file saved.');
}

function buildCardRow(card, audRate) {
  const priceUsd = parseFloat(card.prices?.usd || 0) || null;
  const priceUsdFoil = parseFloat(card.prices?.usd_foil || 0) || null;
  const priceEur = parseFloat(card.prices?.eur || 0) || null;
  const priceTix = parseFloat(card.prices?.tix || 0) || null;
  const priceAud = priceUsd ? Math.round(priceUsd * audRate * 100) / 100 : 0;

  // Image URIs - handle double-faced cards
  let imageUri = null, imageUriSmall = null, imageUriArtCrop = null, imageUriBorderCrop = null;
  if (card.image_uris) {
    imageUri = card.image_uris.normal || null;
    imageUriSmall = card.image_uris.small || null;
    imageUriArtCrop = card.image_uris.art_crop || null;
    imageUriBorderCrop = card.image_uris.border_crop || null;
  } else if (card.card_faces?.[0]?.image_uris) {
    imageUri = card.card_faces[0].image_uris.normal || null;
    imageUriSmall = card.card_faces[0].image_uris.small || null;
    imageUriArtCrop = card.card_faces[0].image_uris.art_crop || null;
    imageUriBorderCrop = card.card_faces[0].image_uris.border_crop || null;
  }

  // Foil/nonfoil flags from finishes array
  const finishes = card.finishes || [];
  const hasFoil = finishes.includes('foil') || finishes.includes('etched');
  const hasNonfoil = finishes.includes('nonfoil');

  return {
    scryfall_id: card.id,
    oracle_id: card.oracle_id || null,
    name: card.name,
    slug: slugify(card.name),
    set_code: card.set,
    set_name: card.set_name,
    collector_number: card.collector_number,
    rarity: card.rarity,
    type_line: card.type_line || null,
    mana_cost: card.mana_cost || null,
    cmc: card.cmc || 0,
    colors: card.colors || [],
    color_identity: card.color_identity || [],
    oracle_text: card.oracle_text || card.card_faces?.[0]?.oracle_text || null,
    flavor_text: card.flavor_text || null,
    power: card.power || null,
    toughness: card.toughness || null,
    loyalty: card.loyalty || null,
    keywords: card.keywords || [],
    artist: card.artist || null,
    reserved: card.reserved || false,
    reprint: card.reprint || false,
    variation: card.variation || false,
    edhrec_rank: card.edhrec_rank || null,
    penny_rank: card.penny_rank || null,
    card_faces: card.card_faces || null,
    all_parts: card.all_parts || null,
    image_uri: imageUri,
    image_uri_normal: imageUri,
    image_uri_small: imageUriSmall,
    image_uri_art_crop: imageUriArtCrop,
    image_uri_border_crop: imageUriBorderCrop,
    scryfall_uri: card.scryfall_uri || null,
    legalities: card.legalities || {},
    price_usd: priceUsd,
    price_usd_foil: priceUsdFoil,
    price_eur: priceEur,
    price_tix: priceTix,
    price_aud: priceAud,
    set_release_date: card.released_at || null,
    released_at: card.released_at || null,
    digital: card.digital || false,
    promo: card.promo || false,
    frame: card.frame || null,
    border_color: card.border_color || null,
    full_art: card.full_art || false,
    textless: card.textless || false,
    oversized: card.oversized || false,
    story_spotlight: card.story_spotlight || false,
    tcgplayer_id: card.tcgplayer_id || null,
    cardmarket_id: card.cardmarket_id || null,
    mtgo_id: card.mtgo_id || null,
    arena_id: card.arena_id || null,
    finishes: finishes,
    games: card.games || [],
    produced_mana: card.produced_mana || [],
    card_back_id: card.card_back_id || null,
    illustration_id: card.illustration_id || null,
    layout: card.layout || null,
    hand_modifier: card.hand_modifier || null,
    life_modifier: card.life_modifier || null,
    foil: hasFoil,
    nonfoil: hasNonfoil,
    updated_at: new Date().toISOString()
  };
}

function buildSnapshotRow(card, audRate, today) {
  const priceUsd = parseFloat(card.prices?.usd || 0) || null;
  const priceUsdFoil = parseFloat(card.prices?.usd_foil || 0) || null;
  const priceUsdEtched = parseFloat(card.prices?.usd_etched || 0) || null;

  if (
    (!priceUsd || priceUsd < MIN_SNAPSHOT_USD) &&
    (!priceUsdFoil || priceUsdFoil < MIN_SNAPSHOT_USD) &&
    (!priceUsdEtched || priceUsdEtched < MIN_SNAPSHOT_USD)
  ) {
    return null;
  }

  return {
    scryfall_id: card.id,
    price_usd: priceUsd,
    price_usd_foil: priceUsdFoil,
    price_usd_etched: priceUsdEtched,
    price_aud: priceUsd ? Math.round(priceUsd * audRate * 100) / 100 : null,
    price_aud_foil: priceUsdFoil ? Math.round(priceUsdFoil * audRate * 100) / 100 : null,
    price_aud_etched: priceUsdEtched ? Math.round(priceUsdEtched * audRate * 100) / 100 : null,
    aud_usd_rate: audRate,
    snapshot_date: today
  };
}

function buildSetRow(card) {
  return {
    set_code: card.set,
    set_name: card.set_name,
    name: card.set_name,
    set_type: card.set_type || null,
    release_date: card.released_at || null,
    digital: false,
    set_slug: slugify(card.set_name),
    updated_at: new Date().toISOString()
  };
}

async function upsertBatch(table, rows, conflictKey) {
  if (!rows.length) return 0;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: conflictKey });
  if (error) {
    console.error(`Upsert error on ${table}:`, error.message);
    return 0;
  }
  return rows.length;
}

// --- Main ---

async function main() {
  const startTime = Date.now();
  console.log('=== MTG Daily Sync ===');

  const audRate = await getExchangeRate();
  console.log('AUD rate:', audRate);

  if (!existsSync(TEMP_FILE)) {
    await downloadBulkFile();
  } else {
    console.log('Reusing existing bulk file:', TEMP_FILE);
  }

  const today = new Date().toISOString().split('T')[0];

  let cardBatch = [];
  let snapshotBatch = [];
  const setsMap = new Map();

  let totalProcessed = 0;
  let totalCardsUpserted = 0;
  let totalSnapshotsUpserted = 0;
  let totalSkipped = 0;

  console.log('Streaming cards...');

  await new Promise((resolve, reject) => {
    const cardStream = chain([
      createReadStream(TEMP_FILE),
      parser(),
      streamArray()
    ]);

    cardStream.on('data', async ({ value: card }) => {
      totalProcessed++;

      // Filter rules
      if (card.digital) { totalSkipped++; return; }
      if (card.lang && card.lang !== 'en') { totalSkipped++; return; }
      if (['token', 'emblem', 'art_series', 'reversible_card'].includes(card.layout)) {
        totalSkipped++;
        return;
      }
      if (!card.id || !card.name || !card.set) { totalSkipped++; return; }

      // Capture set
      if (!setsMap.has(card.set)) {
        setsMap.set(card.set, buildSetRow(card));
      }

      // Card row
      cardBatch.push(buildCardRow(card, audRate));

      // Snapshot row (only if priced)
      const snap = buildSnapshotRow(card, audRate, today);
      if (snap) snapshotBatch.push(snap);

      // Flush card batch
      if (cardBatch.length >= CARD_BATCH_SIZE) {
        cardStream.pause();
        const toFlush = cardBatch;
        cardBatch = [];
        const inserted = await upsertBatch('mtg_cards', toFlush, 'scryfall_id');
        totalCardsUpserted += inserted;
        process.stdout.write(`\rProcessed: ${totalProcessed} | Cards upserted: ${totalCardsUpserted} | Snapshots queued: ${snapshotBatch.length}`);
        cardStream.resume();
      }
    });

    cardStream.on('end', resolve);
    cardStream.on('error', reject);
  });

  // Flush remaining cards
  if (cardBatch.length) {
    totalCardsUpserted += await upsertBatch('mtg_cards', cardBatch, 'scryfall_id');
    cardBatch = [];
  }

  console.log('\nFlushing snapshots...');

  // Flush snapshots in batches
  for (let i = 0; i < snapshotBatch.length; i += SNAPSHOT_BATCH_SIZE) {
    const slice = snapshotBatch.slice(i, i + SNAPSHOT_BATCH_SIZE);
    totalSnapshotsUpserted += await upsertBatch('mtg_price_snapshots', slice, 'scryfall_id,snapshot_date');
  }

  console.log('Flushing sets...');

  const setRows = Array.from(setsMap.values());
  for (let i = 0; i < setRows.length; i += SET_BATCH_SIZE) {
    await upsertBatch('mtg_sets', setRows.slice(i, i + SET_BATCH_SIZE), 'set_code');
  }

  // Cleanup
  try { unlinkSync(TEMP_FILE); } catch {}

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n=== Sync complete ===');
  console.log(`Processed: ${totalProcessed}`);
  console.log(`Skipped:   ${totalSkipped}`);
  console.log(`Cards:     ${totalCardsUpserted}`);
  console.log(`Snapshots: ${totalSnapshotsUpserted}`);
  console.log(`Sets:      ${setRows.length}`);
  console.log(`Elapsed:   ${elapsed}s`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
