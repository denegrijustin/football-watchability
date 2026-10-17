// Server-sent events from our own functions (/api/live, /api/live-game): the edge pushes a score the moment it changes. Falls back quietly, because
// polling (see live.tsx) is always running underneath: if the stream cannot open (a proxy that buffers, a local preview), nothing is lost.

export type Stream = { close: () => void; /** When the last event arrived (ms), 0 before the first. */ lastAt: () => number };

/** Opens `url` and calls `onData` with each `event` (parsed JSON). The browser reconnects by itself when the function ends the stream. */
export function openStream<T>(url: string, event: string, onData: (data: T) => void): Stream {
  let last = 0;
  if (typeof EventSource === "undefined") return { close: () => {}, lastAt: () => 0 };
  const es = new EventSource(url);
  es.addEventListener(event, (e) => {
    try {
      onData(JSON.parse((e as MessageEvent).data));
      last = Date.now();
    } catch {
      /* a malformed event is ignored; the next one carries everything */
    }
  });
  // A response that is not an event stream (the local preview answers every address with the page) closes for good: stop trying.
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) es.close();
  };
  return { close: () => es.close(), lastAt: () => last };
}
