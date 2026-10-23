import { useMemo, useState } from "react";
import { logos, slate } from "../data";
import { logoSlug } from "../nfl/model";
import { ChipImg } from "../logoTone";
import { LivePicks, type LivePickItem } from "../spplus/components/LivePicks";
import { cfbLegs, nflLegs } from "../parlayLegs";
import { freshNfl, useLines } from "../lines";
import { freshCfbModel } from "../spplus/data/freshLines";
import { cfbHistory, nflHistory } from "../calibration";
import { PickAccuracy } from "./PickAccuracy";
import { usePickData } from "../pickData";
import { LinesBar } from "./LinesBar";
import { Parlays } from "./Parlays";
import { Skeleton } from "./Skeleton";
import { ParlayRecord } from "./ParlayRecord";
import { AtsRecord } from "./AtsRecord";
import { cfbPicks, nflPicks } from "../pickRecord";
import type { Leg } from "../parlay";
import type { League, View } from "../data";

const openView = (v: View) => window.dispatchEvent(new CustomEvent<View>("fbwatch:open-view", { detail: v }));
const kick = (when: string) => {
  const t = Date.parse(when);
  return !when.includes("T") || Number.isNaN(t) ? when.slice(0, 10) : new Date(t).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

/**
 * One place for the picks: this week's against-the-spread picks (strongest first, following the score once a game starts), the over and under picks,
 * and the recommended parlays. The full tracker and the history are still in the SP+ and NFL+ tabs; this is the shortcut to what to bet.
 */
export function PicksTab({ defaultLeague }: { defaultLeague: League }) {
  const [lg, setLg] = useState<"CFB" | "NFL">(defaultLeague === "CFB" ? "CFB" : "NFL");
  const [part, setPart] = useState<"picks" | "record" | "parlays">("picks");
  const { data, error } = usePickData();
  const { lines } = useLines();

  const hist = useMemo(() => (data ? (lg === "CFB" ? cfbHistory(data.model) : nflHistory(data.nfl)) : null), [data, lg]);
  const graded = useMemo(() => (data ? (lg === "CFB" ? cfbPicks(data.model) : nflPicks(data.nfl)) : []), [data, lg]);
  const legs = useMemo<Leg[]>(() => {
    if (!data || !hist) return [];
    const games = slate.games as never as Parameters<typeof cfbLegs>[2];
    return lg === "CFB" ? cfbLegs(freshCfbModel(data.model, lines, data.espn), data.espn, games, Date.now(), hist) : nflLegs(freshNfl(data.nfl, lines), games, Date.now(), hist);
  }, [data, lg, lines, hist]);

  const items = useMemo<LivePickItem[]>(() => legs.filter((l) => l.kind === "spread" && l.line != null).map((l) => {
    const src = lg === "NFL" ? logos[logoSlug(l.team ?? "")] : data?.model.byId.get(`FBS:${l.team}`)?.logo?.local ?? data?.model.byId.get(`FBS:${l.team}`)?.logo?.remote;
    return {
      id: l.id, by: lg === "CFB" ? "SP+" : "Ratings", pickName: l.team ?? l.label, pickMark: src ? <ChipImg src={src} size={24} /> : <span aria-hidden="true">●</span>,
      line: l.line as number, pickIsHome: !!l.pickIsHome, liveIsHome: l.liveIsHome, awayName: l.away, homeName: l.home, when: kick(l.when),
      gap: l.edge.toFixed(1), gapNum: l.edge, at: l.when, cover: l.cover, raw: l.raw ?? null, hist: l.hist ? { pct: l.hist.pct, n: l.hist.n, bucket: l.hist.bucket, proof: l.hist.proof } : undefined, espnId: l.espnId ?? null,
    };
  }), [legs, lg, data]);
  const totals = useMemo(() => legs.filter((l) => l.kind === "total").sort((a, b) => b.cover - a.cover), [legs]);

  return (
    <section className="picks picks-wrap" aria-label="Picks">
      <div className="ol-controls">
        <div className="segmented" role="group" aria-label="League">
          <button aria-pressed={lg === "CFB"} onClick={() => setLg("CFB")}>College</button>
          <button aria-pressed={lg === "NFL"} onClick={() => setLg("NFL")}>NFL</button>
        </div>
        <div className="segmented" role="group" aria-label="Picks section">
          <button aria-pressed={part === "picks"} onClick={() => setPart("picks")}>This week</button>
          <button aria-pressed={part === "record"} onClick={() => setPart("record")}>ATS record</button>
          <button aria-pressed={part === "parlays"} onClick={() => setPart("parlays")}>Parlays</button>
        </div>
        <button type="button" className="btn small ghost picks-link" title="Open the full team-by-team tracker" onClick={() => openView(lg === "CFB" ? "spplus" : "nfl")}>Full {lg === "CFB" ? "SP+" : "NFL+"} ATS tracker →</button>
      </div>
      {error ? <p className="ol-note">The picks could not be loaded. Reload to try again.</p>
        : !data ? <Skeleton rows={4} />
        : part === "record" ? <AtsRecord picks={graded} label={lg === "CFB" ? "College SP+" : "NFL ratings"} />
        : part === "parlays" ? <><Parlays league={lg} /><ParlayRecord picks={graded} label={lg === "CFB" ? "College SP+" : "NFL ratings"} /></>
        : (
          <>
            {hist && data && <PickAccuracy hist={hist} sigma={lg === "CFB" ? 15.5 : data.nfl.params.model.sigma} label={lg === "CFB" ? "College SP+" : "NFL ratings"} />}
            {items.length ? (
              <LivePicks items={items} title={`${lg === "CFB" ? "College" : "NFL"} picks against the spread`} note="The side the data likes against the spread, strongest first. A game on the field shows whether the pick is covering right now." extra={<LinesBar />} />
            ) : <p className="ol-note">No spread picks to show right now: every game this week has either started or has no line yet.</p>}
            {totals.length > 0 && (
              <div className="picks-totals">
                <h3 className="lev-h">Over / under picks</h3>
                <p className="ol-note">The ratings' own total against the posted one. The bigger the gap, the stronger the lean.</p>
                <ul className="picks-tl">
                  {totals.map((t) => { return (
                    <li key={t.id}><span className="pt-ico" aria-hidden="true">{t.label.startsWith("Over") ? "▲" : "▼"}</span><span className="pt-main"><b>{t.label}</b><small>{t.game} · {kick(t.when)}</small></span><span className="pt-edge">+{t.edge.toFixed(1)} pts</span><span className="pt-cover"><b>{Math.round((t.raw ?? t.cover) * 100)}%</b><small className="lp-tier slight" title="The model's own number. Totals have no track record here yet, so treat them as a coin flip.">Model only</small></span></li>
                  ); })}
                </ul>
              </div>
            )}
          </>
        )}
    </section>
  );
}
