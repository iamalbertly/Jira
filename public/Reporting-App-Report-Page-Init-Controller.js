import { initFeedbackPanel } from './Reporting-App-Report-UI-Feedback.js';
import { initTabs } from './Reporting-App-Report-UI-Tabs.js';
import { initProjectSelection } from './Reporting-App-Report-Page-Selections-Manager.js';
import { initDateRangeControls } from './Reporting-App-Report-Page-DateRange-Controller.js';
import { initPreviewFlow } from './Reporting-App-Report-Page-Preview-Flow.js';
import { initSearchClearButtons } from './Reporting-App-Report-Page-Search-Clear.js';
import { initExportMenu } from './Reporting-App-Report-Page-Export-Menu.js';
import { renderNotificationDock } from './Reporting-App-Shared-Notifications-Dock-Manager.js';

function initReportPage() {
  initFeedbackPanel();
  initTabs(() => initExportMenu());
  initProjectSelection();
  initDateRangeControls(() => {
    const previewBtn = document.getElementById('preview-btn');
    if (previewBtn) previewBtn.click();
  });
  initExportMenu();
  initPreviewFlow();
  initSearchClearButtons();
  renderNotificationDock();

  // Delegated click handlers for small CTA buttons inside Metrics/Boards etc.
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest && ev.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (action === 'open-boards-tab') {
      const boardTab = document.getElementById('tab-btn-project-epic-level');
      if (boardTab) {
        boardTab.click();
        boardTab.focus();
      }
    }
  });

  // Keyboard shortcuts: '/' focuses the boards search box; 'f' opens Feedback (handled by feedback module)
  document.addEventListener('keydown', (ev) => {
    const active = document.activeElement && document.activeElement.tagName;
    if (ev.key === '/' && active !== 'INPUT' && active !== 'TEXTAREA') {
      ev.preventDefault();
      const boardsSearch = document.getElementById('boards-search-box') || document.getElementById('search-box');
      if (boardsSearch) boardsSearch.focus();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initReportPage);
} else {
  initReportPage();
}
