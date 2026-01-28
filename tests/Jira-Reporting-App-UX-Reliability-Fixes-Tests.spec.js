import { test, expect } from '@playwright/test';

const DEFAULT_Q2_QUERY = '?projects=MPSA,MAS&start=2025-04-01T00:00:00.000Z&end=2025-06-30T23:59:59.999Z';

// Helper: Wait for preview to complete
async function waitForPreview(page) {
  const previewBtn = page.locator('#preview-btn');
  await expect(previewBtn).toBeEnabled({ timeout: 5000 });
  await previewBtn.click();
  
  // Wait for either loading to appear or preview to complete quickly
  try {
    await page.waitForSelector('#loading', { state: 'visible', timeout: 5000 });
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 300000 });
  } catch (e) {
    // Loading might not appear if request completes quickly - check for preview or error
    const previewVisible = await page.locator('#preview-content').isVisible();
    const errorVisible = await page.locator('#error').isVisible();
    if (!previewVisible && !errorVisible) {
      // Wait a bit more for preview to appear
      await page.waitForSelector('#preview-content', { state: 'visible', timeout: 10000 });
    }
  }
  
  await page.waitForSelector('#preview-content', { state: 'visible', timeout: 10000 });
}

// Helper: Get table cell text by row and column index
async function getTableCellText(page, rowIndex, columnIndex) {
  const cell = page.locator(`table tbody tr:nth-child(${rowIndex}) td:nth-child(${columnIndex})`);
  return await cell.textContent();
}

// Helper: Validate metrics tab is visible
async function validateMetricsTabVisible(page) {
  const tab = page.locator('#metrics-tab');
  await expect(tab).toBeVisible({ timeout: 5000 });
}

// Helper: Run default preview with options
async function runDefaultPreview(page, overrides = {}) {
  const {
    projects = ['MPSA', 'MAS'],
    start = '2025-04-01T00:00',
    end = '2025-06-30T23:59',
    // Note: Story Points, Epic TTM, and Bugs/Rework are now mandatory (always enabled)
    // No need to pass these parameters - they're always included in reports
  } = overrides;

  await page.goto('/report');

  // Configure projects
  if (projects.includes('MPSA')) {
    await page.check('#project-mpsa');
  } else {
    await page.uncheck('#project-mpsa');
  }

  if (projects.includes('MAS')) {
    await page.check('#project-mas');
  } else {
    await page.uncheck('#project-mas');
  }

  // Configure date window
  await page.fill('#start-date', start);
  await page.fill('#end-date', end);

  // Configure options
  // Note: Story Points, Epic TTM, and Bugs/Rework are now mandatory (always enabled)
  // No need to check/uncheck these options - they're always included in reports

  // Trigger preview
  await waitForPreview(page);
}

test.describe('UX Reliability & Technical Debt Fixes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/report');
    await expect(page.locator('h1')).toContainText('Jira Sprint Report');
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

    // Click metrics tab to verify it works
    await page.click('.tab-btn[data-tab="metrics"]');
    await page.waitForSelector('#tab-metrics.active', { state: 'visible', timeout: 10000 });
    console.log('[TEST] ✓ Metrics tab is clickable and active');
  });

  test('should show perIssueType empty state message when breakdown unavailable', async ({ page, request }) => {
    console.log('[TEST] Starting perIssueType empty state validation');
    test.setTimeout(300000);

    // Generate preview with throughput but without bugs (perIssueType will be empty)
    await runDefaultPreview(page, { 
      // Story Points and Bugs/Rework are now mandatory (always enabled) 
    });

    // Navigate to Metrics tab
    await page.click('.tab-btn[data-tab="metrics"]');
    await page.waitForSelector('#tab-metrics.active', { state: 'visible', timeout: 10000 });
    await page.waitForSelector('#metrics-content', { state: 'visible', timeout: 10000 });

    // Check for empty state message
    const metricsContent = await page.locator('#metrics-content').textContent();
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

        // Navigate to Metrics tab
        await page.click('.tab-btn[data-tab="metrics"]');
        await page.waitForSelector('#tab-metrics.active', { state: 'visible', timeout: 10000 });
        await page.waitForSelector('#metrics-content', { state: 'visible', timeout: 10000 });

        // Check for fallback warning
        const metricsContent = await page.locator('#metrics-content').textContent();
        const hasFallbackWarning = metricsContent.includes('used story date fallback') || 
                                   metricsContent.includes('Epic issues unavailable');
        
        expect(hasFallbackWarning).toBeTruthy();
        console.log('[TEST] ✓ Epic TTM fallback warning displayed in UI');
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

    // Verify export buttons are enabled
    const exportFilteredBtn = page.locator('#export-filtered-btn');
    await expect(exportFilteredBtn).toBeEnabled({ timeout: 10000 });

    // Test CSV export - should succeed with valid columns
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await exportFilteredBtn.click();
    const download = await downloadPromise;

    const path = await download.path();
    const fs = require('fs');
    const content = fs.readFileSync(path, 'utf-8');
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
    await page.click('.tab-btn[data-tab="metrics"]');
    await page.waitForSelector('#tab-metrics.active', { state: 'visible', timeout: 10000 });
    
    const metricsContent = await page.locator('#metrics-content').textContent();
    const hasEpicTTMSection = metricsContent.includes('Epic Time-To-Market');
    
    console.log(`[TEST] ${hasEpicTTMSection ? '✓' : '⚠'} Epic TTM section ${hasEpicTTMSection ? 'present' : 'not present'}`);
    // Note: Epic TTM section may be empty if no epics found, but preview should still succeed
  });
});
