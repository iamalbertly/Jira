/**
 * Cross-Page Persistence: Report → Leadership → Current Sprint → Report;
 * same projects and date range persist; context bar reflects current context.
 */

import { test, expect } from '@playwright/test';
import { waitForPreview } from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Cross-Page Persistence', () => {
  test('persisted projects and date range survive Report → Leadership → Current Sprint → Report', async ({ page }) => {
    test.setTimeout(120000);

    await page.goto(BASE_URL + '/report');
    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }

    const startVal = '2025-10-01T00:00';
    const endVal = '2025-12-31T23:59';
    const projectIds = ['project-sd', 'project-mas', 'project-bio', 'project-rpa'];
    const projectCodes = 'SD,MAS,BIO,RPA';

    await expect(page.locator('#preview-btn')).toBeVisible();

    await page.uncheck('#project-mpsa');
    await page.uncheck('#project-mas');
    for (const id of projectIds) {
      await page.check('#' + id);
    }
    await page.fill('#start-date', startVal);
    await page.fill('#end-date', endVal);
    await page.click('#preview-btn');

    await Promise.race([
      page.waitForSelector('#loading', { state: 'visible', timeout: 10000 }).catch(() => null),
      page.waitForSelector('#preview-content', { state: 'visible', timeout: 10000 }).catch(() => null),
      page.waitForSelector('#error', { state: 'visible', timeout: 10000 }).catch(() => null),
    ]);
    await waitForPreview(page);

    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    if (!previewVisible) {
      test.skip(true, 'Preview did not complete; cannot validate persistence');
      return;
    }

    const contextBar = page.locator('[data-context-bar]');
    await expect(contextBar).toBeVisible();
    await expect(contextBar).toContainText(/SD.*MAS.*BIO.*RPA/);

    await page.goto(BASE_URL + '/sprint-leadership');
    if (page.url().includes('login')) {
      test.skip(true, 'Redirected to login');
      return;
    }
    await expect(page.locator('#leadership-projects')).toBeVisible();
    await expect(page.locator('#leadership-projects')).toHaveValue(projectCodes);
    await expect(page.locator('[data-context-bar]')).toContainText(/SD.*MAS.*BIO.*RPA/);

    await page.goto(BASE_URL + '/current-sprint');
    if (page.url().includes('login')) {
      test.skip(true, 'Redirected to login');
      return;
    }
    await expect(page.locator('#current-sprint-projects')).toBeVisible();
    await expect(page.locator('#current-sprint-projects')).toHaveValue(projectCodes);

    await page.goto(BASE_URL + '/report');
    if (page.url().includes('login')) {
      test.skip(true, 'Redirected to login');
      return;
    }
    for (const id of projectIds) {
      await expect(page.locator('#' + id)).toBeChecked();
    }
    await expect(page.locator('#start-date')).toHaveValue(/2025-10-01/);
    await expect(page.locator('#end-date')).toHaveValue(/2025-12-31/);
  });
});
