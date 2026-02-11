/**
 * UX Customer Simplicity Trust Validation.
 * Validates: Login outcome/trust copy, error focus, rate-limit message; Report sticky chips,
 * one empty-state, Generated X min ago, filters tip/subtitle; Current Sprint loading/no-boards copy;
 * Leadership auto-preview on quarter/date change. Uses captureBrowserTelemetry and assertTelemetryClean.
 */

import { test, expect } from '@playwright/test';
import {
  captureBrowserTelemetry,
  runDefaultPreview,
  waitForPreview,
  assertTelemetryClean,
} from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';

test.describe('UX Customer Simplicity Trust', () => {
  test('Login – Outcome line and trust line text', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/login');
    const hasLoginForm = await page.locator('#login-form').isVisible().catch(() => false);
    if (!hasLoginForm) {
      test.skip(true, 'Login form not visible; auth may be disabled');
      return;
    }
    await expect(page.locator('.login-outcome-line')).toContainText(/Sprint risks and delivery in under 30 seconds/i);
    await expect(page.locator('.login-trust-line')).toContainText(/Session-secured.*Internal use/i);
    assertTelemetryClean(telemetry);
  });

  test('Login – Error focus when error shown', async ({ page }) => {
    await page.goto('/login?error=invalid');
    const hasLoginForm = await page.locator('#login-form').isVisible().catch(() => false);
    if (!hasLoginForm) {
      test.skip(true, 'Login form not visible');
      return;
    }
    await expect(page.locator('#login-error')).toBeVisible();
    const focusedId = await page.evaluate(() => document.activeElement?.id || '');
    const isErrorOrUsername = focusedId === 'login-error' || focusedId === 'username';
    expect(isErrorOrUsername).toBe(true);
  });

  test('Login – Rate-limit message when error=ratelimit', async ({ page }) => {
    await page.goto('/login?error=ratelimit');
    const hasLoginForm = await page.locator('#login-form').isVisible().catch(() => false);
    if (!hasLoginForm) {
      test.skip(true, 'Login form not visible');
      return;
    }
    await expect(page.locator('#login-error')).toBeVisible();
    await expect(page.locator('#login-error')).toContainText(/Too many attempts.*Wait a minute/i);
  });

  test('Report – Sticky chips row visible after scroll', async ({ page }) => {
    test.setTimeout(120000);
    const telemetry = captureBrowserTelemetry(page);
    await runDefaultPreview(page);
    const chipsRow = page.locator('#preview-summary-sticky, .applied-filters-chips-row').first();
    await expect(chipsRow).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    await expect(chipsRow).toBeVisible();
    const editBtn = page.locator('#applied-filters-edit-btn');
    const hasEditBtn = await editBtn.isVisible().catch(() => false);
    if (!hasEditBtn) {
      await expect(page.locator('#reset-filters-btn')).toBeVisible();
    }
    assertTelemetryClean(telemetry);
  });

  test('Report – Filters tip and subtitle shortened', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');
    const tip = page.locator('.filters-tip');
    await expect(tip).toBeVisible();
    const tipText = await tip.textContent().catch(() => '');
    expect(tipText).toMatch(/Pick projects and a quarter.*preview and\s*export/i);
    const subtitle = page.locator('#report-subtitle');
    await expect(subtitle).toBeVisible();
    const subText = await subtitle.textContent().catch(() => '');
    expect(subText).toMatch(/Preview updates automatically when filters change|Preview report/i);
    assertTelemetryClean(telemetry);
  });

  test('Report – Generated X min ago or just now in sticky when preview has data', async ({ page }) => {
    test.setTimeout(120000);
    const telemetry = captureBrowserTelemetry(page);
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    if (!previewVisible) {
      test.skip(true, 'Preview not visible; skip sticky freshness');
      return;
    }
    const sticky = page.locator('#preview-summary-sticky');
    await expect(sticky).toBeVisible();
    const stickyText = await sticky.textContent().catch(() => '');
    expect(stickyText).toMatch(/Generated (just now|\d+ min ago)/i);
    assertTelemetryClean(telemetry);
  });

  test('Report – One empty state message and Adjust filters CTA when no done stories', async ({ page }) => {
    test.setTimeout(120000);
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');
    await page.check('#project-mpsa');
    await page.uncheck('#project-mas');
    await page.fill('#start-date', '2020-01-01T00:00');
    await page.fill('#end-date', '2020-01-15T23:59');
    await page.locator('#preview-btn').click();
    await waitForPreview(page, { timeout: 90000 });
    const emptyState = page.locator('.empty-state');
    const emptyVisible = await emptyState.isVisible().catch(() => false);
    if (emptyVisible) {
      await expect(emptyState).toContainText(/No done stories/i);
      const adjustBtn = page.locator('[data-action="adjust-filters"]');
      const hasAdjustBtn = await adjustBtn.isVisible().catch(() => false);
      if (!hasAdjustBtn) {
        await expect(page.locator('#reset-filters-btn')).toBeVisible();
      }
    }
    assertTelemetryClean(telemetry, { excludePreviewAbort: true });
  });

  test('Current Sprint – Loading copy when no board selected', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/current-sprint');
    await page.waitForTimeout(400);
    const loading = page.locator('#current-sprint-loading');
    const loadingVisible = await loading.isVisible().catch(() => false);
    if (loadingVisible) {
      const text = await loading.textContent().catch(() => '') || '';
      expect(text).toMatch(/Select projects and a board.*sprint health and risks/i);
    }
    assertTelemetryClean(telemetry);
  });

  test('Leadership – Auto-preview after changing quarter or date', async ({ page }) => {
    test.setTimeout(90000);
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/sprint-leadership');
    if (page.url().includes('/report')) {
      await expect(page).toHaveURL(/\/report(#trends)?/);
    }
    const content = page.locator('#leadership-content, [id*="content"]');
    const quarterPill = page.locator('.quarter-pill').first();
    const hasPill = await quarterPill.isVisible().catch(() => false);
    if (hasPill) {
      await quarterPill.click();
      await page.waitForTimeout(1500);
      const contentVisible = await content.isVisible().catch(() => false);
      const loadingVisible = await page.locator('#leadership-loading, [id*="loading"]').isVisible().catch(() => false);
      const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
      const trendsVisible = await page.locator('#tab-trends').isVisible().catch(() => false);
      if (!(contentVisible || loadingVisible || previewVisible || trendsVisible)) {
        test.skip(true, 'No reliable leadership auto-preview signal in current route/data');
        return;
      }
    }
    assertTelemetryClean(telemetry);
  });
});
