import { TrophyIcon } from "./TrophyIcon";
import "../rivalry.css";

export type Rivalry = { level: number; name: string | null; trophy: { name: string; icon: string } | null; sameGroup?: boolean; meetings?: number };

/**
 * A small chip for a rivalry game: the trophy drawing (when the teams play for one) and the rivalry's name. Nothing for a game that is not one.
 * `compact` is the card's size; the Game Center uses the larger one with the trophy's name written out.
 */
export function RivalryBadge({ rivalry, compact = true }: { rivalry?: Rivalry | null; compact?: boolean }) {
  if (!rivalry) return null;
  const label = rivalry.name ?? (rivalry.sameGroup ? "Conference rivals" : "Rivalry");
  const tip = `${label}${rivalry.trophy ? `: they play for the ${rivalry.trophy.name}` : ""}${rivalry.meetings ? ` · ${rivalry.meetings} meetings` : ""}`;
  return (
    <span className={`rv-badge${compact ? " compact" : ""}${rivalry.trophy ? " trophy" : ""}`} title={tip} data-testid="rivalry-badge">
      {rivalry.trophy ? <TrophyIcon kind={rivalry.trophy.icon} size={compact ? 18 : 24} title={rivalry.trophy.name} /> : <span className="rv-flame" aria-hidden="true">🔥</span>}
      <span className="rv-name">{label}</span>
      {!compact && rivalry.trophy && <span className="rv-trophy">{rivalry.trophy.name}</span>}
    </span>
  );
}
