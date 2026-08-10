// netlify/functions/shared/request-fingerprint.mjs
//
// ONE definition of "what we record about the request that reached us", so that every
// endpoint capturing it records the SAME fields, in the SAME shape, under the SAME column
// names. Before this module there were three separate hand-rolled client-IP readers
// (account.mjs, email-subscribe.mjs, register-interest.mjs) and card-api.mjs invented a
// fourth thing entirely: it wrote the literal string 'AU' into card_views.country_code for
// every row on earth. That is the same drift already found once today in email_log, where
// three writers had each grown their own idea of what an email record looks like.
//
// Two exports, deliberately separate, because they answer different questions:
//
//   clientIp(req)              -> the FULL address, for transient in-memory use only
//                                 (rate limiting). Never persist this return value.
//   requestFingerprint(req, c) -> the shape that gets WRITTEN to a table. The IP in here is
//                                 already truncated. See the privacy note below.
//
// PRIVACY DECISION, stated so it is reviewable rather than assumed:
// what gets persisted is a TRUNCATED address, not the full one. IPv4 keeps the first three
// octets (a /24), IPv6 the first three hextets (a /48).
//   - It still answers everything these two tables exist to answer: is one origin hammering
//     signup, is this traffic from a datacentre range rather than a consumer ISP, roughly
//     where did it come from. A bot farm rotating addresses inside a subnet stays visible.
//   - It stops short of pinning a single household line, on tables that will accumulate
//     millions of rows and are kept indefinitely.
//   - The full address is NOT lost where it is actually needed: the signup rate limiter still
//     reads clientIp() and keys its in-memory Map on the full value, exactly as before. This
//     changes what is STORED, not what is enforced.
// A truncated IP is still personal information. Truncation lowers the risk, it does not make
// this non-personal data, and nothing here settles retention. That is a live question for a
// privacy-policy discussion, not something this module decides.
//
// Everything in here is best-effort and must never throw: this is audit and analytics
// capture, and it sits in the request path of a page view and of signup. A fingerprint that
// fails to resolve returns nulls and the caller writes nulls. It never fails the request.

// A user agent is attacker-controlled free text of unbounded length. Cap it so a hostile
// client cannot write an arbitrarily large value into a row on every request.
const MAX_UA_LENGTH = 400;

function header(req, name) {
  try {
    const v = req.headers && req.headers.get ? req.headers.get(name) : null;
    return v ? v.trim() : null;
  } catch {
    return null;
  }
}

// Netlify sets x-nf-client-connection-ip to the real client address. x-forwarded-for is the
// fallback and its FIRST entry is the client, the rest being proxies, so anything after the
// first comma is discarded rather than trusted. This is the single definition; it was
// previously copied, with small wording differences, into three separate files.
export function clientIp(req) {
  const direct = header(req, 'x-nf-client-connection-ip');
  if (direct) return direct;
  const fwd = header(req, 'x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0].trim();
    if (first) return first;
  }
  return null;
}

// Reduce an address to its network prefix. Returns null for anything unrecognised rather
// than storing a half-parsed value that later reads as if it were a real address.
export function truncateIp(ip) {
  if (!ip || typeof ip !== 'string') return null;
  let addr = ip.trim();
  if (!addr) return null;

  // Strip an IPv6 zone index ("fe80::1%eth0") and unwrap bracket form ("[::1]").
  addr = addr.split('%')[0];
  if (addr.startsWith('[') && addr.includes(']')) addr = addr.slice(1, addr.indexOf(']'));

  // IPv4-mapped IPv6 ("::ffff:203.0.113.47") is an IPv4 client; treat it as one.
  const mapped = addr.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) addr = mapped[1];

  if (addr.includes('.') && !addr.includes(':')) {
    const parts = addr.split('.');
    if (parts.length !== 4) return null;
    for (const p of parts) {
      if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null;
    }
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }

  if (addr.includes(':')) {
    // Expand "::" so the first three hextets are the real first three, not whatever
    // happened to sit before the compression.
    const halves = addr.split('::');
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(':') : [];
    const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    let groups;
    if (halves.length === 2) {
      const fill = 8 - head.length - tail.length;
      if (fill < 0) return null;
      groups = [...head, ...Array(fill).fill('0'), ...tail];
    } else {
      groups = head;
    }
    if (groups.length !== 8) return null;
    for (const g of groups) {
      if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    }
    // Strip leading zeros per hextet. Without this, "2001:0db8::1" and "2001:db8::1" are the
    // same network but would store as two different strings, silently splitting any grouping
    // or count done on this column.
    const norm = groups.slice(0, 3).map(g => g.toLowerCase().replace(/^0+(?=.)/, ''));
    return `${norm[0]}:${norm[1]}:${norm[2]}::/48`;
  }

  return null;
}

// Netlify exposes geo two ways. On Functions v2 the second handler argument carries a parsed
// context.geo. Some paths instead carry an x-nf-geo header holding base64 JSON of the same
// shape. Read the context first and fall back to the header, so a handler that has not been
// updated to take the second argument still records geo rather than silently writing nulls.
function readGeo(req, context) {
  const fromContext = context && context.geo ? context.geo : null;
  if (fromContext && (fromContext.country || fromContext.city)) return fromContext;

  const raw = header(req, 'x-nf-geo');
  if (!raw) return null;
  try {
    const json = typeof atob === 'function'
      ? atob(raw)
      : Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function clean(value, max) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

// The one shape written to every table that records request provenance. Column names here
// match the columns exactly, so a caller spreads it straight into its insert body and cannot
// drift by renaming a field on its way in.
export function requestFingerprint(req, context) {
  try {
    const geo = readGeo(req, context);
    // country is an object ({ code, name }) in Netlify's geo shape, but tolerate a bare
    // string in case a future runtime flattens it.
    const country = geo && geo.country
      ? (typeof geo.country === 'string' ? geo.country : geo.country.code)
      : null;

    return {
      user_agent: clean(header(req, 'user-agent'), MAX_UA_LENGTH),
      ip_address: truncateIp(clientIp(req)),
      geo_country: clean(country, 2),
      geo_city: clean(geo ? geo.city : null, 120)
    };
  } catch {
    // Never let provenance capture break the request it is describing.
    return { user_agent: null, ip_address: null, geo_country: null, geo_city: null };
  }
}
