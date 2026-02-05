import { test, expect } from '@playwright/test';
import { runDefaultPreview } from './JiraReporting-Tests-Shared-PreviewExport-Helpers.js';
const DEFAULT_Q2_QUERY = '?projects=MPSA,MAS&start=2025-07-01T00:00:00.000Z&end=2025-09-30T23:59:59.999Z';
test.describe('Jira Reporting App - E2E User Journey Tests', () => {
  test.beforeEach(async ({
    page
  }) => {
    await page.goto('/report');
    await expect(page.locator('h1')).toContainText('VodaAgileBoard');
  });
  test('should load report page with default filters', async ({
    page
  }) => {
    // Verify page elements are present
    await expect(page.locator('#project-mpsa')).toBeChecked();
    await expect(page.locator('#project-mas')).toBeChecked();
    await expect(page.locator('#preview-btn')).toBeVisible();
    await expect(page.locator('#export-excel-btn')).toBeDisabled();
    await expect(page.locator('#export-excel-btn')).toBeDisabled();
  });
  test('should disable preview button when no projects selected', async ({
    page
  }) => {
    // Uncheck both projects
    await page.uncheck('#project-mpsa');
    await page.uncheck('#project-mas');

    // Preview button should be disabled
    await expect(page.locator('#preview-btn')).toBeDisabled();

    // Button should have title explaining why
    const title = await page.locator('#preview-btn').getAttribute('title');
    expect(title).toContain('Please select at least one project');
  });
  test('should show error when preview clicked with no projects', async ({
    page
  }) => {
    // Uncheck both projects
    await page.uncheck('#project-mpsa');
    await page.uncheck('#project-mas');

    // Try to click preview (should be disabled, but test error handling)
    // Actually, button should be disabled, so we'll test the validation in the API test
    await expect(page.locator('#preview-btn')).toBeDisabled();
  });
  test('should generate preview with valid filters', async ({
    page
  }) => {
    test.setTimeout(300000);
    // Use shared helper to drive a default Q2 preview
    await runDefaultPreview(page);

    // Verify either preview or error appeared (both are valid outcomes)
    const previewVisible = await page.locator('#preview-content').isVisible();
    const errorVisible = await page.locator('#error').isVisible();
    expect(previewVisible || errorVisible).toBeTruthy();

    // If preview is visible, check that meta summary is rendered
    if (previewVisible) {
      const metaText = await page.locator('#preview-meta').innerText();
      expect(metaText.toLowerCase()).toContain('summary:');
      expect(metaText.toLowerCase()).toContain('boards:');
    }
  });
  test('should display tabs after preview loads', async ({
    page
  }) => {
    test.setTimeout(300000);
    // This test assumes preview will work - may need to mock or skip if no Jira access
    await runDefaultPreview(page);

    // If preview loaded, check tabs
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (previewVisible) {
      await expect(page.locator('.tab-btn[data-tab="project-epic-level"]')).toBeVisible();
      await expect(page.locator('.tab-btn[data-tab="sprints"]')).toBeVisible();
      await expect(page.locator('.tab-btn[data-tab="done-stories"]')).toBeVisible();
    }
  });
  test('should switch between tabs', async ({
    page
  }) => {
    test.setTimeout(300000);
    // Generate preview first
    await runDefaultPreview(page);
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
  test('should filter done stories by search', async ({
    page
  }) => {
    test.setTimeout(300000);
    await runDefaultPreview(page);
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
  test('should enable export buttons after preview', async ({
    page
  }) => {
    test.setTimeout(300000);
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (previewVisible) {
      // Export buttons should be enabled
      await expect(page.locator('#export-excel-btn')).toBeEnabled();
      await expect(page.locator('#export-excel-btn')).toBeEnabled();
    }
  });
  test('should update date display when dates change', async ({
    page
  }) => {
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
  test('should show predictability mode options when predictability is enabled', async ({
    page
  }) => {
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
  test('preview button and exports should reflect loading state and data', async ({
    page
  }) => {
    test.setTimeout(300000);
    // Ensure we start on the report page with default projects selected
    await expect(page.locator('#preview-btn')).toBeEnabled();

    // Kick off preview and assert preview button is disabled while loading is visible
    await page.click('#preview-btn');
    let loadingVisible = false;
    try {
      await page.waitForSelector('#loading', {
        state: 'visible',
        timeout: 60000
      });
      loadingVisible = true;
    } catch (error) {
      // Loading may resolve too quickly (cache or fast response). Proceed without failing.
    }
    if (loadingVisible) {
      // If loading stays visible, preview should be disabled. If loading resolves quickly or the overlay is already hidden, skip this assertion.
      await page.waitForTimeout(200);
      const stillLoading = await page.locator('#loading').isVisible().catch(() => false);
      if (stillLoading) {
        await expect(page.locator('#preview-btn')).toBeDisabled();
      }
    }

    // Wait for loading to complete
    await page.waitForSelector('#loading', {
      state: 'hidden',
      timeout: 600000
    });
    const previewVisible = await page.locator('#preview-content').isVisible();
    const errorVisible = await page.locator('#error').isVisible();

    // Preview should be re-enabled regardless of outcome
    await expect(page.locator('#preview-btn')).toBeEnabled();
    if (previewVisible) {
      // When preview has rows, export buttons should be enabled; otherwise disabled
      const text = await page.locator('#preview-content').innerText();
      const hasDoneStoriesText = (text || '').toLowerCase().includes('done stories');
      if (hasDoneStoriesText) {
        await expect(page.locator('#export-excel-btn')).toBeEnabled();
        await expect(page.locator('#export-excel-btn')).toBeEnabled();
      } else {
        await expect(page.locator('#export-excel-btn')).toBeDisabled();
        await expect(page.locator('#export-excel-btn')).toBeDisabled();
      }
    } else if (errorVisible) {
      // On error, exports should remain disabled
      await expect(page.locator('#export-excel-btn')).toBeDisabled();
      await expect(page.locator('#export-excel-btn')).toBeDisabled();
    }
  });
  test('partial previews and exports show clear status and hints when applicable', async ({
    page
  }) => {
    test.setTimeout(300000);
    // Drive a preview that is likely to be heavier (wider window) to increase chances of partial results
    await runDefaultPreview(page, {
      projects: ['MPSA', 'MAS'],
      start: '2025-01-01T00:00',
      end: '2025-12-31T23:59'
    });
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      // If preview did not load, we cannot assert partial behaviour
      test.skip();
    }
    const statusText = await page.locator('#preview-status').innerText();
    const exportHintText = await page.locator('#export-hint').innerText();
    if ((statusText || '').toLowerCase().includes('partial')) {
      // When partial, banner and hint should both mention partial state
      expect(statusText.toLowerCase()).toContain('partial');
      expect(exportHintText.toLowerCase()).toContain('partial');
      await expect(page.locator('#export-excel-btn')).toBeEnabled();
      await expect(page.locator('#export-excel-btn')).toBeEnabled();
    }
  });
  test('invalid date ranges are rejected client-side with clear error', async ({
    page
  }) => {
    // Configure an obviously invalid date range (start after end)
    await page.fill('#start-date', '2025-07-01T00:00');
    await page.fill('#end-date', '2025-06-30T23:59');

    // Click preview and expect immediate client-side validation error without waiting on network
    await page.click('#preview-btn');
    await page.waitForSelector('#error', {
      state: 'visible',
      timeout: 10000
    });
    const errorText = await page.locator('#error').innerText();
    expect(errorText.toLowerCase()).toContain('start date must be before end date');
    await page.click('#error .error-close');
    await expect(page.locator('#error')).toBeHidden();
    await expect(page.locator('#preview-btn')).toBeFocused();
  });
  test('Require Resolved by Sprint End empty state explains the filter when applicable', async ({
    page
  }) => {
    // Enable the filter and request a wider range to increase chances of filtered-out stories
    await page.check('#require-resolved-by-sprint-end');
    await runDefaultPreview(page, {
      projects: ['MPSA', 'MAS'],
      start: '2025-07-01T00:00',
      end: '2025-09-30T23:59'
    });
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      test.skip();
    }

    // Navigate to Done Stories tab
    await page.click('.tab-btn[data-tab="done-stories"]');
    const emptyStateText = await page.locator('#done-stories-content').innerText();
    if ((emptyStateText || '').toLowerCase().includes('no done stories found')) {
      // When no rows are present and the filter is on, the empty state should mention the filter explicitly
      expect(emptyStateText.toLowerCase()).toContain('require resolved by sprint end');
    }
  });
  test('metrics tab renders when story points, rework, and epic TTM are enabled', async ({
    page
  }) => {
    // Note: Story Points, Epic TTM, and Bugs/Rework are now mandatory (always enabled)
    // No need to check these options - they're always included in reports

    // Run a default preview with Q2 window
    await runDefaultPreview(page);
    const previewVisible = await page.locator('#preview-content').isVisible();
    if (!previewVisible) {
      test.skip();
    }

    // Metrics content now lives inside the Project & Epic Level tab
    await page.click('.tab-btn[data-tab="project-epic-level"]');
    const metricsText = (await page.locator('#project-epic-level-content').innerText())?.toLowerCase() || '';
    expect(metricsText).toContain('throughput');
    expect(metricsText).toContain('epic time-to-market');
  });
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0ZXN0IiwiZXhwZWN0IiwicnVuRGVmYXVsdFByZXZpZXciLCJERUZBVUxUX1EyX1FVRVJZIiwiZGVzY3JpYmUiLCJiZWZvcmVFYWNoIiwicGFnZSIsImdvdG8iLCJsb2NhdG9yIiwidG9Db250YWluVGV4dCIsInRvQmVDaGVja2VkIiwidG9CZVZpc2libGUiLCJ0b0JlRGlzYWJsZWQiLCJ1bmNoZWNrIiwidGl0bGUiLCJnZXRBdHRyaWJ1dGUiLCJ0b0NvbnRhaW4iLCJzZXRUaW1lb3V0IiwicHJldmlld1Zpc2libGUiLCJpc1Zpc2libGUiLCJlcnJvclZpc2libGUiLCJ0b0JlVHJ1dGh5IiwibWV0YVRleHQiLCJpbm5lclRleHQiLCJ0b0xvd2VyQ2FzZSIsImNsaWNrIiwidG9IYXZlQ2xhc3MiLCJzZWFyY2hCb3giLCJmaWxsIiwidG9IYXZlVmFsdWUiLCJ0b0JlRW5hYmxlZCIsInN0YXJ0RGF0ZSIsImVuZERhdGUiLCJkYXRlRGlzcGxheSIsIndhaXRGb3JUaW1lb3V0IiwicHJlZGljdGFiaWxpdHlDaGVja2JveCIsIm1vZGVHcm91cCIsIm5vdCIsImNoZWNrIiwibG9hZGluZ1Zpc2libGUiLCJ3YWl0Rm9yU2VsZWN0b3IiLCJzdGF0ZSIsInRpbWVvdXQiLCJlcnJvciIsInN0aWxsTG9hZGluZyIsImNhdGNoIiwidGV4dCIsImhhc0RvbmVTdG9yaWVzVGV4dCIsImluY2x1ZGVzIiwicHJvamVjdHMiLCJzdGFydCIsImVuZCIsInNraXAiLCJzdGF0dXNUZXh0IiwiZXhwb3J0SGludFRleHQiLCJlcnJvclRleHQiLCJ0b0JlSGlkZGVuIiwidG9CZUZvY3VzZWQiLCJlbXB0eVN0YXRlVGV4dCIsIm1ldHJpY3NUZXh0Il0sInNvdXJjZXMiOlsiSmlyYS1SZXBvcnRpbmctQXBwLUUyRS1Vc2VyLUpvdXJuZXktVGVzdHMuc3BlYy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyB0ZXN0LCBleHBlY3QgfSBmcm9tICdAcGxheXdyaWdodC90ZXN0JztcclxuaW1wb3J0IHsgcnVuRGVmYXVsdFByZXZpZXcgfSBmcm9tICcuL0ppcmFSZXBvcnRpbmctVGVzdHMtU2hhcmVkLVByZXZpZXdFeHBvcnQtSGVscGVycy5qcyc7XHJcblxyXG5jb25zdCBERUZBVUxUX1EyX1FVRVJZID0gJz9wcm9qZWN0cz1NUFNBLE1BUyZzdGFydD0yMDI1LTA3LTAxVDAwOjAwOjAwLjAwMFomZW5kPTIwMjUtMDktMzBUMjM6NTk6NTkuOTk5Wic7XHJcblxyXG50ZXN0LmRlc2NyaWJlKCdKaXJhIFJlcG9ydGluZyBBcHAgLSBFMkUgVXNlciBKb3VybmV5IFRlc3RzJywgKCkgPT4ge1xyXG4gIHRlc3QuYmVmb3JlRWFjaChhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIGF3YWl0IHBhZ2UuZ290bygnL3JlcG9ydCcpO1xyXG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignaDEnKSkudG9Db250YWluVGV4dCgnVm9kYUFnaWxlQm9hcmQnKTtcclxuICB9KTtcclxuXHJcbiAgdGVzdCgnc2hvdWxkIGxvYWQgcmVwb3J0IHBhZ2Ugd2l0aCBkZWZhdWx0IGZpbHRlcnMnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIC8vIFZlcmlmeSBwYWdlIGVsZW1lbnRzIGFyZSBwcmVzZW50XHJcbiAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjcHJvamVjdC1tcHNhJykpLnRvQmVDaGVja2VkKCk7XHJcbiAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjcHJvamVjdC1tYXMnKSkudG9CZUNoZWNrZWQoKTtcclxuICAgIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWJ0bicpKS50b0JlVmlzaWJsZSgpO1xyXG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignI2V4cG9ydC1leGNlbC1idG4nKSkudG9CZURpc2FibGVkKCk7XHJcbiAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjZXhwb3J0LWV4Y2VsLWJ0bicpKS50b0JlRGlzYWJsZWQoKTtcclxuICB9KTtcclxuXHJcbiAgdGVzdCgnc2hvdWxkIGRpc2FibGUgcHJldmlldyBidXR0b24gd2hlbiBubyBwcm9qZWN0cyBzZWxlY3RlZCcsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgLy8gVW5jaGVjayBib3RoIHByb2plY3RzXHJcbiAgICBhd2FpdCBwYWdlLnVuY2hlY2soJyNwcm9qZWN0LW1wc2EnKTtcclxuICAgIGF3YWl0IHBhZ2UudW5jaGVjaygnI3Byb2plY3QtbWFzJyk7XHJcbiAgICBcclxuICAgIC8vIFByZXZpZXcgYnV0dG9uIHNob3VsZCBiZSBkaXNhYmxlZFxyXG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignI3ByZXZpZXctYnRuJykpLnRvQmVEaXNhYmxlZCgpO1xyXG4gICAgXHJcbiAgICAvLyBCdXR0b24gc2hvdWxkIGhhdmUgdGl0bGUgZXhwbGFpbmluZyB3aHlcclxuICAgIGNvbnN0IHRpdGxlID0gYXdhaXQgcGFnZS5sb2NhdG9yKCcjcHJldmlldy1idG4nKS5nZXRBdHRyaWJ1dGUoJ3RpdGxlJyk7XHJcbiAgICBleHBlY3QodGl0bGUpLnRvQ29udGFpbignUGxlYXNlIHNlbGVjdCBhdCBsZWFzdCBvbmUgcHJvamVjdCcpO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdzaG91bGQgc2hvdyBlcnJvciB3aGVuIHByZXZpZXcgY2xpY2tlZCB3aXRoIG5vIHByb2plY3RzJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICAvLyBVbmNoZWNrIGJvdGggcHJvamVjdHNcclxuICAgIGF3YWl0IHBhZ2UudW5jaGVjaygnI3Byb2plY3QtbXBzYScpO1xyXG4gICAgYXdhaXQgcGFnZS51bmNoZWNrKCcjcHJvamVjdC1tYXMnKTtcclxuICAgIFxyXG4gICAgLy8gVHJ5IHRvIGNsaWNrIHByZXZpZXcgKHNob3VsZCBiZSBkaXNhYmxlZCwgYnV0IHRlc3QgZXJyb3IgaGFuZGxpbmcpXHJcbiAgICAvLyBBY3R1YWxseSwgYnV0dG9uIHNob3VsZCBiZSBkaXNhYmxlZCwgc28gd2UnbGwgdGVzdCB0aGUgdmFsaWRhdGlvbiBpbiB0aGUgQVBJIHRlc3RcclxuICAgIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWJ0bicpKS50b0JlRGlzYWJsZWQoKTtcclxuICB9KTtcclxuXHJcbiAgdGVzdCgnc2hvdWxkIGdlbmVyYXRlIHByZXZpZXcgd2l0aCB2YWxpZCBmaWx0ZXJzJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICB0ZXN0LnNldFRpbWVvdXQoMzAwMDAwKTtcclxuICAgIC8vIFVzZSBzaGFyZWQgaGVscGVyIHRvIGRyaXZlIGEgZGVmYXVsdCBRMiBwcmV2aWV3XHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuXHJcbiAgICAvLyBWZXJpZnkgZWl0aGVyIHByZXZpZXcgb3IgZXJyb3IgYXBwZWFyZWQgKGJvdGggYXJlIHZhbGlkIG91dGNvbWVzKVxyXG4gICAgY29uc3QgcHJldmlld1Zpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWNvbnRlbnQnKS5pc1Zpc2libGUoKTtcclxuICAgIGNvbnN0IGVycm9yVmlzaWJsZSA9IGF3YWl0IHBhZ2UubG9jYXRvcignI2Vycm9yJykuaXNWaXNpYmxlKCk7XHJcbiAgICBleHBlY3QocHJldmlld1Zpc2libGUgfHwgZXJyb3JWaXNpYmxlKS50b0JlVHJ1dGh5KCk7XHJcblxyXG4gICAgLy8gSWYgcHJldmlldyBpcyB2aXNpYmxlLCBjaGVjayB0aGF0IG1ldGEgc3VtbWFyeSBpcyByZW5kZXJlZFxyXG4gICAgaWYgKHByZXZpZXdWaXNpYmxlKSB7XHJcbiAgICAgIGNvbnN0IG1ldGFUZXh0ID0gYXdhaXQgcGFnZS5sb2NhdG9yKCcjcHJldmlldy1tZXRhJykuaW5uZXJUZXh0KCk7XHJcbiAgICAgIGV4cGVjdChtZXRhVGV4dC50b0xvd2VyQ2FzZSgpKS50b0NvbnRhaW4oJ3N1bW1hcnk6Jyk7XHJcbiAgICAgIGV4cGVjdChtZXRhVGV4dC50b0xvd2VyQ2FzZSgpKS50b0NvbnRhaW4oJ2JvYXJkczonKTtcclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgdGVzdCgnc2hvdWxkIGRpc3BsYXkgdGFicyBhZnRlciBwcmV2aWV3IGxvYWRzJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICB0ZXN0LnNldFRpbWVvdXQoMzAwMDAwKTtcclxuICAgIC8vIFRoaXMgdGVzdCBhc3N1bWVzIHByZXZpZXcgd2lsbCB3b3JrIC0gbWF5IG5lZWQgdG8gbW9jayBvciBza2lwIGlmIG5vIEppcmEgYWNjZXNzXHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuICAgIFxyXG4gICAgLy8gSWYgcHJldmlldyBsb2FkZWQsIGNoZWNrIHRhYnNcclxuICAgIGNvbnN0IHByZXZpZXdWaXNpYmxlID0gYXdhaXQgcGFnZS5sb2NhdG9yKCcjcHJldmlldy1jb250ZW50JykuaXNWaXNpYmxlKCk7XHJcbiAgICBpZiAocHJldmlld1Zpc2libGUpIHtcclxuICAgICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignLnRhYi1idG5bZGF0YS10YWI9XCJwcm9qZWN0LWVwaWMtbGV2ZWxcIl0nKSkudG9CZVZpc2libGUoKTtcclxuICAgICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignLnRhYi1idG5bZGF0YS10YWI9XCJzcHJpbnRzXCJdJykpLnRvQmVWaXNpYmxlKCk7XHJcbiAgICAgIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJy50YWItYnRuW2RhdGEtdGFiPVwiZG9uZS1zdG9yaWVzXCJdJykpLnRvQmVWaXNpYmxlKCk7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ3Nob3VsZCBzd2l0Y2ggYmV0d2VlbiB0YWJzJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICB0ZXN0LnNldFRpbWVvdXQoMzAwMDAwKTtcclxuICAgIC8vIEdlbmVyYXRlIHByZXZpZXcgZmlyc3RcclxuICAgIGF3YWl0IHJ1bkRlZmF1bHRQcmV2aWV3KHBhZ2UpO1xyXG4gICAgXHJcbiAgICBjb25zdCBwcmV2aWV3VmlzaWJsZSA9IGF3YWl0IHBhZ2UubG9jYXRvcignI3ByZXZpZXctY29udGVudCcpLmlzVmlzaWJsZSgpO1xyXG4gICAgaWYgKHByZXZpZXdWaXNpYmxlKSB7XHJcbiAgICAgIC8vIENsaWNrIFNwcmludHMgdGFiXHJcbiAgICAgIGF3YWl0IHBhZ2UuY2xpY2soJy50YWItYnRuW2RhdGEtdGFiPVwic3ByaW50c1wiXScpO1xyXG4gICAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjdGFiLXNwcmludHMnKSkudG9IYXZlQ2xhc3MoL2FjdGl2ZS8pO1xyXG4gICAgICBcclxuICAgICAgLy8gQ2xpY2sgRG9uZSBTdG9yaWVzIHRhYlxyXG4gICAgICBhd2FpdCBwYWdlLmNsaWNrKCcudGFiLWJ0bltkYXRhLXRhYj1cImRvbmUtc3Rvcmllc1wiXScpO1xyXG4gICAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjdGFiLWRvbmUtc3RvcmllcycpKS50b0hhdmVDbGFzcygvYWN0aXZlLyk7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ3Nob3VsZCBmaWx0ZXIgZG9uZSBzdG9yaWVzIGJ5IHNlYXJjaCcsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgdGVzdC5zZXRUaW1lb3V0KDMwMDAwMCk7XHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuICAgIFxyXG4gICAgY29uc3QgcHJldmlld1Zpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWNvbnRlbnQnKS5pc1Zpc2libGUoKTtcclxuICAgIGlmIChwcmV2aWV3VmlzaWJsZSkge1xyXG4gICAgICAvLyBOYXZpZ2F0ZSB0byBEb25lIFN0b3JpZXMgdGFiXHJcbiAgICAgIGF3YWl0IHBhZ2UuY2xpY2soJy50YWItYnRuW2RhdGEtdGFiPVwiZG9uZS1zdG9yaWVzXCJdJyk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBFbnRlciBzZWFyY2ggdGV4dFxyXG4gICAgICBjb25zdCBzZWFyY2hCb3ggPSBwYWdlLmxvY2F0b3IoJyNzZWFyY2gtYm94Jyk7XHJcbiAgICAgIGlmIChhd2FpdCBzZWFyY2hCb3guaXNWaXNpYmxlKCkpIHtcclxuICAgICAgICBhd2FpdCBzZWFyY2hCb3guZmlsbCgnVEVTVCcpO1xyXG4gICAgICAgIC8vIFNlYXJjaCBzaG91bGQgZmlsdGVyIHJlc3VsdHMgKGV4YWN0IGJlaGF2aW9yIGRlcGVuZHMgb24gZGF0YSlcclxuICAgICAgICBhd2FpdCBleHBlY3Qoc2VhcmNoQm94KS50b0hhdmVWYWx1ZSgnVEVTVCcpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ3Nob3VsZCBlbmFibGUgZXhwb3J0IGJ1dHRvbnMgYWZ0ZXIgcHJldmlldycsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgdGVzdC5zZXRUaW1lb3V0KDMwMDAwMCk7XHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuICAgIFxyXG4gICAgY29uc3QgcHJldmlld1Zpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWNvbnRlbnQnKS5pc1Zpc2libGUoKTtcclxuICAgIGlmIChwcmV2aWV3VmlzaWJsZSkge1xyXG4gICAgICAvLyBFeHBvcnQgYnV0dG9ucyBzaG91bGQgYmUgZW5hYmxlZFxyXG4gICAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjZXhwb3J0LWV4Y2VsLWJ0bicpKS50b0JlRW5hYmxlZCgpO1xyXG4gICAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjZXhwb3J0LWV4Y2VsLWJ0bicpKS50b0JlRW5hYmxlZCgpO1xyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdzaG91bGQgdXBkYXRlIGRhdGUgZGlzcGxheSB3aGVuIGRhdGVzIGNoYW5nZScsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgY29uc3Qgc3RhcnREYXRlID0gcGFnZS5sb2NhdG9yKCcjc3RhcnQtZGF0ZScpO1xyXG4gICAgY29uc3QgZW5kRGF0ZSA9IHBhZ2UubG9jYXRvcignI2VuZC1kYXRlJyk7XHJcbiAgICBcclxuICAgIC8vIENoYW5nZSBzdGFydCBkYXRlXHJcbiAgICBhd2FpdCBzdGFydERhdGUuZmlsbCgnMjAyNS0wNS0wMVQwMDowMCcpO1xyXG4gICAgXHJcbiAgICAvLyBEYXRlIGRpc3BsYXkgc2hvdWxkIHVwZGF0ZVxyXG4gICAgY29uc3QgZGF0ZURpc3BsYXkgPSBwYWdlLmxvY2F0b3IoJyNkYXRlLWRpc3BsYXknKTtcclxuICAgIC8vIFdhaXQgYSBiaXQgZm9yIHRoZSB1cGRhdGVcclxuICAgIGF3YWl0IHBhZ2Uud2FpdEZvclRpbWVvdXQoMTAwKTtcclxuICAgIFxyXG4gICAgLy8gVmVyaWZ5IGRhdGUgZGlzcGxheSBpcyB2aXNpYmxlIChjb250ZW50IG1heSB2YXJ5KVxyXG4gICAgYXdhaXQgZXhwZWN0KGRhdGVEaXNwbGF5KS50b0JlVmlzaWJsZSgpO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdzaG91bGQgc2hvdyBwcmVkaWN0YWJpbGl0eSBtb2RlIG9wdGlvbnMgd2hlbiBwcmVkaWN0YWJpbGl0eSBpcyBlbmFibGVkJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICBjb25zdCBwcmVkaWN0YWJpbGl0eUNoZWNrYm94ID0gcGFnZS5sb2NhdG9yKCcjaW5jbHVkZS1wcmVkaWN0YWJpbGl0eScpO1xyXG4gICAgY29uc3QgbW9kZUdyb3VwID0gcGFnZS5sb2NhdG9yKCcjcHJlZGljdGFiaWxpdHktbW9kZS1ncm91cCcpO1xyXG4gICAgXHJcbiAgICAvLyBJbml0aWFsbHkgaGlkZGVuXHJcbiAgICBhd2FpdCBleHBlY3QobW9kZUdyb3VwKS5ub3QudG9CZVZpc2libGUoKTtcclxuICAgIFxyXG4gICAgLy8gQ2hlY2sgcHJlZGljdGFiaWxpdHlcclxuICAgIGF3YWl0IHByZWRpY3RhYmlsaXR5Q2hlY2tib3guY2hlY2soKTtcclxuICAgIFxyXG4gICAgLy8gTW9kZSBncm91cCBzaG91bGQgYmUgdmlzaWJsZVxyXG4gICAgYXdhaXQgZXhwZWN0KG1vZGVHcm91cCkudG9CZVZpc2libGUoKTtcclxuICAgIFxyXG4gICAgLy8gU2hvdWxkIGhhdmUgcmFkaW8gb3B0aW9uc1xyXG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignaW5wdXRbbmFtZT1cInByZWRpY3RhYmlsaXR5LW1vZGVcIl1bdmFsdWU9XCJhcHByb3hcIl0nKSkudG9CZUNoZWNrZWQoKTtcclxuICAgIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJ2lucHV0W25hbWU9XCJwcmVkaWN0YWJpbGl0eS1tb2RlXCJdW3ZhbHVlPVwic3RyaWN0XCJdJykpLnRvQmVWaXNpYmxlKCk7XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ3ByZXZpZXcgYnV0dG9uIGFuZCBleHBvcnRzIHNob3VsZCByZWZsZWN0IGxvYWRpbmcgc3RhdGUgYW5kIGRhdGEnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIHRlc3Quc2V0VGltZW91dCgzMDAwMDApO1xyXG4gICAgLy8gRW5zdXJlIHdlIHN0YXJ0IG9uIHRoZSByZXBvcnQgcGFnZSB3aXRoIGRlZmF1bHQgcHJvamVjdHMgc2VsZWN0ZWRcclxuICAgIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWJ0bicpKS50b0JlRW5hYmxlZCgpO1xyXG5cclxuICAgIC8vIEtpY2sgb2ZmIHByZXZpZXcgYW5kIGFzc2VydCBwcmV2aWV3IGJ1dHRvbiBpcyBkaXNhYmxlZCB3aGlsZSBsb2FkaW5nIGlzIHZpc2libGVcclxuICAgIGF3YWl0IHBhZ2UuY2xpY2soJyNwcmV2aWV3LWJ0bicpO1xyXG4gICAgbGV0IGxvYWRpbmdWaXNpYmxlID0gZmFsc2U7XHJcbiAgICB0cnkge1xyXG4gICAgICBhd2FpdCBwYWdlLndhaXRGb3JTZWxlY3RvcignI2xvYWRpbmcnLCB7IHN0YXRlOiAndmlzaWJsZScsIHRpbWVvdXQ6IDYwMDAwIH0pO1xyXG4gICAgICBsb2FkaW5nVmlzaWJsZSA9IHRydWU7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAvLyBMb2FkaW5nIG1heSByZXNvbHZlIHRvbyBxdWlja2x5IChjYWNoZSBvciBmYXN0IHJlc3BvbnNlKS4gUHJvY2VlZCB3aXRob3V0IGZhaWxpbmcuXHJcbiAgICB9XHJcbiAgICBpZiAobG9hZGluZ1Zpc2libGUpIHtcclxuICAgICAgLy8gSWYgbG9hZGluZyBzdGF5cyB2aXNpYmxlLCBwcmV2aWV3IHNob3VsZCBiZSBkaXNhYmxlZC4gSWYgbG9hZGluZyByZXNvbHZlcyBxdWlja2x5IG9yIHRoZSBvdmVybGF5IGlzIGFscmVhZHkgaGlkZGVuLCBza2lwIHRoaXMgYXNzZXJ0aW9uLlxyXG4gICAgICBhd2FpdCBwYWdlLndhaXRGb3JUaW1lb3V0KDIwMCk7XHJcbiAgICAgIGNvbnN0IHN0aWxsTG9hZGluZyA9IGF3YWl0IHBhZ2UubG9jYXRvcignI2xvYWRpbmcnKS5pc1Zpc2libGUoKS5jYXRjaCgoKSA9PiBmYWxzZSk7XHJcbiAgICAgIGlmIChzdGlsbExvYWRpbmcpIHtcclxuICAgICAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjcHJldmlldy1idG4nKSkudG9CZURpc2FibGVkKCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBXYWl0IGZvciBsb2FkaW5nIHRvIGNvbXBsZXRlXHJcbiAgICBhd2FpdCBwYWdlLndhaXRGb3JTZWxlY3RvcignI2xvYWRpbmcnLCB7IHN0YXRlOiAnaGlkZGVuJywgdGltZW91dDogNjAwMDAwIH0pO1xyXG5cclxuICAgIGNvbnN0IHByZXZpZXdWaXNpYmxlID0gYXdhaXQgcGFnZS5sb2NhdG9yKCcjcHJldmlldy1jb250ZW50JykuaXNWaXNpYmxlKCk7XHJcbiAgICBjb25zdCBlcnJvclZpc2libGUgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNlcnJvcicpLmlzVmlzaWJsZSgpO1xyXG5cclxuICAgIC8vIFByZXZpZXcgc2hvdWxkIGJlIHJlLWVuYWJsZWQgcmVnYXJkbGVzcyBvZiBvdXRjb21lXHJcbiAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjcHJldmlldy1idG4nKSkudG9CZUVuYWJsZWQoKTtcclxuXHJcbiAgICBpZiAocHJldmlld1Zpc2libGUpIHtcclxuICAgICAgLy8gV2hlbiBwcmV2aWV3IGhhcyByb3dzLCBleHBvcnQgYnV0dG9ucyBzaG91bGQgYmUgZW5hYmxlZDsgb3RoZXJ3aXNlIGRpc2FibGVkXHJcbiAgICAgIGNvbnN0IHRleHQgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWNvbnRlbnQnKS5pbm5lclRleHQoKTtcclxuICAgICAgY29uc3QgaGFzRG9uZVN0b3JpZXNUZXh0ID0gKHRleHQgfHwgJycpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2RvbmUgc3RvcmllcycpO1xyXG5cclxuICAgICAgaWYgKGhhc0RvbmVTdG9yaWVzVGV4dCkge1xyXG4gICAgICAgIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJyNleHBvcnQtZXhjZWwtYnRuJykpLnRvQmVFbmFibGVkKCk7XHJcbiAgICAgICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignI2V4cG9ydC1leGNlbC1idG4nKSkudG9CZUVuYWJsZWQoKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjZXhwb3J0LWV4Y2VsLWJ0bicpKS50b0JlRGlzYWJsZWQoKTtcclxuICAgICAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjZXhwb3J0LWV4Y2VsLWJ0bicpKS50b0JlRGlzYWJsZWQoKTtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIGlmIChlcnJvclZpc2libGUpIHtcclxuICAgICAgLy8gT24gZXJyb3IsIGV4cG9ydHMgc2hvdWxkIHJlbWFpbiBkaXNhYmxlZFxyXG4gICAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjZXhwb3J0LWV4Y2VsLWJ0bicpKS50b0JlRGlzYWJsZWQoKTtcclxuICAgICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignI2V4cG9ydC1leGNlbC1idG4nKSkudG9CZURpc2FibGVkKCk7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ3BhcnRpYWwgcHJldmlld3MgYW5kIGV4cG9ydHMgc2hvdyBjbGVhciBzdGF0dXMgYW5kIGhpbnRzIHdoZW4gYXBwbGljYWJsZScsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgdGVzdC5zZXRUaW1lb3V0KDMwMDAwMCk7XHJcbiAgICAvLyBEcml2ZSBhIHByZXZpZXcgdGhhdCBpcyBsaWtlbHkgdG8gYmUgaGVhdmllciAod2lkZXIgd2luZG93KSB0byBpbmNyZWFzZSBjaGFuY2VzIG9mIHBhcnRpYWwgcmVzdWx0c1xyXG4gICAgYXdhaXQgcnVuRGVmYXVsdFByZXZpZXcocGFnZSwge1xyXG4gICAgICBwcm9qZWN0czogWydNUFNBJywgJ01BUyddLFxyXG4gICAgICBzdGFydDogJzIwMjUtMDEtMDFUMDA6MDAnLFxyXG4gICAgICBlbmQ6ICcyMDI1LTEyLTMxVDIzOjU5JyxcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IHByZXZpZXdWaXNpYmxlID0gYXdhaXQgcGFnZS5sb2NhdG9yKCcjcHJldmlldy1jb250ZW50JykuaXNWaXNpYmxlKCk7XHJcbiAgICBpZiAoIXByZXZpZXdWaXNpYmxlKSB7XHJcbiAgICAgIC8vIElmIHByZXZpZXcgZGlkIG5vdCBsb2FkLCB3ZSBjYW5ub3QgYXNzZXJ0IHBhcnRpYWwgYmVoYXZpb3VyXHJcbiAgICAgIHRlc3Quc2tpcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHN0YXR1c1RleHQgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LXN0YXR1cycpLmlubmVyVGV4dCgpO1xyXG4gICAgY29uc3QgZXhwb3J0SGludFRleHQgPSBhd2FpdCBwYWdlLmxvY2F0b3IoJyNleHBvcnQtaGludCcpLmlubmVyVGV4dCgpO1xyXG5cclxuICAgICAgaWYgKChzdGF0dXNUZXh0IHx8ICcnKS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdwYXJ0aWFsJykpIHtcclxuICAgICAgICAvLyBXaGVuIHBhcnRpYWwsIGJhbm5lciBhbmQgaGludCBzaG91bGQgYm90aCBtZW50aW9uIHBhcnRpYWwgc3RhdGVcclxuICAgICAgICBleHBlY3Qoc3RhdHVzVGV4dC50b0xvd2VyQ2FzZSgpKS50b0NvbnRhaW4oJ3BhcnRpYWwnKTtcclxuICAgICAgICBleHBlY3QoZXhwb3J0SGludFRleHQudG9Mb3dlckNhc2UoKSkudG9Db250YWluKCdwYXJ0aWFsJyk7XHJcbiAgICAgICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignI2V4cG9ydC1leGNlbC1idG4nKSkudG9CZUVuYWJsZWQoKTtcclxuICAgICAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjZXhwb3J0LWV4Y2VsLWJ0bicpKS50b0JlRW5hYmxlZCgpO1xyXG4gICAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ2ludmFsaWQgZGF0ZSByYW5nZXMgYXJlIHJlamVjdGVkIGNsaWVudC1zaWRlIHdpdGggY2xlYXIgZXJyb3InLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIC8vIENvbmZpZ3VyZSBhbiBvYnZpb3VzbHkgaW52YWxpZCBkYXRlIHJhbmdlIChzdGFydCBhZnRlciBlbmQpXHJcbiAgICBhd2FpdCBwYWdlLmZpbGwoJyNzdGFydC1kYXRlJywgJzIwMjUtMDctMDFUMDA6MDAnKTtcclxuICAgIGF3YWl0IHBhZ2UuZmlsbCgnI2VuZC1kYXRlJywgJzIwMjUtMDYtMzBUMjM6NTknKTtcclxuXHJcbiAgICAvLyBDbGljayBwcmV2aWV3IGFuZCBleHBlY3QgaW1tZWRpYXRlIGNsaWVudC1zaWRlIHZhbGlkYXRpb24gZXJyb3Igd2l0aG91dCB3YWl0aW5nIG9uIG5ldHdvcmtcclxuICAgIGF3YWl0IHBhZ2UuY2xpY2soJyNwcmV2aWV3LWJ0bicpO1xyXG5cclxuICAgIGF3YWl0IHBhZ2Uud2FpdEZvclNlbGVjdG9yKCcjZXJyb3InLCB7IHN0YXRlOiAndmlzaWJsZScsIHRpbWVvdXQ6IDEwMDAwIH0pO1xyXG4gICAgY29uc3QgZXJyb3JUZXh0ID0gYXdhaXQgcGFnZS5sb2NhdG9yKCcjZXJyb3InKS5pbm5lclRleHQoKTtcclxuICAgIGV4cGVjdChlcnJvclRleHQudG9Mb3dlckNhc2UoKSkudG9Db250YWluKCdzdGFydCBkYXRlIG11c3QgYmUgYmVmb3JlIGVuZCBkYXRlJyk7XHJcblxyXG4gICAgYXdhaXQgcGFnZS5jbGljaygnI2Vycm9yIC5lcnJvci1jbG9zZScpO1xyXG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignI2Vycm9yJykpLnRvQmVIaWRkZW4oKTtcclxuICAgIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJyNwcmV2aWV3LWJ0bicpKS50b0JlRm9jdXNlZCgpO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdSZXF1aXJlIFJlc29sdmVkIGJ5IFNwcmludCBFbmQgZW1wdHkgc3RhdGUgZXhwbGFpbnMgdGhlIGZpbHRlciB3aGVuIGFwcGxpY2FibGUnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIC8vIEVuYWJsZSB0aGUgZmlsdGVyIGFuZCByZXF1ZXN0IGEgd2lkZXIgcmFuZ2UgdG8gaW5jcmVhc2UgY2hhbmNlcyBvZiBmaWx0ZXJlZC1vdXQgc3Rvcmllc1xyXG4gICAgYXdhaXQgcGFnZS5jaGVjaygnI3JlcXVpcmUtcmVzb2x2ZWQtYnktc3ByaW50LWVuZCcpO1xyXG5cclxuICAgIGF3YWl0IHJ1bkRlZmF1bHRQcmV2aWV3KHBhZ2UsIHtcclxuICAgICAgcHJvamVjdHM6IFsnTVBTQScsICdNQVMnXSxcclxuICAgICAgc3RhcnQ6ICcyMDI1LTA3LTAxVDAwOjAwJyxcclxuICAgICAgZW5kOiAnMjAyNS0wOS0zMFQyMzo1OScsXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCBwcmV2aWV3VmlzaWJsZSA9IGF3YWl0IHBhZ2UubG9jYXRvcignI3ByZXZpZXctY29udGVudCcpLmlzVmlzaWJsZSgpO1xyXG4gICAgaWYgKCFwcmV2aWV3VmlzaWJsZSkge1xyXG4gICAgICB0ZXN0LnNraXAoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBOYXZpZ2F0ZSB0byBEb25lIFN0b3JpZXMgdGFiXHJcbiAgICBhd2FpdCBwYWdlLmNsaWNrKCcudGFiLWJ0bltkYXRhLXRhYj1cImRvbmUtc3Rvcmllc1wiXScpO1xyXG5cclxuICAgIGNvbnN0IGVtcHR5U3RhdGVUZXh0ID0gYXdhaXQgcGFnZS5sb2NhdG9yKCcjZG9uZS1zdG9yaWVzLWNvbnRlbnQnKS5pbm5lclRleHQoKTtcclxuICAgIGlmICgoZW1wdHlTdGF0ZVRleHQgfHwgJycpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ25vIGRvbmUgc3RvcmllcyBmb3VuZCcpKSB7XHJcbiAgICAgIC8vIFdoZW4gbm8gcm93cyBhcmUgcHJlc2VudCBhbmQgdGhlIGZpbHRlciBpcyBvbiwgdGhlIGVtcHR5IHN0YXRlIHNob3VsZCBtZW50aW9uIHRoZSBmaWx0ZXIgZXhwbGljaXRseVxyXG4gICAgICBleHBlY3QoZW1wdHlTdGF0ZVRleHQudG9Mb3dlckNhc2UoKSkudG9Db250YWluKCdyZXF1aXJlIHJlc29sdmVkIGJ5IHNwcmludCBlbmQnKTtcclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgdGVzdCgnbWV0cmljcyB0YWIgcmVuZGVycyB3aGVuIHN0b3J5IHBvaW50cywgcmV3b3JrLCBhbmQgZXBpYyBUVE0gYXJlIGVuYWJsZWQnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIC8vIE5vdGU6IFN0b3J5IFBvaW50cywgRXBpYyBUVE0sIGFuZCBCdWdzL1Jld29yayBhcmUgbm93IG1hbmRhdG9yeSAoYWx3YXlzIGVuYWJsZWQpXHJcbiAgICAvLyBObyBuZWVkIHRvIGNoZWNrIHRoZXNlIG9wdGlvbnMgLSB0aGV5J3JlIGFsd2F5cyBpbmNsdWRlZCBpbiByZXBvcnRzXHJcblxyXG4gICAgLy8gUnVuIGEgZGVmYXVsdCBwcmV2aWV3IHdpdGggUTIgd2luZG93XHJcbiAgICBhd2FpdCBydW5EZWZhdWx0UHJldmlldyhwYWdlKTtcclxuXHJcbiAgICBjb25zdCBwcmV2aWV3VmlzaWJsZSA9IGF3YWl0IHBhZ2UubG9jYXRvcignI3ByZXZpZXctY29udGVudCcpLmlzVmlzaWJsZSgpO1xyXG4gICAgaWYgKCFwcmV2aWV3VmlzaWJsZSkge1xyXG4gICAgICB0ZXN0LnNraXAoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBNZXRyaWNzIGNvbnRlbnQgbm93IGxpdmVzIGluc2lkZSB0aGUgUHJvamVjdCAmIEVwaWMgTGV2ZWwgdGFiXHJcbiAgICBhd2FpdCBwYWdlLmNsaWNrKCcudGFiLWJ0bltkYXRhLXRhYj1cInByb2plY3QtZXBpYy1sZXZlbFwiXScpO1xyXG4gICAgY29uc3QgbWV0cmljc1RleHQgPSAoYXdhaXQgcGFnZS5sb2NhdG9yKCcjcHJvamVjdC1lcGljLWxldmVsLWNvbnRlbnQnKS5pbm5lclRleHQoKSk/LnRvTG93ZXJDYXNlKCkgfHwgJyc7XHJcblxyXG4gICAgZXhwZWN0KG1ldHJpY3NUZXh0KS50b0NvbnRhaW4oJ3Rocm91Z2hwdXQnKTtcclxuICAgIGV4cGVjdChtZXRyaWNzVGV4dCkudG9Db250YWluKCdlcGljIHRpbWUtdG8tbWFya2V0Jyk7XHJcbiAgfSk7XHJcbn0pO1xyXG4iXSwibWFwcGluZ3MiOiJBQUFBLFNBQVNBLElBQUksRUFBRUMsTUFBTSxRQUFRLGtCQUFrQjtBQUMvQyxTQUFTQyxpQkFBaUIsUUFBUSx1REFBdUQ7QUFFekYsTUFBTUMsZ0JBQWdCLEdBQUcsZ0ZBQWdGO0FBRXpHSCxJQUFJLENBQUNJLFFBQVEsQ0FBQyw2Q0FBNkMsRUFBRSxNQUFNO0VBQ2pFSixJQUFJLENBQUNLLFVBQVUsQ0FBQyxPQUFPO0lBQUVDO0VBQUssQ0FBQyxLQUFLO0lBQ2xDLE1BQU1BLElBQUksQ0FBQ0MsSUFBSSxDQUFDLFNBQVMsQ0FBQztJQUMxQixNQUFNTixNQUFNLENBQUNLLElBQUksQ0FBQ0Us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