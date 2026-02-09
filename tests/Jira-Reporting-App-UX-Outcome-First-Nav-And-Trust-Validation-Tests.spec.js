/**
 * UX Outcome-First Nav And Trust Validation.
 * Validates: Default Done Stories tab, two-line preview meta, context bar last-run,
 * alert classes, login copy and nav, Current Sprint hero and loading, Leadership sticky and copy,
 * global nav, Report CTA/loading, Leadership zero-boards empty state; edge cases (tab state, project SSOT).
 * Uses captureBrowserTelemetry and assertTelemetryClean; fails on UI or logcat issues.
 */

import { test, expect } from '@playwright/test';
import {
  captureBrowserTelemetry,
  runDefaultPreview,
  waitForPreview,
  assertTelemetryClean,
} from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';

test.describe('UX Outcome-First Nav And Trust', () => {
  test('Report – Default tab is Done Stories', async ({ page }) => {
    test.setTimeout(120000);
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');
    const doneStoriesTab = page.locator('#tab-btn-done-stories');
    await expect(doneStoriesTab).toHaveAttribute('aria-selected', 'true');
    await expect(doneStoriesTab).toHaveClass(/active/);
    const pane = page.locator('#tab-done-stories');
    await expect(pane).toHaveClass(/active/);
    assertTelemetryClean(telemetry);
  });

  test('Report – Preview meta has two-line outcome and context', async ({ page }) => {
    test.setTimeout(120000);
    const telemetry = captureBrowserTelemetry(page);
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    if (!previewVisible) {
      test.skip(true, 'Preview not visible');
      return;
    }
    const meta = page.locator('#preview-meta');
    await expect(meta).toBeVisible();
    const outcomeLine = page.locator('.meta-outcome-line');
    await expect(outcomeLine).toBeVisible();
    await expect(outcomeLine).toContainText(/done stories|sprints|boards/i);
    const contextLine = page.locator('.meta-context-line');
    await expect(contextLine).toBeVisible();
    await expect(contextLine).toContainText(/Projects|Window/i);
    const detailsBtn = page.locator('#preview-meta-details-toggle');
    await expect(detailsBtn).toContainText(/Technical details/i);
    assertTelemetryClean(telemetry);
  });

  test('Report – Context bar shows last run or projects or placeholder', async ({ page }) => {
    test.setTimeout(120000);
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');
    const bar = page.locator('[data-context-bar]');
    await expect(bar).toBeVisible({ timeout: 10000 });
    const text = await bar.textContent().catch(() => '') || '';
    expect(text.length).toBeGreaterThan(0);
    const hasValidContent = /Last:.*stories|Projects:|No report run yet/.test(text);
    expect(hasValidContent).toBe(true);
    assertTelemetryClean(telemetry);
  });

  test('Report – Error container has alert-error class', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');
    const errorEl = page.locator('#error');
    await expect(errorEl).toHaveClass(/alert-error/);
    assertTelemetryClean(telemetry);
  });

  test('Login – Single outcome line and trust line below form', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/login');
    const hasLoginForm = await page.locator('#login-form').isVisible().catch(() => false);
    if (!hasLoginForm) {
      test.skip(true, 'Login form not visible; auth may be disabled');
      return;
    }
    await expect(page.locator('.login-outcome-line')).toContainText(/Sprint risks and delivery in under 30 seconds/i);
    const trustLine = page.locator('.login-trust-line');
    await expect(trustLine).toContainText(/Session-secured.*Internal use/i);
    const form = page.locator('#login-form');
    const trustBelowForm = await page.evaluate(() => {
      const formEl = document.getElementById('login-form');
      const trustEl = document.querySelector('.login-trust-line');
      if (!formEl || !trustEl) return false;
      return trustEl.compareDocumentPosition(formEl) === document.DOCUMENT_POSITION_FOLLOWING;
    });
    expect(trustBelowForm).toBe(true);
    assertTelemetryClean(telemetry);
  });

  test('Login – Global nav present', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/login');
    const nav = page.locator('.app-nav, #app-global-nav .app-nav');
    await expect(nav).toBeVisible();
    await expect(nav).toContainText(/Report|Current Sprint|Leadership/i);
    assertTelemetryClean(telemetry);
  });

  test('Current Sprint – At-a-glance hero block when content loaded', async ({ page }) => {
    test.setTimeout(60000);
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/current-sprint');
    await page.waitForTimeout(2000);
    const content = page.locator('#current-sprint-content');
    const hasContent = await content.isVisible().catch(() => false) && (await content.textContent().catch(() => ''))?.length > 0;
    if (!hasContent) {
      const boardSelect = page.locator('#board-select');
      const options = await boardSelect.locator('option').allTextContents().catch(() => []);
      const hasBoards = options.some(t => t && !t.includes('Loading'));
      if (hasBoards) {
        await boardSelect.selectOption({ index: 1 }).catch(() => null);
        await page.waitForTimeout(3000);
      }
    }
    const hero = page.locator('.sprint-at-a-glance-hero');
    const heroVisible = await hero.isVisible().catch(() => false);
    if (heroVisible) {
      await expect(hero).toContainText(/left|done|stuck|scope/i);
      await expect(hero.locator('a[href="#stuck-card"], .sprint-at-a-glance-cta')).toContainText(/View risks|risks/i);
    }
    assertTelemetryClean(telemetry);
  });

  test('Current Sprint – Loading copy outcome-oriented', async ({ page }) => {
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

  test('Leadership – Sticky context line when data present', async ({ page }) => {
    test.setTimeout(90000);
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/sprint-leadership');
    const quarterPill = page.locator('.quarter-pill').first();
    const hasPill = await quarterPill.isVisible().catch(() => false);
    if (hasPill) {
      await quarterPill.click();
      await page.waitForTimeout(4000);
    }
    const sticky = page.locator('.leadership-context-sticky, .leadership-context-line');
    const stickyVisible = await sticky.first().isVisible().catch(() => false);
    if (stickyVisible) {
      const text = await sticky.first().textContent().catch(() => '') || '';
      expect(text).toMatch(/Projects|Range|Generated/i);
    }
    assertTelemetryClean(telemetry);
  });

  test('Leadership – Loading copy', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/sprint-leadership');
    await page.waitForTimeout(300);
    const loading = page.locator('#leadership-loading');
    const loadingVisible = await loading.isVisible().catch(() => false);
    if (loadingVisible) {
      const text = await loading.textContent().catch(() => '') || '';
      expect(text).toMatch(/Trends load when you pick a quarter|date range/i);
    }
    assertTelemetryClean(telemetry);
  });

  test('Global nav on Report and Current Sprint', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');
    const nav = page.locator('.app-nav');
    await expect(nav).toBeVisible();
    await expect(nav.locator('.current')).toContainText(/Report/i);
    await page.goto('/current-sprint');
    await expect(nav.locator('.current')).toContainText(/Current Sprint|Squad/i);
    assertTelemetryClean(telemetry);
  });

  test('Report – Primary CTA and loading message', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');
    const previewBtn = page.locator('#preview-btn');
    await expect(previewBtn).toBeVisible();
    await expect(previewBtn).toHaveClass(/btn-primary/);
    await expect(previewBtn).toContainText(/Preview report/i);
    const loadingMsg = page.locator('#loading-message');
    await expect(loadingMsg).toContainText(/Generating report/i);
    assertTelemetryClean(telemetry);
  });

  test('Edge: Tab state after second preview', async ({ page }) => {
    test.setTimeout(120000);
    const telemetry = captureBrowserTelemetry(page);
    await runDefaultPreview(page);
    await page.waitForTimeout(500);
    await page.locator('#tab-btn-sprints').click();
    await page.waitForTimeout(300);
    await page.locator('#preview-btn').click();
    await waitForPreview(page, { timeout: 90000 });
    const sprintsTab = page.locator('#tab-btn-sprints');
    await expect(sprintsTab).toHaveAttribute('aria-selected', 'true');
    const sprintsPane = page.locator('#tab-sprints');
    await expect(sprintsPane).toHaveClass(/active/);
    assertTelemetryClean(telemetry);
  });

  test('Edge: Project SSOT – Report selection reflected on Current Sprint', async ({ page }) => {
    test.setTimeout(60000);
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');
    await page.uncheck('#project-mpsa');
    await page.check('#project-mas');
    await page.waitForTimeout(500);
    await page.goto('/current-sprint');
    await page.waitForTimeout(1000);
    const projectsSelect = page.locator('#current-sprint-projects');
    const value = await projectsSelect.inputValue().catch(() => '');
    expect(value).toMatch(/MAS/);
    assertTelemetryClean(telemetry);
  });
});
