
import { initFeedbackPanel } from './Reporting-App-Report-UI-Feedback.js';
import { initTabs } from './Reporting-App-Report-UI-Tabs.js';
import { initProjectSelection, getSelectedProjects } from './Reporting-App-Report-Page-Selections-Manager.js';
import { initDateRangeControls, isRangeValid } from './Reporting-App-Report-Page-DateRange-Controller.js';
import { initPreviewFlow, clearPreviewOnFilterChange } from './Reporting-App-Report-Page-Preview-Flow.js';
import { initSearchClearButtons } from './Reporting-App-Report-Page-Search-Clear.js';
import { renderNotificationDock } from './Reporting-App-Shared-Notifications-Dock-Manager.js';
import { getValidLastQuery } from './Reporting-App-Shared-Context-From-Storage.js';
import { REPORT_FILTERS_COLLAPSED_KEY, SHARED_DATE_RANGE_KEY, LAST_QUERY_KEY } from './Reporting-App-Shared-Storage-Keys.js';
import { DEFAULT_WINDOW_START_LOCAL, DEFAULT_WINDOW_END_LOCAL } from './Reporting-App-Report-Config-Constants.js';
import { AUTO_PREVIEW_DELAY_MS } from './Reporting-App-Shared-AutoPreview-Config.js';
import { applyDoneStoriesOptionalColumnsPreference } from './Reporting-App-Report-Page-DoneStories-Column-Preference.js';
import { collectFilterParams } from './Reporting-App-Report-Page-Filter-Params.js';
import { reportState } from './Reporting-App-Report-Page-State.js';
import { initExportMenu as initReportExportMenu } from './Reporting-App-Report-Page-Export-Menu.js';

function getShortRangeLabel() {
  const activePill = document.querySelector('.quarter-pill.is-active');
  if (activePill && activePill.dataset.quarter) return activePill.dataset.quarter;
  const startInput = document.getElementById('start-date');
  const endInput = document.getElementById('end-date');
  if (!startInput?.value || !endInput?.value) return '';
  const s = startInput.value.slice(0, 10);
  const e = endInput.value.slice(0, 10);
  if (s && e) return s + ' – ' + e;
  return '';
}

function refreshPreviewButtonLabel() {
  const previewBtn = document.getElementById('preview-btn');
  if (!previewBtn) return;
  const projects = getSelectedProjects();
  const n = projects.length;
  const rangeLabel = getShortRangeLabel();
  if (n === 0) {
    previewBtn.textContent = 'Preview';
    previewBtn.title = 'Select at least one project to preview.';
    previewBtn.disabled = true;
    return;
  }
  if (reportState.previewInProgress) {
    previewBtn.disabled = true;
    previewBtn.title = 'Generating preview...';
    return;
  }
  if (!isRangeValid()) {
    previewBtn.disabled = false;
    previewBtn.title = 'End date must be after start date.';
    previewBtn.textContent = 'Preview';
    return;
  }
  previewBtn.disabled = false;
  const rangePart = rangeLabel ? ', ' + rangeLabel : '';
  previewBtn.textContent = 'Preview (' + n + ' project' + (n !== 1 ? 's' : '') + rangePart + ')';
  previewBtn.title = 'Generate report for selected filters.';
}

function updateAppliedFiltersSummary() {
  const el = document.getElementById('applied-filters-summary');
  const chipsEl = document.getElementById('applied-filters-chips');
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
  const summaryText = (projLabel !== 'None' && rangeLabel)
    ? 'Applied: ' + projLabel + ' · ' + rangeLabel + (opts.length ? ' · ' + opts.join(', ') : '')
    : 'Select projects and dates, then preview.';
  if (el) el.textContent = summaryText;
  if (chipsEl) chipsEl.textContent = summaryText;
  refreshPreviewButtonLabel();
}

function hydrateFromLastQuery() {
  // Try to load context (Smart Context Engine)
  let ctx = getValidLastQuery();

  // If no history, assume "My Squad" default context (MPSA, MAS)
  if (!ctx || !ctx.projects) {
    ctx = { projects: 'MPSA,MAS' };
    // We don't overwrite dates in default as UI has its own
  }

  const startInput = document.getElementById('start-date');
  const endInput = document.getElementById('end-date');
  if (ctx) {
    if (startInput && ctx.start) startInput.value = ctx.start.slice(0, 16);
    if (endInput && ctx.end) endInput.value = ctx.end.slice(0, 16);

    // Checkboxes
    const projects = (ctx.projects || '').split(',').map(p => p.trim()).filter(Boolean);
    document.querySelectorAll('.project-checkbox[data-project]').forEach((input) => {
      const p = input.dataset.project;
      input.checked = projects.includes(p);
    });
  }
}

function initReportPage() {
  let autoPreviewTimer = null;
  let autoPreviewInProgress = false;

  function scheduleAutoPreview(delayMs = AUTO_PREVIEW_DELAY_MS) {
    const previewBtn = document.getElementById('preview-btn');
    if (!previewBtn) return;
    if (autoPreviewTimer) clearTimeout(autoPreviewTimer);
    if (delayMs === 0) {
      if (autoPreviewInProgress || previewBtn.disabled) return;
      try { collectFilterParams(); } catch (_) { return; }
      autoPreviewInProgress = true;
      previewBtn.click();
      setTimeout(() => { autoPreviewInProgress = false; }, 250);
      return;
    }
    autoPreviewTimer = setTimeout(() => {
      autoPreviewTimer = null;
      if (autoPreviewInProgress || previewBtn.disabled) return;
      try { collectFilterParams(); } catch (_) { return; }
      autoPreviewInProgress = true;
      previewBtn.click();
      setTimeout(() => { autoPreviewInProgress = false; }, 250);
    }, delayMs);
  }

  initFeedbackPanel();
  initTabs(() => initReportExportMenu(), (tabName) => {
    if (tabName === 'done-stories') applyDoneStoriesOptionalColumnsPreference();
  });
  // initExportMenu is called later

  try { window.__reportPreviewButtonSync = refreshPreviewButtonLabel; } catch (_) { }
  initProjectSelection();
  initDateRangeControls(() => { scheduleAutoPreview(AUTO_PREVIEW_DELAY_MS); }, () => { refreshPreviewButtonLabel(); });
  hydrateFromLastQuery();
  updateAppliedFiltersSummary();
  initReportExportMenu();
  initPreviewFlow();
  initSearchClearButtons();
  renderNotificationDock({ pageContext: 'report', collapsedByDefault: true });
  applyDoneStoriesOptionalColumnsPreference();

  function onFilterChange() {
    updateAppliedFiltersSummary();
    clearPreviewOnFilterChange();
    scheduleAutoPreview();
  }
  document.getElementById('start-date')?.addEventListener('change', onFilterChange);
  document.getElementById('end-date')?.addEventListener('change', onFilterChange);
  document.getElementById('require-resolved-by-sprint-end')?.addEventListener('change', onFilterChange);
  document.getElementById('include-predictability')?.addEventListener('change', onFilterChange);
  document.getElementById('include-active-or-missing-end-date-sprints')?.addEventListener('change', onFilterChange);
  document.querySelectorAll('.project-checkbox').forEach((cb) => cb.addEventListener('change', onFilterChange));

  document.addEventListener('click', (ev) => {
    if (ev.target?.getAttribute('data-action') !== 'reset-filters') return;
    try {
      localStorage.removeItem(SHARED_DATE_RANGE_KEY);
      localStorage.removeItem(LAST_QUERY_KEY);
    } catch (_) { }
    document.querySelectorAll('.project-checkbox').forEach((cb) => { cb.checked = false; });
    const startInput = document.getElementById('start-date');
    const endInput = document.getElementById('end-date');
    if (startInput) startInput.value = DEFAULT_WINDOW_START_LOCAL;
    if (endInput) endInput.value = DEFAULT_WINDOW_END_LOCAL;
    updateAppliedFiltersSummary();
    clearPreviewOnFilterChange();
  });

  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest && ev.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (action === 'open-boards-tab') {
      const boardTab = document.getElementById('tab-btn-project-epic-level');
      if (boardTab) { boardTab.click(); boardTab.focus(); }
    }
  });

  document.addEventListener('keydown', (ev) => {
    const active = document.activeElement && document.activeElement.tagName;
    if (ev.key === '/' && active !== 'INPUT' && active !== 'TEXTAREA') {
      ev.preventDefault();
      const boardsSearch = document.getElementById('boards-search-box') || document.getElementById('search-box');
      if (boardsSearch) boardsSearch.focus();
    }
  });

  const panel = document.getElementById('filters-panel');
  const panelBody = document.getElementById('filters-panel-body');
  const collapsedBar = document.getElementById('filters-panel-collapsed-bar');
  const collapsedSummary = document.getElementById('filters-collapsed-summary');
  const appliedSummary = document.getElementById('applied-filters-summary');

  function setFiltersPanelCollapsed(collapsed) {
    if (!panel || !panelBody || !collapsedBar) return;
    try {
      if (collapsed) sessionStorage.setItem(REPORT_FILTERS_COLLAPSED_KEY, '1');
      else sessionStorage.removeItem(REPORT_FILTERS_COLLAPSED_KEY);
    } catch (_) { }
    panel.classList.toggle('collapsed', collapsed);
    panelBody.style.display = collapsed ? 'none' : '';
    collapsedBar.style.display = collapsed ? 'block' : 'none';
    collapsedBar.setAttribute('aria-hidden', collapsed ? 'false' : 'true');
    if (collapsed && collapsedSummary && appliedSummary) collapsedSummary.textContent = appliedSummary.textContent || 'Applied filters';
  }

  function applyStoredFiltersCollapsed() {
    if (!panel || !panelBody || !collapsedBar) return;
    const previewContent = document.getElementById('preview-content');
    const isPreviewVisible = previewContent && previewContent.style.display !== 'none';
    try {
      const stored = sessionStorage.getItem(REPORT_FILTERS_COLLAPSED_KEY);
      if (stored === '1' && isPreviewVisible) setFiltersPanelCollapsed(true);
    } catch (_) { }
  }

  document.addEventListener('click', (ev) => {
    const toggle = ev.target.closest && ev.target.closest('[data-action="toggle-filters"]');
    if (toggle && panel) {
      ev.preventDefault();
      setFiltersPanelCollapsed(false);
    }
  });

  window.addEventListener('report-preview-shown', (ev) => {
    if (!panel || !panelBody || !collapsedBar) return;
    try {
      if (sessionStorage.getItem(REPORT_FILTERS_COLLAPSED_KEY) === '1') {
        setFiltersPanelCollapsed(true);
      }
    } catch (_) { }
  });

  setTimeout(applyStoredFiltersCollapsed, 0);

  const prevRefresh = window.__refreshReportingContextBar;
  window.__refreshReportingContextBar = function () {
    updateAppliedFiltersSummary();
    if (typeof prevRefresh === 'function') prevRefresh();
  };

  try {
    if (window.location && window.location.hash === '#trends') {
      const trendsBtn = document.getElementById('tab-btn-trends');
      if (trendsBtn) {
        trendsBtn.click();
        trendsBtn.setAttribute('aria-selected', 'true');
        trendsBtn.setAttribute('tabindex', '0');
      }
      const lastQuery = getValidLastQuery();
      const leadershipContent = document.getElementById('leadership-content');
      const hasTrendsContent = !!(leadershipContent && leadershipContent.children && leadershipContent.children.length > 0);
      if (lastQuery && !hasTrendsContent) {
        scheduleAutoPreview(200);
      }
    }
  } catch (_) { }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initReportPage);
} else {
  initReportPage();
}

