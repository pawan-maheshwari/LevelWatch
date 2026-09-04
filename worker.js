/**
 * LevelWatch relay — a personal CORS proxy for Yahoo Finance quotes.
 *
 * WHY: Yahoo sends no Access-Control-Allow-Origin header, so a static page on
 * GitHub Pages cannot call it directly. Public proxies work until they rate-limit
 * you. This is your own, on Cloudflare's free tier (100,000 requests/day —
 * LevelWatch at 15s polling uses about 2,000 on a full trading day).
 *
 * DEPLOY (about five minutes, no card needed):
 *   1. dash.cloudflare.com  →  Compute (Workers)  →  Create  →  Start with Hello World
 *   2. Name it: levelwatch  →  Deploy
 *   3. Edit code  →  select all  →  paste this file  →  Deploy
 *   4. Copy the URL it gives you, e.g. https://levelwatch.pawan.workers.dev
 *   5. In LevelWatch: Settings → Relay → paste that URL → Test feed
 *
 * The allow-list below means this worker can only ever fetch Yahoo Finance,
 * so publishing the URL does not turn it into an open proxy for anyone else.
 */

const ALLOWED_HOSTS = [
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com'
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function reply(body, status, type) {
  return new Response(body, {
    status,
    headers: { ...CORS, 'Content-Type': type || 'application/json', 'Cache-Control': 'no-store' }
  });
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const target = new URL(request.url).searchParams.get('url');
    if (!target) {
      return reply(JSON.stringify({ error: 'Add ?url= followed by the encoded Yahoo endpoint.' }), 400);
    }

    let t;
    try { t = new URL(target); }
    catch { return reply(JSON.stringify({ error: 'That is not a valid URL.' }), 400); }

    if (!ALLOWED_HOSTS.includes(t.hostname)) {
      return reply(JSON.stringify({ error: 'This relay only forwards to Yahoo Finance.' }), 403);
    }

    try {
      const upstream = await fetch(t.toString(), {
        headers: {
          // Yahoo refuses requests with no browser-shaped User-Agent.
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
          'Accept': 'application/json,text/plain,*/*',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        // 5s edge cache keeps you well inside Yahoo's tolerance if you watch several scrips.
        cf: { cacheTtl: 5, cacheEverything: true }
      });

      const body = await upstream.text();
      return reply(body, upstream.status);
    } catch (e) {
      return reply(JSON.stringify({ error: 'Upstream fetch failed: ' + e.message }), 502);
    }
  }
};
