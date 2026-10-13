import { useState, type ReactNode } from "react";
import { logos } from "../data";
import { useNfl } from "./useNfl";
import { logoSlug } from "./model";
import { navigateNfl } from "./store";

export function NflMark({ abbr, size = 22 }: { abbr: string; size?: number }) {
  const { data } = useNfl();
  const [bad, setBad] = useState(false);
  const name = data?.teams[abbr]?.name ?? abbr;
  const src = logos[logoSlug(name)];
  if (!src || bad) return <span className="mono" style={{ width: size, height: size }} aria-hidden="true">{abbr.slice(0, 3)}</span>;
  return <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setBad(true)} />;
}

export function NflTeamLink({ abbr, size = 22, label }: { abbr: string; size?: number; label?: string }) {
  const { data } = useNfl();
  const name = label ?? data?.teams[abbr]?.name ?? abbr;
  return (
    <span className="tm">
      <NflMark abbr={abbr} size={size} />
      <button type="button" className="name" onClick={() => navigateNfl({ view: "team", team: abbr })}>{name}</button>
    </span>
  );
}

export function TeamSelect({ label, value, onPick, exclude }: { label: string; value: string; onPick: (abbr: string) => void; exclude?: string[] }) {
  const { data } = useNfl();
  if (!data) return null;
  const list = Object.entries(data.teams).filter(([a]) => !exclude?.includes(a)).sort((x, y) => x[1].name.localeCompare(y[1].name));
  return (
    <label className="field">
      <span>{label}</span>
      <select className="ctl" value={value} aria-label={label} onChange={(e) => onPick(e.target.value)} style={{ maxWidth: 220 }}>
        {list.map(([a, t]) => <option key={a} value={a}>{t.name}</option>)}
      </select>
    </label>
  );
}

export const Note = ({ children }: { children: ReactNode }) => <li>{children}</li>;
export const Notes = ({ items }: { items: ReactNode[] }) => (items.length ? <ul className="notes" aria-label="Observations">{items.map((n, i) => <li key={i}>{n}</li>)}</ul> : null);
export const Derived = ({ why }: { why: string }) => <span className="tag derived" title={why}>derived</span>;
