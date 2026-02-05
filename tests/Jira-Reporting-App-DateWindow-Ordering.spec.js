import { test, expect } from '@playwright/test';
import { runDefaultPreview } from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';

test('Date windows are ordered most-recent-first in quarter strip', async ({ page }) => {
  await page.goto('/report');
  await runDefaultPreview(page);

  // Wait for quarter strip to be populated
  const pills = page.locator('.quarter-strip-inner .quarter-pill');
  await expect(pills.first()).toBeVisible({ timeout: 10000 });

  const starts = await pills.evaluateAll(nodes => nodes.map(n => n.getAttribute('data-start')));
  const timestamps = starts.map(s => new Date(s).getTime());
  for (let i = 0; i < timestamps.length - 1; i++) {
    expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1]);
  }
});