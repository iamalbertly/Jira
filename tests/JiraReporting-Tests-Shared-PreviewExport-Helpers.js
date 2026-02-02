/**
 * SSOT for preview, export, and browser telemetry test flows. Use in E2E, Excel, UX, Column Tooltip, Refactor Validation, Validation Plan, and UX Trust specs.
 */

export const IGNORE_CONSOLE_ERRORS = [
  'Failed to load resource: the server responded with a status of 404 (Not Found)'
];

export const IGNORE_REQUEST_PATTERNS = [
  /\/favicon\.ico/i
];

/**
 * Captures browser console errors, page errors, and failed requests for assertion in tests.
 * @param {import('@playwright/test').Page} page
 * @returns {{ consoleErrors: string[], pageErrors: string[], failedRequests: Array<{ url: string, method: string, failure: string }> }}
 */
export function captureBrowserTelemetry(page) {
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

/**
 * Waits for preview to complete (preview content or error visible, loading hidden).
 * @param {import('@playwright/test').Page} page
 * @param {{ timeout?: number }} options - optional timeout (default 120000)
 */
export async function waitForPreview(page, options = {}) {
  const timeout = options.timeout ?? 120000;
  await Promise.race([
    page.waitForSelector('#preview-content', { state: 'visible', timeout }).catch(() => null),
    page.waitForSelector('#error', { state: 'visible', timeout }).catch(() => null),
  ]);
  const loadingVisible = await page.locator('#loading').isVisible().catch(() => false);
  if (loadingVisible) {
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 600000 });
  }
  const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
  const errorVisible = await page.locator('#error').isVisible().catch(() => false);
  if (!previewVisible && !errorVisible) {
    await Promise.race([
      page.waitForSelector('#preview-content', { state: 'visible', timeout: 10000 }),
      page.waitForSelector('#error', { state: 'visible', timeout: 10000 }),
    ]);
  }
}

/**
 * Runs default preview: go to /report, set projects and date window, click Preview, wait for result.
 * @param {import('@playwright/test').Page} page
 * @param {{ projects?: string[], start?: string, end?: string }} overrides - optional filter overrides
 */
export async function runDefaultPreview(page, overrides = {}) {
  const {
    projects = ['MPSA', 'MAS'],
    start = '2025-07-01T00:00',
    end = '2025-09-30T23:59',
  } = overrides;

  await page.goto('/report');

  const mpsaChecked = projects.includes('MPSA');
  const masChecked = projects.includes('MAS');
  if (mpsaChecked) await page.check('#project-mpsa');
  else await page.uncheck('#project-mpsa');
  if (masChecked) await page.check('#project-mas');
  else await page.uncheck('#project-mas');

  await page.fill('#start-date', start);
  await page.fill('#end-date', end);
  await page.click('#preview-btn');

  await Promise.race([
    page.waitForSelector('#loading', { state: 'visible', timeout: 10000 }).catch(() => null),
    page.waitForSelector('#preview-content', { state: 'visible', timeout: 10000 }).catch(() => null),
    page.waitForSelector('#error', { state: 'visible', timeout: 10000 }).catch(() => null),
  ]);

  await waitForPreview(page);
}
