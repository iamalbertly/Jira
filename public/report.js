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
  'assigneeDisplayName',
  'created',
  'updated',
  'resolutionDate',
  'storyPoints',
  'epicKey',
  'epicTitle',
  'epicSummary',
];

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
  const loadingSteps = document.getElementById('loading-steps');
  
  if (loadingMessage) {
    loadingMessage.textContent = message;
  }
  
  if (step && loadingSteps) {
    const stepEl = document.createElement('div');
    stepEl.className = 'loading-step';
    stepEl.textContent = step;
    loadingSteps.appendChild(stepEl);
  }
}

// Shared empty-state renderer
function renderEmptyState(targetElement, title, message, hint) {
  if (!targetElement) return;
  targetElement.innerHTML = `
      <div class="empty-state">
        <p><strong>${title}</strong></p>
        <p>${message}</p>
        ${hint ? `<p><small>${hint}</small></p>` : ''}
      </div>
    `;
}

// Preview button
previewBtn.addEventListener('click', async () => {
  let timeoutId;
  let progressInterval;

  // Capture existing export state so we can restore it on early validation errors
  const prevExportFilteredDisabled = exportFilteredBtn.disabled;
  const prevExportExcelDisabled = exportExcelBtn.disabled;

  // Immediately prevent double-clicks and exporting while a preview is in flight
  previewBtn.disabled = true;
    exportFilteredBtn.disabled = true;
    exportExcelBtn.disabled = true;

  loadingEl.style.display = 'block';
  errorEl.style.display = 'none';
  previewContent.style.display = 'none';

  // Clear previous steps
  const loadingSteps = document.getElementById('loading-steps');
  if (loadingSteps) loadingSteps.innerHTML = '';

  updateLoadingMessage('Preparing request...', 'Collecting filter parameters');

  let params;
  try {
    params = collectFilterParams();
  } catch (error) {
    // Client-side validation error before network call
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    errorEl.innerHTML = `
      <strong>Error:</strong> ${error.message}
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
  
    if (!response.ok) {
      const error = await response.json();
      const errorMsg = error.message || error.error || 'Failed to fetch preview';
      const errorCode = error.code || 'UNKNOWN_ERROR';
      
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
    
    previewData = await response.json();
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
      <strong>Error:</strong> ${errorMsg}
      <br><small>If this problem persists, please check your Jira connection and try again.</small>
    `;
  } finally {
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
    exportRawBtn.disabled = !hasRows;
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
    // datetime-local format: YYYY-MM-DDTHH:mm
    // Create date in local timezone, then convert to UTC
    const localStart = new Date(startDate);
    startISO = new Date(localStart.getTime() - localStart.getTimezoneOffset() * 60000).toISOString();
  } else {
    startISO = '2025-04-01T00:00:00.000Z';
  }
  
  if (endDate) {
    const localEnd = new Date(endDate);
    // Set to end of day (23:59:59.999)
    localEnd.setHours(23, 59, 59, 999);
    endISO = new Date(localEnd.getTime() - localEnd.getTimezoneOffset() * 60000).toISOString();
  } else {
    endISO = '2025-06-30T23:59:59.999Z';
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

// Render preview
function renderPreview() {
  if (!previewData) return;

  // Render meta
  const meta = previewData.meta;
  const boardsCount = previewData.boards?.length || 0;
  const sprintsCount = previewData.sprintsIncluded?.length || 0;
  const rowsCount = (previewData.rows || []).length;
  const unusableCount = previewData.sprintsUnusable?.length || 0;
  const startDate = new Date(meta.windowStart);
  const endDate = new Date(meta.windowEnd);
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

  const partialNotice = partial
    ? `<br><span class="partial-warning"><strong>Note:</strong> This preview is <em>partial</em> because: ${partialReason || 'time budget exceeded or limits reached.'} Data may be incomplete; consider narrowing the date range or reducing options and trying again.</span>`
    : '';
  
  previewMeta.innerHTML = `
    <div class="meta-info">
      <strong>Projects:</strong> ${meta.selectedProjects.join(', ')}<br>
      <strong>Date Window (UTC):</strong> ${meta.windowStart} to ${meta.windowEnd}<br>
      <strong>Date Window (Local):</strong> ${startDate.toLocaleString()} to ${endDate.toLocaleString()}<br>
      <strong>Summary:</strong> Boards: ${boardsCount} • Included sprints: ${sprintsCount} • Done stories: ${rowsCount} • Unusable sprints: ${unusableCount}<br>
      <strong>Details:</strong> ${detailsLines.join(' • ')}
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
  exportRawBtn.disabled = !hasRows;

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

  // Render tabs
  renderProjectEpicLevelTab(previewData.boards, previewData.metrics);
  renderSprintsTab(previewData.sprintsIncluded, previewData.metrics);
  renderDoneStoriesTab(visibleRows);
  renderUnusableSprintsTab(previewData.sprintsUnusable);
  
  // Show/hide per-section export buttons based on data availability
  // Use requestAnimationFrame to ensure DOM updates complete before checking button visibility
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
}

// Update date display
function updateDateDisplay() {
  const startDate = document.getElementById('start-date').value;
  const endDate = document.getElementById('end-date').value;
  
  if (startDate && endDate) {
    const startISO = new Date(startDate).toISOString();
    const endISO = new Date(endDate + ':59.999').toISOString();
    const startLocal = new Date(startDate).toLocaleString();
    const endLocal = new Date(endDate + ':59.999').toLocaleString();
    
    document.getElementById('date-display').innerHTML = `
      <small>
        UTC: ${startISO} to ${endISO}<br>
        Local: ${startLocal} to ${endLocal}
      </small>
    `;
  }
}

document.getElementById('start-date').addEventListener('change', updateDateDisplay);
document.getElementById('end-date').addEventListener('change', updateDateDisplay);

// Render Project & Epic Level tab (merged Boards + Metrics)
function renderProjectEpicLevelTab(boards, metrics) {
  const content = document.getElementById('project-epic-level-content');
  let html = '';

  // Section 1: Boards
  html += '<h3>Boards</h3>';
  if (!boards || boards.length === 0) {
    html += '<p><em>No boards were discovered for the selected projects in the date window.</em></p>';
  } else {
    html += '<table class="data-table"><thead><tr><th>Board ID</th><th>Board Name</th><th>Type</th><th>Projects</th></tr></thead><tbody>';
    for (const board of boards) {
      html += `
        <tr>
          <td>${board.id}</td>
          <td>${board.name}</td>
          <td>${board.type || ''}</td>
          <td>${board.projectKeys?.join(', ') || ''}</td>
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
      html += '<p class="metrics-hint"><small>Note: Per Sprint data is shown in the Sprints tab. Below are aggregated views.</small></p>';
      
      html += '<h4>Per Project</h4>';
      html += '<table class="data-table"><thead><tr><th>Project</th><th>Total SP</th><th>Sprint Count</th><th>Average SP/Sprint</th><th>Story Count</th></tr></thead><tbody>';
      for (const projectKey in metrics.throughput.perProject) {
        const data = metrics.throughput.perProject[projectKey];
        html += `<tr><td>${data.projectKey}</td><td>${data.totalSP}</td><td>${data.sprintCount}</td><td>${data.averageSPPerSprint.toFixed(2)}</td><td>${data.storyCount}</td></tr>`;
      }
      html += '</tbody></table>';

      if (metrics.throughput.perIssueType && Object.keys(metrics.throughput.perIssueType).length > 0) {
        html += '<h4>Per Issue Type</h4>';
        html += '<table class="data-table"><thead><tr><th>Issue Type</th><th>Total SP</th><th>Issue Count</th></tr></thead><tbody>';
        for (const issueType in metrics.throughput.perIssueType) {
          const data = metrics.throughput.perIssueType[issueType];
          html += `<tr><td>${data.issueType || 'Unknown'}</td><td>${data.totalSP}</td><td>${data.issueCount}</td></tr>`;
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
      html += `<p>Mode: ${metrics.predictability.mode}</p>`;
      html += '<table class="data-table"><thead><tr><th>Sprint</th><th>Committed Stories</th><th>Committed SP</th><th>Delivered Stories</th><th>Delivered SP</th><th>Predictability % (Stories)</th><th>Predictability % (SP)</th></tr></thead><tbody>';
      const predictPerSprint = metrics.predictability.perSprint || {};
      for (const data of Object.values(predictPerSprint)) {
        if (!data) continue;
        html += `<tr>
          <td>${data.sprintName}</td>
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
      if (previewData?.meta?.epicTTMFallbackCount > 0) {
        html += `<p class="data-quality-warning"><small>Note: ${previewData.meta.epicTTMFallbackCount} epic(s) used story date fallback (Epic issues unavailable).</small></p>`;
      }
      html += '<table class="data-table"><thead><tr><th>Epic Key</th><th>Story Count</th><th>Start Date</th><th>End Date</th><th>Calendar TTM (days)</th><th>Working TTM (days)</th></tr></thead><tbody>';
      for (const epic of metrics.epicTTM) {
        html += `<tr>
          <td>${epic.epicKey}</td>
          <td>${epic.storyCount}</td>
          <td>${epic.startDate}</td>
          <td>${epic.endDate || ''}</td>
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
  
  if (!sprints || sprints.length === 0) {
    const windowInfo = previewData?.meta ? 
      `${new Date(previewData.meta.windowStart).toLocaleDateString()} to ${new Date(previewData.meta.windowEnd).toLocaleDateString()}` : 
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

  let html = '<table class="data-table"><thead><tr><th>Project</th><th>Board</th><th>Sprint</th><th>Start</th><th>End</th><th>State</th><th title="Stories currently marked Done vs stories resolved by the sprint end date">Stories Completed (Total)</th>';
  
  if (metrics?.doneComparison) {
    html += '<th title="Stories currently marked Done vs stories resolved by the sprint end date">Completed Within Sprint End Date</th>';
  }
  
  if (metrics?.throughput) {
    html += '<th>Done SP</th><th>Total SP</th><th>Story Count</th>';
  }
  
  html += '</tr></thead><tbody>';
  
  for (const sprint of sprints) {
    const throughputData = throughputMap.get(sprint.id);
    
    html += `
      <tr>
        <td>${sprint.projectKeys?.join(', ') || ''}</td>
        <td>${sprint.boardName || ''}</td>
        <td>${sprint.name || ''}</td>
        <td>${sprint.startDate || ''}</td>
        <td>${sprint.endDate || ''}</td>
        <td>${sprint.state || ''}</td>
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
    
    html += '</tr>';
  }
  
  html += '</tbody></table>';
  content.innerHTML = html;
}

// Render Done Stories tab
function renderDoneStoriesTab(rows) {
  const content = document.getElementById('done-stories-content');
  const totalsBar = document.getElementById('done-stories-totals');
  
  if (!rows || rows.length === 0) {
    const searchText = document.getElementById('search-box')?.value || '';
    const activeProjects = Array.from(document.querySelectorAll('.pill.active')).map(p => p.dataset.project);
    const requireResolved = !!previewData?.meta?.requireResolvedBySprintEnd;
    const totalPreviewRows = (previewData?.rows || []).length;

    let title = 'No done stories found';
    let message;
    let hint;

    if (requireResolved && totalPreviewRows > 0) {
      message = 'No stories passed the "Require resolved by sprint end" filter.';
      hint = 'Try turning off this option to see all Done stories, or inspect sprint end dates and resolution dates in Jira.';
    } else if (searchText || activeProjects.length < previewData?.meta?.selectedProjects?.length) {
      message = 'No stories match your current filters.';
      hint = 'Try adjusting your search text or project filters, or check if stories are marked as "Done" in the selected sprints.';
    } else {
      message = 'No stories with status "Done" were found in the selected sprints for the chosen projects.';
      hint = 'This could mean: (1) No stories were completed in these sprints, (2) Stories are not marked as "Done", or (3) the current filters are excluding stories. Try adjusting your filters.';
    }

    renderEmptyState(content, title, message, hint);
    totalsBar.innerHTML = '';
    return;
  }

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
          <strong>${group.sprint.name}</strong>
          <span class="sprint-meta">${group.sprint.startDate} to ${group.sprint.endDate}</span>
          <span class="story-count">${group.rows.length} stories</span>
        </button>
        <div class="sprint-content" id="${sprintKey}" style="display: none;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Summary</th>
                <th>Status</th>
                <th>Type</th>
                <th>Assignee</th>
                <th>Created</th>
                <th>Resolved</th>
                ${previewData?.meta?.discoveredFields?.storyPointsFieldId ? '<th>SP</th>' : ''}
                ${previewData?.meta?.discoveredFields?.epicLinkFieldId ? '<th>Epic Key</th><th>Epic Title</th><th>Epic Summary</th>' : ''}
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
      if (previewData?.meta?.discoveredFields?.epicLinkFieldId && row.epicSummary && typeof row.epicSummary === 'string' && row.epicSummary.length > 0) {
        if (row.epicSummary.length > 100) {
          epicSummaryDisplay = row.epicSummary.substring(0, 100) + '...';
          epicSummaryTitle = row.epicSummary;
        } else {
          epicSummaryDisplay = row.epicSummary;
        }
      }
      
      html += `
        <tr>
          <td>${row.issueKey}</td>
          <td>${row.issueSummary}</td>
          <td>${row.issueStatus}</td>
          <td>${row.issueType || '<em>Unknown</em>'}</td>
          <td>${row.assigneeDisplayName}</td>
          <td>${row.created}</td>
          <td>${row.resolutionDate || ''}</td>
          ${previewData?.meta?.discoveredFields?.storyPointsFieldId ? `<td>${row.storyPoints || ''}</td>` : ''}
          ${previewData?.meta?.discoveredFields?.epicLinkFieldId ? `
            <td>${row.epicKey || ''}</td>
            <td>${row.epicTitle || ''}</td>
            <td${epicSummaryTitle ? ` title="${epicSummaryTitle.replace(/"/g, '&quot;')}"` : ''}>${epicSummaryDisplay || ''}</td>
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
  if (previewData?.meta?.discoveredFields?.storyPointsFieldId) {
    totalSP = rows.reduce((sum, r) => sum + (parseFloat(r.storyPoints) || 0), 0);
  }

  totalsBar.innerHTML = `
    <div class="totals">
      <strong>Total Rows:</strong> ${rows.length} | 
      <strong>Unique Sprints:</strong> ${uniqueSprints}
      ${previewData?.meta?.discoveredFields?.storyPointsFieldId ? ` | <strong>Total SP:</strong> ${totalSP}` : ''}
    </div>
  `;

  // Render project pills
  const projectPills = document.getElementById('project-pills');
  const projects = [...new Set(rows.map(r => r.projectKey))];
  projectPills.innerHTML = projects.map(p => 
    `<span class="pill active" data-project="${p}">${p}</span>`
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
  const searchText = searchBox.value.toLowerCase();
  const activeProjects = Array.from(document.querySelectorAll('.pill.active')).map(p => p.dataset.project);

  visibleRows = previewRows.filter(row => {
    // Search filter
    if (searchText) {
      const matchesKey = row.issueKey.toLowerCase().includes(searchText);
      const matchesSummary = row.issueSummary.toLowerCase().includes(searchText);
      if (!matchesKey && !matchesSummary) return false;
    }

    // Project filter
    if (activeProjects.length > 0 && !activeProjects.includes(row.projectKey)) {
      return false;
    }

    return true;
  });

  renderDoneStoriesTab(visibleRows);
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
  if (rows.length === 0) {
    errorEl.style.display = 'block';
    errorEl.innerHTML = `
      <strong>Export error:</strong> No data to export for the current ${type === 'filtered' ? 'filtered view' : 'preview'}.
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
      <strong>Export error:</strong> ${error.message}
      <br><small>CSV export validation failed. Please refresh the page and try again.</small>
    `;
    return;
  }

  // Bonus Edge Case 2: Handle very large CSV exports (>10MB) gracefully
  const estimatedSize = JSON.stringify(rows).length; // Rough estimate
  const maxClientSize = 10 * 1024 * 1024; // 10MB threshold
  
  if (rows.length <= 5000 && estimatedSize < maxClientSize) {
    // Client-side generation for smaller datasets
    const csv = generateCSVClient(CSV_COLUMNS, rows);
    downloadCSV(csv, `jira-report-${type}-${new Date().toISOString().split('T')[0]}.csv`);
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
      a.download = `jira-report-${type}-${new Date().toISOString().split('T')[0]}.csv`;
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
      successMsg.textContent = `✓ CSV exported: jira-report-${type}-${new Date().toISOString().split('T')[0]}.csv (${(blob.size / 1024).toFixed(0)}KB)`;
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
      <br><small>Error: ${error.message}</small>
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
  'assigneeDisplayName': 'Assignee',
  'created': 'Created Date',
  'updated': 'Updated Date',
  'resolutionDate': 'Completed Date',
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

// Prepare Sprints sheet data
function prepareSprintsSheetData(sprintsIncluded) {
  const columns = ['Sprint ID', 'Sprint Name', 'Board Name', 'Sprint Start Date', 'Sprint End Date', 'State', 'Projects', 'Stories Completed (Total)', 'Completed Within Sprint End Date', 'Total SP'];
  
  let rows = (sprintsIncluded || []).map(sprint => ({
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
  }));
  
  // Add placeholder row if Sprints sheet is empty
  if (rows.length === 0) {
    rows = [{
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
    }];
  }

  return { columns, rows };
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
    { 'Field': 'Date Range Start', 'Value': meta.windowStart },
    { 'Field': 'Date Range End', 'Value': meta.windowEnd },
    { 'Field': 'Projects', 'Value': (meta.selectedProjects || []).join(', ') },
    { 'Field': 'Total Stories', 'Value': rows.length },
    { 'Field': 'Total Sprints', 'Value': (sprints || []).length },
    { 'Field': 'Data Freshness', 'Value': meta.fromCache ? `Cached (${meta.cacheAgeMinutes} minutes old)` : 'Fresh' }
  ];

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
    // Prepare all sheet data using extracted functions
    const storiesSheet = prepareStoriesSheetData(previewRows, previewData.metrics);
    const sprintsSheet = prepareSprintsSheetData(previewData.sprintsIncluded);
    const epicsSheet = prepareEpicsSheetData(previewData.metrics);
    const metadataSheet = prepareMetadataSheetData(previewData.meta, previewRows, previewData.sprintsIncluded);
    
    // Prepare Summary sheet data
    const summaryColumns = ['Section', 'Metric', 'Value'];
    const summaryRows = createSummarySheetRows(previewData.metrics, previewData.meta, previewRows);

    // Build workbook data from prepared sheets
    const workbookData = {
      sheets: [
        { name: 'Summary', columns: summaryColumns, rows: summaryRows },
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
      body: JSON.stringify({ workbookData, meta: previewData.meta })
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
    const projects = (previewData.meta.selectedProjects || []).join('-');
    const dateRange = formatDateRangeForFilename(previewData.meta.windowStart, previewData.meta.windowEnd);
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
      if (startMonth >= 1 && startMonth <= 3 && endMonth >= 1 && endMonth <= 3) {
        return `Q1-${startYear}`;
      } else if (startMonth >= 4 && startMonth <= 6 && endMonth >= 4 && endMonth <= 6) {
        return `Q2-${startYear}`;
      } else if (startMonth >= 7 && startMonth <= 9 && endMonth >= 7 && endMonth <= 9) {
        return `Q3-${startYear}`;
      } else if (startMonth >= 10 && startMonth <= 12 && endMonth >= 10 && endMonth <= 12) {
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
  
  // Set loading state
  if (button) {
    button.disabled = true;
    button.textContent = 'Exporting...';
  }
  
  try {
    if (!data || (Array.isArray(data) && data.length === 0) || (typeof data === 'object' && Object.keys(data).length === 0)) {
      errorEl.style.display = 'block';
      errorEl.innerHTML = `
        <strong>Export error:</strong> No data to export for ${sectionName} section.
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
      // Combined boards and metrics export
      columns = ['id', 'name', 'type', 'projectKeys'];
      rows = (previewData?.boards || []).map(board => ({
        id: board.id,
        name: board.name,
        type: board.type || '',
        projectKeys: (board.projectKeys || []).join('; ')
      }));
      // Note: Metrics data is included in Excel export, not CSV per-section export
      break;
    case 'sprints':
      columns = ['id', 'name', 'boardName', 'startDate', 'endDate', 'state', 'projectKeys', 'doneStoriesNow', 'doneStoriesBySprintEnd', 'doneSP'];
      rows = (previewData?.sprintsIncluded || []).map(sprint => ({
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
      }));
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
        <strong>Export error:</strong> Unknown section: ${sectionName}
      `;
      return;
    }

    if (rows.length === 0) {
      errorEl.style.display = 'block';
      let errorMessage = `No data to export for ${sectionName} section.`;
      if (sectionName === 'done-stories' && previewData?.meta?.discoveredFields?.epicLinkFieldId) {
        errorMessage += ' Note: Epic Title and Summary columns will be empty if Epic Link field exists but Epic issues are unavailable or stories are not linked to Epics.';
      } else if (sectionName === 'done-stories' && !previewData?.meta?.discoveredFields?.epicLinkFieldId) {
        errorMessage += ' Note: Epic data (Epic Key, Title, Summary) is only available when Epic Link field is discovered in your Jira instance.';
      }
      errorEl.innerHTML = `
        <strong>Export error:</strong> ${errorMessage}
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
      const dateStr = new Date().toISOString().split('T')[0];
      downloadCSV(csv, `${sectionName}-${dateStr}.csv`);
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
        const dateStr = new Date().toISOString().split('T')[0];
        a.download = `${sectionName}-${dateStr}.csv`;
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
        successMsg.textContent = `✓ CSV exported: ${sectionName}-${dateStr}.csv (${(blob.size / 1024).toFixed(0)}KB)`;
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
      case 'project-epic-level':
        data = previewData?.boards || [];
        break;
    }
    
    exportSectionCSV(section, data, button);
  }
});

// Render Metrics tab
function renderMetricsTab(metrics) {
  const content = document.getElementById('metrics-content');
  let html = '';

  // Brief hint linking metrics to filter options
  html += '<p class="metrics-hint"><small>Metrics sections depend on options in the filters panel (e.g. Story Points for Throughput, Bugs for Rework, Epic TTM for Epic Time-To-Market).</small></p>';

  if (metrics.throughput) {
    html += '<h3>Throughput</h3>';
    html += '<p class="metrics-hint"><small>Note: Per Sprint data is shown in the Sprints tab. Below are aggregated views.</small></p>';
    html += '<h4>Per Project</h4>';
    html += '<table class="data-table"><thead><tr><th>Project</th><th>Total SP</th><th>Sprint Count</th><th>Average SP/Sprint</th><th>Story Count</th></tr></thead><tbody>';
    for (const projectKey in metrics.throughput.perProject) {
      const data = metrics.throughput.perProject[projectKey];
      html += `<tr><td>${data.projectKey}</td><td>${data.totalSP}</td><td>${data.sprintCount}</td><td>${data.averageSPPerSprint.toFixed(2)}</td><td>${data.storyCount}</td></tr>`;
    }
    html += '</tbody></table>';

    if (metrics.throughput.perIssueType && Object.keys(metrics.throughput.perIssueType).length > 0) {
      html += '<h4>Per Issue Type</h4>';
      html += '<table class="data-table"><thead><tr><th>Issue Type</th><th>Total SP</th><th>Issue Count</th></tr></thead><tbody>';
      for (const issueType in metrics.throughput.perIssueType) {
        const data = metrics.throughput.perIssueType[issueType];
        html += `<tr><td>${data.issueType || 'Unknown'}</td><td>${data.totalSP}</td><td>${data.issueCount}</td></tr>`;
      }
      html += '</tbody></table>';
    } else if (metrics.throughput && previewData?.meta?.discoveredFields?.storyPointsFieldId) {
      html += '<h4>Per Issue Type</h4>';
      html += '<p><em>No issue type breakdown available. Enable "Include Bugs for Rework" to see Bug vs Story breakdown.</em></p>';
    }
  }

  if (metrics.rework) {
    html += '<h3>Rework Ratio</h3>';
    const r = metrics.rework;
    if (r.spAvailable) {
      html += `<p>Rework: ${r.reworkRatio.toFixed(2)}% (Bug SP: ${r.bugSP}, Story SP: ${r.storySP})</p>`;
    } else {
      html += `<p>Rework: SP unavailable (Bug Count: ${r.bugCount}, Story Count: ${r.storyCount})</p>`;
    }
  }

  if (metrics.predictability) {
    html += '<h3>Predictability</h3>';
    html += `<p>Mode: ${metrics.predictability.mode}</p>`;
    html += '<table class="data-table"><thead><tr><th>Sprint</th><th>Committed Stories</th><th>Committed SP</th><th>Delivered Stories</th><th>Delivered SP</th><th>Predictability % (Stories)</th><th>Predictability % (SP)</th></tr></thead><tbody>';
    const predictPerSprint = metrics.predictability.perSprint || {};
    for (const data of Object.values(predictPerSprint)) {
      if (!data) continue;
      html += `<tr>
        <td>${data.sprintName}</td>
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

  if (metrics.epicTTM) {
    html += '<h3>Epic Time-To-Market</h3>';
    html += '<p class="metrics-hint"><strong>Definition:</strong> Epic Time-To-Market measures days from Epic creation to Epic resolution (or first story created to last story resolved if Epic dates unavailable).</p>';
    if (previewData?.meta?.epicTTMFallbackCount > 0) {
      html += `<p class="data-quality-warning"><small>Note: ${previewData.meta.epicTTMFallbackCount} epic(s) used story date fallback (Epic issues unavailable).</small></p>`;
    }
    html += '<table class="data-table"><thead><tr><th>Epic Key</th><th>Story Count</th><th>Start Date</th><th>End Date</th><th>Calendar TTM (days)</th><th>Working TTM (days)</th></tr></thead><tbody>';
    for (const epic of metrics.epicTTM) {
      html += `<tr>
        <td>${epic.epicKey}</td>
        <td>${epic.storyCount}</td>
        <td>${epic.startDate}</td>
        <td>${epic.endDate || ''}</td>
        <td>${epic.calendarTTMdays ?? ''}</td>
        <td>${epic.workingTTMdays ?? ''}</td>
      </tr>`;
    }
    html += '</tbody></table>';
  }

  if (!html) {
    renderEmptyState(
      content,
      'No metrics available',
      'Metrics are only calculated when the corresponding options are enabled in the filters panel.',
      'Enable options like "Include Story Points", "Include Predictability", "Include Epic TTM", or "Include Bugs for Rework" to see metrics.'
    );
  } else {
    content.innerHTML = html;
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
        <td>${sprint.boardName || ''}</td>
        <td>${sprint.name || ''}</td>
        <td>${sprint.reason || ''}</td>
      </tr>
    `;
  }
  
  html += '</tbody></table>';
  content.innerHTML = html;
}
