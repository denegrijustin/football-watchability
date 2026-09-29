// Writes specific, non-repeating "why watch / why skip" notes for every game
// from facts already in the slate: spreads and totals, poll and playoff-odds
// swings, standings, series history, named players, weather, channel and
// kickoff overlaps. Nothing is invented; every sentence cites slate data.
//
//   node scripts/write-narratives.mjs
//
// Headlines come from src/data/headlines.json (keyed by game id) when
// present; otherwise one is generated. Updates each game's `narrative` (one-line headline), `watch`, `skip` and
// `narrativeChips` in src/data/slate.json. Rerun after replacing the slate.
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../src/data/slate.json", import.meta.url);
const slate = JSON.parse(readFileSync(path, "utf8"));
const games = slate.games;
const headlinesPath = new URL("../src/data/headlines.json", import.meta.url);
let headlines = {};
try {
  headlines = JSON.parse(readFileSync(headlinesPath, "utf8"));
} catch {
  /* optional */
}

// ---------- parsing ----------
const num = (s) => (s == null ? null : Number(s));
const rankOf = (r) => {
  const m = /#(\d+)/.exec(r);
  return m ? Number(m[1]) : null;
};
function parseRecord(rec) {
  const [wl = "", ...rest] = rec.split(" · ");
  const [w, l] = wl.split("-").map(Number);
  const standing = rest.length > 1 ? rest[rest.length - 1] : "";
  const conf = rest.length > 1 ? rest[rest.length - 2] : rest[0] ?? "";
  return {
    w,
    l,
    wl,
    conf: conf.replace(/^(Sun Belt) (East|West)$/, "$1"),
    division: rest.length > 2 ? rest[rest.length - 2] : null,
    standing,
    first: /^T?-?1st/.test(standing),
    fcs: /FCS/.test(rec),
  };
}
function parseMeta(meta) {
  const parts = meta.split(" · ");
  const [day, time] = parts[0].split(" ");
  let [h, m] = time.split(":").map(Number);
  if (h !== 12) h += 12; // every kickoff on the slate is noon or later ET
  const venue = parts[parts.length - 1];
  const line = parts.length > 3 ? parts[2] : null;
  let fav = null,
    spread = null,
    total = null;
  if (line) {
    const s = /^(.+?) -(\d+(?:\.\d)?)/.exec(line);
    if (s) {
      fav = s[1];
      spread = Number(s[2]);
    }
    if (/pick/i.test(line)) spread = 0;
    const t = /O\/U (\d+(?:\.\d)?)/.exec(line);
    if (t) total = Number(t[1]);
  }
  return { day, time, minutes: h * 60 + m, venue, line, fav, spread, total };
}
function parseMeeting(item) {
  const m = /^(\d{4}) ([A-Z&.\-]+) (\d+)–(\d+)(.*)$/.exec(item);
  if (!m) return null;
  return {
    year: +m[1],
    ab: m[2],
    hi: +m[3],
    lo: +m[4],
    margin: +m[3] - +m[4],
    note: m[5].trim(),
    raw: item,
  };
}
function parseSeries(value) {
  if (/first meeting/i.test(value)) return { first: true };
  const since = /since (\d{4})/.exec(value)?.[1] ?? null;
  if (/^No meetings since/i.test(value)) return { none: true, since, text: value };
  const m = /^(.+?) leads? (\d+)–(\d+)(?:–(\d+))?/.exec(value);
  if (m) {
    const [a, b, t = 0] = [+m[2], +m[3], +(m[4] ?? 0)];
    return { leader: m[1], a, b, t, total: a + b + t, text: value, since };
  }
  const tie = /tied (\d+)–(\d+)(?:–(\d+))?/i.exec(value);
  if (tie) {
    const [a, b, t] = [+tie[1], +tie[2], +(tie[3] ?? 0)];
    return { tied: true, a, b, t, total: a + b + t, text: value, since };
  }
  return { text: value };
}
const GENERIC =
  /\b(QBs?|special teams|both|group|offense|defense|front|fronts|secondar|talent|passing game|run game|units?|line|skill|receivers|backfield|coach)\b/i;
const letters = (s) => s.toUpperCase().replace(/[^A-Z]/g, "");
const ABBR_ALIASES = { ULM: "Louisiana-Monroe", UL: "Louisiana" };
function abbrMatches(ab, name) {
  if (ABBR_ALIASES[ab]) return ABBR_ALIASES[ab] === name;
  const a = letters(ab).replace(/(.{2,})U$/, (m, x) => (x.length >= 2 ? x : m)),
    n = letters(name);
  const initials = name
    .split(/[^A-Za-z]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join("");
  if (!a || a[0] !== n[0]) return a === initials || (a.startsWith("U") && a.slice(1) === initials);
  if (n.startsWith(a) || a === initials) return true;
  if (a.startsWith("U") && a.slice(1) === initials) return true;
  let i = 0;
  for (const c of n) if (c === a[i]) i++;
  return i === a.length;
}
const HARD_TO_FIND = {
  "ESPN+": "streaming-only on ESPN+",
  Peacock: "streaming-only on Peacock",
  "Prime Video": "only on Prime Video",
  "The CW": "on The CW, which many cable packages bury",
  "Mountain West Network (MW+)": "only on the Mountain West Network stream",
  "CBS Sports Network": "on CBS Sports Network, a cable add-on in many markets",
  "SEC Network+ / ESPN App": "streaming-only on SEC Network+",
  "USA Network": "on USA Network, not a usual football channel",
};

// ---------- per-game facts ----------
const facts = games.map((g) => {
  const meta = parseMeta(g.meta);
  const [awayT, homeT] = g.teams;
  const teams = g.teams.map((t) => {
    const rec = parseRecord(t.record);
    const [rNow, rWin, rLoss] = t.rankings.map(rankOf);
    const [oNow, oWin, oLoss] = t.playoffOdds;
    const nick =
      g.league === "NFL" ? t.name.split(" ").slice(-1)[0] : t.name;
    return {
      ...t,
      rec,
      rNow,
      rWin,
      rLoss,
      oNow,
      oWin,
      oLoss,
      swing: oWin - oLoss,
      nick,
      the: g.league === "NFL" ? `the ${nick}` : t.name,
      The: g.league === "NFL" ? `The ${nick}` : t.name,
      poss:
        (g.league === "NFL" ? `the ${nick}` : t.name) +
        (/s$/.test(nick) ? "'" : "'s"),
      // "No. 10 LSU" for ranked college teams
      label:
        g.league === "CFB" && rNow ? `No. ${rNow} ${t.name}` : nick,
    };
  });
  const [away, home] = teams;
  const series = parseSeries(g.history.boxes[0]?.value ?? "");
  const withWinner = (m) => {
    if (!m) return { tie: true };
    const exact = teams.filter((t) => t.abbr && t.abbr === m.ab);
    const hits = exact.length ? exact : teams.filter((t) => abbrMatches(m.ab, t.name));
    return { ...m, winner: hits.length === 1 ? hits[0] : null };
  };
  const meetings = (g.history.boxes[1]?.items ?? []).map(parseMeeting).filter(Boolean).map(withWinner);
  // Full game list (all-time) when the slate carries it.
  const allMeetings = (g.history.games ?? g.history.boxes[1]?.items ?? []).map((x) => withWinner(parseMeeting(x)));
  const count = /^(\d+) meetings?/.exec((g.history.boxes[0]?.items ?? [])[0] ?? "")?.[1];
  if (count && series.total != null) series.total = Number(count);
  const players = (g.history.boxes[2]?.items ?? []).filter(
    (p) => !GENERIC.test(p),
  );
  return { g, meta, teams, away, home, series, meetings, allMeetings, players, awayT, homeT };
});

// NFL total ranks, for "highest total on the slate"
const totalsBy = (league) =>
  facts
    .filter((f) => f.g.league === league && f.meta.total != null)
    .map((f) => f.meta.total)
    .sort((a, b) => b - a);
const leagueTotals = { NFL: totalsBy("NFL"), CFB: totalsBy("CFB") };

const fmtList = (xs) =>
  xs.length <= 1
    ? xs.join("")
    : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
const pct = (n) => `${n}%`;
const an = (w) => (/^[AEIOU]/i.test(w) ? `an ${w}` : `a ${w}`);
// Rotate phrasings per signal kind so repeated situations don't read identically.
const turns = new Map();
const usedText = new Set();
// Picks the next phrasing that hasn't been used on another card yet.
const vary = (kind, variants) => {
  const start = turns.get(kind) ?? 0;
  turns.set(kind, start + 1);
  for (let k = 0; k < variants.length; k++) {
    const v = variants[(start + k) % variants.length];
    if (!usedText.has(v)) return v;
  }
  return null;
};
const cap = (x) => x[0].toUpperCase() + x.slice(1);
const ordinalSuffix = (n) =>
  n % 10 === 1 && n % 100 !== 11
    ? "st"
    : n % 10 === 2 && n % 100 !== 12
      ? "nd"
      : n % 10 === 3 && n % 100 !== 13
        ? "rd"
        : "th";
const inConf = (c) => (/^C-USA|^Conference/.test(c) ? `in ${c}` : `in the ${c}`);
const clock = (f) => `${f.meta.day} ${f.meta.time} ET`;
const shortMatch = (f) => `${f.away.nick} @ ${f.home.nick}`;

// ---------- signals ----------
function signals(f) {
  const { g, meta, teams, away, home, series, meetings, allMeetings, players } = f;
  const W = [],
    S = [];
  const add = (list, weight, text, head, chip) =>
    text && list.push({ weight, text, head, chip });
  const isNFL = g.league === "NFL";
  const rl = isNFL ? "FPI rankings" : "AP poll";

  // Ranked vs ranked
  if (!isNFL && away.rNow && home.rNow) {
        add(
      W,
      8 + (25 - Math.max(away.rNow, home.rNow)) / 5,
      `Ranked vs. ranked: ${away.label} visits ${home.label}.`,
      Math.max(away.rNow, home.rNow) <= 10
        ? `Top-10 clash: ${away.label} at ${home.label}`
        : `Ranked showdown in ${meta.venue.split(",")[0]}: #${away.rNow} vs. #${home.rNow}`,
      "Ranked vs. ranked",
    );
  }
  if (isNFL && away.rNow <= 12 && home.rNow <= 12)
    add(
      W,
      6,
      `Two top-12 teams in ESPN's FPI: the ${away.nick} (#${away.rNow}) and ${home.nick} (#${home.rNow}).`,
      `Top-12 ${away.nick} and ${home.nick} collide`,
      "Top-12 vs top-12",
    );

  // Playoff swing
  const sw = [...teams].sort((a, b) => b.swing - a.swing);
  if (sw[0].swing >= 14) {
    const [a, b] = sw;
    const both = b.swing >= 14 && a.swing >= 20;
    const longShot = a.oLoss <= 3 && a.oWin <= 20;
    add(
      W,
      sw[0].swing / 4 + (both ? 2 : 0) - (longShot ? 1.5 : 0),
      longShot
        ? vary("long", [
            `A win keeps ${a.the} alive as a long shot: playoff odds go from ${pct(a.oNow)} to ${pct(a.oWin)}.`,
            `${a.The} (${a.rec.wl}) needs this to stay in the conversation — ${pct(a.oWin)} playoff odds with a win, ${pct(a.oLoss)} without.`,
            `Faint playoff hopes on the line for ${a.the}: ${pct(a.oNow)} now, ${pct(a.oWin)} with a win.`,
          ])
        : both
          ? vary("swing2", [
              `Both seasons tilt here: ${a.poss} playoff odds swing ${a.swing} points (${pct(a.oLoss)}–${pct(a.oWin)}) and ${b.poss} swing ${b.swing} (${pct(b.oLoss)}–${pct(b.oWin)}).`,
              `Real playoff leverage for both: ${a.the} ${isNFL ? "go" : "goes"} to ${pct(a.oWin)} with a win or ${pct(a.oLoss)} with a loss; ${b.the} ${isNFL ? "range" : "ranges"} from ${pct(b.oLoss)} to ${pct(b.oWin)}.`,
              `Winner's odds jump, loser's crater: ${a.nick} ${pct(a.oLoss)}↔${pct(a.oWin)}, ${b.nick} ${pct(b.oLoss)}↔${pct(b.oWin)}.`,
              `${a.swing} points of playoff odds ride on the result for ${a.the}, ${b.swing} for ${b.the}.`,
            ])
          : vary("swing1", [
              `${cap(a.poss)} playoff odds swing ${a.swing} points: ${pct(a.oWin)} with a win, ${pct(a.oLoss)} with a loss.`,
              `${a.The} ${isNFL ? "have" : "has"} the most to lose: playoff odds fall to ${pct(a.oLoss)} with a loss (${pct(a.oWin)} with a win).`,
              `A result that matters for ${a.the}: ${pct(a.oLoss)} playoff odds if ${isNFL ? "they lose" : "it loses"}, ${pct(a.oWin)} if ${isNFL ? "they win" : "it wins"}.`,
            ]),
      longShot
        ? null
        : both
          ? `${a.nick} and ${b.nick} both have ${b.swing}+ playoff points riding on it`
          : `${cap(a.poss)} playoff odds ride on this (${pct(a.oLoss)} to ${pct(a.oWin)})`,
      `±${a.swing} pt playoff swing`,
    );
  }

  // Poll movement
  for (const t of teams) {
    const o = t === away ? home : away;
    if (!t.rNow && t.rWin && t.rWin <= 25 && !t.rec.fcs)
      add(
        W,
        5,
        o.rNow
          ? vary("poll", [
              `An upset of ${o.label} puts ${t.the} into the ${rl} at #${t.rWin}.`,
              `${t.The} (${t.rec.wl}) ${isNFL ? "are" : "is"} one upset from the Top 25 — projected #${t.rWin} with a win.`,
              `Poll watch: ${t.the} would debut around #${t.rWin} by beating ${o.label}.`,
            ])
          : vary("pollEdge", [
              `${t.The} (${t.rec.wl}) ${isNFL ? "are" : "is"} knocking on the Top 25; a win could slip ${isNFL ? "them" : "it"} in around #${t.rWin}.`,
              `A ${t.rec.w + 1}-${t.rec.l} ${t.name} would be in poll range — projected #${t.rWin} with a win.`,
            ]),
        `${t.The} can play ${g.league === "NFL" ? "their" : "its"} way into the ${rl} at #${t.rWin}`,
        `${t.nick} poll debut in play`,
      );
    else if (t.rNow && !t.rLoss && !isNFL)
      add(
        W,
        4,
        `${t.label} drops out of the poll with a loss.`,
        `${t.label} is one loss from falling out of the poll`,
        `${t.nick} poll spot at risk`,
      );
    else if (t.rNow && t.rWin && t.rNow - t.rWin >= 4)
      add(
        W,
        3.5,
        `A win vaults ${t.the} from #${t.rNow} to #${t.rWin} in the ${rl}.`,
        `${t.The} can jump ${t.rNow - t.rWin} spots with a win`,
        `${t.nick} +${t.rNow - t.rWin} spots`,
      );
    else if (t.rNow && t.rLoss && t.rLoss - t.rNow >= 6)
      add(
        W,
        3,
        `A loss drops ${t.the} from #${t.rNow} to #${t.rLoss} — a lot of risk for a ${t.rec.wl} team.`,
        `${t.The} ${g.league === "NFL" ? "risk" : "risks"} a ${t.rLoss - t.rNow}-spot slide`,
        `${t.nick} −${t.rLoss - t.rNow} spots if they lose`,
      );
    void o;
  }

  // Standings
  const sameConf = away.rec.conf && away.rec.conf === home.rec.conf;
  if (!isNFL && sameConf && away.rec.first && home.rec.first)
    add(
      W,
      6,
      `Both teams sit in first place ${inConf(away.rec.conf)} (${away.rec.standing}, ${home.rec.standing}) — the winner leaves with the inside track.`,
      `Winner takes the inside track ${inConf(away.rec.conf)}`,
      `${away.rec.conf} lead at stake`,
    );
  if (isNFL && away.rec.division && away.rec.division === home.rec.division)
    add(
      W,
      4,
      `${away.rec.division} game: ${away.the} (${away.rec.standing}) and ${home.the} (${home.rec.standing}) play for tiebreakers as well as the win.`,
      `${away.rec.division} tiebreaker: ${away.nick} vs. ${home.nick}`,
      "Division game",
    );
  if (away.rec.l === 0 && home.rec.l === 0 && away.rec.w >= 2 && home.rec.w >= 2)
    add(
      W,
      5,
      `One perfect start ends here: ${away.nick} ${away.rec.wl}, ${home.nick} ${home.rec.wl}.`,
      `Two unbeatens, only one leaves ${Math.max(away.rec.w, home.rec.w) + 1}-0`,
      "Both unbeaten",
    );

  // Betting line
  const favT = meta.fav ? teams.find((t) => t.nick === meta.fav || t.name === meta.fav) : null;
  const dogT = favT ? teams.find((t) => t !== favT) : null;
  const HIGH = isNFL ? 47 : 60,
    LOW = isNFL ? 42 : 44,
    BIG = isNFL ? 6.5 : 17;
  const totals = leagueTotals[g.league];
  if (meta.spread != null && meta.spread <= 3)
    add(
      W,
      meta.spread <= 1.5 ? 6.5 : 5.5,
      meta.spread <= 1.5
        ? `${away.nick}–${home.nick} is essentially a pick'em (${meta.line.split(" • ")[0]}).`
        : vary("tight", [
            `The line is ${meta.line.split(" • ")[0]} — Vegas sees a one-score game between ${away.the} and ${home.the}.`,
            `Only ${meta.spread} points separate ${away.the} and ${home.the} in the betting line.`,
            `A ${meta.spread}-point spread (${meta.fav} favored) says this should go to the fourth quarter.`,
            `Oddsmakers can barely split them: ${meta.line.split(" • ")[0]}.`,
          ]),
      meta.spread <= 1.5
        ? `Coin-flip line in ${meta.venue.split(",")[0]}`
        : `Field-goal spread: ${meta.fav} −${meta.spread}`,
      meta.spread <= 1.5 ? "Pick'em line" : `${meta.fav} −${meta.spread}`,
    );
  if (meta.total != null && meta.total >= HIGH) {
    const rank = totals.indexOf(meta.total) + 1;
    add(
      W,
      3 + (meta.total - HIGH) / 2,
      rank === 1
        ? `O/U ${meta.total} is the highest total on the ${isNFL ? "NFL" : "college"} slate — points expected from ${away.the} and ${home.the}.`
        : `O/U ${meta.total} (${rank}${ordinalSuffix(rank)}-highest this week) points to a ${away.nick}–${home.nick} shootout.`,
      `Shootout alert: O/U ${meta.total}`,
      `O/U ${meta.total}`,
    );
  }

  // History
  const last = meetings[0];
  const close = meetings.filter((m) => m.margin <= 3 && m.year >= 2005);
  if (close.length >= 2)
    add(
      W,
      4,
      vary("close", [
        `${close.length} of the last ${meetings.length} meetings were decided by 3 points or fewer (${fmtList(close.slice(0, 3).map((m) => `${m.year}: ${m.hi}–${m.lo}`))}).`,
        `This series lives on the margins: ${fmtList(close.slice(0, 3).map((m) => `${m.hi}–${m.lo} in ${m.year}`))}.`,
        `Recent games between ${away.nick} and ${home.nick} keep coming down to the wire (${close.length} of ${meetings.length} within a field goal).`,
      ]),
      `${close.length} of the last ${meetings.length} meetings came down to a field goal`,
      "Close history",
    );
  else if (last && last.margin <= 3 && last.year >= 2005)
    add(
      W,
      3.5,
      `The last meeting (${last.year}) ended ${last.hi}–${last.lo}${last.winner ? ` for ${last.winner.the}` : ""}.`,
      `Last time out: a ${last.hi}–${last.lo} finish`,
      `${last.year}: ${last.hi}–${last.lo}`,
    );
  if (meetings.length >= 2 && last?.winner && last.year >= 2005) {
    let streak = 0;
    for (const m of allMeetings) if (m.winner === last.winner) streak++;
      else break;
    const loser = teams.find((t) => t !== last.winner);
    const loserWin = allMeetings.slice(streak).find((m) => m.winner === loser);
    if (streak >= 3)
      add(
        W,
        2.5,
        loserWin
          ? `${last.winner.The} ${isNFL ? "have" : "has"} won ${streak} straight in the series; ${loser.poss} last win came in ${loserWin.year}.`
          : `${last.winner.The} ${isNFL ? "have" : "has"} won all ${streak} meetings; ${loser.the} ${isNFL ? "have" : "has"} never beaten ${isNFL ? "them" : "them"}.`,
        `${loser.nick} tries to snap a ${streak}-game skid vs. ${last.winner.nick}`,
        `${last.winner.nick} ${streak} straight`,
      );
    else if (last.margin >= 14 && last.margin < 20 && streak <= 2)
      add(
        W,
        2,
        `Revenge angle: ${loser.the} lost the ${last.year} meeting ${last.hi}–${last.lo}.`,
        `${loser.nick} wants payback for ${last.hi}–${last.lo}`,
        "Revenge game",
      );
  }
  if (series.since && series.total >= 4) {
    const share = Math.max(series.a, series.b) / (series.a + series.b || 1);
    add(
      W,
      share <= 0.56 ? 3.5 : 1.5,
      share <= 0.56
        ? `Evenly matched lately: ${series.text}.`
        : vary("seriesSince", [
            `Familiar opponents: ${series.total} meetings since ${series.since} (${series.text.replace(/ since \d{4}$/, "")}).`,
            `They've met ${series.total} times since ${series.since}; ${series.text.replace(/ since \d{4}$/, "")}.`,
          ]),
      share <= 0.56 ? `Even series: ${series.text.replace(/ since \d{4}$/, "")} since ${series.since}` : null,
      `${series.total} meetings since ${series.since}`,
    );
  }
  if (series.none)
    add(
      W,
      1.2,
      vary("none", [
        `${away.name} and ${home.name} haven't met since at least ${series.since} — effectively a fresh matchup.`,
        `No meetings between these two since ${series.since}, so neither side has recent film on the other.`,
      ]),
      `Rare matchup: ${away.nick} vs. ${home.nick}`,
      "Rare matchup",
    );
  if (!series.since && series.total >= 15) {
    const share = Math.max(series.a, series.b) / (series.a + series.b || 1);
    add(
      W,
      share <= 0.56 ? 4 : 2,
      share <= 0.56
        ? `A long, even rivalry: ${series.text} over ${series.total} games.`
        : vary("series", [
            `Meeting No. ${series.total + 1} in a long series (${series.text}).`,
            `Old rivals: this is game ${series.total + 1} between them (${series.text}).`,
            `Deep history — ${series.total} previous meetings (${series.text}).`,
          ]),
      share <= 0.56
        ? `Rivalry dead even after ${series.total} games`
        : `Meeting No. ${series.total + 1}`,
      `${series.total}-game series`,
    );
  }
  if (series.first)
    add(
      W,
      1.5,
      vary("first", [
        `First-ever meeting between ${away.name} and ${home.name}.`,
        `${away.name} and ${home.name} have never played — no history to lean on.`,
        `A brand-new matchup: ${away.name} makes its first trip to face ${home.name}.`,
        `Series debut in ${meta.venue.split(",")[0]}: these two have never met.`,
      ]),
      `${away.nick} and ${home.nick} meet for the first time`,
      "First meeting",
    );

  // Players
  if (players.length)
    add(
      W,
      players.length >= 2 ? 1.6 : 1,
      vary("players", [
        `Players to watch: ${fmtList(players)}.`,
        `Season leaders on display: ${fmtList(players)}.`,
        `Star power: ${fmtList(players)} lead their teams in yards.`,
        `${players[0]}${players[2] ? ` vs. ${players[2]}` : ""} is the marquee matchup${players[1] ? `, with ${players[1]} in support` : ""}.`,
      ]),
      `${fmtList(players.slice(0, 2))} on one field`,
      players[0],
    );

  // Kickoff window
  const overlap = facts.filter(
    (o) =>
      o !== f &&
      o.meta.day === meta.day &&
      Math.abs(o.meta.minutes - meta.minutes) <= 30,
  );
  const better = overlap
    .filter((o) => o.g.score > g.score)
    .sort((a, b) => b.g.score - a.g.score);
  if (overlap.length === 0)
    add(
      W,
      isNFL ? 4 : 3,
      `It has the ${clock(f)} window to itself — no other game on the board kicks within 30 minutes.`,
      `Only game on at ${meta.day} ${meta.time} ET: ${away.nick} at ${home.nick}`,
      "Standalone slot",
    );
  else if (!better.length && overlap.length >= 2)
    add(
      W,
      2.5,
      `Best game of the ${clock(f)} window, ahead of ${fmtList(overlap.sort((a, b) => b.g.score - a.g.score).slice(0, 2).map(shortMatch))}.`,
      `Top pick of the ${meta.day} ${meta.time} window`,
      `Best at ${meta.time}`,
    );
  if (better.length) {
    const top = better[0];
    add(
      S,
      2 + (top.g.score - g.score) / 6,
      better.length > 1
        ? vary("crowd", [
            `Crowded window: ${better.length} better-rated games kick within 30 minutes, led by ${shortMatch(top)} (${top.g.score}).`,
            `Around ${clock(f)} it's only the ${better.length + 1}${ordinalSuffix(better.length + 1)}-best of ${overlap.length + 1} games; the nearest step up is ${shortMatch(better[better.length - 1])} (${better[better.length - 1].g.score}).`,
            `Competes for your screen with ${shortMatch(top)} (${top.g.score}) and ${better.length - 1} other higher-rated game${better.length > 2 ? "s" : ""}.`,
            `${meta.day} ${meta.time} is stacked: ${fmtList(better.slice(0, 2).map((o) => `${shortMatch(o)} (${o.g.score})`))} rate higher.`,
          ])
        : `${shortMatch(f)} goes head-to-head with ${shortMatch(top)} (${top.g.score}) at ${clock(top)}.`,
      `Overlaps ${shortMatch(top)}`,
      `Opposite ${top.away.nick}–${top.home.nick}`,
    );
  }

  // Weather
  const wx = g.weather;
  if (/med|high/i.test(wx.impact))
    add(
      W,
      2,
      wx.effects?.[0] && wx.level === "high"
        ? `High weather impact in ${meta.venue.split(",")[0]}: ${wx.effects[0].charAt(0).toLowerCase()}${wx.effects[0].slice(1)}`
        : /rain/i.test(wx.title)
        ? vary("rain", [
            `Rain is likely in ${meta.venue.split(",")[0]} (${wx.detail}) — ball security becomes a storyline.`,
            `Wet-weather game in ${meta.venue.split(",")[0]}: ${wx.detail}. Expect a sloppier, run-heavier script.`,
            `Forecast shows rain for kickoff in ${meta.venue.split(",")[0]} (${wx.detail}), which tends to level the field.`,
          ])
        : vary("wind", [
            `${wx.title} in ${meta.venue.split(",")[0]}: ${wx.detail} — adds chaos to kicking and deep shots.`,
            `Wind could be a factor in ${meta.venue.split(",")[0]} (${wx.detail}); watch field goals and punts.`,
          ]),
      /rain/i.test(wx.title) ? `Rain game in ${meta.venue.split(",")[0]}` : `Wind watch in ${meta.venue.split(",")[0]}`,
      /rain/i.test(wx.title) ? "Rain forecast" : "Wind factor",
    );
  if (/indoor|roof/i.test(wx.title))
    add(W, 1, `Under a roof in ${meta.venue.split(",")[0]} — no weather to slow the ${away.nick} or ${home.nick} offense.`, null, "Dome");
  if (/thunder/i.test(wx.title) || (wx.effects ?? []).some((e) => /Lightning/.test(e)))
    add(S, 2.5, `Thunderstorms are in the ${meta.venue.split(",")[0]} forecast — a lightning delay could stall the game.`, null, "Storm risk");
  if (/humid|heat|^Hot/i.test(wx.title + " " + wx.detail))
    add(
      S,
      1,
      vary("humid", [
        `${wx.title} in ${meta.venue.split(",")[0]} (${wx.detail}) can turn the second half into a slog.`,
        `Heat and humidity in ${meta.venue.split(",")[0]} tend to sap late-game energy for ${away.the}.`,
        `Muggy conditions in ${meta.venue.split(",")[0]} could slow the pace.`,
      ]),
      null,
      null,
    );

  // Rating trend
  const delta = Number(g.delta.replace(/[^\d+-]/g, "")) || 0;
  if (delta >= 4)
    add(W, 2.5, `${shortMatch(f)} climbed ${delta} points in the ratings since the last update.`, null, `▲${delta} this week`);
  if (delta <= -3)
    add(S, 2, vary("slip", [`${shortMatch(f)} slipped ${-delta} points in the ratings since the last update.`, `${away.nick}–${home.nick} lost ${-delta} points of rating this week.`, `Trending down: ${shortMatch(f)} is ${-delta} points lower than last week.`]), null, `▼${-delta} this week`);

  // ---- Skip reasons ----
  const fcs = teams.find((t) => t.rec.fcs);
  if (fcs && !isNFL) {
    const fbs = teams.find((t) => t !== fcs);
    add(
      S,
      8,
      vary("fcss", [
        `${fcs.name} is an FCS program (${fcs.rec.wl}); ${fbs.label} should control it.`,
        `FCS ${fcs.name} (${fcs.rec.wl}) is a talent step down from ${fbs.name}.`,
        `Guarantee-game territory: ${fbs.name} scheduled FCS ${fcs.name} to get a win.`,
      ]),
      `FCS ${fcs.name} vs. ${fbs.label}: mismatch on paper`,
      "FCS opponent",
    );
    add(
      W,
      0.5,
      vary("fcsw", [
        `Mainly for ${fbs.name} fans: a chance to see the ${fbs.rec.wl} squad work on things before conference play.`,
        `${fcs.name} gets a rare shot at an FBS opponent — a big day for their program.`,
        `If ${fbs.name} is your team, it's a low-stress look at depth players once the lead is safe.`,
        `Upset chaos is the only real hook: FCS ${fcs.name} (${fcs.rec.wl}) at FBS ${fbs.name}.`,
      ]),
      null,
      null,
    );
  }
  const ranked = teams.filter((t) => t.rNow);
  if (!isNFL && ranked.length === 1 && ranked[0].rNow <= 15 && !fcs) {
    const r = ranked[0],
      u = teams.find((t) => t !== r);
    add(
      S,
      5 + (15 - r.rNow) / 4,
      `${r.label} (${r.rec.wl}) against unranked ${u.name} (${u.rec.wl}) looks lopsided.`,
      `${r.label} should handle ${u.name}`,
      "Mismatch",
    );
  }
  if (Math.abs(away.oNow - home.oNow) >= 40 && !fcs)
    add(
      S,
      3,
      vary("gap", [
        `Playoff odds gap: ${away.the} ${pct(away.oNow)} vs. ${home.the} ${pct(home.oNow)}.`,
        `On paper it's lopsided — ${[...teams].sort((a, b) => b.oNow - a.oNow).map((t) => `${t.nick} ${pct(t.oNow)}`).join(" vs. ")} in playoff odds.`,
        `The models see two different tiers: ${away.nick} ${pct(away.oNow)}, ${home.nick} ${pct(home.oNow)} to make the playoff.`,
      ]),
      null,
      null,
    );
  if (meta.spread != null && meta.spread >= BIG && favT)
    add(
      S,
      4 + (meta.spread - BIG) / (isNFL ? 2 : 4),
      `${favT.The} ${isNFL ? "are" : "is"} a ${meta.spread}-point favorite over ${dogT.the} — the book expects a comfortable margin.`,
      `${meta.fav} favored by ${meta.spread}`,
      `${meta.fav} −${meta.spread}`,
    );
  if (meta.total != null && meta.total <= LOW)
    add(
      S,
      3,
      `O/U ${meta.total} for ${away.nick}–${home.nick} is one of the week's lowest totals — expect a field-position grind.`,
      `Low-scoring grind expected (O/U ${meta.total})`,
      `O/U ${meta.total}`,
    );
  if (away.oNow <= 3 && home.oNow <= 3 && sw[0].swing <= 10)
    add(
      S,
      4,
      vary("stakes", [
        Math.max(away.oWin, home.oWin) <= 1
          ? `Little at stake in ${meta.venue.split(",")[0]}: neither team has a realistic playoff path, win or lose.`
          : `Little at stake in ${meta.venue.split(",")[0]}: both sit at ${pct(Math.max(away.oNow, home.oNow))} playoff odds, and a win only reaches ${pct(Math.max(away.oWin, home.oWin))}.`,
        `No playoff path for ${away.name} or ${home.name} — the winner tops out at ${pct(Math.max(away.oWin, home.oWin))} odds.`,
        `${away.name} (${away.rec.wl}) and ${home.name} (${home.rec.wl}) have no realistic playoff route.`,
        `Playoff-wise it's a non-factor: ${away.nick} and ${home.nick} both project at ${pct(Math.max(away.oNow, home.oNow))}.`,
      ]),
      `No playoff stakes for ${away.nick} or ${home.nick}`,
      "Low stakes",
    );
  if (away.rec.w < away.rec.l && home.rec.w < home.rec.l)
    add(
      S,
      3,
      vary("losing", [
        `Both teams have losing records (${away.nick} ${away.rec.wl}, ${home.nick} ${home.rec.wl}).`,
        `Two struggling teams: ${away.rec.wl} and ${home.rec.wl} coming in.`,
        `Neither ${away.name} nor ${home.name} has a winning record yet, so quality of play is a question.`,
      ]),
      `Two losing records: ${away.rec.wl} vs. ${home.rec.wl}`,
      "Both under .500",
    );
  if (series.total >= 5) {
    const share = Math.max(series.a, series.b) / (series.a + series.b);
    if (share >= 0.8)
      add(
        S,
        2.5,
        `History favors one side in ${away.nick}–${home.nick}: ${series.text}.`,
        `${series.leader} owns this series (${series.a}–${series.b})`,
        null,
      );
  }
  if (last && last.margin >= 20 && last.year >= 2005)
    add(
      S,
      2.5,
      vary("blowout", [
        `The last meeting (${last.year}) was a ${last.hi}–${last.lo} blowout${last.winner ? ` by ${last.winner.the}` : ""}.`,
        `${last.winner ? `${last.winner.The} won` : "It finished"} ${last.hi}–${last.lo} in ${last.year}; a repeat wouldn't be much to watch.`,
        `Recent history is ugly for one side: ${last.margin}-point margin in the ${last.year} meeting (${last.hi}–${last.lo}).`,
      ]),
      `Last meeting was a ${last.margin}-point rout`,
      null,
    );
  const channel = HARD_TO_FIND[g.broadcast];
  if (channel)
    add(S, 1.5, `${shortMatch(f)} is ${channel}.`, null, g.broadcast.split(" / ")[0]);
  if (meta.minutes >= 22 * 60 + 30) {
    const end = meta.minutes + 210;
    const eh = Math.floor(end / 60) % 24,
      em = end % 60;
    add(
      S,
      1.5,
      `${shortMatch(f)} kicks at ${meta.time} ET, so expect a finish around ${eh % 12 || 12}:${String(em).padStart(2, "0")} AM ET.`,
      null,
      "Late night",
    );
  }

  // ---- Low-weight fallbacks so every card has both sides ----
  const leaders = teams.filter((t) => t.rec.first && !t.rec.fcs && t.rec.w >= t.rec.l);
  if (leaders.length && !(sameConf && away.rec.first && home.rec.first))
    add(
      W,
      1.2,
      leaders.length === 2
        ? `Both enter in first place: ${away.name} (${away.rec.standing} ${away.rec.conf}) and ${home.name} (${home.rec.standing} ${home.rec.conf}).`
        : `${leaders[0].The} ${isNFL ? "sit" : "sits"} ${leaders[0].rec.standing} ${inConf(leaders[0].rec.division ?? leaders[0].rec.conf)} at ${leaders[0].rec.wl}.`,
      null,
      null,
    );
  if (last && last.margin > 3 && last.margin < 20 && last.year >= 2010)
    add(
      W,
      1,
      `Last time out (${last.year}), it finished ${last.hi}–${last.lo}${last.winner ? ` for ${last.winner.the}` : ""}${last.margin <= 8 ? ", a one-score game" : ""}.`,
      null,
      null,
    );
  const upsetPick = [...teams].sort((a, b) => a.oNow - b.oNow)[0];
  if (upsetPick.oWin - upsetPick.oNow >= 5 && !upsetPick.rec.fcs && upsetPick !== sw[0])
    add(
      W,
      0.8,
      `Upset stakes: ${an(upsetPick.nick)} win moves ${isNFL ? "their" : "its"} playoff odds from ${pct(upsetPick.oNow)} to ${pct(upsetPick.oWin)}.`,
      null,
      null,
    );
  if (!isNFL && !away.rNow && !home.rNow && !fcs)
    add(
      S,
      1,
      vary("unranked", [
        `Neither ${away.name} nor ${home.name} is ranked, so it won't move the national picture.`,
        `No AP-ranked team on the field in ${meta.venue.split(",")[0]}.`,
        `Both unranked — this one stays ${away.rec.conf === home.rec.conf ? `${an(away.rec.conf)} story` : "a regional story"}.`,
      ]),
      null,
      null,
    );
  if (isNFL && Math.abs(away.rNow - home.rNow) >= 10)
    add(
      S,
      2,
      `FPI ranking gap: ${away.nick} #${away.rNow} vs. ${home.nick} #${home.rNow}.`,
      null,
      null,
    );
  const gap = Math.abs(away.oNow - home.oNow);
  if (gap >= 20 && gap < 40)
    add(
      S,
      1.5,
      `Uneven stakes: ${away.nick} at ${pct(away.oNow)} playoff odds, ${home.nick} at ${pct(home.oNow)}.`,
      null,
      null,
    );
  return { W, S };
}

// ---------- assemble ----------
const usedHead = new Set();
const kindUse = new Map();
let missingSkip = 0;
for (const f of facts) {
  const { W, S } = signals(f);
  W.sort((a, b) => b.weight - a.weight);
  S.sort((a, b) => b.weight - a.weight);
  const uniq = (xs) => {
    const seen = new Set();
    return xs.filter((x) => !seen.has(x.text) && seen.add(x.text));
  };
  let watch = uniq(W).filter((x) => !usedText.has(x.text));
  let skip = uniq(S).filter((x) => !usedText.has(x.text));

  // Headline: the strongest angle; skip-led for low tiers when the case
  // against is stronger than the case for.
  const lowTier = ["watch", "bg"].includes(f.g.tier);
  const pool =
    lowTier && skip[0] && (!watch[0] || skip[0].weight >= watch[0].weight)
      ? [...skip, ...watch]
      : [...watch, ...skip];
  // Prefer the strongest angle, but penalize headline shapes already used
  // so the board doesn't read like one template.
  const names = f.teams.flatMap((t) => [t.name, t.nick]);
  const kindOf = (h) =>
    names
      .reduce((x, n) => x.split(n).join("T"), h)
      .replace(/No\. \d+/g, "")
      .replace(/[\d.%+−-]+/g, "N");
  const candidates = pool
    .filter((s) => s.head && !usedHead.has(s.head))
    .slice(0, 4)
    .map((s) => ({ s, v: s.weight - 3 * (kindUse.get(kindOf(s.head)) ?? 0) }))
    .sort((a, b) => b.v - a.v);
  const headSig = candidates[0]?.s;
  if (headSig) kindUse.set(kindOf(headSig.head), (kindUse.get(kindOf(headSig.head)) ?? 0) + 1);
  // Hand-written headlines (src/data/headlines.json) win over generated ones.
  const entry = headlines[f.g.espnId] ?? headlines[f.g.id];
  const custom = typeof entry === "string" ? entry : entry?.take;
  const head = custom ?? headSig?.head ?? f.g.matchup;
  if (usedHead.has(head)) throw new Error(`Duplicate headline: ${head}`);
  usedHead.add(head);

  // With a generated headline, drop its bullet so the card doesn't repeat it.
  if (!custom) {
    watch = watch.filter((s) => s !== headSig);
    skip = skip.filter((s) => s !== headSig);
  }
  watch = watch.slice(0, 3);
  skip = skip.slice(0, 3);
  if (!watch.length) {
    const t = [...f.teams].sort((a, b) => (b.rec.first ? 1 : 0) - (a.rec.first ? 1 : 0) || b.oWin - a.oWin)[0];
    watch.push({
      text: t.rec.first
        ? `${t.The} ${f.g.league === "NFL" ? "hold" : "holds"} a share of first ${inConf(t.rec.division ?? t.rec.conf)} despite a ${t.rec.wl} start.`
        : `${t.The} can climb to ${pct(t.oWin)} playoff odds with a win.`,
    });
  }
  if (!skip.length) {
    missingSkip++;
    const rival = facts
      .filter((o) => o !== f && o.meta.day === f.meta.day && Math.abs(o.meta.minutes - f.meta.minutes) <= 30)
      .sort((a, b) => b.g.score - a.g.score)[0];
    skip.push({
      text: rival
        ? `Only reason to pass on ${shortMatch(f)}: you'd miss the start of ${shortMatch(rival)} (${rival.g.score}).`
        : `There's no real reason to skip ${shortMatch(f)}.`,
    });
  }

  const chips = [headSig, ...watch, ...skip]
    .map((s) => s?.chip)
    .filter(Boolean)
    .filter((c, i, a) => a.indexOf(c) === i)
    .slice(0, 3);

  for (const s of [...watch, ...skip]) {
    if (usedText.has(s.text)) throw new Error(`Duplicate text: ${s.text}`);
    usedText.add(s.text);
  }
  f.g.narrative = head;
  f.g.watch = watch.map((s) => s.text);
  f.g.skip = skip.map((s) => s.text);
  f.g.narrativeChips = chips;
}

writeFileSync(path, JSON.stringify(slate, null, 2) + "\n");
console.log(
  `Wrote notes for ${games.length} games (${usedHead.size} unique headlines, ${usedText.size} unique bullets, ${missingSkip} with no skip reason).`,
);
