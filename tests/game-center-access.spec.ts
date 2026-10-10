import { test, expect } from '@playwright/test';
test('compact shortcut opens deeper analysis without expanding the card', async ({page}) => {
  await page.goto('/?league=NFL');
  const card = page.locator('.game-card:visible').first();
  await card.getByRole('button', {name:/Open Game Center for/}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(card).toHaveClass(/compact/);
  await expect(dialog.locator('.matchup-engine')).toBeVisible();
  await expect(dialog.locator('.game-details details')).not.toHaveCount(0);
});
test('first expansion is concise and puts Game Center near the top', async ({page}) => {
  await page.goto('/?league=CFB');
  const card = page.locator('.game-card:visible').first();
  await card.getByRole('button', {name:'Show game details'}).click();
  await expect(card.locator('.game-details, .matchup-engine')).toHaveCount(0);
  const gc = card.getByRole('button', {name:/Game Center/});
  const matchup = card.locator('.matchup');
  expect((await gc.boundingBox())!.y).toBeLessThan((await matchup.boundingBox())!.y);
  await gc.click();
  await expect(page.getByRole('dialog').locator('.matchup-engine')).toBeVisible();
  await expect(page.getByRole('dialog').getByText(/nationally/).first()).toBeVisible();
});
