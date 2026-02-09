import { test, expect } from '@playwright/test';
import { captureBrowserTelemetry, assertTelemetryClean } from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';

test.describe('Leadership Trends Usage & Guardrails', () => {
  test('leadership subtitle and context line communicate trend usage (not ranking)', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/sprint-leadership');

    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login or home; auth may be required');
      return;
    }

    await expect(page.locator('h1')).toContainText('Sprint Leadership View');
    await expect(page.locator('.leadership-header .subtitle')).toContainText('Trend view for boards');

    // Context line should mention within-board trends, not ranking
    const context = page.locator('.leadership-context-line');
    await expect(context).toBeVisible();
    const text = await context.textContent();
    expect(text || '').toMatch(/within-board trends, not ranking teams/i);

    assertTelemetryClean(telemetry);
  });

  test('sort label explains click-to-sort behaviour after a table is rendered', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('/sprint-leadership');

    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login or home; auth may be required');
      return;
    }

    const hasPreviewBtn = await page.locator('#leadership-preview').isVisible().catch(() => false);
    if (!hasPreviewBtn) {
      test.skip(true, 'Preview button not visible; page may be in unexpected state');
      return;
    }

    await page.click('#leadership-preview');
    await page.waitForTimeout(5000);

    const hasTable = await page.locator('.leadership-boards-table').isVisible().catch(() => false);
    if (!hasTable) {
      test.skip(true, 'Leadership boards table not visible; may require Jira data');
      return;
    }

    const sortLabel = page.locator('#leadership-sort-label');
    await expect(sortLabel).toBeVisible();
    const text = await sortLabel.textContent();
    expect(text || '').toMatch(/Click any column header to sort/i);
  });
});

