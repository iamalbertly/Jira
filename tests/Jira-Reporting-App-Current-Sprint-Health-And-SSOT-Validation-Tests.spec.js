import { test, expect } from '@playwright/test';
import { captureBrowserTelemetry, assertTelemetryClean } from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';

test.describe('Current Sprint Health & SSOT UX Validation', () => {
  test('current sprint header shows health outcome line', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/current-sprint');

    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login or home; auth may be required');
      return;
    }

    await expect(page.locator('h1')).toContainText('Current Sprint');
    const outcome = page.locator('.current-sprint-outcome-line');
    await expect(outcome).toBeVisible();
    const text = await outcome.textContent();
    expect(text || '').toMatch(/Sprint health:/i);

    assertTelemetryClean(telemetry);
  });

  test('no-active-sprint empty state, when present, explains next steps', async ({ page }) => {
    await page.goto('/current-sprint');
    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login or home; auth may be required');
      return;
    }

    const bodyText = (await page.locator('body').textContent()) || '';
    if (!/No active sprint on this board/i.test(bodyText)) {
      test.skip(true, 'No "No active sprint" empty state visible for current data set');
      return;
    }

    expect(bodyText).toMatch(/Try the previous sprint tab/i);
  });

  test('projects SSOT sync banner appears when Report projects change via storage event', async ({ page }) => {
    await page.goto('/current-sprint');
    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login or home; auth may be required');
      return;
    }

    // Simulate Report updating the shared projects SSOT key
    await page.evaluate(() => {
      const key = 'vodaAgileBoard_selectedProjects';
      localStorage.setItem(key, 'MPSA,MAS');
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: 'MPSA,MAS' }));
    });

    const hint = page.locator('#current-sprint-project-hint');
    await expect(hint).toBeVisible();
    const text = await hint.textContent();
    expect(text || '').toMatch(/Projects updated to match Report; reloading boards/i);
  });
});

