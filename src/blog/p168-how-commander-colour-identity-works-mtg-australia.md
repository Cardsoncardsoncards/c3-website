---
game: mtg
title: "How Commander Colour Identity Works"
description: "Colour identity in MTG Commander is more than just the card's frame colour. This guide explains the exact rule, including mana symbols in text."
date: 2026-05-05
category: buying-guides
tags: post
emoji: "🎨"
affiliate_disclaimer: true
layout: post
---## Quick Answer

Colour identity is one of the most commonly misunderstood rules in MTG Commander. It seems simple but has several edge cases that catch players out, even experienced ones. See current prices at [C3 MTG card prices](/cards/mtg).



Colour identity is one of the most commonly misunderstood rules in MTG Commander. It seems simple but has several edge cases that catch players out, even experienced ones.

This guide explains exactly how colour identity works and covers the mistakes Australian players most frequently make.

## The Basic Rule

Every card in your Commander deck must have a colour identity that falls within your Commander's colour identity.

Your Commander's colour identity is determined by:

1. The colours in its mana cost
2. Any coloured mana symbols that appear anywhere in the text box
3. Any colour indicators (coloured dots on the card's type line)

## Why the Text Box Matters

This is the part most people miss. If a card's abilities contain coloured mana symbols, those colours are part of that card's colour identity. even if the card itself is colourless or a different colour.

**Example**: Boros Charm is a red-white card with {R}{R}{W} in its cost and {R}{W} symbols in its rules text. Its colour identity is red and white.

**Example**: Transguild Courier is a colourless artifact creature, but its text box contains {W}{U}{B}{R}{G}. Its colour identity is all five colours. It can only go in a five-colour Commander deck.

**Example**: Celestial Dawn makes all your lands produce white mana. It references white mana, but the symbol in the text box is part of its effect. it doesn't add white to its colour identity on its own, because the symbol is part of a replacement effect, not a cost or activated ability.

The rules are specific: coloured mana symbols in reminder text do NOT count for colour identity. A card that says "({T}: Add {G} to your mana pool)" where the reminder explains basic landcycling doesn't pick up green from that.

## Common Mistakes

**Mistake 1: Including cards with off-colour activated abilities**

Sol Ring is colourless. it can go in any Commander deck. But a card with an activated ability that costs {U} has blue in its colour identity and can only go in a deck with a blue Commander.

**Mistake 2: Thinking colour indicator means card can't be used**

Some cards have colour indicators that define their colour. Pact of Negation is blue. Even though it has no coloured mana in its cost (it costs 0 to cast, you pay on your next upkeep), its colour indicator is blue. It can only go in blue Commander decks.

**Mistake 3: Assuming lands are always colourless**

Basic lands are colourless. But Arid Mesa (a fetch land) is colourless. Dryad Arbor, however, is a green land. Its colour identity is green. It can only go in green Commander decks.

**Mistake 4: Using split cards wrong**

Split cards like Fire // Ice have a combined colour identity of both halves. Fire is red; Ice is blue. The card's colour identity is blue-red. Even if your Commander is mono-red, you can't include Fire // Ice because the Ice half is blue.

## The Card C3's Random Commander Generator Uses

When you use the [C3 Random Commander Generator](/cards/mtg/random-commander) with colour filters, it filters by the Commander's colour identity (the `color_identity` field from Scryfall's database). This is the same field that determines which cards are legal in the deck.

For example, selecting W + U gives you commanders with white-blue colour identity. meaning their combined colour identity uses only white and blue. This includes mono-white, mono-blue, and Azorius (white-blue) commanders.

## A Practical Example

You want to build a Commander deck around Atraxa, Praetors' Voice. Atraxa is white-blue-black-green (no red). Your deck can include:

- White-only cards
- Blue-only cards
- Black-only cards
- Green-only cards
- Any combination of those four colours
- Colourless cards

Your deck cannot include:

- Any card with red in its colour identity (including colourless cards with red symbols in their text boxes)
- Transguild Courier (because it has red in its colour identity)
- Boros Reckoner (because it has red in its text box)

## Why This Rule Exists

Colour identity is what makes each Commander deck genuinely distinct. It forces you to build within constraints that reflect the identity of your Commander character. A blue-white Commander plays differently from a black-red Commander because they have access to fundamentally different tools.

Browse more Commander content at the [C3 MTG card hub](/cards/mtg) or try the [Random Commander Generator](/cards/mtg/random-commander) with specific colour filters.


## Why Colour Identity Matters More Than Card Colour

A card's printed colour and its colour identity can differ. The colour identity includes mana symbols anywhere on the card: including in the rules text.

**Example**: Tezzeret the Seeker has the card type Planeswalker and is printed in blue (its mana cost is all blue). But if Tezzeret appeared in a Commander precon's colour identity section with blue, he can only be in blue-or-five-colour Commander decks.

**More important example**: Fellwar Stone produces mana of any type your opponents could produce. Despite being a colourless artifact, its colour identity is colourless. It can go in any Commander deck. Contrast with Chromatic Lantern: also an artifact, also essentially colourless in the mana it produces: also in any Commander deck.

Now contrast with a card like Fire Diamond: produces red mana, has a red mana symbol in its activation cost. Red colour identity. Can only go in Commander decks that include red in their colour identity.

## The Colour Identity Rules in Detail

**Rule 1. Mana cost**: All mana symbols in the casting cost are part of the colour identity. A 2RR card has red colour identity.

**Rule 2. Rules text**: All mana symbols in the rules text (excluding reminder text in italics) are part of the colour identity.

**Rule 3. Colour indicators**: Some cards have a colour indicator dot (rather than a mana cost in the rules text). That dot contributes to colour identity.

**Rule 4. Characteristics**: Lands that produce coloured mana (basic Forests, Temple Gardens, etc.) have the colour identities of the colours of mana they produce by their subtype (Forest = green identity; Plains = white identity).

**Rule 5. Hybrid mana**: A hybrid mana symbol (such as the half-blue/half-green Simic symbol) counts as both colours. A card with a blue-green hybrid symbol has both blue and green colour identity.

## Common Colour Identity Questions

**Can I run Thoughtseize in a Dimir (blue-black) deck?**
Yes. Thoughtseize costs 1B: black identity only. Dimir includes black. Legal.

**Can I run Chromatic Star in a mono-red deck?**
Yes. Chromatic Star is a colourless artifact that produces any colour of mana: but the mana symbols are in the rules text as the activated ability producing the coloured mana, which does give it a colour identity... Actually: Chromatic Star's text says "T, Sacrifice Chromatic Star: Choose a color. Add one mana of that color." No mana symbol appears in the rules text: just the word "color". Colourless identity. Legal in any deck.

**Can I run Command Tower in any Commander deck?**
Yes. Command Tower produces mana of any colour in your Commander's colour identity. No specific colour symbols in rules text. Colourless identity. Legal everywhere.

## Checking Colour Identity Quickly

Every card's colour identity is listed on Scryfall (free, complete) and in the [C3 MTG card hub](/cards/mtg). Search any card and its colour identity is shown alongside legal formats.

For deck building, the [C3 Random Commander Generator](/cards/mtg/random-commander) filters Commanders by colour identity combination, which is useful when building within a specific identity constraint.

## The C3 Take

The decisions you make with your TCG collection matter more than most guides suggest. Whether you are buying, selling, or holding, the difference between a good outcome and a poor one almost always comes down to checking current AUD prices before you act. Use the live data at [C3 MTG card prices](/cards/mtg) to make price-informed decisions every time.

## What to Read Next

- Browse MTG singles and prices at [C3 MTG card prices](/cards/mtg)
- Find your MTG colour identity at [/quizzes/mtg-colour](/quizzes/mtg-colour)
- Calculate booster box expected value at [C3 tools](/tools)

## Frequently Asked Questions

### What is the best Commander deck for a new player in Australia?
Any Commander preconstructed deck from a recent set is a good starting point. Pick the theme or colour combination that appeals to you most. Current options from Tarkir: Dragonstorm and Lorwyn Eclipsed are available on Amazon AU.

### Can I use a Commander precon in tournament play?
Commander preconstructed decks are legal for casual Commander play and official Commander events. The individual cards are legal in Commander, Legacy, and Vintage. The precon as a whole is not competitive at high-level play but works fine for regular Commander nights.

### Where can I find Commander singles in Australia?
Singles for Commander deck upgrades are listed at the [C3 eBay store](https://www.ebay.com.au/str/cardsoncardsoncards?mkcid=1&mkrid=705-53470-19255-0&siteid=15&campid=5339146789&customid=blog&toolid=10001&mkevt=1). Use the [C3 Card Compare tool](/compare) to check prices across specific cards you want.
