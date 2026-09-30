import { INSANITY_TIERS, insanity, thinWp, type WpPoint } from "../insanity";
import { WinProb } from "./WinProb";

const periodName = (q: number | null) => (q == null ? null : q > 4 ? "overtime" : `Q${q}`);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * Insanity meter for a finished game (look-back) or one in progress (live):
 * how wild the game is, from its win-probability line, with the witching hour
 * (the busiest stretch) shaded on the line below.
 */
export function InsanityMeter({
  wp,
  final,
  overtime = false,
  away,
  home,
}: {
  wp: WpPoint[];
  final: boolean;
  overtime?: boolean;
  away: string;
  home: string;
}) {
  const series = thinWp(wp);
  const ins = insanity(series, { final, overtime });
  if (!ins) return <WinProb wp={series} away={away} home={home} />;
  const q = periodName(ins.witching.period);
  const facts = [
    ins.flips ? `${plural(ins.flips, "lead change")}` : "No lead changes",
    ins.biggestSwing >= 15 ? `biggest swing ${ins.biggestSwing} pts` : null,
    final && ins.comebackFrom != null && ins.comebackFrom <= 25 ? `winner was down to ${ins.comebackFrom}%` : null,
    final && overtime ? "went to overtime" : null,
  ].filter(Boolean);
  return (
    <section
      className={`insanity ${ins.tier.id}${final ? "" : " live"}`}
      aria-label={`Insanity meter: ${ins.score} of 100, ${ins.tier.label}`}
    >
      <div className="ins-head">
        <h4 className="micro-label">{final ? "Insanity meter" : "Insanity meter · live"}</h4>
        {!final && ins.trend && ins.trend !== "steady" && (
          <span className={`ins-trend ${ins.trend}`}>{ins.trend === "heating" ? "Heating up" : "Cooling off"}</span>
        )}
      </div>
      <div className="ins-row">
        <strong className="ins-score">{ins.score}</strong>
        <div className="ins-gauge">
          <div className="ins-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ins.score} aria-label="Insanity">
            {[...INSANITY_TIERS].reverse().map((t, i, all) => (
              <span
                key={t.id}
                className={`ins-seg ${t.id}${ins.score >= t.min ? " on" : ""}`}
                style={{ width: `${(all[i + 1]?.min ?? 100) - t.min}%` }}
              />
            ))}
            <span className="ins-needle" style={{ left: `${Math.min(98, ins.score)}%` }} aria-hidden="true" />
          </div>
          <span className="ins-tier">{ins.tier.label}</span>
        </div>
      </div>
      <p className="ins-facts">
        {facts.join(" · ")}
        {q && ins.tier.id !== "calm" && (
          <>
            {" · "}
            <span className="ins-hour">witching hour: {q}</span>
          </>
        )}
      </p>
      <WinProb wp={series} away={away} home={home} hot={ins.tier.id === "calm" ? undefined : ins.witching} />
    </section>
  );
}
