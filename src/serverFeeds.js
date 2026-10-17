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

/** How long a stream stays open before the browser reconnects (EventSource does it by itself): short enough for a function's subrequest limit. */
export const STREAM_MS = 40_000;
/** How often a stream looks for a change. */
export const STREAM_STEP_MS = 4_000;

/**
 * An event stream (text/event-stream) that calls `load()` every few seconds and sends its body as `event` whenever it changes. A comment line
 * goes out when nothing changed, so proxies keep the connection open.
 */
export function eventStream(event, load, waitUntil, signal) {
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  const enc = new TextEncoder();
  // A viewer that leaves must end the loop: a write that can no longer be delivered would otherwise wait forever.
  let gone = false;
  let leave;
  const left = new Promise((r) => (leave = r));
  const done = () => { gone = true; leave(); };
  signal?.addEventListener("abort", done);
  w.closed.then(done, done);
  // Nothing waits unbounded: a write to a reader that has gone, or a sleep after it left, ends within a few seconds.
  const within = (p, ms) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("stalled")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
  const send = (text) => within(Promise.race([w.write(enc.encode(text)), left]), 3000);
  const pump = (async () => {
    const started = Date.now();
    let last = "";
    try {
      await send("retry: 1000\n\n");
      while (!gone && Date.now() - started < STREAM_MS) {
        const body = await load();
        if (gone) break;
        if (body && body !== last) {
          last = body;
          await send(`event: ${event}\ndata: ${body}\n\n`);
        } else await send(": ping\n\n");
        await new Promise((r) => { const t = setTimeout(r, STREAM_STEP_MS); left.then(() => { clearTimeout(t); r(); }); });
      }
    } catch {
      /* the reader went away */
    } finally {
      try { await within(w.close(), 1000); } catch { /* already closed */ }
    }
  })();
  waitUntil?.(pump);
  return new Response(readable, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
