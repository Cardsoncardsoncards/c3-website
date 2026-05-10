# C3 — Cards on Cards on Cards (cardsoncardsoncards.com.au)

## What this project is
Eleventy static site + Netlify Functions. TCG card vault, blog, EV calculators,
and affiliate commerce. Live at cardsoncardsoncards.com.au. Auto-deploys from
GitHub main branch via Netlify Pro.

## Repo structure
- netlify/functions/   — all serverless functions (.mjs)
- src/                 — Eleventy source (blog posts, HTML pages, templates)
- src/blog/            — one .md file per post (247 posts, p001-p247 minus p101)
- _site/               — build output (never edit, never commit)
- sitemap.xml          — static sitemap (repo root, passthrough)
- sitemap-index.xml    — sitemap index (repo root, passthrough)
- netlify.toml         — build config and function timeouts
- .eleventy.js         — Eleventy config and passthrough rules

## Current build state (as of 9 May 2026)
- 247 blog posts live (p001-p247, minus p101)
- MTG Card Vault live at /cards/mtg (96,333 cards, 745 sets)
- Pokemon, Lorcana, Yu-Gi-Oh hubs live at /cards/[game]
- 49,804 card pages indexed in Google Search Console
- 25,441 eBay listings
- tcgapi.dev Pro active -- syncs for 7 games configured
- RLS active on all Supabase tables

## Key functions (netlify/functions/)
- card-index.mjs           — MTG hub, set pages, random commander
- card-page.mjs            — individual MTG card pages
- card-api.mjs             — multi-route API gateway
- commander-carousel.mjs   — Scryfall-powered commander carousel
- sitemap-cards.mjs        — dynamic XML sitemap for MTG card pages
- pokemon-hub.mjs          — Pokemon hub at /cards/pokemon
- pokemon-card-page.mjs    — individual Pokemon card pages
- pokemon-set-page.mjs     — Pokemon set pages
- lorcana-hub.mjs          — Lorcana hub at /cards/lorcana
- lorcana-card-page.mjs    — individual Lorcana card pages
- lorcana-set-page.mjs     — Lorcana set pages
- yugioh-hub.mjs           — Yu-Gi-Oh hub at /cards/yugioh
- yugioh-card-page.mjs     — individual Yu-Gi-Oh card pages
- yugioh-set-page.mjs      — Yu-Gi-Oh set pages
- sync-lorcana.mjs         — tcgapi.dev sync for Lorcana
- sync-onepiece.mjs        — tcgapi.dev sync for One Piece
- sync-pokemon.mjs         — tcgapi.dev sync for Pokemon
- sync-yugioh.mjs          — tcgapi.dev sync for Yu-Gi-Oh
- sync-riftbound.mjs       — tcgapi.dev sync for Riftbound
- sync-starwars.mjs        — tcgapi.dev sync for Star Wars Unlimited
- sync-dragonball.mjs      — tcgapi.dev sync for Dragon Ball Super
- sitemap-lorcana.mjs      — dynamic sitemap for Lorcana card pages
- sitemap-onepiece.mjs     — dynamic sitemap for One Piece card pages
- sitemap-pokemon.mjs      — dynamic sitemap for Pokemon card pages
- sitemap-yugioh.mjs       — dynamic sitemap for Yu-Gi-Oh card pages
- sitemap-riftbound.mjs    — dynamic sitemap for Riftbound card pages
- sitemap-starwars.mjs     — dynamic sitemap for Star Wars card pages
- sitemap-dragonball.mjs   — dynamic sitemap for Dragon Ball card pages

## Data sources
- Supabase (owaroeqchreuffbyakqx) — card data, prices, slugs, snapshots
- tcgapi.dev Pro                  — card and price data for all non-MTG games
- Scryfall API                    — MTG card images and commander queries
- exchangerate-api.com            — USD to AUD conversion (fallback 1.58)
- eBay EPN (campid 5339146789)    — affiliate commerce links
- Amazon Associates (blasdigital-22) — accessory affiliate links

## Coding rules
- All functions: ES modules (.mjs), Netlify.env.get() for all secrets
- Never use process.env -- Netlify.env.get() only
- Auth guard (x-sync-secret) required on all sync functions
- custom_attributes is jsonb -- pass object directly, never JSON.stringify
- Rate limit buffer = 200 on all tcgapi.dev sync functions
- MAX_PAGES = 50 hard cap on all pagination loops
- Slug collision resolution: setAbbr prefix + card.id fallback
- No Flesh and Blood content anywhere (LSS commercial prohibition)
- eBay singles floor price: AUD $3.49

## Supabase table structure
Each game has three tables: [game]_sets, [game]_cards, [game]_price_snapshots.
Games: mtg, pokemon, lorcana, yugioh, onepiece, riftbound, starwars, dragonball.
All tables: RLS enabled, service_role ALL policy, anon SELECT policy.
_price_snapshots: unique constraint on (card_id, snapshot_date) required for upsert.

## Deploy
git add / commit / push to main triggers Netlify auto-deploy (~60 seconds).
Check Netlify dashboard > Functions for sync logs.
Standard sequence: npm run build && git add . && git commit -m "msg" && git push origin main
Count blog posts: dir src\blog /b | find /c ".md"

## TCG scope
Active: MTG, Pokemon, Lorcana, One Piece, Yu-Gi-Oh, Dragon Ball Super,
Star Wars Unlimited, Riftbound.
Permanently excluded: Flesh and Blood.
