// scripts/lib/generate-post.mjs
// Phase 3 of the MTG set blog generator.
//
// One Anthropic API call per post, never per card. The model writes prose only:
// an intro, one blurb per card, and the FAQ. It never writes a link, an image
// or a price into the finished file. This module assembles the markdown itself
// from the real database rows, splicing the model's prose into a fixed frame,
// so a hallucinated price or invented card page cannot reach src/blog.
//
// Raw fetch rather than @anthropic-ai/sdk on purpose: adding the SDK would
// change package.json and package-lock.json, and this task set is scoped to
// scripts/ and src/blog only. The repo already calls every upstream API this
// way, with an AbortController and an explicit timeout.

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

export const MODEL = 'claude-sonnet-5';

// Generation is a single long call, not a page fetch. The repo's 8 second rule
// is for Netlify functions serving a request; an 8 second cap here would abort
// every call. 120 seconds with two retries is the working equivalent.
const REQUEST_TIMEOUT_MS = 120000;
const MAX_RETRIES = 2;
const MAX_TOKENS = 16000;

export const BANNED_WORDS = [
  'straightforward', 'elevate', 'robust', 'comprehensive', 'leverage',
  'delve', 'unlock', 'seamless', 'tapestry', 'vital', 'crucial',
  'game-changer', 'dive in', 'furthermore', 'moreover',
];

const EM_DASH = '\u2014';
const EN_DASH = '\u2013';

function getApiKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Add it to .env and run with ' +
      'node --env-file=.env, or export it in the shell.'
    );
  }
  return key;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * The model is forced to answer through this tool rather than by writing loose
 * JSON in a text block. An assistant prefill would return a 400 on this model
 * family, so the alternatives are a forced tool call or output_config.format.
 * Sonnet 5 does support structured outputs, but a forced tool call works on
 * every model the script might be pointed at and needs no schema dialect
 * juggling, so it stays.
 */
function buildTool(entryCount) {
  return {
    name: 'emit_post',
    description: 'Return the written prose for one MTG set blog post.',
    // strict: true makes the API validate the tool input against this schema
    // before returning it. Without it the model intermittently nested the whole
    // payload under a single "post" key, which cost five wasted calls in one
    // pilot run. Strict mode requires additionalProperties: false everywhere.
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        intro: {
          type: 'string',
          description:
            'Three or four paragraphs introducing the set and the list, separated by blank lines. No headings, no links, no images.',
        },
        entries: {
          type: 'array',
          // No minItems/maxItems: strict mode rejects any value above 1. The
          // count is stated in the description and in the prompt, and enforced
          // for real by the entries_complete QA check.
          description: `Exactly ${entryCount} blurbs, in the same order as the cards given in the prompt.`,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string', description: 'The card name, copied exactly as given.' },
              blurb: { type: 'string', description: 'Two or three sentences about this card. Prose only.' },
            },
            required: ['name', 'blurb'],
          },
        },
        faq: {
          type: 'array',
          // Same reason as entries: strict mode caps minItems at 1. The floor of
          // five is enforced by the faq_count QA check.
          description: 'At least five question and answer pairs, six or seven is better.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              q: { type: 'string', description: 'The question, ending in a question mark.' },
              a: { type: 'string', description: 'The answer, one or two sentences.' },
            },
            required: ['q', 'a'],
          },
        },
      },
      required: ['intro', 'entries', 'faq'],
    },
  };
}

function buildSystemPrompt() {
  return [
    'You write for Cards on Cards on Cards, an Australian trading card site.',
    '',
    'Rules, all of them absolute:',
    '- Australian English throughout. Never American spelling.',
    `- Never use an em dash (${EM_DASH}) or an en dash (${EN_DASH}). Use a comma, or rewrite the sentence.`,
    `- Never use any of these words or phrases: ${BANNED_WORDS.join(', ')}.`,
    '- Never write a markdown link, a markdown image, or a bare URL. The page frame supplies those.',
    '- Only state a price that appears in the card data given to you.',
    '  If you are not quoting a figure from that data, do not mention a price at all.',
    '- Every price is written exactly as given, to the cent, cents digits included.',
    '  AU$36.78 is written AU$36.78. Not AU$36, not AU$37, not AU$40, not "about AU$36",',
    '  not "roughly AU$40". A rounded price is wrong even when it is close to the real one,',
    '  and it will fail the automated check. If quoting the exact figure reads awkwardly,',
    '  describe the relationship instead ("a little over half the headline price") and give',
    '  no number at all.',
    '- Never describe what a card does mechanically. You have not been shown any card text,',
    '  so any rules claim would be invented. Write about price, printings, rarity and collector interest.',
    '- Never invent a release date, a product name or a set detail that is not in the prompt.',
    '- Two or three sentences per blurb. Vary the sentence shapes so the list does not read as a template.',
    '- Plain declarative prose. No hype, no exclamation marks, no rhetorical questions.',
    '',
    'Do not restate what the page already says. Directly above each blurb the page prints a',
    'sentence giving that card\'s rank, its price, how many printings it has in the set, and the',
    'prices of those other printings. Repeating any of that is duplication a reader sees twice in',
    'a row. Your blurb adds only what that sentence does not cover, for example what the size of',
    'the gap between printings implies, how the card sits against its neighbours on the list, or',
    'what its rarity is. If you have nothing to add beyond the figures, write about the comparison',
    'to other cards on the list instead.',
    '',
    'Because of that, a blurb contains no AU$ figure at all. Not the headline price, not the other',
    'printing, not an approximation of either. The frame above it has already printed every number',
    'the reader needs. Express magnitude in words instead: "roughly double the other printing",',
    '"a little under half the headline price", "within a few cents of the card above it". Prices',
    'belong in the intro and the FAQ, where you quote them exactly to the cent, never rounded.',
    '',
    'Describe, do not sell. You are reporting numbers, not recommending a purchase.',
    '- Never call a card a chase card, a must have, a standout, a benchmark, highly sought after,',
    '  hot, or any similar label.',
    '- Never assert what collectors want, what buyers are chasing, what is driving demand, or what',
    '  keeps a card on anyone\'s radar. You have prices and printing counts, and nothing about',
    '  demand, sales volume, scarcity or player behaviour. Those claims would be invented.',
    '- You may state what the figures show and what follows arithmetically from them, for example',
    '  that one printing is priced at roughly twice another, or that a gap is the widest on the list.',
    '- Do not speculate about why a price is what it is. If you cannot source a claim to the numbers',
    '  in front of you, leave it out.',
  ].join('\n');
}

function formatCardData(entries, mode) {
  return entries.map((e, i) => {
    const others = e.other_prices.length
      ? e.other_prices.map(p => `AU$${p.toFixed(2)}`).join(', ')
      : 'none';
    const rank = mode === 'played' && e.edhrec_rank !== null
      ? `, edhrec_rank ${e.edhrec_rank}`
      : '';
    return (
      `${i + 1}. ${e.name}\n` +
      `   headline price: AU$${e.price_aud.toFixed(2)}${rank}\n` +
      `   printings in set: ${e.printing_count}, of which ${e.priced_printing_count} carry a price\n` +
      `   other printing prices: ${others}\n` +
      `   rarity: ${e.rarity || 'unknown'}`
    );
  }).join('\n');
}

function buildUserPrompt({ setName, mode, entries, releaseDate, isUnreleased, failures, previousAttempt }) {
  const isExpensive = mode === 'expensive';
  const top = entries[0];

  const lines = [];

  lines.push(
    isExpensive
      ? `Write a post ranking the 20 most expensive cards in the Magic: The Gathering set "${setName}", by Australian dollar price.`
      : `Write a post ranking the 20 most played cards from the Magic: The Gathering set "${setName}" in Commander, using EDHREC rank, where a lower rank means more played.`
  );

  lines.push('');
  lines.push('Facts you may use. Everything else is off limits:');
  lines.push(`- Set name: ${setName}`);
  if (releaseDate) {
    lines.push(
      `- Release date: ${releaseDate}${isUnreleased ? ' (this set has NOT released yet, so all prices are preorder prices)' : ' (this set has already released)'}`
    );
  } else {
    lines.push('- Release date: unknown. Do not state or guess one.');
  }
  lines.push(
    isExpensive
      ? `- The single most expensive card is ${top.name} at AU$${top.price_aud.toFixed(2)}.`
      : `- The single most played card is ${top.name}, at EDHREC rank ${top.edhrec_rank}, priced AU$${top.price_aud.toFixed(2)}.`
  );
  lines.push(
    '- Methodology: each card appears once. Cards with several printings in the set are ranked by their ' +
    (isExpensive ? 'highest priced printing' : 'best (lowest) EDHREC rank, and priced by their highest priced printing') +
    ', and where two printings share a price exactly, the tie is noted rather than broken silently.'
  );
  lines.push('- Prices are in Australian dollars and move over time.');
  lines.push('- Readers buy singles through the card pages on our own site, and through eBay Australia.');
  // Stated as a plain positive fact. An earlier version told the model what not
  // to call the list, and it echoed the negation back as a denial in the prose
  // ("it is not a countdown"), which reads as answering a question nobody asked.
  lines.push(
    `- Ordering: the list is ordered from number 1, the ${isExpensive ? 'most expensive' : 'most played'} card, ` +
    'down to number 20. State this once, plainly, in the intro.'
  );

  lines.push('');
  lines.push('The 20 cards, in final published order:');
  lines.push(formatCardData(entries, mode));

  lines.push('');
  lines.push('Return, through the emit_post tool:');
  lines.push('- intro: three or four paragraphs. Say what the set is, what the list measures, how ties and multiple printings are handled, and that prices move.');
  lines.push(
    `- entries: exactly ${entries.length} blurbs, in the order above, each naming its card exactly as written. ` +
    'Remember the page already prints the rank, price and printing counts immediately above each blurb, ' +
    'so do not repeat those figures. Add the comparison or the implication instead.'
  );
  lines.push('- faq: at least five question and answer pairs. Between them they must cover:');
  lines.push(releaseDate ? '  * when the set releases or released' : '  * that the release date is not confirmed here');
  lines.push('  * the methodology, including how ties and multiple printings are handled');
  lines.push(
    isExpensive
      ? `  * which single card is the most expensive (${top.name})`
      : `  * which single card is the most played (${top.name})`
  );
  lines.push('  * where to buy singles in Australia');
  lines.push(
    isUnreleased
      ? '  * that these are preorder prices and are not final'
      : '  * that prices move after release and this is a snapshot'
  );

  // Retry path. The QA failures from the previous attempt are handed straight
  // back so the model fixes the specific defect instead of rewriting blind.
  if (failures && failures.length) {
    lines.push('');
    lines.push('IMPORTANT. A previous attempt at this post failed automated checks.');
    lines.push('Fix each of these specifically, and change nothing else that was already correct:');
    for (const f of failures) {
      lines.push(`- [${f.check}] ${f.detail}`);
    }
    if (previousAttempt && previousAttempt.wordCount) {
      lines.push(
        `The previous attempt ran to ${previousAttempt.wordCount} words. ` +
        'Write longer blurbs and a fuller intro so the finished post clears 1100 words comfortably.'
      );
    }
  }

  return lines.join('\n');
}

/** One call to the Messages API, with retry on rate limit and server errors. */
async function callAnthropic(body) {
  const key = getApiKey();
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': API_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.ok) return await res.json();

      const text = await res.text().catch(() => '');
      // 4xx other than 429 will not fix themselves on a retry.
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 400)}`);
      }
      lastError = new Error(`Anthropic API ${res.status}: ${text.slice(0, 200)}`);
    } catch (err) {
      if (err.name === 'AbortError') {
        lastError = new Error(`Anthropic API call timed out after ${REQUEST_TIMEOUT_MS}ms`);
      } else if (String(err.message || '').startsWith('Anthropic API 4')) {
        throw err;
      } else {
        lastError = err;
      }
    } finally {
      clearTimeout(timer);
    }

    if (attempt < MAX_RETRIES) await sleep(2000 * (attempt + 1));
  }

  throw lastError || new Error('Anthropic API call failed');
}

/**
 * Strip anything the model was told not to write but might anyway.
 * This is the structural half of the promise that the API never writes a
 * link, an image or a dash into the published file. Prices are deliberately
 * left alone: the QA checker validates them against the database.
 */
export function sanitiseProse(text) {
  let out = String(text == null ? '' : text);

  out = out
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')            // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')          // links, keep the text
    .replace(/<https?:\/\/[^>]*>/gi, '')              // autolinks
    .replace(/https?:\/\/\S+/gi, '')                  // bare URLs
    .replace(/\s*\u2014\s*/g, ', ')                   // em dash
    .replace(/\s*\u2013\s*/g, ', ')                   // en dash
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();

  return out;
}

function escapeAlt(name) {
  return String(name).replace(/[[\]]/g, '').replace(/"/g, '');
}

function escapeYamlDouble(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Assemble the finished post. Every price, image and link here comes from the
 * database row, never from the model.
 */
export function assembleMarkdown({ setName, mode, entries, prose, date, releaseDate, isUnreleased }) {
  const isExpensive = mode === 'expensive';

  const title = isExpensive
    ? `${setName} MTG: The 20 Most Expensive Cards`
    : `${setName} MTG: The 20 Most Played Commander Cards`;

  const top = entries[0];
  const description = isExpensive
    ? `The 20 most expensive cards in ${setName}, ranked on Australian dollar pricing, led by ${top.name} at AU$${top.price_aud.toFixed(2)}. Images and links to every card page.`
    : `The 20 most played ${setName} cards in Commander, ranked on EDHREC data, led by ${top.name}. Images, prices and links to every card page.`;

  const byName = new Map(
    (prose.entries || []).map(e => [slugify(e.name), sanitiseProse(e.blurb)])
  );

  const parts = [];

  parts.push('---');
  parts.push('layout: post');
  parts.push(`title: "${escapeYamlDouble(title)}"`);
  parts.push(`description: "${escapeYamlDouble(description)}"`);
  parts.push(`date: ${date}`);
  parts.push('category: news');
  parts.push('game: mtg');
  parts.push(`emoji: ${isExpensive ? '\u{1F4B0}' : '⚔️'}`);
  parts.push('tags: post');
  parts.push('affiliate_disclaimer: true');
  parts.push('---');
  parts.push('');
  parts.push(sanitiseProse(prose.intro));
  parts.push('');
  parts.push(isExpensive
    ? `## The 20 most expensive cards in ${setName}`
    : `## The 20 most played ${setName} cards in Commander`);

  entries.forEach((entry, i) => {
    const blurb = byName.get(slugify(entry.name)) || '';
    const priced = `AU$${entry.price_aud.toFixed(2)}`;

    parts.push('');
    parts.push(`**${i + 1}. ${entry.name} - ${priced}**`);
    parts.push('');
    if (entry.image_uri && entry.url) {
      parts.push(`[![${escapeAlt(entry.name)} Magic The Gathering card](${entry.image_uri})](https://cardsoncardsoncards.com.au${entry.url})`);
    } else if (entry.url) {
      parts.push(`[${entry.name}](https://cardsoncardsoncards.com.au${entry.url})`);
    }
    parts.push('');

    // The frame states the facts. The model's prose only sits alongside them.
    const facts = [];
    if (mode === 'played' && entry.edhrec_rank !== null) {
      facts.push(`EDHREC rank ${entry.edhrec_rank}`);
    }
    facts.push(entry.printing_count === 1
      ? 'a single printing in the set'
      : `${entry.printing_count} printings in the set`);
    if (entry.other_prices.length) {
      facts.push(`other printings at AU$${entry.other_prices.map(p => p.toFixed(2)).join(', AU$')}`);
    }

    parts.push(`${entry.name} sits at number ${i + 1} at ${priced}, with ${facts.join(', ')}.`);
    if (blurb) {
      parts.push('');
      parts.push(blurb);
    }
  });

  parts.push('');
  parts.push('## Frequently asked questions');
  for (const item of (prose.faq || [])) {
    const q = sanitiseProse(item.q);
    const a = sanitiseProse(item.a);
    if (!q || !a) continue;
    parts.push('');
    parts.push(`**${q.endsWith('?') ? q : q + '?'}**`);
    parts.push(a);
  }

  parts.push('');
  parts.push(`**Where can I buy ${setName} singles in Australia?**`);
  parts.push(
    `Every card above links through to its own page on our site, with current Australian pricing. You can also browse [${setName} MTG singles on eBay Australia](https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(setName + ' MTG')}&campid=5339146789&customid=${slugify(setName)}-${mode}&mkevt=1&mkcid=1&mkrid=705-53470-19255-0&toolid=10001).`
  );

  parts.push('');
  parts.push('---');
  parts.push('');
  parts.push('*This post contains affiliate links. If you buy through them, we may earn a small commission at no extra cost to you.*');
  parts.push('');
  parts.push('The C3 Team');
  parts.push('');

  return { markdown: parts.join('\n'), title, description, slug: slugify(title) };
}

/**
 * generatePost
 *
 * @param {object} data      a non-skipped result from set-card-data.mjs
 * @param {object} [opts]
 * @param {Array}  [opts.failures]        QA failures from the previous attempt
 * @param {object} [opts.previousAttempt] { wordCount } from the previous attempt
 * @param {string} [opts.date]            ISO date for the front matter
 * @param {string} [opts.releaseDate]
 * @param {Function} [opts.callModel]     injected for testing, bypasses the network
 * @returns {Promise<{markdown, title, description, slug, prose, usage}>}
 */
export async function generatePost(data, opts = {}) {
  const { setName, mode, entries } = data;
  if (!entries || entries.length === 0) {
    throw new Error(`No entries to write about for "${setName}" (${mode})`);
  }

  const releaseDate = opts.releaseDate || entries[0].released_at || null;
  const isUnreleased = releaseDate
    ? new Date(releaseDate) > new Date(opts.date || new Date().toISOString().slice(0, 10))
    : false;

  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(),
    tools: [buildTool(entries.length)],
    tool_choice: { type: 'tool', name: 'emit_post' },
    messages: [{
      role: 'user',
      content: buildUserPrompt({
        setName, mode, entries, releaseDate, isUnreleased,
        failures: opts.failures,
        previousAttempt: opts.previousAttempt,
      }),
    }],
  };

  const callModel = opts.callModel || callAnthropic;
  const response = await callModel(body);

  const block = (response.content || []).find(b => b.type === 'tool_use' && b.name === 'emit_post');
  if (!block) {
    throw new Error('Model did not return an emit_post tool call');
  }
  let prose = block.input;

  // Belt and braces behind strict mode: if the payload arrives wrapped in a
  // single container key, unwrap it rather than throwing away a whole attempt.
  if (prose && !Array.isArray(prose.entries)) {
    const keys = Object.keys(prose);
    if (keys.length === 1 && prose[keys[0]] && Array.isArray(prose[keys[0]].entries)) {
      prose = prose[keys[0]];
    }
  }

  if (!prose || !Array.isArray(prose.entries)) {
    throw new Error(
      'emit_post returned no entries array (top level keys: ' +
      JSON.stringify(Object.keys(block.input || {})) + ')'
    );
  }

  const assembled = assembleMarkdown({
    setName, mode, entries, prose,
    date: opts.date || new Date().toISOString().slice(0, 10),
    releaseDate, isUnreleased,
  });

  return { ...assembled, prose, usage: response.usage || null };
}

export default generatePost;
