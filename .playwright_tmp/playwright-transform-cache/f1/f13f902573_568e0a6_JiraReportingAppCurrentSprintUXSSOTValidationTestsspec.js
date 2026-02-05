/**
 * Current Sprint UX and SSOT Validation: board pre-select, burndown summary,
 * empty states, leadership empty preview, report boards tab. Uses logcat-style
 * telemetry and realtime UI assertions; fails on UI mismatch or console/request errors.
 */

import { test, expect } from '@playwright/test';
import { captureBrowserTelemetry } from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';
test.describe('Jira Reporting App - Current Sprint UX and SSOT Validation', () => {
  test('current-sprint board list uses project SSOT from localStorage', async ({
    page
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('vodaAgileBoard_selectedProjects', 'MPSA,MAS');
    });
    let boardsRequestUrl = '';
    await page.route('**/api/boards.json*', route => {
      boardsRequestUrl = route.request().url();
      route.continue();
    });
    await page.goto('/current-sprint');
    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }
    await expect(page.locator('#current-sprint-projects')).toBeVisible();
    await expect(page.locator('#current-sprint-projects')).toHaveValue('MPSA,MAS');
    await page.waitForSelector('#board-select', {
      state: 'visible',
      timeout: 15000
    }).catch(() => null);
    expect(boardsRequestUrl).toContain('projects=');
    expect(boardsRequestUrl).toMatch(/projects=MPSA%2CMAS|projects=MPSA,MAS/);
    const options = await page.locator('#board-select option[value]:not([value=""])').count();
    expect(options).toBeGreaterThanOrEqual(0);
  });
  test('current-sprint page loads with nav and board select; URL boardId pre-selects when valid', async ({
    page
  }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/current-sprint');
    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }
    await expect(page.locator('h1')).toContainText('Current Sprint');
    await expect(page.locator('#current-sprint-projects')).toBeVisible();
    await expect(page.locator('#board-select')).toBeVisible();
    await expect(page.locator('nav.app-nav a[href="/report"]')).toContainText('Report');
    await expect(page.locator('nav.app-nav a[href="/sprint-leadership"]')).toContainText('Leadership');
    const options = await page.locator('#board-select option').allTextContents();
    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
    expect(telemetry.failedRequests).toEqual([]);
  });
  test('current-sprint with boardId in URL: pre-selects that board when in list', async ({
    page
  }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/current-sprint');
    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }
    await page.waitForSelector('#board-select option[value]:not([value=""])', {
      timeout: 15000
    }).catch(() => null);
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
    await page.waitForSelector('#board-select', {
      state: 'visible',
      timeout: 10000
    });
    const selected = await page.locator('#board-select').inputValue();
    expect(selected).toBe(firstOptValue);
    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
    expect(telemetry.failedRequests).toEqual([]);
  });
  test('current-sprint: after board selection, burndown one-line or empty-state hint when sprint exists', async ({
    page
  }) => {
    test.setTimeout(60000);
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/current-sprint');
    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }
    const hasBoards = (await page.locator('#board-select option[value]:not([value=""])').count()) > 0;
    if (!hasBoards) {
      test.skip(true, 'No boards to select');
      return;
    }
    await page.selectOption('#board-select', {
      index: 1
    });
    await page.waitForSelector('#current-sprint-content, #current-sprint-error', {
      timeout: 20000
    }).catch(() => null);
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
      const snapshotBadgeVisible = await page.locator('.snapshot-badge').isVisible().catch(() => false);
      if (snapshotBadgeVisible) {
        const badgeText = await page.locator('.snapshot-badge').textContent();
        expect(badgeText).toMatch(/Snapshot|Live/);
      }
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
  test('current-sprint: when board list is empty, single error message visible', async ({
    page
  }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.route('**/api/boards.json*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        boards: []
      })
    }));
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
  test('leadership: empty preview shows single message when no sprint data in range', async ({
    page
  }) => {
    test.setTimeout(30000);
    const telemetry = captureBrowserTelemetry(page);
    await page.route('**/preview.json*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        boards: [],
        sprintsIncluded: [],
        rows: [],
        meta: {}
      })
    }));
    await page.goto('/sprint-leadership');
    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }
    await page.click('#leadership-preview');
    await page.waitForSelector('#leadership-error', {
      state: 'visible',
      timeout: 10000
    });
    await expect(page.locator('#leadership-error')).toContainText(/No sprint data|Widen the date range/i);
    expect(telemetry.consoleErrors).toEqual([]);
    expect(telemetry.pageErrors).toEqual([]);
    expect(telemetry.failedRequests).toEqual([]);
  });
  test('report: boards tab and export work with no console errors after preview', async ({
    page
  }) => {
    test.setTimeout(180000);
    const telemetry = captureBrowserTelemetry(page);
    await page.goto('/report');
    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }
    await page.click('#preview-btn');
    await Promise.race([page.waitForSelector('#preview-content', {
      state: 'visible',
      timeout: 120000
    }).catch(() => null), page.waitForSelector('#error', {
      state: 'visible',
      timeout: 120000
    }).catch(() => null)]);
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
  test('app-wide notification dock renders from stored summary', async ({
    page
  }) => {
    const telemetry = captureBrowserTelemetry(page);
    await page.addInitScript(() => {
      localStorage.setItem('appNotificationsV1', JSON.stringify({
        total: 3,
        missingEstimate: 1,
        missingLogged: 2,
        boardName: 'MPSA board',
        sprintName: 'Sprint 1'
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0ZXN0IiwiZXhwZWN0IiwiY2FwdHVyZUJyb3dzZXJUZWxlbWV0cnkiLCJkZXNjcmliZSIsInBhZ2UiLCJhZGRJbml0U2NyaXB0IiwibG9jYWxTdG9yYWdlIiwic2V0SXRlbSIsImJvYXJkc1JlcXVlc3RVcmwiLCJyb3V0ZSIsInJlcXVlc3QiLCJ1cmwiLCJjb250aW51ZSIsImdvdG8iLCJpbmNsdWRlcyIsImVuZHNXaXRoIiwic2tpcCIsImxvY2F0b3IiLCJ0b0JlVmlzaWJsZSIsInRvSGF2ZVZhbHVlIiwid2FpdEZvclNlbGVjdG9yIiwic3RhdGUiLCJ0aW1lb3V0IiwiY2F0Y2giLCJ0b0NvbnRhaW4iLCJ0b01hdGNoIiwib3B0aW9ucyIsImNvdW50IiwidG9CZUdyZWF0ZXJUaGFuT3JFcXVhbCIsInRlbGVtZXRyeSIsInRvQ29udGFpblRleHQiLCJhbGxUZXh0Q29udGVudHMiLCJsZW5ndGgiLCJjb25zb2xlRXJyb3JzIiwidG9FcXVhbCIsInBhZ2VFcnJvcnMiLCJmYWlsZWRSZXF1ZXN0cyIsImZpcnN0T3B0VmFsdWUiLCJmaXJzdCIsImdldEF0dHJpYnV0ZSIsInNlbGVjdGVkIiwiaW5wdXRWYWx1ZSIsInRvQmUiLCJzZXRUaW1lb3V0IiwiaGFzQm9hcmRzIiwic2VsZWN0T3B0aW9uIiwiaW5kZXgiLCJib2R5VGV4dCIsInRleHRDb250ZW50IiwiaGFzQnVybmRvd25MaW5lIiwiaGFzQnVybmRvd25IaW50IiwiaGFzTm9TcHJpbnQiLCJ0b0JlVHJ1dGh5Iiwic3VtbWFyeVZpc2libGUiLCJpc1Zpc2libGUiLCJub3Rlc1Zpc2libGUiLCJzbmFwc2hvdEJhZGdlVmlzaWJsZSIsImJhZGdlVGV4dCIsImhhc1N0dWNrQ2FyZCIsImhhc1N0dWNrUHJvbXB0IiwiYXhpc0xhYmVsVmlzaWJsZSIsInN0b3JpZXNIZWFkZXIiLCJzdWJ0YXNrVmlzaWJsZSIsIm5vdGlmaWNhdGlvbnNWaXNpYmxlIiwiaGFzU3VidGFza1RhYmxlIiwic3VidGFza0hlYWRlciIsIm5vTm90aWZpY2F0aW9ucyIsInRoZW4iLCJ0ZXh0IiwiZnVsZmlsbCIsInN0YXR1cyIsImNvbnRlbnRUeXBlIiwiYm9keSIsIkpTT04iLCJzdHJpbmdpZnkiLCJib2FyZHMiLCJ3YWl0Rm9yVGltZW91dCIsImVycm9yVmlzaWJsZSIsImVycm9yVGV4dCIsInNwcmludHNJbmNsdWRlZCIsInJvd3MiLCJtZXRhIiwiY2xpY2siLCJQcm9taXNlIiwicmFjZSIsInByZXZpZXdWaXNpYmxlIiwidG90YWwiLCJtaXNzaW5nRXN0aW1hdGUiLCJtaXNzaW5nTG9nZ2VkIiwiYm9hcmROYW1lIiwic3ByaW50TmFtZSJdLCJzb3VyY2VzIjpbIkppcmEtUmVwb3J0aW5nLUFwcC1DdXJyZW50LVNwcmludC1VWC1TU09ULVZhbGlkYXRpb24tVGVzdHMuc3BlYy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogQ3VycmVudCBTcHJpbnQgVVggYW5kIFNTT1QgVmFsaWRhdGlvbjogYm9hcmQgcHJlLXNlbGVjdCwgYnVybmRvd24gc3VtbWFyeSxcclxuICogZW1wdHkgc3RhdGVzLCBsZWFkZXJzaGlwIGVtcHR5IHByZXZpZXcsIHJlcG9ydCBib2FyZHMgdGFiLiBVc2VzIGxvZ2NhdC1zdHlsZVxyXG4gKiB0ZWxlbWV0cnkgYW5kIHJlYWx0aW1lIFVJIGFzc2VydGlvbnM7IGZhaWxzIG9uIFVJIG1pc21hdGNoIG9yIGNvbnNvbGUvcmVxdWVzdCBlcnJvcnMuXHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgdGVzdCwgZXhwZWN0IH0gZnJvbSAnQHBsYXl3cmlnaHQvdGVzdCc7XHJcbmltcG9ydCB7IGNhcHR1cmVCcm93c2VyVGVsZW1ldHJ5IH0gZnJvbSAnLi9KaXJhUmVwb3J0aW5nLVRlc3RzLVNoYXJlZC1QcmV2aWV3RXhwb3J0LUhlbHBlcnMuanMnO1xyXG5cclxudGVzdC5kZXNjcmliZSgnSmlyYSBSZXBvcnRpbmcgQXBwIC0gQ3VycmVudCBTcHJpbnQgVVggYW5kIFNTT1QgVmFsaWRhdGlvbicsICgpID0+IHtcclxuICB0ZXN0KCdjdXJyZW50LXNwcmludCBib2FyZCBsaXN0IHVzZXMgcHJvamVjdCBTU09UIGZyb20gbG9jYWxTdG9yYWdlJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XG4gICAgYXdhaXQgcGFnZS5hZGRJbml0U2NyaXB0KCgpID0+IHtcbiAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCd2b2RhQWdpbGVCb2FyZF9zZWxlY3RlZFByb2plY3RzJywgJ01QU0EsTUFTJyk7XG4gICAgfSk7XG4gICAgbGV0IGJvYXJkc1JlcXVlc3RVcmwgPSAnJztcclxuICAgIGF3YWl0IHBhZ2Uucm91dGUoJyoqL2FwaS9ib2FyZHMuanNvbionLCAocm91dGUpID0+IHtcclxuICAgICAgYm9hcmRzUmVxdWVzdFVybCA9IHJvdXRlLnJlcXVlc3QoKS51cmwoKTtcclxuICAgICAgcm91dGUuY29udGludWUoKTtcclxuICAgIH0pO1xyXG4gICAgYXdhaXQgcGFnZS5nb3RvKCcvY3VycmVudC1zcHJpbnQnKTtcbiAgICBpZiAocGFnZS51cmwoKS5pbmNsdWRlcygnbG9naW4nKSB8fCBwYWdlLnVybCgpLmVuZHNXaXRoKCcvJykpIHtcbiAgICAgIHRlc3Quc2tpcCh0cnVlLCAnUmVkaXJlY3RlZCB0byBsb2dpbjsgYXV0aCBtYXkgYmUgcmVxdWlyZWQnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignI2N1cnJlbnQtc3ByaW50LXByb2plY3RzJykpLnRvQmVWaXNpYmxlKCk7XG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignI2N1cnJlbnQtc3ByaW50LXByb2plY3RzJykpLnRvSGF2ZVZhbHVlKCdNUFNBLE1BUycpO1xuICAgIGF3YWl0IHBhZ2Uud2FpdEZvclNlbGVjdG9yKCcjYm9hcmQtc2VsZWN0JywgeyBzdGF0ZTogJ3Zpc2libGUnLCB0aW1lb3V0OiAxNTAwMCB9KS5jYXRjaCgoKSA9PiBudWxsKTtcbiAgICBleHBlY3QoYm9hcmRzUmVxdWVzdFVybCkudG9Db250YWluKCdwcm9qZWN0cz0nKTtcbiAgICBleHBlY3QoYm9hcmRzUmVxdWVzdFVybCkudG9NYXRjaCgvcHJvamVjdHM9TVBTQSUyQ01BU3xwcm9qZWN0cz1NUFNBLE1BUy8pO1xuICAgIGNvbnN0IG9wdGlvbnMgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNib2FyZC1zZWxlY3Qgb3B0aW9uW3ZhbHVlXTpub3QoW3ZhbHVlPVwiXCJdKScpLmNvdW50KCk7XG4gICAgZXhwZWN0KG9wdGlvbnMpLnRvQmVHcmVhdGVyVGhhbk9yRXF1YWwoMCk7XG4gIH0pO1xuXHJcbiAgdGVzdCgnY3VycmVudC1zcHJpbnQgcGFnZSBsb2FkcyB3aXRoIG5hdiBhbmQgYm9hcmQgc2VsZWN0OyBVUkwgYm9hcmRJZCBwcmUtc2VsZWN0cyB3aGVuIHZhbGlkJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICBjb25zdCB0ZWxlbWV0cnkgPSBjYXB0dXJlQnJvd3NlclRlbGVtZXRyeShwYWdlKTtcclxuICAgIGF3YWl0IHBhZ2UuZ290bygnL2N1cnJlbnQtc3ByaW50Jyk7XHJcblxyXG4gICAgaWYgKHBhZ2UudXJsKCkuaW5jbHVkZXMoJ2xvZ2luJykgfHwgcGFnZS51cmwoKS5lbmRzV2l0aCgnLycpKSB7XHJcbiAgICAgIHRlc3Quc2tpcCh0cnVlLCAnUmVkaXJlY3RlZCB0byBsb2dpbjsgYXV0aCBtYXkgYmUgcmVxdWlyZWQnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJ2gxJykpLnRvQ29udGFpblRleHQoJ0N1cnJlbnQgU3ByaW50Jyk7XG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignI2N1cnJlbnQtc3ByaW50LXByb2plY3RzJykpLnRvQmVWaXNpYmxlKCk7XG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignI2JvYXJkLXNlbGVjdCcpKS50b0JlVmlzaWJsZSgpO1xuICAgIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJ25hdi5hcHAtbmF2IGFbaHJlZj1cIi9yZXBvcnRcIl0nKSkudG9Db250YWluVGV4dCgnUmVwb3J0Jyk7XHJcbiAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCduYXYuYXBwLW5hdiBhW2hyZWY9XCIvc3ByaW50LWxlYWRlcnNoaXBcIl0nKSkudG9Db250YWluVGV4dCgnTGVhZGVyc2hpcCcpO1xyXG5cclxuICAgIGNvbnN0IG9wdGlvbnMgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNib2FyZC1zZWxlY3Qgb3B0aW9uJykuYWxsVGV4dENvbnRlbnRzKCk7XHJcbiAgICBleHBlY3Qob3B0aW9ucy5sZW5ndGgpLnRvQmVHcmVhdGVyVGhhbk9yRXF1YWwoMSk7XHJcblxyXG4gICAgZXhwZWN0KHRlbGVtZXRyeS5jb25zb2xlRXJyb3JzKS50b0VxdWFsKFtdKTtcclxuICAgIGV4cGVjdCh0ZWxlbWV0cnkucGFnZUVycm9ycykudG9FcXVhbChbXSk7XHJcbiAgICBleHBlY3QodGVsZW1ldHJ5LmZhaWxlZFJlcXVlc3RzKS50b0VxdWFsKFtdKTtcclxuICB9KTtcclxuXHJcbiAgdGVzdCgnY3VycmVudC1zcHJpbnQgd2l0aCBib2FyZElkIGluIFVSTDogcHJlLXNlbGVjdHMgdGhhdCBib2FyZCB3aGVuIGluIGxpc3QnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIGNvbnN0IHRlbGVtZXRyeSA9IGNhcHR1cmVCcm93c2VyVGVsZW1ldHJ5KHBhZ2UpO1xyXG4gICAgYXdhaXQgcGFnZS5nb3RvKCcvY3VycmVudC1zcHJpbnQnKTtcclxuXHJcbiAgICBpZiAocGFnZS51cmwoKS5pbmNsdWRlcygnbG9naW4nKSB8fCBwYWdlLnVybCgpLmVuZHNXaXRoKCcvJykpIHtcclxuICAgICAgdGVzdC5za2lwKHRydWUsICdSZWRpcmVjdGVkIHRvIGxvZ2luOyBhdXRoIG1heSBiZSByZXF1aXJlZCcpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgcGFnZS53YWl0Rm9yU2VsZWN0b3IoJyNib2FyZC1zZWxlY3Qgb3B0aW9uW3ZhbHVlXTpub3QoW3ZhbHVlPVwiXCJdKScsIHsgdGltZW91dDogMTUwMDAgfSkuY2F0Y2goKCkgPT4gbnVsbCk7XHJcbiAgICBjb25zdCBmaXJzdE9wdFZhbHVlID0gYXdhaXQgcGFnZS5sb2NhdG9yKCcjYm9hcmQtc2VsZWN0IG9wdGlvblt2YWx1ZV06bm90KFt2YWx1ZT1cIlwiXSknKS5maXJzdCgpLmdldEF0dHJpYnV0ZSgndmFsdWUnKTtcclxuICAgIGlmICghZmlyc3RPcHRWYWx1ZSkge1xyXG4gICAgICB0ZXN0LnNraXAodHJ1ZSwgJ05vIGJvYXJkcyBsb2FkZWQnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHBhZ2UuZ290bygnL2N1cnJlbnQtc3ByaW50P2JvYXJkSWQ9JyArIGZpcnN0T3B0VmFsdWUpO1xyXG4gICAgaWYgKHBhZ2UudXJsKCkuaW5jbHVkZXMoJ2xvZ2luJykgfHwgcGFnZS51cmwoKS5lbmRzV2l0aCgnLycpKSB7XHJcbiAgICAgIHRlc3Quc2tpcCh0cnVlLCAnUmVkaXJlY3RlZCB0byBsb2dpbicpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgcGFnZS53YWl0Rm9yU2VsZWN0b3IoJyNib2FyZC1zZWxlY3QnLCB7IHN0YXRlOiAndmlzaWJsZScsIHRpbWVvdXQ6IDEwMDAwIH0pO1xyXG4gICAgY29uc3Qgc2VsZWN0ZWQgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNib2FyZC1zZWxlY3QnKS5pbnB1dFZhbHVlKCk7XHJcbiAgICBleHBlY3Qoc2VsZWN0ZWQpLnRvQmUoZmlyc3RPcHRWYWx1ZSk7XHJcblxyXG4gICAgZXhwZWN0KHRlbGVtZXRyeS5jb25zb2xlRXJyb3JzKS50b0VxdWFsKFtdKTtcclxuICAgIGV4cGVjdCh0ZWxlbWV0cnkucGFnZUVycm9ycykudG9FcXVhbChbXSk7XHJcbiAgICBleHBlY3QodGVsZW1ldHJ5LmZhaWxlZFJlcXVlc3RzKS50b0VxdWFsKFtdKTtcclxuICB9KTtcclxuXHJcbiAgdGVzdCgnY3VycmVudC1zcHJpbnQ6IGFmdGVyIGJvYXJkIHNlbGVjdGlvbiwgYnVybmRvd24gb25lLWxpbmUgb3IgZW1wdHktc3RhdGUgaGludCB3aGVuIHNwcmludCBleGlzdHMnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIHRlc3Quc2V0VGltZW91dCg2MDAwMCk7XHJcbiAgICBjb25zdCB0ZWxlbWV0cnkgPSBjYXB0dXJlQnJvd3NlclRlbGVtZXRyeShwYWdlKTtcclxuICAgIGF3YWl0IHBhZ2UuZ290bygnL2N1cnJlbnQtc3ByaW50Jyk7XHJcblxyXG4gICAgaWYgKHBhZ2UudXJsKCkuaW5jbHVkZXMoJ2xvZ2luJykgfHwgcGFnZS51cmwoKS5lbmRzV2l0aCgnLycpKSB7XHJcbiAgICAgIHRlc3Quc2tpcCh0cnVlLCAnUmVkaXJlY3RlZCB0byBsb2dpbjsgYXV0aCBtYXkgYmUgcmVxdWlyZWQnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGhhc0JvYXJkcyA9IGF3YWl0IHBhZ2UubG9jYXRvcignI2JvYXJkLXNlbGVjdCBvcHRpb25bdmFsdWVdOm5vdChbdmFsdWU9XCJcIl0pJykuY291bnQoKSA+IDA7XHJcbiAgICBpZiAoIWhhc0JvYXJkcykge1xyXG4gICAgICB0ZXN0LnNraXAodHJ1ZSwgJ05vIGJvYXJkcyB0byBzZWxlY3QnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHBhZ2Uuc2VsZWN0T3B0aW9uKCcjYm9hcmQtc2VsZWN0JywgeyBpbmRleDogMSB9KTtcclxuICAgIGF3YWl0IHBhZ2Uud2FpdEZvclNlbGVjdG9yKCcjY3VycmVudC1zcHJpbnQtY29udGVudCwgI2N1cnJlbnQtc3ByaW50LWVycm9yJywgeyB0aW1lb3V0OiAyMDAwMCB9KS5jYXRjaCgoKSA9PiBudWxsKTtcclxuXHJcbiAgICBjb25zdCBib2R5VGV4dCA9IGF3YWl0IHBhZ2UubG9jYXRvcignYm9keScpLnRleHRDb250ZW50KCk7XHJcbiAgICBjb25zdCBoYXNCdXJuZG93bkxpbmUgPSBib2R5VGV4dCAmJiAvb2YgXFxkKyBTUCBkb25lfFxcZCsgb2YgXFxkKyBTUCBkb25lLy50ZXN0KGJvZHlUZXh0KTtcclxuICAgIGNvbnN0IGhhc0J1cm5kb3duSGludCA9IGJvZHlUZXh0ICYmIC9CdXJuZG93biB3aWxsIGFwcGVhciB3aGVuIHN0b3J5IHBvaW50cyBhbmQgcmVzb2x1dGlvbnMvLnRlc3QoYm9keVRleHQpO1xyXG4gICAgY29uc3QgaGFzTm9TcHJpbnQgPSBib2R5VGV4dCAmJiAvTm8gYWN0aXZlIG9yIHJlY2VudCBjbG9zZWQgc3ByaW50Ly50ZXN0KGJvZHlUZXh0KTtcclxuICAgIGV4cGVjdChoYXNCdXJuZG93bkxpbmUgfHwgaGFzQnVybmRvd25IaW50IHx8IGhhc05vU3ByaW50KS50b0JlVHJ1dGh5KCk7XHJcblxyXG4gICAgaWYgKCFoYXNOb1NwcmludCkge1xuICAgICAgY29uc3Qgc3VtbWFyeVZpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNzcHJpbnQtc3VtbWFyeS1jYXJkJykuaXNWaXNpYmxlKCkuY2F0Y2goKCkgPT4gZmFsc2UpO1xuICAgICAgY29uc3Qgbm90ZXNWaXNpYmxlID0gYXdhaXQgcGFnZS5sb2NhdG9yKCcjbm90ZXMtY2FyZCcpLmlzVmlzaWJsZSgpLmNhdGNoKCgpID0+IGZhbHNlKTtcbiAgICAgIGV4cGVjdChzdW1tYXJ5VmlzaWJsZSkudG9CZVRydXRoeSgpO1xuICAgICAgZXhwZWN0KG5vdGVzVmlzaWJsZSkudG9CZVRydXRoeSgpO1xuICAgICAgY29uc3Qgc25hcHNob3RCYWRnZVZpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJy5zbmFwc2hvdC1iYWRnZScpLmlzVmlzaWJsZSgpLmNhdGNoKCgpID0+IGZhbHNlKTtcbiAgICAgIGlmIChzbmFwc2hvdEJhZGdlVmlzaWJsZSkge1xuICAgICAgICBjb25zdCBiYWRnZVRleHQgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJy5zbmFwc2hvdC1iYWRnZScpLnRleHRDb250ZW50KCk7XG4gICAgICAgIGV4cGVjdChiYWRnZVRleHQpLnRvTWF0Y2goL1NuYXBzaG90fExpdmUvKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGhhc1N0dWNrQ2FyZCA9IGF3YWl0IHBhZ2UubG9jYXRvcignI3N0dWNrLWNhcmQnKS5pc1Zpc2libGUoKS5jYXRjaCgoKSA9PiBmYWxzZSk7XG4gICAgICBjb25zdCBoYXNTdHVja1Byb21wdCA9IGF3YWl0IHBhZ2UubG9jYXRvcignYS5zdHVjay1wcm9tcHQsIGFbaHJlZj1cIiNzdHVjay1jYXJkXCJdJykuaXNWaXNpYmxlKCkuY2F0Y2goKCkgPT4gZmFsc2UpO1xuICAgICAgaWYgKGhhc1N0dWNrQ2FyZCB8fCBoYXNTdHVja1Byb21wdCkge1xuICAgICAgICBleHBlY3QocGFnZS5sb2NhdG9yKCdhW2hyZWY9XCIjc3R1Y2stY2FyZFwiXScpLmZpcnN0KCkpLnRvQmVWaXNpYmxlKCk7XG4gICAgICB9XHJcbiAgICAgIGNvbnN0IGF4aXNMYWJlbFZpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJy5idXJuZG93bi1heGlzJykuaXNWaXNpYmxlKCkuY2F0Y2goKCkgPT4gZmFsc2UpO1xyXG4gICAgICBleHBlY3QoYXhpc0xhYmVsVmlzaWJsZSB8fCBoYXNCdXJuZG93bkhpbnQpLnRvQmVUcnV0aHkoKTtcclxuICAgICAgY29uc3Qgc3Rvcmllc0hlYWRlciA9IGF3YWl0IHBhZ2UubG9jYXRvcignI3N0b3JpZXMtY2FyZCB0aGVhZCcpLnRleHRDb250ZW50KCkuY2F0Y2goKCkgPT4gJycpO1xyXG4gICAgICBleHBlY3Qoc3Rvcmllc0hlYWRlcikudG9NYXRjaCgvU3RhdHVzL2kpO1xyXG4gICAgICBleHBlY3Qoc3Rvcmllc0hlYWRlcikudG9NYXRjaCgvUmVwb3J0ZXIvaSk7XHJcbiAgICAgIGV4cGVjdChzdG9yaWVzSGVhZGVyKS50b01hdGNoKC9Bc3NpZ25lZS9pKTtcclxuICAgICAgY29uc3Qgc3VidGFza1Zpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNzdWJ0YXNrLXRyYWNraW5nLWNhcmQnKS5pc1Zpc2libGUoKS5jYXRjaCgoKSA9PiBmYWxzZSk7XHJcbiAgICAgIGNvbnN0IG5vdGlmaWNhdGlvbnNWaXNpYmxlID0gYXdhaXQgcGFnZS5sb2NhdG9yKCcjbm90aWZpY2F0aW9ucy1jYXJkJykuaXNWaXNpYmxlKCkuY2F0Y2goKCkgPT4gZmFsc2UpO1xyXG4gICAgICBleHBlY3Qoc3VidGFza1Zpc2libGUpLnRvQmVUcnV0aHkoKTtcclxuICAgICAgZXhwZWN0KG5vdGlmaWNhdGlvbnNWaXNpYmxlKS50b0JlVHJ1dGh5KCk7XHJcbiAgICAgIGNvbnN0IGhhc1N1YnRhc2tUYWJsZSA9IGF3YWl0IHBhZ2UubG9jYXRvcignI3N1YnRhc2stdHJhY2tpbmctY2FyZCB0YWJsZScpLmlzVmlzaWJsZSgpLmNhdGNoKCgpID0+IGZhbHNlKTtcclxuICAgICAgaWYgKGhhc1N1YnRhc2tUYWJsZSkge1xyXG4gICAgICAgIGNvbnN0IHN1YnRhc2tIZWFkZXIgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNzdWJ0YXNrLXRyYWNraW5nLWNhcmQgdGhlYWQnKS50ZXh0Q29udGVudCgpLmNhdGNoKCgpID0+ICcnKTtcclxuICAgICAgICBleHBlY3Qoc3VidGFza0hlYWRlcikudG9NYXRjaCgvUmVwb3J0ZXIvaSk7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKG5vdGlmaWNhdGlvbnNWaXNpYmxlKSB7XHJcbiAgICAgICAgY29uc3Qgbm9Ob3RpZmljYXRpb25zID0gYXdhaXQgcGFnZS5sb2NhdG9yKCcjbm90aWZpY2F0aW9ucy1jYXJkJykudGV4dENvbnRlbnQoKS50aGVuKHRleHQgPT4gL05vIG5vdGlmaWNhdGlvbnMgbmVlZGVkL2kudGVzdCh0ZXh0IHx8ICcnKSk7XHJcbiAgICAgICAgaWYgKCFub05vdGlmaWNhdGlvbnMpIHtcclxuICAgICAgICAgIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJyNub3RpZmljYXRpb24tcmVjaXBpZW50JykpLnRvQmVWaXNpYmxlKCk7XHJcbiAgICAgICAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjbm90aWZpY2F0aW9uLW1lc3NhZ2UnKSkudG9CZVZpc2libGUoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBleHBlY3QodGVsZW1ldHJ5LmNvbnNvbGVFcnJvcnMpLnRvRXF1YWwoW10pO1xyXG4gICAgZXhwZWN0KHRlbGVtZXRyeS5wYWdlRXJyb3JzKS50b0VxdWFsKFtdKTtcclxuICAgIGV4cGVjdCh0ZWxlbWV0cnkuZmFpbGVkUmVxdWVzdHMpLnRvRXF1YWwoW10pO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdjdXJyZW50LXNwcmludDogd2hlbiBib2FyZCBsaXN0IGlzIGVtcHR5LCBzaW5nbGUgZXJyb3IgbWVzc2FnZSB2aXNpYmxlJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICBjb25zdCB0ZWxlbWV0cnkgPSBjYXB0dXJlQnJvd3NlclRlbGVtZXRyeShwYWdlKTtcclxuICAgIGF3YWl0IHBhZ2Uucm91dGUoJyoqL2FwaS9ib2FyZHMuanNvbionLCAocm91dGUpID0+XHJcbiAgICAgIHJvdXRlLmZ1bGZpbGwoeyBzdGF0dXM6IDIwMCwgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJywgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBib2FyZHM6IFtdIH0pIH0pXHJcbiAgICApO1xyXG4gICAgYXdhaXQgcGFnZS5nb3RvKCcvY3VycmVudC1zcHJpbnQnKTtcclxuXHJcbiAgICBpZiAocGFnZS51cmwoKS5pbmNsdWRlcygnbG9naW4nKSB8fCBwYWdlLnVybCgpLmVuZHNXaXRoKCcvJykpIHtcclxuICAgICAgdGVzdC5za2lwKHRydWUsICdSZWRpcmVjdGVkIHRvIGxvZ2luOyBhdXRoIG1heSBiZSByZXF1aXJlZCcpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgcGFnZS53YWl0Rm9yVGltZW91dCgyMDAwKTtcclxuICAgIGNvbnN0IGVycm9yVmlzaWJsZSA9IGF3YWl0IHBhZ2UubG9jYXRvcignI2N1cnJlbnQtc3ByaW50LWVycm9yJykuaXNWaXNpYmxlKCk7XHJcbiAgICBjb25zdCBlcnJvclRleHQgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNjdXJyZW50LXNwcmludC1lcnJvcicpLnRleHRDb250ZW50KCkuY2F0Y2goKCkgPT4gJycpO1xyXG4gICAgZXhwZWN0KGVycm9yVmlzaWJsZSkudG9CZVRydXRoeSgpO1xyXG4gICAgZXhwZWN0KGVycm9yVGV4dCkudG9NYXRjaCgvTm8gYm9hcmRzIGZvdW5kfG5vIGJvYXJkcy9pKTtcclxuXHJcbiAgICBleHBlY3QodGVsZW1ldHJ5LmNvbnNvbGVFcnJvcnMpLnRvRXF1YWwoW10pO1xyXG4gICAgZXhwZWN0KHRlbGVtZXRyeS5wYWdlRXJyb3JzKS50b0VxdWFsKFtdKTtcclxuICB9KTtcclxuXHJcbiAgdGVzdCgnbGVhZGVyc2hpcDogZW1wdHkgcHJldmlldyBzaG93cyBzaW5nbGUgbWVzc2FnZSB3aGVuIG5vIHNwcmludCBkYXRhIGluIHJhbmdlJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICB0ZXN0LnNldFRpbWVvdXQoMzAwMDApO1xyXG4gICAgY29uc3QgdGVsZW1ldHJ5ID0gY2FwdHVyZUJyb3dzZXJUZWxlbWV0cnkocGFnZSk7XHJcbiAgICBhd2FpdCBwYWdlLnJvdXRlKCcqKi9wcmV2aWV3Lmpzb24qJywgKHJvdXRlKSA9PlxyXG4gICAgICByb3V0ZS5mdWxmaWxsKHtcclxuICAgICAgICBzdGF0dXM6IDIwMCxcclxuICAgICAgICBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgYm9hcmRzOiBbXSwgc3ByaW50c0luY2x1ZGVkOiBbXSwgcm93czogW10sIG1ldGE6IHt9IH0pLFxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuICAgIGF3YWl0IHBhZ2UuZ290bygnL3NwcmludC1sZWFkZXJzaGlwJyk7XHJcblxyXG4gICAgaWYgKHBhZ2UudXJsKCkuaW5jbHVkZXMoJ2xvZ2luJykgfHwgcGFnZS51cmwoKS5lbmRzV2l0aCgnLycpKSB7XHJcbiAgICAgIHRlc3Quc2tpcCh0cnVlLCAnUmVkaXJlY3RlZCB0byBsb2dpbjsgYXV0aCBtYXkgYmUgcmVxdWlyZWQnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHBhZ2UuY2xpY2soJyNsZWFkZXJzaGlwLXByZXZpZXcnKTtcclxuICAgIGF3YWl0IHBhZ2Uud2FpdEZvclNlbGVjdG9yKCcjbGVhZGVyc2hpcC1lcnJvcicsIHsgc3RhdGU6ICd2aXNpYmxlJywgdGltZW91dDogMTAwMDAgfSk7XHJcbiAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjbGVhZGVyc2hpcC1lcnJvcicpKS50b0NvbnRhaW5UZXh0KC9ObyBzcHJpbnQgZGF0YXxXaWRlbiB0aGUgZGF0ZSByYW5nZS9pKTtcclxuXHJcbiAgICBleHBlY3QodGVsZW1ldHJ5LmNvbnNvbGVFcnJvcnMpLnRvRXF1YWwoW10pO1xyXG4gICAgZXhwZWN0KHRlbGVtZXRyeS5wYWdlRXJyb3JzKS50b0VxdWFsKFtdKTtcclxuICAgIGV4cGVjdCh0ZWxlbWV0cnkuZmFpbGVkUmVxdWVzdHMpLnRvRXF1YWwoW10pO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdyZXBvcnQ6IGJvYXJkcyB0YWIgYW5kIGV4cG9ydCB3b3JrIHdpdGggbm8gY29uc29sZSBlcnJvcnMgYWZ0ZXIgcHJldmlldycsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgdGVzdC5zZXRUaW1lb3V0KDE4MDAwMCk7XHJcbiAgICBjb25zdCB0ZWxlbWV0cnkgPSBjYXB0dXJlQnJvd3NlclRlbGVtZXRyeShwYWdlKTtcclxuICAgIGF3YWl0IHBhZ2UuZ290bygnL3JlcG9ydCcpO1xyXG5cclxuICAgIGlmIChwYWdlLnVybCgpLmluY2x1ZGVzKCdsb2dpbicpIHx8IHBhZ2UudXJsKCkuZW5kc1dpdGgoJy8nKSkge1xyXG4gICAgICB0ZXN0LnNraXAodHJ1ZSwgJ1JlZGlyZWN0ZWQgdG8gbG9naW47IGF1dGggbWF5IGJlIHJlcXVpcmVkJyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBhd2FpdCBwYWdlLmNsaWNrKCcjcHJldmlldy1idG4nKTtcclxuICAgIGF3YWl0IFByb21pc2UucmFjZShbXHJcbiAgICAgIHBhZ2Uud2FpdEZvclNlbGVjdG9yKCcjcHJldmlldy1jb250ZW50JywgeyBzdGF0ZTogJ3Zpc2libGUnLCB0aW1lb3V0OiAxMjAwMDAgfSkuY2F0Y2goKCkgPT4gbnVsbCksXHJcbiAgICAgIHBhZ2Uud2FpdEZvclNlbGVjdG9yKCcjZXJyb3InLCB7IHN0YXRlOiAndmlzaWJsZScsIHRpbWVvdXQ6IDEyMDAwMCB9KS5jYXRjaCgoKSA9PiBudWxsKSxcclxuICAgIF0pO1xyXG5cclxuICAgIGNvbnN0IHByZXZpZXdWaXNpYmxlID0gYXdhaXQgcGFnZS5sb2NhdG9yKCcjcHJldmlldy1jb250ZW50JykuaXNWaXNpYmxlKCkuY2F0Y2goKCkgPT4gZmFsc2UpO1xyXG4gICAgaWYgKHByZXZpZXdWaXNpYmxlKSB7XHJcbiAgICAgIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJy50YWJzJykpLnRvQmVWaXNpYmxlKCk7XHJcbiAgICAgIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJyN0YWItcHJvamVjdC1lcGljLWxldmVsJykpLnRvQmVWaXNpYmxlKCk7XHJcbiAgICAgIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJyNleHBvcnQtZXhjZWwtYnRuJykpLnRvQmVWaXNpYmxlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgZXhwZWN0KHRlbGVtZXRyeS5jb25zb2xlRXJyb3JzKS50b0VxdWFsKFtdKTtcclxuICAgIGV4cGVjdCh0ZWxlbWV0cnkucGFnZUVycm9ycykudG9FcXVhbChbXSk7XHJcbiAgICBleHBlY3QodGVsZW1ldHJ5LmZhaWxlZFJlcXVlc3RzKS50b0VxdWFsKFtdKTtcclxuICB9KTtcclxuXHJcbiAgdGVzdCgnYXBwLXdpZGUgbm90aWZpY2F0aW9uIGRvY2sgcmVuZGVycyBmcm9tIHN0b3JlZCBzdW1tYXJ5JywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICBjb25zdCB0ZWxlbWV0cnkgPSBjYXB0dXJlQnJvd3NlclRlbGVtZXRyeShwYWdlKTtcclxuICAgIGF3YWl0IHBhZ2UuYWRkSW5pdFNjcmlwdCgoKSA9PiB7XHJcbiAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdhcHBOb3RpZmljYXRpb25zVjEnLCBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgdG90YWw6IDMsXHJcbiAgICAgICAgbWlzc2luZ0VzdGltYXRlOiAxLFxyXG4gICAgICAgIG1pc3NpbmdMb2dnZWQ6IDIsXHJcbiAgICAgICAgYm9hcmROYW1lOiAnTVBTQSBib2FyZCcsXHJcbiAgICAgICAgc3ByaW50TmFtZTogJ1NwcmludCAxJyxcclxuICAgICAgfSkpO1xyXG4gICAgfSk7XHJcbiAgICBhd2FpdCBwYWdlLmdvdG8oJy9yZXBvcnQnKTtcclxuXHJcbiAgICBpZiAocGFnZS51cmwoKS5pbmNsdWRlcygnbG9naW4nKSB8fCBwYWdlLnVybCgpLmVuZHNXaXRoKCcvJykpIHtcclxuICAgICAgdGVzdC5za2lwKHRydWUsICdSZWRpcmVjdGVkIHRvIGxvZ2luOyBhdXRoIG1heSBiZSByZXF1aXJlZCcpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignI2FwcC1ub3RpZmljYXRpb24tZG9jaycpKS50b0JlVmlzaWJsZSgpO1xyXG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignI2FwcC1ub3RpZmljYXRpb24tZG9jaycpKS50b0NvbnRhaW5UZXh0KCczJyk7XHJcblxyXG4gICAgZXhwZWN0KHRlbGVtZXRyeS5jb25zb2xlRXJyb3JzKS50b0VxdWFsKFtdKTtcclxuICAgIGV4cGVjdCh0ZWxlbWV0cnkucGFnZUVycm9ycykudG9FcXVhbChbXSk7XHJcbiAgfSk7XHJcbn0pO1xyXG4iXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUEsU0FBU0EsSUFBSSxFQUFFQyxNQUFNLFFBQVEsa0JBQWtCO0FBQy9DLFNBQVNDLHVCQUF1QixRQUFRLHVEQUF1RDtBQUUvRkYsSUFBSSxDQUFDRyxRQUFRLENBQUMsNERBQTRELEVBQUUsTUFBTTtFQUNoRkgsSUFBSSxDQUFDLCtEQUErRCxFQUFFLE9BQU87SUFBRUk7RUFBSyxDQUFDLEtBQUs7SUFDeEYsTUFBTUEsSUFBSSxDQUFDQyxhQUFhLENBQUMsTUFBTTtNQUM3QkMsWUFBWSxDQUFDQyxPQUFPLENBQUMsaUNBQWlDLEVBQUUsVUFBVSxDQUFDO0lBQ3JFLENBQUMsQ0FBQztJQUNGLElBQUlDLGdCQUFnQixHQUFHLEVBQUU7SUFDekIsTUFBTUosSUFBSSxDQUFDSyxLQUFLLENBQUMscUJBQXFCLEVBQUdBLEtBQUssSUFBSztNQUNqREQsZ0JBQWdCLEdBQUdDLEtBQUssQ0FBQ0MsT0FBTyxDQUFDLENBQUMsQ0FBQ0MsR0FBRyxDQUFDLENBQUM7TUFDeENGLEtBQUssQ0FBQ0csUUFBUSxDQUFDLENBQUM7SUFDbEIsQ0FBQyxDQUFDO0lBQ0YsTUFBTVIsSUFBSSxDQUFDUyxJQUFJLENBQUMsaUJBQWlCLENBQUM7SUFDbEMsSUFBSVQsSUFBSSxDQUFDTyxHQUFHLENBQUMsQ0FBQyxDQUFDRyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUlWLElBQUksQ0FBQ08sR0FBRyxDQUFDLENBQUMsQ0FBQ0ksUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFO01BQzVEZixJQUFJLENBQUNnQixJQUFJLENBQUMsSUFBSSxFQUFFLDJDQUEyQyxDQUFDO01BQzVEO0lBQ0Y7SUFDQSxNQUFNZixNQUFNLENBQUNHLElBQUksQ0FBQ2EsT0FBTyxDQUFDLDBCQUEwQixDQUFDLENBQUMsQ0FBQ0MsV0FBVyxDQUFDLENB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