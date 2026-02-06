import { test, expect } from '@playwright/test';

test.describe('Jira Reporting App - UX Enhancements', () => {
  test('report filters: search, select all/none, advanced options, export hint', async ({ page }) => {
    await page.goto('/report');
    if (page.url().includes('login')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }

    await expect(page.locator('#project-search')).toBeVisible();

    const totalProjects = await page.locator('.project-checkbox[data-project]').count();
    await page.click('#projects-select-none');
    await expect(page.locator('.project-checkbox[data-project]:checked')).toHaveCount(0);
    await expect(page.locator('#preview-btn')).toBeDisabled();

    await page.click('#projects-select-all');
    await expect(page.locator('.project-checkbox[data-project]:checked')).toHaveCount(totalProjects);
    await expect(page.locator('#projects-selection-status')).toContainText(String(totalProjects));

    await page.fill('#project-search', 'MPSA2');
    const visibleLabels = await page.locator('.filters-panel .checkbox-label:visible').count();
    expect(visibleLabels).toBeGreaterThan(0);
    await expect(page.locator('#projects-no-match')).toBeHidden();

    await page.fill('#project-search', 'NO_MATCH');
    await expect(page.locator('#projects-no-match')).toBeVisible();

    await page.click('#advanced-options-toggle');
    await expect(page.locator('#advanced-options')).toBeVisible();
    await page.click('#advanced-options-toggle');
    await expect(page.locator('#advanced-options')).toHaveJSProperty('hidden', true);

    await expect(page.locator('#export-hint')).toContainText('Run a report to enable export.');
  });

  test('leadership context summary and signal labels render', async ({ page }) => {
    await page.route('**/preview.json*', async (route) => {
      const body = {
        boards: [
          { id: 1, name: 'Board A', projectKeys: ['MPSA'], indexedDelivery: { index: 1.1 } },
        ],
        sprintsIncluded: [
          { id: 10, name: 'Sprint 1', state: 'closed', startDate: '2026-01-01', endDate: '2026-01-15', sprintWorkDays: 10, doneStoriesNow: 10, doneStoriesBySprintEnd: 9, doneSP: 50 },
          { id: 11, name: 'Sprint 2', state: 'closed', startDate: '2026-01-16', endDate: '2026-01-30', sprintWorkDays: 10, doneStoriesNow: 12, doneStoriesBySprintEnd: 11, doneSP: 60 },
        ],
        rows: [{}, {}],
        metrics: {
          predictability: {
            perSprint: {
              10: { sprintId: 10, sprintName: 'Sprint 1', committedStories: 10, deliveredStories: 9, committedSP: 50, deliveredSP: 45, predictabilityStories: 90, predictabilitySP: 90 },
              11: { sprintId: 11, sprintName: 'Sprint 2', committedStories: 12, deliveredStories: 11, committedSP: 60, deliveredSP: 55, predictabilityStories: 92, predictabilitySP: 92 },
            },
          },
        },
        meta: {},
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });

    await page.goto('/sprint-leadership');
    if (page.url().includes('login')) {
      test.skip(true, 'Redirected to login; auth may be required');
      return;
    }

    await page.fill('#leadership-start', '2026-01-01');
    await page.fill('#leadership-end', '2026-01-31');
    await page.click('#leadership-preview');

    await expect(page.locator('.leadership-card').first()).toBeVisible();
    await expect(page.locator('.metrics-hint').first()).toContainText('Context:');
    const velocityHeader = page.locator('.leadership-card').nth(1).locator('thead');
    await expect(velocityHeader).toContainText('Signal');
    await expect(velocityHeader).toContainText('Data quality');
    const velocityTable = page.locator('.leadership-card').nth(1).locator('table.data-table');
    await expect(velocityTable).toContainText('Low sample');
  });

  test('login page encoding is clean', async ({ page }) => {
    await page.goto('/login.html');
    await expect(page.locator('h1')).toContainText('VodaAgileBoard');
    await expect(page.locator('.subtitle').first()).toContainText('Sprint insights from Jira for Voda squads - sign in');
  });
});
