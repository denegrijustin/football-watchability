import type { League } from "./data";

const CT = "America/Chicago";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Which league the site opens on. College by default; from Sunday morning until the Tuesday 8am
 * refresh (Central, whatever zone the viewer displays) it opens on the NFL, when the NFL is the
 * week's story. `?league=NFL` or `?league=CFB` in the address overrides it.
 */
export function defaultLeague(now: Date = new Date(), search = typeof location === "undefined" ? "" : location.search): League {
  const asked = new URLSearchParams(search).get("league")?.toUpperCase();
  if (asked === "NFL" || asked === "CFB") return asked;
  const f = new Intl.DateTimeFormat("en-US", { timeZone: CT, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const day = DAYS.indexOf(f.find((p) => p.type === "weekday")?.value ?? "");
  const hour = Number(f.find((p) => p.type === "hour")?.value ?? 0);
  return day === 0 || day === 1 || (day === 2 && hour < 8) ? "NFL" : "CFB";
}
