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

    // Trigger a preview so leadership context is rendered for the current dataset
    const hasPreviewBtn = await page.locator('#leadership-preview').isVisible().catch(() => false);
    if (hasPreviewBtn) {
      await page.click('#leadership-preview');
      await page.waitForTimeout(5000);
    }

    // Context line should mention within-board trends, not ranking when data is present
    const context = page.locator('.leadership-context-line');
    const hasContext = await context.isVisible().catch(() => false);
    if (!hasContext) {
      test.skip(true, 'Leadership context line not visible for current data set');
      return;
    }
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

  test('leadership context line stays visible when scrolling boards table', async ({ page }) => {
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

    const context = page.locator('.leadership-context-line');
    await expect(context).toBeVisible();

    // Scroll to bottom to simulate deep table inspection
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    const box = await context.boundingBox();
    if (!box) {
      test.skip(true, 'Could not measure leadership context line position');
      return;
    }

    // Sticky context line should remain anchored near the top of the viewport
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeLessThan(160);
  });
});

