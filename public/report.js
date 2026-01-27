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
  'assigneeDisplayName',
  'created',
  'updated',
  'resolutionDate',
  'storyPoints',
  'epicKey',
];

// CSV generation (client-side)
function escapeCSVField(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
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
const exportFilteredBtn = document.getElementById('export-filtered-btn');
const exportRawBtn = document.getElementById('export-raw-btn');
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
  const prevExportRawDisabled = exportRawBtn.disabled;

  // Immediately prevent double-clicks and exporting while a preview is in flight
  previewBtn.disabled = true;
  exportFilteredBtn.disabled = true;
  exportRawBtn.disabled = true;

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
    exportRawBtn.disabled = prevExportRawDisabled;
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
    
    // Log success with data summary
    console.log('Preview loaded successfully', {
      boards: previewData.boards?.length || 0,
      sprints: previewData.sprintsIncluded?.length || 0,
      rows: previewRows.length,
      unusableSprints: previewData.sprintsUnusable?.length || 0
    });

    updateLoadingMessage('Finalizing...', 'Rendering tables and metrics');
    renderPreview();
    
    loadingEl.style.display = 'none';
    previewContent.style.display = 'block';
    exportFilteredBtn.disabled = !previewHasRows;
    exportRawBtn.disabled = !previewHasRows;
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
    includeStoryPoints: document.getElementById('include-story-points').checked,
    requireResolvedBySprintEnd: document.getElementById('require-resolved-by-sprint-end').checked,
    includeBugsForRework: document.getElementById('include-bugs-for-rework').checked,
    includePredictability: document.getElementById('include-predictability').checked,
    predictabilityMode: document.querySelector('input[name="predictability-mode"]:checked').value,
    includeEpicTTM: document.getElementById('include-epic-ttm').checked,
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
  if (fromCache && meta.cacheKey) {
    detailsLines.push('Source: Cache');
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
  renderBoardsTab(previewData.boards);
  renderSprintsTab(previewData.sprintsIncluded, previewData.metrics);
  renderDoneStoriesTab(visibleRows);
  
  if (previewData.metrics) {
    document.getElementById('metrics-tab').style.display = 'inline-block';
    renderMetricsTab(previewData.metrics);
  } else {
    document.getElementById('metrics-tab').style.display = 'none';
  }
  
  renderUnusableSprintsTab(previewData.sprintsUnusable);
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

// Render Boards tab
function renderBoardsTab(boards) {
  const content = document.getElementById('boards-content');
  
  if (!boards || boards.length === 0) {
    const title = 'No boards found';
    const message = `No boards were discovered for the selected projects (${previewData?.meta?.selectedProjects?.join(', ') || 'N/A'}) in the date window.`;
    const hint = 'Try adjusting your project selection or date range, or verify that the projects have boards configured in Jira.';
    renderEmptyState(content, title, message, hint);
    return;
  }

  let html = '<table class="data-table"><thead><tr><th>Board ID</th><th>Board Name</th><th>Type</th><th>Projects</th></tr></thead><tbody>';
  
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

  let html = '<table class="data-table"><thead><tr><th>Project</th><th>Board</th><th>Sprint</th><th>Start</th><th>End</th><th>State</th><th>Done Now</th>';
  
  if (metrics?.doneComparison) {
    html += '<th>Done by End</th>';
  }
  
  if (metrics?.throughput) {
    html += '<th>Done SP</th>';
  }
  
  html += '</tr></thead><tbody>';
  
  for (const sprint of sprints) {
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
                <th>Assignee</th>
                <th>Created</th>
                <th>Resolved</th>
                ${previewData?.meta?.discoveredFields?.storyPointsFieldId ? '<th>SP</th>' : ''}
                ${previewData?.meta?.discoveredFields?.epicLinkFieldId ? '<th>Epic</th>' : ''}
              </tr>
            </thead>
            <tbody>
    `;
    
    // Sort rows by issue key
    const sortedRows = group.rows.sort((a, b) => a.issueKey.localeCompare(b.issueKey));
    
    for (const row of sortedRows) {
      html += `
        <tr>
          <td>${row.issueKey}</td>
          <td>${row.issueSummary}</td>
          <td>${row.issueStatus}</td>
          <td>${row.assigneeDisplayName}</td>
          <td>${row.created}</td>
          <td>${row.resolutionDate || ''}</td>
          ${previewData?.meta?.discoveredFields?.storyPointsFieldId ? `<td>${row.storyPoints || ''}</td>` : ''}
          ${previewData?.meta?.discoveredFields?.epicLinkFieldId ? `<td>${row.epicKey || ''}</td>` : ''}
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
exportFilteredBtn.addEventListener('click', () => exportCSV(visibleRows, 'filtered'));
exportRawBtn.addEventListener('click', () => exportCSV(previewRows, 'raw'));

async function exportCSV(rows, type) {
  if (rows.length === 0) {
    errorEl.style.display = 'block';
    errorEl.innerHTML = `
      <strong>Export error:</strong> No data to export for the current ${type === 'filtered' ? 'filtered view' : 'preview'}.
      <br><small>Adjust your filters or run a new preview that returns at least one row, then try exporting again.</small>
    `;
    return;
  }

  if (rows.length <= 5000) {
    // Client-side generation
    const csv = generateCSVClient(CSV_COLUMNS, rows);
    downloadCSV(csv, `jira-report-${type}-${new Date().toISOString().split('T')[0]}.csv`);
  } else {
    // Server-side streaming
    try {
      const response = await fetch('/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns: CSV_COLUMNS, rows }),
      });

      if (!response.ok) {
        throw new Error('Export failed. Please try again or check the server logs for details.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jira-report-${type}-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      errorEl.style.display = 'block';
      errorEl.innerHTML = `
        <strong>Export error:</strong> ${error.message}
        <br><small>If this problem persists, verify the server is running and reachable, then try again.</small>
      `;
    }
  }
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

// Render Metrics tab
function renderMetricsTab(metrics) {
  const content = document.getElementById('metrics-content');
  let html = '';

  if (metrics.throughput) {
    html += '<h3>Throughput</h3>';
    html += '<h4>Per Sprint</h4>';
    html += '<table class="data-table"><thead><tr><th>Sprint</th><th>Total SP</th><th>Story Count</th></tr></thead><tbody>';
    for (const [sprintId, data] of metrics.throughput.perSprint.entries()) {
      html += `<tr><td>${data.sprintName}</td><td>${data.totalSP}</td><td>${data.storyCount}</td></tr>`;
    }
    html += '</tbody></table>';

    html += '<h4>Per Project</h4>';
    html += '<table class="data-table"><thead><tr><th>Project</th><th>Total SP</th><th>Sprint Count</th><th>Average SP/Sprint</th><th>Story Count</th></tr></thead><tbody>';
    for (const projectKey in metrics.throughput.perProject) {
      const data = metrics.throughput.perProject[projectKey];
      html += `<tr><td>${data.projectKey}</td><td>${data.totalSP}</td><td>${data.sprintCount}</td><td>${data.averageSPPerSprint.toFixed(2)}</td><td>${data.storyCount}</td></tr>`;
    }
    html += '</tbody></table>';
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
    for (const [sprintId, data] of metrics.predictability.perSprint.entries()) {
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
