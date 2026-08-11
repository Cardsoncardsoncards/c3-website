// netlify/functions/shared/failure-summary.mjs
//
// One definition of "turn a list of failed sets into the sentence that goes in
// sync_events.error_message".
//
// WHY (C3L-170). The first version of the C3L-168 summary was
// `failedSets.slice(0, 5).join(' | ')`, which truncates by ARRIVAL ORDER. That is the wrong
// axis. On the 11 August weissschwarz run there were 170 failures: 169 were the same
// same-day re-run artefact (23505 on the snapshot unique index) and ONE was the genuinely
// broken set, `hololive production Premium Booster`, failing with 22003. The five shown were
// all the boring one, so the interesting failure was invisible in the very field added to make
// failures visible.
//
// Grouping by error instead means a crowd of identical failures collapses to one line with a
// count, and a lone unusual failure always gets its own line no matter where it arrived. The
// number of DISTINCT errors is small even when the number of failures is not, which is exactly
// the property truncation needed and did not have.

const MAX_KINDS      = 8;    // distinct error kinds to name before saying "and N more"
const MAX_EXAMPLE    = 160;  // characters of one representative failure per kind
const MAX_TOTAL      = 480;  // sync_events.error_message is sliced to 500 by the writers

/**
 * Reduce a failure string to what makes it the SAME KIND of failure as another.
 *
 * Prefers the SQLSTATE, because that is the stable identity of a database failure and is what
 * distinguishes 23505 from 22003. Falls back to the message text with digits and quoted values
 * stripped, so "set A: timeout after 20000ms" and "set B: timeout after 20000ms" group, while a
 * genuinely different message does not.
 */
export function failureKind(failure) {
  const text = String(failure == null ? '' : failure);
  const code = text.match(/"code":"([0-9A-Za-z]+)"/);
  if (code) return code[1];
  const message = text.match(/"message":"([^"]{0,60})/);
  if (message) return message[1].replace(/\d+/g, 'N');
  // No structured error, so use the part after the set name, normalised.
  const tail = text.includes(': ') ? text.slice(text.indexOf(': ') + 2) : text;
  return tail.replace(/\d+/g, 'N').slice(0, 60) || 'unknown';
}

/**
 * @param {string[]} failures  one entry per failed set, "<set name>: <error>"
 * @returns {string|null} null when nothing failed, so the caller can pass it straight through
 */
export function summariseFailures(failures) {
  const list = Array.isArray(failures) ? failures.filter(Boolean) : [];
  if (!list.length) return null;

  const kinds = new Map();
  for (const failure of list) {
    const kind = failureKind(failure);
    if (!kinds.has(kind)) kinds.set(kind, { count: 0, example: String(failure) });
    kinds.get(kind).count++;
  }

  // Rarest first. A single unusual failure is the one worth reading, and it is precisely the
  // one arrival-order truncation buried under the common case.
  const ordered = [...kinds.entries()].sort((a, b) => a[1].count - b[1].count);
  const shown   = ordered.slice(0, MAX_KINDS);
  const hidden  = ordered.length - shown.length;

  const parts = shown.map(([kind, v]) =>
    `${kind} x${v.count} (eg ${v.example.slice(0, MAX_EXAMPLE)})`);
  if (hidden > 0) parts.push(`and ${hidden} more error type(s)`);

  const head = `${list.length} set(s) failed across ${kinds.size} error type(s): `;
  return (head + parts.join(' | ')).slice(0, MAX_TOTAL);
}
