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
