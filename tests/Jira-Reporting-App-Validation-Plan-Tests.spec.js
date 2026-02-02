import { test, expect } from '@playwright/test';

const IGNORE_CONSOLE_ERRORS = [
  'Failed to load resource: the server responded with a status of 404 (Not Found)'
];

const IGNORE_REQUEST_PATTERNS = [
  /\/favicon\.ico/i
];

function captureBrowserTelemetry(page) {
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!IGNORE_CONSOLE_ERRORS.includes(text)) {
        consoleErrors.push(text);
      }
    }
  });

  page.on('pageerror', error => {
    pageErrors.push(error.message);
  });

  page.on('requestfailed', request => {
    const url = request.url();
    const shouldIgnore = IGNORE_REQUEST_PATTERNS.some(pattern => pattern.test(url));
    if (!shouldIgnore) {
      failedRequests.push({
        url,
        method: request.method(),
        failure: request.failure()?.errorText || 'Unknown failure'
      });
    }
  });

  return { consoleErrors, pageErrors, failedRequests };
}

test.describe('Jira Reporting App - Validation Plan (UI + Telemetry)', () => {
  test('report page loads with expected controls and no console errors', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);

    await page.goto('/report');

    await expect(page.locator('h1')).toContainText('VodaAgileBoard');
    await expect(page.locator('#project-mpsa')).toBeVisible();
    await expect(page.locator('#project-mas')).toBeVisible();
    await expect(page.locator('#start-date')).toBeVisible();
    await expect(page.locator('#end-date')).toBeVisible();
    await expect(page.locator('#preview-btn')).toBeVisible();

    // Tabs are present in the DOM but hidden until preview is generated
    await expect(page.locator('.tabs')).toHaveCount(1);
    await expect(page.locator('#preview-content')).toBeHidden();

    // Export buttons should be present (may be disabled before preview)
    await expect(page.locator('#export-excel-btn')).toBeVisible();
    await expect(page.locator('#export-dropdown-trigger')).toBeVisible();

    // Validate no browser errors on load (ignoring favicon noise)
    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
    expect(telemetry.failedRequests).toEqual([]);
  });

  test('preview button disables when no projects are selected', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);

    await page.goto('/report');

    await page.uncheck('#project-mpsa');
    await page.uncheck('#project-mas');

    const previewButton = page.locator('#preview-btn');
    await expect(previewButton).toBeDisabled();
    await expect(previewButton).toHaveAttribute('title', /select at least one project/i);

    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
  });

  test('preview button validates date ordering and shows error state', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);

    await page.goto('/report');

    await page.check('#project-mpsa');
    await page.fill('#start-date', '2025-09-30T23:59');
    await page.fill('#end-date', '2025-07-01T00:00');

    await page.click('#preview-btn');

    const errorBanner = page.locator('#error');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText('Start date must be before end date');

    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
  });
});
