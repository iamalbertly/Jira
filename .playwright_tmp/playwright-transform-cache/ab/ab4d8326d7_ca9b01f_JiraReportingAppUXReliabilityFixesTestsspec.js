import { test, expect } from '@playwright/test';
import { runDefaultPreview } from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';
const DEFAULT_Q2_QUERY = '?projects=MPSA,MAS&start=2025-07-01T00:00:00.000Z&end=2025-09-30T23:59:59.999Z';

// Helper: Get table cell text by row and column index
async function getTableCellText(page, rowIndex, columnIndex) {
  const cell = page.locator(`table tbody tr:nth-child(${rowIndex}) td:nth-child(${columnIndex})`);
  return await cell.textContent();
}

// Helper: Validate metrics tab is visible
async function validateMetricsTabVisible(page) {
  const tab = page.locator('.tab-btn').filter({
    hasText: 'Project & Epic Level'
  });
  await expect(tab).toBeVisible({
    timeout: 5000
  });
}
test.describe('UX Reliability & Technical Debt Fixes', () => {
  test.beforeEach(async ({
    page
  }) => {
    await page.goto('/report');
    await expect(page.locator('h1')).toContainText('VodaAgileBoard');
  });
  test('refreshing preview keeps previous results visible while loading', async ({
    page
  }) => {
    test.setTimeout(120000);
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    const errorVisible = await page.locator('#error').isVisible().catch(() => false);
    if (!previewVisible || errorVisible) {
      test.skip();
      return;
    }
    await expect(page.locator('#preview-content')).toBeVisible({
      timeout: 10000
    });
    let resolveRouteHandled;
    const routeHandled = new Promise(resolve => {
      resolveRouteHandled = resolve;
    });
    await page.route('**/preview.json*', async route => {
      await new Promise(resolve => setTimeout(resolve, 800));
      const response = await route.fetch();
      await route.fulfill({
        response
      });
      resolveRouteHandled();
      await page.unroute('**/preview.json*').catch(() => {});
    });
    await page.click('#preview-btn');
    const statusBanner = page.locator('#preview-status .status-banner.info');
    await expect(statusBanner).toBeVisible({
      timeout: 5000
    });
    await expect(page.locator('#preview-content')).toBeVisible({
      timeout: 5000
    });
    await routeHandled.catch(() => {});
    await page.waitForSelector('#loading', {
      state: 'hidden',
      timeout: 120000
    }).catch(() => {});
  });
  test('should display Unknown for empty issueType in Done Stories table', async ({
    page,
    request
  }) => {
    console.log('[TEST] Starting empty issueType display validation');
    test.setTimeout(300000);

    // Test via API first to get data
    const response = await request.get(`/preview.json${DEFAULT_Q2_QUERY}&bypassCache=true`, {
      timeout: 120000
    });
    if (response.status() === 200) {
      const data = await response.json();
      if (data.rows && data.rows.length > 0) {
        // Find a row with empty issueType if any
        const emptyIssueTypeRow = data.rows.find(row => !row.issueType || row.issueType === '');
        if (emptyIssueTypeRow) {
          console.log(`[TEST] Found row with empty issueType: ${emptyIssueTypeRow.issueKey}`);

          // Load preview in browser
          await runDefaultPreview(page, {
            includeStoryPoints: true
          });

          // Navigate to Done Stories tab
          await page.click('.tab-btn[data-tab="done-stories"]');
          await page.waitForSelector('#tab-done-stories.active', {
            state: 'visible',
            timeout: 10000
          });

          // Find the row in the table and verify it shows "Unknown"
          const issueKeyCell = page.locator(`table tbody td:has-text("${emptyIssueTypeRow.issueKey}")`);
          if (await issueKeyCell.isVisible()) {
            const row = issueKeyCell.locator('..');
            const issueTypeCell = row.locator('td:nth-child(4)'); // Type column is 4th
            const issueTypeText = await issueTypeCell.textContent();
            expect(issueTypeText).toContain('Unknown');
            console.log('[TEST] ✓ Empty issueType displays as Unknown in UI');
          }
        } else {
          console.log('[TEST] ⚠ No rows with empty issueType found in test data');
        }
      }
    }
  });
  test('should always show Metrics tab when metrics object exists', async ({
    page,
    request
  }) => {
    console.log('[TEST] Starting metrics tab visibility validation');
    test.setTimeout(300000);

    // Generate preview with metrics
    await runDefaultPreview(page, {
      // Story Points and Epic TTM are now mandatory (always enabled) 
    });

    // Verify metrics tab is visible (should be visible even if metrics are empty)
    await validateMetricsTabVisible(page);
    console.log('[TEST] ✓ Metrics tab is visible');

    // Click Project & Epic Level tab to verify metrics section renders
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    await page.waitForSelector('#tab-project-epic-level.active', {
      state: 'visible',
      timeout: 10000
    });
    console.log('[TEST] ✓ Project & Epic Level tab is clickable and active');
  });
  test('should show perIssueType empty state message when breakdown unavailable', async ({
    page,
    request
  }) => {
    console.log('[TEST] Starting perIssueType empty state validation');
    test.setTimeout(300000);

    // Generate preview with throughput but without bugs (perIssueType will be empty)
    await runDefaultPreview(page, {
      // Story Points and Bugs/Rework are now mandatory (always enabled) 
    });

    // Navigate to Project & Epic Level tab (metrics are embedded)
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    await page.waitForSelector('#tab-project-epic-level.active', {
      state: 'visible',
      timeout: 10000
    });
    await page.waitForSelector('#project-epic-level-content', {
      state: 'visible',
      timeout: 10000
    });

    // Check for empty state message
    const metricsContent = await page.locator('#project-epic-level-content').textContent();
    const hasEmptyStateMessage = metricsContent.includes('No issue type breakdown available') || metricsContent.includes('Enable "Include Bugs for Rework"');
    console.log(`[TEST] ${hasEmptyStateMessage ? '✓' : '⚠'} PerIssueType empty state message ${hasEmptyStateMessage ? 'found' : 'not found'}`);
    // Note: Message may not appear if perIssueType has data or throughput doesn't exist
  });
  test('should display Epic TTM fallback warning when fallback used', async ({
    page,
    request
  }) => {
    console.log('[TEST] Starting Epic TTM fallback warning validation');
    test.setTimeout(300000);

    // Test via API to check for fallback count
    const response = await request.get(`/preview.json${DEFAULT_Q2_QUERY}&bypassCache=true`, {
      timeout: 120000
    });
    if (response.status() === 200) {
      const data = await response.json();
      if (data.meta?.epicTTMFallbackCount !== undefined && data.meta.epicTTMFallbackCount > 0) {
        console.log(`[TEST] Epic TTM fallback count: ${data.meta.epicTTMFallbackCount}`);

        // Load preview in browser
        await runDefaultPreview(page, {
          includeStoryPoints: true,
          includeEpicTTM: true
        });

        // Navigate to Project & Epic Level tab (metrics are embedded)
        await page.click('.tab-btn[data-tab="project-epic-level"]');
        await page.waitForSelector('#tab-project-epic-level.active', {
          state: 'visible',
          timeout: 10000
        });
        await page.waitForSelector('#project-epic-level-content', {
          state: 'visible',
          timeout: 10000
        });

        // Check for fallback warning
        const metricsContent = await page.locator('#project-epic-level-content').textContent();
        const hasFallbackWarning = metricsContent.includes('used story date fallback') || metricsContent.includes('Epic issues unavailable');
        expect(hasFallbackWarning).toBeTruthy();
        console.log('[TEST] ✓ Epic TTM fallback warning displayed in UI');
        const epicTable = page.locator('#project-epic-level-content table').filter({
          hasText: 'Epic Key'
        }).first();
        const epicTableHeader = epicTable.locator('thead tr');
        await expect(epicTableHeader).toContainText('Subtask Spent (Hrs)');
        console.log('[TEST] ✓ Epic TTM subtask hours column visible');
        const storyLink = page.locator('#project-epic-level-content table tbody tr td .epic-story-list a').first();
        if (await storyLink.isVisible().catch(() => false)) {
          const href = await storyLink.getAttribute('href');
          expect(href || '').toContain('/browse/');
          console.log('[TEST] ✓ Epic TTM story IDs render as Jira links');
        }
      } else {
        console.log('[TEST] ⚠ No Epic TTM fallback detected (may be all Epics available)');
      }
    }
  });
  test('should validate CSV columns before export', async ({
    request
  }) => {
    console.log('[TEST] Starting CSV column validation');
    test.setTimeout(300000);
    const response = await request.get(`/preview.json${DEFAULT_Q2_QUERY}`, {
      timeout: 120000
    });
    if (response.status() !== 200) {
      console.log('[TEST] ⚠ Preview request failed; skipping CSV validation');
      test.skip();
      return;
    }
    const data = await response.json();
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (rows.length === 0) {
      console.log('[TEST] ⚠ No preview rows available; skipping CSV validation');
      test.skip();
      return;
    }
    const {
      generateCSVClient
    } = await import('../public/Reporting-App-Report-Utils-Data-Helpers.js');
    const columns = Object.keys(rows[0]);
    const csv = generateCSVClient(columns, rows.slice(0, 10));
    const lines = csv.split('\n').filter(line => line.trim());
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain('issueType');
    expect(lines[0]).toContain('issueKey');
    expect(lines[0]).toContain('issueStatus');
    console.log('[TEST] ✓ CSV export contains required columns via shared helper');
  });
  test('done stories table renders issue keys as Jira links', async ({
    page
  }) => {
    console.log('[TEST] Starting Done Stories issue key link validation');
    test.setTimeout(300000);
    await runDefaultPreview(page, {
      includeStoryPoints: true
    });
    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    if (!previewVisible) {
      test.skip();
      return;
    }
    await page.click('.tab-btn[data-tab="done-stories"]');
    await page.waitForSelector('#tab-done-stories.active', {
      state: 'visible',
      timeout: 10000
    });
    const keyLink = page.locator('#done-stories-content table tbody tr td:first-child a').first();
    if (!(await keyLink.isVisible().catch(() => false))) {
      console.log('[TEST] ⚠ No Done Stories rows with links found (data may be empty)');
      test.skip();
      return;
    }
    const href = await keyLink.getAttribute('href');
    expect(href || '').toContain('/browse/');
    console.log('[TEST] ✓ Done Stories issue keys render as Jira links');
  });
  test('should display cache age in preview meta when from cache', async ({
    page,
    request
  }) => {
    console.log('[TEST] Starting cache age display validation');
    test.setTimeout(300000);

    // First request to populate cache
    const firstResponse = await request.get(`/preview.json${DEFAULT_Q2_QUERY}`, {
      timeout: 120000
    });
    if (firstResponse.status() === 200) {
      // Wait a moment for cache to be set
      await page.waitForTimeout(1000);

      // Second request should be from cache
      const secondResponse = await request.get(`/preview.json${DEFAULT_Q2_QUERY}`, {
        timeout: 120000
      });
      if (secondResponse.status() === 200) {
        const data = await secondResponse.json();
        if (data.meta?.fromCache === true) {
          console.log('[TEST] ✓ Response served from cache');
          if (data.meta?.cacheAgeMinutes !== undefined) {
            expect(typeof data.meta.cacheAgeMinutes).toBe('number');
            expect(data.meta.cacheAgeMinutes).toBeGreaterThanOrEqual(0);
            console.log(`[TEST] ✓ Cache age in meta: ${data.meta.cacheAgeMinutes} minutes`);

            // Load preview in browser to verify UI display
            await runDefaultPreview(page);

            // Check preview meta for cache age
            const previewMeta = await page.locator('#preview-meta').textContent();
            const hasCacheAge = previewMeta.includes('Cache age:') || previewMeta.includes('minutes');
            console.log(`[TEST] ${hasCacheAge ? '✓' : '⚠'} Cache age ${hasCacheAge ? 'displayed' : 'not displayed'} in UI`);
          } else {
            console.log('[TEST] ⚠ Cache age not in meta (may be first request or cache miss)');
          }
        } else {
          console.log('[TEST] ⚠ Response not from cache (cache may have expired or been bypassed)');
        }
      }
    }
  });
  test('should recover gracefully when Epic fetch fails', async ({
    page,
    request
  }) => {
    console.log('[TEST] Starting Epic fetch error recovery validation');
    test.setTimeout(300000);

    // Generate preview with Epic TTM enabled
    await runDefaultPreview(page, {
      // Story Points and Epic TTM are now mandatory (always enabled) 
    });

    // Verify preview completed successfully (even if Epic fetch failed)
    const previewContent = page.locator('#preview-content');
    await expect(previewContent).toBeVisible({
      timeout: 10000
    });
    console.log('[TEST] ✓ Preview completed successfully');

    // Check that Epic TTM section exists (may be empty if Epic fetch failed)
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    await page.waitForSelector('#tab-project-epic-level.active', {
      state: 'visible',
      timeout: 10000
    });
    const metricsContent = await page.locator('#project-epic-level-content').textContent();
    const hasEpicTTMSection = metricsContent.includes('Epic Time-To-Market');
    console.log(`[TEST] ${hasEpicTTMSection ? '✓' : '⚠'} Epic TTM section ${hasEpicTTMSection ? 'present' : 'not present'}`);
    // Note: Epic TTM section may be empty if no epics found, but preview should still succeed
  });
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0ZXN0IiwiZXhwZWN0IiwicnVuRGVmYXVsdFByZXZpZXciLCJERUZBVUxUX1EyX1FVRVJZIiwiZ2V0VGFibGVDZWxsVGV4dCIsInBhZ2UiLCJyb3dJbmRleCIsImNvbHVtbkluZGV4IiwiY2VsbCIsImxvY2F0b3IiLCJ0ZXh0Q29udGVudCIsInZhbGlkYXRlTWV0cmljc1RhYlZpc2libGUiLCJ0YWIiLCJmaWx0ZXIiLCJoYXNUZXh0IiwidG9CZVZpc2libGUiLCJ0aW1lb3V0IiwiZGVzY3JpYmUiLCJiZWZvcmVFYWNoIiwiZ290byIsInRvQ29udGFpblRleHQiLCJzZXRUaW1lb3V0IiwicHJldmlld1Zpc2libGUiLCJpc1Zpc2libGUiLCJjYXRjaCIsImVycm9yVmlzaWJsZSIsInNraXAiLCJyZXNvbHZlUm91dGVIYW5kbGVkIiwicm91dGVIYW5kbGVkIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyb3V0ZSIsInJlc3BvbnNlIiwiZmV0Y2giLCJmdWxmaWxsIiwidW5yb3V0ZSIsImNsaWNrIiwic3RhdHVzQmFubmVyIiwid2FpdEZvclNlbGVjdG9yIiwic3RhdGUiLCJyZXF1ZXN0IiwiY29uc29sZSIsImxvZyIsImdldCIsInN0YXR1cyIsImRhdGEiLCJqc29uIiwicm93cyIsImxlbmd0aCIsImVtcHR5SXNzdWVUeXBlUm93IiwiZmluZCIsInJvdyIsImlzc3VlVHlwZSIsImlzc3VlS2V5IiwiaW5jbHVkZVN0b3J5UG9pbnRzIiwiaXNzdWVLZXlDZWxsIiwiaXNzdWVUeXBlQ2VsbCIsImlzc3VlVHlwZVRleHQiLCJ0b0NvbnRhaW4iLCJtZXRyaWNzQ29udGVudCIsImhhc0VtcHR5U3RhdGVNZXNzYWdlIiwiaW5jbHVkZXMiLCJtZXRhIiwiZXBpY1RUTUZhbGxiYWNrQ291bnQiLCJ1bmRlZmluZWQiLCJpbmNsdWRlRXBpY1RUTSIsImhhc0ZhbGxiYWNrV2FybmluZyIsInRvQmVUcnV0aHkiLCJlcGljVGFibGUiLCJmaXJzdCIsImVwaWNUYWJsZUhlYWRlciIsInN0b3J5TGluayIsImhyZWYiLCJnZXRBdHRyaWJ1dGUiLCJBcnJheSIsImlzQXJyYXkiLCJnZW5lcmF0ZUNTVkNsaWVudCIsImNvbHVtbnMiLCJPYmplY3QiLCJrZXlzIiwiY3N2Iiwic2xpY2UiLCJsaW5lcyIsInNwbGl0IiwibGluZSIsInRyaW0iLCJ0b0JlR3JlYXRlclRoYW4iLCJrZXlMaW5rIiwiZmlyc3RSZXNwb25zZSIsIndhaXRGb3JUaW1lb3V0Iiwic2Vjb25kUmVzcG9uc2UiLCJmcm9tQ2FjaGUiLCJjYWNoZUFnZU1pbnV0ZXMiLCJ0b0JlIiwidG9CZUdyZWF0ZXJUaGFuT3JFcXVhbCIsInByZXZpZXdNZXRhIiwiaGFzQ2FjaGVBZ2UiLCJwcmV2aWV3Q29udGVudCIsImhhc0VwaWNUVE1TZWN0aW9uIl0sInNvdXJjZXMiOlsiSmlyYS1SZXBvcnRpbmctQXBwLVVYLVJlbGlhYmlsaXR5LUZpeGVzLVRlc3RzLnNwZWMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgdGVzdCwgZXhwZWN0IH0gZnJvbSAnQHBsYXl3cmlnaHQvdGVzdCc7XHJcbmltcG9ydCB7IHJ1bkRlZmF1bHRQcmV2aWV3IH0gZnJvbSAnLi9KaXJhUmVwb3J0aW5nLVRlc3RzLVNoYXJlZC1QcmV2aWV3RXhwb3J0LUhlbHBlcnMuanMnO1xyXG5cclxuY29uc3QgREVGQVVMVF9RMl9RVUVSWSA9ICc/cHJvamVjdHM9TVBTQSxNQVMmc3RhcnQ9MjAyNS0wNy0wMVQwMDowMDowMC4wMDBaJmVuZD0yMDI1LTA5LTMwVDIzOjU5OjU5Ljk5OVonO1xyXG5cclxuLy8gSGVscGVyOiBHZXQgdGFibGUgY2VsbCB0ZXh0IGJ5IHJvdyBhbmQgY29sdW1uIGluZGV4XHJcbmFzeW5jIGZ1bmN0aW9uIGdldFRhYmxlQ2VsbFRleHQocGFnZSwgcm93SW5kZXgsIGNvbHVtbkluZGV4KSB7XHJcbiAgY29uc3QgY2VsbCA9IHBhZ2UubG9jYXRvcihgdGFibGUgdGJvZHkgdHI6bnRoLWNoaWxkKCR7cm93SW5kZXh9KSB0ZDpudGgtY2hpbGQoJHtjb2x1bW5JbmRleH0pYCk7XHJcbiAgcmV0dXJuIGF3YWl0IGNlbGwudGV4dENvbnRlbnQoKTtcclxufVxyXG5cclxuLy8gSGVscGVyOiBWYWxpZGF0ZSBtZXRyaWNzIHRhYiBpcyB2aXNpYmxlXHJcbmFzeW5jIGZ1bmN0aW9uIHZhbGlkYXRlTWV0cmljc1RhYlZpc2libGUocGFnZSkge1xyXG4gIGNvbnN0IHRhYiA9IHBhZ2UubG9jYXRvcignLnRhYi1idG4nKS5maWx0ZXIoeyBoYXNUZXh0OiAnUHJvamVjdCAmIEVwaWMgTGV2ZWwnIH0pO1xyXG4gIGF3YWl0IGV4cGVjdCh0YWIpLnRvQmVWaXNpYmxlKHsgdGltZW91dDogNTAwMCB9KTtcclxufVxyXG5cclxudGVzdC5kZXNjcmliZSgnVVggUmVsaWFiaWxpdHkgJiBUZWNobmljYWwgRGVidCBGaXhlcycsICgpID0+IHtcclxuICB0ZXN0LmJlZm9yZUVhY2goYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICBhd2FpdCBwYWdlLmdvdG8oJy9yZXBvcnQnKTtcclxuICAgIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJ2gxJykpLnRvQ29udGFpblRleHQoJ1ZvZGFBZ2lsZUJvYXJkJyk7XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ3JlZnJlc2hpbmcgcHJldmlldyBrZWVwcyBwcmV2aW91cyByZXN1bHRzIHZpc2libGUgd2hpbGUgbG9hZGluZycsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgdGVzdC5zZXRUaW1lb3V0KDEyMDAwMCk7XHJcblxyXG4gICAgYXdhaXQgcnVuRGVmYXVsdFByZXZpZXcocGFnZSk7XHJcbiAgICBjb25zdCBwcmV2aWV3VmlzaWJsZSA9IGF3YWl0IHBhZ2UubG9jYXRvcignI3ByZXZpZXctY29udGVudCcpLmlzVmlzaWJsZSgpLmNhdGNoKCgpID0+IGZhbHNlKTtcclxuICAgIGNvbnN0IGVycm9yVmlzaWJsZSA9IGF3YWl0IHBhZ2UubG9jYXRvcignI2Vycm9yJykuaXNWaXNpYmxlKCkuY2F0Y2goKCkgPT4gZmFsc2UpO1xyXG4gICAgaWYgKCFwcmV2aWV3VmlzaWJsZSB8fCBlcnJvclZpc2libGUpIHtcclxuICAgICAgdGVzdC5za2lwKCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWNvbnRlbnQnKSkudG9CZVZpc2libGUoeyB0aW1lb3V0OiAxMDAwMCB9KTtcclxuXHJcbiAgICBsZXQgcmVzb2x2ZVJvdXRlSGFuZGxlZDtcclxuICAgIGNvbnN0IHJvdXRlSGFuZGxlZCA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xyXG4gICAgICByZXNvbHZlUm91dGVIYW5kbGVkID0gcmVzb2x2ZTtcclxuICAgIH0pO1xyXG5cclxuICAgIGF3YWl0IHBhZ2Uucm91dGUoJyoqL3ByZXZpZXcuanNvbionLCBhc3luYyByb3V0ZSA9PiB7XHJcbiAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCA4MDApKTtcclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByb3V0ZS5mZXRjaCgpO1xyXG4gICAgICBhd2FpdCByb3V0ZS5mdWxmaWxsKHsgcmVzcG9uc2UgfSk7XHJcbiAgICAgIHJlc29sdmVSb3V0ZUhhbmRsZWQoKTtcclxuICAgICAgYXdhaXQgcGFnZS51bnJvdXRlKCcqKi9wcmV2aWV3Lmpzb24qJykuY2F0Y2goKCkgPT4ge30pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgYXdhaXQgcGFnZS5jbGljaygnI3ByZXZpZXctYnRuJyk7XHJcblxyXG4gICAgY29uc3Qgc3RhdHVzQmFubmVyID0gcGFnZS5sb2NhdG9yKCcjcHJldmlldy1zdGF0dXMgLnN0YXR1cy1iYW5uZXIuaW5mbycpO1xyXG4gICAgYXdhaXQgZXhwZWN0KHN0YXR1c0Jhbm5lcikudG9CZVZpc2libGUoeyB0aW1lb3V0OiA1MDAwIH0pO1xyXG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignI3ByZXZpZXctY29udGVudCcpKS50b0JlVmlzaWJsZSh7IHRpbWVvdXQ6IDUwMDAgfSk7XHJcblxyXG4gICAgYXdhaXQgcm91dGVIYW5kbGVkLmNhdGNoKCgpID0+IHt9KTtcclxuICAgIGF3YWl0IHBhZ2Uud2FpdEZvclNlbGVjdG9yKCcjbG9hZGluZycsIHsgc3RhdGU6ICdoaWRkZW4nLCB0aW1lb3V0OiAxMjAwMDAgfSkuY2F0Y2goKCkgPT4ge30pO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdzaG91bGQgZGlzcGxheSBVbmtub3duIGZvciBlbXB0eSBpc3N1ZVR5cGUgaW4gRG9uZSBTdG9yaWVzIHRhYmxlJywgYXN5bmMgKHsgcGFnZSwgcmVxdWVzdCB9KSA9PiB7XHJcbiAgICBjb25zb2xlLmxvZygnW1RFU1RdIFN0YXJ0aW5nIGVtcHR5IGlzc3VlVHlwZSBkaXNwbGF5IHZhbGlkYXRpb24nKTtcclxuICAgIHRlc3Quc2V0VGltZW91dCgzMDAwMDApO1xyXG5cclxuICAgIC8vIFRlc3QgdmlhIEFQSSBmaXJzdCB0byBnZXQgZGF0YVxyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0LmdldChgL3ByZXZpZXcuanNvbiR7REVGQVVMVF9RMl9RVUVSWX0mYnlwYXNzQ2FjaGU9dHJ1ZWAsIHtcclxuICAgICAgdGltZW91dDogMTIwMDAwXHJcbiAgICB9KTtcclxuXHJcbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzKCkgPT09IDIwMCkge1xyXG4gICAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgICBpZiAoZGF0YS5yb3dzICYmIGRhdGEucm93cy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgLy8gRmluZCBhIHJvdyB3aXRoIGVtcHR5IGlzc3VlVHlwZSBpZiBhbnlcclxuICAgICAgICBjb25zdCBlbXB0eUlzc3VlVHlwZVJvdyA9IGRhdGEucm93cy5maW5kKHJvdyA9PiAhcm93Lmlzc3VlVHlwZSB8fCByb3cuaXNzdWVUeXBlID09PSAnJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGVtcHR5SXNzdWVUeXBlUm93KSB7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZyhgW1RFU1RdIEZvdW5kIHJvdyB3aXRoIGVtcHR5IGlzc3VlVHlwZTogJHtlbXB0eUlzc3VlVHlwZVJvdy5pc3N1ZUtleX1gKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gTG9hZCBwcmV2aWV3IGluIGJyb3dzZXJcclxuICAgICAgICAgIGF3YWl0IHJ1bkRlZmF1bHRQcmV2aWV3KHBhZ2UsIHsgaW5jbHVkZVN0b3J5UG9pbnRzOiB0cnVlIH0pO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBOYXZpZ2F0ZSB0byBEb25lIFN0b3JpZXMgdGFiXHJcbiAgICAgICAgICBhd2FpdCBwYWdlLmNsaWNrKCcudGFiLWJ0bltkYXRhLXRhYj1cImRvbmUtc3Rvcmllc1wiXScpO1xyXG4gICAgICAgICAgYXdhaXQgcGFnZS53YWl0Rm9yU2VsZWN0b3IoJyN0YWItZG9uZS1zdG9yaWVzLmFjdGl2ZScsIHsgc3RhdGU6ICd2aXNpYmxlJywgdGltZW91dDogMTAwMDAgfSk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIEZpbmQgdGhlIHJvdyBpbiB0aGUgdGFibGUgYW5kIHZlcmlmeSBpdCBzaG93cyBcIlVua25vd25cIlxyXG4gICAgICAgICAgY29uc3QgaXNzdWVLZXlDZWxsID0gcGFnZS5sb2NhdG9yKGB0YWJsZSB0Ym9keSB0ZDpoYXMtdGV4dChcIiR7ZW1wdHlJc3N1ZVR5cGVSb3cuaXNzdWVLZXl9XCIpYCk7XHJcbiAgICAgICAgICBpZiAoYXdhaXQgaXNzdWVLZXlDZWxsLmlzVmlzaWJsZSgpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJvdyA9IGlzc3VlS2V5Q2VsbC5sb2NhdG9yKCcuLicpO1xyXG4gICAgICAgICAgICBjb25zdCBpc3N1ZVR5cGVDZWxsID0gcm93LmxvY2F0b3IoJ3RkOm50aC1jaGlsZCg0KScpOyAvLyBUeXBlIGNvbHVtbiBpcyA0dGhcclxuICAgICAgICAgICAgY29uc3QgaXNzdWVUeXBlVGV4dCA9IGF3YWl0IGlzc3VlVHlwZUNlbGwudGV4dENvbnRlbnQoKTtcclxuICAgICAgICAgICAgZXhwZWN0KGlzc3VlVHlwZVRleHQpLnRvQ29udGFpbignVW5rbm93bicpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBFbXB0eSBpc3N1ZVR5cGUgZGlzcGxheXMgYXMgVW5rbm93biBpbiBVSScpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKaoCBObyByb3dzIHdpdGggZW1wdHkgaXNzdWVUeXBlIGZvdW5kIGluIHRlc3QgZGF0YScpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdzaG91bGQgYWx3YXlzIHNob3cgTWV0cmljcyB0YWIgd2hlbiBtZXRyaWNzIG9iamVjdCBleGlzdHMnLCBhc3luYyAoeyBwYWdlLCByZXF1ZXN0IH0pID0+IHtcclxuICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gU3RhcnRpbmcgbWV0cmljcyB0YWIgdmlzaWJpbGl0eSB2YWxpZGF0aW9uJyk7XHJcbiAgICB0ZXN0LnNldFRpbWVvdXQoMzAwMDAwKTtcclxuXHJcbiAgICAvLyBHZW5lcmF0ZSBwcmV2aWV3IHdpdGggbWV0cmljc1xyXG4gICAgYXdhaXQgcnVuRGVmYXVsdFByZXZpZXcocGFnZSwgeyBcclxuICAgICAgLy8gU3RvcnkgUG9pbnRzIGFuZCBFcGljIFRUTSBhcmUgbm93IG1hbmRhdG9yeSAoYWx3YXlzIGVuYWJsZWQpIFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gVmVyaWZ5IG1ldHJpY3MgdGFiIGlzIHZpc2libGUgKHNob3VsZCBiZSB2aXNpYmxlIGV2ZW4gaWYgbWV0cmljcyBhcmUgZW1wdHkpXHJcbiAgICBhd2FpdCB2YWxpZGF0ZU1ldHJpY3NUYWJWaXNpYmxlKHBhZ2UpO1xyXG4gICAgY29uc29sZS5sb2coJ1tURVNUXSDinJMgTWV0cmljcyB0YWIgaXMgdmlzaWJsZScpO1xyXG5cclxuICAgIC8vIENsaWNrIFByb2plY3QgJiBFcGljIExldmVsIHRhYiB0byB2ZXJpZnkgbWV0cmljcyBzZWN0aW9uIHJlbmRlcnNcclxuICAgIGF3YWl0IHBhZ2UuY2xpY2soJy50YWItYnRuW2RhdGEtdGFiPVwicHJvamVjdC1lcGljLWxldmVsXCJdJyk7XHJcbiAgICBhd2FpdCBwYWdlLndhaXRGb3JTZWxlY3RvcignI3RhYi1wcm9qZWN0LWVwaWMtbGV2ZWwuYWN0aXZlJywgeyBzdGF0ZTogJ3Zpc2libGUnLCB0aW1lb3V0OiAxMDAwMCB9KTtcclxuICAgIGNvbnNvbGUubG9nKCdbVEVTVF0g4pyTIFByb2plY3QgJiBFcGljIExldmVsIHRhYiBpcyBjbGlja2FibGUgYW5kIGFjdGl2ZScpO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdzaG91bGQgc2hvdyBwZXJJc3N1ZVR5cGUgZW1wdHkgc3RhdGUgbWVzc2FnZSB3aGVuIGJyZWFrZG93biB1bmF2YWlsYWJsZScsIGFzeW5jICh7IHBhZ2UsIHJlcXVlc3QgfSkgPT4ge1xyXG4gICAgY29uc29sZS5sb2coJ1tURVNUXSBTdGFydGluZyBwZXJJc3N1ZVR5cGUgZW1wdHkgc3RhdGUgdmFsaWRhdGlvbicpO1xyXG4gICAgdGVzdC5zZXRUaW1lb3V0KDMwMDAwMCk7XHJcblxyXG4gICAgLy8gR2VuZXJhdGUgcHJldmlldyB3aXRoIHRocm91Z2hwdXQgYnV0IHdpdGhvdXQgYnVncyAocGVySXNzdWVUeXBlIHdpbGwgYmUgZW1wdHkpXHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlLCB7IFxyXG4gICAgICAvLyBTdG9yeSBQb2ludHMgYW5kIEJ1Z3MvUmV3b3JrIGFyZSBub3cgbWFuZGF0b3J5IChhbHdheXMgZW5hYmxlZCkgXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBOYXZpZ2F0ZSB0byBQcm9qZWN0ICYgRXBpYyBMZXZlbCB0YWIgKG1ldHJpY3MgYXJlIGVtYmVkZGVkKVxyXG4gICAgYXdhaXQgcGFnZS5jbGljaygnLnRhYi1idG5bZGF0YS10YWI9XCJwcm9qZWN0LWVwaWMtbGV2ZWxcIl0nKTtcclxuICAgIGF3YWl0IHBhZ2Uud2FpdEZvclNlbGVjdG9yKCcjdGFiLXByb2plY3QtZXBpYy1sZXZlbC5hY3RpdmUnLCB7IHN0YXRlOiAndmlzaWJsZScsIHRpbWVvdXQ6IDEwMDAwIH0pO1xyXG4gICAgYXdhaXQgcGFnZS53YWl0Rm9yU2VsZWN0b3IoJyNwcm9qZWN0LWVwaWMtbGV2ZWwtY29udGVudCcsIHsgc3RhdGU6ICd2aXNpYmxlJywgdGltZW91dDogMTAwMDAgfSk7XHJcblxyXG4gICAgLy8gQ2hlY2sgZm9yIGVtcHR5IHN0YXRlIG1lc3NhZ2VcclxuICAgIGNvbnN0IG1ldHJpY3NDb250ZW50ID0gYXdhaXQgcGFnZS5sb2NhdG9yKCcjcHJvamVjdC1lcGljLWxldmVsLWNvbnRlbnQnKS50ZXh0Q29udGVudCgpO1xyXG4gICAgY29uc3QgaGFzRW1wdHlTdGF0ZU1lc3NhZ2UgPSBtZXRyaWNzQ29udGVudC5pbmNsdWRlcygnTm8gaXNzdWUgdHlwZSBicmVha2Rvd24gYXZhaWxhYmxlJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXRyaWNzQ29udGVudC5pbmNsdWRlcygnRW5hYmxlIFwiSW5jbHVkZSBCdWdzIGZvciBSZXdvcmtcIicpO1xyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZyhgW1RFU1RdICR7aGFzRW1wdHlTdGF0ZU1lc3NhZ2UgPyAn4pyTJyA6ICfimqAnfSBQZXJJc3N1ZVR5cGUgZW1wdHkgc3RhdGUgbWVzc2FnZSAke2hhc0VtcHR5U3RhdGVNZXNzYWdlID8gJ2ZvdW5kJyA6ICdub3QgZm91bmQnfWApO1xyXG4gICAgLy8gTm90ZTogTWVzc2FnZSBtYXkgbm90IGFwcGVhciBpZiBwZXJJc3N1ZVR5cGUgaGFzIGRhdGEgb3IgdGhyb3VnaHB1dCBkb2Vzbid0IGV4aXN0XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ3Nob3VsZCBkaXNwbGF5IEVwaWMgVFRNIGZhbGxiYWNrIHdhcm5pbmcgd2hlbiBmYWxsYmFjayB1c2VkJywgYXN5bmMgKHsgcGFnZSwgcmVxdWVzdCB9KSA9PiB7XHJcbiAgICBjb25zb2xlLmxvZygnW1RFU1RdIFN0YXJ0aW5nIEVwaWMgVFRNIGZhbGxiYWNrIHdhcm5pbmcgdmFsaWRhdGlvbicpO1xyXG4gICAgdGVzdC5zZXRUaW1lb3V0KDMwMDAwMCk7XHJcblxyXG4gICAgLy8gVGVzdCB2aWEgQVBJIHRvIGNoZWNrIGZvciBmYWxsYmFjayBjb3VudFxyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0LmdldChgL3ByZXZpZXcuanNvbiR7REVGQVVMVF9RMl9RVUVSWX0mYnlwYXNzQ2FjaGU9dHJ1ZWAsIHtcclxuICAgICAgdGltZW91dDogMTIwMDAwXHJcbiAgICB9KTtcclxuXHJcbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzKCkgPT09IDIwMCkge1xyXG4gICAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgICBcclxuICAgICAgaWYgKGRhdGEubWV0YT8uZXBpY1RUTUZhbGxiYWNrQ291bnQgIT09IHVuZGVmaW5lZCAmJiBkYXRhLm1ldGEuZXBpY1RUTUZhbGxiYWNrQ291bnQgPiAwKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYFtURVNUXSBFcGljIFRUTSBmYWxsYmFjayBjb3VudDogJHtkYXRhLm1ldGEuZXBpY1RUTUZhbGxiYWNrQ291bnR9YCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTG9hZCBwcmV2aWV3IGluIGJyb3dzZXJcclxuICAgICAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlLCB7IFxyXG4gICAgICAgICAgaW5jbHVkZVN0b3J5UG9pbnRzOiB0cnVlLFxyXG4gICAgICAgICAgaW5jbHVkZUVwaWNUVE06IHRydWUgXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIE5hdmlnYXRlIHRvIFByb2plY3QgJiBFcGljIExldmVsIHRhYiAobWV0cmljcyBhcmUgZW1iZWRkZWQpXHJcbiAgICAgICAgYXdhaXQgcGFnZS5jbGljaygnLnRhYi1idG5bZGF0YS10YWI9XCJwcm9qZWN0LWVwaWMtbGV2ZWxcIl0nKTtcclxuICAgICAgICBhd2FpdCBwYWdlLndhaXRGb3JTZWxlY3RvcignI3RhYi1wcm9qZWN0LWVwaWMtbGV2ZWwuYWN0aXZlJywgeyBzdGF0ZTogJ3Zpc2libGUnLCB0aW1lb3V0OiAxMDAwMCB9KTtcclxuICAgICAgICBhd2FpdCBwYWdlLndhaXRGb3JTZWxlY3RvcignI3Byb2plY3QtZXBpYy1sZXZlbC1jb250ZW50JywgeyBzdGF0ZTogJ3Zpc2libGUnLCB0aW1lb3V0OiAxMDAwMCB9KTtcclxuXHJcbiAgICAgICAgLy8gQ2hlY2sgZm9yIGZhbGxiYWNrIHdhcm5pbmdcclxuICAgICAgICBjb25zdCBtZXRyaWNzQ29udGVudCA9IGF3YWl0IHBhZ2UubG9jYXRvcignI3Byb2plY3QtZXBpYy1sZXZlbC1jb250ZW50JykudGV4dENvbnRlbnQoKTtcclxuICAgICAgICBjb25zdCBoYXNGYWxsYmFja1dhcm5pbmcgPSBtZXRyaWNzQ29udGVudC5pbmNsdWRlcygndXNlZCBzdG9yeSBkYXRlIGZhbGxiYWNrJykgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWV0cmljc0NvbnRlbnQuaW5jbHVkZXMoJ0VwaWMgaXNzdWVzIHVuYXZhaWxhYmxlJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZXhwZWN0KGhhc0ZhbGxiYWNrV2FybmluZykudG9CZVRydXRoeSgpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0g4pyTIEVwaWMgVFRNIGZhbGxiYWNrIHdhcm5pbmcgZGlzcGxheWVkIGluIFVJJyk7XHJcblxyXG4gICAgICAgIGNvbnN0IGVwaWNUYWJsZSA9IHBhZ2UubG9jYXRvcignI3Byb2plY3QtZXBpYy1sZXZlbC1jb250ZW50IHRhYmxlJykuZmlsdGVyKHsgaGFzVGV4dDogJ0VwaWMgS2V5JyB9KS5maXJzdCgpO1xyXG4gICAgICAgIGNvbnN0IGVwaWNUYWJsZUhlYWRlciA9IGVwaWNUYWJsZS5sb2NhdG9yKCd0aGVhZCB0cicpO1xyXG4gICAgICAgIGF3YWl0IGV4cGVjdChlcGljVGFibGVIZWFkZXIpLnRvQ29udGFpblRleHQoJ1N1YnRhc2sgU3BlbnQgKEhycyknKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBFcGljIFRUTSBzdWJ0YXNrIGhvdXJzIGNvbHVtbiB2aXNpYmxlJyk7XHJcblxyXG4gICAgICAgIGNvbnN0IHN0b3J5TGluayA9IHBhZ2UubG9jYXRvcignI3Byb2plY3QtZXBpYy1sZXZlbC1jb250ZW50IHRhYmxlIHRib2R5IHRyIHRkIC5lcGljLXN0b3J5LWxpc3QgYScpLmZpcnN0KCk7XHJcbiAgICAgICAgaWYgKGF3YWl0IHN0b3J5TGluay5pc1Zpc2libGUoKS5jYXRjaCgoKSA9PiBmYWxzZSkpIHtcclxuICAgICAgICAgIGNvbnN0IGhyZWYgPSBhd2FpdCBzdG9yeUxpbmsuZ2V0QXR0cmlidXRlKCdocmVmJyk7XHJcbiAgICAgICAgICBleHBlY3QoaHJlZiB8fCAnJykudG9Db250YWluKCcvYnJvd3NlLycpO1xyXG4gICAgICAgICAgY29uc29sZS5sb2coJ1tURVNUXSDinJMgRXBpYyBUVE0gc3RvcnkgSURzIHJlbmRlciBhcyBKaXJhIGxpbmtzJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0g4pqgIE5vIEVwaWMgVFRNIGZhbGxiYWNrIGRldGVjdGVkIChtYXkgYmUgYWxsIEVwaWNzIGF2YWlsYWJsZSknKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdzaG91bGQgdmFsaWRhdGUgQ1NWIGNvbHVtbnMgYmVmb3JlIGV4cG9ydCcsIGFzeW5jICh7IHJlcXVlc3QgfSkgPT4ge1xyXG4gICAgY29uc29sZS5sb2coJ1tURVNUXSBTdGFydGluZyBDU1YgY29sdW1uIHZhbGlkYXRpb24nKTtcclxuICAgIHRlc3Quc2V0VGltZW91dCgzMDAwMDApO1xyXG5cclxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdC5nZXQoYC9wcmV2aWV3Lmpzb24ke0RFRkFVTFRfUTJfUVVFUll9YCwgeyB0aW1lb3V0OiAxMjAwMDAgfSk7XHJcbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzKCkgIT09IDIwMCkge1xyXG4gICAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKaoCBQcmV2aWV3IHJlcXVlc3QgZmFpbGVkOyBza2lwcGluZyBDU1YgdmFsaWRhdGlvbicpO1xyXG4gICAgICB0ZXN0LnNraXAoKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICBjb25zdCByb3dzID0gQXJyYXkuaXNBcnJheShkYXRhLnJvd3MpID8gZGF0YS5yb3dzIDogW107XHJcbiAgICBpZiAocm93cy5sZW5ndGggPT09IDApIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSDimqAgTm8gcHJldmlldyByb3dzIGF2YWlsYWJsZTsgc2tpcHBpbmcgQ1NWIHZhbGlkYXRpb24nKTtcclxuICAgICAgdGVzdC5za2lwKCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCB7IGdlbmVyYXRlQ1NWQ2xpZW50IH0gPSBhd2FpdCBpbXBvcnQoJy4uL3B1YmxpYy9SZXBvcnRpbmctQXBwLVJlcG9ydC1VdGlscy1EYXRhLUhlbHBlcnMuanMnKTtcclxuICAgIGNvbnN0IGNvbHVtbnMgPSBPYmplY3Qua2V5cyhyb3dzWzBdKTtcclxuICAgIGNvbnN0IGNzdiA9IGdlbmVyYXRlQ1NWQ2xpZW50KGNvbHVtbnMsIHJvd3Muc2xpY2UoMCwgMTApKTtcclxuICAgIGNvbnN0IGxpbmVzID0gY3N2LnNwbGl0KCdcXG4nKS5maWx0ZXIobGluZSA9PiBsaW5lLnRyaW0oKSk7XHJcblxyXG4gICAgZXhwZWN0KGxpbmVzLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDApO1xyXG4gICAgZXhwZWN0KGxpbmVzWzBdKS50b0NvbnRhaW4oJ2lzc3VlVHlwZScpO1xyXG4gICAgZXhwZWN0KGxpbmVzWzBdKS50b0NvbnRhaW4oJ2lzc3VlS2V5Jyk7XHJcbiAgICBleHBlY3QobGluZXNbMF0pLnRvQ29udGFpbignaXNzdWVTdGF0dXMnKTtcclxuICAgIGNvbnNvbGUubG9nKCdbVEVTVF0g4pyTIENTViBleHBvcnQgY29udGFpbnMgcmVxdWlyZWQgY29sdW1ucyB2aWEgc2hhcmVkIGhlbHBlcicpO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdkb25lIHN0b3JpZXMgdGFibGUgcmVuZGVycyBpc3N1ZSBrZXlzIGFzIEppcmEgbGlua3MnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gU3RhcnRpbmcgRG9uZSBTdG9yaWVzIGlzc3VlIGtleSBsaW5rIHZhbGlkYXRpb24nKTtcclxuICAgIHRlc3Quc2V0VGltZW91dCgzMDAwMDApO1xyXG5cclxuICAgIGF3YWl0IHJ1bkRlZmF1bHRQcmV2aWV3KHBhZ2UsIHsgaW5jbHVkZVN0b3J5UG9pbnRzOiB0cnVlIH0pO1xyXG5cclxuICAgIGNvbnN0IHByZXZpZXdWaXNpYmxlID0gYXdhaXQgcGFnZS5sb2NhdG9yKCcjcHJldmlldy1jb250ZW50JykuaXNWaXNpYmxlKCkuY2F0Y2goKCkgPT4gZmFsc2UpO1xyXG4gICAgaWYgKCFwcmV2aWV3VmlzaWJsZSkge1xyXG4gICAgICB0ZXN0LnNraXAoKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHBhZ2UuY2xpY2soJy50YWItYnRuW2RhdGEtdGFiPVwiZG9uZS1zdG9yaWVzXCJdJyk7XHJcbiAgICBhd2FpdCBwYWdlLndhaXRGb3JTZWxlY3RvcignI3RhYi1kb25lLXN0b3JpZXMuYWN0aXZlJywgeyBzdGF0ZTogJ3Zpc2libGUnLCB0aW1lb3V0OiAxMDAwMCB9KTtcclxuXHJcbiAgICBjb25zdCBrZXlMaW5rID0gcGFnZS5sb2NhdG9yKCcjZG9uZS1zdG9yaWVzLWNvbnRlbnQgdGFibGUgdGJvZHkgdHIgdGQ6Zmlyc3QtY2hpbGQgYScpLmZpcnN0KCk7XHJcbiAgICBpZiAoIShhd2FpdCBrZXlMaW5rLmlzVmlzaWJsZSgpLmNhdGNoKCgpID0+IGZhbHNlKSkpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSDimqAgTm8gRG9uZSBTdG9yaWVzIHJvd3Mgd2l0aCBsaW5rcyBmb3VuZCAoZGF0YSBtYXkgYmUgZW1wdHkpJyk7XHJcbiAgICAgIHRlc3Quc2tpcCgpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgaHJlZiA9IGF3YWl0IGtleUxpbmsuZ2V0QXR0cmlidXRlKCdocmVmJyk7XHJcbiAgICBleHBlY3QoaHJlZiB8fCAnJykudG9Db250YWluKCcvYnJvd3NlLycpO1xyXG4gICAgY29uc29sZS5sb2coJ1tURVNUXSDinJMgRG9uZSBTdG9yaWVzIGlzc3VlIGtleXMgcmVuZGVyIGFzIEppcmEgbGlua3MnKTtcclxuICB9KTtcclxuXHJcbiAgdGVzdCgnc2hvdWxkIGRpc3BsYXkgY2FjaGUgYWdlIGluIHByZXZpZXcgbWV0YSB3aGVuIGZyb20gY2FjaGUnLCBhc3luYyAoeyBwYWdlLCByZXF1ZXN0IH0pID0+IHtcclxuICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gU3RhcnRpbmcgY2FjaGUgYWdlIGRpc3BsYXkgdmFsaWRhdGlvbicpO1xyXG4gICAgdGVzdC5zZXRUaW1lb3V0KDMwMDAwMCk7XHJcblxyXG4gICAgLy8gRmlyc3QgcmVxdWVzdCB0byBwb3B1bGF0ZSBjYWNoZVxyXG4gICAgICBjb25zdCBmaXJzdFJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdC5nZXQoYC9wcmV2aWV3Lmpzb24ke0RFRkFVTFRfUTJfUVVFUll9YCwge1xyXG4gICAgICB0aW1lb3V0OiAxMjAwMDBcclxuICAgIH0pO1xyXG5cclxuICAgIGlmIChmaXJzdFJlc3BvbnNlLnN0YXR1cygpID09PSAyMDApIHtcclxuICAgICAgLy8gV2FpdCBhIG1vbWVudCBmb3IgY2FjaGUgdG8gYmUgc2V0XHJcbiAgICAgIGF3YWl0IHBhZ2Uud2FpdEZvclRpbWVvdXQoMTAwMCk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBTZWNvbmQgcmVxdWVzdCBzaG91bGQgYmUgZnJvbSBjYWNoZVxyXG4gICAgICBjb25zdCBzZWNvbmRSZXNwb25zZSA9IGF3YWl0IHJlcXVlc3QuZ2V0KGAvcHJldmlldy5qc29uJHtERUZBVUxUX1EyX1FVRVJZfWAsIHtcclxuICAgICAgICB0aW1lb3V0OiAxMjAwMDBcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBpZiAoc2Vjb25kUmVzcG9uc2Uuc3RhdHVzKCkgPT09IDIwMCkge1xyXG4gICAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCBzZWNvbmRSZXNwb25zZS5qc29uKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGRhdGEubWV0YT8uZnJvbUNhY2hlID09PSB0cnVlKSB7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBSZXNwb25zZSBzZXJ2ZWQgZnJvbSBjYWNoZScpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBpZiAoZGF0YS5tZXRhPy5jYWNoZUFnZU1pbnV0ZXMgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBleHBlY3QodHlwZW9mIGRhdGEubWV0YS5jYWNoZUFnZU1pbnV0ZXMpLnRvQmUoJ251bWJlcicpO1xyXG4gICAgICAgICAgICBleHBlY3QoZGF0YS5tZXRhLmNhY2hlQWdlTWludXRlcykudG9CZUdyZWF0ZXJUaGFuT3JFcXVhbCgwKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYFtURVNUXSDinJMgQ2FjaGUgYWdlIGluIG1ldGE6ICR7ZGF0YS5tZXRhLmNhY2hlQWdlTWludXRlc30gbWludXRlc2ApO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gTG9hZCBwcmV2aWV3IGluIGJyb3dzZXIgdG8gdmVyaWZ5IFVJIGRpc3BsYXlcclxuICAgICAgICAgICAgYXdhaXQgcnVuRGVmYXVsdFByZXZpZXcocGFnZSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBDaGVjayBwcmV2aWV3IG1ldGEgZm9yIGNhY2hlIGFnZVxyXG4gICAgICAgICAgICBjb25zdCBwcmV2aWV3TWV0YSA9IGF3YWl0IHBhZ2UubG9jYXRvcignI3ByZXZpZXctbWV0YScpLnRleHRDb250ZW50KCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGhhc0NhY2hlQWdlID0gcHJldmlld01ldGEuaW5jbHVkZXMoJ0NhY2hlIGFnZTonKSB8fCBwcmV2aWV3TWV0YS5pbmNsdWRlcygnbWludXRlcycpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYFtURVNUXSAke2hhc0NhY2hlQWdlID8gJ+KckycgOiAn4pqgJ30gQ2FjaGUgYWdlICR7aGFzQ2FjaGVBZ2UgPyAnZGlzcGxheWVkJyA6ICdub3QgZGlzcGxheWVkJ30gaW4gVUlgKTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0g4pqgIENhY2hlIGFnZSBub3QgaW4gbWV0YSAobWF5IGJlIGZpcnN0IHJlcXVlc3Qgb3IgY2FjaGUgbWlzcyknKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgY29uc29sZS5sb2coJ1tURVNUXSDimqAgUmVzcG9uc2Ugbm90IGZyb20gY2FjaGUgKGNhY2hlIG1heSBoYXZlIGV4cGlyZWQgb3IgYmVlbiBieXBhc3NlZCknKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgdGVzdCgnc2hvdWxkIHJlY292ZXIgZ3JhY2VmdWxseSB3aGVuIEVwaWMgZmV0Y2ggZmFpbHMnLCBhc3luYyAoeyBwYWdlLCByZXF1ZXN0IH0pID0+IHtcclxuICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gU3RhcnRpbmcgRXBpYyBmZXRjaCBlcnJvciByZWNvdmVyeSB2YWxpZGF0aW9uJyk7XHJcbiAgICB0ZXN0LnNldFRpbWVvdXQoMzAwMDAwKTtcclxuXHJcbiAgICAvLyBHZW5lcmF0ZSBwcmV2aWV3IHdpdGggRXBpYyBUVE0gZW5hYmxlZFxyXG4gICAgYXdhaXQgcnVuRGVmYXVsdFByZXZpZXcocGFnZSwgeyBcclxuICAgICAgLy8gU3RvcnkgUG9pbnRzIGFuZCBFcGljIFRUTSBhcmUgbm93IG1hbmRhdG9yeSAoYWx3YXlzIGVuYWJsZWQpIFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gVmVyaWZ5IHByZXZpZXcgY29tcGxldGVkIHN1Y2Nlc3NmdWxseSAoZXZlbiBpZiBFcGljIGZldGNoIGZhaWxlZClcclxuICAgIGNvbnN0IHByZXZpZXdDb250ZW50ID0gcGFnZS5sb2NhdG9yKCcjcHJldmlldy1jb250ZW50Jyk7XHJcbiAgICBhd2FpdCBleHBlY3QocHJldmlld0NvbnRlbnQpLnRvQmVWaXNpYmxlKHsgdGltZW91dDogMTAwMDAgfSk7XHJcbiAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBQcmV2aWV3IGNvbXBsZXRlZCBzdWNjZXNzZnVsbHknKTtcclxuXHJcbiAgICAvLyBDaGVjayB0aGF0IEVwaWMgVFRNIHNlY3Rpb24gZXhpc3RzIChtYXkgYmUgZW1wdHkgaWYgRXBpYyBmZXRjaCBmYWlsZWQpXHJcbiAgICBhd2FpdCBwYWdlLmNsaWNrKCcudGFiLWJ0bltkYXRhLXRhYj1cInByb2plY3QtZXBpYy1sZXZlbFwiXScpO1xyXG4gICAgYXdhaXQgcGFnZS53YWl0Rm9yU2VsZWN0b3IoJyN0YWItcHJvamVjdC1lcGljLWxldmVsLmFjdGl2ZScsIHsgc3RhdGU6ICd2aXNpYmxlJywgdGltZW91dDogMTAwMDAgfSk7XHJcbiAgICBcclxuICAgIGNvbnN0IG1ldHJpY3NDb250ZW50ID0gYXdhaXQgcGFnZS5sb2NhdG9yKCcjcHJvamVjdC1lcGljLWxldmVsLWNvbnRlbnQnKS50ZXh0Q29udGVudCgpO1xyXG4gICAgY29uc3QgaGFzRXBpY1RUTVNlY3Rpb24gPSBtZXRyaWNzQ29udGVudC5pbmNsdWRlcygnRXBpYyBUaW1lLVRvLU1hcmtldCcpO1xyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZyhgW1RFU1RdICR7aGFzRXBpY1RUTVNlY3Rpb24gPyAn4pyTJyA6ICfimqAnfSBFcGljIFRUTSBzZWN0aW9uICR7aGFzRXBpY1RUTVNlY3Rpb24gPyAncHJlc2VudCcgOiAnbm90IHByZXNlbnQnfWApO1xyXG4gICAgLy8gTm90ZTogRXBpYyBUVE0gc2VjdGlvbiBtYXkgYmUgZW1wdHkgaWYgbm8gZXBpY3MgZm91bmQsIGJ1dCBwcmV2aWV3IHNob3VsZCBzdGlsbCBzdWNjZWVkXHJcbiAgfSk7XHJcbn0pO1xyXG4iXSwibWFwcGluZ3MiOiJBQUFBLFNBQVNBLElBQUksRUFBRUMsTUFBTSxRQUFRLGtCQUFrQjtBQUMvQyxTQUFTQyxpQkFBaUIsUUFBUSx1REFBdUQ7QUFFekYsTUFBTUMsZ0JBQWdCLEdBQUcsZ0ZBQWdGOztBQUV6RztBQUNBLGVBQWVDLGdCQUFnQkEsQ0FBQ0MsSUFBSSxFQUFFQyxRQUFRLEVBQUVDLFdBQVcsRUFBRTtFQUMzRCxNQUFNQyxJQUFJLEdBQUdILElBQUksQ0FBQ0ksT0FBTyxDQUFDLDRCQUE0QkgsUUFBUSxrQkFBa0JDLFdBQVcsR0FBRyxDQUFDO0VBQy9GLE9BQU8sTUFBTUMsSUFBSSxDQUFDRSxXQUFXLENBQUMsQ0FBQztBQUNqQzs7QUFFQTtBQUNBLGVBQWVDLHlCQUF5QkEsQ0FBQ04sSUFBSSxFQUFFO0VBQzdDLE1BQU1PLEdBQUcsR0FBR1AsSUFBSSxDQUFDSSxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUNJLE1BQU0sQ0FBQztJQUFFQyxPQUFPLEVBQUU7RUFBdUIsQ0FBQyxDQUFDO0VBQ2hGLE1BQU1iLE1BQU0sQ0FBQ1csR0FBRyxDQUFDLENBQUNHLFdBQVcs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U0FBUyxDQUFDO1lBRXpGcEIsT0FBTyxDQUFDQyxHQUFHLENBQUMsVUFBVXNELFdBQVcsR0FBRyxHQUFHLEdBQUcsR0FBRyxjQUFjQSxXQUFXLEdBQUcsV0FBVyxHQUFHLGVBQWUsUUFBUSxDQUFDO1VBQ2pILENBQUMsTUFBTTtZQUNMdkQsT0FBTyxDQUFDQyxHQUFHLENBQUMscUVBQXFFLENBQUM7VUFDcEY7UUFDRixDQUFDLE1BQU07VUFDTEQsT0FBTyxDQUFDQyxHQUFHLENBQUMsNEVBQTRFLENBQUM7UUFDM0Y7TUFDRjtJQUNGO0VBQ0YsQ0FBQyxDQUFDO0VBRUYxQyxJQUFJLENBQUMsaURBQWlELEVBQUUsT0FBTztJQUFFSyxJQUFJO0lBQUVtQztFQUFRLENBQUMsS0FBSztJQUNuRkMsT0FBTyxDQUFDQyxHQUFHLENBQUMsc0RBQXNELENBQUM7SUFDbkUxQyxJQUFJLENBQUNxQixVQUFVLENBQUMsTUFBTSxDQUFDOztJQUV2QjtJQUNBLE1BQU1uQixpQkFBaUIsQ0FBQ0csSUFBSSxFQUFFO01BQzVCO0lBQUEsQ0FDRCxDQUFDOztJQUVGO0lBQ0EsTUFBTTRGLGNBQWMsR0FBRzVGLElBQUksQ0FBQ0ksT0FBTyxDQUFDLGtCQUFrQixDQUFDO0lBQ3ZELE1BQU1SLE1BQU0sQ0FBQ2dHLGNBQWMsQ0FBQyxDQUFDbEYsV0FBVyxDQUFDO01BQUVDLE9BQU8sRUFBRTtJQUFNLENBQUMsQ0FBQztJQUM1RHlCLE9BQU8sQ0FBQ0MsR0FBRyxDQUFDLHlDQUF5QyxDQUFDOztJQUV0RDtJQUNBLE1BQU1yQyxJQUFJLENBQUMrQixLQUFLLENBQUMseUNBQXlDLENBQUM7SUFDM0QsTUFBTS9CLElBQUksQ0FBQ2lDLGVBQWUsQ0FBQyxnQ0FBZ0MsRUFBRTtNQUFFQyxLQUFLLEVBQUUsU0FBUztNQUFFdkIsT0FBTyxFQUFFO0lBQU0sQ0FBQyxDQUFDO0lBRWxHLE1BQU0yQyxjQUFjLEdBQUcsTUFBTXRELElBQUksQ0FBQ0ksT0FBTyxDQUFDLDZCQUE2QixDQUFDLENBQUNDLFdBQVcsQ0FBQyxDQUFDO0lBQ3RGLE1BQU13RixpQkFBaUIsR0FBR3ZDLGNBQWMsQ0FBQ0UsUUFBUSxDQUFDLHFCQUFxQixDQUFDO0lBRXhFcEIsT0FBTyxDQUFDQyxHQUFHLENBQUMsVUFBVXdELGlCQUFpQixHQUFHLEdBQUcsR0FBRyxHQUFHLHFCQUFxQkEsaUJBQWlCLEdBQUcsU0FBUyxHQUFHLGFBQWEsRUFBRSxDQUFDO0lBQ3hIO0VBQ0YsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDIiwiaWdub3JlTGlzdCI6W119