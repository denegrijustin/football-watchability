/** City names of more than one word, as the broadcast writes them: Green Bay Packers is GB Packers. */
const CITY: Record<string, string> = {
  "Green Bay": "GB", "Kansas City": "KC", "Las Vegas": "LV", "Los Angeles": "LA", "New York": "NY", "San Francisco": "SF",
  "Tampa Bay": "TB", "New England": "NE", "New Orleans": "NO",
};

/** "Green Bay Packers" -> "GB Packers" for the NFL; any other name is left as it is. */
export function shortTeamName(league: string, name: string): string {
  if (league !== "NFL") return name;
  for (const [city, code] of Object.entries(CITY)) if (name.startsWith(`${city} `)) return `${code}${name.slice(city.length)}`;
  return name;
}

/** The short name to look at, with the full one kept for screen readers and search. */
export function TeamName({ league, name }: { league: string; name: string }) {
  const short = shortTeamName(league, name);
  if (short === name) return <>{name}</>;
  return <><span aria-hidden="true">{short}</span><span className="sr-only">{name}</span></>;
}
