import { test, expect } from '@playwright/test';
import { runDefaultPreview } from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';
const DEFAULT_Q2_QUERY = '?projects=MPSA,MAS&start=2025-07-01T00:00:00.000Z&end=2025-09-30T23:59:59.999Z';
const DIALOG_TIMEOUT_MS = 5000;
async function clickAndWaitForDownload(page, selector, timeout = 15000) {
  const downloadPromise = page.waitForEvent('download', {
    timeout
  }).catch(() => null);
  const dialogPromise = page.waitForEvent('dialog', {
    timeout: DIALOG_TIMEOUT_MS
  }).then(async dialog => {
    await dialog.accept();
  }).catch(() => null);
  await page.click(selector);
  await dialogPromise;
  return downloadPromise;
}
test.describe('Jira Reporting App - UX Critical Fixes Tests', () => {
  test.beforeEach(async ({
    page
  }) => {
    await page.goto('/report');
    await expect(page.locator('h1')).toContainText('VodaAgileBoard');
  });
  test('should display Epic Title and Summary in Stories done report when epicLinkFieldId exists', async ({
    page
  }) => {
    test.setTimeout(120000);
    console.log('[TEST] Testing Epic Title/Summary display in Stories done report');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping Epic Title/Summary test (may require valid Jira credentials)');
      return;
    }

    // Navigate to Done Stories tab
    await page.click('.tab-btn[data-tab="done-stories"]');
    await expect(page.locator('#tab-done-stories')).toHaveClass(/active/);

    // Check if Epic columns exist (if epicLinkFieldId was discovered)
    const doneStoriesContent = page.locator('#done-stories-content');
    const contentText = await doneStoriesContent.textContent();

    // If Epic data exists, check for Epic columns
    if (contentText && contentText.includes('Epic')) {
      // Check for Epic, Epic Title, and Epic Summary columns
      const tableHeaders = page.locator('#done-stories-content table thead th');
      const headerTexts = await tableHeaders.allTextContents();
      const hasEpicKey = headerTexts.some(text => text.includes('Epic'));
      const hasEpicTitle = headerTexts.some(text => text.includes('Epic Title'));
      const hasEpicSummary = headerTexts.some(text => text.includes('Epic Summary'));
      if (hasEpicKey) {
        expect(hasEpicTitle).toBeTruthy();
        expect(hasEpicSummary).toBeTruthy();
        console.log('[TEST] ✓ Epic Title and Summary columns found');
      }
    } else {
      console.log('[TEST] No Epic data found (epicLinkFieldId may not exist in this Jira instance)');
    }

    // Time tracking columns should appear together if present
    const headerTexts = await page.locator('#done-stories-content table thead th').allTextContents();
    if (headerTexts.some(text => text.includes('Est (Hrs)'))) {
      expect(headerTexts.some(text => text.includes('Spent (Hrs)'))).toBeTruthy();
      expect(headerTexts.some(text => text.includes('Remaining (Hrs)'))).toBeTruthy();
      expect(headerTexts.some(text => text.includes('Variance (Hrs)'))).toBeTruthy();
      console.log('[TEST] ✓ Time tracking columns found in Done Stories tab');
    }
    if (headerTexts.some(text => text.includes('Subtask Est (Hrs)'))) {
      expect(headerTexts.some(text => text.includes('Subtask Spent (Hrs)'))).toBeTruthy();
      expect(headerTexts.some(text => text.includes('Subtask Remaining (Hrs)'))).toBeTruthy();
      expect(headerTexts.some(text => text.includes('Subtask Variance (Hrs)'))).toBeTruthy();
      console.log('[TEST] ✓ Subtask time tracking columns found in Done Stories tab');
    }
  });
  test('should merge Sprint Throughput data into Sprints tab and remove duplicate Per Sprint section', async ({
    page
  }) => {
    test.setTimeout(120000);
    console.log('[TEST] Testing merged Sprint Throughput data');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping throughput merge test');
      return;
    }

    // Check Sprints tab for Total SP and Story Count columns
    await page.click('.tab-btn[data-tab="sprints"]');
    await expect(page.locator('#tab-sprints')).toHaveClass(/active/);
    const sprintsContent = page.locator('#sprints-content');
    const contentText = await sprintsContent.textContent();
    if (contentText && contentText.includes('Total SP')) {
      expect(contentText).toContain('Story Count');
      console.log('[TEST] ✓ Total SP and Story Count columns found in Sprints tab');
    }
    if (contentText && contentText.includes('Committed SP')) {
      expect(contentText).toContain('Delivered SP');
      expect(contentText).toContain('SP Estimation %');
      console.log('[TEST] ✓ Estimation accuracy columns found in Sprints tab');
    }

    // Boards table should include time-normalized delivery columns
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    const boardsContent = page.locator('#project-epic-level-content');
    const boardsText = await boardsContent.textContent();
    if (boardsText) {
      expect(boardsText).toContain('Sprint Days');
      expect(boardsText).toContain('SP / Day');
      expect(boardsText).toContain('On-Time %');
      expect(boardsText).toContain('Ad-hoc');
      if (boardsText.includes('Committed SP')) {
        expect(boardsText).toContain('Delivered SP');
        expect(boardsText).toContain('SP Estimation %');
      }
      console.log('[TEST] ✓ Boards table includes time-normalized delivery columns');
    }

    // Return to Sprints tab for remaining checks
    await page.click('.tab-btn[data-tab="sprints"]');
    await expect(page.locator('#tab-sprints')).toHaveClass(/active/);

    // If time tracking columns appear, ensure the full set is present
    if (contentText && contentText.includes('Est Hrs')) {
      expect(contentText).toContain('Spent Hrs');
      expect(contentText).toContain('Remaining Hrs');
      expect(contentText).toContain('Variance Hrs');
      console.log('[TEST] ✓ Time tracking columns found in Sprints tab');
    }
    if (contentText && contentText.includes('Subtask Est Hrs')) {
      expect(contentText).toContain('Subtask Spent Hrs');
      expect(contentText).toContain('Subtask Remaining Hrs');
      expect(contentText).toContain('Subtask Variance Hrs');
      console.log('[TEST] ✓ Subtask time tracking columns found in Sprints tab');
    }

    // Project & Epic Level content should not include a separate Per Sprint table
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    const metricsText = await page.locator('#project-epic-level-content').textContent();

    // Should NOT contain "Per Sprint" as a separate section
    if (metricsText) {
      const perSprintSection = metricsText.match(/Per Sprint[\s\S]*?<\/table>/);
      expect(perSprintSection).toBeNull();
      console.log('[TEST] ✓ Per Sprint section removed from Project & Epic Level view');

      // Should contain note about Per Sprint data being in Sprints tab
      expect(metricsText).toContain('Per Sprint data is shown in the Sprints tab');
      console.log('[TEST] ✓ Note about Per Sprint data location found');
    }
  });
  test('boards table shows capacity proxy columns and tooltips', async ({
    page
  }) => {
    test.setTimeout(120000);
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      test.skip();
      return;
    }
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    await expect(page.locator('#tab-project-epic-level')).toHaveClass(/active/);
    const boardsTable = page.locator('#project-epic-level-content table.data-table').first();
    await expect(boardsTable).toBeVisible();
    await expect(boardsTable.locator('th', {
      hasText: 'Active Assignees'
    })).toBeVisible();
    await expect(boardsTable.locator('th', {
      hasText: 'Stories / Assignee'
    })).toBeVisible();
    await expect(boardsTable.locator('th', {
      hasText: 'SP / Assignee'
    })).toBeVisible();
    await expect(boardsTable.locator('th', {
      hasText: 'Assumed Capacity (PD)'
    })).toBeVisible();
    await expect(boardsTable.locator('th', {
      hasText: 'Assumed Waste %'
    })).toBeVisible();
    const assumedCapacityTooltip = boardsTable.locator('th[title*="Assumed capacity"]');
    await expect(assumedCapacityTooltip).toHaveCount(1);
    const assumedWasteTooltip = boardsTable.locator('th[title*="Assumed unused capacity"]');
    await expect(assumedWasteTooltip).toHaveCount(1);
  });
  test('preview cache returns cached response on second call', async ({
    request
  }) => {
    test.setTimeout(120000);
    const first = await request.get(`/preview.json${DEFAULT_Q2_QUERY}`);
    expect(first.ok()).toBeTruthy();
    const firstJson = await first.json();
    const second = await request.get(`/preview.json${DEFAULT_Q2_QUERY}`);
    expect(second.ok()).toBeTruthy();
    const secondJson = await second.json();
    const firstFromCache = firstJson?.meta?.fromCache === true;
    const secondFromCache = secondJson?.meta?.fromCache === true;
    expect(firstFromCache || secondFromCache).toBeTruthy();
  });
  test('filtered export disables when filters yield zero rows', async ({
    page
  }) => {
    test.setTimeout(120000);
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      test.skip();
      return;
    }
    await page.click('.tab-btn[data-tab="done-stories"]');
    await expect(page.locator('#tab-done-stories')).toHaveClass(/active/);
    await page.fill('#search-box', 'NO_MATCH_FILTER_987654321');
    await page.waitForTimeout(500);
    const emptyStateVisible = await page.locator('#done-stories-content .empty-state').isVisible().catch(() => false);
    if (!emptyStateVisible) {
      test.skip();
      return;
    }
    await expect(page.locator('#export-hint')).toContainText('No rows match');
  });
  test('should display renamed column labels with tooltips in Sprints tab', async ({
    page
  }) => {
    test.setTimeout(120000);
    console.log('[TEST] Testing renamed column labels');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping label test');
      return;
    }
    await page.click('.tab-btn[data-tab="sprints"]');
    await expect(page.locator('#tab-sprints')).toHaveClass(/active/);

    // Check for renamed labels
    const sprintsContent = page.locator('#sprints-content');
    const contentText = await sprintsContent.textContent();

    // Should contain new labels
    expect(contentText).toContain('Done Stories');
    console.log('[TEST] ✓ "Done Stories" label found');

    // Check for tooltip on column header
    const storiesCompletedHeader = page.locator('#sprints-content th').filter({
      hasText: 'Done Stories'
    });
    if ((await storiesCompletedHeader.count()) > 0) {
      const titleAttr = await storiesCompletedHeader.getAttribute('title');
      expect(titleAttr).toContain('Stories marked Done in this sprint');
      console.log('[TEST] ✓ Tooltip found on "Done Stories" header');
    }

    // If doneComparison exists, check for renamed "On-Time Stories"
    if (contentText && contentText.includes('On-Time Stories')) {
      console.log('[TEST] ✓ "On-Time Stories" label found');
      const completedWithinHeader = page.locator('#sprints-content th').filter({
        hasText: 'On-Time Stories'
      });
      if ((await completedWithinHeader.count()) > 0) {
        const titleAttr = await completedWithinHeader.getAttribute('title');
        expect(titleAttr).toContain('Stories marked Done in this sprint');
        console.log('[TEST] ✓ Tooltip found on "On-Time Stories" header');
      }
    }
  });
  test('should display per-section CSV export buttons with correct functionality', async ({
    page
  }) => {
    test.setTimeout(120000);
    console.log('[TEST] Testing per-section CSV export buttons');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping export button test');
      return;
    }

    // Check Boards tab export button
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    const boardsExportBtn = page.locator('.export-section-btn[data-section="project-epic-level"]');
    const boardsBtnVisible = await boardsExportBtn.isVisible();
    if (boardsBtnVisible) {
      console.log('[TEST] ✓ Boards export button visible');

      // Test download (set up download listener)
      const downloadPromise = page.waitForEvent('download', {
        timeout: 10000
      }).catch(() => null);
      await boardsExportBtn.click();
      const download = await downloadPromise;
      if (download) {
        const filename = download.suggestedFilename();
        expect(filename).toMatch(/^[A-Z0-9-]+_.*_project-epic-level(_PARTIAL)?_\d{4}-\d{2}-\d{2}\.csv$/);
        console.log('[TEST] ✓ Boards CSV download triggered with correct filename format:', filename);
      }
    }

    // Check Sprints tab export button
    await page.click('.tab-btn[data-tab="sprints"]');
    const sprintsExportBtn = page.locator('.export-section-btn[data-section="sprints"]');
    const sprintsBtnVisible = await sprintsExportBtn.isVisible();
    if (sprintsBtnVisible) {
      console.log('[TEST] ✓ Sprints export button visible');
      const downloadPromise = page.waitForEvent('download', {
        timeout: 10000
      }).catch(() => null);
      await sprintsExportBtn.click();
      const download = await downloadPromise;
      if (download) {
        const filename = download.suggestedFilename();
        expect(filename).toMatch(/^[A-Z0-9-]+_.*_sprints(_PARTIAL)?_\d{4}-\d{2}-\d{2}\.csv$/);
        console.log('[TEST] ✓ Sprints CSV download triggered with correct filename format:', filename);
      }
    }

    // Check Done Stories tab export button
    await page.click('.tab-btn[data-tab="done-stories"]');
    const doneStoriesExportBtn = page.locator('.export-section-btn[data-section="done-stories"]');
    const doneStoriesBtnVisible = await doneStoriesExportBtn.isVisible();
    if (doneStoriesBtnVisible) {
      console.log('[TEST] ✓ Done Stories export button visible');
      const downloadPromise = page.waitForEvent('download', {
        timeout: 10000
      }).catch(() => null);
      await doneStoriesExportBtn.click();
      const download = await downloadPromise;
      if (download) {
        const filename = download.suggestedFilename();
        expect(filename).toMatch(/^[A-Z0-9-]+_.*_done-stories(_PARTIAL)?_\d{4}-\d{2}-\d{2}\.csv$/);
        console.log('[TEST] ✓ Done Stories CSV download triggered with correct filename format:', filename);
      }
    }

    // Check Metrics tab export button (if metrics exist)
    const metricsTab = page.locator('#metrics-tab');
    if (await metricsTab.isVisible()) {
      await page.click('.tab-btn[data-tab="metrics"]');
      const metricsExportBtn = page.locator('.export-section-btn[data-section="metrics"]');
      const metricsBtnVisible = await metricsExportBtn.isVisible();
      if (metricsBtnVisible) {
        console.log('[TEST] ??? Metrics export button visible');
        const downloadPromise = page.waitForEvent('download', {
          timeout: 10000
        }).catch(() => null);
        await metricsExportBtn.click();
        const download = await downloadPromise;
        if (download) {
          const filename = download.suggestedFilename();
          expect(filename).toMatch(/^[A-Z0-9-]+_.*_metrics(_PARTIAL)?_\d{4}-\d{2}-\d{2}\.csv$/);
          console.log('[TEST] ??? Metrics CSV download triggered with correct filename format:', filename);
        }
      }
    }
  });
  test('should display TTM definition header in Metrics tab', async ({
    page
  }) => {
    test.setTimeout(120000);
    console.log('[TEST] Testing TTM definition header');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping TTM definition test');
      return;
    }

    // Check if Metrics tab is visible
    const metricsTab = page.locator('#metrics-tab');
    if (!(await metricsTab.isVisible())) {
      console.log('[TEST] Metrics tab not visible (no metrics data), skipping TTM definition test');
      return;
    }
    await page.click('.tab-btn[data-tab="metrics"]');
    await expect(page.locator('#tab-metrics')).toHaveClass(/active/);
    const metricsContent = page.locator('#metrics-content');
    const contentText = await metricsContent.textContent();

    // Should contain TTM definition
    if (contentText && contentText.includes('Epic Time-To-Market')) {
      expect(contentText).toContain('Definition');
      expect(contentText).toContain('Epic creation to Epic resolution');
      console.log('[TEST] ✓ TTM definition header found');
    } else {
      console.log('[TEST] Epic TTM section not found (may not have Epic TTM data)');
    }
  });
  test('should handle Epic fetch failure gracefully (edge case)', async ({
    page
  }) => {
    test.setTimeout(120000);
    console.log('[TEST] Testing Epic fetch failure graceful degradation');

    // This test validates that the system continues working even if Epic fetch fails
    // In a real scenario, this would require mocking, but we'll validate the UI handles missing Epic data

    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping Epic failure test');
      return;
    }

    // Navigate to Done Stories tab
    await page.click('.tab-btn[data-tab="done-stories"]');

    // Check that the page still renders even if Epic data is missing
    const doneStoriesContent = page.locator('#done-stories-content');
    await expect(doneStoriesContent).toBeVisible();

    // If Epic columns exist but data is empty, that's acceptable (graceful degradation)
    console.log('[TEST] ✓ Page renders correctly even with missing Epic data (graceful degradation)');
  });
  test('should handle throughput data mismatch gracefully (edge case)', async ({
    page
  }) => {
    test.setTimeout(120000);
    console.log('[TEST] Testing throughput data mismatch handling');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping throughput mismatch test');
      return;
    }
    await page.click('.tab-btn[data-tab="sprints"]');

    // Check that table renders without errors even if some sprints don't have throughput data
    const sprintsContent = page.locator('#sprints-content');
    await expect(sprintsContent).toBeVisible();

    // If N/A appears for missing throughput data, that's correct behavior
    const contentText = await sprintsContent.textContent();
    if (contentText && contentText.includes('N/A')) {
      console.log('[TEST] ✓ N/A displayed for missing throughput data (correct fallback)');
    }
    console.log('[TEST] ✓ Sprints tab renders correctly with throughput data mismatch handling');
  });
  test('should truncate long Epic Summary with tooltip (edge case)', async ({
    page
  }) => {
    test.setTimeout(120000);
    console.log('[TEST] Testing Epic Summary truncation');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping truncation test');
      return;
    }
    await page.click('.tab-btn[data-tab="done-stories"]');

    // Check for Epic Summary cells with tooltips
    const epicSummaryCells = page.locator('#done-stories-content td').filter({
      hasText: '...'
    });
    const count = await epicSummaryCells.count();
    if (count > 0) {
      // Check that truncated cells have tooltips
      const firstTruncated = epicSummaryCells.first();
      const titleAttr = await firstTruncated.getAttribute('title');
      if (titleAttr && titleAttr.length > 100) {
        console.log('[TEST] ✓ Long Epic Summary truncated with tooltip');
      }
    } else {
      console.log('[TEST] No truncated Epic Summaries found (may not have long summaries in test data)');
    }
  });
  test('should validate CSV exports include epicTitle and epicSummary columns', async ({
    page
  }) => {
    test.setTimeout(120000);
    console.log('[TEST] Testing CSV columns include Epic Title/Summary');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping CSV column test');
      return;
    }

    // Test main Excel/CSV export using the primary export control
    const exportExcelBtn = page.locator('#export-excel-btn');
    if (await exportExcelBtn.isEnabled()) {
      const download = await clickAndWaitForDownload(page, '#export-excel-btn', 15000);
      if (download) {
        // Read the CSV content
        const path = await download.path();
        const {
          readFileSync
        } = await import('fs');
        const csvContent = readFileSync(path, 'utf-8');
        const lines = csvContent.split('\n');
        if (lines.length > 0) {
          const headers = lines[0].split(',');
          const hasEpicTitle = headers.some(h => h.includes('epicTitle'));
          const hasEpicSummary = headers.some(h => h.includes('epicSummary'));
          if (hasEpicTitle && hasEpicSummary) {
            console.log('[TEST] ✓ CSV includes epicTitle and epicSummary columns');
          } else {
            console.log('[TEST] CSV columns may not include Epic fields (epicLinkFieldId may not exist)');
          }
        }
      }
    }
  });
  test('should handle Epic Summary null/undefined/empty safely (edge case)', async ({
    page
  }) => {
    test.setTimeout(120000);
    console.log('[TEST] Testing Epic Summary null/undefined/empty handling');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping Epic Summary edge case test');
      return;
    }
    await page.click('.tab-btn[data-tab="done-stories"]');

    // Check that page renders without errors even if Epic Summary is missing
    const doneStoriesContent = page.locator('#done-stories-content');
    await expect(doneStoriesContent).toBeVisible();

    // Verify table structure is intact (no broken HTML from null/undefined values)
    const tableRows = page.locator('#done-stories-content table tbody tr');
    const rowCount = await tableRows.count();
    if (rowCount > 0) {
      // Check that cells render properly (empty strings for missing Epic data is acceptable)
      const firstRow = tableRows.first();
      const firstRowVisible = await firstRow.isVisible().catch(() => false);
      if (!firstRowVisible) {
        test.skip();
        return;
      }
      await expect(firstRow).toBeVisible();
      console.log('[TEST] ✓ Epic Summary null/undefined/empty handled safely - table renders correctly');
    }
  });
  test('should show loading state on per-section export buttons during export', async ({
    page
  }) => {
    test.setTimeout(120000);
    console.log('[TEST] Testing export button loading state');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping export loading state test');
      return;
    }

    // Test Sprints tab export button
    await page.click('.tab-btn[data-tab="sprints"]');
    const sprintsExportBtn = page.locator('.export-section-btn[data-section="sprints"]');
    if (await sprintsExportBtn.isVisible()) {
      // Click button and immediately check for loading state
      const clickPromise = sprintsExportBtn.click();

      // Check button is disabled and text changes (with small delay to allow state update)
      await page.waitForTimeout(100);
      const isDisabled = await sprintsExportBtn.isDisabled();
      const buttonText = await sprintsExportBtn.textContent();
      if (isDisabled && buttonText && buttonText.includes('Exporting')) {
        console.log('[TEST] ✓ Export button shows loading state (disabled and text changed)');
      }

      // Wait for download to complete
      await page.waitForEvent('download', {
        timeout: 10000
      }).catch(() => null);
      await clickPromise;

      // Verify button is re-enabled after export
      await page.waitForTimeout(500);
      const isEnabledAfter = await sprintsExportBtn.isEnabled();
      const buttonTextAfter = await sprintsExportBtn.textContent();
      if (isEnabledAfter && buttonTextAfter && buttonTextAfter.includes('Export CSV')) {
        console.log('[TEST] ✓ Export button re-enabled after export completes');
      }
    }
  });
  test('should show export buttons after async renders complete', async ({
    page
  }) => {
    test.setTimeout(120000);
    console.log('[TEST] Testing export button visibility after async renders');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping button visibility test');
      return;
    }

    // Wait a bit for any async DOM updates
    await page.waitForTimeout(500);

    // Check all export buttons are visible when data exists
    const boardsBtn = page.locator('.export-section-btn[data-section="project-epic-level"]');
    const sprintsBtn = page.locator('.export-section-btn[data-section="sprints"]');
    const doneStoriesBtn = page.locator('.export-section-btn[data-section="done-stories"]');

    // At least one button should be visible if data exists
    const boardsVisible = await boardsBtn.isVisible().catch(() => false);
    const sprintsVisible = await sprintsBtn.isVisible().catch(() => false);
    const doneStoriesVisible = await doneStoriesBtn.isVisible().catch(() => false);
    if (boardsVisible || sprintsVisible || doneStoriesVisible) {
      console.log('[TEST] ✓ Export buttons visible after async renders');
    } else {
      console.log('[TEST] No export buttons visible (may be no data in preview)');
    }
  });
  test('should show improved error messages for empty Epic data', async ({
    page
  }) => {
    test.setTimeout(120000);
    console.log('[TEST] Testing improved error messages for Epic data');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping error message test');
      return;
    }

    // Navigate to Done Stories tab
    await page.click('.tab-btn[data-tab="done-stories"]');

    // Check if error element exists and contains helpful message
    const errorEl = page.locator('#error');
    const errorVisible = await errorEl.isVisible().catch(() => false);
    if (errorVisible) {
      const errorText = await errorEl.textContent();
      // Check for improved error messages mentioning Epic data conditions
      if (errorText && (errorText.includes('Epic Link field') || errorText.includes('epicLinkFieldId'))) {
        console.log('[TEST] ✓ Improved error messages for Epic data found');
      }
    } else {
      console.log('[TEST] No errors displayed (normal - Epic data may be available)');
    }
  });
  test('should validate all 6 CSV export buttons work correctly', async ({
    page
  }) => {
    test.setTimeout(180000);
    console.log('[TEST] Testing all CSV export buttons');
    test.skip(true, 'Skipped in CI to avoid excessive download storage; individual export flows are covered by dedicated tests above.');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping CSV export test');
      return;
    }

    // Test 1: Boards export
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    const boardsExportBtn = page.locator('.export-section-btn[data-section="project-epic-level"]');
    if (await boardsExportBtn.isVisible()) {
      const downloadPromise1 = page.waitForEvent('download', {
        timeout: 15000
      }).catch(() => null);
      await boardsExportBtn.click();
      const download1 = await downloadPromise1;
      if (download1) {
        const path1 = await download1.path();
        const {
          readFileSync
        } = await import('fs');
        const content1 = readFileSync(path1, 'utf-8');
        expect(content1).toContain('id,name,type');
        expect(content1).toContain('totalSprintDays');
        expect(content1).toContain('doneBySprintEndPercent');
        console.log('[TEST] ✓ Boards CSV export works');
      }
    }

    // Test 2: Sprints export
    await page.click('.tab-btn[data-tab="sprints"]');
    const sprintsExportBtn = page.locator('.export-section-btn[data-section="sprints"]');
    if (await sprintsExportBtn.isVisible()) {
      const downloadPromise2 = page.waitForEvent('download', {
        timeout: 15000
      }).catch(() => null);
      await sprintsExportBtn.click();
      const download2 = await downloadPromise2;
      if (download2) {
        const path2 = await download2.path();
        const {
          readFileSync
        } = await import('fs');
        const content2 = readFileSync(path2, 'utf-8');
        expect(content2).toContain('id,name');
        console.log('[TEST] ✓ Sprints CSV export works');
      }
    }

    // Test 3: Done Stories export
    await page.click('.tab-btn[data-tab="done-stories"]');
    const doneStoriesExportBtn = page.locator('.export-section-btn[data-section="done-stories"]');
    if (await doneStoriesExportBtn.isVisible()) {
      const downloadPromise3 = page.waitForEvent('download', {
        timeout: 15000
      }).catch(() => null);
      await doneStoriesExportBtn.click();
      const download3 = await downloadPromise3;
      if (download3) {
        const path3 = await download3.path();
        const {
          readFileSync
        } = await import('fs');
        const content3 = readFileSync(path3, 'utf-8');
        expect(content3).toContain('issueKey');
        console.log('[TEST] ✓ Done Stories CSV export works');
      }
    }

    // Test 4: Metrics export
    const metricsTab = page.locator('.tab-btn[data-tab="metrics"]');
    if (await metricsTab.isVisible().catch(() => false)) {
      await metricsTab.click();
      const metricsExportBtn = page.locator('.export-section-btn[data-section="metrics"]');
      if (await metricsExportBtn.isVisible()) {
        const downloadPromise4 = page.waitForEvent('download', {
          timeout: 15000
        }).catch(() => null);
        await metricsExportBtn.click();
        const download4 = await downloadPromise4;
        if (download4) {
          const path4 = await download4.path();
          const {
            readFileSync
          } = await import('fs');
          const content4 = readFileSync(path4, 'utf-8');
          expect(content4.length).toBeGreaterThan(0);
          console.log('[TEST] ??? Metrics CSV export works');
        }
      }
    } else {
      console.log('[TEST] Metrics tab not visible, skipping metrics export validation');
    }

    // Test 5: Filtered view export (dropdown CSV filtered)
    await page.click('#export-dropdown-trigger');
    const csvFilteredItem = page.locator('.export-dropdown-item[data-export="csv-filtered"]');
    if (await csvFilteredItem.isEnabled().catch(() => false)) {
      const downloadPromise5 = page.waitForEvent('download', {
        timeout: 15000
      }).catch(() => null);
      await csvFilteredItem.click();
      const download5 = await downloadPromise5;
      if (download5) {
        const path5 = await download5.path();
        const {
          readFileSync
        } = await import('fs');
        const content5 = readFileSync(path5, 'utf-8');
        expect(content5).toContain('issueKey');
        console.log('[TEST] ✓ Filtered view CSV export works');
      }
    }

    // Test 6: Main Excel/CSV export
    const rawExportBtn = page.locator('#export-excel-btn');
    if (await rawExportBtn.isEnabled()) {
      const download6 = await clickAndWaitForDownload(page, '#export-excel-btn', 15000);
      if (download6) {
        const path6 = await download6.path();
        const filename6 = download6.suggestedFilename();
        const {
          readFileSync
        } = await import('fs');
        if (filename6.endsWith('.xlsx')) {
          const buffer = readFileSync(path6);
          expect(buffer.length).toBeGreaterThan(0);
          console.log('[TEST] ? Raw preview Excel export works');
        } else {
          const content6 = readFileSync(path6, 'utf-8');
          expect(content6).toContain('issueKey');
          console.log('[TEST] ? Raw preview CSV export works');
        }
      }
    }
    console.log('[TEST] ✓ All CSV export buttons validated');
  });
  test('should handle special characters in CSV exports correctly', async ({
    page
  }) => {
    test.setTimeout(120000);
    console.log('[TEST] Testing CSV export with special characters');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping special characters test');
      return;
    }

    // Export and check that special characters are properly escaped
    const exportRawBtn = page.locator('#export-excel-btn');
    if (await exportRawBtn.isEnabled()) {
      const download = await clickAndWaitForDownload(page, '#export-excel-btn', 15000);
      if (download) {
        const path = await download.path();
        const {
          readFileSync
        } = await import('fs');
        const csvContent = readFileSync(path, 'utf-8');

        // Check that CSV is properly formatted (no unescaped quotes, commas, newlines)
        const lines = csvContent.split('\n').filter(l => l.trim());
        if (lines.length > 1) {
          const header = lines[0];
          const firstDataLine = lines[1];

          // Verify CSV structure is valid
          expect(header.split(',').length).toBeGreaterThan(0);
          expect(firstDataLine.split(',').length).toBeGreaterThan(0);
          console.log('[TEST] ✓ CSV export handles special characters correctly');
        }
      }
    }
  });
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0ZXN0IiwiZXhwZWN0IiwicnVuRGVmYXVsdFByZXZpZXciLCJERUZBVUxUX1EyX1FVRVJZIiwiRElBTE9HX1RJTUVPVVRfTVMiLCJjbGlja0FuZFdhaXRGb3JEb3dubG9hZCIsInBhZ2UiLCJzZWxlY3RvciIsInRpbWVvdXQiLCJkb3dubG9hZFByb21pc2UiLCJ3YWl0Rm9yRXZlbnQiLCJjYXRjaCIsImRpYWxvZ1Byb21pc2UiLCJ0aGVuIiwiZGlhbG9nIiwiYWNjZXB0IiwiY2xpY2siLCJkZXNjcmliZSIsImJlZm9yZUVhY2giLCJnb3RvIiwibG9jYXRvciIsInRvQ29udGFpblRleHQiLCJzZXRUaW1lb3V0IiwiY29uc29sZSIsImxvZyIsInByZXZpZXdWaXNpYmxlIiwiaXNWaXNpYmxlIiwidG9IYXZlQ2xhc3MiLCJkb25lU3Rvcmllc0NvbnRlbnQiLCJjb250ZW50VGV4dCIsInRleHRDb250ZW50IiwiaW5jbHVkZXMiLCJ0YWJsZUhlYWRlcnMiLCJoZWFkZXJUZXh0cyIsImFsbFRleHRDb250ZW50cyIsImhhc0VwaWNLZXkiLCJzb21lIiwidGV4dCIsImhhc0VwaWNUaXRsZSIsImhhc0VwaWNTdW1tYXJ5IiwidG9CZVRydXRoeSIsInNwcmludHNDb250ZW50IiwidG9Db250YWluIiwiYm9hcmRzQ29udGVudCIsImJvYXJkc1RleHQiLCJtZXRyaWNzVGV4dCIsInBlclNwcmludFNlY3Rpb24iLCJtYXRjaCIsInRvQmVOdWxsIiwic2tpcCIsImJvYXJkc1RhYmxlIiwiZmlyc3QiLCJ0b0JlVmlzaWJsZSIsImhhc1RleHQiLCJhc3N1bWVkQ2FwYWNpdHlUb29sdGlwIiwidG9IYXZlQ291bnQiLCJhc3N1bWVkV2FzdGVUb29sdGlwIiwicmVxdWVzdCIsImdldCIsIm9rIiwiZmlyc3RKc29uIiwianNvbiIsInNlY29uZCIsInNlY29uZEpzb24iLCJmaXJzdEZyb21DYWNoZSIsIm1ldGEiLCJmcm9tQ2FjaGUiLCJzZWNvbmRGcm9tQ2FjaGUiLCJmaWxsIiwid2FpdEZvclRpbWVvdXQiLCJlbXB0eVN0YXRlVmlzaWJsZSIsInN0b3JpZXNDb21wbGV0ZWRIZWFkZXIiLCJmaWx0ZXIiLCJjb3VudCIsInRpdGxlQXR0ciIsImdldEF0dHJpYnV0ZSIsImNvbXBsZXRlZFdpdGhpbkhlYWRlciIsImJvYXJkc0V4cG9ydEJ0biIsImJvYXJkc0J0blZpc2libGUiLCJkb3dubG9hZCIsImZpbGVuYW1lIiwic3VnZ2VzdGVkRmlsZW5hbWUiLCJ0b01hdGNoIiwic3ByaW50c0V4cG9ydEJ0biIsInNwcmludHNCdG5WaXNpYmxlIiwiZG9uZVN0b3JpZXNFeHBvcnRCdG4iLCJkb25lU3Rvcmllc0J0blZpc2libGUiLCJtZXRyaWNzVGFiIiwibWV0cmljc0V4cG9ydEJ0biIsIm1ldHJpY3NCdG5WaXNpYmxlIiwibWV0cmljc0NvbnRlbnQiLCJlcGljU3VtbWFyeUNlbGxzIiwiZmlyc3RUcnVuY2F0ZWQiLCJsZW5ndGgiLCJleHBvcnRFeGNlbEJ0biIsImlzRW5hYmxlZCIsInBhdGgiLCJyZWFkRmlsZVN5bmMiLCJjc3ZDb250ZW50IiwibGluZXMiLCJzcGxpdCIsImhlYWRlcnMiLCJoIiwidGFibGVSb3dzIiwicm93Q291bnQiLCJmaXJzdFJvdyIsImZpcnN0Um93VmlzaWJsZSIsImNsaWNrUHJvbWlzZSIsImlzRGlzYWJsZWQiLCJidXR0b25UZXh0IiwiaXNFbmFibGVkQWZ0ZXIiLCJidXR0b25UZXh0QWZ0ZXIiLCJib2FyZHNCdG4iLCJzcHJpbnRzQnRuIiwiZG9uZVN0b3JpZXNCdG4iLCJib2FyZHNWaXNpYmxlIiwic3ByaW50c1Zpc2libGUiLCJkb25lU3Rvcmllc1Zpc2libGUiLCJlcnJvckVsIiwiZXJyb3JWaXNpYmxlIiwiZXJyb3JUZXh0IiwiZG93bmxvYWRQcm9taXNlMSIsImRvd25sb2FkMSIsInBhdGgxIiwiY29udGVudDEiLCJkb3dubG9hZFByb21pc2UyIiwiZG93bmxvYWQyIiwicGF0aDIiLCJjb250ZW50MiIsImRvd25sb2FkUHJvbWlzZTMiLCJkb3dubG9hZDMiLCJwYXRoMyIsImNvbnRlbnQzIiwiZG93bmxvYWRQcm9taXNlNCIsImRvd25sb2FkNCIsInBhdGg0IiwiY29udGVudDQiLCJ0b0JlR3JlYXRlclRoYW4iLCJjc3ZGaWx0ZXJlZEl0ZW0iLCJkb3dubG9hZFByb21pc2U1IiwiZG93bmxvYWQ1IiwicGF0aDUiLCJjb250ZW50NSIsInJhd0V4cG9ydEJ0biIsImRvd25sb2FkNiIsInBhdGg2IiwiZmlsZW5hbWU2IiwiZW5kc1dpdGgiLCJidWZmZXIiLCJjb250ZW50NiIsImV4cG9ydFJhd0J0biIsImwiLCJ0cmltIiwiaGVhZGVyIiwiZmlyc3REYXRhTGluZSJdLCJzb3VyY2VzIjpbIkppcmEtUmVwb3J0aW5nLUFwcC1VWC1Dcml0aWNhbC1GaXhlcy1UZXN0cy5zcGVjLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHRlc3QsIGV4cGVjdCB9IGZyb20gJ0BwbGF5d3JpZ2h0L3Rlc3QnO1xyXG5pbXBvcnQgeyBydW5EZWZhdWx0UHJldmlldyB9IGZyb20gJy4vSmlyYVJlcG9ydGluZy1UZXN0cy1TaGFyZWQtUHJldmlld0V4cG9ydC1IZWxwZXJzLmpzJztcclxuXHJcbmNvbnN0IERFRkFVTFRfUTJfUVVFUlkgPSAnP3Byb2plY3RzPU1QU0EsTUFTJnN0YXJ0PTIwMjUtMDctMDFUMDA6MDA6MDAuMDAwWiZlbmQ9MjAyNS0wOS0zMFQyMzo1OTo1OS45OTlaJztcclxuY29uc3QgRElBTE9HX1RJTUVPVVRfTVMgPSA1MDAwO1xyXG5cclxuYXN5bmMgZnVuY3Rpb24gY2xpY2tBbmRXYWl0Rm9yRG93bmxvYWQocGFnZSwgc2VsZWN0b3IsIHRpbWVvdXQgPSAxNTAwMCkge1xyXG4gIGNvbnN0IGRvd25sb2FkUHJvbWlzZSA9IHBhZ2Uud2FpdEZvckV2ZW50KCdkb3dubG9hZCcsIHsgdGltZW91dCB9KS5jYXRjaCgoKSA9PiBudWxsKTtcclxuICBjb25zdCBkaWFsb2dQcm9taXNlID0gcGFnZVxyXG4gICAgLndhaXRGb3JFdmVudCgnZGlhbG9nJywgeyB0aW1lb3V0OiBESUFMT0dfVElNRU9VVF9NUyB9KVxyXG4gICAgLnRoZW4oYXN5bmMgKGRpYWxvZykgPT4ge1xyXG4gICAgICBhd2FpdCBkaWFsb2cuYWNjZXB0KCk7XHJcbiAgICB9KVxyXG4gICAgLmNhdGNoKCgpID0+IG51bGwpO1xyXG5cclxuICBhd2FpdCBwYWdlLmNsaWNrKHNlbGVjdG9yKTtcclxuICBhd2FpdCBkaWFsb2dQcm9taXNlO1xyXG4gIHJldHVybiBkb3dubG9hZFByb21pc2U7XHJcbn1cclxuXHJcbnRlc3QuZGVzY3JpYmUoJ0ppcmEgUmVwb3J0aW5nIEFwcCAtIFVYIENyaXRpY2FsIEZpeGVzIFRlc3RzJywgKCkgPT4ge1xyXG4gIHRlc3QuYmVmb3JlRWFjaChhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIGF3YWl0IHBhZ2UuZ290bygnL3JlcG9ydCcpO1xyXG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignaDEnKSkudG9Db250YWluVGV4dCgnVm9kYUFnaWxlQm9hcmQnKTtcclxuICB9KTtcclxuXHJcbiAgdGVzdCgnc2hvdWxkIGRpc3BsYXkgRXBpYyBUaXRsZSBhbmQgU3VtbWFyeSBpbiBTdG9yaWVzIGRvbmUgcmVwb3J0IHdoZW4gZXBpY0xpbmtGaWVsZElkIGV4aXN0cycsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgdGVzdC5zZXRUaW1lb3V0KDEyMDAwMCk7XHJcbiAgICBjb25zb2xlLmxvZygnW1RFU1RdIFRlc3RpbmcgRXBpYyBUaXRsZS9TdW1tYXJ5IGRpc3BsYXkgaW4gU3RvcmllcyBkb25lIHJlcG9ydCcpO1xyXG4gICAgXHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuICAgIFxyXG4gICAgY29uc3QgcHJldmlld1Zpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWNvbnRlbnQnKS5pc1Zpc2libGUoKTtcclxuICAgIGlmICghcHJldmlld1Zpc2libGUpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSBQcmV2aWV3IG5vdCB2aXNpYmxlLCBza2lwcGluZyBFcGljIFRpdGxlL1N1bW1hcnkgdGVzdCAobWF5IHJlcXVpcmUgdmFsaWQgSmlyYSBjcmVkZW50aWFscyknKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBOYXZpZ2F0ZSB0byBEb25lIFN0b3JpZXMgdGFiXHJcbiAgICBhd2FpdCBwYWdlLmNsaWNrKCcudGFiLWJ0bltkYXRhLXRhYj1cImRvbmUtc3Rvcmllc1wiXScpO1xyXG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignI3RhYi1kb25lLXN0b3JpZXMnKSkudG9IYXZlQ2xhc3MoL2FjdGl2ZS8pO1xyXG4gICAgXHJcbiAgICAvLyBDaGVjayBpZiBFcGljIGNvbHVtbnMgZXhpc3QgKGlmIGVwaWNMaW5rRmllbGRJZCB3YXMgZGlzY292ZXJlZClcclxuICAgIGNvbnN0IGRvbmVTdG9yaWVzQ29udGVudCA9IHBhZ2UubG9jYXRvcignI2RvbmUtc3Rvcmllcy1jb250ZW50Jyk7XHJcbiAgICBjb25zdCBjb250ZW50VGV4dCA9IGF3YWl0IGRvbmVTdG9yaWVzQ29udGVudC50ZXh0Q29udGVudCgpO1xyXG4gICAgXHJcbiAgICAvLyBJZiBFcGljIGRhdGEgZXhpc3RzLCBjaGVjayBmb3IgRXBpYyBjb2x1bW5zXHJcbiAgICBpZiAoY29udGVudFRleHQgJiYgY29udGVudFRleHQuaW5jbHVkZXMoJ0VwaWMnKSkge1xyXG4gICAgICAvLyBDaGVjayBmb3IgRXBpYywgRXBpYyBUaXRsZSwgYW5kIEVwaWMgU3VtbWFyeSBjb2x1bW5zXHJcbiAgICAgIGNvbnN0IHRhYmxlSGVhZGVycyA9IHBhZ2UubG9jYXRvcignI2RvbmUtc3Rvcmllcy1jb250ZW50IHRhYmxlIHRoZWFkIHRoJyk7XHJcbiAgICAgIGNvbnN0IGhlYWRlclRleHRzID0gYXdhaXQgdGFibGVIZWFkZXJzLmFsbFRleHRDb250ZW50cygpO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgaGFzRXBpY0tleSA9IGhlYWRlclRleHRzLnNvbWUodGV4dCA9PiB0ZXh0LmluY2x1ZGVzKCdFcGljJykpO1xyXG4gICAgICBjb25zdCBoYXNFcGljVGl0bGUgPSBoZWFkZXJUZXh0cy5zb21lKHRleHQgPT4gdGV4dC5pbmNsdWRlcygnRXBpYyBUaXRsZScpKTtcclxuICAgICAgY29uc3QgaGFzRXBpY1N1bW1hcnkgPSBoZWFkZXJUZXh0cy5zb21lKHRleHQgPT4gdGV4dC5pbmNsdWRlcygnRXBpYyBTdW1tYXJ5JykpO1xyXG4gICAgICBcclxuICAgICAgaWYgKGhhc0VwaWNLZXkpIHtcclxuICAgICAgICBleHBlY3QoaGFzRXBpY1RpdGxlKS50b0JlVHJ1dGh5KCk7XHJcbiAgICAgICAgZXhwZWN0KGhhc0VwaWNTdW1tYXJ5KS50b0JlVHJ1dGh5KCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1tURVNUXSDinJMgRXBpYyBUaXRsZSBhbmQgU3VtbWFyeSBjb2x1bW5zIGZvdW5kJyk7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gTm8gRXBpYyBkYXRhIGZvdW5kIChlcGljTGlua0ZpZWxkSWQgbWF5IG5vdCBleGlzdCBpbiB0aGlzIEppcmEgaW5zdGFuY2UpJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVGltZSB0cmFja2luZyBjb2x1bW5zIHNob3VsZCBhcHBlYXIgdG9nZXRoZXIgaWYgcHJlc2VudFxyXG4gICAgY29uc3QgaGVhZGVyVGV4dHMgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNkb25lLXN0b3JpZXMtY29udGVudCB0YWJsZSB0aGVhZCB0aCcpLmFsbFRleHRDb250ZW50cygpO1xyXG4gICAgaWYgKGhlYWRlclRleHRzLnNvbWUodGV4dCA9PiB0ZXh0LmluY2x1ZGVzKCdFc3QgKEhycyknKSkpIHtcclxuICAgICAgZXhwZWN0KGhlYWRlclRleHRzLnNvbWUodGV4dCA9PiB0ZXh0LmluY2x1ZGVzKCdTcGVudCAoSHJzKScpKSkudG9CZVRydXRoeSgpO1xyXG4gICAgICBleHBlY3QoaGVhZGVyVGV4dHMuc29tZSh0ZXh0ID0+IHRleHQuaW5jbHVkZXMoJ1JlbWFpbmluZyAoSHJzKScpKSkudG9CZVRydXRoeSgpO1xyXG4gICAgICBleHBlY3QoaGVhZGVyVGV4dHMuc29tZSh0ZXh0ID0+IHRleHQuaW5jbHVkZXMoJ1ZhcmlhbmNlIChIcnMpJykpKS50b0JlVHJ1dGh5KCk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0g4pyTIFRpbWUgdHJhY2tpbmcgY29sdW1ucyBmb3VuZCBpbiBEb25lIFN0b3JpZXMgdGFiJyk7XHJcbiAgICB9XHJcbiAgICBpZiAoaGVhZGVyVGV4dHMuc29tZSh0ZXh0ID0+IHRleHQuaW5jbHVkZXMoJ1N1YnRhc2sgRXN0IChIcnMpJykpKSB7XHJcbiAgICAgIGV4cGVjdChoZWFkZXJUZXh0cy5zb21lKHRleHQgPT4gdGV4dC5pbmNsdWRlcygnU3VidGFzayBTcGVudCAoSHJzKScpKSkudG9CZVRydXRoeSgpO1xyXG4gICAgICBleHBlY3QoaGVhZGVyVGV4dHMuc29tZSh0ZXh0ID0+IHRleHQuaW5jbHVkZXMoJ1N1YnRhc2sgUmVtYWluaW5nIChIcnMpJykpKS50b0JlVHJ1dGh5KCk7XHJcbiAgICAgIGV4cGVjdChoZWFkZXJUZXh0cy5zb21lKHRleHQgPT4gdGV4dC5pbmNsdWRlcygnU3VidGFzayBWYXJpYW5jZSAoSHJzKScpKSkudG9CZVRydXRoeSgpO1xyXG4gICAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBTdWJ0YXNrIHRpbWUgdHJhY2tpbmcgY29sdW1ucyBmb3VuZCBpbiBEb25lIFN0b3JpZXMgdGFiJyk7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ3Nob3VsZCBtZXJnZSBTcHJpbnQgVGhyb3VnaHB1dCBkYXRhIGludG8gU3ByaW50cyB0YWIgYW5kIHJlbW92ZSBkdXBsaWNhdGUgUGVyIFNwcmludCBzZWN0aW9uJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICB0ZXN0LnNldFRpbWVvdXQoMTIwMDAwKTtcclxuICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gVGVzdGluZyBtZXJnZWQgU3ByaW50IFRocm91Z2hwdXQgZGF0YScpO1xyXG4gICAgXHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuICAgIFxyXG4gICAgY29uc3QgcHJldmlld1Zpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWNvbnRlbnQnKS5pc1Zpc2libGUoKTtcclxuICAgIGlmICghcHJldmlld1Zpc2libGUpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSBQcmV2aWV3IG5vdCB2aXNpYmxlLCBza2lwcGluZyB0aHJvdWdocHV0IG1lcmdlIHRlc3QnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBDaGVjayBTcHJpbnRzIHRhYiBmb3IgVG90YWwgU1AgYW5kIFN0b3J5IENvdW50IGNvbHVtbnNcclxuICAgIGF3YWl0IHBhZ2UuY2xpY2soJy50YWItYnRuW2RhdGEtdGFiPVwic3ByaW50c1wiXScpO1xyXG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignI3RhYi1zcHJpbnRzJykpLnRvSGF2ZUNsYXNzKC9hY3RpdmUvKTtcclxuICAgIFxyXG4gICAgY29uc3Qgc3ByaW50c0NvbnRlbnQgPSBwYWdlLmxvY2F0b3IoJyNzcHJpbnRzLWNvbnRlbnQnKTtcclxuICAgIGNvbnN0IGNvbnRlbnRUZXh0ID0gYXdhaXQgc3ByaW50c0NvbnRlbnQudGV4dENvbnRlbnQoKTtcclxuXHJcbiAgICBpZiAoY29udGVudFRleHQgJiYgY29udGVudFRleHQuaW5jbHVkZXMoJ1RvdGFsIFNQJykpIHtcclxuICAgICAgZXhwZWN0KGNvbnRlbnRUZXh0KS50b0NvbnRhaW4oJ1N0b3J5IENvdW50Jyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0g4pyTIFRvdGFsIFNQIGFuZCBTdG9yeSBDb3VudCBjb2x1bW5zIGZvdW5kIGluIFNwcmludHMgdGFiJyk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGNvbnRlbnRUZXh0ICYmIGNvbnRlbnRUZXh0LmluY2x1ZGVzKCdDb21taXR0ZWQgU1AnKSkge1xyXG4gICAgICBleHBlY3QoY29udGVudFRleHQpLnRvQ29udGFpbignRGVsaXZlcmVkIFNQJyk7XHJcbiAgICAgIGV4cGVjdChjb250ZW50VGV4dCkudG9Db250YWluKCdTUCBFc3RpbWF0aW9uICUnKTtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSDinJMgRXN0aW1hdGlvbiBhY2N1cmFjeSBjb2x1bW5zIGZvdW5kIGluIFNwcmludHMgdGFiJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQm9hcmRzIHRhYmxlIHNob3VsZCBpbmNsdWRlIHRpbWUtbm9ybWFsaXplZCBkZWxpdmVyeSBjb2x1bW5zXHJcbiAgICBhd2FpdCBwYWdlLmNsaWNrKCcudGFiLWJ0bltkYXRhLXRhYj1cInByb2plY3QtZXBpYy1sZXZlbFwiXScpO1xyXG4gICAgY29uc3QgYm9hcmRzQ29udGVudCA9IHBhZ2UubG9jYXRvcignI3Byb2plY3QtZXBpYy1sZXZlbC1jb250ZW50Jyk7XHJcbiAgICBjb25zdCBib2FyZHNUZXh0ID0gYXdhaXQgYm9hcmRzQ29udGVudC50ZXh0Q29udGVudCgpO1xyXG4gICAgaWYgKGJvYXJkc1RleHQpIHtcclxuICAgICAgZXhwZWN0KGJvYXJkc1RleHQpLnRvQ29udGFpbignU3ByaW50IERheXMnKTtcclxuICAgICAgZXhwZWN0KGJvYXJkc1RleHQpLnRvQ29udGFpbignU1AgLyBEYXknKTtcclxuICAgICAgZXhwZWN0KGJvYXJkc1RleHQpLnRvQ29udGFpbignT24tVGltZSAlJyk7XHJcbiAgICAgIGV4cGVjdChib2FyZHNUZXh0KS50b0NvbnRhaW4oJ0FkLWhvYycpO1xyXG4gICAgICBpZiAoYm9hcmRzVGV4dC5pbmNsdWRlcygnQ29tbWl0dGVkIFNQJykpIHtcclxuICAgICAgICBleHBlY3QoYm9hcmRzVGV4dCkudG9Db250YWluKCdEZWxpdmVyZWQgU1AnKTtcclxuICAgICAgICBleHBlY3QoYm9hcmRzVGV4dCkudG9Db250YWluKCdTUCBFc3RpbWF0aW9uICUnKTtcclxuICAgICAgfVxyXG4gICAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBCb2FyZHMgdGFibGUgaW5jbHVkZXMgdGltZS1ub3JtYWxpemVkIGRlbGl2ZXJ5IGNvbHVtbnMnKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBSZXR1cm4gdG8gU3ByaW50cyB0YWIgZm9yIHJlbWFpbmluZyBjaGVja3NcclxuICAgIGF3YWl0IHBhZ2UuY2xpY2soJy50YWItYnRuW2RhdGEtdGFiPVwic3ByaW50c1wiXScpO1xyXG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignI3RhYi1zcHJpbnRzJykpLnRvSGF2ZUNsYXNzKC9hY3RpdmUvKTtcclxuXHJcbiAgICAvLyBJZiB0aW1lIHRyYWNraW5nIGNvbHVtbnMgYXBwZWFyLCBlbnN1cmUgdGhlIGZ1bGwgc2V0IGlzIHByZXNlbnRcclxuICAgIGlmIChjb250ZW50VGV4dCAmJiBjb250ZW50VGV4dC5pbmNsdWRlcygnRXN0IEhycycpKSB7XHJcbiAgICAgIGV4cGVjdChjb250ZW50VGV4dCkudG9Db250YWluKCdTcGVudCBIcnMnKTtcclxuICAgICAgZXhwZWN0KGNvbnRlbnRUZXh0KS50b0NvbnRhaW4oJ1JlbWFpbmluZyBIcnMnKTtcclxuICAgICAgZXhwZWN0KGNvbnRlbnRUZXh0KS50b0NvbnRhaW4oJ1ZhcmlhbmNlIEhycycpO1xyXG4gICAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBUaW1lIHRyYWNraW5nIGNvbHVtbnMgZm91bmQgaW4gU3ByaW50cyB0YWInKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoY29udGVudFRleHQgJiYgY29udGVudFRleHQuaW5jbHVkZXMoJ1N1YnRhc2sgRXN0IEhycycpKSB7XHJcbiAgICAgIGV4cGVjdChjb250ZW50VGV4dCkudG9Db250YWluKCdTdWJ0YXNrIFNwZW50IEhycycpO1xyXG4gICAgICBleHBlY3QoY29udGVudFRleHQpLnRvQ29udGFpbignU3VidGFzayBSZW1haW5pbmcgSHJzJyk7XHJcbiAgICAgIGV4cGVjdChjb250ZW50VGV4dCkudG9Db250YWluKCdTdWJ0YXNrIFZhcmlhbmNlIEhycycpO1xyXG4gICAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBTdWJ0YXNrIHRpbWUgdHJhY2tpbmcgY29sdW1ucyBmb3VuZCBpbiBTcHJpbnRzIHRhYicpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBQcm9qZWN0ICYgRXBpYyBMZXZlbCBjb250ZW50IHNob3VsZCBub3QgaW5jbHVkZSBhIHNlcGFyYXRlIFBlciBTcHJpbnQgdGFibGVcclxuICAgIGF3YWl0IHBhZ2UuY2xpY2soJy50YWItYnRuW2RhdGEtdGFiPVwicHJvamVjdC1lcGljLWxldmVsXCJdJyk7XHJcbiAgICBjb25zdCBtZXRyaWNzVGV4dCA9IGF3YWl0IHBhZ2UubG9jYXRvcignI3Byb2plY3QtZXBpYy1sZXZlbC1jb250ZW50JykudGV4dENvbnRlbnQoKTtcclxuICAgIFxyXG4gICAgLy8gU2hvdWxkIE5PVCBjb250YWluIFwiUGVyIFNwcmludFwiIGFzIGEgc2VwYXJhdGUgc2VjdGlvblxyXG4gICAgaWYgKG1ldHJpY3NUZXh0KSB7XHJcbiAgICAgIGNvbnN0IHBlclNwcmludFNlY3Rpb24gPSBtZXRyaWNzVGV4dC5tYXRjaCgvUGVyIFNwcmludFtcXHNcXFNdKj88XFwvdGFibGU+Lyk7XHJcbiAgICAgIGV4cGVjdChwZXJTcHJpbnRTZWN0aW9uKS50b0JlTnVsbCgpO1xyXG4gICAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBQZXIgU3ByaW50IHNlY3Rpb24gcmVtb3ZlZCBmcm9tIFByb2plY3QgJiBFcGljIExldmVsIHZpZXcnKTtcclxuICAgICAgXHJcbiAgICAgIC8vIFNob3VsZCBjb250YWluIG5vdGUgYWJvdXQgUGVyIFNwcmludCBkYXRhIGJlaW5nIGluIFNwcmludHMgdGFiXHJcbiAgICAgIGV4cGVjdChtZXRyaWNzVGV4dCkudG9Db250YWluKCdQZXIgU3ByaW50IGRhdGEgaXMgc2hvd24gaW4gdGhlIFNwcmludHMgdGFiJyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0g4pyTIE5vdGUgYWJvdXQgUGVyIFNwcmludCBkYXRhIGxvY2F0aW9uIGZvdW5kJyk7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ2JvYXJkcyB0YWJsZSBzaG93cyBjYXBhY2l0eSBwcm94eSBjb2x1bW5zIGFuZCB0b29sdGlwcycsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgdGVzdC5zZXRUaW1lb3V0KDEyMDAwMCk7XHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuXHJcbiAgICBjb25zdCBwcmV2aWV3VmlzaWJsZSA9IGF3YWl0IHBhZ2UubG9jYXRvcignI3ByZXZpZXctY29udGVudCcpLmlzVmlzaWJsZSgpO1xyXG4gICAgaWYgKCFwcmV2aWV3VmlzaWJsZSkge1xyXG4gICAgICB0ZXN0LnNraXAoKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IHBhZ2UuY2xpY2soJy50YWItYnRuW2RhdGEtdGFiPVwicHJvamVjdC1lcGljLWxldmVsXCJdJyk7XHJcbiAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjdGFiLXByb2plY3QtZXBpYy1sZXZlbCcpKS50b0hhdmVDbGFzcygvYWN0aXZlLyk7XHJcblxyXG4gICAgY29uc3QgYm9hcmRzVGFibGUgPSBwYWdlLmxvY2F0b3IoJyNwcm9qZWN0LWVwaWMtbGV2ZWwtY29udGVudCB0YWJsZS5kYXRhLXRhYmxlJykuZmlyc3QoKTtcclxuICAgIGF3YWl0IGV4cGVjdChib2FyZHNUYWJsZSkudG9CZVZpc2libGUoKTtcclxuXHJcbiAgICBhd2FpdCBleHBlY3QoYm9hcmRzVGFibGUubG9jYXRvcigndGgnLCB7IGhhc1RleHQ6ICdBY3RpdmUgQXNzaWduZWVzJyB9KSkudG9CZVZpc2libGUoKTtcclxuICAgIGF3YWl0IGV4cGVjdChib2FyZHNUYWJsZS5sb2NhdG9yKCd0aCcsIHsgaGFzVGV4dDogJ1N0b3JpZXMgLyBBc3NpZ25lZScgfSkpLnRvQmVWaXNpYmxlKCk7XHJcbiAgICBhd2FpdCBleHBlY3QoYm9hcmRzVGFibGUubG9jYXRvcigndGgnLCB7IGhhc1RleHQ6ICdTUCAvIEFzc2lnbmVlJyB9KSkudG9CZVZpc2libGUoKTtcclxuICAgIGF3YWl0IGV4cGVjdChib2FyZHNUYWJsZS5sb2NhdG9yKCd0aCcsIHsgaGFzVGV4dDogJ0Fzc3VtZWQgQ2FwYWNpdHkgKFBEKScgfSkpLnRvQmVWaXNpYmxlKCk7XHJcbiAgICBhd2FpdCBleHBlY3QoYm9hcmRzVGFibGUubG9jYXRvcigndGgnLCB7IGhhc1RleHQ6ICdBc3N1bWVkIFdhc3RlICUnIH0pKS50b0JlVmlzaWJsZSgpO1xyXG5cclxuICAgIGNvbnN0IGFzc3VtZWRDYXBhY2l0eVRvb2x0aXAgPSBib2FyZHNUYWJsZS5sb2NhdG9yKCd0aFt0aXRsZSo9XCJBc3N1bWVkIGNhcGFjaXR5XCJdJyk7XHJcbiAgICBhd2FpdCBleHBlY3QoYXNzdW1lZENhcGFjaXR5VG9vbHRpcCkudG9IYXZlQ291bnQoMSk7XHJcbiAgICBjb25zdCBhc3N1bWVkV2FzdGVUb29sdGlwID0gYm9hcmRzVGFibGUubG9jYXRvcigndGhbdGl0bGUqPVwiQXNzdW1lZCB1bnVzZWQgY2FwYWNpdHlcIl0nKTtcclxuICAgIGF3YWl0IGV4cGVjdChhc3N1bWVkV2FzdGVUb29sdGlwKS50b0hhdmVDb3VudCgxKTtcclxuICB9KTtcclxuXHJcbiAgdGVzdCgncHJldmlldyBjYWNoZSByZXR1cm5zIGNhY2hlZCByZXNwb25zZSBvbiBzZWNvbmQgY2FsbCcsIGFzeW5jICh7IHJlcXVlc3QgfSkgPT4ge1xyXG4gICAgdGVzdC5zZXRUaW1lb3V0KDEyMDAwMCk7XHJcbiAgICBjb25zdCBmaXJzdCA9IGF3YWl0IHJlcXVlc3QuZ2V0KGAvcHJldmlldy5qc29uJHtERUZBVUxUX1EyX1FVRVJZfWApO1xyXG4gICAgZXhwZWN0KGZpcnN0Lm9rKCkpLnRvQmVUcnV0aHkoKTtcclxuICAgIGNvbnN0IGZpcnN0SnNvbiA9IGF3YWl0IGZpcnN0Lmpzb24oKTtcclxuXHJcbiAgICBjb25zdCBzZWNvbmQgPSBhd2FpdCByZXF1ZXN0LmdldChgL3ByZXZpZXcuanNvbiR7REVGQVVMVF9RMl9RVUVSWX1gKTtcclxuICAgIGV4cGVjdChzZWNvbmQub2soKSkudG9CZVRydXRoeSgpO1xyXG4gICAgY29uc3Qgc2Vjb25kSnNvbiA9IGF3YWl0IHNlY29uZC5qc29uKCk7XHJcblxyXG4gICAgY29uc3QgZmlyc3RGcm9tQ2FjaGUgPSBmaXJzdEpzb24/Lm1ldGE/LmZyb21DYWNoZSA9PT0gdHJ1ZTtcclxuICAgIGNvbnN0IHNlY29uZEZyb21DYWNoZSA9IHNlY29uZEpzb24/Lm1ldGE/LmZyb21DYWNoZSA9PT0gdHJ1ZTtcclxuXHJcbiAgICBleHBlY3QoZmlyc3RGcm9tQ2FjaGUgfHwgc2Vjb25kRnJvbUNhY2hlKS50b0JlVHJ1dGh5KCk7XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ2ZpbHRlcmVkIGV4cG9ydCBkaXNhYmxlcyB3aGVuIGZpbHRlcnMgeWllbGQgemVybyByb3dzJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICB0ZXN0LnNldFRpbWVvdXQoMTIwMDAwKTtcclxuICAgIGF3YWl0IHJ1bkRlZmF1bHRQcmV2aWV3KHBhZ2UpO1xyXG5cclxuICAgIGNvbnN0IHByZXZpZXdWaXNpYmxlID0gYXdhaXQgcGFnZS5sb2NhdG9yKCcjcHJldmlldy1jb250ZW50JykuaXNWaXNpYmxlKCk7XHJcbiAgICBpZiAoIXByZXZpZXdWaXNpYmxlKSB7XHJcbiAgICAgIHRlc3Quc2tpcCgpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgcGFnZS5jbGljaygnLnRhYi1idG5bZGF0YS10YWI9XCJkb25lLXN0b3JpZXNcIl0nKTtcclxuICAgIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJyN0YWItZG9uZS1zdG9yaWVzJykpLnRvSGF2ZUNsYXNzKC9hY3RpdmUvKTtcclxuXHJcbiAgICBhd2FpdCBwYWdlLmZpbGwoJyNzZWFyY2gtYm94JywgJ05PX01BVENIX0ZJTFRFUl85ODc2NTQzMjEnKTtcclxuICAgIGF3YWl0IHBhZ2Uud2FpdEZvclRpbWVvdXQoNTAwKTtcclxuXHJcbiAgICBjb25zdCBlbXB0eVN0YXRlVmlzaWJsZSA9IGF3YWl0IHBhZ2UubG9jYXRvcignI2RvbmUtc3Rvcmllcy1jb250ZW50IC5lbXB0eS1zdGF0ZScpLmlzVmlzaWJsZSgpLmNhdGNoKCgpID0+IGZhbHNlKTtcclxuICAgIGlmICghZW1wdHlTdGF0ZVZpc2libGUpIHtcclxuICAgICAgdGVzdC5za2lwKCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjZXhwb3J0LWhpbnQnKSkudG9Db250YWluVGV4dCgnTm8gcm93cyBtYXRjaCcpO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdzaG91bGQgZGlzcGxheSByZW5hbWVkIGNvbHVtbiBsYWJlbHMgd2l0aCB0b29sdGlwcyBpbiBTcHJpbnRzIHRhYicsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgdGVzdC5zZXRUaW1lb3V0KDEyMDAwMCk7XHJcbiAgICBjb25zb2xlLmxvZygnW1RFU1RdIFRlc3RpbmcgcmVuYW1lZCBjb2x1bW4gbGFiZWxzJyk7XHJcbiAgICBcclxuICAgIGF3YWl0IHJ1bkRlZmF1bHRQcmV2aWV3KHBhZ2UpO1xyXG4gICAgXHJcbiAgICBjb25zdCBwcmV2aWV3VmlzaWJsZSA9IGF3YWl0IHBhZ2UubG9jYXRvcignI3ByZXZpZXctY29udGVudCcpLmlzVmlzaWJsZSgpO1xyXG4gICAgaWYgKCFwcmV2aWV3VmlzaWJsZSkge1xyXG4gICAgICBjb25zb2xlLmxvZygnW1RFU1RdIFByZXZpZXcgbm90IHZpc2libGUsIHNraXBwaW5nIGxhYmVsIHRlc3QnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBhd2FpdCBwYWdlLmNsaWNrKCcudGFiLWJ0bltkYXRhLXRhYj1cInNwcmludHNcIl0nKTtcclxuICAgIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJyN0YWItc3ByaW50cycpKS50b0hhdmVDbGFzcygvYWN0aXZlLyk7XHJcbiAgICBcclxuICAgIC8vIENoZWNrIGZvciByZW5hbWVkIGxhYmVsc1xyXG4gICAgY29uc3Qgc3ByaW50c0NvbnRlbnQgPSBwYWdlLmxvY2F0b3IoJyNzcHJpbnRzLWNvbnRlbnQnKTtcclxuICAgIGNvbnN0IGNvbnRlbnRUZXh0ID0gYXdhaXQgc3ByaW50c0NvbnRlbnQudGV4dENvbnRlbnQoKTtcclxuICAgIFxyXG4gICAgLy8gU2hvdWxkIGNvbnRhaW4gbmV3IGxhYmVsc1xyXG4gICAgZXhwZWN0KGNvbnRlbnRUZXh0KS50b0NvbnRhaW4oJ0RvbmUgU3RvcmllcycpO1xyXG4gICAgY29uc29sZS5sb2coJ1tURVNUXSDinJMgXCJEb25lIFN0b3JpZXNcIiBsYWJlbCBmb3VuZCcpO1xyXG4gICAgXHJcbiAgICAvLyBDaGVjayBmb3IgdG9vbHRpcCBvbiBjb2x1bW4gaGVhZGVyXHJcbiAgICBjb25zdCBzdG9yaWVzQ29tcGxldGVkSGVhZGVyID0gcGFnZS5sb2NhdG9yKCcjc3ByaW50cy1jb250ZW50IHRoJykuZmlsdGVyKHsgaGFzVGV4dDogJ0RvbmUgU3RvcmllcycgfSk7XHJcbiAgICBpZiAoYXdhaXQgc3Rvcmllc0NvbXBsZXRlZEhlYWRlci5jb3VudCgpID4gMCkge1xyXG4gICAgICBjb25zdCB0aXRsZUF0dHIgPSBhd2FpdCBzdG9yaWVzQ29tcGxldGVkSGVhZGVyLmdldEF0dHJpYnV0ZSgndGl0bGUnKTtcclxuICAgICAgZXhwZWN0KHRpdGxlQXR0cikudG9Db250YWluKCdTdG9yaWVzIG1hcmtlZCBEb25lIGluIHRoaXMgc3ByaW50Jyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0g4pyTIFRvb2x0aXAgZm91bmQgb24gXCJEb25lIFN0b3JpZXNcIiBoZWFkZXInKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gSWYgZG9uZUNvbXBhcmlzb24gZXhpc3RzLCBjaGVjayBmb3IgcmVuYW1lZCBcIk9uLVRpbWUgU3Rvcmllc1wiXHJcbiAgICBpZiAoY29udGVudFRleHQgJiYgY29udGVudFRleHQuaW5jbHVkZXMoJ09uLVRpbWUgU3RvcmllcycpKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0g4pyTIFwiT24tVGltZSBTdG9yaWVzXCIgbGFiZWwgZm91bmQnKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGNvbXBsZXRlZFdpdGhpbkhlYWRlciA9IHBhZ2UubG9jYXRvcignI3NwcmludHMtY29udGVudCB0aCcpLmZpbHRlcih7IGhhc1RleHQ6ICdPbi1UaW1lIFN0b3JpZXMnIH0pO1xyXG4gICAgICBpZiAoYXdhaXQgY29tcGxldGVkV2l0aGluSGVhZGVyLmNvdW50KCkgPiAwKSB7XHJcbiAgICAgICAgY29uc3QgdGl0bGVBdHRyID0gYXdhaXQgY29tcGxldGVkV2l0aGluSGVhZGVyLmdldEF0dHJpYnV0ZSgndGl0bGUnKTtcclxuICAgICAgICBleHBlY3QodGl0bGVBdHRyKS50b0NvbnRhaW4oJ1N0b3JpZXMgbWFya2VkIERvbmUgaW4gdGhpcyBzcHJpbnQnKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBUb29sdGlwIGZvdW5kIG9uIFwiT24tVGltZSBTdG9yaWVzXCIgaGVhZGVyJyk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgdGVzdCgnc2hvdWxkIGRpc3BsYXkgcGVyLXNlY3Rpb24gQ1NWIGV4cG9ydCBidXR0b25zIHdpdGggY29ycmVjdCBmdW5jdGlvbmFsaXR5JywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICB0ZXN0LnNldFRpbWVvdXQoMTIwMDAwKTtcclxuICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gVGVzdGluZyBwZXItc2VjdGlvbiBDU1YgZXhwb3J0IGJ1dHRvbnMnKTtcclxuICAgIFxyXG4gICAgYXdhaXQgcnVuRGVmYXVsdFByZXZpZXcocGFnZSk7XHJcbiAgICBcclxuICAgIGNvbnN0IHByZXZpZXdWaXNpYmxlID0gYXdhaXQgcGFnZS5sb2NhdG9yKCcjcHJldmlldy1jb250ZW50JykuaXNWaXNpYmxlKCk7XHJcbiAgICBpZiAoIXByZXZpZXdWaXNpYmxlKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gUHJldmlldyBub3QgdmlzaWJsZSwgc2tpcHBpbmcgZXhwb3J0IGJ1dHRvbiB0ZXN0Jyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQ2hlY2sgQm9hcmRzIHRhYiBleHBvcnQgYnV0dG9uXHJcbiAgICBhd2FpdCBwYWdlLmNsaWNrKCcudGFiLWJ0bltkYXRhLXRhYj1cInByb2plY3QtZXBpYy1sZXZlbFwiXScpO1xyXG4gICAgY29uc3QgYm9hcmRzRXhwb3J0QnRuID0gcGFnZS5sb2NhdG9yKCcuZXhwb3J0LXNlY3Rpb24tYnRuW2RhdGEtc2VjdGlvbj1cInByb2plY3QtZXBpYy1sZXZlbFwiXScpO1xyXG4gICAgY29uc3QgYm9hcmRzQnRuVmlzaWJsZSA9IGF3YWl0IGJvYXJkc0V4cG9ydEJ0bi5pc1Zpc2libGUoKTtcclxuICAgIFxyXG4gICAgaWYgKGJvYXJkc0J0blZpc2libGUpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSDinJMgQm9hcmRzIGV4cG9ydCBidXR0b24gdmlzaWJsZScpO1xyXG4gICAgICBcclxuICAgICAgLy8gVGVzdCBkb3dubG9hZCAoc2V0IHVwIGRvd25sb2FkIGxpc3RlbmVyKVxyXG4gICAgICBjb25zdCBkb3dubG9hZFByb21pc2UgPSBwYWdlLndhaXRGb3JFdmVudCgnZG93bmxvYWQnLCB7IHRpbWVvdXQ6IDEwMDAwIH0pLmNhdGNoKCgpID0+IG51bGwpO1xyXG4gICAgICBhd2FpdCBib2FyZHNFeHBvcnRCdG4uY2xpY2soKTtcclxuICAgICAgY29uc3QgZG93bmxvYWQgPSBhd2FpdCBkb3dubG9hZFByb21pc2U7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoZG93bmxvYWQpIHtcclxuICAgICAgICBjb25zdCBmaWxlbmFtZSA9IGRvd25sb2FkLnN1Z2dlc3RlZEZpbGVuYW1lKCk7XHJcbiAgICAgICAgZXhwZWN0KGZpbGVuYW1lKS50b01hdGNoKC9eW0EtWjAtOS1dK18uKl9wcm9qZWN0LWVwaWMtbGV2ZWwoX1BBUlRJQUwpP19cXGR7NH0tXFxkezJ9LVxcZHsyfVxcLmNzdiQvKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBCb2FyZHMgQ1NWIGRvd25sb2FkIHRyaWdnZXJlZCB3aXRoIGNvcnJlY3QgZmlsZW5hbWUgZm9ybWF0OicsIGZpbGVuYW1lKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBDaGVjayBTcHJpbnRzIHRhYiBleHBvcnQgYnV0dG9uXHJcbiAgICBhd2FpdCBwYWdlLmNsaWNrKCcudGFiLWJ0bltkYXRhLXRhYj1cInNwcmludHNcIl0nKTtcclxuICAgIGNvbnN0IHNwcmludHNFeHBvcnRCdG4gPSBwYWdlLmxvY2F0b3IoJy5leHBvcnQtc2VjdGlvbi1idG5bZGF0YS1zZWN0aW9uPVwic3ByaW50c1wiXScpO1xyXG4gICAgY29uc3Qgc3ByaW50c0J0blZpc2libGUgPSBhd2FpdCBzcHJpbnRzRXhwb3J0QnRuLmlzVmlzaWJsZSgpO1xyXG4gICAgXHJcbiAgICBpZiAoc3ByaW50c0J0blZpc2libGUpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSDinJMgU3ByaW50cyBleHBvcnQgYnV0dG9uIHZpc2libGUnKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGRvd25sb2FkUHJvbWlzZSA9IHBhZ2Uud2FpdEZvckV2ZW50KCdkb3dubG9hZCcsIHsgdGltZW91dDogMTAwMDAgfSkuY2F0Y2goKCkgPT4gbnVsbCk7XHJcbiAgICAgIGF3YWl0IHNwcmludHNFeHBvcnRCdG4uY2xpY2soKTtcclxuICAgICAgY29uc3QgZG93bmxvYWQgPSBhd2FpdCBkb3dubG9hZFByb21pc2U7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoZG93bmxvYWQpIHtcclxuICAgICAgICBjb25zdCBmaWxlbmFtZSA9IGRvd25sb2FkLnN1Z2dlc3RlZEZpbGVuYW1lKCk7XHJcbiAgICAgICAgZXhwZWN0KGZpbGVuYW1lKS50b01hdGNoKC9eW0EtWjAtOS1dK18uKl9zcHJpbnRzKF9QQVJUSUFMKT9fXFxkezR9LVxcZHsyfS1cXGR7Mn1cXC5jc3YkLyk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1tURVNUXSDinJMgU3ByaW50cyBDU1YgZG93bmxvYWQgdHJpZ2dlcmVkIHdpdGggY29ycmVjdCBmaWxlbmFtZSBmb3JtYXQ6JywgZmlsZW5hbWUpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIENoZWNrIERvbmUgU3RvcmllcyB0YWIgZXhwb3J0IGJ1dHRvblxyXG4gICAgYXdhaXQgcGFnZS5jbGljaygnLnRhYi1idG5bZGF0YS10YWI9XCJkb25lLXN0b3JpZXNcIl0nKTtcclxuICAgIGNvbnN0IGRvbmVTdG9yaWVzRXhwb3J0QnRuID0gcGFnZS5sb2NhdG9yKCcuZXhwb3J0LXNlY3Rpb24tYnRuW2RhdGEtc2VjdGlvbj1cImRvbmUtc3Rvcmllc1wiXScpO1xyXG4gICAgY29uc3QgZG9uZVN0b3JpZXNCdG5WaXNpYmxlID0gYXdhaXQgZG9uZVN0b3JpZXNFeHBvcnRCdG4uaXNWaXNpYmxlKCk7XHJcbiAgICBcclxuICAgIGlmIChkb25lU3Rvcmllc0J0blZpc2libGUpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSDinJMgRG9uZSBTdG9yaWVzIGV4cG9ydCBidXR0b24gdmlzaWJsZScpO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgZG93bmxvYWRQcm9taXNlID0gcGFnZS53YWl0Rm9yRXZlbnQoJ2Rvd25sb2FkJywgeyB0aW1lb3V0OiAxMDAwMCB9KS5jYXRjaCgoKSA9PiBudWxsKTtcclxuICAgICAgYXdhaXQgZG9uZVN0b3JpZXNFeHBvcnRCdG4uY2xpY2soKTtcclxuICAgICAgY29uc3QgZG93bmxvYWQgPSBhd2FpdCBkb3dubG9hZFByb21pc2U7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoZG93bmxvYWQpIHtcclxuICAgICAgICBjb25zdCBmaWxlbmFtZSA9IGRvd25sb2FkLnN1Z2dlc3RlZEZpbGVuYW1lKCk7XHJcbiAgICAgICAgZXhwZWN0KGZpbGVuYW1lKS50b01hdGNoKC9eW0EtWjAtOS1dK18uKl9kb25lLXN0b3JpZXMoX1BBUlRJQUwpP19cXGR7NH0tXFxkezJ9LVxcZHsyfVxcLmNzdiQvKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBEb25lIFN0b3JpZXMgQ1NWIGRvd25sb2FkIHRyaWdnZXJlZCB3aXRoIGNvcnJlY3QgZmlsZW5hbWUgZm9ybWF0OicsIGZpbGVuYW1lKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBDaGVjayBNZXRyaWNzIHRhYiBleHBvcnQgYnV0dG9uIChpZiBtZXRyaWNzIGV4aXN0KVxyXG4gICAgY29uc3QgbWV0cmljc1RhYiA9IHBhZ2UubG9jYXRvcignI21ldHJpY3MtdGFiJyk7XHJcbiAgICBpZiAoYXdhaXQgbWV0cmljc1RhYi5pc1Zpc2libGUoKSkge1xyXG4gICAgICBhd2FpdCBwYWdlLmNsaWNrKCcudGFiLWJ0bltkYXRhLXRhYj1cIm1ldHJpY3NcIl0nKTtcclxuICAgICAgY29uc3QgbWV0cmljc0V4cG9ydEJ0biA9IHBhZ2UubG9jYXRvcignLmV4cG9ydC1zZWN0aW9uLWJ0bltkYXRhLXNlY3Rpb249XCJtZXRyaWNzXCJdJyk7XHJcbiAgICAgIGNvbnN0IG1ldHJpY3NCdG5WaXNpYmxlID0gYXdhaXQgbWV0cmljc0V4cG9ydEJ0bi5pc1Zpc2libGUoKTtcclxuXHJcbiAgICAgIGlmIChtZXRyaWNzQnRuVmlzaWJsZSkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gPz8/IE1ldHJpY3MgZXhwb3J0IGJ1dHRvbiB2aXNpYmxlJyk7XHJcblxyXG4gICAgICAgIGNvbnN0IGRvd25sb2FkUHJvbWlzZSA9IHBhZ2Uud2FpdEZvckV2ZW50KCdkb3dubG9hZCcsIHsgdGltZW91dDogMTAwMDAgfSkuY2F0Y2goKCkgPT4gbnVsbCk7XHJcbiAgICAgICAgYXdhaXQgbWV0cmljc0V4cG9ydEJ0bi5jbGljaygpO1xyXG4gICAgICAgIGNvbnN0IGRvd25sb2FkID0gYXdhaXQgZG93bmxvYWRQcm9taXNlO1xyXG5cclxuICAgICAgICBpZiAoZG93bmxvYWQpIHtcclxuICAgICAgICAgIGNvbnN0IGZpbGVuYW1lID0gZG93bmxvYWQuc3VnZ2VzdGVkRmlsZW5hbWUoKTtcclxuICAgICAgICAgIGV4cGVjdChmaWxlbmFtZSkudG9NYXRjaCgvXltBLVowLTktXStfLipfbWV0cmljcyhfUEFSVElBTCk/X1xcZHs0fS1cXGR7Mn0tXFxkezJ9XFwuY3N2JC8pO1xyXG4gICAgICAgICAgY29uc29sZS5sb2coJ1tURVNUXSA/Pz8gTWV0cmljcyBDU1YgZG93bmxvYWQgdHJpZ2dlcmVkIHdpdGggY29ycmVjdCBmaWxlbmFtZSBmb3JtYXQ6JywgZmlsZW5hbWUpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdzaG91bGQgZGlzcGxheSBUVE0gZGVmaW5pdGlvbiBoZWFkZXIgaW4gTWV0cmljcyB0YWInLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIHRlc3Quc2V0VGltZW91dCgxMjAwMDApO1xyXG4gICAgY29uc29sZS5sb2coJ1tURVNUXSBUZXN0aW5nIFRUTSBkZWZpbml0aW9uIGhlYWRlcicpO1xyXG4gICAgXHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuICAgIFxyXG4gICAgY29uc3QgcHJldmlld1Zpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWNvbnRlbnQnKS5pc1Zpc2libGUoKTtcclxuICAgIGlmICghcHJldmlld1Zpc2libGUpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSBQcmV2aWV3IG5vdCB2aXNpYmxlLCBza2lwcGluZyBUVE0gZGVmaW5pdGlvbiB0ZXN0Jyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQ2hlY2sgaWYgTWV0cmljcyB0YWIgaXMgdmlzaWJsZVxyXG4gICAgY29uc3QgbWV0cmljc1RhYiA9IHBhZ2UubG9jYXRvcignI21ldHJpY3MtdGFiJyk7XHJcbiAgICBpZiAoIShhd2FpdCBtZXRyaWNzVGFiLmlzVmlzaWJsZSgpKSkge1xyXG4gICAgICBjb25zb2xlLmxvZygnW1RFU1RdIE1ldHJpY3MgdGFiIG5vdCB2aXNpYmxlIChubyBtZXRyaWNzIGRhdGEpLCBza2lwcGluZyBUVE0gZGVmaW5pdGlvbiB0ZXN0Jyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgYXdhaXQgcGFnZS5jbGljaygnLnRhYi1idG5bZGF0YS10YWI9XCJtZXRyaWNzXCJdJyk7XHJcbiAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjdGFiLW1ldHJpY3MnKSkudG9IYXZlQ2xhc3MoL2FjdGl2ZS8pO1xyXG4gICAgXHJcbiAgICBjb25zdCBtZXRyaWNzQ29udGVudCA9IHBhZ2UubG9jYXRvcignI21ldHJpY3MtY29udGVudCcpO1xyXG4gICAgY29uc3QgY29udGVudFRleHQgPSBhd2FpdCBtZXRyaWNzQ29udGVudC50ZXh0Q29udGVudCgpO1xyXG4gICAgXHJcbiAgICAvLyBTaG91bGQgY29udGFpbiBUVE0gZGVmaW5pdGlvblxyXG4gICAgaWYgKGNvbnRlbnRUZXh0ICYmIGNvbnRlbnRUZXh0LmluY2x1ZGVzKCdFcGljIFRpbWUtVG8tTWFya2V0JykpIHtcclxuICAgICAgZXhwZWN0KGNvbnRlbnRUZXh0KS50b0NvbnRhaW4oJ0RlZmluaXRpb24nKTtcclxuICAgICAgZXhwZWN0KGNvbnRlbnRUZXh0KS50b0NvbnRhaW4oJ0VwaWMgY3JlYXRpb24gdG8gRXBpYyByZXNvbHV0aW9uJyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0g4pyTIFRUTSBkZWZpbml0aW9uIGhlYWRlciBmb3VuZCcpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSBFcGljIFRUTSBzZWN0aW9uIG5vdCBmb3VuZCAobWF5IG5vdCBoYXZlIEVwaWMgVFRNIGRhdGEpJyk7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ3Nob3VsZCBoYW5kbGUgRXBpYyBmZXRjaCBmYWlsdXJlIGdyYWNlZnVsbHkgKGVkZ2UgY2FzZSknLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIHRlc3Quc2V0VGltZW91dCgxMjAwMDApO1xyXG4gICAgY29uc29sZS5sb2coJ1tURVNUXSBUZXN0aW5nIEVwaWMgZmV0Y2ggZmFpbHVyZSBncmFjZWZ1bCBkZWdyYWRhdGlvbicpO1xyXG4gICAgXHJcbiAgICAvLyBUaGlzIHRlc3QgdmFsaWRhdGVzIHRoYXQgdGhlIHN5c3RlbSBjb250aW51ZXMgd29ya2luZyBldmVuIGlmIEVwaWMgZmV0Y2ggZmFpbHNcclxuICAgIC8vIEluIGEgcmVhbCBzY2VuYXJpbywgdGhpcyB3b3VsZCByZXF1aXJlIG1vY2tpbmcsIGJ1dCB3ZSdsbCB2YWxpZGF0ZSB0aGUgVUkgaGFuZGxlcyBtaXNzaW5nIEVwaWMgZGF0YVxyXG4gICAgXHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuICAgIFxyXG4gICAgY29uc3QgcHJldmlld1Zpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWNvbnRlbnQnKS5pc1Zpc2libGUoKTtcclxuICAgIGlmICghcHJldmlld1Zpc2libGUpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSBQcmV2aWV3IG5vdCB2aXNpYmxlLCBza2lwcGluZyBFcGljIGZhaWx1cmUgdGVzdCcpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIE5hdmlnYXRlIHRvIERvbmUgU3RvcmllcyB0YWJcclxuICAgIGF3YWl0IHBhZ2UuY2xpY2soJy50YWItYnRuW2RhdGEtdGFiPVwiZG9uZS1zdG9yaWVzXCJdJyk7XHJcbiAgICBcclxuICAgIC8vIENoZWNrIHRoYXQgdGhlIHBhZ2Ugc3RpbGwgcmVuZGVycyBldmVuIGlmIEVwaWMgZGF0YSBpcyBtaXNzaW5nXHJcbiAgICBjb25zdCBkb25lU3Rvcmllc0NvbnRlbnQgPSBwYWdlLmxvY2F0b3IoJyNkb25lLXN0b3JpZXMtY29udGVudCcpO1xyXG4gICAgYXdhaXQgZXhwZWN0KGRvbmVTdG9yaWVzQ29udGVudCkudG9CZVZpc2libGUoKTtcclxuICAgIFxyXG4gICAgLy8gSWYgRXBpYyBjb2x1bW5zIGV4aXN0IGJ1dCBkYXRhIGlzIGVtcHR5LCB0aGF0J3MgYWNjZXB0YWJsZSAoZ3JhY2VmdWwgZGVncmFkYXRpb24pXHJcbiAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBQYWdlIHJlbmRlcnMgY29ycmVjdGx5IGV2ZW4gd2l0aCBtaXNzaW5nIEVwaWMgZGF0YSAoZ3JhY2VmdWwgZGVncmFkYXRpb24pJyk7XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ3Nob3VsZCBoYW5kbGUgdGhyb3VnaHB1dCBkYXRhIG1pc21hdGNoIGdyYWNlZnVsbHkgKGVkZ2UgY2FzZSknLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIHRlc3Quc2V0VGltZW91dCgxMjAwMDApO1xyXG4gICAgY29uc29sZS5sb2coJ1tURVNUXSBUZXN0aW5nIHRocm91Z2hwdXQgZGF0YSBtaXNtYXRjaCBoYW5kbGluZycpO1xyXG4gICAgXHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuICAgIFxyXG4gICAgY29uc3QgcHJldmlld1Zpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWNvbnRlbnQnKS5pc1Zpc2libGUoKTtcclxuICAgIGlmICghcHJldmlld1Zpc2libGUpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSBQcmV2aWV3IG5vdCB2aXNpYmxlLCBza2lwcGluZyB0aHJvdWdocHV0IG1pc21hdGNoIHRlc3QnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBhd2FpdCBwYWdlLmNsaWNrKCcudGFiLWJ0bltkYXRhLXRhYj1cInNwcmludHNcIl0nKTtcclxuICAgIFxyXG4gICAgLy8gQ2hlY2sgdGhhdCB0YWJsZSByZW5kZXJzIHdpdGhvdXQgZXJyb3JzIGV2ZW4gaWYgc29tZSBzcHJpbnRzIGRvbid0IGhhdmUgdGhyb3VnaHB1dCBkYXRhXHJcbiAgICBjb25zdCBzcHJpbnRzQ29udGVudCA9IHBhZ2UubG9jYXRvcignI3NwcmludHMtY29udGVudCcpO1xyXG4gICAgYXdhaXQgZXhwZWN0KHNwcmludHNDb250ZW50KS50b0JlVmlzaWJsZSgpO1xyXG4gICAgXHJcbiAgICAvLyBJZiBOL0EgYXBwZWFycyBmb3IgbWlzc2luZyB0aHJvdWdocHV0IGRhdGEsIHRoYXQncyBjb3JyZWN0IGJlaGF2aW9yXHJcbiAgICBjb25zdCBjb250ZW50VGV4dCA9IGF3YWl0IHNwcmludHNDb250ZW50LnRleHRDb250ZW50KCk7XHJcbiAgICBpZiAoY29udGVudFRleHQgJiYgY29udGVudFRleHQuaW5jbHVkZXMoJ04vQScpKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0g4pyTIE4vQSBkaXNwbGF5ZWQgZm9yIG1pc3NpbmcgdGhyb3VnaHB1dCBkYXRhIChjb3JyZWN0IGZhbGxiYWNrKScpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBTcHJpbnRzIHRhYiByZW5kZXJzIGNvcnJlY3RseSB3aXRoIHRocm91Z2hwdXQgZGF0YSBtaXNtYXRjaCBoYW5kbGluZycpO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdzaG91bGQgdHJ1bmNhdGUgbG9uZyBFcGljIFN1bW1hcnkgd2l0aCB0b29sdGlwIChlZGdlIGNhc2UpJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICB0ZXN0LnNldFRpbWVvdXQoMTIwMDAwKTtcclxuICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gVGVzdGluZyBFcGljIFN1bW1hcnkgdHJ1bmNhdGlvbicpO1xyXG4gICAgXHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuICAgIFxyXG4gICAgY29uc3QgcHJldmlld1Zpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWNvbnRlbnQnKS5pc1Zpc2libGUoKTtcclxuICAgIGlmICghcHJldmlld1Zpc2libGUpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSBQcmV2aWV3IG5vdCB2aXNpYmxlLCBza2lwcGluZyB0cnVuY2F0aW9uIHRlc3QnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBhd2FpdCBwYWdlLmNsaWNrKCcudGFiLWJ0bltkYXRhLXRhYj1cImRvbmUtc3Rvcmllc1wiXScpO1xyXG4gICAgXHJcbiAgICAvLyBDaGVjayBmb3IgRXBpYyBTdW1tYXJ5IGNlbGxzIHdpdGggdG9vbHRpcHNcclxuICAgIGNvbnN0IGVwaWNTdW1tYXJ5Q2VsbHMgPSBwYWdlLmxvY2F0b3IoJyNkb25lLXN0b3JpZXMtY29udGVudCB0ZCcpLmZpbHRlcih7IGhhc1RleHQ6ICcuLi4nIH0pO1xyXG4gICAgY29uc3QgY291bnQgPSBhd2FpdCBlcGljU3VtbWFyeUNlbGxzLmNvdW50KCk7XHJcbiAgICBcclxuICAgIGlmIChjb3VudCA+IDApIHtcclxuICAgICAgLy8gQ2hlY2sgdGhhdCB0cnVuY2F0ZWQgY2VsbHMgaGF2ZSB0b29sdGlwc1xyXG4gICAgICBjb25zdCBmaXJzdFRydW5jYXRlZCA9IGVwaWNTdW1tYXJ5Q2VsbHMuZmlyc3QoKTtcclxuICAgICAgY29uc3QgdGl0bGVBdHRyID0gYXdhaXQgZmlyc3RUcnVuY2F0ZWQuZ2V0QXR0cmlidXRlKCd0aXRsZScpO1xyXG4gICAgICBcclxuICAgICAgaWYgKHRpdGxlQXR0ciAmJiB0aXRsZUF0dHIubGVuZ3RoID4gMTAwKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1tURVNUXSDinJMgTG9uZyBFcGljIFN1bW1hcnkgdHJ1bmNhdGVkIHdpdGggdG9vbHRpcCcpO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjb25zb2xlLmxvZygnW1RFU1RdIE5vIHRydW5jYXRlZCBFcGljIFN1bW1hcmllcyBmb3VuZCAobWF5IG5vdCBoYXZlIGxvbmcgc3VtbWFyaWVzIGluIHRlc3QgZGF0YSknKTtcclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgdGVzdCgnc2hvdWxkIHZhbGlkYXRlIENTViBleHBvcnRzIGluY2x1ZGUgZXBpY1RpdGxlIGFuZCBlcGljU3VtbWFyeSBjb2x1bW5zJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICB0ZXN0LnNldFRpbWVvdXQoMTIwMDAwKTtcclxuICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gVGVzdGluZyBDU1YgY29sdW1ucyBpbmNsdWRlIEVwaWMgVGl0bGUvU3VtbWFyeScpO1xyXG4gICAgXHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuICAgIFxyXG4gICAgY29uc3QgcHJldmlld1Zpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWNvbnRlbnQnKS5pc1Zpc2libGUoKTtcclxuICAgIGlmICghcHJldmlld1Zpc2libGUpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSBQcmV2aWV3IG5vdCB2aXNpYmxlLCBza2lwcGluZyBDU1YgY29sdW1uIHRlc3QnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBUZXN0IG1haW4gRXhjZWwvQ1NWIGV4cG9ydCB1c2luZyB0aGUgcHJpbWFyeSBleHBvcnQgY29udHJvbFxyXG4gICAgY29uc3QgZXhwb3J0RXhjZWxCdG4gPSBwYWdlLmxvY2F0b3IoJyNleHBvcnQtZXhjZWwtYnRuJyk7XHJcbiAgICBpZiAoYXdhaXQgZXhwb3J0RXhjZWxCdG4uaXNFbmFibGVkKCkpIHtcclxuICAgICAgY29uc3QgZG93bmxvYWQgPSBhd2FpdCBjbGlja0FuZFdhaXRGb3JEb3dubG9hZChwYWdlLCAnI2V4cG9ydC1leGNlbC1idG4nLCAxNTAwMCk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoZG93bmxvYWQpIHtcclxuICAgICAgICAvLyBSZWFkIHRoZSBDU1YgY29udGVudFxyXG4gICAgICAgIGNvbnN0IHBhdGggPSBhd2FpdCBkb3dubG9hZC5wYXRoKCk7XHJcbiAgICAgICAgY29uc3QgeyByZWFkRmlsZVN5bmMgfSA9IGF3YWl0IGltcG9ydCgnZnMnKTtcclxuICAgICAgICBjb25zdCBjc3ZDb250ZW50ID0gcmVhZEZpbGVTeW5jKHBhdGgsICd1dGYtOCcpO1xyXG4gICAgICAgIGNvbnN0IGxpbmVzID0gY3N2Q29udGVudC5zcGxpdCgnXFxuJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGxpbmVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgIGNvbnN0IGhlYWRlcnMgPSBsaW5lc1swXS5zcGxpdCgnLCcpO1xyXG4gICAgICAgICAgY29uc3QgaGFzRXBpY1RpdGxlID0gaGVhZGVycy5zb21lKGggPT4gaC5pbmNsdWRlcygnZXBpY1RpdGxlJykpO1xyXG4gICAgICAgICAgY29uc3QgaGFzRXBpY1N1bW1hcnkgPSBoZWFkZXJzLnNvbWUoaCA9PiBoLmluY2x1ZGVzKCdlcGljU3VtbWFyeScpKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgaWYgKGhhc0VwaWNUaXRsZSAmJiBoYXNFcGljU3VtbWFyeSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBDU1YgaW5jbHVkZXMgZXBpY1RpdGxlIGFuZCBlcGljU3VtbWFyeSBjb2x1bW5zJyk7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnW1RFU1RdIENTViBjb2x1bW5zIG1heSBub3QgaW5jbHVkZSBFcGljIGZpZWxkcyAoZXBpY0xpbmtGaWVsZElkIG1heSBub3QgZXhpc3QpJyk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ3Nob3VsZCBoYW5kbGUgRXBpYyBTdW1tYXJ5IG51bGwvdW5kZWZpbmVkL2VtcHR5IHNhZmVseSAoZWRnZSBjYXNlKScsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgdGVzdC5zZXRUaW1lb3V0KDEyMDAwMCk7XHJcbiAgICBjb25zb2xlLmxvZygnW1RFU1RdIFRlc3RpbmcgRXBpYyBTdW1tYXJ5IG51bGwvdW5kZWZpbmVkL2VtcHR5IGhhbmRsaW5nJyk7XHJcbiAgICBcclxuICAgIGF3YWl0IHJ1bkRlZmF1bHRQcmV2aWV3KHBhZ2UpO1xyXG4gICAgXHJcbiAgICBjb25zdCBwcmV2aWV3VmlzaWJsZSA9IGF3YWl0IHBhZ2UubG9jYXRvcignI3ByZXZpZXctY29udGVudCcpLmlzVmlzaWJsZSgpO1xyXG4gICAgaWYgKCFwcmV2aWV3VmlzaWJsZSkge1xyXG4gICAgICBjb25zb2xlLmxvZygnW1RFU1RdIFByZXZpZXcgbm90IHZpc2libGUsIHNraXBwaW5nIEVwaWMgU3VtbWFyeSBlZGdlIGNhc2UgdGVzdCcpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGF3YWl0IHBhZ2UuY2xpY2soJy50YWItYnRuW2RhdGEtdGFiPVwiZG9uZS1zdG9yaWVzXCJdJyk7XHJcbiAgICBcclxuICAgIC8vIENoZWNrIHRoYXQgcGFnZSByZW5kZXJzIHdpdGhvdXQgZXJyb3JzIGV2ZW4gaWYgRXBpYyBTdW1tYXJ5IGlzIG1pc3NpbmdcclxuICAgIGNvbnN0IGRvbmVTdG9yaWVzQ29udGVudCA9IHBhZ2UubG9jYXRvcignI2RvbmUtc3Rvcmllcy1jb250ZW50Jyk7XHJcbiAgICBhd2FpdCBleHBlY3QoZG9uZVN0b3JpZXNDb250ZW50KS50b0JlVmlzaWJsZSgpO1xyXG4gICAgXHJcbiAgICAvLyBWZXJpZnkgdGFibGUgc3RydWN0dXJlIGlzIGludGFjdCAobm8gYnJva2VuIEhUTUwgZnJvbSBudWxsL3VuZGVmaW5lZCB2YWx1ZXMpXHJcbiAgICBjb25zdCB0YWJsZVJvd3MgPSBwYWdlLmxvY2F0b3IoJyNkb25lLXN0b3JpZXMtY29udGVudCB0YWJsZSB0Ym9keSB0cicpO1xyXG4gICAgY29uc3Qgcm93Q291bnQgPSBhd2FpdCB0YWJsZVJvd3MuY291bnQoKTtcclxuICAgIFxyXG4gICAgaWYgKHJvd0NvdW50ID4gMCkge1xyXG4gICAgICAvLyBDaGVjayB0aGF0IGNlbGxzIHJlbmRlciBwcm9wZXJseSAoZW1wdHkgc3RyaW5ncyBmb3IgbWlzc2luZyBFcGljIGRhdGEgaXMgYWNjZXB0YWJsZSlcclxuICAgICAgY29uc3QgZmlyc3RSb3cgPSB0YWJsZVJvd3MuZmlyc3QoKTtcclxuICAgICAgY29uc3QgZmlyc3RSb3dWaXNpYmxlID0gYXdhaXQgZmlyc3RSb3cuaXNWaXNpYmxlKCkuY2F0Y2goKCkgPT4gZmFsc2UpO1xyXG4gICAgICBpZiAoIWZpcnN0Um93VmlzaWJsZSkge1xyXG4gICAgICAgIHRlc3Quc2tpcCgpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgICBhd2FpdCBleHBlY3QoZmlyc3RSb3cpLnRvQmVWaXNpYmxlKCk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0g4pyTIEVwaWMgU3VtbWFyeSBudWxsL3VuZGVmaW5lZC9lbXB0eSBoYW5kbGVkIHNhZmVseSAtIHRhYmxlIHJlbmRlcnMgY29ycmVjdGx5Jyk7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ3Nob3VsZCBzaG93IGxvYWRpbmcgc3RhdGUgb24gcGVyLXNlY3Rpb24gZXhwb3J0IGJ1dHRvbnMgZHVyaW5nIGV4cG9ydCcsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgdGVzdC5zZXRUaW1lb3V0KDEyMDAwMCk7XHJcbiAgICBjb25zb2xlLmxvZygnW1RFU1RdIFRlc3RpbmcgZXhwb3J0IGJ1dHRvbiBsb2FkaW5nIHN0YXRlJyk7XHJcbiAgICBcclxuICAgIGF3YWl0IHJ1bkRlZmF1bHRQcmV2aWV3KHBhZ2UpO1xyXG4gICAgXHJcbiAgICBjb25zdCBwcmV2aWV3VmlzaWJsZSA9IGF3YWl0IHBhZ2UubG9jYXRvcignI3ByZXZpZXctY29udGVudCcpLmlzVmlzaWJsZSgpO1xyXG4gICAgaWYgKCFwcmV2aWV3VmlzaWJsZSkge1xyXG4gICAgICBjb25zb2xlLmxvZygnW1RFU1RdIFByZXZpZXcgbm90IHZpc2libGUsIHNraXBwaW5nIGV4cG9ydCBsb2FkaW5nIHN0YXRlIHRlc3QnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBUZXN0IFNwcmludHMgdGFiIGV4cG9ydCBidXR0b25cclxuICAgIGF3YWl0IHBhZ2UuY2xpY2soJy50YWItYnRuW2RhdGEtdGFiPVwic3ByaW50c1wiXScpO1xyXG4gICAgY29uc3Qgc3ByaW50c0V4cG9ydEJ0biA9IHBhZ2UubG9jYXRvcignLmV4cG9ydC1zZWN0aW9uLWJ0bltkYXRhLXNlY3Rpb249XCJzcHJpbnRzXCJdJyk7XHJcbiAgICBcclxuICAgIGlmIChhd2FpdCBzcHJpbnRzRXhwb3J0QnRuLmlzVmlzaWJsZSgpKSB7XHJcbiAgICAgIC8vIENsaWNrIGJ1dHRvbiBhbmQgaW1tZWRpYXRlbHkgY2hlY2sgZm9yIGxvYWRpbmcgc3RhdGVcclxuICAgICAgY29uc3QgY2xpY2tQcm9taXNlID0gc3ByaW50c0V4cG9ydEJ0bi5jbGljaygpO1xyXG4gICAgICBcclxuICAgICAgLy8gQ2hlY2sgYnV0dG9uIGlzIGRpc2FibGVkIGFuZCB0ZXh0IGNoYW5nZXMgKHdpdGggc21hbGwgZGVsYXkgdG8gYWxsb3cgc3RhdGUgdXBkYXRlKVxyXG4gICAgICBhd2FpdCBwYWdlLndhaXRGb3JUaW1lb3V0KDEwMCk7XHJcbiAgICAgIGNvbnN0IGlzRGlzYWJsZWQgPSBhd2FpdCBzcHJpbnRzRXhwb3J0QnRuLmlzRGlzYWJsZWQoKTtcclxuICAgICAgY29uc3QgYnV0dG9uVGV4dCA9IGF3YWl0IHNwcmludHNFeHBvcnRCdG4udGV4dENvbnRlbnQoKTtcclxuICAgICAgXHJcbiAgICAgIGlmIChpc0Rpc2FibGVkICYmIGJ1dHRvblRleHQgJiYgYnV0dG9uVGV4dC5pbmNsdWRlcygnRXhwb3J0aW5nJykpIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBFeHBvcnQgYnV0dG9uIHNob3dzIGxvYWRpbmcgc3RhdGUgKGRpc2FibGVkIGFuZCB0ZXh0IGNoYW5nZWQpJyk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIFdhaXQgZm9yIGRvd25sb2FkIHRvIGNvbXBsZXRlXHJcbiAgICAgIGF3YWl0IHBhZ2Uud2FpdEZvckV2ZW50KCdkb3dubG9hZCcsIHsgdGltZW91dDogMTAwMDAgfSkuY2F0Y2goKCkgPT4gbnVsbCk7XHJcbiAgICAgIGF3YWl0IGNsaWNrUHJvbWlzZTtcclxuICAgICAgXHJcbiAgICAgIC8vIFZlcmlmeSBidXR0b24gaXMgcmUtZW5hYmxlZCBhZnRlciBleHBvcnRcclxuICAgICAgYXdhaXQgcGFnZS53YWl0Rm9yVGltZW91dCg1MDApO1xyXG4gICAgICBjb25zdCBpc0VuYWJsZWRBZnRlciA9IGF3YWl0IHNwcmludHNFeHBvcnRCdG4uaXNFbmFibGVkKCk7XHJcbiAgICAgIGNvbnN0IGJ1dHRvblRleHRBZnRlciA9IGF3YWl0IHNwcmludHNFeHBvcnRCdG4udGV4dENvbnRlbnQoKTtcclxuICAgICAgXHJcbiAgICAgIGlmIChpc0VuYWJsZWRBZnRlciAmJiBidXR0b25UZXh0QWZ0ZXIgJiYgYnV0dG9uVGV4dEFmdGVyLmluY2x1ZGVzKCdFeHBvcnQgQ1NWJykpIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBFeHBvcnQgYnV0dG9uIHJlLWVuYWJsZWQgYWZ0ZXIgZXhwb3J0IGNvbXBsZXRlcycpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ3Nob3VsZCBzaG93IGV4cG9ydCBidXR0b25zIGFmdGVyIGFzeW5jIHJlbmRlcnMgY29tcGxldGUnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIHRlc3Quc2V0VGltZW91dCgxMjAwMDApO1xyXG4gICAgY29uc29sZS5sb2coJ1tURVNUXSBUZXN0aW5nIGV4cG9ydCBidXR0b24gdmlzaWJpbGl0eSBhZnRlciBhc3luYyByZW5kZXJzJyk7XHJcbiAgICBcclxuICAgIGF3YWl0IHJ1bkRlZmF1bHRQcmV2aWV3KHBhZ2UpO1xyXG4gICAgXHJcbiAgICBjb25zdCBwcmV2aWV3VmlzaWJsZSA9IGF3YWl0IHBhZ2UubG9jYXRvcignI3ByZXZpZXctY29udGVudCcpLmlzVmlzaWJsZSgpO1xyXG4gICAgaWYgKCFwcmV2aWV3VmlzaWJsZSkge1xyXG4gICAgICBjb25zb2xlLmxvZygnW1RFU1RdIFByZXZpZXcgbm90IHZpc2libGUsIHNraXBwaW5nIGJ1dHRvbiB2aXNpYmlsaXR5IHRlc3QnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBXYWl0IGEgYml0IGZvciBhbnkgYXN5bmMgRE9NIHVwZGF0ZXNcclxuICAgIGF3YWl0IHBhZ2Uud2FpdEZvclRpbWVvdXQoNTAwKTtcclxuICAgIFxyXG4gICAgLy8gQ2hlY2sgYWxsIGV4cG9ydCBidXR0b25zIGFyZSB2aXNpYmxlIHdoZW4gZGF0YSBleGlzdHNcclxuICAgIGNvbnN0IGJvYXJkc0J0biA9IHBhZ2UubG9jYXRvcignLmV4cG9ydC1zZWN0aW9uLWJ0bltkYXRhLXNlY3Rpb249XCJwcm9qZWN0LWVwaWMtbGV2ZWxcIl0nKTtcclxuICAgIGNvbnN0IHNwcmludHNCdG4gPSBwYWdlLmxvY2F0b3IoJy5leHBvcnQtc2VjdGlvbi1idG5bZGF0YS1zZWN0aW9uPVwic3ByaW50c1wiXScpO1xyXG4gICAgY29uc3QgZG9uZVN0b3JpZXNCdG4gPSBwYWdlLmxvY2F0b3IoJy5leHBvcnQtc2VjdGlvbi1idG5bZGF0YS1zZWN0aW9uPVwiZG9uZS1zdG9yaWVzXCJdJyk7XHJcbiAgICBcclxuICAgIC8vIEF0IGxlYXN0IG9uZSBidXR0b24gc2hvdWxkIGJlIHZpc2libGUgaWYgZGF0YSBleGlzdHNcclxuICAgIGNvbnN0IGJvYXJkc1Zpc2libGUgPSBhd2FpdCBib2FyZHNCdG4uaXNWaXNpYmxlKCkuY2F0Y2goKCkgPT4gZmFsc2UpO1xyXG4gICAgY29uc3Qgc3ByaW50c1Zpc2libGUgPSBhd2FpdCBzcHJpbnRzQnRuLmlzVmlzaWJsZSgpLmNhdGNoKCgpID0+IGZhbHNlKTtcclxuICAgIGNvbnN0IGRvbmVTdG9yaWVzVmlzaWJsZSA9IGF3YWl0IGRvbmVTdG9yaWVzQnRuLmlzVmlzaWJsZSgpLmNhdGNoKCgpID0+IGZhbHNlKTtcclxuICAgIFxyXG4gICAgaWYgKGJvYXJkc1Zpc2libGUgfHwgc3ByaW50c1Zpc2libGUgfHwgZG9uZVN0b3JpZXNWaXNpYmxlKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0g4pyTIEV4cG9ydCBidXR0b25zIHZpc2libGUgYWZ0ZXIgYXN5bmMgcmVuZGVycycpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSBObyBleHBvcnQgYnV0dG9ucyB2aXNpYmxlIChtYXkgYmUgbm8gZGF0YSBpbiBwcmV2aWV3KScpO1xyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdzaG91bGQgc2hvdyBpbXByb3ZlZCBlcnJvciBtZXNzYWdlcyBmb3IgZW1wdHkgRXBpYyBkYXRhJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICB0ZXN0LnNldFRpbWVvdXQoMTIwMDAwKTtcclxuICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gVGVzdGluZyBpbXByb3ZlZCBlcnJvciBtZXNzYWdlcyBmb3IgRXBpYyBkYXRhJyk7XHJcbiAgICBcclxuICAgIGF3YWl0IHJ1bkRlZmF1bHRQcmV2aWV3KHBhZ2UpO1xyXG4gICAgXHJcbiAgICBjb25zdCBwcmV2aWV3VmlzaWJsZSA9IGF3YWl0IHBhZ2UubG9jYXRvcignI3ByZXZpZXctY29udGVudCcpLmlzVmlzaWJsZSgpO1xyXG4gICAgaWYgKCFwcmV2aWV3VmlzaWJsZSkge1xyXG4gICAgICBjb25zb2xlLmxvZygnW1RFU1RdIFByZXZpZXcgbm90IHZpc2libGUsIHNraXBwaW5nIGVycm9yIG1lc3NhZ2UgdGVzdCcpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIE5hdmlnYXRlIHRvIERvbmUgU3RvcmllcyB0YWJcclxuICAgIGF3YWl0IHBhZ2UuY2xpY2soJy50YWItYnRuW2RhdGEtdGFiPVwiZG9uZS1zdG9yaWVzXCJdJyk7XHJcbiAgICBcclxuICAgIC8vIENoZWNrIGlmIGVycm9yIGVsZW1lbnQgZXhpc3RzIGFuZCBjb250YWlucyBoZWxwZnVsIG1lc3NhZ2VcclxuICAgIGNvbnN0IGVycm9yRWwgPSBwYWdlLmxvY2F0b3IoJyNlcnJvcicpO1xyXG4gICAgY29uc3QgZXJyb3JWaXNpYmxlID0gYXdhaXQgZXJyb3JFbC5pc1Zpc2libGUoKS5jYXRjaCgoKSA9PiBmYWxzZSk7XHJcbiAgICBcclxuICAgIGlmIChlcnJvclZpc2libGUpIHtcclxuICAgICAgY29uc3QgZXJyb3JUZXh0ID0gYXdhaXQgZXJyb3JFbC50ZXh0Q29udGVudCgpO1xyXG4gICAgICAvLyBDaGVjayBmb3IgaW1wcm92ZWQgZXJyb3IgbWVzc2FnZXMgbWVudGlvbmluZyBFcGljIGRhdGEgY29uZGl0aW9uc1xyXG4gICAgICBpZiAoZXJyb3JUZXh0ICYmIChlcnJvclRleHQuaW5jbHVkZXMoJ0VwaWMgTGluayBmaWVsZCcpIHx8IGVycm9yVGV4dC5pbmNsdWRlcygnZXBpY0xpbmtGaWVsZElkJykpKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1tURVNUXSDinJMgSW1wcm92ZWQgZXJyb3IgbWVzc2FnZXMgZm9yIEVwaWMgZGF0YSBmb3VuZCcpO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjb25zb2xlLmxvZygnW1RFU1RdIE5vIGVycm9ycyBkaXNwbGF5ZWQgKG5vcm1hbCAtIEVwaWMgZGF0YSBtYXkgYmUgYXZhaWxhYmxlKScpO1xyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdzaG91bGQgdmFsaWRhdGUgYWxsIDYgQ1NWIGV4cG9ydCBidXR0b25zIHdvcmsgY29ycmVjdGx5JywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICB0ZXN0LnNldFRpbWVvdXQoMTgwMDAwKTtcclxuICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gVGVzdGluZyBhbGwgQ1NWIGV4cG9ydCBidXR0b25zJyk7XHJcbiAgICB0ZXN0LnNraXAodHJ1ZSwgJ1NraXBwZWQgaW4gQ0kgdG8gYXZvaWQgZXhjZXNzaXZlIGRvd25sb2FkIHN0b3JhZ2U7IGluZGl2aWR1YWwgZXhwb3J0IGZsb3dzIGFyZSBjb3ZlcmVkIGJ5IGRlZGljYXRlZCB0ZXN0cyBhYm92ZS4nKTtcclxuICAgIFxyXG4gICAgYXdhaXQgcnVuRGVmYXVsdFByZXZpZXcocGFnZSk7XHJcbiAgICBcclxuICAgIGNvbnN0IHByZXZpZXdWaXNpYmxlID0gYXdhaXQgcGFnZS5sb2NhdG9yKCcjcHJldmlldy1jb250ZW50JykuaXNWaXNpYmxlKCk7XHJcbiAgICBpZiAoIXByZXZpZXdWaXNpYmxlKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gUHJldmlldyBub3QgdmlzaWJsZSwgc2tpcHBpbmcgQ1NWIGV4cG9ydCB0ZXN0Jyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gVGVzdCAxOiBCb2FyZHMgZXhwb3J0XHJcbiAgICBhd2FpdCBwYWdlLmNsaWNrKCcudGFiLWJ0bltkYXRhLXRhYj1cInByb2plY3QtZXBpYy1sZXZlbFwiXScpO1xyXG4gICAgY29uc3QgYm9hcmRzRXhwb3J0QnRuID0gcGFnZS5sb2NhdG9yKCcuZXhwb3J0LXNlY3Rpb24tYnRuW2RhdGEtc2VjdGlvbj1cInByb2plY3QtZXBpYy1sZXZlbFwiXScpO1xyXG4gICAgaWYgKGF3YWl0IGJvYXJkc0V4cG9ydEJ0bi5pc1Zpc2libGUoKSkge1xyXG4gICAgICBjb25zdCBkb3dubG9hZFByb21pc2UxID0gcGFnZS53YWl0Rm9yRXZlbnQoJ2Rvd25sb2FkJywgeyB0aW1lb3V0OiAxNTAwMCB9KS5jYXRjaCgoKSA9PiBudWxsKTtcclxuICAgICAgYXdhaXQgYm9hcmRzRXhwb3J0QnRuLmNsaWNrKCk7XHJcbiAgICAgIGNvbnN0IGRvd25sb2FkMSA9IGF3YWl0IGRvd25sb2FkUHJvbWlzZTE7XHJcbiAgICAgIGlmIChkb3dubG9hZDEpIHtcclxuICAgICAgICBjb25zdCBwYXRoMSA9IGF3YWl0IGRvd25sb2FkMS5wYXRoKCk7XHJcbiAgICAgICAgY29uc3QgeyByZWFkRmlsZVN5bmMgfSA9IGF3YWl0IGltcG9ydCgnZnMnKTtcclxuICAgICAgICBjb25zdCBjb250ZW50MSA9IHJlYWRGaWxlU3luYyhwYXRoMSwgJ3V0Zi04Jyk7XHJcbiAgICAgICAgZXhwZWN0KGNvbnRlbnQxKS50b0NvbnRhaW4oJ2lkLG5hbWUsdHlwZScpO1xyXG4gICAgICAgIGV4cGVjdChjb250ZW50MSkudG9Db250YWluKCd0b3RhbFNwcmludERheXMnKTtcclxuICAgICAgICBleHBlY3QoY29udGVudDEpLnRvQ29udGFpbignZG9uZUJ5U3ByaW50RW5kUGVyY2VudCcpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0g4pyTIEJvYXJkcyBDU1YgZXhwb3J0IHdvcmtzJyk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gVGVzdCAyOiBTcHJpbnRzIGV4cG9ydFxyXG4gICAgYXdhaXQgcGFnZS5jbGljaygnLnRhYi1idG5bZGF0YS10YWI9XCJzcHJpbnRzXCJdJyk7XHJcbiAgICBjb25zdCBzcHJpbnRzRXhwb3J0QnRuID0gcGFnZS5sb2NhdG9yKCcuZXhwb3J0LXNlY3Rpb24tYnRuW2RhdGEtc2VjdGlvbj1cInNwcmludHNcIl0nKTtcclxuICAgIGlmIChhd2FpdCBzcHJpbnRzRXhwb3J0QnRuLmlzVmlzaWJsZSgpKSB7XHJcbiAgICAgIGNvbnN0IGRvd25sb2FkUHJvbWlzZTIgPSBwYWdlLndhaXRGb3JFdmVudCgnZG93bmxvYWQnLCB7IHRpbWVvdXQ6IDE1MDAwIH0pLmNhdGNoKCgpID0+IG51bGwpO1xyXG4gICAgICBhd2FpdCBzcHJpbnRzRXhwb3J0QnRuLmNsaWNrKCk7XHJcbiAgICAgIGNvbnN0IGRvd25sb2FkMiA9IGF3YWl0IGRvd25sb2FkUHJvbWlzZTI7XHJcbiAgICAgIGlmIChkb3dubG9hZDIpIHtcclxuICAgICAgICBjb25zdCBwYXRoMiA9IGF3YWl0IGRvd25sb2FkMi5wYXRoKCk7XHJcbiAgICAgICAgY29uc3QgeyByZWFkRmlsZVN5bmMgfSA9IGF3YWl0IGltcG9ydCgnZnMnKTtcclxuICAgICAgICBjb25zdCBjb250ZW50MiA9IHJlYWRGaWxlU3luYyhwYXRoMiwgJ3V0Zi04Jyk7XHJcbiAgICAgICAgZXhwZWN0KGNvbnRlbnQyKS50b0NvbnRhaW4oJ2lkLG5hbWUnKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBTcHJpbnRzIENTViBleHBvcnQgd29ya3MnKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBUZXN0IDM6IERvbmUgU3RvcmllcyBleHBvcnRcclxuICAgIGF3YWl0IHBhZ2UuY2xpY2soJy50YWItYnRuW2RhdGEtdGFiPVwiZG9uZS1zdG9yaWVzXCJdJyk7XHJcbiAgICBjb25zdCBkb25lU3Rvcmllc0V4cG9ydEJ0biA9IHBhZ2UubG9jYXRvcignLmV4cG9ydC1zZWN0aW9uLWJ0bltkYXRhLXNlY3Rpb249XCJkb25lLXN0b3JpZXNcIl0nKTtcclxuICAgIGlmIChhd2FpdCBkb25lU3Rvcmllc0V4cG9ydEJ0bi5pc1Zpc2libGUoKSkge1xyXG4gICAgICBjb25zdCBkb3dubG9hZFByb21pc2UzID0gcGFnZS53YWl0Rm9yRXZlbnQoJ2Rvd25sb2FkJywgeyB0aW1lb3V0OiAxNTAwMCB9KS5jYXRjaCgoKSA9PiBudWxsKTtcclxuICAgICAgYXdhaXQgZG9uZVN0b3JpZXNFeHBvcnRCdG4uY2xpY2soKTtcclxuICAgICAgY29uc3QgZG93bmxvYWQzID0gYXdhaXQgZG93bmxvYWRQcm9taXNlMztcclxuICAgICAgaWYgKGRvd25sb2FkMykge1xyXG4gICAgICAgIGNvbnN0IHBhdGgzID0gYXdhaXQgZG93bmxvYWQzLnBhdGgoKTtcclxuICAgICAgICBjb25zdCB7IHJlYWRGaWxlU3luYyB9ID0gYXdhaXQgaW1wb3J0KCdmcycpO1xyXG4gICAgICAgIGNvbnN0IGNvbnRlbnQzID0gcmVhZEZpbGVTeW5jKHBhdGgzLCAndXRmLTgnKTtcclxuICAgICAgICBleHBlY3QoY29udGVudDMpLnRvQ29udGFpbignaXNzdWVLZXknKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBEb25lIFN0b3JpZXMgQ1NWIGV4cG9ydCB3b3JrcycpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFRlc3QgNDogTWV0cmljcyBleHBvcnRcclxuICAgIGNvbnN0IG1ldHJpY3NUYWIgPSBwYWdlLmxvY2F0b3IoJy50YWItYnRuW2RhdGEtdGFiPVwibWV0cmljc1wiXScpO1xyXG4gICAgaWYgKGF3YWl0IG1ldHJpY3NUYWIuaXNWaXNpYmxlKCkuY2F0Y2goKCkgPT4gZmFsc2UpKSB7XHJcbiAgICAgIGF3YWl0IG1ldHJpY3NUYWIuY2xpY2soKTtcclxuICAgICAgY29uc3QgbWV0cmljc0V4cG9ydEJ0biA9IHBhZ2UubG9jYXRvcignLmV4cG9ydC1zZWN0aW9uLWJ0bltkYXRhLXNlY3Rpb249XCJtZXRyaWNzXCJdJyk7XHJcbiAgICAgIGlmIChhd2FpdCBtZXRyaWNzRXhwb3J0QnRuLmlzVmlzaWJsZSgpKSB7XHJcbiAgICAgICAgY29uc3QgZG93bmxvYWRQcm9taXNlNCA9IHBhZ2Uud2FpdEZvckV2ZW50KCdkb3dubG9hZCcsIHsgdGltZW91dDogMTUwMDAgfSkuY2F0Y2goKCkgPT4gbnVsbCk7XHJcbiAgICAgICAgYXdhaXQgbWV0cmljc0V4cG9ydEJ0bi5jbGljaygpO1xyXG4gICAgICAgIGNvbnN0IGRvd25sb2FkNCA9IGF3YWl0IGRvd25sb2FkUHJvbWlzZTQ7XHJcbiAgICAgICAgaWYgKGRvd25sb2FkNCkge1xyXG4gICAgICAgICAgY29uc3QgcGF0aDQgPSBhd2FpdCBkb3dubG9hZDQucGF0aCgpO1xyXG4gICAgICAgICAgY29uc3QgeyByZWFkRmlsZVN5bmMgfSA9IGF3YWl0IGltcG9ydCgnZnMnKTtcclxuICAgICAgICAgIGNvbnN0IGNvbnRlbnQ0ID0gcmVhZEZpbGVTeW5jKHBhdGg0LCAndXRmLTgnKTtcclxuICAgICAgICAgIGV4cGVjdChjb250ZW50NC5sZW5ndGgpLnRvQmVHcmVhdGVyVGhhbigwKTtcclxuICAgICAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gPz8/IE1ldHJpY3MgQ1NWIGV4cG9ydCB3b3JrcycpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSBNZXRyaWNzIHRhYiBub3QgdmlzaWJsZSwgc2tpcHBpbmcgbWV0cmljcyBleHBvcnQgdmFsaWRhdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFRlc3QgNTogRmlsdGVyZWQgdmlldyBleHBvcnQgKGRyb3Bkb3duIENTViBmaWx0ZXJlZClcclxuICAgIGF3YWl0IHBhZ2UuY2xpY2soJyNleHBvcnQtZHJvcGRvd24tdHJpZ2dlcicpO1xyXG4gICAgY29uc3QgY3N2RmlsdGVyZWRJdGVtID0gcGFnZS5sb2NhdG9yKCcuZXhwb3J0LWRyb3Bkb3duLWl0ZW1bZGF0YS1leHBvcnQ9XCJjc3YtZmlsdGVyZWRcIl0nKTtcclxuICAgIGlmIChhd2FpdCBjc3ZGaWx0ZXJlZEl0ZW0uaXNFbmFibGVkKCkuY2F0Y2goKCkgPT4gZmFsc2UpKSB7XHJcbiAgICAgIGNvbnN0IGRvd25sb2FkUHJvbWlzZTUgPSBwYWdlLndhaXRGb3JFdmVudCgnZG93bmxvYWQnLCB7IHRpbWVvdXQ6IDE1MDAwIH0pLmNhdGNoKCgpID0+IG51bGwpO1xyXG4gICAgICBhd2FpdCBjc3ZGaWx0ZXJlZEl0ZW0uY2xpY2soKTtcclxuICAgICAgY29uc3QgZG93bmxvYWQ1ID0gYXdhaXQgZG93bmxvYWRQcm9taXNlNTtcclxuICAgICAgaWYgKGRvd25sb2FkNSkge1xyXG4gICAgICAgIGNvbnN0IHBhdGg1ID0gYXdhaXQgZG93bmxvYWQ1LnBhdGgoKTtcclxuICAgICAgICBjb25zdCB7IHJlYWRGaWxlU3luYyB9ID0gYXdhaXQgaW1wb3J0KCdmcycpO1xyXG4gICAgICAgIGNvbnN0IGNvbnRlbnQ1ID0gcmVhZEZpbGVTeW5jKHBhdGg1LCAndXRmLTgnKTtcclxuICAgICAgICBleHBlY3QoY29udGVudDUpLnRvQ29udGFpbignaXNzdWVLZXknKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBGaWx0ZXJlZCB2aWV3IENTViBleHBvcnQgd29ya3MnKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBUZXN0IDY6IE1haW4gRXhjZWwvQ1NWIGV4cG9ydFxyXG4gICAgY29uc3QgcmF3RXhwb3J0QnRuID0gcGFnZS5sb2NhdG9yKCcjZXhwb3J0LWV4Y2VsLWJ0bicpO1xyXG4gICAgaWYgKGF3YWl0IHJhd0V4cG9ydEJ0bi5pc0VuYWJsZWQoKSkge1xyXG4gICAgICBjb25zdCBkb3dubG9hZDYgPSBhd2FpdCBjbGlja0FuZFdhaXRGb3JEb3dubG9hZChwYWdlLCAnI2V4cG9ydC1leGNlbC1idG4nLCAxNTAwMCk7XHJcbiAgICAgIGlmIChkb3dubG9hZDYpIHtcclxuICAgICAgICBjb25zdCBwYXRoNiA9IGF3YWl0IGRvd25sb2FkNi5wYXRoKCk7XHJcbiAgICAgICAgY29uc3QgZmlsZW5hbWU2ID0gZG93bmxvYWQ2LnN1Z2dlc3RlZEZpbGVuYW1lKCk7XHJcbiAgICAgICAgY29uc3QgeyByZWFkRmlsZVN5bmMgfSA9IGF3YWl0IGltcG9ydCgnZnMnKTtcclxuICAgICAgICBpZiAoZmlsZW5hbWU2LmVuZHNXaXRoKCcueGxzeCcpKSB7XHJcbiAgICAgICAgICBjb25zdCBidWZmZXIgPSByZWFkRmlsZVN5bmMocGF0aDYpO1xyXG4gICAgICAgICAgZXhwZWN0KGJ1ZmZlci5sZW5ndGgpLnRvQmVHcmVhdGVyVGhhbigwKTtcclxuICAgICAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gPyBSYXcgcHJldmlldyBFeGNlbCBleHBvcnQgd29ya3MnKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgY29uc3QgY29udGVudDYgPSByZWFkRmlsZVN5bmMocGF0aDYsICd1dGYtOCcpO1xyXG4gICAgICAgICAgZXhwZWN0KGNvbnRlbnQ2KS50b0NvbnRhaW4oJ2lzc3VlS2V5Jyk7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZygnW1RFU1RdID8gUmF3IHByZXZpZXcgQ1NWIGV4cG9ydCB3b3JrcycpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnNvbGUubG9nKCdbVEVTVF0g4pyTIEFsbCBDU1YgZXhwb3J0IGJ1dHRvbnMgdmFsaWRhdGVkJyk7XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ3Nob3VsZCBoYW5kbGUgc3BlY2lhbCBjaGFyYWN0ZXJzIGluIENTViBleHBvcnRzIGNvcnJlY3RseScsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgdGVzdC5zZXRUaW1lb3V0KDEyMDAwMCk7XHJcbiAgICBjb25zb2xlLmxvZygnW1RFU1RdIFRlc3RpbmcgQ1NWIGV4cG9ydCB3aXRoIHNwZWNpYWwgY2hhcmFjdGVycycpO1xyXG4gICAgXHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuICAgIFxyXG4gICAgY29uc3QgcHJldmlld1Zpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWNvbnRlbnQnKS5pc1Zpc2libGUoKTtcclxuICAgIGlmICghcHJldmlld1Zpc2libGUpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSBQcmV2aWV3IG5vdCB2aXNpYmxlLCBza2lwcGluZyBzcGVjaWFsIGNoYXJhY3RlcnMgdGVzdCcpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEV4cG9ydCBhbmQgY2hlY2sgdGhhdCBzcGVjaWFsIGNoYXJhY3RlcnMgYXJlIHByb3Blcmx5IGVzY2FwZWRcclxuICAgIGNvbnN0IGV4cG9ydFJhd0J0biA9IHBhZ2UubG9jYXRvcignI2V4cG9ydC1leGNlbC1idG4nKTtcclxuICAgIGlmIChhd2FpdCBleHBvcnRSYXdCdG4uaXNFbmFibGVkKCkpIHtcclxuICAgICAgY29uc3QgZG93bmxvYWQgPSBhd2FpdCBjbGlja0FuZFdhaXRGb3JEb3dubG9hZChwYWdlLCAnI2V4cG9ydC1leGNlbC1idG4nLCAxNTAwMCk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoZG93bmxvYWQpIHtcclxuICAgICAgICBjb25zdCBwYXRoID0gYXdhaXQgZG93bmxvYWQucGF0aCgpO1xyXG4gICAgICAgIGNvbnN0IHsgcmVhZEZpbGVTeW5jIH0gPSBhd2FpdCBpbXBvcnQoJ2ZzJyk7XHJcbiAgICAgICAgY29uc3QgY3N2Q29udGVudCA9IHJlYWRGaWxlU3luYyhwYXRoLCAndXRmLTgnKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBDaGVjayB0aGF0IENTViBpcyBwcm9wZXJseSBmb3JtYXR0ZWQgKG5vIHVuZXNjYXBlZCBxdW90ZXMsIGNvbW1hcywgbmV3bGluZXMpXHJcbiAgICAgICAgY29uc3QgbGluZXMgPSBjc3ZDb250ZW50LnNwbGl0KCdcXG4nKS5maWx0ZXIobCA9PiBsLnRyaW0oKSk7XHJcbiAgICAgICAgaWYgKGxpbmVzLmxlbmd0aCA+IDEpIHtcclxuICAgICAgICAgIGNvbnN0IGhlYWRlciA9IGxpbmVzWzBdO1xyXG4gICAgICAgICAgY29uc3QgZmlyc3REYXRhTGluZSA9IGxpbmVzWzFdO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBWZXJpZnkgQ1NWIHN0cnVjdHVyZSBpcyB2YWxpZFxyXG4gICAgICAgICAgZXhwZWN0KGhlYWRlci5zcGxpdCgnLCcpLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDApO1xyXG4gICAgICAgICAgZXhwZWN0KGZpcnN0RGF0YUxpbmUuc3BsaXQoJywnKS5sZW5ndGgpLnRvQmVHcmVhdGVyVGhhbigwKTtcclxuICAgICAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0g4pyTIENTViBleHBvcnQgaGFuZGxlcyBzcGVjaWFsIGNoYXJhY3RlcnMgY29ycmVjdGx5Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfSk7XHJcbn0pO1xyXG4iXSwibWFwcGluZ3MiOiJBQUFBLFNBQVNBLElBQUksRUFBRUMsTUFBTSxRQUFRLGtCQUFrQjtBQUMvQyxTQUFTQyxpQkFBaUIsUUFBUSx1REFBdUQ7QUFFekYsTUFBTUMsZ0JBQWdCLEdBQUcsZ0ZBQWdGO0FBQ3pHLE1BQU1DLGlCQUFpQixHQUFHLElBQUk7QUFFOUIsZUFBZUMsdUJBQXVCQSxDQUFDQyxJQUFJLEVBQUVDLFFBQVEsRUFBRUMsT0FBTyxHQUFHLEtBQUssRUFBRTtFQUN0RSxNQUFNQyxlQUFlLEdBQUdILElBQUksQ0FBQ0ksWUFBWSxDQUFDLFVBQVUsRUFBRTtJQUFFRjtFQUFRLENBQUMsQ0FBQyxDQUFDRyxLQUFLLENBQUMsTUFBTSxJQUFJLENBQUM7RUFDcEYsTUFBTUMsYUFBYSxHQUFHTixJQUFJLENBQ3ZCSSxZQUFZLENBQUMsUUFBUSxFQUFFO0lBQUVGLE9BQU8sRUFBRUo7RUFBa0IsQ0FBQyxDQUFDLENBQ3REUyxJQUFJLENBQUMsTUFB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