// qa/04-url-state.md as a deterministic test.
import { test, expect } from '@playwright/test';
import { FIXTURE, scanFixture, filterField } from './helpers';

test('repository and filter kept in the address', async ({ page, context }) => {
  await scanFixture(page);
  await expect(page).toHaveURL(`/?repo=${encodeURIComponent(FIXTURE)}`);

  await filterField(page).pressSequentially('messages');
  await expect(page.getByText('fixture · 1 of 3 skills')).toBeVisible();
  await expect(page).toHaveURL(`/?repo=${encodeURIComponent(FIXTURE)}&filter=messages`);

  // The copied address restores the scan and the filter.
  const tab = await context.newPage();
  await tab.goto(page.url());
  await expect(tab.getByText('fixture · 1 of 3 skills')).toBeVisible();
  await expect(tab.locator('#skills li:not([hidden]) .name')).toHaveText(['commits']);
  await expect(tab.getByLabel('Repository link')).toHaveValue(FIXTURE);
  await expect(tab.getByLabel('Filter skills')).toHaveValue('messages');
  await expect(tab).toHaveScreenshot('04-restored.png');
  await tab.close();

  // A filter in the address before any scan applies once the scan shows its skills.
  await page.goto('/?filter=style');
  await expect(filterField(page)).toHaveValue('style');
  await page.getByLabel('Repository link').fill(FIXTURE);
  await page.getByRole('button', { name: 'Scan' }).click();
  await expect(page.getByText('fixture · 1 of 3 skills')).toBeVisible();
  await expect(page.locator('#skills li:not([hidden]) .name')).toHaveText(['code-style']);

  // A blank filter keeps every skill and drops the parameter.
  await filterField(page).fill('');
  await expect(page.getByText('fixture · 3 skills')).toBeVisible();
  await expect(page).toHaveURL(`/?repo=${encodeURIComponent(FIXTURE)}`);
});

test('Back abandons a pending scan and Forward scans afresh', async ({ page }) => {
  let release!: () => void;
  let arrived!: () => void;
  const ready = new Promise<void>(resolve => { arrived = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/scan?*', async route => {
    const response = await route.fetch();
    arrived();
    await gate;
    await route.fulfill({ response });
  }, { times: 1 });
  await page.goto('/');
  await page.getByLabel('Repository link').fill(FIXTURE);
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await ready;
  try {
    await page.goBack();
    await expect(page.getByRole('button', { name: 'Scan', exact: true })).toBeEnabled();
    await expect(page.getByLabel('Repository link')).toHaveValue('');
    const delivered = page.waitForResponse(response => response.url().includes('/api/scan?'));
    release();
    await (await delivered).finished();
    // Let response handlers and their next paint finish before inspecting the empty view.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.locator('#summary')).toBeEmpty();
    await expect(page.locator('#skills li')).toHaveCount(0);
    await expect(page.locator('#details')).toBeHidden();
    await expect(page.locator('#error')).toBeHidden();
    await page.goForward();
    await expect(page.locator('#summary')).toHaveText('fixture · 3 skills');
  } finally { release(); }
});

test('filtering a scan ignores a draft repository and the URL still restores it', async ({ page, context }) => {
  await scanFixture(page);
  await page.getByLabel('Repository link').fill('/no-such-repository');
  await filterField(page).fill('commits');
  await expect(page.locator('#summary')).toHaveText('fixture · 1 of 3 skills');
  await expect(page).toHaveURL(`/?repo=${encodeURIComponent(FIXTURE)}&filter=commits`);
  const restored = await context.newPage();
  await restored.goto(page.url());
  await expect(restored.locator('#summary')).toHaveText('fixture · 1 of 3 skills');
  await expect(restored.getByLabel('Repository link')).toHaveValue(FIXTURE);
  await restored.close();
  // Submitting the edited source then changes the URL and reports its own error.
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page).toHaveURL('/?repo=%2Fno-such-repository&filter=commits');
  await expect(page.locator('#error')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#summary')).toHaveText('fixture · 1 of 3 skills');
  await page.goForward();
  await expect(page.locator('#error')).toBeVisible();
});
