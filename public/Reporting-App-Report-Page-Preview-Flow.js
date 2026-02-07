/**
 * Report page preview flow: init, event handlers, fetch, and apply payload.
 * SIZE-EXEMPT: Cohesive preview flow (DOM events, fetch, AbortController, applyPayload, timeout UI)
 * kept in one module to avoid scattering and duplicate state handling; complexity config split to
 * Reporting-App-Report-Page-Preview-Complexity-Config.js.
 */
import { reportDom } from './Reporting-App-Report-Page-Context.js';
import { persistDoneStoriesOptionalColumnsPreference } from './Reporting-App-Report-Page-DoneStories-Column-Preference.js';
import { triggerExcelExport } from './Reporting-App-Report-Page-Export-Menu.js';
import { reportState } from './Reporting-App-Report-Page-State.js';
import { collectFilterParams } from './Reporting-App-Report-Page-Filter-Params.js';
import { LAST_QUERY_KEY } from './Reporting-App-Shared-Storage-Keys.js';
import { updateLoadingMessage, clearLoadingSteps, readResponseJson, hideLoadingIfVisible } from './Reporting-App-Report-Page-Loading-Steps.js';
import { emitTelemetry } from './Reporting-App-Shared-Telemetry.js';
import { renderPreview } from './Reporting-App-Report-Page-Render-Preview.js';
import { updateExportFilteredState, updateExportHint } from './Reporting-App-Report-Page-Export-Menu.js';
import { sortSprintsLatestFirst } from './Reporting-App-Report-Page-Sorting.js';
import { escapeHtml } from './Reporting-App-Shared-Dom-Escape-Helpers.js';
import {
  RECENT_SPLIT_DEFAULT_DAYS,
  PREVIEW_TIMEOUT_LIGHT_MS,
  classifyPreviewComplexity,
  getClientBudgetMs,
} from './Reporting-App-Report-Page-Preview-Complexity-Config.js';

function setQuickRangeButtonsDisabled(disabled) {
  document.querySelectorAll('.quick-range-btn[data-quarter], .quarter-pill').forEach((button) => {
    button.disabled = disabled;
  });
}

function showReportError(shortText, detailsText) {
  const errorEl = reportDom.errorEl;
  if (!errorEl) return;
  errorEl.style.display = 'block';
  const detailsEscaped = detailsText ? escapeHtml(detailsText) : '';
  errorEl.innerHTML = `
    <div role="alert">
      <strong>${escapeHtml(shortText)}</strong>
      ${detailsEscaped ? `<button type="button" class="btn btn-compact error-details-toggle" data-action="toggle-error-details" aria-expanded="false">Details</button><div class="error-details" hidden>${detailsEscaped}</div>` : ''}
      <button type="button" class="error-close" aria-label="Dismiss">x</button>
    </div>
  `;
}

/**
 * When filters change while preview is visible, clear preview and show message so user does not mistake stale data for new selection.
 */
export function clearPreviewOnFilterChange() {
  const { previewContent, errorEl, exportExcelBtn, exportDropdownTrigger } = reportDom;
  if (!previewContent || previewContent.style.display === 'none') return;
  previewContent.style.display = 'none';
  reportState.previewData = null;
  reportState.previewRows = [];
  reportState.visibleRows = [];
  reportState.visibleBoardRows = [];
  reportState.visibleSprintRows = [];
  reportState.previewHasRows = false;
  reportState.predictabilityPerSprint = null;
  if (errorEl) {
    errorEl.style.display = 'block';
    errorEl.innerHTML = '<div role="alert"><strong>Filters changed.</strong> Run Preview to update. <button type="button" class="btn btn-primary btn-compact" data-action="retry-preview">Preview report</button> <button type="button" class="error-close" aria-label="Dismiss">x</button></div>';
  }
  if (exportExcelBtn) exportExcelBtn.disabled = true;
  if (exportDropdownTrigger) exportDropdownTrigger.disabled = true;
  const headerExportBtn = document.getElementById('preview-header-export-excel-btn');
  if (headerExportBtn) headerExportBtn.disabled = true;
  updateExportHint();
}

export function initPreviewFlow() {
  const { previewBtn, exportDropdownTrigger, exportExcelBtn, loadingEl, errorEl, previewContent } = reportDom;
  if (!previewBtn) return;

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!target || !('classList' in target)) return;

    if (target.classList.contains('status-close')) {
      const banner = target.closest('.status-banner');
      if (banner && banner.parentElement) {
        const container = banner.parentElement;
        container.innerHTML = '';
        if ('style' in container) {
          container.style.display = 'none';
        }
      }
    }

    if (target.classList.contains('error-close')) {
      if (errorEl) {
        errorEl.style.display = 'none';
        errorEl.innerHTML = '';
      }
      if (!previewBtn.disabled && typeof previewBtn.focus === 'function') {
        previewBtn.focus();
      }
    }

    // Retry action (for refresh failures)
    if (target.getAttribute && target.getAttribute('data-action') === 'retry-preview') {
      if (previewBtn && !previewBtn.disabled) {
        previewBtn.click();
      }
    }

    if (target.getAttribute && target.getAttribute('data-action') === 'force-full-refresh') {
      if (previewBtn && !previewBtn.disabled) {
        previewBtn.dataset.bypassCache = 'true';
        previewBtn.click();
      }
    }

    if (target.getAttribute && target.getAttribute('data-action') === 'retry-with-smaller-range') {
      const endInput = document.getElementById('end-date');
      const startInput = document.getElementById('start-date');
      if (endInput && startInput) {
        const endValue = endInput.value || '';
        const endDate = endValue ? new Date(endValue) : null;
        if (endDate && !Number.isNaN(endDate.getTime())) {
          const adjusted = new Date(endDate);
          adjusted.setDate(adjusted.getDate() - 30);
          const pad = (num) => String(num).padStart(2, '0');
          const adjustedLocal = `${adjusted.getFullYear()}-${pad(adjusted.getMonth() + 1)}-${pad(adjusted.getDate())}T00:00`;
          startInput.value = adjustedLocal;
        }
      }
      if (previewBtn && !previewBtn.disabled) {
        previewBtn.click();
      }
    }

    if (target.getAttribute && target.getAttribute('data-action') === 'toggle-preview-meta-details') {
      const detailsEl = document.getElementById('preview-meta-details');
      if (detailsEl) {
        const isHidden = detailsEl.hidden;
        detailsEl.hidden = !isHidden;
        if (target.getAttribute('aria-expanded') !== null) target.setAttribute('aria-expanded', String(!isHidden));
        target.textContent = isHidden ? 'Hide details' : 'Details';
      }
    }

    if (target.getAttribute && target.getAttribute('data-action') === 'trigger-export-excel') {
      triggerExcelExport();
    }

    if (target.getAttribute && target.getAttribute('data-action') === 'toggle-error-details') {
      const detailsEl = target.nextElementSibling;
      if (detailsEl && detailsEl.classList && detailsEl.classList.contains('error-details')) {
        const isHidden = detailsEl.hidden;
        detailsEl.hidden = !isHidden;
        target.setAttribute('aria-expanded', String(!isHidden));
        target.textContent = isHidden ? 'Hide details' : 'Details';
      }
    }

    if (target.getAttribute && target.getAttribute('data-action') === 'toggle-done-stories-optional-columns') {
      const tab = document.getElementById('tab-done-stories');
      if (tab) {
        const show = !tab.classList.contains('show-optional-columns');
        tab.classList.toggle('show-optional-columns', show);
        target.setAttribute('aria-expanded', String(show));
        target.textContent = show ? 'Show fewer columns' : 'Show more columns';
        persistDoneStoriesOptionalColumnsPreference(show);
      }
    }
  });

  previewBtn.addEventListener('click', async () => {
    let timeoutId;
    let progressInterval;
    let timeoutMs = PREVIEW_TIMEOUT_LIGHT_MS;
    let isLoading = true;
    const cachePrefix = 'reportPreview:';
    const bypassCache = previewBtn.dataset.bypassCache === 'true';
    if (bypassCache) {
      previewBtn.dataset.bypassCache = 'false';
    }

    const prevExportFilteredDisabled = exportDropdownTrigger ? exportDropdownTrigger.disabled : true;
    const prevExportExcelDisabled = exportExcelBtn ? exportExcelBtn.disabled : true;

    previewBtn.disabled = true;
    previewBtn.textContent = 'Loading…';
    if (exportDropdownTrigger) exportDropdownTrigger.disabled = true;
    if (exportExcelBtn) exportExcelBtn.disabled = true;
    updateExportHint();
    setQuickRangeButtonsDisabled(true);

    if (loadingEl) {
      requestAnimationFrame(() => {
        if (isLoading) {
          loadingEl.style.display = 'block';
          loadingEl.setAttribute('aria-hidden', 'false');
        }
      });
    }
    if (errorEl) errorEl.style.display = 'none';

    const hasExistingPreview = !!reportState.previewData && previewContent && previewContent.style.display !== 'none';
    const statusEl = document.getElementById('preview-status');
    if (hasExistingPreview && statusEl) {
      statusEl.innerHTML = `
        <div class="status-banner info">
          Refreshing preview... Showing the last successful results while new data loads.
          <button type="button" class="status-close" aria-label="Dismiss">x</button>
        </div>
      `;
      statusEl.style.display = 'block';
    }

    if (!hasExistingPreview && previewContent) {
      previewContent.style.display = 'none';
    }

    clearLoadingSteps();
    updateLoadingMessage('Preparing request...', 'Finding boards and sprints');

    let params;
    try {
      params = collectFilterParams();
    } catch (error) {
      if (loadingEl) loadingEl.style.display = 'none';
      showReportError('Check filters', (error && typeof error.message === 'string') ? error.message : 'Please fix the filters above and try again.');
      previewBtn.disabled = false;
      previewBtn.textContent = 'Preview report';
      setQuickRangeButtonsDisabled(false);
      if (exportDropdownTrigger) exportDropdownTrigger.disabled = prevExportFilteredDisabled;
      if (exportExcelBtn) exportExcelBtn.disabled = prevExportExcelDisabled;
      if (error && typeof error.message === 'string') {
        if (error.message.toLowerCase().includes('start date')) {
          const startInput = document.getElementById('start-date');
          if (startInput && typeof startInput.focus === 'function') {
            startInput.focus();
          }
        } else if (error.message.toLowerCase().includes('end date')) {
          const endInput = document.getElementById('end-date');
          if (endInput && typeof endInput.focus === 'function') {
            endInput.focus();
          }
        } else if (error.message.toLowerCase().includes('at least one project')) {
          const firstProject = document.querySelector('.project-checkbox');
          if (firstProject && typeof firstProject.focus === 'function') {
            firstProject.focus();
          }
        }
      }
      return;
    }

    if (bypassCache) {
      params.bypassCache = true;
    }

    const startMs = params.start ? new Date(params.start).getTime() : NaN;
    const endMs = params.end ? new Date(params.end).getTime() : NaN;
    const rangeDays = (!Number.isNaN(startMs) && !Number.isNaN(endMs))
      ? Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24))
      : null;

    const projectCount = params.projects
      ? params.projects.split(',').map((p) => p.trim()).filter(Boolean).length
      : 0;

    const { level: complexityLevel } = classifyPreviewComplexity({
      rangeDays,
      projectCount,
      includePredictability: params.includePredictability === true || params.includePredictability === 'true',
      includeActiveOrMissingEndDateSprints:
        params.includeActiveOrMissingEndDateSprints === true
        || params.includeActiveOrMissingEndDateSprints === 'true',
      requireResolvedBySprintEnd:
        params.requireResolvedBySprintEnd === true || params.requireResolvedBySprintEnd === 'true',
    });

    let previewMode = 'normal';
    if (complexityLevel === 'heavy') {
      previewMode = 'recent-first';
    } else if (complexityLevel === 'veryHeavy') {
      previewMode = 'recent-only';
    }

    if (rangeDays && rangeDays > RECENT_SPLIT_DEFAULT_DAYS && previewMode !== 'recent-only') {
      params.splitRecent = true;
      params.recentDays = RECENT_SPLIT_DEFAULT_DAYS;
    }
    if (previewMode === 'recent-only') {
      params.splitRecent = true;
      params.recentDays = RECENT_SPLIT_DEFAULT_DAYS;
    }

    params.previewMode = previewMode;
    const clientBudgetMs = getClientBudgetMs(previewMode, rangeDays);
    params.clientBudgetMs = clientBudgetMs;

    const queryString = new URLSearchParams(params).toString();
    const cacheKey = `${cachePrefix}${queryString}`;

    const readCachedPreview = () => {
      try {
        const raw = sessionStorage.getItem(cacheKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch (_) {
        return null;
      }
    };

    const writeCachedPreview = (payload) => {
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(payload));
      } catch (_) {}
    };

    const applyPreviewPayload = (payload, options = {}) => {
      const { finalize = true, fromSessionCache = false } = options;
      if (!payload || typeof payload !== 'object') return;

      if (fromSessionCache && payload.meta) {
        payload.meta.fromCache = true;
      }

      try {
        const prev = reportState.previewData;
        if (prev && (prev.rows || []).length >= 0) {
          const prevRows = (prev.rows || []).length;
          const prevSprints = (prev.sprintsIncluded || []).length;
          const prevUnusable = (prev.sprintsUnusable || []).length;
          sessionStorage.setItem('report-last-run', JSON.stringify({ doneStories: prevRows, sprintsCount: prevSprints, unusableCount: prevUnusable, at: Date.now() }));
        }
      } catch (_) {}
      reportState.previewData = payload;
      reportState.previewRows = reportState.previewData.rows || [];
      reportState.visibleRows = [...reportState.previewRows];
      const boards = reportState.previewData.boards || [];
      const sprintsIncluded = reportState.previewData.sprintsIncluded || [];
      reportState.visibleBoardRows = [...boards];
      reportState.visibleSprintRows = sortSprintsLatestFirst(sprintsIncluded);
      reportState.previewHasRows = reportState.previewRows.length > 0;

      try {
        renderPreview();
      } catch (renderErr) {
        if (errorEl) {
          errorEl.style.display = 'block';
          errorEl.innerHTML = `<div role="alert"><strong>Error:</strong> Failed to render preview: ${escapeHtml(renderErr.message || String(renderErr))}<button type="button" class="error-close" aria-label="Dismiss">x</button></div>`;
        }
      }

      if (!finalize) return;
      if (loadingEl) {
        loadingEl.style.display = 'none';
        loadingEl.setAttribute('aria-hidden', 'true');
      }
      if (previewContent) previewContent.style.display = 'block';
      try {
        window.dispatchEvent(new CustomEvent('report-preview-shown', { detail: { hasRows: reportState.previewHasRows } }));
      } catch (_) {}
      if (exportExcelBtn) exportExcelBtn.disabled = !reportState.previewHasRows;
      if (exportDropdownTrigger) exportDropdownTrigger.disabled = !reportState.previewHasRows;
      updateExportHint();
      updateExportFilteredState();
    };

    const cachedPreview = readCachedPreview();
    if (!hasExistingPreview && cachedPreview && statusEl) {
      applyPreviewPayload(cachedPreview, { finalize: false, fromSessionCache: true });
      statusEl.innerHTML = `
        <div class="status-banner info">
          Showing cached preview while refreshing with the latest data.
          <button type="button" class="status-close" aria-label="Dismiss">x</button>
        </div>
      `;
      statusEl.style.display = 'block';
    }

    try {
      updateLoadingMessage('Fetching data from Jira...', 'Loading done stories');

      const controller = new AbortController();
      timeoutMs = typeof clientBudgetMs === 'number' && clientBudgetMs > 0
        ? clientBudgetMs
        : PREVIEW_TIMEOUT_LIGHT_MS;
      timeoutId = setTimeout(() => {
        try { emitTelemetry('preview.timeout', { timeoutMs }); } catch (_) {}
        controller.abort();
      }, timeoutMs);

      let elapsedSeconds = 0;
      progressInterval = setInterval(() => {
        elapsedSeconds += 2;
        const minutes = Math.floor(elapsedSeconds / 60);
        const seconds = elapsedSeconds % 60;
        const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
        updateLoadingMessage(`Fetching data from Jira... (${timeStr})`, null);
      }, 2000);

      // Emit telemetry that a preview fetch is starting (captured by tests)
      try { emitTelemetry('preview.fetch', { params: queryString }); } catch (_) {}

      const response = await fetch(`/preview.json?${queryString}`, { signal: controller.signal });

      if (timeoutId) clearTimeout(timeoutId);
      if (progressInterval) clearInterval(progressInterval);

      updateLoadingMessage('Processing response...', 'Computing metrics');

      const { data: responseJson, text: responseText } = await readResponseJson(response);

      if (!response.ok) {
        const errorMsg = responseJson?.message || responseJson?.error || responseText || 'Failed to fetch preview';
        const errorCode = responseJson?.code || 'UNKNOWN_ERROR';
        const is401 = response.status === 401;

        let displayMessage = errorMsg;
        if (is401) {
          displayMessage = 'Session expired. Sign in again to continue.';
        } else if (errorCode === 'NO_PROJECTS_SELECTED') {
          displayMessage = 'Please select at least one project before generating a preview.';
        } else if (errorCode === 'INVALID_DATE_FORMAT') {
          displayMessage = 'Invalid date format. Please ensure dates are properly formatted.';
        } else if (errorCode === 'INVALID_DATE_RANGE') {
          displayMessage = 'Invalid date range. The start date must be before the end date.';
        } else if (errorCode === 'AUTH_ERROR') {
          displayMessage = 'Authentication failed. Please check your Jira credentials in the server configuration.';
        } else if (errorCode === 'BOARD_FETCH_ERROR') {
          displayMessage = 'Unable to fetch boards. Please verify project access and try again.';
        } else if (errorCode === 'RATE_LIMIT_ERROR') {
          displayMessage = 'Jira API rate limit exceeded. Please wait a moment and try again.';
        } else if (errorCode === 'RATE_LIMIT_COOLDOWN') {
          displayMessage = 'Jira API has recently rate limited this report. Please wait around a minute and try again, or narrow the date range.';
        } else if (errorCode === 'NETWORK_ERROR') {
          displayMessage = 'Network error. Please check your connection and try again.';
        }

        try { emitTelemetry('preview.error', { code: errorCode, message: displayMessage }); } catch (_) {}
        const err = new Error(displayMessage);
        if (is401) err.sessionExpired = true;
        throw err;
      }

      updateLoadingMessage('Rendering preview...', null);

      if (!responseJson) {
        throw new Error('Preview response was not valid JSON. Please check server logs and try again.');
      }

      writeCachedPreview(responseJson);

      updateLoadingMessage('Finalizing...', null);
      applyPreviewPayload(responseJson);
      try {
        const params = collectFilterParams();
        if (params?.projects && params?.start && params?.end) {
          localStorage.setItem(LAST_QUERY_KEY, JSON.stringify({
            projects: params.projects,
            start: params.start,
            end: params.end,
          }));
          if (typeof window.__refreshReportingContextBar === 'function') {
            window.__refreshReportingContextBar();
          }
        }
      } catch (_) {}
      const boards = responseJson?.boards || [];
      try { emitTelemetry('preview.complete', { rows: reportState.previewRows.length || 0, boards: (boards || []).length || 0 }); } catch (_) {}
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      if (progressInterval) clearInterval(progressInterval);

      if (loadingEl) {
        loadingEl.style.display = 'none';
        loadingEl.setAttribute('aria-hidden', 'true');
      }
      if (errorEl) errorEl.style.display = 'block';

      let errorMsg = (error && error.message) ? String(error.message) : 'Failed to fetch preview. Please try again.';
      if (error && error.name === 'AbortError') {
        const seconds = (typeof timeoutMs === 'number' && timeoutMs > 0) ? Math.round(timeoutMs / 1000) : 60;
        errorMsg = `This preview is taking longer than expected (over ${seconds}s). We kept your last results on-screen. Try a smaller date range or fewer projects, or run a full refresh if you need the complete history.`;
      }

      try { emitTelemetry('preview.failure', { message: errorMsg || String(error) }); } catch (_) {}

      let shortText = 'Server error';
      if (error && error.sessionExpired) shortText = 'Session expired';
      else if (error && error.name === 'AbortError') shortText = 'Preview timed out';
      else if (/fetch|network|failed to fetch/i.test(errorMsg || '')) shortText = 'Request failed';

      if (errorEl) {
        try {
          const redirectReport = escapeHtml(window.location.pathname === '/report' ? '/report' : '/report');
          const sessionExpiredHtml = error && error.sessionExpired
            ? `<div role="alert"><strong>Session expired.</strong> Sign in again to continue. <a href="/?redirect=${redirectReport}">Sign in</a><button type="button" class="error-close" aria-label="Dismiss">x</button></div>`
            : `
          <div role="alert">
            <strong>${escapeHtml(shortText)}</strong>
            <button type="button" class="btn btn-compact error-details-toggle" data-action="toggle-error-details" aria-expanded="false">Details</button>
            <div class="error-details" hidden>${escapeHtml(errorMsg)}</div>
            <div style="margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap;">
              <button type="button" data-action="retry-preview" class="btn btn-compact">Retry now</button>
              <button type="button" data-action="retry-with-smaller-range" class="btn btn-compact btn-primary">Retry with smaller date range</button>
              <button type="button" data-action="force-full-refresh" class="btn btn-secondary btn-compact">Force full refresh</button>
            </div>
            <button type="button" class="error-close" aria-label="Dismiss">x</button>
          </div>
        `;
          errorEl.innerHTML = sessionExpiredHtml;
        } catch (innerErr) {
          console.error('Error rendering preview error UI', innerErr);
          errorEl.innerHTML = '<div role="alert"><strong>Server error.</strong> Please try again or use a smaller date range.<button type="button" class="error-close" aria-label="Dismiss">x</button></div>';
        }
      }
      if (statusEl) {
        if (hasExistingPreview) {
          statusEl.innerHTML = `
            <div class="status-banner warning">
              Refresh failed. Showing the last successful preview.
              <br><small>Tip: Try a smaller date window (for example, the last 30 days) or fewer projects to reduce load.</small>
              <button type="button" data-action="retry-preview" class="btn btn-compact">Retry now</button>
              <button type="button" class="status-close" aria-label="Dismiss">x</button>
            </div>
          `;
          statusEl.style.display = 'block';
          if (previewContent) previewContent.style.display = 'block';
        } else {
          statusEl.innerHTML = '';
          statusEl.style.display = 'none';
        }
      }
      // Ensure error panel is never blank (trust).
      if (errorEl && errorEl.style.display === 'block' && (!errorEl.textContent || errorEl.textContent.trim() === '')) {
        errorEl.innerHTML = '<div role="alert"><strong>Error:</strong> Something went wrong. Please try again or use a smaller date range.<button type="button" class="error-close" aria-label="Dismiss">x</button></div>';
      }
    } finally {
      isLoading = false;
      // Strongly ensure loading elements are hidden and steps cleared to avoid spinner hangs
      try {
        hideLoadingIfVisible();
        clearLoadingSteps();
      } catch (e) {}

      if (timeoutId) clearTimeout(timeoutId);
      if (progressInterval) clearInterval(progressInterval);

      previewBtn.disabled = false;
      previewBtn.textContent = 'Preview report';
      setQuickRangeButtonsDisabled(false);

      // Export enabled only when preview has rows; prevents export before data is ready.
      const hasRows = Array.isArray(reportState.previewRows) && reportState.previewRows.length > 0;
      if (exportDropdownTrigger) exportDropdownTrigger.disabled = !hasRows;
      if (exportExcelBtn) exportExcelBtn.disabled = !hasRows;
      updateExportHint();
    }
  });
}
