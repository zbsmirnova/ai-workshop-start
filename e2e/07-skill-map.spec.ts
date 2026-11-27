import { test, expect } from '@playwright/test';
import { FIXTURE } from './helpers';

test('skill map: shared words, recorded model answer and skill selection', async ({ page }) => {
  await page.goto('/map');
  await page.getByLabel('Repository link').fill(FIXTURE);
  await page.getByRole('button', { name: 'Build map' }).click();
  await expect(page.getByRole('status')).toHaveText('3 skills · 3 groups · shared words');
  await expect(page.locator('.cluster button')).toHaveCount(3);
  await expect(page.locator('.cluster h2')).toHaveCount(0);
  await expect(page.getByText('Browser maps support up to 2,000 skills')).toBeVisible();
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
  await page.route('**/api/map',route=>route.fulfill({status:502,json:{error:'Model unavailable'}}));
  await page.getByLabel('Repository link').fill(FIXTURE);
  await page.getByRole('button',{name:'Build map'}).click();
  await expect(page.locator('#warnings')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText('Model unavailable');
  await page.unroute('**/api/map');
  await page.getByRole('button',{name:'Build map'}).click();
  await expect(page.locator('.cluster button')).toHaveCount(3);
  await expect(page.locator('.cluster h2')).toHaveCount(0);
  await expect(page.getByText('Browser maps support up to 2,000 skills')).toBeVisible();
  await expect(page.locator('#warnings')).toBeVisible();
  await expect(page.getByRole('alert')).toBeHidden();
});

for (const previous of ['none', 'warnings', 'clean']) for (const invalid of ['', '   ']) {
  test(`${invalid ? 'whitespace' : 'empty'} map source is rejected after ${previous} and allows retry`, async ({ page }) => {
    if (previous === 'clean') {
      await page.route('**/api/scan?*', async route => {
        const response = await route.fetch();
        const data = await response.json();
        // Exercise the clean-scan cache with the real fixture skills.
        await route.fulfill({ json: { ...data, warnings: [] } });
      });
    }
    let requests = 0;
    page.on('request', request => { if (request.url().includes('/api/')) requests++; });
    await page.goto('/map');
    if (previous !== 'none') {
      await page.getByLabel('Repository link').fill(FIXTURE);
      await page.getByRole('button', { name: 'Build map' }).click();
      await expect(page.locator('.cluster button')).toHaveCount(3);
      await page.getByRole('button', { name: 'commits', exact: true }).click();
      await expect(page.locator('#contents')).toContainText('# Commits');
    }
    const before = requests;
    await page.getByLabel('Repository link').fill(invalid);
    await page.getByRole('button', { name: 'Build map' }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter a repository URL or local directory.');
    await expect(page.getByRole('status')).toHaveText('Map could not be built. Try again.');
    await expect(page.locator('.cluster')).toHaveCount(0);
    await expect(page.locator('#contents')).toBeEmpty();
    await expect(page.locator('#link')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Build map' })).toBeEnabled();
    expect(requests).toBe(before);
    if (previous === 'warnings') await expect(page.locator('#warnings')).toBeVisible();
    await page.getByLabel('Repository link').fill(FIXTURE);
    await page.getByRole('button', { name: 'Build map' }).click();
    await expect(page.locator('.cluster button')).toHaveCount(3);
    await expect(page.getByRole('alert')).toBeHidden();
  });
}
