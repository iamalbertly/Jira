import { reportDom } from './Reporting-App-Report-Page-Context.js';
import { reportState } from './Reporting-App-Report-Page-State.js';
import { escapeHtml } from './Reporting-App-Shared-Dom-Escape-Helpers.js';
import { formatDateForDisplay } from './Reporting-App-Shared-Format-DateNumber-Helpers.js';
import { buildJiraIssueUrl } from './Reporting-App-Report-Utils-Jira-Helpers.js';
import { getSafeMeta } from './Reporting-App-Report-Page-Render-Helpers.js';
import { scheduleRender } from './Reporting-App-Report-Page-Loading-Steps.js';
import { updateDateDisplay } from './Reporting-App-Report-Page-DateRange-Controller.js';
import { REPORT_LAST_RUN_KEY } from './Reporting-App-Shared-Storage-Keys.js';
import {
  populateBoardsPills,
  populateSprintsPills,
  renderProjectEpicLevelTab,
  renderSprintsTab,
  renderDoneStoriesTab,
  renderUnusableSprintsTab,
  updateExportFilteredState,
} from './Reporting-App-Report-Page-Render-Registry.js';
import { applyDoneStoriesOptionalColumnsPreference } from './Reporting-App-Report-Page-DoneStories-Column-Preference.js';

function buildPreviewMetaAndStatus(params) {
  const { meta, previewRows = [], boardsCount, sprintsCount, rowsCount, unusableCount } = params;
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
  if (elapsedMs != null) detailsLines.push(`Generated in ~${Math.round(elapsedMs / 1000)}s`);
  if (meta.generatedAt) detailsLines.push(`Generated At: ${new Date(meta.generatedAt).toLocaleString()}`);
  if (meta.requestedAt) detailsLines.push(`Request Time: ${new Date(meta.requestedAt).toLocaleString()}`);
  if (fromCache) {
    detailsLines.push('Source: Cache');
    if (meta.cacheAgeMinutes !== undefined) detailsLines.push(`Cache age: ${meta.cacheAgeMinutes} minutes`);
    if (cachedElapsedMs != null) detailsLines.push(`Original generation: ~${Math.round(cachedElapsedMs / 1000)}s`);
  } else {
    detailsLines.push('Source: Jira (live request)');
  }
  if (previewMode && previewMode !== 'normal') {
    const modeLabel = previewMode === 'recent-only'
      ? 'Recent-only (last 2 weeks)'
      : (previewMode === 'recent-first' ? 'Recent-first (recent data prioritized)' : previewMode);
    detailsLines.push(`Preview mode: ${modeLabel}`);
  }
  if (timedOut) detailsLines.push('Time budget: hit (preview returned partial data before full completion)');
  if (recentSplitDays && recentCutoffDate && !Number.isNaN(recentCutoffDate.getTime())) {
    detailsLines.push(`Recent window: last ${recentSplitDays} days (from ${recentCutoffDate.toUTCString()})`);
  }
  if (meta.fieldInventory) {
    const foundCount = Array.isArray(meta.fieldInventory.ebmFieldsFound) ? meta.fieldInventory.ebmFieldsFound.length : 0;
    const missingCount = Array.isArray(meta.fieldInventory.ebmFieldsMissing) ? meta.fieldInventory.ebmFieldsMissing.length : 0;
    detailsLines.push(`EBM fields found: ${foundCount}, missing: ${missingCount}`);
  }
  if (!meta.discoveredFields?.storyPointsFieldId) detailsLines.push('Story Points: not configured (SP metrics show N/A)');
  if (!meta.discoveredFields?.epicLinkFieldId) detailsLines.push('Epic Links: not configured (Epic rollups limited)');

  const partialNotice = partial
    ? '<br><span class="partial-warning">Partial data: this preview hit a time limit. Export shows exactly what you see; try a smaller range for full history.</span>'
    : '';

  const selectedProjectsLabel = meta.selectedProjects?.length > 0 ? meta.selectedProjects.join(', ') : 'None';
  const sampleRow = previewRows && previewRows.length > 0 ? previewRows[0] : null;
  let sampleLabel = 'None';
  if (sampleRow) {
    const host = meta.jiraHost || meta.host || '';
    const sampleKey = sampleRow.issueKey || '';
    const sampleSummary = sampleRow.issueSummary || '';
    const url = buildJiraIssueUrl(host, sampleKey);
    const keyText = escapeHtml(sampleKey);
    const summaryText = escapeHtml(sampleSummary);
    sampleLabel = url
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${keyText}</a> - ${summaryText}`
      : `${keyText} - ${summaryText}`;
  }

  const reportSubtitleText = `Projects: ${selectedProjectsLabel} | ${windowStartLocal} to ${windowEndLocal}`;
  const opts = [];
  if (meta.requireResolvedBySprintEnd) opts.push('Require resolved by sprint end');
  if (meta.includePredictability) opts.push('Include Predictability');
  const appliedFiltersText = `Applied: ${selectedProjectsLabel} | ${windowStartLocal} - ${windowEndLocal}${opts.length ? ' | ' + opts.join(', ') : ''}`;

  const partialSuffix = partial ? ' (partial)' : '';
  let prevRunHtml = '';
  try {
    const lastRun = sessionStorage.getItem(REPORT_LAST_RUN_KEY);
    if (lastRun) {
      const obj = JSON.parse(lastRun);
      const prevStories = typeof obj.doneStories === 'number' ? obj.doneStories : 0;
      const prevSprints = typeof obj.sprintsCount === 'number' ? obj.sprintsCount : 0;
      prevRunHtml = '<span class="preview-previous-run" aria-live="polite"> Previous run: ' + prevStories + ' done stories, ' + prevSprints + ' sprints.</span>';
    }
  } catch (_) {}
  const outcomeLineHTML = escapeHtml(rowsCount + ' done stories | ' + sprintsCount + ' sprints | ' + boardsCount + ' boards in window' + partialSuffix) + prevRunHtml;

  const phaseLog = Array.isArray(meta.phaseLog) ? meta.phaseLog : [];
  const phaseLogHtml = phaseLog.length > 0
    ? '<br><strong>Phase log:</strong> ' + phaseLog.map((p) => escapeHtml((p.phase || '') + (p.at ? ' @ ' + p.at : ''))).join(' | ')
    : '';
  let metaSummaryWhy = '';
  if (partial) metaSummaryWhy = partialReason ? ` | Partial: ${escapeHtml(partialReason)}` : ' | Partial: time limit';
  else if (timedOut) metaSummaryWhy = ' | Time limit reached (partial data)';
  else if (previewMode === 'recent-first') metaSummaryWhy = ' | Recent live; older from cache';

  const generatedAtMs = meta.generatedAt ? new Date(meta.generatedAt).getTime() : Date.now();
  const ageMs = Date.now() - generatedAtMs;
  const generatedShort = meta.generatedAt
    ? new Date(meta.generatedAt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
    : new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const generatedLabel = ageMs >= 0 && ageMs < 3600000
    ? (Math.round(ageMs / 60000) < 1 ? 'Generated: just now' : 'Generated: ' + Math.round(ageMs / 60000) + ' min ago')
    : 'Generated: ' + generatedShort;
  const generatedAgoSuffix = meta.generatedAt
    ? (Math.round(ageMs / 60000) < 1 ? ' · Generated just now' : ' · Generated ' + Math.round(ageMs / 60000) + ' min ago')
    : '';

  const outcomeLine = `${rowsCount} done stories · ${sprintsCount} sprints · ${boardsCount} boards · ${escapeHtml(generatedLabel)}${metaSummaryWhy ? ' ' + metaSummaryWhy : ''}`;
  const contextLine = `Projects: ${escapeHtml(selectedProjectsLabel)} | Window: ${escapeHtml(windowStartLocal)} – ${escapeHtml(windowEndLocal)}`;
  const previewMetaHTML = `
    <div class="meta-info-summary">
      <div class="meta-outcome-line">${outcomeLine}</div>
      <div class="meta-context-line">${contextLine}</div>
      <button type="button" id="preview-meta-details-toggle" class="btn btn-secondary btn-compact meta-details-toggle-btn" data-action="toggle-preview-meta-details" aria-expanded="false" aria-controls="preview-meta-details">Technical details</button>
    </div>
    <div id="preview-meta-details" class="meta-info meta-info-details" hidden>
      <strong>Date Window (UTC):</strong> ${escapeHtml(windowStartUtc)} to ${escapeHtml(windowEndUtc)}<br>
      <strong>Example story:</strong> ${sampleLabel}<br>
      <strong>Details:</strong> ${escapeHtml(detailsLines.join(' | '))}
      ${phaseLogHtml}
      ${partialNotice}
    </div>
  `;

  const stickyText = `Preview: ${selectedProjectsLabel} | ${windowStartLocal} to ${windowEndLocal}${generatedAgoSuffix}`;
  let statusHTML = '';
  let statusDisplay = 'none';
  if (rowsCount > 0 && (partial || previewMode !== 'normal')) {
    let bannerMessage;
    if (partial) {
      bannerMessage = 'Partial data: preview hit a time limit. Export shows what you see now; narrow the dates for full history.';
    } else if (previewMode === 'recent-first' || previewMode === 'recent-only' || recentSplitDays) {
      const days = recentSplitDays || 14;
      bannerMessage = `Faster mode: latest ${days} days live, older sprints from cache. Export matches what you see.`;
    } else {
      bannerMessage = 'Faster mode: preview optimized for speed. Export matches the on-screen data; run Full refresh if you need a fully fresh history.';
    }
    statusHTML = `
      <div class="status-banner warning alert-warning">
        <div class="status-banner-message">${escapeHtml(bannerMessage)}</div>
        <div class="status-banner-actions">
          <button type="button" data-action="retry-with-smaller-range" class="btn btn-compact btn-primary">Use smaller range</button>
          <button type="button" data-action="force-full-refresh" class="btn btn-compact">Full refresh</button>
        </div>
        <button type="button" class="status-close" aria-label="Dismiss">x</button>
      </div>
    `;
    statusDisplay = 'block';
  }
  return { reportSubtitleText, appliedFiltersText, outcomeLineHTML, previewMetaHTML, stickyText, statusHTML, statusDisplay };
}

export function renderPreview() {
  const { previewData, previewRows, visibleRows, visibleBoardRows, visibleSprintRows } = reportState;
  const { errorEl, previewContent, previewMeta, exportExcelBtn, exportDropdownTrigger } = reportDom;
  if (!previewData) return;

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
  if (reportSubtitleEl) reportSubtitleEl.textContent = metaBlock.reportSubtitleText;
  const appliedFiltersEl = document.getElementById('applied-filters-summary');
  if (appliedFiltersEl) appliedFiltersEl.textContent = metaBlock.appliedFiltersText;
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
  const headerExportBtn = document.getElementById('preview-header-export-excel-btn');
  if (headerExportBtn) headerExportBtn.disabled = !hasRows;

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
    const exportWrap = headerExportBtn.parentElement;
    if (exportWrap) {
      const existing = exportWrap.querySelector('.partial-data-inline');
      if (existing) existing.remove();
      if (partial) {
        const span = document.createElement('span');
        span.className = 'partial-data-inline';
        span.setAttribute('aria-hidden', 'true');
        span.textContent = ' (partial data)';
        headerExportBtn.after(span);
      }
    }
  }

  updateDateDisplay();

  scheduleRender(() => {
    populateBoardsPills();
    populateSprintsPills();
    renderProjectEpicLevelTab(visibleBoardRows, previewData.metrics);
    renderSprintsTab(visibleSprintRows, previewData.metrics);
    renderDoneStoriesTab(visibleRows);
    renderUnusableSprintsTab(previewData.sprintsUnusable);
    applyDoneStoriesOptionalColumnsPreference();

    const boardsCountForTab = previewData.boards?.length ?? 0;
    const sprintsCountForTab = previewData.sprintsIncluded?.length ?? 0;
    const unusableCountForTab = previewData.sprintsUnusable?.length ?? 0;
    const tabBoards = document.getElementById('tab-btn-project-epic-level');
    const tabSprints = document.getElementById('tab-btn-sprints');
    const tabDoneStories = document.getElementById('tab-btn-done-stories');
    const tabUnusable = document.getElementById('tab-btn-unusable-sprints');
    if (tabBoards) tabBoards.textContent = 'Project & Epic Level (' + boardsCountForTab + ')';
    if (tabSprints) tabSprints.textContent = 'Sprints (' + sprintsCountForTab + ')';
    if (tabDoneStories) tabDoneStories.textContent = 'Done Stories (' + visibleRows.length + ')';
    if (tabUnusable) tabUnusable.textContent = 'Unusable Sprints (' + unusableCountForTab + ')';

    if (visibleRows.length > 0 && tabDoneStories && !tabDoneStories.classList.contains('active')) {
      tabDoneStories.click();
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
