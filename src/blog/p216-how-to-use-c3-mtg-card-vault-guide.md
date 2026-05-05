---
title: "How to Use the C3 MTG Card Vault: Full Feature Guide"
description: "The C3 MTG Card Vault has 96,000+ Magic: The Gathering cards with live AUD pricing. This guide covers every feature — search, set browsing, card pages, printings carousel, and the Random Commander tool."
date: 2026-05-05
category: "tools-and-trackers"
tags:
  - post
  - mtg
  - tools
  - card-vault
  - australia
emoji: "🗄️"
affiliate_disclaimer: false
cta_type: "ebay"
cta_link: "https://www.ebay.com.au/str/cardsoncardsoncards?campid=5339146789"
featured: false
layout: post
---

The [C3 MTG Card Vault](https://cardsoncardsoncards.com.au/cards/mtg) is Australia's MTG price tool built on live eBay AU data. It covers 96,000+ Magic: The Gathering cards across all sets with Australian dollar pricing.

This guide explains every feature and how to get the most out of it.

## The Hub Page: Starting Point

The Card Vault hub at [cards/mtg](/cards/mtg) has three main sections:

**Search**: type any card name and get results filtered from the full database. Results show the card image, current AUD price, and a link to the full card page.

**Set Browser**: all MTG sets organised alphabetically with expand-to-see-sub-sets functionality. Click any set tile to go to that set's page. Sets with multiple printings (like "Adventures in the Forgotten Realms" which has a Commander variant) show a "+" button to expand and reveal sub-sets.

**Quick Access**: buttons to the Random Commander Generator, EV Calculator, Free Tracker, and eBay Shop.

## Searching for a Card

Type any card name in the search box and press Search or Enter. Results are filtered from the full Supabase database of 96,000+ cards.

Search tips:
- Partial names work: "sol ring" returns Sol Ring
- Spell the name correctly — the search is exact-match on the first few characters
- If a card doesn't appear, it may be a token or digital-only card not in the main database

## Reading a Card Page

Each card page at `/cards/mtg/[slug]` shows:

**Hero section (left column)**:
- Card art from the primary printing
- Current AUD price (converted from USD using 1.58 rate)
- eBay AU buy link

**Card details (right column)**:
- Type line and full card text
- Mana cost and colour identity
- Rarity, artist, set
- Legality in major formats (Commander, Standard, Modern, Pioneer, Legacy)

**Printings Carousel (below both columns)**:
- All known printings of the card with thumbnails
- Arrow navigation to scroll through printings
- Clicking a printing thumbnail updates the hero image and price block
- Foil prices shown where available

## The Printings Carousel: Finding Cheaper Versions

The printings carousel is particularly useful for finding budget versions of expensive cards. A card like Rhystic Study has 15+ printings across different sets and Commander products. Prices vary between printings based on art, scarcity, and collector demand.

Use the carousel to:
- Find the cheapest printing (usually a recent Commander reprint)
- Find a specific art version you prefer
- Check if a foil version is available and what it costs

## Set Pages

Each set page at `/cards/mtg/sets/[set-slug]` shows:

- Set header with name, release year, and set stats
- The top 5 most valuable cards from the set as quick reference
- Full card grid with filter controls (by name, colour, type, rarity, mana value)
- Sticky filter bar that stays visible as you scroll

Filters work in combination — filter by "Rare" and "Blue" simultaneously to see all rare blue cards in a set.

## The Random Commander Generator

The [Random Commander Generator](/cards/mtg/random-commander) generates 1 to 4 random Commander suggestions from the full database of 10,000+ legendary creatures. Filters:

- **Colour identity**: select which colours to include (W, U, B, R, G or any combination)
- **Mana value**: maximum mana value filter to find budget-accessible commanders
- **Count**: 1 to 4 commanders per generation

Per-slot reroll lets you replace one commander while keeping others. Share button generates a shareable URL with your filter settings.

See the [full Random Commander guide](/blog/how-to-use-c3-random-commander-generator/) for detailed usage tips.

## How Prices Are Calculated

Prices on C3 Card Vault are:

- Sourced from Scryfall's pricing data (which aggregates from TCGplayer for the USD price)
- Converted to AUD at a fixed rate of 1.58
- Updated when the Netlify function serves the page (not live real-time, but regularly refreshed)

For the most precise current Australian market price, cross-reference with eBay AU sold listings. The C3 prices are a reliable benchmark but eBay AU sold is the definitive source for what Australian buyers actually pay.

## Finding the eBay AU Buy Link

Every card page and search result includes a direct eBay AU buy link (with C3's EPN affiliate link). This links to an eBay AU search pre-filtered for the specific card name. It's the fastest path from price lookup to purchasing.

---

*Start exploring at [C3 MTG Card Vault](/cards/mtg). Try the [Random Commander Generator](/cards/mtg/random-commander).*
