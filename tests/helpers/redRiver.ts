import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

/**
 * A Texas @ Oklahoma game in the served slate, whatever week the data is from. The data refreshes every hour and the slate moves on, so
 * tests about that one game take an ordinary college game from the slate and rewrite it into the Red River game before the page loads.
 */
export async function withRedRiver(page: Page) {
  const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
  const g = slate.games.find((x: any) => x.league === "CFB");
  if (!g) throw new Error("no college game in the slate to turn into the Red River game");
  g.matchup = "Texas @ Oklahoma";
  g.meta = "Sat · Dallas, TX (neutral site)";
  g.event = null;
  g.conferences = ["sec"];
  g.teams[0] = { ...g.teams[0], name: "Texas Longhorns", abbr: "TEX", logoId: "texas", color: "#bf5700" };
  g.teams[1] = { ...g.teams[1], name: "Oklahoma Sooners", abbr: "OU", logoId: "oklahoma", color: "#841617" };
  await page.route("**/data/slate.json", (route) => route.fulfill({ json: slate }));
  const games = slate.games.filter((x: any) => x.league === "CFB");
  return { slate, g, games };
}
