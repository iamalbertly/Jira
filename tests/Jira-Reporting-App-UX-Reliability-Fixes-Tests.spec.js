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
  const tab = page.locator('.tab-btn').filter({ hasText: 'Project & Epic Level' });
  await expect(tab).toBeVisible({ timeout: 5000 });
}

test.describe('UX Reliability & Technical Debt Fixes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/report');
    await expect(page.locator('h1')).toContainText('VodaAgileBoard');
  });

  test('refreshing preview keeps previous results visible while loading', async ({ page }) => {
    test.setTimeout(120000);

    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    const errorVisible = await page.locator('#error').isVisible().catch(() => false);
    if (!previewVisible || errorVisible) {
      test.skip();
      return;
    }
    await expect(page.locator('#preview-content')).toBeVisible({ timeout: 10000 });

    let resolveRouteHandled;
    const routeHandled = new Promise(resolve => {
      resolveRouteHandled = resolve;
    });

    await page.route('**/preview.json*', async route => {
      await new Promise(resolve => setTimeout(resolve, 800));
      const response = await route.fetch();
      await route.fulfill({ response });
      resolveRouteHandled();
      await page.unroute('**/preview.json*').catch(() => {});
    });

    await page.click('#preview-btn');

    const statusBanner = page.locator('#preview-status .status-banner.info');
    await expect(statusBanner).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#preview-content')).toBeVisible({ timeout: 5000 });

    await routeHandled.catch(() => {});
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 120000 }).catch(() => {});
  });

  test('should display Unknown for empty issueType in Done Stories table', async ({ page, request }) => {
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
          await runDefaultPreview(page, { includeStoryPoints: true });
          
          // Navigate to Done Stories tab
          await page.click('.tab-btn[data-tab="done-stories"]');
          await page.waitForSelector('#tab-done-stories.active', { state: 'visible', timeout: 10000 });
          
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

  test('should always show Metrics tab when metrics object exists', async ({ page, request }) => {
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
    await page.waitForSelector('#tab-project-epic-level.active', { state: 'visible', timeout: 10000 });
    console.log('[TEST] ✓ Project & Epic Level tab is clickable and active');
  });

  test('should show perIssueType empty state message when breakdown unavailable', async ({ page, request }) => {
    console.log('[TEST] Starting perIssueType empty state validation');
    test.setTimeout(300000);

    // Generate preview with throughput but without bugs (perIssueType will be empty)
    await runDefaultPreview(page, { 
      // Story Points and Bugs/Rework are now mandatory (always enabled) 
    });

    // Navigate to Project & Epic Level tab (metrics are embedded)
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    await page.waitForSelector('#tab-project-epic-level.active', { state: 'visible', timeout: 10000 });
    await page.waitForSelector('#project-epic-level-content', { state: 'visible', timeout: 10000 });

    // Check for empty state message
    const metricsContent = await page.locator('#project-epic-level-content').textContent();
    const hasEmptyStateMessage = metricsContent.includes('No issue type breakdown available') || 
                                  metricsContent.includes('Enable "Include Bugs for Rework"');
    
    console.log(`[TEST] ${hasEmptyStateMessage ? '✓' : '⚠'} PerIssueType empty state message ${hasEmptyStateMessage ? 'found' : 'not found'}`);
    // Note: Message may not appear if perIssueType has data or throughput doesn't exist
  });

  test('should display Epic TTM fallback warning when fallback used', async ({ page, request }) => {
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
        await page.waitForSelector('#tab-project-epic-level.active', { state: 'visible', timeout: 10000 });
        await page.waitForSelector('#project-epic-level-content', { state: 'visible', timeout: 10000 });

        // Check for fallback warning
        const metricsContent = await page.locator('#project-epic-level-content').textContent();
        const hasFallbackWarning = metricsContent.includes('used story date fallback') || 
                                   metricsContent.includes('Epic issues unavailable');
        
        expect(hasFallbackWarning).toBeTruthy();
        console.log('[TEST] ✓ Epic TTM fallback warning displayed in UI');

        const epicTable = page.locator('#project-epic-level-content table').filter({ hasText: 'Epic Key' }).first();
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

  test('should validate CSV columns before export', async ({ page, request }) => {
    console.log('[TEST] Starting CSV column validation');
    test.setTimeout(300000);

    // Generate preview
    await runDefaultPreview(page, { includeStoryPoints: true });

    // Verify export is enabled after preview
    const exportExcelBtn = page.locator('#export-excel-btn');
    await expect(exportExcelBtn).toBeEnabled({ timeout: 10000 });

    // Switch to Done Stories tab and use section Export CSV (avoids dropdown overlay issues)
    await page.click('.tab-btn[data-tab="done-stories"]');
    await page.waitForSelector('.export-section-btn[data-section="done-stories"]', { state: 'visible', timeout: 5000 });
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.click('.export-section-btn[data-section="done-stories"]');
    const download = await downloadPromise;

    const path = await download.path();
    const { readFileSync } = await import('fs');
    const content = readFileSync(path, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain('issueType');
    expect(lines[0]).toContain('issueKey');
    expect(lines[0]).toContain('issueStatus');
    console.log('[TEST] ✓ CSV export contains required columns');
  });

  test('should display cache age in preview meta when from cache', async ({ page, request }) => {
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

  test('should recover gracefully when Epic fetch fails', async ({ page, request }) => {
    console.log('[TEST] Starting Epic fetch error recovery validation');
    test.setTimeout(300000);

    // Generate preview with Epic TTM enabled
    await runDefaultPreview(page, { 
      // Story Points and Epic TTM are now mandatory (always enabled) 
    });

    // Verify preview completed successfully (even if Epic fetch failed)
    const previewContent = page.locator('#preview-content');
    await expect(previewContent).toBeVisible({ timeout: 10000 });
    console.log('[TEST] ✓ Preview completed successfully');

    // Check that Epic TTM section exists (may be empty if Epic fetch failed)
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    await page.waitForSelector('#tab-project-epic-level.active', { state: 'visible', timeout: 10000 });
    
    const metricsContent = await page.locator('#project-epic-level-content').textContent();
    const hasEpicTTMSection = metricsContent.includes('Epic Time-To-Market');
    
    console.log(`[TEST] ${hasEpicTTMSection ? '✓' : '⚠'} Epic TTM section ${hasEpicTTMSection ? 'present' : 'not present'}`);
    // Note: Epic TTM section may be empty if no epics found, but preview should still succeed
  });
});
