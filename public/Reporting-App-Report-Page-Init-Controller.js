import { initFeedbackPanel } from './Reporting-App-Report-UI-Feedback.js';
import { initTabs } from './Reporting-App-Report-UI-Tabs.js';
import { initProjectSelection, getSelectedProjects } from './Reporting-App-Report-Page-Selections-Manager.js';
import { initDateRangeControls } from './Reporting-App-Report-Page-DateRange-Controller.js';
import { initPreviewFlow } from './Reporting-App-Report-Page-Preview-Flow.js';
import { initSearchClearButtons } from './Reporting-App-Report-Page-Search-Clear.js';
import { initExportMenu } from './Reporting-App-Report-Page-Export-Menu.js';
import { renderNotificationDock } from './Reporting-App-Shared-Notifications-Dock-Manager.js';

function updateAppliedFiltersSummary() {
  const el = document.getElementById('applied-filters-summary');
  if (!el) return;
  const projects = getSelectedProjects();
  const startInput = document.getElementById('start-date');
  const endInput = document.getElementById('end-date');
  const startVal = startInput?.value || '';
  const endVal = endInput?.value || '';
  const opts = [];
  if (document.getElementById('require-resolved-by-sprint-end')?.checked) opts.push('Require resolved by sprint end');
  if (document.getElementById('include-predictability')?.checked) opts.push('Include Predictability');
  const projLabel = projects.length ? projects.join(', ') : 'None';
  const rangeLabel = startVal && endVal ? startVal.slice(0, 10) + ' – ' + endVal.slice(0, 10) : '';
  if (projLabel !== 'None' && rangeLabel) {
    el.textContent = 'Applied: ' + projLabel + ' · ' + rangeLabel + (opts.length ? ' · ' + opts.join(', ') : '');
  } else {
    el.textContent = 'Select projects and dates, then preview.';
  }
}

function initReportPage() {
  initFeedbackPanel();
  initTabs(() => initExportMenu());
  initProjectSelection();
  updateAppliedFiltersSummary();
  initDateRangeControls(() => {
    const previewBtn = document.getElementById('preview-btn');
    if (previewBtn) previewBtn.click();
  });
  initExportMenu();
  initPreviewFlow();
  initSearchClearButtons();
  renderNotificationDock();

  document.getElementById('start-date')?.addEventListener('change', updateAppliedFiltersSummary);
  document.getElementById('end-date')?.addEventListener('change', updateAppliedFiltersSummary);
  document.getElementById('require-resolved-by-sprint-end')?.addEventListener('change', updateAppliedFiltersSummary);
  document.getElementById('include-predictability')?.addEventListener('change', updateAppliedFiltersSummary);
  document.querySelectorAll('.project-checkbox').forEach((cb) => cb.addEventListener('change', updateAppliedFiltersSummary));

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
