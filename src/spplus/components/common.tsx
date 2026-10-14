import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useData } from "../data/useData";
import { useRoute } from "../store";
import type { Team } from "../data/types";

export const Derived = ({ why }: { why: string }) => <span className="tag derived" title={why}>derived</span>;

export function Mark({ team, size = 22 }: { team: Team | undefined; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = team?.logo?.local ?? team?.logo?.remote;
  if (!team || !src || failed) {
    const ini = (team?.name ?? "?").split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    return <span className="mono" style={{ width: size, height: size }} aria-hidden="true">{ini}</span>;
  }
  return <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

/** Team logo + name; the name opens the team profile. */
export function TeamLink({ team, label, size = 22, plain }: { team: Team | undefined; label?: string; size?: number; plain?: boolean }) {
  const [, nav] = useRoute();
  const name = label ?? team?.name ?? "—";
  return (
    <span className="tm">
      <Mark team={team} size={size} />
      {team && !plain ? <button type="button" className="name" onClick={() => nav({ view: "team", team: team.id })}>{name}</button> : <span>{name}</span>}
    </span>
  );
}

export function useTeamLookup() {
  const { model } = useData();
  return useMemo(() => {
    const byName = new Map<string, Team>();
    if (model) for (const t of model.teams) { const cur = byName.get(t.name); if (!cur || t.division === "FBS") byName.set(t.name, t); }
    return (name: string | null | undefined) => (name ? byName.get(name) : undefined);
  }, [model]);
}

export function Notes({ items }: { items: ReactNode[] }) {
  if (!items.length) return null;
  return <ul className="notes" aria-label="Observations">{items.map((n, i) => <li key={i}>{n}</li>)}</ul>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** Add / remove a team from the comparison tray. */
export function CompareToggle({ id }: { id: string }) {
  const [route, nav] = useRoute();
  const on = route.compare.includes(id);
  return (
    <button type="button" className={`btn small${on ? " on" : ""}`} aria-pressed={on} onClick={() => nav({ compare: on ? route.compare.filter((x) => x !== id) : [...route.compare, id].slice(-4) }, { replace: true })}>
      {on ? "In compare" : "+ Compare"}
    </button>
  );
}

/** Column template for a two-column .grid2 (it collapses to one column on narrow screens). */
export const cols2 = (template: string): CSSProperties => ({ "--cols": template }) as CSSProperties;
