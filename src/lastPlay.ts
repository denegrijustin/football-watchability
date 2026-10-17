// The last play of a game as a picture: ESPN's play text and yardage become the shape of the play (who threw to which side of the field and how
// deep, which gap the runner hit, where the kick went), and the shape becomes a choreography: where each of the 22 players goes, where the ball
// goes and which routes to draw. Pure, so tests can import it.
//
// Coordinates are yards in the offense's own frame: x runs toward the goal it is attacking, from the line of scrimmage at 0; y runs across the
// field, positive to the offense's right.
import { playKind } from "./driveKinds";

export type PlayInput = { text: string; kind: string; yards: number; score?: boolean; turnover?: boolean };
export type Side = "left" | "middle" | "right";
export type PlayShape = {
  type: "pass" | "rush" | "sack" | "punt" | "fg";
  yards: number;
  side: Side | null;
  depth: "short" | "deep" | null;
  /** The runner's gap: where the ball went through the line. */
  gap: "end" | "tackle" | "guard" | "middle" | null;
  complete: boolean;
  intercepted: boolean;
  fumble: boolean;
  td: boolean;
  /** A field goal that went through. */
  good: boolean;
  /** The kick's length in yards (field goal or punt). */
  distance: number;
  passer: string | null;
  target: string | null;
  rusher: string | null;
  defender: string | null;
  text: string;
};

const NAME = "[A-Z][a-zA-Z.'’\\-]+(?: (?:[A-Z][a-zA-Z.'’\\-]+|Jr\\.|Sr\\.|II|III|IV)){0,3}";
const last = (full: string | null | undefined): string | null => {
  if (!full) return null;
  const parts = full.trim().split(/\s+/).filter((w) => !/^(Jr\.?|Sr\.?|II|III|IV)$/i.test(w));
  return parts[parts.length - 1] ?? null;
};
const grab = (text: string, re: RegExp) => last(re.exec(text)?.[1] ?? null);

export function parsePlay(p: PlayInput): PlayShape | null {
  const text = p.text ?? "";
  const flat = `${p.kind} ${text}`;
  let type: PlayShape["type"] | null = null;
  if (/\bsacked\b|\bsack\b/i.test(flat)) type = "sack";
  else {
    const k = playKind(p.kind, text);
    type = k === "pass" ? "pass" : k === "run" ? "rush" : k === "punt" ? "punt" : k === "fg" ? "fg" : null;
  }
  if (!type) return null;
  if (/kneel|spike/i.test(text)) return null;

  const dir = /\b(left|middle|right)\b/i.exec(text)?.[1]?.toLowerCase() as Side | undefined;
  const middle = /up the middle/i.test(text);
  const gapWord = /\b(end|tackle|guard)\b/i.exec(text)?.[1]?.toLowerCase() as "end" | "tackle" | "guard" | undefined;
  const intercepted = type === "pass" && /intercept/i.test(flat);
  const incomplete = type === "pass" && /incomplete|incompletion/i.test(flat);
  const dist = Number(/(\d+)[- ]yard(?:s)? (?:field goal|fg)/i.exec(text)?.[1] ?? /punts (\d+)/i.exec(text)?.[1] ?? 0);
  let yards = Number.isFinite(p.yards) ? p.yards : 0;
  if (type === "sack") {
    const loss = /loss of (\d+)/i.exec(text)?.[1];
    yards = loss ? -Number(loss) : yards > 0 ? -yards : yards;
  }
  if (type === "punt" && !yards) yards = dist;
  if (type === "fg" && !dist) return null;
  return {
    type,
    yards,
    side: type === "rush" ? (middle ? "middle" : dir ?? null) : dir ?? null,
    depth: (/\b(short|deep)\b/i.exec(text)?.[1]?.toLowerCase() as "short" | "deep" | undefined) ?? null,
    gap: type === "rush" ? (middle ? "middle" : gapWord ?? null) : null,
    complete: type === "pass" && !incomplete && !intercepted,
    intercepted,
    fumble: /fumble/i.test(flat),
    td: !!p.score && /touchdown/i.test(flat) && type !== "fg",
    good: type === "fg" && /\bgood\b/i.test(flat) && !/no good|missed|blocked|wide|short/i.test(flat),
    distance: type === "fg" ? dist : Math.abs(yards),
    passer: type === "pass" || type === "sack" ? grab(text, new RegExp(`^(${NAME})\\s+(?:pass|sacked|scrambles|incomplete)`)) : null,
    target: type === "pass" ? grab(text, new RegExp(`\\bto\\s+(?!the\\b)(${NAME})`)) : null,
    rusher: type === "rush" ? grab(text, new RegExp(`^(${NAME})\\s+(?:rush|run|scrambles)`)) : null,
    defender:
      type === "pass" && intercepted
        ? grab(text, new RegExp(`(?:[Ii]ntercepted|INTERCEPTED) by\\s+(${NAME})`))
        : grab(text, new RegExp(`\\((?:[^;)]*;\\s*)?(${NAME})`)),
    text,
  };
}

export type Pt = [number, number];
/** [time 0..1, x, y, height 0..1 (the ball only)] */
export type Key = [number, number, number, number?];
export interface Actor { off: boolean; label?: string; hot?: boolean; kf: Key[] }
export interface Route { pts: Pt[]; hot: boolean; /** when the line is drawn: from, to (0..1) */ at: [number, number] }
export interface Choreo {
  shape: PlayShape;
  /** 11 offense then 11 defense. */
  actors: Actor[];
  ball: Key[];
  routes: Route[];
  /** Where the play ended, for the tackle mark. */
  end: Pt | null;
  /** The goal posts (a kick), in x. */
  posts: number | null;
  xMin: number;
  xMax: number;
  /** A one-line "what happened" for the caption. */
  headline: string;
}

// Offense: 5 linemen, the tight end, the quarterback, the back, two wide receivers and a slot receiver.
const OFF: Pt[] = [[-1, -4], [-1, -2], [-1, 0], [-1, 2], [-1, 4], [-1, 7.5], [-5, 0], [-7, 2.5], [-1, -19], [-1, 19], [-2.2, 12.5]];
// Defense: four linemen, three linebackers, two corners and two safeties.
const DEF: Pt[] = [[1.2, -4.5], [1.2, -1.5], [1.2, 1.5], [1.2, 4.5], [4.5, -7], [4.5, 0], [4.5, 7], [5, -19], [5, 19], [12, -7], [12, 7]];
const WR_L = 8, WR_R = 9, SLOT = 10, TE = 5, QB = 6, RB = 7;
const TIDY = (n: number) => Math.round(n * 10) / 10;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const sideY = (s: Side | null) => (s === "left" ? -15 : s === "right" ? 15 : 0);

export function choreograph(shape: PlayShape): Choreo {
  const actors: Actor[] = [...OFF.map((p): Actor => ({ off: true, kf: [[0, p[0], p[1]]] })), ...DEF.map((p): Actor => ({ off: false, kf: [[0, p[0], p[1]]] }))];
  const o = (i: number) => actors[i];
  const d = (i: number) => actors[11 + i];
  const go = (a: Actor, ...k: Key[]) => { a.kf.push(...k); };
  const routes: Route[] = [];
  let ball: Key[] = [];
  let end: Pt | null = null;
  let posts: number | null = null;
  let xMin = -16, xMax = 30;
  let headline = "";
  const y = shape.yards;

  const holdAll = () => {
    for (const a of actors) {
      const f = a.kf[a.kf.length - 1];
      if (f[0] < 1) a.kf.push([1, f[1], f[2]]);
    }
  };

  if (shape.type === "pass" || shape.type === "sack") {
    const sack = shape.type === "sack";
    const tgtY = sideY(shape.side);
    // The receiver the ball is meant for: the one lined up nearest that side, a tight end or slot over the middle.
    const cands = tgtY === 0 ? (shape.depth === "deep" ? [SLOT, TE] : y <= 2 && shape.complete ? [RB, TE] : [TE, SLOT]) : tgtY < 0 ? [WR_L, SLOT, TE] : [WR_R, SLOT, TE];
    const tIdx = cands[0] === SLOT && tgtY < 0 ? WR_L : cands[0];
    const rec = o(tIdx);
    const start = OFF[tIdx];
    const catchX = shape.complete ? clamp(shape.depth === "deep" ? y - 4 : y * 0.6, y > 0 ? 1 : y, 40) : shape.depth === "deep" ? 24 : 9;
    const endX = shape.complete ? Math.max(y, catchX) : catchX;
    const catchY = clamp(tgtY === 0 ? start[1] * 0.4 : tgtY, -24, 24);
    const qbEnd: Pt = sack ? [clamp(y, -14, -3), 0] : [-7.5, 0];

    // Quarterback drops back and throws (or goes down).
    go(o(QB), [0.18, -7, 0], [0.5, qbEnd[0], qbEnd[1]], [1, qbEnd[0], qbEnd[1]]);
    for (let i = 0; i < 5; i++) go(o(i), [0.2, -2.5, OFF[i][1] * 0.9], [1, sack ? -4.5 : -3, OFF[i][1] * 0.8]);
    go(o(RB), [0.2, -7, 3], [1, tIdx === RB ? Math.max(0, endX) : -5, tIdx === RB ? catchY : 4]);

    const stem = (i: number, depth: number, toY: number, from = 0.12, to = 0.7): Pt[] => {
      const s = OFF[i];
      const bend: Pt = [depth - 2.5, s[1] + (toY - s[1]) * 0.55];
      const e: Pt = [depth, toY];
      go(o(i), [from, s[0], s[1]], [(from + to) / 2, bend[0], bend[1]], [to, e[0], e[1]]);
      return [[s[0], s[1]], bend, e];
    };
    // Receivers other than the target run decoy routes.
    const decoy: [number, number, number][] = [[WR_L, 15, -24], [WR_R, 15, 24], [SLOT, 9, 3], [TE, 6, 10]];
    for (const [i, depth, toY] of decoy) {
      if (i === tIdx) continue;
      const pts = stem(i, sack ? depth * 0.7 : depth, toY);
      routes.push({ pts, hot: false, at: [0.12, 0.7] });
    }
    // The target: stem, catch, and run after the catch.
    const tr = stem(tIdx, catchX, catchY, 0.12, 0.62);
    if (shape.complete) {
      const finishY = clamp(catchY + (catchY >= 0 ? 2 : -2) * Math.min(4, Math.max(0, endX - catchX) / 4), -26, 26);
      go(rec, [1, endX, finishY]);
      routes.push({ pts: [...tr, [endX, finishY]], hot: true, at: [0.12, 1] });
      end = [endX, finishY];
    } else if (!sack) {
      routes.push({ pts: tr, hot: true, at: [0.12, 0.62] });
    }
    rec.hot = !sack;
    rec.label = last(shape.target) ?? undefined;
    o(QB).label = last(shape.passer) ?? undefined;
    o(QB).hot = sack;

    // The ball: snap, drop, then the throw in an arc to the catch point.
    const bx = -1;
    if (sack) {
      ball = [[0, bx, 0, 0], [0.18, -7, 0, 0], [0.5, qbEnd[0], qbEnd[1], 0], [1, qbEnd[0], qbEnd[1], 0]];
      end = qbEnd;
    } else {
      const lift = shape.depth === "deep" ? 1 : 0.55;
      ball = [[0, bx, 0, 0], [0.18, -7, 0, 0], [0.44, -7.5, 0, 0.1]];
      const n = 5;
      for (let k = 1; k <= n; k++) {
        const u = k / n;
        ball.push([0.44 + 0.2 * u, -7.5 + (catchX + 7.5) * u, catchY * u, Math.sin(Math.PI * u) * lift + 0.1 * (1 - u)]);
      }
      if (shape.complete) ball.push([1, endX, end![1], 0]);
      else ball.push([0.85, catchX + 3, catchY + (shape.side === "left" ? -2 : 2), 0], [1, catchX + 4, catchY + (shape.side === "left" ? -3 : 3), 0]);
    }

    // Defense: the line rushes, linebackers drop, corners and safeties cover.
    const rush = (i: number, tx: number, ty: number) => go(d(i), [0.15, DEF[i][0] - 0.2, DEF[i][1]], [0.55, tx, ty], [1, tx, ty]);
    const reach: Pt = sack ? [qbEnd[0] - 0.6, qbEnd[1]] : [-5.5, 0];
    rush(0, sack ? -6 : -3.5, -5);
    rush(1, reach[0], reach[1] + (sack ? 0.6 : 1.5));
    rush(2, sack ? reach[0] : -4.5, sack ? reach[1] - 0.5 : -1);
    rush(3, -3.5, 5);
    go(d(4), [0.5, 8, -9], [1, 9, -9]);
    go(d(5), [0.5, 8, 0], [1, 9, 0]);
    go(d(6), [0.5, 8, 9], [1, 9, 8]);
    go(d(7), [0.5, 7, -19], [1, 8, -19]);
    go(d(8), [0.5, 7, 19], [1, 8, 19]);
    go(d(9), [0.5, 14, -7], [1, 15, -7]);
    go(d(10), [0.5, 14, 7], [1, 15, 7]);
    // Whoever is nearest the target closes on the ball.
    const near = tgtY < 0 ? 7 : tgtY > 0 ? 8 : 5;
    if (!sack) {
      const closeTo: Pt = shape.complete ? [endX, end![1]] : [catchX + 0.8, catchY];
      d(near).kf.length = 1;
      go(d(near), [0.3, DEF[near][0] + 1, DEF[near][1]], [0.64, catchX + 1.2, catchY + (tgtY >= 0 ? -1.2 : 1.2)], [1, closeTo[0] + 1, closeTo[1] + 0.8]);
      d(near).label = shape.defender ? last(shape.defender) ?? undefined : undefined;
      if (shape.intercepted) {
        // The defender takes the ball and runs it back.
        const back: Pt = [Math.max(catchX - 6, -6), catchY - 2];
        d(near).kf.length = 1;
        go(d(near), [0.3, DEF[near][0] - 0.5, DEF[near][1]], [0.64, catchX, catchY], [1, back[0], back[1]]);
        ball = ball.slice(0, ball.length - 2);
        ball.push([0.64, catchX, catchY, 0.1], [1, back[0], back[1], 0]);
        end = back;
      }
    } else {
      d(1).label = last(shape.defender) ?? undefined;
      d(1).hot = true;
    }
    xMax = Math.max(34, endX + 8, catchX + 10);
    xMin = sack ? Math.min(-18, qbEnd[0] - 8) : -16;
    headline = sack ? `Sack: ${y} yards` : shape.intercepted ? "Intercepted" : shape.complete ? `Complete for ${y} yard${y === 1 ? "" : "s"}` : "Incomplete";
    if (shape.complete && shape.td) headline = "Touchdown pass";
  } else if (shape.type === "rush") {
    const hole: Record<string, number> = { end: 9, tackle: 5.5, guard: 3, middle: 0 };
    const sign = shape.side === "left" ? -1 : shape.side === "right" ? 1 : 0;
    const holeY = sign * (shape.gap ? hole[shape.gap] : 4.5) ;
    const gain = y;
    const endX = gain;
    const endY = clamp(holeY + sign * Math.min(Math.max(gain, 0), 12) * 0.25, -22, 22);
    const rb = o(RB);
    go(rb, [0.22, -4.5, 1.5], [0.42, 0.4, holeY], [1, endX, endY]);
    rb.hot = true;
    rb.label = last(shape.rusher) ?? undefined;
    routes.push({ pts: [OFF[RB], [-4.5, 1.5], [0.4, holeY], [endX, endY]], hot: true, at: [0.1, 1] });
    go(o(QB), [0.22, -5.2, 1.2], [1, -5.4, 1.4]);
    for (let i = 0; i < 5; i++) go(o(i), [0.32, 1.6, OFF[i][1] + holeY * 0.3], [1, 2.6, OFF[i][1] + holeY * 0.4]);
    go(o(TE), [0.32, 1.4, OFF[TE][1] - 0.5], [1, 2.8, OFF[TE][1] + sign * 0.5]);
    for (const w of [WR_L, WR_R, SLOT]) go(o(w), [0.5, 5, OFF[w][1] * 0.85], [1, Math.max(6, endX * 0.65), OFF[w][1] * 0.8]);
    ball = [[0, -1, 0, 0], [0.18, -5, 0, 0], [0.3, -4.2, 1.4, 0.15], [0.42, 0.4, holeY, 0], [1, endX, endY, 0]];
    // Defense: the line is held at the line, linebackers fill the gap, the secondary runs the ball down.
    for (let i = 0; i < 4; i++) go(d(i), [0.35, 0.8, DEF[i][1] + holeY * 0.35], [1, 1.2 + (i % 2) * 0.6, DEF[i][1] + holeY * 0.4]);
    const tackle = (i: number, t: number, dx: number, dy: number) => go(d(i), [0.45, 2.5, DEF[i][1] * 0.8 + holeY * 0.3], [t, endX + dx, endY + dy], [1, endX + dx, endY + dy]);
    tackle(4, 1, 0.9, -1.1);
    tackle(5, 1, 1.4, 1.1);
    tackle(6, 1, 1.9, -0.3);
    go(d(7), [0.6, 7, -17], [1, Math.max(endX + 3, 6), clamp(endY - 6, -22, 22)]);
    go(d(8), [0.6, 7, 17], [1, Math.max(endX + 3, 6), clamp(endY + 6, -22, 22)]);
    go(d(9), [0.6, 12, -5], [1, endX + 4, endY - 3]);
    go(d(10), [0.6, 12, 5], [1, endX + 4, endY + 3]);
    d(5).label = last(shape.defender) ?? undefined;
    end = [endX, endY];
    xMax = Math.max(30, endX + 10);
    xMin = -16;
    headline = shape.td ? "Touchdown run" : shape.fumble ? "Fumble" : gain <= 0 ? (gain === 0 ? "No gain" : `Loss of ${-gain}`) : `Run for ${gain} yard${gain === 1 ? "" : "s"}`;
  } else if (shape.type === "punt") {
    const px = -14;
    const land = Math.max(20, y);
    go(o(QB), [0.1, px, 0], [1, px, 0]);
    go(o(RB), [0.15, -8, 0], [1, -6, 0]);
    for (let i = 0; i < 5; i++) go(o(i), [0.25, -2, OFF[i][1] * 0.8], [1, 3, OFF[i][1] * 0.9]);
    go(o(WR_L), [0.8, land - 5, -22], [1, land - 3, -20]);
    go(o(WR_R), [0.8, land - 5, 22], [1, land - 3, 20]);
    for (let i = 0; i < 4; i++) go(d(i), [0.3, -1, DEF[i][1] * 0.8], [1, -3, DEF[i][1] * 0.7]);
    go(d(9), [0.25, land + 8, 0], [0.66, land, 0], [1, land + 1.5, 0]);
    d(9).hot = true;
    ball = [[0, -1, 0, 0], [0.12, px, 0, 0], [0.3, px, 0, 0.1]];
    for (let k = 1; k <= 6; k++) {
      const u = k / 6;
      ball.push([0.3 + 0.36 * u, px + (land - px) * u, 0, Math.sin(Math.PI * u) * 1.2]);
    }
    ball.push([1, land + 1.5, 0, 0]);
    routes.push({ pts: [[px, 0], [land, 0]], hot: true, at: [0.3, 0.66] });
    end = [land + 1.5, 0];
    xMin = -20;
    xMax = Math.max(40, land + 12);
    headline = `Punt, ${shape.distance} yards`;
  } else {
    // Field goal: the kick goes from the holder at 7 yards behind the line to the posts, 10 yards behind the goal line.
    const dist = shape.distance;
    const px = dist - 7;
    posts = px;
    go(o(QB), [0.1, -8, -1.8], [0.4, -7.5, -2], [0.5, -6.2, -1], [1, -5.8, -0.8]);
    o(QB).hot = true;
    go(o(RB), [0.1, -7, 0], [1, -7, 0]);
    for (let i = 0; i < 5; i++) go(o(i), [0.25, -1.5, OFF[i][1] * 0.8], [1, -1.5, OFF[i][1] * 0.8]);
    for (let i = 0; i < 4; i++) go(d(i), [0.35, 0.2, DEF[i][1] * 0.7], [0.5, -1.2, DEF[i][1] * 0.45], [1, -2, DEF[i][1] * 0.3]);
    const wide = shape.good ? 0 : 3.4;
    ball = [[0, -1, 0, 0], [0.12, -7, 0, 0], [0.4, -7, 0, 0]];
    for (let k = 1; k <= 7; k++) {
      const u = k / 7;
      ball.push([0.4 + 0.4 * u, -7 + (px + 7) * u, wide * u * u, Math.sin(Math.PI * u * 0.9) * 1.3 + 0.2 * u]);
    }
    ball.push([1, px + 3.5, wide * 1.15, 0]);
    routes.push({ pts: [[-7, 0], [px, wide]], hot: true, at: [0.4, 0.8] });
    end = null;
    xMin = -16;
    xMax = Math.max(34, px + 10);
    headline = `${dist}-yard field goal${shape.good ? " is good" : " is no good"}`;
  }

  holdAll();
  ball.sort((a, b) => a[0] - b[0]);
  for (const a of actors) {
    a.kf.sort((p, q) => p[0] - q[0]);
    a.kf = a.kf.map((k) => [TIDY(k[0] * 1000) / 1000, TIDY(k[1]), TIDY(k[2])] as Key);
  }
  return { shape, actors, ball, routes, end, posts, xMin, xMax, headline };
}
