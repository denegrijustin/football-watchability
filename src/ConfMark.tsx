import registry from "./data/conference-logos.json" with { type: "json" };
import { useSyncExternalStore } from "react";
import { LogoMark } from "./logoTone";

type Entry = { label: string; color: string; src?: string; remote?: string[] };
const conferences = registry.conferences as Record<string, Entry>;

/** The conference's entry, or null for independents and anything not listed. */
export const confEntry = (name?: string | null): Entry | null => (name ? conferences[name] ?? null : null);

// Official logos served by ESPN's CDN: the first address that answers is used. Until one has loaded (or if none does) the lettered
// badge shows, so an address that has moved never leaves a hole in the field.
const found = new Map<string, string | null>();
const trying = new Set<string>();
const subs = new Set<() => void>();
function resolve(name: string, urls: string[]) {
  if (found.has(name) || trying.has(name) || typeof Image === "undefined") return;
  trying.add(name);
  const next = (i: number) => {
    if (i >= urls.length) {
      found.set(name, null);
      trying.delete(name);
      subs.forEach((f) => f());
      return;
    }
    const img = new Image();
    img.onload = () => {
      found.set(name, urls[i]);
      trying.delete(name);
      subs.forEach((f) => f());
    };
    img.onerror = () => next(i + 1);
    img.src = urls[i];
  };
  next(0);
}
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));
function useRemote(name: string | null | undefined, urls?: string[]) {
  if (name && urls?.length) resolve(name, urls);
  return useSyncExternalStore(subscribe, () => (name ? found.get(name) ?? null : null), () => null);
}

/**
 * A conference's mark painted on the field: its official logo when one has been added to data/conference-logos.json, otherwise a
 * lettered badge in the conference's color.
 */
export function ConfMark({ conf, cx, cy, size }: { conf?: string | null; cx: number; cy: number; size: number }) {
  const e = confEntry(conf);
  const remote = useRemote(conf, e?.src ? undefined : e?.remote);
  if (!e) return null;
  const logo = e.src ?? remote;
  if (logo)
    return (
      <g className="lf-conf" data-conf={conf} data-logo="official">
        <LogoMark src={logo} cx={cx} cy={cy} size={size} chipOpacity={0.85} />
      </g>
    );
  return (
    <g className="lf-conf" data-conf={conf}>
      <rect x={cx - size / 2} y={cy - size * 0.36} width={size} height={size * 0.72} rx={size * 0.18} fill={e.color} stroke="#fff" strokeWidth="0.4" opacity="0.92" />
      <text x={cx} y={cy + size * 0.12} textAnchor="middle" className="lf-conf-text" style={{ fontSize: `${size * (e.label.length > 3 ? 0.27 : 0.34)}px` }}>
        {e.label}
      </text>
    </g>
  );
}

/** The names the SP+ sheet and the NFL ratings use for the conferences, by the name the logo registry has. */
const ALIAS: Record<string, string> = { AAC: "American", MWC: "Mountain West", CUSA: "Conference USA", MAC: "Mid-American", "Big Ten": "Big Ten", "Indies": "" };

/**
 * A conference's official logo as a small image on a light chip (it has to read on a dark page), for tables and lists. Nothing at all for a conference
 * with no logo (independents), so the caller keeps its own marker.
 */
export function ConfLogo({ conf, size = 20 }: { conf?: string | null; size?: number }) {
  const name = conf != null ? (conf in ALIAS ? ALIAS[conf] : conf) : null;
  const e = confEntry(name);
  const remote = useRemote(name, e?.src ? undefined : e?.remote);
  const src = e?.src ?? remote;
  if (!e || !src) return null;
  return (
    <span data-conf-logo={name} style={{ display: "inline-grid", placeItems: "center", width: size, height: size, borderRadius: size * 0.3, background: "rgba(255,255,255,0.92)", verticalAlign: "middle", flex: "none" }}>
      <img src={src} alt="" width={size * 0.78} height={size * 0.78} style={{ objectFit: "contain" }} />
    </span>
  );
}
