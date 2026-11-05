import lore from "../data/rivalry-lore.json" with { type: "json" };
import type { Game } from "../data";

type Moment = { year: number; title: string; text: string };
type Entry = {
  title: string;
  started?: number;
  summary: string;
  origin: string[];
  trophy: { name: string; text: string } | null;
  moments: Moment[];
  sources: { label: string; url: string }[];
};
const ENTRIES = lore.rivalries as Record<string, Entry>;

/** The key a rivalry is stored under: the two logo ids, sorted, joined with a bar. */
export const pairKey = (ids: (string | undefined)[]) => ids.map((i) => i ?? "").sort().join("|");
export const loreFor = (game: Pick<Game, "teams">): Entry | null => ENTRIES[pairKey(game.teams.map((t) => t.logoId))] ?? null;

const rank = (t: { rankings?: string[] }) => /^AP #(\d+)/.exec(t.rankings?.[0] ?? "")?.[1] ?? null;

/** What is on the line this week, from the game's own data: rankings, a conference game, the trophy. */
export function stakes(game: Game): string[] {
  const out: string[] = [];
  const r = (game as { rivalry?: { sameGroup?: boolean; trophy?: { name: string } | null } }).rivalry;
  const [a, b] = game.teams as unknown as { name: string; rankings?: string[] }[];
  const ra = rank(a), rb = rank(b);
  if (ra && rb) out.push(`Two ranked teams: ${a.name} is No. ${ra} and ${b.name} is No. ${rb} in the AP poll.`);
  else if (ra || rb) out.push(`${ra ? a.name : b.name} is No. ${ra ?? rb} in the AP poll; ${ra ? b.name : a.name} is not ranked.`);
  if (r?.sameGroup) out.push(game.league === "NFL" ? "A division game, so it counts twice in the standings race." : "A conference game, so it counts in the conference race.");
  if (r?.trophy) out.push(`The winner takes the ${r.trophy.name}.`);
  return out;
}

/** The story of a rivalry or trophy game: how it started, the trophy, the games people still talk about, and what is at stake this year. */
export function RivalryDeepCut({ game }: { game: Game }) {
  const e = loreFor(game);
  if (!e) return null;
  const on = stakes(game);
  return (
    <div className="detail-content rv-deep" data-testid="rivalry-deep-cut">
      <p className="rv-summary"><b>{e.title}</b>{e.started ? ` · since ${e.started}` : ""}. {e.summary}</p>
      <h4 className="micro-label">How it started</h4>
      <ul>{e.origin.map((t, i) => <li key={i}>{t}</li>)}</ul>
      {e.trophy && (<><h4 className="micro-label">The trophy</h4><p><b>{e.trophy.name}.</b> {e.trophy.text}</p></>)}
      {e.moments.length > 0 && (
        <>
          <h4 className="micro-label">Games people still talk about</h4>
          <ul className="rv-moments">{e.moments.map((m) => <li key={m.year}><b>{m.year} · {m.title}.</b> {m.text}</li>)}</ul>
        </>
      )}
      {on.length > 0 && (<><h4 className="micro-label">This year</h4><ul>{on.map((t, i) => <li key={i}>{t}</li>)}</ul></>)}
      <p className="source-note">Sources: {e.sources.map((s, i) => <span key={s.url}>{i ? " · " : ""}<a href={s.url} target="_blank" rel="noreferrer noopener">{s.label} ↗</a></span>)}. The all-time record and every meeting are under History below.</p>
    </div>
  );
}
