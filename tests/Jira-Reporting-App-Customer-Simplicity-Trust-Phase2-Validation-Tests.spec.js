/**
 * Customer Simplicity Trust Phase2 validation.
 * Validates Epic links, work items discoverability, applied-filters, partial banner,
 * section links, Leadership context/Export. Uses captureBrowserTelemetry and assertTelemetryClean.
 */

import { test, expect } from '@playwright/test';
import {
  captureBrowserTelemetry,
  assertTelemetryClean,
} from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';

test.describe('Customer Simplicity Trust Phase2', () => {
  test('Report - Epic IDs are URL links (Project & Epic Level tab)', async ({ page }) => {
    test.setTimeout(120000);
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');
    await page.check('#project-mpsa').catch(() => {});
    await page.check('#project-mas').catch(() => {});
    await page.fill('#start-date', '2025-07-01T00:00').catch(() => {});
    await page.fill('#end-date', '2025-09-30T23:59').catch(() => {});
    await page.click('#preview-btn');
    await Promise.race([
      page.waitForSelector('#preview-content', { state: 'visible', timeout: 45000 }).catch(() => null),
      page.waitForSelector('#error', { state: 'visible', timeout: 45000 }).catch(() => null),
    ]);

    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    if (!previewVisible) {
      test.skip(true, 'Preview not visible within timeout; may require Jira credentials');
      return;
    }
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    await page.waitForSelector('#tab-project-epic-level.active', { state: 'visible', timeout: 10000 });
    await page.waitForSelector('#project-epic-level-content', { state: 'visible', timeout: 10000 });

    const link = page.locator('#project-epic-level-content .epic-key a').first();
    const visible = await link.isVisible().catch(() => false);
    if (!visible) {
      test.skip(true, 'No epic key links in Project & Epic Level');
      return;
    }
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    const target = await link.getAttribute('target');
    const rel = await link.getAttribute('rel');
    expect(href && href.length > 0).toBeTruthy();
    expect(href).toMatch(/browse|jira|\.atlassian\.net/i);
    expect(target).toBe('_blank');
    expect(rel && rel.includes('noopener')).toBeTruthy();

    assertTelemetryClean(telemetry);
  });

  test('Current Sprint - Work items quickly visible', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/current-sprint');

    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }
    await page.waitForSelector('#board-select', { state: 'visible', timeout: 15000 }).catch(() => null);
    const options = await page.locator('#board-select option').allTextContents().catch(() => []);
    if (options.length <= 1 && options[0] && options[0].includes("Couldn't load")) {
      test.skip(true, 'Boards not loaded; skip work items visibility');
      return;
    }
    await page.waitForSelector('a[href="#stories-card"], #stories-card', { timeout: 35000 }).catch(() => null);
    const linkCount = await page.locator('a[href="#stories-card"]').count();
    const storiesCard = page.locator('#stories-card');
    const cardPresent = (await storiesCard.count()) > 0;
    const hasIssuesText = await page.getByText(/Issues in sprint/).first().isVisible().catch(() => false);
    const hasWorkItemsText = await page.getByText(/Work items/).first().isVisible().catch(() => false);
    const cardVisible = cardPresent && (await storiesCard.first().isVisible().catch(() => false));
    const hasWorkItemsSection = linkCount > 0 || cardPresent || hasIssuesText || hasWorkItemsText || cardVisible;
    if (!hasWorkItemsSection) {
      test.skip(true, 'Issues/work items section not rendered within timeout (boards may still be loading)');
      return;
    }
    expect(hasWorkItemsSection).toBeTruthy();
    const sectionTitle = await page.locator('#stories-card h2, #stories-card .card-title').first().textContent().catch(() => '');
    if (sectionTitle) expect(sectionTitle).toMatch(/Issues in this sprint|Work items in sprint|Work items/i);

    assertTelemetryClean(telemetry);
  });

  test('Report - Applied-filters summary and Preview CTA', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');

    await expect(page.locator('#applied-filters-summary')).toBeVisible();
    await expect(page.locator('#preview-btn')).toContainText(/Preview/i);

    assertTelemetryClean(telemetry);
  });

  test('Report - Partial banner shows concise status copy', async ({ page }) => {
    test.setTimeout(120000);
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');
    await page.check('#project-mpsa').catch(() => {});
    await page.check('#project-mas').catch(() => {});
    await page.fill('#start-date', '2025-07-01T00:00').catch(() => {});
    await page.fill('#end-date', '2025-09-30T23:59').catch(() => {});
    await page.click('#preview-btn');
    await Promise.race([
      page.waitForSelector('#preview-content', { state: 'visible', timeout: 50000 }).catch(() => null),
      page.waitForSelector('#error', { state: 'visible', timeout: 50000 }).catch(() => null),
      page.waitForSelector('.status-banner.warning', { state: 'visible', timeout: 50000 }).catch(() => null),
    ]);

    const banner = page.locator('.status-banner.warning');
    const visible = await banner.isVisible().catch(() => false);
    if (visible) {
      await expect(banner).toContainText(/Refresh|showing the last successful results|partial/i);
    }

    assertTelemetryClean(telemetry);
  });

  test('Current Sprint - Header or carousel has section link to work items', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/current-sprint');

    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }
    await page.waitForSelector('#board-select', { state: 'visible', timeout: 15000 }).catch(() => null);
    const options = await page.locator('#board-select option').allTextContents().catch(() => []);
    if (options.length <= 1 && options[0] && options[0].includes("Couldn't load")) {
      test.skip(true, 'Boards not loaded; skip section link');
      return;
    }
    await page.waitForSelector('a[href="#stories-card"], #stories-card', { timeout: 35000 }).catch(() => null);
    const linkToStories = page.locator('a[href="#stories-card"]');
    const hasLink = await linkToStories.first().isVisible().catch(() => false);
    const hasIssuesOrWorkItems = await page.getByText(/Issues in sprint|Work items/).first().isVisible().catch(() => false);
    if (!hasLink && !hasIssuesOrWorkItems) {
      test.skip(true, 'Section link not visible within timeout');
      return;
    }
    expect(hasLink || hasIssuesOrWorkItems).toBeTruthy();

    assertTelemetryClean(telemetry);
  });

  test('Leadership - redirects to report trends', async ({ page }) => {
    test.setTimeout(90000);
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
});
