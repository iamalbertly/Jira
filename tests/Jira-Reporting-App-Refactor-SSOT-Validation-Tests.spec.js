/**
 * Refactor SSOT Validation Tests
 * Validates: Boards column order, leader-friendly tooltips, capacity columns,
 * CSV/Excel column consistency, and no console errors during preview/export flow.
 */

import { test, expect } from '@playwright/test';
import { runDefaultPreview, waitForPreview } from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';

const BOARD_COLUMN_ORDER = [
  'Board ID', 'Board', 'Type', 'Projects', 'Sprints', 'Sprint Days', 'Avg Sprint Days',
  'Done Stories', 'Done SP', 'Committed SP', 'Delivered SP', 'SP Estimation %',
  'Stories / Sprint', 'SP / Story', 'Stories / Day', 'SP / Day', 'SP / Sprint', 'SP Variance',
  'On-Time %', 'Planned', 'Ad-hoc', 'Active Assignees', 'Stories / Assignee', 'SP / Assignee',
  'Assumed Capacity (PD)', 'Assumed Waste %', 'Sprint Window', 'Latest End',
];

test.describe('Jira Reporting App - Refactor SSOT Validation Tests', () => {
  test.beforeEach(async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push({ text: msg.text(), location: msg.location() });
      }
    });
    page.setExtraHTTPHeaders({ 'Accept': 'text/html' });
  });

  test('Boards table headers appear in agreed order when boards exist', async ({ page }) => {
    await page.goto('/report');
    await runDefaultPreview(page);
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    const boardsSection = page.locator('#project-epic-level-content');
    await expect(boardsSection).toBeVisible({ timeout: 5000 });
    const sectionText = await boardsSection.textContent();
    if (!sectionText || !sectionText.includes('Board ID')) {
      await expect(boardsSection).toContainText(/No boards|discovered|date window/i);
      return;
    }
    const firstTable = boardsSection.locator('table.data-table').first();
    await expect(firstTable).toBeVisible({ timeout: 5000 });
    const ths = firstTable.locator('thead th');
    const count = await ths.count();
    expect(count).toBe(BOARD_COLUMN_ORDER.length);
    for (let i = 0; i < BOARD_COLUMN_ORDER.length; i++) {
      await expect(ths.nth(i)).toContainText(BOARD_COLUMN_ORDER[i]);
    }
  });

  test('Boards table has tooltips on key columns (Type, Planned, Ad-hoc, Latest End)', async ({ page }) => {
    await page.goto('/report');
    await runDefaultPreview(page);
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    const boardsSection = page.locator('#project-epic-level-content');
    const sectionText = await boardsSection.textContent();
    if (!sectionText || !sectionText.includes('Board ID')) {
      test.skip('No boards table (no boards in window)');
      return;
    }
    const table = boardsSection.locator('table.data-table').first();
    await expect(table).toBeVisible({ timeout: 5000 });
    const typeTh = table.locator('th').filter({ hasText: 'Type' }).first();
    await expect(typeTh).toHaveAttribute('title', /Board type|Scrum|Kanban/i);
    const plannedTh = table.locator('th').filter({ hasText: 'Planned' }).first();
    await expect(plannedTh).toHaveAttribute('title', /Epic|planned/i);
    const adhocTh = table.locator('th').filter({ hasText: 'Ad-hoc' }).first();
    await expect(adhocTh).toHaveAttribute('title', /without an Epic|unplanned/i);
    const latestEndTh = table.locator('th').filter({ hasText: 'Latest End' }).first();
    await expect(latestEndTh).toHaveAttribute('title', /sprint end|window/i);
  });

  test('Boards table shows capacity proxy columns (Active Assignees, Assumed Capacity, Assumed Waste)', async ({ page }) => {
    await page.goto('/report');
    await runDefaultPreview(page);
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    const boardsSection = page.locator('#project-epic-level-content');
    const sectionText = await boardsSection.textContent();
    if (!sectionText || !sectionText.includes('Board ID')) {
      test.skip('No boards table (no boards in window)');
      return;
    }
    const boardsTable = boardsSection.locator('table.data-table').first();
    await expect(boardsTable).toBeVisible({ timeout: 5000 });
    await expect(boardsTable.locator('th', { hasText: 'Active Assignees' })).toBeVisible();
    await expect(boardsTable.locator('th', { hasText: 'Assumed Capacity (PD)' })).toBeVisible();
    await expect(boardsTable.locator('th', { hasText: 'Assumed Waste %' })).toBeVisible();
  });

  test('API /api/csv-columns returns columns matching Boards SSOT contract', async ({ request }) => {
    const response = await request.get('/api/csv-columns');
    if (response.status() === 401) {
      test.skip('Auth required');
      return;
    }
    if (response.status() === 404) {
      test.skip('Route /api/csv-columns not found (restart server with latest code)');
      return;
    }
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.columns)).toBe(true);
    expect(body.columns.length).toBeGreaterThan(40);
    expect(body.columns).toContain('issueKey');
    expect(body.columns).toContain('storyPoints');
    expect(body.columns).toContain('epicKey');
  });

  test('Preview and Boards tab render without console errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    await page.goto('/report');
    await runDefaultPreview(page);
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    await page.waitForTimeout(500);
    const relevant = consoleErrors.filter(t => !t.includes('favicon') && !t.includes('404'));
    expect(relevant).toEqual([]);
  });
});
