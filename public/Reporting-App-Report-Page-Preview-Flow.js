import { reportDom } from './Reporting-App-Report-Page-Context.js';
import { reportState } from './Reporting-App-Report-Page-State.js';
import { collectFilterParams } from './Reporting-App-Report-Page-Filter-Params.js';
import { updateLoadingMessage, clearLoadingSteps, readResponseJson, hideLoadingIfVisible } from './Reporting-App-Report-Page-Loading-Steps.js';
import { renderPreview } from './Reporting-App-Report-Page-Render-Preview.js';
import { updateExportFilteredState } from './Reporting-App-Report-Page-Export-Menu.js';
import { sortSprintsLatestFirst } from './Reporting-App-Report-Page-Sorting.js';
import { escapeHtml } from './Reporting-App-Shared-Dom-Escape-Helpers.js';

function setQuickRangeButtonsDisabled(disabled) {
  document.querySelectorAll('.quick-range-btn[data-quarter], .quarter-pill').forEach((button) => {
    button.disabled = disabled;
  });
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
  });

  previewBtn.addEventListener('click', async () => {
    let timeoutId;
    let progressInterval;
    let isLoading = true;

    const prevExportFilteredDisabled = exportDropdownTrigger ? exportDropdownTrigger.disabled : true;
    const prevExportExcelDisabled = exportExcelBtn ? exportExcelBtn.disabled : true;

    previewBtn.disabled = true;
    if (exportDropdownTrigger) exportDropdownTrigger.disabled = true;
    if (exportExcelBtn) exportExcelBtn.disabled = true;
    setQuickRangeButtonsDisabled(true);

    if (loadingEl) {
      requestAnimationFrame(() => {
        if (isLoading) {
          loadingEl.style.display = 'block';
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
    updateLoadingMessage('Preparing request...', 'Collecting filter parameters');

    let params;
    try {
      params = collectFilterParams();
    } catch (error) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (errorEl) {
        errorEl.style.display = 'block';
        errorEl.innerHTML = `
          <div role="alert">
            <strong>Error:</strong> ${escapeHtml(error.message)}
            <br><small>Please fix the filters above and try again.</small>
            <button type="button" class="error-close" aria-label="Dismiss">x</button>
          </div>
        `;
      }
      previewBtn.disabled = false;
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

    const queryString = new URLSearchParams(params).toString();

    try {
      updateLoadingMessage('Fetching data from Jira...', 'Sending request to server');

      const controller = new AbortController();
      timeoutId = setTimeout(() => {
        controller.abort();
      }, 300000);

      let elapsedSeconds = 0;
      progressInterval = setInterval(() => {
        elapsedSeconds += 2;
        const minutes = Math.floor(elapsedSeconds / 60);
        const seconds = elapsedSeconds % 60;
        const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
        updateLoadingMessage(`Fetching data from Jira... (${timeStr})`, null);
      }, 2000);

      const response = await fetch(`/preview.json?${queryString}`, { signal: controller.signal });

      if (timeoutId) clearTimeout(timeoutId);
      if (progressInterval) clearInterval(progressInterval);

      updateLoadingMessage('Processing response...', 'Received data from server');

      const { data: responseJson, text: responseText } = await readResponseJson(response);

      if (!response.ok) {
        const errorMsg = responseJson?.message || responseJson?.error || responseText || 'Failed to fetch preview';
        const errorCode = responseJson?.code || 'UNKNOWN_ERROR';

        let displayMessage = errorMsg;
        if (errorCode === 'NO_PROJECTS_SELECTED') {
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
        } else if (errorCode === 'NETWORK_ERROR') {
          displayMessage = 'Network error. Please check your connection and try again.';
        }

        throw new Error(displayMessage);
      }

      updateLoadingMessage('Rendering preview...', 'Processing preview data');

      if (!responseJson) {
        throw new Error('Preview response was not valid JSON. Please check server logs and try again.');
      }

      reportState.previewData = responseJson;
      reportState.previewRows = reportState.previewData.rows || [];
      reportState.visibleRows = [...reportState.previewRows];
      const boards = reportState.previewData.boards || [];
      const sprintsIncluded = reportState.previewData.sprintsIncluded || [];
      reportState.visibleBoardRows = [...boards];
      reportState.visibleSprintRows = sortSprintsLatestFirst(sprintsIncluded);
      reportState.previewHasRows = reportState.previewRows.length > 0;

      updateLoadingMessage('Finalizing...', 'Rendering tables and metrics');
      renderPreview();

      if (loadingEl) loadingEl.style.display = 'none';
      if (previewContent) previewContent.style.display = 'block';
      if (exportExcelBtn) exportExcelBtn.disabled = !reportState.previewHasRows;
      if (exportDropdownTrigger) exportDropdownTrigger.disabled = !reportState.previewHasRows;
      updateExportFilteredState();
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      if (progressInterval) clearInterval(progressInterval);

      if (loadingEl) loadingEl.style.display = 'none';
      if (errorEl) errorEl.style.display = 'block';

      let errorMsg = error.message;
      if (error.name === 'AbortError') {
        errorMsg = 'Preview request timed out after 5 minutes. This can happen with very large date ranges or many sprints. Try a smaller date range, fewer projects, or check the server logs for more details.';
      }

      if (errorEl) {
        errorEl.innerHTML = `
          <div role="alert">
            <strong>Error:</strong> ${escapeHtml(errorMsg)}
            <br><small>If this problem persists, please check your Jira connection and try again.</small>
            <button type="button" class="error-close" aria-label="Dismiss">x</button>
          </div>
        `;
      }
      if (statusEl) {
        if (hasExistingPreview) {
          statusEl.innerHTML = `
            <div class="status-banner warning">
              Refresh failed. Showing the last successful preview. Please retry when ready.
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
    } finally {
      isLoading = false;
      hideLoadingIfVisible();
      if (timeoutId) clearTimeout(timeoutId);
      if (progressInterval) clearInterval(progressInterval);

      previewBtn.disabled = false;
      setQuickRangeButtonsDisabled(false);

      const hasRows = Array.isArray(reportState.previewRows) && reportState.previewRows.length > 0;
      if (exportDropdownTrigger) exportDropdownTrigger.disabled = !hasRows;
      if (exportExcelBtn) exportExcelBtn.disabled = !hasRows;
    }
  });
}
