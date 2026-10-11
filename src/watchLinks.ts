// Where a network chip can take you. Two kinds of link, and neither can name a specific channel or stream the way you
// might hope, so each says plainly what it does:
//  - ESPN-family games (ESPN, ESPN2, ESPNU, ESPN+, SEC Network, ACC Network, ABC): the game's page on espn.com. On a phone
//    with the ESPN app installed, espn.com game links open in the app (universal links); its Watch button starts the
//    stream if your provider login covers it. ESPN publishes no public link that starts a given stream directly.
//  - Everything else on cable: the DIRECTV guide. DIRECTV publishes no link that tunes a channel; its box can only be
//    tuned from inside the home network, which a web page cannot do, so the channel number beside the logo is what to
//    punch in or search for.
//  - A few streaming outlets (Prime Video, FOX One): the outlet's home page.
// Edit the tables below if a link moves.
import { directvChannel } from "./directv";

export const DIRECTV_GUIDE = "https://www.directv.com/guide";
const ESPN_FAMILY = new Set(["espn", "espn2", "espnu", "espn-plus", "sec-network", "acc-network", "abc"]);
const SPORT: Record<string, string> = { NFL: "nfl", CFB: "college-football" };
const OUTLETS: Record<string, { name: string; url: string }> = {
  "prime-video": { name: "Prime Video", url: "https://www.primevideo.com/" },
  fox: { name: "FOX One", url: "https://www.foxone.com/" },
  fs1: { name: "FOX One", url: "https://www.foxone.com/" },
  btn: { name: "FOX One", url: "https://www.foxone.com/" },
};

export type WatchLink = { url: string; title: string; kind: "espn" | "outlet"; app?: AppLink };

/**
 * An address that opens an installed app, with the web page it falls back to. On a phone a tap tries the app first; on a computer,
 * or when the app is not installed, the web page opens as before. The addresses are the apps' own URL schemes: ESPN's app answers to
 * sportscenter:// (a game it cannot find still opens the app), and the DIRECTV app to directvapp://. Neither publishes a list, so
 * edit the tables below if an address moves.
 */
export type AppLink = { ios: string; android: string };
const ESPN_SPORT: Record<string, string> = { NFL: "nfl", CFB: "college-football" };
export const espnAppLink = (league: string, espnId: string): AppLink => {
  const q = `gameId=${espnId}&sportName=football&leagueName=${ESPN_SPORT[league] ?? "college-football"}`;
  return {
    ios: `sportscenter://x-callback-url/showGame?${q}`,
    android: `intent://x-callback-url/showGame?${q}#Intent;scheme=sportscenter;package=com.espn.score_center;end`,
  };
};
export const DIRECTV_APP: AppLink = {
  ios: "directvapp://",
  android: "intent://#Intent;scheme=directvapp;package=com.att.tv;end",
};

const isPhone = () => typeof navigator !== "undefined" && (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));
/**
 * A click handler for a link with an app address: on a phone it tries the app and, if the page is still showing a moment later
 * (the app is not installed), carries on to the web page. Elsewhere it does nothing, so the plain link works.
 */
export function openInApp(e: { preventDefault(): void }, app: AppLink | undefined, webUrl: string) {
  if (!app || !isPhone()) return;
  e.preventDefault();
  const android = /Android/i.test(navigator.userAgent);
  const left = () => document.hidden;
  if (android) window.location.href = app.android;
  else {
    // A hidden frame, so a phone without the app shows no "invalid address" alert.
    const f = document.createElement("iframe");
    f.hidden = true;
    f.setAttribute("data-app-link", app.ios);
    f.src = app.ios;
    document.body.append(f);
    setTimeout(() => f.remove(), 2500);
  }
  setTimeout(() => {
    if (!left()) window.location.assign(webUrl);
  }, 1200);
}

/** The game's ESPN page: opens the ESPN app on a phone that has it. */
export const espnGameUrl = (league: string, espnId: string) => `https://www.espn.com/${SPORT[league] ?? "college-football"}/game/_/gameId/${espnId}`;

/** The best "watch it" link for the chip's logo, or null (cable-only networks link from the channel number instead). */
export function watchLink({ network, broadcast, league, espnId }: { network?: string | null; broadcast?: string; league: string; espnId?: string | null }): WatchLink | null {
  const viaEspnApp = (network && ESPN_FAMILY.has(network)) || /ESPN App/i.test(broadcast ?? "");
  if (viaEspnApp && espnId) return { url: espnGameUrl(league, espnId), title: "Open this game in the ESPN app (or espn.com)", kind: "espn", app: espnAppLink(league, espnId) };
  const o = network ? OUTLETS[network] : undefined;
  return o ? { url: o.url, title: `Open ${o.name}`, kind: "outlet" } : null;
}

/** The channel number's link: the DIRECTV guide, with the channel to look for. */
export function directvLink(network?: string | null): { url: string; title: string; app: AppLink } | null {
  const ch = directvChannel(network);
  return ch ? { url: DIRECTV_GUIDE, title: `Open the DIRECTV app · channel ${ch} (Overland Park, KS)`, app: DIRECTV_APP } : null;
}
