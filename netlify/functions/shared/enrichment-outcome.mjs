// C3L-66. The per-set decision for the pokemon enrichment backfill, pulled out as a pure
// function so it can be tested rather than read.
//
// WHY THIS EXISTS SEPARATELY
// The first version of the backfill conflated "processed" with "done". Any set it looked at got
// a progress row, which permanently removed it from the queue. On the very first real run that
// burned five sets: Crown Zenith matched pokemontcg.io but enriched 0 of its 48 cards, and XY
// Steam Siege (152 cards) and Base Set (8 cards) failed to resolve upstream at all. All three
// were recorded as finished having done nothing, and would never have been retried.
//
// The distinction this function encodes:
//   DONE      the set genuinely needs nothing more. Either cards were enriched, or the set has
//             no cards in pokemon_cards at all, which is a real no-op rather than a failure.
//   RETRY     the set was attempted and not enriched despite having cards to enrich. Recorded
//             so the queue advances, but flagged so it comes back.
//   SKIPPED   the attempt threw, usually an upstream error. Recorded as a retry too, because a
//             set that cannot be reached must not block the ones behind it.
//
// Recording an attempt even on failure is deliberate. Leaving a failed set unrecorded would
// keep it at the front of the queue forever, so a single unreachable set would starve every set
// behind it. That is a worse failure than the one being fixed.
//
// MAX_ATTEMPTS bounds the retrying: after this many unsuccessful attempts a set stops being
// prioritised and falls back into the ordinary oldest-first rotation. It still gets retried,
// just not ahead of everything else. That matters for the set-matching gap logged as C3L-67,
// where some sets will fail every time until their names are mapped properly.
export const MAX_ATTEMPTS = 3;

export function classifySetOutcome({ ptcgSetId, cardsInSet, cardsEnriched, error }) {
  if (error) {
    return {
      record: true,
      needsRetry: true,
      cardsUpdated: 0,
      lastError: String(error).slice(0, 300),
      reason: 'attempt threw, recorded as a retry so it does not block the queue'
    };
  }
  if (!ptcgSetId) {
    // No upstream counterpart. If the set holds no cards that is fine and final. If it holds
    // cards, this is the Steam Siege case and must not be treated as finished.
    return cardsInSet > 0
      ? { record: true, needsRetry: true, cardsUpdated: 0,
          lastError: 'no pokemontcg.io set match',
          reason: 'has cards but could not be resolved upstream, so not done' }
      : { record: true, needsRetry: false, cardsUpdated: 0, lastError: null,
          reason: 'no upstream match and no cards to enrich, genuinely nothing to do' };
  }
  if (cardsInSet === 0) {
    return { record: true, needsRetry: false, cardsUpdated: 0, lastError: null,
             reason: 'no cards in this set, nothing to enrich' };
  }
  if (cardsEnriched === 0) {
    // This is the Crown Zenith case: the set resolved, stats came back, and not one card
    // matched on the name and number key. Previously indistinguishable from success.
    return { record: true, needsRetry: true, cardsUpdated: 0,
             lastError: 'set matched upstream but 0 of ' + cardsInSet + ' cards matched on name and number',
             reason: 'set resolved but nothing matched, so not done' };
  }
  return { record: true, needsRetry: false, cardsUpdated: cardsEnriched, lastError: null,
           reason: 'enriched' };
}

// Queue order. Never attempted first, then sets still worth retrying, then oldest attempt
// first. A set past MAX_ATTEMPTS drops out of the retry band so it cannot hold the front of
// the queue indefinitely.
export function orderQueue(sets) {
  const rank = (s) => {
    if (!s.progress) return 0;
    if (s.progress.needs_retry && (s.progress.attempts || 0) < MAX_ATTEMPTS) return 1;
    return 2;
  };
  return sets.slice().sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return a.id - b.id;
    const ta = a.progress?.backfilled_at || '';
    const tb = b.progress?.backfilled_at || '';
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.id - b.id;
  });
}
