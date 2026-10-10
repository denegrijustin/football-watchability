// Trims an ESPN football game summary to what the Game Center needs.
// Shared by the Cloudflare Pages Function (functions/api/game.js) and the
// browser fallback that calls ESPN directly.

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const pair = (v) => String(v ?? "0/0").split(/[/-]/).map(num);

/** Stat blocks for one athlete, keyed by ESPN category. */
function playerStats(cat, stats) {
  const k = Object.fromEntries(cat.keys.map((key, i) => [key, stats[i]]));
  switch (cat.name) {
    case "passing": {
      const [cmp, att] = pair(k["completions/passingAttempts"]);
      const [sacks] = pair(k["sacks-sackYardsLost"]);
      return { cmp, att, yds: num(k.passingYards), td: num(k.passingTouchdowns), int: num(k.interceptions), sacks, qbr: num(k.adjQBR) || null };
    }
    case "rushing":
      return { att: num(k.rushingAttempts), yds: num(k.rushingYards), td: num(k.rushingTouchdowns), long: num(k.longRushing) };
    case "receiving":
      return { rec: num(k.receptions), yds: num(k.receivingYards), td: num(k.receivingTouchdowns), tgt: num(k.receivingTargets), long: num(k.longReception) };
    case "fumbles":
      return { fum: num(k.fumbles), lost: num(k.fumblesLost) };
    case "defensive":
      return { tkl: num(k.totalTackles), sacks: num(k.sacks), tfl: num(k.tacklesForLoss), pd: num(k.passesDefended), hits: num(k.QBHits), td: num(k.defensiveTouchdowns) };
    case "interceptions":
      return { int: num(k.interceptions), yds: num(k.interceptionYards), td: num(k.interceptionTouchdowns) };
    case "kicking": {
      const [fgm, fga] = pair(k["fieldGoalsMade/fieldGoalAttempts"]);
      const [xpm, xpa] = pair(k["extraPointsMade/extraPointAttempts"]);
      return { fgm, fga, xpm, xpa, long: num(k.longFieldGoalMade) };
    }
    default:
      return null;
  }
}

/** Player id -> position abbreviation from an ESPN team roster response. */
export function rosterPositions(roster) {
  const out = {};
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    if (o.id && o.position && typeof o.position === "object" && o.position.abbreviation) out[o.id] = o.position.abbreviation;
    for (const v of Object.values(o)) if (v && typeof v === "object") walk(v);
  };
  walk(roster?.athletes ?? []);
  return out;
}

export function trimGame(s, positions = {}) {
  const comp = s.header?.competitions?.[0] ?? {};
  const st = comp.status?.type ?? {};
  const teams = (comp.competitors ?? []).map((c) => ({
    id: c.team?.id,
    abbr: c.team?.abbreviation,
    name: c.team?.displayName,
    homeAway: c.homeAway,
    score: num(c.score),
    linescores: (c.linescores ?? []).map((l) => num(l.displayValue ?? l.value)),
    possession: !!c.possession,
  }));
  teams.sort((a, b) => (a.homeAway === b.homeAway ? 0 : a.homeAway === "away" ? -1 : 1));
  const abbrById = Object.fromEntries(teams.map((t) => [t.id, t.abbr]));

  // Plays across all drives (plus the current one when live)
  const driveList = [...(s.drives?.previous ?? []), ...(s.drives?.current ? [s.drives.current] : [])];
  const seen = new Set();
  const drives = [];
  const plays = [];
  let curPlays = [];
  for (const d of driveList) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    const team = d.team?.id;
    const ps = (d.plays ?? []).filter((p) => p.type?.text !== "Kickoff" || p.scoringPlay);
    const first = ps.find((p) => p.start?.yardsToEndzone != null);
    const snaps = ps.filter((p) => !/Punt|Kickoff|Timeout|End of|Two-minute|Field Goal|Extra Point/i.test(p.type?.text ?? ""));
    const last = [...snaps].reverse().find((p) => p.end?.yardsToEndzone != null && p.end?.team?.id === team);
    // Field position from the offense's side: 0 = own goal line, 100 = opponent's.
    const from = first ? 100 - num(first.start.yardsToEndzone) : null;
    const to = last ? 100 - num(last.end.yardsToEndzone) : null;
    drives.push({
      team,
      period: d.start?.period?.number ?? null,
      clock: d.start?.clock?.displayValue ?? "",
      from,
      to,
      yards: num(d.yards),
      plays: num(d.offensivePlays),
      result: d.displayResult ?? d.result ?? "",
      score: !!d.isScore,
      time: d.timeElapsed?.displayValue ?? "",
      current: d === s.drives?.current,
    });
    if (d === s.drives?.current) {
      // Every snap of the drive in progress, for the live field view.
      curPlays = (d.plays ?? [])
        .filter((p) => !/Kickoff|Timeout|End of|Two-minute|Coin|Official/i.test(p.type?.text ?? ""))
        .map((p) => ({
          down: p.start?.shortDownDistanceText ?? p.start?.downDistanceText ?? "",
          text: p.text ?? "",
          yards: num(p.statYardage),
          period: p.period?.number ?? null,
          clock: p.clock?.displayValue ?? "",
          kind: p.type?.text ?? "",
          score: !!p.scoringPlay,
          turnover: !!p.isTurnover,
        }));
    }
    for (const p of d.plays ?? []) {
      const kind = p.type?.text ?? "";
      const offense = !/Kickoff|Punt|Timeout|End of|Two-minute|Coin|Official/i.test(kind);
      plays.push({
        id: p.id,
        team: p.start?.team?.id ?? team,
        period: p.period?.number ?? null,
        clock: p.clock?.displayValue ?? "",
        text: p.text ?? "",
        kind,
        yards: num(p.statYardage),
        toGo: p.start?.yardsToEndzone ?? null,
        offense,
        score: !!p.scoringPlay,
        turnover: !!p.isTurnover,
        away: p.awayScore,
        home: p.homeScore,
      });
    }
  }

  // Win probability, tagged with the quarter of each play.
  const byPlay = new Map(plays.map((p) => [p.id, p]));
  const wp = (s.winprobability ?? []).map((w) => {
    const p = byPlay.get(w.playId);
    return [Math.round((w.homeWinPercentage ?? 0) * 1000) / 10, p?.period ?? null, { id: w.playId, text: p?.text ?? "Play description unavailable", clock: p?.clock ?? "" }];
  });

  // Team stats
  const teamStats = {};
  for (const t of s.boxscore?.teams ?? []) {
    const v = Object.fromEntries((t.statistics ?? []).map((x) => [x.name, x.displayValue]));
    teamStats[t.team?.id] = {
      yards: num(v.totalYards),
      ypp: num(v.yardsPerPlay),
      plays: num(v.totalOffensivePlays),
      firstDowns: num(v.firstDowns),
      third: v.thirdDownEff ?? "",
      redZone: v.redZoneAttempts ?? "",
      turnovers: num(v.turnovers),
      top: v.possessionTime ?? "",
      penalties: v.totalPenaltiesYards ?? "",
      passYds: num(v.netPassingYards),
      rushYds: num(v.rushingYards),
    };
  }

  // Players
  const players = {};
  for (const t of s.boxscore?.players ?? []) {
    const map = new Map();
    for (const cat of t.statistics ?? []) {
      for (const a of cat.athletes ?? []) {
        const id = a.athlete?.id;
        if (!id || String(id).startsWith("-")) continue; // "Team" rows
        const st2 = playerStats(cat, a.stats ?? []);
        if (!st2) continue;
        if (!map.has(id))
          map.set(id, {
            id,
            name: a.athlete.displayName,
            short: a.athlete.shortName ?? a.athlete.displayName,
            jersey: a.athlete.jersey ?? "",
            pos: positions[id] ?? a.athlete.position?.abbreviation ?? null,
            headshot: a.athlete.headshot?.href ?? null,
          });
        map.get(id)[cat.name] = st2;
      }
    }
    players[t.team?.id] = [...map.values()];
  }

  const sit = s.situation ?? comp.situation ?? null;
  return {
    id: s.header?.id,
    status: { state: st.state ?? "pre", detail: st.shortDetail ?? st.detail ?? "", period: comp.status?.period ?? 0, clock: comp.status?.displayClock ?? "" },
    teams,
    situation: sit
      ? {
          text: sit.downDistanceText ?? sit.shortDownDistanceText ?? "",
          possession: sit.possession ?? null,
          toGo: sit.yardsToEndzone ?? null,
          redZone: !!sit.isRedZone,
          lastPlay: sit.lastPlay?.text ?? "",
        }
      : null,
    wp,
    drives,
    plays: plays.slice(-40),
    curPlays: curPlays.slice(-30),
    // Every play that can credit a player (see src/playImpact.ts), so Top 3 / Bottom 3 can show
    // the plays behind each number. Timeouts, kicks off, punts and penalty-only plays never do.
    log: plays
      .filter((p) => !/^(Penalty|Timeout|Official Timeout|End |Two-minute|Coin|Kickoff|Punt)/i.test(p.kind))
      .map((p) => ({ id: p.id, team: p.team, period: p.period, clock: p.clock, text: p.text, kind: p.kind, yards: p.yards, score: p.score, turnover: p.turnover })),
    allOffense: plays
      .filter((p) => p.offense && p.team && p.toGo != null)
      .map((p) => [p.team === teams[1]?.id ? 1 : 0, p.toGo, p.period ?? 0, p.yards]),
    scoring: (s.scoringPlays ?? []).map((p) => ({
      period: p.period?.number,
      clock: p.clock?.displayValue,
      team: abbrById[p.team?.id] ?? p.team?.abbreviation ?? "",
      text: p.text,
      away: p.awayScore,
      home: p.homeScore,
    })),
    teamStats,
    players,
  };
}
