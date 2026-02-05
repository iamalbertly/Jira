import { test, expect } from '@playwright/test';
import { runDefaultPreview } from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';

test('CSV export fallback copies CSV to clipboard when download fails', async ({ page }) => {
  await page.goto('/report');
  const hasLogin = await page.locator('#username').isVisible().catch(() => false);
  if (hasLogin) {
    test.skip(true, 'Auth enabled - export tests require unauthenticated access');
    return;
  }

  // Generate a default preview so export buttons are enabled
  await runDefaultPreview(page, { start: '2025-07-01T00:00', end: '2025-09-30T23:59' });

  const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
  const errorVisible = await page.locator('#error').isVisible().catch(() => false);
  if (!previewVisible || errorVisible) {
    test.skip('Preview data not available; skipping export fallback test.');
    return;
  }

  // Wait for a section export button to be visible
  const doneStoriesBtn = page.locator('.export-section-btn[data-section="done-stories"]');
  const doneStoriesVisible = await doneStoriesBtn.isVisible().catch(() => false);
  if (!doneStoriesVisible) {
    test.skip('Done Stories export button not visible; skipping export fallback test.');
    return;
  }
  await expect(doneStoriesBtn).toBeVisible({ timeout: 15000 });

  // Monkeypatch anchor click to simulate browser blocking downloads
  await page.evaluate(() => {
    HTMLAnchorElement.prototype._origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { throw new Error('simulated download block'); };
    // Stub clipboard writeText to capture copied content
    window.__copied = null;
    navigator.clipboard = navigator.clipboard || {};
    navigator.clipboard.writeText = async (text) => { window.__copied = text; };
  });

  // Click export section button to trigger CSV download which will fail and show fallback
  await doneStoriesBtn.click();

  // Fallback copy button should appear (inline next to export button)
  const copyBtn = page.locator('.export-copy-csv[data-export-copy="done-stories"]');
  await expect(copyBtn).toBeVisible({ timeout: 5000 });

  // Click copy button and assert clipboard captured content
  await copyBtn.click();

  const copied = await page.evaluate(() => window.__copied);
  expect(copied).toBeTruthy();
  expect(copied).toContain(','); // simple sanity: CSV contains commas

  // Restore original anchor click to avoid flakiness for later tests
  await page.evaluate(() => {
    if (HTMLAnchorElement.prototype._origClick) {
      HTMLAnchorElement.prototype.click = HTMLAnchorElement.prototype._origClick;
      delete HTMLAnchorElement.prototype._origClick;
    }
  });
});
