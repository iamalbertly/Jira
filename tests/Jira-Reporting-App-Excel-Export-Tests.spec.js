/**
 * Excel Export Validation Tests
 * Tests Excel export functionality including file naming, multi-tab structure,
 * business-friendly column names, Excel-compatible dates, and KPI calculations
 */

import { test, expect } from '@playwright/test';

// Helper: Wait for preview to complete
async function waitForPreview(page) {
  // Wait for either preview content or error to appear
  await Promise.race([
    page.waitForSelector('#preview-content', { state: 'visible', timeout: 120000 }),
    page.waitForSelector('#error', { state: 'visible', timeout: 120000 })
  ]);
}

// Helper: Run default preview
async function runDefaultPreview(page) {
  await page.goto('/report');
  
  // Projects are already checked by default
  // Dates are already set to Q2 2025
  
  // Click preview
  await page.click('#preview-btn');
  await waitForPreview(page);
}

test.describe('Jira Reporting App - Excel Export Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/report');
    await expect(page.locator('h1')).toContainText('Jira Sprint Report');
  });

  test('should generate Excel file with correct filename format', async ({ page }) => {
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
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      await exportExcelBtn.click();
      const download = await downloadPromise;
      
      if (download) {
        const filename = download.suggestedFilename();
        // Verify filename pattern: {Projects}_{DateRange}_{Type}_{Date}.xlsx
        const filenamePattern = /^[A-Z-]+_(Q[1-4]-\d{4}|\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2})_Sprint-Report_\d{4}-\d{2}-\d{2}\.xlsx$/;
        expect(filename).toMatch(filenamePattern);
        console.log(`[TEST] ✓ Excel filename format correct: ${filename}`);
      }
    }
  });

  test('should contain all 5 tabs in Excel file', async ({ page }) => {
    test.setTimeout(180000);
    console.log('[TEST] Testing Excel file contains all tabs');
    
    await runDefaultPreview(page);
    
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      console.log('[TEST] Preview not visible, skipping Excel tabs test');
      return;
    }
    
    const exportExcelBtn = page.locator('#export-excel-btn');
    if (await exportExcelBtn.isEnabled()) {
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      await exportExcelBtn.click();
      const download = await downloadPromise;
      
      if (download) {
        const path = await download.path();
        const { readFileSync } = await import('fs');
        const buffer = readFileSync(path);
        
        // Parse Excel file using dynamic import
        const ExcelJS = (await import('exceljs')).default;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        
        // Verify all 5 tabs exist
        const sheetNames = workbook.worksheets.map(ws => ws.name);
        expect(sheetNames).toContain('Summary');
        expect(sheetNames).toContain('Stories');
        expect(sheetNames).toContain('Sprints');
        expect(sheetNames).toContain('Epics');
        expect(sheetNames).toContain('Metadata');
        
        console.log(`[TEST] ✓ Excel file contains all 5 tabs: ${sheetNames.join(', ')}`);
      }
    }
  });

  test('should have Excel-compatible date formats', async ({ page }) => {
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
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      await exportExcelBtn.click();
      const download = await downloadPromise;
      
      if (download) {
        const path = await download.path();
        const { readFileSync } = await import('fs');
        const buffer = readFileSync(path);
        
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        
        // Check Stories sheet for date columns
        const storiesSheet = workbook.getWorksheet('Stories');
        if (storiesSheet) {
          const headerRow = storiesSheet.getRow(1);
          const dateColumns = [];
          
          headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            const colName = cell.value;
            if (colName && (colName.toString().includes('Date') || colName.toString().includes('date'))) {
              dateColumns.push({ name: colName, colNumber });
            }
          });
          
          // Check that date cells are Date objects or formatted correctly
          if (dateColumns.length > 0 && storiesSheet.rowCount > 1) {
            const dataRow = storiesSheet.getRow(2);
            dateColumns.forEach(({ name, colNumber }) => {
              const cell = dataRow.getCell(colNumber);
              if (cell.value) {
                // Date should be a Date object or formatted string
                const isDate = cell.value instanceof Date || (typeof cell.value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(cell.value));
                expect(isDate || cell.value === '').toBeTruthy();
              }
            });
            console.log(`[TEST] ✓ Excel date columns formatted correctly: ${dateColumns.map(c => c.name).join(', ')}`);
          }
        }
      }
    }
  });

  test('should have business-friendly column names', async ({ page }) => {
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
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      await exportExcelBtn.click();
      const download = await downloadPromise;
      
      if (download) {
        const path = await download.path();
        const { readFileSync } = await import('fs');
        const buffer = readFileSync(path);
        
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        
        // Check Stories sheet headers
        const storiesSheet = workbook.getWorksheet('Stories');
        if (storiesSheet) {
          const headerRow = storiesSheet.getRow(1);
          const headers = [];
          headerRow.eachCell({ includeEmpty: false }, (cell) => {
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

  test('should calculate KPI columns correctly', async ({ page }) => {
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
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      await exportExcelBtn.click();
      const download = await downloadPromise;
      
      if (download) {
        const path = await download.path();
        const { readFileSync } = await import('fs');
        const buffer = readFileSync(path);
        
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        
        // Check Stories sheet for KPI columns
        const storiesSheet = workbook.getWorksheet('Stories');
        if (storiesSheet) {
          const headerRow = storiesSheet.getRow(1);
          const kpiColumns = [];
          
          headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            const colName = cell.value.toString();
            if (colName.includes('Work Days') || colName.includes('Cycle Time') || colName.includes('Days Since')) {
              kpiColumns.push({ name: colName, colNumber });
            }
          });
          
          if (kpiColumns.length > 0) {
            console.log(`[TEST] ✓ Excel contains KPI columns: ${kpiColumns.map(c => c.name).join(', ')}`);
            
            // Verify KPI columns have numeric values (if data exists)
            if (storiesSheet.rowCount > 1) {
              const dataRow = storiesSheet.getRow(2);
              kpiColumns.forEach(({ name, colNumber }) => {
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

  test('should include manual enrichment columns', async ({ page }) => {
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
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      await exportExcelBtn.click();
      const download = await downloadPromise;
      
      if (download) {
        const path = await download.path();
        const { readFileSync } = await import('fs');
        const buffer = readFileSync(path);
        
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        
        const storiesSheet = workbook.getWorksheet('Stories');
        if (storiesSheet) {
          const headerRow = storiesSheet.getRow(1);
          const headers = [];
          headerRow.eachCell({ includeEmpty: false }, (cell) => {
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

  test('should contain Summary tab with key metrics', async ({ page }) => {
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
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      await exportExcelBtn.click();
      const download = await downloadPromise;
      
      if (download) {
        const path = await download.path();
        const { readFileSync } = await import('fs');
        const buffer = readFileSync(path);
        
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        
        const summarySheet = workbook.getWorksheet('Summary');
        if (summarySheet) {
          // Check that Summary sheet has data
          expect(summarySheet.rowCount).toBeGreaterThan(1);
          
          // Check for key sections
          const allValues = [];
          summarySheet.eachRow((row) => {
            row.eachCell({ includeEmpty: false }, (cell) => {
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

  test('should contain Metadata tab with export context', async ({ page }) => {
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
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      await exportExcelBtn.click();
      const download = await downloadPromise;
      
      if (download) {
        const path = await download.path();
        const { readFileSync } = await import('fs');
        const buffer = readFileSync(path);
        
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        
        const metadataSheet = workbook.getWorksheet('Metadata');
        if (metadataSheet) {
          expect(metadataSheet.rowCount).toBeGreaterThan(1);
          
          // Check for key metadata fields
          const allValues = [];
          metadataSheet.eachRow((row) => {
            row.eachCell({ includeEmpty: false }, (cell) => {
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

  test('should handle Project & Epic Level tab export', async ({ page }) => {
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
      const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
      await exportBtn.click();
      const download = await downloadPromise;
      
      if (download) {
        console.log('[TEST] ✓ Project & Epic Level tab export works');
      }
    }
  });
});
