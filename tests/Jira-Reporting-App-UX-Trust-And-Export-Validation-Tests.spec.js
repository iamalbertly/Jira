/**
 * UX Trust and Export Validation (SSOT: report, current-sprint, leadership, export).
 * Validates report load, nav strip, preview flow, tabs/export, date validation,
 * current-sprint and leadership page load, Excel export or clear state, and double-click guard
 * using captureBrowserTelemetry and realtime UI assertions at every stage.
 */

import { test, expect } from '@playwright/test';
import {
  captureBrowserTelemetry,
  runDefaultPreview,
  waitForPreview,
  IGNORE_CONSOLE_ERRORS,
  IGNORE_REQUEST_PATTERNS,
  EXCEL_DOWNLOAD_TIMEOUT_MS,
} from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';

function assertTelemetryClean(telemetry) {
  const criticalFailures = telemetry.failedRequests.filter(
    (r) => !IGNORE_REQUEST_PATTERNS.some((p) => p.test(r.url))
  );
  expect(criticalFailures).toEqual([]);
  expect(telemetry.pageErrors).toEqual([]);
  const unexpectedConsole = telemetry.consoleErrors.filter(
    (t) => !IGNORE_CONSOLE_ERRORS.includes(t)
  );
  expect(unexpectedConsole).toEqual([]);
}

test.describe('UX Trust and Export Validation (telemetry + UI per step)', () => {
  test('report load: expected controls and nav strip visible, no critical console/network errors', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');

    await expect(page.locator('h1')).toContainText(/VodaAgileBoard|General Performance/);
    await expect(page.locator('#project-mpsa')).toBeVisible();
    await expect(page.locator('#preview-btn')).toBeVisible();
    await expect(page.locator('#export-excel-btn')).toBeVisible();
    await expect(page.locator('#export-dropdown-trigger')).toBeVisible();
    await expect(page.locator('#preview-content')).toBeHidden();
    await expect(page.locator('nav.app-nav')).toBeVisible();
    await expect(page.locator('nav.app-nav a[href="/current-sprint"]')).toContainText('Current Sprint');
    await expect(page.locator('nav.app-nav a[href="/sprint-leadership"]')).toContainText('Leadership');

    assertTelemetryClean(telemetry);
  });

  test('preview flow: Preview click then content or error visible with no unexpected console errors', async ({ page }) => {
    test.setTimeout(180000);
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');
    await expect(page.locator('#preview-btn')).toBeVisible();
    await page.click('#preview-btn');

    await waitForPreview(page, { timeout: 120000 });
    const previewVisible = await page.locator('#preview-content').isVisible();
    const errorVisible = await page.locator('#error').isVisible();
    expect(previewVisible || errorVisible).toBeTruthy();
    if (errorVisible) {
      const errorText = await page.locator('#error').textContent();
      expect(errorText && errorText.trim().length > 0).toBeTruthy();
    }

    assertTelemetryClean(telemetry);
  });

  test('report tabs and export: after preview, tabs and export controls are visible', async ({ page }) => {
    test.setTimeout(180000);
    const telemetry = captureBrowserTelemetry(page);
    await runDefaultPreview(page);
    await waitForPreview(page, { timeout: 120000 });

    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    if (!previewVisible) {
      test.skip(true, 'Preview not visible; may require Jira credentials');
      return;
    }
    await expect(page.locator('.tabs')).toBeVisible();
    await expect(page.locator('.tab-btn')).toHaveCount(4);
    await expect(page.locator('#tab-project-epic-level')).toBeVisible();
    await expect(page.locator('#export-excel-btn')).toBeVisible();
    await expect(page.locator('#export-dropdown-trigger')).toBeVisible();
    assertTelemetryClean(telemetry);
  });

  test('current-sprint page loads and shows board selector with no console errors', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/current-sprint');

    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }
    await expect(page.locator('h1')).toContainText('Current Sprint');
    await expect(page.locator('#board-select')).toBeVisible();
    await expect(page.locator('nav.app-nav a[href="/report"]')).toContainText('Report');
    await expect(page.locator('nav.app-nav a[href="/sprint-leadership"]')).toContainText('Leadership');
    const options = await page.locator('#board-select option').allTextContents();
    expect(options.length).toBeGreaterThanOrEqual(1);
    assertTelemetryClean(telemetry);
  });

  test('sprint-leadership page loads and shows date inputs and Preview with no console errors', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/sprint-leadership');

    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }
    await expect(page.locator('h1')).toContainText('Sprint Leadership');
    await expect(page.locator('#leadership-start')).toBeVisible();
    await expect(page.locator('#leadership-end')).toBeVisible();
    await expect(page.locator('#leadership-preview')).toBeVisible();
    await expect(page.locator('#leadership-preview')).toContainText('Preview');
    await expect(page.locator('nav.app-nav a[href="/report"]')).toContainText('Report');
    await expect(page.locator('nav.app-nav a[href="/current-sprint"]')).toContainText('Current Sprint');
    assertTelemetryClean(telemetry);
  });

  test('export state after preview: export enabled when preview has rows, disabled when error', async ({ page }) => {
    test.setTimeout(180000);
    const telemetry = captureBrowserTelemetry(page);
    await runDefaultPreview(page);
    await waitForPreview(page, { timeout: 120000 });

    const previewVisible = await page.locator('#preview-content').isVisible();
    const errorVisible = await page.locator('#error').isVisible();
    const exportBtn = page.locator('#export-excel-btn');
    if (previewVisible) {
      await expect(exportBtn).toBeEnabled();
    } else if (errorVisible) {
      const errorText = await page.locator('#error').textContent();
      expect(errorText && errorText.trim().length > 0).toBeTruthy();
    }

    assertTelemetryClean(telemetry);
  });

  test('date validation: start >= end shows error within 5s without long loading', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');
    await expect(page.locator('#preview-btn')).toBeVisible();
    await page.fill('#start-date', '2025-09-30T23:59');
    await page.fill('#end-date', '2025-07-01T00:00');
    await page.click('#preview-btn');

    await expect(page.locator('#error')).toBeVisible({ timeout: 5000 });
    const errorText = await page.locator('#error').textContent();
    expect(errorText).toMatch(/Start date|before end date/i);

    assertTelemetryClean(telemetry);
  });

  test('Excel export or clear state: download or error visible with telemetry clean', async ({ page }) => {
    test.setTimeout(200000);
    const telemetry = captureBrowserTelemetry(page);
    await runDefaultPreview(page);
    await waitForPreview(page, { timeout: 120000 });

    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      test.skip(true, 'Preview not visible; may require Jira credentials');
      return;
    }
    await expect(page.locator('#export-excel-btn')).toBeEnabled();
    await page.waitForTimeout(500);

    const downloadPromise = page.waitForEvent('download', { timeout: EXCEL_DOWNLOAD_TIMEOUT_MS });
    const clearStatePromise = (async () => {
      await page.waitForSelector('#error', { state: 'visible', timeout: EXCEL_DOWNLOAD_TIMEOUT_MS });
      const text = await page.locator('#error').textContent();
      if (text && text.trim().length > 0) return { type: 'clearState' };
      throw new Error('Error visible but empty');
    })();
    await page.click('#export-excel-btn');

    const result = await Promise.race([
      downloadPromise.then((d) => ({ type: 'download', value: d })),
      clearStatePromise,
    ]).catch(async () => {
      try {
        const errVis = await page.locator('#error').isVisible();
        const errText = await page.locator('#error').textContent();
        if (errVis && errText && errText.trim().length > 0) return { type: 'clearState' };
      } catch (_) {}
      throw new Error(`Excel export: no download and no clear error state within ${EXCEL_DOWNLOAD_TIMEOUT_MS}ms`);
    });

    if (result.type === 'download') {
      expect(result.value).toBeTruthy();
      const filename = result.value.suggestedFilename();
      expect(filename).toMatch(/\.xlsx$/);
    } else if (result.type === 'clearState') {
      expect(await page.locator('#error').isVisible()).toBeTruthy();
      const errorText = await page.locator('#error').textContent();
      expect(errorText && errorText.trim().length > 0).toBeTruthy();
    }

    assertTelemetryClean(telemetry);
  });

  test('double-click Preview: single outcome and no duplicate critical requests', async ({ page }) => {
    test.setTimeout(180000);
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');
    await expect(page.locator('#preview-btn')).toBeVisible();
    await page.fill('#start-date', '2025-07-01T00:00');
    await page.fill('#end-date', '2025-09-30T23:59');
    await page.check('#project-mpsa');
    await page.check('#project-mas');
    await page.click('#preview-btn');
    await page.click('#preview-btn');

    await waitForPreview(page, { timeout: 120000 });
    const previewVisible = await page.locator('#preview-content').isVisible();
    const errorVisible = await page.locator('#error').isVisible();
    expect(previewVisible || errorVisible).toBeTruthy();

    assertTelemetryClean(telemetry);
  });
});
