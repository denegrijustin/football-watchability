// Stadium capacities from Wikipedia's maintained stadium lists.
//
// ESPN's venue endpoint names every stadium but publishes no capacity, so scripts/attendance.mjs
// fills the gaps from these tables:
//   List of current NFL stadiums, List of NCAA Division I FBS football stadiums, and the FCS list.
// A stadium is matched by name (and by state when its name appears more than once). A name that
// matches no row, or several rows we can't tell apart, gets no capacity. Nothing is guessed.

export const WIKI_PAGES = [
  "List of current NFL stadiums",
  "List of NCAA Division I FBS football stadiums",
  "List of NCAA Division I FCS football stadiums",
];

const STATES = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT",
  delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

/** "Michigan", "MI" or "Ann Arbor, Michigan" -> "MI" (empty when it isn't a US state we know). */
export function stateCode(s) {
  const t = String(s ?? "").replace(/\[[^\]]*\]/g, "").trim();
  if (/^[A-Z]{2}$/.test(t)) return t;
  const last = t.split(",").pop().trim().toLowerCase();
  return STATES[last] ?? "";
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘" };
const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
/** Text of a table cell: tags, footnote markers and extra whitespace removed. */
const cellText = (html) =>
  decode(
    html
      .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
      .replace(/<sup[\s\S]*?<\/sup>/gi, "")
      .replace(/<br\s*\/?>/gi, ", ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Every wikitable on a page as rows of cell text, with rowspan and colspan filled in. */
export function parseTables(html) {
  const tables = [];
  for (const [, body] of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const grid = [];
    const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
    rows.forEach(([, rowHtml], r) => {
      grid[r] ??= [];
      let c = 0;
      for (const [, attrs, inner] of rowHtml.matchAll(/<t[hd]\b([^>]*)>([\s\S]*?)<\/t[hd]>/gi)) {
        while (grid[r][c] !== undefined) c++; // a cell above already covers this column
        const rs = Math.max(1, Number(/rowspan="?(\d+)/i.exec(attrs)?.[1] ?? 1));
        const cs = Math.max(1, Number(/colspan="?(\d+)/i.exec(attrs)?.[1] ?? 1));
        const text = cellText(inner);
        for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) (grid[r + i] ??= [])[c + j] = text;
        c += cs;
      }
    });
    if (grid.length > 1) tables.push(grid);
  }
  return tables;
}

export const normName = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/&/g, " and ")
    .replace(/\bsaint\b/g, "st")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, "");

/** First plausible capacity in a cell ("107,601", "70,000 (expandable)"). */
const capacityOf = (text) => {
  const m = /\d{1,3}(?:,\d{3})+|\d{4,6}/.exec(text);
  const n = m ? Number(m[0].replace(/,/g, "")) : NaN;
  return n >= 1000 && n <= 200000 ? n : null;
};

/** Stadium rows (name, capacity, state) from every table that has a stadium column and a capacity column. */
export function stadiumRows(html) {
  const out = [];
  for (const grid of parseTables(html)) {
    const head = grid.findIndex((row) => row.some((t) => /capacity/i.test(t ?? "")) && row.some((t) => /^(stadium|name|venue)/i.test((t ?? "").trim())));
    if (head < 0) continue;
    const col = (re) => grid[head].findIndex((t) => re.test((t ?? "").trim()));
    const name = col(/^(stadium|name|venue)/i);
    const cap = col(/capacity/i);
    const state = col(/^state/i);
    const location = col(/^(location|city)/i);
    for (const row of grid.slice(head + 1)) {
      const capacity = capacityOf(row[cap] ?? "");
      const stadium = (row[name] ?? "").trim();
      if (!capacity || !stadium) continue;
      out.push({ name: stadium, key: normName(stadium), capacity, state: stateCode(state >= 0 ? row[state] : "") || stateCode(location >= 0 ? row[location] : "") });
    }
  }
  return out;
}

/** An index of rows by normalized stadium name. */
export function buildIndex(rows) {
  const by = new Map();
  for (const r of rows) by.set(r.key, [...(by.get(r.key) ?? []), r]);
  return by;
}

/**
 * Capacity for one stadium, or null. A name that is in the lists once is a match. A name that is
 * in them several times (Memorial Stadium, Tiger Stadium) needs its state to pick exactly one.
 */
export function lookupCapacity(index, { name, state }) {
  const rows = index.get(normName(name));
  if (!rows?.length) return null;
  const caps = new Set(rows.map((r) => r.capacity));
  if (rows.length === 1 || caps.size === 1) return rows[0].capacity;
  const code = stateCode(state);
  const inState = code ? rows.filter((r) => r.state === code) : [];
  return inState.length === 1 || new Set(inState.map((r) => r.capacity)).size === 1 ? (inState[0]?.capacity ?? null) : null;
}

/**
 * Capacity from scripts/venue-capacity-alt-sites.json: overseas, neutral-site and alternate-home
 * stadiums. A site matches by name or alias; a US site also needs the venue's state to agree, which
 * keeps "War Memorial Stadium" in Little Rock apart from Wyoming's. Approximate entries (ranges,
 * records, stale names) are kept for reference but never used.
 */
export function altSiteCapacity(sites, { name, state }) {
  const key = normName(name);
  const code = stateCode(state);
  for (const s of sites) {
    if (s.approximate || !s.capacity) continue;
    if (![s.name, ...(s.aliases ?? [])].some((n) => normName(n) === key)) continue;
    if (s.state && s.state !== code) continue;
    return s.capacity;
  }
  return null;
}
