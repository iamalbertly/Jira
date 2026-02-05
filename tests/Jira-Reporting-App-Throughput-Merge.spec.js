import { test, expect } from '@playwright/test';
import { runDefaultPreview } from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';

test.describe('Throughput / Boards merge UX', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/report');
    await expect(page.locator('h1')).toContainText(/VodaAgileBoard|General Performance/);
  });

  test('Per Project throughput is merged into Boards when boards exist and CTA opens Boards tab', async ({ page }) => {
    test.setTimeout(180000);
    await runDefaultPreview(page);

    // Ensure Project & Epic Level tab is active
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    await page.waitForSelector('#project-epic-level.active', { state: 'visible', timeout: 10000 });
    await page.waitForSelector('#project-epic-level-content', { state: 'visible', timeout: 10000 });

    const content = await page.locator('#project-epic-level-content').textContent();

    // We expect the Per Project throughput table NOT to be rendered as a duplicate
    expect(content).not.toContain('<h4>Per Project</h4>\n<table');

    // Expect to find the explanatory CTA that directs users to Boards
    expect(content).toContain('Per-project throughput has been merged into the');

    // Click the CTA to open Boards and verify Boards table contains throughput columns
    const cta = page.locator('[data-action="open-boards-tab"]');
    await expect(cta).toBeVisible({ timeout: 5000 });
    await cta.click();

    // Verify Boards table has Done SP or Committed SP column header
    const header = page.locator('#project-epic-level-content table.data-table thead');
    await expect(header).toContainText('Done SP');
    await expect(header).toContainText('Committed SP');
  });
});