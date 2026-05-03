# C3 — Cards on Cards on Cards (cardsoncardsoncards.com.au)

## What this project is
Eleventy static site + Netlify Functions. Targets ~31,679 canonical MTG card
pages for organic SEO and affiliate revenue via eBay EPN and Amazon Associates.
Live at cardsoncardsoncards.com.au. Auto-deploys from GitHub main branch.

## Repo structure
- netlify/functions/   — all serverless functions (.mjs)
- src/                 — Eleventy source (templates, blog posts, data)
- _site/               — build output (do not edit directly)
- CLAUDE.md            — this file

## Key functions
- card-index.mjs       — set and card page rendering
- commander-carousel.mjs — Scryfall-powered commander display, accepts ?setcode=
- sitemap-cards.mjs    — dynamic XML sitemap for card pages (price-filtered)

## Data sources
- Supabase             — card data, prices, slugs
- Scryfall API         — card images and commander queries
- eBay EPN + Amazon Associates — affiliate links

## Coding rules
- All functions are ES modules (.mjs), use Netlify.env.get() for secrets
- Supabase queries paginate in 5,000-row batches
- Price threshold for sitemap: PRICE_THRESHOLD = 2.00 USD (change to 0 after
  60 days to include all cards)
- eBay singles floor price: AUD $3.49
- No Flesh and Blood content anywhere

## Deploy
git add / commit / push to main triggers Netlify auto-deploy (~30-60 seconds).
Check Netlify dashboard for function logs if something breaks post-deploy.

## Current build state
- 103 blog posts live
- Google Analytics confirmed working
- Amazon Associates and eBay EPN active
- Search Console verification outstanding
- Card pages: architecture in progress, not yet generating at scale
