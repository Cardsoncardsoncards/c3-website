// netlify/functions/shared/password.mjs
// task-129: password hashing for accounts.password_hash, using Node's built-in crypto (scrypt).
// No new dependency (task-128 recommendation): bcrypt/argon2 would add a native binding to the
// serverless bundle; scrypt is in the standard library and is a memory-hard KDF.
//
// Storage format in accounts.password_hash: "salt:derivedKey", both hex. The salt is random
// per account (16 bytes). Verification is TIMING-SAFE: it derives the key from the candidate
// password with the stored salt and compares with crypto.timingSafeEqual, never a plain ===
// (a === leaks, via response timing, how many leading bytes matched).

import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const KEYLEN    = 64;   // derived key length in bytes
const SALT_BYTES = 16;

// Returns "salt:hash" (hex:hex). scryptSync is CPU-bound (~tens of ms at default cost); that is
// acceptable and even desirable on an auth endpoint, and these endpoints are low-traffic.
export function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const hash = scryptSync(password, salt, KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

// Timing-safe verify. Returns a boolean, never throws on a malformed stored value.
export function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string' || !stored.includes(':')) return false;
  const idx = stored.indexOf(':');
  const salt    = stored.slice(0, idx);
  const hashHex = stored.slice(idx + 1);
  if (!salt || !hashHex) return false;
  let derived, expected;
  try {
    derived  = scryptSync(password, salt, KEYLEN);
    expected = Buffer.from(hashHex, 'hex');
  } catch {
    return false;
  }
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

// Minimal password policy. Returns an error string if unacceptable, or null if fine.
export function passwordProblem(password) {
  if (typeof password !== 'string') return 'A password is required.';
  if (password.length < 8)   return 'Password must be at least 8 characters.';
  if (password.length > 200) return 'Password must be 200 characters or fewer.';
  return null;
}
