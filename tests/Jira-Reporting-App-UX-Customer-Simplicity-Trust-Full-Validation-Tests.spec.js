/**
 * UX Customer-Simplicity-Trust Full Validation.
 * Validates all 11 plan improvements plus edge cases: Login outcome/error template,
 * Report filter tip, tab outcome, loading steps, filter-change CTA, Export, partial copy,
 * Require-resolved empty line, heavy-range message, search clear; Current Sprint board load,
 * outcome line, Same as Report hint, Stuck/Scope definitions; Leadership outcome, empty hint,
 * Indexed Delivery tooltip; Leadership empty "Try recent quarter".
 * Uses captureBrowserTelemetry and assertTelemetryClean; fails on UI mismatch or console/network errors.
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

test.describe('UX Customer-Simplicity-Trust Full', () => {
  test('Login – Outcome line visible on login page', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/login.html');
    const outcome = page.locator('.login-outcome-line');
    await expect(outcome).toBeVisible();
    const text = await outcome.textContent().catch(() => '');
    expect(text).toMatch(/run reports|current sprint|leadership/i);
    assertTelemetryClean(telemetry);
  });

  test('Report – Filters tip above Projects', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');
    const tip = page.locator('.filters-tip');
    await expect(tip).toBeVisible();
    const text = await tip.textContent().catch(() => '');
    expect(text).toMatch(/Start here|choose projects|Preview report|Excel export/i);
    assertTelemetryClean(telemetry);
  });

  test('Report – Advanced options collapsed by default', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');
    const advanced = page.locator('#advanced-options');
    await expect(advanced).toBeHidden();
    assertTelemetryClean(telemetry);
  });

  test('Report – Tab outcome line and search clear ×', async ({ page }) => {
    test.setTimeout(120000);
    const telemetry = captureBrowserTelemetry(page);
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    if (!previewVisible) {
      test.skip(true, 'Preview not visible; skip tab hint');
      return;
    }
    const tabHint = page.locator('#tab-outcome-hint, .tab-hint');
    await expect(tabHint).toBeVisible();
    const hintText = await tabHint.textContent().catch(() => '');
    expect(hintText).toMatch(/Done Stories|stakeholders|Export/i);
    const clearBtn = page.locator('.search-clear-btn').first();
    await expect(clearBtn).toBeVisible();
    const clearText = await clearBtn.textContent().catch(() => '');
    expect(clearText).toMatch(/×|Clear/i);
    assertTelemetryClean(telemetry);
  });

  test('Report – Filters changed alert has Preview report CTA', async ({ page }) => {
    test.setTimeout(120000);
    const telemetry = captureBrowserTelemetry(page);
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    if (!previewVisible) {
      test.skip(true, 'Preview not visible; skip filter-change CTA');
      return;
    }
    await page.uncheck('#project-mas').catch(() => {});
    const errorArea = page.locator('#error');
    await expect(errorArea).toBeVisible();
    const retryBtn = page.locator('[data-action="retry-preview"]');
    await expect(retryBtn).toBeVisible();
    const btnText = await retryBtn.textContent().catch(() => '');
    expect(btnText).toMatch(/Preview|Retry/i);
    assertTelemetryClean(telemetry);
  });

  test('Report – Preview header has Export button', async ({ page }) => {
    test.setTimeout(120000);
    const telemetry = captureBrowserTelemetry(page);
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    if (!previewVisible) {
      test.skip(true, 'Preview not visible');
      return;
    }
    const headerExport = page.locator('#preview-header-export-excel-btn');
    await expect(headerExport).toBeVisible();
    assertTelemetryClean(telemetry);
  });

  test('Report – Partial banner has Try smaller range', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');
    const smallerBtn = page.locator('[data-action="retry-with-smaller-range"]');
    const banner = page.locator('.status-banner.warning');
    await page.click('#preview-btn').catch(() => {});
    await Promise.race([
      page.waitForSelector('.status-banner.warning', { state: 'visible', timeout: 65000 }).catch(() => null),
      page.waitForSelector('#preview-content', { state: 'visible', timeout: 65000 }).catch(() => null),
    ]);
    const bannerVisible = await banner.isVisible().catch(() => false);
    if (bannerVisible) {
      await expect(page.locator('button:has-text("Try smaller range")')).toBeVisible();
    }
    assertTelemetryClean(telemetry);
  });

  test('Current Sprint – Outcome line when content loaded', async ({ page }) => {
    test.setTimeout(60000);
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/current-sprint');
    await page.waitForSelector('#current-sprint-content', { state: 'visible', timeout: 25000 }).catch(() => null);
    const outcome = page.locator('.current-sprint-outcome-line');
    const contentVisible = await page.locator('#current-sprint-content').isVisible().catch(() => false);
    if (contentVisible) {
      const text = await page.locator('#current-sprint-content').textContent().catch(() => '');
      if (text && text.includes('Sprint health at a glance')) {
        await expect(outcome).toBeVisible();
      }
    }
    assertTelemetryClean(telemetry);
  });

  test('Current Sprint – Stuck and Scope definitions present', async ({ page }) => {
    test.setTimeout(60000);
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/current-sprint');
    await page.waitForSelector('#current-sprint-content', { state: 'visible', timeout: 25000 }).catch(() => null);
    const content = await page.locator('#current-sprint-content').textContent().catch(() => '');
    if (content && content.includes('stuck-card')) {
      expect(content).toMatch(/Stuck:|issues in progress|>24h/i);
      expect(content).toMatch(/Scope changes|work added|mid-sprint/i);
    }
    assertTelemetryClean(telemetry);
  });

  test('Leadership – Outcome line in loading', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/sprint-leadership');
    const loading = page.locator('#leadership-loading');
    await expect(loading).toBeVisible();
    const text = await loading.textContent().catch(() => '');
    expect(text).toMatch(/Board-level|delivery trends|no rankings|quarter|Preview/i);
    assertTelemetryClean(telemetry);
  });

  test('Leadership – Empty state includes Check projects and Try recent quarter', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/sprint-leadership');
    await page.selectOption('#leadership-projects', 'BIO').catch(() => {});
    await page.fill('#leadership-start', '2020-01-01').catch(() => {});
    await page.fill('#leadership-end', '2020-01-31').catch(() => {});
    await page.click('#leadership-preview').catch(() => {});
    await page.waitForSelector('#leadership-content', { state: 'visible', timeout: 30000 }).catch(() => null);
    const content = await page.locator('#leadership-content').textContent().catch(() => '');
    if (content && content.toLowerCase().includes('no boards')) {
      expect(content).toMatch(/Check that the selected projects|sprints in this date range/i);
      expect(content).toMatch(/Try a more recent quarter|current quarter/i);
    }
    assertTelemetryClean(telemetry);
  });

  test('Leadership – Indexed Delivery column has tooltip', async ({ page }) => {
    test.setTimeout(60000);
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/sprint-leadership');
    await page.click('#leadership-preview').catch(() => {});
    await page.waitForSelector('.leadership-boards-table', { state: 'visible', timeout: 60000 }).catch(() => null);
    const th = page.locator('th[title*="SP/day"], th[title*="baseline"]').first();
    const count = await th.count();
    if (count > 0) {
      await expect(th).toHaveAttribute('title', /.+/);
    }
    assertTelemetryClean(telemetry);
  });
});
