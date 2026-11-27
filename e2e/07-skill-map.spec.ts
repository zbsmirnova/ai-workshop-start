import { test, expect } from '@playwright/test';
import { FIXTURE } from './helpers';

test('skill map: shared words, recorded model answer and skill selection', async ({ page }) => {
  await page.goto('/map');
  await page.getByLabel('Repository link').fill(FIXTURE);
  await page.getByRole('button', { name: 'Build map' }).click();
  await expect(page.getByRole('status')).toHaveText('3 skills · 3 groups · shared words');
  await expect(page.locator('.cluster button')).toHaveCount(3);
  await expect(page).toHaveScreenshot('07-heuristic.png');
  await page.getByLabel('Grouping method').selectOption('claude');
  await page.getByRole('button', { name: 'Build map' }).click();
  await expect(page.getByRole('status')).toHaveText('3 skills · 2 groups · Claude Haiku');
  await expect(page.getByRole('heading', { name: 'Development workflow' })).toBeVisible();
  await page.getByRole('button', { name: 'commits', exact: true }).click();
  await expect(page.locator('#contents')).toContainText('# Commits');
  await expect(page).toHaveScreenshot('07-model.png');
  await page.getByLabel('Repository link').fill('/no/such/directory');
  await page.getByRole('button', { name: 'Build map' }).click();
  await expect(page.getByRole('alert')).toContainText('Not a GitHub URL or a readable directory');
  await page.getByLabel('Repository link').fill(FIXTURE);
  await page.getByRole('button', { name: 'Build map' }).click();
  await expect(page.locator('.cluster')).toHaveCount(2);
});

test('map pages owners, reuses clean scans, disables pending builds and renders text safely', async ({page}) => {
  const malicious = '<img src=x onerror=alert(1)>';
  const scans: string[] = [];
  await page.route('**/api/scan?*', async route => {
    scans.push(route.request().url());
    const second = new URL(route.request().url()).searchParams.get('page') === '2';
    const id = second ? 'b' : 'a';
    await route.fulfill({json:{repositories:[{skills:[{id,name:malicious,description:'Use when building code',contents:malicious,link:'https://example.com/skill'}],warnings:[]}],warnings:[],pageCount:2}});
  });
  let release!: () => void;
  const pending = new Promise<void>(resolve => {release=resolve;});
  await page.route('**/api/map', async route => {
    await pending;
    await route.fulfill({json:{clusters:[{label:malicious,skillIds:['a','b']}]}});
  });
  await page.goto('/map');
  await page.getByLabel('Repository link').fill('https://github.com/example');
  await page.getByRole('button',{name:'Build map'}).click();
  await expect(page.getByRole('button',{name:'Build map'})).toBeDisabled();
  release();
  await expect(page.locator('.cluster button')).toHaveCount(2);
  expect(scans).toHaveLength(2);
  await page.locator('.cluster button').first().click();
  await expect(page.locator('#contents')).toHaveText(malicious);
  await expect(page.locator('#groups img, #contents img')).toHaveCount(0);
  await page.getByLabel('Grouping method').selectOption('claude');
  await page.getByRole('button',{name:'Build map'}).click();
  await expect(page.getByRole('status')).toContainText('Claude Haiku');
  expect(scans).toHaveLength(2);
});

test('scan warnings survive model failure and retry', async ({page}) => {
  await page.goto('/map');
  await page.route('**/api/map',route=>route.fulfill({status:400,json:{error:'Model unavailable'}}));
  await page.getByLabel('Repository link').fill(FIXTURE);
  await page.getByRole('button',{name:'Build map'}).click();
  await expect(page.locator('#warnings')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText('Model unavailable');
  await page.unroute('**/api/map');
  await page.getByRole('button',{name:'Build map'}).click();
  await expect(page.locator('.cluster button')).toHaveCount(3);
  await expect(page.locator('#warnings')).toBeVisible();
  await expect(page.getByRole('alert')).toBeHidden();
});
