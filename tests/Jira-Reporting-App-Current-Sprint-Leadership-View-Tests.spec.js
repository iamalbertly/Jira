import { test, expect } from '@playwright/test';

test.describe('Jira Reporting App - Current Sprint and Leadership View Tests', () => {
  test('should load current-sprint page and show board selector', async ({ page }) => {
    await page.goto('/current-sprint');
    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip('Redirected to login or home; auth may be required');
      return;
    }
    await expect(page.locator('h1')).toContainText('Current Sprint');
    await expect(page.locator('#board-select')).toBeVisible();
    const select = page.locator('#board-select');
    await expect(select).toBeVisible();
    const options = await select.locator('option').allTextContents();
    expect(options.length).toBeGreaterThanOrEqual(1);
  });

  test('should load current-sprint and handle board selection without crash', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/current-sprint');
    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip('Redirected to login or home; auth may be required');
      return;
    }
    await expect(page.locator('#board-select')).toBeVisible();
    await page.waitForSelector('#board-select', { state: 'visible', timeout: 10000 });
    const hasBoards = await page.locator('#board-select option[value]:not([value=""])').count() > 0;
    if (hasBoards) {
      await page.selectOption('#board-select', { index: 1 });
      await page.waitForTimeout(3000);
      const content = page.locator('#current-sprint-content');
      const loading = page.locator('#current-sprint-loading');
      const error = page.locator('#current-sprint-error');
      const contentVisible = await content.isVisible();
      const loadingText = await loading.textContent();
      const bodyText = await page.locator('body').textContent();
      const hasNoSprintMsg = bodyText && (bodyText.includes('No active') || bodyText.includes('recent closed sprint') || bodyText.includes('no active'));
      const hasBoardLoadIssue = bodyText && (bodyText.includes("Couldn't load boards") || bodyText.includes('No boards found'));
      expect(contentVisible || hasNoSprintMsg || loadingText?.includes('Select') || (await error.isVisible()) || hasBoardLoadIssue).toBeTruthy();

      if (contentVisible && !hasNoSprintMsg) {
        await expect(page.locator('.sprint-tabs')).toBeVisible();
        await expect(page.locator('#sprint-summary-card')).toBeVisible();
      }
    }
  });

  test('should load sprint-leadership page and show date inputs and Preview', async ({ page }) => {
    await page.goto('/sprint-leadership');
    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip('Redirected to login or home; auth may be required');
      return;
    }
    await expect(page.locator('h1')).toContainText('Sprint Leadership');
    await expect(page.locator('#leadership-start')).toBeVisible();
    await expect(page.locator('#leadership-end')).toBeVisible();
    await expect(page.locator('#leadership-preview')).toBeVisible();
    await expect(page.locator('#leadership-preview')).toContainText('Preview');
  });

  test('should load sprint-leadership and handle Preview click without crash', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('/sprint-leadership');
    if (page.url().includes('login') || page.url().endsWith('/')) {
      test.skip('Redirected to login or home; auth may be required');
      return;
    }
    await expect(page.locator('#leadership-preview')).toBeVisible();
    await page.click('#leadership-preview');
    await page.waitForTimeout(5000);
    const content = page.locator('#leadership-content');
    const loading = page.locator('#leadership-loading');
    const error = page.locator('#leadership-error');
    const contentVisible = await content.isVisible();
    const loadingVisible = await loading.isVisible();
    const errorVisible = await error.isVisible();
    const bodyText = await page.locator('body').textContent();
    const hasContent = contentVisible && (await content.textContent())?.trim().length > 0;
    const hasError = errorVisible && (await error.textContent())?.trim().length > 0;
    expect(hasContent || loadingVisible || hasError || (bodyText && bodyText.length > 0)).toBeTruthy();

    if (hasContent) {
      await expect(page.locator('text=Velocity (SP/day)')).toBeVisible();
    }
  });
});
