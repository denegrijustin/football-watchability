/**
 * The 32 NFL clubs' retro-inspired field pictures (public/field-art/nfl/, one per club, by logo id). Each is a whole field, end zones included,
 * cropped to the playing surface and drawn in place of the plain turf, end zones, yard lines and numbers when that club is at home in the simulator.
 * They are original concept art, not reconstructions of a historical field.
 */
export const RETRO_FIELDS: ReadonlySet<string> = new Set(["arizona-cardinals", "atlanta-falcons", "baltimore-ravens", "buffalo-bills", "carolina-panthers", "chicago-bears", "cincinnati-bengals", "cleveland-browns", "dallas-cowboys", "denver-broncos", "detroit-lions", "green-bay-packers", "houston-texans", "indianapolis-colts", "jacksonville-jaguars", "kansas-city-chiefs", "las-vegas-raiders", "los-angeles-chargers", "los-angeles-rams", "miami-dolphins", "minnesota-vikings", "new-england-patriots", "new-orleans-saints", "new-york-giants", "new-york-jets", "philadelphia-eagles", "pittsburgh-steelers", "san-francisco-49ers", "seattle-seahawks", "tampa-bay-buccaneers", "tennessee-titans", "washington-commanders"]);
export const retroFieldSrc = (logoId: string | undefined): string | null => (logoId && RETRO_FIELDS.has(logoId) ? `/field-art/nfl/${logoId}.webp` : null);
