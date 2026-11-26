// qa/03-skill-details.md as a deterministic test.
import { test, expect } from '@playwright/test';
import { scanFixture } from './helpers';

test('selecting a skill shows its full SKILL.md', async ({ page }) => {
  await scanFixture(page);

  await page.locator('#skills .name', { hasText: 'commits' }).click();
  const detail = page.locator('#skill');
  await expect(detail.getByText('name: commits')).toBeVisible();
  // Plain text: markdown stays literal, backticks included.
  await expect(detail.getByText('# Commits')).toBeVisible();
  await expect(detail.getByText('`editor: keep the caret after undo`')).toBeVisible();
  await expect(page).toHaveScreenshot('03-commits.png');

  // Malformed front matter is shown as read, verbatim.
  await page.locator('#skills .name', { hasText: 'release-checklist' }).click();
  await expect(detail.getByText('description: Steps before a release: tag, notes, announce')).toBeVisible();
  await expect(detail.getByText('# Release checklist')).toBeVisible();
  await expect(page).toHaveScreenshot('03-release-checklist.png');
});
