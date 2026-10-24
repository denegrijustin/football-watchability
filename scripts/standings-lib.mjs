// Turns ESPN's standings payloads (NFL: conferences > divisions; college: conferences) into the compact shape the Standings tab reads. Pure, so the tests can import it.

const num = (s) => { const n = Number(String(s ?? "").replace("+", "")); return Number.isFinite(n) ? n : 0; };

/** The stats of one entry by ESPN's `type` key, first one wins (college entries repeat every stat for home, away and so on). */
function statsOf(entry) {
  const by = new Map();
  for (const s of entry.stats ?? []) if (s.type && !by.has(s.type)) by.set(s.type, s);
  const get = (t) => by.get(t)?.displayValue ?? null;
  return { get, rec: (t) => get(t) ?? "0-0" };
}

export function teamRow(entry, { logoFor }) {
  const t = entry.team ?? {}, s = statsOf(entry);
  const overall = s.rec("total");
  const [w, l, tie = 0] = overall.split("-").map(Number);
  const conf = s.get("vsconf") ?? s.get("conferencerecord");
  return {
    id: String(t.id ?? ""),
    name: t.displayName ?? t.name ?? "",
    short: t.shortDisplayName ?? t.name ?? "",
    abbr: t.abbreviation ?? "",
    logo: logoFor(t),
    w: w || 0, l: l || 0, t: tie || 0,
    overall,
    pct: num(s.get("winpercent") ?? s.get("leaguewinpercent")),
    conf: conf ?? null,
    div: s.get("vsdiv") ?? null,
    home: s.get("home") ?? s.get("homerecord") ?? null,
    away: s.get("road") ?? s.get("awayrecord") ?? null,
    pf: num(s.get("pointsfor")), pa: num(s.get("pointsagainst")), diff: num(s.get("pointdifferential") ?? s.get("differential")),
    streak: s.get("streak") && s.get("streak") !== "-" ? s.get("streak") : null,
    seed: num(s.get("playoffseed")) || null,
  };
}

const record = (r) => { if (!r) return [0, 0, 0]; const [w = 0, l = 0, t = 0] = r.split("-").map(Number); return [w, l, t]; };
/** Win share of a "W-L" or "W-L-T" record (a tie counts half). */
export const share = (r) => { const [w, l, t] = record(r); return w + l + t ? (w + t / 2) / (w + l + t) : 0; };

/** College: conference record first (that is how a conference is decided), then overall, then point differential. */
export const byConference = (a, b) => share(b.conf) - share(a.conf) || record(b.conf)[0] - record(a.conf)[0] || b.pct - a.pct || b.diff - a.diff || a.name.localeCompare(b.name);

export function parseNfl(json, ctx) {
  const confs = (json.children ?? []).map((c) => ({
    name: c.abbreviation ?? c.name,
    full: c.name,
    divisions: (c.children ?? []).map((d) => ({ name: d.name, teams: (d.standings?.entries ?? []).map((e) => teamRow(e, ctx)) })),
  }));
  return { season: json.season?.year ?? null, conferences: confs };
}

export function parseCfb(json, ctx) {
  // A conference is a node with entries; one split into divisions (the Sun Belt's East and West) becomes one conference whose teams carry their division.
  const conferences = [];
  const take = (n, parent) => {
    if (n.standings?.entries?.length) {
      const name = parent ? parent.shortName ?? parent.name : n.shortName ?? n.name;
      const division = parent ? String(n.shortName ?? n.name).replace(parent.shortName ?? parent.name, "").replace(/^[\s-]+/, "") : null;
      let c = conferences.find((x) => x.name === name);
      if (!c) conferences.push((c = { name, full: parent ? parent.name : n.name, teams: [] }));
      for (const e of n.standings.entries) c.teams.push({ ...teamRow(e, ctx), ...(division ? { division } : {}) });
    }
    for (const k of n.children ?? []) take(k, n.standings?.entries?.length || !n.children?.some((x) => x.standings?.entries?.length) ? null : n);
  };
  for (const c of json.children ?? []) take(c, null);
  for (const c of conferences) c.teams.sort(byConference);
  return { season: json.season?.year ?? null, conferences: conferences.filter((c) => c.teams.length) };
}
