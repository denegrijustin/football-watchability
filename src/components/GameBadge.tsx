import type { GameBadge } from "../gameLogo";

/** The game's own logo and name, for neutral-site and special games. */
export function GameBadgeRow({ badge, large }: { badge: GameBadge | null; large?: boolean }) {
  if (!badge) return null;
  return (
    <div className={`game-badge${large ? " large" : ""}`}>
      {badge.src && <img src={badge.src} alt="" width={large ? 56 : 34} height={large ? 56 : 34} decoding="async" />}
      <span><b>{badge.name}</b>{badge.neutral && <i> · neutral site</i>}</span>
    </div>
  );
}
