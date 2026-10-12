// Which conference a game belongs to. Pure (the table is passed in), so scripts and tests can import it without the site's data.
export type ConfTable = Record<"CFB" | "NFL", Record<string, string>>;

/** The conference of a team by its logo id: a college conference id ("sec", "big-ten"…) or "afc" / "nfc"; undefined for a team outside the lists (an FCS opponent). */
export const confOfIn = (table: ConfTable, league: "NFL" | "CFB", logoId: string) => table[league][logoId];

/**
 * Whether a game belongs to a conference filter: either team is in it. "all-fbs" (or none) lets everything through, which is also what a
 * college id means for an NFL game and an AFC / NFC id for a college one, so a stale choice never empties the other league.
 */
export function inConferenceIn(table: ConfTable, league: "NFL" | "CFB", conference: string | undefined, logoIds: string[]) {
  if (!conference || conference === "all-fbs") return true;
  const valid = league === "NFL" ? conference === "afc" || conference === "nfc" : conference !== "afc" && conference !== "nfc";
  if (!valid) return true;
  return logoIds.some((id) => confOfIn(table, league, id) === conference);
}
