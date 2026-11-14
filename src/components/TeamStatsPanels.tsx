import { Crosshair } from "lucide-react";
import type { LiveGame } from "./GameCenter";
import "../teamstats2.css";

type Side = { abbr: string; name: string; logo?: string };

const mmss = (t: string) => {
  const m = /^(\d+):(\d{2})$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};
const share = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
const attempts = (s: string | undefined) => {
  const m = /^(\d+)-(\d+)/.exec(s ?? "");
  return m ? { made: Number(m[1]), of: Number(m[2]) } : null;
};

function TeamHead({ side, right }: { side: Side; right?: boolean }) {
  return <span className={`ts-head ${right ? "right" : ""}`}>{!right && side.logo && <img src={side.logo} alt="" width="40" height="40" />}<b>{side.abbr}</b>{right && side.logo && <img src={side.logo} alt="" width="40" height="40" />}</span>;
}

/** Team statistics: one pill per stat with each team's number at its end, the label above the middle and a bar for each team under it. */
export function TeamStatsPanel({ game, away, home }: { game: LiveGame; away: Side; home: Side }) {
  const [A, H] = game.teams.map((t) => game.teamStats[t.id]);
  if (!A || !H) return null;
  const rows: [string, number, number, string, string][] = [
    ["Total yards", A.yards, H.yards, String(A.yards), String(H.yards)],
    ["Yards per play", A.ypp, H.ypp, A.ypp ? A.ypp.toFixed(1) : "–", H.ypp ? H.ypp.toFixed(1) : "–"],
    ["Passing yards", A.passYds, H.passYds, String(A.passYds), String(H.passYds)],
    ["Rushing yards", A.rushYds, H.rushYds, String(A.rushYds), String(H.rushYds)],
    ["First downs", A.firstDowns, H.firstDowns, String(A.firstDowns), String(H.firstDowns)],
    ["Turnovers", A.turnovers, H.turnovers, String(A.turnovers), String(H.turnovers)],
  ];
  const plain: [string, string, string][] = [["3rd Down", A.third || "–", H.third || "–"]];
  if (A.redZone || H.redZone) plain.push(["Red Zone", A.redZone || "–", H.redZone || "–"]);
  plain.push(["Penalties", A.penalties || "–", H.penalties || "–"]);
  return (
    <section className="gc-panel ts-stats" aria-label="Team statistics">
      <h3 className="ts-title"><i aria-hidden="true" />Team statistics</h3>
      <div className="ts-heads"><TeamHead side={away} /><TeamHead side={home} right /></div>
      <ol className="ts-rows">
        {rows.map(([label, a, h, as, hs]) => {
          const max = Math.max(a, h, 0.0001);
          return (
            <li key={label} className="ts-row" aria-label={`${label}: ${away.abbr} ${as}, ${home.abbr} ${hs}`}>
              <b className="v a">{as}</b>
              <span className="lbl">{label}</span>
              <b className="v h">{hs}</b>
              <span className="bars" aria-hidden="true"><i className="a" style={{ width: `${(a / max) * 100}%` }} /><i className="h" style={{ width: `${(h / max) * 100}%` }} /></span>
            </li>
          );
        })}
      </ol>
      <ul className="ts-plain">
        {plain.map(([label, a, h]) => <li key={label}><b>{a}</b><span>{label}</span><b>{h}</b></li>)}
      </ul>
    </section>
  );
}

/** Who's tilting the field: share of snaps in enemy territory, time of possession and the tilt by quarter. */
export function TiltPanel({ game, away, home }: { game: LiveGame; away: Side; home: Side }) {
  const snaps = game.allOffense;
  if (snaps.length < 6) return null;
  const sh = (side: number, q?: number) => {
    const s = snaps.filter((p) => p[0] === side && (q == null || p[2] === q));
    return s.length ? (s.filter((p) => p[1] < 50).length / s.length) * 100 : null;
  };
  const a = sh(0) ?? 0;
  const h = sh(1) ?? 0;
  const tot = a + h || 1;
  const tiltH = Math.round((h / tot) * 100);
  const leader = Math.abs(a - h) < 5 ? null : a > h ? away : home;
  const [topA, topH] = game.teams.map((t) => mmss(game.teamStats[t.id]?.top ?? "0:00"));
  const topTot = topA + topH;
  const quarters = [1, 2, 3, 4].filter((q) => snaps.some((p) => p[2] === q));
  const posA = game.teamStats[game.teams[0].id]?.top;
  const posH = game.teamStats[game.teams[1].id]?.top;
  return (
    <section className="gc-panel ts-tilt" aria-label="Who's tilting the field">
      <h3 className="ts-title"><i aria-hidden="true" />Who's tilting the field</h3>
      <p className="ts-lead">
        {leader ? <><b>{leader.abbr}</b> is tilting the field: {Math.round(Math.max(a, h))}% of its snaps in enemy territory vs {Math.round(Math.min(a, h))}%</> : <>Level field: {away.abbr} {Math.round(a)}% vs {home.abbr} {Math.round(h)}% of snaps in enemy territory</>}
      </p>
      <div className="ts-split" role="img" aria-label={`Field tilt ${away.abbr} ${100 - tiltH}%, ${home.abbr} ${tiltH}%`}>
        <i className="a" style={{ width: `${100 - tiltH}%` }}>{away.abbr} {100 - tiltH}%</i>
        <i className="h" style={{ width: `${tiltH}%` }}>{home.abbr} {tiltH}%</i>
      </div>
      {topTot > 0 && (
        <>
          <h4 className="ts-sub">Time of Possession</h4>
          <div className="ts-split" role="img" aria-label={`Time on the field (possession): ${away.abbr} ${posA}, ${home.abbr} ${posH}`}>
            <i className="a" style={{ width: `${(topA / topTot) * 100}%` }}>{away.abbr} {posA}</i>
            <i className="h" style={{ width: `${(topH / topTot) * 100}%` }}>{home.abbr} {posH}</i>
          </div>
        </>
      )}
      {quarters.length > 1 && (
        <>
          <h4 className="ts-sub ts-qhead">Snaps in Enemy Territory (by Quarter)<span className="ts-key"><i className="a" />{away.abbr}<i className="h" />{home.abbr}</span></h4>
          <ul className="ts-q">
            {quarters.map((q) => {
              const va = sh(0, q);
              const vh = sh(1, q);
              return (
                <li key={q}>
                  <b>Q{q}</b>
                  <span className="track"><i className="a" style={{ width: `${(va ?? 0) / 2}%` }}>{va == null ? "–" : `${Math.round(va)}%`}</i><i className="h" style={{ width: `${(vh ?? 0) / 2}%` }}>{vh == null ? "–" : `${Math.round(vh)}%`}</i></span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

/** Key takeaways: three plain-language reads of the numbers beside it. */
export function TakeawaysPanel({ game, away, home }: { game: LiveGame; away: Side; home: Side }) {
  const [A, H] = game.teams.map((t) => game.teamStats[t.id]);
  if (!A || !H) return null;
  const lines: string[] = [];
  const diff = A.yards - H.yards;
  lines.push(Math.abs(diff) >= 10 ? `${diff > 0 ? away.abbr : home.abbr} with a +${Math.abs(diff)} yard edge in total offense.` : `Total offense is even (${away.abbr} ${A.yards}, ${home.abbr} ${H.yards} yards).`);
  const snaps = game.allOffense;
  if (snaps.length >= 6) {
    const sh = (side: number) => { const s = snaps.filter((p) => p[0] === side); return s.length ? (s.filter((p) => p[1] < 50).length / s.length) * 100 : 0; };
    const a = sh(0), h = sh(1), t = a + h || 1;
    if (Math.abs(a - h) < 5) lines.push("Field position is even.");
    else { const own = a > h ? away : home; const other = a > h ? home : away; lines.push(`${own.name} owning field position (${share(Math.max(a, h), t)}% of snaps in ${other.abbr} territory).`); }
  }
  const t3a = attempts(A.third), t3h = attempts(H.third);
  const topA = mmss(A.top), topH = mmss(H.top);
  if (t3a && t3h && t3a.of && t3h.of && topA + topH > 0) {
    const pa = share(t3a.made, t3a.of), ph = share(t3h.made, t3h.of);
    const best = pa >= ph ? away : home;
    const bestPct = Math.max(pa, ph);
    const bestTop = (best === away ? topA : topH) >= (best === away ? topH : topA);
    lines.push(bestTop ? `${best.abbr} leads on 3rd down (${bestPct}%) and in time of possession.` : `${best.abbr} efficient on 3rd down (${bestPct}%) but trailing in time of possession.`);
  }
  return (
    <section className="gc-panel ts-take" aria-label="Key takeaways">
      <h3 className="ts-title"><Crosshair size={28} aria-hidden="true" />Key takeaways</h3>
      <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
    </section>
  );
}
