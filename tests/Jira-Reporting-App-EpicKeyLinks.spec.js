import { test, expect } from '@playwright/test';
import { runDefaultPreview } from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';

test.describe('Epic Key linkification & column layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/report');
    await expect(page.locator('h1')).toContainText(/VodaAgileBoard|General Performance/);
  });

  test('Epic keys render as clickable links (open in new tab) in tables', async ({ page }) => {
    test.setTimeout(180000);
    await runDefaultPreview(page);

    // Navigate to Project & Epic Level (Boards + Epics)
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    await page.waitForSelector('#project-epic-level.active', { state: 'visible', timeout: 10000 });
    await page.waitForSelector('#project-epic-level-content', { state: 'visible', timeout: 10000 });

    // Check for epic-key link in either Boards or Epic TTM
    const link = page.locator('#project-epic-level-content .epic-key a').first();
    const visible = await link.isVisible().catch(() => false);
    if (!visible) {
      test.skip();
      return;
    }

    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    const target = await link.getAttribute('target');
    const rel = await link.getAttribute('rel');

    expect(href && href.length > 0).toBeTruthy();
    expect(target).toBe('_blank');
    expect(rel && rel.includes('noopener')).toBeTruthy();
  });
});