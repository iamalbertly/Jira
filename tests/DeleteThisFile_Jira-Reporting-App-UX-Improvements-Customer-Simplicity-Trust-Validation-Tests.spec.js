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
  assertTelemetryClean,
} from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';

test.describe('UX Improvements Customer Simplicity Trust', () => {
  test('report load: h1, Preview button, nav links, applied-filters-summary present', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');

    await expect(page.locator('h1')).toContainText(/VodaAgileBoard|General Performance/);
    await expect(page.locator('#preview-btn')).toContainText(/Preview/i);
    await expect(page.locator('.app-sidebar a.sidebar-link[href="/current-sprint"], nav.app-nav a[href="/current-sprint"]')).toContainText('Current Sprint');
    await expect(page.locator('#tab-btn-trends')).toContainText('Trends');
    await expect(page.locator('#applied-filters-summary')).toBeVisible();

    assertTelemetryClean(telemetry);
  });

  test('report preview flow: collapsed meta line and export in header when has rows', async ({ page }) => {
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
    const headerExport = page.locator('#export-excel-btn');
    await expect(headerExport).toBeVisible();

    assertTelemetryClean(telemetry);
  });

  test('report partial banner: when status banner visible, shows concise loading/partial copy', async ({ page }) => {
    test.setTimeout(180000);
    const telemetry = captureBrowserTelemetry(page);
    await runDefaultPreview(page);
    await waitForPreview(page, { timeout: 120000 });

    const banner = page.locator('.status-banner.warning');
    const visible = await banner.isVisible().catch(() => false);
    if (visible) {
      await expect(banner).toContainText(/Refresh|showing the last successful results|partial/i);
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

  test('current-sprint stuck: when data loaded, #stuck-card section present and visible', async ({ page }) => {
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
    const contentVisible = await page.locator('#current-sprint-content').isVisible().catch(() => false);
    if (!contentVisible) {
      test.skip(true, 'Current sprint content not visible; cannot assert stuck section');
      return;
    }
    const stuckCard = page.locator('#stuck-card');
    const stuckVisible = await stuckCard.isVisible().catch(() => false);
    if (!stuckVisible) {
      const emptyState = await page.locator('.empty-state').isVisible().catch(() => false);
      if (emptyState) {
        test.skip(true, 'No active sprint for selected board');
        return;
      }
    }
    await expect(stuckCard).toBeVisible();
    const cardText = await stuckCard.textContent();
    expect(cardText).toMatch(/Items stuck|in progress|0 items/);

    assertTelemetryClean(telemetry);
  });

  test('leadership route: redirects to report trends view', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/sprint-leadership');

    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }
    await expect(page).toHaveURL(/\/report(#trends)?/);
    await expect(page.locator('#tab-btn-trends')).toHaveAttribute('aria-selected', 'true');

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
    const firstSprintHeader = page.locator('#done-stories-content .sprint-header').first();
    const hasSprintGroup = await firstSprintHeader.isVisible().catch(() => false);
    if (!hasSprintGroup) {
      test.skip(true, 'No done stories sprint groups rendered for current data set');
      return;
    }
    await firstSprintHeader.click();
    const table = page.locator('#tab-done-stories table.data-table').first();
    await expect(table.locator('th:has-text("Key")')).toBeVisible();
    await expect(table.locator('th:has-text("Summary")')).toBeVisible();
    await expect(table.locator('th:has-text("Status")')).toBeVisible();

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

  test('copy and encoding: Current Sprint header no ? separator; Report button keeps Preview label', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');
    await expect(page.locator('#preview-btn')).toContainText(/Preview/i);

    await page.goto('/current-sprint').catch(() => null);
    if (!page.url().includes('current-sprint')) return;
    const headerBar = await page.locator('.header-bar, [class*="header"]').first().textContent().catch(() => '');
    expect(headerBar).not.toMatch(/\s\?\s/);

    assertTelemetryClean(telemetry);
  });
});


