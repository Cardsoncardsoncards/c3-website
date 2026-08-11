// scripts/lib/dry-run-stub.mjs
// Deterministic stand-in for the Anthropic call, used by --dry-run.
//
// It returns the same shape the real API returns (a forced emit_post tool_use
// block) built from the card data in the outgoing request, so the orchestrator,
// the markdown assembly and the QA checker can all be exercised end to end
// without spending tokens. It writes nothing and calls nothing.

const OPENERS = [
  'This one has sat near the top of the set since the first previews landed.',
  'Collector interest here has run ahead of the rest of the set.',
  'The gap between this card and the next one down is among the widest on the list.',
  'Listings for this card moved quickly once the full set was known.',
  'This is one of the cards doing the most work on the set of its price bracket.',
];

const CLOSERS = [
  'Whether that holds once supply settles is the open question.',
  'Prices at this end of a set rarely stay still for long.',
  'Worth watching over the next few weeks of trading.',
  'The premium printing is carrying most of the weight on this figure.',
  'That spread between printings is the part to watch.',
];

/**
 * Parse the card list back out of the user prompt the module built, so the
 * stub answers with the right names in the right order.
 */
function namesFromPrompt(prompt, count) {
  const names = [];
  const re = /^(\d+)\.\s(.+)$/gm;
  let m;
  while ((m = re.exec(prompt)) !== null) {
    names.push(m[2].trim());
    if (names.length === count) break;
  }
  return names;
}

export function makeStub() {
  return async function stubCallModel(body) {
    const prompt = body.messages[0].content;
    const count = body.tools[0].input_schema.properties.entries.minItems;
    const names = namesFromPrompt(prompt, count);

    const setMatch = prompt.match(/- Set name: (.+)/);
    const setName = setMatch ? setMatch[1].trim() : 'this set';
    const isPlayed = /most played/.test(prompt);
    const isPreorder = /has NOT released yet/.test(prompt);

    const intro = [
      `${setName} is the set under the microscope here, and the list below ranks its twenty ${isPlayed ? 'most played cards in Commander' : 'most expensive cards on Australian dollar pricing'}. Every figure comes from our own card pages rather than from a spoiler roundup, so the numbers match what you would see on the site today.`,
      'Every card appears once. Several cards carry more than one printing in the set, a standard version alongside a premium alternate, and where that happens the card is ranked on its highest priced printing with the remaining figures listed alongside it. Where two printings sit on exactly the same price, the tie is noted rather than broken quietly.',
      isPreorder
        ? 'These are preorder figures and they move. Treat the list as a reading of what collectors expect right now, not as a settled verdict on where the set lands once real supply arrives.'
        : 'Prices move. Treat the list as a snapshot of where the set sits today rather than a fixed ranking, and expect the order to shift as trading continues.',
    ].join('\n\n');

    const entries = names.map((name, i) => ({
      name,
      blurb:
        `${OPENERS[i % OPENERS.length]} ${name} lands at number ${i + 1} on this list, and its position reflects ` +
        `${isPlayed ? 'how often it turns up in Commander decks rather than its price alone' : 'current collector demand rather than any settled trading history'}. ` +
        `${CLOSERS[i % CLOSERS.length]}`,
    }));

    const faq = [
      {
        q: isPreorder ? `When does ${setName} release?` : `Has ${setName} already released?`,
        a: isPreorder
          ? 'The set has not released yet, so every figure on this list is a preorder price taken before packs were opened at scale.'
          : 'Yes. The set is out, so these are trading prices rather than preorder figures, though they still move week to week.',
      },
      {
        q: 'Are these final prices?',
        a: isPreorder
          ? 'No. Preorder pricing commonly moves in the first few weeks after release, sometimes up but more often down as supply arrives.'
          : 'No. Prices move with supply and demand, and this list is a snapshot of one moment rather than a fixed ranking.',
      },
      {
        q: 'How did you rank these cards?',
        a: isPlayed
          ? 'Each card appears once, ranked by its best EDHREC rank in the set, where a lower rank means the card is played more often. The price shown is the highest priced printing of that card in the set.'
          : 'Each card appears once, ranked by its highest priced printing in the set. Where two printings share a price exactly, the tie is noted rather than broken silently.',
      },
      {
        q: 'Why do some cards show more than one price?',
        a: 'Several cards have both a standard printing and a premium alternate in the same set. The card is ranked on the dearer of the two, and the other figures are listed alongside it so the spread is visible.',
      },
      {
        q: isPlayed ? `What is the single most played card in ${setName}?` : `What is the single most expensive card in ${setName}?`,
        a: `${names[0]} leads the list, and it sits clear enough of the rest that the gap is worth noting on its own.`,
      },
    ];

    return {
      content: [{ type: 'tool_use', name: 'emit_post', input: { intro, entries, faq } }],
      usage: { input_tokens: 2100, output_tokens: 2600, stub: true },
    };
  };
}

export default makeStub;
