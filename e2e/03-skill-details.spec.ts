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

test('Enter opens primary and alternate links while card keys still select details', async ({ page, context }) => {
  // Keep the real fixture contents; controlled HTTPS destinations avoid external networking.
  await page.route('**/api/scan?*', async route => {
    const response = await route.fetch();
    const data = await response.json();
    data.skills = data.skills.map((skill: object, index: number) => ({
      ...skill, link: `https://source.test/${index}/primary`, alternateLinks: [`https://source.test/${index}/alternate`],
    }));
    await route.fulfill({ json: data });
  });
  await context.route('https://source.test/**', route => route.fulfill({ contentType: 'text/html', body: 'Source link target' }));
  await scanFixture(page);
  const cards = page.locator('#skills li.skill');
  await cards.nth(1).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#title')).toHaveText('commits');
  await cards.first().focus();
  await page.keyboard.press('Tab');
  const links = cards.first().locator('a');
  await expect(links.first()).toBeFocused();
  for (const [index, kind] of ['primary', 'alternate'].entries()) {
    if (index) await links.nth(index).focus();
    const opened = context.waitForEvent('page', { timeout: 3000 });
    await page.keyboard.press('Enter');
    const popup = await opened;
    await expect(popup).toHaveURL(`https://source.test/0/${kind}`);
    await popup.close();
    await expect(page.locator('#title')).toHaveText('commits');
  }
  await cards.first().focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#title')).toHaveText('code-style');
});
