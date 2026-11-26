// qa/01-scan-local-repo.md as a deterministic test.
import { test, expect } from '@playwright/test';
import { FIXTURE, scanFixture } from './helpers';

test('scan a local repository', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Repository link')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scan' })).toBeVisible();
  await expect(page.getByLabel('Filter skills')).toBeVisible();
  await expect(page).toHaveScreenshot('01-initial.png');

  await scanFixture(page);
  await expect(page.getByText('fixture · 3 skills')).toBeVisible();

  const names = page.locator('#skills .name');
  await expect(names).toHaveText(['code-style', 'commits', 'release-checklist']);
  await expect(page.locator('#skills').getByText("Follow the project's code style.")).toBeVisible();
  await expect(page.locator('#skills').getByText('Write commit messages the way this repository does.')).toBeVisible();

  const links = page.locator('#skills a[href^="file://"]');
  await expect(links).toHaveCount(3);
  await expect(links.first()).toHaveText(`file://${FIXTURE}/.github/skills/code-style/SKILL.md`);

  await expect(page.getByText(/warning: .agents\/skills\/release-checklist\/SKILL\.md: malformed front matter/)).toBeVisible();
  await expect(page).toHaveScreenshot('01-scanned.png');
});
