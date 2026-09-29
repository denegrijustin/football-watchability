// Watchability scoring: an absolute 0–100 scale shared by the pregame
// forecast and the postgame "actual" score, so the two can be compared.
//
// Both start from a base of 35 and add up to 70 points from components
// (capped at 100, so only a near-perfect game gets there).
// Every component carries its points, its maximum and a plain-language note,
// which is what the site shows as the score breakdown and readout.
//
// Forecast (before kickoff)            Actual (after the final whistle)
//   Team quality      27                 Finish          21
//   Competitiveness   19                 Drama           17
//   Stakes            15                 Late tension    11
//   Marquee matchup    6                 Stakes & quality 10
//   TV window          3                 Surprise         7
//                                        Fireworks        4
//   FCS opponent     −12 per FCS team (both)

export const BASE = 35;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const pts = (frac, max) => Math.round(clamp(frac) * max * 10) / 10;
const pct = (p) => `${Math.round(p * 100)}%`;
const an = (n) => (/^(8|11|18)$|^8\d$/.test(String(n)) ? "an" : "a");
export const FCS_PENALTY = 12;

export const TIERS = [
  ["elite", 90, "Must Watch"],
  ["vgood", 82, "Very Good"],
  ["good", 74, "Good"],
  ["watch", 64, "Watchable"],
  ["bg", 0, "Background"],
];
export const tierFor = (score) => TIERS.find(([, min]) => score >= min);

const total = (parts) => Math.round(clamp(BASE + parts.reduce((s, p) => s + p.pts, 0), 0, 100));

/**
 * Forecast score.
 * f: { league, sA, sH, rankA, rankH (FPI ranks), pHome, spreadText, swingA, swingH,
 *      apA, apH, national, streamOnly, primetime, net, timeText, fcsA, fcsH,
 *      nameA, nameH, divisional }
 */
export function forecastScore(f) {
  const quality = 0.75 * ((f.sA + f.sH) / 2) + 0.25 * Math.max(f.sA, f.sH);
  const close = 1 - Math.abs(2 * f.pHome - 1);
  const swing = f.swingA + f.swingH;
  const stakes = clamp(swing / (f.league === "NFL" ? 70 : 60));
  const fav = f.pHome >= 0.5 ? [f.nameH, f.pHome] : [f.nameA, 1 - f.pHome];

  let marquee = 0,
    marqueeNote = "No ranked teams or rivalry edge";
  if (f.league === "CFB") {
    if (f.apA && f.apH) {
      marquee = Math.min(f.apA, f.apH) <= 10 ? 1 : 0.8;
      marqueeNote = `Ranked vs ranked: AP #${f.apA} vs #${f.apH}`;
    } else if ((f.apA || f.apH) && close > 0.6) {
      marquee = 0.45;
      marqueeNote = `AP #${f.apA || f.apH} in a game projected to be close`;
    } else if (f.apA || f.apH) {
      marquee = 0.2;
      marqueeNote = `AP #${f.apA || f.apH} ${f.apA ? f.nameA : f.nameH} on the field`;
    }
  } else {
    const good = [f.winA, f.winH].filter((w) => w >= 0.5).length;
    marquee = (good === 2 ? 0.6 : good === 1 ? 0.25 : 0) + (f.divisional ? 0.4 : 0);
    marqueeNote = [
      good === 2 ? "Both teams .500 or better" : good === 1 ? "One team .500 or better" : "Both teams below .500",
      f.divisional ? "division game" : null,
    ]
      .filter(Boolean)
      .join("; ");
  }

  let tv = f.streamOnly ? 0 : f.national ? 0.65 : 0.3;
  if (f.primetime && f.national) tv += 0.35;
  const parts = [
    {
      id: "quality",
      label: "Team quality",
      max: 27,
      pts: pts(quality, 27),
      note: f.rankA && f.rankH ? `FPI #${f.rankA} ${f.nameA} vs #${f.rankH} ${f.nameH}` : "FPI strength of both teams",
    },
    {
      id: "competitive",
      label: "Competitiveness",
      max: 19,
      pts: pts(close, 19),
      note: `Win probability ${fav[0]} ${pct(fav[1])}${f.spreadText ? ` · line ${f.spreadText}` : ""}`,
    },
    {
      id: "stakes",
      label: "Stakes",
      max: 15,
      pts: pts(stakes, 15),
      note:
        swing >= 1
          ? `Playoff odds swing ${Math.round(swing)} pts combined on the result`
          : "Little playoff movement either way",
    },
    { id: "marquee", label: "Marquee matchup", max: 6, pts: pts(marquee, 6), note: marqueeNote },
    {
      id: "tv",
      label: "TV window",
      max: 3,
      pts: pts(tv, 3),
      note: `${f.net || "TBA"}${f.primetime && f.national ? ", prime time" : ""}${f.streamOnly ? " (streaming only)" : ""}`,
    },
  ];
  const fcs = (f.fcsA ? 1 : 0) + (f.fcsH ? 1 : 0);
  if (fcs)
    parts.push({ id: "fcs", label: "FCS opponent", max: 0, pts: -FCS_PENALTY * fcs, note: "FBS vs FCS games are rarely competitive" });
  return { score: total(parts), base: BASE, parts };
}

/**
 * Actual score from the final result.
 * a: { league, awayScore, homeScore, overtime, periods, wp: [[homePct, period]],
 *      plays: [{period, away, home}], pHome (pregame), nameA, nameH,
 *      forecastParts (for stakes & quality), fcsA, fcsH }
 */
export function actualScore(a) {
  const margin = Math.abs(a.homeScore - a.awayScore);
  const homeWon = a.homeScore > a.awayScore;
  const tie = margin === 0;
  const winner = tie ? null : homeWon ? a.nameH : a.nameA;
  const loser = tie ? null : homeWon ? a.nameA : a.nameH;
  const facts = { margin, overtime: a.overtime, winner, loser };

  // Scoring timeline: lead changes, ties, biggest comeback, 4th-quarter swings.
  let leader = 0,
    leadChanges = 0,
    ties = 0,
    lateChanges = 0,
    winnerDeficit = 0,
    start4 = null;
  const seq = [{ period: 1, away: 0, home: 0 }, ...(a.plays ?? [])];
  for (const p of seq) {
    if (p.period >= 4 && start4 == null) start4 = prevDiff(seq, p);
    const d = (p.home ?? 0) - (p.away ?? 0);
    const now = Math.sign(d);
    if (now !== 0 && leader !== 0 && now !== leader) {
      leadChanges++;
      if (p.period >= 4) lateChanges++;
    }
    if (now === 0 && leader !== 0) ties++;
    if (now !== 0) leader = now;
    if (!tie) winnerDeficit = Math.max(winnerDeficit, homeWon ? -d : d);
  }
  if (start4 == null) start4 = a.homeScore - a.awayScore;
  facts.leadChanges = leadChanges;
  facts.ties = ties;
  facts.lateChanges = lateChanges;
  facts.winnerDeficit = winnerDeficit;
  facts.margin4 = Math.abs(start4);
  facts.points = a.homeScore + a.awayScore;

  // Win probability: summed swings (an "excitement index") and 4th-quarter doubt.
  const wp = (a.wp ?? []).filter((w) => Number.isFinite(w[0]));
  let ei = null,
    lateShare = null,
    loserPeak = null;
  if (wp.length > 20) {
    ei = 0;
    for (let i = 1; i < wp.length; i++) ei += Math.abs(wp[i][0] - wp[i - 1][0]);
    const late = wp.filter((w) => (w[1] ?? 0) >= 4);
    lateShare = late.length ? late.filter((w) => w[0] > 0.15 && w[0] < 0.85).length / late.length : null;
    if (!tie) loserPeak = Math.max(...wp.map((w) => (homeWon ? 1 - w[0] : w[0])));
  }
  facts.excitement = ei == null ? null : Math.round(ei * 10) / 10;
  facts.lateShare = lateShare;
  facts.loserPeak = loserPeak;

  // Finish
  const finishFrac = [[3, 19], [7, 16], [10, 13], [14, 10], [21, 6], [28, 3]].find(([m]) => margin <= m)?.[1] ?? 1;
  const finish = Math.min(21, finishFrac + (a.overtime ? 3 : 0));
  const finishNote = tie
    ? `Ended in a ${a.homeScore}–${a.awayScore} tie`
    : `${winner} won by ${margin}${a.overtime ? ` in ${a.periods > 5 ? `${a.periods - 4} overtimes` : "overtime"}` : ""}`;

  // Drama
  const eiEst = ei ?? 1.2 + 0.7 * leadChanges + 0.35 * ties;
  const drama = pts((eiEst - 0.8) / 4, 17);
  const dramaNote =
    `${leadChanges} lead change${leadChanges === 1 ? "" : "s"}${ties ? `, ${ties} tie${ties === 1 ? "" : "s"}` : ""}` +
    (ei != null ? ` · excitement index ${ei.toFixed(1)} (all win-probability swings added up; a typical game is about 2.3)` : "");

  // Late tension
  let lateFrac;
  if (lateShare != null) lateFrac = 0.75 * lateShare + Math.min(0.25, lateChanges * 0.125);
  else lateFrac = (facts.margin4 <= 3 ? 0.6 : facts.margin4 <= 8 ? 0.45 : facts.margin4 <= 14 ? 0.2 : 0) + Math.min(0.4, lateChanges * 0.2);
  if (a.overtime) lateFrac = Math.max(lateFrac, 0.9);
  const late = pts(lateFrac, 11);
  const lateNote =
    (lateShare != null
      ? `In doubt for ${Math.round(lateShare * 100)}% of 4th-quarter plays`
      : `${facts.margin4 === 0 ? "Tied" : `${facts.margin4}-pt game`} entering the 4th`) +
    (lateChanges ? ` · ${lateChanges} lead change${lateChanges === 1 ? "" : "s"} in the 4th` : "");

  // Surprise: upset and/or comeback
  const pWin = tie ? 0.5 : homeWon ? a.pHome : 1 - a.pHome;
  const upset = tie ? 0 : clamp((0.5 - pWin) / 0.35);
  const comeback = tie
    ? 0
    : loserPeak != null
      ? clamp((loserPeak - 0.6) / 0.35)
      : clamp((winnerDeficit - 7) / 10);
  const surprise = pts(0.6 * upset + 0.4 * comeback, 7);
  const bits = [];
  if (upset > 0) bits.push(`${winner} won as a ${pct(pWin)} underdog`);
  if (winnerDeficit >= 7) bits.push(`${winner} came back from ${winnerDeficit} down`);
  else if (loserPeak != null && loserPeak >= 0.75) bits.push(`${loser} had a ${pct(loserPeak)} win chance`);
  const surpriseNote = bits.join(" · ") || (tie ? "No winner" : `Favorite ${winner} (${pct(pWin)}) held on`);

  // Fireworks
  const points = a.homeScore + a.awayScore;
  const fireworks = pts((points - 35) / 35, 4);

  // Stakes & quality, carried from the forecast
  const fp = Object.fromEntries((a.forecastParts ?? []).map((p) => [p.id, p]));
  const sq =
    fp.quality && fp.stakes
      ? 0.6 * (fp.quality.pts / fp.quality.max) + 0.4 * (fp.stakes.pts / fp.stakes.max)
      : a.qualityFrac ?? 0.5;

  const parts = [
    { id: "finish", label: "Finish", max: 21, pts: finish, note: finishNote },
    { id: "drama", label: "Drama", max: 17, pts: drama, note: dramaNote },
    { id: "late", label: "Late tension", max: 11, pts: late, note: lateNote },
    {
      id: "sq",
      label: "Stakes & quality",
      max: 10,
      pts: pts(sq, 10),
      note: fp.quality ? "Carried from the forecast: team quality and playoff stakes" : "Team strength and playoff stakes",
    },
    { id: "surprise", label: "Surprise", max: 7, pts: surprise, note: surpriseNote },
    { id: "fireworks", label: "Fireworks", max: 4, pts: fireworks, note: `${points} combined points` },
  ];
  const fcs = (a.fcsA ? 1 : 0) + (a.fcsH ? 1 : 0);
  if (fcs) parts.push({ id: "fcs", label: "FCS opponent", max: 0, pts: -FCS_PENALTY * fcs, note: "FBS vs FCS" });
  return { score: total(parts), base: BASE, parts, facts, pWin };
}

function prevDiff(seq, p) {
  const i = seq.indexOf(p);
  const q = seq[i - 1] ?? { away: 0, home: 0 };
  return (q.home ?? 0) - (q.away ?? 0);
}

/**
 * Readout: why the game scored what it did, and how that compares with the
 * forecast. Returns { headline, bullets }.
 */
export function readout({ forecast, actual, pHome }) {
  const f = forecast?.score ?? null;
  const y = actual.score;
  const { facts } = actual;
  const bullets = [];
  const A = Object.fromEntries(actual.parts.map((p) => [p.id, p]));
  const frac = (p) => (p ? p.pts / (p.max || 1) : 0);

  // Closeness vs projection
  const projClose = 1 - Math.abs(2 * pHome - 1);
  const realClose = (frac(A.finish) * 21 + frac(A.drama) * 17 + frac(A.late) * 11) / 49;
  if (projClose >= 0.6 && realClose < 0.3)
    bullets.push(`Billed as close, it wasn't: ${facts.winner} won by ${facts.margin} and it was ${an(facts.margin4)} ${facts.margin4}-pt game entering the 4th.`);
  else if (projClose < 0.45 && realClose >= 0.55)
    bullets.push(`Projected as lopsided, it went down to the wire: ${A.finish.note}.`);
  else if (realClose >= 0.6) bullets.push(`Close all the way: ${A.finish.note}; ${A.drama.note.split(" · ")[0]}.`);
  else if (realClose < 0.25) bullets.push(`Decided early: ${A.finish.note}; ${A.late.note.split(" · ")[0].toLowerCase()}.`);
  else bullets.push(`${A.finish.note}; ${A.drama.note.split(" · ")[0]}.`);

  if (facts.overtime) bullets.push("Overtime earns full late-tension credit.");
  if (A.surprise.pts >= 2) bullets.push(`Surprise: ${A.surprise.note}.`);
  if (A.fireworks.pts >= 2.5) bullets.push(`Shootout: ${A.fireworks.note}.`);
  else if (A.fireworks.pts === 0 && facts.margin <= 7) bullets.push(`Low scoring (${A.fireworks.note}) but tight.`);
  if (A.fcs) bullets.push("An FCS opponent caps the score.");

  // Why it beat or missed the forecast, in the game's own facts.
  const points = facts.points;
  const up = [];
  if (facts.overtime) up.push("it went to overtime");
  if (A.surprise.pts >= 2 && actual.pWin < 0.45) up.push(`${facts.winner} won as a ${pct(actual.pWin)} underdog`);
  if (facts.winnerDeficit >= 10)
    up.push(up.length ? `came back from ${facts.winnerDeficit} down` : `${facts.winner} rallied from ${facts.winnerDeficit} down`);
  if (facts.leadChanges >= 3) up.push(`${facts.leadChanges} lead changes`);
  if (facts.margin <= 3 && !facts.overtime) up.push(`${an(facts.margin)} ${facts.margin}-pt finish`);
  if (facts.lateShare != null && facts.lateShare >= 0.6 && !facts.overtime) up.push("still in doubt deep into the 4th");
  if (points >= 60) up.push(`${points} combined points`);
  const down = [];
  if (facts.margin >= 15) down.push(`decided by ${facts.margin}${facts.margin4 >= 14 ? ", out of reach before the 4th" : ""}`);
  else if (facts.margin >= 8) down.push(`${an(facts.margin)} ${facts.margin}-pt final`);
  if (facts.leadChanges === 0) down.push("no lead changes");
  if (facts.lateShare != null && facts.lateShare < 0.35 && facts.margin < 15) down.push("little doubt in the 4th");
  if (points < 30) down.push(`only ${points} points`);
  const list = (xs) => xs.slice(0, 2).join(" and ");

  let headline;
  if (f == null) headline = `Scored ${y}: ${list(up) || list(down) || A.finish.note}.`;
  else {
    const d = y - f;
    if (Math.abs(d) <= 4) headline = `Lived up to the forecast (${f} → ${y}): ${list(up) || list(down) || A.finish.note}.`;
    else if (d > 0) headline = `Beat the forecast by ${d}: ${list(up) || A.finish.note}.`;
    else headline = `Fell ${-d} short of the forecast: ${list(down) || "good, not special"}.`;
    const fp = Object.fromEntries((forecast.parts ?? []).map((p) => [p.id, p]));
    if (d <= -8 && fp.quality && fp.stakes && fp.quality.pts + fp.stakes.pts >= 25)
      bullets.push(
        `The forecast leaned on team quality and stakes (${Math.round(fp.quality.pts + fp.stakes.pts)} pts); once the game is played they count for at most 10, and the rest has to come from the game itself.`,
      );
  }
  // Don't repeat the headline's upset/comeback in the bullets.
  const said = (b) => b.startsWith("Surprise:") && /underdog|rallied|came back/.test(headline);
  return { headline, bullets: bullets.filter((b) => !said(b)) };
}
