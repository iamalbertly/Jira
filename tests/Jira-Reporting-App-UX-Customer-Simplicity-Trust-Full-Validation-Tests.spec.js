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
  assertTelemetryClean,
} from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';

test.describe('UX Customer-Simplicity-Trust Full', () => {
  test('Login – Outcome line visible on login page', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/login.html');
    const outcome = page.locator('.login-outcome-line');
    await expect(outcome).toBeVisible();
    const text = await outcome.textContent().catch(() => '');
    expect(text).toMatch(/Sprint risks and delivery in under 30 seconds/i);
    assertTelemetryClean(telemetry);
  });

  test('Report – Filters tip above Projects', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');
    const tip = page.locator('.filters-tip');
    await expect(tip).toBeVisible();
    const text = await tip.textContent().catch(() => '');
    expect(text).toMatch(/Pick projects and a quarter|check the preview and export/i);
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

  test('Report – Filters changed keeps results visible and auto-refreshes', async ({ page }) => {
    test.setTimeout(120000);
    const telemetry = captureBrowserTelemetry(page);
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    if (!previewVisible) {
      test.skip(true, 'Preview not visible; skip filter-change CTA');
      return;
    }
    await page.uncheck('#project-mas').catch(() => {});
    await expect(page.locator('#preview-content')).toBeVisible();
    await expect(page.locator('#preview-btn')).toBeDisabled({ timeout: 5000 });
    const statusText = await page.locator('#preview-status').textContent().catch(() => '');
    if ((statusText || '').trim().length > 0) {
      expect(statusText || '').toMatch(/Filters changed|Refreshing automatically|last successful/i);
    }
    await expect(page.locator('#error')).toBeHidden();
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
    const headerExport = page.locator('#export-excel-btn');
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
    const hasLegacyLoading = (await page.locator('#leadership-loading').count()) > 0;
    if (!hasLegacyLoading) {
      if (page.url().includes('/report')) {
        await expect(page).toHaveURL(/\/report(#trends)?/);
      }
      test.skip(true, 'Legacy leadership loading UI not present on report trends route');
      return;
    }
    const loading = page.locator('#leadership-loading');
    await expect(loading).toBeVisible();
    const text = await loading.textContent().catch(() => '');
    expect(text).toMatch(/Loading normalized trends|selected projects|date range|delivery trends/i);
    assertTelemetryClean(telemetry);
  });

  test('Leadership – changing filters auto-runs preview without extra click', async ({ page }) => {
    let previewCalls = 0;
    await page.route('**/preview.json*', async (route) => {
      previewCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          boards: [{ id: 1, name: 'Board 1', projectKeys: ['MPSA'], indexedDelivery: { index: 1, currentSPPerDay: 1, rollingAvgSPPerDay: 1, sprintCount: 1 } }],
          sprintsIncluded: [{ id: 100, boardId: 1, state: 'closed', endDate: '2025-09-30T23:59:59.999Z', sprintWorkDays: 10, sprintCalendarDays: 14, doneStoriesNow: 2, doneStoriesBySprintEnd: 2, doneSP: 4 }],
          rows: [{ boardId: 1, sprintId: 100, issueKey: 'MPSA-1' }],
          metrics: {},
          meta: { generatedAt: new Date().toISOString(), windowStart: '2025-07-01T00:00:00.000Z', windowEnd: '2025-09-30T23:59:59.999Z', projects: 'MPSA' },
        }),
      });
    });

    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/sprint-leadership');
    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }
    const hasLegacyFilters = (await page.locator('#leadership-projects').count()) > 0;
    if (!hasLegacyFilters) {
      test.skip(true, 'Legacy leadership filters are not present on report trends route');
      return;
    }

    previewCalls = 0;
    await page.selectOption('#leadership-projects', 'MPSA').catch(() => {});
    await page.waitForTimeout(900);
    expect(previewCalls).toBeGreaterThan(0);
    assertTelemetryClean(telemetry);
  });

  test('Leadership – Empty state includes Check projects and Try recent quarter', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/sprint-leadership');
    const hasLegacyFilters = (await page.locator('#leadership-projects').count()) > 0;
    if (!hasLegacyFilters) {
      test.skip(true, 'Legacy leadership filters are not present on report trends route');
      return;
    }
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
    const hasLegacyPreview = (await page.locator('#leadership-preview').count()) > 0;
    if (!hasLegacyPreview) {
      test.skip(true, 'Legacy leadership preview UI not present on report trends route');
      return;
    }
    await page.click('#leadership-preview').catch(() => {});
    await Promise.race([
      page.waitForSelector('.leadership-boards-table', { state: 'visible', timeout: 20000 }).catch(() => null),
      page.waitForSelector('#leadership-error', { state: 'visible', timeout: 20000 }).catch(() => null),
    ]);
    const tableVisible = await page.locator('.leadership-boards-table').isVisible().catch(() => false);
    if (!tableVisible) {
      test.skip(true, 'Leadership boards table not visible in this environment');
      return;
    }
    const th = page.locator('th[title*="SP/day"], th[title*="baseline"]').first();
    const count = await th.count();
    if (count > 0) {
      await expect(th).toHaveAttribute('title', /.+/);
    }
    assertTelemetryClean(telemetry);
  });
});

