import registry from "./data/game-logos.json" with { type: "json" };

// A neutral-site or special game gets its own logo in place of a home team's: on the card, in the Game Center and at midfield of the
// halftime band. The games and their logos are listed in data/game-logos.json (see its "$doc"). Pure so tests can use it.
export type GameBadge = { name: string; src: string | null; neutral: boolean };
type Entry = { name: string; src: string; teams?: string[]; event?: string };

export const isNeutral = (meta: string | undefined) => /neutral site/i.test(meta ?? "");

/** The game's logo, or null for an ordinary game at a home team's stadium. Neutral sites without art get just the name. */
export function gameBadge(game: { meta?: string; event?: string | null; teams: { logoId?: string }[] }): GameBadge | null {
  const ids = game.teams.map((t) => t.logoId ?? "").sort();
  const known = (registry.games as Entry[]).find(
    (k) => (k.teams && k.teams[0] === ids[0] && k.teams[1] === ids[1]) || (k.event && game.event && new RegExp(k.event, "i").test(game.event)),
  );
  const neutral = isNeutral(game.meta);
  if (known) return { name: known.name, src: known.src, neutral };
  if (game.event) return { name: game.event, src: null, neutral };
  if (neutral) return { name: "Neutral site", src: null, neutral: true };
  return null;
}
