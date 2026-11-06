/**
 * Teams that play on a field picture of their own in the simulator: every NFL club (public/field-art/nfl/, retro-inspired designs) and the
 * college teams listed here (public/field-art/cfb/). Each is a whole field, end zones included, cropped to the playing surface and drawn in place
 * of the plain turf, end zones, yard lines and numbers when that team is at home. Keyed by logo id.
 */
export const RETRO_FIELDS: ReadonlySet<string> = new Set(["arizona-cardinals", "atlanta-falcons", "baltimore-ravens", "buffalo-bills", "carolina-panthers", "chicago-bears", "cincinnati-bengals", "cleveland-browns", "dallas-cowboys", "denver-broncos", "detroit-lions", "green-bay-packers", "houston-texans", "indianapolis-colts", "jacksonville-jaguars", "kansas-city-chiefs", "las-vegas-raiders", "los-angeles-chargers", "los-angeles-rams", "miami-dolphins", "minnesota-vikings", "new-england-patriots", "new-orleans-saints", "new-york-giants", "new-york-jets", "philadelphia-eagles", "pittsburgh-steelers", "san-francisco-49ers", "seattle-seahawks", "tampa-bay-buccaneers", "tennessee-titans", "washington-commanders"]);
export const CFB_FIELDS: ReadonlySet<string> = new Set(["alabama", "arizona", "arizona-state", "arkansas", "auburn", "baylor", "byu", "colorado", "east-carolina", "florida", "florida-atlantic", "georgia", "houston", "missouri", "oklahoma-state", "ole-miss", "south-carolina", "southern-miss", "tcu", "texas-a-m"]);
export const retroFieldSrc = (logoId: string | undefined, league: "NFL" | "CFB" = "NFL"): string | null =>
  logoId && (league === "NFL" ? RETRO_FIELDS : CFB_FIELDS).has(logoId) ? `/field-art/${league === "NFL" ? "nfl" : "cfb"}/${logoId}.webp` : null;
