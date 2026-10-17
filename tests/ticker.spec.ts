import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const slate = JSON.parse(readFileSync('src/data/slate.json','utf8'));
const results = JSON.parse(readFileSync('src/data/results.json','utf8'));

test('ticker includes this week only, including upcoming games', async ({ page }) => {
  await page.route('**/api/scores*', r=>r.fulfill({json:{games:[]}}));
  await page.goto('/?league=NFL');
  const ticker=page.getByRole('region',{name:'Current week games'});
  await expect(ticker).toBeVisible();
  await expect(ticker.locator('.ticker-title')).toHaveText('THIS WEEK');
  const labels=await ticker.locator('li:not([aria-hidden]) button').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')??''));
  const current=[...slate.games,...results.games.filter(g=>g.week===slate.period)];
  const ids=new Set(current.map(g=>g.espnId));
  expect(labels.length).toBe(ids.size);
  const shown=await ticker.locator('li:not([aria-hidden]) button').evaluateAll(es=>es.map(e=>e.getAttribute('data-event-id')));
  expect(new Set(shown)).toEqual(ids);
  expect(labels.some(l=>/\b(am|pm)\b/i.test(l))).toBeTruthy();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width+1);
});

test('ticker stays at the top and pauses on request', async ({ page }, testInfo)=>{
  await page.goto('/');
  const ticker=page.getByRole('region',{name:'Current week games'});
  if (testInfo.project.name==='mobile') {
    // On a phone the strip does not move by itself: it is swiped by hand and has no Pause button.
    expect(await ticker.locator('.ticker-track').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
    await expect(ticker.getByRole('button',{name:'Pause',exact:true})).toBeHidden();
  } else {
  await ticker.getByRole('button',{name:'Pause',exact:true}).click();
  await expect(ticker.getByRole('button',{name:'Play',exact:true})).toHaveAttribute('aria-pressed','true');
  }
  await page.mouse.wheel(0,1000);
  expect(await ticker.evaluate(e=>Math.round(e.getBoundingClientRect().top))).toBe(0);
});

test('reduced motion disables ticker animation',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'}); await page.goto('/');
  const ticker=page.getByRole('region',{name:'Current week games'});
  expect(await ticker.locator('.ticker-track').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
  await expect(ticker.locator('.ticker-dup').first()).toBeHidden();
});
