export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';
    const corsOrigin = allowedOrigin === '*' ? '*' : (origin === allowedOrigin ? origin : '');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(corsOrigin) });
    }
    if (request.method === 'GET') {
      return json({ ok:true, service:'ncku-cycling-api-proxy' }, 200, corsOrigin);
    }
    if (request.method !== 'POST') {
      return json({ ok:false, error:'Method not allowed' }, 405, corsOrigin);
    }
    if (allowedOrigin !== '*' && origin !== allowedOrigin) {
      return json({ ok:false, error:'Origin not allowed' }, 403, '');
    }

    try {
      const payload = await request.json();
      const upstream = await fetch(env.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ...payload, secret: env.API_SHARED_SECRET }),
        redirect: 'follow'
      });
      const text = await upstream.text();
      let data;
      try { data = JSON.parse(text); }
      catch { return json({ ok:false, error:'Apps Script 回傳非 JSON', detail:text.slice(0,300) }, 502, corsOrigin); }
      return json(data, 200, corsOrigin);
    } catch (err) {
      return json({ ok:false, error:String(err && err.message || err) }, 500, corsOrigin);
    }
  }
};

function corsHeaders(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
  if (origin) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type':'application/json;charset=UTF-8', ...corsHeaders(origin) }
  });
}
