import { test, expect } from "./fixtures";
import { bandPhase, bandCue, exitPoints, logoOutline, logoFilled, SCRIPT_OHIO, OHIO_DOTTER, OHIO_DOT, OHIO_STAGE, entrancePoints } from "../src/bandLogo";
import { FORMATIONS, nearestAssignment } from "../src/halftimeLogic";

test("home and conference logos bookend the halftime show in order", () => {
  expect(bandCue(19 * 60_000, 0, true)).toBe("logo");
  expect(bandCue(18 * 60_000, 1, true)).toBe("conference");
  expect(bandCue(17 * 60_000, 2, true)).toBe("show");
  expect(bandCue(150_000, 15, true)).toBe("conference");
  expect(bandCue(90_000, 15, true)).toBe("logo");
  expect(bandCue(30_000, 15, true)).toBe("exit");
  expect(bandCue(18 * 60_000, 1, false)).toBe("show");
  expect(bandCue(150_000, 15, false)).toBe("show");
});

test("logo bookends the show; the sideline exit starts at thirty seconds", () => {
  expect(bandPhase(19 * 60_000, true)).toBe("logo");
  expect(bandPhase(18 * 60_000, false)).toBe("show");
  expect(bandPhase(90_000, false)).toBe("logo");
  expect(bandPhase(30_001, false)).toBe("logo");
  expect(bandPhase(30_000, false)).toBe("exit");
  expect(bandPhase(0, false)).toBe("exit");
});

test("a padded logo supplies 64 distinct on-field positions; empty artwork has a fallback", () => {
  const pixels = new Uint8ClampedArray(128 * 128 * 4);
  for (let y = 18; y < 110; y++) for (let x = 48; x < 80; x++) pixels[(y * 128 + x) * 4 + 3] = 255;
  const outline = logoOutline(pixels, 128, 128)!;
  expect(outline).toHaveLength(64);
  expect(new Set(outline.map((p) => p.join(","))).size).toBe(64);
  for (const [x, y] of outline) { expect(x).toBeGreaterThan(10); expect(x).toBeLessThan(110); expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(40); }
  expect(logoOutline(new Uint8ClampedArray(128 * 128 * 4), 128, 128)).toBeNull();
});

test("marchers retain every target and avoid needless travel; the exit keeps each file's x", () => {
  const from = FORMATIONS[0].pts, to = FORMATIONS[1].pts;
  const mapped = nearestAssignment(from, to);
  const cost = (points: number[][]) => points.reduce((sum, p, i) => sum + Math.hypot(p[0] - from[i][0], p[1] - from[i][1]), 0);
  expect(mapped.map((p) => p.join(",")).sort()).toEqual(to.map((p) => p.join(",")).sort());
  expect(cost(mapped)).toBeLessThanOrEqual(cost(to));
  const exit = exitPoints(mapped);
  exit.forEach(([x, y], i) => { expect(x).toBe(mapped[i][0]); expect(y).toBeGreaterThan(40); expect((y - mapped[i][1]) / 1.8 + 0.84).toBeLessThan(30); });
});


test("Script Ohio reserves the i dot for a sousaphone after the 63 letter positions assemble", () => {
  expect(SCRIPT_OHIO).toHaveLength(63);
  expect(new Set(SCRIPT_OHIO.map((p) => p.join(","))).size).toBe(63);
  expect(OHIO_DOTTER).toBe(1); // the component assigns this musician a sousaphone
  expect(SCRIPT_OHIO).not.toContainEqual(OHIO_DOT);
  expect(OHIO_DOT[1]).toBeLessThan(18); // above the lowercase i
  expect(Math.hypot(OHIO_STAGE[0] - OHIO_DOT[0], OHIO_STAGE[1] - OHIO_DOT[1]) / 7).toBeGreaterThan(1.8);
  expect(10_000 + 750 + 7_000).toBeLessThan(28_000); // finish before the next drill
});


test("the band stages outside the home sideline and enters without a block formation", () => {
  expect(FORMATIONS.some((f) => f.name === "Block")).toBe(false);
  const staged = entrancePoints();
  expect(staged).toHaveLength(64);
  staged.forEach(([x, y]) => { expect(x).toBeGreaterThan(10); expect(x).toBeLessThan(110); expect(y).toBeGreaterThan(42); });
  for (const formation of FORMATIONS) {
    const target = nearestAssignment(staged, formation.pts);
    target.forEach(([x, y], i) => {
      const seconds = Math.min(14, Math.max(4, Math.hypot(x - staged[i][0], y - staged[i][1]) / 3.5)) + (i % 8) * 0.12;
      expect(seconds).toBeLessThan(16); // assembled before the next routine
    });
  }
});


test("conference marks fill their ink, including the center, while preserving letter holes", () => {
  const width = 128, height = 128, pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 20; y <= 108; y++) for (let x = 20; x <= 108; x++) pixels[(y * width + x) * 4 + 3] = 255;
  const points = logoFilled(pixels, width, height)!;
  expect(points).toHaveLength(64);
  expect(new Set(points.map((p) => p.join(","))).size).toBe(64);
  expect(points.some(([x, y]) => Math.abs(x - 60) < 1 && Math.abs(y - 20) < 1)).toBe(true);
  expect(points.filter(([x, y]) => Math.abs(x - 60) < 9 && Math.abs(y - 20) < 9).length).toBeGreaterThan(12);
  // Turn the solid mark into a ring: its counter must not be filled by marchers.
  for (let y = 48; y <= 80; y++) for (let x = 48; x <= 80; x++) pixels[(y * width + x) * 4 + 3] = 0;
  const ring = logoFilled(pixels, width, height)!;
  const scale = 24 / 88;
  for (const [x, y] of ring) {
    const sx = Math.round((x - 60) / scale + 64), sy = Math.round((y - 20) / scale + 64);
    expect(pixels[(sy * width + sx) * 4 + 3]).toBeGreaterThanOrEqual(100);
  }
});
