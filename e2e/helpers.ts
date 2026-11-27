import { expect, type Page } from '@playwright/test';

/** Where global-setup stages the fixture: a fixed path, identical locally and on CI. */
export const FIXTURE = '/tmp/skill-atlas-e2e/fixture';
export const MAP_FIXTURE = '/tmp/skill-atlas-e2e/map/fixture';

/** Scan the staged fixture and wait for its three skills, as a user would. */
export async function scanFixture(page: Page) {
  await page.goto('/');
  await page.getByLabel('Repository link').fill(FIXTURE);
  await page.getByRole('button', { name: 'Scan' }).click();
  await expect(page.getByText(/·\s*3 skills/)).toBeVisible();
}

export const filterField = (page: Page) => page.getByLabel('Filter skills');
