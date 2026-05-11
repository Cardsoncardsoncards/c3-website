// netlify/functions/compare-save.mjs
// Stub for future comparison save feature (Phase 4)
// POST /api/compare-save
// Currently returns 501 and captures email interest via MailerLite

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  // Capture email interest if provided
  let email = null;
  try {
    const body = await req.json();
    email = body.email || null;
  } catch {}

  // TODO Phase 4: If email provided, add to MailerLite group for compare save interest
  // For now, just acknowledge

  return new Response(JSON.stringify({
    status: 'coming_soon',
    message: 'Save feature is coming soon. Join the waitlist to be notified.',
    email_captured: !!email
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
};

export const config = { path: '/api/compare-save' };
