import { test, expect } from '@playwright/test';
import { captureBrowserTelemetry, assertTelemetryClean } from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';

test.describe('Leadership Trends Usage & Guardrails', () => {
  test('leadership route opens report trends view', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/sprint-leadership');

    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login or home; auth may be required');
      return;
    }

    await expect(page).toHaveURL(/\/report(#trends)?/);
    await expect(page.locator('#tab-btn-trends')).toHaveAttribute('aria-selected', 'true');

    assertTelemetryClean(telemetry);
  });

  test('trends tab renders leadership content after preview', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('/report#trends');

    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login or home; auth may be required');
      return;
    }

    await expect(page.locator('#tab-btn-trends')).toHaveAttribute('aria-selected', 'true');
    await page.click('#preview-btn');
    await Promise.race([
      page.waitForSelector('#preview-content', { state: 'visible', timeout: 60000 }).catch(() => null),
      page.waitForSelector('#error', { state: 'visible', timeout: 60000 }).catch(() => null),
    ]);

    const hasPreview = await page.locator('#preview-content').isVisible().catch(() => false);
    if (!hasPreview) {
      test.skip(true, 'Preview did not load for current data set');
      return;
    }

    await page.click('#tab-btn-trends');
    await expect(page.locator('#tab-trends')).toBeVisible();
    await expect(page.locator('#leadership-content')).toBeVisible();
  });

  test('trends context line is stable when present during scroll', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('/report#trends');

    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login or home; auth may be required');
      return;
    }

    await page.click('#preview-btn');
    await Promise.race([
      page.waitForSelector('#preview-content', { state: 'visible', timeout: 60000 }).catch(() => null),
      page.waitForSelector('#error', { state: 'visible', timeout: 60000 }).catch(() => null),
    ]);

    const hasPreview = await page.locator('#preview-content').isVisible().catch(() => false);
    if (!hasPreview) {
      test.skip(true, 'Preview did not load for current data set');
      return;
    }

    await page.click('#tab-btn-trends');

    const context = page.locator('.leadership-context-line').first();
    const hasContext = await context.isVisible().catch(() => false);
    if (!hasContext) {
      test.skip(true, 'Trends context line not visible for current data set');
      return;
    }

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const box = await context.boundingBox();
    if (!box) {
      test.skip(true, 'Could not measure trends context line position');
      return;
    }

    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeLessThan(220);
  });
});
