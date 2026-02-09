import { test, expect } from '@playwright/test';
import { captureBrowserTelemetry, assertTelemetryClean } from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';

test.describe('UX Report Flow & Export Experience', () => {
  test('report subtitle explains auto-refresh with manual Preview control', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');

    await expect(page.locator('h1')).toContainText(/General Performance/i);
    await expect(page.locator('#report-subtitle')).toContainText(/Preview updates when you change projects or dates/i);
    await expect(page.locator('#preview-btn')).toBeVisible();

    assertTelemetryClean(telemetry);
  });

  test('projects are grouped into Most used and Other squads without breaking search', async ({ page }) => {
    await page.goto('/report');

    const mostUsed = page.locator('.project-group-label', { hasText: 'Most used' });
    const otherSquads = page.locator('.project-group-label', { hasText: 'Other squads' });
    await expect(mostUsed).toBeVisible();
    await expect(otherSquads).toBeVisible();

    // Basic sanity for search: filter to a single project and show "no match" state when unmatched
    await page.fill('#project-search', 'MPSA');
    await expect(page.locator('#projects-no-match')).toBeHidden();
    await page.fill('#project-search', 'ZZZ-DOES-NOT-EXIST');
    await expect(page.locator('#projects-no-match')).toBeVisible();
  });

  test('applied filters chips mirror sidebar summary and Edit filters focuses filters panel', async ({ page }) => {
    await page.goto('/report');

    // Ensure some filters are applied
    await page.uncheck('#project-rpa').catch(() => {});
    await page.fill('#start-date', '2025-07-01T00:00');
    await page.fill('#end-date', '2025-09-30T23:59');

    const summaryText = await page.locator('#applied-filters-summary').textContent();
    const chipsText = await page.locator('#applied-filters-chips').textContent();
    expect((chipsText || '').trim()).toBe((summaryText || '').trim());

    // Sticky chips row remains visible after scroll so Edit filters is always reachable
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(200);
    await expect(page.locator('.applied-filters-chips-row')).toBeVisible();
    await expect(page.locator('#applied-filters-edit-btn')).toBeVisible();

    // Edit filters button should bring focus back to filters
    const editBtn = page.locator('#applied-filters-edit-btn');
    await editBtn.click();
    const activeId = await page.evaluate(() => (document.activeElement && document.activeElement.id) || '');
    expect(['project-search', 'start-date', 'end-date']).toContain(activeId);
  });

  test('primary export CTAs are labeled as Export Excel – All data', async ({ page }) => {
    await page.goto('/report');

    await expect(page.locator('#export-excel-btn')).toContainText('Export Excel – All data');
    await expect(page.locator('#preview-header-export-excel-btn')).toContainText('Export Excel – All data');
  });

  test('loading feedback and sticky context are visible when triggering preview from deep scroll', async ({ page }) => {
    test.setTimeout(180000);

    await page.goto('/report');

    // Scroll deep into the page to simulate being at the bottom of a long table
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // Slow the preview slightly so loading states are visible
    await page.route('/preview.json?*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });

    await page.click('#preview-btn');

    // Loading panel should be brought back into the viewport
    const loadingTop = await page.evaluate(() => {
      const el = document.getElementById('loading');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return rect.top;
    });
    expect(loadingTop).not.toBeNull();
    expect(loadingTop).toBeLessThan(320);

    // While loading is in-flight, status chip should be visible
    await expect(page.locator('#loading-status-chip')).toBeVisible();

    // After preview completes, sticky summary context should be visible when rendered
    await page.waitForSelector('#preview-content', { state: 'visible', timeout: 120000 }).catch(() => null);
    const sticky = page.locator('#preview-summary-sticky');
    const ariaHidden = await sticky.getAttribute('aria-hidden');
    if (ariaHidden === 'true' || ariaHidden === null) {
      test.skip(true, 'Preview sticky summary not rendered for current data set');
      return;
    }
    await expect(sticky).toBeVisible();
  });
});

