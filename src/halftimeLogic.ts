import { liveStatusParts } from "./liveStatus";

// Pure halftime logic (no site data), shared by the card component and the tests.
/** College halftime runs 20 minutes. */
export const HALFTIME_MS = 20 * 60_000;
/** The score feed runs about a minute behind the stadium, so halftime had already started that long before we saw it. */
export const FEED_DELAY_MS = 60_000;

/** NFL halftime runs 12 minutes. */
export const NFL_HALFTIME_MS = 12 * 60_000;

/** The acts an NFL halftime draws from. Each game gets one, and it is the only act for the whole twelve minutes. */
export const NFL_ACTS = [
  { id: "shoe", name: "Shoe Scramble", blurb: "blindfolded, they hunt the pile for their own shoe, then sprint to the end zone" },
  { id: "inflatable", name: "Inflatable Race", blurb: "top-heavy inflatable suits race down the field, and mostly fall over" },
  { id: "dizzy", name: "Dizzy Bat Field Goal", blurb: "ten spins around a bat, then try to kick a field goal" },
  { id: "cash", name: "Progressive Cash Kick", blurb: "one fan, three kicks and throws, bigger prizes each time" },
  { id: "slingshot", name: "Air Cannon Catch", blurb: "a fan in the end zone tries to catch a football fired from the 40" },
  { id: "wiener", name: "Wiener Dog Dash", blurb: "a line of dachshunds runs the length of the field" },
  { id: "tron", name: "LED Light Show", blurb: "dancers in LED suits light up the darkened field" },
] as const;
export type NflAct = (typeof NFL_ACTS)[number];

/** The act for a game. It is fixed by the game's id, so the card and the Game Center show the same one, and different games rotate through all of them. */
export function actFor(espnId: string): NflAct {
  let h = 0;
  for (const c of espnId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return NFL_ACTS[h % NFL_ACTS.length];
}

export const isHalftime = (detail: string | undefined | null) => liveStatusParts(detail ?? "").period === "Half";

const KEY = (id: string) => `fbwatch-halftime-${id}`;
/** When this game's halftime was first seen, remembered so a reload doesn't restart the clock. */
export function firstSeen(id: string, now: number) {
  try {
    const saved = Number(localStorage.getItem(KEY(id)));
    // A stamp older than a day belongs to some other game day.
    if (Number.isFinite(saved) && saved > 0 && now - saved < 86_400_000 && now >= saved) return saved;
    localStorage.setItem(KEY(id), String(now));
  } catch {
    /* private mode: the clock starts from this visit */
  }
  return now;
}

/** Time left of the 20 minutes, counting the feed's delay as already elapsed. */
export const halftimeLeft = (seenAt: number, now: number, total = HALFTIME_MS) => Math.max(0, total - (now - seenAt) - FEED_DELAY_MS);
export const clockText = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;

// ---------- the band ----------
export const N = 64;
type Pt = [number, number];
const CX = 60;
const CY = 20;

/** `n` points spread evenly along a closed polyline. */
function along(poly: Pt[], n: number): Pt[] {
  const pts = [...poly, poly[0]];
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = seg.reduce((a, b) => a + b, 0);
  const out: Pt[] = [];
  for (let k = 0; k < n; k++) {
    let d = (k / n) * total;
    let i = 0;
    while (i < seg.length - 1 && d > seg[i]) d -= seg[i++];
    const t = seg[i] ? d / seg[i] : 0;
    out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
  }
  return out;
}
const ring = (r: number, n: number, off = 0): Pt[] => Array.from({ length: n }, (_, i) => [CX + r * Math.cos(off + (i / n) * 2 * Math.PI), CY + r * Math.sin(off + (i / n) * 2 * Math.PI)]);

/** The formations the band cycles through, each a position for every one of the N members. */
export const FORMATIONS: { name: string; pts: Pt[] }[] = [
  { name: "Block", pts: Array.from({ length: N }, (_, i) => [CX + ((i % 16) - 7.5) * 3.3, CY + (Math.floor(i / 16) - 1.5) * 3.3] as Pt) },
  { name: "Ring", pts: [...ring(15, 40), ...ring(8, 24, 0.3)] },
  {
    name: "Star",
    pts: along(
      Array.from({ length: 10 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 7 : 17;
        return [CX + r * Math.cos(a), CY + r * Math.sin(a)] as Pt;
      }),
      N,
    ),
  },
  {
    name: "Waves",
    pts: Array.from({ length: N }, (_, i) => {
      const x = 22 + (i % 32) * 2.4;
      return [x, CY + (i < 32 ? -7 : 7) * Math.sin(((x - 22) / 76) * Math.PI * 3)] as Pt;
    }),
  },
  { name: "Diamond", pts: along([[CX, CY - 16], [CX + 24, CY], [CX, CY + 16], [CX - 24, CY]], N) },
  {
    name: "Plus",
    pts: along([[CX - 4, CY - 17], [CX + 4, CY - 17], [CX + 4, CY - 4], [CX + 22, CY - 4], [CX + 22, CY + 4], [CX + 4, CY + 4], [CX + 4, CY + 17], [CX - 4, CY + 17], [CX - 4, CY + 4], [CX - 22, CY + 4], [CX - 22, CY - 4], [CX - 4, CY - 4]], N),
  },
];
/** A formation is held a few seconds, then the band marches to the next one (see MOVE_MS). */
export const STEP_MS = 16000;
/** The march between formations: at an even walking pace with a soft start and stop. */
export const MOVE_MS = 10000;


/** Degrees the band member `i` faces at formation step `step`: toward where it just marched from the last formation. */
const angleCache = new Map<number, number[]>();
export function anglesAt(step: number): number[] {
  const hit = angleCache.get(step);
  if (hit) return hit;
  if (step <= 0) {
    const first = Array.from({ length: N }, () => 90); // the block starts facing the near sideline
    angleCache.set(0, first);
    return first;
  }
  const prev = anglesAt(step - 1);
  const a = FORMATIONS[(step - 1) % FORMATIONS.length].pts;
  const b = FORMATIONS[step % FORMATIONS.length].pts;
  const out = prev.map((old, i) => {
    const dx = b[i][0] - a[i][0];
    const dy = b[i][1] - a[i][1];
    if (Math.hypot(dx, dy) < 0.6) return old; // hardly moving: keep facing the same way
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    while (deg - old > 180) deg -= 360; // take the short way round so members don't spin
    while (deg - old < -180) deg += 360;
    return deg;
  });
  angleCache.set(step, out);
  return out;
}

/** Mix a #rrggbb color toward white (t > 0) or black (t < 0). */
export function mix(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(t >= 0 ? c + (255 - c) * t : c * (1 + t)));
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
