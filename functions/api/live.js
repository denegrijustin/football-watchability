// Cloudflare Pages Function: /api/live?league=nfl|cfb&date=YYYYMMDD
// The same trimmed scoreboard as /api/scores, pushed: an event stream that sends the scores the moment they change (checked every few seconds
// against a copy no older than that), so a touchdown reaches the page without it having to ask. Closes after STREAM_MS; the browser reconnects.
import { onRequestGet as scores } from "./scores.js";
import { eventStream } from "../../src/serverFeeds.js";

export async function onRequestGet({ request, waitUntil }) {
  const url = new URL(request.url);
  const league = url.searchParams.get("league");
  const date = url.searchParams.get("date");
  if (!["nfl", "cfb"].includes(league) || !/^\d{8}$/.test(date ?? ""))
    return new Response(JSON.stringify({ error: "league=nfl|cfb and date=YYYYMMDD required" }), { status: 400 });
  const load = async () => {
    const res = await scores({ request: new Request(`${url.origin}/api/scores?league=${league}&date=${date}&fresh=4`) });
    return res.ok ? res.text() : null;
  };
  return eventStream("scores", load, waitUntil, request.signal);
}
