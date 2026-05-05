---
title: "How Commander Colour Identity Works: The Rule Australians Most Often Get Wrong"
description: "Colour identity in MTG Commander is more than just the card's frame colour. This guide explains the exact rule — including mana symbols in text boxes — with examples Australian players often get wrong."
date: 2026-05-05
category: "beginner-guides"
tags:
  - post
  - mtg
  - commander
  - colour-identity
  - rules
emoji: "🎨"
affiliate_disclaimer: true
cta_type: "ebay"
cta_link: "https://www.ebay.com.au/sch/i.html?_nkw=commander+singles+mtg&campid=5339146789"
featured: false
layout: post
---

Colour identity is one of the most commonly misunderstood rules in MTG Commander. It seems simple but has several edge cases that catch players out, even experienced ones.

This guide explains exactly how colour identity works and covers the mistakes Australian players most frequently make.

## The Basic Rule

Every card in your Commander deck must have a colour identity that falls within your Commander's colour identity.

Your Commander's colour identity is determined by:

1. The colours in its mana cost
2. Any coloured mana symbols that appear anywhere in the text box
3. Any colour indicators (coloured dots on the card's type line)

## Why the Text Box Matters

This is the part most people miss. If a card's abilities contain coloured mana symbols, those colours are part of that card's colour identity — even if the card itself is colourless or a different colour.

**Example**: Boros Charm is a red-white card with {R}{R}{W} in its cost and {R}{W} symbols in its rules text. Its colour identity is red and white.

**Example**: Transguild Courier is a colourless artifact creature, but its text box contains {W}{U}{B}{R}{G}. Its colour identity is all five colours. It can only go in a five-colour Commander deck.

**Example**: Celestial Dawn makes all your lands produce white mana. It references white mana, but the symbol in the text box is part of its effect — it doesn't add white to its colour identity on its own, because the symbol is part of a replacement effect, not a cost or activated ability.

The rules are specific: coloured mana symbols in reminder text do NOT count for colour identity. A card that says "({T}: Add {G} to your mana pool)" where the reminder explains basic landcycling doesn't pick up green from that.

## Common Mistakes

**Mistake 1: Including cards with off-colour activated abilities**

Sol Ring is colourless — it can go in any Commander deck. But a card with an activated ability that costs {U} has blue in its colour identity and can only go in a deck with a blue Commander.

**Mistake 2: Thinking colour indicator means card can't be used**

Some cards have colour indicators that define their colour. Pact of Negation is blue. Even though it has no coloured mana in its cost (it costs 0 to cast, you pay on your next upkeep), its colour indicator is blue. It can only go in blue Commander decks.

**Mistake 3: Assuming lands are always colourless**

Basic lands are colourless. But Arid Mesa (a fetch land) is colourless. Dryad Arbor, however, is a green land. Its colour identity is green. It can only go in green Commander decks.

**Mistake 4: Using split cards wrong**

Split cards like Fire // Ice have a combined colour identity of both halves. Fire is red; Ice is blue. The card's colour identity is blue-red. Even if your Commander is mono-red, you can't include Fire // Ice because the Ice half is blue.

## The Card C3's Random Commander Generator Uses

When you use the [C3 Random Commander Generator](/cards/mtg/random-commander) with colour filters, it filters by the Commander's colour identity (the `color_identity` field from Scryfall's database). This is the same field that determines which cards are legal in the deck.

For example, selecting W + U gives you commanders with white-blue colour identity — meaning their combined colour identity uses only white and blue. This includes mono-white, mono-blue, and Azorius (white-blue) commanders.

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

Browse more Commander content at the [C3 MTG Card Vault](/cards/mtg) or try the [Random Commander Generator](/cards/mtg/random-commander) with specific colour filters.
