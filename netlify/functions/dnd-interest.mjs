// netlify/functions/dnd-interest.mjs
// Handles D&D interest form submissions -- routes to MailerLite via server-side API key
// This keeps the ML API key out of client-side code

const ML_API_KEY    = Netlify.env.get('MAILERLITE_API_KEY');
const DND_GROUP_ID  = '187060931011806295';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    }
  });
}

export default async (req) => {
  if (req.method === 'OPTIONS') return json({});
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const { email, tools, other } = body;
    if (!email || !email.includes('@')) return json({ error: 'Invalid email' }, 400);

    const toolsList = Array.isArray(tools) ? tools.join(', ') : (tools || '');
    const fields = {};
    if (toolsList) fields.dnd_tools = toolsList + (other ? ', Other: ' + other : '');

    const mlRes = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + ML_API_KEY,
      },
      body: JSON.stringify({
        email,
        fields,
        groups: [DND_GROUP_ID],
        status: 'active',
      })
    });

    if (!mlRes.ok) {
      const err = await mlRes.text();
      console.error('MailerLite error:', err);
      return json({ error: 'Signup failed' }, 500);
    }

    return json({ ok: true });
  } catch (e) {
    console.error('DnD interest error:', e.message);
    return json({ error: e.message }, 500);
  }
};

export const config = { path: '/api/dnd-interest' };
