import type { CSSProperties } from "react";
import { logos, teamColor, type Game } from "../data";
import { Headshot } from "./Headshot";

export type Injury = {
  name: string;
  pos: string | null;
  jersey: string | null;
  headshot: string | null;
  status: string;
  type: string | null;
  detail: string | null;
};
type TeamInj = { name: string; abbr?: string; logoId: string; color?: string | null; injuries?: Injury[] };

const GAME_STATUS = new Set(["Out", "Doubtful", "Questionable"]);
const short = (s: string) =>
  ({ Out: "Out", Doubtful: "Doubtful", Questionable: "Questionable", "Injured Reserve": "IR", "Physically Unable to Perform": "PUP" })[s] ??
  s;
const cls = (s: string) =>
  s === "Out" ? "out" : s === "Doubtful" ? "doubtful" : s === "Questionable" ? "questionable" : "longterm";

export const teamsOf = (game: Game) => game.teams as unknown as TeamInj[];
export const hasInjuryData = (game: Game) => teamsOf(game).some((t) => (t.injuries ?? []).length);

/** "JAX 2 out · CIN 1 out, 3 questionable" for the section header. */
export function injurySummary(game: Game) {
  return teamsOf(game)
    .map((t) => {
      const inj = (t.injuries ?? []).filter((i) => GAME_STATUS.has(i.status));
      const n = (s: string) => inj.filter((i) => i.status === s).length;
      const bits = [n("Out") && `${n("Out")} out`, n("Doubtful") && `${n("Doubtful")} doubtful`, n("Questionable") && `${n("Questionable")} questionable`].filter(Boolean);
      return `${t.abbr ?? t.name} ${bits.join(", ") || "none listed"}`;
    })
    .join(" · ");
}

/**
 * Key-player injury alert for the card face: season leaders (from the Key
 * players box) listed Out, Doubtful or Questionable.
 */
export function InjuryWatch({ game }: { game: Game }) {
  const box = game.history.boxes.find((b) => /Key players/.test(b.label)) as { players?: { name: string }[] } | undefined;
  const keyNames = new Set((box?.players ?? []).map((p) => p.name));
  const hits = teamsOf(game).flatMap((t) =>
    (t.injuries ?? []).filter((i) => GAME_STATUS.has(i.status) && keyNames.has(i.name)).map((i) => ({ ...i, team: t.abbr ?? t.name })),
  );
  if (!hits.length) return null;
  return (
    <p className="inj-watch">
      <span className="micro-label">Injury watch</span>
      {hits.map((i) => (
        <span key={i.name} className={`inj-chip ${cls(i.status)}`}>
          {i.name} ({i.team} {i.pos}) · <strong>{i.status}</strong>
          {i.type ? `, ${i.type.toLowerCase()}` : ""}
        </span>
      ))}
    </p>
  );
}

/** Full injury report for both teams: status, player, position and injury. */
export function InjuryReport({ game }: { game: Game }) {
  return (
    <div className="detail-content inj">
      {teamsOf(game).map((t) => {
        const list = t.injuries ?? [];
        const now = list.filter((i) => GAME_STATUS.has(i.status));
        const long = list.filter((i) => !GAME_STATUS.has(i.status));
        const color = teamColor(t.color ?? null) ?? "#1d2a35";
        return (
          <section key={t.name} className="inj-team" style={{ "--team": color } as CSSProperties}>
            <h4>
              {logos[t.logoId] && <img src={logos[t.logoId]} alt="" width="20" height="20" />} {t.name}
            </h4>
            {now.length ? (
              <ul>
                {now.map((i) => (
                  <li key={i.name}>
                    <span className={`inj-status ${cls(i.status)}`}>{short(i.status)}</span>
                    <Headshot src={i.headshot} name={i.name} size={28} className="inj-head" />
                    <span className="inj-who">
                      <strong>{i.name}</strong>
                      {i.pos && <span className="kp-pos">{i.pos}</span>}
                    </span>
                    <span className="inj-what">
                      {i.type ?? "Undisclosed"}
                      {i.detail ? ` (${i.detail.toLowerCase()})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="inj-none">No players listed out, doubtful or questionable.</p>
            )}
            {long.length > 0 && (
              <p className="inj-long">
                Also out long-term: {long.map((i) => `${i.name} (${i.pos ?? "?"}, ${short(i.status)}${i.type ? `, ${i.type.toLowerCase()}` : ""})`).join("; ")}
              </p>
            )}
          </section>
        );
      })}
      <p className="source-note">ESPN injury report, updated with each refresh. NFL teams list players as Out, Doubtful or Questionable.</p>
    </div>
  );
}
