# Data Sources Register

External data providers used by Cards on Cards on Cards. Keep this current: add a row whenever a new source is wired into a sync or page. Format per source: name, base URL, auth, data supplied, date added, known risk.

## Card stat sources (Card Details grid, added task-48)

**YGOPRODeck** — `https://db.ygoprodeck.com/api/v7` — Auth: none (free, no key). Supplies Yu-Gi-Oh gameplay stats (atk, def, level, attribute, race, type), joined by card name and written to `yugioh_cards.custom_attributes`. Added: 10 July 2026. Known risk: community-run, no SLA or uptime guarantee; informal ~20 req/sec guidance; name-based join can miss cards with alternate/edge-case names.

**Lorcast** — `https://api.lorcast.com/v0` — Auth: none (free, no key). Supplies Lorcana gameplay stats (cost, ink, inkwell, strength, willpower, lore), joined by card name and written to `lorcana_cards.custom_attributes`. Added: 10 July 2026. Known risk: community-run, no SLA; name-based join; small provider.

**optcgapi.com** — `https://optcgapi.com/api` — Auth: none (docs confirm open use, no key). Supplies One Piece gameplay stats (card_cost, card_power, counter_amount, attribute, card_color, card_type, life), joined by the `number` column (card_set_id, e.g. OP16-080) and written to `onepiece_cards.custom_attributes`. Added: 10 July 2026. Known risk: community-run, no SLA; informal "don't hammer it" rate guidance; single maintainer.

**swu-db.com** — `https://api.swu-db.com` — Auth: none (free, no key). Supplies Star Wars Unlimited gameplay stats (cost, power, hp, aspects, traits, arenas, type), joined via a set_name-to-set-code map (sor/shd/twi/jtl/lof) plus the numeric part of `number`, written to `starwars_cards.custom_attributes`. Added: 10 July 2026. Known risk: community-run, no SLA; only the five mapped sets resolve (other/future sets skip gracefully with no stats).

## Card stat sources (Card Details grid, added task-57)

**apitcg.com** — `https://api.apitcg.com/api` — Auth: API key via `x-api-key` (env `APITCG_API_KEY`), Free plan, 1,000 requests/month. Supplies gameplay stats for five games (Digimon, Gundam, Union Arena, Riftbound, Dragon Ball Fusion World) as a dynamic `attributes` object, written to `{game}_cards.custom_attributes` by `enrich-apitcg-stats-background.mjs`. Joined on apitcg `code` to the C3 `number` column, both normalised with trim + uppercase. Unlike the task-48 sources this one paginates in bulk (100 cards/request), so the whole backfill is roughly 219 requests rather than one call per card. Added: 11 July 2026. Known risks: (1) quota is only 1,000/month, so a full re-run of all five games costs about a fifth of the monthly budget; (2) apitcg `code` is not unique, promos and reprints share the base card's code (about half of any Gundam page), so the enrichment map keeps the first entry per code, gameplay attributes are identical across those variants but `Rarity` may reflect an arbitrary printing; (3) measured match rates are Digimon/Gundam/DBFW 100%, Union Arena 99%, Riftbound 95% (its misses are token cards, codes like `T01 // T05`, which C3 does not stock).

Note: the five `sync-{game}-background.mjs` files for these games previously wrote `custom_attributes: card.custom_attributes || null` from tcgapi.dev, which supplies no attributes for them. That line was removed in task-57, since leaving it would have upserted null and wiped this enrichment on the next sync run.

## Core card/price/set sources (existing)

**tcgapi.dev (Pro)** — `https://api.tcgapi.dev/v1` — Auth: API key via `X-API-Key` (env `TCGAPI_KEY`). Primary source for sets, cards, images, and prices across all games in the platform (drives every `sync-*-background.mjs`). Added: pre-existing (in use before this register). Known risk: paid/keyed dependency and single point of failure for the whole catalogue; requests are quota-limited (syncs abort when `x-ratelimit-remaining` is low). It does not supply gameplay stats, which is why the four community APIs above were added.

**pokemontcg.io** — `https://api.pokemontcg.io/v2` — Auth: API key via `X-Api-Key` (env `POKEMONTCG_API_KEY`). Secondary Pokemon source in `sync-pokemon-background.mjs`: TCGPlayer/Cardmarket price detail and (added task-48) gameplay stats (hp, types, attacks, weaknesses, retreatCost, supertype/subtypes), joined by name+number and written to dedicated `pokemon_cards` columns. Added: pre-existing (stats select widened 10 July 2026). Known risk: keyed dependency; set-ID mapping between tcgapi.dev abbreviations and pokemontcg.io IDs is best-effort.
