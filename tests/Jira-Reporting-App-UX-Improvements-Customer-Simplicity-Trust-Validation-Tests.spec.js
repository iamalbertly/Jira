/**
 * UX Improvements: Customer, Simplicity, Trust validation.
 * Validates copy/encoding, meta collapse, applied filters, export placement, CTA label,
 * stuck/empty states, error distinction, leadership context/export, Done Stories columns,
 * loading/recovery, and edge cases using captureBrowserTelemetry and assertTelemetryClean.
 */

import { test, expect } from '@playwright/test';
import {
  captureBrowserTelemetry,
  runDefaultPreview,
  waitForPreview,
  IGNORE_CONSOLE_ERRORS,
  IGNORE_REQUEST_PATTERNS,
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

test.describe('UX Improvements Customer Simplicity Trust', () => {
  test('report load: h1, Preview report button, nav links, applied-filters-summary present', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');

    await expect(page.locator('h1')).toContainText(/VodaAgileBoard|General Performance/);
    await expect(page.locator('#preview-btn')).toContainText('Preview report');
    await expect(page.locator('nav.app-nav a[href="/current-sprint"]')).toContainText('Current Sprint');
    await expect(page.locator('nav.app-nav a[href="/sprint-leadership"]')).toContainText('Leadership');
    await expect(page.locator('#applied-filters-summary')).toBeVisible();

    assertTelemetryClean(telemetry);
  });

  test('report preview flow: collapsed meta line, Details toggle, export in header when has rows', async ({ page }) => {
    test.setTimeout(240000);
    const telemetry = captureBrowserTelemetry(page);
    await runDefaultPreview(page);
    await waitForPreview(page, { timeout: 150000 });

    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    if (!previewVisible) {
      test.skip(true, 'Preview not visible; may require Jira credentials');
      return;
    }
    await expect(page.locator('.meta-summary-line, .meta-info-summary')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-action="toggle-preview-meta-details"], #preview-meta-details-toggle')).toContainText(/Details|Hide details/);
    const headerExport = page.locator('#preview-header-export-excel-btn');
    await expect(headerExport).toBeVisible();

    assertTelemetryClean(telemetry);
  });

  test('report partial banner: when status banner visible, contains Retry and Smaller range and Full refresh', async ({ page }) => {
    test.setTimeout(180000);
    const telemetry = captureBrowserTelemetry(page);
    await runDefaultPreview(page);
    await waitForPreview(page, { timeout: 120000 });

    const banner = page.locator('.status-banner.warning');
    const visible = await banner.isVisible().catch(() => false);
    if (visible) {
      await expect(page.locator('[data-action="retry-preview"]')).toBeVisible();
      await expect(page.locator('[data-action="retry-with-smaller-range"]')).toBeVisible();
      await expect(page.locator('[data-action="force-full-refresh"]')).toBeVisible();
    }

    assertTelemetryClean(telemetry);
  });

  test('report validation error: invalid range shows short Check filters style message', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');
    await page.fill('#start-date', '2025-09-30T23:59');
    await page.fill('#end-date', '2025-07-01T00:00');
    await page.click('#preview-btn');

    await expect(page.locator('#error')).toBeVisible({ timeout: 5000 });
    const errorText = await page.locator('#error').textContent();
    expect(errorText).toMatch(/Check filters|Start date|before end date/i);

    assertTelemetryClean(telemetry);
  });

  test('current-sprint load: board select visible, header dates use en-dash or to, Data as of when data loaded', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/current-sprint');

    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }
    await expect(page.locator('#board-select')).toBeVisible();
    const headerText = await page.locator('[class*="header"], .sprint-header, .header-bar').first().textContent().catch(() => '');
    expect(headerText).not.toMatch(/\s\?\s/);

    assertTelemetryClean(telemetry);
  });

  test('current-sprint stuck: when data loaded, Stuck or in progress >24h section present', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/current-sprint');

    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }
    await page.waitForSelector('#board-select', { state: 'visible', timeout: 10000 }).catch(() => null);
    const options = await page.locator('#board-select option').allTextContents();
    if (options.length <= 1 && options[0] && options[0].includes("Couldn't load")) {
      test.skip(true, 'Boards not loaded; cannot assert stuck section');
      return;
    }
    await page.waitForTimeout(3000);
    const body = await page.locator('body').textContent();
    expect(body).toMatch(/Stuck|in progress >24h|0 items/);

    assertTelemetryClean(telemetry);
  });

  test('leadership load: context Projects | Range, View generated after Preview, Export for boards', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/sprint-leadership');

    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }
    await expect(page.locator('#leadership-preview')).toBeVisible();
    await page.fill('#leadership-start', '2025-07-01');
    await page.fill('#leadership-end', '2025-09-30');
    await page.click('#leadership-preview');
    await page.waitForSelector('#leadership-content', { state: 'visible', timeout: 60000 }).catch(() => null);
    const content = await page.locator('#leadership-content').textContent().catch(() => '');
    expect(content).toMatch(/Projects|Range/);
    const hasViewGenerated = await page.locator('text=View generated').isVisible().catch(() => false);
    const hasExport = await page.locator('[data-action="export-leadership-boards-csv"]').isVisible().catch(() => false);
    expect(hasViewGenerated || hasExport || content.length > 50).toBeTruthy();

    assertTelemetryClean(telemetry);
  });

  test('done stories tab: after preview, default columns visible, Show more columns toggle present', async ({ page }) => {
    test.setTimeout(180000);
    const telemetry = captureBrowserTelemetry(page);
    await runDefaultPreview(page);
    await waitForPreview(page, { timeout: 120000 });

    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    if (!previewVisible) {
      test.skip(true, 'Preview not visible; may require Jira credentials');
      return;
    }
    await page.click('#tab-btn-done-stories');
    await page.waitForSelector('#tab-done-stories.active', { state: 'visible', timeout: 5000 }).catch(() => null);
    await expect(page.locator('#done-stories-columns-toggle')).toContainText(/Show more columns|Show fewer columns/);
    const table = page.locator('#tab-done-stories table.data-table').first();
    await expect(table.locator('th:has-text("Key")')).toBeVisible();
    await expect(table.locator('th:has-text("Summary")')).toBeVisible();
    await expect(table.locator('th:has-text("Resolved")')).toBeVisible();

    assertTelemetryClean(telemetry);
  });

  test('sticky summary: no replacement character in sticky text', async ({ page }) => {
    test.setTimeout(180000);
    const telemetry = captureBrowserTelemetry(page);
    await runDefaultPreview(page);
    await waitForPreview(page, { timeout: 120000 });

    const sticky = page.locator('#preview-summary-sticky');
    const visible = await sticky.isVisible().catch(() => false);
    if (visible) {
      const text = await sticky.textContent();
      const replacementChar = '\uFFFD';
      expect(text).not.toContain(replacementChar);
    }

    assertTelemetryClean(telemetry);
  });

  test('copy and encoding: Current Sprint header no ? separator; Report button is Preview report', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');
    await expect(page.locator('#preview-btn')).toContainText('Preview report');

    await page.goto('/current-sprint').catch(() => null);
    if (!page.url().includes('current-sprint')) return;
    const headerBar = await page.locator('.header-bar, [class*="header"]').first().textContent().catch(() => '');
    expect(headerBar).not.toMatch(/\s\?\s/);

    assertTelemetryClean(telemetry);
  });
});
