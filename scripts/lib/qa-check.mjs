// scripts/lib/qa-check.mjs
// Phase 2 of the MTG set blog generator.
//
// qaCheck(markdown, sourceData) -> { pass, failures: [{ check, detail }] }
//
// `markdown` is the fully assembled post, front matter included.
// `sourceData` is the array of real entries from set-card-data.mjs. It is what
// makes the price and completeness checks possible: the checker never trusts a
// number written in prose, it only trusts the database figures passed in here.
//
// Pass sourceData as null or an empty array for a post that is not a top 20
// list. The three entry dependent checks then report as skipped rather than
// failed, because they have nothing to check against.
//
// This module is pure. It reads no files and makes no network calls.

// Banned words, per the spec plus the repo's own house style. Matched on word
// boundaries so "vital" does not fire inside "vitality".
export const BANNED_WORDS = [
  'straightforward', 'elevate', 'robust', 'comprehensive', 'leverage',
  'delve', 'unlock', 'seamless', 'tapestry', 'vital', 'crucial',
  'game-changer', 'dive in', 'furthermore', 'moreover',
];

export const REQUIRED_FRONT_MATTER = [
  'layout', 'title', 'description', 'date',
  'category', 'game', 'emoji', 'tags', 'affiliate_disclaimer',
];

export const MIN_WORDS = 1000;
export const MIN_FAQ = 5;

// Written as escapes on purpose. This file has to contain these characters to
// detect them, and a literal would make the checker itself fail the repo's own
// no-dash scan over changed lines.
const EM_DASH = '\u2014';
const EN_DASH = '\u2013';

/** Split a post into its raw front matter block and its body. */
export function splitFrontMatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontMatterRaw: null, body: markdown };
  return {
    frontMatterRaw: match[1],
    body: markdown.slice(match[0].length),
  };
}

/**
 * Deliberately forgiving parser. Front matter here is hand written and only
 * ever flat key: value pairs, so a full YAML dependency would be overkill.
 */
export function parseFrontMatter(raw) {
  const out = {};
  if (!raw) return out;

  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    // Strip one layer of matching quotes.
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

/**
 * Count prose words. Images contribute nothing (alt text is not prose), link
 * text counts but the URL does not, and markdown punctuation is dropped.
 */
export function countWords(body) {
  const prose = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')      // images, alt text and all
    .replace(/\[([^\]]*)\]\([^)]*\)/g, ' $1 ')  // links keep their text only
    .replace(/`[^`]*`/g, ' ')                   // inline code
    .replace(/^\s{0,3}#{1,6}\s+/gm, ' ')        // heading markers
    .replace(/[*_>#|]/g, ' ')                   // leftover markdown punctuation
    .replace(/^\s*[-=]{3,}\s*$/gm, ' ');        // horizontal rules

  return prose.split(/\s+/).filter(Boolean).length;
}

/** Normalise a card name so punctuation differences do not cause false misses. */
function normaliseName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/\s*\/\/\s*/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Parse "AU$1,234.56" style amounts into numbers. */
function extractPrices(text) {
  const out = [];
  const re = /AU\$\s*([\d,]+(?:\.\d{1,2})?)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * Split the body into numbered entry blocks.
 * An entry heading is a bolded line starting with a number and a full stop,
 * which is the format the generator emits and the format the existing hand
 * written posts already use.
 */
export function parseEntryBlocks(body) {
  const headingRe = /^\*\*\s*(\d+)\.\s*(.+?)\*\*\s*$/gm;
  const heads = [];
  let m;

  while ((m = headingRe.exec(body)) !== null) {
    heads.push({ rank: Number(m[1]), headingText: m[2].trim(), start: m.index, headEnd: headingRe.lastIndex });
  }

  // An entry block ends at the next entry heading, or at the next section
  // heading, whichever comes first. Without the section heading boundary the
  // final entry would swallow the FAQ and the sign off, and every price quoted
  // in the FAQ would be attributed to the last card on the list.
  const sectionRe = /^\s{0,3}#{2,6}\s+/gm;
  const sectionStarts = [];
  let s;
  while ((s = sectionRe.exec(body)) !== null) sectionStarts.push(s.index);

  return heads.map((h, i) => {
    const nextHead = i + 1 < heads.length ? heads[i + 1].start : body.length;
    const nextSection = sectionStarts.find(pos => pos >= h.headEnd);
    const end = nextSection !== undefined ? Math.min(nextHead, nextSection) : nextHead;
    // The name is everything before the price separator in the heading.
    const name = h.headingText
      .replace(/\s*[-\u2013\u2014:]\s*AU\$[\d,.]+\s*$/, '')
      .trim();
    return {
      rank: h.rank,
      name,
      headingText: h.headingText,
      block: body.slice(h.headEnd, end),
      full: body.slice(h.start, end),
    };
  });
}

/** Find the FAQ section and count bolded question lines that have an answer. */
export function parseFaq(body) {
  const headingRe = /^\s{0,3}#{2,4}\s+.*(faq|frequently asked).*$/im;
  const m = body.match(headingRe);
  if (!m) return { found: false, count: 0 };

  const start = body.indexOf(m[0]) + m[0].length;
  // The FAQ runs to the next same-or-higher level heading, or to the end.
  const rest = body.slice(start);
  const nextHeading = rest.match(/^\s{0,3}#{2,4}\s+/m);
  const section = nextHeading ? rest.slice(0, nextHeading.index) : rest;

  const qRe = /^\s*\*\*(.+?)\*\*\s*$/gm;
  let q;
  let count = 0;
  while ((q = qRe.exec(section)) !== null) {
    const question = q[1].trim();
    if (!question.endsWith('?')) continue;
    // An answer must follow, before the next bolded question.
    const after = section.slice(qRe.lastIndex);
    const answer = after.split(/^\s*\*\*.+?\*\*\s*$/m)[0];
    if (answer && answer.trim().length > 0) count += 1;
  }

  return { found: true, count };
}

// Spelled-out counts as well as digits. The generator writes digits into the
// title, but the same claim is written as a word in prose and in a few hand
// written posts, so both forms are recognised.
const NUMBER_WORDS = new Map([
  ['one', 1], ['two', 2], ['three', 3], ['four', 4], ['five', 5],
  ['six', 6], ['seven', 7], ['eight', 8], ['nine', 9], ['ten', 10],
  ['eleven', 11], ['twelve', 12], ['thirteen', 13], ['fourteen', 14],
  ['fifteen', 15], ['sixteen', 16], ['seventeen', 17], ['eighteen', 18],
  ['nineteen', 19], ['twenty', 20], ['thirty', 30], ['forty', 40], ['fifty', 50],
]);

/**
 * Pull the list length a piece of headline text claims, or null if it claims
 * none. Anchored on "<number> most", which is the only shape this generator
 * emits ("The 20 Most Expensive Cards").
 *
 * Anchoring matters. A bare \d+ would read "Magic 2015 MTG: The 20 Most
 * Expensive Cards" as a claim of 2015, and "Core Set 2020" as 2020. Requiring
 * the word "most" immediately after means only the actual claim matches.
 *
 * Returning null for "The Most Expensive Cards" is deliberate, not a miss: a
 * title with no number promises no particular length, so there is nothing to
 * contradict. That is exactly the shape the five repaired posts now have.
 */
export function extractClaimedCount(text) {
  if (!text) return null;
  const words = [...NUMBER_WORDS.keys()].join('|');
  const m = String(text).match(new RegExp(`\\b(\\d{1,3}|${words})\\s+most\\b`, 'i'));
  if (!m) return null;
  const token = m[1].toLowerCase();
  return /^\d+$/.test(token) ? Number(token) : NUMBER_WORDS.get(token);
}

/**
 * qaCheck
 *
 * @param {string} markdown  the assembled post, front matter included
 * @param {Array|null} sourceData  the real entries from set-card-data.mjs
 * @returns {{pass: boolean, failures: Array<{check: string, detail: string}>, info: object}}
 */
/**
 * Build a reference vocabulary from existing prose.
 *
 * There is no dictionary available offline, so the site's own back catalogue
 * stands in for one: a long word that appears nowhere across ~600 published
 * posts, and is not a card name, is probably not a word. This is a smell test,
 * never a gate.
 */
export function buildVocabulary(texts) {
  const vocab = new Set();
  for (const text of texts) {
    const words = String(text).toLowerCase().match(/[a-z]+/g) || [];
    for (const w of words) vocab.add(w);
  }
  return vocab;
}

/**
 * Blank out every card name in the post, longest first so a longer name is
 * consumed before a shorter one nested inside it. Used only for the banned
 * word scan: a real card name is not editorial copy and cannot be rewritten.
 */
function maskCardNames(text, sourceData) {
  if (!Array.isArray(sourceData) || sourceData.length === 0) return text;

  const names = sourceData
    .map(e => String(e.name || ''))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  let out = text;
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'gi'), ' ');
  }
  return out;
}

const SUSPECT_MIN_LENGTH = 11;

/**
 * Advisory only. Returns long words in the prose that the reference vocabulary
 * has never seen and that are not part of a card name, so a malformed token
 * like "nintheighth" is visible to a human without failing the post.
 */
function findSuspectWords(body, sourceData, vocabulary) {
  if (!vocabulary || vocabulary.size === 0) return [];

  // Strip images, links and URLs first, or every scryfall host and slug shows
  // up as an unknown word.
  const prose = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, ' $1 ')
    .replace(/https?:\/\/\S+/gi, ' ');

  const allowed = new Set();
  for (const entry of (sourceData || [])) {
    for (const w of String(entry.name).toLowerCase().match(/[a-z]+/g) || []) {
      allowed.add(w);
    }
  }

  const seen = new Set();
  const suspect = [];
  for (const w of prose.toLowerCase().match(/[a-z]+/g) || []) {
    if (w.length < SUSPECT_MIN_LENGTH) continue;
    if (vocabulary.has(w) || allowed.has(w) || seen.has(w)) continue;
    seen.add(w);
    suspect.push(w);
  }
  return suspect;
}

export function qaCheck(markdown, sourceData, opts = {}) {
  const failures = [];
  const fail = (check, detail) => failures.push({ check, detail });

  const { frontMatterRaw, body } = splitFrontMatter(markdown);
  const frontMatter = parseFrontMatter(frontMatterRaw);
  const entries = parseEntryBlocks(body);
  const hasSource = Array.isArray(sourceData) && sourceData.length > 0;
  const skipped = [];

  // --- 1. word_count -------------------------------------------------
  const words = countWords(body);
  if (words < MIN_WORDS) {
    fail('word_count', `post body is ${words} words, need at least ${MIN_WORDS}`);
  }

  // --- 6. front_matter_valid ----------------------------------------
  if (!frontMatterRaw) {
    fail('front_matter_valid', 'no front matter block found at the top of the post');
  } else {
    const missing = REQUIRED_FRONT_MATTER.filter(
      k => !(k in frontMatter) || String(frontMatter[k]).trim() === ''
    );
    if (missing.length) {
      fail('front_matter_valid', `missing or empty: ${missing.join(', ')}`);
    }
  }

  // --- 4. faq_count --------------------------------------------------
  const faq = parseFaq(body);
  if (!faq.found) {
    fail('faq_count', 'no FAQ heading found in the post');
  } else if (faq.count < MIN_FAQ) {
    fail('faq_count', `found ${faq.count} question and answer pairs under the FAQ heading, need at least ${MIN_FAQ}`);
  }

  // --- 5. no_banned_content -----------------------------------------
  const emCount = (body.match(new RegExp(EM_DASH, 'g')) || []).length;
  const enCount = (body.match(new RegExp(EN_DASH, 'g')) || []).length;

  if (emCount > 0) {
    const sample = firstLineContaining(body, EM_DASH);
    fail('no_banned_content', `${emCount} em dash character(s) present, first at: "${sample}"`);
  }
  if (enCount > 0) {
    const sample = firstLineContaining(body, EN_DASH);
    fail('no_banned_content', `${enCount} en dash character(s) present, first at: "${sample}"`);
  }

  // Report the sentence each banned word sits in, not just that one exists
  // somewhere in 1900 words. A bare "straightforward (x1)" gives a rewrite
  // nothing to find, which is exactly how one pilot post burned all three
  // attempts on the same word.
  // Card names are masked out first. Wizards prints cards called things like
  // "Nissa, Vital Force", and the generator writes that name into the entry
  // heading and the frame sentence itself. Scanning the raw body flags the
  // script's own output as banned copy, which no rewrite by the model can fix:
  // Kaladesh burned all three attempts on exactly this and produced no post.
  // URLs and image tags are stripped before the scan as well as card names.
  // A card page link carries the slugified card name ("nissa-vital-force"),
  // which the name mask does not match and which is not editorial copy either.
  // Link text is kept, since that IS prose.
  const scanBody = maskCardNames(
    body
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, ' $1 ')
      .replace(/https?:\/\/\S+/gi, ' '),
    sourceData
  );

  const hits = [];
  for (const word of BANNED_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^A-Za-z0-9])(${escaped})([^A-Za-z0-9]|$)`, 'gi');
    let m;
    while ((m = re.exec(scanBody)) !== null) {
      const at = m.index + m[1].length;
      hits.push({ word, sentence: sentenceAround(scanBody, at) });
      if (m.index === re.lastIndex) re.lastIndex += 1;
    }
  }
  if (hits.length) {
    fail(
      'no_banned_content',
      hits.map(h => `"${h.word}" appears in this sentence, rewrite it: "${h.sentence}"`).join(' ; ')
    );
  }

  // --- 2. entries_complete ------------------------------------------
  if (!hasSource) {
    skipped.push('entries_complete');
  } else {
    const expected = sourceData.length;
    if (entries.length !== expected) {
      fail('entries_complete', `parsed ${entries.length} numbered entries, expected ${expected}`);
    }

    const problems = [];
    for (const entry of entries) {
      const missing = [];
      if (!/!\[[^\]]*\]\([^)]*\)/.test(entry.full)) missing.push('image');
      if (!entry.full.includes('/cards/mtg/')) missing.push('card link');
      if (extractPrices(entry.full).length === 0) missing.push('price');
      if (missing.length) {
        problems.push(`#${entry.rank} ${entry.name}: no ${missing.join(', no ')}`);
      }
    }
    if (problems.length) {
      fail('entries_complete', problems.join('; '));
    }
  }

  // --- 3. price_accuracy --------------------------------------------
  if (!hasSource) {
    skipped.push('price_accuracy');
  } else {
    const byName = new Map(sourceData.map(e => [normaliseName(e.name), e]));
    const mismatches = [];
    const unmatched = [];

    for (const entry of entries) {
      const source = byName.get(normaliseName(entry.name));
      if (!source) {
        unmatched.push(`#${entry.rank} "${entry.name}" is not in the source data`);
        continue;
      }

      // Every price the database actually knows for this card: the headline
      // figure plus each of the other printings. A blurb is allowed to quote
      // any of them, and nothing else.
      const allowed = [source.price_aud, ...(source.other_prices || [])]
        .filter(p => p !== null && p !== undefined)
        .map(p => Number(p.toFixed(2)));

      for (const written of extractPrices(entry.full)) {
        const rounded = Number(written.toFixed(2));
        if (!allowed.some(a => Math.abs(a - rounded) < 0.005)) {
          mismatches.push(
            `#${entry.rank} ${entry.name}: post says AU$${written.toFixed(2)}, ` +
            `real price${allowed.length > 1 ? 's' : ''} AU$${allowed.map(a => a.toFixed(2)).join(' / AU$')}`
          );
        }
      }
    }

    if (unmatched.length) fail('price_accuracy', unmatched.join('; '));
    if (mismatches.length) fail('price_accuracy', mismatches.join('; '));
  }

  // --- 7. distinct_entries ------------------------------------------
  if (!hasSource) {
    skipped.push('distinct_entries');
  } else {
    const seen = new Map();
    const dupes = [];
    for (const entry of entries) {
      const key = normaliseName(entry.name);
      if (seen.has(key)) {
        dupes.push(`"${entry.name}" appears at #${seen.get(key)} and #${entry.rank}`);
      } else {
        seen.set(key, entry.rank);
      }
    }
    if (dupes.length) {
      fail('distinct_entries', dupes.join('; '));
    }
  }

  // --- 8. claimed_count_matches -------------------------------------
  // The generator hardcodes the list length into the title, the description
  // and the list heading, but emits only the rows the source data actually
  // has. When a set's price or EDHREC coverage is thin those two numbers
  // diverge, and nothing here compared them: entries_complete measures the
  // body against sourceData, so a post claiming twenty and emitting eight
  // matched its source perfectly and passed clean. Five posts shipped to a
  // branch that way (Reality Fracture x2 at 11, Summer Magic / Edgar at 19,
  // Star Trek x2 at 8) and were caught by hand at review, not by this file.
  //
  // Unlike checks 2, 3 and 7 this one needs no sourceData: it compares the
  // post against itself, so it still runs for a hand written post.
  // Title and description only, deliberately NOT section headings. A post is
  // allowed to break its list into sub-sections that each describe a slice:
  // p619 runs "## The five most expensive cards in the set", "## Numbers 6 to
  // 12", "## Numbers 13 to 20" over a correct 20 entry body. Reading the first
  // of those as the list's own heading flagged a post that was right, and a
  // check that cries wolf is worse than no check here, per C3L-76.
  const claims = [
    ['title', frontMatter.title],
    ['description', frontMatter.description],
  ];

  const countMismatches = [];
  let titleClaim = null;
  for (const [where, text] of claims) {
    const claimed = extractClaimedCount(text);
    if (where === 'title') titleClaim = claimed;
    if (claimed === null) continue;
    if (claimed !== entries.length) {
      countMismatches.push(`${where} claims ${claimed}, body emits ${entries.length}`);
    }
  }

  if (countMismatches.length) {
    // A post that parses to zero entries and claims a number is still a real
    // failure, not a skip: the headline promises a list the body does not have.
    fail('claimed_count_matches', countMismatches.join('; '));
  } else if (entries.length === 0) {
    // Nothing numbered was parsed and nothing was claimed, so this is not a
    // list post and there is no pair of numbers to compare.
    skipped.push('claimed_count_matches');
  }

  // Advisory only. Deliberately not pushed through fail(), so it can never
  // block a post or burn a retry attempt.
  const suspectWords = findSuspectWords(body, sourceData, opts.vocabulary);

  return {
    pass: failures.length === 0,
    failures,
    info: {
      words,
      entries: entries.length,
      title_claim: titleClaim,
      faq: faq.count,
      em_dashes: emCount,
      en_dashes: enCount,
      checks_skipped: skipped,
      suspect_words: suspectWords,
    },
  };
}

/**
 * Pull the sentence surrounding a character offset, so a failure can point at
 * the exact wording that needs changing rather than at the whole post.
 */
function sentenceAround(text, index, maxLength = 200) {
  let start = index;
  while (start > 0 && !/[.!?\n]/.test(text[start - 1])) start -= 1;

  let end = index;
  while (end < text.length && !/[.!?\n]/.test(text[end])) end += 1;
  if (end < text.length) end += 1;

  const sentence = text.slice(start, end).trim().replace(/\s+/g, ' ');
  return sentence.length > maxLength ? sentence.slice(0, maxLength) + '...' : sentence;
}

function firstLineContaining(text, needle) {
  const line = text.split(/\r?\n/).find(l => l.includes(needle)) || '';
  return line.trim().slice(0, 90);
}

export default qaCheck;
