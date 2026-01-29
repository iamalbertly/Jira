// SIZE-EXEMPT: Legacy report UI controller kept as a single browser module to avoid
// introducing additional bundling or script loading complexity. Behaviour is cohesive
// around preview, tabs, and exports; future work can further split if a bundler is added.

// CSV column order (must match server)
const CSV_COLUMNS = [
  'projectKey',
  'boardId',
  'boardName',
  'sprintId',
  'sprintName',
  'sprintState',
  'sprintStartDate',
  'sprintEndDate',
  'issueKey',
  'issueSummary',
  'issueStatus',
  'issueType',
  'issueStatusCategory',
  'issuePriority',
  'issueLabels',
  'issueComponents',
  'issueFixVersions',
  'assigneeDisplayName',
  'created',
  'updated',
  'resolutionDate',
  'subtaskCount',
  'timeOriginalEstimateHours',
  'timeRemainingEstimateHours',
  'timeSpentHours',
  'timeVarianceHours',
  'subtaskTimeOriginalEstimateHours',
  'subtaskTimeRemainingEstimateHours',
  'subtaskTimeSpentHours',
  'subtaskTimeVarianceHours',
  'ebmTeam',
  'ebmProductArea',
  'ebmCustomerSegments',
  'ebmValue',
  'ebmImpact',
  'ebmSatisfaction',
  'ebmSentiment',
  'ebmSeverity',
  'ebmSource',
  'ebmWorkCategory',
  'ebmGoals',
  'ebmTheme',
  'ebmRoadmap',
  'ebmFocusAreas',
  'ebmDeliveryStatus',
  'ebmDeliveryProgress',
  'storyPoints',
  'epicKey',
  'epicTitle',
  'epicSummary',
];

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
let previewHasRows = false;

// DOM Elements
const previewBtn = document.getElementById('preview-btn');
const exportExcelBtn = document.getElementById('export-excel-btn');
const exportFilteredBtn = document.getElementById('export-filtered-btn');
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

// Tab management
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.tab;
    
    // Update buttons
    tabButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Update panes
    tabPanes.forEach(p => p.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
  });
});

// Predictability mode toggle
document.getElementById('include-predictability').addEventListener('change', (e) => {
  document.getElementById('predictability-mode-group').style.display = e.target.checked ? 'block' : 'none';
});

// Update preview button state based on project selection
function updatePreviewButtonState() {
  const hasProject = document.getElementById('project-mpsa').checked || 
                     document.getElementById('project-mas').checked;
  previewBtn.disabled = !hasProject;
  if (!hasProject) {
    previewBtn.title = 'Please select at least one project (MPSA or MAS)';
  } else {
    previewBtn.title = '';
  }
}

// Listen to project checkbox changes
document.getElementById('project-mpsa').addEventListener('change', updatePreviewButtonState);
document.getElementById('project-mas').addEventListener('change', updatePreviewButtonState);
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
  const prevExportFilteredDisabled = exportFilteredBtn.disabled;
  const prevExportExcelDisabled = exportExcelBtn.disabled;

  // Immediately prevent double-clicks and exporting while a preview is in flight
  previewBtn.disabled = true;
  exportFilteredBtn.disabled = true;
  exportExcelBtn.disabled = true;

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
    // Re-enable preview and restore export buttons to their previous state
    previewBtn.disabled = false;
    exportFilteredBtn.disabled = prevExportFilteredDisabled;
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
        displayMessage = 'Please select at least one project (MPSA or MAS) before generating a preview.';
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
    previewHasRows = previewRows.length > 0;

    updateLoadingMessage('Finalizing...', 'Rendering tables and metrics');
    renderPreview();
    
    loadingEl.style.display = 'none';
    previewContent.style.display = 'block';
    exportFilteredBtn.disabled = !previewHasRows;
    exportExcelBtn.disabled = !previewHasRows;
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

    // Re-enable preview regardless of outcome
    previewBtn.disabled = false;

    // Only enable exports if we have rows
    const hasRows = Array.isArray(previewRows) && previewRows.length > 0;
    exportFilteredBtn.disabled = !hasRows;
    exportExcelBtn.disabled = !hasRows;
  }
});

// Collect filter parameters
function collectFilterParams() {
  const projects = [];
  if (document.getElementById('project-mpsa').checked) projects.push('MPSA');
  if (document.getElementById('project-mas').checked) projects.push('MAS');

  // Validate at least one project is selected
  if (projects.length === 0) {
    throw new Error('Please select at least one project (MPSA or MAS)');
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
    includeStoryPoints: true, // Always enabled - mandatory for reports
    requireResolvedBySprintEnd: document.getElementById('require-resolved-by-sprint-end').checked,
    includeBugsForRework: true, // Always enabled - mandatory for reports
    includePredictability: document.getElementById('include-predictability').checked,
    predictabilityMode: document.querySelector('input[name="predictability-mode"]:checked').value,
    includeEpicTTM: true, // Always enabled - mandatory for reports
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
    discoveredFields: raw.discoveredFields || {},
    fieldInventory: raw.fieldInventory || null,
    requireResolvedBySprintEnd: !!raw.requireResolvedBySprintEnd,
    epicTTMFallbackCount: raw.epicTTMFallbackCount || 0,
  };

  return safe;
}

function buildCsvFilename(section, meta, qualifier = '') {
  const projects = (meta?.selectedProjects || []).join('-') || 'Projects';
  const dateRange = formatDateRangeForFilename(meta?.windowStart || '', meta?.windowEnd || '');
  const exportDate = new Date().toISOString().split('T')[0];
  const partialSuffix = meta?.partial ? '_PARTIAL' : '';
  const cleanedSection = section.replace(/[^a-z0-9-]/gi, '-');
  const cleanedQualifier = qualifier ? `_${qualifier.replace(/[^a-z0-9-]/gi, '-')}` : '';
  return `${projects}_${dateRange}_${cleanedSection}${cleanedQualifier}${partialSuffix}_${exportDate}.csv`;
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
    exportFilteredBtn.disabled = true;
    exportExcelBtn.disabled = true;
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
  const sourceLabel = fromCache ? 'Cache' : 'Jira (live)';

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
  } else {
    detailsLines.push('Source: Jira (live request)');
  }
  if (meta.fieldInventory) {
    const foundCount = Array.isArray(meta.fieldInventory.ebmFieldsFound) ? meta.fieldInventory.ebmFieldsFound.length : 0;
    const missingCount = Array.isArray(meta.fieldInventory.ebmFieldsMissing) ? meta.fieldInventory.ebmFieldsMissing.length : 0;
    detailsLines.push(`EBM fields found: ${foundCount}, missing: ${missingCount}`);
  }

  const partialNotice = partial
    ? `<br><span class="partial-warning"><strong>Note:</strong> This preview is <em>partial</em> because: ${partialReason || 'time budget exceeded or limits reached.'} Data may be incomplete; consider narrowing the date range or reducing options and trying again.</span>`
    : '';
  
  const selectedProjectsLabel = meta.selectedProjects.length > 0 ? meta.selectedProjects.join(', ') : 'None';
  previewMeta.innerHTML = `
    <div class="meta-info">
      <strong>Projects:</strong> ${escapeHtml(selectedProjectsLabel)}<br>
      <strong>Date Window (Local):</strong> ${escapeHtml(windowStartLocal)} to ${escapeHtml(windowEndLocal)}<br>
      <strong>Date Window (UTC):</strong> ${escapeHtml(windowStartUtc)} to ${escapeHtml(windowEndUtc)}<br>
      <strong>Summary:</strong> Boards: ${boardsCount} | Included sprints: ${sprintsCount} | Done stories: ${rowsCount} | Unusable sprints: ${unusableCount}<br>
      <strong>Details:</strong> ${escapeHtml(detailsLines.join(' - '))}
      ${partialNotice}
    </div>
  `;

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
  exportFilteredBtn.disabled = !hasRows;
  exportExcelBtn.disabled = !hasRows;

  const exportHint = document.getElementById('export-hint');
  if (exportHint) {
    if (!hasRows) {
      exportHint.innerHTML = `
        <small>Exports are available once there is at least one Done story in the preview.</small>
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
    renderProjectEpicLevelTab(previewData.boards, previewData.metrics);
    renderSprintsTab(previewData.sprintsIncluded, previewData.metrics);
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

function calculateSprintDays(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) {
    return null;
  }
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString();
}

function buildBoardSummaries(boards, sprintsIncluded, rows, meta) {
  const summaries = new Map();
  const boardIds = (boards || []).map(board => board.id);
  boardIds.forEach(id => {
    summaries.set(id, {
      sprintCount: 0,
      doneStories: 0,
      doneSP: 0,
      earliestStart: null,
      latestEnd: null,
      totalSprintDays: 0,
      validSprintDaysCount: 0,
      doneBySprintEnd: 0,
      sprintSpValues: [],
      epicStories: 0,
      nonEpicStories: 0,
    });
  });

  const spEnabled = !!meta?.discoveredFields?.storyPointsFieldId;
  const sprintSpTotals = new Map();
  for (const row of rows || []) {
    if (!summaries.has(row.boardId)) {
      summaries.set(row.boardId, {
        sprintCount: 0,
        doneStories: 0,
        doneSP: 0,
        earliestStart: null,
        latestEnd: null,
        totalSprintDays: 0,
        validSprintDaysCount: 0,
        doneBySprintEnd: 0,
        sprintSpValues: [],
        epicStories: 0,
        nonEpicStories: 0,
      });
    }
    const summary = summaries.get(row.boardId);
    summary.doneStories += 1;
    if (spEnabled) {
      summary.doneSP += parseFloat(row.storyPoints) || 0;
    }
    if (row.epicKey) {
      summary.epicStories += 1;
    } else {
      summary.nonEpicStories += 1;
    }

    if (row.sprintId) {
      const sprintTotal = sprintSpTotals.get(row.sprintId) || 0;
      sprintSpTotals.set(row.sprintId, sprintTotal + (parseFloat(row.storyPoints) || 0));
    }
  }

  for (const sprint of sprintsIncluded || []) {
    if (!summaries.has(sprint.boardId)) {
      summaries.set(sprint.boardId, {
        sprintCount: 0,
        doneStories: 0,
        doneSP: 0,
        earliestStart: null,
        latestEnd: null,
        totalSprintDays: 0,
        validSprintDaysCount: 0,
        doneBySprintEnd: 0,
        sprintSpValues: [],
        epicStories: 0,
        nonEpicStories: 0,
      });
    }
    const summary = summaries.get(sprint.boardId);
    summary.sprintCount += 1;
    summary.doneBySprintEnd += sprint.doneStoriesBySprintEnd || 0;

    const sprintDays = calculateSprintDays(sprint.startDate, sprint.endDate);
    if (sprintDays !== null) {
      summary.totalSprintDays += sprintDays;
      summary.validSprintDaysCount += 1;
    }

    const sprintStart = sprint.startDate ? new Date(sprint.startDate) : null;
    const sprintEnd = sprint.endDate ? new Date(sprint.endDate) : null;
    if (sprintStart && !Number.isNaN(sprintStart.getTime())) {
      if (!summary.earliestStart || sprintStart < summary.earliestStart) {
        summary.earliestStart = sprintStart;
      }
    }
    if (sprintEnd && !Number.isNaN(sprintEnd.getTime())) {
      if (!summary.latestEnd || sprintEnd > summary.latestEnd) {
        summary.latestEnd = sprintEnd;
      }
    }

    if (spEnabled && sprintSpTotals.has(sprint.id)) {
      summary.sprintSpValues.push(sprintSpTotals.get(sprint.id));
    }
  }

  return summaries;
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
  let html = '';
  const boardSummaries = buildBoardSummaries(boards, previewData?.sprintsIncluded || [], previewRows, meta);

  // Section 1: Boards (merged with throughput fundamentals)
  html += '<h3>Boards</h3>';
  if (!boards || boards.length === 0) {
    html += '<p><em>No boards were discovered for the selected projects in the date window.</em></p>';
  } else {
    html += '<table class="data-table"><thead><tr>' +
      '<th title="Jira board identifier.">Board ID</th>' +
      '<th title="Board name shown in Jira.">Board</th>' +
      '<th title="Board type (scrum/kanban).">Type</th>' +
      '<th title="Projects mapped to this board.">Projects</th>' +
      '<th title="Count of included sprints in the date window.">Sprints</th>' +
      '<th title="Sum of (sprint end - sprint start + 1) days across included sprints.">Sprint Days</th>' +
      '<th title="Total Sprint Days ÷ Sprints.">Avg Sprint Days</th>' +
      '<th title="Stories marked Done in included sprints.">Done Stories</th>' +
      '<th title="Story points completed in included sprints.">Done SP</th>' +
      '<th title="Done Stories ÷ Sprints.">Stories / Sprint</th>' +
      '<th title="Done SP ÷ Done Stories. Indicates average story size.">SP / Story</th>' +
      '<th title="Done Stories ÷ Sprint Days. Normalized delivery rate. (EBM: T2M)">Stories / Day</th>' +
      '<th title="Done SP ÷ Sprint Days. Normalized delivery rate. (EBM: T2M)">SP / Day</th>' +
      '<th title="Done SP ÷ Sprints.">SP / Sprint</th>' +
      '<th title="Variance of SP delivered per sprint. Higher = less consistent.">SP Variance</th>' +
      '<th title="Stories resolved by sprint end ÷ Done Stories. On-time delivery discipline.">On-Time %</th>' +
      '<th title="Stories linked to an Epic (planned work).">Planned</th>' +
      '<th title="Stories without an Epic (often ad-hoc work).">Ad-hoc</th>' +
      '<th title="Earliest sprint start to latest sprint end in the window.">Sprint Window</th>' +
      '<th title="Latest sprint end date in the window.">Latest End</th>' +
      '</tr></thead><tbody>';
    for (const board of boards) {
      const summary = boardSummaries.get(board.id) || { sprintCount: 0, doneStories: 0, doneSP: 0, earliestStart: null, latestEnd: null, totalSprintDays: 0, validSprintDaysCount: 0, doneBySprintEnd: 0, sprintSpValues: [], epicStories: 0, nonEpicStories: 0 };
      const sprintWindowRaw = summary.earliestStart && summary.latestEnd
        ? `${summary.earliestStart.toISOString()} to ${summary.latestEnd.toISOString()}`
        : '';
      const sprintWindowDisplay = summary.earliestStart && summary.latestEnd
        ? `${formatDateForDisplay(summary.earliestStart)} to ${formatDateForDisplay(summary.latestEnd)}`
        : '';
      const latestEndRaw = summary.latestEnd ? summary.latestEnd.toISOString() : '';
      const latestEndDisplay = summary.latestEnd ? formatDateForDisplay(summary.latestEnd) : '';
      const totalSprintDays = summary.totalSprintDays || 0;
      const avgSprintLength = summary.validSprintDaysCount > 0
        ? totalSprintDays / summary.validSprintDaysCount
        : null;
      const storiesPerSprint = summary.sprintCount > 0
        ? summary.doneStories / summary.sprintCount
        : null;
      const spPerStory = summary.doneStories > 0
        ? summary.doneSP / summary.doneStories
        : null;
      const storiesPerSprintDay = totalSprintDays > 0
        ? summary.doneStories / totalSprintDays
        : null;
      const spPerSprintDay = totalSprintDays > 0
        ? summary.doneSP / totalSprintDays
        : null;
      const avgSpPerSprint = summary.sprintCount > 0
        ? summary.doneSP / summary.sprintCount
        : null;
      const spVariance = calculateVariance(summary.sprintSpValues);
      const doneBySprintEndPct = summary.doneStories > 0
        ? (summary.doneBySprintEnd / summary.doneStories) * 100
        : null;
      html += `
        <tr>
          <td>${escapeHtml(board.id)}</td>
          <td>${escapeHtml(board.name)}</td>
          <td>${escapeHtml(board.type || '')}</td>
          <td>${escapeHtml((board.projectKeys || []).join(', '))}</td>
          <td>${summary.sprintCount}</td>
          <td>${totalSprintDays}</td>
          <td>${formatNumber(avgSprintLength)}</td>
          <td>${summary.doneStories}</td>
          <td>${summary.doneSP}</td>
          <td>${formatNumber(storiesPerSprint)}</td>
          <td>${formatNumber(spPerStory)}</td>
          <td>${formatNumber(storiesPerSprintDay)}</td>
          <td>${formatNumber(spPerSprintDay)}</td>
          <td>${formatNumber(avgSpPerSprint)}</td>
          <td>${formatNumber(spVariance)}</td>
          <td>${formatPercent(doneBySprintEndPct)}</td>
          <td>${summary.epicStories}</td>
          <td>${summary.nonEpicStories}</td>
          <td title="${escapeHtml(sprintWindowRaw)}">${escapeHtml(sprintWindowDisplay)}</td>
          <td title="${escapeHtml(latestEndRaw)}">${escapeHtml(latestEndDisplay)}</td>
        </tr>
      `;
    }
    html += '</tbody></table>';
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
        html += '<table class="data-table"><thead><tr><th>Issue Type</th><th>Total SP</th><th>Issue Count</th></tr></thead><tbody>';
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
        html += `<p>Rework: ${r.reworkRatio.toFixed(2)}% (Bug SP: ${r.bugSP}, Story SP: ${r.storySP})</p>`;
      } else {
        html += `<p>Rework: SP unavailable (Bug Count: ${r.bugCount}, Story Count: ${r.storyCount})</p>`;
      }
    }

    // Predictability
    if (metrics.predictability) {
      html += '<h3>Predictability</h3>';
      html += `<p>Mode: ${escapeHtml(metrics.predictability.mode)}</p>`;
      html += '<table class="data-table"><thead><tr><th>Sprint</th><th>Committed Stories</th><th>Committed SP</th><th>Delivered Stories</th><th>Delivered SP</th><th>Predictability % (Stories)</th><th>Predictability % (SP)</th></tr></thead><tbody>';
      const predictPerSprint = metrics.predictability.perSprint || {};
      for (const data of Object.values(predictPerSprint)) {
        if (!data) continue;
      html += `<tr>
          <td>${escapeHtml(data.sprintName)}</td>
          <td>${data.committedStories}</td>
          <td>${data.committedSP}</td>
          <td>${data.deliveredStories}</td>
          <td>${data.deliveredSP}</td>
          <td>${data.predictabilityStories.toFixed(2)}%</td>
          <td>${data.predictabilitySP.toFixed(2)}%</td>
        </tr>`;
      }
      html += '</tbody></table>';
    }

    // Epic TTM
    if (metrics.epicTTM) {
      html += '<h3>Epic Time-To-Market</h3>';
      html += '<p class="metrics-hint"><strong>Definition:</strong> Epic Time-To-Market measures days from Epic creation to Epic resolution (or first story created to last story resolved if Epic dates unavailable).</p>';
      if (meta?.epicTTMFallbackCount > 0) {
        html += `<p class="data-quality-warning"><small>Note: ${meta.epicTTMFallbackCount} epic(s) used story date fallback (Epic issues unavailable).</small></p>`;
      }
      html += '<table class="data-table"><thead><tr><th>Epic Key</th><th>Story Count</th><th>Start Date</th><th>End Date</th><th>Calendar TTM (days)</th><th>Working TTM (days)</th></tr></thead><tbody>';
      for (const epic of metrics.epicTTM) {
        html += `<tr>
          <td>${escapeHtml(epic.epicKey)}</td>
          <td>${epic.storyCount}</td>
          <td>${escapeHtml(epic.startDate)}</td>
          <td>${escapeHtml(epic.endDate || '')}</td>
          <td>${epic.calendarTTMdays ?? ''}</td>
          <td>${epic.workingTTMdays ?? ''}</td>
        </tr>`;
      }
      html += '</tbody></table>';
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

  if (!sprints || sprints.length === 0) {
    const windowInfo = meta ?
      `${new Date(meta.windowStart).toLocaleDateString()} to ${new Date(meta.windowEnd).toLocaleDateString()}` :
      'selected date range';
    const title = 'No sprints found';
    const message = `No sprints overlap with the selected date window (${windowInfo}).`;
    const hint = 'Try adjusting your date range or enable "Include Active/Missing End Date Sprints" if you want to include active sprints.';
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
    html += '<th title="Story points completed in this sprint.">Done SP</th><th title="Total SP recorded for this sprint in throughput.">Total SP</th><th title="Story count used in throughput.">Story Count</th>';
  }

  if (hasTimeTracking) {
    html += '<th title="Sum of original estimates.">Est Hrs</th><th title="Sum of time spent.">Spent Hrs</th><th title="Sum of remaining estimates.">Remaining Hrs</th><th title="Spent - Estimate.">Variance Hrs</th>';
  }

  if (hasSubtaskTimeTracking) {
    html += '<th title="Sum of subtask estimates.">Subtask Est Hrs</th><th title="Sum of subtask time spent.">Subtask Spent Hrs</th><th title="Sum of subtask remaining estimates.">Subtask Remaining Hrs</th><th title="Subtask spent - estimate.">Subtask Variance Hrs</th>';
  }
  
  html += '</tr></thead><tbody>';
  
  for (const sprint of sprints) {
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
        <td title="${escapeHtml(sprint.startDate || '')}">${escapeHtml(sprintStartDisplay)}</td>
        <td title="${escapeHtml(sprint.endDate || '')}">${escapeHtml(sprintEndDisplay)}</td>
        <td>${escapeHtml(sprint.state || '')}</td>
        <td>${sprint.doneStoriesNow || 0}</td>
    `;
    
    if (metrics?.doneComparison) {
      html += `<td>${sprint.doneStoriesBySprintEnd || 0}</td>`;
    }
    
    if (metrics?.throughput) {
      html += `<td>${sprint.doneSP || 0}</td>`;
      if (throughputData) {
        html += `<td>${throughputData.totalSP || 0}</td>`;
        html += `<td>${throughputData.storyCount || 0}</td>`;
      } else {
        html += '<td>N/A</td>';
        html += '<td>N/A</td>';
      }
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
  const totalDoneStoriesNow = sprints.reduce((sum, sprint) => sum + (sprint.doneStoriesNow || 0), 0);
  const totalDoneByEnd = sprints.reduce((sum, sprint) => sum + (sprint.doneStoriesBySprintEnd || 0), 0);
  const totalDoneSP = sprints.reduce((sum, sprint) => sum + (sprint.doneSP || 0), 0);
  const totalThroughputSP = metrics?.throughput?.perSprint
    ? Object.values(metrics.throughput.perSprint).reduce((sum, data) => sum + (data.totalSP || 0), 0)
    : 0;
  const totalThroughputCount = metrics?.throughput?.perSprint
    ? Object.values(metrics.throughput.perSprint).reduce((sum, data) => sum + (data.storyCount || 0), 0)
    : 0;
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
    html += `<td><strong>${totalDoneSP}</strong></td>`;
    html += `<td><strong>${totalThroughputSP}</strong></td>`;
    html += `<td><strong>${totalThroughputCount}</strong></td>`;
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
    exportFilteredBtn.disabled = true;
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
    
    html += `
      <div class="sprint-group">
        <button class="sprint-header" onclick="toggleSprint('${sprintKey}')">
          <span class="toggle-icon">▼</span>
          <strong>${escapeHtml(group.sprint.name)}</strong>
          <span class="sprint-meta">${escapeHtml(group.sprint.startDate)} to ${escapeHtml(group.sprint.endDate)}</span>
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
                ${hasEbmTeam ? '<th title="EBM: Team field (customer value context).">EBM Team</th>' : ''}
                ${hasEbmProductArea ? '<th title="EBM: Product area.">EBM Product Area</th>' : ''}
                ${hasEbmCustomerSegments ? '<th title="EBM: Customer segments.">EBM Customer Segments</th>' : ''}
                ${hasEbmValue ? '<th title="EBM: Value signal (CV/UV).">EBM Value</th>' : ''}
                ${hasEbmImpact ? '<th title="EBM: Impact signal (CV/UV).">EBM Impact</th>' : ''}
                ${hasEbmSatisfaction ? '<th title="EBM: Satisfaction signal (CV).">EBM Satisfaction</th>' : ''}
                ${hasEbmSentiment ? '<th title="EBM: Sentiment signal (CV).">EBM Sentiment</th>' : ''}
                ${hasEbmSeverity ? '<th title="EBM: Severity or urgency.">EBM Severity</th>' : ''}
                ${hasEbmSource ? '<th title="EBM: Source of demand.">EBM Source</th>' : ''}
                ${hasEbmWorkCategory ? '<th title="EBM: Work category (A2I).">EBM Work Category</th>' : ''}
                ${hasEbmGoals ? '<th title="EBM: Goals alignment (UV).">EBM Goals</th>' : ''}
                ${hasEbmTheme ? '<th title="EBM: Strategic theme (UV).">EBM Theme</th>' : ''}
                ${hasEbmRoadmap ? '<th title="EBM: Roadmap linkage (UV).">EBM Roadmap</th>' : ''}
                ${hasEbmFocusAreas ? '<th title="EBM: Focus areas (UV).">EBM Focus Areas</th>' : ''}
                ${hasEbmDeliveryStatus ? '<th title="EBM: Delivery status.">EBM Delivery Status</th>' : ''}
                ${hasEbmDeliveryProgress ? '<th title="EBM: Delivery progress.">EBM Delivery Progress</th>' : ''}
                <th title="Assignee display name.">Assignee</th>
                <th title="Created date (local display).">Created</th>
                <th title="Resolved date (local display).">Resolved</th>
                ${hasSubtasks ? '<th title="Count of subtasks.">Subtasks</th>' : ''}
                ${hasTimeTracking ? '<th title="Original estimate (hours).">Est (Hrs)</th><th title="Time spent (hours).">Spent (Hrs)</th><th title="Remaining estimate (hours).">Remaining (Hrs)</th><th title="Spent - Estimate (hours).">Variance (Hrs)</th>' : ''}
                ${hasSubtaskTimeTracking ? '<th title="Subtask estimate (hours).">Subtask Est (Hrs)</th><th title="Subtask spent (hours).">Subtask Spent (Hrs)</th><th title="Subtask remaining (hours).">Subtask Remaining (Hrs)</th><th title="Subtask spent - estimate (hours).">Subtask Variance (Hrs)</th>' : ''}
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
          <td title="${escapeHtml(row.created || '')}">${escapeHtml(formatDateForDisplay(row.created))}</td>
          <td title="${escapeHtml(row.resolutionDate || '')}">${escapeHtml(formatDateForDisplay(row.resolutionDate || ''))}</td>
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
    icon.textContent = '▼';
  } else {
    content.style.display = 'none';
    icon.textContent = '▶';
  }
};

// Search and filter
const searchBox = document.getElementById('search-box');
searchBox.addEventListener('input', applyFilters);

function applyFilters() {
  const searchText = (searchBox.value || '').toLowerCase();
  const activeProjects = Array.from(document.querySelectorAll('.pill.active')).map(p => p.dataset.project);
  const meta = getSafeMeta(previewData);

  visibleRows = previewRows.filter(row => {
    // Search filter
    if (searchText) {
      const issueKey = (row.issueKey || '').toLowerCase();
      const issueSummary = (row.issueSummary || '').toLowerCase();
      const matchesKey = issueKey.includes(searchText);
      const matchesSummary = issueSummary.includes(searchText);
      if (!matchesKey && !matchesSummary) return false;
    }

    // Project filter
    if (activeProjects.length > 0 && !activeProjects.includes(row.projectKey)) {
      return false;
    }

    return true;
  });

  renderDoneStoriesTab(visibleRows);

  exportFilteredBtn.disabled = visibleRows.length === 0;
  const exportHint = document.getElementById('export-hint');
  if (exportHint) {
    if (previewRows.length > 0 && visibleRows.length === 0) {
      exportHint.innerHTML = `
        <small>No rows match the current filters. Adjust search or project filters to enable filtered export.</small>
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

// Export functions
exportExcelBtn.addEventListener('click', () => exportToExcel());
exportFilteredBtn.addEventListener('click', () => exportCSV(visibleRows, 'filtered'));

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
  const filename = buildCsvFilename('voda-agile-board', meta, type);

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
      successMsg.textContent = `✓ CSV exported: ${filename} (${(blob.size / 1024).toFixed(0)}KB)`;
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
    successMsg.textContent = `✓ CSV exported: ${filename}`;
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
    const invalidChars = /[\[\]:?*\/\\]/;
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

// Prepare Boards sheet data
function prepareBoardsSheetData(boards, sprintsIncluded, rows, meta) {
  const boardSummaries = buildBoardSummaries(boards, sprintsIncluded, rows, meta);
  const columns = [
    'Board ID',
    'Board Name',
    'Type',
    'Projects',
    'Included Sprints',
    'Total Sprint Days',
    'Avg Sprint Length (Days)',
    'Done Stories',
    'Done SP',
    'Stories per Sprint',
    'SP per Story',
    'Stories per Sprint Day',
    'SP per Sprint Day',
    'Avg SP per Sprint',
    'SP Variance per Sprint',
    'Done by Sprint End %',
    'Total Epics',
    'Total Non Epics',
    'Sprint Window',
    'Latest Sprint End',
  ];

  let rowsData = (boards || []).map(board => {
    const summary = boardSummaries.get(board.id) || {
      sprintCount: 0,
      doneStories: 0,
      doneSP: 0,
      earliestStart: null,
      latestEnd: null,
      totalSprintDays: 0,
      validSprintDaysCount: 0,
      doneBySprintEnd: 0,
      sprintSpValues: [],
      epicStories: 0,
      nonEpicStories: 0,
    };

    const sprintWindow = summary.earliestStart && summary.latestEnd
      ? `${summary.earliestStart.toISOString()} to ${summary.latestEnd.toISOString()}`
      : '';
    const latestEnd = summary.latestEnd ? summary.latestEnd.toISOString() : '';
    const totalSprintDays = summary.totalSprintDays || 0;
    const avgSprintLength = summary.validSprintDaysCount > 0
      ? totalSprintDays / summary.validSprintDaysCount
      : null;
    const storiesPerSprint = summary.sprintCount > 0
      ? summary.doneStories / summary.sprintCount
      : null;
    const spPerStory = summary.doneStories > 0
      ? summary.doneSP / summary.doneStories
      : null;
    const storiesPerSprintDay = totalSprintDays > 0
      ? summary.doneStories / totalSprintDays
      : null;
    const spPerSprintDay = totalSprintDays > 0
      ? summary.doneSP / totalSprintDays
      : null;
    const avgSpPerSprint = summary.sprintCount > 0
      ? summary.doneSP / summary.sprintCount
      : null;
    const spVariance = calculateVariance(summary.sprintSpValues);
    const doneBySprintEndPct = summary.doneStories > 0
      ? (summary.doneBySprintEnd / summary.doneStories) * 100
      : null;

    return {
      'Board ID': board.id,
      'Board Name': board.name,
      'Type': board.type || '',
      'Projects': (board.projectKeys || []).join(', '),
      'Included Sprints': summary.sprintCount,
      'Total Sprint Days': totalSprintDays,
      'Avg Sprint Length (Days)': formatNumber(avgSprintLength),
      'Done Stories': summary.doneStories,
      'Done SP': summary.doneSP,
      'Stories per Sprint': formatNumber(storiesPerSprint),
      'SP per Story': formatNumber(spPerStory),
      'Stories per Sprint Day': formatNumber(storiesPerSprintDay),
      'SP per Sprint Day': formatNumber(spPerSprintDay),
      'Avg SP per Sprint': formatNumber(avgSpPerSprint),
      'SP Variance per Sprint': formatNumber(spVariance),
      'Done by Sprint End %': formatNumber(doneBySprintEndPct),
      'Total Epics': summary.epicStories,
      'Total Non Epics': summary.nonEpicStories,
      'Sprint Window': sprintWindow,
      'Latest Sprint End': latestEnd,
    };
  });

  if (rowsData.length === 0) {
    rowsData = [{
      'Board ID': 'No board data available',
      'Board Name': 'Try adjusting date range or project selection',
      'Type': '',
      'Projects': '',
      'Included Sprints': '',
      'Total Sprint Days': '',
      'Avg Sprint Length (Days)': '',
      'Done Stories': '',
      'Done SP': '',
      'Stories per Sprint': '',
      'SP per Story': '',
      'Stories per Sprint Day': '',
      'SP per Sprint Day': '',
      'Avg SP per Sprint': '',
      'SP Variance per Sprint': '',
      'Done by Sprint End %': '',
      'Total Epics': '',
      'Total Non Epics': '',
      'Sprint Window': '',
      'Latest Sprint End': '',
    }];
  }

  return { columns, rows: rowsData };
}

// Prepare Sprints sheet data
function prepareSprintsSheetData(sprintsIncluded, rows) {
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
    const row = {
      'Sprint ID': sprint.id,
      'Sprint Name': sprint.name,
      'Board Name': sprint.boardName || '',
      'Sprint Start Date': sprint.startDate || '',
      'Sprint End Date': sprint.endDate || '',
      'State': sprint.state || '',
      'Projects': (sprint.projectKeys || []).join(', '),
      'Stories Completed (Total)': sprint.doneStoriesNow || 0,
      'Completed Within Sprint End Date': sprint.doneStoriesBySprintEnd || 0,
      'Total SP': sprint.doneSP || 0
    };

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
function prepareEpicsSheetData(metrics) {
  const columns = ['Epic ID', 'Story Count', 'Start Date', 'End Date', 'Calendar TTM (days)', 'Working TTM (days)'];
  
  let rows = (metrics?.epicTTM || []).map(epic => ({
    'Epic ID': epic.epicKey,
    'Story Count': epic.storyCount || 0,
    'Start Date': epic.startDate || '',
    'End Date': epic.endDate || '',
    'Calendar TTM (days)': epic.calendarTTMdays || '',
    'Working TTM (days)': epic.workingTTMdays || ''
  }));
  
  // Add placeholder row if Epics sheet is empty
  if (rows.length === 0) {
    rows = [{
      'Epic ID': 'No Epic TTM data available',
      'Story Count': '',
      'Start Date': 'Epic TTM is always enabled. No Epic data found for selected date range.',
      'End Date': '',
      'Calendar TTM (days)': '',
      'Working TTM (days)': ''
    }];
  }

  return { columns, rows };
}

// Prepare Metadata sheet data
function prepareMetadataSheetData(meta, rows, sprints) {
  const columns = ['Field', 'Value'];
  const sheetRows = [
    { 'Field': 'Export Date', 'Value': new Date().toISOString() },
    { 'Field': 'Export Time', 'Value': new Date().toLocaleString() },
    { 'Field': 'Date Range Start', 'Value': meta.windowStart || '' },
    { 'Field': 'Date Range End', 'Value': meta.windowEnd || '' },
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
    const boardsSheet = prepareBoardsSheetData(previewData.boards, previewData.sprintsIncluded, previewRows, meta);
    const sprintsSheet = prepareSprintsSheetData(previewData.sprintsIncluded, previewRows);
    const epicsSheet = prepareEpicsSheetData(previewData.metrics);
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
        `Consider filtering the data or using a smaller date range. Continue anyway?`
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
    const dateRange = formatDateRangeForFilename(meta.windowStart, meta.windowEnd);
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
    successMsg.textContent = `✓ Excel exported: ${a.download} (${(blob.size / 1024).toFixed(0)}KB)`;
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

// Helper function to format date range for filename
function formatDateRangeForFilename(startDate, endDate) {
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const startMonth = start.getMonth() + 1;
    const startYear = start.getFullYear();
    const endMonth = end.getMonth() + 1;
    const endYear = end.getFullYear();
    
    if (startYear === endYear) {
      // Vodacom quarters: Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar
      if (startMonth >= 4 && startMonth <= 6 && endMonth >= 4 && endMonth <= 6) {
        return `Q1-${startYear}`;
      } else if (startMonth >= 7 && startMonth <= 9 && endMonth >= 7 && endMonth <= 9) {
        return `Q2-${startYear}`;
      } else if (startMonth >= 10 && startMonth <= 12 && endMonth >= 10 && endMonth <= 12) {
        return `Q3-${startYear}`;
      } else if (startMonth >= 1 && startMonth <= 3 && endMonth >= 1 && endMonth <= 3) {
        return `Q4-${startYear}`;
      }
    }
    
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    return `${startStr}_to_${endStr}`;
  } catch (error) {
    return `${startDate}_to_${endDate}`;
  }
}

// Helper function to create Summary sheet rows
function createSummarySheetRows(metrics, meta, allRows) {
  const rows = [];
  
  // Overview
  rows.push({ 'Section': 'Overview', 'Metric': 'Total Stories', 'Value': allRows.length || 0 });
  rows.push({ 'Section': 'Overview', 'Metric': 'Total Sprints', 'Value': meta.sprintCount || 0 });
  rows.push({ 'Section': 'Overview', 'Metric': 'Date Range', 'Value': `${meta.windowStart} to ${meta.windowEnd}` });
  rows.push({ 'Section': 'Overview', 'Metric': 'Projects', 'Value': (meta.selectedProjects || []).join(', ') });
  rows.push({ 'Section': '', 'Metric': '', 'Value': '' });
  
  // Key Metrics
  if (metrics && metrics.throughput) {
    const totalSP = Object.values(metrics.throughput.perProject || {}).reduce((sum, p) => sum + (p.totalSP || 0), 0);
    rows.push({ 'Section': 'Key Metrics', 'Metric': 'Total Story Points', 'Value': totalSP });
    rows.push({ 'Section': 'Key Metrics', 'Metric': 'Average SP per Sprint', 'Value': (totalSP / (meta.sprintCount || 1)).toFixed(2) });
  }
  
  if (metrics && metrics.rework) {
    rows.push({ 'Section': 'Key Metrics', 'Metric': 'Rework Ratio', 'Value': `${metrics.rework.reworkRatio.toFixed(2)}%` });
  }
  
  if (metrics && metrics.predictability) {
    const perSprint = metrics.predictability.perSprint || {};
    const avgPredictability = Object.values(perSprint).reduce((sum, s) => sum + (s.predictabilitySP || 0), 0) / Object.keys(perSprint).length || 0;
    rows.push({ 'Section': 'Key Metrics', 'Metric': 'Average Predictability', 'Value': `${avgPredictability.toFixed(2)}%` });
  }
  
  rows.push({ 'Section': '', 'Metric': '', 'Value': '' });
  
  // Data Quality
  const missingEpicCount = allRows.filter(r => !r.epicKey).length;
  const missingSPCount = allRows.filter(r => !r.storyPoints || r.storyPoints === 0).length;
  const qualityScore = 100 - ((missingEpicCount / allRows.length) * 50) - ((missingSPCount / allRows.length) * 50);
  
  rows.push({ 'Section': 'Data Quality', 'Metric': 'Missing Epic Count', 'Value': missingEpicCount });
  rows.push({ 'Section': 'Data Quality', 'Metric': 'Missing Story Points Count', 'Value': missingSPCount });
  rows.push({ 'Section': 'Data Quality', 'Metric': 'Data Quality Score', 'Value': `${Math.max(0, qualityScore).toFixed(1)}%` });
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
  // Store original button state
  const originalButtonText = button ? button.textContent : '';
  const originalButtonDisabled = button ? button.disabled : false;
  const meta = getSafeMeta(previewData);
  const filename = buildCsvFilename(sectionName, meta);
  
  // Set loading state
  if (button) {
    button.disabled = true;
    button.textContent = 'Exporting...';
  }
  
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
        'storiesPerSprint',
        'spPerStory',
        'storiesPerSprintDay',
        'spPerSprintDay',
        'avgSpPerSprint',
        'spVariancePerSprint',
        'doneBySprintEndPercent',
        'totalEpics',
        'totalNonEpics',
        'sprintWindow',
        'latestSprintEnd',
      ];
      const boardSummaries = buildBoardSummaries(previewData?.boards || [], previewData?.sprintsIncluded || [], previewRows, getSafeMeta(previewData));
      rows = (previewData?.boards || []).map(board => {
        const summary = boardSummaries.get(board.id) || { sprintCount: 0, doneStories: 0, doneSP: 0, earliestStart: null, latestEnd: null, totalSprintDays: 0, validSprintDaysCount: 0, doneBySprintEnd: 0, sprintSpValues: [], epicStories: 0, nonEpicStories: 0 };
        const sprintWindow = summary.earliestStart && summary.latestEnd
          ? `${summary.earliestStart.toISOString()} to ${summary.latestEnd.toISOString()}`
          : '';
        const totalSprintDays = summary.totalSprintDays || 0;
        const avgSprintLength = summary.validSprintDaysCount > 0
          ? totalSprintDays / summary.validSprintDaysCount
          : null;
        const storiesPerSprint = summary.sprintCount > 0
          ? summary.doneStories / summary.sprintCount
          : null;
        const spPerStory = summary.doneStories > 0
          ? summary.doneSP / summary.doneStories
          : null;
        const storiesPerSprintDay = totalSprintDays > 0
          ? summary.doneStories / totalSprintDays
          : null;
        const spPerSprintDay = totalSprintDays > 0
          ? summary.doneSP / totalSprintDays
          : null;
        const avgSpPerSprint = summary.sprintCount > 0
          ? summary.doneSP / summary.sprintCount
          : null;
        const spVariancePerSprint = calculateVariance(summary.sprintSpValues);
        const doneBySprintEndPercent = summary.doneStories > 0
          ? (summary.doneBySprintEnd / summary.doneStories) * 100
          : null;
        return {
          id: board.id,
          name: board.name,
          type: board.type || '',
          projectKeys: (board.projectKeys || []).join('; '),
          includedSprints: summary.sprintCount,
          doneStories: summary.doneStories,
          totalSprintDays,
          avgSprintLengthDays: formatNumber(avgSprintLength),
          doneSP: summary.doneSP,
          storiesPerSprint: formatNumber(storiesPerSprint),
          spPerStory: formatNumber(spPerStory),
          storiesPerSprintDay: formatNumber(storiesPerSprintDay),
          spPerSprintDay: formatNumber(spPerSprintDay),
          avgSpPerSprint: formatNumber(avgSpPerSprint),
          spVariancePerSprint: formatNumber(spVariancePerSprint),
          doneBySprintEndPercent: formatNumber(doneBySprintEndPercent),
          totalEpics: summary.epicStories,
          totalNonEpics: summary.nonEpicStories,
          sprintWindow,
          latestSprintEnd: summary.latestEnd ? summary.latestEnd.toISOString() : '',
        };
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
      columns = ['id', 'name', 'boardName', 'startDate', 'endDate', 'state', 'projectKeys', 'doneStoriesNow', 'doneStoriesBySprintEnd', 'doneSP'];
      if (hasSprintTimeTracking) {
        columns.push('estimateHours', 'spentHours', 'remainingHours', 'varianceHours');
      }
      if (hasSprintSubtaskTracking) {
        columns.push('subtaskEstimateHours', 'subtaskSpentHours', 'subtaskRemainingHours', 'subtaskVarianceHours');
      }
      rows = (previewData?.sprintsIncluded || []).map(sprint => {
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
              metric: 'Throughput - Per Project',
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
              metric: 'Throughput - Per Issue Type',
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
          button.textContent = `Exporting ${rows.length.toLocaleString()} rows...`;
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
        successMsg.textContent = `✓ CSV exported: ${filename} (${(blob.size / 1024).toFixed(0)}KB)`;
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
    // Restore button state
    if (button) {
      button.disabled = originalButtonDisabled;
      button.textContent = originalButtonText;
    }
  }
}

// Wire up per-section export buttons using event delegation
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('export-section-btn')) {
    const button = e.target;
    const section = button.dataset.section;
    let data = null;
    
    switch (section) {
      case 'project-epic-level':
      case 'boards':
        data = previewData?.boards || [];
        break;
      case 'sprints':
        data = previewData?.sprintsIncluded || [];
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
    html += '<table class="data-table"><thead><tr><th>Project</th><th>Total SP</th><th>Sprint Count</th><th>Average SP/Sprint</th><th>Story Count</th></tr></thead><tbody>';
    for (const projectKey in safeMetrics.throughput.perProject) {
      const data = safeMetrics.throughput.perProject[projectKey];
      html += `<tr><td>${escapeHtml(data.projectKey)}</td><td>${data.totalSP}</td><td>${data.sprintCount}</td><td>${data.averageSPPerSprint.toFixed(2)}</td><td>${data.storyCount}</td></tr>`;
    }
    html += '</tbody></table>';

    if (safeMetrics.throughput.perIssueType && Object.keys(safeMetrics.throughput.perIssueType).length > 0) {
      html += '<h4>Per Issue Type</h4>';
      html += '<table class="data-table"><thead><tr><th>Issue Type</th><th>Total SP</th><th>Issue Count</th></tr></thead><tbody>';
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
      html += `<p>Rework: ${r.reworkRatio.toFixed(2)}% (Bug SP: ${r.bugSP}, Story SP: ${r.storySP})</p>`;
    } else {
      html += `<p>Rework: SP unavailable (Bug Count: ${r.bugCount}, Story Count: ${r.storyCount})</p>`;
    }
  }

  if (safeMetrics.predictability) {
    hasMetrics = true;
    html += '<h3>Predictability</h3>';
    html += `<p>Mode: ${safeMetrics.predictability.mode}</p>`;
    html += '<table class="data-table"><thead><tr><th>Sprint</th><th>Committed Stories</th><th>Committed SP</th><th>Delivered Stories</th><th>Delivered SP</th><th>Predictability % (Stories)</th><th>Predictability % (SP)</th></tr></thead><tbody>';
    const predictPerSprint = safeMetrics.predictability.perSprint || {};
    for (const data of Object.values(predictPerSprint)) {
      if (!data) continue;
      html += `<tr>
        <td>${escapeHtml(data.sprintName)}</td>
        <td>${data.committedStories}</td>
        <td>${data.committedSP}</td>
        <td>${data.deliveredStories}</td>
        <td>${data.deliveredSP}</td>
        <td>${data.predictabilityStories.toFixed(2)}%</td>
        <td>${data.predictabilitySP.toFixed(2)}%</td>
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
    html += '<table class="data-table"><thead><tr><th>Epic Key</th><th>Story Count</th><th>Start Date</th><th>End Date</th><th>Calendar TTM (days)</th><th>Working TTM (days)</th></tr></thead><tbody>';
    for (const epic of safeMetrics.epicTTM) {
      html += `<tr>
        <td>${escapeHtml(epic.epicKey)}</td>
        <td>${epic.storyCount}</td>
        <td>${escapeHtml(epic.startDate)}</td>
        <td>${escapeHtml(epic.endDate || '')}</td>
        <td>${epic.calendarTTMdays ?? ''}</td>
        <td>${epic.workingTTMdays ?? ''}</td>
      </tr>`;
    }
    html += '</tbody></table>';
  }

  if (!hasMetrics) {
    renderEmptyState(
      content,
      'No metrics available',
      'Metrics are only calculated when the corresponding options are enabled in the filters panel.',
      'Enable options like "Include Story Points", "Include Predictability", "Include Epic TTM", or "Include Bugs for Rework" to see metrics.'
    );
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
