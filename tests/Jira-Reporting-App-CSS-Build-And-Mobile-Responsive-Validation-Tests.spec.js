/**
 * Validates CSS build output and mobile responsiveness: built styles.css exists,
 * report and current-sprint headers have no horizontal overflow at 375px, key text visible,
 * nav and filters present. Uses captureBrowserTelemetry and assertTelemetryClean per step.
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { existsSync, statSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { captureBrowserTelemetry, assertTelemetryClean } from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const stylesPath = path.join(projectRoot, 'public', 'styles.css');
const BUILD_MARKER = 'Built from public/css/';

test.describe('CSS Build And Mobile Responsive Validation', () => {
  test('CSS build output exists and has content', () => {
    expect(existsSync(stylesPath)).toBe(true);
    const stat = statSync(stylesPath);
    expect(stat.size).toBeGreaterThan(0);
    const content = readFileSync(stylesPath, 'utf-8');
    expect(content).toContain(BUILD_MARKER);
  });

  test('report page loads and header is responsive at 375px', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/report');
    if (page.url().includes('login')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }
    const headerOverflow = await page.evaluate(() => {
      const h = document.querySelector('header');
      return h ? h.scrollWidth > h.clientWidth : false;
    });
    expect(headerOverflow).toBe(false);
    await expect(page.locator('header h1')).toContainText(/General Performance|High-Level/i);
    await expect(page.locator('#report-subtitle')).toBeVisible();
    assertTelemetryClean(telemetry);
  });

  test('current-sprint header responsive at 375px', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/current-sprint');
    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }
    const titleBlockOverflow = await page.evaluate(() => {
      const block = document.querySelector('header .current-sprint-header > div:first-child, header .current-sprint-header-bar .header-bar-left');
      return block ? block.scrollWidth > block.clientWidth : false;
    });
    expect(titleBlockOverflow).toBe(false);
    const mainTitle = page.locator('header h1, .current-sprint-header-bar .header-sprint-name, #current-sprint-title').first();
    await expect(mainTitle).toBeVisible();
    assertTelemetryClean(telemetry);
  });

  test('report nav and filters visible after load at 375px', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/report');
    if (page.url().includes('login')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }
    const hasNav = await page.locator('.app-sidebar, .sidebar-toggle, nav.app-nav, .app-global-nav-wrap').first().isVisible().catch(() => false);
    const hasFilters = await page.locator('#filters-panel-collapsed-bar, #filters-panel-body, [data-action="toggle-filters"]').first().isVisible().catch(() => false);
    expect(hasNav || hasFilters).toBe(true);
    assertTelemetryClean(telemetry);
  });
});
