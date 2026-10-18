import { expect, test } from "./fixtures";

async function open(page: import("@playwright/test").Page) {
  await page.goto("/?league=CFB");
  await page.getByRole("button", { name: "Insanity", exact: true }).click();
  await page.getByRole("group", { name: "Ranking" }).getByRole("button", { name: "Season" }).click();
  await expect(page.locator(".ib-cards > li").first()).toBeVisible();
}
const read = (page: import("@playwright/test").Page) =>
  page.locator(".ib-cards > li").evaluateAll((els) =>
    els.map((e) => ({ ins: Number(e.getAttribute("data-insanity")), date: e.getAttribute("data-date")!, margin: Number(e.getAttribute("data-margin")), rank: Number(e.querySelector(".ic-rank")?.textContent?.replace("#", "")) })),
  );

test("the Insanity tab sorts by insanity score by default, and offers score margin", async ({ page }) => {
  await open(page);
  const sort = page.getByRole("group", { name: "Sort games by" });
  await expect(sort.getByRole("button", { name: "Insanity" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".sort-label")).toHaveText("Most insane first");
  const a = await read(page);
  expect(a.length).toBeGreaterThan(3);
  expect(a.map((g) => g.ins)).toEqual([...a.map((g) => g.ins)].sort((x, y) => y - x));
  expect(a.map((g) => g.rank)).toEqual(a.map((_, i) => i + 1)); // #1 is the wildest, in order

  await sort.getByRole("button", { name: "Score margin" }).click();
  await expect(page.locator(".sort-label")).toHaveText("Closest finish first");
  const m = await read(page);
  expect(m.map((g) => g.margin)).toEqual([...m.map((g) => g.margin)].sort((x, y) => x - y));
  await expect(sort.getByRole("button", { name: "Kickoff" })).toHaveCount(0); // no kickoff order

  // The rank badge is the game's insanity rank whatever the order: a wilder game always has the lower number, even out of order.
  expect(m.map((g) => g.rank)).not.toEqual(m.map((_, i) => i + 1));
  for (const x of m) for (const y of m) if (x.ins > y.ins) expect(x.rank).toBeLessThan(y.rank);
});

test("changing the sort keeps the league and scope, and going back restores insanity order", async ({ page }) => {
  await open(page);
  const sort = page.getByRole("group", { name: "Sort games by" });
  await sort.getByRole("button", { name: "Score margin" }).click();
  await expect(page.getByRole("group", { name: "Ranking" }).getByRole("button", { name: "Season" })).toHaveAttribute("aria-pressed", "true");
  await sort.getByRole("button", { name: "Insanity" }).click();
  const a = await read(page);
  expect(a.map((g) => g.ins)).toEqual([...a.map((g) => g.ins)].sort((x, y) => y - x));
});
