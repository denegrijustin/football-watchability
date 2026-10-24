// Where on the body an injury is, for the animated figure: maps ESPN's injury type, location and detail to a spot on a front-facing figure.
// Pure, so the tests can import it. Coordinates are on a 130 x 230 canvas matching the player pictures in public/injury (head at the top, feet at the bottom), the figure
// facing the viewer, so a player's LEFT side is the viewer's RIGHT (x above CENTER).
export const CENTER = 65;

export type Hit = { x: number; y: number; r: number };
export type Region = { key: string | null; hits: Hit[]; effect: "pulse" | "ripple"; label: string; paired: boolean; sideKnown: boolean };

type Spot = { key: string; match: RegExp; x: number; y: number; r: number; paired?: boolean; effect?: "ripple"; label: string };
// Order matters: the first that matches wins (so "knee" is found before the general "leg").
const SPOTS: Spot[] = [
  { key: "head", match: /concussion|\bhead\b|\bface\b|\bjaw\b|\beye\b|\bnose\b|\bear\b|skull/i, x: 65.0, y: 23, r: 14, effect: "ripple", label: "Head" },
  { key: "neck", match: /neck|cervical|stinger/i, x: 65.0, y: 49.5, r: 8, label: "Neck" },
  { key: "shoulder", match: /shoulder|clavicle|collarbone|ac joint|rotator/i, x: 38.5, y: 57, r: 10, paired: true, label: "Shoulder" },
  { key: "chest", match: /chest|rib|pectoral|pec\b|sternum/i, x: 65.0, y: 79.5, r: 13, label: "Chest and ribs" },
  { key: "abdomen", match: /abdom|oblique|\bcore\b|stomach|hernia/i, x: 65.0, y: 95, r: 12, label: "Abdomen" },
  { key: "back", match: /\bback\b|spine|\bdisc\b|lumbar/i, x: 65.0, y: 93, r: 15, label: "Back" },
  { key: "elbow", match: /elbow/i, x: 36.1, y: 93, r: 7, paired: true, label: "Elbow" },
  { key: "hand", match: /wrist|hand|finger|thumb/i, x: 31.5, y: 124, r: 8, paired: true, label: "Wrist and hand" },
  { key: "arm", match: /bicep|tricep|forearm|arm\b/i, x: 37.2, y: 77, r: 9, paired: true, label: "Arm" },
  { key: "groin", match: /groin|adductor/i, x: 65.0, y: 117, r: 10, label: "Groin" },
  { key: "hip", match: /\bhip\b|pelvis|glute/i, x: 49.5, y: 115, r: 11, paired: true, label: "Hip" },
  { key: "knee", match: /knee|mcl|acl|pcl|meniscus|patella/i, x: 49.5, y: 165.5, r: 9, paired: true, label: "Knee" },
  { key: "thigh", match: /hamstring|quad|thigh/i, x: 49.5, y: 140.5, r: 12, paired: true, label: "Thigh" },
  { key: "ankle", match: /ankle|achilles|heel/i, x: 47.2, y: 204, r: 8, paired: true, label: "Ankle" },
  { key: "foot", match: /foot|toe|plantar|lisfranc/i, x: 47.2, y: 215, r: 9, paired: true, label: "Foot" },
  { key: "calf", match: /calf|shin|lower leg|leg\b/i, x: 49.5, y: 181.5, r: 10, paired: true, label: "Lower leg" },
];

/** The body spot for an injury, or { key: null } for an illness or an injury with no stated area. */
export function bodyRegion(type: string | null | undefined, location?: string | null, detail?: string | null, side?: string | null): Region {
  const sideKnown = /^(left|right)$/i.test(side ?? "");
  const left = /^left$/i.test(side ?? "");
  // The injury type decides first; the location ("Leg", "Arm") is only a fallback, because it is broader than the type.
  const spot = SPOTS.find((s) => s.match.test(type ?? "")) ?? SPOTS.find((s) => s.match.test(`${detail ?? ""}`)) ?? SPOTS.find((s) => s.match.test(location ?? ""));
  if (!spot) return { key: null, hits: [], effect: "pulse", label: /illness|flu|sick/i.test(type ?? "") ? "Illness" : "Area not disclosed", paired: false, sideKnown };
  const mirror = (h: Hit): Hit => ({ ...h, x: 2 * CENTER - h.x });
  const base: Hit = { x: spot.x, y: spot.y, r: spot.r };
  const hits = !spot.paired ? [base] : sideKnown ? [left ? mirror(base) : base] : [base, mirror(base)];
  return { key: spot.key, hits, effect: spot.effect ?? "pulse", label: spot.label, paired: !!spot.paired, sideKnown };
}
