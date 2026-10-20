// Small helpers shared by the Pages Functions (scores, game and their live streams).

/** Stamp a response with when its data was fetched, so a stream can ask for a copy no older than a few seconds. */
export const stamped = (headers) => ({ ...headers, "x-fetched": String(Date.now()) });

/**
 * Whether a cached copy is fresh enough for this request: always, unless the request says `fresh=<seconds>` (the live streams do, to see a
 * touchdown within seconds), in which case only a copy fetched that recently.
 */
export function isFresh(hit, url) {
  const seconds = Number(url.searchParams.get("fresh"));
  if (!seconds) return true;
  return Date.now() - Number(hit.headers.get("x-fetched") ?? 0) <= seconds * 1000;
}

/** EventSource reconnects after four seconds; each invocation loads exactly one snapshot. */
export const STREAM_STEP_MS = 4_000;

/** Keep the event-stream contract without accumulating CPU across a long polling loop. */
export async function eventStream(event, load, _waitUntil, signal) {
  if (signal?.aborted) return new Response(null, { status: 204 });
  let body = null;
  try { body = await load(); } catch { /* reconnect and retain the last good snapshot */ }
  if (signal?.aborted) return new Response(null, { status: 204 });
  // A failed upstream read must not become a successful freshness event.
  const data = body ? `event: ${event}\ndata: ${body}\n\n` : ": unavailable\n\n";
  return new Response(`retry: ${STREAM_STEP_MS}\n\n${data}`, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
