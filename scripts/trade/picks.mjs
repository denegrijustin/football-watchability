// Who owns which picks in the next draft, from nflverse's list of every trade ever made (one row per asset: a player or a pick, who gave it, who got it).
// Pure, so the build script and the tests share it. Each club starts with its own seven picks (rounds 1 to 7); every completed trade of a pick in that
// draft then moves it. A pick is identified by its original club and round, so a pick that changed hands twice is followed. A conditional pick (one that
// only changes hands if something happens, such as a player's playing time) is NOT moved: it is listed separately so the page can say it is left out.
// Compensatory picks are awarded after free agency and are not in the data.

export const CLUBS = ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC", "LA", "LAC", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS"];

/** The draft a date is "before": the draft is in April, so from May on the next one is next year's. */
export function nextDraftSeason(now = new Date()) {
  return now.getUTCMonth() >= 4 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

/** Parse the CSV (comma-separated, double-quoted fields that may contain commas) into objects. */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

/**
 * Ownership of the `season` draft's picks. Returns { byTeam: { KC: [{ round, from }] }, conditional: [{ round, from, to }], asOf }.
 * `from` is the club the pick originally belonged to (its slot in the draft is that club's record, not the owner's).
 */
export function ownership(rows, season) {
  const picks = rows
    .filter((r) => String(r.pick_season) === String(season) && r.pick_round && r.gave && r.received)
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date) || Number(a.trade_id) - Number(b.trade_id));
  const own = new Map(); // "ORIGIN-round" -> current owner
  for (const c of CLUBS) for (let r = 1; r <= 7; r++) own.set(`${c}-${r}`, c);
  const conditional = [];
  for (const t of picks) {
    const round = Number(t.pick_round);
    if (t.conditional === "1") { conditional.push({ round, from: t.gave, to: t.received, date: t.trade_date }); continue; }
    // the giver's own pick of that round if it still has it, otherwise any pick of that round it holds
    const own1 = `${t.gave}-${round}`;
    let key = own.get(own1) === t.gave ? own1 : null;
    if (!key) for (const [k, v] of own) if (v === t.gave && k.endsWith(`-${round}`)) { key = k; break; }
    if (key) own.set(key, t.received);
  }
  const byTeam = Object.fromEntries(CLUBS.map((c) => [c, []]));
  for (const [k, owner] of own) {
    const [from, round] = k.split("-");
    byTeam[owner]?.push({ round: Number(round), from });
  }
  for (const c of CLUBS) byTeam[c].sort((a, b) => a.round - b.round || (a.from === c ? -1 : b.from === c ? 1 : a.from.localeCompare(b.from)));
  const asOf = rows.reduce((m, r) => (r.trade_date > m ? r.trade_date : m), "");
  return { byTeam, conditional, asOf };
}
