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
