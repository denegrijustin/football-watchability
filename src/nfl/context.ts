import type { NflData, NflGame } from "./types";

const dash = (v: unknown) => (v == null || v === "" ? null : String(v));

/** The facts nflverse has about a game's setting, as [label, value] pairs (only what is filled in). Shared by the NFL tab and the Game Center. */
export function gameFacts(d: NflData, g: NflGame): [string, string][] {
  const t = (a: string) => d.teams[a]?.name.split(" ").pop() ?? a;
  const out: [string, string | null][] = [
    ["Stadium", dash(g.stadium)],
    ["Roof and surface", g.roof || g.surface ? [g.roof, g.surface].filter(Boolean).join(", ") : null],
    ["Weather", g.temp != null || g.wind != null ? [g.temp != null ? `${g.temp}°F` : null, g.wind != null ? `${g.wind} mph wind` : null].filter(Boolean).join(", ") : null],
    ["Rest (days)", g.aRest != null && g.hRest != null ? `${t(g.away)} ${g.aRest}, ${t(g.home)} ${g.hRest}` : null],
    ["Starting QBs", g.aS != null && (g.aQB || g.hQB) ? `${t(g.away)}: ${g.aQB ?? "—"}; ${t(g.home)}: ${g.hQB ?? "—"}` : null],
    ["Head coaches", g.aCoach || g.hCoach ? `${t(g.away)}: ${g.aCoach ?? "—"}; ${t(g.home)}: ${g.hCoach ?? "—"}` : null],
    ["Referee", dash(g.ref)],
    ["Division game", g.div ? "Yes" : null],
  ];
  return out.filter((x): x is [string, string] => x[1] != null);
}

/** Offensive depth-chart starters for a team (QB, RB, up to three WR, TE), when the file has them. */
export function depthLine(d: NflData, abbr: string): string | null {
  const x = d.depth[abbr];
  if (!x) return null;
  const parts = [x.QB?.[0] && `QB ${x.QB[0]}`, x.RB?.[0] && `RB ${x.RB[0]}`, x.WR?.length ? `WR ${x.WR.join(", ")}` : null, x.TE?.[0] && `TE ${x.TE[0]}`].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** The five most-used players on each side of the ball, from nflverse snap counts (played games only). */
export function snapLines(d: NflData, g: NflGame): { team: string; off: string; def: string }[] {
  const s = d.snaps[g.id];
  if (!s) return [];
  return [g.away, g.home].filter((t) => s[t]).map((t) => ({
    team: t,
    off: s[t].off.map(([n, p, c, pct]) => `${n} (${p}) ${c} · ${pct}%`).join("; "),
    def: s[t].def.map(([n, p, c, pct]) => `${n} (${p}) ${c} · ${pct}%`).join("; "),
  }));
}
