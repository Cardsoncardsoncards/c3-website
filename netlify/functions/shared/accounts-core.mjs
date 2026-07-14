// netlify/functions/shared/accounts-core.mjs
// task-109: the ONE identity + follow write path. Sections 1 to 3 of the passwordless
// account architecture reference.
//
// Why this module exists at all:
//   - Follows used to be written straight into card_price_alerts from card-api.mjs, keyed on
//     a raw email string with no normalisation, so Sam@x.com and sam@x.com were two people.
//   - The uniqueness constraint there was UNIQUE (email, game, card_slug, direction), and
//     direction is always NULL on a follow row. NULL <> NULL in a Postgres unique index, so
//     duplicate follows silently succeeded.
//   - The cap check lived inline in one handler, which is exactly how caps drift out of sync
//     the moment a second entry point appears.
//
// Every entry point that creates a follow now calls applyFollow() here. Nothing else may write
// to the follows table. If you add a new surface (a button, a form, an API), route it through
// this module. A direct insert elsewhere silently bypasses the cap and the normalisation.
//
// Tier is NEVER encoded by which table a row lives in. There is one follows table for
// everybody, and eligibility is resolved at send time from subscribers. That is what makes
// upgrade and downgrade free: a follow row never moves, is never copied, is never migrated.

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');

const FETCH_TIMEOUT = 8000;

// ---------------------------------------------------------------------------
// Caps, as single named constants in ONE place (reference doc, Section 3).
//
// FREE_FOLLOW_CAP is C3's own reasoned number, carried over unchanged from card-api.mjs.
// Do not replace it with a number borrowed from another product.
//
// PAID_FOLLOW_CAP is null, meaning uncapped. No paid tier is live yet (subscribers has 0
// rows), so this is not currently reachable. It exists so that turning the paid tier on is a
// value change here and nothing else: capFor() already branches on tier.
// ---------------------------------------------------------------------------
export const FREE_FOLLOW_CAP = 100;
export const PAID_FOLLOW_CAP = null;

export function capFor(tier) {
  return tier === 'paid' ? PAID_FOLLOW_CAP : FREE_FOLLOW_CAP;
}

export const MAGIC_LINK_TTL_HOURS = 24;

// ---------------------------------------------------------------------------
// Supabase REST helpers. Service key throughout: accounts and follows hold email
// addresses, and the anon key ships to every browser. Neither table has an anon policy.
// ---------------------------------------------------------------------------
async function sb(path, { method = 'GET', body, prefer } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const headers = {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    };
    if (prefer) headers['Prefer'] = prefer;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      signal: ctrl.signal,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function sbJson(path, opts) {
  const res = await sb(path, opts);
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json().catch(() => null);
}

// ---------------------------------------------------------------------------
// Section 1: identity
// ---------------------------------------------------------------------------

// The single definition of what an email "is". The accounts table carries a CHECK that
// enforces exactly this shape at the database level, so a future writer that forgets to call
// this cannot corrupt the table, it just gets a constraint violation.
export function normaliseEmail(email) {
  if (typeof email !== 'string') return null;
  const e = email.trim().toLowerCase();
  if (e.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

// Silent create. This function MUST NOT send an email, ever (reference doc, Section 1: "the
// create-account call must never itself send an email"). Sending is a separate, explicit step
// via sendMagicLink(), so the user only ever receives C3-branded mail we control.
export async function resolveOrCreateAccount(email) {
  const normalised = normaliseEmail(email);
  if (!normalised) return null;

  const found = await sbJson(
    `accounts?select=id,email&email=eq.${encodeURIComponent(normalised)}&limit=1`
  ).catch(() => null);
  if (Array.isArray(found) && found.length) return found[0];

  // Insert. On a race, two concurrent follows for the same new email can both miss the SELECT
  // above; the UNIQUE(email) constraint then rejects the loser with a 409, so re-read rather
  // than failing the user's follow.
  const res = await sb('accounts', {
    method: 'POST',
    body: { email: normalised },
    prefer: 'return=representation',
  });

  if (res.ok) {
    const rows = await res.json().catch(() => null);
    if (Array.isArray(rows) && rows.length) return rows[0];
  }

  if (res.status === 409) {
    const again = await sbJson(
      `accounts?select=id,email&email=eq.${encodeURIComponent(normalised)}&limit=1`
    ).catch(() => null);
    if (Array.isArray(again) && again.length) return again[0];
  }

  console.error('[accounts] create failed', res.status);
  return null;
}

export async function touchAccount(userId) {
  await sb(`accounts?id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: { last_seen_at: new Date().toISOString() },
  }).catch(() => { /* last_seen_at is telemetry, never fail a request over it */ });
}

// ---------------------------------------------------------------------------
// Section 3: send-time eligibility
//
// subscribers already exists (id, email, stripe_customer_id, stripe_sub_id, plan, status,
// subscribed_at, cancelled_at, updated_at), is keyed UNIQUE on email, and has a CHECK
// restricting status to active | cancelled | past_due | trialing. It currently holds 0 rows,
// so in practice everyone resolves to 'free' today.
//
// This reads subscribers by email rather than by user_id because that is the column the
// Stripe webhook already writes. Binding subscriptions to account IDs is Section 4, which is
// explicitly out of scope until the subscription launch.
// ---------------------------------------------------------------------------
const PAID_STATUSES = new Set(['active', 'trialing']);

export async function getTier(email) {
  const normalised = normaliseEmail(email);
  if (!normalised) return 'free';
  try {
    const rows = await sbJson(
      `subscribers?select=status&email=eq.${encodeURIComponent(normalised)}&limit=1`
    );
    if (Array.isArray(rows) && rows.length && PAID_STATUSES.has(rows[0].status)) return 'paid';
  } catch (e) {
    // A lookup failure must not hand out a paid tier. Fail closed to free.
    console.warn('[accounts] tier lookup failed, defaulting to free:', e.message);
  }
  return 'free';
}

// ---------------------------------------------------------------------------
// Section 2: the ONE follow write path
// ---------------------------------------------------------------------------

// Counts every follow row the account holds, including soft-unsubscribed ones. A soft
// unsubscribe means "stop emailing me about this", not "I no longer track this", so the row
// still occupies a slot. Freeing a slot is the hard-delete action, which is the whole reason
// the two are kept distinct.
export async function countFollows(userId) {
  const res = await sb(
    `follows?select=id&user_id=eq.${encodeURIComponent(userId)}`,
    { prefer: 'count=exact' }
  );
  const range = res.headers.get('content-range') || '';
  return parseInt(range.split('/')[1] || '0', 10) || 0;
}

export async function listFollows(userId) {
  const rows = await sbJson(
    `follows?select=id,game,card_slug,card_name,confirmed,created_at,unsubscribed_at,unsubscribe_token` +
    `&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`
  ).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

// The single entry point for creating a follow. Resolves/creates the account, resolves the
// tier, applies the correct cap, then writes. Returns a discriminated result rather than
// throwing, so callers can map it onto their own responses.
export async function applyFollow({ email, game, cardSlug, cardName }) {
  const normalised = normaliseEmail(email);
  if (!normalised) return { ok: false, reason: 'invalid_email' };

  const account = await resolveOrCreateAccount(normalised);
  if (!account) return { ok: false, reason: 'account_failed' };

  // Already following? Idempotent, and it must not consume a cap slot or resend anything.
  const existing = await sbJson(
    `follows?select=id,confirmed&user_id=eq.${encodeURIComponent(account.id)}` +
    `&game=eq.${encodeURIComponent(game)}&card_slug=eq.${encodeURIComponent(cardSlug)}&limit=1`
  ).catch(() => []);
  if (Array.isArray(existing) && existing.length) {
    return {
      ok: true,
      alreadyFollowing: true,
      confirmed: !!existing[0].confirmed,
      account,
      follow: existing[0],
    };
  }

  const tier = await getTier(normalised);
  const cap  = capFor(tier);

  if (cap !== null) {
    const current = await countFollows(account.id).catch(() => 0);
    if (current >= cap) {
      return { ok: false, reason: 'cap_reached', cap, tier, account };
    }
  }

  const confirmToken = crypto.randomUUID();

  const res = await sb('follows', {
    method: 'POST',
    body: {
      user_id:       account.id,
      game,
      card_slug:     cardSlug,
      card_name:     cardName || null,
      alert_types:   ['price_move'],
      confirmed:     false,
      confirm_token: confirmToken,
    },
    prefer: 'return=representation',
  });

  if (!res.ok) {
    // 409 means the UNIQUE (user_id, entity_id) constraint caught a duplicate that the SELECT
    // above raced past. That is the constraint doing its job, and the user's intent is already
    // satisfied, so report it as already-following rather than as an error.
    if (res.status === 409) {
      return { ok: true, alreadyFollowing: true, confirmed: false, account };
    }
    console.error('[accounts] follow insert failed', res.status);
    return { ok: false, reason: 'insert_failed', account };
  }

  const rows = await res.json().catch(() => null);
  const follow = Array.isArray(rows) && rows.length ? rows[0] : null;

  return { ok: true, created: true, account, follow, confirmToken, tier };
}

// Soft delete. "Stop emailing me about this." The relationship is preserved.
export async function unsubscribeFollow(followId) {
  const res = await sb(`follows?id=eq.${encodeURIComponent(followId)}`, {
    method: 'PATCH',
    body: { unsubscribed_at: new Date().toISOString() },
  });
  return res.ok;
}

// Hard delete. "I don't want to track this at all." Distinct action, distinct intent, and the
// only one that frees a cap slot.
export async function deleteFollow(userId, followId) {
  const res = await sb(
    `follows?id=eq.${encodeURIComponent(followId)}&user_id=eq.${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  );
  return res.ok;
}

// Joins the account through so callers still have an address for email_log, which the old
// card_price_alerts row carried inline.
export async function findFollowByUnsubToken(token) {
  const rows = await sbJson(
    `follows?select=id,user_id,game,card_slug,card_name,unsubscribed_at,accounts(email)&unsubscribe_token=eq.${encodeURIComponent(token)}&limit=1`
  ).catch(() => []);
  if (!Array.isArray(rows) || !rows.length) return null;
  const row = rows[0];
  return { ...row, email: row.accounts ? row.accounts.email : null };
}

export async function findFollowByConfirmToken(token) {
  const rows = await sbJson(
    `follows?select=id,user_id,game,card_slug,card_name,confirmed,unsubscribe_token&confirm_token=eq.${encodeURIComponent(token)}&limit=1`
  ).catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function confirmFollow(followId) {
  const res = await sb(`follows?id=eq.${encodeURIComponent(followId)}`, {
    method: 'PATCH',
    body: {
      confirmed:     true,
      confirmed_at:  new Date().toISOString(),
      confirm_token: null, // single use
    },
  });
  return res.ok;
}

// ---------------------------------------------------------------------------
// Magic links, generalised onto accounts. Same 24 hour TTL already proven here.
// Creating a link does not send it; the caller sends it through the branded Resend template,
// which keeps the "no raw provider email ever reaches a user" rule from Section 1 intact.
// ---------------------------------------------------------------------------
export async function createMagicLink(userId) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_HOURS * 3600 * 1000).toISOString();
  const res = await sb('follow_magic_links', {
    method: 'POST',
    body: { user_id: userId, token, expires_at: expiresAt },
  });
  return res.ok ? token : null;
}

// Resolves a magic-link token to its account, or null if unknown/expired.
export async function resolveMagicLink(token) {
  const rows = await sbJson(
    `follow_magic_links?select=user_id,expires_at,accounts(id,email)&token=eq.${encodeURIComponent(token)}&limit=1`
  ).catch(() => []);
  if (!Array.isArray(rows) || !rows.length) return { status: 'unknown' };

  const row = rows[0];
  if (new Date(row.expires_at).getTime() < Date.now()) return { status: 'expired' };

  const account = row.accounts || null;
  if (!account) return { status: 'unknown' };

  return { status: 'ok', account };
}
