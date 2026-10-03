import { test, expect } from "@playwright/test";
import { liveStatusParts } from "../src/liveStatus";

test("ESPN status text becomes quarter and clock", () => {
  expect(liveStatusParts("5:12 - 3rd")).toEqual({ period: "Q3", clock: "5:12", text: "" });
  expect(liveStatusParts("10:00 - 1st")).toEqual({ period: "Q1", clock: "10:00", text: "" });
  expect(liveStatusParts("Q3 5:12")).toEqual({ period: "Q3", clock: "5:12", text: "" });
  expect(liveStatusParts("0:42 - 4th")).toEqual({ period: "Q4", clock: "0:42", text: "" });
  expect(liveStatusParts("2:10 - OT")).toEqual({ period: "OT", clock: "2:10", text: "" });
  expect(liveStatusParts("End of 2nd")).toEqual({ period: "Q2", clock: "End", text: "" });
  expect(liveStatusParts("Halftime")).toEqual({ period: "Half", clock: "", text: "" });
  // Anything unexpected is kept as text rather than dropped.
  expect(liveStatusParts("Delayed")).toEqual({ period: "", clock: "", text: "Delayed" });
  expect(liveStatusParts("  Rain delay  ")).toEqual({ period: "", clock: "", text: "Rain delay" });
});
