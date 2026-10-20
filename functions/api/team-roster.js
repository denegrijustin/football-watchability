import { espnProxy } from '../_lib/espnProxy.js';
export async function onRequestGet({ request }) {
  const url = new URL(request.url), league = url.searchParams.get('league'), id = url.searchParams.get('id');
  if (!['nfl','cfb'].includes(league) || !/^\d{1,12}$/.test(id ?? '')) return Response.json({ error: 'Valid league and team id required' }, { status: 400 });
  return espnProxy(league, `teams/${id}/roster`, 43200);
}
