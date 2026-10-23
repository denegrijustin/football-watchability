/**
 * A thin bar for a live game: the left team's share of the win probability, sliding as the game swings. Only a transform animates, so it costs nothing to redraw.
 * `home` is the home team's win probability, 0 to 100.
 */
export function WpBar({ home, away: awayAbbr, homeAbbr }: { home: number; away: string; homeAbbr: string }) {
  const h = Math.max(0, Math.min(100, home)), a = 100 - h;
  const lead = h >= 50 ? `${homeAbbr} ${Math.round(h)}%` : `${awayAbbr} ${Math.round(a)}%`;
  return (
    <div className="wp-bar" role="img" aria-label={`Win probability: ${awayAbbr} ${Math.round(a)} percent, ${homeAbbr} ${Math.round(h)} percent`}>
      <span className="wp-l">{awayAbbr}</span>
      <span className="wp-track"><i style={{ transform: `scaleX(${a / 100})` }} /></span>
      <span className="wp-r">{homeAbbr}</span>
      <span className="wp-lead">{lead}</span>
    </div>
  );
}
