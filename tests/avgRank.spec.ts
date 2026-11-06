import { expect, test } from "./fixtures";
import { averageRanks, strengthOfSchedule } from "../src/spplus/data/avgRank";

test("strength of schedule ranks the hardest schedule (the strongest opponents) first, and counts only opponents it has a rating for", () => {
  const rating = new Map([["A", 10], ["B", 5], ["C", -5], ["D", 0]]);
  const opps = new Map([["A", ["B", "C"]], ["B", ["A", "D"]], ["C", ["A", "B", "FCS Team"]], ["D", []]]);
  const s = strengthOfSchedule(opps, rating);
  expect(s.get("C")).toEqual({ avg: 7.5, rank: 1, games: 2 }); // A (10) and B (5); the unrated FCS opponent is not counted
  expect(s.get("B")).toEqual({ avg: 5, rank: 2, games: 2 }); // A (10) and D (0)
  expect(s.get("A")).toEqual({ avg: 0, rank: 3, games: 2 }); // B (5) and C (-5)
  expect(s.has("D")).toBe(false); // no games, no rank
});

test("the overall number is the average of the ranks, to one decimal, and is itself ranked best first, with ties sharing a rank", () => {
  const r = averageRanks(new Map<string, (number | null)[]>([
    ["Georgia", [4, 2, 29, 10]], // 11.25 -> 11.3 (rounded to a tenth)
    ["NotreDame", [2, 8, 17, 30]],
    ["Tie1", [10, 10, 10, 10]],
    ["Tie2", [5, 15, 10, 10]],
    ["OnePart", [3, null, null, null]], // fewer than two ranks: no average
  ]));
  expect(r.get("Georgia")!.avg).toBeCloseTo(11.3, 1);
  expect(r.get("Georgia")!.parts).toBe(4);
  expect(r.has("OnePart")).toBe(false);
  expect(r.get("Tie1")!.avg).toBe(10);
  expect(r.get("Tie1")!.rank).toBe(r.get("Tie2")!.rank);
  const order = [...r.entries()].sort((a, b) => a[1].rank - b[1].rank).map(([k]) => k);
  expect(order[order.length - 1]).toBe("NotreDame");
  for (const [, v] of r) expect(v.rank).toBeGreaterThanOrEqual(1);
});

test("the NFL+ and CFB SP+ tables show Off, Def, ST and SOS as ranks, the average as the main number, and where that average ranks", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const grab = async (button: string) => {
    await page.goto("/?league=NFL");
    await page.getByRole("button", { name: button }).click();
    await expect.poll(async () => page.evaluate(() => { const h = [...document.querySelectorAll("*")].find((e) => e.shadowRoot?.querySelector("table")); return h?.shadowRoot?.querySelectorAll("td .rk-cell").length ?? 0; }), { timeout: 20_000 }).toBeGreaterThan(20);
    return page.evaluate(() => {
      const root = [...document.querySelectorAll("*")].find((e) => e.shadowRoot?.querySelector("table"))!.shadowRoot!;
      const heads = [...root.querySelectorAll("thead th")].map((t) => (t.textContent ?? "").replace(/[▲▼↑↓]/g, "").trim());
      const rows = [...root.querySelectorAll("tbody tr")].slice(0, 40).map((r) => [...r.querySelectorAll("td")].map((c) => (c.textContent ?? "").trim())).filter((c) => c.length > 6);
      return { heads, rows };
    });
  };
  for (const button of ["NFL+", "CFB SP+"]) {
    const { heads, rows } = await grab(button);
    for (const h of ["Off", "Def", "SOS", "Overall"]) expect(heads.some((x) => x.startsWith(h)), `${button} has a ${h} column`).toBe(true);
    const col = (name: string) => heads.findIndex((x) => x.startsWith(name));
    const [o, d, sosI, avgI, ovI] = [col("Off"), col("Def"), col("SOS"), heads.findIndex((x) => x.startsWith("SP+") || x.startsWith("Rating")), col("Overall")];
    let checked = 0;
    for (const r of rows) {
      const n = (i: number) => parseFloat((r[i] ?? "").replace("#", ""));
      expect(r[o]).toMatch(/^#\d+$/); expect(r[d]).toMatch(/^#\d+$/);
      if (/^#\d+$/.test(r[sosI] ?? "")) {
        const parts = [o, d, ...(col("ST") >= 0 && /^#\d+$/.test(r[col("ST")] ?? "") ? [col("ST")] : []), sosI].map(n);
        const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
        expect(Math.abs(n(avgI) - avg), `${button} ${r.slice(0, 4).join(" ")}`).toBeLessThan(0.11);
        checked++;
      }
      expect(r[ovI]).toMatch(/^#\d+$/);
    }
    expect(checked, `${button} rows with a strength of schedule`).toBeGreaterThan(5);
  }
});
