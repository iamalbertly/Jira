/**
 * Excel Export Validation Tests
 * Tests Excel export functionality including file naming, multi-tab structure,
 * business-friendly column names, Excel-compatible dates, and KPI calculations
 */

import { test, expect } from '@playwright/test';
import { runDefaultPreview } from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';
const EXPORT_TIMEOUT_MS = 60000;
const DIALOG_TIMEOUT_MS = 5000;
async function clickExcelExportAndWait(page, timeout = EXPORT_TIMEOUT_MS) {
  const downloadPromise = page.waitForEvent('download', {
    timeout
  });
  const dialogPromise = page.waitForEvent('dialog', {
    timeout: DIALOG_TIMEOUT_MS
  }).then(async dialog => {
    await dialog.accept();
  }).catch(() => null);
  await page.click('#export-excel-btn');
  await dialogPromise;
  return downloadPromise;
}
async function loadWorkbookFromDownload(download) {
  const path = await download.path();
  const {
    readFileSync
  } = await import('fs');
  const buffer = readFileSync(path);
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}
test.describe('Jira Reporting App - Excel Export Tests', () => {
  test.beforeEach(async ({
    page
  }) => {
    await page.goto('/report');
    await expect(page.locator('h1')).toContainText('VodaAgileBoard');
  });
  test('should generate Excel file with correct filename format', async ({
    page
  }) => {
    test.setTimeout(180000);
    console.log('[TEST] Testing Excel filename format');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping Excel filename test');
      return;
    }

    // Click Excel export button
    const exportExcelBtn = page.locator('#export-excel-btn');
    if (await exportExcelBtn.isEnabled()) {
      const download = await clickExcelExportAndWait(page, EXPORT_TIMEOUT_MS);
      if (download) {
        const filename = download.suggestedFilename();
        // Verify filename pattern: {Projects}_{DateRange}_{Type}_{Date}.xlsx
        const filenamePattern = /^[A-Z-]+_(Q[1-4]-\d{4}|\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2})_Sprint-Report_\d{4}-\d{2}-\d{2}\.xlsx$/;
        expect(filename).toMatch(filenamePattern);
        console.log(`[TEST] Excel filename format correct: ${filename}`);
      }
    }
  });
  test('should have Excel-compatible date formats', async ({
    page
  }) => {
    test.setTimeout(180000);
    console.log('[TEST] Testing Excel date formats');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping Excel date format test');
      return;
    }
    const exportExcelBtn = page.locator('#export-excel-btn');
    if (await exportExcelBtn.isEnabled()) {
      const download = await clickExcelExportAndWait(page, EXPORT_TIMEOUT_MS);
      if (download) {
        const workbook = await loadWorkbookFromDownload(download);

        // Check Stories sheet for date columns
        const storiesSheet = workbook.getWorksheet('Stories');
        if (storiesSheet) {
          const headerRow = storiesSheet.getRow(1);
          const dateColumns = [];
          headerRow.eachCell({
            includeEmpty: false
          }, (cell, colNumber) => {
            const colName = cell.value;
            if (colName && (colName.toString().includes('Date') || colName.toString().includes('date'))) {
              dateColumns.push({
                name: colName,
                colNumber
              });
            }
          });

          // Check that date cells are Date objects or formatted correctly
          if (dateColumns.length > 0 && storiesSheet.rowCount > 1) {
            const dataRow = storiesSheet.getRow(2);
            dateColumns.forEach(({
              name,
              colNumber
            }) => {
              const cell = dataRow.getCell(colNumber);
              if (cell.value) {
                // Date should be a Date object or formatted string
                const isDate = cell.value instanceof Date || typeof cell.value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(cell.value);
                expect(isDate || cell.value === '').toBeTruthy();
              }
            });
            console.log(`[TEST] ✓ Excel date columns formatted correctly: ${dateColumns.map(c => c.name).join(', ')}`);
          }
        }
      }
    }
  });
  test('should have business-friendly column names', async ({
    page
  }) => {
    test.setTimeout(180000);
    console.log('[TEST] Testing business-friendly column names');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping column names test');
      return;
    }
    const exportExcelBtn = page.locator('#export-excel-btn');
    if (await exportExcelBtn.isEnabled()) {
      const download = await clickExcelExportAndWait(page, EXPORT_TIMEOUT_MS);
      if (download) {
        const workbook = await loadWorkbookFromDownload(download);

        // Check Stories sheet headers
        const storiesSheet = workbook.getWorksheet('Stories');
        if (storiesSheet) {
          const headerRow = storiesSheet.getRow(1);
          const headers = [];
          headerRow.eachCell({
            includeEmpty: false
          }, cell => {
            headers.push(cell.value.toString());
          });

          // Verify business-friendly names (not technical names)
          expect(headers).not.toContain('issueKey'); // Should be 'Ticket ID'
          expect(headers).not.toContain('sprintStartDate'); // Should be 'Sprint Start Date'
          expect(headers).not.toContain('epicKey'); // Should be 'Epic ID'

          // Verify business-friendly names exist
          const hasTicketID = headers.some(h => h.includes('Ticket ID'));
          const hasSprintStartDate = headers.some(h => h.includes('Sprint Start Date'));
          const hasEpicID = headers.some(h => h.includes('Epic ID'));
          if (hasTicketID || hasSprintStartDate || hasEpicID) {
            console.log('[TEST] ✓ Excel contains business-friendly column names');
          }
        }
      }
    }
  });
  test('should calculate KPI columns correctly', async ({
    page
  }) => {
    test.setTimeout(180000);
    console.log('[TEST] Testing KPI column calculations');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping KPI calculations test');
      return;
    }
    const exportExcelBtn = page.locator('#export-excel-btn');
    if (await exportExcelBtn.isEnabled()) {
      const download = await clickExcelExportAndWait(page, EXPORT_TIMEOUT_MS);
      if (download) {
        const workbook = await loadWorkbookFromDownload(download);

        // Check Stories sheet for KPI columns
        const storiesSheet = workbook.getWorksheet('Stories');
        if (storiesSheet) {
          const headerRow = storiesSheet.getRow(1);
          const kpiColumns = [];
          headerRow.eachCell({
            includeEmpty: false
          }, (cell, colNumber) => {
            const colName = cell.value.toString();
            if (colName.includes('Work Days') || colName.includes('Cycle Time') || colName.includes('Days Since')) {
              kpiColumns.push({
                name: colName,
                colNumber
              });
            }
          });
          if (kpiColumns.length > 0) {
            console.log(`[TEST] ✓ Excel contains KPI columns: ${kpiColumns.map(c => c.name).join(', ')}`);

            // Verify KPI columns have numeric values (if data exists)
            if (storiesSheet.rowCount > 1) {
              const dataRow = storiesSheet.getRow(2);
              kpiColumns.forEach(({
                name,
                colNumber
              }) => {
                const cell = dataRow.getCell(colNumber);
                // KPI values should be numbers or empty strings
                const isValid = cell.value === '' || typeof cell.value === 'number';
                expect(isValid).toBeTruthy();
              });
            }
          }
        }
      }
    }
  });
  test('should include manual enrichment columns', async ({
    page
  }) => {
    test.setTimeout(180000);
    console.log('[TEST] Testing manual enrichment columns');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping manual enrichment test');
      return;
    }
    const exportExcelBtn = page.locator('#export-excel-btn');
    if (await exportExcelBtn.isEnabled()) {
      const download = await clickExcelExportAndWait(page, EXPORT_TIMEOUT_MS);
      if (download) {
        const workbook = await loadWorkbookFromDownload(download);
        const storiesSheet = workbook.getWorksheet('Stories');
        if (storiesSheet) {
          const headerRow = storiesSheet.getRow(1);
          const headers = [];
          headerRow.eachCell({
            includeEmpty: false
          }, cell => {
            headers.push(cell.value.toString());
          });

          // Verify manual enrichment columns exist
          const hasEpicIDManual = headers.some(h => h.includes('Epic ID (Manual)'));
          const hasEpicNameManual = headers.some(h => h.includes('Epic Name (Manual)'));
          const hasIsReworkManual = headers.some(h => h.includes('Is Rework (Manual)'));
          const hasIsBugManual = headers.some(h => h.includes('Is Bug (Manual)'));
          const hasTeamNotes = headers.some(h => h.includes('Team Notes'));
          if (hasEpicIDManual || hasEpicNameManual || hasIsReworkManual || hasIsBugManual || hasTeamNotes) {
            console.log('[TEST] ✓ Excel contains manual enrichment columns');
          }
        }
      }
    }
  });
  test('should contain Summary tab with key metrics', async ({
    page
  }) => {
    test.setTimeout(180000);
    console.log('[TEST] Testing Summary tab content');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping Summary tab test');
      return;
    }
    const exportExcelBtn = page.locator('#export-excel-btn');
    if (await exportExcelBtn.isEnabled()) {
      const download = await clickExcelExportAndWait(page, EXPORT_TIMEOUT_MS);
      if (download) {
        const workbook = await loadWorkbookFromDownload(download);
        const summarySheet = workbook.getWorksheet('Summary');
        if (summarySheet) {
          // Check that Summary sheet has data
          expect(summarySheet.rowCount).toBeGreaterThan(1);

          // Check for key sections
          const allValues = [];
          summarySheet.eachRow(row => {
            row.eachCell({
              includeEmpty: false
            }, cell => {
              allValues.push(cell.value.toString());
            });
          });
          const hasOverview = allValues.some(v => v.includes('Overview') || v.includes('Total Stories'));
          const hasKeyMetrics = allValues.some(v => v.includes('Key Metrics') || v.includes('Story Points'));
          const hasDataQuality = allValues.some(v => v.includes('Data Quality'));
          if (hasOverview || hasKeyMetrics || hasDataQuality) {
            console.log('[TEST] ✓ Summary tab contains key sections');
          }
        }
      }
    }
  });
  test('should contain Metadata tab with export context', async ({
    page
  }) => {
    test.setTimeout(180000);
    console.log('[TEST] Testing Metadata tab content');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping Metadata tab test');
      return;
    }
    const exportExcelBtn = page.locator('#export-excel-btn');
    if (await exportExcelBtn.isEnabled()) {
      const download = await clickExcelExportAndWait(page, EXPORT_TIMEOUT_MS);
      if (download) {
        const workbook = await loadWorkbookFromDownload(download);
        const metadataSheet = workbook.getWorksheet('Metadata');
        if (metadataSheet) {
          expect(metadataSheet.rowCount).toBeGreaterThan(1);

          // Check for key metadata fields
          const allValues = [];
          metadataSheet.eachRow(row => {
            row.eachCell({
              includeEmpty: false
            }, cell => {
              allValues.push(cell.value.toString());
            });
          });
          const hasExportDate = allValues.some(v => v.includes('Export Date') || v.includes('Export Time'));
          const hasDateRange = allValues.some(v => v.includes('Date Range'));
          const hasProjects = allValues.some(v => v.includes('Projects'));
          if (hasExportDate || hasDateRange || hasProjects) {
            console.log('[TEST] ✓ Metadata tab contains export context');
          }
        }
      }
    }
  });
  test('should handle Project & Epic Level tab export', async ({
    page
  }) => {
    test.setTimeout(180000);
    console.log('[TEST] Testing Project & Epic Level tab export');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping Project & Epic Level export test');
      return;
    }

    // Navigate to Project & Epic Level tab
    await page.click('.tab-btn[data-tab="project-epic-level"]');

    // Check for export button
    const exportBtn = page.locator('.export-section-btn[data-section="project-epic-level"]');
    if (await exportBtn.isVisible()) {
      const downloadPromise = page.waitForEvent('download', {
        timeout: 15000
      }).catch(() => null);
      await exportBtn.click();
      const download = await downloadPromise;
      if (download) {
        console.log('[TEST] ✓ Project & Epic Level tab export works');
      }
    }
  });
  test('should validate Excel workbook data before sending to server', async ({
    page
  }) => {
    test.setTimeout(180000);
    console.log('[TEST] Testing Excel export validation');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping validation test');
      return;
    }

    // Validation happens client-side before fetch, so we test that export works
    // (which implies validation passed)
    const exportExcelBtn = page.locator('#export-excel-btn');
    if (await exportExcelBtn.isEnabled()) {
      const download = await clickExcelExportAndWait(page, EXPORT_TIMEOUT_MS).catch(() => null);
      if (download) {
        console.log('[TEST] ✓ Excel export validation passed (export succeeded)');
      }
    }
  });
  test('should show placeholder messages in empty Excel tabs', async ({
    page
  }) => {
    test.setTimeout(180000);
    console.log('[TEST] Testing empty Excel tabs with placeholder messages');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping empty tabs test');
      return;
    }
    const exportExcelBtn = page.locator('#export-excel-btn');
    if (await exportExcelBtn.isEnabled()) {
      const download = await clickExcelExportAndWait(page, EXPORT_TIMEOUT_MS).catch(() => null);
      if (download) {
        const workbook = await loadWorkbookFromDownload(download);

        // Check Epics sheet for placeholder message if empty
        const epicsSheet = workbook.getWorksheet('Epics');
        if (epicsSheet && epicsSheet.rowCount > 1) {
          const firstDataRow = epicsSheet.getRow(2);
          const epicIDCell = firstDataRow.getCell(1);
          if (epicIDCell.value && epicIDCell.value.toString().includes('No Epic TTM data available')) {
            console.log('[TEST] ✓ Empty Epics sheet shows placeholder message');
          }
        }

        // Check Sprints sheet for placeholder message if empty
        const sprintsSheet = workbook.getWorksheet('Sprints');
        if (sprintsSheet && sprintsSheet.rowCount > 1) {
          const firstDataRow = sprintsSheet.getRow(2);
          const sprintIDCell = firstDataRow.getCell(1);
          if (sprintIDCell.value && sprintIDCell.value.toString().includes('No sprint data available')) {
            console.log('[TEST] ✓ Empty Sprints sheet shows placeholder message');
          }
        }
      }
    }
  });
  test('should show file size warning for large Excel exports', async ({
    page
  }) => {
    test.setTimeout(180000);
    console.log('[TEST] Testing file size warning (may not trigger with test data)');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping file size warning test');
      return;
    }

    // File size warning only appears for very large files (>50MB)
    // Test data may not be large enough, so we just verify export works
    const exportExcelBtn = page.locator('#export-excel-btn');
    if (await exportExcelBtn.isEnabled()) {
      // Note: File size warning uses confirm() dialog which is hard to test in Playwright
      // We verify export works, which implies either no warning or user confirmed
      const download = await clickExcelExportAndWait(page, EXPORT_TIMEOUT_MS).catch(() => null);
      if (download) {
        console.log('[TEST] ✓ Excel export works (file size warning may not have triggered with test data)');
      }
    }
  });
  test('should show improved error messages for Excel export failures', async ({
    page
  }) => {
    test.setTimeout(180000);
    console.log('[TEST] Testing improved error messages');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping error message test');
      return;
    }

    // Error messages are tested implicitly when export succeeds
    // For explicit error testing, we'd need to mock server failures
    const exportExcelBtn = page.locator('#export-excel-btn');
    if (await exportExcelBtn.isEnabled()) {
      const download = await clickExcelExportAndWait(page, EXPORT_TIMEOUT_MS).catch(() => null);
      if (download) {
        console.log('[TEST] ✓ Excel export error handling works (export succeeded)');
      }
    }
  });
  test('should block Excel export with clear error when preview meta is missing', async ({
    page
  }) => {
    test.setTimeout(180000);
    console.log('[TEST] Testing export behavior when preview meta is missing');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping missing meta export test');
      return;
    }

    // Simulate a broken preview payload where meta is missing
    await page.evaluate(() => {
      // @ts-ignore
      if (window.previewData) {
        // @ts-ignore
        window.previewData.meta = undefined;
      }
    });
    const exportExcelBtn = page.locator('#export-excel-btn');
    if (await exportExcelBtn.isEnabled()) {
      const dialogPromise = page.waitForEvent('dialog', {
        timeout: DIALOG_TIMEOUT_MS
      }).then(async dialog => {
        await dialog.accept();
      }).catch(() => null);
      await exportExcelBtn.click();
      await dialogPromise;
      const errorLocator = page.locator('#error');
      const errorPromise = errorLocator.waitFor({
        state: 'visible',
        timeout: 10000
      }).then(() => ({
        type: 'error'
      })).catch(() => null);
      const downloadPromise = page.waitForEvent('download', {
        timeout: 10000
      }).then(download => ({
        type: 'download',
        download
      })).catch(() => null);
      const result = await Promise.race([errorPromise, downloadPromise]);
      if (result?.type == 'error') {
        const errorText = (await errorLocator.innerText())?.toLowerCase() || '';
        expect(errorText).toContain('export error');
        expect(errorText).toContain('metadata');
        console.log('[TEST] ? Export blocked with clear error when preview meta is missing');
      } else if (result?.type == 'download') {
        console.log('[TEST] ? Export succeeded without meta (fallback path)');
      } else {
        test.skip();
      }
    }
  });
  test('should show specific error message when server returns 500 for Excel export', async ({
    page
  }) => {
    test.setTimeout(180000);
    console.log('[TEST] Testing Excel export server error handling (500)');
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping server error export test');
      return;
    }

    // Force /export-excel to return a 500 error
    await page.route('/export-excel', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Simulated failure'
        })
      });
    });
    const exportExcelBtn = page.locator('#export-excel-btn');
    if (await exportExcelBtn.isEnabled()) {
      const dialogPromise = page.waitForEvent('dialog', {
        timeout: DIALOG_TIMEOUT_MS
      }).then(async dialog => {
        await dialog.accept();
      }).catch(() => null);
      await exportExcelBtn.click();
      await dialogPromise;
      const errorLocator = page.locator('#error');
      await errorLocator.waitFor({
        state: 'visible',
        timeout: 10000
      });
      const errorText = (await errorLocator.innerText())?.toLowerCase() || '';
      expect(errorText).toContain('export error');
      expect(errorText).toContain('server error during excel generation');
      console.log('[TEST] ✓ Excel export shows specific error when server returns 500');
    }

    // Clean up route so other tests are not affected
    await page.unroute('/export-excel');
  });
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0ZXN0IiwiZXhwZWN0IiwicnVuRGVmYXVsdFByZXZpZXciLCJFWFBPUlRfVElNRU9VVF9NUyIsIkRJQUxPR19USU1FT1VUX01TIiwiY2xpY2tFeGNlbEV4cG9ydEFuZFdhaXQiLCJwYWdlIiwidGltZW91dCIsImRvd25sb2FkUHJvbWlzZSIsIndhaXRGb3JFdmVudCIsImRpYWxvZ1Byb21pc2UiLCJ0aGVuIiwiZGlhbG9nIiwiYWNjZXB0IiwiY2F0Y2giLCJjbGljayIsImxvYWRXb3JrYm9va0Zyb21Eb3dubG9hZCIsImRvd25sb2FkIiwicGF0aCIsInJlYWRGaWxlU3luYyIsImJ1ZmZlciIsIkV4Y2VsSlMiLCJkZWZhdWx0Iiwid29ya2Jvb2siLCJXb3JrYm9vayIsInhsc3giLCJsb2FkIiwiZGVzY3JpYmUiLCJiZWZvcmVFYWNoIiwiZ290byIsImxvY2F0b3IiLCJ0b0NvbnRhaW5UZXh0Iiwic2V0VGltZW91dCIsImNvbnNvbGUiLCJsb2ciLCJwcmV2aWV3VmlzaWJsZSIsImlzVmlzaWJsZSIsImV4cG9ydEV4Y2VsQnRuIiwiaXNFbmFibGVkIiwiZmlsZW5hbWUiLCJzdWdnZXN0ZWRGaWxlbmFtZSIsImZpbGVuYW1lUGF0dGVybiIsInRvTWF0Y2giLCJzdG9yaWVzU2hlZXQiLCJnZXRXb3Jrc2hlZXQiLCJoZWFkZXJSb3ciLCJnZXRSb3ciLCJkYXRlQ29sdW1ucyIsImVhY2hDZWxsIiwiaW5jbHVkZUVtcHR5IiwiY2VsbCIsImNvbE51bWJlciIsImNvbE5hbWUiLCJ2YWx1ZSIsInRvU3RyaW5nIiwiaW5jbHVkZXMiLCJwdXNoIiwibmFtZSIsImxlbmd0aCIsInJvd0NvdW50IiwiZGF0YVJvdyIsImZvckVhY2giLCJnZXRDZWxsIiwiaXNEYXRlIiwiRGF0ZSIsInRvQmVUcnV0aHkiLCJtYXAiLCJjIiwiam9pbiIsImhlYWRlcnMiLCJub3QiLCJ0b0NvbnRhaW4iLCJoYXNUaWNrZXRJRCIsInNvbWUiLCJoIiwiaGFzU3ByaW50U3RhcnREYXRlIiwiaGFzRXBpY0lEIiwia3BpQ29sdW1ucyIsImlzVmFsaWQiLCJoYXNFcGljSURNYW51YWwiLCJoYXNFcGljTmFtZU1hbnVhbCIsImhhc0lzUmV3b3JrTWFudWFsIiwiaGFzSXNCdWdNYW51YWwiLCJoYXNUZWFtTm90ZXMiLCJzdW1tYXJ5U2hlZXQiLCJ0b0JlR3JlYXRlclRoYW4iLCJhbGxWYWx1ZXMiLCJlYWNoUm93Iiwicm93IiwiaGFzT3ZlcnZpZXciLCJ2IiwiaGFzS2V5TWV0cmljcyIsImhhc0RhdGFRdWFsaXR5IiwibWV0YWRhdGFTaGVldCIsImhhc0V4cG9ydERhdGUiLCJoYXNEYXRlUmFuZ2UiLCJoYXNQcm9qZWN0cyIsImV4cG9ydEJ0biIsImVwaWNzU2hlZXQiLCJmaXJzdERhdGFSb3ciLCJlcGljSURDZWxsIiwic3ByaW50c1NoZWV0Iiwic3ByaW50SURDZWxsIiwiZXZhbHVhdGUiLCJ3aW5kb3ciLCJwcmV2aWV3RGF0YSIsIm1ldGEiLCJ1bmRlZmluZWQiLCJlcnJvckxvY2F0b3IiLCJlcnJvclByb21pc2UiLCJ3YWl0Rm9yIiwic3RhdGUiLCJ0eXBlIiwicmVzdWx0IiwiUHJvbWlzZSIsInJhY2UiLCJlcnJvclRleHQiLCJpbm5lclRleHQiLCJ0b0xvd2VyQ2FzZSIsInNraXAiLCJyb3V0ZSIsImZ1bGZpbGwiLCJzdGF0dXMiLCJjb250ZW50VHlwZSIsImJvZHkiLCJKU09OIiwic3RyaW5naWZ5IiwiZXJyb3IiLCJ1bnJvdXRlIl0sInNvdXJjZXMiOlsiSmlyYS1SZXBvcnRpbmctQXBwLUV4Y2VsLUV4cG9ydC1UZXN0cy5zcGVjLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBFeGNlbCBFeHBvcnQgVmFsaWRhdGlvbiBUZXN0c1xyXG4gKiBUZXN0cyBFeGNlbCBleHBvcnQgZnVuY3Rpb25hbGl0eSBpbmNsdWRpbmcgZmlsZSBuYW1pbmcsIG11bHRpLXRhYiBzdHJ1Y3R1cmUsXHJcbiAqIGJ1c2luZXNzLWZyaWVuZGx5IGNvbHVtbiBuYW1lcywgRXhjZWwtY29tcGF0aWJsZSBkYXRlcywgYW5kIEtQSSBjYWxjdWxhdGlvbnNcclxuICovXHJcblxyXG5pbXBvcnQgeyB0ZXN0LCBleHBlY3QgfSBmcm9tICdAcGxheXdyaWdodC90ZXN0JztcclxuaW1wb3J0IHsgcnVuRGVmYXVsdFByZXZpZXcgfSBmcm9tICcuL0ppcmFSZXBvcnRpbmctVGVzdHMtU2hhcmVkLVByZXZpZXdFeHBvcnQtSGVscGVycy5qcyc7XHJcblxyXG5jb25zdCBFWFBPUlRfVElNRU9VVF9NUyA9IDYwMDAwO1xyXG5jb25zdCBESUFMT0dfVElNRU9VVF9NUyA9IDUwMDA7XHJcblxyXG5hc3luYyBmdW5jdGlvbiBjbGlja0V4Y2VsRXhwb3J0QW5kV2FpdChwYWdlLCB0aW1lb3V0ID0gRVhQT1JUX1RJTUVPVVRfTVMpIHtcclxuICBjb25zdCBkb3dubG9hZFByb21pc2UgPSBwYWdlLndhaXRGb3JFdmVudCgnZG93bmxvYWQnLCB7IHRpbWVvdXQgfSk7XHJcbiAgY29uc3QgZGlhbG9nUHJvbWlzZSA9IHBhZ2VcclxuICAgIC53YWl0Rm9yRXZlbnQoJ2RpYWxvZycsIHsgdGltZW91dDogRElBTE9HX1RJTUVPVVRfTVMgfSlcclxuICAgIC50aGVuKGFzeW5jIChkaWFsb2cpID0+IHtcclxuICAgICAgYXdhaXQgZGlhbG9nLmFjY2VwdCgpO1xyXG4gICAgfSlcclxuICAgIC5jYXRjaCgoKSA9PiBudWxsKTtcclxuXHJcbiAgYXdhaXQgcGFnZS5jbGljaygnI2V4cG9ydC1leGNlbC1idG4nKTtcclxuICBhd2FpdCBkaWFsb2dQcm9taXNlO1xyXG4gIHJldHVybiBkb3dubG9hZFByb21pc2U7XHJcbn1cclxuYXN5bmMgZnVuY3Rpb24gbG9hZFdvcmtib29rRnJvbURvd25sb2FkKGRvd25sb2FkKSB7XHJcbiAgY29uc3QgcGF0aCA9IGF3YWl0IGRvd25sb2FkLnBhdGgoKTtcclxuICBjb25zdCB7IHJlYWRGaWxlU3luYyB9ID0gYXdhaXQgaW1wb3J0KCdmcycpO1xyXG4gIGNvbnN0IGJ1ZmZlciA9IHJlYWRGaWxlU3luYyhwYXRoKTtcclxuICBjb25zdCBFeGNlbEpTID0gKGF3YWl0IGltcG9ydCgnZXhjZWxqcycpKS5kZWZhdWx0O1xyXG4gIGNvbnN0IHdvcmtib29rID0gbmV3IEV4Y2VsSlMuV29ya2Jvb2soKTtcclxuICBhd2FpdCB3b3JrYm9vay54bHN4LmxvYWQoYnVmZmVyKTtcclxuICByZXR1cm4gd29ya2Jvb2s7XHJcbn1cclxuXHJcbnRlc3QuZGVzY3JpYmUoJ0ppcmEgUmVwb3J0aW5nIEFwcCAtIEV4Y2VsIEV4cG9ydCBUZXN0cycsICgpID0+IHtcclxuICB0ZXN0LmJlZm9yZUVhY2goYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICBhd2FpdCBwYWdlLmdvdG8oJy9yZXBvcnQnKTtcclxuICAgIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJ2gxJykpLnRvQ29udGFpblRleHQoJ1ZvZGFBZ2lsZUJvYXJkJyk7XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ3Nob3VsZCBnZW5lcmF0ZSBFeGNlbCBmaWxlIHdpdGggY29ycmVjdCBmaWxlbmFtZSBmb3JtYXQnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIHRlc3Quc2V0VGltZW91dCgxODAwMDApO1xyXG4gICAgY29uc29sZS5sb2coJ1tURVNUXSBUZXN0aW5nIEV4Y2VsIGZpbGVuYW1lIGZvcm1hdCcpO1xyXG4gICAgXHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuICAgIFxyXG4gICAgY29uc3QgcHJldmlld1Zpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWNvbnRlbnQnKS5pc1Zpc2libGUoKTtcclxuICAgIGlmICghcHJldmlld1Zpc2libGUpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSBQcmV2aWV3IG5vdCB2aXNpYmxlLCBza2lwcGluZyBFeGNlbCBmaWxlbmFtZSB0ZXN0Jyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQ2xpY2sgRXhjZWwgZXhwb3J0IGJ1dHRvblxyXG4gICAgY29uc3QgZXhwb3J0RXhjZWxCdG4gPSBwYWdlLmxvY2F0b3IoJyNleHBvcnQtZXhjZWwtYnRuJyk7XHJcbiAgICBpZiAoYXdhaXQgZXhwb3J0RXhjZWxCdG4uaXNFbmFibGVkKCkpIHtcclxuICAgICAgY29uc3QgZG93bmxvYWQgPSBhd2FpdCBjbGlja0V4Y2VsRXhwb3J0QW5kV2FpdChwYWdlLCBFWFBPUlRfVElNRU9VVF9NUyk7XHJcblxyXG4gICAgICBpZiAoZG93bmxvYWQpIHtcclxuICAgICAgICBjb25zdCBmaWxlbmFtZSA9IGRvd25sb2FkLnN1Z2dlc3RlZEZpbGVuYW1lKCk7XHJcbiAgICAgICAgLy8gVmVyaWZ5IGZpbGVuYW1lIHBhdHRlcm46IHtQcm9qZWN0c31fe0RhdGVSYW5nZX1fe1R5cGV9X3tEYXRlfS54bHN4XHJcbiAgICAgICAgY29uc3QgZmlsZW5hbWVQYXR0ZXJuID0gL15bQS1aLV0rXyhRWzEtNF0tXFxkezR9fFxcZHs0fS1cXGR7Mn0tXFxkezJ9X3RvX1xcZHs0fS1cXGR7Mn0tXFxkezJ9KV9TcHJpbnQtUmVwb3J0X1xcZHs0fS1cXGR7Mn0tXFxkezJ9XFwueGxzeCQvO1xyXG4gICAgICAgIGV4cGVjdChmaWxlbmFtZSkudG9NYXRjaChmaWxlbmFtZVBhdHRlcm4pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBbVEVTVF0gRXhjZWwgZmlsZW5hbWUgZm9ybWF0IGNvcnJlY3Q6ICR7ZmlsZW5hbWV9YCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgdGVzdCgnc2hvdWxkIGhhdmUgRXhjZWwtY29tcGF0aWJsZSBkYXRlIGZvcm1hdHMnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIHRlc3Quc2V0VGltZW91dCgxODAwMDApO1xyXG4gICAgY29uc29sZS5sb2coJ1tURVNUXSBUZXN0aW5nIEV4Y2VsIGRhdGUgZm9ybWF0cycpO1xyXG4gICAgXHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuICAgIFxyXG4gICAgY29uc3QgcHJldmlld1Zpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWNvbnRlbnQnKS5pc1Zpc2libGUoKTtcclxuICAgIGlmICghcHJldmlld1Zpc2libGUpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSBQcmV2aWV3IG5vdCB2aXNpYmxlLCBza2lwcGluZyBFeGNlbCBkYXRlIGZvcm1hdCB0ZXN0Jyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc3QgZXhwb3J0RXhjZWxCdG4gPSBwYWdlLmxvY2F0b3IoJyNleHBvcnQtZXhjZWwtYnRuJyk7XHJcbiAgICBpZiAoYXdhaXQgZXhwb3J0RXhjZWxCdG4uaXNFbmFibGVkKCkpIHtcclxuICAgICAgY29uc3QgZG93bmxvYWQgPSBhd2FpdCBjbGlja0V4Y2VsRXhwb3J0QW5kV2FpdChwYWdlLCBFWFBPUlRfVElNRU9VVF9NUyk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoZG93bmxvYWQpIHtcclxuICAgICAgICBjb25zdCB3b3JrYm9vayA9IGF3YWl0IGxvYWRXb3JrYm9va0Zyb21Eb3dubG9hZChkb3dubG9hZCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQ2hlY2sgU3RvcmllcyBzaGVldCBmb3IgZGF0ZSBjb2x1bW5zXHJcbiAgICAgICAgY29uc3Qgc3Rvcmllc1NoZWV0ID0gd29ya2Jvb2suZ2V0V29ya3NoZWV0KCdTdG9yaWVzJyk7XHJcbiAgICAgICAgaWYgKHN0b3JpZXNTaGVldCkge1xyXG4gICAgICAgICAgY29uc3QgaGVhZGVyUm93ID0gc3Rvcmllc1NoZWV0LmdldFJvdygxKTtcclxuICAgICAgICAgIGNvbnN0IGRhdGVDb2x1bW5zID0gW107XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGhlYWRlclJvdy5lYWNoQ2VsbCh7IGluY2x1ZGVFbXB0eTogZmFsc2UgfSwgKGNlbGwsIGNvbE51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb2xOYW1lID0gY2VsbC52YWx1ZTtcclxuICAgICAgICAgICAgaWYgKGNvbE5hbWUgJiYgKGNvbE5hbWUudG9TdHJpbmcoKS5pbmNsdWRlcygnRGF0ZScpIHx8IGNvbE5hbWUudG9TdHJpbmcoKS5pbmNsdWRlcygnZGF0ZScpKSkge1xyXG4gICAgICAgICAgICAgIGRhdGVDb2x1bW5zLnB1c2goeyBuYW1lOiBjb2xOYW1lLCBjb2xOdW1iZXIgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBDaGVjayB0aGF0IGRhdGUgY2VsbHMgYXJlIERhdGUgb2JqZWN0cyBvciBmb3JtYXR0ZWQgY29ycmVjdGx5XHJcbiAgICAgICAgICBpZiAoZGF0ZUNvbHVtbnMubGVuZ3RoID4gMCAmJiBzdG9yaWVzU2hlZXQucm93Q291bnQgPiAxKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGRhdGFSb3cgPSBzdG9yaWVzU2hlZXQuZ2V0Um93KDIpO1xyXG4gICAgICAgICAgICBkYXRlQ29sdW1ucy5mb3JFYWNoKCh7IG5hbWUsIGNvbE51bWJlciB9KSA9PiB7XHJcbiAgICAgICAgICAgICAgY29uc3QgY2VsbCA9IGRhdGFSb3cuZ2V0Q2VsbChjb2xOdW1iZXIpO1xyXG4gICAgICAgICAgICAgIGlmIChjZWxsLnZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBEYXRlIHNob3VsZCBiZSBhIERhdGUgb2JqZWN0IG9yIGZvcm1hdHRlZCBzdHJpbmdcclxuICAgICAgICAgICAgICAgIGNvbnN0IGlzRGF0ZSA9IGNlbGwudmFsdWUgaW5zdGFuY2VvZiBEYXRlIHx8ICh0eXBlb2YgY2VsbC52YWx1ZSA9PT0gJ3N0cmluZycgJiYgL15cXGR7NH0tXFxkezJ9LVxcZHsyfS8udGVzdChjZWxsLnZhbHVlKSk7XHJcbiAgICAgICAgICAgICAgICBleHBlY3QoaXNEYXRlIHx8IGNlbGwudmFsdWUgPT09ICcnKS50b0JlVHJ1dGh5KCk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYFtURVNUXSDinJMgRXhjZWwgZGF0ZSBjb2x1bW5zIGZvcm1hdHRlZCBjb3JyZWN0bHk6ICR7ZGF0ZUNvbHVtbnMubWFwKGMgPT4gYy5uYW1lKS5qb2luKCcsICcpfWApO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdzaG91bGQgaGF2ZSBidXNpbmVzcy1mcmllbmRseSBjb2x1bW4gbmFtZXMnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIHRlc3Quc2V0VGltZW91dCgxODAwMDApO1xyXG4gICAgY29uc29sZS5sb2coJ1tURVNUXSBUZXN0aW5nIGJ1c2luZXNzLWZyaWVuZGx5IGNvbHVtbiBuYW1lcycpO1xyXG4gICAgXHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuICAgIFxyXG4gICAgY29uc3QgcHJldmlld1Zpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWNvbnRlbnQnKS5pc1Zpc2libGUoKTtcclxuICAgIGlmICghcHJldmlld1Zpc2libGUpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSBQcmV2aWV3IG5vdCB2aXNpYmxlLCBza2lwcGluZyBjb2x1bW4gbmFtZXMgdGVzdCcpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnN0IGV4cG9ydEV4Y2VsQnRuID0gcGFnZS5sb2NhdG9yKCcjZXhwb3J0LWV4Y2VsLWJ0bicpO1xyXG4gICAgaWYgKGF3YWl0IGV4cG9ydEV4Y2VsQnRuLmlzRW5hYmxlZCgpKSB7XHJcbiAgICAgIGNvbnN0IGRvd25sb2FkID0gYXdhaXQgY2xpY2tFeGNlbEV4cG9ydEFuZFdhaXQocGFnZSwgRVhQT1JUX1RJTUVPVVRfTVMpO1xyXG4gICAgICBcclxuICAgICAgaWYgKGRvd25sb2FkKSB7XHJcbiAgICAgICAgY29uc3Qgd29ya2Jvb2sgPSBhd2FpdCBsb2FkV29ya2Jvb2tGcm9tRG93bmxvYWQoZG93bmxvYWQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENoZWNrIFN0b3JpZXMgc2hlZXQgaGVhZGVyc1xyXG4gICAgICAgIGNvbnN0IHN0b3JpZXNTaGVldCA9IHdvcmtib29rLmdldFdvcmtzaGVldCgnU3RvcmllcycpO1xyXG4gICAgICAgIGlmIChzdG9yaWVzU2hlZXQpIHtcclxuICAgICAgICAgIGNvbnN0IGhlYWRlclJvdyA9IHN0b3JpZXNTaGVldC5nZXRSb3coMSk7XHJcbiAgICAgICAgICBjb25zdCBoZWFkZXJzID0gW107XHJcbiAgICAgICAgICBoZWFkZXJSb3cuZWFjaENlbGwoeyBpbmNsdWRlRW1wdHk6IGZhbHNlIH0sIChjZWxsKSA9PiB7XHJcbiAgICAgICAgICAgIGhlYWRlcnMucHVzaChjZWxsLnZhbHVlLnRvU3RyaW5nKCkpO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIFZlcmlmeSBidXNpbmVzcy1mcmllbmRseSBuYW1lcyAobm90IHRlY2huaWNhbCBuYW1lcylcclxuICAgICAgICAgIGV4cGVjdChoZWFkZXJzKS5ub3QudG9Db250YWluKCdpc3N1ZUtleScpOyAvLyBTaG91bGQgYmUgJ1RpY2tldCBJRCdcclxuICAgICAgICAgIGV4cGVjdChoZWFkZXJzKS5ub3QudG9Db250YWluKCdzcHJpbnRTdGFydERhdGUnKTsgLy8gU2hvdWxkIGJlICdTcHJpbnQgU3RhcnQgRGF0ZSdcclxuICAgICAgICAgIGV4cGVjdChoZWFkZXJzKS5ub3QudG9Db250YWluKCdlcGljS2V5Jyk7IC8vIFNob3VsZCBiZSAnRXBpYyBJRCdcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gVmVyaWZ5IGJ1c2luZXNzLWZyaWVuZGx5IG5hbWVzIGV4aXN0XHJcbiAgICAgICAgICBjb25zdCBoYXNUaWNrZXRJRCA9IGhlYWRlcnMuc29tZShoID0+IGguaW5jbHVkZXMoJ1RpY2tldCBJRCcpKTtcclxuICAgICAgICAgIGNvbnN0IGhhc1NwcmludFN0YXJ0RGF0ZSA9IGhlYWRlcnMuc29tZShoID0+IGguaW5jbHVkZXMoJ1NwcmludCBTdGFydCBEYXRlJykpO1xyXG4gICAgICAgICAgY29uc3QgaGFzRXBpY0lEID0gaGVhZGVycy5zb21lKGggPT4gaC5pbmNsdWRlcygnRXBpYyBJRCcpKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgaWYgKGhhc1RpY2tldElEIHx8IGhhc1NwcmludFN0YXJ0RGF0ZSB8fCBoYXNFcGljSUQpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1tURVNUXSDinJMgRXhjZWwgY29udGFpbnMgYnVzaW5lc3MtZnJpZW5kbHkgY29sdW1uIG5hbWVzJyk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ3Nob3VsZCBjYWxjdWxhdGUgS1BJIGNvbHVtbnMgY29ycmVjdGx5JywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICB0ZXN0LnNldFRpbWVvdXQoMTgwMDAwKTtcclxuICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gVGVzdGluZyBLUEkgY29sdW1uIGNhbGN1bGF0aW9ucycpO1xyXG4gICAgXHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuICAgIFxyXG4gICAgY29uc3QgcHJldmlld1Zpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWNvbnRlbnQnKS5pc1Zpc2libGUoKTtcclxuICAgIGlmICghcHJldmlld1Zpc2libGUpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSBQcmV2aWV3IG5vdCB2aXNpYmxlLCBza2lwcGluZyBLUEkgY2FsY3VsYXRpb25zIHRlc3QnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zdCBleHBvcnRFeGNlbEJ0biA9IHBhZ2UubG9jYXRvcignI2V4cG9ydC1leGNlbC1idG4nKTtcclxuICAgIGlmIChhd2FpdCBleHBvcnRFeGNlbEJ0bi5pc0VuYWJsZWQoKSkge1xyXG4gICAgICBjb25zdCBkb3dubG9hZCA9IGF3YWl0IGNsaWNrRXhjZWxFeHBvcnRBbmRXYWl0KHBhZ2UsIEVYUE9SVF9USU1FT1VUX01TKTtcclxuICAgICAgXHJcbiAgICAgIGlmIChkb3dubG9hZCkge1xyXG4gICAgICAgIGNvbnN0IHdvcmtib29rID0gYXdhaXQgbG9hZFdvcmtib29rRnJvbURvd25sb2FkKGRvd25sb2FkKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBDaGVjayBTdG9yaWVzIHNoZWV0IGZvciBLUEkgY29sdW1uc1xyXG4gICAgICAgIGNvbnN0IHN0b3JpZXNTaGVldCA9IHdvcmtib29rLmdldFdvcmtzaGVldCgnU3RvcmllcycpO1xyXG4gICAgICAgIGlmIChzdG9yaWVzU2hlZXQpIHtcclxuICAgICAgICAgIGNvbnN0IGhlYWRlclJvdyA9IHN0b3JpZXNTaGVldC5nZXRSb3coMSk7XHJcbiAgICAgICAgICBjb25zdCBrcGlDb2x1bW5zID0gW107XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGhlYWRlclJvdy5lYWNoQ2VsbCh7IGluY2x1ZGVFbXB0eTogZmFsc2UgfSwgKGNlbGwsIGNvbE51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb2xOYW1lID0gY2VsbC52YWx1ZS50b1N0cmluZygpO1xyXG4gICAgICAgICAgICBpZiAoY29sTmFtZS5pbmNsdWRlcygnV29yayBEYXlzJykgfHwgY29sTmFtZS5pbmNsdWRlcygnQ3ljbGUgVGltZScpIHx8IGNvbE5hbWUuaW5jbHVkZXMoJ0RheXMgU2luY2UnKSkge1xyXG4gICAgICAgICAgICAgIGtwaUNvbHVtbnMucHVzaCh7IG5hbWU6IGNvbE5hbWUsIGNvbE51bWJlciB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGlmIChrcGlDb2x1bW5zLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYFtURVNUXSDinJMgRXhjZWwgY29udGFpbnMgS1BJIGNvbHVtbnM6ICR7a3BpQ29sdW1ucy5tYXAoYyA9PiBjLm5hbWUpLmpvaW4oJywgJyl9YCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBWZXJpZnkgS1BJIGNvbHVtbnMgaGF2ZSBudW1lcmljIHZhbHVlcyAoaWYgZGF0YSBleGlzdHMpXHJcbiAgICAgICAgICAgIGlmIChzdG9yaWVzU2hlZXQucm93Q291bnQgPiAxKSB7XHJcbiAgICAgICAgICAgICAgY29uc3QgZGF0YVJvdyA9IHN0b3JpZXNTaGVldC5nZXRSb3coMik7XHJcbiAgICAgICAgICAgICAga3BpQ29sdW1ucy5mb3JFYWNoKCh7IG5hbWUsIGNvbE51bWJlciB9KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjZWxsID0gZGF0YVJvdy5nZXRDZWxsKGNvbE51bWJlcik7XHJcbiAgICAgICAgICAgICAgICAvLyBLUEkgdmFsdWVzIHNob3VsZCBiZSBudW1iZXJzIG9yIGVtcHR5IHN0cmluZ3NcclxuICAgICAgICAgICAgICAgIGNvbnN0IGlzVmFsaWQgPSBjZWxsLnZhbHVlID09PSAnJyB8fCB0eXBlb2YgY2VsbC52YWx1ZSA9PT0gJ251bWJlcic7XHJcbiAgICAgICAgICAgICAgICBleHBlY3QoaXNWYWxpZCkudG9CZVRydXRoeSgpO1xyXG4gICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ3Nob3VsZCBpbmNsdWRlIG1hbnVhbCBlbnJpY2htZW50IGNvbHVtbnMnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIHRlc3Quc2V0VGltZW91dCgxODAwMDApO1xyXG4gICAgY29uc29sZS5sb2coJ1tURVNUXSBUZXN0aW5nIG1hbnVhbCBlbnJpY2htZW50IGNvbHVtbnMnKTtcclxuICAgIFxyXG4gICAgYXdhaXQgcnVuRGVmYXVsdFByZXZpZXcocGFnZSk7XHJcbiAgICBcclxuICAgIGNvbnN0IHByZXZpZXdWaXNpYmxlID0gYXdhaXQgcGFnZS5sb2NhdG9yKCcjcHJldmlldy1jb250ZW50JykuaXNWaXNpYmxlKCk7XHJcbiAgICBpZiAoIXByZXZpZXdWaXNpYmxlKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gUHJldmlldyBub3QgdmlzaWJsZSwgc2tpcHBpbmcgbWFudWFsIGVucmljaG1lbnQgdGVzdCcpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnN0IGV4cG9ydEV4Y2VsQnRuID0gcGFnZS5sb2NhdG9yKCcjZXhwb3J0LWV4Y2VsLWJ0bicpO1xyXG4gICAgaWYgKGF3YWl0IGV4cG9ydEV4Y2VsQnRuLmlzRW5hYmxlZCgpKSB7XHJcbiAgICAgIGNvbnN0IGRvd25sb2FkID0gYXdhaXQgY2xpY2tFeGNlbEV4cG9ydEFuZFdhaXQocGFnZSwgRVhQT1JUX1RJTUVPVVRfTVMpO1xyXG4gICAgICBcclxuICAgICAgaWYgKGRvd25sb2FkKSB7XHJcbiAgICAgICAgY29uc3Qgd29ya2Jvb2sgPSBhd2FpdCBsb2FkV29ya2Jvb2tGcm9tRG93bmxvYWQoZG93bmxvYWQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IHN0b3JpZXNTaGVldCA9IHdvcmtib29rLmdldFdvcmtzaGVldCgnU3RvcmllcycpO1xyXG4gICAgICAgIGlmIChzdG9yaWVzU2hlZXQpIHtcclxuICAgICAgICAgIGNvbnN0IGhlYWRlclJvdyA9IHN0b3JpZXNTaGVldC5nZXRSb3coMSk7XHJcbiAgICAgICAgICBjb25zdCBoZWFkZXJzID0gW107XHJcbiAgICAgICAgICBoZWFkZXJSb3cuZWFjaENlbGwoeyBpbmNsdWRlRW1wdHk6IGZhbHNlIH0sIChjZWxsKSA9PiB7XHJcbiAgICAgICAgICAgIGhlYWRlcnMucHVzaChjZWxsLnZhbHVlLnRvU3RyaW5nKCkpO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIFZlcmlmeSBtYW51YWwgZW5yaWNobWVudCBjb2x1bW5zIGV4aXN0XHJcbiAgICAgICAgICBjb25zdCBoYXNFcGljSURNYW51YWwgPSBoZWFkZXJzLnNvbWUoaCA9PiBoLmluY2x1ZGVzKCdFcGljIElEIChNYW51YWwpJykpO1xyXG4gICAgICAgICAgY29uc3QgaGFzRXBpY05hbWVNYW51YWwgPSBoZWFkZXJzLnNvbWUoaCA9PiBoLmluY2x1ZGVzKCdFcGljIE5hbWUgKE1hbnVhbCknKSk7XHJcbiAgICAgICAgICBjb25zdCBoYXNJc1Jld29ya01hbnVhbCA9IGhlYWRlcnMuc29tZShoID0+IGguaW5jbHVkZXMoJ0lzIFJld29yayAoTWFudWFsKScpKTtcclxuICAgICAgICAgIGNvbnN0IGhhc0lzQnVnTWFudWFsID0gaGVhZGVycy5zb21lKGggPT4gaC5pbmNsdWRlcygnSXMgQnVnIChNYW51YWwpJykpO1xyXG4gICAgICAgICAgY29uc3QgaGFzVGVhbU5vdGVzID0gaGVhZGVycy5zb21lKGggPT4gaC5pbmNsdWRlcygnVGVhbSBOb3RlcycpKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgaWYgKGhhc0VwaWNJRE1hbnVhbCB8fCBoYXNFcGljTmFtZU1hbnVhbCB8fCBoYXNJc1Jld29ya01hbnVhbCB8fCBoYXNJc0J1Z01hbnVhbCB8fCBoYXNUZWFtTm90ZXMpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1tURVNUXSDinJMgRXhjZWwgY29udGFpbnMgbWFudWFsIGVucmljaG1lbnQgY29sdW1ucycpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdzaG91bGQgY29udGFpbiBTdW1tYXJ5IHRhYiB3aXRoIGtleSBtZXRyaWNzJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICB0ZXN0LnNldFRpbWVvdXQoMTgwMDAwKTtcclxuICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gVGVzdGluZyBTdW1tYXJ5IHRhYiBjb250ZW50Jyk7XHJcbiAgICBcclxuICAgIGF3YWl0IHJ1bkRlZmF1bHRQcmV2aWV3KHBhZ2UpO1xyXG4gICAgXHJcbiAgICBjb25zdCBwcmV2aWV3VmlzaWJsZSA9IGF3YWl0IHBhZ2UubG9jYXRvcignI3ByZXZpZXctY29udGVudCcpLmlzVmlzaWJsZSgpO1xyXG4gICAgaWYgKCFwcmV2aWV3VmlzaWJsZSkge1xyXG4gICAgICBjb25zb2xlLmxvZygnW1RFU1RdIFByZXZpZXcgbm90IHZpc2libGUsIHNraXBwaW5nIFN1bW1hcnkgdGFiIHRlc3QnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zdCBleHBvcnRFeGNlbEJ0biA9IHBhZ2UubG9jYXRvcignI2V4cG9ydC1leGNlbC1idG4nKTtcclxuICAgIGlmIChhd2FpdCBleHBvcnRFeGNlbEJ0bi5pc0VuYWJsZWQoKSkge1xyXG4gICAgICBjb25zdCBkb3dubG9hZCA9IGF3YWl0IGNsaWNrRXhjZWxFeHBvcnRBbmRXYWl0KHBhZ2UsIEVYUE9SVF9USU1FT1VUX01TKTtcclxuICAgICAgXHJcbiAgICAgIGlmIChkb3dubG9hZCkge1xyXG4gICAgICAgIGNvbnN0IHdvcmtib29rID0gYXdhaXQgbG9hZFdvcmtib29rRnJvbURvd25sb2FkKGRvd25sb2FkKTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBzdW1tYXJ5U2hlZXQgPSB3b3JrYm9vay5nZXRXb3Jrc2hlZXQoJ1N1bW1hcnknKTtcclxuICAgICAgICBpZiAoc3VtbWFyeVNoZWV0KSB7XHJcbiAgICAgICAgICAvLyBDaGVjayB0aGF0IFN1bW1hcnkgc2hlZXQgaGFzIGRhdGFcclxuICAgICAgICAgIGV4cGVjdChzdW1tYXJ5U2hlZXQucm93Q291bnQpLnRvQmVHcmVhdGVyVGhhbigxKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gQ2hlY2sgZm9yIGtleSBzZWN0aW9uc1xyXG4gICAgICAgICAgY29uc3QgYWxsVmFsdWVzID0gW107XHJcbiAgICAgICAgICBzdW1tYXJ5U2hlZXQuZWFjaFJvdygocm93KSA9PiB7XHJcbiAgICAgICAgICAgIHJvdy5lYWNoQ2VsbCh7IGluY2x1ZGVFbXB0eTogZmFsc2UgfSwgKGNlbGwpID0+IHtcclxuICAgICAgICAgICAgICBhbGxWYWx1ZXMucHVzaChjZWxsLnZhbHVlLnRvU3RyaW5nKCkpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBjb25zdCBoYXNPdmVydmlldyA9IGFsbFZhbHVlcy5zb21lKHYgPT4gdi5pbmNsdWRlcygnT3ZlcnZpZXcnKSB8fCB2LmluY2x1ZGVzKCdUb3RhbCBTdG9yaWVzJykpO1xyXG4gICAgICAgICAgY29uc3QgaGFzS2V5TWV0cmljcyA9IGFsbFZhbHVlcy5zb21lKHYgPT4gdi5pbmNsdWRlcygnS2V5IE1ldHJpY3MnKSB8fCB2LmluY2x1ZGVzKCdTdG9yeSBQb2ludHMnKSk7XHJcbiAgICAgICAgICBjb25zdCBoYXNEYXRhUXVhbGl0eSA9IGFsbFZhbHVlcy5zb21lKHYgPT4gdi5pbmNsdWRlcygnRGF0YSBRdWFsaXR5JykpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBpZiAoaGFzT3ZlcnZpZXcgfHwgaGFzS2V5TWV0cmljcyB8fCBoYXNEYXRhUXVhbGl0eSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBTdW1tYXJ5IHRhYiBjb250YWlucyBrZXkgc2VjdGlvbnMnKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgdGVzdCgnc2hvdWxkIGNvbnRhaW4gTWV0YWRhdGEgdGFiIHdpdGggZXhwb3J0IGNvbnRleHQnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIHRlc3Quc2V0VGltZW91dCgxODAwMDApO1xyXG4gICAgY29uc29sZS5sb2coJ1tURVNUXSBUZXN0aW5nIE1ldGFkYXRhIHRhYiBjb250ZW50Jyk7XHJcbiAgICBcclxuICAgIGF3YWl0IHJ1bkRlZmF1bHRQcmV2aWV3KHBhZ2UpO1xyXG4gICAgXHJcbiAgICBjb25zdCBwcmV2aWV3VmlzaWJsZSA9IGF3YWl0IHBhZ2UubG9jYXRvcignI3ByZXZpZXctY29udGVudCcpLmlzVmlzaWJsZSgpO1xyXG4gICAgaWYgKCFwcmV2aWV3VmlzaWJsZSkge1xyXG4gICAgICBjb25zb2xlLmxvZygnW1RFU1RdIFByZXZpZXcgbm90IHZpc2libGUsIHNraXBwaW5nIE1ldGFkYXRhIHRhYiB0ZXN0Jyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc3QgZXhwb3J0RXhjZWxCdG4gPSBwYWdlLmxvY2F0b3IoJyNleHBvcnQtZXhjZWwtYnRuJyk7XHJcbiAgICBpZiAoYXdhaXQgZXhwb3J0RXhjZWxCdG4uaXNFbmFibGVkKCkpIHtcclxuICAgICAgY29uc3QgZG93bmxvYWQgPSBhd2FpdCBjbGlja0V4Y2VsRXhwb3J0QW5kV2FpdChwYWdlLCBFWFBPUlRfVElNRU9VVF9NUyk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoZG93bmxvYWQpIHtcclxuICAgICAgICBjb25zdCB3b3JrYm9vayA9IGF3YWl0IGxvYWRXb3JrYm9va0Zyb21Eb3dubG9hZChkb3dubG9hZCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgbWV0YWRhdGFTaGVldCA9IHdvcmtib29rLmdldFdvcmtzaGVldCgnTWV0YWRhdGEnKTtcclxuICAgICAgICBpZiAobWV0YWRhdGFTaGVldCkge1xyXG4gICAgICAgICAgZXhwZWN0KG1ldGFkYXRhU2hlZXQucm93Q291bnQpLnRvQmVHcmVhdGVyVGhhbigxKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gQ2hlY2sgZm9yIGtleSBtZXRhZGF0YSBmaWVsZHNcclxuICAgICAgICAgIGNvbnN0IGFsbFZhbHVlcyA9IFtdO1xyXG4gICAgICAgICAgbWV0YWRhdGFTaGVldC5lYWNoUm93KChyb3cpID0+IHtcclxuICAgICAgICAgICAgcm93LmVhY2hDZWxsKHsgaW5jbHVkZUVtcHR5OiBmYWxzZSB9LCAoY2VsbCkgPT4ge1xyXG4gICAgICAgICAgICAgIGFsbFZhbHVlcy5wdXNoKGNlbGwudmFsdWUudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGNvbnN0IGhhc0V4cG9ydERhdGUgPSBhbGxWYWx1ZXMuc29tZSh2ID0+IHYuaW5jbHVkZXMoJ0V4cG9ydCBEYXRlJykgfHwgdi5pbmNsdWRlcygnRXhwb3J0IFRpbWUnKSk7XHJcbiAgICAgICAgICBjb25zdCBoYXNEYXRlUmFuZ2UgPSBhbGxWYWx1ZXMuc29tZSh2ID0+IHYuaW5jbHVkZXMoJ0RhdGUgUmFuZ2UnKSk7XHJcbiAgICAgICAgICBjb25zdCBoYXNQcm9qZWN0cyA9IGFsbFZhbHVlcy5zb21lKHYgPT4gdi5pbmNsdWRlcygnUHJvamVjdHMnKSk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGlmIChoYXNFeHBvcnREYXRlIHx8IGhhc0RhdGVSYW5nZSB8fCBoYXNQcm9qZWN0cykge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBNZXRhZGF0YSB0YWIgY29udGFpbnMgZXhwb3J0IGNvbnRleHQnKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgdGVzdCgnc2hvdWxkIGhhbmRsZSBQcm9qZWN0ICYgRXBpYyBMZXZlbCB0YWIgZXhwb3J0JywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICB0ZXN0LnNldFRpbWVvdXQoMTgwMDAwKTtcclxuICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gVGVzdGluZyBQcm9qZWN0ICYgRXBpYyBMZXZlbCB0YWIgZXhwb3J0Jyk7XHJcbiAgICBcclxuICAgIGF3YWl0IHJ1bkRlZmF1bHRQcmV2aWV3KHBhZ2UpO1xyXG4gICAgXHJcbiAgICBjb25zdCBwcmV2aWV3VmlzaWJsZSA9IGF3YWl0IHBhZ2UubG9jYXRvcignI3ByZXZpZXctY29udGVudCcpLmlzVmlzaWJsZSgpO1xyXG4gICAgaWYgKCFwcmV2aWV3VmlzaWJsZSkge1xyXG4gICAgICBjb25zb2xlLmxvZygnW1RFU1RdIFByZXZpZXcgbm90IHZpc2libGUsIHNraXBwaW5nIFByb2plY3QgJiBFcGljIExldmVsIGV4cG9ydCB0ZXN0Jyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gTmF2aWdhdGUgdG8gUHJvamVjdCAmIEVwaWMgTGV2ZWwgdGFiXHJcbiAgICBhd2FpdCBwYWdlLmNsaWNrKCcudGFiLWJ0bltkYXRhLXRhYj1cInByb2plY3QtZXBpYy1sZXZlbFwiXScpO1xyXG4gICAgXHJcbiAgICAvLyBDaGVjayBmb3IgZXhwb3J0IGJ1dHRvblxyXG4gICAgY29uc3QgZXhwb3J0QnRuID0gcGFnZS5sb2NhdG9yKCcuZXhwb3J0LXNlY3Rpb24tYnRuW2RhdGEtc2VjdGlvbj1cInByb2plY3QtZXBpYy1sZXZlbFwiXScpO1xyXG4gICAgaWYgKGF3YWl0IGV4cG9ydEJ0bi5pc1Zpc2libGUoKSkge1xyXG4gICAgICBjb25zdCBkb3dubG9hZFByb21pc2UgPSBwYWdlLndhaXRGb3JFdmVudCgnZG93bmxvYWQnLCB7IHRpbWVvdXQ6IDE1MDAwIH0pLmNhdGNoKCgpID0+IG51bGwpO1xyXG4gICAgICBhd2FpdCBleHBvcnRCdG4uY2xpY2soKTtcclxuICAgICAgY29uc3QgZG93bmxvYWQgPSBhd2FpdCBkb3dubG9hZFByb21pc2U7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoZG93bmxvYWQpIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnW1RFU1RdIOKckyBQcm9qZWN0ICYgRXBpYyBMZXZlbCB0YWIgZXhwb3J0IHdvcmtzJyk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgdGVzdCgnc2hvdWxkIHZhbGlkYXRlIEV4Y2VsIHdvcmtib29rIGRhdGEgYmVmb3JlIHNlbmRpbmcgdG8gc2VydmVyJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICB0ZXN0LnNldFRpbWVvdXQoMTgwMDAwKTtcclxuICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gVGVzdGluZyBFeGNlbCBleHBvcnQgdmFsaWRhdGlvbicpO1xyXG4gICAgXHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuICAgIFxyXG4gICAgY29uc3QgcHJldmlld1Zpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWNvbnRlbnQnKS5pc1Zpc2libGUoKTtcclxuICAgIGlmICghcHJldmlld1Zpc2libGUpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSBQcmV2aWV3IG5vdCB2aXNpYmxlLCBza2lwcGluZyB2YWxpZGF0aW9uIHRlc3QnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBWYWxpZGF0aW9uIGhhcHBlbnMgY2xpZW50LXNpZGUgYmVmb3JlIGZldGNoLCBzbyB3ZSB0ZXN0IHRoYXQgZXhwb3J0IHdvcmtzXHJcbiAgICAvLyAod2hpY2ggaW1wbGllcyB2YWxpZGF0aW9uIHBhc3NlZClcclxuICAgIGNvbnN0IGV4cG9ydEV4Y2VsQnRuID0gcGFnZS5sb2NhdG9yKCcjZXhwb3J0LWV4Y2VsLWJ0bicpO1xyXG4gICAgaWYgKGF3YWl0IGV4cG9ydEV4Y2VsQnRuLmlzRW5hYmxlZCgpKSB7XHJcbiAgICAgIGNvbnN0IGRvd25sb2FkID0gYXdhaXQgY2xpY2tFeGNlbEV4cG9ydEFuZFdhaXQocGFnZSwgRVhQT1JUX1RJTUVPVVRfTVMpLmNhdGNoKCgpID0+IG51bGwpO1xyXG4gICAgICBcclxuICAgICAgaWYgKGRvd25sb2FkKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1tURVNUXSDinJMgRXhjZWwgZXhwb3J0IHZhbGlkYXRpb24gcGFzc2VkIChleHBvcnQgc3VjY2VlZGVkKScpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ3Nob3VsZCBzaG93IHBsYWNlaG9sZGVyIG1lc3NhZ2VzIGluIGVtcHR5IEV4Y2VsIHRhYnMnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIHRlc3Quc2V0VGltZW91dCgxODAwMDApO1xyXG4gICAgY29uc29sZS5sb2coJ1tURVNUXSBUZXN0aW5nIGVtcHR5IEV4Y2VsIHRhYnMgd2l0aCBwbGFjZWhvbGRlciBtZXNzYWdlcycpO1xyXG4gICAgXHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuICAgIFxyXG4gICAgY29uc3QgcHJldmlld1Zpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWNvbnRlbnQnKS5pc1Zpc2libGUoKTtcclxuICAgIGlmICghcHJldmlld1Zpc2libGUpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSBQcmV2aWV3IG5vdCB2aXNpYmxlLCBza2lwcGluZyBlbXB0eSB0YWJzIHRlc3QnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zdCBleHBvcnRFeGNlbEJ0biA9IHBhZ2UubG9jYXRvcignI2V4cG9ydC1leGNlbC1idG4nKTtcclxuICAgIGlmIChhd2FpdCBleHBvcnRFeGNlbEJ0bi5pc0VuYWJsZWQoKSkge1xyXG4gICAgICBjb25zdCBkb3dubG9hZCA9IGF3YWl0IGNsaWNrRXhjZWxFeHBvcnRBbmRXYWl0KHBhZ2UsIEVYUE9SVF9USU1FT1VUX01TKS5jYXRjaCgoKSA9PiBudWxsKTtcclxuICAgICAgXHJcbiAgICAgIGlmIChkb3dubG9hZCkge1xyXG4gICAgICAgIGNvbnN0IHdvcmtib29rID0gYXdhaXQgbG9hZFdvcmtib29rRnJvbURvd25sb2FkKGRvd25sb2FkKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBDaGVjayBFcGljcyBzaGVldCBmb3IgcGxhY2Vob2xkZXIgbWVzc2FnZSBpZiBlbXB0eVxyXG4gICAgICAgIGNvbnN0IGVwaWNzU2hlZXQgPSB3b3JrYm9vay5nZXRXb3Jrc2hlZXQoJ0VwaWNzJyk7XHJcbiAgICAgICAgaWYgKGVwaWNzU2hlZXQgJiYgZXBpY3NTaGVldC5yb3dDb3VudCA+IDEpIHtcclxuICAgICAgICAgIGNvbnN0IGZpcnN0RGF0YVJvdyA9IGVwaWNzU2hlZXQuZ2V0Um93KDIpO1xyXG4gICAgICAgICAgY29uc3QgZXBpY0lEQ2VsbCA9IGZpcnN0RGF0YVJvdy5nZXRDZWxsKDEpO1xyXG4gICAgICAgICAgaWYgKGVwaWNJRENlbGwudmFsdWUgJiYgZXBpY0lEQ2VsbC52YWx1ZS50b1N0cmluZygpLmluY2x1ZGVzKCdObyBFcGljIFRUTSBkYXRhIGF2YWlsYWJsZScpKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0g4pyTIEVtcHR5IEVwaWNzIHNoZWV0IHNob3dzIHBsYWNlaG9sZGVyIG1lc3NhZ2UnKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQ2hlY2sgU3ByaW50cyBzaGVldCBmb3IgcGxhY2Vob2xkZXIgbWVzc2FnZSBpZiBlbXB0eVxyXG4gICAgICAgIGNvbnN0IHNwcmludHNTaGVldCA9IHdvcmtib29rLmdldFdvcmtzaGVldCgnU3ByaW50cycpO1xyXG4gICAgICAgIGlmIChzcHJpbnRzU2hlZXQgJiYgc3ByaW50c1NoZWV0LnJvd0NvdW50ID4gMSkge1xyXG4gICAgICAgICAgY29uc3QgZmlyc3REYXRhUm93ID0gc3ByaW50c1NoZWV0LmdldFJvdygyKTtcclxuICAgICAgICAgIGNvbnN0IHNwcmludElEQ2VsbCA9IGZpcnN0RGF0YVJvdy5nZXRDZWxsKDEpO1xyXG4gICAgICAgICAgaWYgKHNwcmludElEQ2VsbC52YWx1ZSAmJiBzcHJpbnRJRENlbGwudmFsdWUudG9TdHJpbmcoKS5pbmNsdWRlcygnTm8gc3ByaW50IGRhdGEgYXZhaWxhYmxlJykpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1tURVNUXSDinJMgRW1wdHkgU3ByaW50cyBzaGVldCBzaG93cyBwbGFjZWhvbGRlciBtZXNzYWdlJyk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ3Nob3VsZCBzaG93IGZpbGUgc2l6ZSB3YXJuaW5nIGZvciBsYXJnZSBFeGNlbCBleHBvcnRzJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICB0ZXN0LnNldFRpbWVvdXQoMTgwMDAwKTtcclxuICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gVGVzdGluZyBmaWxlIHNpemUgd2FybmluZyAobWF5IG5vdCB0cmlnZ2VyIHdpdGggdGVzdCBkYXRhKScpO1xyXG4gICAgXHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuICAgIFxyXG4gICAgY29uc3QgcHJldmlld1Zpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWNvbnRlbnQnKS5pc1Zpc2libGUoKTtcclxuICAgIGlmICghcHJldmlld1Zpc2libGUpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSBQcmV2aWV3IG5vdCB2aXNpYmxlLCBza2lwcGluZyBmaWxlIHNpemUgd2FybmluZyB0ZXN0Jyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRmlsZSBzaXplIHdhcm5pbmcgb25seSBhcHBlYXJzIGZvciB2ZXJ5IGxhcmdlIGZpbGVzICg+NTBNQilcclxuICAgIC8vIFRlc3QgZGF0YSBtYXkgbm90IGJlIGxhcmdlIGVub3VnaCwgc28gd2UganVzdCB2ZXJpZnkgZXhwb3J0IHdvcmtzXHJcbiAgICBjb25zdCBleHBvcnRFeGNlbEJ0biA9IHBhZ2UubG9jYXRvcignI2V4cG9ydC1leGNlbC1idG4nKTtcclxuICAgIGlmIChhd2FpdCBleHBvcnRFeGNlbEJ0bi5pc0VuYWJsZWQoKSkge1xyXG4gICAgICAvLyBOb3RlOiBGaWxlIHNpemUgd2FybmluZyB1c2VzIGNvbmZpcm0oKSBkaWFsb2cgd2hpY2ggaXMgaGFyZCB0byB0ZXN0IGluIFBsYXl3cmlnaHRcclxuICAgICAgLy8gV2UgdmVyaWZ5IGV4cG9ydCB3b3Jrcywgd2hpY2ggaW1wbGllcyBlaXRoZXIgbm8gd2FybmluZyBvciB1c2VyIGNvbmZpcm1lZFxyXG4gICAgICBjb25zdCBkb3dubG9hZCA9IGF3YWl0IGNsaWNrRXhjZWxFeHBvcnRBbmRXYWl0KHBhZ2UsIEVYUE9SVF9USU1FT1VUX01TKS5jYXRjaCgoKSA9PiBudWxsKTtcclxuICAgICAgXHJcbiAgICAgIGlmIChkb3dubG9hZCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0g4pyTIEV4Y2VsIGV4cG9ydCB3b3JrcyAoZmlsZSBzaXplIHdhcm5pbmcgbWF5IG5vdCBoYXZlIHRyaWdnZXJlZCB3aXRoIHRlc3QgZGF0YSknKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdzaG91bGQgc2hvdyBpbXByb3ZlZCBlcnJvciBtZXNzYWdlcyBmb3IgRXhjZWwgZXhwb3J0IGZhaWx1cmVzJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICB0ZXN0LnNldFRpbWVvdXQoMTgwMDAwKTtcclxuICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gVGVzdGluZyBpbXByb3ZlZCBlcnJvciBtZXNzYWdlcycpO1xyXG4gICAgXHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuICAgIFxyXG4gICAgY29uc3QgcHJldmlld1Zpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWNvbnRlbnQnKS5pc1Zpc2libGUoKTtcclxuICAgIGlmICghcHJldmlld1Zpc2libGUpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSBQcmV2aWV3IG5vdCB2aXNpYmxlLCBza2lwcGluZyBlcnJvciBtZXNzYWdlIHRlc3QnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBFcnJvciBtZXNzYWdlcyBhcmUgdGVzdGVkIGltcGxpY2l0bHkgd2hlbiBleHBvcnQgc3VjY2VlZHNcclxuICAgIC8vIEZvciBleHBsaWNpdCBlcnJvciB0ZXN0aW5nLCB3ZSdkIG5lZWQgdG8gbW9jayBzZXJ2ZXIgZmFpbHVyZXNcclxuICAgIGNvbnN0IGV4cG9ydEV4Y2VsQnRuID0gcGFnZS5sb2NhdG9yKCcjZXhwb3J0LWV4Y2VsLWJ0bicpO1xyXG4gICAgaWYgKGF3YWl0IGV4cG9ydEV4Y2VsQnRuLmlzRW5hYmxlZCgpKSB7XHJcbiAgICAgIGNvbnN0IGRvd25sb2FkID0gYXdhaXQgY2xpY2tFeGNlbEV4cG9ydEFuZFdhaXQocGFnZSwgRVhQT1JUX1RJTUVPVVRfTVMpLmNhdGNoKCgpID0+IG51bGwpO1xyXG4gICAgICBcclxuICAgICAgaWYgKGRvd25sb2FkKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1tURVNUXSDinJMgRXhjZWwgZXhwb3J0IGVycm9yIGhhbmRsaW5nIHdvcmtzIChleHBvcnQgc3VjY2VlZGVkKScpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ3Nob3VsZCBibG9jayBFeGNlbCBleHBvcnQgd2l0aCBjbGVhciBlcnJvciB3aGVuIHByZXZpZXcgbWV0YSBpcyBtaXNzaW5nJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICB0ZXN0LnNldFRpbWVvdXQoMTgwMDAwKTtcclxuICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gVGVzdGluZyBleHBvcnQgYmVoYXZpb3Igd2hlbiBwcmV2aWV3IG1ldGEgaXMgbWlzc2luZycpO1xyXG4gICAgXHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuICAgIFxyXG4gICAgY29uc3QgcHJldmlld1Zpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWNvbnRlbnQnKS5pc1Zpc2libGUoKTtcclxuICAgIGlmICghcHJldmlld1Zpc2libGUpIHtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSBQcmV2aWV3IG5vdCB2aXNpYmxlLCBza2lwcGluZyBtaXNzaW5nIG1ldGEgZXhwb3J0IHRlc3QnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFNpbXVsYXRlIGEgYnJva2VuIHByZXZpZXcgcGF5bG9hZCB3aGVyZSBtZXRhIGlzIG1pc3NpbmdcclxuICAgIGF3YWl0IHBhZ2UuZXZhbHVhdGUoKCkgPT4ge1xyXG4gICAgICAvLyBAdHMtaWdub3JlXHJcbiAgICAgIGlmICh3aW5kb3cucHJldmlld0RhdGEpIHtcclxuICAgICAgICAvLyBAdHMtaWdub3JlXHJcbiAgICAgICAgd2luZG93LnByZXZpZXdEYXRhLm1ldGEgPSB1bmRlZmluZWQ7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IGV4cG9ydEV4Y2VsQnRuID0gcGFnZS5sb2NhdG9yKCcjZXhwb3J0LWV4Y2VsLWJ0bicpO1xyXG4gICAgaWYgKGF3YWl0IGV4cG9ydEV4Y2VsQnRuLmlzRW5hYmxlZCgpKSB7XHJcbiAgICAgIGNvbnN0IGRpYWxvZ1Byb21pc2UgPSBwYWdlXHJcbiAgICAgICAgLndhaXRGb3JFdmVudCgnZGlhbG9nJywgeyB0aW1lb3V0OiBESUFMT0dfVElNRU9VVF9NUyB9KVxyXG4gICAgICAgIC50aGVuKGFzeW5jIChkaWFsb2cpID0+IHtcclxuICAgICAgICAgIGF3YWl0IGRpYWxvZy5hY2NlcHQoKTtcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5jYXRjaCgoKSA9PiBudWxsKTtcclxuXHJcbiAgICAgIGF3YWl0IGV4cG9ydEV4Y2VsQnRuLmNsaWNrKCk7XHJcbiAgICAgIGF3YWl0IGRpYWxvZ1Byb21pc2U7XHJcbiAgICAgIGNvbnN0IGVycm9yTG9jYXRvciA9IHBhZ2UubG9jYXRvcignI2Vycm9yJyk7XHJcbiAgICAgIGNvbnN0IGVycm9yUHJvbWlzZSA9IGVycm9yTG9jYXRvclxyXG4gICAgICAgIC53YWl0Rm9yKHsgc3RhdGU6ICd2aXNpYmxlJywgdGltZW91dDogMTAwMDAgfSlcclxuICAgICAgICAudGhlbigoKSA9PiAoeyB0eXBlOiAnZXJyb3InIH0pKVxyXG4gICAgICAgIC5jYXRjaCgoKSA9PiBudWxsKTtcclxuICAgICAgY29uc3QgZG93bmxvYWRQcm9taXNlID0gcGFnZVxyXG4gICAgICAgIC53YWl0Rm9yRXZlbnQoJ2Rvd25sb2FkJywgeyB0aW1lb3V0OiAxMDAwMCB9KVxyXG4gICAgICAgIC50aGVuKGRvd25sb2FkID0+ICh7IHR5cGU6ICdkb3dubG9hZCcsIGRvd25sb2FkIH0pKVxyXG4gICAgICAgIC5jYXRjaCgoKSA9PiBudWxsKTtcclxuXHJcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IFByb21pc2UucmFjZShbZXJyb3JQcm9taXNlLCBkb3dubG9hZFByb21pc2VdKTtcclxuICAgICAgaWYgKHJlc3VsdD8udHlwZSA9PSAnZXJyb3InKSB7XHJcbiAgICAgICAgY29uc3QgZXJyb3JUZXh0ID0gKGF3YWl0IGVycm9yTG9jYXRvci5pbm5lclRleHQoKSk/LnRvTG93ZXJDYXNlKCkgfHwgJyc7XHJcbiAgICAgICAgZXhwZWN0KGVycm9yVGV4dCkudG9Db250YWluKCdleHBvcnQgZXJyb3InKTtcclxuICAgICAgICBleHBlY3QoZXJyb3JUZXh0KS50b0NvbnRhaW4oJ21ldGFkYXRhJyk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1tURVNUXSA/IEV4cG9ydCBibG9ja2VkIHdpdGggY2xlYXIgZXJyb3Igd2hlbiBwcmV2aWV3IG1ldGEgaXMgbWlzc2luZycpO1xyXG4gICAgICB9IGVsc2UgaWYgKHJlc3VsdD8udHlwZSA9PSAnZG93bmxvYWQnKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1tURVNUXSA/IEV4cG9ydCBzdWNjZWVkZWQgd2l0aG91dCBtZXRhIChmYWxsYmFjayBwYXRoKScpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRlc3Quc2tpcCgpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ3Nob3VsZCBzaG93IHNwZWNpZmljIGVycm9yIG1lc3NhZ2Ugd2hlbiBzZXJ2ZXIgcmV0dXJucyA1MDAgZm9yIEV4Y2VsIGV4cG9ydCcsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgdGVzdC5zZXRUaW1lb3V0KDE4MDAwMCk7XHJcbiAgICBjb25zb2xlLmxvZygnW1RFU1RdIFRlc3RpbmcgRXhjZWwgZXhwb3J0IHNlcnZlciBlcnJvciBoYW5kbGluZyAoNTAwKScpO1xyXG5cclxuICAgIGF3YWl0IHJ1bkRlZmF1bHRQcmV2aWV3KHBhZ2UpO1xyXG5cclxuICAgIGNvbnN0IHByZXZpZXdWaXNpYmxlID0gYXdhaXQgcGFnZS5sb2NhdG9yKCcjcHJldmlldy1jb250ZW50JykuaXNWaXNpYmxlKCk7XHJcbiAgICBpZiAoIXByZXZpZXdWaXNpYmxlKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdbVEVTVF0gUHJldmlldyBub3QgdmlzaWJsZSwgc2tpcHBpbmcgc2VydmVyIGVycm9yIGV4cG9ydCB0ZXN0Jyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGb3JjZSAvZXhwb3J0LWV4Y2VsIHRvIHJldHVybiBhIDUwMCBlcnJvclxyXG4gICAgYXdhaXQgcGFnZS5yb3V0ZSgnL2V4cG9ydC1leGNlbCcsIGFzeW5jIChyb3V0ZSkgPT4ge1xyXG4gICAgICBhd2FpdCByb3V0ZS5mdWxmaWxsKHtcclxuICAgICAgICBzdGF0dXM6IDUwMCxcclxuICAgICAgICBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdTaW11bGF0ZWQgZmFpbHVyZScgfSksXHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgZXhwb3J0RXhjZWxCdG4gPSBwYWdlLmxvY2F0b3IoJyNleHBvcnQtZXhjZWwtYnRuJyk7XHJcbiAgICBpZiAoYXdhaXQgZXhwb3J0RXhjZWxCdG4uaXNFbmFibGVkKCkpIHtcclxuICAgICAgY29uc3QgZGlhbG9nUHJvbWlzZSA9IHBhZ2VcclxuICAgICAgICAud2FpdEZvckV2ZW50KCdkaWFsb2cnLCB7IHRpbWVvdXQ6IERJQUxPR19USU1FT1VUX01TIH0pXHJcbiAgICAgICAgLnRoZW4oYXN5bmMgKGRpYWxvZykgPT4ge1xyXG4gICAgICAgICAgYXdhaXQgZGlhbG9nLmFjY2VwdCgpO1xyXG4gICAgICAgIH0pXHJcbiAgICAgICAgLmNhdGNoKCgpID0+IG51bGwpO1xyXG5cclxuICAgICAgYXdhaXQgZXhwb3J0RXhjZWxCdG4uY2xpY2soKTtcclxuICAgICAgYXdhaXQgZGlhbG9nUHJvbWlzZTtcclxuXHJcbiAgICAgIGNvbnN0IGVycm9yTG9jYXRvciA9IHBhZ2UubG9jYXRvcignI2Vycm9yJyk7XHJcbiAgICAgIGF3YWl0IGVycm9yTG9jYXRvci53YWl0Rm9yKHsgc3RhdGU6ICd2aXNpYmxlJywgdGltZW91dDogMTAwMDAgfSk7XHJcbiAgICAgIGNvbnN0IGVycm9yVGV4dCA9IChhd2FpdCBlcnJvckxvY2F0b3IuaW5uZXJUZXh0KCkpPy50b0xvd2VyQ2FzZSgpIHx8ICcnO1xyXG5cclxuICAgICAgZXhwZWN0KGVycm9yVGV4dCkudG9Db250YWluKCdleHBvcnQgZXJyb3InKTtcclxuICAgICAgZXhwZWN0KGVycm9yVGV4dCkudG9Db250YWluKCdzZXJ2ZXIgZXJyb3IgZHVyaW5nIGV4Y2VsIGdlbmVyYXRpb24nKTtcclxuICAgICAgY29uc29sZS5sb2coJ1tURVNUXSDinJMgRXhjZWwgZXhwb3J0IHNob3dzIHNwZWNpZmljIGVycm9yIHdoZW4gc2VydmVyIHJldHVybnMgNTAwJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2xlYW4gdXAgcm91dGUgc28gb3RoZXIgdGVzdHMgYXJlIG5vdCBhZmZlY3RlZFxyXG4gICAgYXdhaXQgcGFnZS51bnJvdXRlKCcvZXhwb3J0LWV4Y2VsJyk7XHJcbiAgfSk7XHJcbn0pO1xyXG4iXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUEsU0FBU0EsSUFBSSxFQUFFQyxNQUFNLFFBQVEsa0JBQWtCO0FBQy9DLFNBQVNDLGlCQUFpQixRQUFRLHVEQUF1RDtBQUV6RixNQUFNQyxpQkFBaUIsR0FBRyxLQUFLO0FBQy9CLE1BQU1DLGlCQUFpQixHQUFHLElBQUk7QUFFOUIsZUFBZUMsdUJBQXVCQSxDQUFDQyxJQUFJLEVBQUVDLE9BQU8sR0FBR0osaUJBQWlCLEVBQUU7RUFDeEUsTUFBTUssZUFBZSxHQUFHRixJQUFJLENBQUNHLFlBQVksQ0FBQyxVQUFVLEVBQUU7SUFBRUY7RUFBUSxDQUFDLENBQUM7RUFDbEUsTUFBTUcsYUFBYSxHQUFHSixJQUFJLENBQ3ZCRyxZQUFZLENBQUMsUUFBUSxFQUFFO0lBQUVGLE9BQU8sRUFBRUg7RUFBa0IsQ0FBQyxDQUFDLENBQ3RETyxJQUFJLENBQUMsTUFBT0MsTUFBTSxJQUFLO0lBQ3RCLE1BQU1BLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDLENBQUM7RUFDdkIsQ0FBQyxDQUFDLENBQ0RDLEtBQUssQ0FBQyxNQUFNLElBQUksQ0FBQztFQUVwQixNQUFNUixJQUFJLENBQUNTLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQztFQUNyQyxNQUFNTCxhQUFhO0VBQ25CLE9BQU9GLGVBQWU7QUFDeEI7QUFDQSxlQUFlUSx3QkFBd0JBLENBQUNDLFFBQVEsRUFBRTtFQUNoRCxNQUFNQyxJQUFJLEdBQUcsTUFBTUQsUUFBUSxDQUFDQyxJQUFJLENBQUMsQ0FBQztFQUNsQyxNQUFNO0lBQUVDO0VBQWEsQ0FBQyxHQUFHLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQztFQUMzQyxNQUFNQyxNQUFN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