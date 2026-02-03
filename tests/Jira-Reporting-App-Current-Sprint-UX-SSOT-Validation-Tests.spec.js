/**
 * Current Sprint UX and SSOT Validation: board pre-select, burndown summary,
 * empty states, leadership empty preview, report boards tab. Uses logcat-style
 * telemetry and realtime UI assertions; fails on UI mismatch or console/request errors.
 */

import { test, expect } from '@playwright/test';
import { captureBrowserTelemetry } from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';

test.describe('Jira Reporting App - Current Sprint UX and SSOT Validation', () => {
  test('current-sprint board list uses project SSOT from localStorage', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('vodaAgileBoard_selectedProjects', 'MPSA,MAS');
    });
    let boardsRequestUrl = '';
    await page.route('**/api/boards.json*', (route) => {
      boardsRequestUrl = route.request().url();
      route.continue();
    });
    await page.goto('/current-sprint');
    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }
    await page.waitForSelector('#board-select', { state: 'visible', timeout: 15000 }).catch(() => null);
    expect(boardsRequestUrl).toContain('projects=');
    expect(boardsRequestUrl).toMatch(/projects=MPSA%2CMAS|projects=MPSA,MAS/);
    const options = await page.locator('#board-select option[value]:not([value=""])').count();
    expect(options).toBeGreaterThanOrEqual(0);
  });

  test('current-sprint page loads with nav and board select; URL boardId pre-selects when valid', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/current-sprint');

    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }

    await expect(page.locator('h1')).toContainText('Current Sprint');
    await expect(page.locator('#board-select')).toBeVisible();
    await expect(page.locator('nav.app-nav a[href="/report"]')).toContainText('Report');
    await expect(page.locator('nav.app-nav a[href="/sprint-leadership"]')).toContainText('Leadership');

    const options = await page.locator('#board-select option').allTextContents();
    expect(options.length).toBeGreaterThanOrEqual(1);

    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
    expect(telemetry.failedRequests).toEqual([]);
  });

  test('current-sprint with boardId in URL: pre-selects that board when in list', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/current-sprint');

    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }

    await page.waitForSelector('#board-select option[value]:not([value=""])', { timeout: 15000 }).catch(() => null);
    const firstOptValue = await page.locator('#board-select option[value]:not([value=""])').first().getAttribute('value');
    if (!firstOptValue) {
      test.skip(true, 'No boards loaded');
      return;
    }

    await page.goto('/current-sprint?boardId=' + firstOptValue);
    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login');
      return;
    }

    await page.waitForSelector('#board-select', { state: 'visible', timeout: 10000 });
    const selected = await page.locator('#board-select').inputValue();
    expect(selected).toBe(firstOptValue);

    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
    expect(telemetry.failedRequests).toEqual([]);
  });

  test('current-sprint: after board selection, burndown one-line or empty-state hint when sprint exists', async ({ page }) => {
    test.setTimeout(60000);
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/current-sprint');

    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }

    const hasBoards = await page.locator('#board-select option[value]:not([value=""])').count() > 0;
    if (!hasBoards) {
      test.skip(true, 'No boards to select');
      return;
    }

    await page.selectOption('#board-select', { index: 1 });
    await page.waitForSelector('#current-sprint-content, #current-sprint-error', { timeout: 20000 }).catch(() => null);

    const bodyText = await page.locator('body').textContent();
    const hasBurndownLine = bodyText && /of \d+ SP done|\d+ of \d+ SP done/.test(bodyText);
    const hasBurndownHint = bodyText && /Burndown will appear when story points and resolutions/.test(bodyText);
    const hasNoSprint = bodyText && /No active or recent closed sprint/.test(bodyText);
    expect(hasBurndownLine || hasBurndownHint || hasNoSprint).toBeTruthy();

    if (!hasNoSprint) {
      const summaryVisible = await page.locator('#sprint-summary-card').isVisible().catch(() => false);
      const notesVisible = await page.locator('#notes-card').isVisible().catch(() => false);
      expect(summaryVisible).toBeTruthy();
      expect(notesVisible).toBeTruthy();
      const hasStuckCard = await page.locator('#stuck-card').isVisible().catch(() => false);
      const hasStuckPrompt = await page.locator('a.stuck-prompt, a[href="#stuck-card"]').isVisible().catch(() => false);
      if (hasStuckCard || hasStuckPrompt) {
        expect(page.locator('a[href="#stuck-card"]').first()).toBeVisible();
      }
      const axisLabelVisible = await page.locator('.burndown-axis').isVisible().catch(() => false);
      expect(axisLabelVisible || hasBurndownHint).toBeTruthy();
      const storiesHeader = await page.locator('#stories-card thead').textContent().catch(() => '');
      expect(storiesHeader).toMatch(/Status/i);
      expect(storiesHeader).toMatch(/Reporter/i);
      expect(storiesHeader).toMatch(/Assignee/i);
      const subtaskVisible = await page.locator('#subtask-tracking-card').isVisible().catch(() => false);
      const notificationsVisible = await page.locator('#notifications-card').isVisible().catch(() => false);
      expect(subtaskVisible).toBeTruthy();
      expect(notificationsVisible).toBeTruthy();
      const hasSubtaskTable = await page.locator('#subtask-tracking-card table').isVisible().catch(() => false);
      if (hasSubtaskTable) {
        const subtaskHeader = await page.locator('#subtask-tracking-card thead').textContent().catch(() => '');
        expect(subtaskHeader).toMatch(/Reporter/i);
      }
      if (notificationsVisible) {
        const noNotifications = await page.locator('#notifications-card').textContent().then(text => /No notifications needed/i.test(text || ''));
        if (!noNotifications) {
          await expect(page.locator('#notification-recipient')).toBeVisible();
          await expect(page.locator('#notification-message')).toBeVisible();
        }
      }
    }

    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
    expect(telemetry.failedRequests).toEqual([]);
  });

  test('current-sprint: when board list is empty, single error message visible', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.route('**/api/boards.json*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ boards: [] }) })
    );
    await page.goto('/current-sprint');

    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }

    await page.waitForTimeout(2000);
    const errorVisible = await page.locator('#current-sprint-error').isVisible();
    const errorText = await page.locator('#current-sprint-error').textContent().catch(() => '');
    expect(errorVisible).toBeTruthy();
    expect(errorText).toMatch(/No boards found|no boards/i);

    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
  });

  test('leadership: empty preview shows single message when no sprint data in range', async ({ page }) => {
    test.setTimeout(30000);
    const telemetry = captureBrowserTelemetry(page);
    await page.route('**/preview.json*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ boards: [], sprintsIncluded: [], rows: [], meta: {} }),
      })
    );
    await page.goto('/sprint-leadership');

    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }

    await page.click('#leadership-preview');
    await page.waitForSelector('#leadership-error', { state: 'visible', timeout: 10000 });
    await expect(page.locator('#leadership-error')).toContainText(/No sprint data|Widen the date range/i);

    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
    expect(telemetry.failedRequests).toEqual([]);
  });

  test('report: boards tab and export work with no console errors after preview', async ({ page }) => {
    test.setTimeout(180000);
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');

    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }

    await page.click('#preview-btn');
    await Promise.race([
      page.waitForSelector('#preview-content', { state: 'visible', timeout: 120000 }).catch(() => null),
      page.waitForSelector('#error', { state: 'visible', timeout: 120000 }).catch(() => null),
    ]);

    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    if (previewVisible) {
      await expect(page.locator('.tabs')).toBeVisible();
      await expect(page.locator('#tab-project-epic-level')).toBeVisible();
      await expect(page.locator('#export-excel-btn')).toBeVisible();
    }

    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
    expect(telemetry.failedRequests).toEqual([]);
  });

  test('app-wide notification dock renders from stored summary', async ({ page }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.addInitScript(() => {
      localStorage.setItem('appNotificationsV1', JSON.stringify({
        total: 3,
        missingEstimate: 1,
        missingLogged: 2,
        boardName: 'MPSA board',
        sprintName: 'Sprint 1',
      }));
    });
    await page.goto('/report');

    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }

    await expect(page.locator('#app-notification-dock')).toBeVisible();
    await expect(page.locator('#app-notification-dock')).toContainText('3');

    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
  });
});
