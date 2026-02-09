/**
 * Four projects and Q4 data validation.
 * First orchestration test: select 4 projects, set Q4 range, run Preview,
 * wait until data loads or error is shown; assert completion (preview or non-empty error).
 */

import { test, expect } from '@playwright/test';
import { waitForPreview } from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';

const Q4_START = '2025-10-01T00:00';
const Q4_END = '2025-12-31T23:59';

test.describe('Four projects Q4 data validation', () => {
  test('four projects and Q4 data load successfully or show clear error', async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => {
      try { sessionStorage.removeItem('report-filters-collapsed'); } catch (_) {}
    });

    await page.goto('/report');
    if (page.url().includes('login') || (await page.locator('#username').isVisible().catch(() => false))) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }

    await expect(page.locator('#preview-btn')).toBeVisible();

    const ensureFiltersExpanded = () => {
      try { sessionStorage.removeItem('report-filters-collapsed'); } catch (_) {}
      const panel = document.getElementById('filters-panel');
      const panelBody = document.getElementById('filters-panel-body');
      const collapsedBar = document.getElementById('filters-panel-collapsed-bar');
      if (panel) panel.classList.remove('collapsed');
      if (panelBody) panelBody.style.display = '';
      if (collapsedBar) collapsedBar.style.display = 'none';
    };
    await page.evaluate(ensureFiltersExpanded);
    await page.evaluate(ensureFiltersExpanded);

    // Ensure exactly 4 projects selected: MPSA, MAS, RPA, MVA (default MPSA+MAS; add RPA, MVA)
    await page.check('#project-mpsa');
    await page.check('#project-mas');
    await page.check('#project-rpa');
    await page.check('#project-mva');
    for (const id of ['project-asg', 'project-fin', 'project-sd', 'project-mpsa2', 'project-trs', 'project-vb', 'project-ams2', 'project-bio']) {
      await page.uncheck('#' + id).catch(() => {});
    }

    await page.locator('#start-date').fill(Q4_START, { force: true });
    await page.locator('#end-date').fill(Q4_END, { force: true });
    await page.click('#preview-btn');

    await Promise.race([
      page.waitForSelector('#loading', { state: 'visible', timeout: 10000 }).catch(() => null),
      page.waitForSelector('#preview-content', { state: 'visible', timeout: 10000 }).catch(() => null),
      page.waitForSelector('#error', { state: 'visible', timeout: 10000 }).catch(() => null),
    ]);
    await waitForPreview(page, { timeout: 120000 });

    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    const errorVisible = await page.locator('#error').isVisible().catch(() => false);
    const errorText = errorVisible ? await page.locator('#error').textContent().catch(() => '') : '';

    expect(previewVisible || (errorVisible && (errorText || '').trim().length > 0)).toBeTruthy();
  });
});
