// qa/02-live-filter.md as a deterministic test.
import { test, expect } from '@playwright/test';
import { scanFixture, filterField } from './helpers';

test('live, client-side filtering', async ({ page }) => {
  await scanFixture(page);
  const filter = filterField(page);

  // Substring match: `commit` also hits code-style's "committing"; count badge and highlights.
  await filter.pressSequentially('commit');
  await expect(page.getByText('fixture · 2 of 3 skills')).toBeVisible();
  await expect(page.locator('#count')).toHaveText('2 of 3');
  await expect(page.locator('#skills li:not([hidden]) .name')).toHaveText(['code-style', 'commits']);
  await expect(page.locator('#skills mark').first()).toBeVisible();
  await expect(page).toHaveScreenshot('02-filter-commit.png');

  // Every word must match (AND).
  await filter.fill('style project');
  await expect(page.getByText('fixture · 1 of 3 skills')).toBeVisible();
  await expect(page.locator('#skills li:not([hidden]) .name')).toHaveText(['code-style']);

  // No matches is still a successful state.
  await filter.fill('xyzzy');
  await expect(page.getByText('fixture · 0 of 3 skills')).toBeVisible();
  await expect(page.locator('#count')).toHaveText('0 of 3');
  await expect(page).toHaveScreenshot('02-filter-none.png');

  // Case-insensitive.
  await filter.fill('MESSAGES');
  await expect(page.getByText('fixture · 1 of 3 skills')).toBeVisible();
  await expect(page.locator('#skills li:not([hidden]) .name')).toHaveText(['commits']);

  // Clearing restores the full entries, header without `of`, badge gone.
  await filter.fill('');
  await expect(page.getByText('fixture · 3 skills')).toBeVisible();
  await expect(page.locator('#count')).toBeHidden();
  await expect(page.locator('#skills li:not([hidden]) .name')).toHaveText(['code-style', 'commits', 'release-checklist']);
});
