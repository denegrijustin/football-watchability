import { expect, test } from "./fixtures";
import { CHIP_DARK, CHIP_LIGHT, chipFor } from "../src/logoTone";

const px = (rgb: [number, number, number], n = 40, a = 255) => Array.from({ length: n }, () => [...rgb, a]).flat();

test("a light logo gets a dark chip; a dark or mid-tone one gets a white chip", () => {
  expect(chipFor(px([255, 255, 255]))).toBe(CHIP_DARK);
  expect(chipFor(px([245, 245, 240]))).toBe(CHIP_DARK);
  expect(chipFor(px([0, 0, 0]))).toBe(CHIP_LIGHT);
  expect(chipFor(px([158, 27, 50]))).toBe(CHIP_LIGHT); // crimson
  expect(chipFor(px([191, 87, 0]))).toBe(CHIP_LIGHT); // burnt orange
});

test("transparent pixels are ignored, so a white logo on a clear background still reads as white", () => {
  expect(chipFor([...px([255, 255, 255], 10), ...px([0, 0, 0], 200, 0)])).toBe(CHIP_DARK);
  expect(chipFor(px([0, 0, 0], 20, 0))).toBe(CHIP_LIGHT); // nothing visible: the default
});

