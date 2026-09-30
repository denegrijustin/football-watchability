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

/** College conference availability report behind a game's list (SEC, ACC, Big Ten, Big 12). */
export type Availability = { conf: string; report: string | null; pending: boolean; when: string | null };

// Game-week designations: the NFL's three, plus the college reports' extras.
const GAME_STATUS = new Set(["Out", "Out (1st half)", "Doubtful", "Questionable", "Game-time decision", "Probable"]);
const short = (s: string) =>
  ({
    "Out (1st half)": "Out 1st half",
    "Game-time decision": "Game-time",
    "Injured Reserve": "IR",
    "Physically Unable to Perform": "PUP",
  })[s] ?? s;
const cls = (s: string) =>
  s === "Out" || s === "Out (1st half)"
    ? "out"
    : s === "Doubtful"
      ? "doubtful"
      : s === "Questionable" || s === "Game-time decision"
        ? "questionable"
        : s === "Probable"
          ? "probable"
          : "longterm";
// Statuses that make the card-face injury watch (Probable is expected to play).
const WATCH = new Set(["Out", "Out (1st half)", "Doubtful", "Questionable", "Game-time decision"]);

export const teamsOf = (game: Game) => game.teams as unknown as TeamInj[];
export const availabilityOf = (game: Game) => ((game as { availability?: Availability | null }).availability ?? null);
export const hasInjuryData = (game: Game) => !!availabilityOf(game) || teamsOf(game).some((t) => (t.injuries ?? []).length);

/** "JAX 2 out · CIN 1 out, 3 questionable" for the section header. */
export function injurySummary(game: Game) {
  const av = availabilityOf(game);
  if (av?.pending) return `${av.conf} availability report due ${av.when ?? "before the game"}`;
  return teamsOf(game)
    .map((t) => {
      const inj = (t.injuries ?? []).filter((i) => GAME_STATUS.has(i.status));
      const n = (s: string) => inj.filter((i) => i.status === s).length;
      const bits = [
        n("Out") && `${n("Out")} out`,
        n("Out (1st half)") && `${n("Out (1st half)")} out 1st half`,
        n("Doubtful") && `${n("Doubtful")} doubtful`,
        n("Questionable") && `${n("Questionable")} questionable`,
        n("Game-time decision") && `${n("Game-time decision")} game-time`,
        n("Probable") && `${n("Probable")} probable`,
      ].filter(Boolean);
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
    (t.injuries ?? []).filter((i) => WATCH.has(i.status) && keyNames.has(i.name)).map((i) => ({ ...i, team: t.abbr ?? t.name })),
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
  const av = availabilityOf(game);
  if (av?.pending)
    return (
      <div className="detail-content inj">
        <p className="inj-none inj-pending">
          The {av.conf} posts its first availability report for this game {av.when ? `${av.when}` : "the week of the game"}. It shows up
          here with the next refresh, then updates each evening and again about two hours before kickoff.
        </p>
      </div>
    );
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
                    <span className={`inj-what${av ? " inj-jersey" : ""}`}>
                      {av ? (i.jersey ? `#${i.jersey}` : "") : (i.type ?? "Undisclosed")}
                      {i.detail ? ` (${i.detail.toLowerCase()})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="inj-none">
                {av ? "Every player listed available." : "No players listed out, doubtful or questionable."}
              </p>
            )}
            {long.length > 0 && (
              <p className="inj-long">
                {av ? "Out for the season (exempt from the report)" : "Also out long-term"}: {long.map((i) => av ? `${i.name} (${i.pos ?? "?"})` : `${i.name} (${i.pos ?? "?"}, ${short(i.status)}${i.type ? `, ${i.type.toLowerCase()}` : ""})`).join("; ")}
              </p>
            )}
          </section>
        );
      })}
      {av ? (
        <p className="source-note">
          {av.conf} availability report{av.report ? ` · ${av.report}` : ""}
          {av.when ? `, posted ${av.when}` : ""}. Conference reports list who is available, not the injury. They update each
          evening from three nights out and again about two hours before kickoff (90 minutes in the Big 12).
        </p>
      ) : (
        <p className="source-note">ESPN injury report, updated with each refresh. NFL teams list players as Out, Doubtful or Questionable.</p>
      )}
    </div>
  );
}
