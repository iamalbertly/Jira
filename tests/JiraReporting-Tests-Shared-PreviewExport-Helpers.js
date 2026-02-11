/**
 * SSOT for preview, export, and browser telemetry test flows. Use in E2E, Excel, UX, Column Tooltip, Refactor Validation, Validation Plan, and UX Trust specs.
 */

export const IGNORE_CONSOLE_ERRORS = [
  'Failed to load resource: the server responded with a status of 404 (Not Found)',
  'Failed to load resource: net::ERR_FAILED',
  'ResizeObserver loop limit exceeded',
  'The operation is insecure.',
  'AbortError: signal is aborted without reason',
  'signal is aborted without reason',
  'Receiving end does not exist',
  'Unchecked runtime.lastError'
];

export const IGNORE_REQUEST_PATTERNS = [
  /\/favicon\.ico/i
];

/** Shared timeout for Excel export download wait (ms). Use in Server Errors and Excel Export specs. */
export const EXCEL_DOWNLOAD_TIMEOUT_MS = 180000;

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
 * Asserts no critical telemetry: failed requests (after ignore patterns and optional preview abort),
 * page errors, and unexpected console errors. Use after captureBrowserTelemetry in specs.
 * @param {{ consoleErrors: string[], pageErrors: string[], failedRequests: Array<{ url: string }> }} telemetry
 * @param {{ excludePreviewAbort?: boolean }} options - set excludePreviewAbort: true when test aborts preview.json (error-path tests)
 */
export function assertTelemetryClean(telemetry, options = {}) {
  const { excludePreviewAbort = false } = options;
  const isAbortFailure = (failureText = '') => /ERR_ABORTED|NS_BINDING_ABORTED|aborted/i.test(String(failureText || ''));
  const criticalFailures = (telemetry.failedRequests || []).filter(
    (r) => !IGNORE_REQUEST_PATTERNS.some((p) => p.test(r.url))
      && (!excludePreviewAbort || !r.url.includes('preview.json'))
      && !isAbortFailure(r.failure)
  );
  const unexpectedConsole = (telemetry.consoleErrors || []).filter(
    (t) => !IGNORE_CONSOLE_ERRORS.some((ignored) => t === ignored || t.includes(ignored))
  );
  if (telemetry.pageErrors && telemetry.pageErrors.length > 0) {
    throw new Error(`Expected no page errors. Got: ${JSON.stringify(telemetry.pageErrors)}`);
  }
  if (unexpectedConsole.length > 0) {
    throw new Error(`Unexpected console errors: ${JSON.stringify(unexpectedConsole)}`);
  }
  if (criticalFailures.length > 0) {
    throw new Error(`Critical request failures: ${JSON.stringify(criticalFailures.map((r) => r.url))}`);
  }
}

/**
 * Waits for preview to complete (preview content or error visible, loading hidden).
 * @param {import('@playwright/test').Page} page
 * @param {{ timeout?: number }} options - optional timeout (default 120000 ms; increase for very heavy previews)
 */
export async function waitForPreview(page, options = {}) {
  const timeout = options.timeout ?? 120000;
  // Wait briefly for either preview content or error to appear
  await Promise.race([
    page.waitForSelector('#preview-content', { state: 'visible', timeout }).catch(() => null),
    page.waitForSelector('#error', { state: 'visible', timeout }).catch(() => null),
  ]);

  // If loading is visible, wait for it to hide but with a shorter cap
  const loadingVisible = await page.locator('#loading').isVisible().catch(() => false);
  if (loadingVisible) {
    try {
      await page.waitForSelector('#loading', { state: 'hidden', timeout: 45000 });
    } catch (err) {
      // If loading remained visible beyond our cap, bail out so tests don't hang
      // Instead, we'll return to the caller which can decide to skip or assert.
      return;
    }
  }

  const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
  const errorVisible = await page.locator('#error').isVisible().catch(() => false);

  if (!previewVisible && !errorVisible) {
    await Promise.race([
      page.waitForSelector('#preview-content', { state: 'visible', timeout: 10000 }).catch(() => null),
      page.waitForSelector('#error', { state: 'visible', timeout: 10000 }).catch(() => null),
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
  const previewBtn = page.locator('#preview-btn');
  await previewBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null);
  await page.waitForTimeout(150);
  const isDisabled = await previewBtn.isDisabled().catch(() => false);
  if (!isDisabled) {
    await previewBtn.click().catch(() => null);
  }

  await Promise.race([
    page.waitForSelector('#loading', { state: 'visible', timeout: 10000 }).catch(() => null),
    page.waitForSelector('#preview-content', { state: 'visible', timeout: 10000 }).catch(() => null),
    page.waitForSelector('#error', { state: 'visible', timeout: 10000 }).catch(() => null),
  ]);

  await waitForPreview(page);
}
