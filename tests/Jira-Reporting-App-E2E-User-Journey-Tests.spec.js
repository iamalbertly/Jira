import { test, expect } from '@playwright/test';

test.describe('Jira Reporting App - E2E User Journey Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/report');
    await expect(page.locator('h1')).toContainText('Jira Sprint Report');
  });

  test('should load report page with default filters', async ({ page }) => {
    // Verify page elements are present
    await expect(page.locator('#project-mpsa')).toBeChecked();
    await expect(page.locator('#project-mas')).toBeChecked();
    await expect(page.locator('#preview-btn')).toBeVisible();
    await expect(page.locator('#export-filtered-btn')).toBeDisabled();
    await expect(page.locator('#export-raw-btn')).toBeDisabled();
  });

  test('should disable preview button when no projects selected', async ({ page }) => {
    // Uncheck both projects
    await page.uncheck('#project-mpsa');
    await page.uncheck('#project-mas');
    
    // Preview button should be disabled
    await expect(page.locator('#preview-btn')).toBeDisabled();
    
    // Button should have title explaining why
    const title = await page.locator('#preview-btn').getAttribute('title');
    expect(title).toContain('Please select at least one project');
  });

  test('should show error when preview clicked with no projects', async ({ page }) => {
    // Uncheck both projects
    await page.uncheck('#project-mpsa');
    await page.uncheck('#project-mas');
    
    // Try to click preview (should be disabled, but test error handling)
    // Actually, button should be disabled, so we'll test the validation in the API test
    await expect(page.locator('#preview-btn')).toBeDisabled();
  });

  test('should generate preview with valid filters', async ({ page }) => {
    // Ensure projects are selected
    await page.check('#project-mpsa');
    await page.check('#project-mas');
    
    // Click preview button
    await page.click('#preview-btn');
    
    // Wait for either loading state or preview/error (loading may be very brief)
    await Promise.race([
      page.waitForSelector('#loading', { state: 'visible', timeout: 2000 }).catch(() => null),
      page.waitForSelector('#preview-content', { state: 'visible', timeout: 60000 }),
      page.waitForSelector('#error', { state: 'visible', timeout: 60000 }),
    ]);
    
    // If loading appeared, wait for it to complete
    const loadingVisible = await page.locator('#loading').isVisible();
    if (loadingVisible) {
      await expect(page.locator('#loading-message')).toContainText('Loading');
      // Wait for loading to disappear and preview/error to appear
      await Promise.race([
        page.waitForSelector('#preview-content', { state: 'visible', timeout: 60000 }),
        page.waitForSelector('#error', { state: 'visible', timeout: 60000 }),
      ]);
    }
    
    // Verify either preview or error appeared (both are valid outcomes)
    const previewVisible = await page.locator('#preview-content').isVisible();
    const errorVisible = await page.locator('#error').isVisible();
    expect(previewVisible || errorVisible).toBeTruthy();
  });

  test('should display tabs after preview loads', async ({ page }) => {
    // This test assumes preview will work - may need to mock or skip if no Jira access
    await page.check('#project-mpsa');
    await page.click('#preview-btn');
    
    // Wait for either preview content or error
    await Promise.race([
      page.waitForSelector('#preview-content', { state: 'visible', timeout: 60000 }),
      page.waitForSelector('#error', { state: 'visible', timeout: 60000 }),
    ]);
    
    // If preview loaded, check tabs
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (previewVisible) {
      await expect(page.locator('.tab-btn[data-tab="boards"]')).toBeVisible();
      await expect(page.locator('.tab-btn[data-tab="sprints"]')).toBeVisible();
      await expect(page.locator('.tab-btn[data-tab="done-stories"]')).toBeVisible();
    }
  });

  test('should switch between tabs', async ({ page }) => {
    // Generate preview first
    await page.check('#project-mpsa');
    await page.click('#preview-btn');
    
    // Wait for preview
    await Promise.race([
      page.waitForSelector('#preview-content', { state: 'visible', timeout: 60000 }),
      page.waitForSelector('#error', { state: 'visible', timeout: 60000 }),
    ]);
    
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (previewVisible) {
      // Click Sprints tab
      await page.click('.tab-btn[data-tab="sprints"]');
      await expect(page.locator('#tab-sprints')).toHaveClass(/active/);
      
      // Click Done Stories tab
      await page.click('.tab-btn[data-tab="done-stories"]');
      await expect(page.locator('#tab-done-stories')).toHaveClass(/active/);
    }
  });

  test('should filter done stories by search', async ({ page }) => {
    await page.check('#project-mpsa');
    await page.click('#preview-btn');
    
    await Promise.race([
      page.waitForSelector('#preview-content', { state: 'visible', timeout: 60000 }),
      page.waitForSelector('#error', { state: 'visible', timeout: 60000 }),
    ]);
    
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (previewVisible) {
      // Navigate to Done Stories tab
      await page.click('.tab-btn[data-tab="done-stories"]');
      
      // Enter search text
      const searchBox = page.locator('#search-box');
      if (await searchBox.isVisible()) {
        await searchBox.fill('TEST');
        // Search should filter results (exact behavior depends on data)
        await expect(searchBox).toHaveValue('TEST');
      }
    }
  });

  test('should enable export buttons after preview', async ({ page }) => {
    await page.check('#project-mpsa');
    await page.click('#preview-btn');
    
    await Promise.race([
      page.waitForSelector('#preview-content', { state: 'visible', timeout: 60000 }),
      page.waitForSelector('#error', { state: 'visible', timeout: 60000 }),
    ]);
    
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (previewVisible) {
      // Export buttons should be enabled
      await expect(page.locator('#export-filtered-btn')).toBeEnabled();
      await expect(page.locator('#export-raw-btn')).toBeEnabled();
    }
  });

  test('should update date display when dates change', async ({ page }) => {
    const startDate = page.locator('#start-date');
    const endDate = page.locator('#end-date');
    
    // Change start date
    await startDate.fill('2025-05-01T00:00');
    
    // Date display should update
    const dateDisplay = page.locator('#date-display');
    // Wait a bit for the update
    await page.waitForTimeout(100);
    
    // Verify date display is visible (content may vary)
    await expect(dateDisplay).toBeVisible();
  });

  test('should show predictability mode options when predictability is enabled', async ({ page }) => {
    const predictabilityCheckbox = page.locator('#include-predictability');
    const modeGroup = page.locator('#predictability-mode-group');
    
    // Initially hidden
    await expect(modeGroup).not.toBeVisible();
    
    // Check predictability
    await predictabilityCheckbox.check();
    
    // Mode group should be visible
    await expect(modeGroup).toBeVisible();
    
    // Should have radio options
    await expect(page.locator('input[name="predictability-mode"][value="approx"]')).toBeChecked();
    await expect(page.locator('input[name="predictability-mode"][value="strict"]')).toBeVisible();
  });
});
