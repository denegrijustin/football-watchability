// Rankings and playoff projections from ESPN's FPI feeds (data-raw/{cfb,nfl}-fpi.json), which already
// carry each team's poll ranks, projected record and odds. Nothing here is simulated: the field is
// picked from FPI's own odds and the composite rank, with the rules written down in FORMAT below.
//
// College refreshes once a week at 8am Central Sunday, the NFL at 8am Central Tuesday (cycleKey).

/** College Football Playoff field rules. Change here if the format changes. */
export const FORMAT = {
  teams: 12,
  autoBids: 5, // the five highest-ranked projected conference champions
  byes: 4, // seeds 1-4 skip the first round
  straightSeeding: true, // seeded by rank, champions get no bump
};
export const NFL_FIELD = { perConference: 7, divisionWinners: 4 };
export const COMPOSITE_SIZE = 120;
const UNRANKED = 30; // what a team outside a poll's top 25 counts as when averaging

const num = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

/** One row per team from an FPI feed: its group, polls and every projection column. */
export function parseFpi(feed) {
  const cols = new Map();
  for (const c of feed?.categories ?? []) cols.set(c.name, c.names);
  const out = [];
  for (const t of feed?.teams ?? []) {
    const v = {};
    for (const c of t.categories ?? []) {
      const names = cols.get(c.name) ?? [];
      names.forEach((n, i) => {
        if (v[n] == null) v[n] = c.values?.[i] ?? null;
      });
    }
    const polls = {};
    for (const it of t.team?.ranks?.items ?? []) {
      const cur = num(it.rank?.current);
      if (!cur) continue;
      if (/^ap$/i.test(it.type)) polls.ap = cur;
      else if (/^usa$/i.test(it.type) || /coaches/i.test(it.name ?? "")) polls.coaches = cur;
      else if (/cfp|playoff/i.test(`${it.type} ${it.name}`)) polls.cfp = cur;
    }
    const g = t.team?.group;
    const sunBelt = /^sun belt/i.test(g?.name ?? ""); // ESPN splits it into East and West; it has one champion
    out.push({
      id: String(t.team.id),
      name: t.team.displayName,
      abbr: t.team.abbreviation,
      group: g?.name ?? null,
      groupId: sunBelt ? "37" : g?.id ? String(g.id) : null,
      conf: sunBelt ? "Sun Belt" : g?.isConference === false ? (g?.parent?.abbreviation ?? g?.parent?.shortName ?? null) : g?.shortName === "CUSA" ? "C-USA" : (g?.shortName ?? g?.abbreviation ?? null),
      division: g?.isConference === false && !sunBelt ? g?.name : null,
      independent: /independent/i.test(g?.name ?? ""),
      polls,
      fpi: r1(num(v.fpi)),
      fpiRank: num(v.fpirank),
      wins: num(v.numwins) ?? 0,
      losses: num(v.numlosses) ?? 0,
      ties: num(v.numties) ?? 0,
      projW: r1(num(v.projectedw)),
      projL: r1(num(v.projectedl)),
      pPlayoffs: r1(num(v.probmakeplayoffs)),
      pConf: r1(num(v.probwinconf)),
      pDiv: r1(num(v.probwindiv)),
      pTitle: r1(num(v.probwintitle)),
      pBowl: r1(num(v.prob6wins)),
    });
  }
  return out;
}

/**
 * Composite rank for every team: the average of its AP, Coaches and CFP ranks (an unranked team
 * counts as 30 in a poll) and its ESPN FPI rank. A poll that has not been published yet is left out,
 * and the CFP committee rank counts double once it exists. Ties go to the better FPI rank.
 */
export function cfbComposite(teams) {
  const has = (k) => teams.some((t) => t.polls[k]);
  const sources = [
    { k: "ap", w: 1 },
    { k: "coaches", w: 1 },
    { k: "cfp", w: 2 },
  ].filter((s) => has(s.k));
  const rows = teams.map((t) => {
    let sum = t.fpiRank ?? teams.length;
    let w = 1;
    for (const s of sources) {
      sum += s.w * (t.polls[s.k] ?? UNRANKED);
      w += s.w;
    }
    return { ...t, composite: r1(sum / w) };
  });
  rows.sort((a, b) => a.composite - b.composite || (a.fpiRank ?? 999) - (b.fpiRank ?? 999) || a.name.localeCompare(b.name));
  return { rows: rows.map((t, i) => ({ ...t, rank: i + 1 })), sources: ["fpi", ...sources.map((s) => s.k)] };
}

/** The projected field: five highest-ranked conference champions plus the best of the rest. */
export function cfbPlayoff(ranked, rules = FORMAT) {
  const champs = new Map();
  for (const t of ranked) {
    if (t.independent || !t.groupId || !(t.pConf > 0)) continue;
    const cur = champs.get(t.groupId);
    if (!cur || t.pConf > cur.pConf) champs.set(t.groupId, t); // rows are in rank order, so ties keep the better rank
  }
  const champSet = new Set([...champs.values()].map((t) => t.id));
  const auto = ranked.filter((t) => champSet.has(t.id)).slice(0, rules.autoBids);
  const autoSet = new Set(auto.map((t) => t.id));
  const atLarge = ranked.filter((t) => !autoSet.has(t.id)).slice(0, rules.teams - auto.length);
  const field = [...auto.map((t) => ({ t, bid: "champion" })), ...atLarge.map((t) => ({ t, bid: "at-large" }))]
    .sort((a, b) => a.t.rank - b.t.rank)
    .map(({ t, bid }, i) => ({ seed: i + 1, bye: i < rules.byes, bid, ...slim(t) }));
  const inSet = new Set(field.map((f) => f.id));
  const out = ranked.filter((t) => !inSet.has(t.id)).slice(0, 4).map(slim);
  return { rules, field, out };
}

/** Each conference's most likely champion and how many bowl-eligible teams it projects. */
export function cfbBowls(ranked) {
  const by = new Map();
  for (const t of ranked) {
    const name = t.independent ? "Independents" : (t.conf ?? "Other");
    const g = by.get(name) ?? { name, teams: 0, eligible: [], bubble: [] };
    g.teams++;
    const certain = t.wins >= 6;
    if (certain || (t.pBowl ?? 0) >= 50) g.eligible.push({ ...slim(t), pBowl: certain ? 100 : t.pBowl });
    else if ((t.pBowl ?? 0) >= 20) g.bubble.push({ ...slim(t), pBowl: t.pBowl });
    by.set(name, g);
  }
  const conferences = [...by.values()]
    .map((g) => ({
      ...g,
      eligible: g.eligible.sort((a, b) => b.pBowl - a.pBowl || a.rank - b.rank),
      bubble: g.bubble.sort((a, b) => b.pBowl - a.pBowl || a.rank - b.rank),
    }))
    .sort((a, b) => b.eligible.length - a.eligible.length || a.name.localeCompare(b.name));
  return { eligible: conferences.reduce((n, g) => n + g.eligible.length, 0), conferences };
}

/** Seeds 1-7 in each conference: division winners by projected wins, then the best three of the rest. */
export function nflPlayoff(teams, rules = NFL_FIELD) {
  const better = (a, b) => (b.projW ?? 0) - (a.projW ?? 0) || (b.pPlayoffs ?? 0) - (a.pPlayoffs ?? 0) || (a.fpiRank ?? 99) - (b.fpiRank ?? 99);
  const out = {};
  for (const conf of ["AFC", "NFC"]) {
    const mine = teams.filter((t) => t.conf === conf);
    const winners = [];
    for (const d of new Set(mine.map((t) => t.division))) {
      const lead = mine
        .filter((t) => t.division === d)
        .sort((a, b) => (b.pDiv ?? 0) - (a.pDiv ?? 0) || better(a, b))[0];
      if (lead) winners.push(lead);
    }
    winners.sort(better);
    const wSet = new Set(winners.map((t) => t.id));
    const wild = mine.filter((t) => !wSet.has(t.id)).sort(better);
    const field = [...winners.slice(0, rules.divisionWinners).map((t) => ({ t, bid: "division" })), ...wild.slice(0, rules.perConference - winners.length).map((t) => ({ t, bid: "wild card" }))].map(({ t, bid }, i) => ({
      seed: i + 1,
      bye: i === 0,
      bid,
      division: t.division,
      ...nflSlim(t),
    }));
    const inSet = new Set(field.map((f) => f.id));
    out[conf] = { field, out: mine.filter((t) => !inSet.has(t.id)).sort(better).slice(0, 3).map(nflSlim) };
  }
  return out;
}

const slim = (t) => ({
  id: t.id,
  name: t.name,
  abbr: t.abbr,
  conf: t.independent ? "Ind" : (t.conf ?? null),
  rank: t.rank,
  composite: t.composite,
  record: `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`,
  projW: t.projW,
  pPlayoffs: t.pPlayoffs,
  pConf: t.pConf,
  pTitle: t.pTitle,
});
const nflSlim = (t) => ({
  id: t.id,
  name: t.name,
  abbr: t.abbr,
  record: `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`,
  projW: t.projW,
  projL: t.projL,
  pPlayoffs: t.pPlayoffs,
  pDiv: t.pDiv,
  pConf: t.pConf,
  pTitle: t.pTitle,
});

// ---------- weekly cycle ----------
const CT = "America/Chicago";
const parts = (d) => {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: CT, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(d);
  const g = (t) => f.find((p) => p.type === t).value;
  return { ymd: `${g("year")}-${g("month")}-${g("day")}`, dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday")) };
};
/**
 * The date of the most recent 8am-Central Sunday (college, dow 0) or Tuesday (NFL, dow 2). The
 * outlook is rebuilt once per key; every other run keeps what it has.
 */
export function cycleKey(now, dow) {
  const { ymd, dow: today } = parts(new Date(now.getTime() - 8 * 3600e3));
  const back = (today - dow + 7) % 7;
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}
