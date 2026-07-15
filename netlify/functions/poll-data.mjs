// netlify/functions/poll-data.mjs
// Live "Which upcoming TCG release are you most hyped for?" poll behind /calendar.
//   GET  /api/poll-data[?game=X]  -> top 6 upcoming tcg_releases with live vote_count
//   POST /api/poll-data[?game=X]  { tcg_release_id, session_id } -> records the vote,
//                                    then returns the updated tally
// Fully automatic: always reflects the current top 6 upcoming releases in tcg_releases,
// so there is no admin panel. The optional ?game= filter powers future single-game
// shareable polls (e.g. /api/poll-data?game=pokemon); both GET and POST read it from
// the URL so the re-tally after a vote respects the same filter the client is using.
//
// poll_votes has RLS enabled with no policy, so this function talks to Supabase with the
// service key (service_role bypasses RLS); the public anon PostgREST role has no access.

const SUPABASE_URL         = Netlify.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_KEY');

const TALLY_LIMIT = 6;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store'
    }
  });
}

// Server clock is UTC on Netlify; date-only compare against tcg_releases.release_date.
function today() {
  return new Date().toISOString().slice(0, 10);
}

// Top TALLY_LIMIT upcoming releases with a live vote count.
// Single PostgREST call: poll_votes(count) embeds the vote tally via the
// poll_votes.tcg_release_id -> tcg_releases.id FK (left join; 0 when no votes).
// Literal commas/parens are required in the select, so the query string is built
// by hand and only the game value is percent-encoded.
async function tally(game) {
  const parts = [
    'select=id,game,set_name,release_date,poll_votes(count)',
    `release_date=gte.${today()}`,
    'order=release_date.asc',
    `limit=${TALLY_LIMIT}`
  ];
  if (game) parts.push(`game=eq.${encodeURIComponent(game)}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tcg_releases?${parts.join('&')}`, {
      signal: controller.signal,
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error('tally_http_' + res.status);
    const rows = await res.json();
    return (Array.isArray(rows) ? rows : []).map(r => ({
      tcg_release_id: r.id,
      game:           r.game,
      set_name:       r.set_name,
      release_date:   r.release_date,
      vote_count:     Array.isArray(r.poll_votes) && r.poll_votes[0]
        ? Number(r.poll_votes[0].count) || 0
        : 0
    }));
  } catch (e) { clearTimeout(timer); throw e; }
}

// Records a single vote. The unique(tcg_release_id, session_id) constraint plus
// resolution=ignore-duplicates makes a repeat vote a silent no-op (not an error).
async function insertVote(tcgReleaseId, sessionId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/poll_votes`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates,return=minimal'
      },
      body: JSON.stringify({ tcg_release_id: tcgReleaseId, session_id: sessionId })
    });
    clearTimeout(timer);
    // A duplicate resolves 2xx with no row; a bad FK (unknown release) still 4xx's.
    if (!res.ok) {
      const err = await res.text();
      throw new Error('insert_http_' + res.status + ':' + err.slice(0, 200));
    }
  } catch (e) { clearTimeout(timer); throw e; }
}

export default async (req) => {
  if (req.method === 'OPTIONS') return json({});
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return json({ error: 'server_misconfigured' }, 500);

  const url  = new URL(req.url);
  const game = (url.searchParams.get('game') || '').trim() || null;

  try {
    if (req.method === 'GET') {
      return json(await tally(game));
    }

    if (req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
      const tcgReleaseId = parseInt(body && body.tcg_release_id, 10);
      const sessionId    = body && typeof body.session_id === 'string' ? body.session_id.trim() : '';
      if (!Number.isInteger(tcgReleaseId) || !sessionId) {
        return json({ error: 'tcg_release_id (int) and session_id are required' }, 400);
      }
      await insertVote(tcgReleaseId, sessionId);
      return json(await tally(game));
    }

    return json({ error: 'method_not_allowed' }, 405);
  } catch (e) {
    console.error('[poll-data]', e.message);
    return json({ error: 'poll_failed' }, 500);
  }
};

export const config = { path: '/api/poll-data' };
