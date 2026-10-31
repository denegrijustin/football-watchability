// Rivalries: which games are one, how much that adds to the watch score, the line for "why watch" and the trophy (if the teams play for one).
// A rivalry is either a named one from the list below, or a long series between teams in the same conference or division, so a game nobody has
// named still counts when the two teams have met dozens of times. Pure, so build-slate, write-narratives, the migration script and the tests share it.
//
// Pairs are keyed by the site's logo ids (the same ids on every team in the slate). `trophy.icon` names a drawing in src/components/TrophyIcon.tsx.

export const RIVALRY_MAX = 4;

const T = (name, icon) => ({ name, icon });

/** [teamA, teamB, name, trophy?]. Only trophies I am sure of are listed; a named rivalry without one still counts as a rivalry. */
export const RIVALRIES = [
  // College: trophy games
  ["ole-miss", "mississippi-state", "Egg Bowl", T("Golden Egg", "egg")],
  ["texas", "oklahoma", "Red River Rivalry", T("Golden Hat", "hat")],
  ["michigan", "michigan-state", "Michigan–Michigan State", T("Paul Bunyan–Governor of Michigan Trophy", "axe")],
  ["michigan", "minnesota", "Little Brown Jug", T("Little Brown Jug", "jug")],
  ["minnesota", "wisconsin", "Border Battle", T("Paul Bunyan's Axe", "axe")],
  ["iowa", "minnesota", "Floyd of Rosedale", T("Floyd of Rosedale", "pig")],
  ["iowa", "wisconsin", "Heartland Trophy game", T("Heartland Trophy", "cup")],
  ["iowa", "nebraska", "Heroes Game", T("Heroes Trophy", "cup")],
  ["indiana", "purdue", "Old Oaken Bucket", T("Old Oaken Bucket", "bucket")],
  ["illinois", "northwestern", "Land of Lincoln", T("Land of Lincoln Trophy", "cup")],
  ["army", "navy", "Army–Navy Game", T("Commander-in-Chief's Trophy", "cup")],
  ["air-force", "army", "Army–Air Force", T("Commander-in-Chief's Trophy", "cup")],
  ["air-force", "navy", "Navy–Air Force", T("Commander-in-Chief's Trophy", "cup")],
  ["notre-dame", "usc", "Notre Dame–USC", T("Jeweled Shillelagh", "club")],
  ["washington", "washington-state", "Apple Cup", T("Apple Cup", "cup")],
  ["oregon", "oregon-state", "Civil War", T("Platypus Trophy", "cup")],
  ["california", "stanford", "The Big Game", T("The Axe", "axe")],
  ["ucla", "usc", "Victory Bell", T("Victory Bell", "bell")],
  ["texas", "texas-a-m", "Lone Star Showdown", T("Silver Spurs Trophy", "cup")],
  ["arkansas", "lsu", "Battle for the Golden Boot", T("Golden Boot", "boot")],
  ["lsu", "ole-miss", "Magnolia Bowl", T("Magnolia Bowl", "cup")],
  ["kentucky", "louisville", "Battle for the Governor's Cup", T("Governor's Cup", "cup")],
  ["kentucky", "tennessee", "Battle for the Beer Barrel", T("Beer Barrel", "barrel")],
  ["georgia", "georgia-tech", "Clean, Old-Fashioned Hate", T("Governor's Cup", "cup")],
  ["virginia", "virginia-tech", "Battle for the Commonwealth Cup", T("Commonwealth Cup", "cup")],
  ["duke", "north-carolina", "Victory Bell game", T("Victory Bell", "bell")],
  ["kansas", "kansas-state", "Sunflower Showdown", T("Governor's Cup", "cup")],
  ["colorado-state", "wyoming", "Border War", T("Bronze Boot", "boot")],
  ["byu", "utah-state", "Battle of the Brothers", T("Old Wagon Wheel", "wheel")],
  ["smu", "tcu", "Battle for the Iron Skillet", T("Iron Skillet", "skillet")],
  ["virginia-tech", "west-virginia", "Black Diamond Trophy game", T("Black Diamond Trophy", "cup")],
  ["akron", "kent-state", "Wagon Wheel Game", T("Wagon Wheel", "wheel")],
  ["cincinnati", "miami-oh-", "Battle for the Victory Bell", T("Victory Bell", "bell")],
  ["michigan-state", "penn-state", "Land Grant Trophy game", T("Land Grant Trophy", "cup")],
  ["iowa", "iowa-state", "Cy-Hawk Trophy game", T("Cy-Hawk Trophy", "cup")],
  // College: more trophy games (names from the supplied rivalry package, cross-checked with the CFB Labs list)
  ["arkansas", "missouri", "Battle Line Trophy", T("Battle Line Trophy", "cup")],
  ["bowling-green", "toledo", "Battle of I-75 Trophy", T("Battle of I-75 Trophy", "cup")],
  ["houston", "rice", "Bayou Bucket", T("Bayou Bucket", "bucket")],
  ["byu", "utah", "Beehive Boot", T("Beehive Boot", "boot")],
  ["syracuse", "west-virginia", "Ben Schwartzwalder Trophy", T("Ben Schwartzwalder Trophy", "cup")],
  ["utah-state", "wyoming", "Bridger Rifle", T("Bridger Rifle", "rifle")],
  ["colorado", "colorado-state", "Centennial Cup", T("Centennial Cup", "cup")],
  ["ball-state", "northern-illinois", "Bronze Stalk Trophy", T("Bronze Stalk Trophy", "cup")],
  ["maryland", "navy", "Crab Bowl Trophy", T("Crab Bowl Trophy", "cup")],
  ["florida-atlantic", "fiu", "Don Shula Award", T("Don Shula Award", "cup")],
  ["hawaii", "san-jose-state", "Dick Tomey Legacy Trophy", T("Dick Tomey Legacy Trophy", "cup")],
  ["nebraska", "wisconsin", "Freedom Trophy", T("Freedom Trophy", "cup")],
  ["nevada", "unlv", "Fremont Cannon", T("Fremont Cannon", "cannon")],
  ["navy", "smu", "Gansz Trophy", T("Gansz Trophy", "cup")],
  ["michigan", "northwestern", "George Jewett Trophy", T("George Jewett Trophy", "cup")],
  ["minnesota", "penn-state", "Governor's Victory Bell", T("Governor's Victory Bell", "bell")],
  ["boston-college", "notre-dame", "Ireland Trophy", T("Ireland Trophy", "cup")],
  ["illinois", "ohio-state", "Illibuck Trophy", T("Illibuck Trophy", "cup")],
  ["hawaii", "unlv", "Island Showdown Trophy", T("Island Showdown Trophy", "cup")],
  ["air-force", "hawaii", "Kuter Trophy", T("Kuter Trophy", "cup")],
  ["notre-dame", "stanford", "Legends Trophy", T("Legends Trophy", "cup")],
  ["missouri", "south-carolina", "Mayor's Cup", T("Mayor's Cup", "cup")],
  ["rice", "smu", "Mayors' Cup", T("Mayors' Cup", "cup")],
  ["eastern-michigan", "western-michigan", "Michigan MAC Trophy", T("Michigan MAC Trophy", "cup")],
  ["notre-dame", "michigan-state", "Megaphone Trophy", T("Megaphone Trophy", "megaphone")],
  ["boise-state", "fresno-state", "Milk Can", T("Milk Can", "can")],
  ["boston-college", "clemson", "O'Rourke-McFadden Trophy", T("O'Rourke-McFadden Trophy", "cup")],
  ["fresno-state", "san-diego-state", "Oil Can", T("Oil Can", "can")],
  ["indiana", "michigan-state", "Old Brass Spittoon", T("Old Brass Spittoon", "cup")],
  ["hawaii", "wyoming", "Paniolo Trophy", T("Paniolo Trophy", "cup")],
  ["illinois", "purdue", "Purdue Cannon", T("Purdue Cannon", "cannon")],
  ["air-force", "colorado-state", "Ram-Falcon Trophy", T("Ram-Falcon Trophy", "cup")],
  ["ball-state", "miami-oh-", "Red Bird Trophy", T("Red Bird Trophy", "cup")],
  ["new-mexico-state", "utep", "Silver Spade", T("Silver Spade", "spade")],
  ["notre-dame", "purdue", "Shillelagh Trophy", T("Shillelagh Trophy", "club")],
  ["tcu", "texas-tech", "Saddle Trophy", T("Saddle Trophy", "cup")],
  ["iowa-state", "missouri", "Telephone Trophy", T("Telephone Trophy", "phone")],
  ["arizona", "arizona-state", "Territorial Cup", T("Territorial Cup", "cup")],
  ["clemson", "nc-state", "Textile Bowl", T("Textile Bowl", "cup")],
  ["memphis", "uab", "Bones Trophy", T("Bones Trophy", "cup")],
  ["south-alabama", "troy", "Belt", T("Belt", "cup")],
  ["southern-miss", "tulane", "Bell", T("Bell", "bell")],
  ["cincinnati", "louisville", "Keg of Nails", T("Keg of Nails", "barrel")],
  ["middle-tennessee", "troy", "Palladium Trophy", T("Palladium Trophy", "cup")],
  ["lsu", "tulane", "Rag", T("Rag", "cup")],
  ["fresno-state", "san-jose-state", "Valley Cup", T("Valley Cup", "cup")],
  ["ucf", "south-florida", "War on I-4 Trophy", T("War on I-4 Trophy", "cup")],
  // College: named, no trophy
  ["alabama", "auburn", "Iron Bowl"],
  ["michigan", "ohio-state", "The Game"],
  ["florida", "georgia", "World's Largest Outdoor Cocktail Party"],
  ["florida", "florida-state", "Sunshine Showdown"],
  ["auburn", "georgia", "Deep South's Oldest Rivalry"],
  ["oklahoma", "oklahoma-state", "Bedlam"],
  ["clemson", "south-carolina", "Palmetto Bowl"],
  ["florida-state", "miami-fl-", "Florida State–Miami"],
  ["oregon", "washington", "Oregon–Washington"],
  ["alabama", "tennessee", "Third Saturday in October"],
  ["alabama", "lsu", "Alabama–LSU"],
  ["auburn", "lsu", "Tiger Bowl"],
  ["pittsburgh", "west-virginia", "Backyard Brawl"],
  ["michigan", "notre-dame", "Michigan–Notre Dame"],
  ["notre-dame", "navy", "Notre Dame–Navy"],
  ["ohio-state", "penn-state", "Ohio State–Penn State"],
  ["texas", "texas-tech", "Texas–Texas Tech"],
  ["tennessee", "vanderbilt", "Tennessee–Vanderbilt"],
  ["north-carolina", "nc-state", "Tobacco Road"],
  ["clemson", "georgia-tech", "Clemson–Georgia Tech"],
  ["texas-a-m", "arkansas", "Southwest Classic"],
  // NFL: named rivalries (the league has no series trophies)
  ["chicago-bears", "green-bay-packers", "Bears–Packers"],
  ["dallas-cowboys", "philadelphia-eagles", "Cowboys–Eagles"],
  ["dallas-cowboys", "washington-commanders", "Cowboys–Commanders"],
  ["dallas-cowboys", "new-york-giants", "Cowboys–Giants"],
  ["new-york-giants", "philadelphia-eagles", "Giants–Eagles"],
  ["baltimore-ravens", "pittsburgh-steelers", "Ravens–Steelers"],
  ["cleveland-browns", "pittsburgh-steelers", "Browns–Steelers"],
  ["cincinnati-bengals", "pittsburgh-steelers", "Bengals–Steelers"],
  ["baltimore-ravens", "cincinnati-bengals", "Ravens–Bengals"],
  ["kansas-city-chiefs", "las-vegas-raiders", "Chiefs–Raiders"],
  ["denver-broncos", "las-vegas-raiders", "Broncos–Raiders"],
  ["denver-broncos", "kansas-city-chiefs", "Broncos–Chiefs"],
  ["los-angeles-chargers", "kansas-city-chiefs", "Chargers–Chiefs"],
  ["new-england-patriots", "new-york-jets", "Patriots–Jets"],
  ["buffalo-bills", "new-england-patriots", "Bills–Patriots"],
  ["green-bay-packers", "minnesota-vikings", "Packers–Vikings"],
  ["detroit-lions", "green-bay-packers", "Lions–Packers"],
  ["chicago-bears", "detroit-lions", "Bears–Lions"],
  ["san-francisco-49ers", "seattle-seahawks", "49ers–Seahawks"],
  ["los-angeles-rams", "san-francisco-49ers", "Rams–49ers"],
  ["los-angeles-rams", "seattle-seahawks", "Rams–Seahawks"],
  ["atlanta-falcons", "new-orleans-saints", "Falcons–Saints"],
  ["miami-dolphins", "new-york-jets", "Dolphins–Jets"],
  ["buffalo-bills", "miami-dolphins", "Bills–Dolphins"],
  ["indianapolis-colts", "new-england-patriots", "Colts–Patriots"],
  ["houston-texans", "tennessee-titans", "Texans–Titans"],
  ["jacksonville-jaguars", "tennessee-titans", "Jaguars–Titans"],
];

const pairKey = (a, b) => [a, b].sort().join("|");
const BY_PAIR = new Map(RIVALRIES.map(([a, b, name, trophy]) => [pairKey(a, b), { name, trophy: trophy ?? null }]));
export const namedRivalry = (a, b) => BY_PAIR.get(pairKey(a, b)) ?? null;

/**
 * The series between two teams from the slate's history box: "Michigan leads 62–11–1" with "73 meetings".
 * `names` are the two team names as the slate has them, in away, home order.
 */
export function seriesOf(history, names) {
  const box = history?.boxes?.[0];
  const text = String(box?.value ?? "");
  const total = Number(/^(\d+) meetings?/.exec(String(box?.items?.[0] ?? ""))?.[1]) || 0;
  const m = /(\d+)[–-](\d+)(?:[–-](\d+))?/.exec(text);
  const a = m ? Number(m[1]) : 0, b = m ? Number(m[2]) : 0, ties = m?.[3] ? Number(m[3]) : 0;
  const tied = /tied/i.test(text);
  const lead = tied ? null : names.find((n) => n && text.startsWith(n)) ?? null;
  const win = Math.max(a, b), lose = Math.min(a, b);
  const first = Number(/First meeting: (\d{4})/.exec((box?.items ?? []).join(" "))?.[1]) || null;
  const last = history?.boxes?.[1]?.items?.[0] ?? null;
  return { text, total, win, lose, ties, tied, lead, first, last, allTime: !/since \d{4}/.test(text), share: win + lose ? win / (win + lose) : 0.5 };
}

/**
 * How much of a rivalry this game is, 0 to 1, with its name and trophy.
 *   ids         the two teams' logo ids
 *   sameGroup   same conference (college) or same division (NFL)
 *   series      from seriesOf
 * A named rivalry is 1. Otherwise a long series between teams in one conference (or division) counts, more so when it has been close.
 */
export function rivalryFor({ league, ids, sameGroup, series }) {
  const named = namedRivalry(ids[0], ids[1]);
  let level = 0;
  if (named) level = 1;
  else if (series?.total >= 75 && sameGroup) level = 0.5;
  else if (series?.total >= 45 && sameGroup) level = 0.3;
  else if (series?.total >= 100) level = 0.3;
  // Closeness matters: an even series feels like a rivalry, a 62-11 one does not.
  if (!named && level) {
    if (series.share > 0.75) level *= 0.5;
    else if (series.total >= 40 && series.share <= 0.58) level = Math.min(1, level + 0.15);
  }
  if (!level) return null;
  void league;
  return { level, name: named?.name ?? null, trophy: named?.trophy ? { ...named.trophy, key: [...ids].sort().join("|") } : null, sameGroup: !!sameGroup, meetings: series?.total ?? 0 };
}

export const rivalryPoints = (r) => Math.round(Math.max(0, Math.min(1, r.level)) * RIVALRY_MAX * 10) / 10;

/** The score-breakdown note: "Iron Bowl · 91 meetings · Golden Egg". */
export function rivalryNote(r, series) {
  return [r.name ?? (r.sameGroup ? "Conference rivals" : "Long-time rivals"), series?.total ? `${series.total} meetings` : null, r.trophy ? r.trophy.name : null].filter(Boolean).join(" · ");
}

/** The "why watch" line: the rivalry, how the series stands, and the trophy. */
export function rivalryLine(r, series, label = "") {
  const head = r.name ? `${r.name}${/bowl|game|battle|showdown|classic|trophy|rivalry|hate|cocktail|oldest|bedlam|brawl|war\b|saturday|cup|jug|axe|bell|boot|bucket|floyd|skillet/i.test(r.name) ? "" : " rivalry"}` : `${r.sameGroup ? "Conference rivals" : "Old rivals"}`;
  const standing = series?.text ? `${series.text.replace(/ since \d{4}$/, "")}${series.total ? ` over ${series.total} meetings` : ""}${series.allTime ? "" : (/since (\d{4})/.exec(series.text) ? ` since ${/since (\d{4})/.exec(series.text)[1]}` : "")}` : "";
  const first = series?.first ? `, first played in ${series.first}` : "";
  const trophy = r.trophy ? `; the winner takes the ${r.trophy.name}` : "";
  return `${head}${label ? ` (${label})` : ""}: ${standing || "a long-running series"}${first}${trophy}.`;
}
