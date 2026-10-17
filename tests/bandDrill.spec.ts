import { test, expect } from "@playwright/test";
import { bandPhase, exitPoints, logoOutline } from "../src/bandLogo";
import { FORMATIONS, nearestAssignment } from "../src/halftimeLogic";

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
