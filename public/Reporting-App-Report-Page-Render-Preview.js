import { reportDom } from './Reporting-App-Report-Page-Context.js';
import { reportState } from './Reporting-App-Report-Page-State.js';
import { formatDateForDisplay, formatNumber, formatPercent } from './Reporting-App-Shared-Format-DateNumber-Helpers.js';
import { escapeHtml } from './Reporting-App-Shared-Dom-Escape-Helpers.js';
import { getSafeMeta } from './Reporting-App-Report-Page-Render-Helpers.js';
import { scheduleRender } from './Reporting-App-Report-Page-Loading-Steps.js';
import { updateDateDisplay } from './Reporting-App-Report-Page-DateRange-Controller.js';
import { buildJiraIssueUrl } from './Reporting-App-Report-Utils-Jira-Helpers.js';
import {
  populateBoardsPills,
  populateSprintsPills,
  renderProjectEpicLevelTab,
  renderSprintsTab,
  renderDoneStoriesTab,
  renderUnusableSprintsTab,
  updateExportFilteredState,
} from './Reporting-App-Report-Page-Render-Registry.js';

export function renderPreview() {
  const { previewData, previewRows, visibleRows, visibleBoardRows, visibleSprintRows } = reportState;
  const { errorEl, previewContent, previewMeta, exportExcelBtn, exportDropdownTrigger } = reportDom;
  if (!previewData) return;

  const meta = getSafeMeta(previewData);
  if (!meta) {
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
  const startDate = new Date(meta.windowStart);
  const endDate = new Date(meta.windowEnd);
  const windowStartLocal = formatDateForDisplay(meta.windowStart);
  const windowEndLocal = formatDateForDisplay(meta.windowEnd);
  const windowStartUtc = startDate && !Number.isNaN(startDate.getTime()) ? startDate.toUTCString() : '';
  const windowEndUtc = endDate && !Number.isNaN(endDate.getTime()) ? endDate.toUTCString() : '';
  const fromCache = meta.fromCache === true;
  const partial = meta.partial === true;
  const partialReason = meta.partialReason || '';
  const previewMode = meta.previewMode || 'normal';
  const timedOut = meta.timedOut === true;
  const recentSplitDays = typeof meta.recentSplitDays === 'number' ? meta.recentSplitDays : null;
  const recentCutoffDate = meta.recentCutoffDate ? new Date(meta.recentCutoffDate) : null;
  const elapsedMs = typeof meta.elapsedMs === 'number' ? meta.elapsedMs : null;
  const cachedElapsedMs = typeof meta.cachedElapsedMs === 'number' ? meta.cachedElapsedMs : null;

  const detailsLines = [];
  if (elapsedMs != null) {
    const seconds = Math.round(elapsedMs / 1000);
    detailsLines.push(`Generated in ~${seconds}s`);
  }
  if (meta.generatedAt) {
    detailsLines.push(`Generated At: ${new Date(meta.generatedAt).toLocaleString()}`);
  }
  if (meta.requestedAt) {
    detailsLines.push(`Request Time: ${new Date(meta.requestedAt).toLocaleString()}`);
  }
  if (fromCache) {
    detailsLines.push('Source: Cache');
    if (meta.cacheAgeMinutes !== undefined) {
      detailsLines.push(`Cache age: ${meta.cacheAgeMinutes} minutes`);
    }
    if (cachedElapsedMs != null) {
      const cachedSeconds = Math.round(cachedElapsedMs / 1000);
      detailsLines.push(`Original generation: ~${cachedSeconds}s`);
    }
  } else {
    detailsLines.push('Source: Jira (live request)');
  }
  if (previewMode && previewMode !== 'normal') {
    const modeLabel = previewMode === 'recent-only'
      ? 'Recent-only (last 2 weeks)'
      : (previewMode === 'recent-first' ? 'Recent-first (recent data prioritised)' : previewMode);
    detailsLines.push(`Preview mode: ${modeLabel}`);
  }
  if (timedOut) {
    detailsLines.push('Time budget: hit (preview returned partial data before full completion)');
  }
  if (recentSplitDays && recentCutoffDate && !Number.isNaN(recentCutoffDate.getTime())) {
    detailsLines.push(`Recent window: last ${recentSplitDays} days (from ${recentCutoffDate.toUTCString()})`);
  }
  if (meta.fieldInventory) {
    const foundCount = Array.isArray(meta.fieldInventory.ebmFieldsFound) ? meta.fieldInventory.ebmFieldsFound.length : 0;
    const missingCount = Array.isArray(meta.fieldInventory.ebmFieldsMissing) ? meta.fieldInventory.ebmFieldsMissing.length : 0;
    detailsLines.push(`EBM fields found: ${foundCount}, missing: ${missingCount}`);
  }
  if (!meta.discoveredFields?.storyPointsFieldId) {
    detailsLines.push('Story Points: not configured (SP metrics show N/A)');
  }
  if (!meta.discoveredFields?.epicLinkFieldId) {
    detailsLines.push('Epic Links: not configured (Epic rollups limited)');
  }

  const partialNotice = partial
    ? `<br><span class="partial-warning"><strong>Note:</strong> This preview is <em>partial</em>${timedOut ? ' because the server time budget was reached' : ''}${partialReason ? `: ${escapeHtml(partialReason)}` : '.'} Data may be incomplete; consider narrowing the date range or reducing options and trying again.</span>`
    : '';

  const selectedProjectsLabel = meta.selectedProjects.length > 0 ? meta.selectedProjects.join(', ') : 'None';
  const sampleRow = previewRows && previewRows.length > 0 ? previewRows[0] : null;
  let sampleLabel = 'None';
  if (sampleRow) {
    const host = meta.jiraHost || meta.host || '';
    const sampleKey = sampleRow.issueKey || '';
    const sampleSummary = sampleRow.issueSummary || '';
    const url = buildJiraIssueUrl(host, sampleKey);
    const keyText = escapeHtml(sampleKey);
    const summaryText = escapeHtml(sampleSummary);
    if (url) {
      sampleLabel = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${keyText}</a> - ${summaryText}`;
    } else {
      sampleLabel = `${keyText} - ${summaryText}`;
    }
  }

  const reportSubtitleEl = document.getElementById('report-subtitle');
  if (reportSubtitleEl) {
    reportSubtitleEl.textContent = `Projects: ${selectedProjectsLabel} | ${windowStartLocal} to ${windowEndLocal}`;
  }

  const appliedFiltersEl = document.getElementById('applied-filters-summary');
  if (appliedFiltersEl) {
    const opts = [];
    if (meta.requireResolvedBySprintEnd) opts.push('Require resolved by sprint end');
    if (meta.includePredictability) opts.push('Include Predictability');
    appliedFiltersEl.textContent = `Applied: ${selectedProjectsLabel} · ${windowStartLocal} – ${windowEndLocal}${opts.length ? ' · ' + opts.join(', ') : ''}`;
  }

  if (previewMeta) {
    const generatedUtc = meta.generatedAt ? new Date(meta.generatedAt).toISOString() : new Date().toISOString();
    const generatedShort = meta.generatedAt ? new Date(meta.generatedAt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    previewMeta.innerHTML = `
      <div class="meta-info-summary">
        <span class="meta-summary-line">Projects: ${escapeHtml(selectedProjectsLabel)} · Window: ${escapeHtml(windowStartLocal)} – ${escapeHtml(windowEndLocal)} · Boards: ${boardsCount} / Sprints: ${sprintsCount} / Stories: ${rowsCount} / Unusable: ${unusableCount} · Generated: ${escapeHtml(generatedShort)}</span>
        <button type="button" id="preview-meta-details-toggle" class="btn btn-secondary btn-compact" data-action="toggle-preview-meta-details" aria-expanded="false" aria-controls="preview-meta-details">Details</button>
      </div>
      <div id="preview-meta-details" class="meta-info meta-info-details" hidden>
        <strong>Date Window (UTC):</strong> ${escapeHtml(windowStartUtc)} to ${escapeHtml(windowEndUtc)}<br>
        <strong>Example story:</strong> ${sampleLabel}<br>
        <strong>Details:</strong> ${escapeHtml(detailsLines.join(' · '))}
        ${partialNotice}
      </div>
    `;
  }

  const stickyEl = document.getElementById('preview-summary-sticky');
  if (stickyEl) {
    stickyEl.textContent = `Preview: ${selectedProjectsLabel} · ${windowStartLocal} to ${windowEndLocal}`;
    stickyEl.setAttribute('aria-hidden', 'false');
  }

  const statusEl = document.getElementById('preview-status');
  if (statusEl) {
    if (partial || previewMode !== 'normal') {
      const modeBadge = previewMode === 'recent-only'
        ? 'Recent-only'
        : (previewMode === 'recent-first' ? 'Recent-first' : 'Full history');
      let baseMessage;
      let hint;
      if (partial) {
        if (timedOut) {
          baseMessage = 'Preview is partial because the server time budget was reached.';
          hint = 'Data may be incomplete; try a smaller date range, fewer projects, or disabling the heaviest options before trying again.';
        } else {
          baseMessage = `Preview is partial${partialReason ? `: ${escapeHtml(partialReason)}` : ''}`;
          hint = 'Data may be incomplete; consider narrowing the date range or disabling heavy options before trying again.';
        }
      } else {
        baseMessage = 'Preview completed with optimised windowing for faster results.';
        hint = 'Older history may be served from cache; use full refresh if you need a fully fresh historical view.';
      }
      statusEl.innerHTML = `
        <div class="status-banner warning">
          <strong>${modeBadge}</strong> – ${baseMessage}
          <br><small>${hint}</small>
          <div style="margin-top: 6px; display: flex; gap: 8px; flex-wrap: wrap;">
            <button type="button" data-action="retry-preview" class="btn btn-compact">Retry</button>
            <button type="button" data-action="retry-with-smaller-range" class="btn btn-compact btn-primary">Smaller range</button>
            <button type="button" data-action="force-full-refresh" class="btn btn-secondary btn-compact">Full refresh</button>
          </div>
          <button type="button" class="status-close" aria-label="Dismiss">x</button>
        </div>
      `;
      statusEl.style.display = 'block';
    } else {
      statusEl.innerHTML = '';
      statusEl.style.display = 'none';
    }
  }

  const hasRows = rowsCount > 0;
  if (exportDropdownTrigger) exportDropdownTrigger.disabled = !hasRows;
  if (exportExcelBtn) exportExcelBtn.disabled = !hasRows;
  const headerExportBtn = document.getElementById('preview-header-export-excel-btn');
  if (headerExportBtn) headerExportBtn.disabled = !hasRows;

  const exportHint = document.getElementById('export-hint');
  if (exportHint) {
    if (!hasRows) {
      exportHint.innerHTML = `
        <small>Generate a report with data to enable export. Use the main Excel button for the full workbook, or per-tab Export CSV for focused slices.</small>
      `;
    } else if (partial) {
      exportHint.innerHTML = `
        <small>Note: Preview is partial; CSV exports will only contain currently loaded data.</small>
      `;
    } else {
      exportHint.innerHTML = '';
    }
  }

  const partialExportTitle = 'Export contains only loaded (partial) data.';
  if (exportExcelBtn) {
    exportExcelBtn.title = partial ? partialExportTitle : '';
    if (partial) exportExcelBtn.setAttribute('aria-label', partialExportTitle);
    else exportExcelBtn.removeAttribute('aria-label');
  }
  if (exportDropdownTrigger) {
    exportDropdownTrigger.title = partial ? partialExportTitle : '';
    if (partial) exportDropdownTrigger.setAttribute('aria-label', partialExportTitle);
    else exportDropdownTrigger.removeAttribute('aria-label');
  }
  if (headerExportBtn) {
    headerExportBtn.title = partial ? partialExportTitle : '';
    if (partial) headerExportBtn.setAttribute('aria-label', partialExportTitle);
    else headerExportBtn.removeAttribute('aria-label');
  }

  updateDateDisplay();

  scheduleRender(() => {
    populateBoardsPills();
    populateSprintsPills();
    renderProjectEpicLevelTab(visibleBoardRows, previewData.metrics);
    renderSprintsTab(visibleSprintRows, previewData.metrics);
    renderDoneStoriesTab(visibleRows);
    renderUnusableSprintsTab(previewData.sprintsUnusable);

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
