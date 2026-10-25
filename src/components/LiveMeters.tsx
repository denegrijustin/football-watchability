import { useSummary } from "../liveDrive";
import type { WpPoint } from "../insanity";
import { deserveIndex, momentumSwing, type Stats } from "../meterMath";

/** A split meter: the away team's share fills from the left. Only a transform moves. */
function Split({ label, home, away, h, title }: { label: string; home: string; away: string; h: number | null; title: string }) {
  const v = h == null ? null : Math.max(0, Math.min(100, h));
  const lead = v == null ? "–" : v >= 50 ? `${home} ${Math.round(v)}%` : `${away} ${Math.round(100 - v)}%`;
  return (
    <div className="lm" role="img" aria-label={v == null ? `${title}: not enough play yet` : `${title}: ${away} ${Math.round(100 - v)} percent, ${home} ${Math.round(v)} percent`}>
      <span className="lm-k">{label}</span>
      <span className="lm-track"><i style={{ transform: `scaleX(${v == null ? 0.5 : (100 - v) / 100})` }} /></span>
      <span className="lm-v">{lead}</span>
    </div>
  );
}

/** Momentum: a bar growing from the middle toward the team gaining. Full scale is a 15-point swing. */
function Swing({ home, away, swing }: { home: string; away: string; swing: number | null }) {
  const even = swing == null || Math.abs(swing) < 3;
  const m = swing == null ? 0 : Math.max(-1, Math.min(1, swing / 15));
  const who = even ? "Even" : swing! > 0 ? home : away;
  return (
    <div className="lm" role="img" aria-label={even ? "Momentum: even" : `Momentum: ${who} gaining, ${Math.abs(swing!).toFixed(1)} points over the last 12 plays`}>
      <span className="lm-k">Momentum</span>
      <span className="lm-track mid"><i style={{ transform: `scaleX(${-m})` }} /></span>
      <span className="lm-v">{even ? "Even" : `${who} ▲`}</span>
    </div>
  );
}

/**
 * The three live meters on a board card, in place of the field: likelihood to win, momentum, and who deserves to win.
 * It owns the (on-screen only, 15-second) summary fetch that keeps the card's live score fresh.
 */
export function LiveMeters({ espnId, league, wp, away, home }: { espnId: string; league: string; wp: WpPoint[]; away: string; home: string }) {
  const { ref, data } = useSummary(league, espnId, true);
  const hw = wp.at(-1)?.[0];
  const [ta, th] = data?.teams ?? [];
  const stats = (data as unknown as { teamStats?: Record<string, Stats> } | null)?.teamStats;
  const dw = deserveIndex(ta ? stats?.[ta.id] : undefined, th ? stats?.[th.id] : undefined);
  return (
    <div ref={ref} className="live-meters" aria-label="Live game meters">
      <Split label="Win" away={away} home={home} h={hw ?? null} title="Likelihood to win" />
      <Swing away={away} home={home} swing={momentumSwing(wp)} />
      <Split label="Deserve" away={away} home={home} h={dw} title="Deserve to win, from the box score" />
    </div>
  );
}
