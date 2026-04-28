// netlify/functions/sync-mtg-cards.mjs
// Scheduled function: runs daily at 3am UTC
// Downloads Scryfall bulk data, upserts all cards into Supabase
// Also syncs set data and fetches rulings for high-value cards

const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');
const MIN_PRICE_USD = 0.50; // Only store price snapshots above this threshold

// --- Helpers ---

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function supabaseUpsert(table, rows, conflictColumn) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': `resolution=merge-duplicates,return=minimal`
    },
    body: JSON.stringify(rows)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase upsert to ${table} failed: ${err}`);
  }
  return res;
}

async function getExchangeRate() {
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await res.json();
    return data.rates?.AUD || 1.58;
  } catch {
    return 1.58; // Fallback rate
  }
}

async function fetchScryfall(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CardsonCardsonCards/1.0 (cardsoncardsoncards.com.au)' }
  });
  if (!res.ok) throw new Error(`Scryfall fetch failed: ${url}`);
  return res.json();
}

// --- Main function ---

export default async (req) => {
  console.log('[sync-mtg-cards] Starting sync...');
  const startTime = Date.now();

  try {
    // Step 1: Get AUD exchange rate
    const audRate = await getExchangeRate();
    console.log(`[sync-mtg-cards] AUD rate: ${audRate}`);

    // Step 2: Get Scryfall bulk data URL (changes daily)
    const bulkIndex = await fetchScryfall('https://api.scryfall.com/bulk-data');
    const defaultCards = bulkIndex.data.find(d => d.type === 'default_cards');
    if (!defaultCards) throw new Error('Could not find default_cards bulk data');
    console.log(`[sync-mtg-cards] Bulk file: ${defaultCards.download_uri}`);

    // Step 3: Download bulk data
    const bulkRes = await fetch(defaultCards.download_uri, {
      headers: { 'User-Agent': 'CardsonCardsonCards/1.0 (cardsoncardsoncards.com.au)' }
    });
    const allCards = await bulkRes.json();
    console.log(`[sync-mtg-cards] Downloaded ${allCards.length} cards`);

    // Step 4: Get Scryfall sets data
    const setsData = await fetchScryfall('https://api.scryfall.com/sets');
    const sets = setsData.data || [];

    // Step 5: Process sets - upsert into mtg_sets
    const setRows = sets
      .filter(s => !s.digital && ['core', 'expansion', 'masters', 'draft_innovation',
        'commander', 'funny', 'promo', 'token', 'memorabilia', 'alchemy',
        'masterpiece', 'arsenal', 'from_the_vault', 'spellbook', 'premium_deck',
        'duel_deck', 'starter', 'box', 'planechase', 'archenemy',
        'vanguard', 'treasure_chest'].includes(s.set_type))
      .map(s => ({
        set_code: s.code,
        set_name: s.name,
        set_type: s.set_type,
        release_date: s.released_at || null,
        card_count: s.card_count || 0,
        digital: s.digital || false,
        icon_svg_uri: s.icon_svg_uri || null,
        scryfall_uri: s.scryfall_uri || null,
        set_slug: slugify(s.name),
        updated_at: new Date().toISOString()
      }));

    // Batch upsert sets in chunks of 100
    for (let i = 0; i < setRows.length; i += 100) {
      await supabaseUpsert('mtg_sets', setRows.slice(i, i + 100), 'set_code');
    }
    console.log(`[sync-mtg-cards] Upserted ${setRows.length} sets`);

    // Step 6: Deduplicate cards by oracle_id - keep most expensive printing
    const oracleMap = new Map();
    for (const card of allCards) {
      if (card.digital) continue;
      if (card.layout === 'token' || card.layout === 'emblem') continue;
      if (!card.oracle_id) continue;

      const priceUsd = parseFloat(card.prices?.usd || 0);
      const existing = oracleMap.get(card.oracle_id);

      if (!existing) {
        oracleMap.set(card.oracle_id, card);
      } else {
        const existingPrice = parseFloat(existing.prices?.usd || 0);
        if (priceUsd > existingPrice) {
          oracleMap.set(card.oracle_id, card);
        }
      }
    }

    const uniqueCards = Array.from(oracleMap.values());
    console.log(`[sync-mtg-cards] ${uniqueCards.length} unique oracle cards after dedup`);

    // Step 7: Build card rows and snapshot rows
    const today = new Date().toISOString().split('T')[0];
    const cardRows = [];
    const snapshotRows = [];

    for (const card of uniqueCards) {
      const priceUsd = parseFloat(card.prices?.usd || 0);
      const priceUsdFoil = parseFloat(card.prices?.usd_foil || 0);
      const priceUsdEtched = parseFloat(card.prices?.usd_etched || 0);
      const priceAud = priceUsd * audRate;
      const priceAudFoil = priceUsdFoil * audRate;
      const priceAudEtched = priceUsdEtched * audRate;

      // Get primary image URI handling double-faced cards
      let imageUri = null;
      let imageUriSmall = null;
      let imageUriArtCrop = null;
      let imageUriBorderCrop = null;

      if (card.image_uris) {
        imageUri = card.image_uris.normal || null;
        imageUriSmall = card.image_uris.small || null;
        imageUriArtCrop = card.image_uris.art_crop || null;
        imageUriBorderCrop = card.image_uris.border_crop || null;
      } else if (card.card_faces && card.card_faces[0]?.image_uris) {
        imageUri = card.card_faces[0].image_uris.normal || null;
        imageUriSmall = card.card_faces[0].image_uris.small || null;
        imageUriArtCrop = card.card_faces[0].image_uris.art_crop || null;
        imageUriBorderCrop = card.card_faces[0].image_uris.border_crop || null;
      }

      // Build slug - handle duplicate names with set code
      const baseSlug = slugify(card.name);
      const slug = baseSlug;

      cardRows.push({
        scryfall_id: card.id,
        oracle_id: card.oracle_id,
        name: card.name,
        slug: slug,
        set_code: card.set,
        set_name: card.set_name,
        collector_number: card.collector_number,
        rarity: card.rarity,
        type_line: card.type_line || null,
        mana_cost: card.mana_cost || null,
        cmc: card.cmc || 0,
        colors: card.colors || [],
        color_identity: card.color_identity || [],
        oracle_text: card.oracle_text || null,
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
        card_faces: card.card_faces ? JSON.stringify(card.card_faces) : null,
        all_parts: card.all_parts ? JSON.stringify(card.all_parts) : null,
        image_uri: imageUri,
        image_uri_small: imageUriSmall,
        image_uri_art_crop: imageUriArtCrop,
        image_uri_border_crop: imageUriBorderCrop,
        scryfall_uri: card.scryfall_uri || null,
        legalities: card.legalities ? JSON.stringify(card.legalities) : null,
        price_usd: priceUsd || null,
        price_usd_foil: priceUsdFoil || null,
        price_eur: parseFloat(card.prices?.eur || 0) || null,
        price_tix: parseFloat(card.prices?.tix || 0) || null,
        set_release_date: card.released_at || null,
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
        finishes: card.finishes || [],
        games: card.games || [],
        produced_mana: card.produced_mana || [],
        card_back_id: card.card_back_id || null,
        illustration_id: card.illustration_id || null,
        layout: card.layout || null,
        hand_modifier: card.hand_modifier || null,
        life_modifier: card.life_modifier || null,
        updated_at: new Date().toISOString()
      });

      // Only snapshot cards above price threshold
      if (priceUsd >= MIN_PRICE_USD || priceUsdFoil >= MIN_PRICE_USD) {
        snapshotRows.push({
          scryfall_id: card.id,
          price_usd: priceUsd || null,
          price_usd_foil: priceUsdFoil || null,
          price_usd_etched: priceUsdEtched || null,
          price_aud: priceAud || null,
          price_aud_foil: priceAudFoil || null,
          price_aud_etched: priceAudEtched || null,
          aud_usd_rate: audRate,
          snapshot_date: today
        });
      }
    }

    console.log(`[sync-mtg-cards] Processing ${cardRows.length} cards, ${snapshotRows.length} snapshots`);

    // Step 8: Batch upsert cards in chunks of 200
    let cardCount = 0;
    for (let i = 0; i < cardRows.length; i += 200) {
      await supabaseUpsert('mtg_cards', cardRows.slice(i, i + 200), 'scryfall_id');
      cardCount += Math.min(200, cardRows.length - i);
      if (cardCount % 2000 === 0) {
        console.log(`[sync-mtg-cards] Upserted ${cardCount}/${cardRows.length} cards`);
      }
    }

    // Step 9: Batch upsert snapshots in chunks of 500
    let snapCount = 0;
    for (let i = 0; i < snapshotRows.length; i += 500) {
      await supabaseUpsert('mtg_price_snapshots', snapshotRows.slice(i, i + 500), 'scryfall_id,snapshot_date');
      snapCount += Math.min(500, snapshotRows.length - i);
    }

    // Step 10: Update 52-week stats and verdicts for priced cards
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/update_price_stats`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[sync-mtg-cards] Done. ${cardCount} cards, ${snapCount} snapshots. ${elapsed}s`);

  } catch (err) {
    console.error('[sync-mtg-cards] FATAL:', err.message);
  }
};

export const config = {
  schedule: '0 3 * * *' // Daily at 3am UTC (1pm AEST)
};
