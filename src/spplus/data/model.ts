import type { Cell, SheetSnapshot, Snapshot } from "./snapshotTypes";
import { dateOf, num, parseRecord, raw, recordOf, str, timeOf } from "./cells";
import { DIVISIONS, type DivKey, type GameResult, type Model, type PerfRow, type Projection, type SeasonLine, type SmallGame, type Team, type TeamWeek, type TopRow } from "./types";
import logoMap from "../logoMap";
import fcsLogos from "../../data/fcs-logos.json" with { type: "json" };
import d2Logos from "../../data/d2-logos.json" with { type: "json" };

type Keyed = Record<string, number>;

/** Header text -> canonical field. The sheet repeats "Rk", which belongs to the rating before it. */
function mapHeaders(header: Cell[], from: number, to: number): Keyed {
  const out: Keyed = {};
  let prev = "";
  for (let i = from; i < to; i++) {
    const h = (str(header[i]) ?? "").toLowerCase();
    if (!h) continue;
    let key: string | null = null;
    if (h === "team") key = "team";
    else if (/conference/.test(h)) key = "conf";
    else if (/^rec/.test(h)) key = "rec";
    else if (/^(2026 )?sp\+$/.test(h)) key = "sp";
    else if (/^off/.test(h)) key = "off";
    else if (/^def/.test(h)) key = "def";
    else if (/^st sp/.test(h)) key = "st";
    else if (h === "pctile") key = "pctile";
    else if (h === "last wk" || h === "lw") key = "lastRk";
    else if (h === "chg" || h === "lw rk") key = "chg";
    else if (h === "rk") key = prev ? `${prev}Rk` : null;
    if (key) { out[key] = i; if (h !== "rk") prev = key; }
  }
  return out;
}

const sheetMap = (snap: Snapshot) => new Map(snap.sheets.map((s) => [s.name, s]));

function cleanConf(c: string | null): string | null {
  return c ? c.replace(/\s*\((FBS|FCS)\)\s*$/i, "").trim() : null;
}

function parseDivisionSheet(sh: SheetSnapshot, division: DivKey, week: number): TeamWeek[] {
  const h = sh.rows[0] ?? [];
  const sep = h.findIndex((c, i) => c == null && i > 3);
  // The FBS tab's rating table starts after its game list (column O); the other tabs start at column A.
  const start = division === "FBS" ? h.findIndex((c) => str(c) === "Team") : 0;
  const end = division === "FBS" ? h.length : sep < 0 ? h.length : sep;
  const m = mapHeaders(h, start, end);
  const out: TeamWeek[] = [];
  for (let r = 1; r < sh.rows.length; r++) {
    const row = sh.rows[r];
    const team = str(row[m.team]);
    if (!team) continue;
    out.push({
      week, division, team, conf: str(row[m.conf]), record: m.rec != null ? recordOf(row[m.rec]) : null,
      sp: num(row[m.sp]), spRk: num(row[m.spRk]),
      off: num(row[m.off]), offRk: num(row[m.offRk]),
      def: num(row[m.def]), defRk: num(row[m.defRk]),
      st: num(row[m.st]), stRk: num(row[m.stRk]),
      pctile: m.pctile != null ? num(row[m.pctile]) : null,
      lastRk: m.lastRk != null ? num(row[m.lastRk]) : null,
      chg: m.chg != null ? num(row[m.chg]) : null,
      src: { sheet: sh.name, row: r + 1 },
    });
  }
  return out;
}

function parseTop(sh: SheetSnapshot, week: number): TopRow[] {
  const m = mapHeaders(sh.rows[0] ?? [], 0, 9);
  const out: TopRow[] = [];
  for (let r = 1; r < sh.rows.length; r++) {
    const row = sh.rows[r];
    const team = str(row[m.team]);
    if (!team) continue;
    out.push({
      week, team, conf: str(row[m.conf]), record: recordOf(row[m.rec]),
      sp: num(row[m.sp]), spRk: num(row[m.spRk]), off: num(row[m.off]), offRk: num(row[m.offRk]), def: num(row[m.def]), defRk: num(row[m.defRk]),
      division: null, src: { sheet: sh.name, row: r + 1 },
    });
  }
  return out;
}

function splitGame(text: string): { away: string; home: string; neutral: boolean } {
  let m = /^(.*?)\s+at\s+(.*)$/.exec(text);
  if (m) return { away: m[1].trim(), home: m[2].trim(), neutral: false };
  m = /^(.*?)\s+vs\.?\s+(.*)$/.exec(text);
  if (m) return { away: m[1].trim(), home: m[2].trim(), neutral: true };
  return { away: text, home: "", neutral: false };
}

function parseSpread(text: string | null): { team: string | null; pts: number | null } {
  if (!text) return { team: null, pts: null };
  const m = /^(.*?)\s+([+-]\d+(?:\.\d+)?)$/.exec(text.trim());
  if (m) return { team: m[1].trim(), pts: Math.abs(parseFloat(m[2])) };
  if (/\b(pk|pick|even)\b/i.test(text)) return { team: null, pts: 0 };
  return { team: null, pts: null };
}

function parseProjections(sh: SheetSnapshot, week: number): Projection[] {
  const out: Projection[] = [];
  const h = sh.rows[0] ?? [];
  const idx = (name: string) => h.findIndex((c) => str(c) === name);
  const ix = { date: idx("Date"), time: idx("Time (ET)"), game: idx("Game"), win: idx("Proj. winner"), mar: idx("Proj. margin"), wp: idx("Win prob."), sc: idx("Proj. score (rounded)"), sp: idx("Spread"), ats: idx("ATS Pick"), sd: idx("Spread diff"), ou: idx("O/U"), oup: idx("O/U pick"), oud: idx("O/U diff") };
  for (let r = 1; r < sh.rows.length; r++) {
    const row = sh.rows[r];
    const game = str(row[ix.game]);
    if (!game) continue;
    const g = splitGame(game);
    const spread = str(row[ix.sp]);
    const ps = parseSpread(spread);
    out.push({
      id: `w${week}-r${r + 1}`, week, row: r + 1, date: dateOf(row[ix.date]), time: timeOf(row[ix.time]), game, ...g,
      projWinner: str(row[ix.win]), projMargin: num(row[ix.mar]), winProb: num(row[ix.wp]), projScore: str(row[ix.sc]),
      spread, spreadTeam: ps.team, spreadPts: ps.pts, atsPick: str(row[ix.ats]), spreadDiff: num(row[ix.sd]),
      ou: num(row[ix.ou]), ouPick: str(row[ix.oup]), ouDiff: num(row[ix.oud]),
    });
  }
  return out;
}

function parseSmallGames(sh: SheetSnapshot, division: DivKey, week: number): SmallGame[] {
  const h = sh.rows[0] ?? [];
  const di = h.findIndex((c) => str(c) === "Date");
  if (di < 0) return [];
  const out: SmallGame[] = [];
  let group = str(h[di + 1]) ?? "";
  for (let r = 1; r < sh.rows.length; r++) {
    const text = str(sh.rows[r][di + 1]);
    if (!text) continue;
    // A repeated "Date | <heading>" row starts the next sub-table (cross-division games).
    if (str(sh.rows[r][di]) === "Date") { group = text; continue; }
    const parts = text.split(/,\s*(?=[^,]*\s-?\d+(?:\.\d+)?$)/).map((p) => /^(.*)\s(-?\d+(?:\.\d+)?)$/.exec(p.trim()));
    const sides = parts.length === 2 && parts.every(Boolean) ? parts.map((p) => ({ team: p![1], rating: parseFloat(p![2]) })) : null;
    out.push({ id: `${division}-w${week}-r${r + 1}`, week, division, row: r + 1, date: dateOf(sh.rows[r][di]), group, text, sides });
  }
  return out;
}

function parseResults(sh: SheetSnapshot): { results: GameResult[]; season: SeasonLine[] } {
  const results: GameResult[] = [];
  const season: SeasonLine[] = [];
  for (let r = 1; r < sh.rows.length; r++) {
    const row = sh.rows[r];
    const team = str(row[1]);
    const date = dateOf(row[0]);
    if (team && date) {
      results.push({ id: `g${r + 1}`, row: r + 1, date, team, opp: str(row[2]) ?? "", win: num(row[3]), pts: num(row[4]), oppPts: num(row[5]), margin: num(row[6]), pgwe: num(row[7]), adjMgn: num(row[8]) });
    }
    const name = str(row[10]);
    if (name) season.push({ row: r + 1, team: name, games: num(row[11]), wins: num(row[12]), secondOrder: num(row[13]), diff: num(row[14]), scoringMgn: num(row[15]), adjMgn: num(row[16]), mgnDiff: num(row[17]) });
  }
  return { results, season };
}

function parsePerf(sh: SheetSnapshot): PerfRow[] {
  const out: PerfRow[] = [];
  let section: PerfRow["section"] = "fbs-fbs";
  const recText = (c: Cell): string | null => {
    const r = recordOf(c);
    return r ? r.text : null;
  };
  for (let r = 1; r < sh.rows.length; r++) {
    const row = sh.rows[r];
    const a = raw(row[0]);
    const label = typeof a === "number" ? String(a) : typeof a === "string" ? a : null;
    if (/^LAST YEAR/i.test(str(row[0]) ?? "")) { section = "last-year"; continue; }
    if (label === "Week") {
      // A repeated header row; the small FBS-vs-FCS table has its own.
      if (/FBS vs\. FCS/.test(str(row[1]) ?? "")) section = "fbs-fcs";
      continue;
    }
    if (label == null) continue;
    const hasData = row.slice(1).some((c) => c !== null);
    if (!hasData && !/postseason/i.test(label)) continue;
    out.push({
      id: `p${r + 1}`, section, row: r + 1, hidden: sh.hiddenRows.includes(r + 1),
      week: label.replace(/\.0$/, ""),
      ats: recText(row[1]), atsPct: num(row[2]), atsAbs: num(row[3]), atsMed: num(row[4]),
      ou: recText(row[5]), ouPct: num(row[6]), ouAbs: num(row[7]), ouMed: num(row[8]),
      total: /^total$/i.test(label),
    });
  }
  return out;
}

/** An FCS or Division II school's logo (ESPN's, or its own site's, fetched by scripts/fetch-school-logos.mjs), or null when the school has none yet. */
const schoolLogo = (division: string, name: string): { local: string } | null => {
  const e = ((division === "FCS" ? fcsLogos : division === "D2" ? d2Logos : null)?.teams as Record<string, { src: string }> | undefined)?.[name];
  return e ? { local: e.src } : null;
};

export function buildModel(snap: Snapshot): Model {
  const sheets = sheetMap(snap);
  const issues: string[] = [];
  const divRx = /^(FBS|FCS|D2|D3|NAIA) Week (\d+)$/;
  const topRx = /^TOP 772 WEEK (\d+)$/;
  const teamWeeks: TeamWeek[] = [];
  const tops: TopRow[] = [];
  const projections: Projection[] = [];
  const smallGames: SmallGame[] = [];
  const weekSet = new Set<number>();

  for (const sh of snap.sheets) {
    let m = divRx.exec(sh.name);
    if (m) {
      const division = m[1] as DivKey, week = +m[2];
      weekSet.add(week);
      teamWeeks.push(...parseDivisionSheet(sh, division, week));
      if (division === "FBS") projections.push(...parseProjections(sh, week));
      else smallGames.push(...parseSmallGames(sh, division, week));
      continue;
    }
    m = topRx.exec(sh.name);
    if (m) { tops.push(...parseTop(sh, +m[1])); weekSet.add(+m[1]); }
  }
  const weeks = [...weekSet].sort((a, b) => a - b);
  const latest = weeks[weeks.length - 1] ?? 0;

  // Teams by division + name; the same name can exist in two divisions (Cornell, Monmouth, Anderson).
  const teams: Team[] = [];
  const byId = new Map<string, Team>();
  const byName = new Map<string, Team[]>();
  for (const tw of teamWeeks) {
    const id = `${tw.division}:${tw.team}`;
    let t = byId.get(id);
    if (!t) {
      const lg = (logoMap as Record<string, { local?: string; remote?: string }>)[tw.team];
      t = { id, name: tw.team, division: tw.division, weeks: {}, top: {}, latest: 0, logo: tw.division === "FBS" && lg ? lg : schoolLogo(tw.division, tw.team) };
      byId.set(id, t); teams.push(t);
      byName.set(tw.team, [...(byName.get(tw.team) ?? []), t]);
    }
    t.weeks[tw.week] = tw;
    t.latest = Math.max(t.latest, tw.week);
  }
  // Link cross-division rows to a division: by name, and by conference when two divisions share a name.
  for (const tr of tops) {
    const cands = byName.get(tr.team) ?? [];
    let pick = cands.length === 1 ? cands[0] : undefined;
    if (!pick && cands.length > 1) {
      // "MWC (D3)": the sheet tags the division when two divisions share a name.
      const tag = /\((FBS|FCS|D2|D3|NAIA)\)\s*$/i.exec(tr.conf ?? "")?.[1]?.toUpperCase();
      pick = tag ? cands.find((t) => t.division === tag) : undefined;
    }
    if (!pick && cands.length > 1) {
      const c = cleanConf(tr.conf);
      pick = cands.find((t) => cleanConf(t.weeks[tr.week]?.conf ?? null) === c) ?? cands.find((t) => cleanConf(t.weeks[t.latest]?.conf ?? null) === c);
    }
    if (pick) { tr.division = pick.division; pick.top[tr.week] = tr; }
    else issues.push(`No division tab row for "${tr.team}" in ${tr.src.sheet}`);
  }

  const pg = sheets.get("POSTGAME WIN EXPECTANCY");
  const { results, season } = pg ? parseResults(pg) : { results: [], season: [] };
  const perfSheet = sheets.get("SP+ performance");
  const perf = perfSheet ? parsePerf(perfSheet) : [];

  const conferences = {} as Record<DivKey, string[]>;
  for (const d of DIVISIONS) {
    const set = new Set<string>();
    for (const t of teams) if (t.division === d) { const c = t.weeks[t.latest]?.conf; if (c) set.add(c); }
    conferences[d] = [...set].sort((a, b) => a.localeCompare(b));
  }
  return { weeks, latest, teams, byId, byName, projections, smallGames, results, season, perf, conferences, issues };
}

/** Records by W-L for display and win% math. */
export const winPct = (rec: string | null | undefined): number | null => {
  const r = parseRecord(rec);
  return r && r.w + r.l + r.t > 0 ? (r.w + r.t / 2) / (r.w + r.l + r.t) : null;
};
