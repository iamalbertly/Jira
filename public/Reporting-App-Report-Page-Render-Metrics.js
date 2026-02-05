import { reportState } from './Reporting-App-Report-Page-State.js';
import { getSafeMeta, renderEmptyState } from './Reporting-App-Report-Page-Render-Helpers.js';
import { formatDateForDisplay, formatNumber, formatPercent } from './Reporting-App-Shared-Format-DateNumber-Helpers.js';
import { escapeHtml } from './Reporting-App-Shared-Dom-Escape-Helpers.js';
import { buildPredictabilityTableHeaderHtml, buildEpicAdhocRows, renderEpicKeyCell, renderEpicTitleCell, renderEpicStoryList, renderEpicSubtaskHours } from './Reporting-App-Report-Page-Render-Epic-Helpers.js';

export function renderMetricsTab(metrics) {
  const content = document.getElementById('metrics-content');
  const meta = getSafeMeta(reportState.previewData);
  const safeMetrics = metrics || {};
  let html = '';
  let hasMetrics = false;
  const hintHtml = '<p class="metrics-hint"><small>Metrics sections depend on options in the filters panel (e.g. Story Points for Throughput, Bugs for Rework, Epic TTM for Epic Time-To-Market).</small></p>';

  if (safeMetrics.throughput) {
    hasMetrics = true;
    html += '<h3>Throughput</h3>';
    html += '<p class="metrics-hint"><small>Note: Per Sprint data is shown in the Sprints tab. Below are aggregated views.</small></p>';
    // If Boards are present, we merge per-project throughput into the Boards table and avoid duplicate tables here.
    if (reportState.previewData && Array.isArray(reportState.previewData.boards) && reportState.previewData.boards.length > 0) {
      html += '<h4>Per Project</h4>';
      html += '<p><em>Per-project throughput has been merged into the <strong>Boards</strong> table for a unified view. <button type="button" class="btn-ghost" data-action="open-boards-tab">Open Boards</button></em></p>';
    } else {
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
    }

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
    if (meta?.epicTitleMissingCount > 0) {
      html += `<p class="data-quality-warning"><small>Note: ${meta.epicTitleMissingCount} epic(s) are missing titles. Check Jira permissions or Epic keys.</small></p>`;
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
      '<th title="Sum of subtask time spent (hours) across stories in this epic." data-tooltip="Sum of subtask time spent (hours) across stories in this epic.">Subtask Spent (Hrs)</th>' +
      '</tr></thead><tbody>';
    const epicRows = [...safeMetrics.epicTTM, ...buildEpicAdhocRows(reportState.previewRows)];
    for (const epic of epicRows) {
      html += `<tr>
        <td>${renderEpicKeyCell(epic, meta)}</td>
        <td>${renderEpicTitleCell(epic)}</td>
        <td>${renderEpicStoryList(epic, meta, reportState.previewRows)}</td>
        <td>${epic.storyCount}</td>
        <td>${escapeHtml(formatDateForDisplay(epic.startDate))}</td>
        <td>${escapeHtml(formatDateForDisplay(epic.endDate || ''))}</td>
        <td>${epic.calendarTTMdays ?? ''}</td>
        <td>${epic.workingTTMdays ?? ''}</td>
        <td>${renderEpicSubtaskHours(epic)}</td>
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
    try { import('./Reporting-App-Shared-Dom-Escape-Helpers.js').then(({ addTitleForTruncatedCells }) => addTitleForTruncatedCells('#metrics-content table.data-table th, #metrics-content table.data-table td')).catch(() => {}); } catch (e) {}
  }
} 
