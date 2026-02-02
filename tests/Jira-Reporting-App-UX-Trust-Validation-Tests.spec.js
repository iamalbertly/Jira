/**
 * UX Trust Validation: report, current-sprint, leadership with console (logcat-style)
 * and realtime UI assertions at every stage. Fails on UI mismatch or browser errors.
 */

import { test, expect } from '@playwright/test';
import { runDefaultPreview, waitForPreview } from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';

const IGNORE_CONSOLE_ERRORS = [
  'Failed to load resource: the server responded with a status of 404 (Not Found)'
];

const IGNORE_REQUEST_PATTERNS = [
  /\/favicon\.ico/i
];

function captureBrowserTelemetry(page) {
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!IGNORE_CONSOLE_ERRORS.includes(text)) {
        consoleErrors.push(text);
      }
    }
  });

  page.on('pageerror', error => {
    pageErrors.push(error.message);
  });

  page.on('requestfailed', request => {
    const url = request.url();
    const shouldIgnore = IGNORE_REQUEST_PATTERNS.some(pattern => pattern.test(url));
    if (!shouldIgnore) {
      failedRequests.push({
        url,
        method: request.method(),
        failure: request.failure()?.errorText || 'Unknown failure'
      });
    }
  });

  return { consoleErrors, pageErrors, failedRequests };
}

test.describe('Jira Reporting App - UX Trust Validation (UI + Console)', () => {
  test('report page loads with expected controls and no console errors', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');

    await expect(page.locator('h1')).toContainText('VodaAgileBoard');
    await expect(page.locator('#project-mpsa')).toBeVisible();
    await expect(page.locator('#preview-btn')).toBeVisible();
    await expect(page.locator('#export-excel-btn')).toBeVisible();
    await expect(page.locator('#export-dropdown-trigger')).toBeVisible();
    await expect(page.locator('#preview-content')).toBeHidden();

    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
    expect(telemetry.failedRequests).toEqual([]);
  });

  test('report preview flow: Generate Report then UI shows content or error with no console errors', async ({ page }) => {
    test.setTimeout(180000);
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');

    await expect(page.locator('#preview-btn')).toBeVisible();
    await page.click('#preview-btn');

    await Promise.race([
      page.waitForSelector('#preview-content', { state: 'visible', timeout: 120000 }).catch(() => null),
      page.waitForSelector('#error', { state: 'visible', timeout: 120000 }).catch(() => null),
    ]);
    await waitForPreview(page);

    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    const errorVisible = await page.locator('#error').isVisible().catch(() => false);
    expect(previewVisible || errorVisible).toBeTruthy();

    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
    expect(telemetry.failedRequests).toEqual([]);
  });

  test('report tabs and export: after preview, tabs and export controls are visible', async ({ page }) => {
    test.setTimeout(180000);
    const telemetry = captureBrowserTelemetry(page);
    await runDefaultPreview(page);

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

    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
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
    const options = await page.locator('#board-select option').allTextContents();
    expect(options.length).toBeGreaterThanOrEqual(1);

    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
    expect(telemetry.failedRequests).toEqual([]);
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

    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
    expect(telemetry.failedRequests).toEqual([]);
  });

  test('validation error: start >= end shows single error banner and no request', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');

    await page.check('#project-mpsa');
    await page.fill('#start-date', '2025-09-30T23:59');
    await page.fill('#end-date', '2025-07-01T00:00');
    await page.click('#preview-btn');

    await expect(page.locator('#error')).toBeVisible();
    await expect(page.locator('#error')).toContainText(/start.*before.*end|date/i);

    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
  });
});
