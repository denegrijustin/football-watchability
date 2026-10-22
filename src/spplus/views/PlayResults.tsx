import { useMemo } from "react";
import { useData } from "../data/useData";
import { useRoute } from "../store";
import { fmt, resolveWeek, rowsFor } from "../data/derive";
import { parseRecord } from "../data/cells";
import { Mark, Notes } from "../components/common";
import { PlayResultsBoard, type BoardTeam } from "../charts/PlayResultsBoard";
import { DIV_LABEL, type DivKey } from "../data/types";

const ord = (n: number) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

/** Every team by SP+ (how it plays) against its record (what it has to show for it). */
export default function PlayResults() {
  const { model } = useData();
  const [route, nav] = useRoute();
  if (!model) return null;
  const week = resolveWeek(model, route.week);
  const div: DivKey = route.div === "ALL" ? "FBS" : route.div;
  const rows = useMemo(() => rowsFor(model, div, week), [model, div, week]);

  const teams: BoardTeam[] = useMemo(() => {
    const played = rows.map((r) => ({ r, rec: parseRecord(r.tw.record?.text) })).filter((x) => x.r.tw.sp != null && x.rec && x.rec.w + x.rec.l + x.rec.t > 0);
    const byPlay = [...played].sort((a, b) => b.r.tw.sp! - a.r.tw.sp!);
    return byPlay.map((x, i) => {
      const { w, l, t } = x.rec!, g = w + l + t, pct = (w + t / 2) / g;
      return {
        id: x.r.team.id, name: x.r.team.name, play: x.r.tw.sp!, playRank: i + 1, winPct: pct, rec: `${w}-${l}${t ? `-${t}` : ""}`,
        rankText: x.r.tw.spRk != null ? ord(x.r.tw.spRk) : ord(i + 1),
        tip: `${x.r.team.name} · ${w}-${l}${t ? `-${t}` : ""} · SP+ ${fmt(x.r.tw.sp)} (${ord(x.r.tw.spRk ?? i + 1)})`,
        logo: <Mark team={x.r.team} size={32} />,
      };
    });
  }, [rows]);

  const shown = route.conf ? new Set(rows.filter((r) => r.tw.conf === route.conf).map((r) => r.team.id)) : null;
  const visible = shown ? teams.filter((t) => shown.has(t.id)) : teams;
  const top = Math.max(1, Math.round(teams.length * 0.1)), bottom = top;
  const winHi = div === "FBS" || div === "FCS" ? 0.7 : 0.7, winLo = 0.45;

  const notes: string[] = [];
  const mismatch = (pred: (t: BoardTeam) => boolean) => teams.filter(pred);
  const n = teams.length;
  const unlucky = mismatch((t) => t.playRank <= n / 3 && t.winPct < winLo).map((t) => t.name);
  const lucky = mismatch((t) => t.playRank > (2 * n) / 3 && t.winPct >= winHi).map((t) => t.name);
  if (unlucky.length) notes.push(`Playing well without the record to show for it: ${unlucky.slice(0, 6).join(", ")}${unlucky.length > 6 ? ` and ${unlucky.length - 6} more` : ""}.`);
  if (lucky.length) notes.push(`Winning without playing like it: ${lucky.slice(0, 6).join(", ")}${lucky.length > 6 ? ` and ${lucky.length - 6} more` : ""}.`);

  return (
    <div className="stack">
      <div className="panel">
        <div className="phead">
          <div><h2>Playing well? Winning?</h2><p className="sub" style={{ margin: 0 }}>{DIV_LABEL[div]} · week {week} · every team by how it plays and what it has to show for it{route.conf ? ` · showing ${route.conf}` : ""}</p></div>
        </div>
        <PlayResultsBoard
          teams={visible} winHi={winHi} winLo={winLo} playLabel="SP+" showRank={visible.length <= 60}
          markTop={top} markBottom={bottom} selected={route.team || null}
          onPick={(id) => nav({ view: "team", team: id })}
          playRule={`Play: SP+ rating, split into thirds across the division's ${n} teams. Results: winning percentage from the record (${winHi.toFixed(3).slice(1)} and up is winning, under ${winLo.toFixed(3).slice(1)} is losing).`}
        />
        <Notes items={notes} />
      </div>
    </div>
  );
}
