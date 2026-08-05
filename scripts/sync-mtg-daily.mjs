// scripts/sync-mtg-daily.mjs
// Runs daily via GitHub Actions
// Smart sync: only upserts cards where the data has changed (via content hash).
// Always inserts daily price snapshots.
// Schema-matched to live Supabase as of 4 May 2026.
// Card Kingdom buylist prices added 13 May 2026.

import { createClient } from '@supabase/supabase-js';
import { createWriteStream, existsSync, unlinkSync, createReadStream, openSync, readSync, closeSync } from 'fs';
import { pipeline as streamPipeline } from 'stream/promises';
import { createHash } from 'crypto';

import { createGunzip } from 'zlib';

import streamChainPkg from 'stream-chain';
import streamJsonPkg from 'stream-json';
import streamArrayPkg from 'stream-json/streamers/StreamArray.js';
import jsonlParserPkg from 'stream-json/jsonl/Parser.js';
const { chain } = streamChainPkg;
const { parser } = streamJsonPkg;
const { streamArray } = streamArrayPkg;
const { parser: jsonlParser } = jsonlParserPkg;

// --- Config ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const FORCE_FULL_SYNC = process.env.FORCE_FULL_SYNC === 'true';

const CARD_BATCH_SIZE = 100;
const SNAPSHOT_BATCH_SIZE = 250;
const SET_BATCH_SIZE = 100;
const HASH_FETCH_BATCH = 1000;
const BATCH_PAUSE_MS = 250;
const HASH_FETCH_PAUSE_MS = 100;
const MIN_SNAPSHOT_USD = 0.50;
const MAX_RETRIES = 3;
// Scryfall now publishes gzipped JSONL, not a plain JSON array, so the temp
// file keeps its real extension rather than pretending to be .json.
const TEMP_FILE = 'scryfall-bulk.jsonl.gz';

const CK_PRICELIST_URL = 'https://api.cardkingdom.com/api/v2/pricelist';

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('FATAL: SUPABASE_URL and SUPABASE_SECRET_KEY env vars are required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

// --- Helpers ---

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

// Fetch Card Kingdom pricelist and return a Map keyed on scryfall_id
// Returns: Map<scryfall_id, { price_retail, price_buy, nm_price, ex_price, vg_price, g_price }>
async function fetchCardKingdomPrices() {
  console.log('Fetching Card Kingdom pricelist...');
  try {
    const res = await fetch(CK_PRICELIST_URL, {
      headers: { 'User-Agent': 'CardsonCardsonCards/1.0 (cardsoncardsoncards.com.au)' }
    });
    if (!res.ok) {
      console.warn(`Card Kingdom pricelist failed: ${res.status}. Skipping CK prices.`);
      return new Map();
    }
    const data = await res.json();
    const items = data.data || [];
    const map = new Map();
    for (const item of items) {
      if (!item.scryfall_id) continue;
      // price_buy is what CK pays (seller/buylist price)
      // price_retail is what buyers pay
      // qty_buying = 0 means CK is not currently buying
      map.set(item.scryfall_id, {
        price_retail: parseFloat(item.price_retail) || null,
        price_buy: item.qty_buying > 0 ? (parseFloat(item.price_buy) || null) : null,
        nm_price: parseFloat(item.nm_price) || null,
        ex_price: parseFloat(item.ex_price) || null,
        vg_price: parseFloat(item.vg_price) || null,
        g_price: parseFloat(item.g_price) || null,
        qty_buying: item.qty_buying || 0
      });
    }
    console.log(`Card Kingdom: loaded ${map.size} entries`);
    return map;
  } catch (err) {
    console.warn(`Card Kingdom fetch error: ${err.message}. Skipping CK prices.`);
    return new Map();
  }
}

async function downloadBulkFile() {
  console.log('Fetching Scryfall bulk data index...');
  const bulkRes = await fetch('https://api.scryfall.com/bulk-data', {
    headers: { 'User-Agent': 'CardsonCardsonCards/1.0 (cardsoncardsoncards.com.au)' }
  });
  // Check the response before parsing it. Without this, a 4xx or 5xx from
  // Scryfall surfaced as the misleading "could not find default_cards" error
  // below, because bulkData.data was undefined rather than the entry missing.
  if (!bulkRes.ok) {
    throw new Error(`Scryfall bulk-data index returned HTTP ${bulkRes.status}`);
  }
  const bulkData = await bulkRes.json();
  const defaultCards = bulkData.data?.find(d => d.type === 'default_cards');
  if (!defaultCards) {
    const seen = (bulkData.data || []).map(d => d.type).join(', ') || 'none';
    throw new Error(`No default_cards entry in Scryfall bulk index. Types present: ${seen}`);
  }

  // Scryfall replaced the plain-JSON download_uri with a gzipped JSONL file
  // under jsonl_download_uri. The old field was dropped entirely, which is
  // what broke this sync from 29 July 2026. Prefer the new field, fall back to
  // the old one so a Scryfall rollback does not break the sync a second time.
  const downloadUri = defaultCards.jsonl_download_uri || defaultCards.download_uri;
  const isJsonl = Boolean(defaultCards.jsonl_download_uri);
  if (!downloadUri) {
    throw new Error(
      'default_cards entry has neither jsonl_download_uri nor download_uri. ' +
      `Fields present: ${Object.keys(defaultCards).join(', ')}`
    );
  }

  console.log(`Downloading (${isJsonl ? 'gzipped JSONL' : 'legacy JSON array'}):`, downloadUri);
  const fileRes = await fetch(downloadUri, {
    headers: { 'User-Agent': 'CardsonCardsonCards/1.0 (cardsoncardsoncards.com.au)' }
  });
  if (!fileRes.ok) throw new Error('Bulk download failed: ' + fileRes.status);

  await streamPipeline(fileRes.body, createWriteStream(TEMP_FILE));
  console.log('Bulk file saved.');
}

// Work out what is actually on disk rather than trusting the file name or the
// index's field names. Covers the gzipped JSONL Scryfall serves now, a plain
// JSONL file, and the legacy JSON array, so the reuse-existing-file path and
// the legacy fallback in downloadBulkFile both stay correct.
function detectBulkFormat(path) {
  const fd = openSync(path, 'r');
  try {
    const head = Buffer.alloc(64);
    const bytesRead = readSync(fd, head, 0, 64, 0);
    if (bytesRead >= 2 && head[0] === 0x1f && head[1] === 0x8b) return 'gzip-jsonl';
    const firstChar = head.slice(0, bytesRead).toString('utf8').trimStart()[0];
    return firstChar === '[' ? 'json-array' : 'jsonl';
  } finally {
    closeSync(fd);
  }
}

// Every branch emits {key, value} objects, so the consumer below is unchanged.
function buildCardStream(path) {
  const format = detectBulkFormat(path);
  console.log('Bulk file format detected:', format);
  if (format === 'gzip-jsonl') {
    return chain([createReadStream(path), createGunzip(), jsonlParser()]);
  }
  if (format === 'jsonl') {
    return chain([createReadStream(path), jsonlParser()]);
  }
  return chain([createReadStream(path), parser(), streamArray()]);
}

function computeCardHash(card) {
  const sigParts = [
    card.id, card.name, card.set, card.set_name, card.collector_number,
    card.rarity, card.type_line || '', card.oracle_text || card.card_faces?.[0]?.oracle_text || '',
    card.mana_cost || '', card.cmc ?? 0, (card.colors || []).join(','),
    (card.color_identity || []).join(','),
    card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || '',
    card.released_at || '', card.layout || '', (card.finishes || []).join(','),
    card.edhrec_rank || '', card.flavor_text || '', card.power || '',
    card.toughness || '', card.loyalty || '', card.artist || '',
    JSON.stringify(card.legalities || {}), card.frame || '', card.border_color || ''
  ];
  return createHash('sha256').update(sigParts.join('|')).digest('hex').substring(0, 16);
}

async function fetchHashPage(lastId) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let query = supabase
      .from('mtg_cards')
      .select('scryfall_id, data_hash')
      .order('scryfall_id', { ascending: true })
      .limit(HASH_FETCH_BATCH);

    if (lastId !== null) query = query.gt('scryfall_id', lastId);

    const { data, error } = await query;
    if (!error) return data || [];

    if (attempt < MAX_RETRIES) {
      const backoff = (attempt + 1) * 2000;
      console.warn(`\nHash fetch retry ${attempt + 1}/${MAX_RETRIES}: ${error.message}. Waiting ${backoff}ms...`);
      await sleep(backoff);
    } else {
      throw error;
    }
  }
  return [];
}

async function fetchExistingHashes() {
  console.log('Fetching existing card hashes (cursor-based)...');
  const hashes = new Map();
  let lastId = null;
  let totalFetched = 0;

  while (true) {
    const page = await fetchHashPage(lastId);
    if (page.length === 0) break;
    for (const row of page) hashes.set(row.scryfall_id, row.data_hash);
    totalFetched += page.length;
    process.stdout.write(`\rFetched ${totalFetched} existing hashes`);
    lastId = page[page.length - 1].scryfall_id;
    if (page.length < HASH_FETCH_BATCH) break;
    await sleep(HASH_FETCH_PAUSE_MS);
  }

  console.log(`\n${hashes.size} existing cards in DB`);
  return hashes;
}

function buildCardRow(card, audRate, dataHash) {
  const priceUsd = parseFloat(card.prices?.usd || 0) || null;
  const priceUsdFoil = parseFloat(card.prices?.usd_foil || 0) || null;
  const priceEur = parseFloat(card.prices?.eur || 0) || null;
  const priceTix = parseFloat(card.prices?.tix || 0) || null;
  const priceAud = priceUsd ? Math.round(priceUsd * audRate * 100) / 100 : 0;

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
    data_hash: dataHash,
    updated_at: new Date().toISOString()
  };
}

function buildSnapshotRow(card, audRate, today, ckMap) {
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

  // Card Kingdom buylist data
  const ck = ckMap.get(card.id);
  const priceBuyCkUsd = ck?.price_buy || null;
  const priceBuyCkAud = priceBuyCkUsd ? Math.round(priceBuyCkUsd * audRate * 100) / 100 : null;

  return {
    scryfall_id: card.id,
    price_usd: priceUsd,
    price_usd_foil: priceUsdFoil,
    price_usd_etched: priceUsdEtched,
    price_aud: priceUsd ? Math.round(priceUsd * audRate * 100) / 100 : null,
    price_aud_foil: priceUsdFoil ? Math.round(priceUsdFoil * audRate * 100) / 100 : null,
    price_aud_etched: priceUsdEtched ? Math.round(priceUsdEtched * audRate * 100) / 100 : null,
    price_buy_ck_usd: priceBuyCkUsd,
    price_buy_ck_aud: priceBuyCkAud,
    aud_usd_rate: audRate,
    // C3L-42: stamp what wrote this row. written_at fills from its column default, but
    // source has to be set by the writer. Task 04 could not identify what wrote the 39,515
    // anomalous rows of 6 June 2026 precisely because neither column existed then. Any
    // future writer of this table should set this too, and a row with a NULL source after
    // 5 August 2026 is itself a signal that something outside the sync wrote it.
    source: 'sync-mtg-daily',
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

async function upsertBatchWithRetry(table, rows, conflictKey, label = '') {
  if (!rows.length) return { upserted: 0, failed: 0 };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { error } = await supabase.from(table).upsert(rows, { onConflict: conflictKey });

    if (!error) return { upserted: rows.length, failed: 0 };

    if (attempt < MAX_RETRIES) {
      const backoff = (attempt + 1) * 2000;
      console.warn(`\n${label} batch failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${error.message}. Retrying in ${backoff}ms...`);
      await sleep(backoff);
    } else {
      console.error(`\n${label} batch FAILED after ${MAX_RETRIES + 1} attempts: ${error.message}`);
      return { upserted: 0, failed: rows.length };
    }
  }

  return { upserted: 0, failed: rows.length };
}


async function main() {
  const startTime = Date.now();
  console.log('=== MTG Daily Sync ===');
  console.log(`Mode: ${FORCE_FULL_SYNC ? 'FULL (forced)' : 'INCREMENTAL'}`);

  const audRate = await getExchangeRate();
  console.log('AUD rate:', audRate);

  // Fetch Card Kingdom pricelist once upfront
  const ckMap = await fetchCardKingdomPrices();

  if (!existsSync(TEMP_FILE)) {
    await downloadBulkFile();
  } else {
    console.log('Reusing existing bulk file:', TEMP_FILE);
  }

  const existingHashes = FORCE_FULL_SYNC ? new Map() : await fetchExistingHashes();

  const today = new Date().toISOString().split('T')[0];

  let cardBatch = [];
  const allSnapshots = [];
  const setsMap = new Map();

  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalUnchanged = 0;
  let totalCardsUpserted = 0;
  let totalCardsFailed = 0;
  let totalSnapshotsUpserted = 0;
  let totalSnapshotsFailed = 0;
  let batchCount = 0;

  console.log('Streaming cards...');

  await new Promise((resolve, reject) => {
    const cardStream = buildCardStream(TEMP_FILE);

    cardStream.on('data', async ({ value: card }) => {
      totalProcessed++;

      if (card.digital) { totalSkipped++; return; }
      if (card.lang && card.lang !== 'en') { totalSkipped++; return; }
      if (['token', 'emblem', 'art_series', 'reversible_card'].includes(card.layout)) {
        totalSkipped++;
        return;
      }
      if (!card.id || !card.name || !card.set) { totalSkipped++; return; }

      if (!setsMap.has(card.set)) {
        setsMap.set(card.set, buildSetRow(card));
      }

      const snap = buildSnapshotRow(card, audRate, today, ckMap);
      if (snap) allSnapshots.push(snap);

      const newHash = computeCardHash(card);
      const oldHash = existingHashes.get(card.id);

      if (!FORCE_FULL_SYNC && oldHash === newHash) {
        totalUnchanged++;
        return;
      }

      cardBatch.push(buildCardRow(card, audRate, newHash));

      if (cardBatch.length >= CARD_BATCH_SIZE) {
        cardStream.pause();
        const toFlush = cardBatch;
        cardBatch = [];
        const { upserted, failed } = await upsertBatchWithRetry('mtg_cards', toFlush, 'scryfall_id', 'cards');
        totalCardsUpserted += upserted;
        totalCardsFailed += failed;
        batchCount++;

        if (batchCount % 5 === 0) {
          process.stdout.write(`\rProcessed: ${totalProcessed} | Unchanged: ${totalUnchanged} | Upserted: ${totalCardsUpserted} | Failed: ${totalCardsFailed} | Snapshots: ${allSnapshots.length}`);
        }

        await sleep(BATCH_PAUSE_MS);
        cardStream.resume();
      }
    });

    cardStream.on('end', resolve);
    cardStream.on('error', reject);
  });

  if (cardBatch.length) {
    const { upserted, failed } = await upsertBatchWithRetry('mtg_cards', cardBatch, 'scryfall_id', 'cards-final');
    totalCardsUpserted += upserted;
    totalCardsFailed += failed;
    cardBatch = [];
  }

  console.log(`\n\nCards complete. Flushing ${allSnapshots.length} snapshots...`);

  for (let i = 0; i < allSnapshots.length; i += SNAPSHOT_BATCH_SIZE) {
    const slice = allSnapshots.slice(i, i + SNAPSHOT_BATCH_SIZE);
    const { upserted, failed } = await upsertBatchWithRetry(
      'mtg_price_snapshots',
      slice,
      'scryfall_id,snapshot_date',
      `snapshots-${i}`
    );
    totalSnapshotsUpserted += upserted;
    totalSnapshotsFailed += failed;

    const batchNum = Math.floor(i / SNAPSHOT_BATCH_SIZE);
    if (batchNum % 10 === 0) {
      process.stdout.write(`\rSnapshots: ${totalSnapshotsUpserted} / ${allSnapshots.length}`);
    }

    await sleep(BATCH_PAUSE_MS);
  }

  console.log('\n\nFlushing sets...');

  const setRows = Array.from(setsMap.values());
  let setsUpserted = 0;
  let setsFailed = 0;
  for (let i = 0; i < setRows.length; i += SET_BATCH_SIZE) {
    const { upserted, failed } = await upsertBatchWithRetry(
      'mtg_sets',
      setRows.slice(i, i + SET_BATCH_SIZE),
      'set_code',
      'sets'
    );
    setsUpserted += upserted;
    setsFailed += failed;
    await sleep(BATCH_PAUSE_MS);
  }

  try { unlinkSync(TEMP_FILE); } catch {}

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n=== Sync complete ===');
  console.log(`Mode:                ${FORCE_FULL_SYNC ? 'FULL' : 'INCREMENTAL'}`);
  console.log(`Processed:           ${totalProcessed}`);
  console.log(`Skipped (filters):   ${totalSkipped}`);
  console.log(`Unchanged (skipped): ${totalUnchanged}`);
  console.log(`Cards upserted:      ${totalCardsUpserted}`);
  console.log(`Cards failed:        ${totalCardsFailed}`);
  console.log(`Snapshots upserted:  ${totalSnapshotsUpserted}`);
  console.log(`Snapshots failed:    ${totalSnapshotsFailed}`);
  console.log(`Sets upserted:       ${setsUpserted}`);
  console.log(`Sets failed:         ${setsFailed}`);
  console.log(`CK prices loaded:    ${ckMap.size}`);
  console.log(`Elapsed:             ${elapsed}s`);

  if (totalCardsFailed > 0 || totalSnapshotsFailed > 0 || setsFailed > 0) {
    console.error('Some batches failed permanently. See log above.');
    process.exit(1);
  }

  // Zero-row guard (C3L-10). Failing batches were the only thing that could make this job exit
  // non-zero, so a run that reached the end having written nothing at all still reported
  // success. That is precisely how the original MTG outage stayed invisible: the workflow was
  // green every morning while the price data underneath it went stale.
  // Neither of these can happen on a healthy run. A snapshot row is built for every card at
  // line 463, BEFORE the unchanged-hash check, so "nothing changed upstream" still produces a
  // full set of snapshots. Zero means the feed or the write path is broken, not that the day
  // was quiet.
  if (totalProcessed === 0) {
    console.error('ZERO ROWS: the bulk feed yielded no usable cards. Treating as a failure.');
    process.exit(1);
  }
  if (totalSnapshotsUpserted === 0) {
    console.error(`ZERO SNAPSHOTS: processed ${totalProcessed} cards but wrote no price snapshots. Treating as a failure.`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
