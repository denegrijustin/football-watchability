// Cloudflare Pages Function: /api/live-game?league=nfl|cfb&event=ID
// The Game Center's game summary (same body as /api/game), pushed as an event stream whenever it changes. See /api/live.
import { onRequestGet as game } from "./game.js";
import { eventStream } from "../../src/serverFeeds.js";

export async function onRequestGet({ request, waitUntil }) {
  const url = new URL(request.url);
  const league = url.searchParams.get("league");
  const event = url.searchParams.get("event");
  if (!["nfl", "cfb"].includes(league) || !/^\d{6,12}$/.test(event ?? ""))
    return new Response(JSON.stringify({ error: "league=nfl|cfb and event=ID required" }), { status: 400 });
  const load = async () => {
    const res = await game({ request: new Request(`${url.origin}/api/game?league=${league}&event=${event}&fresh=4${url.searchParams.get("format") === "raw" ? "&format=raw" : ""}`) });
    return res.ok ? res.text() : null;
  };
  return eventStream("game", load, waitUntil, request.signal);
}
