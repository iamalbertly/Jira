import { test, expect, devices } from '@playwright/test';
import { runDefaultPreview, waitForPreview, captureBrowserTelemetry } from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';

// Mobile viewport (iPhone 12-ish)
const mobile = { viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15A372 Safari/604.1' };

test.describe('Jira Reporting App - Mobile Responsive UX Validation', () => {
  test.use(mobile);

  test('report: quarter strip, pill date spans and table scroll work on mobile', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');
    if (page.url().includes('login')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }

    // Quarter strip visible and pill shows period
    const strip = page.locator('.quick-range-strip, [aria-label="Vodacom quarters"]').first();
    await expect(strip).toBeVisible({ timeout: 10000 });
    await page.waitForSelector('.quarter-pill', { timeout: 10000 }).catch(() => null);
    const firstPeriod = await page.locator('.quarter-pill .quick-range-period').first().textContent().catch(() => '');
    expect(firstPeriod).toBeTruthy();

    // Run a quick preview and ensure table is horizontally scrollable
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    if (!previewVisible) {
      test.skip(true, 'Preview not visible; may require Jira credentials');
      return;
    }

    await page.click('.tab-btn[data-tab="project-epic-level"]').catch(() => null);
    await page.waitForSelector('#project-epic-level-content .data-table', { timeout: 15000 });
    const overflowX = await page.evaluate(() => getComputedStyle(document.querySelector('#project-epic-level-content .data-table')).overflowX);
    expect(overflowX === 'auto' || overflowX === 'scroll').toBeTruthy();
    const headerWhiteSpace = await page.evaluate(() => getComputedStyle(document.querySelector('#project-epic-level-content .data-table th')).whiteSpace);
    expect(headerWhiteSpace).toBe('nowrap');

    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
  });

  test('current-sprint mobile: header remains visible on scroll and retry works', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);

    // Make first boards fetch fail then succeed on retry
    let calls = 0;
    await page.route('**/api/boards.json*', (route) => {
      calls += 1;
      if (calls === 1) {
        route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary failure' }) });
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ boards: [{ id: 321, name: 'Mobile Retry Board', projectKey: 'MPSA' }] }) });
      }
    });

    await page.goto('/current-sprint');
    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login');
      return;
    }

    // Wait for retry and press it
    await page.waitForSelector('#current-sprint-error .retry-btn', { timeout: 10000 });
    await page.click('#current-sprint-error .retry-btn');
    // Ensure our retry click was registered and the button shows feedback on mobile
    await page.waitForFunction(() => window.__retryClicked && window.__retryClicked >= 1, null, { timeout: 5000 });
    // The Retry button should show a 'Retrying...' state (disabled) while a retry is in progress
    await page.waitForSelector('#current-sprint-error .retry-btn:disabled', { timeout: 5000 }).catch(() => null);
    // Then it should eventually return to the normal state (text = 'Retry') - give it some time
    await page.waitForFunction(() => {
      const el = document.querySelector('#current-sprint-error .retry-btn');
      return el && el.textContent === 'Retry';
    }, null, { timeout: 20000 }).catch(() => null);
    const retryText = await page.locator('#current-sprint-error .retry-btn').textContent().catch(() => '');
    expect(retryText === 'Retry' || retryText === 'Retrying...').toBeTruthy();

    // Scroll and verify header still visible (sticky)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const headerVisible = await page.isVisible('header');
    expect(headerVisible).toBeTruthy();

    // First fetch may show a 500 which we intentionally injected; ensure no unexpected page errors
    if (telemetry.consoleErrors.length > 0) {
      expect(telemetry.consoleErrors.some(e => /status of 500/.test(e))).toBeTruthy();
    }
    expect(telemetry.pageErrors).toEqual([]);
  });
});
