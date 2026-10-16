/**
 * "Legacy": what the two programs' history says. A small, capped nudge to the expected margin from the all-time series and the last
 * five meetings. History says little about this year's game, so the prior is deliberately tiny (at most 1.5 points) and it fades
 * when the two have met only a few times.
 */
export interface LegacyBox { label: string; value: string; items: string[] }
export interface Legacy {
  /** Points added to the away team's expected margin (negative favors the home team). */
  nudgeAway: number;
  series: string | null;
  recent: string[];
  note: string;
}

const NONE: Legacy = { nudgeAway: 0, series: null, recent: [], note: "No head-to-head history on file: no legacy adjustment." };

export function legacyFor(boxes: LegacyBox[] | undefined, away: { name: string; abbr: string }, home: { name: string; abbr: string }): Legacy {
  if (!boxes) return NONE;
  const seriesBox = boxes.find((b) => /series/i.test(b.label));
  const recentBox = boxes.find((b) => /recent/i.test(b.label));
  const within = (leader: string, t: { name: string }) => {
    const l = leader.trim().toLowerCase();
    return l.length > 1 && (t.name.toLowerCase().includes(l) || l.includes(t.name.toLowerCase()));
  };
  let share = 0.5, n = 0;
  const m = seriesBox?.value.match(/^(.+?)\s+(?:leads?|lead)\s+(\d+)[–-](\d+)(?:[–-](\d+))?/i);
  if (m) {
    const w = +m[2], l = +m[3], t = +(m[4] ?? 0);
    n = w + l + t;
    const leaderIsAway = within(m[1], away), leaderIsHome = within(m[1], home);
    if (n > 0 && (leaderIsAway || leaderIsHome)) {
      const leaderShare = (w + 0.5 * t) / n;
      share = leaderIsAway ? leaderShare : 1 - leaderShare;
    }
  }
  const fade = n / (n + 30);
  const seriesNudge = (share - 0.5) * 2 * fade;
  let recentSum = 0, k = 0;
  const recent: string[] = [];
  for (const it of recentBox?.items.slice(0, 5) ?? []) {
    recent.push(it);
    const r = it.match(/^\d{4}\s+(\S+)\s+\d+[–-]\d+/);
    if (!r) continue;
    k++;
    const w = r[1].toLowerCase();
    if (w === away.abbr.toLowerCase()) recentSum += 1;
    else if (w === home.abbr.toLowerCase()) recentSum -= 1;
  }
  const recentNudge = k ? (recentSum / k) * 0.5 : 0;
  const nudgeAway = Math.max(-1.5, Math.min(1.5, seriesNudge + recentNudge));
  return {
    nudgeAway,
    series: seriesBox?.value ?? null,
    recent,
    note: `All-time series ${seriesNudge >= 0 ? "+" : ""}${seriesNudge.toFixed(2)} and last ${k || 0} meetings ${recentNudge >= 0 ? "+" : ""}${recentNudge.toFixed(2)} points for ${away.name} (capped at ±1.5).`,
  };
}
