import { test, expect } from '@playwright/test';

const DEFAULT_Q2_START = '2025-07-01T00:00';
const DEFAULT_Q2_END = '2025-09-30T23:59';

async function waitForPreview(page) {
  const previewBtn = page.locator('#preview-btn');
  await expect(previewBtn).toBeEnabled({ timeout: 5000 });
  await previewBtn.click();

  try {
    await page.waitForSelector('#loading', { state: 'visible', timeout: 5000 });
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 300000 });
  } catch (e) {
    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    const errorVisible = await page.locator('#error').isVisible().catch(() => false);
    if (!previewVisible && !errorVisible) {
      await page.waitForSelector('#preview-content', { state: 'visible', timeout: 10000 });
    }
  }

  try {
    await page.waitForSelector('#preview-content', { state: 'visible', timeout: 10000 });
  } catch (error) {
    const errorVisible = await page.locator('#error').isVisible().catch(() => false);
    if (!errorVisible) {
      throw error;
    }
  }
}

async function runDefaultPreview(page, overrides = {}) {
  const {
    projects = ['MPSA', 'MAS'],
    start = DEFAULT_Q2_START,
    end = DEFAULT_Q2_END,
  } = overrides;

  await page.goto('/report');

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

  await page.fill('#start-date', start);
  await page.fill('#end-date', end);

  await waitForPreview(page);
}

test.describe('Jira Reporting App - Column Titles & Tooltips', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/report');
    await expect(page.locator('h1')).toContainText('VodaAgileBoard');
  });

  test('boards table column titles expose helpful tooltips', async ({ page }) => {
    test.setTimeout(300000);
    await runDefaultPreview(page);

    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    if (!previewVisible) {
      test.skip();
    }

    await page.click('.tab-btn[data-tab="project-epic-level"]');
    const table = page.locator('#project-epic-level-content table');
    const tableVisible = await table.isVisible().catch(() => false);
    if (!tableVisible) {
      test.skip();
    }

    const headers = table.locator('thead th');

    async function expectHeaderWithTooltip(label, snippet) {
      const header = headers.filter({ hasText: label });
      const count = await header.count();
      expect(count).toBeGreaterThan(0);
      const titleAttr = await header.first().getAttribute('title');
      expect(titleAttr).toBeTruthy();
      if (snippet) {
        expect(titleAttr).toContain(snippet);
      }
    }

    await expectHeaderWithTooltip('Board ID', 'Jira board identifier');
    await expectHeaderWithTooltip('Board', 'Board name shown in Jira');
    await expectHeaderWithTooltip('Done Stories', 'Stories marked Done in included sprints');
    await expectHeaderWithTooltip('SP / Day', 'Done SP ÷ Sprint Days');
    await expectHeaderWithTooltip('On-Time %', 'On-time delivery discipline');
    await expectHeaderWithTooltip('Ad-hoc', 'often ad-hoc work');
  });

  test('sprints table column titles expose helpful tooltips', async ({ page }) => {
    test.setTimeout(300000);
    await runDefaultPreview(page);

    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    if (!previewVisible) {
      test.skip();
    }

    await page.click('.tab-btn[data-tab="sprints"]');
    const table = page.locator('#sprints-content table');
    const tableVisible = await table.isVisible().catch(() => false);
    if (!tableVisible) {
      test.skip();
    }

    const headers = table.locator('thead th');

    async function expectHeaderWithTooltip(label, snippet) {
      const header = headers.filter({ hasText: label });
      const count = await header.count();
      expect(count).toBeGreaterThan(0);
      const titleAttr = await header.first().getAttribute('title');
      expect(titleAttr).toBeTruthy();
      if (snippet) {
        expect(titleAttr).toContain(snippet);
      }
    }

    await expectHeaderWithTooltip('Project', 'Projects included for this sprint');
    await expectHeaderWithTooltip('Sprint', 'Sprint name');
    await expectHeaderWithTooltip('Start', 'Sprint start date');
    await expectHeaderWithTooltip('End', 'Sprint end date');
    await expectHeaderWithTooltip('Done Stories', 'Stories marked Done in this sprint');
    await expectHeaderWithTooltip('Done SP', 'Story points completed in this sprint');
  });

  test('done stories table column titles expose helpful tooltips', async ({ page }) => {
    test.setTimeout(300000);
    await runDefaultPreview(page);

    const previewVisible = await page.locator('#preview-content').isVisible().catch(() => false);
    if (!previewVisible) {
      test.skip();
    }

    await page.click('.tab-btn[data-tab="done-stories"]');
    const table = page.locator('#done-stories-content table');
    const tableVisible = await table.isVisible().catch(() => false);
    if (!tableVisible) {
      // If there are no done stories rows, we cannot assert headers
      test.skip();
    }

    const headers = table.locator('thead th');

    async function expectHeaderWithTooltip(label, snippet) {
      const header = headers.filter({ hasText: label });
      const count = await header.count();
      expect(count).toBeGreaterThan(0);
      const titleAttr = await header.first().getAttribute('title');
      expect(titleAttr).toBeTruthy();
      if (snippet) {
        expect(titleAttr).toContain(snippet);
      }
    }

    await expectHeaderWithTooltip('Key', 'Jira issue key');
    await expectHeaderWithTooltip('Summary', 'Issue summary from Jira');
    await expectHeaderWithTooltip('Status', 'Current Jira status');
    await expectHeaderWithTooltip('Type', 'Issue type');

    // If story points and epic data exist, their columns should also expose tooltips
    const spHeaderCount = await headers.filter({ hasText: 'SP' }).count();
    if (spHeaderCount > 0) {
      const spHeader = headers.filter({ hasText: 'SP' }).first();
      const titleAttr = await spHeader.getAttribute('title');
      expect(titleAttr).toBeTruthy();
      expect(titleAttr).toContain('Story Points');
    }

    const epicHeaderCount = await headers.filter({ hasText: 'Epic Title' }).count();
    if (epicHeaderCount > 0) {
      const epicTitleHeader = headers.filter({ hasText: 'Epic Title' }).first();
      const epicSummaryHeader = headers.filter({ hasText: 'Epic Summary' }).first();
      const epicTitleTooltip = await epicTitleHeader.getAttribute('title');
      const epicSummaryTooltip = await epicSummaryHeader.getAttribute('title');

      expect(epicTitleTooltip).toBeTruthy();
      expect(epicTitleTooltip).toContain('Epic title');
      expect(epicSummaryTooltip).toBeTruthy();
      expect(epicSummaryTooltip).toContain('Epic summary');
    }
  });
});

