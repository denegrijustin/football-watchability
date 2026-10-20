const PATHS = { nfl: 'nfl', cfb: 'college-football' };
/** Cache the upstream body without parsing or rebuilding its JSON inside the Worker. */
export async function espnProxy(league, path, ttl) {
  const cache = caches.default;
  const key = new Request(`https://fbwatch-cache/raw-v1/${league}/${path}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  for (const host of ['https://site.api.espn.com', 'https://site.web.api.espn.com']) {
    try {
      const upstream = await fetch(`${host}/apis/site/v2/sports/football/${PATHS[league]}/${path}`, {
        headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0', referer: 'https://www.espn.com/' },
        signal: AbortSignal.timeout(15000),
      });
      if (!upstream.ok || !(upstream.headers.get('content-type') ?? '').includes('json')) continue;
      const response = new Response(upstream.body, { headers: {
        'content-type': 'application/json', 'cache-control': `public, max-age=0, s-maxage=${ttl}`,
        'x-content-type-options': 'nosniff', 'x-fbwatch-format': 'espn',
      } });
      const encoding = upstream.headers.get('content-encoding');
      if (encoding) response.headers.set('content-encoding', encoding);
      await cache.put(key, response.clone());
      return response;
    } catch { /* try the alternate feed */ }
  }
  return Response.json({ error: 'ESPN unavailable' }, { status: 502 });
}
