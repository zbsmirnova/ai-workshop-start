// qa/06-ui-sanity.md as a deterministic test.
import { test, expect } from '@playwright/test';
import { scanFixture } from './helpers';

const overflows = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

test('layout, legibility, text-not-HTML', async ({ page }) => {
  await scanFixture(page);

  // Nothing overflows horizontally at a normal size.
  expect(await overflows(page)).toBe(false);

  // Repository text renders as text, never as HTML: the markdown heading stays literal and no
  // element is created from file contents.
  await page.locator('#skills .name', { hasText: 'commits' }).click();
  await expect(page.locator('#skill').getByText('# Commits')).toBeVisible();
  expect(await page.locator('#skill h1, #skill script, #skill img').count()).toBe(0);

  // Still usable at a narrow width: no page-wide horizontal scroll, controls reachable.
  await page.setViewportSize({ width: 700, height: 800 });
  expect(await overflows(page)).toBe(false);
  await expect(page.getByRole('button', { name: 'Scan' })).toBeVisible();
  await expect(page).toHaveScreenshot('06-narrow.png');
});
