// scripts/generate-set-blog-posts.mjs
// Phase 4 of the MTG set blog generator: the orchestrator.
//
// For each set, for each mode:
//   1. pull the real top 20 from set-card-data.mjs
//   2. generate the prose with generate-post.mjs
//   3. QA it with qa-check.mjs
//   4. on pass, write src/blog/pNNN-<slug>.md
//   5. on fail, regenerate with the specific failures fed back, up to 3 attempts
//   6. still failing after 3, record it in needs-review.json and move on
//
// Only fully passing posts are ever written. This script never runs git.
//
//   node --env-file=.env scripts/generate-set-blog-posts.mjs --pilot
//   node --env-file=.env scripts/generate-set-blog-posts.mjs --all
//   node --env-file=.env scripts/generate-set-blog-posts.mjs --pilot --dry-run

import { readdirSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { getSetCardData, listMainlineSets, MIN_PRICED_NAMES } from './lib/set-card-data.mjs';
import { generatePost, slugify } from './lib/generate-post.mjs';
import { qaCheck, buildVocabulary } from './lib/qa-check.mjs';

const BLOG_DIR = 'src/blog';
const NEEDS_REVIEW = 'needs-review.json';
const MAX_ATTEMPTS = 3;
const MODES = ['expensive', 'played'];

// p619, p620 and p621 already exist in the main c3-website repo (the Hobbit
// top 20, Reality Fracture and Star Trek), but not in this worktree's
// src/blog, which stops at p618. Numbering from the local maximum alone would
// mint p619 and collide with them, so the floor is set explicitly.
const MIN_POST_NUMBER = 622;

const PILOT_SETS = ['The Hobbit', 'Secrets of Strixhaven', 'Lorwyn Eclipsed'];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Highest pNNN currently in src/blog, floored at MIN_POST_NUMBER.
 * Read once at startup, then incremented in memory, so a run that writes
 * several posts does not have to re-scan the directory each time.
 */
function findStartNumber() {
  let highest = 0;
  if (existsSync(BLOG_DIR)) {
    for (const file of readdirSync(BLOG_DIR)) {
      const m = file.match(/^p(\d+)-/);
      if (m) highest = Math.max(highest, Number(m[1]));
    }
  }
  return Math.max(highest + 1, MIN_POST_NUMBER);
}

/**
 * Reference vocabulary for the advisory suspect-word check, built once from the
 * posts already in src/blog. Read before any new post is written, so a new
 * post's own typos can never vouch for themselves.
 */
function buildBlogVocabulary() {
  if (!existsSync(BLOG_DIR)) return new Set();
  const texts = [];
  for (const file of readdirSync(BLOG_DIR)) {
    if (!file.endsWith('.md')) continue;
    try {
      texts.push(readFileSync(`${BLOG_DIR}/${file}`, 'utf8'));
    } catch { /* unreadable file is not worth failing a run over */ }
  }
  return buildVocabulary(texts);
}

function loadNeedsReview() {
  if (!existsSync(NEEDS_REVIEW)) return [];
  try {
    const parsed = JSON.parse(readFileSync(NEEDS_REVIEW, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Record a three-strike failure to disk the moment it happens.
 *
 * This used to be written once, after the whole loop finished. A full run was
 * killed at 129 of 141 sets and took the entire in-memory failure record with
 * it, which is exactly the information you most want after an interrupted run.
 * Appending per failure means a kill can never erase what already failed.
 */
function appendNeedsReview(entry) {
  const existing = loadNeedsReview();
  existing.push(entry);
  writeFileSync(NEEDS_REVIEW, JSON.stringify(existing, null, 2), 'utf8');
}

/**
 * Has a post for this set and mode already been written?
 *
 * The filename is p<NNN>-<slug>.md and the slug is derived deterministically
 * from the set name and mode, so the same set and mode always resolves to the
 * same slug. That makes the run resumable and idempotent: re-running after an
 * interruption skips what exists rather than duplicating it under new numbers.
 */
function existingPostFor(setName, mode) {
  if (!existsSync(BLOG_DIR)) return null;
  const slug = expectedSlug(setName, mode);
  const suffix = `-${slug}.md`;
  for (const file of readdirSync(BLOG_DIR)) {
    if (file.endsWith(suffix)) return file;
  }
  return null;
}

function expectedSlug(setName, mode) {
  const title = mode === 'expensive'
    ? `${setName} MTG: The 20 Most Expensive Cards`
    : `${setName} MTG: The 20 Most Played Commander Cards`;
  return slugify(title);
}

/**
 * Build one post, QA it, and retry up to MAX_ATTEMPTS with the specific
 * failures handed back to the model each time.
 *
 * @returns {{status:'written'|'skipped'|'failed', attempts:number, ...}}
 */
async function buildOne(setName, mode, opts) {
  const label = `${setName} [${mode}]`;

  // Resume support: if this set and mode already has a post on disk, leave it
  // alone. Without this, re-running after an interruption regenerates every
  // completed set and duplicates it under a fresh number.
  if (!opts.force) {
    const already = existingPostFor(setName, mode);
    if (already) {
      console.log(`  HAVE  ${label}: ${already}`);
      return { status: 'exists', attempts: 0, filename: already };
    }
  }

  const data = await getSetCardData(setName, mode, opts.setCode);

  if (data.skipped) {
    console.log(`  SKIP  ${label}: ${data.skipReason}`);
    return { status: 'skipped', attempts: 0, reason: data.skipReason };
  }
  if (mode === 'expensive' && data.entries.length < MIN_PRICED_NAMES) {
    const reason = `only ${data.entries.length} priced cards, need at least ${MIN_PRICED_NAMES}`;
    console.log(`  SKIP  ${label}: ${reason}`);
    return { status: 'skipped', attempts: 0, reason };
  }

  let failures = null;
  let previousAttempt = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let post;
    try {
      post = await generatePost(data, {
        failures,
        previousAttempt,
        date: opts.date,
        callModel: opts.callModel,
      });
    } catch (err) {
      console.log(`  ERR   ${label} attempt ${attempt}: ${err.message}`);
      failures = [{ check: 'generation_error', detail: err.message }];
      previousAttempt = null;
      if (attempt === MAX_ATTEMPTS) {
        return { status: 'failed', attempts: attempt, failures };
      }
      await sleep(2000);
      continue;
    }

    const qa = qaCheck(post.markdown, data.entries, { vocabulary: opts.vocabulary });

    if (qa.pass) {
      const number = opts.nextNumber();
      const filename = `p${number}-${post.slug}.md`;
      const path = `${BLOG_DIR}/${filename}`;

      if (!opts.dryRun) {
        mkdirSync(BLOG_DIR, { recursive: true });
        writeFileSync(path, post.markdown, 'utf8');
      }

      console.log(
        `  OK    ${label} attempt ${attempt}: ${opts.dryRun ? 'would write' : 'wrote'} ${filename} ` +
        `(${qa.info.words} words, ${qa.info.entries} entries, ${qa.info.faq} FAQ)`
      );
      return { status: 'written', attempts: attempt, filename, path, markdown: post.markdown, info: qa.info };
    }

    const summary = qa.failures.map(f => f.check).join(', ');
    console.log(`  FAIL  ${label} attempt ${attempt}: ${summary}`);
    for (const f of qa.failures) {
      console.log(`          [${f.check}] ${f.detail.slice(0, 160)}`);
    }

    failures = qa.failures;
    previousAttempt = { wordCount: qa.info.words };
    if (attempt < MAX_ATTEMPTS) await sleep(1000);
  }

  return { status: 'failed', attempts: MAX_ATTEMPTS, failures };
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const runAll = argv.includes('--all');

  // --dry-run swaps the network call for a deterministic local stub so the
  // wiring can be exercised without spending tokens.
  let callModel;
  if (dryRun) {
    const { makeStub } = await import('./lib/dry-run-stub.mjs');
    callModel = makeStub();
  }

  let targets;
  if (runAll) {
    const sets = await listMainlineSets();
    targets = sets.map(s => ({ setName: s.set_name, setCode: s.set_code }));
    console.log(`Running against all ${targets.length} mainline sets (expansion + core).`);
  } else {
    targets = PILOT_SETS.map(name => ({ setName: name, setCode: undefined }));
    console.log(`Pilot run: ${PILOT_SETS.join(', ')}`);
  }

  let counter = findStartNumber();
  const vocabulary = buildBlogVocabulary();
  console.log(`Post numbering starts at p${counter}.${dryRun ? '  DRY RUN, nothing will be written.' : ''}`);
  console.log(`Reference vocabulary: ${vocabulary.size} distinct words from the existing posts.\n`);

  const opts = {
    dryRun,
    callModel,
    vocabulary,
    date: new Date().toISOString().slice(0, 10),
    nextNumber: () => counter++,
  };

  const written = [];
  const existing = [];
  const skipped = [];
  const failed = [];
  const attemptCounts = { 1: 0, 2: 0, 3: 0 };

  for (const target of targets) {
    console.log(`${target.setName}`);
    for (const mode of MODES) {
      let result;
      try {
        result = await buildOne(target.setName, mode, { ...opts, setCode: target.setCode });
      } catch (err) {
        console.log(`  ERR   ${target.setName} [${mode}]: ${err.message}`);
        result = { status: 'failed', attempts: 0, failures: [{ check: 'fatal', detail: err.message }] };
      }

      if (result.status === 'written') {
        written.push({ setName: target.setName, mode, ...result });
        attemptCounts[result.attempts] += 1;
      } else if (result.status === 'exists') {
        existing.push({ setName: target.setName, mode, filename: result.filename });
      } else if (result.status === 'skipped') {
        skipped.push({ setName: target.setName, mode, reason: result.reason });
      } else {
        const entry = {
          set: target.setName,
          mode,
          attempts: result.attempts,
          failures: result.failures || [],
        };
        failed.push(entry);
        // Written immediately, not at the end of the run.
        if (!dryRun) appendNeedsReview(entry);
      }
    }
  }

  // needs-review.json was already written per failure, above.

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`posts written:        ${written.length}`);
  console.log(`  first attempt:      ${attemptCounts[1]}`);
  console.log(`  second attempt:     ${attemptCounts[2]}`);
  console.log(`  third attempt:      ${attemptCounts[3]}`);
  console.log(`already on disk:      ${existing.length}`);
  console.log(`skipped (data rules): ${skipped.length}`);
  console.log(`needs review:         ${failed.length}`);

  if (written.length) {
    console.log('\nwritten:');
    for (const w of written) {
      console.log(`  ${w.filename}  (${w.info.words} words, attempt ${w.attempts})`);
    }
  }

  // Advisory, not a gate. Nothing here blocked or retried a post.
  const flagged = written.filter(w => (w.info.suspect_words || []).length);
  console.log('\nworth a glance (advisory only, did not fail anything):');
  if (!flagged.length) {
    console.log('  nothing flagged');
  } else {
    for (const w of flagged) {
      console.log(`  ${w.filename}: ${w.info.suspect_words.join(', ')}`);
    }
  }
  if (skipped.length) {
    console.log('\nskipped:');
    for (const s of skipped) console.log(`  ${s.setName} [${s.mode}]: ${s.reason}`);
  }
  if (failed.length) {
    console.log('\nneeds review:');
    for (const f of failed) {
      console.log(`  ${f.set} [${f.mode}] after ${f.attempts} attempts: ${f.failures.map(x => x.check).join(', ')}`);
    }
    if (!dryRun) console.log(`\nrecorded in ${NEEDS_REVIEW}`);
  }

  return written;
}

const invokedDirectly =
  process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/generate-set-blog-posts.mjs');

if (invokedDirectly) {
  await main();
}

export { main, findStartNumber, buildOne };
