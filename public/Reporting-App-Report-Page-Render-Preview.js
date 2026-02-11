import { reportDom } from './Reporting-App-Report-Page-Context.js';
import { reportState } from './Reporting-App-Report-Page-State.js';
import { getSafeMeta } from './Reporting-App-Report-Page-Render-Helpers.js';
import { buildPreviewMetaAndStatus } from './Reporting-App-Report-Page-Render-Preview-01Meta.js';
import { renderSidebarContextCard } from './Reporting-App-Shared-Context-From-Storage.js';
import { scheduleRender } from './Reporting-App-Report-Page-Loading-Steps.js';
import { updateDateDisplay } from './Reporting-App-Report-Page-DateRange-Controller.js';
import {
  populateBoardsPills,
  populateSprintsPills,
  renderProjectEpicLevelTab,
  renderSprintsTab,
  renderDoneStoriesTab,
  renderUnusableSprintsTab,
  renderTrendsTab,
  updateExportFilteredState,
} from './Reporting-App-Report-Page-Render-Registry.js';
import { applyDoneStoriesOptionalColumnsPreference } from './Reporting-App-Report-Page-DoneStories-Column-Preference.js';

export function renderPreview() {
  const { previewData, previewRows, visibleRows, visibleBoardRows, visibleSprintRows } = reportState;
  const { errorEl, previewContent, previewMeta, exportExcelBtn, exportDropdownTrigger } = reportDom;
  if (!previewData) return;

  const reportContextLine = document.getElementById('report-context-line');
  if (reportContextLine) reportContextLine.textContent = '';
  const loadLatestWrap = document.getElementById('report-load-latest-wrap');
  if (loadLatestWrap) loadLatestWrap.style.display = 'none';
  const meta = getSafeMeta(previewData);
  if (!meta) {
    const stickyElNoMeta = document.getElementById('preview-summary-sticky');
    if (stickyElNoMeta) {
      stickyElNoMeta.setAttribute('aria-hidden', 'true');
      stickyElNoMeta.textContent = '';
    }
    if (errorEl) {
      errorEl.style.display = 'block';
      errorEl.innerHTML = `
        <strong>Error:</strong> Preview metadata is missing or invalid.
        <br><small>Please refresh the page, run the preview again, or contact an administrator if the problem persists.</small>
        <button type="button" class="error-close" aria-label="Dismiss">x</button>
      `;
    }
    if (previewContent) previewContent.style.display = 'none';
    if (exportExcelBtn) exportExcelBtn.disabled = true;
    if (exportDropdownTrigger) exportDropdownTrigger.disabled = true;
    return;
  }

  const boardsCount = previewData.boards?.length || 0;
  const sprintsCount = previewData.sprintsIncluded?.length || 0;
  const rowsCount = (previewData.rows || []).length;
  const unusableCount = previewData.sprintsUnusable?.length || 0;
  const partial = meta.partial === true;

  const metaBlock = buildPreviewMetaAndStatus({ meta, previewRows, boardsCount, sprintsCount, rowsCount, unusableCount });
  const reportSubtitleEl = document.getElementById('report-subtitle');
  if (reportSubtitleEl) reportSubtitleEl.textContent = 'Preview updates automatically when filters change; use Preview report for heavy ranges.';
  const outcomeLineEl = document.getElementById('preview-outcome-line');
  if (outcomeLineEl) outcomeLineEl.innerHTML = metaBlock.outcomeLineHTML;
  if (previewMeta) previewMeta.innerHTML = metaBlock.previewMetaHTML;
  const stickyEl = document.getElementById('preview-summary-sticky');
  if (stickyEl) {
    stickyEl.textContent = metaBlock.stickyText || '';
    stickyEl.setAttribute('aria-hidden', 'false');
  }
  const statusEl = document.getElementById('preview-status');
  if (statusEl) {
    statusEl.innerHTML = metaBlock.statusHTML;
    statusEl.style.display = metaBlock.statusDisplay;
  }

  const hasRows = rowsCount > 0;
  if (exportDropdownTrigger) exportDropdownTrigger.disabled = !hasRows;
  if (exportExcelBtn) exportExcelBtn.disabled = !hasRows;

  const exportHint = document.getElementById('export-hint');
  if (exportHint) {
    const modeDetails = [];
    if (meta.fromCache) modeDetails.push('cache');
    if (meta.recentSplitReason) modeDetails.push('split by ' + meta.recentSplitReason);
    const modeSuffix = modeDetails.length ? (' Data mode: ' + modeDetails.join(', ') + '.') : '';
    if (!hasRows) {
      exportHint.innerHTML = `
        <small>Generate a report with data to enable export. Use the main Excel button for the full workbook, or per-tab Export CSV for focused slices.${modeSuffix}</small>
      `;
    } else if (partial) {
      exportHint.innerHTML = `
        <small>Preview may be incomplete. You can export what's shown or try a smaller date range for full data.${modeSuffix}</small>
      `;
    } else {
      exportHint.innerHTML = modeSuffix ? (`<small>${modeSuffix.trim()}</small>`) : '';
    }
  }

  const partialExportTitle = 'Export contains only loaded (partial) data.';
  if (exportDropdownTrigger) {
    exportDropdownTrigger.title = partial ? partialExportTitle : '';
    if (partial) exportDropdownTrigger.setAttribute('aria-label', partialExportTitle);
    else exportDropdownTrigger.removeAttribute('aria-label');
  }
  if (exportExcelBtn) {
    exportExcelBtn.title = partial ? partialExportTitle : '';
    if (partial) exportExcelBtn.setAttribute('aria-label', partialExportTitle);
    else exportExcelBtn.removeAttribute('aria-label');
    const exportWrap = exportExcelBtn.parentElement;
    if (exportWrap) {
      const existing = exportWrap.querySelector('.partial-data-inline');
      if (existing) existing.remove();
      if (partial) {
        const span = document.createElement('span');
        span.className = 'partial-data-inline';
        span.setAttribute('aria-hidden', 'true');
        span.textContent = ' (partial data)';
        exportExcelBtn.after(span);
      }
    }
  }

  updateDateDisplay();
  renderSidebarContextCard();

  scheduleRender(() => {
    populateBoardsPills();
    populateSprintsPills();
    renderProjectEpicLevelTab(visibleBoardRows, previewData.metrics);
    renderSprintsTab(visibleSprintRows, previewData.metrics);
    renderDoneStoriesTab(visibleRows);
    renderUnusableSprintsTab(previewData.sprintsUnusable);
    renderTrendsTab(previewData);
    applyDoneStoriesOptionalColumnsPreference();

    const boardsCountForTab = previewData.boards?.length ?? 0;
    const sprintsCountForTab = previewData.sprintsIncluded?.length ?? 0;
    const unusableCountForTab = previewData.sprintsUnusable?.length ?? 0;
    const tabBoards = document.getElementById('tab-btn-project-epic-level');
    const tabSprints = document.getElementById('tab-btn-sprints');
    const tabDoneStories = document.getElementById('tab-btn-done-stories');
    const tabUnusable = document.getElementById('tab-btn-unusable-sprints');
    if (tabBoards) tabBoards.textContent = 'Team performance (' + boardsCountForTab + ')';
    if (tabSprints) tabSprints.textContent = 'Sprint history (' + sprintsCountForTab + ')';
    if (tabDoneStories) tabDoneStories.textContent = 'Outcome list (' + visibleRows.length + ')';
    if (tabUnusable) tabUnusable.textContent = 'Excluded sprints (' + unusableCountForTab + ')';
    if (tabBoards && !tabBoards.classList.contains('active')) {
      tabBoards.click();
    }

    requestAnimationFrame(() => {
      const projectEpicLevelBtn = document.querySelector('.export-section-btn[data-section="project-epic-level"]');
      if (projectEpicLevelBtn && projectEpicLevelBtn.parentElement) {
        const hasBoards = previewData.boards && previewData.boards.length > 0;
        const hasMetrics = previewData.metrics && Object.keys(previewData.metrics).length > 0;
        projectEpicLevelBtn.style.display = (hasBoards || hasMetrics) ? 'inline-block' : 'none';
      }

      const sprintsBtn = document.querySelector('.export-section-btn[data-section="sprints"]');
      if (sprintsBtn && sprintsBtn.parentElement) {
        sprintsBtn.style.display = (previewData.sprintsIncluded && previewData.sprintsIncluded.length > 0) ? 'inline-block' : 'none';
      }

      const doneStoriesBtn = document.querySelector('.export-section-btn[data-section="done-stories"]');
      if (doneStoriesBtn && doneStoriesBtn.parentElement) {
        doneStoriesBtn.style.display = (visibleRows.length > 0 || previewRows.length > 0) ? 'inline-block' : 'none';
      }
    });

    updateExportFilteredState();
  });
}
