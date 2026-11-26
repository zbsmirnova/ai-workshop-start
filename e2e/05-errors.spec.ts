// qa/05-errors.md as a deterministic test.
import { test, expect } from '@playwright/test';
import { FIXTURE } from './helpers';

test('failed scans show a clear error, and the page recovers', async ({ page }) => {
  await page.goto('/');
  const repo = page.getByLabel('Repository link');

  await repo.fill('/no/such/directory');
  await page.getByRole('button', { name: 'Scan' }).click();
  await expect(page.getByText('Not a GitHub URL or a readable directory: /no/such/directory')).toBeVisible();
  await expect(page).toHaveScreenshot('05-error.png');

  // An empty field never crashes: the browser's required-field check blocks the submit.
  await repo.fill('');
  await page.getByRole('button', { name: 'Scan' }).click();
  expect(await repo.evaluate((el: HTMLInputElement) => el.validationMessage)).not.toBe('');

  // A valid scan fully recovers from the error.
  await repo.fill(FIXTURE);
  await page.getByRole('button', { name: 'Scan' }).click();
  await expect(page.getByText('fixture · 3 skills')).toBeVisible();
  await expect(page.getByText('Not a GitHub URL')).toBeHidden();
});
