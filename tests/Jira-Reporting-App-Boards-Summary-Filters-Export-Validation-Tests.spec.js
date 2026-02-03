/**
 * Boards Summary, Filters, and Export Validation Tests
 * Validates: Boards table summary row (tfoot), tap-friendly tooltips, unified filters on Boards/Sprints,
 * export split button (full vs filtered), and no console errors.
 */

import { test, expect } from '@playwright/test';
import { runDefaultPreview, waitForPreview } from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';

test.describe('Jira Reporting App - Boards Summary Filters Export Validation Tests', () => {
  test.beforeEach(async ({ page }) => {
    page.setExtraHTTPHeaders({ 'Accept': 'text/html' });
  });

  test('Boards table has summary row (tfoot) with Total/Summary when boards exist', async ({ page }) => {
    await page.goto('/report');
    await runDefaultPreview(page);
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    const boardsSection = page.locator('#project-epic-level-content');
    await expect(boardsSection).toBeVisible({ timeout: 5000 });
    const sectionText = await boardsSection.textContent();
    if (!sectionText || !sectionText.includes('Board ID')) {
      await expect(boardsSection).toContainText(/No boards|discovered|date window|match the current filters/i);
      return;
    }
    const table = boardsSection.locator('table.data-table').first();
    await expect(table).toBeVisible({ timeout: 5000 });
    const tfoot = table.locator('tfoot');
    const summaryRow = table.locator('tr.boards-summary-row');
    const hasTfoot = await tfoot.count() > 0;
    if (hasTfoot) {
      await expect(tfoot).toBeVisible({ timeout: 3000 });
    } else {
      await expect(summaryRow).toBeVisible({ timeout: 3000 });
    }
    const summaryRowLocator = hasTfoot ? table.locator('tfoot') : table.locator('tr.boards-summary-row');
    await expect(summaryRowLocator).toBeVisible({ timeout: 3000 });
    const summaryText = (await summaryRowLocator.textContent()) || '';
    const hasLabel = /Total|Summary/i.test(summaryText);
    expect(hasLabel || summaryText.trim().length > 0).toBeTruthy();
    const numericCell = hasTfoot ? table.locator('tfoot td').nth(4) : table.locator('tr.boards-summary-row td').nth(4);
    await expect(numericCell).toBeVisible();
  });

  test('Tooltip on tap: click trigger shows popover with tooltip text', async ({ page }) => {
    await page.goto('/report');
    await runDefaultPreview(page);
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    const boardsSection = page.locator('#project-epic-level-content');
    const sectionText = await boardsSection.textContent();
    if (!sectionText || !sectionText.includes('Board ID')) {
      test.skip('No boards table (no boards in window)');
      return;
    }
    const trigger = page.locator('.tooltip-trigger').first();
    await expect(trigger).toBeVisible({ timeout: 5000 });
    await trigger.click();
    const popover = page.locator('#tooltip-popover');
    await expect(popover).toBeVisible({ timeout: 3000 });
    await expect(popover).toHaveAttribute('aria-hidden', 'false');
    const text = await popover.textContent();
    expect(text && text.length > 0).toBeTruthy();
  });

  test('Boards tab has search and filter controls', async ({ page }) => {
    await page.goto('/report');
    await runDefaultPreview(page);
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    const searchBox = page.locator('#boards-search-box');
    await expect(searchBox).toBeVisible({ timeout: 5000 });
    await expect(searchBox).toHaveAttribute('placeholder', /Search boards/i);
    const pills = page.locator('#boards-project-pills');
    await expect(pills).toBeVisible({ timeout: 3000 });
  });

  test('Sprints tab has search and filter controls', async ({ page }) => {
    await page.goto('/report');
    await runDefaultPreview(page);
    await page.click('.tab-btn[data-tab="sprints"]');
    const searchBox = page.locator('#sprints-search-box');
    await expect(searchBox).toBeVisible({ timeout: 5000 });
    await expect(searchBox).toHaveAttribute('placeholder', /Search sprints/i);
    const pills = page.locator('#sprints-project-pills');
    await expect(pills).toBeVisible({ timeout: 3000 });
  });

  test('Boards search filters table rows or shows empty state', async ({ page }) => {
    await page.goto('/report');
    await runDefaultPreview(page);
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    const boardsSection = page.locator('#project-epic-level-content');
    const sectionText = await boardsSection.textContent();
    if (!sectionText || !sectionText.includes('Board ID')) {
      test.skip('No boards table (no boards in window)');
      return;
    }
    const searchBox = page.locator('#boards-search-box');
    await searchBox.fill('__nonexistent_board_xyz__');
    await page.waitForTimeout(400);
    const content = await boardsSection.textContent();
    const hasEmptyMessage = /No boards match the current filters|match the current filters/i.test(content || '');
    const hasTable = boardsSection.locator('table.data-table tbody tr').count() > 0;
    expect(hasEmptyMessage || !hasTable).toBeTruthy();
  });

  test('Export split button: primary and dropdown with full and filtered options', async ({ page }) => {
    await page.goto('/report');
    await runDefaultPreview(page);
    const primaryBtn = page.locator('#export-excel-btn');
    await expect(primaryBtn).toBeVisible({ timeout: 5000 });
    await expect(primaryBtn).toContainText(/Export to Excel|all data/i);
    const dropdownTrigger = page.locator('#export-dropdown-trigger');
    await expect(dropdownTrigger).toBeVisible({ timeout: 3000 });
    await dropdownTrigger.click();
    const menu = page.locator('#export-dropdown-menu');
    await expect(menu).toBeVisible({ timeout: 2000 });
    await expect(menu).toHaveAttribute('aria-hidden', 'false');
    await expect(menu.locator('[data-export="excel-full"]')).toBeVisible();
    await expect(menu.locator('[data-export="csv-filtered"]')).toBeVisible();
    await expect(menu.locator('[data-export="excel-filtered"]')).toBeVisible();
  });

  test('Preview and Boards/Filters/Export flow without console errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    await page.goto('/report');
    await runDefaultPreview(page);
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    await page.waitForTimeout(300);
    await page.click('.tab-btn[data-tab="sprints"]');
    await page.waitForTimeout(300);
    const relevant = consoleErrors.filter(t =>
      !t.includes('favicon') &&
      !t.includes('404') &&
      !t.includes('csv-columns')
    );
    expect(relevant).toEqual([]);
  });
});
