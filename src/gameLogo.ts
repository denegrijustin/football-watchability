// A neutral-site or special game gets its own logo in place of a home team's: on the card, in the Game Center and at midfield.
// Pure (no site data) so tests can use it. Drop an official file at the path to replace a stand-in.
export type GameBadge = { name: string; src: string | null; neutral: boolean };

const KNOWN: { teams: [string, string]; name: string; src: string }[] = [
  { teams: ["oklahoma", "texas"], name: "Red River Rivalry", src: "/game-logos/red-river-rivalry.svg" },
];

export const isNeutral = (meta: string | undefined) => /neutral site/i.test(meta ?? "");

/** The game's logo, or null for an ordinary game at a home team's stadium. Neutral sites without art get just the name. */
export function gameBadge(game: { meta?: string; event?: string | null; teams: { logoId?: string }[] }): GameBadge | null {
  const ids = game.teams.map((t) => t.logoId ?? "").sort();
  const known = KNOWN.find((k) => k.teams[0] === ids[0] && k.teams[1] === ids[1]);
  if (known) return { name: known.name, src: known.src, neutral: isNeutral(game.meta) };
  if (game.event) return { name: game.event, src: null, neutral: isNeutral(game.meta) };
  if (isNeutral(game.meta)) return { name: "Neutral site", src: null, neutral: true };
  return null;
}
