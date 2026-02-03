// SIZE-EXEMPT: Legacy report UI controller kept as a single browser module to avoid
// introducing additional bundling or script loading complexity. Behaviour is cohesive
// around preview, tabs, and exports; future work can further split if a bundler is added.

import { buildBoardSummaries } from './Jira-Reporting-App-Public-Boards-Summary.js';

// CSV column order: SSOT is server GET /api/csv-columns; fallback for offline/API failure
const FALLBACK_CSV_COLUMNS = [
  'projectKey', 'boardId', 'boardName', 'sprintId', 'sprintName', 'sprintState', 'sprintStartDate', 'sprintEndDate',
  'issueKey', 'issueSummary', 'issueStatus', 'issueType', 'issueStatusCategory', 'issuePriority', 'issueLabels',
  'issueComponents', 'issueFixVersions', 'assigneeDisplayName', 'created', 'updated', 'resolutionDate', 'subtaskCount',
  'timeOriginalEstimateHours', 'timeRemainingEstimateHours', 'timeSpentHours', 'timeVarianceHours',
  'subtaskTimeOriginalEstimateHours', 'subtaskTimeRemainingEstimateHours', 'subtaskTimeSpentHours', 'subtaskTimeVarianceHours',
  'ebmTeam', 'ebmProductArea', 'ebmCustomerSegments', 'ebmValue', 'ebmImpact', 'ebmSatisfaction', 'ebmSentiment', 'ebmSeverity',
  'ebmSource', 'ebmWorkCategory', 'ebmGoals', 'ebmTheme', 'ebmRoadmap', 'ebmFocusAreas', 'ebmDeliveryStatus', 'ebmDeliveryProgress',
  'storyPoints', 'epicKey', 'epicTitle', 'epicSummary',
];
let CSV_COLUMNS = FALLBACK_CSV_COLUMNS;
fetch('/api/csv-columns').then(r => r.ok ? r.json() : Promise.reject()).then(d => { if (Array.isArray(d?.columns)) CSV_COLUMNS = d.columns; }).catch(() => {});

const DEFAULT_WINDOW_START = '2025-07-01T00:00:00.000Z';
const DEFAULT_WINDOW_END = '2025-09-30T23:59:59.999Z';
const DEFAULT_WINDOW_START_LOCAL = '2025-07-01T00:00';
const DEFAULT_WINDOW_END_LOCAL = '2025-09-30T23:59';
const LOADING_STEP_LIMIT = 6;

// CSV generation (client-side)
// Bonus Edge Case 3: Handle special characters in CSV data that break parsing
function escapeCSVField(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  
  // Handle special characters: commas, quotes, newlines, tabs, carriage returns
  // Also handle BOM (Byte Order Mark) and other control characters that can break CSV parsing
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r') || str.includes('\t')) {
    // Escape quotes by doubling them, then wrap entire field in quotes
    return `"${str.replace(/"/g, '""').replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/\r/g, ' ')}"`;
  }
  
  // Remove or replace problematic control characters (except common whitespace)
  const cleaned = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  return cleaned;
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeText(value, fallback = '') {
  if (value === null || value === undefined) {
    return fallback;
  }
  const str = String(value);
  return str.trim() === '' ? fallback : str;
}

function toUtcIsoFromLocalInput(value, isEndOfDay = false) {
  if (!value) return null;
  const local = new Date(value);
  if (Number.isNaN(local.getTime())) {
    return null;
  }
  if (isEndOfDay) {
    local.setHours(23, 59, 59, 999);
  }
  return new Date(local.getTime() - local.getTimezoneOffset() * 60000).toISOString();
}

function generateCSVClient(columns, rows) {
  const lines = [];
  lines.push(columns.map(escapeCSVField).join(','));
  for (const row of rows) {
    const values = columns.map(col => escapeCSVField(row[col]));
    lines.push(values.join(','));
  }
  return lines.join('\n');
}

// State
let previewData = null;
let previewRows = [];
let visibleRows = [];
let visibleBoardRows = [];
let visibleSprintRows = [];

const NOTIFICATION_STORE_KEY = 'appNotificationsV1';
let previewHasRows = false;

// DOM Elements
const previewBtn = document.getElementById('preview-btn');
const exportExcelBtn = document.getElementById('export-excel-btn');
const exportDropdownTrigger = document.getElementById('export-dropdown-trigger');
const exportDropdownMenu = document.getElementById('export-dropdown-menu');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const previewContent = document.getElementById('preview-content');
const previewMeta = document.getElementById('preview-meta');
const feedbackToggle = document.getElementById('feedback-toggle');
const feedbackPanel = document.getElementById('feedback-panel');
const feedbackEmail = document.getElementById('feedback-email');
const feedbackMessage = document.getElementById('feedback-message');
const feedbackSubmit = document.getElementById('feedback-submit');
const feedbackCancel = document.getElementById('feedback-cancel');
const feedbackStatus = document.getElementById('feedback-status');

function setFeedbackStatus(message, tone = 'info') {
  if (!feedbackStatus) return;
  feedbackStatus.textContent = message;
  feedbackStatus.style.color = tone === 'error' ? '#c33' : '#1b4f9c';
}

function toggleFeedbackPanel(show) {
  if (!feedbackPanel) return;
  const shouldShow = typeof show === 'boolean' ? show : feedbackPanel.style.display === 'none';
  feedbackPanel.style.display = shouldShow ? 'block' : 'none';
  if (shouldShow) {
    setFeedbackStatus('');
  }
}

if (feedbackToggle) {
  feedbackToggle.addEventListener('click', () => toggleFeedbackPanel());
}

if (feedbackCancel) {
  feedbackCancel.addEventListener('click', () => toggleFeedbackPanel(false));
}

if (feedbackSubmit) {
  feedbackSubmit.addEventListener('click', async () => {
    const email = (feedbackEmail?.value || '').trim();
    const message = (feedbackMessage?.value || '').trim();
    if (!email || !message) {
      setFeedbackStatus('Please enter your email and feedback.', 'error');
      return;
    }

    feedbackSubmit.disabled = true;
    setFeedbackStatus('Sending feedback...');
    try {
      const response = await fetch('/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, message })
      });
      if (!response.ok) {
        const text = await response.text().catch(() => 'Unable to submit feedback.');
        throw new Error(text);
      }
      setFeedbackStatus('Thanks! Your feedback was received.');
      if (feedbackEmail) feedbackEmail.value = '';
      if (feedbackMessage) feedbackMessage.value = '';
    } catch (error) {
      setFeedbackStatus(`Failed to send feedback: ${error.message}`, 'error');
    } finally {
      feedbackSubmit.disabled = false;
    }
  });
}

// Tab management (with ARIA + keyboard support)
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');
const tabsContainer = document.querySelector('.tabs');

if (tabsContainer) {
  tabsContainer.setAttribute('role', 'tablist');
}

function activateTab(btn) {
  const tabName = btn.dataset.tab;
  if (!tabName) return;

  tabButtons.forEach((b) => {
    const isActive = b === btn;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', isActive ? 'true' : 'false');
    b.setAttribute('tabindex', isActive ? '0' : '-1');
  });

  tabPanes.forEach((p) => p.classList.remove('active'));
  const pane = document.getElementById(`tab-${tabName}`);
  if (pane) {
    pane.classList.add('active');
    const firstFocusable = pane.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (firstFocusable) firstFocusable.focus();
  }
  updateExportFilteredState();
}

tabButtons.forEach((btn, index) => {
  if (!btn.hasAttribute('role')) {
    btn.setAttribute('role', 'tab');
  }
  const isActive = btn.classList.contains('active');
  btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  btn.setAttribute('tabindex', isActive ? '0' : '-1');

  btn.addEventListener('click', () => {
    activateTab(btn);
  });

  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const buttons = Array.from(tabButtons);
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const nextIndex = (index + dir + buttons.length) % buttons.length;
      const nextBtn = buttons[nextIndex];
      if (nextBtn) {
        activateTab(nextBtn);
        nextBtn.focus();
      }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activateTab(btn);
    }
  });
});

// Predictability mode toggle
document.getElementById('include-predictability').addEventListener('change', (e) => {
  document.getElementById('predictability-mode-group').style.display = e.target.checked ? 'block' : 'none';
});

const PROJECTS_SSOT_KEY = 'vodaAgileBoard_selectedProjects';

function getSelectedProjects() {
  return Array.from(document.querySelectorAll('.project-checkbox[data-project]:checked'))
    .map(input => input.dataset.project)
    .filter(Boolean);
}

function persistSelectedProjects() {
  try {
    const value = getSelectedProjects().join(',');
    if (value) localStorage.setItem(PROJECTS_SSOT_KEY, value);
  } catch (_) {}
}

// Update preview button state based on project selection
function updatePreviewButtonState() {
  const hasProject = getSelectedProjects().length > 0;
  previewBtn.disabled = !hasProject;
  previewBtn.title = hasProject ? '' : 'Please select at least one project.';
  persistSelectedProjects();
}

// Listen to project checkbox changes
document.querySelectorAll('.project-checkbox[data-project]').forEach(input => {
  input.addEventListener('change', updatePreviewButtonState);
});
updatePreviewButtonState();

// Update loading message
function updateLoadingMessage(message, step = null) {
  const loadingMessage = document.getElementById('loading-message');

  if (loadingMessage) {
    loadingMessage.textContent = message;
  }

  if (step) {
    appendLoadingStep(step);
  }
}

function clearLoadingSteps() {
  const loadingSteps = document.getElementById('loading-steps');
  if (loadingSteps) {
    loadingSteps.innerHTML = '';
  }
}

function appendLoadingStep(step) {
  const loadingSteps = document.getElementById('loading-steps');
  if (!loadingSteps) return;

  const stepEl = document.createElement('div');
  stepEl.className = 'loading-step';
  stepEl.textContent = step;
  loadingSteps.appendChild(stepEl);

  const items = loadingSteps.querySelectorAll('.loading-step');
  if (items.length > LOADING_STEP_LIMIT) {
    for (let i = 0; i < items.length - LOADING_STEP_LIMIT; i++) {
      loadingSteps.removeChild(items[i]);
    }
  }
}

function scheduleRender(work) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => work(), { timeout: 1000 });
  } else {
    setTimeout(work, 0);
  }
}

async function readResponseJson(response) {
  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return { data: await response.json(), text: null };
    } catch (error) {
      const text = await response.text().catch(() => '');
      return { data: null, text };
    }
  }

  const text = await response.text().catch(() => '');
  return { data: null, text };
}

// Shared empty-state renderer
function renderEmptyState(targetElement, title, message, hint) {
  if (!targetElement) return;
  targetElement.innerHTML = `
      <div class="empty-state">
        <p><strong>${escapeHtml(title)}</strong></p>
        <p>${escapeHtml(message)}</p>
        ${hint ? `<p><small>${escapeHtml(hint)}</small></p>` : ''}
      </div>
    `;
}

// Preview button
previewBtn.addEventListener('click', async () => {
  let timeoutId;
  let progressInterval;
  let isLoading = true;

  // Capture existing export state so we can restore it on early validation errors
  const prevExportFilteredDisabled = exportDropdownTrigger ? exportDropdownTrigger.disabled : true;
  const prevExportExcelDisabled = exportExcelBtn.disabled;

  // Immediately prevent double-clicks and exporting while a preview is in flight
  previewBtn.disabled = true;
  if (exportDropdownTrigger) exportDropdownTrigger.disabled = true;
  exportExcelBtn.disabled = true;
  document.querySelectorAll('.quick-range-btn[data-quarter]').forEach(b => { b.disabled = true; });

  // Ensure loading overlay becomes visible in the next paint, even for very fast responses.
  // This avoids race conditions where tests (and users) never see a loading state.
  if (loadingEl) {
    requestAnimationFrame(() => {
      if (isLoading) {
        loadingEl.style.display = 'block';
      }
    });
  }
  errorEl.style.display = 'none';

  const hasExistingPreview = !!previewData && previewContent && previewContent.style.display !== 'none';
  const statusEl = document.getElementById('preview-status');
  if (hasExistingPreview && statusEl) {
    statusEl.innerHTML = `
      <div class="status-banner info">
        Refreshing preview... Showing the last successful results while new data loads.
      </div>
    `;
    statusEl.style.display = 'block';
  }

  if (!hasExistingPreview) {
    previewContent.style.display = 'none';
  }

  // Clear previous steps
  clearLoadingSteps();

  updateLoadingMessage('Preparing request...', 'Collecting filter parameters');

  let params;
  try {
    params = collectFilterParams();
  } catch (error) {
    // Client-side validation error before network call
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    errorEl.innerHTML = `
      <strong>Error:</strong> ${escapeHtml(error.message)}
      <br><small>Please fix the filters above and try again.</small>
    `;
    // Re-enable preview, quarter buttons, and restore export buttons
    previewBtn.disabled = false;
    document.querySelectorAll('.quick-range-btn[data-quarter]').forEach(b => { b.disabled = false; });
    if (exportDropdownTrigger) exportDropdownTrigger.disabled = prevExportFilteredDisabled;
    exportExcelBtn.disabled = prevExportExcelDisabled;
    return;
  }

  const queryString = new URLSearchParams(params).toString();

  try {
    updateLoadingMessage('Fetching data from Jira...', 'Sending request to server');
    
    // Add timeout handling with progress updates
    const controller = new AbortController();
    timeoutId = setTimeout(() => {
      // Abort the fetch; AbortError will be handled in the catch block
      controller.abort();
    }, 300000); // 5 minute timeout
    
    // Add progress polling to show activity
    let elapsedSeconds = 0;
    progressInterval = setInterval(() => {
      elapsedSeconds += 2;
      const minutes = Math.floor(elapsedSeconds / 60);
      const seconds = elapsedSeconds % 60;
      const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      updateLoadingMessage(`Fetching data from Jira... (${timeStr})`, null);
    }, 2000);
    
    const response = await fetch(`/preview.json?${queryString}`, {
      signal: controller.signal
    });
    
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (progressInterval) {
      clearInterval(progressInterval);
    }
    
    updateLoadingMessage('Processing response...', 'Received data from server');
  
    const { data: responseJson, text: responseText } = await readResponseJson(response);

    if (!response.ok) {
      const errorMsg = responseJson?.message || responseJson?.error || responseText || 'Failed to fetch preview';
      const errorCode = responseJson?.code || 'UNKNOWN_ERROR';
      
      // Format error message with actionable guidance
      let displayMessage = errorMsg;
      if (errorCode === 'NO_PROJECTS_SELECTED') {
        displayMessage = 'Please select at least one project before generating a preview.';
      } else if (errorCode === 'INVALID_DATE_FORMAT') {
        displayMessage = 'Invalid date format. Please ensure dates are properly formatted.';
      } else if (errorCode === 'INVALID_DATE_RANGE') {
        displayMessage = 'Invalid date range. The start date must be before the end date.';
      } else if (errorCode === 'DATE_RANGE_TOO_LARGE') {
        displayMessage = errorMsg; // Already has helpful message
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

    previewData = responseJson;
    previewRows = previewData.rows || [];
    visibleRows = [...previewRows];
    const boards = previewData.boards || [];
    const sprintsIncluded = previewData.sprintsIncluded || [];
    visibleBoardRows = [...boards];
    visibleSprintRows = sortSprintsLatestFirst(sprintsIncluded);
    previewHasRows = previewRows.length > 0;

    updateLoadingMessage('Finalizing...', 'Rendering tables and metrics');
    renderPreview();
    
    loadingEl.style.display = 'none';
    previewContent.style.display = 'block';
    exportExcelBtn.disabled = !previewHasRows;
    if (exportDropdownTrigger) exportDropdownTrigger.disabled = !previewHasRows;
    updateExportFilteredState();
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (progressInterval) {
      clearInterval(progressInterval);
    }

    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';

    let errorMsg = error.message;
    if (error.name === 'AbortError') {
      errorMsg = 'Preview request timed out after 5 minutes. This can happen with very large date ranges or many sprints. Try a smaller date range, fewer projects, or check the server logs for more details.';
    }

    errorEl.innerHTML = `
      <strong>Error:</strong> ${escapeHtml(errorMsg)}
      <br><small>If this problem persists, please check your Jira connection and try again.</small>
    `;
    if (statusEl) {
      if (hasExistingPreview) {
        statusEl.innerHTML = `
          <div class="status-banner warn">
            Refresh failed. Showing the last successful preview. Please retry when ready.
          </div>
        `;
        statusEl.style.display = 'block';
        previewContent.style.display = 'block';
      } else {
        statusEl.innerHTML = '';
        statusEl.style.display = 'none';
      }
    }
  } finally {
    isLoading = false;
    if (loadingEl && loadingEl.style.display !== 'none') {
      loadingEl.style.display = 'none';
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (progressInterval) {
      clearInterval(progressInterval);
    }

    // Re-enable preview and quarter buttons regardless of outcome
    previewBtn.disabled = false;
    document.querySelectorAll('.quick-range-btn[data-quarter]').forEach(b => { b.disabled = false; });

    // Only enable exports if we have rows
    const hasRows = Array.isArray(previewRows) && previewRows.length > 0;
    if (exportDropdownTrigger) exportDropdownTrigger.disabled = !hasRows;
    exportExcelBtn.disabled = !hasRows;
  }
});

// Collect filter parameters
function collectFilterParams() {
  const projects = getSelectedProjects();

  // Validate at least one project is selected
  if (projects.length === 0) {
    throw new Error('Please select at least one project.');
  }

  const startDate = document.getElementById('start-date').value;
  const endDate = document.getElementById('end-date').value;

  // Convert local datetime to UTC ISO string
  // Fix: datetime-local values are in local time, need to convert properly
  let startISO, endISO;
  if (startDate) {
    startISO = toUtcIsoFromLocalInput(startDate);
    if (!startISO) {
      throw new Error('Invalid start date. Please provide a valid start date and time.');
    }
  } else {
    const startInput = document.getElementById('start-date');
    if (startInput && !startInput.value) {
      startInput.value = DEFAULT_WINDOW_START_LOCAL;
    }
    startISO = DEFAULT_WINDOW_START;
  }
  
  if (endDate) {
    endISO = toUtcIsoFromLocalInput(endDate, true);
    if (!endISO) {
      throw new Error('Invalid end date. Please provide a valid end date and time.');
    }
  } else {
    const endInput = document.getElementById('end-date');
    if (endInput && !endInput.value) {
      endInput.value = DEFAULT_WINDOW_END_LOCAL;
    }
    endISO = DEFAULT_WINDOW_END;
  }

  const startTime = new Date(startISO).getTime();
  const endTime = new Date(endISO).getTime();
  if (!Number.isNaN(startTime) && !Number.isNaN(endTime) && startTime >= endTime) {
    throw new Error('Start date must be before end date. Please adjust your date range.');
  }

  const params = {
    projects: projects.join(','),
    start: startISO,
    end: endISO,
    includeStoryPoints: true, // Always enabled ? mandatory for reports
    requireResolvedBySprintEnd: document.getElementById('require-resolved-by-sprint-end').checked,
    includeBugsForRework: true, // Always enabled ? mandatory for reports
    includePredictability: document.getElementById('include-predictability').checked,
    predictabilityMode: document.querySelector('input[name="predictability-mode"]:checked').value,
    includeEpicTTM: true, // Always enabled ? mandatory for reports
    includeActiveOrMissingEndDateSprints: document.getElementById('include-active-or-missing-end-date-sprints').checked,
  };

  return params;
}

// Normalize and validate preview meta used across the UI and exports.
// Returns a "safe" meta object or null if meta is missing/invalid.
function getSafeMeta(preview) {
  if (!preview || !preview.meta) {
    return null;
  }

  const raw = preview.meta;

  const safe = {
    windowStart: raw.windowStart || '',
    windowEnd: raw.windowEnd || '',
    selectedProjects: Array.isArray(raw.selectedProjects) ? raw.selectedProjects : [],
    sprintCount: typeof raw.sprintCount === 'number'
      ? raw.sprintCount
      : Array.isArray(preview.sprintsIncluded)
        ? preview.sprintsIncluded.length
        : 0,
    fromCache: raw.fromCache === true,
    cacheAgeMinutes: raw.cacheAgeMinutes,
    partial: raw.partial === true,
    partialReason: raw.partialReason || '',
    generatedAt: raw.generatedAt,
    requestedAt: raw.requestedAt,
    elapsedMs: typeof raw.elapsedMs === 'number' ? raw.elapsedMs : null,
    cachedElapsedMs: typeof raw.cachedElapsedMs === 'number' ? raw.cachedElapsedMs : null,
    discoveredFields: raw.discoveredFields || {},
    fieldInventory: raw.fieldInventory || null,
    requireResolvedBySprintEnd: !!raw.requireResolvedBySprintEnd,
    epicTTMFallbackCount: raw.epicTTMFallbackCount || 0,
  };

  return safe;
}

async function getDateRangeLabel(start, end) {
  try {
    const res = await fetch(`/api/format-date-range?start=${encodeURIComponent(start || '')}&end=${encodeURIComponent(end || '')}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.dateRange) return data.dateRange;
    }
  } catch (_) {}
  const s = (start || '').split('T')[0];
  const e = (end || '').split('T')[0];
  return s && e ? `${s}_to_${e}` : 'date-range';
}

function buildCsvFilename(section, meta, qualifier = '', dateRange = null) {
  const projects = (meta?.selectedProjects || []).join('-') || 'Projects';
  const range = dateRange != null
    ? dateRange
    : ((meta?.windowStart || '').split('T')[0] && (meta?.windowEnd || '').split('T')[0]
      ? `${(meta.windowStart || '').split('T')[0]}_to_${(meta.windowEnd || '').split('T')[0]}`
      : 'date-range');
  const exportDate = new Date().toISOString().split('T')[0];
  const partialSuffix = meta?.partial ? '_PARTIAL' : '';
  const cleanedSection = section.replace(/[^a-z0-9-]/gi, '-');
  const cleanedQualifier = qualifier ? `_${qualifier.replace(/[^a-z0-9-]/gi, '-')}` : '';
  return `${projects}_${range}_${cleanedSection}${cleanedQualifier}${partialSuffix}_${exportDate}.csv`;
}

// Render preview
function renderPreview() {
  if (!previewData) return;

  // Render meta
  const meta = getSafeMeta(previewData);
  if (!meta) {
    // If we have rows but no meta, treat this as a data contract issue and surface clearly.
    errorEl.style.display = 'block';
    errorEl.innerHTML = `
      <strong>Error:</strong> Preview metadata is missing or invalid.
      <br><small>Please refresh the page, run the preview again, or contact an administrator if the problem persists.</small>
    `;
    previewContent.style.display = 'none';
    exportExcelBtn.disabled = true;
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
  const elapsedMs = typeof meta.elapsedMs === 'number' ? meta.elapsedMs : null;
  const cachedElapsedMs = typeof meta.cachedElapsedMs === 'number' ? meta.cachedElapsedMs : null;

  let detailsLines = [];
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
    ? `<br><span class="partial-warning"><strong>Note:</strong> This preview is <em>partial</em> because: ${partialReason || 'time budget exceeded or limits reached.'} Data may be incomplete; consider narrowing the date range or reducing options and trying again.</span>`
    : '';
  
  const selectedProjectsLabel = meta.selectedProjects.length > 0 ? meta.selectedProjects.join(', ') : 'None';
  const sampleRow = previewRows && previewRows.length > 0 ? previewRows[0] : null;
  const sampleLabel = sampleRow
    ? `${escapeHtml(sampleRow.issueKey || '')} - ${escapeHtml(sampleRow.issueSummary || '')}`
    : 'None';
  previewMeta.innerHTML = `
    <div class="meta-info">
      <strong>Projects:</strong> ${escapeHtml(selectedProjectsLabel)}<br>
      <strong>Date Window (Local):</strong> ${escapeHtml(windowStartLocal)} to ${escapeHtml(windowEndLocal)}<br>
      <strong>Date Window (UTC):</strong> ${escapeHtml(windowStartUtc)} to ${escapeHtml(windowEndUtc)}<br>
      <strong>Summary:</strong> Boards: ${boardsCount} | Included sprints: ${sprintsCount} | Done stories: ${rowsCount} | Unusable sprints: ${unusableCount}<br>
      <strong>Example story:</strong> ${sampleLabel}<br>
      <strong>Details:</strong> ${escapeHtml(detailsLines.join(' ? '))}
      ${partialNotice}
    </div>
  `;

  const stickyEl = document.getElementById('preview-summary-sticky');
  if (stickyEl) {
    stickyEl.textContent = `Preview: ${selectedProjectsLabel} ? ${windowStartLocal} to ${windowEndLocal}`;
    stickyEl.setAttribute('aria-hidden', 'false');
  }

  // Strong visual banner for partial previews
  const statusEl = document.getElementById('preview-status');
  if (statusEl) {
    if (partial) {
      statusEl.innerHTML = `
        <div class="status-banner warning">
          Preview is partial: ${partialReason || 'time budget or pagination limits reached.'}
          <br><small>Data may be incomplete; consider narrowing the date range or disabling heavy options before trying again.</small>
        </div>
      `;
      statusEl.style.display = 'block';
    } else {
      statusEl.innerHTML = '';
      statusEl.style.display = 'none';
    }
  }

  // Export buttons reflect data and partial state
  const hasRows = rowsCount > 0;
  if (exportDropdownTrigger) exportDropdownTrigger.disabled = !hasRows;
  exportExcelBtn.disabled = !hasRows;

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

  // Update date display
  updateDateDisplay();

  // Render tabs after the browser has a chance to paint the meta/summary.
  scheduleRender(() => {
    populateBoardsPills();
    populateSprintsPills();
    renderProjectEpicLevelTab(visibleBoardRows, previewData.metrics);
    renderSprintsTab(visibleSprintRows, previewData.metrics);
    renderDoneStoriesTab(visibleRows);
    renderUnusableSprintsTab(previewData.sprintsUnusable);

    // Show/hide per-section export buttons based on data availability
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
  });
}

// Update date display
function updateDateDisplay() {
  const startDate = document.getElementById('start-date').value;
  const endDate = document.getElementById('end-date').value;

  if (startDate && endDate) {
    const startISO = toUtcIsoFromLocalInput(startDate);
    const endISO = toUtcIsoFromLocalInput(endDate, true);
    if (!startISO || !endISO) {
      document.getElementById('date-display').innerHTML = `
        <small>
          UTC: Invalid date input<br>
          Local: Invalid date input
        </small>
      `;
      return;
    }
    const startLocal = formatDateForDisplay(startDate);
    const endLocal = formatDateForDisplay(endDate);
    const startUtc = new Date(startISO).toUTCString();
    const endUtc = new Date(endISO).toUTCString();

    document.getElementById('date-display').innerHTML = `
      <small>
        UTC: ${startUtc} to ${endUtc}<br>
        Local: ${startLocal} to ${endLocal}
      </small>
    `;
  }
}

document.getElementById('start-date').addEventListener('change', updateDateDisplay);
document.getElementById('end-date').addEventListener('change', updateDateDisplay);

function formatDateTimeLocalForInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

function getFiscalShortLabel(endDate) {
  if (!endDate || Number.isNaN(endDate.getTime())) return '';
  const endYear = endDate.getUTCFullYear();
  const endMonth = endDate.getUTCMonth();
  const fy = endMonth <= 2 ? endYear : endYear + 1;
  return `FY${String(fy).slice(-2)}`;
}
// Client-side Vodacom quarter fallback when API fails (Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar)
function getVodacomQuarterFallback(quarterNum) {
  const q = Number(quarterNum);
  if (!Number.isInteger(q) || q < 1 || q > 4) return null;
  const bounds = { 1: [3, 1, 5, 30], 2: [6, 1, 8, 30], 3: [9, 1, 11, 31], 4: [0, 1, 2, 31] };
  const [sm, sd, em, ed] = bounds[q];
  const now = new Date();
  let year = now.getUTCFullYear();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999);
  for (let i = 0; i < 10; i++) {
    const start = new Date(Date.UTC(year, sm, sd, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, em, ed, 23, 59, 59, 999));
    if (end.getTime() <= todayUtc) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const fmt = (d) => d.getUTCDate() + ' ' + months[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
      const fyLabel = getFiscalShortLabel(end);
      return { start: start.toISOString(), end: end.toISOString(), label: `${fyLabel} Q${q}`, period: `${fmt(start)} - ${fmt(end)}` };
    }
    year -= 1;
  }
  return null;
}

function applyQuarterButtonContent(btn, data) {
  const label = data?.label || btn.textContent || '';
  const period = data?.period || '';
  btn.textContent = '';
  const labelEl = document.createElement('span');
  labelEl.className = 'quick-range-label';
  labelEl.textContent = label;
  btn.appendChild(labelEl);
  if (period) {
    const periodEl = document.createElement('span');
    periodEl.className = 'quick-range-period';
    periodEl.textContent = period;
    btn.appendChild(periodEl);
    btn.title = period;
    btn.setAttribute('aria-label', `${label} (${period})`);
  } else {
    btn.removeAttribute('title');
    btn.setAttribute('aria-label', label);
  }
}

document.querySelectorAll('.quick-range-btn[data-quarter]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const q = btn.getAttribute('data-quarter');
    try {
      let data = null;
      const res = await fetch(`/api/date-range?quarter=Q${encodeURIComponent(q)}`);
      if (res.ok) {
        data = await res.json();
      }
      if (!data || !data.start || !data.end) {
        data = getVodacomQuarterFallback(q);
      }
      if (!data || !data.start || !data.end) return;
      const startDate = new Date(data.start);
      const endDate = new Date(data.end);
      const startInput = document.getElementById('start-date');
      const endInput = document.getElementById('end-date');
      if (startInput && endInput && !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
        startInput.value = formatDateTimeLocalForInput(startDate);
        endInput.value = formatDateTimeLocalForInput(endDate);
        updateDateDisplay();
        if (previewBtn) previewBtn.click();
      }
    } catch (_) {}
  });
});

(function loadQuarterLabels() {
  const container = document.querySelector('.quick-range-pills');
  const buttons = Array.from(document.querySelectorAll('.quick-range-btn[data-quarter]'));
  const fetches = [1, 2, 3, 4].map(async (q) => {
    try {
      const res = await fetch(`/api/date-range?quarter=Q${q}`);
      const data = res.ok ? await res.json() : null;
      return { q, data: (data && data.label) ? data : getVodacomQuarterFallback(q) };
    } catch (_) {
      return { q, data: getVodacomQuarterFallback(q) };
    }
  });
  Promise.all(fetches).then((results) => {
    const sortable = results
      .map(({ q, data }) => {
        const btn = buttons.find(b => b.getAttribute('data-quarter') === String(q));
        if (!btn || !data) return null;
        applyQuarterButtonContent(btn, data);
        const endTime = data.end ? new Date(data.end).getTime() : 0;
        return { btn, endTime };
      })
      .filter(Boolean)
      .sort((a, b) => a.endTime - b.endTime);
    if (container && sortable.length === buttons.length) {
      sortable.forEach(({ btn }) => container.appendChild(btn));
    }
  });
})();

function calculateVariance(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  return variance;
}

function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }
  return Number(value).toFixed(decimals);
}

function formatPercent(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }
  return `${Number(value).toFixed(decimals)}%`;
}

function formatDateForDisplay(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeJiraHost(host) {
  if (!host) return '';
  const trimmed = String(host).trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
}

function buildJiraIssueUrl(host, issueKey) {
  if (!host || !issueKey) return '';
  return `${normalizeJiraHost(host)}/browse/${issueKey}`;
}

function renderEpicStoryList(epic, meta) {
  const stories = Array.isArray(epic.storyItems) ? epic.storyItems : [];
  if (!stories.length) return '<span>-</span>';
  const host = meta?.jiraHost || '';
  const itemsHtml = stories.map((story) => {
    const key = story.issueKey || '';
    const summary = story.summary || '';
    const url = buildJiraIssueUrl(host, key);
    const label = escapeHtml(key);
    const title = summary ? ` title="${escapeHtml(summary)}"` : '';
    if (url) {
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener"${title}>${label}</a>`;
    }
    return `<span${title}>${label}</span>`;
  });
  return `<span class="epic-story-list">${itemsHtml.join(', ')}</span>`;
}

function renderEpicKeyCell(epic, meta) {
  if (!epic?.epicKey) return '<span>-</span>';
  if (epic.isAdhoc) return `<span>${escapeHtml(epic.epicKey)}</span>`;
  const url = buildJiraIssueUrl(meta?.jiraHost || '', epic.epicKey);
  if (!url) return `<span>${escapeHtml(epic.epicKey)}</span>`;
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(epic.epicKey)}</a>`;
}

function buildEpicAdhocRows(rows) {
  if (!Array.isArray(rows)) return [];
  const groups = new Map();
  for (const row of rows) {
    if (row?.epicKey) continue;
    const boardName = row?.boardName || row?.projectKey || 'Unknown Board';
    if (!groups.has(boardName)) {
      groups.set(boardName, {
        storyCount: 0,
        storyItems: new Map(),
        earliestCreated: null,
        latestResolved: null,
      });
    }
    const group = groups.get(boardName);
    group.storyCount += 1;
    if (row?.issueKey && !group.storyItems.has(row.issueKey)) {
      group.storyItems.set(row.issueKey, { issueKey: row.issueKey, summary: row.issueSummary || '' });
    }
    if (row?.created) {
      const created = new Date(row.created);
      if (!Number.isNaN(created.getTime())) {
        group.earliestCreated = group.earliestCreated
          ? new Date(Math.min(group.earliestCreated.getTime(), created.getTime()))
          : created;
      }
    }
    if (row?.resolutionDate) {
      const resolved = new Date(row.resolutionDate);
      if (!Number.isNaN(resolved.getTime())) {
        group.latestResolved = group.latestResolved
          ? new Date(Math.max(group.latestResolved.getTime(), resolved.getTime()))
          : resolved;
      }
    }
  }

  const results = [];
  for (const [boardName, group] of groups.entries()) {
    const startDate = group.earliestCreated ? group.earliestCreated.toISOString() : '';
    const endDate = group.latestResolved ? group.latestResolved.toISOString() : '';
    const calendarTTMdays = startDate && endDate
      ? Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))
      : '';
    const workingTTMdays = startDate && endDate ? calculateWorkDaysBetween(startDate, endDate) : '';
    results.push({
      epicKey: `${boardName} - AD-HOC`,
      epicTitle: 'No epic assigned',
      storyCount: group.storyCount,
      storyItems: [...group.storyItems.values()],
      startDate,
      endDate,
      calendarTTMdays,
      workingTTMdays,
      isAdhoc: true,
    });
  }
  return results;
}

function sortSprintsLatestFirst(sprints) {
  if (!Array.isArray(sprints)) return [];
  return [...sprints].sort((a, b) => {
    const aTime = new Date(a.endDate || a.startDate || 0).getTime();
    const bTime = new Date(b.endDate || b.startDate || 0).getTime();
    return bTime - aTime;
  });
}

function readNotificationSummary() {
  try {
    const raw = localStorage.getItem(NOTIFICATION_STORE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch (_) {
    return null;
  }
}

function renderNotificationDock() {
  const summary = readNotificationSummary();
  const existing = document.getElementById('app-notification-dock');
  if (!summary || summary.total <= 0) {
    if (existing) existing.remove();
    return;
  }
  const dock = existing || document.createElement('div');
  dock.id = 'app-notification-dock';
  dock.className = 'app-notification-dock';
  dock.innerHTML = `
    <div class="app-notification-title">
      <span class="app-notification-badge">${summary.total}</span>
      Time tracking alerts
    </div>
    <div class="app-notification-body">${escapeHtml(summary.boardName || 'Board')} - ${escapeHtml(summary.sprintName || 'Sprint')}</div>
    <div class="app-notification-sub">Missing estimates: ${summary.missingEstimate} ? No log: ${summary.missingLogged}</div>
    <a class="app-notification-link" href="/current-sprint">Open Current Sprint</a>
  `;
  if (!existing) document.body.appendChild(dock);
}

function buildPredictabilityTableHeaderHtml() {
  return '<table class="data-table"><thead><tr>' +
    '<th title="Sprint name.">Sprint</th>' +
    '<th title="Stories planned at sprint start (scope commitment).">Committed Stories</th>' +
    '<th title="Story points planned at sprint start (scope commitment).">Committed SP</th>' +
    '<th title="Stories completed by sprint end.">Delivered Stories</th>' +
    '<th title="Story points completed by sprint end.">Delivered SP</th>' +
    '<th title="Delivered stories that were committed at sprint start (created before sprint start).">Planned Carryover</th>' +
    '<th title="Delivered stories that were added mid-sprint (created after sprint start). Not a failure metric.">Unplanned Spillover</th>' +
    '<th title="Delivered Stories / Committed Stories. Higher means closer to plan; low suggests scope churn or over-commit.">Predictability % (Stories)</th>' +
    '<th title="Delivered SP / Committed SP. Higher means closer to plan; low suggests estimation drift or unstable capacity.">Predictability % (SP)</th>' +
    '</tr></thead><tbody>';
}

function getWindowMonths(meta) {
  const start = meta?.windowStart ? new Date(meta.windowStart) : null;
  const end = meta?.windowEnd ? new Date(meta.windowEnd) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return null;
  const days = ms / (1000 * 60 * 60 * 24);
  return days / 30;
}

// SSOT: one vocabulary for Boards table (UI and Excel); leader-friendly tooltips
const BOARD_TABLE_COLUMN_ORDER = [
  'Board ID', 'Board', 'Type', 'Projects', 'Sprints', 'Sprint Days', 'Avg Sprint Days',
  'Done Stories', 'Done SP', 'Committed SP', 'Delivered SP', 'SP Estimation %',
  'Stories / Sprint', 'SP / Story', 'Stories / Day', 'SP / Day', 'SP / Sprint', 'SP Variance',
  'Indexed Delivery',
  'On-Time %', 'Planned', 'Ad-hoc', 'Active Assignees', 'Stories / Assignee', 'SP / Assignee',
  'Assumed Capacity (PD)', 'Assumed Waste %', 'Sprint Window', 'Latest End',
];
const BOARD_TABLE_HEADER_TOOLTIPS = {
  'Board ID': 'Jira board identifier.',
  'Board': 'Board name shown in Jira.',
  'Type': 'Board type: Scrum (time-boxed sprints) or Kanban (flow).',
  'Projects': 'Projects mapped to this board.',
  'Sprints': 'Count of sprints included in the date window.',
  'Sprint Days': 'Sum of sprint length in calendar days across included sprints.',
  'Avg Sprint Days': 'Average sprint length in days (Total Sprint Days / Sprints).',
  'Done Stories': 'Stories marked Done in included sprints.',
  'Done SP': 'Story points completed in included sprints. Total delivered effort when SP is used consistently.',
  'Committed SP': 'Story points committed at sprint start (estimated scope).',
  'Delivered SP': 'Story points delivered by sprint end (actual). Compare to Committed SP to assess estimation discipline.',
  'SP Estimation %': 'Delivered SP / Committed SP. 100% means delivery matched plan; below 100% suggests over-commit or scope churn; above 100% can indicate under-commit or late scope add.',
  'Stories / Sprint': 'Done Stories / Sprints. Helps compare volume regardless of sprint count.',
  'SP / Story': 'Done SP / Done Stories. Higher means larger average story size; very high can imply poor slicing.',
  'Stories / Day': 'Done Stories / Sprint Days. Normalized delivery rate to compare teams with different sprint lengths.',
  'SP / Day': 'Done SP / Sprint Days. Normalized delivery rate (Time-to-Market proxy).',
  'SP / Sprint': 'Done SP / Sprints. Average SP delivered per sprint.',
  'SP Variance': 'Variance of SP delivered per sprint. High variance = delivery swings and weaker predictability.',
  'Indexed Delivery': 'Current SP/day ?? rolling avg SP/day (last 3??-6 sprints). 1.0 = at own norm; above = above norm. Baseline: last 6 closed sprints. Do not use to rank teams.',
  'On-Time %': 'Stories resolved by sprint end / Done Stories. Higher means more work finished on time vs carried over.',
  'Planned': 'Stories linked to an Epic (planned scope).',
  'Ad-hoc': 'Stories without an Epic (often unplanned work). High values can signal scope churn.',
  'Active Assignees': 'Unique assignees with done work in the window. Proxy for active team size.',
  'Stories / Assignee': 'Done Stories / Active Assignees. Proxy for work load per person.',
  'SP / Assignee': 'Done SP / Active Assignees. Proxy for delivery per person when SP is available.',
  'Assumed Capacity (PD)': 'Assumed capacity in person-days (Active Assignees ?? 18 days per month ?? months in window). Coarse proxy only.',
  'Assumed Waste %': 'Assumed unused capacity % based on sprint coverage vs assumed capacity. Does not account for PTO, part-time, or non-sprint work.',
  'Sprint Window': 'Earliest sprint start to latest sprint end in the window (local display).',
  'Latest End': 'Latest sprint end date in the window (local display).',
};
const BOARD_SUMMARY_TOOLTIPS = {
  'Board ID': '??-',
  'Board': 'Summary row: aggregate across all boards in this view.',
  'Type': '??-',
  'Projects': '??-',
  'Sprints': 'Sum of sprint count across all boards.',
  'Sprint Days': 'Sum of sprint days across all boards.',
  'Avg Sprint Days': 'Average of Avg Sprint Days across boards.',
  'Done Stories': 'Sum of Done Stories across all boards.',
  'Done SP': 'Sum of Done SP across all boards.',
  'Committed SP': 'Sum of Committed SP across all boards.',
  'Delivered SP': 'Sum of Delivered SP across all boards.',
  'SP Estimation %': 'Average of SP Estimation % across boards.',
  'Stories / Sprint': 'Average of Stories / Sprint across boards.',
  'SP / Story': 'Average of SP / Story across boards.',
  'Stories / Day': 'Average of Stories / Day across boards.',
  'SP / Day': 'Average of SP / Day across boards.',
  'SP / Sprint': 'Average of SP / Sprint across boards.',
  'SP Variance': 'Average of SP Variance across boards.',
  'Indexed Delivery': '??-',
  'On-Time %': 'Average of On-Time % across boards.',
  'Planned': 'Sum of Planned (epic-linked) stories across all boards.',
  'Ad-hoc': 'Sum of Ad-hoc stories across all boards.',
  'Active Assignees': 'Sum of unique assignees across boards (person may appear in multiple boards).',
  'Stories / Assignee': 'Average of Stories / Assignee across boards.',
  'SP / Assignee': 'Average of SP / Assignee across boards.',
  'Assumed Capacity (PD)': 'Sum of Assumed Capacity across boards.',
  'Assumed Waste %': 'Average of Assumed Waste % across boards.',
  'Sprint Window': 'Aggregate across all boards.',
  'Latest End': 'Aggregate across all boards.',
};

function computeBoardRowFromSummary(board, summary, meta, spEnabled, hasPredictability) {
  const totalSprintDays = summary.totalSprintDays || 0;
  const avgSprintLength = summary.validSprintDaysCount > 0 ? totalSprintDays / summary.validSprintDaysCount : null;
  const doneStories = summary.doneStories;
  const doneSP = summary.doneSP;
  const storiesPerSprint = summary.sprintCount > 0 ? doneStories / summary.sprintCount : null;
  const spPerStory = spEnabled && doneStories > 0 ? doneSP / doneStories : null;
  const storiesPerSprintDay = totalSprintDays > 0 ? doneStories / totalSprintDays : null;
  const spPerSprintDay = spEnabled && totalSprintDays > 0 ? doneSP / totalSprintDays : null;
  const avgSpPerSprint = spEnabled && summary.sprintCount > 0 ? doneSP / summary.sprintCount : null;
  const spVariance = spEnabled ? calculateVariance(summary.sprintSpValues) : null;
  const doneBySprintEndPct = doneStories > 0 ? (summary.doneBySprintEnd / doneStories) * 100 : null;
  const spEstimationPct = hasPredictability && summary.committedSP > 0 ? (summary.deliveredSP / summary.committedSP) * 100 : null;
  const activeAssignees = summary.assignees?.size || 0;
  const storiesPerAssignee = activeAssignees > 0 ? doneStories / activeAssignees : null;
  const spPerAssignee = spEnabled && activeAssignees > 0 ? doneSP / activeAssignees : null;
  const windowMonths = getWindowMonths(meta);
  const assumedCapacity = windowMonths && activeAssignees > 0 ? activeAssignees * 18 * windowMonths : null;
  const coveredPersonDays = activeAssignees > 0 ? totalSprintDays * activeAssignees : null;
  const assumedWastePct = assumedCapacity && coveredPersonDays !== null && assumedCapacity > 0
    ? Math.max(0, ((assumedCapacity - coveredPersonDays) / assumedCapacity) * 100) : null;
  const sprintWindow = summary.earliestStart && summary.latestEnd
    ? `${formatDateForDisplay(summary.earliestStart)} to ${formatDateForDisplay(summary.latestEnd)}` : '';
  const latestEnd = summary.latestEnd ? formatDateForDisplay(summary.latestEnd) : '';
  const idx = board.indexedDelivery;
  const indexedDeliveryStr = idx != null && idx.index != null
    ? formatNumber(idx.index, 2) + ' (vs own baseline)'
    : '??-';
  return {
    'Board ID': board.id,
    'Board': board.name,
    'Type': board.type || '',
    'Projects': (board.projectKeys || []).join(', '),
    'Sprints': summary.sprintCount,
    'Sprint Days': totalSprintDays,
    'Avg Sprint Days': formatNumber(avgSprintLength),
    'Done Stories': doneStories,
    'Done SP': spEnabled ? doneSP : 'N/A',
    'Committed SP': formatNumber(hasPredictability ? summary.committedSP : null, 2),
    'Delivered SP': formatNumber(hasPredictability ? summary.deliveredSP : null, 2),
    'SP Estimation %': formatPercent(spEstimationPct),
    'Stories / Sprint': formatNumber(storiesPerSprint),
    'SP / Story': formatNumber(spPerStory),
    'Stories / Day': formatNumber(storiesPerSprintDay),
    'SP / Day': formatNumber(spPerSprintDay),
    'SP / Sprint': formatNumber(avgSpPerSprint),
    'SP Variance': formatNumber(spVariance),
    'Indexed Delivery': indexedDeliveryStr,
    'On-Time %': formatPercent(doneBySprintEndPct),
    'Planned': summary.epicStories,
    'Ad-hoc': summary.nonEpicStories,
    'Active Assignees': activeAssignees,
    'Stories / Assignee': formatNumber(storiesPerAssignee),
    'SP / Assignee': formatNumber(spPerAssignee),
    'Assumed Capacity (PD)': formatNumber(assumedCapacity),
    'Assumed Waste %': formatPercent(assumedWastePct),
    'Sprint Window': sprintWindow,
    'Latest End': latestEnd,
  };
}

function computeBoardsSummaryRow(boards, boardSummaries, meta, spEnabled, hasPredictability) {
  if (!boards || boards.length === 0) return null;
  const windowMonths = getWindowMonths(meta);
  let sumSprints = 0, sumSprintDays = 0, sumDoneStories = 0, sumDoneSP = 0, sumCommittedSP = 0, sumDeliveredSP = 0;
  let sumPlanned = 0, sumAdhoc = 0, sumAssignees = 0, sumCapacity = 0;
  const avgSprintDaysArr = [], storiesPerSprintArr = [], spPerStoryArr = [], storiesPerDayArr = [], spPerDayArr = [];
  const spPerSprintArr = [], onTimeArr = [], spEstimationArr = [], spVarianceArr = [], wasteArr = [];
  const storiesPerAssigneeArr = [], spPerAssigneeArr = [];
  let earliestStart = null, latestEnd = null;

  for (const board of boards) {
    const summary = boardSummaries.get(board.id) || { sprintCount: 0, doneStories: 0, doneSP: 0, committedSP: 0, deliveredSP: 0, earliestStart: null, latestEnd: null, totalSprintDays: 0, validSprintDaysCount: 0, doneBySprintEnd: 0, sprintSpValues: [], epicStories: 0, nonEpicStories: 0, epicSP: 0, nonEpicSP: 0, assignees: new Set(), nonEpicAssignees: new Set() };
    sumSprints += summary.sprintCount || 0;
    sumSprintDays += summary.totalSprintDays || 0;
    sumDoneStories += summary.doneStories || 0;
    if (spEnabled) sumDoneSP += summary.doneSP || 0;
    if (hasPredictability) {
      sumCommittedSP += summary.committedSP || 0;
      sumDeliveredSP += summary.deliveredSP || 0;
    }
    sumPlanned += summary.epicStories || 0;
    sumAdhoc += summary.nonEpicStories || 0;
    const activeAssignees = summary.assignees?.size || 0;
    sumAssignees += activeAssignees;

    const totalSprintDays = summary.totalSprintDays || 0;
    const avgSprintLength = summary.validSprintDaysCount > 0 ? totalSprintDays / summary.validSprintDaysCount : null;
    if (avgSprintLength !== null) avgSprintDaysArr.push(avgSprintLength);
    if (summary.sprintCount > 0) storiesPerSprintArr.push(summary.doneStories / summary.sprintCount);
    if (spEnabled && summary.doneStories > 0) spPerStoryArr.push(summary.doneSP / summary.doneStories);
    if (totalSprintDays > 0) {
      storiesPerDayArr.push(summary.doneStories / totalSprintDays);
      if (spEnabled) spPerDayArr.push(summary.doneSP / totalSprintDays);
    }
    if (spEnabled && summary.sprintCount > 0) spPerSprintArr.push(summary.doneSP / summary.sprintCount);
    if (summary.doneStories > 0) onTimeArr.push((summary.doneBySprintEnd / summary.doneStories) * 100);
    if (hasPredictability && summary.committedSP > 0) spEstimationArr.push((summary.deliveredSP / summary.committedSP) * 100);
    if (spEnabled && summary.sprintSpValues?.length) spVarianceArr.push(calculateVariance(summary.sprintSpValues));
    const assumedCapacity = windowMonths && activeAssignees > 0 ? activeAssignees * 18 * windowMonths : null;
    const coveredPersonDays = activeAssignees > 0 ? totalSprintDays * activeAssignees : null;
    const assumedWastePct = assumedCapacity && coveredPersonDays !== null && assumedCapacity > 0 ? Math.max(0, ((assumedCapacity - coveredPersonDays) / assumedCapacity) * 100) : null;
    if (assumedWastePct !== null) wasteArr.push(assumedWastePct);
    sumCapacity += assumedCapacity || 0;
    if (activeAssignees > 0) {
      storiesPerAssigneeArr.push(summary.doneStories / activeAssignees);
      if (spEnabled) spPerAssigneeArr.push(summary.doneSP / activeAssignees);
    }
    if (summary.earliestStart) {
      const d = summary.earliestStart instanceof Date ? summary.earliestStart : new Date(summary.earliestStart);
      if (!earliestStart || d < earliestStart) earliestStart = d;
    }
    if (summary.latestEnd) {
      const d = summary.latestEnd instanceof Date ? summary.latestEnd : new Date(summary.latestEnd);
      if (!latestEnd || d > latestEnd) latestEnd = d;
    }
  }

  const n = boards.length;
  const avg = (arr) => (arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length);
  const sprintWindow = earliestStart && latestEnd ? `${formatDateForDisplay(earliestStart)} to ${formatDateForDisplay(latestEnd)}` : '??-';
  const latestEndStr = latestEnd ? formatDateForDisplay(latestEnd) : '??-';

  return {
    'Board ID': '??-',
    'Board': 'Total',
    'Type': '??-',
    'Projects': '??-',
    'Sprints': sumSprints,
    'Sprint Days': sumSprintDays,
    'Avg Sprint Days': formatNumber(avg(avgSprintDaysArr)),
    'Done Stories': sumDoneStories,
    'Done SP': spEnabled ? sumDoneSP : 'N/A',
    'Committed SP': formatNumber(hasPredictability ? sumCommittedSP : null, 2),
    'Delivered SP': formatNumber(hasPredictability ? sumDeliveredSP : null, 2),
    'SP Estimation %': formatPercent(avg(spEstimationArr)),
    'Stories / Sprint': formatNumber(avg(storiesPerSprintArr)),
    'SP / Story': formatNumber(avg(spPerStoryArr)),
    'Stories / Day': formatNumber(avg(storiesPerDayArr)),
    'SP / Day': formatNumber(avg(spPerDayArr)),
    'SP / Sprint': formatNumber(avg(spPerSprintArr)),
    'SP Variance': formatNumber(avg(spVarianceArr)),
    'Indexed Delivery': '??-',
    'On-Time %': formatPercent(avg(onTimeArr)),
    'Planned': sumPlanned,
    'Ad-hoc': sumAdhoc,
    'Active Assignees': sumAssignees,
    'Stories / Assignee': formatNumber(avg(storiesPerAssigneeArr)),
    'SP / Assignee': formatNumber(avg(spPerAssigneeArr)),
    'Assumed Capacity (PD)': formatNumber(sumCapacity),
    'Assumed Waste %': formatPercent(avg(wasteArr)),
    'Sprint Window': sprintWindow,
    'Latest End': latestEndStr,
  };
}

function computeSprintTimeTotals(rows) {
  const totals = new Map();
  for (const row of rows || []) {
    if (!totals.has(row.sprintId)) {
      totals.set(row.sprintId, {
        estimateHours: 0,
        spentHours: 0,
        remainingHours: 0,
        varianceHours: 0,
        subtaskEstimateHours: 0,
        subtaskSpentHours: 0,
        subtaskRemainingHours: 0,
        subtaskVarianceHours: 0,
      });
    }
    const totalsEntry = totals.get(row.sprintId);
    totalsEntry.estimateHours += Number(row.timeOriginalEstimateHours) || 0;
    totalsEntry.spentHours += Number(row.timeSpentHours) || 0;
    totalsEntry.remainingHours += Number(row.timeRemainingEstimateHours) || 0;
    totalsEntry.varianceHours += Number(row.timeVarianceHours) || 0;
    totalsEntry.subtaskEstimateHours += Number(row.subtaskTimeOriginalEstimateHours) || 0;
    totalsEntry.subtaskSpentHours += Number(row.subtaskTimeSpentHours) || 0;
    totalsEntry.subtaskRemainingHours += Number(row.subtaskTimeRemainingEstimateHours) || 0;
    totalsEntry.subtaskVarianceHours += Number(row.subtaskTimeVarianceHours) || 0;
  }
  return totals;
}

// Render Project & Epic Level tab (merged Boards + Metrics)
function renderProjectEpicLevelTab(boards, metrics) {
  const content = document.getElementById('project-epic-level-content');
  const meta = getSafeMeta(previewData);
  const spEnabled = !!meta?.discoveredFields?.storyPointsFieldId;
  let html = '';
  const predictabilityPerSprint = metrics?.predictability?.perSprint || null;
  const boardSummaries = buildBoardSummaries(boards, previewData?.sprintsIncluded || [], previewRows, meta, predictabilityPerSprint);

  // Section 1: Boards (merged with throughput fundamentals)
  if (!boards || boards.length === 0) {
    if (!metrics) {
      renderEmptyState(
        content,
        'No boards in this range',
        'No boards were discovered for the selected projects in the date window.',
        'Try a different date range or project selection.'
      );
      return;
    }
    html += '<h3>Boards</h3>';
    if (previewData?.boards?.length > 0) {
      html += '<p><em>No boards match the current filters. Adjust search or project filters.</em></p>';
    } else {
      html += '<p><em>No boards were discovered for the selected projects in the date window.</em></p><p><small>Try a different date range or project selection.</small></p>';
    }
  } else {
    html += '<h3>Boards</h3>';
    const hasPredictability = !!metrics?.predictability;
    html += '<p class="metrics-hint"><small>Time-normalized metrics (Stories / Day, SP / Day, Indexed Delivery) are shown. Indexed Delivery = current SP/day vs own baseline (last 6 closed sprints). Do not use to rank teams.</small></p>';
    html += '<table class="data-table"><thead><tr>';
    for (const key of BOARD_TABLE_COLUMN_ORDER) {
      const title = BOARD_TABLE_HEADER_TOOLTIPS[key] || '';
      html += '<th title="' + escapeHtml(title) + '" data-tooltip="' + escapeHtml(title) + '">' + escapeHtml(key) + '</th>';
    }
    html += '</tr></thead><tbody>';
    for (const board of boards) {
      const summary = boardSummaries.get(board.id) || { sprintCount: 0, doneStories: 0, doneSP: 0, committedSP: 0, deliveredSP: 0, earliestStart: null, latestEnd: null, totalSprintDays: 0, validSprintDaysCount: 0, doneBySprintEnd: 0, sprintSpValues: [], epicStories: 0, nonEpicStories: 0, epicSP: 0, nonEpicSP: 0, assignees: new Set(), nonEpicAssignees: new Set() };
      const row = computeBoardRowFromSummary(board, summary, meta, spEnabled, hasPredictability);
      html += '<tr>';
      for (const key of BOARD_TABLE_COLUMN_ORDER) {
        html += '<td>' + escapeHtml(String(row[key] ?? '')) + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody>';
    const summaryRow = computeBoardsSummaryRow(boards, boardSummaries, meta, spEnabled, hasPredictability);
    if (summaryRow) {
      html += '<tfoot><tr class="boards-summary-row">';
      for (const key of BOARD_TABLE_COLUMN_ORDER) {
        const tip = BOARD_SUMMARY_TOOLTIPS[key] || '';
        html += '<td title="' + escapeHtml(tip) + '" data-tooltip="' + escapeHtml(tip) + '">' + escapeHtml(String(summaryRow[key] ?? '??-')) + '</td>';
      }
      html += '</tr></tfoot>';
    }
    html += '</table>';
  }

  // Section 2: Metrics (if available)
  if (metrics) {
    html += '<hr style="margin: 30px 0;">';
    
    // Throughput Metrics
    if (metrics.throughput) {
      html += '<h3>Throughput</h3>';
      html += '<p class="metrics-hint"><small>Note: Per-board throughput is merged into the Boards table. Per Sprint data is shown in the Sprints tab. Below are aggregated views by issue type.</small></p>';
      if (metrics.throughput.perIssueType && Object.keys(metrics.throughput.perIssueType).length > 0) {
        html += '<h4>Per Issue Type</h4>';
        html += '<table class="data-table"><thead><tr>' +
          '<th title="Issue category as reported by Jira.">Issue Type</th>' +
          '<th title="Total story points delivered for this issue type. Higher means more effort delivered.">Total SP</th>' +
          '<th title="Total number of done issues for this type in the window.">Issue Count</th>' +
          '</tr></thead><tbody>';
        for (const issueType in metrics.throughput.perIssueType) {
          const data = metrics.throughput.perIssueType[issueType];
          html += `<tr><td>${escapeHtml(data.issueType || 'Unknown')}</td><td>${data.totalSP}</td><td>${data.issueCount}</td></tr>`;
        }
        html += '</tbody></table>';
      }
    }

    // Rework Ratio
    if (metrics.rework) {
      html += '<h3>Rework Ratio</h3>';
      const r = metrics.rework;
      if (r.spAvailable) {
        html += `<p>Rework: ${formatPercent(r.reworkRatio)} (Bug SP: ${r.bugSP}, Story SP: ${r.storySP})</p>`;
      } else {
        html += `<p>Rework: SP unavailable (Bug Count: ${r.bugCount}, Story Count: ${r.storyCount})</p>`;
      }
    }

    // Predictability (planned vs unplanned carryover)
    if (metrics.predictability) {
      html += '<h3>Predictability</h3>';
      html += `<p>Mode: ${escapeHtml(metrics.predictability.mode)}</p>`;
      html += '<p class="metrics-hint"><small>Detection: Planned carryover = created before sprint start and delivered. Unplanned spillover = added mid-sprint and delivered. Do not use unplanned spillover as a failure metric.</small></p>';
      html += buildPredictabilityTableHeaderHtml();
      const predictPerSprint = metrics.predictability.perSprint || {};
      for (const data of Object.values(predictPerSprint)) {
        if (!data) continue;
      const plannedCell = (data.deliveredStories == null || data.deliveredStories === 0 || data.plannedCarryoverPct == null)
        ? '??-'
        : (data.plannedCarryoverStories ?? '??-') + ' (' + formatPercent(data.plannedCarryoverPct) + '%)';
      const unplannedCell = (data.deliveredStories == null || data.deliveredStories === 0 || data.unplannedSpilloverPct == null)
        ? '??-'
        : (data.unplannedSpilloverStories ?? '??-') + ' (' + formatPercent(data.unplannedSpilloverPct) + '%)';
      html += `<tr>
          <td>${escapeHtml(data.sprintName)}</td>
          <td>${data.committedStories}</td>
          <td>${data.committedSP}</td>
          <td>${data.deliveredStories}</td>
          <td>${data.deliveredSP}</td>
          <td>${plannedCell}</td>
          <td>${unplannedCell}</td>
          <td>${formatPercent(data.predictabilityStories)}</td>
          <td>${formatPercent(data.predictabilitySP)}</td>
        </tr>`;
      }
      html += '</tbody></table>';
    }

    // Epic TTM (gated by epic hygiene)
    if (metrics.epicTTM) {
      html += '<h3>Epic Time-To-Market</h3>';
      const epicHygiene = meta?.epicHygiene;
      if (epicHygiene && epicHygiene.ok === false) {
        html += '<p class="data-quality-warning"><strong>Epic hygiene insufficient for timing metrics.</strong> ' + escapeHtml(epicHygiene.message || '') + ' Epic TTM is suppressed. Fix Epic Link usage and/or epic span before using TTM.</p>';
      } else {
      html += '<p class="metrics-hint"><strong>Definition:</strong> Epic Time-To-Market measures days from Epic creation to Epic resolution (or first story created to last story resolved if Epic dates unavailable).</p>';
      if (meta?.epicTTMFallbackCount > 0) {
        html += `<p class="data-quality-warning"><small>Note: ${meta.epicTTMFallbackCount} epic(s) used story date fallback (Epic issues unavailable).</small></p>`;
      }
      html += '<p class="metrics-hint"><small>Completion anchored to: Resolution date.</small></p>';
      html += '<table class="data-table"><thead><tr>' +
        '<th title="Epic identifier in Jira." data-tooltip="Epic identifier in Jira.">Epic Key</th>' +
        '<th title="Epic summary/title." data-tooltip="Epic summary/title.">Epic Name</th>' +
        '<th title="User stories linked to this epic in the window. Hover to see summaries." data-tooltip="User stories linked to this epic in the window. Hover to see summaries.">Story IDs</th>' +
        '<th title="Number of stories linked to the epic in this window." data-tooltip="Number of stories linked to the epic in this window.">Story Count</th>' +
        '<th title="Epic start date (Epic created or first story created if Epic dates missing)." data-tooltip="Epic start date (Epic created or first story created if Epic dates missing).">Start Date</th>' +
        '<th title="Epic end date (Epic resolved or last story resolved if Epic dates missing)." data-tooltip="Epic end date (Epic resolved or last story resolved if Epic dates missing).">End Date</th>' +
        '<th title="Calendar days from start to end (includes weekends)." data-tooltip="Calendar days from start to end (includes weekends).">Calendar TTM (days)</th>' +
        '<th title="Working days from start to end (excludes weekends). Use this to compare team flow." data-tooltip="Working days from start to end (excludes weekends). Use this to compare team flow.">Working TTM (days)</th>' +
        '</tr></thead><tbody>';
      const epicRows = [...metrics.epicTTM, ...buildEpicAdhocRows(previewRows)];
      for (const epic of epicRows) {
        html += `<tr>
          <td>${renderEpicKeyCell(epic, meta)}</td>
          <td>${escapeHtml(epic.epicTitle || '')}</td>
          <td>${renderEpicStoryList(epic, meta)}</td>
          <td>${epic.storyCount}</td>
          <td>${escapeHtml(formatDateForDisplay(epic.startDate))}</td>
          <td>${escapeHtml(formatDateForDisplay(epic.endDate || ''))}</td>
          <td>${epic.calendarTTMdays ?? ''}</td>
          <td>${epic.workingTTMdays ?? ''}</td>
        </tr>`;
      }
      html += '</tbody></table>';
      }
    }
  } else {
    html += '<hr style="margin: 30px 0;">';
    html += '<p><em>No metrics available. Metrics are calculated when the corresponding options are enabled.</em></p>';
  }

  content.innerHTML = html;
}

// Render Sprints tab
function renderSprintsTab(sprints, metrics) {
  const content = document.getElementById('sprints-content');
  const meta = getSafeMeta(previewData);
  const spEnabled = !!meta?.discoveredFields?.storyPointsFieldId;
  const orderedSprints = sortSprintsLatestFirst(sprints);

  if (!orderedSprints || orderedSprints.length === 0) {
    const windowInfo = meta
      ? `${new Date(meta.windowStart).toLocaleDateString()} to ${new Date(meta.windowEnd).toLocaleDateString()}`
      : 'selected date range';
    const title = 'No sprints found';
    let message;
    let hint;
    if (previewData?.sprintsIncluded?.length > 0) {
      message = 'No sprints match the current filters.';
      hint = 'Adjust search or project filters.';
    } else {
      message = `No sprints overlap with the selected date window (${windowInfo}).`;
      hint = 'Try adjusting your date range or enable "Include Active/Missing End Date Sprints" if you want to include active sprints.';
    }
    renderEmptyState(content, title, message, hint);
    return;
  }

  // Create throughput map for quick lookup
  const throughputMap = new Map();
  if (metrics?.throughput?.perSprint) {
    for (const data of Object.values(metrics.throughput.perSprint)) {
      if (data?.sprintId) {
        throughputMap.set(data.sprintId, data);
      }
    }
  }

  const predictabilityMap = new Map();
  if (metrics?.predictability?.perSprint) {
    for (const data of Object.values(metrics.predictability.perSprint)) {
      if (data?.sprintId) {
        predictabilityMap.set(data.sprintId, data);
      }
    }
  }

  const timeTotals = computeSprintTimeTotals(previewRows);
  const hasTimeTracking = Array.from(timeTotals.values()).some(total =>
    total.estimateHours || total.spentHours || total.remainingHours || total.varianceHours
  );
  const hasSubtaskTimeTracking = Array.from(timeTotals.values()).some(total =>
    total.subtaskEstimateHours || total.subtaskSpentHours || total.subtaskRemainingHours || total.subtaskVarianceHours
  );

  let html = '<table class="data-table"><thead><tr>' +
    '<th title="Projects included for this sprint.">Project</th>' +
    '<th title="Board that owns the sprint.">Board</th>' +
    '<th title="Sprint name.">Sprint</th>' +
    '<th title="Sprint start date (local display).">Start</th>' +
    '<th title="Sprint end date (local display).">End</th>' +
    '<th title="Sprint state in Jira.">State</th>' +
    '<th title="Stories marked Done in this sprint.">Done Stories</th>';
  
  if (metrics?.doneComparison) {
    html += '<th title="Stories resolved by the sprint end date.">On-Time Stories</th>';
  }
  
  if (metrics?.throughput) {
    html += '<th title="Story points completed in this sprint. If SP is not configured, this will show N/A.">Done SP</th><th title="Total SP recorded for this sprint in throughput.">Total SP</th><th title="Story count used in throughput.">Story Count</th>';
  }

  if (metrics?.predictability) {
    html += '<th title="Story points committed at sprint start (estimate).">Committed SP</th>' +
      '<th title="Story points delivered by sprint end (actual).">Delivered SP</th>' +
      '<th title="Delivered SP / Committed SP. 100% means delivery matched plan; below 100% suggests over-commit or scope churn; above 100% suggests scope growth.">SP Estimation %</th>';
  }

  if (hasTimeTracking) {
    html += '<th title="Sum of original estimates.">Est Hrs</th><th title="Sum of time spent.">Spent Hrs</th><th title="Sum of remaining estimates.">Remaining Hrs</th><th title="Actual hours minus estimate. Positive = over estimate; negative = under. Large swings signal estimation risk.">Variance Hrs</th>';
  }

  if (hasSubtaskTimeTracking) {
    html += '<th title="Sum of subtask estimates.">Subtask Est Hrs</th><th title="Sum of subtask time spent.">Subtask Spent Hrs</th><th title="Sum of subtask remaining estimates.">Subtask Remaining Hrs</th><th title="Subtask hours minus estimate. Large swings signal hidden work or poor slicing.">Subtask Variance Hrs</th>';
  }
  
  html += '</tr></thead><tbody>';
  
  for (const sprint of orderedSprints) {
    const throughputData = throughputMap.get(sprint.id);
    const timeData = timeTotals.get(sprint.id) || {
      estimateHours: 0,
      spentHours: 0,
      remainingHours: 0,
      varianceHours: 0,
      subtaskEstimateHours: 0,
      subtaskSpentHours: 0,
      subtaskRemainingHours: 0,
      subtaskVarianceHours: 0,
    };
    
    const sprintStartDisplay = formatDateForDisplay(sprint.startDate);
    const sprintEndDisplay = formatDateForDisplay(sprint.endDate);
    html += `
      <tr>
        <td>${escapeHtml((sprint.projectKeys || []).join(', '))}</td>
        <td>${escapeHtml(sprint.boardName || '')}</td>
        <td>${escapeHtml(sprint.name || '')}</td>
        <td title="${escapeHtml(sprintStartDisplay)}">${escapeHtml(sprintStartDisplay)}</td>
        <td title="${escapeHtml(sprintEndDisplay)}">${escapeHtml(sprintEndDisplay)}</td>
        <td>${escapeHtml(sprint.state || '')}</td>
        <td>${sprint.doneStoriesNow || 0}</td>
    `;
    
    if (metrics?.doneComparison) {
      html += `<td>${sprint.doneStoriesBySprintEnd || 0}</td>`;
    }
    
    if (metrics?.throughput) {
      html += `<td>${spEnabled ? (sprint.doneSP || 0) : 'N/A'}</td>`;
      if (throughputData) {
        html += `<td>${throughputData.totalSP || 0}</td>`;
        html += `<td>${throughputData.storyCount || 0}</td>`;
      } else {
        html += '<td>N/A</td>';
        html += '<td>N/A</td>';
      }
    }

    if (metrics?.predictability) {
      const predictData = predictabilityMap.get(sprint.id);
      const committedSP = predictData ? predictData.committedSP : null;
      const deliveredSP = predictData ? predictData.deliveredSP : null;
      const estimationPct = committedSP > 0 ? (deliveredSP / committedSP) * 100 : null;
      html += `<td>${formatNumber(committedSP, 2)}</td>`;
      html += `<td>${formatNumber(deliveredSP, 2)}</td>`;
      html += `<td>${formatPercent(estimationPct)}</td>`;
    }

    if (hasTimeTracking) {
      html += `<td>${timeData.estimateHours.toFixed(2)}</td>`;
      html += `<td>${timeData.spentHours.toFixed(2)}</td>`;
      html += `<td>${timeData.remainingHours.toFixed(2)}</td>`;
      html += `<td>${timeData.varianceHours.toFixed(2)}</td>`;
    }

    if (hasSubtaskTimeTracking) {
      html += `<td>${timeData.subtaskEstimateHours.toFixed(2)}</td>`;
      html += `<td>${timeData.subtaskSpentHours.toFixed(2)}</td>`;
      html += `<td>${timeData.subtaskRemainingHours.toFixed(2)}</td>`;
      html += `<td>${timeData.subtaskVarianceHours.toFixed(2)}</td>`;
    }
    
    html += '</tr>';
  }
  
  // Totals row
  const totalDoneStoriesNow = orderedSprints.reduce((sum, sprint) => sum + (sprint.doneStoriesNow || 0), 0);
  const totalDoneByEnd = orderedSprints.reduce((sum, sprint) => sum + (sprint.doneStoriesBySprintEnd || 0), 0);
  const totalDoneSP = orderedSprints.reduce((sum, sprint) => sum + (sprint.doneSP || 0), 0);
  const totalThroughputSP = metrics?.throughput?.perSprint
    ? Object.values(metrics.throughput.perSprint).reduce((sum, data) => sum + (data.totalSP || 0), 0)
    : 0;
  const totalThroughputCount = metrics?.throughput?.perSprint
    ? Object.values(metrics.throughput.perSprint).reduce((sum, data) => sum + (data.storyCount || 0), 0)
    : 0;
  const totalCommittedSP = metrics?.predictability?.perSprint
    ? Object.values(metrics.predictability.perSprint).reduce((sum, data) => sum + (data.committedSP || 0), 0)
    : 0;
  const totalDeliveredSP = metrics?.predictability?.perSprint
    ? Object.values(metrics.predictability.perSprint).reduce((sum, data) => sum + (data.deliveredSP || 0), 0)
    : 0;
  const totalEstimationPct = totalCommittedSP > 0
    ? (totalDeliveredSP / totalCommittedSP) * 100
    : null;
  const totalTime = Array.from(timeTotals.values()).reduce(
    (acc, val) => ({
      estimateHours: acc.estimateHours + val.estimateHours,
      spentHours: acc.spentHours + val.spentHours,
      remainingHours: acc.remainingHours + val.remainingHours,
      varianceHours: acc.varianceHours + val.varianceHours,
    }),
    { estimateHours: 0, spentHours: 0, remainingHours: 0, varianceHours: 0 }
  );
  const totalSubtaskTime = Array.from(timeTotals.values()).reduce(
    (acc, val) => ({
      estimateHours: acc.estimateHours + val.subtaskEstimateHours,
      spentHours: acc.spentHours + val.subtaskSpentHours,
      remainingHours: acc.remainingHours + val.subtaskRemainingHours,
      varianceHours: acc.varianceHours + val.subtaskVarianceHours,
    }),
    { estimateHours: 0, spentHours: 0, remainingHours: 0, varianceHours: 0 }
  );

  html += '<tr class="totals-row">';
  html += '<td colspan="6"><strong>Totals</strong></td>';
  html += `<td><strong>${totalDoneStoriesNow}</strong></td>`;
  if (metrics?.doneComparison) {
    html += `<td><strong>${totalDoneByEnd}</strong></td>`;
  }
  if (metrics?.throughput) {
    html += `<td><strong>${spEnabled ? totalDoneSP : 'N/A'}</strong></td>`;
    html += `<td><strong>${spEnabled ? totalThroughputSP : 'N/A'}</strong></td>`;
    html += `<td><strong>${totalThroughputCount}</strong></td>`;
  }
  if (metrics?.predictability) {
    html += `<td><strong>${formatNumber(totalCommittedSP, 2)}</strong></td>`;
    html += `<td><strong>${formatNumber(totalDeliveredSP, 2)}</strong></td>`;
    html += `<td><strong>${formatPercent(totalEstimationPct)}</strong></td>`;
  }
  if (hasTimeTracking) {
    html += `<td><strong>${totalTime.estimateHours.toFixed(2)}</strong></td>`;
    html += `<td><strong>${totalTime.spentHours.toFixed(2)}</strong></td>`;
    html += `<td><strong>${totalTime.remainingHours.toFixed(2)}</strong></td>`;
    html += `<td><strong>${totalTime.varianceHours.toFixed(2)}</strong></td>`;
  }
  if (hasSubtaskTimeTracking) {
    html += `<td><strong>${totalSubtaskTime.estimateHours.toFixed(2)}</strong></td>`;
    html += `<td><strong>${totalSubtaskTime.spentHours.toFixed(2)}</strong></td>`;
    html += `<td><strong>${totalSubtaskTime.remainingHours.toFixed(2)}</strong></td>`;
    html += `<td><strong>${totalSubtaskTime.varianceHours.toFixed(2)}</strong></td>`;
  }
  html += '</tr>';
  
  html += '</tbody></table>';
  content.innerHTML = html;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderNotificationDock);
} else {
  renderNotificationDock();
}

// Render Done Stories tab
function renderDoneStoriesTab(rows) {
  const content = document.getElementById('done-stories-content');
  const totalsBar = document.getElementById('done-stories-totals');
  const meta = getSafeMeta(previewData);
  
  if (!rows || rows.length === 0) {
    const searchText = document.getElementById('search-box')?.value || '';
    const activeProjects = Array.from(document.querySelectorAll('.pill.active')).map(p => p.dataset.project);
    const requireResolved = !!meta?.requireResolvedBySprintEnd;
    const totalPreviewRows = (previewData?.rows || []).length;

    let title = 'No done stories found';
    let message;
    let hint;

    if (requireResolved && totalPreviewRows > 0) {
      message = 'No stories passed the "Require resolved by sprint end" filter.';
      hint = 'Try turning off this option to see all Done stories, or inspect sprint end dates and resolution dates in Jira.';
    } else if (searchText || (meta?.selectedProjects && activeProjects.length < meta.selectedProjects.length)) {
      message = 'No stories match your current filters.';
      hint = 'Try adjusting your search text or project filters, or check if stories are marked as "Done" in the selected sprints.';
    } else {
      message = 'No stories with status "Done" were found in the selected sprints for the chosen projects.';
      hint = 'This could mean: (1) No stories were completed in these sprints, (2) Stories are not marked as "Done", or (3) the current filters are excluding stories. Try adjusting your filters.';
    }

    renderEmptyState(content, title, message, hint);
    totalsBar.innerHTML = '';
    const projectPills = document.getElementById('project-pills');
    if (projectPills) {
      projectPills.innerHTML = '';
    }
    if (exportDropdownTrigger) exportDropdownTrigger.disabled = true;
    return;
  }

  const hasStatusCategory = rows.some(row => row.issueStatusCategory);
  const hasPriority = rows.some(row => row.issuePriority);
  const hasLabels = rows.some(row => row.issueLabels);
  const hasComponents = rows.some(row => row.issueComponents);
  const hasFixVersions = rows.some(row => row.issueFixVersions);
  const hasSubtasks = rows.some(row => Number(row.subtaskCount) > 0);
  const hasTimeTracking = rows.some(row =>
    row.timeOriginalEstimateHours !== '' ||
    row.timeRemainingEstimateHours !== '' ||
    row.timeSpentHours !== '' ||
    row.timeVarianceHours !== ''
  );
  const hasSubtaskTimeTracking = rows.some(row =>
    row.subtaskTimeOriginalEstimateHours !== '' ||
    row.subtaskTimeRemainingEstimateHours !== '' ||
    row.subtaskTimeSpentHours !== '' ||
    row.subtaskTimeVarianceHours !== ''
  );
  const hasEbmTeam = rows.some(row => row.ebmTeam);
  const hasEbmProductArea = rows.some(row => row.ebmProductArea);
  const hasEbmCustomerSegments = rows.some(row => row.ebmCustomerSegments);
  const hasEbmValue = rows.some(row => row.ebmValue);
  const hasEbmImpact = rows.some(row => row.ebmImpact);
  const hasEbmSatisfaction = rows.some(row => row.ebmSatisfaction);
  const hasEbmSentiment = rows.some(row => row.ebmSentiment);
  const hasEbmSeverity = rows.some(row => row.ebmSeverity);
  const hasEbmSource = rows.some(row => row.ebmSource);
  const hasEbmWorkCategory = rows.some(row => row.ebmWorkCategory);
  const hasEbmGoals = rows.some(row => row.ebmGoals);
  const hasEbmTheme = rows.some(row => row.ebmTheme);
  const hasEbmRoadmap = rows.some(row => row.ebmRoadmap);
  const hasEbmFocusAreas = rows.some(row => row.ebmFocusAreas);
  const hasEbmDeliveryStatus = rows.some(row => row.ebmDeliveryStatus);
  const hasEbmDeliveryProgress = rows.some(row => row.ebmDeliveryProgress);

  // Group by sprint
  const sprintGroups = new Map();
  for (const row of rows) {
    if (!sprintGroups.has(row.sprintId)) {
      sprintGroups.set(row.sprintId, {
        sprint: {
          id: row.sprintId,
          name: row.sprintName,
          startDate: row.sprintStartDate,
          endDate: row.sprintEndDate,
        },
        rows: [],
      });
    }
    sprintGroups.get(row.sprintId).rows.push(row);
  }

  // Sort sprints by start date
  const sortedSprints = Array.from(sprintGroups.values()).sort((a, b) => {
    const dateA = new Date(a.sprint.startDate || 0);
    const dateB = new Date(b.sprint.startDate || 0);
    return dateA - dateB;
  });

  // Render collapsible groups
  let html = '<div class="sprint-groups">';
  
  for (const group of sortedSprints) {
    const sprintId = group.sprint.id;
    const sprintKey = `sprint-${sprintId}`;
    const sprintStartLabel = formatDateForDisplay(group.sprint.startDate);
    const sprintEndLabel = formatDateForDisplay(group.sprint.endDate);
    
    html += `
      <div class="sprint-group">
        <button class="sprint-header" onclick="toggleSprint('${sprintKey}')">
          <span class="toggle-icon">></span>
          <strong>${escapeHtml(group.sprint.name)}</strong>
          <span class="sprint-meta">${escapeHtml(sprintStartLabel)} to ${escapeHtml(sprintEndLabel)}</span>
          <span class="story-count">${group.rows.length} stories</span>
        </button>
        <div class="sprint-content" id="${sprintKey}" style="display: none;">
          <table class="data-table">
            <thead>
              <tr>
                <th title="Jira issue key.">Key</th>
                <th title="Issue summary from Jira.">Summary</th>
                <th title="Current Jira status.">Status</th>
                <th title="Issue type (Story, Bug, etc.).">Type</th>
                ${hasStatusCategory ? '<th title="Status group (To Do / In Progress / Done).">Status Group</th>' : ''}
                ${hasPriority ? '<th title="Priority from Jira.">Priority</th>' : ''}
                ${hasLabels ? '<th title="Issue labels.">Labels</th>' : ''}
                ${hasComponents ? '<th title="Components on the issue.">Components</th>' : ''}
                ${hasFixVersions ? '<th title="Fix versions on the issue.">Fix Versions</th>' : ''}
                ${hasEbmTeam ? '<th title="EBM Team: who owns the value. Use to compare outcomes and focus by team.">EBM Team</th>' : ''}
                ${hasEbmProductArea ? '<th title="EBM Product Area: links work to the customer or product slice it serves.">EBM Product Area</th>' : ''}
                ${hasEbmCustomerSegments ? '<th title="EBM Customer Segments: who benefits. Helps assess Current Value and gaps.">EBM Customer Segments</th>' : ''}
                ${hasEbmValue ? '<th title="EBM Value: value signal tied to CV/UV. Higher value should drive priority.">EBM Value</th>' : ''}
                ${hasEbmImpact ? '<th title="EBM Impact: expected outcome size. Use to compare impact vs effort.">EBM Impact</th>' : ''}
                ${hasEbmSatisfaction ? '<th title="EBM Satisfaction: customer happiness signal. Low values indicate CV risk.">EBM Satisfaction</th>' : ''}
                ${hasEbmSentiment ? '<th title="EBM Sentiment: team/customer sentiment. Track trends to protect CV.">EBM Sentiment</th>' : ''}
                ${hasEbmSeverity ? '<th title="EBM Severity: urgency and business impact. High severity drains A2I.">EBM Severity</th>' : ''}
                ${hasEbmSource ? '<th title="EBM Source: where demand started (customer, ops, internal). Balance CV vs A2I.">EBM Source</th>' : ''}
                ${hasEbmWorkCategory ? '<th title="EBM Work Category: feature/defect/debt. High defect or debt reduces A2I.">EBM Work Category</th>' : ''}
                ${hasEbmGoals ? '<th title="EBM Goals: strategic goal linkage. Strengthens UV alignment.">EBM Goals</th>' : ''}
                ${hasEbmTheme ? '<th title="EBM Theme: strategic theme grouping. Shows where investment clusters.">EBM Theme</th>' : ''}
                ${hasEbmRoadmap ? '<th title="EBM Roadmap: roadmap linkage. Highlights UV delivery progress.">EBM Roadmap</th>' : ''}
                ${hasEbmFocusAreas ? '<th title="EBM Focus Areas: focus topics for investment. Compare spend vs outcomes.">EBM Focus Areas</th>' : ''}
                ${hasEbmDeliveryStatus ? '<th title="EBM Delivery Status: current delivery state. Useful for flow visibility.">EBM Delivery Status</th>' : ''}
                ${hasEbmDeliveryProgress ? '<th title="EBM Delivery Progress: percent/stage toward done. Useful for predictability.">EBM Delivery Progress</th>' : ''}
                <th title="Assignee display name.">Assignee</th>
                <th title="Created date (local display).">Created</th>
                <th title="Resolved date (local display).">Resolved</th>
                ${hasSubtasks ? '<th title="Count of subtasks.">Subtasks</th>' : ''}
                ${hasTimeTracking ? '<th title="Original estimate (hours).">Est (Hrs)</th><th title="Time spent (hours).">Spent (Hrs)</th><th title="Remaining estimate (hours).">Remaining (Hrs)</th><th title="Actual hours minus estimate. Positive = over estimate; negative = under. Large swings mean estimation risk.">Variance (Hrs)</th>' : ''}
                ${hasSubtaskTimeTracking ? '<th title="Subtask estimate (hours).">Subtask Est (Hrs)</th><th title="Subtask spent (hours).">Subtask Spent (Hrs)</th><th title="Subtask remaining (hours).">Subtask Remaining (Hrs)</th><th title="Actual subtask hours minus estimate. Large swings signal hidden work or poor slicing.">Subtask Variance (Hrs)</th>' : ''}
                ${meta?.discoveredFields?.storyPointsFieldId ? '<th title="Story Points.">SP</th>' : ''}
                ${meta?.discoveredFields?.epicLinkFieldId ? '<th title="Epic key (planned work).">Epic</th><th title="Epic title.">Epic Title</th><th title="Epic summary (truncated in UI).">Epic Summary</th>' : ''}
              </tr>
            </thead>
            <tbody>
    `;
    
    // Sort rows by issue key
    const sortedRows = group.rows.sort((a, b) => a.issueKey.localeCompare(b.issueKey));
    
    for (const row of sortedRows) {
      // Handle Epic Summary truncation (100 chars with tooltip)
      let epicSummaryDisplay = '';
      let epicSummaryTitle = '';
      if (meta?.discoveredFields?.epicLinkFieldId && row.epicSummary && typeof row.epicSummary === 'string' && row.epicSummary.length > 0) {
        if (row.epicSummary.length > 100) {
          epicSummaryDisplay = row.epicSummary.substring(0, 100) + '...';
          epicSummaryTitle = row.epicSummary;
        } else {
          epicSummaryDisplay = row.epicSummary;
        }
      }
      
      html += `
        <tr>
          <td>${escapeHtml(row.issueKey)}</td>
          <td>${escapeHtml(row.issueSummary)}</td>
          <td>${escapeHtml(row.issueStatus)}</td>
          <td>${row.issueType ? escapeHtml(row.issueType) : '<em>Unknown</em>'}</td>
          ${hasStatusCategory ? `<td>${escapeHtml(row.issueStatusCategory || '')}</td>` : ''}
          ${hasPriority ? `<td>${escapeHtml(row.issuePriority || '')}</td>` : ''}
          ${hasLabels ? `<td>${escapeHtml(row.issueLabels || '')}</td>` : ''}
          ${hasComponents ? `<td>${escapeHtml(row.issueComponents || '')}</td>` : ''}
          ${hasFixVersions ? `<td>${escapeHtml(row.issueFixVersions || '')}</td>` : ''}
          ${hasEbmTeam ? `<td>${escapeHtml(row.ebmTeam || '')}</td>` : ''}
          ${hasEbmProductArea ? `<td>${escapeHtml(row.ebmProductArea || '')}</td>` : ''}
          ${hasEbmCustomerSegments ? `<td>${escapeHtml(row.ebmCustomerSegments || '')}</td>` : ''}
          ${hasEbmValue ? `<td>${escapeHtml(row.ebmValue || '')}</td>` : ''}
          ${hasEbmImpact ? `<td>${escapeHtml(row.ebmImpact || '')}</td>` : ''}
          ${hasEbmSatisfaction ? `<td>${escapeHtml(row.ebmSatisfaction || '')}</td>` : ''}
          ${hasEbmSentiment ? `<td>${escapeHtml(row.ebmSentiment || '')}</td>` : ''}
          ${hasEbmSeverity ? `<td>${escapeHtml(row.ebmSeverity || '')}</td>` : ''}
          ${hasEbmSource ? `<td>${escapeHtml(row.ebmSource || '')}</td>` : ''}
          ${hasEbmWorkCategory ? `<td>${escapeHtml(row.ebmWorkCategory || '')}</td>` : ''}
          ${hasEbmGoals ? `<td>${escapeHtml(row.ebmGoals || '')}</td>` : ''}
          ${hasEbmTheme ? `<td>${escapeHtml(row.ebmTheme || '')}</td>` : ''}
          ${hasEbmRoadmap ? `<td>${escapeHtml(row.ebmRoadmap || '')}</td>` : ''}
          ${hasEbmFocusAreas ? `<td>${escapeHtml(row.ebmFocusAreas || '')}</td>` : ''}
          ${hasEbmDeliveryStatus ? `<td>${escapeHtml(row.ebmDeliveryStatus || '')}</td>` : ''}
          ${hasEbmDeliveryProgress ? `<td>${escapeHtml(row.ebmDeliveryProgress || '')}</td>` : ''}
          <td>${escapeHtml(row.assigneeDisplayName)}</td>
          <td title="${escapeHtml(formatDateForDisplay(row.created))}">${escapeHtml(formatDateForDisplay(row.created))}</td>
          <td title="${escapeHtml(formatDateForDisplay(row.resolutionDate || ''))}">${escapeHtml(formatDateForDisplay(row.resolutionDate || ''))}</td>
          ${hasSubtasks ? `<td>${row.subtaskCount || 0}</td>` : ''}
          ${hasTimeTracking ? `
            <td>${row.timeOriginalEstimateHours ?? ''}</td>
            <td>${row.timeSpentHours ?? ''}</td>
            <td>${row.timeRemainingEstimateHours ?? ''}</td>
            <td>${row.timeVarianceHours ?? ''}</td>
          ` : ''}
          ${hasSubtaskTimeTracking ? `
            <td>${row.subtaskTimeOriginalEstimateHours ?? ''}</td>
            <td>${row.subtaskTimeSpentHours ?? ''}</td>
            <td>${row.subtaskTimeRemainingEstimateHours ?? ''}</td>
            <td>${row.subtaskTimeVarianceHours ?? ''}</td>
          ` : ''}
          ${meta?.discoveredFields?.storyPointsFieldId ? `<td>${escapeHtml(row.storyPoints || '')}</td>` : ''}
          ${meta?.discoveredFields?.epicLinkFieldId ? `
            <td>${escapeHtml(row.epicKey || '')}</td>
            <td>${escapeHtml(row.epicTitle || '')}</td>
            <td${epicSummaryTitle ? ` title="${escapeHtml(epicSummaryTitle)}"` : ''}>${escapeHtml(epicSummaryDisplay || '')}</td>
          ` : ''}
        </tr>
      `;
    }
    
    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
  
  html += '</div>';
  content.innerHTML = html;

  // Render totals
  const uniqueSprints = new Set(rows.map(r => r.sprintId)).size;
  let totalSP = 0;
  if (meta?.discoveredFields?.storyPointsFieldId) {
    totalSP = rows.reduce((sum, r) => sum + (parseFloat(r.storyPoints) || 0), 0);
  }
  const totalEstimateHours = hasTimeTracking
    ? rows.reduce((sum, r) => sum + (Number(r.timeOriginalEstimateHours) || 0), 0)
    : 0;
  const totalSpentHours = hasTimeTracking
    ? rows.reduce((sum, r) => sum + (Number(r.timeSpentHours) || 0), 0)
    : 0;
  const totalVarianceHours = hasTimeTracking
    ? rows.reduce((sum, r) => sum + (Number(r.timeVarianceHours) || 0), 0)
    : 0;
  const totalSubtaskEstimateHours = hasSubtaskTimeTracking
    ? rows.reduce((sum, r) => sum + (Number(r.subtaskTimeOriginalEstimateHours) || 0), 0)
    : 0;
  const totalSubtaskSpentHours = hasSubtaskTimeTracking
    ? rows.reduce((sum, r) => sum + (Number(r.subtaskTimeSpentHours) || 0), 0)
    : 0;
  const totalSubtaskVarianceHours = hasSubtaskTimeTracking
    ? rows.reduce((sum, r) => sum + (Number(r.subtaskTimeVarianceHours) || 0), 0)
    : 0;
  const ebmFilledCount = rows.reduce((count, row) => {
    const hasEbm =
      row.ebmTeam ||
      row.ebmProductArea ||
      row.ebmCustomerSegments ||
      row.ebmValue ||
      row.ebmImpact ||
      row.ebmSatisfaction ||
      row.ebmSentiment ||
      row.ebmSeverity ||
      row.ebmSource ||
      row.ebmWorkCategory ||
      row.ebmGoals ||
      row.ebmTheme ||
      row.ebmRoadmap ||
      row.ebmFocusAreas ||
      row.ebmDeliveryStatus ||
      row.ebmDeliveryProgress;
    return count + (hasEbm ? 1 : 0);
  }, 0);

  totalsBar.innerHTML = `
    <div class="totals">
      <strong>Total Rows:</strong> ${rows.length} | 
      <strong>Unique Sprints:</strong> ${uniqueSprints}
      ${meta?.discoveredFields?.storyPointsFieldId ? ` | <strong>Total SP:</strong> ${totalSP}` : ''}
      ${hasTimeTracking ? ` | <strong>Est Hrs:</strong> ${totalEstimateHours.toFixed(2)} | <strong>Spent Hrs:</strong> ${totalSpentHours.toFixed(2)} | <strong>Variance Hrs:</strong> ${totalVarianceHours.toFixed(2)}` : ''}
      ${hasSubtaskTimeTracking ? ` | <strong>Subtask Est Hrs:</strong> ${totalSubtaskEstimateHours.toFixed(2)} | <strong>Subtask Spent Hrs:</strong> ${totalSubtaskSpentHours.toFixed(2)} | <strong>Subtask Variance Hrs:</strong> ${totalSubtaskVarianceHours.toFixed(2)}` : ''}
      ${ebmFilledCount > 0 ? ` | <strong>EBM Rows:</strong> ${ebmFilledCount}` : ''}
    </div>
  `;

  // Render project pills
  const projectPills = document.getElementById('project-pills');
  const projects = [...new Set(rows.map(r => r.projectKey))];
  projectPills.innerHTML = projects.map(p => 
    `<span class="pill active" data-project="${escapeHtml(p)}">${escapeHtml(p)}</span>`
  ).join('');

  // Add pill click handlers
  projectPills.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      pill.classList.toggle('active');
      applyFilters();
    });
  });
}

// Toggle sprint group
window.toggleSprint = function(sprintKey) {
  const content = document.getElementById(sprintKey);
  const header = content.previousElementSibling;
  const icon = header.querySelector('.toggle-icon');
  
  if (content.style.display === 'none') {
    content.style.display = 'block';
    icon.textContent = 'v';
  } else {
    content.style.display = 'none';
    icon.textContent = '>';
  }
};

// Unified filter helper: one pipeline for Boards, Sprints, and Done Stories
function applyTabFilter(allItems, searchText, activePills, config) {
  if (!allItems || !Array.isArray(allItems)) return [];
  const lower = (searchText || '').toLowerCase();
  const hasSearch = lower.length > 0;
  const hasPills = activePills && activePills.length > 0;
  return allItems.filter(item => {
    if (hasSearch && config.getSearchText) {
      const text = config.getSearchText(item);
      if (!text.toLowerCase().includes(lower)) return false;
    }
    if (hasPills && config.matchesPills && !config.matchesPills(item, activePills)) return false;
    return true;
  });
}

function applyBoardsFilters() {
  const searchText = document.getElementById('boards-search-box')?.value || '';
  const activePills = Array.from(document.querySelectorAll('#boards-project-pills .pill.active')).map(p => p.dataset.project);
  visibleBoardRows = applyTabFilter(previewData?.boards || [], searchText, activePills, {
    getSearchText: (b) => `${b.name || ''} ${b.id || ''}`,
    matchesPills: (b, pills) => !(b.projectKeys && b.projectKeys.length) || (b.projectKeys || []).some(p => pills.includes(p)),
  });
  renderProjectEpicLevelTab(visibleBoardRows, previewData?.metrics);
  updateExportFilteredState();
}

function applySprintsFilters() {
  const searchText = document.getElementById('sprints-search-box')?.value || '';
  const activePills = Array.from(document.querySelectorAll('#sprints-project-pills .pill.active')).map(p => p.dataset.project);
  const filtered = applyTabFilter(previewData?.sprintsIncluded || [], searchText, activePills, {
    getSearchText: (s) => s.name || '',
    matchesPills: (s, pills) => !(s.projectKeys && s.projectKeys.length) || (s.projectKeys || []).some(p => pills.includes(p)),
  });
  visibleSprintRows = sortSprintsLatestFirst(filtered);
  renderSprintsTab(visibleSprintRows, previewData?.metrics);
  updateExportFilteredState();
}

function populateBoardsPills() {
  const container = document.getElementById('boards-project-pills');
  if (!container) return;
  const meta = getSafeMeta(previewData);
  const projects = meta?.selectedProjects || [];
  container.innerHTML = projects.map(p => `<span class="pill active" data-project="${escapeHtml(p)}">${escapeHtml(p)}</span>`).join('');
  container.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      pill.classList.toggle('active');
      applyBoardsFilters();
    });
  });
}

function populateSprintsPills() {
  const container = document.getElementById('sprints-project-pills');
  if (!container) return;
  const meta = getSafeMeta(previewData);
  const projects = meta?.selectedProjects || [];
  container.innerHTML = projects.map(p => `<span class="pill active" data-project="${escapeHtml(p)}">${escapeHtml(p)}</span>`).join('');
  container.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      pill.classList.toggle('active');
      applySprintsFilters();
    });
  });
}

// Search and filter
const searchBox = document.getElementById('search-box');
searchBox.addEventListener('input', applyFilters);

const boardsSearchBox = document.getElementById('boards-search-box');
if (boardsSearchBox) boardsSearchBox.addEventListener('input', applyBoardsFilters);
const sprintsSearchBox = document.getElementById('sprints-search-box');
if (sprintsSearchBox) sprintsSearchBox.addEventListener('input', applySprintsFilters);

function applyFilters() {
  const searchText = (searchBox.value || '').toLowerCase();
  const activeProjects = Array.from(document.querySelectorAll('#project-pills .pill.active')).map(p => p.dataset.project);
  const meta = getSafeMeta(previewData);

  visibleRows = applyTabFilter(previewRows, searchText, activeProjects, {
    getSearchText: (row) => `${row.issueKey || ''} ${row.issueSummary || ''}`,
    matchesPills: (row, pills) => pills.length === 0 || pills.includes(row.projectKey),
  });

  renderDoneStoriesTab(visibleRows);

  updateExportFilteredState();
  const exportHint = document.getElementById('export-hint');
  if (exportHint) {
    if (previewRows.length > 0 && visibleRows.length === 0) {
      exportHint.innerHTML = `
        <small>No rows match the current filters. Adjust search or project filters to enable filtered export. The main Excel export still uses all preview rows.</small>
      `;
    } else if (meta?.partial) {
      exportHint.innerHTML = `
        <small>Note: Preview is partial; CSV exports will only contain currently loaded data.</small>
      `;
    } else if (previewRows.length > 0) {
      exportHint.innerHTML = '';
    }
  }
}

// Export functions: primary = Excel full; dropdown = full / CSV filtered / Excel filtered
function getCurrentTabId() {
  return document.querySelector('.tab-btn.active')?.dataset?.tab || 'project-epic-level';
}

function getVisibleCountForTab(tabId) {
  if (tabId === 'project-epic-level') return visibleBoardRows.length;
  if (tabId === 'sprints') return visibleSprintRows.length;
  if (tabId === 'done-stories') return visibleRows.length;
  return 0;
}

function updateExportFilteredState() {
  const tabId = getCurrentTabId();
  const count = getVisibleCountForTab(tabId);
  const csvFiltered = document.querySelector('.export-dropdown-item[data-export="csv-filtered"]');
  const excelFiltered = document.querySelector('.export-dropdown-item[data-export="excel-filtered"]');
  if (csvFiltered) csvFiltered.disabled = count === 0;
  if (excelFiltered) excelFiltered.disabled = count === 0;
}

exportExcelBtn.addEventListener('click', () => exportToExcel());

if (exportDropdownTrigger && exportDropdownMenu) {
  function openExportMenu() {
    if (exportDropdownTrigger.disabled) return;
    exportDropdownMenu.setAttribute('aria-hidden', 'false');
    exportDropdownTrigger.setAttribute('aria-expanded', 'true');
    const firstItem = exportDropdownMenu.querySelector('.export-dropdown-item:not([disabled])');
    if (firstItem) firstItem.focus();
  }
  function closeExportMenu() {
    exportDropdownMenu.setAttribute('aria-hidden', 'true');
    exportDropdownTrigger.setAttribute('aria-expanded', 'false');
    exportDropdownTrigger.focus();
  }
  exportDropdownTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = exportDropdownMenu.getAttribute('aria-hidden') !== 'false';
    if (open) openExportMenu();
    else closeExportMenu();
  });
  exportDropdownTrigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openExportMenu();
    }
  });
  document.addEventListener('click', () => {
    if (exportDropdownMenu.getAttribute('aria-hidden') !== 'false') return;
    closeExportMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && exportDropdownMenu.getAttribute('aria-hidden') === 'false') {
      e.preventDefault();
      closeExportMenu();
    }
  });
  const menuItems = () => Array.from(exportDropdownMenu.querySelectorAll('.export-dropdown-item:not([disabled])'));
  exportDropdownMenu.addEventListener('keydown', (e) => {
    const items = menuItems();
    if (items.length === 0) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeExportMenu();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const i = items.indexOf(e.target);
      const next = i < items.length ? 1 - items[i + 1] : items[0];
      if (next) next.focus();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const i = items.indexOf(e.target);
      const prev = i > 0 ? items[i - 1] : items[items.length - 1];
      if (prev) prev.focus();
      return;
    }
    if (e.key === 'Tab' && items.indexOf(e.target) >= 0) {
      if (e.shiftKey && e.target === items[0]) {
        e.preventDefault();
        closeExportMenu();
      } else if (!e.shiftKey && e.target === items[items.length - 1]) {
        e.preventDefault();
        closeExportMenu();
      }
    }
  });
  exportDropdownMenu.addEventListener('click', (e) => e.stopPropagation());
}

document.querySelectorAll('.export-dropdown-item').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const action = e.target.dataset.export;
    exportDropdownMenu.setAttribute('aria-hidden', 'true');
    exportDropdownTrigger.setAttribute('aria-expanded', 'false');
    if (action === 'excel-full') exportToExcel();
    else if (action === 'csv-filtered') {
      const tabId = getCurrentTabId();
      if (tabId === 'done-stories') exportCSV(visibleRows, 'filtered');
      else if (tabId === 'project-epic-level') exportSectionCSV('project-epic-level', visibleBoardRows, null);
      else if (tabId === 'sprints') exportSectionCSV('sprints', visibleSprintRows, null);
    } else if (action === 'excel-filtered') exportToExcelFiltered();
  });
});

function setExportButtonLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.dataset.exportOriginalText = btn.textContent;
    btn.dataset.exportOriginalDisabled = btn.disabled;
    btn.disabled = true;
    btn.textContent = 'Exporting??-';
  } else {
    btn.disabled = btn.dataset.exportOriginalDisabled === 'true';
    btn.textContent = btn.dataset.exportOriginalText || 'Export CSV';
    delete btn.dataset.exportOriginalText;
    delete btn.dataset.exportOriginalDisabled;
  }
}

// Validate CSV columns before export
function validateCSVColumns(columns, rows) {
  // Check critical columns exist
  const requiredColumns = ['issueKey', 'issueType', 'issueStatus'];
  for (const reqCol of requiredColumns) {
    if (!columns.includes(reqCol)) {
      throw new Error(`Missing required CSV column: ${reqCol}`);
    }
  }
  
  // Column count validation (mismatch is acceptable, just ensure required columns exist)
}

async function exportCSV(rows, type) {
  if (!previewData) {
    errorEl.style.display = 'block';
    errorEl.innerHTML = `
      <strong>Export error:</strong> No preview data available.
      <br><small>Run a preview first, then try exporting.</small>
    `;
    return;
  }
  if (rows.length === 0) {
    errorEl.style.display = 'block';
    errorEl.innerHTML = `
      <strong>Export error:</strong> No data to export for the current ${escapeHtml(type === 'filtered' ? 'filtered view' : 'preview')}.
      <br><small>Adjust your filters or run a new preview that returns at least one row, then try exporting again.</small>
    `;
    return;
  }

  // Validate columns before export
  try {
    validateCSVColumns(CSV_COLUMNS, rows);
  } catch (error) {
    errorEl.style.display = 'block';
    errorEl.innerHTML = `
      <strong>Export error:</strong> ${escapeHtml(error.message)}
      <br><small>CSV export validation failed. Please refresh the page and try again.</small>
    `;
    return;
  }

  const meta = getSafeMeta(previewData);
  const dateRange = await getDateRangeLabel(meta?.windowStart || '', meta?.windowEnd || '');
  const filename = buildCsvFilename('voda-agile-board', meta, type, dateRange);

  // Bonus Edge Case 2: Handle very large CSV exports (>10MB) gracefully
  const estimatedSize = JSON.stringify(rows).length; // Rough estimate
  const maxClientSize = 10 * 1024 * 1024; // 10MB threshold
  
  if (rows.length <= 5000 && estimatedSize < maxClientSize) {
    // Client-side generation for smaller datasets
    const csv = generateCSVClient(CSV_COLUMNS, rows);
    downloadCSV(csv, filename);
  } else {
    // Server-side streaming for large datasets
    try {
      const response = await fetch('/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns: CSV_COLUMNS, rows }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Export failed: ${errorText}`);
      }

      const blob = await response.blob();
      
      // Check blob size for very large files
      if (blob.size > 50 * 1024 * 1024) { // >50MB
        errorEl.style.display = 'block';
        errorEl.innerHTML = `
          <strong>Export warning:</strong> CSV file is very large (${(blob.size / 1024 / 1024).toFixed(1)}MB).
          <br><small>Your browser may have difficulty opening this file. Consider filtering the data or using a smaller date range.</small>
        `;
      }
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
      
      // Show success feedback
      const successMsg = document.createElement('div');
      successMsg.className = 'export-success';
      successMsg.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #4caf50; color: white; padding: 12px 20px; border-radius: 4px; z-index: 10000; box-shadow: 0 2px 8px rgba(0,0,0,0.2);';
      successMsg.textContent = `??- CSV exported: ${filename} (${(blob.size / 1024).toFixed(0)}KB)`;
      document.body.appendChild(successMsg);
      setTimeout(() => {
        if (successMsg.parentNode) {
          successMsg.parentNode.removeChild(successMsg);
        }
      }, 3000);
    } catch (error) {
      errorEl.style.display = 'block';
      errorEl.innerHTML = `
        <strong>Export error:</strong> ${escapeHtml(error.message)}
        <br><small>If this problem persists, verify the server is running and reachable, then try again.</small>
        <br><small>For very large datasets, try filtering the data or using a smaller date range.</small>
      `;
    }
  }
}

function downloadCSV(csv, filename) {
  try {
    // Bonus Edge Case 1: Handle browser download blocking
    // Some browsers block downloads not initiated by user interaction
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    
    // Trigger download
    a.click();
    
    // Cleanup after a short delay to ensure download starts
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
    
    // Show success feedback (brief, non-intrusive)
    const successMsg = document.createElement('div');
    successMsg.className = 'export-success';
    successMsg.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #4caf50; color: white; padding: 12px 20px; border-radius: 4px; z-index: 10000; box-shadow: 0 2px 8px rgba(0,0,0,0.2);';
    successMsg.textContent = `??- CSV exported: ${filename}`;
    document.body.appendChild(successMsg);
    setTimeout(() => {
      if (successMsg.parentNode) {
        successMsg.parentNode.removeChild(successMsg);
      }
    }, 3000);
  } catch (error) {
    // Handle download blocking or other errors
    errorEl.style.display = 'block';
    errorEl.innerHTML = `
      <strong>Export error:</strong> Unable to download CSV file.
      <br><small>Your browser may be blocking downloads. Please check your browser settings or try clicking the export button again.</small>
      <br><small>Error: ${escapeHtml(error.message)}</small>
    `;
  }
}

// Business-friendly column name mapping (must match lib/columnMapping.js)
const BUSINESS_COLUMN_NAMES = {
  'projectKey': 'Project',
  'boardId': 'Board ID',
  'boardName': 'Board Name',
  'sprintId': 'Sprint ID',
  'sprintName': 'Sprint Name',
  'sprintState': 'Sprint State',
  'sprintStartDate': 'Sprint Start Date',
  'sprintEndDate': 'Sprint End Date',
  'issueKey': 'Ticket ID',
  'issueSummary': 'Ticket Summary',
  'issueStatus': 'Status',
  'issueType': 'Issue Type',
  'issueStatusCategory': 'Status Category',
  'issuePriority': 'Priority',
  'issueLabels': 'Labels',
  'issueComponents': 'Components',
  'issueFixVersions': 'Fix Versions',
  'assigneeDisplayName': 'Assignee',
  'created': 'Created Date',
  'updated': 'Updated Date',
  'resolutionDate': 'Completed Date',
  'subtaskCount': 'Subtasks Count',
  'timeOriginalEstimateHours': 'Original Estimate (Hours)',
  'timeRemainingEstimateHours': 'Remaining Estimate (Hours)',
  'timeSpentHours': 'Time Spent (Hours)',
  'timeVarianceHours': 'Estimate Variance (Hours)',
  'subtaskTimeOriginalEstimateHours': 'Subtask Original Estimate (Hours)',
  'subtaskTimeRemainingEstimateHours': 'Subtask Remaining Estimate (Hours)',
  'subtaskTimeSpentHours': 'Subtask Time Spent (Hours)',
  'subtaskTimeVarianceHours': 'Subtask Estimate Variance (Hours)',
  'ebmTeam': 'EBM Team',
  'ebmProductArea': 'EBM Product Area',
  'ebmCustomerSegments': 'EBM Customer Segments',
  'ebmValue': 'EBM Value',
  'ebmImpact': 'EBM Impact',
  'ebmSatisfaction': 'EBM Satisfaction',
  'ebmSentiment': 'EBM Sentiment',
  'ebmSeverity': 'EBM Severity',
  'ebmSource': 'EBM Source',
  'ebmWorkCategory': 'EBM Work Category',
  'ebmGoals': 'EBM Goals',
  'ebmTheme': 'EBM Theme',
  'ebmRoadmap': 'EBM Roadmap',
  'ebmFocusAreas': 'EBM Focus Areas',
  'ebmDeliveryStatus': 'EBM Delivery Status',
  'ebmDeliveryProgress': 'EBM Delivery Progress',
  'storyPoints': 'Story Points',
  'epicKey': 'Epic ID',
  'epicTitle': 'Epic Name',
  'epicSummary': 'Epic Summary',
};

// Validate Excel workbook data structure before sending to server
function validateExcelWorkbookData(workbookData) {
  if (!workbookData || typeof workbookData !== 'object') {
    return { valid: false, error: 'Workbook data is missing or invalid' };
  }

  if (!Array.isArray(workbookData.sheets)) {
    return { valid: false, error: 'Workbook data must contain a sheets array' };
  }

  if (workbookData.sheets.length === 0) {
    return { valid: false, error: 'Workbook must contain at least one sheet' };
  }

  for (let i = 0; i < workbookData.sheets.length; i++) {
    const sheet = workbookData.sheets[i];
    
    if (!sheet || typeof sheet !== 'object') {
      return { valid: false, error: `Sheet ${i + 1} is missing or invalid` };
    }

    if (!sheet.name || typeof sheet.name !== 'string') {
      return { valid: false, error: `Sheet ${i + 1} is missing a valid name` };
    }

    // Validate sheet name length (Excel limit: 31 characters)
    if (sheet.name.length > 31) {
      return { valid: false, error: `Sheet "${sheet.name}" name exceeds 31 characters (Excel limit)` };
    }

    // Validate sheet name doesn't contain invalid characters
    const invalidChars = /[\[\]:*\/\\?]/;
    if (invalidChars.test(sheet.name)) {
      return { valid: false, error: `Sheet "${sheet.name}" contains invalid characters: [ ] : ? * / \\` };
    }

    if (!Array.isArray(sheet.columns)) {
      return { valid: false, error: `Sheet "${sheet.name}" must have a columns array` };
    }

    if (sheet.columns.length === 0) {
      return { valid: false, error: `Sheet "${sheet.name}" must have at least one column` };
    }

    if (!Array.isArray(sheet.rows)) {
      return { valid: false, error: `Sheet "${sheet.name}" must have a rows array` };
    }

    // Validate row structure matches columns (if rows exist)
    if (sheet.rows.length > 0) {
      for (let j = 0; j < sheet.rows.length; j++) {
        const row = sheet.rows[j];
        if (!row || typeof row !== 'object') {
          return { valid: false, error: `Sheet "${sheet.name}", row ${j + 1} is invalid` };
        }

        // Check that row has all required column keys
        for (const col of sheet.columns) {
          if (!(col in row)) {
            // Missing key is acceptable (will be empty), but log for debugging
            // Don't fail validation for missing keys, Excel will handle as empty
          }
        }
      }
    }
  }

  return { valid: true, error: null };
}

// Prepare Stories sheet data with business-friendly columns and KPI columns
function prepareStoriesSheetData(rows, metrics) {
  const columns = [
    ...CSV_COLUMNS.map(col => BUSINESS_COLUMN_NAMES[col] || col),
    'Work Days to Complete',
    'Sprint Duration (Work Days)',
    'Cycle Time (Days)',
    'Days Since Created',
    'Epic ID (Manual)',
    'Epic Name (Manual)',
    'Is Rework (Manual)',
    'Is Bug (Manual)',
    'Team Notes'
  ];

  const sheetRows = rows.map(row => {
    const businessRow = {};
    
    // Map technical columns to business names
    CSV_COLUMNS.forEach(techCol => {
      const businessCol = BUSINESS_COLUMN_NAMES[techCol] || techCol;
      businessRow[businessCol] = row[techCol] || '';
    });

    // Calculate KPI columns
    const created = row.created ? new Date(row.created) : null;
    const resolved = row.resolutionDate ? new Date(row.resolutionDate) : null;
    const sprintStart = row.sprintStartDate ? new Date(row.sprintStartDate) : null;
    const sprintEnd = row.sprintEndDate ? new Date(row.sprintEndDate) : null;
    const today = new Date();

    // Work Days to Complete
    if (created && resolved) {
      businessRow['Work Days to Complete'] = calculateWorkDaysBetween(created, resolved);
    } else {
      businessRow['Work Days to Complete'] = '';
    }

    // Sprint Duration (Work Days)
    if (sprintStart && sprintEnd) {
      businessRow['Sprint Duration (Work Days)'] = calculateWorkDaysBetween(sprintStart, sprintEnd);
    } else {
      businessRow['Sprint Duration (Work Days)'] = '';
    }

    // Cycle Time (Days)
    businessRow['Cycle Time (Days)'] = businessRow['Work Days to Complete'];

    // Days Since Created
    if (created) {
      businessRow['Days Since Created'] = calculateWorkDaysBetween(created, today);
    } else {
      businessRow['Days Since Created'] = '';
    }

    // Manual enrichment columns (empty, ready for team input)
    businessRow['Epic ID (Manual)'] = '';
    businessRow['Epic Name (Manual)'] = '';
    businessRow['Is Rework (Manual)'] = '';
    businessRow['Is Bug (Manual)'] = '';
    businessRow['Team Notes'] = '';

    return businessRow;
  });

  return { columns, rows: sheetRows };
}

// Prepare Boards sheet data (uses computeBoardRowFromSummary SSOT)
function prepareBoardsSheetData(boards, sprintsIncluded, rows, meta, predictabilityPerSprint = null) {
  const boardSummaries = buildBoardSummaries(boards, sprintsIncluded, rows, meta, predictabilityPerSprint);
  const hasPredictability = !!predictabilityPerSprint && Object.keys(predictabilityPerSprint).length > 0;
  const spEnabled = !!meta?.discoveredFields?.storyPointsFieldId;
  const defaultSummary = {
    sprintCount: 0, doneStories: 0, doneSP: 0, committedSP: 0, deliveredSP: 0,
    earliestStart: null, latestEnd: null, totalSprintDays: 0, validSprintDaysCount: 0,
    doneBySprintEnd: 0, sprintSpValues: [], epicStories: 0, nonEpicStories: 0, epicSP: 0, nonEpicSP: 0,
    assignees: new Set(), nonEpicAssignees: new Set(), assigneeStoryCounts: new Map(), assigneeSpTotals: new Map(),
  };
  let rowsData = (boards || []).map(board => {
    const summary = boardSummaries.get(board.id) || defaultSummary;
    return computeBoardRowFromSummary(board, summary, meta, spEnabled, hasPredictability);
  });
  if (rowsData.length === 0) {
    const placeholder = {};
    for (const key of BOARD_TABLE_COLUMN_ORDER) {
      placeholder[key] = key === 'Board ID'
        ? 'No board data available'
        : (key === 'Board' ? 'Try adjusting date range or project selection' : '');
    }
    rowsData = [placeholder];
  }
  return { columns: [...BOARD_TABLE_COLUMN_ORDER], rows: rowsData };
}

// Prepare Sprints sheet data
function prepareSprintsSheetData(sprintsIncluded, rows, predictabilityPerSprint = null) {
  const timeTotals = computeSprintTimeTotals(rows);
  const hasTimeTracking = Array.from(timeTotals.values()).some(total =>
    total.estimateHours || total.spentHours || total.remainingHours || total.varianceHours
  );
  const columns = [
    'Sprint ID',
    'Sprint Name',
    'Board Name',
    'Sprint Start Date',
    'Sprint End Date',
    'State',
    'Projects',
    'Stories Completed (Total)',
    'Completed Within Sprint End Date',
    'Total SP'
  ];

  const predictabilityMap = new Map();
  if (predictabilityPerSprint) {
    for (const data of Object.values(predictabilityPerSprint)) {
      if (data?.sprintId) {
        predictabilityMap.set(data.sprintId, data);
      }
    }
  }
  const hasPredictability = predictabilityMap.size > 0;
  if (hasPredictability) {
    columns.push('Committed SP', 'Delivered SP', 'SP Estimation %');
  }

  if (hasTimeTracking) {
    columns.push('Est Hrs', 'Spent Hrs', 'Remaining Hrs', 'Variance Hrs');
  }
  
  let rowsData = (sprintsIncluded || []).map(sprint => {
    const timeData = timeTotals.get(sprint.id) || {
      estimateHours: 0,
      spentHours: 0,
      remainingHours: 0,
      varianceHours: 0,
    };
    const predictData = predictabilityMap.get(sprint.id);
    const committedSP = predictData ? predictData.committedSP : null;
    const deliveredSP = predictData ? predictData.deliveredSP : null;
    const estimationPct = committedSP > 0 ? (deliveredSP / committedSP) * 100 : null;
    const row = {
      'Sprint ID': sprint.id,
      'Sprint Name': sprint.name,
      'Board Name': sprint.boardName || '',
      'Sprint Start Date': formatDateForDisplay(sprint.startDate) || '',
      'Sprint End Date': formatDateForDisplay(sprint.endDate) || '',
      'State': sprint.state || '',
      'Projects': (sprint.projectKeys || []).join(', '),
      'Stories Completed (Total)': sprint.doneStoriesNow || 0,
      'Completed Within Sprint End Date': sprint.doneStoriesBySprintEnd || 0,
      'Total SP': sprint.doneSP || 0
    };

    if (hasPredictability) {
      row['Committed SP'] = formatNumber(committedSP, 2);
      row['Delivered SP'] = formatNumber(deliveredSP, 2);
      row['SP Estimation %'] = formatPercent(estimationPct);
    }

    if (hasTimeTracking) {
      row['Est Hrs'] = timeData.estimateHours.toFixed(2);
      row['Spent Hrs'] = timeData.spentHours.toFixed(2);
      row['Remaining Hrs'] = timeData.remainingHours.toFixed(2);
      row['Variance Hrs'] = timeData.varianceHours.toFixed(2);
    }

    return row;
  });
  
  // Add placeholder row if Sprints sheet is empty
  if (rowsData.length === 0) {
    const placeholder = {
      'Sprint ID': 'No sprint data available',
      'Sprint Name': 'Try adjusting date range or project selection',
      'Board Name': '',
      'Sprint Start Date': '',
      'Sprint End Date': '',
      'State': '',
      'Projects': '',
      'Stories Completed (Total)': '',
      'Completed Within Sprint End Date': '',
      'Total SP': ''
    };
    if (hasPredictability) {
      placeholder['Committed SP'] = '';
      placeholder['Delivered SP'] = '';
      placeholder['SP Estimation %'] = '';
    }
    if (hasTimeTracking) {
      placeholder['Est Hrs'] = '';
      placeholder['Spent Hrs'] = '';
      placeholder['Remaining Hrs'] = '';
      placeholder['Variance Hrs'] = '';
    }
    rowsData = [placeholder];
  }

  return { columns, rows: rowsData };
}

// Prepare Epics sheet data (from Epic TTM metrics)
function prepareEpicsSheetData(metrics, rows) {
  const columns = ['Epic ID', 'Epic Name', 'Story Keys', 'Story Count', 'Start Date', 'End Date', 'Calendar TTM (days)', 'Working TTM (days)'];
  
  const combined = [...(metrics?.epicTTM || []), ...buildEpicAdhocRows(rows)];
  let rowsData = combined.map(epic => ({
    'Epic ID': epic.epicKey,
    'Epic Name': epic.epicTitle || '',
    'Story Keys': Array.isArray(epic.storyItems) ? epic.storyItems.map(item => item.issueKey).filter(Boolean).join(', ') : '',
    'Story Count': epic.storyCount || 0,
    'Start Date': formatDateForDisplay(epic.startDate) || '',
    'End Date': formatDateForDisplay(epic.endDate) || '',
    'Calendar TTM (days)': epic.calendarTTMdays || '',
    'Working TTM (days)': epic.workingTTMdays || ''
  }));
  
  // Add placeholder row if Epics sheet is empty
  if (rowsData.length === 0) {
    rowsData = [{
      'Epic ID': 'No Epic TTM data available',
      'Epic Name': '',
      'Story Keys': '',
      'Story Count': '',
      'Start Date': 'Epic TTM is always enabled. No Epic data found for selected date range.',
      'End Date': '',
      'Calendar TTM (days)': '',
      'Working TTM (days)': ''
    }];
  }

  return { columns, rows: rowsData };
}

// Prepare Metadata sheet data
function prepareMetadataSheetData(meta, rows, sprints) {
  const columns = ['Field', 'Value'];
  const sheetRows = [
    { 'Field': 'Export Date', 'Value': formatDateForDisplay(new Date()) },
    { 'Field': 'Export Time', 'Value': formatDateForDisplay(new Date()) },
    { 'Field': 'Date Range Start', 'Value': formatDateForDisplay(meta.windowStart) },
    { 'Field': 'Date Range End', 'Value': formatDateForDisplay(meta.windowEnd) },
    { 'Field': 'Projects', 'Value': (meta.selectedProjects || []).join(', ') },
    { 'Field': 'Total Stories', 'Value': rows.length },
    { 'Field': 'Total Sprints', 'Value': (sprints || []).length },
    { 'Field': 'Data Freshness', 'Value': meta.fromCache ? `Cached (${meta.cacheAgeMinutes} minutes old)` : 'Fresh' }
  ];

  if (meta.fieldInventory) {
    sheetRows.push(
      { 'Field': 'Available Field Count', 'Value': meta.fieldInventory.availableFieldCount || 0 },
      { 'Field': 'Custom Field Count', 'Value': meta.fieldInventory.customFieldCount || 0 },
      { 'Field': 'EBM Fields Found', 'Value': (meta.fieldInventory.ebmFieldsFound || []).map(e => e.candidate).join(', ') },
      { 'Field': 'EBM Fields Missing', 'Value': (meta.fieldInventory.ebmFieldsMissing || []).join(', ') }
    );
  }

  return { columns, rows: sheetRows };
}

// Excel export function
async function exportToExcel() {
  if (!previewData || !previewRows || previewRows.length === 0) {
    errorEl.style.display = 'block';
    errorEl.innerHTML = `
      <strong>Export error:</strong> No data to export.
      <br><small>Please generate a preview first.</small>
    `;
    return;
  }

  // Store original button state
  const originalButtonText = exportExcelBtn.textContent;
  const originalButtonDisabled = exportExcelBtn.disabled;

  // Set loading state
  exportExcelBtn.disabled = true;
  exportExcelBtn.textContent = 'Generating Excel...';

  try {
    // Normalize meta up front to avoid runtime errors and keep exports honest.
    const meta = getSafeMeta(previewData);
    if (!meta) {
      errorEl.style.display = 'block';
      errorEl.innerHTML = `
        <strong>Export error:</strong> Preview metadata is missing or invalid.
        <br><small>Please generate a new preview and try exporting again. If this keeps happening, contact an administrator.</small>
      `;
      return;
    }

    // Prepare all sheet data using extracted functions
    const storiesSheet = prepareStoriesSheetData(previewRows, previewData.metrics);
    const boardsSheet = prepareBoardsSheetData(
      previewData.boards,
      previewData.sprintsIncluded,
      previewRows,
      meta,
      previewData?.metrics?.predictability?.perSprint || null
    );
    const sprintsSheet = prepareSprintsSheetData(
      previewData.sprintsIncluded,
      previewRows,
      previewData?.metrics?.predictability?.perSprint || null
    );
    const epicsSheet = prepareEpicsSheetData(previewData.metrics, previewRows);
    const metadataSheet = prepareMetadataSheetData(meta, previewRows, previewData.sprintsIncluded);
    
    // Prepare Summary sheet data
    const summaryColumns = ['Section', 'Metric', 'Value'];
    const summaryRows = createSummarySheetRows(previewData.metrics, meta, previewRows);

    // Build workbook data from prepared sheets
    const workbookData = {
      sheets: [
        { name: 'Summary', columns: summaryColumns, rows: summaryRows },
        { name: 'Boards', columns: boardsSheet.columns, rows: boardsSheet.rows },
        { name: 'Stories', columns: storiesSheet.columns, rows: storiesSheet.rows },
        { name: 'Sprints', columns: sprintsSheet.columns, rows: sprintsSheet.rows },
        { name: 'Epics', columns: epicsSheet.columns, rows: epicsSheet.rows },
        { name: 'Metadata', columns: metadataSheet.columns, rows: metadataSheet.rows }
      ]
    };

    // Validate workbook data before sending to server
    const validation = validateExcelWorkbookData(workbookData);
    if (!validation.valid) {
      errorEl.style.display = 'block';
      errorEl.innerHTML = `
        <strong>Export error:</strong> ${validation.error}
        <br><small>Please refresh the page and try again.</small>
      `;
      return;
    }

    // Estimate file size and warn if large
    const estimatedSize = JSON.stringify(workbookData).length * 1.5;
    const maxFileSize = 50 * 1024 * 1024; // 50MB
    if (estimatedSize > maxFileSize) {
      const sizeMB = (estimatedSize / 1024 / 1024).toFixed(1);
      const proceed = confirm(
        `Excel file will be large (~${sizeMB} MB). Your browser or Excel may have difficulty opening it. ` +
        `Consider filtering the data or using a smaller date range. Continue anyway-`
      );
      if (!proceed) {
        return; // User cancelled, restore button state in finally block
      }
    }

    // Send to server for Excel generation
    const response = await fetch('/export-excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workbookData, meta })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      
      // Provide specific error messages based on status code
      let errorMessage = 'Excel export failed.';
      if (response.status === 400) {
        errorMessage = 'Invalid data structure. Please refresh the page and try exporting again.';
      } else if (response.status === 500) {
        errorMessage = 'Server error during Excel generation. Check server logs or try again later.';
      } else if (response.status === 0 || errorText.includes('Failed to fetch')) {
        errorMessage = 'Unable to connect to server. Verify server is running and try again.';
      } else {
        errorMessage = `Excel export failed: ${errorText}`;
      }
      
      throw new Error(errorMessage);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Generate filename
    const projects = (meta.selectedProjects || []).join('-');
    const dateRange = await getDateRangeLabel(meta.windowStart, meta.windowEnd);
    const exportDate = new Date().toISOString().split('T')[0];
    a.download = `${projects}_${dateRange}_Sprint-Report_${exportDate}.xlsx`;
    
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);

    // Show success feedback
    const successMsg = document.createElement('div');
    successMsg.className = 'export-success';
    successMsg.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #4caf50; color: white; padding: 12px 20px; border-radius: 4px; z-index: 10000; box-shadow: 0 2px 8px rgba(0,0,0,0.2);';
    successMsg.textContent = `??- Excel exported: ${a.download} (${(blob.size / 1024).toFixed(0)}KB)`;
    document.body.appendChild(successMsg);
    setTimeout(() => {
      if (successMsg.parentNode) {
        successMsg.parentNode.removeChild(successMsg);
      }
    }, 3000);

  } catch (error) {
    errorEl.style.display = 'block';
    
    // Enhanced error messages based on error type
    let errorMessage = error.message;
    let helpfulHint = '';
    
    if (error.message.includes('Unable to connect') || error.message.includes('Failed to fetch')) {
      errorMessage = 'Unable to connect to server.';
      helpfulHint = 'Verify server is running and try again.';
    } else if (error.message.includes('Invalid data structure')) {
      errorMessage = 'Invalid data structure.';
      helpfulHint = 'Please refresh the page and try exporting again.';
    } else if (error.message.includes('Server error')) {
      errorMessage = 'Server error during Excel generation.';
      helpfulHint = 'Check server logs or try again later.';
    } else if (error.message.includes('timeout') || error.message.includes('timed out')) {
      errorMessage = 'Export timed out.';
      helpfulHint = 'Try filtering data or using a smaller date range.';
    } else {
      helpfulHint = 'Please try again or contact support if the problem persists.';
    }
    
    errorEl.innerHTML = `
      <strong>Export error:</strong> ${errorMessage}
      <br><small>${helpfulHint}</small>
    `;
  } finally {
    // Restore button state
    exportExcelBtn.disabled = originalButtonDisabled;
    exportExcelBtn.textContent = originalButtonText;
  }
}

async function exportToExcelFiltered() {
  const tabId = getCurrentTabId();
  const count = getVisibleCountForTab(tabId);
  if (count === 0 || !previewData) {
    errorEl.style.display = 'block';
    errorEl.innerHTML = `
      <strong>Export error:</strong> No data to export for the current tab.
      <br><small>Adjust filters or switch to a tab that has visible rows.</small>
    `;
    return;
  }
  const originalButtonText = exportExcelBtn.textContent;
  const originalButtonDisabled = exportExcelBtn.disabled;
  exportExcelBtn.disabled = true;
  exportExcelBtn.textContent = 'Generating Excel (filtered)...';
  try {
    const meta = getSafeMeta(previewData);
    const predictabilityPerSprint = previewData?.metrics?.predictability?.perSprint || null;
    const summaryColumns = ['Section', 'Metric', 'Value'];
    const summaryRows = createSummarySheetRows(previewData.metrics, meta, previewRows);
    const metadataSheet = prepareMetadataSheetData(meta, previewRows, previewData.sprintsIncluded);
    let sheets = [
      { name: 'Summary', columns: summaryColumns, rows: summaryRows },
      { name: 'Metadata', columns: metadataSheet.columns, rows: metadataSheet.rows }
    ];
    if (tabId === 'project-epic-level') {
      const boardsSheet = prepareBoardsSheetData(visibleBoardRows, previewData.sprintsIncluded || [], previewRows, meta, predictabilityPerSprint);
      sheets.splice(1, 0, { name: 'Boards', columns: boardsSheet.columns, rows: boardsSheet.rows });
    } else if (tabId === 'sprints') {
      const sprintsSheet = prepareSprintsSheetData(visibleSprintRows, previewRows, predictabilityPerSprint);
      sheets.splice(1, 0, { name: 'Sprints', columns: sprintsSheet.columns, rows: sprintsSheet.rows });
    } else if (tabId === 'done-stories') {
      const storiesSheet = prepareStoriesSheetData(visibleRows, previewData.metrics);
      sheets.splice(1, 0, { name: 'Stories', columns: storiesSheet.columns, rows: storiesSheet.rows });
    }
    const workbookData = { sheets };
    const validation = validateExcelWorkbookData(workbookData);
    if (!validation.valid) {
      errorEl.style.display = 'block';
      errorEl.innerHTML = `<strong>Export error:</strong> ${validation.error}`;
      return;
    }
    const response = await fetch('/export-excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workbookData, meta })
    });
    if (!response.ok) throw new Error(await response.text().catch(() => 'Export failed'));
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const projects = (meta.selectedProjects || []).join('-');
    const dateRange = await getDateRangeLabel(meta.windowStart, meta.windowEnd);
    a.download = `${projects}_${dateRange}_Sprint-Report-filtered_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 100);
  } catch (error) {
    errorEl.style.display = 'block';
    errorEl.innerHTML = `<strong>Export error:</strong> ${error.message}`;
  } finally {
    exportExcelBtn.disabled = originalButtonDisabled;
    exportExcelBtn.textContent = originalButtonText;
  }
}

// Helper function to calculate work days between two dates
// NOTE: This function must match calculateWorkDays in lib/kpiCalculations.js exactly
// Browser code cannot import server modules, so both must be kept in sync manually
function calculateWorkDaysBetween(startDate, endDate) {
  if (!startDate || !endDate) return '';
  
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return '';
    }
    
    if (end < start) {
      return 0;
    }
    
    let count = 0;
    const current = new Date(start);
    
    while (current <= end) {
      const dayOfWeek = current.getDay();
      // Count only weekdays (Monday=1 to Friday=5)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    
    return count;
  } catch (error) {
    return '';
  }
}

// Helper function to create Summary sheet rows
function createSummarySheetRows(metrics, meta, allRows) {
  const rows = [];
  
  // Overview
  rows.push({ 'Section': 'Overview', 'Metric': 'Total Stories', 'Value': allRows.length || 0 });
  rows.push({ 'Section': 'Overview', 'Metric': 'Total Sprints', 'Value': meta.sprintCount || 0 });
  rows.push({ 'Section': 'Overview', 'Metric': 'Date Range', 'Value': `${formatDateForDisplay(meta.windowStart)} to ${formatDateForDisplay(meta.windowEnd)}` });
  rows.push({ 'Section': 'Overview', 'Metric': 'Projects', 'Value': (meta.selectedProjects || []).join(', ') });
  rows.push({ 'Section': '', 'Metric': '', 'Value': '' });
  
  // Key Metrics
  if (metrics && metrics.throughput) {
    const totalSP = Object.values(metrics.throughput.perProject || {}).reduce((sum, p) => sum + (p.totalSP || 0), 0);
    rows.push({ 'Section': 'Key Metrics', 'Metric': 'Total Story Points', 'Value': totalSP });
    rows.push({ 'Section': 'Key Metrics', 'Metric': 'Average SP per Sprint', 'Value': formatNumber(totalSP / (meta.sprintCount || 1)) });
  }
  
  if (metrics && metrics.rework) {
    rows.push({ 'Section': 'Key Metrics', 'Metric': 'Rework Ratio', 'Value': formatPercent(metrics.rework.reworkRatio) });
  }
  
  if (metrics && metrics.predictability) {
    const perSprint = metrics.predictability.perSprint || {};
    const avgPredictability = Object.values(perSprint).reduce((sum, s) => sum + (s.predictabilitySP || 0), 0) / Object.keys(perSprint).length || 0;
    rows.push({ 'Section': 'Key Metrics', 'Metric': 'Average Predictability', 'Value': formatPercent(avgPredictability) });
  }
  
  rows.push({ 'Section': '', 'Metric': '', 'Value': '' });
  
  // Data Quality
  const spEnabled = !!meta?.discoveredFields?.storyPointsFieldId;
  const epicEnabled = !!meta?.discoveredFields?.epicLinkFieldId;
  const missingEpicCount = epicEnabled ? allRows.filter(r => !r.epicKey).length : 'N/A';
  const missingSPCount = spEnabled ? allRows.filter(r => !r.storyPoints || r.storyPoints === 0).length : 'N/A';
  let qualityScore = null;
  if (allRows.length > 0 && (spEnabled || epicEnabled)) {
    const epicPenalty = epicEnabled
      ? (allRows.length ? (missingEpicCount / allRows.length) * 50 : 0)
      : 0;
    const spPenalty = spEnabled
      ? (allRows.length ? (missingSPCount / allRows.length) * 50 : 0)
      : 0;
    qualityScore = Math.max(0, 100 - epicPenalty - spPenalty);
  }
  
  rows.push({ 'Section': 'Data Quality', 'Metric': 'Missing Epic Count', 'Value': missingEpicCount });
  rows.push({ 'Section': 'Data Quality', 'Metric': 'Missing Story Points Count', 'Value': missingSPCount });
  rows.push({ 'Section': 'Data Quality', 'Metric': 'Data Quality Score', 'Value': qualityScore === null ? 'N/A' : formatPercent(qualityScore, 1) });
  rows.push({ 'Section': '', 'Metric': '', 'Value': '' });
  
  // Manual Enrichment Guide
  rows.push({ 'Section': 'Manual Enrichment', 'Metric': 'Epic ID (Manual)', 'Value': 'Fill in missing Epic IDs' });
  rows.push({ 'Section': 'Manual Enrichment', 'Metric': 'Epic Name (Manual)', 'Value': 'Fill in missing Epic Names' });
  rows.push({ 'Section': 'Manual Enrichment', 'Metric': 'Is Rework (Manual)', 'Value': 'Enter Y or N' });
  rows.push({ 'Section': 'Manual Enrichment', 'Metric': 'Is Bug (Manual)', 'Value': 'Enter Y or N' });
  rows.push({ 'Section': 'Manual Enrichment', 'Metric': 'Team Notes', 'Value': 'Add context or notes' });
  
  return rows;
}

// Per-section CSV export
async function exportSectionCSV(sectionName, data, button = null) {
  const meta = getSafeMeta(previewData);
  const dateRange = await getDateRangeLabel(meta?.windowStart || '', meta?.windowEnd || '');
  const filename = buildCsvFilename(sectionName, meta, '', dateRange);
  setExportButtonLoading(button, true);
  try {
    if (!previewData) {
      errorEl.style.display = 'block';
      errorEl.innerHTML = `
        <strong>Export error:</strong> No preview data available.
        <br><small>Run a preview first, then try exporting.</small>
      `;
      return;
    }

    if (!data || (Array.isArray(data) && data.length === 0) || (typeof data === 'object' && Object.keys(data).length === 0)) {
      errorEl.style.display = 'block';
      errorEl.innerHTML = `
        <strong>Export error:</strong> No data to export for ${escapeHtml(sectionName)} section.
        <br><small>This section has no data to export.</small>
      `;
      return;
    }

    let csv = '';
    let columns = [];
    let rows = [];

  // Prepare data based on section
  switch (sectionName) {
    case 'project-epic-level':
    case 'boards':
      // Combined boards summary export
      columns = [
        'id',
        'name',
        'type',
        'projectKeys',
        'includedSprints',
        'totalSprintDays',
        'avgSprintLengthDays',
        'doneStories',
        'doneSP',
        'committedSP',
        'deliveredSP',
        'spEstimationPercent',
        'storiesPerSprint',
        'spPerStory',
        'storiesPerSprintDay',
        'spPerSprintDay',
        'avgSpPerSprint',
        'spVariancePerSprint',
        'doneBySprintEndPercent',
        'totalEpics',
        'totalNonEpics',
        'activeAssignees',
        'storiesPerAssignee',
        'spPerAssignee',
        'assumedCapacityPersonDays',
        'assumedWastePercent',
        'sprintWindow',
        'latestSprintEnd',
      ];
      const predictabilityPerSprint = previewData?.metrics?.predictability?.perSprint || null;
      const hasPredictability = !!predictabilityPerSprint && Object.keys(predictabilityPerSprint).length > 0;
      const spEnabled = !!meta?.discoveredFields?.storyPointsFieldId;
      const boardSummaries = buildBoardSummaries(data || [], previewData?.sprintsIncluded || [], previewRows, getSafeMeta(previewData), predictabilityPerSprint);
      rows = (data || []).map(board => {
        const summary = boardSummaries.get(board.id) || { sprintCount: 0, doneStories: 0, doneSP: 0, committedSP: 0, deliveredSP: 0, earliestStart: null, latestEnd: null, totalSprintDays: 0, validSprintDaysCount: 0, doneBySprintEnd: 0, sprintSpValues: [], epicStories: 0, nonEpicStories: 0, epicSP: 0, nonEpicSP: 0, assignees: new Set() };
        const sprintWindow = summary.earliestStart && summary.latestEnd
          ? `${formatDateForDisplay(summary.earliestStart)} to ${formatDateForDisplay(summary.latestEnd)}`
          : '';
        const totalSprintDays = summary.totalSprintDays || 0;
        const avgSprintLength = summary.validSprintDaysCount > 0
          ? totalSprintDays / summary.validSprintDaysCount
          : null;
        const spVariancePerSprint = spEnabled ? calculateVariance(summary.sprintSpValues) : null;
        const spEstimationPercent = hasPredictability && summary.committedSP > 0
          ? (summary.deliveredSP / summary.committedSP) * 100
          : null;
        const windowMonths = getWindowMonths(meta);
        const baseRow = (label, doneStories, doneSP, activeAssignees, totalEpics, totalNonEpics) => {
          const storiesPerSprint = summary.sprintCount > 0 ? doneStories / summary.sprintCount : null;
          const spPerStory = spEnabled && doneStories > 0 ? doneSP / doneStories : null;
          const storiesPerSprintDay = totalSprintDays > 0 ? doneStories / totalSprintDays : null;
          const spPerSprintDay = spEnabled && totalSprintDays > 0 ? doneSP / totalSprintDays : null;
          const avgSpPerSprint = spEnabled && summary.sprintCount > 0 ? doneSP / summary.sprintCount : null;
          const doneBySprintEndPercent = doneStories > 0 ? (summary.doneBySprintEnd / doneStories) * 100 : null;
          const storiesPerAssignee = activeAssignees > 0 ? doneStories / activeAssignees : null;
          const spPerAssignee = spEnabled && activeAssignees > 0 ? doneSP / activeAssignees : null;
          const assumedCapacityPersonDays = windowMonths && activeAssignees > 0
            ? activeAssignees * 18 * windowMonths
            : null;
          const coveredPersonDays = activeAssignees > 0
            ? totalSprintDays * activeAssignees
            : null;
          const assumedWastePercent = assumedCapacityPersonDays && coveredPersonDays !== null && assumedCapacityPersonDays > 0
            ? Math.max(0, ((assumedCapacityPersonDays - coveredPersonDays) / assumedCapacityPersonDays) * 100)
            : null;
          return {
            id: board.id,
            name: label,
            type: board.type || '',
            projectKeys: (board.projectKeys || []).join('; '),
            includedSprints: summary.sprintCount,
            doneStories,
            totalSprintDays,
            avgSprintLengthDays: formatNumber(avgSprintLength),
            doneSP: spEnabled ? doneSP : '',
            committedSP: hasPredictability ? formatNumber(summary.committedSP, 2) : '',
            deliveredSP: hasPredictability ? formatNumber(summary.deliveredSP, 2) : '',
            spEstimationPercent: hasPredictability ? formatPercent(spEstimationPercent) : '',
            storiesPerSprint: formatNumber(storiesPerSprint),
            spPerStory: formatNumber(spPerStory),
            storiesPerSprintDay: formatNumber(storiesPerSprintDay),
            spPerSprintDay: formatNumber(spPerSprintDay),
            avgSpPerSprint: formatNumber(avgSpPerSprint),
            spVariancePerSprint: formatNumber(spVariancePerSprint),
            doneBySprintEndPercent: formatNumber(doneBySprintEndPercent),
            totalEpics,
            totalNonEpics,
            activeAssignees,
            storiesPerAssignee: formatNumber(storiesPerAssignee),
            spPerAssignee: formatNumber(spPerAssignee),
            assumedCapacityPersonDays: formatNumber(assumedCapacityPersonDays),
            assumedWastePercent: formatPercent(assumedWastePercent),
            sprintWindow,
            latestSprintEnd: summary.latestEnd ? formatDateForDisplay(summary.latestEnd) : '',
          };
        };
        return baseRow(board.name, summary.doneStories, summary.doneSP, summary.assignees?.size || 0, summary.epicStories, summary.nonEpicStories);
      });
      // Note: Metrics data is included in Excel export, not CSV per-section export
      break;
    case 'sprints':
      const sprintTimeTotals = computeSprintTimeTotals(previewRows);
      const hasSprintTimeTracking = Array.from(sprintTimeTotals.values()).some(total =>
        total.estimateHours || total.spentHours || total.remainingHours || total.varianceHours
      );
      const hasSprintSubtaskTracking = Array.from(sprintTimeTotals.values()).some(total =>
        total.subtaskEstimateHours || total.subtaskSpentHours || total.subtaskRemainingHours || total.subtaskVarianceHours
      );
      const sprintPredictabilityMap = new Map();
      if (previewData?.metrics?.predictability?.perSprint) {
        for (const data of Object.values(previewData.metrics.predictability.perSprint)) {
          if (data?.sprintId) {
            sprintPredictabilityMap.set(data.sprintId, data);
          }
        }
      }
      const hasSprintPredictability = sprintPredictabilityMap.size > 0;
      columns = ['id', 'name', 'boardName', 'startDate', 'endDate', 'state', 'projectKeys', 'doneStoriesNow', 'doneStoriesBySprintEnd', 'doneSP'];
      if (hasSprintPredictability) {
        columns.push('committedSP', 'deliveredSP', 'spEstimationPercent');
      }
      if (hasSprintTimeTracking) {
        columns.push('estimateHours', 'spentHours', 'remainingHours', 'varianceHours');
      }
      if (hasSprintSubtaskTracking) {
        columns.push('subtaskEstimateHours', 'subtaskSpentHours', 'subtaskRemainingHours', 'subtaskVarianceHours');
      }
      rows = (data || []).map(sprint => {
        const timeData = sprintTimeTotals.get(sprint.id) || {
          estimateHours: 0,
          spentHours: 0,
          remainingHours: 0,
          varianceHours: 0,
          subtaskEstimateHours: 0,
          subtaskSpentHours: 0,
          subtaskRemainingHours: 0,
          subtaskVarianceHours: 0,
        };
        const predictData = sprintPredictabilityMap.get(sprint.id);
        const committedSP = predictData ? predictData.committedSP : null;
        const deliveredSP = predictData ? predictData.deliveredSP : null;
        const estimationPct = committedSP > 0 ? (deliveredSP / committedSP) * 100 : null;
        const row = {
          id: sprint.id,
          name: sprint.name,
          boardName: sprint.boardName || '',
          startDate: sprint.startDate || '',
          endDate: sprint.endDate || '',
          state: sprint.state || '',
          projectKeys: (sprint.projectKeys || []).join('; '),
          doneStoriesNow: sprint.doneStoriesNow || 0,
          doneStoriesBySprintEnd: sprint.doneStoriesBySprintEnd || 0,
          doneSP: sprint.doneSP || 0
        };
        if (hasSprintPredictability) {
          row.committedSP = formatNumber(committedSP, 2);
          row.deliveredSP = formatNumber(deliveredSP, 2);
          row.spEstimationPercent = formatPercent(estimationPct);
        }
        if (hasSprintTimeTracking) {
          row.estimateHours = timeData.estimateHours.toFixed(2);
          row.spentHours = timeData.spentHours.toFixed(2);
          row.remainingHours = timeData.remainingHours.toFixed(2);
          row.varianceHours = timeData.varianceHours.toFixed(2);
        }
        if (hasSprintSubtaskTracking) {
          row.subtaskEstimateHours = timeData.subtaskEstimateHours.toFixed(2);
          row.subtaskSpentHours = timeData.subtaskSpentHours.toFixed(2);
          row.subtaskRemainingHours = timeData.subtaskRemainingHours.toFixed(2);
          row.subtaskVarianceHours = timeData.subtaskVarianceHours.toFixed(2);
        }
        return row;
      });
      break;
    case 'done-stories':
      columns = CSV_COLUMNS;
      rows = visibleRows.length > 0 ? visibleRows : previewRows;
      break;
    case 'metrics':
      // Export metrics as JSON-like CSV (flattened structure)
      const metrics = previewData?.metrics || {};
      const metricsRows = [];
      
      if (metrics.throughput) {
        if (metrics.throughput.perProject) {
          for (const projectKey in metrics.throughput.perProject) {
            const data = metrics.throughput.perProject[projectKey];
            metricsRows.push({
              metric: 'Throughput ? Per Project',
              project: projectKey,
              totalSP: data.totalSP,
              sprintCount: data.sprintCount,
              averageSPPerSprint: data.averageSPPerSprint,
              storyCount: data.storyCount
            });
          }
        }
        if (metrics.throughput.perIssueType) {
          for (const issueType in metrics.throughput.perIssueType) {
            const data = metrics.throughput.perIssueType[issueType];
            metricsRows.push({
              metric: 'Throughput ? Per Issue Type',
              issueType: issueType,
              totalSP: data.totalSP,
              issueCount: data.issueCount
            });
          }
        }
      }
      
      if (metrics.rework) {
        metricsRows.push({
          metric: 'Rework Ratio',
          reworkRatio: metrics.rework.reworkRatio,
          bugSP: metrics.rework.bugSP,
          storySP: metrics.rework.storySP,
          bugCount: metrics.rework.bugCount,
          storyCount: metrics.rework.storyCount
        });
      }
      
      if (metrics.predictability) {
        const predictPerSprint = metrics.predictability.perSprint || {};
        for (const data of Object.values(predictPerSprint)) {
          metricsRows.push({
            metric: 'Predictability',
            sprint: data.sprintName,
            committedStories: data.committedStories,
            committedSP: data.committedSP,
            deliveredStories: data.deliveredStories,
            deliveredSP: data.deliveredSP,
            predictabilityStories: data.predictabilityStories,
            predictabilitySP: data.predictabilitySP
          });
        }
      }
      
      if (metrics.epicTTM) {
        for (const epic of metrics.epicTTM) {
          metricsRows.push({
            metric: 'Epic Time-To-Market',
            epicKey: epic.epicKey,
            storyCount: epic.storyCount,
            startDate: epic.startDate,
            endDate: epic.endDate || '',
            calendarTTMdays: epic.calendarTTMdays || '',
            workingTTMdays: epic.workingTTMdays || ''
          });
        }
      }
      
      if (metricsRows.length > 0) {
        // Get all unique keys from all rows
        const allKeys = new Set();
        metricsRows.forEach(row => Object.keys(row).forEach(key => allKeys.add(key)));
        columns = Array.from(allKeys);
        rows = metricsRows;
      } else {
        errorEl.style.display = 'block';
        errorEl.innerHTML = `
          <strong>Export error:</strong> No metrics data to export.
          <br><small>Enable metrics options in the filters panel to generate metrics data.</small>
        `;
        return;
      }
      break;
    default:
      errorEl.style.display = 'block';
      errorEl.innerHTML = `
        <strong>Export error:</strong> Unknown section: ${escapeHtml(sectionName)}
      `;
      return;
    }

    if (rows.length === 0) {
      errorEl.style.display = 'block';
      let errorMessage = `No data to export for ${sectionName} section.`;
      if (sectionName === 'done-stories' && meta?.discoveredFields?.epicLinkFieldId) {
        errorMessage += ' Note: Epic Title and Summary columns will be empty if Epic Link field exists but Epic issues are unavailable or stories are not linked to Epics.';
      } else if (sectionName === 'done-stories' && !meta?.discoveredFields?.epicLinkFieldId) {
        errorMessage += ' Note: Epic data (Epic Key, Title, Summary) is only available when Epic Link field is discovered in your Jira instance.';
      }
      errorEl.innerHTML = `
        <strong>Export error:</strong> ${escapeHtml(errorMessage)}
      `;
      return;
    }

    // Generate CSV
    // Bonus Edge Case 2: Handle very large CSV exports (>10MB) gracefully
    const estimatedSize = JSON.stringify(rows).length; // Rough estimate
    const maxClientSize = 10 * 1024 * 1024; // 10MB threshold
    
    if (rows.length <= 5000 && estimatedSize < maxClientSize) {
      // Client-side generation for smaller datasets
      csv = generateCSVClient(columns, rows);
      downloadCSV(csv, filename);
    } else {
      // Server-side streaming for large datasets (>5000 rows or >10MB)
      try {
        // Show progress indicator for large exports
        if (button) {
          button.textContent = `Exporting ${rows.length.toLocaleString()} rows??-`;
        }
        
        const response = await fetch('/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ columns, rows }),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`Export failed: ${errorText}`);
        }

        const blob = await response.blob();
        
        // Check blob size for very large files
        if (blob.size > 50 * 1024 * 1024) { // >50MB
          errorEl.style.display = 'block';
          errorEl.innerHTML = `
            <strong>Export warning:</strong> CSV file is very large (${(blob.size / 1024 / 1024).toFixed(1)}MB).
            <br><small>Your browser may have difficulty opening this file. Consider filtering the data or using a smaller date range.</small>
          `;
        }
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 100);
        
        // Show success feedback
        const successMsg = document.createElement('div');
        successMsg.className = 'export-success';
        successMsg.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #4caf50; color: white; padding: 12px 20px; border-radius: 4px; z-index: 10000; box-shadow: 0 2px 8px rgba(0,0,0,0.2);';
        successMsg.textContent = `??- CSV exported: ${filename} (${(blob.size / 1024).toFixed(0)}KB)`;
        document.body.appendChild(successMsg);
        setTimeout(() => {
          if (successMsg.parentNode) {
            successMsg.parentNode.removeChild(successMsg);
          }
        }, 3000);
      } catch (error) {
        errorEl.style.display = 'block';
        errorEl.innerHTML = `
          <strong>Export error:</strong> ${error.message}
          <br><small>If this problem persists, verify the server is running and reachable, then try again.</small>
          <br><small>For very large datasets, try filtering the data or using a smaller date range.</small>
        `;
        console.error('CSV export error:', error);
      }
    }
  } finally {
    setExportButtonLoading(button, false);
  }
}

// Tap-friendly tooltip popover: one delegate, single source of text from data-tooltip
const TOOLTIP_POPOVER_ID = 'tooltip-popover';
let tooltipActiveTrigger = null;

function hideTooltipPopover() {
  const popover = document.getElementById(TOOLTIP_POPOVER_ID);
  if (popover) {
    popover.setAttribute('aria-hidden', 'true');
    popover.textContent = '';
  }
  if (tooltipActiveTrigger) {
    tooltipActiveTrigger.removeAttribute('aria-describedby');
    tooltipActiveTrigger = null;
  }
}

function showTooltipPopover(trigger) {
  const text = trigger.getAttribute('data-tooltip');
  if (!text) return;
  hideTooltipPopover();
  const popover = document.getElementById(TOOLTIP_POPOVER_ID);
  if (!popover) return;
  popover.textContent = text;
  popover.setAttribute('aria-hidden', 'false');
  const rect = trigger.getBoundingClientRect();
  const popoverWidth = 320;
  let left = rect.left;
  let top = rect.bottom + 6;
  if (left + popoverWidth > window.innerWidth) left = window.innerWidth - popoverWidth - 8;
  if (left < 8) left = 8;
  if (top + 120 > window.innerHeight) top = rect.top - 6 - 80;
  if (top < 8) top = 8;
  popover.style.left = left + 'px';
  popover.style.top = top + 'px';
  trigger.setAttribute('aria-describedby', TOOLTIP_POPOVER_ID);
  tooltipActiveTrigger = trigger;
}

document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-tooltip]');
  if (trigger) {
    e.preventDefault();
    const popover = document.getElementById(TOOLTIP_POPOVER_ID);
    const isOpen = popover && popover.getAttribute('aria-hidden') === 'false' && tooltipActiveTrigger === trigger;
    if (isOpen) {
      hideTooltipPopover();
    } else {
      showTooltipPopover(trigger);
    }
    return;
  }
  if (!e.target.closest('#' + TOOLTIP_POPOVER_ID)) {
    hideTooltipPopover();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideTooltipPopover();
});

document.addEventListener('mouseover', (e) => {
  const trigger = e.target.closest('[data-tooltip]');
  if (trigger) showTooltipPopover(trigger);
});
document.addEventListener('mouseout', (e) => {
  if (e.target.closest('[data-tooltip]')) hideTooltipPopover();
});
document.addEventListener('focusin', (e) => {
  const trigger = e.target.closest('[data-tooltip]');
  if (trigger) showTooltipPopover(trigger);
});
document.addEventListener('focusout', (e) => {
  if (e.target.closest('[data-tooltip]')) hideTooltipPopover();
});

// Wire up per-section export buttons using event delegation
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('export-section-btn')) {
    const button = e.target;
    const section = button.dataset.section;
    let data = null;
    
    switch (section) {
      case 'project-epic-level':
      case 'boards':
        data = visibleBoardRows.length > 0 ? visibleBoardRows : (previewData?.boards || []);
        break;
      case 'sprints':
        data = visibleSprintRows.length > 0 ? visibleSprintRows : (previewData?.sprintsIncluded || []);
        break;
      case 'done-stories':
        data = visibleRows.length > 0 ? visibleRows : previewRows;
        break;
    }
    
    exportSectionCSV(section, data, button);
  }
});

// Render Metrics tab
function renderMetricsTab(metrics) {
  const content = document.getElementById('metrics-content');
  const meta = getSafeMeta(previewData);
  const safeMetrics = metrics || {};
  let html = '';
  let hasMetrics = false;
  const hintHtml = '<p class="metrics-hint"><small>Metrics sections depend on options in the filters panel (e.g. Story Points for Throughput, Bugs for Rework, Epic TTM for Epic Time-To-Market).</small></p>';

  if (safeMetrics.throughput) {
    hasMetrics = true;
    html += '<h3>Throughput</h3>';
    html += '<p class="metrics-hint"><small>Note: Per Sprint data is shown in the Sprints tab. Below are aggregated views.</small></p>';
    html += '<h4>Per Project</h4>';
    html += '<table class="data-table"><thead><tr>' +
      '<th title="Project key.">Project</th>' +
      '<th title="Total story points delivered for this project.">Total SP</th>' +
      '<th title="Number of sprints included for this project.">Sprint Count</th>' +
      '<th title="Average story points delivered per sprint.">Average SP/Sprint</th>' +
      '<th title="Number of stories completed for this project.">Story Count</th>' +
      '</tr></thead><tbody>';
    for (const projectKey in safeMetrics.throughput.perProject) {
      const data = safeMetrics.throughput.perProject[projectKey];
      html += `<tr><td>${escapeHtml(data.projectKey)}</td><td>${data.totalSP}</td><td>${data.sprintCount}</td><td>${formatNumber(data.averageSPPerSprint)}</td><td>${data.storyCount}</td></tr>`;
    }
    html += '</tbody></table>';

    if (safeMetrics.throughput.perIssueType && Object.keys(safeMetrics.throughput.perIssueType).length > 0) {
      html += '<h4>Per Issue Type</h4>';
      html += '<table class="data-table"><thead><tr>' +
        '<th title="Issue category as reported by Jira.">Issue Type</th>' +
        '<th title="Total story points delivered for this issue type.">Total SP</th>' +
        '<th title="Total number of done issues for this type in the window.">Issue Count</th>' +
        '</tr></thead><tbody>';
      for (const issueType in safeMetrics.throughput.perIssueType) {
        const data = safeMetrics.throughput.perIssueType[issueType];
        html += `<tr><td>${escapeHtml(data.issueType || 'Unknown')}</td><td>${data.totalSP}</td><td>${data.issueCount}</td></tr>`;
      }
      html += '</tbody></table>';
    } else if (safeMetrics.throughput && meta?.discoveredFields?.storyPointsFieldId) {
      html += '<h4>Per Issue Type</h4>';
      html += '<p><em>No issue type breakdown available. Enable "Include Bugs for Rework" to see Bug vs Story breakdown.</em></p>';
    }
  }

  if (safeMetrics.rework) {
    hasMetrics = true;
    html += '<h3>Rework Ratio</h3>';
    const r = safeMetrics.rework;
    if (r.spAvailable) {
      html += `<p>Rework: ${formatPercent(r.reworkRatio)} (Bug SP: ${r.bugSP}, Story SP: ${r.storySP})</p>`;
    } else {
      html += `<p>Rework: SP unavailable (Bug Count: ${r.bugCount}, Story Count: ${r.storyCount})</p>`;
    }
  }

  if (safeMetrics.predictability) {
    hasMetrics = true;
    html += '<h3>Predictability</h3>';
    html += `<p>Mode: ${safeMetrics.predictability.mode}</p>`;
    html += buildPredictabilityTableHeaderHtml();
    const predictPerSprint = safeMetrics.predictability.perSprint || {};
    for (const data of Object.values(predictPerSprint)) {
      if (!data) continue;
      html += `<tr>
        <td>${escapeHtml(data.sprintName)}</td>
        <td>${data.committedStories}</td>
        <td>${data.committedSP}</td>
        <td>${data.deliveredStories}</td>
        <td>${data.deliveredSP}</td>
        <td>${formatPercent(data.predictabilityStories)}</td>
        <td>${formatPercent(data.predictabilitySP)}</td>
      </tr>`;
    }
    html += '</tbody></table>';
  }

  if (safeMetrics.epicTTM) {
    hasMetrics = true;
    html += '<h3>Epic Time-To-Market</h3>';
    html += '<p class="metrics-hint"><strong>Definition:</strong> Epic Time-To-Market measures days from Epic creation to Epic resolution (or first story created to last story resolved if Epic dates unavailable).</p>';
    if (meta?.epicTTMFallbackCount > 0) {
      html += `<p class="data-quality-warning"><small>Note: ${meta.epicTTMFallbackCount} epic(s) used story date fallback (Epic issues unavailable).</small></p>`;
    }
    html += '<table class="data-table"><thead><tr>' +
      '<th title="Epic identifier in Jira." data-tooltip="Epic identifier in Jira.">Epic Key</th>' +
      '<th title="Epic summary/title." data-tooltip="Epic summary/title.">Epic Name</th>' +
      '<th title="User stories linked to this epic in the window. Hover to see summaries." data-tooltip="User stories linked to this epic in the window. Hover to see summaries.">Story IDs</th>' +
      '<th title="Number of stories linked to the epic in this window." data-tooltip="Number of stories linked to the epic in this window.">Story Count</th>' +
      '<th title="Epic start date (Epic created or first story created if Epic dates missing)." data-tooltip="Epic start date (Epic created or first story created if Epic dates missing).">Start Date</th>' +
      '<th title="Epic end date (Epic resolved or last story resolved if Epic dates missing)." data-tooltip="Epic end date (Epic resolved or last story resolved if Epic dates missing).">End Date</th>' +
      '<th title="Calendar days from start to end (includes weekends)." data-tooltip="Calendar days from start to end (includes weekends).">Calendar TTM (days)</th>' +
      '<th title="Working days from start to end (excludes weekends). Use this to compare team flow." data-tooltip="Working days from start to end (excludes weekends). Use this to compare team flow.">Working TTM (days)</th>' +
      '</tr></thead><tbody>';
    const epicRows = [...safeMetrics.epicTTM, ...buildEpicAdhocRows(previewRows)];
    for (const epic of epicRows) {
      html += `<tr>
        <td>${renderEpicKeyCell(epic, meta)}</td>
        <td>${escapeHtml(epic.epicTitle || '')}</td>
        <td>${renderEpicStoryList(epic, meta)}</td>
        <td>${epic.storyCount}</td>
        <td>${escapeHtml(formatDateForDisplay(epic.startDate))}</td>
        <td>${escapeHtml(formatDateForDisplay(epic.endDate || ''))}</td>
        <td>${epic.calendarTTMdays ?? ''}</td>
        <td>${epic.workingTTMdays ?? ''}</td>
      </tr>`;
    }
    html += '</tbody></table>';
  }

  if (!hasMetrics) {
    const epicHygieneFailed = meta?.epicHygiene?.ok === false;
    const title = epicHygieneFailed ? 'Epic TTM not available' : 'No metrics available';
    const message = epicHygieneFailed
      ? (meta.epicHygiene?.message || 'Epic TTM is not available because epic hygiene is below threshold.')
      : 'Metrics are only calculated when the corresponding options are enabled in the filters panel.';
    const hint = epicHygieneFailed
      ? 'Check Epic Link usage and epic span in Jira, or adjust project configuration.'
      : 'Enable options like "Include Story Points", "Include Predictability", "Include Epic TTM", or "Include Bugs for Rework" to see metrics.';
    renderEmptyState(content, title, message, hint);
  } else {
    content.innerHTML = hintHtml + html;
  }
}

// Render Unusable Sprints tab
function renderUnusableSprintsTab(unusable) {
  const content = document.getElementById('unusable-sprints-content');
  
  if (!unusable || unusable.length === 0) {
    renderEmptyState(
      content,
      'No unusable sprints',
      'All sprints in the selected date range have valid start and end dates.',
      'Sprints are marked as unusable if they are missing start or end dates. Enable "Include Active/Missing End Date Sprints" to include sprints with missing end dates.'
    );
    return;
  }

  let html = '<table class="data-table"><thead><tr><th>Board</th><th>Sprint</th><th>Reason</th></tr></thead><tbody>';
  
  for (const sprint of unusable) {
    html += `
      <tr>
        <td>${escapeHtml(sprint.boardName || '')}</td>
        <td>${escapeHtml(sprint.name || '')}</td>
        <td>${escapeHtml(sprint.reason || '')}</td>
      </tr>
    `;
  }
  
  html += '</tbody></table>';
  content.innerHTML = html;
}
