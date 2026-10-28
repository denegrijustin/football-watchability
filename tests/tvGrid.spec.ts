import { expect, test } from "./fixtures";

test("the record and the rankings in every TV grid block are whole, not cut off by the block", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-tab="grid"]').evaluate((b) => (b as HTMLElement).click());
  const days = page.getByRole("group", { name: "Day" }).getByRole("button");
  for (let i = 0; i < await days.count(); i++) {
    await days.nth(i).click();
    await page.waitForTimeout(300);
    const cut = await page.locator(".tv-game").evaluateAll((els) => els.flatMap((e) => {
      const r = e.getBoundingClientRect();
      return [...e.querySelectorAll(".tv-rank > span, .tv-tag")].filter((x) => { const b = x.getBoundingClientRect(); return b.right > r.right + 0.5 || b.left < r.left - 0.5 || b.bottom > r.bottom + 0.5 || x.scrollWidth > x.clientWidth + 1; }).map((x) => x.textContent);
    }));
    expect(cut, `cut off on day ${i}`).toEqual([]);
  }
});
