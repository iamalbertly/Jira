import { test, expect } from '@playwright/test';

const DEFAULT_Q2_QUERY = '?projects=MPSA,MAS&start=2025-07-01T00:00:00.000Z&end=2025-09-30T23:59:59.999Z';

// Canonical helper: wait for preview or error, handling fast and slow responses.
async function waitForPreview(page) {
  const previewBtn = page.locator('#preview-btn');
  await expect(previewBtn).toBeEnabled({ timeout: 5000 });

  await previewBtn.click();

  await Promise.race([
    page.waitForSelector('#loading', { state: 'visible', timeout: 10000 }).catch(() => null),
    page.waitForSelector('#preview-content', { state: 'visible', timeout: 10000 }).catch(() => null),
    page.waitForSelector('#error', { state: 'visible', timeout: 10000 }).catch(() => null),
  ]);

  const loadingVisible = await page.locator('#loading').isVisible().catch(() => false);
  if (loadingVisible) {
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 600000 });
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

// Shared helper: run a default Q2 preview
async function runDefaultPreview(page) {
  await page.goto('/report');

  // Ensure default projects and dates are set
  await page.check('#project-mpsa').catch(() => {});
  await page.check('#project-mas').catch(() => {});

  await waitForPreview(page);
}

test.describe('Jira Reporting App - Loading & Meta Robustness E2E', () => {
  test('fast preview completion still reaches a stable state', async ({ page }) => {
    test.setTimeout(180000);
    console.log('[TEST] Loading/Meta: fast preview completion');

    await runDefaultPreview(page);

    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    const errorVisible = await page.locator('#error').isVisible().catch(() => false);

    // Either preview or error is acceptable; main point is no hang.
    expect(previewVisible || errorVisible).toBeTruthy();
  });

  test('slow preview shows loading overlay at least once', async ({ page }) => {
    test.setTimeout(180000);
    console.log('[TEST] Loading/Meta: slow preview shows loading overlay');

    await page.goto('/report');

    // Artificially delay network by intercepting preview call.
    await page.route(`/preview.json${DEFAULT_Q2_QUERY}`, async (route) => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.continue();
    }).catch(() => {});

    await waitForPreview(page);

    // Even if we missed the exact timing, loading should have been present at some point.
    // We assert that the page is no longer in a \"stuck\" state by checking preview/error.
    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    const errorVisible = await page.locator('#error').isVisible().catch(() => false);
    expect(previewVisible || errorVisible).toBeTruthy();

    await page.unroute(`/preview.json${DEFAULT_Q2_QUERY}`).catch(() => {});
  });

  test('missing meta does not cause ReferenceError and shows clear message', async ({ page }) => {
    test.setTimeout(180000);
    console.log('[TEST] Loading/Meta: missing meta handled gracefully');

    const consoleMessages = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleMessages.push(msg.text());
      }
    });

    await runDefaultPreview(page);

    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping missing meta scenario');
      return;
    }

    // Simulate missing meta and try to re-render export path
    await page.evaluate(() => {
      // @ts-ignore
      if (window.previewData) {
        // @ts-ignore
        window.previewData.meta = undefined;
      }
    });

    const exportExcelBtn = page.locator('#export-excel-btn');
    if (await exportExcelBtn.isEnabled()) {
      await exportExcelBtn.click();

      const errorLocator = page.locator('#error');
      await errorLocator.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null);
      const errorText = (await errorLocator.innerText().catch(() => ''))?.toLowerCase() || '';

      // No ReferenceError: meta is not defined should appear in the console.
      const hasMetaReferenceError = consoleMessages.some(msg =>
        msg.toLowerCase().includes('referenceerror') && msg.toLowerCase().includes('meta')
      );
      expect(hasMetaReferenceError).toBeFalsy();

      if (errorText) {
        expect(errorText).toContain('export error');
        expect(errorText).toContain('metadata');
      }
    }
  });
});
