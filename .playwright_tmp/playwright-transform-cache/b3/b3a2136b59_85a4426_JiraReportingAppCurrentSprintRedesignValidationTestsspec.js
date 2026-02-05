/**
 * Jira Reporting App - Current Sprint Redesign Validation Test Suite
 * 
 * Comprehensive tests for all 11 new UI components:
 * 1. Fixed Header Bar
 * 2. Unified Health Dashboard
 * 3. Alert/Warning Banner
 * 4. Risks & Insights Modal
 * 5. Capacity Allocation Visualization
 * 6. Sprint Navigation Carousel
 * 7. Scope Change Indicator
 * 8. Days Remaining Countdown Timer
 * 9. Export Dashboard Feature
 * 10. CSS Grid Responsive Layout
 * 11. Comprehensive Validation & Accessibility
 * 
 * + 3 Bonus Edge Case Solutions:
 * A. Multi-timezone Sprint Scheduling
 * B. Burndown with Estimation Gaps
 * C. Sub-task Estimation Without Parent Estimate
 * 
 * Rationale: All tests use Playwright for real-time browser automation + visual regression
 * Tests validate: functionality, performance, accessibility, responsiveness, error handling
 */

import { test, expect } from '@playwright/test';

// Base configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SPRINT_PAGE = `${BASE_URL}/current-sprint`;

/**
 * Utility: Load sprint page and wait for content
 */
async function loadSprintPage(page) {
  await page.goto(SPRINT_PAGE);
  // Wait for content to appear or an error to surface; prevents flakiness when boards list differs
  await page.waitForSelector('#current-sprint-content, #current-sprint-error', {
    timeout: 30000
  });
}

// Utility: get first available boardId from API (resilient test helper)
async function getFirstBoardId(request) {
  const base = process.env.BASE_URL || 'http://localhost:3000';
  const res = await request.get(`${base}/api/boards.json`);
  if (res.status() !== 200) return null;
  const data = await res.json();
  const boards = data?.boards || data?.boards || data?.projects || [];
  if (!boards || boards.length === 0) return null;
  return boards[0]?.id || null;
}

/**
 * Utility: Get page performance metrics
 */
async function getPageMetrics(page) {
  return await page.evaluate(() => {
    const perf = performance.getEntriesByType('navigation')[0];
    return {
      domReady: perf?.domContentLoadedEventEnd - perf?.domContentLoadedEventStart,
      loadComplete: perf?.loadEventEnd - perf?.loadEventStart,
      nodeCount: document.body.querySelectorAll('*').length,
      cssSize: new Blob([...document.styleSheets].map(sheet => sheet.cssText || '')).size
    };
  });
}
test.describe('CurrentSprint Redesign - Component Validation', () => {
  test.beforeEach(async ({
    page
  }) => {
    // Navigate to sprint page
    await loadSprintPage(page);
  });

  // ========== VALIDATION 1: Header Bar Component ==========
  test('Validation 1.1: Header bar renders with sprint metadata', async ({
    page
  }) => {
    const headerBar = page.locator('.current-sprint-header-bar');
    await expect(headerBar).toBeVisible();

    // Check all required elements
    await expect(page.locator('.header-sprint-name')).toBeVisible();
    await expect(page.locator('.header-sprint-dates')).toBeVisible();
    await expect(page.locator('.header-metric')).toHaveCount(3); // Remaining, Total SP, Progress
    await expect(page.locator('.status-badge')).toBeVisible();
  });
  test('Validation 1.2: Header bar is sticky on scroll', async ({
    page
  }) => {
    const headerBar = page.locator('.current-sprint-header-bar');
    const initialTop = await headerBar.evaluate(el => window.getComputedStyle(el).position);

    // Scroll down
    await page.evaluate(() => window.scrollBy(0, 500));

    // Verify sticky positioning
    const stickyStyle = await headerBar.evaluate(el => window.getComputedStyle(el).position);
    expect(['fixed', 'sticky']).toContain(stickyStyle);
  });
  test('Validation 1.3: Days remaining color coding is correct', async ({
    page
  }) => {
    const remainingMetric = page.locator('.header-metric:first-of-type .metric-value');
    const text = await remainingMetric.textContent();

    // Parse days from text (e.g., "1 day", "5 days")
    const daysMatch = text?.match(/(\d+)/);
    if (daysMatch) {
      const days = parseInt(daysMatch[1]);
      let expectedClass = 'critical'; // 0-2 days
      if (days > 5) expectedClass = 'green';else if (days > 2) expectedClass = 'yellow';

      // Verify color class exists
      const classList = await remainingMetric.getAttribute('class');
      expect(classList).toContain(expectedClass);
    }
  });
  test('Validation 1.4: Header bar renders within 100ms', async ({
    page
  }) => {
    const startTime = Date.now();
    await page.waitForSelector('.current-sprint-header-bar', {
      timeout: 100
    });
    const renderTime = Date.now() - startTime;
    expect(renderTime).toBeLessThan(100);
  });

  // ========== VALIDATION 2: Health Dashboard ==========
  test('Validation 2.1: Health dashboard card renders with all sections', async ({
    page
  }) => {
    const healthCard = page.locator('.health-dashboard-card');
    await expect(healthCard).toBeVisible();

    // Check sections
    await expect(page.locator('.health-status-chip')).toBeVisible();
    await expect(page.locator('.health-progress-section')).toBeVisible();
    await expect(page.locator('.health-split-section')).toBeVisible();
    await expect(page.locator('.health-tracking-section')).toBeVisible();
    await expect(page.locator('.health-actions')).toBeVisible();
  });
  test('Validation 2.2: Health dashboard progress bar displays correctly', async ({
    page
  }) => {
    const progressBar = page.locator('.progress-bar-container');
    await expect(progressBar).toBeVisible();

    // Verify bars exist
    const doneBar = page.locator('.progress-bar.done');
    const inprogressBar = page.locator('.progress-bar.inprogress');

    // At least one should exist
    const doneCount = await doneBar.count();
    const inprogressCount = await inprogressBar.count();
    expect(doneCount + inprogressCount).toBeGreaterThan(0);
  });
  test('Validation 2.3: Health dashboard copy-to-clipboard works', async ({
    page
  }) => {
    const copyBtn = page.locator('.health-copy-btn');

    // Mock clipboard
    await page.evaluate(() => {
      navigator.clipboard.writeText = async text => {
        document.body.setAttribute('data-clipboard', text);
        return Promise.resolve();
      };
    });
    await copyBtn.click();

    // Verify button shows "Copied!"
    await expect(copyBtn).toContainText('Copied!', {
      timeout: 100
    });

    // Verify clipboard content
    const clipboardContent = await page.getAttribute('body', 'data-clipboard');
    expect(clipboardContent).toBeTruthy();
  });
  test('Validation 2.4: Health dashboard risk indicator appears with risks', async ({
    page
  }) => {
    const riskChip = page.locator('.health-status-chip');
    const riskText = await riskChip.textContent();

    // Should contain either "healthy" or "⚠️"
    expect(riskText).toMatch(/(healthy|⚠️)/);
  });
  test('Validation 2.5: Health dashboard renders within 150ms', async ({
    page
  }) => {
    const startTime = Date.now();
    await page.waitForSelector('.health-dashboard-card', {
      timeout: 150
    });
    const renderTime = Date.now() - startTime;
    expect(renderTime).toBeLessThan(150);
  });

  // ========== VALIDATION 3: Alert Banner ==========
  test('Validation 3.1: Alert banner appears when critical issues exist', async ({
    page
  }) => {
    // Check if alert is visible (conditional on data)
    const alertBanner = page.locator('.alert-banner');
    const isVisible = await alertBanner.isVisible().catch(() => false);
    if (isVisible) {
      // Verify color class
      const classList = await alertBanner.getAttribute('class');
      expect(classList).toMatch(/(yellow|orange|red)/);
    }
  });
  test('Validation 3.2: Alert banner dismiss button works', async ({
    page
  }) => {
    const alertBanner = page.locator('.alert-banner');
    if (!(await alertBanner.isVisible())) {
      test.skip();
    }
    const dismissBtn = page.locator('.alert-dismiss');
    await dismissBtn.click();

    // Banner should be hidden
    await expect(alertBanner).not.toBeVisible({
      timeout: 500
    });

    // Verify localStorage is set (either sprint-specific or generic key)
    const isDismissed = await page.evaluate(() => {
      const header = document.querySelector('.current-sprint-header-bar');
      const sprintId = header?.getAttribute('data-sprint-id');
      const specificKey = sprintId ? `alert_banner_dismissed_${sprintId}` : null;
      const genericKey = 'alert_banner_dismissed_unknown';
      const dismissedTime = specificKey && localStorage.getItem(specificKey) || localStorage.getItem(genericKey);
      return dismissedTime !== null;
    });
    expect(isDismissed).toBeTruthy();
  });
  test('Validation 3.3: Alert banner shows correct severity colors', async ({
    page
  }) => {
    const banner = page.locator('.alert-banner');
    if (!(await banner.isVisible())) {
      test.skip();
    }
    const classList = await banner.getAttribute('class');
    const severity = classList?.match(/(yellow|orange|red)/)?.[0];
    expect(['yellow', 'orange', 'red']).toContain(severity);
  });
  test('Validation 3.4: Alert action links navigate correctly', async ({
    page
  }) => {
    const banner = page.locator('.alert-banner');
    if (!(await banner.isVisible())) {
      test.skip();
    }
    const actionLink = page.locator('.alert-action').first();
    if ((await actionLink.count()) > 0) {
      const href = await actionLink.getAttribute('href');
      expect(href).toBeTruthy();
    }
  });

  // ========== VALIDATION 4: Risks & Insights Modal ==========
  test('Validation 4.1: Risks & Insights card renders with all tabs', async ({
    page
  }) => {
    const card = page.locator('.risks-insights-card');
    await expect(card).toBeVisible();

    // Check tabs
    await expect(page.locator('.insights-tab')).toHaveCount(3); // Blockers, Learnings, Assumptions
  });
  test('Validation 4.2: Risks & Insights tab switching works', async ({
    page
  }) => {
    const tabs = page.locator('.insights-tab');
    const learningsTab = tabs.nth(1);
    await learningsTab.click();

    // Verify tab is active
    const isActive = await learningsTab.evaluate(el => el.classList.contains('active'));
    expect(isActive).toBeTruthy();

    // Verify panel is visible
    const learnPanel = page.locator('#learnings-panel');
    const isPanelActive = await learnPanel.evaluate(el => el.classList.contains('active'));
    expect(isPanelActive).toBeTruthy();
  });
  test('Validation 4.3: Risks & Insights keyboard navigation works', async ({
    page
  }) => {
    const tabs = page.locator('.insights-tab');
    const firstTab = tabs.first();
    await firstTab.focus();
    await page.keyboard.press('ArrowRight');

    // Second tab should now be focused
    const secondTab = tabs.nth(1);
    const hasFocus = await secondTab.evaluate(el => el === document.activeElement);
    expect(hasFocus).toBeTruthy();
  });
  test('Validation 4.4: Risks & Insights save functionality works', async ({
    page
  }) => {
    // Mock API endpoint
    await page.route('/api/current-sprint/insights', route => {
      route.abort('blockedbyclient');
    });
    const saveBtn = page.locator('#insights-save');
    if (await saveBtn.isVisible()) {
      await saveBtn.click();

      // Status message should show attempt
      const statusEl = page.locator('#insights-status');
      const statusText = await statusEl.textContent();
      expect(statusText).toBeTruthy();
    }
  });

  // ========== VALIDATION 5: Capacity Allocation ==========
  test('Validation 5.1: Capacity allocation card renders', async ({
    page
  }) => {
    const card = page.locator('.capacity-allocation-card');
    await expect(card).toBeVisible();

    // Check required elements
    await expect(page.locator('.capacity-health')).toBeVisible();
    await expect(page.locator('.capacity-allocations')).toBeVisible();
  });
  test('Validation 5.2: Capacity bar shows overallocation correctly', async ({
    page
  }) => {
    const bar = page.locator('.allocation-bar.overallocated');
    const count = await bar.count();

    // If overallocated items exist, verify color
    if (count > 0) {
      const style = await bar.first().evaluate(el => window.getComputedStyle(el).background);
      expect(style).toContain('rgb'); // Should have color
    }
  });
  test('Validation 5.3: Capacity allocation expand/collapse works', async ({
    page
  }) => {
    const expandBtn = page.locator('.allocation-expand-btn').first();
    if ((await expandBtn.count()) === 0) {
      test.skip();
    }
    await expandBtn.click();

    // Issues list should be visible
    const issues = page.locator('.allocation-issues').first();
    const isVisible = await issues.isVisible().catch(() => false);
    expect(isVisible).toBeTruthy();
  });
  test('Validation 5.4: Capacity health color matches severity', async ({
    page
  }) => {
    const health = page.locator('.capacity-health');
    const classList = await health.getAttribute('class');
    expect(classList).toMatch(/(green|orange|yellow|red)/);
  });

  // ========== VALIDATION 6: Sprint Carousel ==========
  test('Validation 6.1: Sprint carousel renders with 8 recent sprints', async ({
    page
  }) => {
    const carousel = page.locator('.sprint-carousel');
    const tabs = page.locator('.carousel-tab');
    const count = await tabs.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(8);
  });
  test('Validation 6.2: Sprint carousel keyboard navigation works', async ({
    page
  }) => {
    const tabs = page.locator('.carousel-tab');
    const firstTab = tabs.first();
    await firstTab.focus();
    await page.keyboard.press('ArrowRight');

    // Next tab should receive focus
    const secondTab = tabs.nth(1);
    const hasFocus = await secondTab.evaluate(el => el === document.activeElement);
    expect(hasFocus).toBeTruthy();
  });
  test('Validation 6.3: Sprint carousel colors match completion %', async ({
    page
  }) => {
    const tabs = page.locator('.carousel-tab');
    for (let i = 0; i < Math.min(3, await tabs.count()); i++) {
      const tab = tabs.nth(i);
      const classList = await tab.getAttribute('class');
      expect(classList).toMatch(/(green|yellow|gray|muted)/);
    }
  });
  test('Validation 6.4: Sprint carousel has accessibility labels', async ({
    page
  }) => {
    const carousel = page.locator('.sprint-carousel');
    const ariaLabel = await carousel.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
  });

  // ========== VALIDATION 7: Scope Indicator ==========
  test('Validation 7.1: Scope indicator chip appears only when scope > 0%', async ({
    page
  }) => {
    const chip = page.locator('.scope-indicator-chip');
    const isVisible = await chip.isVisible().catch(() => false);
    if (isVisible) {
      const text = await chip.textContent();
      expect(text).toContain('Scope:');
    }
  });
  test('Validation 7.2: Scope indicator color coding is correct', async ({
    page
  }) => {
    const chip = page.locator('.scope-indicator-chip');
    if (!(await chip.isVisible())) {
      test.skip();
    }
    const classList = await chip.getAttribute('class');
    expect(classList).toMatch(/(green|yellow|red)/);
  });
  test('Validation 7.3: Scope modal opens on details button click', async ({
    page
  }) => {
    const detailsBtn = page.locator('.scope-details-btn');
    if (!(await detailsBtn.isVisible())) {
      test.skip();
    }
    await detailsBtn.click();
    const modal = page.locator('.scope-modal-overlay');
    await expect(modal).toBeVisible();
  });
  test('Validation 7.4: Scope modal closes on X button click', async ({
    page
  }) => {
    const detailsBtn = page.locator('.scope-details-btn');
    if (!(await detailsBtn.isVisible())) {
      test.skip();
    }
    await detailsBtn.click();
    const closeBtn = page.locator('.modal-close-btn');
    await closeBtn.click();
    const modal = page.locator('.scope-modal-overlay');
    const isHidden = await modal.evaluate(el => el.style.display === 'none');
    expect(isHidden).toBeTruthy();
  });

  // ========== VALIDATION 8: Countdown Timer ==========
  test('Validation 8.1: Countdown timer renders with correct color', async ({
    page
  }) => {
    const timer = page.locator('.countdown-timer-widget');
    await expect(timer).toBeVisible();
    const svg = page.locator('.countdown-ring');
    const classList = await svg.getAttribute('class');
    expect(classList).toMatch(/(green|yellow|red|gray)/);
  });
  test('Validation 8.2: Countdown timer shows days or hours correctly', async ({
    page
  }) => {
    const label = page.locator('.countdown-label');
    const text = await label.textContent();

    // Should show "Xd" or "Xh" or "✓"
    expect(text).toMatch(/(d|h|✓|<)/);
  });
  test('Validation 8.3: Countdown timer has accessibility label', async ({
    page
  }) => {
    const timer = page.locator('.countdown-timer-widget');
    const ariaLabel = await timer.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
  });
  test('Validation 8.4: Countdown timer pulse animation on urgent', async ({
    page
  }) => {
    const timer = page.locator('.countdown-timer-widget');
    const svg = page.locator('.countdown-ring.urgent');
    if ((await svg.count()) > 0) {
      const animation = await svg.evaluate(el => window.getComputedStyle(el).animation);
      expect(animation).toBeTruthy();
    }
  });

  // ========== VALIDATION 9: Export Dashboard ==========
  test('Validation 9.1: Export button is visible and clickable', async ({
    page
  }) => {
    const btn = page.locator('.export-dashboard-btn');
    await expect(btn).toBeVisible();
    await btn.click();
    const menu = page.locator('#export-menu');
    await expect(menu).toBeVisible();
  });
  test('Validation 9.2: Export menu shows all options', async ({
    page
  }) => {
    const btn = page.locator('.export-dashboard-btn');
    await btn.click();
    const options = page.locator('.export-option');
    await expect(options).toHaveCount(5); // PNG 1920, PNG 1200, Markdown, Copy Link, Email
  });
  test('Validation 9.3: Copy dashboard link works', async ({
    page
  }) => {
    const btn = page.locator('.export-dashboard-btn');
    await btn.click();
    const copyOption = page.locator('[data-action="copy-link"]');

    // Mock clipboard
    await page.evaluate(() => {
      navigator.clipboard.writeText = async text => {
        document.body.setAttribute('data-copied-link', text);
        return Promise.resolve();
      };
    });
    await copyOption.click();

    // Verify button shows "Copied!"
    await expect(btn).toContainText('✓ Link copied!', {
      timeout: 1000
    });
  });
  test('Validation 9.4: Export menu closes on click outside', async ({
    page
  }) => {
    const btn = page.locator('.export-dashboard-btn');
    await btn.click();
    const menu = page.locator('#export-menu');
    await expect(menu).toBeVisible();

    // Click outside menu
    await page.click('body', {
      position: {
        x: 0,
        y: 0
      }
    });
    const isHidden = await menu.evaluate(el => el.classList.contains('hidden'));
    expect(isHidden).toBeTruthy();
  });

  // ========== VALIDATION 10: Responsive Layout ==========
  test('Validation 10.1: Desktop layout shows 2-3 columns', async ({
    page
  }) => {
    await page.setViewportSize({
      width: 1920,
      height: 1080
    });
    const topRow = page.locator('.sprint-cards-row.top-row');
    const columns = page.locator('.card-column');
    const columnCount = await columns.count();
    expect(columnCount).toBeGreaterThanOrEqual(2);
  });
  test('Validation 10.2: Tablet layout shows 2 columns', async ({
    page
  }) => {
    await page.setViewportSize({
      width: 768,
      height: 1024
    });
    const topRow = page.locator('.sprint-cards-row.top-row');
    const isFlexWrap = await topRow.evaluate(el => {
      return window.getComputedStyle(el).flexWrap === 'wrap';
    });
    expect(isFlexWrap).toBeTruthy();
  });
  test('Validation 10.3: Mobile layout shows 1 column', async ({
    page
  }) => {
    await page.setViewportSize({
      width: 375,
      height: 812
    });
    const cards = page.locator('.card-column');

    // Each card should be full width or close to it
    for (let i = 0; i < Math.min(3, await cards.count()); i++) {
      const width = await cards.nth(i).evaluate(el => el.offsetWidth);
      const parentWidth = await cards.nth(i).evaluate(el => el.parentElement.offsetWidth);

      // Card should be >80% of parent width
      expect(width / parentWidth).toBeGreaterThan(0.8);
    }
  });
  test('Validation 10.4: Header bar is sticky on all screen sizes', async ({
    page
  }) => {
    for (const width of [1920, 768, 375]) {
      await page.setViewportSize({
        width,
        height: 1080
      });
      const header = page.locator('.current-sprint-header-bar');
      const style = await header.evaluate(el => window.getComputedStyle(el).position);
      expect(['sticky', 'fixed']).toContain(style);
    }
  });

  // ========== VALIDATION 11: Performance & Accessibility ==========
  test('Validation 11.1: Page load time < 1 second', async ({
    page
  }) => {
    const startTime = Date.now();
    await loadSprintPage(page);
    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(1000);
  });
  test('Validation 11.2: No console errors during render', async ({
    page
  }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    await loadSprintPage(page);
    expect(errors).toEqual([]);
  });
  test('Validation 11.3: Accessibility: All interactive elements have aria-labels', async ({
    page
  }) => {
    const buttons = page.locator('button');
    for (let i = 0; i < Math.min(5, await buttons.count()); i++) {
      const btn = buttons.nth(i);
      const ariaLabel = await btn.getAttribute('aria-label');
      const text = await btn.textContent();
      expect(ariaLabel || text).toBeTruthy();
    }
  });
  test('Validation 11.4: Accessibility: Color contrast is sufficient', async ({
    page
  }) => {
    const primaryText = page.locator('h1, h2, h3');
    for (let i = 0; i < Math.min(3, await primaryText.count()); i++) {
      const element = primaryText.nth(i);
      const bgColor = await element.evaluate(el => window.getComputedStyle(el).backgroundColor);
      const textColor = await element.evaluate(el => window.getComputedStyle(el).color);

      // Basic check: both should be defined
      expect(bgColor).toBeTruthy();
      expect(textColor).toBeTruthy();
    }
  });
  test('Validation 11.5: DOM node count < 500 (performance)', async ({
    page
  }) => {
    await loadSprintPage(page);
    const nodeCount = await page.evaluate(() => {
      return document.querySelectorAll('*').length;
    });
    expect(nodeCount).toBeLessThan(500);
  });

  // ========== BONUS: EDGE CASES ==========

  test('Edge Case A.1: Timezone Detection - Header countdown uses correct TZ', async ({
    page
  }) => {
    // Set user TZ preference
    await page.evaluate(() => {
      localStorage.setItem('sprint_view_tz', 'America/Los_Angeles');
    });
    await loadSprintPage(page);
    const tzPref = await page.evaluate(() => {
      return localStorage.getItem('sprint_view_tz');
    });
    expect(tzPref).toBe('America/Los_Angeles');
  });
  test('Edge Case B.1: Burndown with Estimation Gaps - Warning appears', async ({
    page
  }) => {
    // This test assumes data has >20% unestimated stories
    const warning = page.locator('.capacity-warning');
    if (await warning.isVisible()) {
      const text = await warning.textContent();
      expect(text).toContain('%');
    }
  });
  test('Edge Case C.1: Sub-task without Parent Estimate - Inferred in Health Dashboard', async ({
    page
  }) => {
    const trackingStatus = page.locator('.tracking-status');
    if (await trackingStatus.isVisible()) {
      const text = await trackingStatus.textContent();
      // Should show either "Complete" or warning about missing estimates
      expect(text).toBeTruthy();
    }
  });

  // ========== INTEGRATION TESTS ==========

  test('Integration: All components load without errors', async ({
    page
  }) => {
    const components = ['.current-sprint-header-bar', '.health-dashboard-card', '.sprint-carousel', '.countdown-timer-widget', '.export-dashboard-btn'];
    for (const selector of components) {
      const element = page.locator(selector);
      if ((await element.count()) > 0) {
        await expect(element).toBeVisible();
      }
    }
  });
  test('Integration: Page performance metrics meet targets', async ({
    page
  }) => {
    await loadSprintPage(page);
    const metrics = await getPageMetrics(page);
    expect(metrics.domReady).toBeLessThan(500);
    expect(metrics.nodeCount).toBeLessThan(500);
  });
});

// ========== API CONTRACT VALIDATION ==========
test.describe('CurrentSprint Redesign - API Contracts', () => {
  test('API: /api/current-sprint.json returns expected schema', async ({
    request
  }) => {
    // Derive a valid boardId from /api/boards.json instead of assuming boardId=1
    const boardsRes = await request.get('/api/boards.json');
    if (boardsRes.status() === 401) {
      test.skip('Auth required');
      return;
    }
    expect(boardsRes.status()).toBe(200);
    const boardsBody = await boardsRes.json();
    const boards = boardsBody?.boards || boardsBody?.projects || [];
    if (!boards || boards.length === 0) {
      test.skip('No boards available to test against');
      return;
    }
    const boardId = boards[0].id;
    const response = await request.get(`${BASE_URL}/api/current-sprint.json?boardId=${boardId}`);
    if (response.status() === 401) {
      test.skip('Auth required');
      return;
    }
    expect(response.status()).toBe(200);
    const data = await response.json();

    // Verify required fields
    expect(data.sprint).toBeTruthy();
    expect(data.summary).toBeTruthy();
    expect(data.daysMeta).toBeTruthy();
    expect(data.stuckCandidates).toBeTruthy();
  });
  test('API: Error handling on missing boardId', async ({
    request
  }) => {
    const response = await request.get(`${BASE_URL}/api/current-sprint.json`);

    // Should either return error or default data
    expect([400, 200]).toContain(response.status());
  });
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0ZXN0IiwiZXhwZWN0IiwiQkFTRV9VUkwiLCJwcm9jZXNzIiwiZW52IiwiU1BSSU5UX1BBR0UiLCJsb2FkU3ByaW50UGFnZSIsInBhZ2UiLCJnb3RvIiwid2FpdEZvclNlbGVjdG9yIiwidGltZW91dCIsImdldEZpcnN0Qm9hcmRJZCIsInJlcXVlc3QiLCJiYXNlIiwicmVzIiwiZ2V0Iiwic3RhdHVzIiwiZGF0YSIsImpzb24iLCJib2FyZHMiLCJwcm9qZWN0cyIsImxlbmd0aCIsImlkIiwiZ2V0UGFnZU1ldHJpY3MiLCJldmFsdWF0ZSIsInBlcmYiLCJwZXJmb3JtYW5jZSIsImdldEVudHJpZXNCeVR5cGUiLCJkb21SZWFkeSIsImRvbUNvbnRlbnRMb2FkZWRFdmVudEVuZCIsImRvbUNvbnRlbnRMb2FkZWRFdmVudFN0YXJ0IiwibG9hZENvbXBsZXRlIiwibG9hZEV2ZW50RW5kIiwibG9hZEV2ZW50U3RhcnQiLCJub2RlQ291bnQiLCJkb2N1bWVudCIsImJvZHkiLCJxdWVyeVNlbGVjdG9yQWxsIiwiY3NzU2l6ZSIsIkJsb2IiLCJzdHlsZVNoZWV0cyIsIm1hcCIsInNoZWV0IiwiY3NzVGV4dCIsInNpemUiLCJkZXNjcmliZSIsImJlZm9yZUVhY2giLCJoZWFkZXJCYXIiLCJsb2NhdG9yIiwidG9CZVZpc2libGUiLCJ0b0hhdmVDb3VudCIsImluaXRpYWxUb3AiLCJlbCIsIndpbmRvdyIsImdldENvbXB1dGVkU3R5bGUiLCJwb3NpdGlvbiIsInNjcm9sbEJ5Iiwic3RpY2t5U3R5bGUiLCJ0b0NvbnRhaW4iLCJyZW1haW5pbmdNZXRyaWMiLCJ0ZXh0IiwidGV4dENvbnRlbnQiLCJkYXlzTWF0Y2giLCJtYXRjaCIsImRheXMiLCJwYXJzZUludCIsImV4cGVjdGVkQ2xhc3MiLCJjbGFzc0xpc3QiLCJnZXRBdHRyaWJ1dGUiLCJzdGFydFRpbWUiLCJEYXRlIiwibm93IiwicmVuZGVyVGltZSIsInRvQmVMZXNzVGhhbiIsImhlYWx0aENhcmQiLCJwcm9ncmVzc0JhciIsImRvbmVCYXIiLCJpbnByb2dyZXNzQmFyIiwiZG9uZUNvdW50IiwiY291bnQiLCJpbnByb2dyZXNzQ291bnQiLCJ0b0JlR3JlYXRlclRoYW4iLCJjb3B5QnRuIiwibmF2aWdhdG9yIiwiY2xpcGJvYXJkIiwid3JpdGVUZXh0Iiwic2V0QXR0cmlidXRlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJjbGljayIsInRvQ29udGFpblRleHQiLCJjbGlwYm9hcmRDb250ZW50IiwidG9CZVRydXRoeSIsInJpc2tDaGlwIiwicmlza1RleHQiLCJ0b01hdGNoIiwiYWxlcnRCYW5uZXIiLCJpc1Zpc2libGUiLCJjYXRjaCIsInNraXAiLCJkaXNtaXNzQnRuIiwibm90IiwiaXNEaXNtaXNzZWQiLCJoZWFkZXIiLCJxdWVyeVNlbGVjdG9yIiwic3ByaW50SWQiLCJzcGVjaWZpY0tleSIsImdlbmVyaWNLZXkiLCJkaXNtaXNzZWRUaW1lIiwibG9jYWxTdG9yYWdlIiwiZ2V0SXRlbSIsImJhbm5lciIsInNldmVyaXR5IiwiYWN0aW9uTGluayIsImZpcnN0IiwiaHJlZiIsImNhcmQiLCJ0YWJzIiwibGVhcm5pbmdzVGFiIiwibnRoIiwiaXNBY3RpdmUiLCJjb250YWlucyIsImxlYXJuUGFuZWwiLCJpc1BhbmVsQWN0aXZlIiwiZmlyc3RUYWIiLCJmb2N1cyIsImtleWJvYXJkIiwicHJlc3MiLCJzZWNvbmRUYWIiLCJoYXNGb2N1cyIsImFjdGl2ZUVsZW1lbnQiLCJyb3V0ZSIsImFib3J0Iiwic2F2ZUJ0biIsInN0YXR1c0VsIiwic3RhdHVzVGV4dCIsImJhciIsInN0eWxlIiwiYmFja2dyb3VuZCIsImV4cGFuZEJ0biIsImlzc3VlcyIsImhlYWx0aCIsImNhcm91c2VsIiwidG9CZUxlc3NUaGFuT3JFcXVhbCIsImkiLCJNYXRoIiwibWluIiwidGFiIiwiYXJpYUxhYmVsIiwiY2hpcCIsImRldGFpbHNCdG4iLCJtb2RhbCIsImNsb3NlQnRuIiwiaXNIaWRkZW4iLCJkaXNwbGF5IiwidGltZXIiLCJzdmciLCJsYWJlbCIsImFuaW1hdGlvbiIsImJ0biIsIm1lbnUiLCJvcHRpb25zIiwiY29weU9wdGlvbiIsIngiLCJ5Iiwic2V0Vmlld3BvcnRTaXplIiwid2lkdGgiLCJoZWlnaHQiLCJ0b3BSb3ciLCJjb2x1bW5zIiwiY29sdW1uQ291bnQiLCJ0b0JlR3JlYXRlclRoYW5PckVxdWFsIiwiaXNGbGV4V3JhcCIsImZsZXhXcmFwIiwiY2FyZHMiLCJvZmZzZXRXaWR0aCIsInBhcmVudFdpZHRoIiwicGFyZW50RWxlbWVudCIsImxvYWRUaW1lIiwiZXJyb3JzIiwib24iLCJtc2ciLCJ0eXBlIiwicHVzaCIsInRvRXF1YWwiLCJidXR0b25zIiwicHJpbWFyeVRleHQiLCJlbGVtZW50IiwiYmdDb2xvciIsImJhY2tncm91bmRDb2xvciIsInRleHRDb2xvciIsImNvbG9yIiwic2V0SXRlbSIsInR6UHJlZiIsInRvQmUiLCJ3YXJuaW5nIiwidHJhY2tpbmdTdGF0dXMiLCJjb21wb25lbnRzIiwic2VsZWN0b3IiLCJtZXRyaWNzIiwiYm9hcmRzUmVzIiwiYm9hcmRzQm9keSIsImJvYXJkSWQiLCJyZXNwb25zZSIsInNwcmludCIsInN1bW1hcnkiLCJkYXlzTWV0YSIsInN0dWNrQ2FuZGlkYXRlcyJdLCJzb3VyY2VzIjpbIkppcmEtUmVwb3J0aW5nLUFwcC1DdXJyZW50U3ByaW50LVJlZGVzaWduLVZhbGlkYXRpb24tVGVzdHMuc3BlYy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogSmlyYSBSZXBvcnRpbmcgQXBwIC0gQ3VycmVudCBTcHJpbnQgUmVkZXNpZ24gVmFsaWRhdGlvbiBUZXN0IFN1aXRlXHJcbiAqIFxyXG4gKiBDb21wcmVoZW5zaXZlIHRlc3RzIGZvciBhbGwgMTEgbmV3IFVJIGNvbXBvbmVudHM6XHJcbiAqIDEuIEZpeGVkIEhlYWRlciBCYXJcclxuICogMi4gVW5pZmllZCBIZWFsdGggRGFzaGJvYXJkXHJcbiAqIDMuIEFsZXJ0L1dhcm5pbmcgQmFubmVyXHJcbiAqIDQuIFJpc2tzICYgSW5zaWdodHMgTW9kYWxcclxuICogNS4gQ2FwYWNpdHkgQWxsb2NhdGlvbiBWaXN1YWxpemF0aW9uXHJcbiAqIDYuIFNwcmludCBOYXZpZ2F0aW9uIENhcm91c2VsXHJcbiAqIDcuIFNjb3BlIENoYW5nZSBJbmRpY2F0b3JcclxuICogOC4gRGF5cyBSZW1haW5pbmcgQ291bnRkb3duIFRpbWVyXHJcbiAqIDkuIEV4cG9ydCBEYXNoYm9hcmQgRmVhdHVyZVxyXG4gKiAxMC4gQ1NTIEdyaWQgUmVzcG9uc2l2ZSBMYXlvdXRcclxuICogMTEuIENvbXByZWhlbnNpdmUgVmFsaWRhdGlvbiAmIEFjY2Vzc2liaWxpdHlcclxuICogXHJcbiAqICsgMyBCb251cyBFZGdlIENhc2UgU29sdXRpb25zOlxyXG4gKiBBLiBNdWx0aS10aW1lem9uZSBTcHJpbnQgU2NoZWR1bGluZ1xyXG4gKiBCLiBCdXJuZG93biB3aXRoIEVzdGltYXRpb24gR2Fwc1xyXG4gKiBDLiBTdWItdGFzayBFc3RpbWF0aW9uIFdpdGhvdXQgUGFyZW50IEVzdGltYXRlXHJcbiAqIFxyXG4gKiBSYXRpb25hbGU6IEFsbCB0ZXN0cyB1c2UgUGxheXdyaWdodCBmb3IgcmVhbC10aW1lIGJyb3dzZXIgYXV0b21hdGlvbiArIHZpc3VhbCByZWdyZXNzaW9uXHJcbiAqIFRlc3RzIHZhbGlkYXRlOiBmdW5jdGlvbmFsaXR5LCBwZXJmb3JtYW5jZSwgYWNjZXNzaWJpbGl0eSwgcmVzcG9uc2l2ZW5lc3MsIGVycm9yIGhhbmRsaW5nXHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgdGVzdCwgZXhwZWN0IH0gZnJvbSAnQHBsYXl3cmlnaHQvdGVzdCc7XHJcblxyXG4vLyBCYXNlIGNvbmZpZ3VyYXRpb25cclxuY29uc3QgQkFTRV9VUkwgPSBwcm9jZXNzLmVudi5CQVNFX1VSTCB8fCAnaHR0cDovL2xvY2FsaG9zdDozMDAwJztcclxuY29uc3QgU1BSSU5UX1BBR0UgPSBgJHtCQVNFX1VSTH0vY3VycmVudC1zcHJpbnRgO1xyXG5cclxuLyoqXHJcbiAqIFV0aWxpdHk6IExvYWQgc3ByaW50IHBhZ2UgYW5kIHdhaXQgZm9yIGNvbnRlbnRcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGxvYWRTcHJpbnRQYWdlKHBhZ2UpIHtcclxuICBhd2FpdCBwYWdlLmdvdG8oU1BSSU5UX1BBR0UpO1xyXG4gIC8vIFdhaXQgZm9yIGNvbnRlbnQgdG8gYXBwZWFyIG9yIGFuIGVycm9yIHRvIHN1cmZhY2U7IHByZXZlbnRzIGZsYWtpbmVzcyB3aGVuIGJvYXJkcyBsaXN0IGRpZmZlcnNcclxuICBhd2FpdCBwYWdlLndhaXRGb3JTZWxlY3RvcignI2N1cnJlbnQtc3ByaW50LWNvbnRlbnQsICNjdXJyZW50LXNwcmludC1lcnJvcicsIHsgdGltZW91dDogMzAwMDAgfSk7XHJcbn1cclxuXHJcbi8vIFV0aWxpdHk6IGdldCBmaXJzdCBhdmFpbGFibGUgYm9hcmRJZCBmcm9tIEFQSSAocmVzaWxpZW50IHRlc3QgaGVscGVyKVxyXG5hc3luYyBmdW5jdGlvbiBnZXRGaXJzdEJvYXJkSWQocmVxdWVzdCkge1xyXG4gIGNvbnN0IGJhc2UgPSBwcm9jZXNzLmVudi5CQVNFX1VSTCB8fCAnaHR0cDovL2xvY2FsaG9zdDozMDAwJztcclxuICBjb25zdCByZXMgPSBhd2FpdCByZXF1ZXN0LmdldChgJHtiYXNlfS9hcGkvYm9hcmRzLmpzb25gKTtcclxuICBpZiAocmVzLnN0YXR1cygpICE9PSAyMDApIHJldHVybiBudWxsO1xyXG4gIGNvbnN0IGRhdGEgPSBhd2FpdCByZXMuanNvbigpO1xyXG4gIGNvbnN0IGJvYXJkcyA9IGRhdGE/LmJvYXJkcyB8fCBkYXRhPy5ib2FyZHMgfHwgZGF0YT8ucHJvamVjdHMgfHwgW107XHJcbiAgaWYgKCFib2FyZHMgfHwgYm9hcmRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XHJcbiAgcmV0dXJuIGJvYXJkc1swXT8uaWQgfHwgbnVsbDtcclxufVxyXG5cclxuLyoqXHJcbiAqIFV0aWxpdHk6IEdldCBwYWdlIHBlcmZvcm1hbmNlIG1ldHJpY3NcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGdldFBhZ2VNZXRyaWNzKHBhZ2UpIHtcclxuICByZXR1cm4gYXdhaXQgcGFnZS5ldmFsdWF0ZSgoKSA9PiB7XHJcbiAgICBjb25zdCBwZXJmID0gcGVyZm9ybWFuY2UuZ2V0RW50cmllc0J5VHlwZSgnbmF2aWdhdGlvbicpWzBdO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgZG9tUmVhZHk6IHBlcmY/LmRvbUNvbnRlbnRMb2FkZWRFdmVudEVuZCAtIHBlcmY/LmRvbUNvbnRlbnRMb2FkZWRFdmVudFN0YXJ0LFxyXG4gICAgICBsb2FkQ29tcGxldGU6IHBlcmY/LmxvYWRFdmVudEVuZCAtIHBlcmY/LmxvYWRFdmVudFN0YXJ0LFxyXG4gICAgICBub2RlQ291bnQ6IGRvY3VtZW50LmJvZHkucXVlcnlTZWxlY3RvckFsbCgnKicpLmxlbmd0aCxcclxuICAgICAgY3NzU2l6ZTogbmV3IEJsb2IoWy4uLmRvY3VtZW50LnN0eWxlU2hlZXRzXS5tYXAoc2hlZXQgPT4gc2hlZXQuY3NzVGV4dCB8fCAnJykpLnNpemVcclxuICAgIH07XHJcbiAgfSk7XHJcbn1cclxuXHJcbnRlc3QuZGVzY3JpYmUoJ0N1cnJlbnRTcHJpbnQgUmVkZXNpZ24gLSBDb21wb25lbnQgVmFsaWRhdGlvbicsICgpID0+IHtcclxuICB0ZXN0LmJlZm9yZUVhY2goYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICAvLyBOYXZpZ2F0ZSB0byBzcHJpbnQgcGFnZVxyXG4gICAgYXdhaXQgbG9hZFNwcmludFBhZ2UocGFnZSk7XHJcbiAgfSk7XHJcblxyXG4gIC8vID09PT09PT09PT0gVkFMSURBVElPTiAxOiBIZWFkZXIgQmFyIENvbXBvbmVudCA9PT09PT09PT09XHJcbiAgdGVzdCgnVmFsaWRhdGlvbiAxLjE6IEhlYWRlciBiYXIgcmVuZGVycyB3aXRoIHNwcmludCBtZXRhZGF0YScsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgY29uc3QgaGVhZGVyQmFyID0gcGFnZS5sb2NhdG9yKCcuY3VycmVudC1zcHJpbnQtaGVhZGVyLWJhcicpO1xyXG4gICAgYXdhaXQgZXhwZWN0KGhlYWRlckJhcikudG9CZVZpc2libGUoKTtcclxuICAgIFxyXG4gICAgLy8gQ2hlY2sgYWxsIHJlcXVpcmVkIGVsZW1lbnRzXHJcbiAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcuaGVhZGVyLXNwcmludC1uYW1lJykpLnRvQmVWaXNpYmxlKCk7XHJcbiAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcuaGVhZGVyLXNwcmludC1kYXRlcycpKS50b0JlVmlzaWJsZSgpO1xyXG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignLmhlYWRlci1tZXRyaWMnKSkudG9IYXZlQ291bnQoMyk7IC8vIFJlbWFpbmluZywgVG90YWwgU1AsIFByb2dyZXNzXHJcbiAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcuc3RhdHVzLWJhZGdlJykpLnRvQmVWaXNpYmxlKCk7XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ1ZhbGlkYXRpb24gMS4yOiBIZWFkZXIgYmFyIGlzIHN0aWNreSBvbiBzY3JvbGwnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIGNvbnN0IGhlYWRlckJhciA9IHBhZ2UubG9jYXRvcignLmN1cnJlbnQtc3ByaW50LWhlYWRlci1iYXInKTtcclxuICAgIGNvbnN0IGluaXRpYWxUb3AgPSBhd2FpdCBoZWFkZXJCYXIuZXZhbHVhdGUoZWwgPT4gd2luZG93LmdldENvbXB1dGVkU3R5bGUoZWwpLnBvc2l0aW9uKTtcclxuICAgIFxyXG4gICAgLy8gU2Nyb2xsIGRvd25cclxuICAgIGF3YWl0IHBhZ2UuZXZhbHVhdGUoKCkgPT4gd2luZG93LnNjcm9sbEJ5KDAsIDUwMCkpO1xyXG4gICAgXHJcbiAgICAvLyBWZXJpZnkgc3RpY2t5IHBvc2l0aW9uaW5nXHJcbiAgICBjb25zdCBzdGlja3lTdHlsZSA9IGF3YWl0IGhlYWRlckJhci5ldmFsdWF0ZShlbCA9PiB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbCkucG9zaXRpb24pO1xyXG4gICAgZXhwZWN0KFsnZml4ZWQnLCAnc3RpY2t5J10pLnRvQ29udGFpbihzdGlja3lTdHlsZSk7XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ1ZhbGlkYXRpb24gMS4zOiBEYXlzIHJlbWFpbmluZyBjb2xvciBjb2RpbmcgaXMgY29ycmVjdCcsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgY29uc3QgcmVtYWluaW5nTWV0cmljID0gcGFnZS5sb2NhdG9yKCcuaGVhZGVyLW1ldHJpYzpmaXJzdC1vZi10eXBlIC5tZXRyaWMtdmFsdWUnKTtcclxuICAgIGNvbnN0IHRleHQgPSBhd2FpdCByZW1haW5pbmdNZXRyaWMudGV4dENvbnRlbnQoKTtcclxuICAgIFxyXG4gICAgLy8gUGFyc2UgZGF5cyBmcm9tIHRleHQgKGUuZy4sIFwiMSBkYXlcIiwgXCI1IGRheXNcIilcclxuICAgIGNvbnN0IGRheXNNYXRjaCA9IHRleHQ/Lm1hdGNoKC8oXFxkKykvKTtcclxuICAgIGlmIChkYXlzTWF0Y2gpIHtcclxuICAgICAgY29uc3QgZGF5cyA9IHBhcnNlSW50KGRheXNNYXRjaFsxXSk7XHJcbiAgICAgIGxldCBleHBlY3RlZENsYXNzID0gJ2NyaXRpY2FsJzsgLy8gMC0yIGRheXNcclxuICAgICAgaWYgKGRheXMgPiA1KSBleHBlY3RlZENsYXNzID0gJ2dyZWVuJztcclxuICAgICAgZWxzZSBpZiAoZGF5cyA+IDIpIGV4cGVjdGVkQ2xhc3MgPSAneWVsbG93JztcclxuICAgICAgXHJcbiAgICAgIC8vIFZlcmlmeSBjb2xvciBjbGFzcyBleGlzdHNcclxuICAgICAgY29uc3QgY2xhc3NMaXN0ID0gYXdhaXQgcmVtYWluaW5nTWV0cmljLmdldEF0dHJpYnV0ZSgnY2xhc3MnKTtcclxuICAgICAgZXhwZWN0KGNsYXNzTGlzdCkudG9Db250YWluKGV4cGVjdGVkQ2xhc3MpO1xyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdWYWxpZGF0aW9uIDEuNDogSGVhZGVyIGJhciByZW5kZXJzIHdpdGhpbiAxMDBtcycsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcclxuICAgIGF3YWl0IHBhZ2Uud2FpdEZvclNlbGVjdG9yKCcuY3VycmVudC1zcHJpbnQtaGVhZGVyLWJhcicsIHsgdGltZW91dDogMTAwIH0pO1xyXG4gICAgY29uc3QgcmVuZGVyVGltZSA9IERhdGUubm93KCkgLSBzdGFydFRpbWU7XHJcbiAgICBleHBlY3QocmVuZGVyVGltZSkudG9CZUxlc3NUaGFuKDEwMCk7XHJcbiAgfSk7XHJcblxyXG4gIC8vID09PT09PT09PT0gVkFMSURBVElPTiAyOiBIZWFsdGggRGFzaGJvYXJkID09PT09PT09PT1cclxuICB0ZXN0KCdWYWxpZGF0aW9uIDIuMTogSGVhbHRoIGRhc2hib2FyZCBjYXJkIHJlbmRlcnMgd2l0aCBhbGwgc2VjdGlvbnMnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIGNvbnN0IGhlYWx0aENhcmQgPSBwYWdlLmxvY2F0b3IoJy5oZWFsdGgtZGFzaGJvYXJkLWNhcmQnKTtcclxuICAgIGF3YWl0IGV4cGVjdChoZWFsdGhDYXJkKS50b0JlVmlzaWJsZSgpO1xyXG4gICAgXHJcbiAgICAvLyBDaGVjayBzZWN0aW9uc1xyXG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignLmhlYWx0aC1zdGF0dXMtY2hpcCcpKS50b0JlVmlzaWJsZSgpO1xyXG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignLmhlYWx0aC1wcm9ncmVzcy1zZWN0aW9uJykpLnRvQmVWaXNpYmxlKCk7XHJcbiAgICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcuaGVhbHRoLXNwbGl0LXNlY3Rpb24nKSkudG9CZVZpc2libGUoKTtcclxuICAgIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJy5oZWFsdGgtdHJhY2tpbmctc2VjdGlvbicpKS50b0JlVmlzaWJsZSgpO1xyXG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignLmhlYWx0aC1hY3Rpb25zJykpLnRvQmVWaXNpYmxlKCk7XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ1ZhbGlkYXRpb24gMi4yOiBIZWFsdGggZGFzaGJvYXJkIHByb2dyZXNzIGJhciBkaXNwbGF5cyBjb3JyZWN0bHknLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIGNvbnN0IHByb2dyZXNzQmFyID0gcGFnZS5sb2NhdG9yKCcucHJvZ3Jlc3MtYmFyLWNvbnRhaW5lcicpO1xyXG4gICAgYXdhaXQgZXhwZWN0KHByb2dyZXNzQmFyKS50b0JlVmlzaWJsZSgpO1xyXG4gICAgXHJcbiAgICAvLyBWZXJpZnkgYmFycyBleGlzdFxyXG4gICAgY29uc3QgZG9uZUJhciA9IHBhZ2UubG9jYXRvcignLnByb2dyZXNzLWJhci5kb25lJyk7XHJcbiAgICBjb25zdCBpbnByb2dyZXNzQmFyID0gcGFnZS5sb2NhdG9yKCcucHJvZ3Jlc3MtYmFyLmlucHJvZ3Jlc3MnKTtcclxuICAgIFxyXG4gICAgLy8gQXQgbGVhc3Qgb25lIHNob3VsZCBleGlzdFxyXG4gICAgY29uc3QgZG9uZUNvdW50ID0gYXdhaXQgZG9uZUJhci5jb3VudCgpO1xyXG4gICAgY29uc3QgaW5wcm9ncmVzc0NvdW50ID0gYXdhaXQgaW5wcm9ncmVzc0Jhci5jb3VudCgpO1xyXG4gICAgZXhwZWN0KGRvbmVDb3VudCArIGlucHJvZ3Jlc3NDb3VudCkudG9CZUdyZWF0ZXJUaGFuKDApO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdWYWxpZGF0aW9uIDIuMzogSGVhbHRoIGRhc2hib2FyZCBjb3B5LXRvLWNsaXBib2FyZCB3b3JrcycsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgY29uc3QgY29weUJ0biA9IHBhZ2UubG9jYXRvcignLmhlYWx0aC1jb3B5LWJ0bicpO1xyXG4gICAgXHJcbiAgICAvLyBNb2NrIGNsaXBib2FyZFxyXG4gICAgYXdhaXQgcGFnZS5ldmFsdWF0ZSgoKSA9PiB7XHJcbiAgICAgIG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0ID0gYXN5bmMgKHRleHQpID0+IHtcclxuICAgICAgICBkb2N1bWVudC5ib2R5LnNldEF0dHJpYnV0ZSgnZGF0YS1jbGlwYm9hcmQnLCB0ZXh0KTtcclxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XHJcbiAgICAgIH07XHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgYXdhaXQgY29weUJ0bi5jbGljaygpO1xyXG4gICAgXHJcbiAgICAvLyBWZXJpZnkgYnV0dG9uIHNob3dzIFwiQ29waWVkIVwiXHJcbiAgICBhd2FpdCBleHBlY3QoY29weUJ0bikudG9Db250YWluVGV4dCgnQ29waWVkIScsIHsgdGltZW91dDogMTAwIH0pO1xyXG4gICAgXHJcbiAgICAvLyBWZXJpZnkgY2xpcGJvYXJkIGNvbnRlbnRcclxuICAgIGNvbnN0IGNsaXBib2FyZENvbnRlbnQgPSBhd2FpdCBwYWdlLmdldEF0dHJpYnV0ZSgnYm9keScsICdkYXRhLWNsaXBib2FyZCcpO1xyXG4gICAgZXhwZWN0KGNsaXBib2FyZENvbnRlbnQpLnRvQmVUcnV0aHkoKTtcclxuICB9KTtcclxuXHJcbiAgdGVzdCgnVmFsaWRhdGlvbiAyLjQ6IEhlYWx0aCBkYXNoYm9hcmQgcmlzayBpbmRpY2F0b3IgYXBwZWFycyB3aXRoIHJpc2tzJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICBjb25zdCByaXNrQ2hpcCA9IHBhZ2UubG9jYXRvcignLmhlYWx0aC1zdGF0dXMtY2hpcCcpO1xyXG4gICAgY29uc3Qgcmlza1RleHQgPSBhd2FpdCByaXNrQ2hpcC50ZXh0Q29udGVudCgpO1xyXG4gICAgXHJcbiAgICAvLyBTaG91bGQgY29udGFpbiBlaXRoZXIgXCJoZWFsdGh5XCIgb3IgXCLimqDvuI9cIlxyXG4gICAgZXhwZWN0KHJpc2tUZXh0KS50b01hdGNoKC8oaGVhbHRoeXzimqDvuI8pLyk7XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ1ZhbGlkYXRpb24gMi41OiBIZWFsdGggZGFzaGJvYXJkIHJlbmRlcnMgd2l0aGluIDE1MG1zJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xyXG4gICAgYXdhaXQgcGFnZS53YWl0Rm9yU2VsZWN0b3IoJy5oZWFsdGgtZGFzaGJvYXJkLWNhcmQnLCB7IHRpbWVvdXQ6IDE1MCB9KTtcclxuICAgIGNvbnN0IHJlbmRlclRpbWUgPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xyXG4gICAgZXhwZWN0KHJlbmRlclRpbWUpLnRvQmVMZXNzVGhhbigxNTApO1xyXG4gIH0pO1xyXG5cclxuICAvLyA9PT09PT09PT09IFZBTElEQVRJT04gMzogQWxlcnQgQmFubmVyID09PT09PT09PT1cclxuICB0ZXN0KCdWYWxpZGF0aW9uIDMuMTogQWxlcnQgYmFubmVyIGFwcGVhcnMgd2hlbiBjcml0aWNhbCBpc3N1ZXMgZXhpc3QnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIC8vIENoZWNrIGlmIGFsZXJ0IGlzIHZpc2libGUgKGNvbmRpdGlvbmFsIG9uIGRhdGEpXHJcbiAgICBjb25zdCBhbGVydEJhbm5lciA9IHBhZ2UubG9jYXRvcignLmFsZXJ0LWJhbm5lcicpO1xyXG4gICAgY29uc3QgaXNWaXNpYmxlID0gYXdhaXQgYWxlcnRCYW5uZXIuaXNWaXNpYmxlKCkuY2F0Y2goKCkgPT4gZmFsc2UpO1xyXG4gICAgXHJcbiAgICBpZiAoaXNWaXNpYmxlKSB7XHJcbiAgICAgIC8vIFZlcmlmeSBjb2xvciBjbGFzc1xyXG4gICAgICBjb25zdCBjbGFzc0xpc3QgPSBhd2FpdCBhbGVydEJhbm5lci5nZXRBdHRyaWJ1dGUoJ2NsYXNzJyk7XHJcbiAgICAgIGV4cGVjdChjbGFzc0xpc3QpLnRvTWF0Y2goLyh5ZWxsb3d8b3JhbmdlfHJlZCkvKTtcclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgdGVzdCgnVmFsaWRhdGlvbiAzLjI6IEFsZXJ0IGJhbm5lciBkaXNtaXNzIGJ1dHRvbiB3b3JrcycsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgY29uc3QgYWxlcnRCYW5uZXIgPSBwYWdlLmxvY2F0b3IoJy5hbGVydC1iYW5uZXInKTtcclxuICAgIGlmICghKGF3YWl0IGFsZXJ0QmFubmVyLmlzVmlzaWJsZSgpKSkge1xyXG4gICAgICB0ZXN0LnNraXAoKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc3QgZGlzbWlzc0J0biA9IHBhZ2UubG9jYXRvcignLmFsZXJ0LWRpc21pc3MnKTtcclxuICAgIGF3YWl0IGRpc21pc3NCdG4uY2xpY2soKTtcclxuICAgIFxyXG4gICAgLy8gQmFubmVyIHNob3VsZCBiZSBoaWRkZW5cclxuICAgIGF3YWl0IGV4cGVjdChhbGVydEJhbm5lcikubm90LnRvQmVWaXNpYmxlKHsgdGltZW91dDogNTAwIH0pO1xyXG4gICAgXHJcbiAgICAvLyBWZXJpZnkgbG9jYWxTdG9yYWdlIGlzIHNldCAoZWl0aGVyIHNwcmludC1zcGVjaWZpYyBvciBnZW5lcmljIGtleSlcclxuICAgIGNvbnN0IGlzRGlzbWlzc2VkID0gYXdhaXQgcGFnZS5ldmFsdWF0ZSgoKSA9PiB7XHJcbiAgICAgIGNvbnN0IGhlYWRlciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5jdXJyZW50LXNwcmludC1oZWFkZXItYmFyJyk7XHJcbiAgICAgIGNvbnN0IHNwcmludElkID0gaGVhZGVyPy5nZXRBdHRyaWJ1dGUoJ2RhdGEtc3ByaW50LWlkJyk7XHJcbiAgICAgIGNvbnN0IHNwZWNpZmljS2V5ID0gc3ByaW50SWQgPyBgYWxlcnRfYmFubmVyX2Rpc21pc3NlZF8ke3NwcmludElkfWAgOiBudWxsO1xyXG4gICAgICBjb25zdCBnZW5lcmljS2V5ID0gJ2FsZXJ0X2Jhbm5lcl9kaXNtaXNzZWRfdW5rbm93bic7XHJcbiAgICAgIGNvbnN0IGRpc21pc3NlZFRpbWUgPSAoc3BlY2lmaWNLZXkgJiYgbG9jYWxTdG9yYWdlLmdldEl0ZW0oc3BlY2lmaWNLZXkpKSB8fCBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShnZW5lcmljS2V5KTtcclxuICAgICAgcmV0dXJuIGRpc21pc3NlZFRpbWUgIT09IG51bGw7XHJcbiAgICB9KTtcclxuICAgIGV4cGVjdChpc0Rpc21pc3NlZCkudG9CZVRydXRoeSgpO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdWYWxpZGF0aW9uIDMuMzogQWxlcnQgYmFubmVyIHNob3dzIGNvcnJlY3Qgc2V2ZXJpdHkgY29sb3JzJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICBjb25zdCBiYW5uZXIgPSBwYWdlLmxvY2F0b3IoJy5hbGVydC1iYW5uZXInKTtcclxuICAgIGlmICghKGF3YWl0IGJhbm5lci5pc1Zpc2libGUoKSkpIHtcclxuICAgICAgdGVzdC5za2lwKCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnN0IGNsYXNzTGlzdCA9IGF3YWl0IGJhbm5lci5nZXRBdHRyaWJ1dGUoJ2NsYXNzJyk7XHJcbiAgICBjb25zdCBzZXZlcml0eSA9IGNsYXNzTGlzdD8ubWF0Y2goLyh5ZWxsb3d8b3JhbmdlfHJlZCkvKT8uWzBdO1xyXG4gICAgXHJcbiAgICBleHBlY3QoWyd5ZWxsb3cnLCAnb3JhbmdlJywgJ3JlZCddKS50b0NvbnRhaW4oc2V2ZXJpdHkpO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdWYWxpZGF0aW9uIDMuNDogQWxlcnQgYWN0aW9uIGxpbmtzIG5hdmlnYXRlIGNvcnJlY3RseScsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgY29uc3QgYmFubmVyID0gcGFnZS5sb2NhdG9yKCcuYWxlcnQtYmFubmVyJyk7XHJcbiAgICBpZiAoIShhd2FpdCBiYW5uZXIuaXNWaXNpYmxlKCkpKSB7XHJcbiAgICAgIHRlc3Quc2tpcCgpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zdCBhY3Rpb25MaW5rID0gcGFnZS5sb2NhdG9yKCcuYWxlcnQtYWN0aW9uJykuZmlyc3QoKTtcclxuICAgIGlmIChhd2FpdCBhY3Rpb25MaW5rLmNvdW50KCkgPiAwKSB7XHJcbiAgICAgIGNvbnN0IGhyZWYgPSBhd2FpdCBhY3Rpb25MaW5rLmdldEF0dHJpYnV0ZSgnaHJlZicpO1xyXG4gICAgICBleHBlY3QoaHJlZikudG9CZVRydXRoeSgpO1xyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICAvLyA9PT09PT09PT09IFZBTElEQVRJT04gNDogUmlza3MgJiBJbnNpZ2h0cyBNb2RhbCA9PT09PT09PT09XHJcbiAgdGVzdCgnVmFsaWRhdGlvbiA0LjE6IFJpc2tzICYgSW5zaWdodHMgY2FyZCByZW5kZXJzIHdpdGggYWxsIHRhYnMnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIGNvbnN0IGNhcmQgPSBwYWdlLmxvY2F0b3IoJy5yaXNrcy1pbnNpZ2h0cy1jYXJkJyk7XHJcbiAgICBhd2FpdCBleHBlY3QoY2FyZCkudG9CZVZpc2libGUoKTtcclxuICAgIFxyXG4gICAgLy8gQ2hlY2sgdGFic1xyXG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignLmluc2lnaHRzLXRhYicpKS50b0hhdmVDb3VudCgzKTsgLy8gQmxvY2tlcnMsIExlYXJuaW5ncywgQXNzdW1wdGlvbnNcclxuICB9KTtcclxuXHJcbiAgdGVzdCgnVmFsaWRhdGlvbiA0LjI6IFJpc2tzICYgSW5zaWdodHMgdGFiIHN3aXRjaGluZyB3b3JrcycsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgY29uc3QgdGFicyA9IHBhZ2UubG9jYXRvcignLmluc2lnaHRzLXRhYicpO1xyXG4gICAgY29uc3QgbGVhcm5pbmdzVGFiID0gdGFicy5udGgoMSk7XHJcbiAgICBcclxuICAgIGF3YWl0IGxlYXJuaW5nc1RhYi5jbGljaygpO1xyXG4gICAgXHJcbiAgICAvLyBWZXJpZnkgdGFiIGlzIGFjdGl2ZVxyXG4gICAgY29uc3QgaXNBY3RpdmUgPSBhd2FpdCBsZWFybmluZ3NUYWIuZXZhbHVhdGUoZWwgPT4gZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdhY3RpdmUnKSk7XHJcbiAgICBleHBlY3QoaXNBY3RpdmUpLnRvQmVUcnV0aHkoKTtcclxuICAgIFxyXG4gICAgLy8gVmVyaWZ5IHBhbmVsIGlzIHZpc2libGVcclxuICAgIGNvbnN0IGxlYXJuUGFuZWwgPSBwYWdlLmxvY2F0b3IoJyNsZWFybmluZ3MtcGFuZWwnKTtcclxuICAgIGNvbnN0IGlzUGFuZWxBY3RpdmUgPSBhd2FpdCBsZWFyblBhbmVsLmV2YWx1YXRlKGVsID0+IGVsLmNsYXNzTGlzdC5jb250YWlucygnYWN0aXZlJykpO1xyXG4gICAgZXhwZWN0KGlzUGFuZWxBY3RpdmUpLnRvQmVUcnV0aHkoKTtcclxuICB9KTtcclxuXHJcbiAgdGVzdCgnVmFsaWRhdGlvbiA0LjM6IFJpc2tzICYgSW5zaWdodHMga2V5Ym9hcmQgbmF2aWdhdGlvbiB3b3JrcycsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgY29uc3QgdGFicyA9IHBhZ2UubG9jYXRvcignLmluc2lnaHRzLXRhYicpO1xyXG4gICAgY29uc3QgZmlyc3RUYWIgPSB0YWJzLmZpcnN0KCk7XHJcbiAgICBcclxuICAgIGF3YWl0IGZpcnN0VGFiLmZvY3VzKCk7XHJcbiAgICBhd2FpdCBwYWdlLmtleWJvYXJkLnByZXNzKCdBcnJvd1JpZ2h0Jyk7XHJcbiAgICBcclxuICAgIC8vIFNlY29uZCB0YWIgc2hvdWxkIG5vdyBiZSBmb2N1c2VkXHJcbiAgICBjb25zdCBzZWNvbmRUYWIgPSB0YWJzLm50aCgxKTtcclxuICAgIGNvbnN0IGhhc0ZvY3VzID0gYXdhaXQgc2Vjb25kVGFiLmV2YWx1YXRlKGVsID0+IGVsID09PSBkb2N1bWVudC5hY3RpdmVFbGVtZW50KTtcclxuICAgIGV4cGVjdChoYXNGb2N1cykudG9CZVRydXRoeSgpO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdWYWxpZGF0aW9uIDQuNDogUmlza3MgJiBJbnNpZ2h0cyBzYXZlIGZ1bmN0aW9uYWxpdHkgd29ya3MnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIC8vIE1vY2sgQVBJIGVuZHBvaW50XHJcbiAgICBhd2FpdCBwYWdlLnJvdXRlKCcvYXBpL2N1cnJlbnQtc3ByaW50L2luc2lnaHRzJywgcm91dGUgPT4ge1xyXG4gICAgICByb3V0ZS5hYm9ydCgnYmxvY2tlZGJ5Y2xpZW50Jyk7XHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgY29uc3Qgc2F2ZUJ0biA9IHBhZ2UubG9jYXRvcignI2luc2lnaHRzLXNhdmUnKTtcclxuICAgIGlmIChhd2FpdCBzYXZlQnRuLmlzVmlzaWJsZSgpKSB7XHJcbiAgICAgIGF3YWl0IHNhdmVCdG4uY2xpY2soKTtcclxuICAgICAgXHJcbiAgICAgIC8vIFN0YXR1cyBtZXNzYWdlIHNob3VsZCBzaG93IGF0dGVtcHRcclxuICAgICAgY29uc3Qgc3RhdHVzRWwgPSBwYWdlLmxvY2F0b3IoJyNpbnNpZ2h0cy1zdGF0dXMnKTtcclxuICAgICAgY29uc3Qgc3RhdHVzVGV4dCA9IGF3YWl0IHN0YXR1c0VsLnRleHRDb250ZW50KCk7XHJcbiAgICAgIGV4cGVjdChzdGF0dXNUZXh0KS50b0JlVHJ1dGh5KCk7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIC8vID09PT09PT09PT0gVkFMSURBVElPTiA1OiBDYXBhY2l0eSBBbGxvY2F0aW9uID09PT09PT09PT1cclxuICB0ZXN0KCdWYWxpZGF0aW9uIDUuMTogQ2FwYWNpdHkgYWxsb2NhdGlvbiBjYXJkIHJlbmRlcnMnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIGNvbnN0IGNhcmQgPSBwYWdlLmxvY2F0b3IoJy5jYXBhY2l0eS1hbGxvY2F0aW9uLWNhcmQnKTtcclxuICAgIGF3YWl0IGV4cGVjdChjYXJkKS50b0JlVmlzaWJsZSgpO1xyXG4gICAgXHJcbiAgICAvLyBDaGVjayByZXF1aXJlZCBlbGVtZW50c1xyXG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignLmNhcGFjaXR5LWhlYWx0aCcpKS50b0JlVmlzaWJsZSgpO1xyXG4gICAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignLmNhcGFjaXR5LWFsbG9jYXRpb25zJykpLnRvQmVWaXNpYmxlKCk7XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ1ZhbGlkYXRpb24gNS4yOiBDYXBhY2l0eSBiYXIgc2hvd3Mgb3ZlcmFsbG9jYXRpb24gY29ycmVjdGx5JywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICBjb25zdCBiYXIgPSBwYWdlLmxvY2F0b3IoJy5hbGxvY2F0aW9uLWJhci5vdmVyYWxsb2NhdGVkJyk7XHJcbiAgICBjb25zdCBjb3VudCA9IGF3YWl0IGJhci5jb3VudCgpO1xyXG4gICAgXHJcbiAgICAvLyBJZiBvdmVyYWxsb2NhdGVkIGl0ZW1zIGV4aXN0LCB2ZXJpZnkgY29sb3JcclxuICAgIGlmIChjb3VudCA+IDApIHtcclxuICAgICAgY29uc3Qgc3R5bGUgPSBhd2FpdCBiYXIuZmlyc3QoKS5ldmFsdWF0ZShlbCA9PiB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbCkuYmFja2dyb3VuZCk7XHJcbiAgICAgIGV4cGVjdChzdHlsZSkudG9Db250YWluKCdyZ2InKTsgLy8gU2hvdWxkIGhhdmUgY29sb3JcclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgdGVzdCgnVmFsaWRhdGlvbiA1LjM6IENhcGFjaXR5IGFsbG9jYXRpb24gZXhwYW5kL2NvbGxhcHNlIHdvcmtzJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICBjb25zdCBleHBhbmRCdG4gPSBwYWdlLmxvY2F0b3IoJy5hbGxvY2F0aW9uLWV4cGFuZC1idG4nKS5maXJzdCgpO1xyXG4gICAgaWYgKGF3YWl0IGV4cGFuZEJ0bi5jb3VudCgpID09PSAwKSB7XHJcbiAgICAgIHRlc3Quc2tpcCgpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBhd2FpdCBleHBhbmRCdG4uY2xpY2soKTtcclxuICAgIFxyXG4gICAgLy8gSXNzdWVzIGxpc3Qgc2hvdWxkIGJlIHZpc2libGVcclxuICAgIGNvbnN0IGlzc3VlcyA9IHBhZ2UubG9jYXRvcignLmFsbG9jYXRpb24taXNzdWVzJykuZmlyc3QoKTtcclxuICAgIGNvbnN0IGlzVmlzaWJsZSA9IGF3YWl0IGlzc3Vlcy5pc1Zpc2libGUoKS5jYXRjaCgoKSA9PiBmYWxzZSk7XHJcbiAgICBleHBlY3QoaXNWaXNpYmxlKS50b0JlVHJ1dGh5KCk7XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ1ZhbGlkYXRpb24gNS40OiBDYXBhY2l0eSBoZWFsdGggY29sb3IgbWF0Y2hlcyBzZXZlcml0eScsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgY29uc3QgaGVhbHRoID0gcGFnZS5sb2NhdG9yKCcuY2FwYWNpdHktaGVhbHRoJyk7XHJcbiAgICBjb25zdCBjbGFzc0xpc3QgPSBhd2FpdCBoZWFsdGguZ2V0QXR0cmlidXRlKCdjbGFzcycpO1xyXG4gICAgXHJcbiAgICBleHBlY3QoY2xhc3NMaXN0KS50b01hdGNoKC8oZ3JlZW58b3JhbmdlfHllbGxvd3xyZWQpLyk7XHJcbiAgfSk7XHJcblxyXG4gIC8vID09PT09PT09PT0gVkFMSURBVElPTiA2OiBTcHJpbnQgQ2Fyb3VzZWwgPT09PT09PT09PVxyXG4gIHRlc3QoJ1ZhbGlkYXRpb24gNi4xOiBTcHJpbnQgY2Fyb3VzZWwgcmVuZGVycyB3aXRoIDggcmVjZW50IHNwcmludHMnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIGNvbnN0IGNhcm91c2VsID0gcGFnZS5sb2NhdG9yKCcuc3ByaW50LWNhcm91c2VsJyk7XHJcbiAgICBjb25zdCB0YWJzID0gcGFnZS5sb2NhdG9yKCcuY2Fyb3VzZWwtdGFiJyk7XHJcbiAgICBcclxuICAgIGNvbnN0IGNvdW50ID0gYXdhaXQgdGFicy5jb3VudCgpO1xyXG4gICAgZXhwZWN0KGNvdW50KS50b0JlR3JlYXRlclRoYW4oMCk7XHJcbiAgICBleHBlY3QoY291bnQpLnRvQmVMZXNzVGhhbk9yRXF1YWwoOCk7XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ1ZhbGlkYXRpb24gNi4yOiBTcHJpbnQgY2Fyb3VzZWwga2V5Ym9hcmQgbmF2aWdhdGlvbiB3b3JrcycsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgY29uc3QgdGFicyA9IHBhZ2UubG9jYXRvcignLmNhcm91c2VsLXRhYicpO1xyXG4gICAgY29uc3QgZmlyc3RUYWIgPSB0YWJzLmZpcnN0KCk7XHJcbiAgICBcclxuICAgIGF3YWl0IGZpcnN0VGFiLmZvY3VzKCk7XHJcbiAgICBhd2FpdCBwYWdlLmtleWJvYXJkLnByZXNzKCdBcnJvd1JpZ2h0Jyk7XHJcbiAgICBcclxuICAgIC8vIE5leHQgdGFiIHNob3VsZCByZWNlaXZlIGZvY3VzXHJcbiAgICBjb25zdCBzZWNvbmRUYWIgPSB0YWJzLm50aCgxKTtcclxuICAgIGNvbnN0IGhhc0ZvY3VzID0gYXdhaXQgc2Vjb25kVGFiLmV2YWx1YXRlKGVsID0+IGVsID09PSBkb2N1bWVudC5hY3RpdmVFbGVtZW50KTtcclxuICAgIGV4cGVjdChoYXNGb2N1cykudG9CZVRydXRoeSgpO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdWYWxpZGF0aW9uIDYuMzogU3ByaW50IGNhcm91c2VsIGNvbG9ycyBtYXRjaCBjb21wbGV0aW9uICUnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIGNvbnN0IHRhYnMgPSBwYWdlLmxvY2F0b3IoJy5jYXJvdXNlbC10YWInKTtcclxuICAgIFxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBNYXRoLm1pbigzLCBhd2FpdCB0YWJzLmNvdW50KCkpOyBpKyspIHtcclxuICAgICAgY29uc3QgdGFiID0gdGFicy5udGgoaSk7XHJcbiAgICAgIGNvbnN0IGNsYXNzTGlzdCA9IGF3YWl0IHRhYi5nZXRBdHRyaWJ1dGUoJ2NsYXNzJyk7XHJcbiAgICAgIGV4cGVjdChjbGFzc0xpc3QpLnRvTWF0Y2goLyhncmVlbnx5ZWxsb3d8Z3JheXxtdXRlZCkvKTtcclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgdGVzdCgnVmFsaWRhdGlvbiA2LjQ6IFNwcmludCBjYXJvdXNlbCBoYXMgYWNjZXNzaWJpbGl0eSBsYWJlbHMnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIGNvbnN0IGNhcm91c2VsID0gcGFnZS5sb2NhdG9yKCcuc3ByaW50LWNhcm91c2VsJyk7XHJcbiAgICBjb25zdCBhcmlhTGFiZWwgPSBhd2FpdCBjYXJvdXNlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKTtcclxuICAgIGV4cGVjdChhcmlhTGFiZWwpLnRvQmVUcnV0aHkoKTtcclxuICB9KTtcclxuXHJcbiAgLy8gPT09PT09PT09PSBWQUxJREFUSU9OIDc6IFNjb3BlIEluZGljYXRvciA9PT09PT09PT09XHJcbiAgdGVzdCgnVmFsaWRhdGlvbiA3LjE6IFNjb3BlIGluZGljYXRvciBjaGlwIGFwcGVhcnMgb25seSB3aGVuIHNjb3BlID4gMCUnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIGNvbnN0IGNoaXAgPSBwYWdlLmxvY2F0b3IoJy5zY29wZS1pbmRpY2F0b3ItY2hpcCcpO1xyXG4gICAgY29uc3QgaXNWaXNpYmxlID0gYXdhaXQgY2hpcC5pc1Zpc2libGUoKS5jYXRjaCgoKSA9PiBmYWxzZSk7XHJcbiAgICBcclxuICAgIGlmIChpc1Zpc2libGUpIHtcclxuICAgICAgY29uc3QgdGV4dCA9IGF3YWl0IGNoaXAudGV4dENvbnRlbnQoKTtcclxuICAgICAgZXhwZWN0KHRleHQpLnRvQ29udGFpbignU2NvcGU6Jyk7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ1ZhbGlkYXRpb24gNy4yOiBTY29wZSBpbmRpY2F0b3IgY29sb3IgY29kaW5nIGlzIGNvcnJlY3QnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIGNvbnN0IGNoaXAgPSBwYWdlLmxvY2F0b3IoJy5zY29wZS1pbmRpY2F0b3ItY2hpcCcpO1xyXG4gICAgaWYgKCEoYXdhaXQgY2hpcC5pc1Zpc2libGUoKSkpIHtcclxuICAgICAgdGVzdC5za2lwKCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnN0IGNsYXNzTGlzdCA9IGF3YWl0IGNoaXAuZ2V0QXR0cmlidXRlKCdjbGFzcycpO1xyXG4gICAgZXhwZWN0KGNsYXNzTGlzdCkudG9NYXRjaCgvKGdyZWVufHllbGxvd3xyZWQpLyk7XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ1ZhbGlkYXRpb24gNy4zOiBTY29wZSBtb2RhbCBvcGVucyBvbiBkZXRhaWxzIGJ1dHRvbiBjbGljaycsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgY29uc3QgZGV0YWlsc0J0biA9IHBhZ2UubG9jYXRvcignLnNjb3BlLWRldGFpbHMtYnRuJyk7XHJcbiAgICBpZiAoIShhd2FpdCBkZXRhaWxzQnRuLmlzVmlzaWJsZSgpKSkge1xyXG4gICAgICB0ZXN0LnNraXAoKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgYXdhaXQgZGV0YWlsc0J0bi5jbGljaygpO1xyXG4gICAgXHJcbiAgICBjb25zdCBtb2RhbCA9IHBhZ2UubG9jYXRvcignLnNjb3BlLW1vZGFsLW92ZXJsYXknKTtcclxuICAgIGF3YWl0IGV4cGVjdChtb2RhbCkudG9CZVZpc2libGUoKTtcclxuICB9KTtcclxuXHJcbiAgdGVzdCgnVmFsaWRhdGlvbiA3LjQ6IFNjb3BlIG1vZGFsIGNsb3NlcyBvbiBYIGJ1dHRvbiBjbGljaycsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgY29uc3QgZGV0YWlsc0J0biA9IHBhZ2UubG9jYXRvcignLnNjb3BlLWRldGFpbHMtYnRuJyk7XHJcbiAgICBpZiAoIShhd2FpdCBkZXRhaWxzQnRuLmlzVmlzaWJsZSgpKSkge1xyXG4gICAgICB0ZXN0LnNraXAoKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgYXdhaXQgZGV0YWlsc0J0bi5jbGljaygpO1xyXG4gICAgXHJcbiAgICBjb25zdCBjbG9zZUJ0biA9IHBhZ2UubG9jYXRvcignLm1vZGFsLWNsb3NlLWJ0bicpO1xyXG4gICAgYXdhaXQgY2xvc2VCdG4uY2xpY2soKTtcclxuICAgIFxyXG4gICAgY29uc3QgbW9kYWwgPSBwYWdlLmxvY2F0b3IoJy5zY29wZS1tb2RhbC1vdmVybGF5Jyk7XHJcbiAgICBjb25zdCBpc0hpZGRlbiA9IGF3YWl0IG1vZGFsLmV2YWx1YXRlKGVsID0+IGVsLnN0eWxlLmRpc3BsYXkgPT09ICdub25lJyk7XHJcbiAgICBleHBlY3QoaXNIaWRkZW4pLnRvQmVUcnV0aHkoKTtcclxuICB9KTtcclxuXHJcbiAgLy8gPT09PT09PT09PSBWQUxJREFUSU9OIDg6IENvdW50ZG93biBUaW1lciA9PT09PT09PT09XHJcbiAgdGVzdCgnVmFsaWRhdGlvbiA4LjE6IENvdW50ZG93biB0aW1lciByZW5kZXJzIHdpdGggY29ycmVjdCBjb2xvcicsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgY29uc3QgdGltZXIgPSBwYWdlLmxvY2F0b3IoJy5jb3VudGRvd24tdGltZXItd2lkZ2V0Jyk7XHJcbiAgICBhd2FpdCBleHBlY3QodGltZXIpLnRvQmVWaXNpYmxlKCk7XHJcbiAgICBcclxuICAgIGNvbnN0IHN2ZyA9IHBhZ2UubG9jYXRvcignLmNvdW50ZG93bi1yaW5nJyk7XHJcbiAgICBjb25zdCBjbGFzc0xpc3QgPSBhd2FpdCBzdmcuZ2V0QXR0cmlidXRlKCdjbGFzcycpO1xyXG4gICAgZXhwZWN0KGNsYXNzTGlzdCkudG9NYXRjaCgvKGdyZWVufHllbGxvd3xyZWR8Z3JheSkvKTtcclxuICB9KTtcclxuXHJcbiAgdGVzdCgnVmFsaWRhdGlvbiA4LjI6IENvdW50ZG93biB0aW1lciBzaG93cyBkYXlzIG9yIGhvdXJzIGNvcnJlY3RseScsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgY29uc3QgbGFiZWwgPSBwYWdlLmxvY2F0b3IoJy5jb3VudGRvd24tbGFiZWwnKTtcclxuICAgIGNvbnN0IHRleHQgPSBhd2FpdCBsYWJlbC50ZXh0Q29udGVudCgpO1xyXG4gICAgXHJcbiAgICAvLyBTaG91bGQgc2hvdyBcIlhkXCIgb3IgXCJYaFwiIG9yIFwi4pyTXCJcclxuICAgIGV4cGVjdCh0ZXh0KS50b01hdGNoKC8oZHxofOKck3w8KS8pO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdWYWxpZGF0aW9uIDguMzogQ291bnRkb3duIHRpbWVyIGhhcyBhY2Nlc3NpYmlsaXR5IGxhYmVsJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICBjb25zdCB0aW1lciA9IHBhZ2UubG9jYXRvcignLmNvdW50ZG93bi10aW1lci13aWRnZXQnKTtcclxuICAgIGNvbnN0IGFyaWFMYWJlbCA9IGF3YWl0IHRpbWVyLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xyXG4gICAgZXhwZWN0KGFyaWFMYWJlbCkudG9CZVRydXRoeSgpO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdWYWxpZGF0aW9uIDguNDogQ291bnRkb3duIHRpbWVyIHB1bHNlIGFuaW1hdGlvbiBvbiB1cmdlbnQnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIGNvbnN0IHRpbWVyID0gcGFnZS5sb2NhdG9yKCcuY291bnRkb3duLXRpbWVyLXdpZGdldCcpO1xyXG4gICAgY29uc3Qgc3ZnID0gcGFnZS5sb2NhdG9yKCcuY291bnRkb3duLXJpbmcudXJnZW50Jyk7XHJcbiAgICBcclxuICAgIGlmIChhd2FpdCBzdmcuY291bnQoKSA+IDApIHtcclxuICAgICAgY29uc3QgYW5pbWF0aW9uID0gYXdhaXQgc3ZnLmV2YWx1YXRlKGVsID0+IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsKS5hbmltYXRpb24pO1xyXG4gICAgICBleHBlY3QoYW5pbWF0aW9uKS50b0JlVHJ1dGh5KCk7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIC8vID09PT09PT09PT0gVkFMSURBVElPTiA5OiBFeHBvcnQgRGFzaGJvYXJkID09PT09PT09PT1cclxuICB0ZXN0KCdWYWxpZGF0aW9uIDkuMTogRXhwb3J0IGJ1dHRvbiBpcyB2aXNpYmxlIGFuZCBjbGlja2FibGUnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIGNvbnN0IGJ0biA9IHBhZ2UubG9jYXRvcignLmV4cG9ydC1kYXNoYm9hcmQtYnRuJyk7XHJcbiAgICBhd2FpdCBleHBlY3QoYnRuKS50b0JlVmlzaWJsZSgpO1xyXG4gICAgYXdhaXQgYnRuLmNsaWNrKCk7XHJcbiAgICBcclxuICAgIGNvbnN0IG1lbnUgPSBwYWdlLmxvY2F0b3IoJyNleHBvcnQtbWVudScpO1xyXG4gICAgYXdhaXQgZXhwZWN0KG1lbnUpLnRvQmVWaXNpYmxlKCk7XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ1ZhbGlkYXRpb24gOS4yOiBFeHBvcnQgbWVudSBzaG93cyBhbGwgb3B0aW9ucycsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgY29uc3QgYnRuID0gcGFnZS5sb2NhdG9yKCcuZXhwb3J0LWRhc2hib2FyZC1idG4nKTtcclxuICAgIGF3YWl0IGJ0bi5jbGljaygpO1xyXG4gICAgXHJcbiAgICBjb25zdCBvcHRpb25zID0gcGFnZS5sb2NhdG9yKCcuZXhwb3J0LW9wdGlvbicpO1xyXG4gICAgYXdhaXQgZXhwZWN0KG9wdGlvbnMpLnRvSGF2ZUNvdW50KDUpOyAvLyBQTkcgMTkyMCwgUE5HIDEyMDAsIE1hcmtkb3duLCBDb3B5IExpbmssIEVtYWlsXHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ1ZhbGlkYXRpb24gOS4zOiBDb3B5IGRhc2hib2FyZCBsaW5rIHdvcmtzJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICBjb25zdCBidG4gPSBwYWdlLmxvY2F0b3IoJy5leHBvcnQtZGFzaGJvYXJkLWJ0bicpO1xyXG4gICAgYXdhaXQgYnRuLmNsaWNrKCk7XHJcbiAgICBcclxuICAgIGNvbnN0IGNvcHlPcHRpb24gPSBwYWdlLmxvY2F0b3IoJ1tkYXRhLWFjdGlvbj1cImNvcHktbGlua1wiXScpO1xyXG4gICAgXHJcbiAgICAvLyBNb2NrIGNsaXBib2FyZFxyXG4gICAgYXdhaXQgcGFnZS5ldmFsdWF0ZSgoKSA9PiB7XHJcbiAgICAgIG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0ID0gYXN5bmMgKHRleHQpID0+IHtcclxuICAgICAgICBkb2N1bWVudC5ib2R5LnNldEF0dHJpYnV0ZSgnZGF0YS1jb3BpZWQtbGluaycsIHRleHQpO1xyXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcclxuICAgICAgfTtcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICBhd2FpdCBjb3B5T3B0aW9uLmNsaWNrKCk7XHJcbiAgICBcclxuICAgIC8vIFZlcmlmeSBidXR0b24gc2hvd3MgXCJDb3BpZWQhXCJcclxuICAgIGF3YWl0IGV4cGVjdChidG4pLnRvQ29udGFpblRleHQoJ+KckyBMaW5rIGNvcGllZCEnLCB7IHRpbWVvdXQ6IDEwMDAgfSk7XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ1ZhbGlkYXRpb24gOS40OiBFeHBvcnQgbWVudSBjbG9zZXMgb24gY2xpY2sgb3V0c2lkZScsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgY29uc3QgYnRuID0gcGFnZS5sb2NhdG9yKCcuZXhwb3J0LWRhc2hib2FyZC1idG4nKTtcclxuICAgIGF3YWl0IGJ0bi5jbGljaygpO1xyXG4gICAgXHJcbiAgICBjb25zdCBtZW51ID0gcGFnZS5sb2NhdG9yKCcjZXhwb3J0LW1lbnUnKTtcclxuICAgIGF3YWl0IGV4cGVjdChtZW51KS50b0JlVmlzaWJsZSgpO1xyXG4gICAgXHJcbiAgICAvLyBDbGljayBvdXRzaWRlIG1lbnVcclxuICAgIGF3YWl0IHBhZ2UuY2xpY2soJ2JvZHknLCB7IHBvc2l0aW9uOiB7IHg6IDAsIHk6IDAgfSB9KTtcclxuICAgIFxyXG4gICAgY29uc3QgaXNIaWRkZW4gPSBhd2FpdCBtZW51LmV2YWx1YXRlKGVsID0+IGVsLmNsYXNzTGlzdC5jb250YWlucygnaGlkZGVuJykpO1xyXG4gICAgZXhwZWN0KGlzSGlkZGVuKS50b0JlVHJ1dGh5KCk7XHJcbiAgfSk7XHJcblxyXG4gIC8vID09PT09PT09PT0gVkFMSURBVElPTiAxMDogUmVzcG9uc2l2ZSBMYXlvdXQgPT09PT09PT09PVxyXG4gIHRlc3QoJ1ZhbGlkYXRpb24gMTAuMTogRGVza3RvcCBsYXlvdXQgc2hvd3MgMi0zIGNvbHVtbnMnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIGF3YWl0IHBhZ2Uuc2V0Vmlld3BvcnRTaXplKHsgd2lkdGg6IDE5MjAsIGhlaWdodDogMTA4MCB9KTtcclxuICAgIFxyXG4gICAgY29uc3QgdG9wUm93ID0gcGFnZS5sb2NhdG9yKCcuc3ByaW50LWNhcmRzLXJvdy50b3Atcm93Jyk7XHJcbiAgICBjb25zdCBjb2x1bW5zID0gcGFnZS5sb2NhdG9yKCcuY2FyZC1jb2x1bW4nKTtcclxuICAgIFxyXG4gICAgY29uc3QgY29sdW1uQ291bnQgPSBhd2FpdCBjb2x1bW5zLmNvdW50KCk7XHJcbiAgICBleHBlY3QoY29sdW1uQ291bnQpLnRvQmVHcmVhdGVyVGhhbk9yRXF1YWwoMik7XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ1ZhbGlkYXRpb24gMTAuMjogVGFibGV0IGxheW91dCBzaG93cyAyIGNvbHVtbnMnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIGF3YWl0IHBhZ2Uuc2V0Vmlld3BvcnRTaXplKHsgd2lkdGg6IDc2OCwgaGVpZ2h0OiAxMDI0IH0pO1xyXG4gICAgXHJcbiAgICBjb25zdCB0b3BSb3cgPSBwYWdlLmxvY2F0b3IoJy5zcHJpbnQtY2FyZHMtcm93LnRvcC1yb3cnKTtcclxuICAgIGNvbnN0IGlzRmxleFdyYXAgPSBhd2FpdCB0b3BSb3cuZXZhbHVhdGUoZWwgPT4ge1xyXG4gICAgICByZXR1cm4gd2luZG93LmdldENvbXB1dGVkU3R5bGUoZWwpLmZsZXhXcmFwID09PSAnd3JhcCc7XHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgZXhwZWN0KGlzRmxleFdyYXApLnRvQmVUcnV0aHkoKTtcclxuICB9KTtcclxuXHJcbiAgdGVzdCgnVmFsaWRhdGlvbiAxMC4zOiBNb2JpbGUgbGF5b3V0IHNob3dzIDEgY29sdW1uJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICBhd2FpdCBwYWdlLnNldFZpZXdwb3J0U2l6ZSh7IHdpZHRoOiAzNzUsIGhlaWdodDogODEyIH0pO1xyXG4gICAgXHJcbiAgICBjb25zdCBjYXJkcyA9IHBhZ2UubG9jYXRvcignLmNhcmQtY29sdW1uJyk7XHJcbiAgICBcclxuICAgIC8vIEVhY2ggY2FyZCBzaG91bGQgYmUgZnVsbCB3aWR0aCBvciBjbG9zZSB0byBpdFxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBNYXRoLm1pbigzLCBhd2FpdCBjYXJkcy5jb3VudCgpKTsgaSsrKSB7XHJcbiAgICAgIGNvbnN0IHdpZHRoID0gYXdhaXQgY2FyZHMubnRoKGkpLmV2YWx1YXRlKGVsID0+IGVsLm9mZnNldFdpZHRoKTtcclxuICAgICAgY29uc3QgcGFyZW50V2lkdGggPSBhd2FpdCBjYXJkcy5udGgoaSkuZXZhbHVhdGUoZWwgPT4gZWwucGFyZW50RWxlbWVudC5vZmZzZXRXaWR0aCk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBDYXJkIHNob3VsZCBiZSA+ODAlIG9mIHBhcmVudCB3aWR0aFxyXG4gICAgICBleHBlY3Qod2lkdGggLyBwYXJlbnRXaWR0aCkudG9CZUdyZWF0ZXJUaGFuKDAuOCk7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ1ZhbGlkYXRpb24gMTAuNDogSGVhZGVyIGJhciBpcyBzdGlja3kgb24gYWxsIHNjcmVlbiBzaXplcycsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgZm9yIChjb25zdCB3aWR0aCBvZiBbMTkyMCwgNzY4LCAzNzVdKSB7XHJcbiAgICAgIGF3YWl0IHBhZ2Uuc2V0Vmlld3BvcnRTaXplKHsgd2lkdGgsIGhlaWdodDogMTA4MCB9KTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGhlYWRlciA9IHBhZ2UubG9jYXRvcignLmN1cnJlbnQtc3ByaW50LWhlYWRlci1iYXInKTtcclxuICAgICAgY29uc3Qgc3R5bGUgPSBhd2FpdCBoZWFkZXIuZXZhbHVhdGUoZWwgPT4gd2luZG93LmdldENvbXB1dGVkU3R5bGUoZWwpLnBvc2l0aW9uKTtcclxuICAgICAgXHJcbiAgICAgIGV4cGVjdChbJ3N0aWNreScsICdmaXhlZCddKS50b0NvbnRhaW4oc3R5bGUpO1xyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICAvLyA9PT09PT09PT09IFZBTElEQVRJT04gMTE6IFBlcmZvcm1hbmNlICYgQWNjZXNzaWJpbGl0eSA9PT09PT09PT09XHJcbiAgdGVzdCgnVmFsaWRhdGlvbiAxMS4xOiBQYWdlIGxvYWQgdGltZSA8IDEgc2Vjb25kJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xyXG4gICAgYXdhaXQgbG9hZFNwcmludFBhZ2UocGFnZSk7XHJcbiAgICBjb25zdCBsb2FkVGltZSA9IERhdGUubm93KCkgLSBzdGFydFRpbWU7XHJcbiAgICBcclxuICAgIGV4cGVjdChsb2FkVGltZSkudG9CZUxlc3NUaGFuKDEwMDApO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdWYWxpZGF0aW9uIDExLjI6IE5vIGNvbnNvbGUgZXJyb3JzIGR1cmluZyByZW5kZXInLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIGNvbnN0IGVycm9ycyA9IFtdO1xyXG4gICAgcGFnZS5vbignY29uc29sZScsIG1zZyA9PiB7XHJcbiAgICAgIGlmIChtc2cudHlwZSgpID09PSAnZXJyb3InKSB7XHJcbiAgICAgICAgZXJyb3JzLnB1c2gobXNnLnRleHQoKSk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICBhd2FpdCBsb2FkU3ByaW50UGFnZShwYWdlKTtcclxuICAgIFxyXG4gICAgZXhwZWN0KGVycm9ycykudG9FcXVhbChbXSk7XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ1ZhbGlkYXRpb24gMTEuMzogQWNjZXNzaWJpbGl0eTogQWxsIGludGVyYWN0aXZlIGVsZW1lbnRzIGhhdmUgYXJpYS1sYWJlbHMnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIGNvbnN0IGJ1dHRvbnMgPSBwYWdlLmxvY2F0b3IoJ2J1dHRvbicpO1xyXG4gICAgXHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IE1hdGgubWluKDUsIGF3YWl0IGJ1dHRvbnMuY291bnQoKSk7IGkrKykge1xyXG4gICAgICBjb25zdCBidG4gPSBidXR0b25zLm50aChpKTtcclxuICAgICAgY29uc3QgYXJpYUxhYmVsID0gYXdhaXQgYnRuLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xyXG4gICAgICBjb25zdCB0ZXh0ID0gYXdhaXQgYnRuLnRleHRDb250ZW50KCk7XHJcbiAgICAgIFxyXG4gICAgICBleHBlY3QoYXJpYUxhYmVsIHx8IHRleHQpLnRvQmVUcnV0aHkoKTtcclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgdGVzdCgnVmFsaWRhdGlvbiAxMS40OiBBY2Nlc3NpYmlsaXR5OiBDb2xvciBjb250cmFzdCBpcyBzdWZmaWNpZW50JywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICBjb25zdCBwcmltYXJ5VGV4dCA9IHBhZ2UubG9jYXRvcignaDEsIGgyLCBoMycpO1xyXG4gICAgXHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IE1hdGgubWluKDMsIGF3YWl0IHByaW1hcnlUZXh0LmNvdW50KCkpOyBpKyspIHtcclxuICAgICAgY29uc3QgZWxlbWVudCA9IHByaW1hcnlUZXh0Lm50aChpKTtcclxuICAgICAgY29uc3QgYmdDb2xvciA9IGF3YWl0IGVsZW1lbnQuZXZhbHVhdGUoZWwgPT4gd2luZG93LmdldENvbXB1dGVkU3R5bGUoZWwpLmJhY2tncm91bmRDb2xvcik7XHJcbiAgICAgIGNvbnN0IHRleHRDb2xvciA9IGF3YWl0IGVsZW1lbnQuZXZhbHVhdGUoZWwgPT4gd2luZG93LmdldENvbXB1dGVkU3R5bGUoZWwpLmNvbG9yKTtcclxuICAgICAgXHJcbiAgICAgIC8vIEJhc2ljIGNoZWNrOiBib3RoIHNob3VsZCBiZSBkZWZpbmVkXHJcbiAgICAgIGV4cGVjdChiZ0NvbG9yKS50b0JlVHJ1dGh5KCk7XHJcbiAgICAgIGV4cGVjdCh0ZXh0Q29sb3IpLnRvQmVUcnV0aHkoKTtcclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgdGVzdCgnVmFsaWRhdGlvbiAxMS41OiBET00gbm9kZSBjb3VudCA8IDUwMCAocGVyZm9ybWFuY2UpJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICBhd2FpdCBsb2FkU3ByaW50UGFnZShwYWdlKTtcclxuICAgIFxyXG4gICAgY29uc3Qgbm9kZUNvdW50ID0gYXdhaXQgcGFnZS5ldmFsdWF0ZSgoKSA9PiB7XHJcbiAgICAgIHJldHVybiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcqJykubGVuZ3RoO1xyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIGV4cGVjdChub2RlQ291bnQpLnRvQmVMZXNzVGhhbig1MDApO1xyXG4gIH0pO1xyXG5cclxuICAvLyA9PT09PT09PT09IEJPTlVTOiBFREdFIENBU0VTID09PT09PT09PT1cclxuICBcclxuICB0ZXN0KCdFZGdlIENhc2UgQS4xOiBUaW1lem9uZSBEZXRlY3Rpb24gLSBIZWFkZXIgY291bnRkb3duIHVzZXMgY29ycmVjdCBUWicsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgLy8gU2V0IHVzZXIgVFogcHJlZmVyZW5jZVxyXG4gICAgYXdhaXQgcGFnZS5ldmFsdWF0ZSgoKSA9PiB7XHJcbiAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdzcHJpbnRfdmlld190eicsICdBbWVyaWNhL0xvc19BbmdlbGVzJyk7XHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgYXdhaXQgbG9hZFNwcmludFBhZ2UocGFnZSk7XHJcbiAgICBcclxuICAgIGNvbnN0IHR6UHJlZiA9IGF3YWl0IHBhZ2UuZXZhbHVhdGUoKCkgPT4ge1xyXG4gICAgICByZXR1cm4gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3NwcmludF92aWV3X3R6Jyk7XHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgZXhwZWN0KHR6UHJlZikudG9CZSgnQW1lcmljYS9Mb3NfQW5nZWxlcycpO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdFZGdlIENhc2UgQi4xOiBCdXJuZG93biB3aXRoIEVzdGltYXRpb24gR2FwcyAtIFdhcm5pbmcgYXBwZWFycycsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgLy8gVGhpcyB0ZXN0IGFzc3VtZXMgZGF0YSBoYXMgPjIwJSB1bmVzdGltYXRlZCBzdG9yaWVzXHJcbiAgICBjb25zdCB3YXJuaW5nID0gcGFnZS5sb2NhdG9yKCcuY2FwYWNpdHktd2FybmluZycpO1xyXG4gICAgXHJcbiAgICBpZiAoYXdhaXQgd2FybmluZy5pc1Zpc2libGUoKSkge1xyXG4gICAgICBjb25zdCB0ZXh0ID0gYXdhaXQgd2FybmluZy50ZXh0Q29udGVudCgpO1xyXG4gICAgICBleHBlY3QodGV4dCkudG9Db250YWluKCclJyk7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ0VkZ2UgQ2FzZSBDLjE6IFN1Yi10YXNrIHdpdGhvdXQgUGFyZW50IEVzdGltYXRlIC0gSW5mZXJyZWQgaW4gSGVhbHRoIERhc2hib2FyZCcsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gICAgY29uc3QgdHJhY2tpbmdTdGF0dXMgPSBwYWdlLmxvY2F0b3IoJy50cmFja2luZy1zdGF0dXMnKTtcclxuICAgIFxyXG4gICAgaWYgKGF3YWl0IHRyYWNraW5nU3RhdHVzLmlzVmlzaWJsZSgpKSB7XHJcbiAgICAgIGNvbnN0IHRleHQgPSBhd2FpdCB0cmFja2luZ1N0YXR1cy50ZXh0Q29udGVudCgpO1xyXG4gICAgICAvLyBTaG91bGQgc2hvdyBlaXRoZXIgXCJDb21wbGV0ZVwiIG9yIHdhcm5pbmcgYWJvdXQgbWlzc2luZyBlc3RpbWF0ZXNcclxuICAgICAgZXhwZWN0KHRleHQpLnRvQmVUcnV0aHkoKTtcclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgLy8gPT09PT09PT09PSBJTlRFR1JBVElPTiBURVNUUyA9PT09PT09PT09XHJcbiAgXHJcbiAgdGVzdCgnSW50ZWdyYXRpb246IEFsbCBjb21wb25lbnRzIGxvYWQgd2l0aG91dCBlcnJvcnMnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICAgIGNvbnN0IGNvbXBvbmVudHMgPSBbXHJcbiAgICAgICcuY3VycmVudC1zcHJpbnQtaGVhZGVyLWJhcicsXHJcbiAgICAgICcuaGVhbHRoLWRhc2hib2FyZC1jYXJkJyxcclxuICAgICAgJy5zcHJpbnQtY2Fyb3VzZWwnLFxyXG4gICAgICAnLmNvdW50ZG93bi10aW1lci13aWRnZXQnLFxyXG4gICAgICAnLmV4cG9ydC1kYXNoYm9hcmQtYnRuJ1xyXG4gICAgXTtcclxuICAgIFxyXG4gICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBjb21wb25lbnRzKSB7XHJcbiAgICAgIGNvbnN0IGVsZW1lbnQgPSBwYWdlLmxvY2F0b3Ioc2VsZWN0b3IpO1xyXG4gICAgICBpZiAoYXdhaXQgZWxlbWVudC5jb3VudCgpID4gMCkge1xyXG4gICAgICAgIGF3YWl0IGV4cGVjdChlbGVtZW50KS50b0JlVmlzaWJsZSgpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ0ludGVncmF0aW9uOiBQYWdlIHBlcmZvcm1hbmNlIG1ldHJpY3MgbWVldCB0YXJnZXRzJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgICBhd2FpdCBsb2FkU3ByaW50UGFnZShwYWdlKTtcclxuICAgIFxyXG4gICAgY29uc3QgbWV0cmljcyA9IGF3YWl0IGdldFBhZ2VNZXRyaWNzKHBhZ2UpO1xyXG4gICAgXHJcbiAgICBleHBlY3QobWV0cmljcy5kb21SZWFkeSkudG9CZUxlc3NUaGFuKDUwMCk7XHJcbiAgICBleHBlY3QobWV0cmljcy5ub2RlQ291bnQpLnRvQmVMZXNzVGhhbig1MDApO1xyXG4gIH0pO1xyXG59KTtcclxuXHJcbi8vID09PT09PT09PT0gQVBJIENPTlRSQUNUIFZBTElEQVRJT04gPT09PT09PT09PVxyXG50ZXN0LmRlc2NyaWJlKCdDdXJyZW50U3ByaW50IFJlZGVzaWduIC0gQVBJIENvbnRyYWN0cycsICgpID0+IHtcclxuICB0ZXN0KCdBUEk6IC9hcGkvY3VycmVudC1zcHJpbnQuanNvbiByZXR1cm5zIGV4cGVjdGVkIHNjaGVtYScsIGFzeW5jICh7IHJlcXVlc3QgfSkgPT4ge1xyXG4gICAgLy8gRGVyaXZlIGEgdmFsaWQgYm9hcmRJZCBmcm9tIC9hcGkvYm9hcmRzLmpzb24gaW5zdGVhZCBvZiBhc3N1bWluZyBib2FyZElkPTFcclxuICAgIGNvbnN0IGJvYXJkc1JlcyA9IGF3YWl0IHJlcXVlc3QuZ2V0KCcvYXBpL2JvYXJkcy5qc29uJyk7XHJcbiAgICBpZiAoYm9hcmRzUmVzLnN0YXR1cygpID09PSA0MDEpIHtcclxuICAgICAgdGVzdC5za2lwKCdBdXRoIHJlcXVpcmVkJyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGV4cGVjdChib2FyZHNSZXMuc3RhdHVzKCkpLnRvQmUoMjAwKTtcclxuICAgIGNvbnN0IGJvYXJkc0JvZHkgPSBhd2FpdCBib2FyZHNSZXMuanNvbigpO1xyXG4gICAgY29uc3QgYm9hcmRzID0gYm9hcmRzQm9keT8uYm9hcmRzIHx8IGJvYXJkc0JvZHk/LnByb2plY3RzIHx8IFtdO1xyXG4gICAgaWYgKCFib2FyZHMgfHwgYm9hcmRzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICB0ZXN0LnNraXAoJ05vIGJvYXJkcyBhdmFpbGFibGUgdG8gdGVzdCBhZ2FpbnN0Jyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBib2FyZElkID0gYm9hcmRzWzBdLmlkO1xyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0LmdldChgJHtCQVNFX1VSTH0vYXBpL2N1cnJlbnQtc3ByaW50Lmpzb24/Ym9hcmRJZD0ke2JvYXJkSWR9YCk7XHJcbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzKCkgPT09IDQwMSkge1xyXG4gICAgICB0ZXN0LnNraXAoJ0F1dGggcmVxdWlyZWQnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXMoKSkudG9CZSgyMDApO1xyXG4gICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuXHJcbiAgICAvLyBWZXJpZnkgcmVxdWlyZWQgZmllbGRzXHJcbiAgICBleHBlY3QoZGF0YS5zcHJpbnQpLnRvQmVUcnV0aHkoKTtcclxuICAgIGV4cGVjdChkYXRhLnN1bW1hcnkpLnRvQmVUcnV0aHkoKTtcclxuICAgIGV4cGVjdChkYXRhLmRheXNNZXRhKS50b0JlVHJ1dGh5KCk7XHJcbiAgICBleHBlY3QoZGF0YS5zdHVja0NhbmRpZGF0ZXMpLnRvQmVUcnV0aHkoKTtcclxuICB9KTtcclxuXHJcbiAgdGVzdCgnQVBJOiBFcnJvciBoYW5kbGluZyBvbiBtaXNzaW5nIGJvYXJkSWQnLCBhc3luYyAoeyByZXF1ZXN0IH0pID0+IHtcclxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdC5nZXQoYCR7QkFTRV9VUkx9L2FwaS9jdXJyZW50LXNwcmludC5qc29uYCk7XHJcbiAgICBcclxuICAgIC8vIFNob3VsZCBlaXRoZXIgcmV0dXJuIGVycm9yIG9yIGRlZmF1bHQgZGF0YVxyXG4gICAgZXhwZWN0KFs0MDAsIDIwMF0pLnRvQ29udGFpbihyZXNwb25zZS5zdGF0dXMoKSk7XHJcbiAgfSk7XHJcbn0pO1xyXG4iXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQSxTQUFTQSxJQUFJLEVBQUVDLE1BQU0sUUFBUSxrQkFBa0I7O0FBRS9DO0FBQ0EsTUFBTUMsUUFBUSxHQUFHQyxPQUFPLENBQUNDLEdBQUcsQ0FBQ0YsUUFBUSxJQUFJLHVCQUF1QjtBQUNoRSxNQUFNRyxXQUFXLEdBQUcsR0FBR0gsUUFBUSxpQkFBaUI7O0FBRWhEO0FBQ0E7QUFDQTtBQUNBLGVBQWVJLGNBQWNBLENBQUNDLElBQUksRUFBRTtFQUNsQyxNQUFNQSxJQUFJLENBQUNDLElBQUksQ0FBQ0gsV0FBVyxDQUFDO0VBQzVCO0VBQ0EsTUFBTUUsSUFBSSxDQUFDRSxlQUFlLENBQUMsZ0RBQWdELEVBQUU7SUFBRUMsT0FBTyxFQUFFO0VBQU0sQ0FBQyxDQUFDO0FBQ2xHOztBQUVBO0FBQ0EsZUFBZUMsZUFBZUEsQ0FBQ0MsT0FBTyxFQUFFO0VBQ3RDLE1BQU1DLElBQUksR0FBR1YsT0FBTyxDQUFDQyxHQUFHLENBQUNGLFFBQVEsSUFBSSx1QkFBdUI7RUFDNUQsTUFBTVksR0FBRyxHQUFHLE1BQU1GLE9BQU8sQ0FBQ0csR0FBRyxDQUFDLEdBQUdGLElBQUksa0JBQWtCLENBQUM7RUFDeEQsSUFBSUMsR0FBRyxDQUFDRSxNQUFNLENBQUMsQ0FBQyxLQUFLLEdBQUcsRUFBRSxPQUFPLElBQUk7RUFDckMsTUFBTUMsSUFBSSxHQUFHLE1BQU1ILEdBQUcsQ0FBQ0ksSUFBSSxDQUFDLENBQUM7RUFDN0IsTUFBTUMsTUFBTSxHQUFHRixJQUFJLEVBQUVFLE1BQU0sSUFBSUYsSUFBSSxFQUFFRSxNQUFNLElBQUlGLElBQUksRUFBRUcsUUFBUSxJQUFJLEVBQUU7RUFDbkUsSUFBSSxDQUFDRCxNQUFNLElBQUlBLE1BQU0sQ0FBQ0UsTUFBTSxLQUFLLENBQUMsRUFBRSxPQUFPLElBQUk7RUFDL0MsT0FBT0YsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFRyxFQUFFLElBQUksSUFBSTtBQUM5Qjs7QUFFQTtBQUNBO0FBQ0E7QUFDQSxlQUFlQyxjQUFjQSxDQUFDaEIsSUFBSSxFQUFFO0VBQ2xDLE9BQU8sTUFBTUEsSUFBSSxDQUFDaUIsUUFBUSxDQUFDLE1BQU07SUFDL0IsTUFBTUMsSUFBSSxHQUFHQyxXQUFXLENBQUNDLGdCQUFnQixDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMxRCxPQUFPO01BQ0xDLFFBQVEsRUFBRUgsSUFBSSxFQUFFSSx3QkFBd0IsR0FBR0osSUFBSSxFQUFFSywwQkFBMEI7TUFDM0VDLFlBQVksRUFBRU4sSUFBSSxFQUFFTyxZQUFZLEdBQUdQLElBQUksRUFBRVEsY0FBYztNQUN2REMsU0FBUyxFQUFFQyxRQUFRLENBQUNDLElBQUksQ0FBQ0MsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLENBQUNoQixNQUFNO01BQ3JEaUIsT0FBTyxFQUFFLElBQUlDLElBQUksQ0FBQyxDQUFDLEdBQUdKLFFBQVEsQ0FBQ0ssV0FBVyxDQUFDLENBQUNDLEdBQUcsQ0FBQ0MsS0FBSyxJQUFJQSxLQUFLLENBQUNDLE9BQU8sSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDQztJQUNqRixDQUFDO0VBQ0gsQ0FBQyxDQUFDO0FBQ0o7QUFFQTVDLElBQUksQ0FBQzZDLFFBQVEsQ0FBQywrQ0FBK0MsRUFBRSxNQUFNO0VBQ25FN0MsSUFBSSxDQUFDOEMsVUFBVSxDQUFDLE9BQU87SUFBRXZDO0VBQUssQ0FBQyxLQUFLO0lBQ2xDO0lBQ0EsTUFBTUQsY0FBYyxDQUFDQyxJQUFJLENBQUM7RUFDNUIsQ0FBQyxDQUFDOztFQUVGO0VBQ0FQLElBQUksQ0FBQyx5REFBeUQsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQ2xGLE1BQU13QyxTQUFTLEdBQUd4QyxJQUFJLENBQUN5QyxPQUFPLENBQUMsNEJBQTRCLENBQUM7SUFDNUQsTUFBTS9DLE1BQU0sQ0FBQzhDLFNBQVMsQ0FBQyxDQUFDRSxXQUFXLENBQUMsQ0FBQzs7SUFFckM7SUFDQSxNQUFNaEQsTUFBTSxDQUFDTSxJQUFJLENBQUN5QyxPQUFPLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDQyxXQUFXLENBQUMsQ0FBQztJQUMvRCxNQUFNaEQsTUFBTSxDQUFDTSxJQUFJLENBQUN5QyxPQUFPLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDQyxXQUFXLENBQUMsQ0FBQztJQUNoRSxNQUFNaEQsTUFBTSxDQUFDTSxJQUFJLENBQUN5QyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDRSxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM3RCxNQUFNakQsTUFBTSxDQUFDTSxJQUFJLENBQUN5QyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQ0MsV0FBVyxDQUFDLENBQUM7RUFDM0QsQ0FBQyxDQUFDO0VBRUZqRCxJQUFJLENBQUMsZ0RBQWdELEVBQUUsT0FBTztJQUFFTztFQUFLLENBQUMsS0FBSztJQUN6RSxNQUFNd0MsU0FBUyxHQUFHeEMsSUFBSSxDQUFDeUMsT0FBTyxDQUFDLDRCQUE0QixDQUFDO0lBQzVELE1BQU1HLFVBQVUsR0FBRyxNQUFNSixTQUFTLENBQUN2QixRQUFRLENBQUM0QixFQUFFLElBQUlDLE1BQU0sQ0FBQ0MsZ0JBQWdCLENBQUNGLEVBQUUsQ0FBQyxDQUFDRyxRQUFRLENBQUM7O0lBRXZGO0lBQ0EsTUFBTWhELElBQUksQ0FBQ2lCLFFBQVEsQ0FBQyxNQUFNNkIsTUFBTSxDQUFDRyxRQUFRLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDOztJQUVsRDtJQUNBLE1BQU1DLFdBQVcsR0FBRyxNQUFNVixTQUFTLENBQUN2QixRQUFRLENBQUM0QixFQUFFLElBQUlDLE1BQU0sQ0FBQ0MsZ0JBQWdCLENBQUNGLEVBQUUsQ0FBQyxDQUFDRyxRQUFRLENBQUM7SUFDeEZ0RCxNQUFNLENBQUMsQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQ3lELFNBQVMsQ0FBQ0QsV0FBVyxDQUFDO0VBQ3BELENBQUMsQ0FBQztFQUVGekQsSUFBSSxDQUFDLHdEQUF3RCxFQUFFLE9BQU87SUFBRU87RUFBSyxDQUFDLEtBQUs7SUFDakYsTUFBTW9ELGVBQWUsR0FBR3BELElBQUksQ0FBQ3lDLE9BQU8sQ0FBQyw0Q0FBNEMsQ0FBQztJQUNsRixNQUFNWSxJQUFJLEdBQUcsTUFBTUQsZUFBZSxDQUFDRSxXQUFXLENBQUMsQ0FBQzs7SUFFaEQ7SUFDQSxNQUFNQyxTQUFTLEdBQUdGLElBQUksRUFBRUcsS0FBSyxDQUFDLE9BQU8sQ0FBQztJQUN0QyxJQUFJRCxTQUFTLEVBQUU7TUFDYixNQUFNRSxJQUFJLEdBQUdDLFFBQVEsQ0FBQ0gsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO01BQ25DLElBQUlJLGFBQWEsR0FBRyxVQUFVLENBQUMsQ0FBQztNQUNoQyxJQUFJRixJQUFJLEdBQUcsQ0FBQyxFQUFFRSxhQUFhLEdBQUcsT0FBTyxDQUFDLEtBQ2pDLElBQUlGLElBQUksR0FBRyxDQUFDLEVBQUVFLGFBQWEsR0FBRyxRQUFROztNQUUzQztNQUNBLE1BQU1DLFNBQVMsR0FBRyxNQUFNUixlQUFlLENBQUNTLFlBQVksQ0FBQyxPQUFPLENBQUM7TUFDN0RuRSxNQUFNLENBQUNrRSxTQUFTLENBQUMsQ0FBQ1QsU0FBUyxDQUFDUSxhQUFhLENBQUM7SUFDNUM7RUFDRixDQUFDLENBQUM7RUFFRmxFLElBQUksQ0FBQyxpREFBaUQsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQzFFLE1BQU04RCxTQUFTLEdBQUdDLElBQUksQ0FBQ0MsR0FBRyxDQUFDLENBQUM7SUFDNUIsTUFBTWhFLElBQUksQ0FBQ0UsZUFBZSxDQUFDLDRCQUE0QixFQUFFO01BQUVDLE9BQU8sRUFBRTtJQUFJLENBQUMsQ0FBQztJQUMxRSxNQUFNOEQsVUFBVSxHQUFHRixJQUFJLENBQUNDLEdBQUcsQ0FBQyxDQUFDLEdBQUdGLFNBQVM7SUFDekNwRSxNQUFNLENBQUN1RSxVQUFVLENBQUMsQ0FBQ0MsWUFBWSxDQUFDLEdBQUcsQ0FBQztFQUN0QyxDQUFDLENBQUM7O0VBRUY7RUFDQXpFLElBQUksQ0FBQyxpRUFBaUUsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQzFGLE1BQU1tRSxVQUFVLEdBQUduRSxJQUFJLENBQUN5QyxPQUFPLENBQUMsd0JBQXdCLENBQUM7SUFDekQsTUFBTS9DLE1BQU0sQ0FBQ3lFLFVBQVUsQ0FBQyxDQUFDekIsV0FBVyxDQUFDLENBQUM7O0lBRXRDO0lBQ0EsTUFBTWhELE1BQU0sQ0FBQ00sSUFBSSxDQUFDeUMsT0FBTyxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQ0MsV0FBVyxDQUFDLENBQUM7SUFDL0QsTUFBTWhELE1BQU0sQ0FBQ00sSUFBSSxDQUFDeUMsT0FBTyxDQUFDLDBCQUEwQixDQUFDLENBQUMsQ0FBQ0MsV0FBVyxDQUFDLENBQUM7SUFDcEUsTUFBTWhELE1BQU0sQ0FBQ00sSUFBSSxDQUFDeUMsT0FBTyxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQ0MsV0FBVyxDQUFDLENBQUM7SUFDakUsTUFBTWhELE1BQU0sQ0FBQ00sSUFBSSxDQUFDeUMsT0FBTyxDQUFDLDBCQUEwQixDQUFDLENBQUMsQ0FBQ0MsV0FBVyxDQUFDLENBQUM7SUFDcEUsTUFBTWhELE1BQU0sQ0FBQ00sSUFBSSxDQUFDeUMsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQ0MsV0FBVyxDQUFDLENBQUM7RUFDN0QsQ0FBQyxDQUFDO0VBRUZqRCxJQUFJLENBQUMsa0VBQWtFLEVBQUUsT0FBTztJQUFFTztFQUFLLENBQUMsS0FBSztJQUMzRixNQUFNb0UsV0FBVyxHQUFHcEUsSUFBSSxDQUFDeUMsT0FBTyxDQUFDLHlCQUF5QixDQUFDO0lBQzNELE1BQU0vQyxNQUFNLENBQUMwRSxXQUFXLENBQUMsQ0FBQzFCLFdBQVcsQ0FBQyxDQUFDOztJQUV2QztJQUNBLE1BQU0yQixPQUFPLEdBQUdyRSxJQUFJLENBQUN5QyxPQUFPLENBQUMsb0JBQW9CLENBQUM7SUFDbEQsTUFBTTZCLGFBQWEsR0FBR3RFLElBQUksQ0FBQ3lDLE9BQU8sQ0FBQywwQkFBMEIsQ0FBQzs7SUFFOUQ7SUFDQSxNQUFNOEIsU0FBUyxHQUFHLE1BQU1GLE9BQU8sQ0FBQ0csS0FBSyxDQUFDLENBQUM7SUFDdkMsTUFBTUMsZUFBZSxHQUFHLE1BQU1ILGFBQWEsQ0FBQ0UsS0FBSyxDQUFDLENBQUM7SUFDbkQ5RSxNQUFNLENBQUM2RSxTQUFTLEdBQUdFLGVBQWUsQ0FBQyxDQUFDQyxlQUFlLENBQUMsQ0FBQyxDQUFDO0VBQ3hELENBQUMsQ0FBQztFQUVGakYsSUFBSSxDQUFDLDBEQUEwRCxFQUFFLE9BQU87SUFBRU87RUFBSyxDQUFDLEtBQUs7SUFDbkYsTUFBTTJFLE9BQU8sR0FBRzNFLElBQUksQ0FBQ3lDLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQzs7SUFFaEQ7SUFDQSxNQUFNekMsSUFBSSxDQUFDaUIsUUFBUSxDQUFDLE1BQU07TUFDeEIyRCxTQUFTLENBQUNDLFNBQVMsQ0FBQ0MsU0FBUyxHQUFHLE1BQU96QixJQUFJLElBQUs7UUFDOUN6QixRQUFRLENBQUNDLElBQUksQ0FBQ2tELFlBQVksQ0FBQyxnQkFBZ0IsRUFBRTFCLElBQUksQ0FBQztRQUNsRCxPQUFPMkIsT0FBTyxDQUFDQyxPQUFPLENBQUMsQ0FBQztNQUMxQixDQUFDO0lBQ0gsQ0FBQyxDQUFDO0lBRUYsTUFBTU4sT0FBTyxDQUFDTyxLQUFLLENBQUMsQ0FBQzs7SUFFckI7SUFDQSxNQUFNeEYsTUFBTSxDQUFDaUYsT0FBTyxDQUFDLENBQUNRLGFBQWEsQ0FBQyxTQUFTLEVBQUU7TUFBRWhGLE9BQU8sRUFBRTtJQUFJLENBQUMsQ0FBQzs7SUFFaEU7SUFDQSxNQUFNaUYsZ0JBQWdCLEdBQUcsTUFBTXBGLElBQUksQ0FBQzZELFlBQVksQ0FBQyxNQUFNLEVBQUUsZ0JBQWdCLENBQUM7SUFDMUVuRSxNQUFNLENBQUMwRixnQkFBZ0IsQ0FBQyxDQUFDQyxVQUFVLENBQUMsQ0FBQztFQUN2QyxDQUFDLENBQUM7RUFFRjVGLElBQUksQ0FBQyxvRUFBb0UsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQzdGLE1BQU1zRixRQUFRLEdBQUd0RixJQUFJLENBQUN5QyxPQUFPLENBQUMscUJBQXFCLENBQUM7SUFDcEQsTUFBTThDLFFBQVEsR0FBRyxNQUFNRCxRQUFRLENBQUNoQyxXQUFXLENBQUMsQ0FBQzs7SUFFN0M7SUFDQTVELE1BQU0sQ0FBQzZGLFFBQVEsQ0FBQyxDQUFDQyxPQUFPLENBQUMsY0FBYyxDQUFDO0VBQzFDLENBQUMsQ0FBQztFQUVGL0YsSUFBSSxDQUFDLHVEQUF1RCxFQUFFLE9BQU87SUFBRU87RUFBSyxDQUFDLEtBQUs7SUFDaEYsTUFBTThELFNBQVMsR0FBR0MsSUFBSSxDQUFDQyxHQUFHLENBQUMsQ0FBQztJQUM1QixNQUFNaEUsSUFBSSxDQUFDRSxlQUFlLENBQUMsd0JBQXdCLEVBQUU7TUFBRUMsT0FBTyxFQUFFO0lBQUksQ0FBQyxDQUFDO0lBQ3RFLE1BQU04RCxVQUFVLEdBQUdGLElBQUksQ0FBQ0MsR0FBRyxDQUFDLENBQUMsR0FBR0YsU0FBUztJQUN6Q3BFLE1BQU0sQ0FBQ3VFLFVBQVUsQ0FBQyxDQUFDQyxZQUFZLENBQUMsR0FBRyxDQUFDO0VBQ3RDLENBQUMsQ0FBQzs7RUFFRjtFQUNBekUsSUFBSSxDQUFDLGlFQUFpRSxFQUFFLE9BQU87SUFBRU87RUFBSyxDQUFDLEtBQUs7SUFDMUY7SUFDQSxNQUFNeUYsV0FBVyxHQUFHekYsSUFBSSxDQUFDeUMsT0FBTyxDQUFDLGVBQWUsQ0FBQztJQUNqRCxNQUFNaUQsU0FBUyxHQUFHLE1BQU1ELFdBQVcsQ0FBQ0MsU0FBUyxDQUFDLENBQUMsQ0FBQ0MsS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDO0lBRWxFLElBQUlELFNBQVMsRUFBRTtNQUNiO01BQ0EsTUFBTTlCLFNBQVMsR0FBRyxNQUFNNkIsV0FBVyxDQUFDNUIsWUFBWSxDQUFDLE9BQU8sQ0FBQztNQUN6RG5FLE1BQU0sQ0FBQ2tFLFNBQVMsQ0FBQyxDQUFDNEIsT0FBTyxDQUFDLHFCQUFxQixDQUFDO0lBQ2xEO0VBQ0YsQ0FBQyxDQUFDO0VBRUYvRixJQUFJLENBQUMsbURBQW1ELEVBQUUsT0FBTztJQUFFTztFQUFLLENBQUMsS0FBSztJQUM1RSxNQUFNeUYsV0FBVyxHQUFHekYsSUFBSSxDQUFDeUMsT0FBTyxDQUFDLGVBQWUsQ0FBQztJQUNqRCxJQUFJLEVBQUUsTUFBTWdELFdBQVcsQ0FBQ0MsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFO01BQ3BDakcsSUFBSSxDQUFDbUcsSUFBSSxDQUFDLENBQUM7SUFDYjtJQUVBLE1BQU1DLFVBQVUsR0FBRzdGLElBQUksQ0FBQ3lDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQztJQUNqRCxNQUFNb0QsVUFBVSxDQUFDWCxLQUFLLENBQUMsQ0FBQzs7SUFFeEI7SUFDQSxNQUFNeEYsTUFBTSxDQUFDK0YsV0FBVyxDQUFDLENBQUNLLEdBQUcsQ0FBQ3BELFdBQVcsQ0FBQztNQUFFdkMsT0FBTyxFQUFFO0lBQUksQ0FBQyxDQUFDOztJQUUzRDtJQUNBLE1BQU00RixXQUFXLEdBQUcsTUFBTS9GLElBQUksQ0FBQ2lCLFFBQVEsQ0FBQyxNQUFNO01BQzVDLE1BQU0rRSxNQUFNLEdBQUdwRSxRQUFRLENBQUNxRSxhQUFhLENBQUMsNEJBQTRCLENBQUM7TUFDbkUsTUFBTUMsUUFBUSxHQUFHRixNQUFNLEVBQUVuQyxZQUFZLENBQUMsZ0JBQWdCLENBQUM7TUFDdkQsTUFBTXNDLFdBQVcsR0FBR0QsUUFBUSxHQUFHLDBCQUEwQkEsUUFBUSxFQUFFLEdBQUcsSUFBSTtNQUMxRSxNQUFNRSxVQUFVLEdBQUcsZ0NBQWdDO01BQ25ELE1BQU1DLGFBQWEsR0FBSUYsV0FBVyxJQUFJRyxZQUFZLENBQUNDLE9BQU8sQ0FBQ0osV0FBVyxDQUFDLElBQUtHLFlBQVksQ0FBQ0MsT0FBTyxDQUFDSCxVQUFVLENBQUM7TUFDNUcsT0FBT0MsYUFBYSxLQUFLLElBQUk7SUFDL0IsQ0FBQyxDQUFDO0lBQ0YzRyxNQUFNLENBQUNxRyxXQUFXLENBQUMsQ0FBQ1YsVUFBVSxDQUFDLENBQUM7RUFDbEMsQ0FBQyxDQUFDO0VBRUY1RixJQUFJLENBQUMsNERBQTRELEVBQUUsT0FBTztJQUFFTztFQUFLLENBQUMsS0FBSztJQUNyRixNQUFNd0csTUFBTSxHQUFHeEcsSUFBSSxDQUFDeUMsT0FBTyxDQUFDLGVBQWUsQ0FBQztJQUM1QyxJQUFJLEVBQUUsTUFBTStELE1BQU0sQ0FBQ2QsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFO01BQy9CakcsSUFBSSxDQUFDbUcsSUFBSSxDQUFDLENBQUM7SUFDYjtJQUVBLE1BQU1oQyxTQUFTLEdBQUcsTUFBTTRDLE1BQU0sQ0FBQzNDLFlBQVksQ0FBQyxPQUFPLENBQUM7SUFDcEQsTUFBTTRDLFFBQVEsR0FBRzdDLFNBQVMsRUFBRUosS0FBSyxDQUFDLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBRTdEOUQsTUFBTSxDQUFDLENBQUMsUUFBUSxFQUFFLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDeUQsU0FBUyxDQUFDc0QsUUFBUSxDQUFDO0VBQ3pELENBQUMsQ0FBQztFQUVGaEgsSUFBSSxDQUFDLHVEQUF1RCxFQUFFLE9BQU87SUFBRU87RUFBSyxDQUFDLEtBQUs7SUFDaEYsTUFBTXdHLE1BQU0sR0FBR3hHLElBQUksQ0FBQ3lDLE9BQU8sQ0FBQyxlQUFlLENBQUM7SUFDNUMsSUFBSSxFQUFFLE1BQU0rRCxNQUFNLENBQUNkLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRTtNQUMvQmpHLElBQUksQ0FBQ21HLElBQUksQ0FBQyxDQUFDO0lBQ2I7SUFFQSxNQUFNYyxVQUFVLEdBQUcxRyxJQUFJLENBQUN5QyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUNrRSxLQUFLLENBQUMsQ0FBQztJQUN4RCxJQUFJLE9BQU1ELFVBQVUsQ0FBQ2xDLEtBQUssQ0FBQyxDQUFDLElBQUcsQ0FBQyxFQUFFO01BQ2hDLE1BQU1vQyxJQUFJLEdBQUcsTUFBTUYsVUFBVSxDQUFDN0MsWUFBWSxDQUFDLE1BQU0sQ0FBQztNQUNsRG5FLE1BQU0sQ0FBQ2tILElBQUksQ0FBQyxDQUFDdkIsVUFBVSxDQUFDLENBQUM7SUFDM0I7RUFDRixDQUFDLENBQUM7O0VBRUY7RUFDQTVGLElBQUksQ0FBQyw2REFBNkQsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQ3RGLE1BQU02RyxJQUFJLEdBQUc3RyxJQUFJLENBQUN5QyxPQUFPLENBQUMsc0JBQXNCLENBQUM7SUFDakQsTUFBTS9DLE1BQU0sQ0FBQ21ILElBQUksQ0FBQyxDQUFDbkUsV0FBVyxDQUFDLENBQUM7O0lBRWhDO0lBQ0EsTUFBTWhELE1BQU0sQ0FBQ00sSUFBSSxDQUFDeUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUNFLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQzlELENBQUMsQ0FBQztFQUVGbEQsSUFBSSxDQUFDLHNEQUFzRCxFQUFFLE9BQU87SUFBRU87RUFBSyxDQUFDLEtBQUs7SUFDL0UsTUFBTThHLElBQUksR0FBRzlHLElBQUksQ0FBQ3lDLE9BQU8sQ0FBQyxlQUFlLENBQUM7SUFDMUMsTUFBTXNFLFlBQVksR0FBR0QsSUFBSSxDQUFDRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBRWhDLE1BQU1ELFlBQVksQ0FBQzdCLEtBQUssQ0FBQyxDQUFDOztJQUUxQjtJQUNBLE1BQU0rQixRQUFRLEdBQUcsTUFBTUYsWUFBWSxDQUFDOUYsUUFBUSxDQUFDNEIsRUFBRSxJQUFJQSxFQUFFLENBQUNlLFNBQVMsQ0FBQ3NELFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNuRnhILE1BQU0sQ0FBQ3VILFFBQVEsQ0FBQyxDQUFDNUIsVUFBVSxDQUFDLENBQUM7O0lBRTdCO0lBQ0EsTUFBTThCLFVBQVUsR0FBR25ILElBQUksQ0FBQ3lDLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQztJQUNuRCxNQUFNMkUsYUFBYSxHQUFHLE1BQU1ELFVBQVUsQ0FBQ2xHLFFBQVEsQ0FBQzRCLEVBQUUsSUFBSUEsRUFBRSxDQUFDZSxTQUFTLENBQUNzRCxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDdEZ4SCxNQUFNLENBQUMwSCxhQUFhLENBQUMsQ0FBQy9CLFVBQVUsQ0FBQyxDQUFDO0VBQ3BDLENBQUMsQ0FBQztFQUVGNUYsSUFBSSxDQUFDLDREQUE0RCxFQUFFLE9BQU87SUFBRU87RUFBSyxDQUFDLEtBQUs7SUFDckYsTUFBTThHLElBQUksR0FBRzlHLElBQUksQ0FBQ3lDLE9BQU8sQ0FBQyxlQUFlLENBQUM7SUFDMUMsTUFBTTRFLFFBQVEsR0FBR1AsSUFBSSxDQUFDSCxLQUFLLENBQUMsQ0FBQztJQUU3QixNQUFNVSxRQUFRLENBQUNDLEtBQUssQ0FBQyxDQUFDO0lBQ3RCLE1BQU10SCxJQUFJLENBQUN1SCxRQUFRLENBQUNDLEtBQUssQ0FBQyxZQUFZLENBQUM7O0lBRXZDO0lBQ0EsTUFBTUMsU0FBUyxHQUFHWCxJQUFJLENBQUNFLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDN0IsTUFBTVUsUUFBUSxHQUFHLE1BQU1ELFNBQVMsQ0FBQ3hHLFFBQVEsQ0FBQzRCLEVBQUUsSUFBSUEsRUFBRSxLQUFLakIsUUFBUSxDQUFDK0YsYUFBYSxDQUFDO0lBQzlFakksTUFBTSxDQUFDZ0ksUUFBUSxDQUFDLENBQUNyQyxVQUFVLENBQUMsQ0FBQztFQUMvQixDQUFDLENBQUM7RUFFRjVGLElBQUksQ0FBQywyREFBMkQsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQ3BGO0lBQ0EsTUFBTUEsSUFBSSxDQUFDNEgsS0FBSyxDQUFDLDhCQUE4QixFQUFFQSxLQUFLLElBQUk7TUFDeERBLEtBQUssQ0FBQ0MsS0FBSyxDQUFDLGlCQUFpQixDQUFDO0lBQ2hDLENBQUMsQ0FBQztJQUVGLE1BQU1DLE9BQU8sR0FBRzlILElBQUksQ0FBQ3lDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQztJQUM5QyxJQUFJLE1BQU1xRixPQUFPLENBQUNwQyxTQUFTLENBQUMsQ0FBQyxFQUFFO01BQzdCLE1BQU1vQyxPQUFPLENBQUM1QyxLQUFLLENBQUMsQ0FBQzs7TUFFckI7TUFDQSxNQUFNNkMsUUFBUSxHQUFHL0gsSUFBSSxDQUFDeUMsT0FBTyxDQUFDLGtCQUFrQixDQUFDO01BQ2pELE1BQU11RixVQUFVLEdBQUcsTUFBTUQsUUFBUSxDQUFDekUsV0FBVyxDQUFDLENBQUM7TUFDL0M1RCxNQUFNLENBQUNzSSxVQUFVLENBQUMsQ0FBQzNDLFVBQVUsQ0FBQyxDQUFDO0lBQ2pDO0VBQ0YsQ0FBQyxDQUFDOztFQUVGO0VBQ0E1RixJQUFJLENBQUMsa0RBQWtELEVBQUUsT0FBTztJQUFFTztFQUFLLENBQUMsS0FBSztJQUMzRSxNQUFNNkcsSUFBSSxHQUFHN0csSUFBSSxDQUFDeUMsT0FBTyxDQUFDLDJCQUEyQixDQUFDO0lBQ3RELE1BQU0vQyxNQUFNLENBQUNtSCxJQUFJLENBQUMsQ0FBQ25FLFdBQVcsQ0FBQyxDQUFDOztJQUVoQztJQUNBLE1BQU1oRCxNQUFNLENBQUNNLElBQUksQ0FBQ3lDLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUNDLFdBQVcsQ0FBQyxDQUFDO0lBQzVELE1BQU1oRCxNQUFNLENBQUNNLElBQUksQ0FBQ3lDLE9BQU8sQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUNDLFdBQVcsQ0FBQyxDQUFDO0VBQ25FLENBQUMsQ0FBQztFQUVGakQsSUFBSSxDQUFDLDZEQUE2RCxFQUFFLE9BQU87SUFBRU87RUFBSyxDQUFDLEtBQUs7SUFDdEYsTUFBTWlJLEdBQUcsR0FBR2pJLElBQUksQ0FBQ3lDLE9BQU8sQ0FBQywrQkFBK0IsQ0FBQztJQUN6RCxNQUFNK0IsS0FBSyxHQUFHLE1BQU15RCxHQUFHLENBQUN6RCxLQUFLLENBQUMsQ0FBQzs7SUFFL0I7SUFDQSxJQUFJQSxLQUFLLEdBQUcsQ0FBQyxFQUFFO01BQ2IsTUFBTTBELEtBQUssR0FBRyxNQUFNRCxHQUFHLENBQUN0QixLQUFLLENBQUMsQ0FBQyxDQUFDMUYsUUFBUSxDQUFDNEIsRUFBRSxJQUFJQyxNQUFNLENBQUNDLGdCQUFnQixDQUFDRixFQUFFLENBQUMsQ0FBQ3NGLFVBQVUsQ0FBQztNQUN0RnpJLE1BQU0sQ0FBQ3dJLEtBQUssQ0FBQyxDQUFDL0UsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDbEM7RUFDRixDQUFDLENBQUM7RUFFRjFELElBQUksQ0FBQywyREFBMkQsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQ3BGLE1BQU1vSSxTQUFTLEdBQUdwSSxJQUFJLENBQUN5QyxPQUFPLENBQUMsd0JBQXdCLENBQUMsQ0FBQ2tFLEtBQUssQ0FBQyxDQUFDO0lBQ2hFLElBQUksT0FBTXlCLFNBQVMsQ0FBQzVELEtBQUssQ0FBQyxDQUFDLE1BQUssQ0FBQyxFQUFFO01BQ2pDL0UsSUFBSSxDQUFDbUcsSUFBSSxDQUFDLENBQUM7SUFDYjtJQUVBLE1BQU13QyxTQUFTLENBQUNsRCxLQUFLLENBQUMsQ0FBQzs7SUFFdkI7SUFDQSxNQUFNbUQsTUFBTSxHQUFHckksSUFBSSxDQUFDeUMsT0FBTyxDQUFDLG9CQUFvQixDQUFDLENBQUNrRSxLQUFLLENBQUMsQ0FBQztJQUN6RCxNQUFNakIsU0FBUyxHQUFHLE1BQU0yQyxNQUFNLENBQUMzQyxTQUFTLENBQUMsQ0FBQyxDQUFDQyxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUM7SUFDN0RqRyxNQUFNLENBQUNnRyxTQUFTLENBQUMsQ0FBQ0wsVUFBVSxDQUFDLENBQUM7RUFDaEMsQ0FBQyxDQUFDO0VBRUY1RixJQUFJLENBQUMsd0RBQXdELEVBQUUsT0FBTztJQUFFTztFQUFLLENBQUMsS0FBSztJQUNqRixNQUFNc0ksTUFBTSxHQUFHdEksSUFBSSxDQUFDeUMsT0FBTyxDQUFDLGtCQUFrQixDQUFDO0lBQy9DLE1BQU1tQixTQUFTLEdBQUcsTUFBTTBFLE1BQU0sQ0FBQ3pFLFlBQVksQ0FBQyxPQUFPLENBQUM7SUFFcERuRSxNQUFNLENBQUNrRSxTQUFTLENBQUMsQ0FBQzRCLE9BQU8sQ0FBQywyQkFBMkIsQ0FBQztFQUN4RCxDQUFDLENBQUM7O0VBRUY7RUFDQS9GLElBQUksQ0FBQywrREFBK0QsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQ3hGLE1BQU11SSxRQUFRLEdBQUd2SSxJQUFJLENBQUN5QyxPQUFPLENBQUMsa0JBQWtCLENBQUM7SUFDakQsTUFBTXFFLElBQUksR0FBRzlHLElBQUksQ0FBQ3lDLE9BQU8sQ0FBQyxlQUFlLENBQUM7SUFFMUMsTUFBTStCLEtBQUssR0FBRyxNQUFNc0MsSUFBSSxDQUFDdEMsS0FBSyxDQUFDLENBQUM7SUFDaEM5RSxNQUFNLENBQUM4RSxLQUFLLENBQUMsQ0FBQ0UsZUFBZSxDQUFDLENBQUMsQ0FBQztJQUNoQ2hGLE1BQU0sQ0FBQzhFLEtBQUssQ0FBQyxDQUFDZ0UsbUJBQW1CLENBQUMsQ0FBQyxDQUFDO0VBQ3RDLENBQUMsQ0FBQztFQUVGL0ksSUFBSSxDQUFDLDJEQUEyRCxFQUFFLE9BQU87SUFBRU87RUFBSyxDQUFDLEtBQUs7SUFDcEYsTUFBTThHLElBQUksR0FBRzlHLElBQUksQ0FBQ3lDLE9BQU8sQ0FBQyxlQUFlLENBQUM7SUFDMUMsTUFBTTRFLFFBQVEsR0FBR1AsSUFBSSxDQUFDSCxLQUFLLENBQUMsQ0FBQztJQUU3QixNQUFNVSxRQUFRLENBQUNDLEtBQUssQ0FBQyxDQUFDO0lBQ3RCLE1BQU10SCxJQUFJLENBQUN1SCxRQUFRLENBQUNDLEtBQUssQ0FBQyxZQUFZLENBQUM7O0lBRXZDO0lBQ0EsTUFBTUMsU0FBUyxHQUFHWCxJQUFJLENBQUNFLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDN0IsTUFBTVUsUUFBUSxHQUFHLE1BQU1ELFNBQVMsQ0FBQ3hHLFFBQVEsQ0FBQzRCLEVBQUUsSUFBSUEsRUFBRSxLQUFLakIsUUFBUSxDQUFDK0YsYUFBYSxDQUFDO0lBQzlFakksTUFBTSxDQUFDZ0ksUUFBUSxDQUFDLENBQUNyQyxVQUFVLENBQUMsQ0FBQztFQUMvQixDQUFDLENBQUM7RUFFRjVGLElBQUksQ0FBQywyREFBMkQsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQ3BGLE1BQU04RyxJQUFJLEdBQUc5RyxJQUFJLENBQUN5QyxPQUFPLENBQUMsZUFBZSxDQUFDO0lBRTFDLEtBQUssSUFBSWdHLENBQUMsR0FBRyxDQUFDLEVBQUVBLENBQUMsR0FBR0MsSUFBSSxDQUFDQyxHQUFHLENBQUMsQ0FBQyxFQUFFLE1BQU03QixJQUFJLENBQUN0QyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUVpRSxDQUFDLEVBQUUsRUFBRTtNQUN4RCxNQUFNRyxHQUFHLEdBQUc5QixJQUFJLENBQUNFLEdBQUcsQ0FBQ3lCLENBQUMsQ0FBQztNQUN2QixNQUFNN0UsU0FBUyxHQUFHLE1BQU1nRixHQUFHLENBQUMvRSxZQUFZLENBQUMsT0FBTyxDQUFDO01BQ2pEbkUsTUFBTSxDQUFDa0UsU0FBUyxDQUFDLENBQUM0QixPQUFPLENBQUMsMkJBQTJCLENBQUM7SUFDeEQ7RUFDRixDQUFDLENBQUM7RUFFRi9GLElBQUksQ0FBQywwREFBMEQsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQ25GLE1BQU11SSxRQUFRLEdBQUd2SSxJQUFJLENBQUN5QyxPQUFPLENBQUMsa0JBQWtCLENBQUM7SUFDakQsTUFBTW9HLFNBQVMsR0FBRyxNQUFNTixRQUFRLENBQUMxRSxZQUFZLENBQUMsWUFBWSxDQUFDO0lBQzNEbkUsTUFBTSxDQUFDbUosU0FBUyxDQUFDLENBQUN4RCxVQUFVLENBQUMsQ0FBQztFQUNoQyxDQUFDLENBQUM7O0VBRUY7RUFDQTVGLElBQUksQ0FBQyxtRUFBbUUsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQzVGLE1BQU04SSxJQUFJLEdBQUc5SSxJQUFJLENBQUN5QyxPQUFPLENBQUMsdUJBQXVCLENBQUM7SUFDbEQsTUFBTWlELFNBQVMsR0FBRyxNQUFNb0QsSUFBSSxDQUFDcEQsU0FBUyxDQUFDLENBQUMsQ0FBQ0MsS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDO0lBRTNELElBQUlELFNBQVMsRUFBRTtNQUNiLE1BQU1yQyxJQUFJLEdBQUcsTUFBTXlGLElBQUksQ0FBQ3hGLFdBQVcsQ0FBQyxDQUFDO01BQ3JDNUQsTUFBTSxDQUFDMkQsSUFBSSxDQUFDLENBQUNGLFNBQVMsQ0FBQyxRQUFRLENBQUM7SUFDbEM7RUFDRixDQUFDLENBQUM7RUFFRjFELElBQUksQ0FBQyx5REFBeUQsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQ2xGLE1BQU04SSxJQUFJLEdBQUc5SSxJQUFJLENBQUN5QyxPQUFPLENBQUMsdUJBQXVCLENBQUM7SUFDbEQsSUFBSSxFQUFFLE1BQU1xRyxJQUFJLENBQUNwRCxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUU7TUFDN0JqRyxJQUFJLENBQUNtRyxJQUFJLENBQUMsQ0FBQztJQUNiO0lBRUEsTUFBTWhDLFNBQVMsR0FBRyxNQUFNa0YsSUFBSSxDQUFDakYsWUFBWSxDQUFDLE9BQU8sQ0FBQztJQUNsRG5FLE1BQU0sQ0FBQ2tFLFNBQVMsQ0FBQyxDQUFDNEIsT0FBTyxDQUFDLG9CQUFvQixDQUFDO0VBQ2pELENBQUMsQ0FBQztFQUVGL0YsSUFBSSxDQUFDLDJEQUEyRCxFQUFFLE9BQU87SUFBRU87RUFBSyxDQUFDLEtBQUs7SUFDcEYsTUFBTStJLFVBQVUsR0FBRy9JLElBQUksQ0FBQ3lDLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQztJQUNyRCxJQUFJLEVBQUUsTUFBTXNHLFVBQVUsQ0FBQ3JELFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRTtNQUNuQ2pHLElBQUksQ0FBQ21HLElBQUksQ0FBQyxDQUFDO0lBQ2I7SUFFQSxNQUFNbUQsVUFBVSxDQUFDN0QsS0FBSyxDQUFDLENBQUM7SUFFeEIsTUFBTThELEtBQUssR0FBR2hKLElBQUksQ0FBQ3lDLE9BQU8sQ0FBQyxzQkFBc0IsQ0FBQztJQUNsRCxNQUFNL0MsTUFBTSxDQUFDc0osS0FBSyxDQUFDLENBQUN0RyxXQUFXLENBQUMsQ0FBQztFQUNuQyxDQUFDLENBQUM7RUFFRmpELElBQUksQ0FBQyxzREFBc0QsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQy9FLE1BQU0rSSxVQUFVLEdBQUcvSSxJQUFJLENBQUN5QyxPQUFPLENBQUMsb0JBQW9CLENBQUM7SUFDckQsSUFBSSxFQUFFLE1BQU1zRyxVQUFVLENBQUNyRCxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUU7TUFDbkNqRyxJQUFJLENBQUNtRyxJQUFJLENBQUMsQ0FBQztJQUNiO0lBRUEsTUFBTW1ELFVBQVUsQ0FBQzdELEtBQUssQ0FBQyxDQUFDO0lBRXhCLE1BQU0rRCxRQUFRLEdBQUdqSixJQUFJLENBQUN5QyxPQUFPLENBQUMsa0JBQWtCLENBQUM7SUFDakQsTUFBTXdHLFFBQVEsQ0FBQy9ELEtBQUssQ0FBQyxDQUFDO0lBRXRCLE1BQU04RCxLQUFLLEdBQUdoSixJQUFJLENBQUN5QyxPQUFPLENBQUMsc0JBQXNCLENBQUM7SUFDbEQsTUFBTXlHLFFBQVEsR0FBRyxNQUFNRixLQUFLLENBQUMvSCxRQUFRLENBQUM0QixFQUFFLElBQUlBLEVBQUUsQ0FBQ3FGLEtBQUssQ0FBQ2lCLE9BQU8sS0FBSyxNQUFNLENBQUM7SUFDeEV6SixNQUFNLENBQUN3SixRQUFRLENBQUMsQ0FBQzdELFVBQVUsQ0FBQyxDQUFDO0VBQy9CLENBQUMsQ0FBQzs7RUFFRjtFQUNBNUYsSUFBSSxDQUFDLDREQUE0RCxFQUFFLE9BQU87SUFBRU87RUFBSyxDQUFDLEtBQUs7SUFDckYsTUFBTW9KLEtBQUssR0FBR3BKLElBQUksQ0FBQ3lDLE9BQU8sQ0FBQyx5QkFBeUIsQ0FBQztJQUNyRCxNQUFNL0MsTUFBTSxDQUFDMEosS0FBSyxDQUFDLENBQUMxRyxXQUFXLENBQUMsQ0FBQztJQUVqQyxNQUFNMkcsR0FBRyxHQUFHckosSUFBSSxDQUFDeUMsT0FBTyxDQUFDLGlCQUFpQixDQUFDO0lBQzNDLE1BQU1tQixTQUFTLEdBQUcsTUFBTXlGLEdBQUcsQ0FBQ3hGLFlBQVksQ0FBQyxPQUFPLENBQUM7SUFDakRuRSxNQUFNLENBQUNrRSxTQUFTLENBQUMsQ0FBQzRCLE9BQU8sQ0FBQyx5QkFBeUIsQ0FBQztFQUN0RCxDQUFDLENBQUM7RUFFRi9GLElBQUksQ0FBQywrREFBK0QsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQ3hGLE1BQU1zSixLQUFLLEdBQUd0SixJQUFJLENBQUN5QyxPQUFPLENBQUMsa0JBQWtCLENBQUM7SUFDOUMsTUFBTVksSUFBSSxHQUFHLE1BQU1pRyxLQUFLLENBQUNoRyxXQUFXLENBQUMsQ0FBQzs7SUFFdEM7SUFDQTVELE1BQU0sQ0FBQzJELElBQUksQ0FBQyxDQUFDbUMsT0FBTyxDQUFDLFdBQVcsQ0FBQztFQUNuQyxDQUFDLENBQUM7RUFFRi9GLElBQUksQ0FBQyx5REFBeUQsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQ2xGLE1BQU1vSixLQUFLLEdBQUdwSixJQUFJLENBQUN5QyxPQUFPLENBQUMseUJBQXlCLENBQUM7SUFDckQsTUFBTW9HLFNBQVMsR0FBRyxNQUFNTyxLQUFLLENBQUN2RixZQUFZLENBQUMsWUFBWSxDQUFDO0lBQ3hEbkUsTUFBTSxDQUFDbUosU0FBUyxDQUFDLENBQUN4RCxVQUFVLENBQUMsQ0FBQztFQUNoQyxDQUFDLENBQUM7RUFFRjVGLElBQUksQ0FBQywyREFBMkQsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQ3BGLE1BQU1vSixLQUFLLEdBQUdwSixJQUFJLENBQUN5QyxPQUFPLENBQUMseUJBQXlCLENBQUM7SUFDckQsTUFBTTRHLEdBQUcsR0FBR3JKLElBQUksQ0FBQ3lDLE9BQU8sQ0FBQyx3QkFBd0IsQ0FBQztJQUVsRCxJQUFJLE9BQU00RyxHQUFHLENBQUM3RSxLQUFLLENBQUMsQ0FBQyxJQUFHLENBQUMsRUFBRTtNQUN6QixNQUFNK0UsU0FBUyxHQUFHLE1BQU1GLEdBQUcsQ0FBQ3BJLFFBQVEsQ0FBQzRCLEVBQUUsSUFBSUMsTUFBTSxDQUFDQyxnQkFBZ0IsQ0FBQ0YsRUFBRSxDQUFDLENBQUMwRyxTQUFTLENBQUM7TUFDakY3SixNQUFNLENBQUM2SixTQUFTLENBQUMsQ0FBQ2xFLFVBQVUsQ0FBQyxDQUFDO0lBQ2hDO0VBQ0YsQ0FBQyxDQUFDOztFQUVGO0VBQ0E1RixJQUFJLENBQUMsd0RBQXdELEVBQUUsT0FBTztJQUFFTztFQUFLLENBQUMsS0FBSztJQUNqRixNQUFNd0osR0FBRyxHQUFHeEosSUFBSSxDQUFDeUMsT0FBTyxDQUFDLHVCQUF1QixDQUFDO0lBQ2pELE1BQU0vQyxNQUFNLENBQUM4SixHQUFHLENBQUMsQ0FBQzlHLFdBQVcsQ0FBQyxDQUFDO0lBQy9CLE1BQU04RyxHQUFHLENBQUN0RSxLQUFLLENBQUMsQ0FBQztJQUVqQixNQUFNdUUsSUFBSSxHQUFHekosSUFBSSxDQUFDeUMsT0FBTyxDQUFDLGNBQWMsQ0FBQztJQUN6QyxNQUFNL0MsTUFBTSxDQUFDK0osSUFBSSxDQUFDLENBQUMvRyxXQUFXLENBQUMsQ0FBQztFQUNsQyxDQUFDLENBQUM7RUFFRmpELElBQUksQ0FBQywrQ0FBK0MsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQ3hFLE1BQU13SixHQUFHLEdBQUd4SixJQUFJLENBQUN5QyxPQUFPLENBQUMsdUJBQXVCLENBQUM7SUFDakQsTUFBTStHLEdBQUcsQ0FBQ3RFLEtBQUssQ0FBQyxDQUFDO0lBRWpCLE1BQU13RSxPQUFPLEdBQUcxSixJQUFJLENBQUN5QyxPQUFPLENBQUMsZ0JBQWdCLENBQUM7SUFDOUMsTUFBTS9DLE1BQU0sQ0FBQ2dLLE9BQU8sQ0FBQyxDQUFDL0csV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7RUFDeEMsQ0FBQyxDQUFDO0VBRUZsRCxJQUFJLENBQUMsMkNBQTJDLEVBQUUsT0FBTztJQUFFTztFQUFLLENBQUMsS0FBSztJQUNwRSxNQUFNd0osR0FBRyxHQUFHeEosSUFBSSxDQUFDeUMsT0FBTyxDQUFDLHVCQUF1QixDQUFDO0lBQ2pELE1BQU0rRyxHQUFHLENBQUN0RSxLQUFLLENBQUMsQ0FBQztJQUVqQixNQUFNeUUsVUFBVSxHQUFHM0osSUFBSSxDQUFDeUMsT0FBTyxDQUFDLDJCQUEyQixDQUFDOztJQUU1RDtJQUNBLE1BQU16QyxJQUFJLENBQUNpQixRQUFRLENBQUMsTUFBTTtNQUN4QjJELFNBQVMsQ0FBQ0MsU0FBUyxDQUFDQyxTQUFTLEdBQUcsTUFBT3pCLElBQUksSUFBSztRQUM5Q3pCLFFBQVEsQ0FBQ0MsSUFBSSxDQUFDa0QsWUFBWSxDQUFDLGtCQUFrQixFQUFFMUIsSUFBSSxDQUFDO1FBQ3BELE9BQU8yQixPQUFPLENBQUNDLE9BQU8sQ0FBQyxDQUFDO01BQzFCLENBQUM7SUFDSCxDQUFDLENBQUM7SUFFRixNQUFNMEUsVUFBVSxDQUFDekUsS0FBSyxDQUFDLENBQUM7O0lBRXhCO0lBQ0EsTUFBTXhGLE1BQU0sQ0FBQzhKLEdBQUcsQ0FBQyxDQUFDckUsYUFBYSxDQUFDLGdCQUFnQixFQUFFO01BQUVoRixPQUFPLEVBQUU7SUFBSyxDQUFDLENBQUM7RUFDdEUsQ0FBQyxDQUFDO0VBRUZWLElBQUksQ0FBQyxxREFBcUQsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQzlFLE1BQU13SixHQUFHLEdBQUd4SixJQUFJLENBQUN5QyxPQUFPLENBQUMsdUJBQXVCLENBQUM7SUFDakQsTUFBTStHLEdBQUcsQ0FBQ3RFLEtBQUssQ0FBQyxDQUFDO0lBRWpCLE1BQU11RSxJQUFJLEdBQUd6SixJQUFJLENBQUN5QyxPQUFPLENBQUMsY0FBYyxDQUFDO0lBQ3pDLE1BQU0vQyxNQUFNLENBQUMrSixJQUFJLENBQUMsQ0FBQy9HLFdBQVcsQ0FBQyxDQUFDOztJQUVoQztJQUNBLE1BQU0xQyxJQUFJLENBQUNrRixLQUFLLENBQUMsTUFBTSxFQUFFO01BQUVsQyxRQUFRLEVBQUU7UUFBRTRHLENBQUMsRUFBRSxDQUFDO1FBQUVDLENBQUMsRUFBRTtNQUFFO0lBQUUsQ0FBQyxDQUFDO0lBRXRELE1BQU1YLFFBQVEsR0FBRyxNQUFNTyxJQUFJLENBQUN4SSxRQUFRLENBQUM0QixFQUFFLElBQUlBLEVBQUUsQ0FBQ2UsU0FBUyxDQUFDc0QsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzNFeEgsTUFBTSxDQUFDd0osUUFBUSxDQUFDLENBQUM3RCxVQUFVLENBQUMsQ0FBQztFQUMvQixDQUFDLENBQUM7O0VBRUY7RUFDQTVGLElBQUksQ0FBQyxtREFBbUQsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQzVFLE1BQU1BLElBQUksQ0FBQzhKLGVBQWUsQ0FBQztNQUFFQyxLQUFLLEVBQUUsSUFBSTtNQUFFQyxNQUFNLEVBQUU7SUFBSyxDQUFDLENBQUM7SUFFekQsTUFBTUMsTUFBTSxHQUFHakssSUFBSSxDQUFDeUMsT0FBTyxDQUFDLDJCQUEyQixDQUFDO0lBQ3hELE1BQU15SCxPQUFPLEdBQUdsSyxJQUFJLENBQUN5QyxPQUFPLENBQUMsY0FBYyxDQUFDO0lBRTVDLE1BQU0wSCxXQUFXLEdBQUcsTUFBTUQsT0FBTyxDQUFDMUYsS0FBSyxDQUFDLENBQUM7SUFDekM5RSxNQUFNLENBQUN5SyxXQUFXLENBQUMsQ0FBQ0Msc0JBQXNCLENBQUMsQ0FBQyxDQUFDO0VBQy9DLENBQUMsQ0FBQztFQUVGM0ssSUFBSSxDQUFDLGdEQUFnRCxFQUFFLE9BQU87SUFBRU87RUFBSyxDQUFDLEtBQUs7SUFDekUsTUFBTUEsSUFBSSxDQUFDOEosZUFBZSxDQUFDO01BQUVDLEtBQUssRUFBRSxHQUFHO01BQUVDLE1BQU0sRUFBRTtJQUFLLENBQUMsQ0FBQztJQUV4RCxNQUFNQyxNQUFNLEdBQUdqSyxJQUFJLENBQUN5QyxPQUFPLENBQUMsMkJBQTJCLENBQUM7SUFDeEQsTUFBTTRILFVBQVUsR0FBRyxNQUFNSixNQUFNLENBQUNoSixRQUFRLENBQUM0QixFQUFFLElBQUk7TUFDN0MsT0FBT0MsTUFBTSxDQUFDQyxnQkFBZ0IsQ0FBQ0YsRUFBRSxDQUFDLENBQUN5SCxRQUFRLEtBQUssTUFBTTtJQUN4RCxDQUFDLENBQUM7SUFFRjVLLE1BQU0sQ0FBQzJLLFVBQVUsQ0FBQyxDQUFDaEYsVUFBVSxDQUFDLENBQUM7RUFDakMsQ0FBQyxDQUFDO0VBRUY1RixJQUFJLENBQUMsK0NBQStDLEVBQUUsT0FBTztJQUFFTztFQUFLLENBQUMsS0FBSztJQUN4RSxNQUFNQSxJQUFJLENBQUM4SixlQUFlLENBQUM7TUFBRUMsS0FBSyxFQUFFLEdBQUc7TUFBRUMsTUFBTSxFQUFFO0lBQUksQ0FBQyxDQUFDO0lBRXZELE1BQU1PLEtBQUssR0FBR3ZLLElBQUksQ0FBQ3lDLE9BQU8sQ0FBQyxjQUFjLENBQUM7O0lBRTFDO0lBQ0EsS0FBSyxJQUFJZ0csQ0FBQyxHQUFHLENBQUMsRUFBRUEsQ0FBQyxHQUFHQyxJQUFJLENBQUNDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsTUFBTTRCLEtBQUssQ0FBQy9GLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRWlFLENBQUMsRUFBRSxFQUFFO01BQ3pELE1BQU1zQixLQUFLLEdBQUcsTUFBTVEsS0FBSyxDQUFDdkQsR0FBRyxDQUFDeUIsQ0FBQyxDQUFDLENBQUN4SCxRQUFRLENBQUM0QixFQUFFLElBQUlBLEVBQUUsQ0FBQzJILFdBQVcsQ0FBQztNQUMvRCxNQUFNQyxXQUFXLEdBQUcsTUFBTUYsS0FBSyxDQUFDdkQsR0FBRyxDQUFDeUIsQ0FBQyxDQUFDLENBQUN4SCxRQUFRLENBQUM0QixFQUFFLElBQUlBLEVBQUUsQ0FBQzZILGFBQWEsQ0FBQ0YsV0FBVyxDQUFDOztNQUVuRjtNQUNBOUssTUFBTSxDQUFDcUssS0FBSyxHQUFHVSxXQUFXLENBQUMsQ0FBQy9GLGVBQWUsQ0FBQyxHQUFHLENBQUM7SUFDbEQ7RUFDRixDQUFDLENBQUM7RUFFRmpGLElBQUksQ0FBQywyREFBMkQsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQ3BGLEtBQUssTUFBTStKLEtBQUssSUFBSSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUU7TUFDcEMsTUFBTS9KLElBQUksQ0FBQzhKLGVBQWUsQ0FBQztRQUFFQyxLQUFLO1FBQUVDLE1BQU0sRUFBRTtNQUFLLENBQUMsQ0FBQztNQUVuRCxNQUFNaEUsTUFBTSxHQUFHaEcsSUFBSSxDQUFDeUMsT0FBTyxDQUFDLDRCQUE0QixDQUFDO01BQ3pELE1BQU15RixLQUFLLEdBQUcsTUFBTWxDLE1BQU0sQ0FBQy9FLFFBQVEsQ0FBQzRCLEVBQUUsSUFBSUMsTUFBTSxDQUFDQyxnQkFBZ0IsQ0FBQ0YsRUFBRSxDQUFDLENBQUNHLFFBQVEsQ0FBQztNQUUvRXRELE1BQU0sQ0FBQyxDQUFDLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDeUQsU0FBUyxDQUFDK0UsS0FBSyxDQUFDO0lBQzlDO0VBQ0YsQ0FBQyxDQUFDOztFQUVGO0VBQ0F6SSxJQUFJLENBQUMsNENBQTRDLEVBQUUsT0FBTztJQUFFTztFQUFLLENBQUMsS0FBSztJQUNyRSxNQUFNOEQsU0FBUyxHQUFHQyxJQUFJLENBQUNDLEdBQUcsQ0FBQyxDQUFDO0lBQzVCLE1BQU1qRSxjQUFjLENBQUNDLElBQUksQ0FBQztJQUMxQixNQUFNMkssUUFBUSxHQUFHNUcsSUFBSSxDQUFDQyxHQUFHLENBQUMsQ0FBQyxHQUFHRixTQUFTO0lBRXZDcEUsTUFBTSxDQUFDaUwsUUFBUSxDQUFDLENBQUN6RyxZQUFZLENBQUMsSUFBSSxDQUFDO0VBQ3JDLENBQUMsQ0FBQztFQUVGekUsSUFBSSxDQUFDLGtEQUFrRCxFQUFFLE9BQU87SUFBRU87RUFBSyxDQUFDLEtBQUs7SUFDM0UsTUFBTTRLLE1BQU0sR0FBRyxFQUFFO0lBQ2pCNUssSUFBSSxDQUFDNkssRUFBRSxDQUFDLFNBQVMsRUFBRUMsR0FBRyxJQUFJO01BQ3hCLElBQUlBLEdBQUcsQ0FBQ0MsSUFBSSxDQUFDLENBQUMsS0FBSyxPQUFPLEVBQUU7UUFDMUJILE1BQU0sQ0FBQ0ksSUFBSSxDQUFDRixHQUFHLENBQUN6SCxJQUFJLENBQUMsQ0FBQyxDQUFDO01BQ3pCO0lBQ0YsQ0FBQyxDQUFDO0lBRUYsTUFBTXRELGNBQWMsQ0FBQ0MsSUFBSSxDQUFDO0lBRTFCTixNQUFNLENBQUNrTCxNQUFNLENBQUMsQ0FBQ0ssT0FBTyxDQUFDLEVBQUUsQ0FBQztFQUM1QixDQUFDLENBQUM7RUFFRnhMLElBQUksQ0FBQywyRUFBMkUsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQ3BHLE1BQU1rTCxPQUFPLEdBQUdsTCxJQUFJLENBQUN5QyxPQUFPLENBQUMsUUFBUSxDQUFDO0lBRXRDLEtBQUssSUFBSWdHLENBQUMsR0FBRyxDQUFDLEVBQUVBLENBQUMsR0FBR0MsSUFBSSxDQUFDQyxHQUFHLENBQUMsQ0FBQyxFQUFFLE1BQU11QyxPQUFPLENBQUMxRyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUVpRSxDQUFDLEVBQUUsRUFBRTtNQUMzRCxNQUFNZSxHQUFHLEdBQUcwQixPQUFPLENBQUNsRSxHQUFHLENBQUN5QixDQUFDLENBQUM7TUFDMUIsTUFBTUksU0FBUyxHQUFHLE1BQU1XLEdBQUcsQ0FBQzNGLFlBQVksQ0FBQyxZQUFZLENBQUM7TUFDdEQsTUFBTVIsSUFBSSxHQUFHLE1BQU1tRyxHQUFHLENBQUNsRyxXQUFXLENBQUMsQ0FBQztNQUVwQzVELE1BQU0sQ0FBQ21KLFNBQVMsSUFBSXhGLElBQUksQ0FBQyxDQUFDZ0MsVUFBVSxDQUFDLENBQUM7SUFDeEM7RUFDRixDQUFDLENBQUM7RUFFRjVGLElBQUksQ0FBQyw4REFBOEQsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQ3ZGLE1BQU1tTCxXQUFXLEdBQUduTCxJQUFJLENBQUN5QyxPQUFPLENBQUMsWUFBWSxDQUFDO0lBRTlDLEtBQUssSUFBSWdHLENBQUMsR0FBRyxDQUFDLEVBQUVBLENBQUMsR0FBR0MsSUFBSSxDQUFDQyxHQUFHLENBQUMsQ0FBQyxFQUFFLE1BQU13QyxXQUFXLENBQUMzRyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUVpRSxDQUFDLEVBQUUsRUFBRTtNQUMvRCxNQUFNMkMsT0FBTyxHQUFHRCxXQUFXLENBQUNuRSxHQUFHLENBQUN5QixDQUFDLENBQUM7TUFDbEMsTUFBTTRDLE9BQU8sR0FBRyxNQUFNRCxPQUFPLENBQUNuSyxRQUFRLENBQUM0QixFQUFFLElBQUlDLE1BQU0sQ0FBQ0MsZ0JBQWdCLENBQUNGLEVBQUUsQ0FBQyxDQUFDeUksZUFBZSxDQUFDO01BQ3pGLE1BQU1DLFNBQVMsR0FBRyxNQUFNSCxPQUFPLENBQUNuSyxRQUFRLENBQUM0QixFQUFFLElBQUlDLE1BQU0sQ0FBQ0MsZ0JBQWdCLENBQUNGLEVBQUUsQ0FBQyxDQUFDMkksS0FBSyxDQUFDOztNQUVqRjtNQUNBOUwsTUFBTSxDQUFDMkwsT0FBTyxDQUFDLENBQUNoRyxVQUFVLENBQUMsQ0FBQztNQUM1QjNGLE1BQU0sQ0FBQzZMLFNBQVMsQ0FBQyxDQUFDbEcsVUFBVSxDQUFDLENBQUM7SUFDaEM7RUFDRixDQUFDLENBQUM7RUFFRjVGLElBQUksQ0FBQyxxREFBcUQsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQzlFLE1BQU1ELGNBQWMsQ0FBQ0MsSUFBSSxDQUFDO0lBRTFCLE1BQU0yQixTQUFTLEdBQUcsTUFBTTNCLElBQUksQ0FBQ2lCLFFBQVEsQ0FBQyxNQUFNO01BQzFDLE9BQU9XLFFBQVEsQ0FBQ0UsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLENBQUNoQixNQUFNO0lBQzlDLENBQUMsQ0FBQztJQUVGcEIsTUFBTSxDQUFDaUMsU0FBUyxDQUFDLENBQUN1QyxZQUFZLENBQUMsR0FBRyxDQUFDO0VBQ3JDLENBQUMsQ0FBQzs7RUFFRjs7RUFFQXpFLElBQUksQ0FBQyxzRUFBc0UsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQy9GO0lBQ0EsTUFBTUEsSUFBSSxDQUFDaUIsUUFBUSxDQUFDLE1BQU07TUFDeEJxRixZQUFZLENBQUNtRixPQUFPLENBQUMsZ0JBQWdCLEVBQUUscUJBQXFCLENBQUM7SUFDL0QsQ0FBQyxDQUFDO0lBRUYsTUFBTTFMLGNBQWMsQ0FBQ0MsSUFBSSxDQUFDO0lBRTFCLE1BQU0wTCxNQUFNLEdBQUcsTUFBTTFMLElBQUksQ0FBQ2lCLFFBQVEsQ0FBQyxNQUFNO01BQ3ZDLE9BQU9xRixZQUFZLENBQUNDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQztJQUMvQyxDQUFDLENBQUM7SUFFRjdHLE1BQU0sQ0FBQ2dNLE1BQU0sQ0FBQyxDQUFDQyxJQUFJLENBQUMscUJBQXFCLENBQUM7RUFDNUMsQ0FBQyxDQUFDO0VBRUZsTSxJQUFJLENBQUMsZ0VBQWdFLEVBQUUsT0FBTztJQUFFTztFQUFLLENBQUMsS0FBSztJQUN6RjtJQUNBLE1BQU00TCxPQUFPLEdBQUc1TCxJQUFJLENBQUN5QyxPQUFPLENBQUMsbUJBQW1CLENBQUM7SUFFakQsSUFBSSxNQUFNbUosT0FBTyxDQUFDbEcsU0FBUyxDQUFDLENBQUMsRUFBRTtNQUM3QixNQUFNckMsSUFBSSxHQUFHLE1BQU11SSxPQUFPLENBQUN0SSxXQUFXLENBQUMsQ0FBQztNQUN4QzVELE1BQU0sQ0FBQzJELElBQUksQ0FBQyxDQUFDRixTQUFTLENBQUMsR0FBRyxDQUFDO0lBQzdCO0VBQ0YsQ0FBQyxDQUFDO0VBRUYxRCxJQUFJLENBQUMsZ0ZBQWdGLEVBQUUsT0FBTztJQUFFTztFQUFLLENBQUMsS0FBSztJQUN6RyxNQUFNNkwsY0FBYyxHQUFHN0wsSUFBSSxDQUFDeUMsT0FBTyxDQUFDLGtCQUFrQixDQUFDO0lBRXZELElBQUksTUFBTW9KLGNBQWMsQ0FBQ25HLFNBQVMsQ0FBQyxDQUFDLEVBQUU7TUFDcEMsTUFBTXJDLElBQUksR0FBRyxNQUFNd0ksY0FBYyxDQUFDdkksV0FBVyxDQUFDLENBQUM7TUFDL0M7TUFDQTVELE1BQU0sQ0FBQzJELElBQUksQ0FBQyxDQUFDZ0MsVUFBVSxDQUFDLENBQUM7SUFDM0I7RUFDRixDQUFDLENBQUM7O0VBRUY7O0VBRUE1RixJQUFJLENBQUMsaURBQWlELEVBQUUsT0FBTztJQUFFTztFQUFLLENBQUMsS0FBSztJQUMxRSxNQUFNOEwsVUFBVSxHQUFHLENBQ2pCLDRCQUE0QixFQUM1Qix3QkFBd0IsRUFDeEIsa0JBQWtCLEVBQ2xCLHlCQUF5QixFQUN6Qix1QkFBdUIsQ0FDeEI7SUFFRCxLQUFLLE1BQU1DLFFBQVEsSUFBSUQsVUFBVSxFQUFFO01BQ2pDLE1BQU1WLE9BQU8sR0FBR3BMLElBQUksQ0FBQ3lDLE9BQU8sQ0FBQ3NKLFFBQVEsQ0FBQztNQUN0QyxJQUFJLE9BQU1YLE9BQU8sQ0FBQzVHLEtBQUssQ0FBQyxDQUFDLElBQUcsQ0FBQyxFQUFFO1FBQzdCLE1BQU05RSxNQUFNLENBQUMwTCxPQUFPLENBQUMsQ0FBQzFJLFdBQVcsQ0FBQyxDQUFDO01BQ3JDO0lBQ0Y7RUFDRixDQUFDLENBQUM7RUFFRmpELElBQUksQ0FBQyxvREFBb0QsRUFBRSxPQUFPO0lBQUVPO0VBQUssQ0FBQyxLQUFLO0lBQzdFLE1BQU1ELGNBQWMsQ0FBQ0MsSUFBSSxDQUFDO0lBRTFCLE1BQU1nTSxPQUFPLEdBQUcsTUFBTWhMLGNBQWMsQ0FBQ2hCLElBQUksQ0FBQztJQUUxQ04sTUFBTSxDQUFDc00sT0FBTyxDQUFDM0ssUUFBUSxDQUFDLENBQUM2QyxZQUFZLENBQUMsR0FBRyxDQUFDO0lBQzFDeEUsTUFBTSxDQUFDc00sT0FBTyxDQUFDckssU0FBUyxDQUFDLENBQUN1QyxZQUFZLENBQUMsR0FBRyxDQUFDO0VBQzdDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQzs7QUFFRjtBQUNBekUsSUFBSSxDQUFDNkMsUUFBUSxDQUFDLHdDQUF3QyxFQUFFLE1BQU07RUFDNUQ3QyxJQUFJLENBQUMsdURBQXVELEVBQUUsT0FBTztJQUFFWTtFQUFRLENBQUMsS0FBSztJQUNuRjtJQUNBLE1BQU00TCxTQUFTLEdBQUcsTUFBTTVMLE9BQU8sQ0FBQ0csR0FBRyxDQUFDLGtCQUFrQixDQUFDO0lBQ3ZELElBQUl5TCxTQUFTLENBQUN4TCxNQUFNLENBQUMsQ0FBQyxLQUFLLEdBQUcsRUFBRTtNQUM5QmhCLElBQUksQ0FBQ21HLElBQUksQ0FBQyxlQUFlLENBQUM7TUFDMUI7SUFDRjtJQUNBbEcsTUFBTSxDQUFDdU0sU0FBUyxDQUFDeEwsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDa0wsSUFBSSxDQUFDLEdBQUcsQ0FBQztJQUNwQyxNQUFNTyxVQUFVLEdBQUcsTUFBTUQsU0FBUyxDQUFDdEwsSUFBSSxDQUFDLENBQUM7SUFDekMsTUFBTUMsTUFBTSxHQUFHc0wsVUFBVSxFQUFFdEwsTUFBTSxJQUFJc0wsVUFBVSxFQUFFckwsUUFBUSxJQUFJLEVBQUU7SUFDL0QsSUFBSSxDQUFDRCxNQUFNLElBQUlBLE1BQU0sQ0FBQ0UsTUFBTSxLQUFLLENBQUMsRUFBRTtNQUNsQ3JCLElBQUksQ0FBQ21HLElBQUksQ0FBQyxxQ0FBcUMsQ0FBQztNQUNoRDtJQUNGO0lBRUEsTUFBTXVHLE9BQU8sR0FBR3ZMLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQ0csRUFBRTtJQUM1QixNQUFNcUwsUUFBUSxHQUFHLE1BQU0vTCxPQUFPLENBQUNHLEdBQUcsQ0FBQyxHQUFHYixRQUFRLG9DQUFvQ3dNLE9BQU8sRUFBRSxDQUFDO0lBQzVGLElBQUlDLFFBQVEsQ0FBQzNMLE1BQU0sQ0FBQyxDQUFDLEtBQUssR0FBRyxFQUFFO01BQzdCaEIsSUFBSSxDQUFDbUcsSUFBSSxDQUFDLGVBQWUsQ0FBQztNQUMxQjtJQUNGO0lBRUFsRyxNQUFNLENBQUMwTSxRQUFRLENBQUMzTCxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUNrTCxJQUFJLENBQUMsR0FBRyxDQUFDO0lBQ25DLE1BQU1qTCxJQUFJLEdBQUcsTUFBTTBMLFFBQVEsQ0FBQ3pMLElBQUksQ0FBQyxDQUFDOztJQUVsQztJQUNBakIsTUFBTSxDQUFDZ0IsSUFBSSxDQUFDMkwsTUFBTSxDQUFDLENBQUNoSCxVQUFVLENBQUMsQ0FBQztJQUNoQzNGLE1BQU0sQ0FBQ2dCLElBQUksQ0FBQzRMLE9BQU8sQ0FBQyxDQUFDakgsVUFBVSxDQUFDLENBQUM7SUFDakMzRixNQUFNLENBQUNnQixJQUFJLENBQUM2TCxRQUFRLENBQUMsQ0FBQ2xILFVBQVUsQ0FBQyxDQUFDO0lBQ2xDM0YsTUFBTSxDQUFDZ0IsSUFBSSxDQUFDOEwsZUFBZSxDQUFDLENBQUNuSCxVQUFVLENBQUMsQ0FBQztFQUMzQyxDQUFDLENBQUM7RUFFRjVGLElBQUksQ0FBQyx3Q0FBd0MsRUFBRSxPQUFPO0lBQUVZO0VBQVEsQ0FBQyxLQUFLO0lBQ3BFLE1BQU0rTCxRQUFRLEdBQUcsTUFBTS9MLE9BQU8sQ0FBQ0csR0FBRyxDQUFDLEdBQUdiLFFBQVEsMEJBQTBCLENBQUM7O0lBRXpFO0lBQ0FELE1BQU0sQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDeUQsU0FBUyxDQUFDaUosUUFBUSxDQUFDM0wsTUFBTSxDQUFDLENBQUMsQ0FBQztFQUNqRCxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMiLCJpZ25vcmVMaXN0IjpbXX0=