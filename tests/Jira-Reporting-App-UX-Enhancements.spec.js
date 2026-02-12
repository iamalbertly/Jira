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
    if (await page.locator('#projects-select-none').count()) {
      await page.click('#projects-select-none');
    } else {
      await page.evaluate(() => {
        document.querySelectorAll('.project-checkbox[data-project]').forEach((el) => {
          // @ts-ignore
          el.checked = false;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
    }
    await expect(page.locator('.project-checkbox[data-project]:checked')).toHaveCount(0);
    await expect(page.locator('#preview-btn')).toBeDisabled();

    if (await page.locator('#projects-select-all').count()) {
      await page.click('#projects-select-all');
    } else {
      await page.evaluate(() => {
        document.querySelectorAll('.project-checkbox[data-project]').forEach((el) => {
          // @ts-ignore
          el.checked = true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
    }
    await expect(page.locator('.project-checkbox[data-project]:checked')).toHaveCount(totalProjects);
    if (await page.locator('#projects-selection-status').count()) {
      await expect(page.locator('#projects-selection-status')).toContainText(String(totalProjects));
    }

    await page.fill('#project-search', 'MPSA2');
    const visibleLabels = await page.locator('.filters-panel .checkbox-label:visible').count();
    expect(visibleLabels).toBeGreaterThan(0);
    await expect(page.locator('#projects-no-match')).toBeHidden();

    await page.fill('#project-search', 'NO_MATCH');
    await expect(page.locator('#projects-no-match')).toBeVisible();

    if (await page.locator('#advanced-options-toggle').count()) {
      await page.click('#advanced-options-toggle');
      await expect(page.locator('#advanced-options')).toBeVisible();
      await page.click('#advanced-options-toggle');
      await expect(page.locator('#advanced-options')).toHaveJSProperty('hidden', true);
    }

    if (await page.locator('#export-hint').count()) {
      const hintText = (await page.locator('#export-hint').textContent().catch(() => '')) || '';
      if (hintText.trim().length > 0) {
        await expect(page.locator('#export-hint')).toContainText(/Run a report|Preview/i);
      } else {
        await expect(page.locator('#export-excel-btn')).toBeVisible();
        await expect(page.locator('#export-excel-btn')).toContainText(/Export/i);
      }
    } else {
      await expect(page.locator('#export-excel-btn')).toBeVisible();
      await expect(page.locator('#export-excel-btn')).toContainText(/Export/i);
    }
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

    if (page.url().includes('/report')) {
      await page.click('#preview-btn');
      await expect(page.locator('#preview-content')).toBeVisible({ timeout: 10000 });
      await page.click('#tab-btn-trends');
      await expect(page.locator('#tab-trends')).toHaveClass(/active/);
      await expect(page.locator('#trends-content, .leadership-outcome-line').first()).toBeVisible();
    } else {
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
    }
  });

  test('login page encoding is clean', async ({ page }) => {
    await page.goto('/login.html');
    const body = ((await page.locator('body').textContent().catch(() => '')) || '').trim();
    expect(body).not.toContain('�');
    expect(body).not.toMatch(/â|Ã|ðŸ/);
    if (page.url().includes('/login')) {
      await expect(page.locator('h1')).toContainText(/VodaAgileBoard|Sign in/i);
      await expect(page.locator('body')).toContainText(/Sprint insights from Jira|sign in/i);
    }
  });
});
