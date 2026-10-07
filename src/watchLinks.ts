// Where a network chip can take you. Two kinds of link, and neither can name a specific channel or stream the way you
// might hope, so each says plainly what it does:
//  - ESPN-family games (ESPN, ESPN2, ESPNU, ESPN+, SEC Network, ACC Network, ABC): the game's page on espn.com. On a phone
//    with the ESPN app installed, espn.com game links open in the app (universal links); its Watch button starts the
//    stream if your provider login covers it. ESPN publishes no public link that starts a given stream directly.
//  - Everything else on cable: the DIRECTV guide. DIRECTV publishes no link that tunes a channel; its box can only be
//    tuned from inside the home network, which a web page cannot do, so the channel number beside the logo is what to
//    punch in or search for.
//  - A few streaming outlets (Prime Video, Peacock, Paramount+, FOX One): the outlet's home page.
// Edit the tables below if a link moves.
import { directvChannel } from "./directv";

export const DIRECTV_GUIDE = "https://www.directv.com/guide";
const ESPN_FAMILY = new Set(["espn", "espn2", "espnu", "espn-plus", "sec-network", "acc-network", "abc"]);
const SPORT: Record<string, string> = { NFL: "nfl", CFB: "college-football" };
const OUTLETS: Record<string, { name: string; url: string }> = {
  "prime-video": { name: "Prime Video", url: "https://www.primevideo.com/" },
  nbc: { name: "Peacock", url: "https://www.peacocktv.com/" },
  cbs: { name: "Paramount+", url: "https://www.paramountplus.com/" },
  cbssn: { name: "Paramount+", url: "https://www.paramountplus.com/" },
  fox: { name: "FOX One", url: "https://www.foxone.com/" },
  fs1: { name: "FOX One", url: "https://www.foxone.com/" },
  btn: { name: "FOX One", url: "https://www.foxone.com/" },
};

export type WatchLink = { url: string; title: string; kind: "espn" | "outlet" };

/** The game's ESPN page: opens the ESPN app on a phone that has it. */
export const espnGameUrl = (league: string, espnId: string) => `https://www.espn.com/${SPORT[league] ?? "college-football"}/game/_/gameId/${espnId}`;

/** The best "watch it" link for the chip's logo, or null (cable-only networks link from the channel number instead). */
export function watchLink({ network, broadcast, league, espnId }: { network?: string | null; broadcast?: string; league: string; espnId?: string | null }): WatchLink | null {
  const viaEspnApp = (network && ESPN_FAMILY.has(network)) || /ESPN App/i.test(broadcast ?? "");
  if (viaEspnApp && espnId) return { url: espnGameUrl(league, espnId), title: "Open this game in the ESPN app (or espn.com)", kind: "espn" };
  const o = network ? OUTLETS[network] : undefined;
  return o ? { url: o.url, title: `Open ${o.name}`, kind: "outlet" } : null;
}

/** The channel number's link: the DIRECTV guide, with the channel to look for. */
export function directvLink(network?: string | null): { url: string; title: string } | null {
  const ch = directvChannel(network);
  return ch ? { url: DIRECTV_GUIDE, title: `Open the DIRECTV guide · channel ${ch} (Overland Park, KS)` } : null;
}
