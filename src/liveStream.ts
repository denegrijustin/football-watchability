// Server-sent events from our own functions (/api/live, /api/live-game): the edge pushes a score the moment it changes. Falls back quietly, because
// polling (see live.tsx) is always running underneath: if the stream cannot open (a proxy that buffers, a local preview), nothing is lost.

export type Stream = { close: () => void; /** When the last event arrived (ms), 0 before the first. */ lastAt: () => number };

/** Opens `url` and calls `onData` with each `event` (parsed JSON). The browser reconnects by itself when the function ends the stream. */
export function openStream<T>(url: string, event: string, onData: (data: T) => void): Stream {
  let last = 0;
  if (typeof EventSource === "undefined") return { close: () => {}, lastAt: () => 0 };
  let es: EventSource | null = null;
  let closed = false;
  const connect = () => {
    if (closed || document.hidden || es) return;
    const current = new EventSource(url);
    es = current;
    current.addEventListener(event, (e) => {
      if (closed || document.hidden || es !== current) return;
      try {
        onData(JSON.parse((e as MessageEvent).data));
        last = Date.now();
      } catch { /* keep the last good snapshot */ }
    });
    current.onerror = () => {
      if (current.readyState === EventSource.CLOSED) current.close();
    };
  };
  const visible = () => {
    if (document.hidden) { es?.close(); es = null; }
    else connect();
  };
  document.addEventListener("visibilitychange", visible);
  connect();
  return {
    close: () => {
      closed = true;
      es?.close();
      es = null;
      document.removeEventListener("visibilitychange", visible);
    },
    lastAt: () => last,
  };
}
