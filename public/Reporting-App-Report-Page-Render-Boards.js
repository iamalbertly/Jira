import { reportState } from './Reporting-App-Report-Page-State.js';
import { buildBoardSummaries } from './Reporting-App-Shared-Boards-Summary-Builder.js';
import { renderEmptyState, getSafeMeta } from './Reporting-App-Report-Page-Render-Helpers.js';
import { escapeHtml } from './Reporting-App-Shared-Dom-Escape-Helpers.js';
import { formatDateForDisplay, formatPercent } from './Reporting-App-Shared-Format-DateNumber-Helpers.js';
import { computeBoardRowFromSummary, computeBoardsSummaryRow } from './Reporting-App-Report-Page-Render-Boards-Summary-Helpers.js';
import { buildPredictabilityTableHeaderHtml, buildEpicAdhocRows, renderEpicKeyCell, renderEpicTitleCell, renderEpicStoryList, renderEpicSubtaskHours } from './Reporting-App-Report-Page-Render-Epic-Helpers.js';

const BOARD_TABLE_COLUMN_ORDER = [
  'Board', 'Projects', 'Sprints', 'Sprint Days', 'Avg Sprint Days', 'Done Stories', 'Registered Work Hours', 'Estimated Work Hours', 'Done SP',
  'Committed SP', 'Delivered SP', 'SP Estimation %', 'Stories / Sprint', 'SP / Story', 'Stories / Day',
  'SP / Day', 'SP / Sprint', 'SP Variance', 'Indexed Delivery', 'On-Time %', 'Planned', 'Ad-hoc',
  'Active Assignees', 'Stories / Assignee', 'SP / Assignee', 'Assumed Capacity (PD)', 'Assumed Waste %',
  'Sprint Window', 'Latest End'
];

const BOARD_TABLE_HEADER_TOOLTIPS = {
  'Board': 'Board name in Jira.',
  'Projects': 'Projects linked to the board.',
  'Sprints': 'Count of sprints in window.',
  'Sprint Days': 'Total working days across sprints.',
  'Avg Sprint Days': 'Average sprint length (working days).',
  'Done Stories': 'Stories completed in window.',
  'Registered Work Hours': 'Sum of work logged from subtasks (and story) in window.',
  'Estimated Work Hours': 'Sum of estimated hours from subtasks (and story) in window.',
  'Done SP': 'Story points completed (if configured).',
  'Committed SP': 'Story points committed at sprint start.',
  'Delivered SP': 'Story points delivered by sprint end.',
  'SP Estimation %': 'Delivered SP / Committed SP.',
  'Stories / Sprint': 'Avg stories per sprint.',
  'SP / Story': 'Avg SP per story.',
  'Stories / Day': 'Stories per day.',
  'SP / Day': 'SP per day.',
  'SP / Sprint': 'SP per sprint.',
  'SP Variance': 'Variance of SP by sprint.',
  'Indexed Delivery': 'Current SP/day vs own baseline.',
  'On-Time %': 'Stories done by sprint end.',
  'Planned': 'Stories with epic links.',
  'Ad-hoc': 'Stories without epic links.',
  'Active Assignees': 'Unique assignees in window.',
  'Stories / Assignee': 'Stories per assignee.',
  'SP / Assignee': 'SP per assignee.',
  'Assumed Capacity (PD)': 'Assumed capacity based on 18 PD/assignee/month.',
  'Assumed Waste %': 'Assumed unused capacity (estimate).',
  'Sprint Window': 'Earliest to latest sprint dates.',
  'Latest End': 'Latest sprint end date.',
};

const BOARD_SUMMARY_TOOLTIPS = {
  'Board': 'Totals across boards.',
  'Projects': 'Aggregate across selected projects.',
  'Sprints': 'Total sprints in window.',
  'Sprint Days': 'Total sprint days.',
  'Avg Sprint Days': 'Average sprint length.',
  'Done Stories': 'Total done stories.',
  'Registered Work Hours': 'Total registered work hours.',
  'Estimated Work Hours': 'Total estimated work hours.',
  'Done SP': 'Total done SP.',
  'Committed SP': 'Total committed SP.',
  'Delivered SP': 'Total delivered SP.',
  'SP Estimation %': 'Average estimation accuracy.',
  'Stories / Sprint': 'Average stories per sprint.',
  'SP / Story': 'Average SP per story.',
  'Stories / Day': 'Average stories per day.',
  'SP / Day': 'Average SP per day.',
  'SP / Sprint': 'Average SP per sprint.',
  'SP Variance': 'Average variance across boards.',
  'Indexed Delivery': 'Not computed for totals.',
  'On-Time %': 'Average on-time %.',
  'Planned': 'Total planned stories.',
  'Ad-hoc': 'Total ad-hoc stories.',
  'Active Assignees': 'Sum of active assignees.',
  'Stories / Assignee': 'Average stories per assignee.',
  'SP / Assignee': 'Average SP per assignee.',
  'Assumed Capacity (PD)': 'Total assumed capacity.',
  'Assumed Waste %': 'Average waste %.',
  'Sprint Window': 'Overall window.',
  'Latest End': 'Latest end date.',
};

export function renderProjectEpicLevelTab(boards, metrics) {
  const content = document.getElementById('project-epic-level-content');
  const meta = getSafeMeta(reportState.previewData);
  const spEnabled = !!meta?.discoveredFields?.storyPointsFieldId;
  let html = '';
  const predictabilityPerSprint = metrics?.predictability?.perSprint || null;
  const boardSummaries = buildBoardSummaries(boards, reportState.previewData?.sprintsIncluded || [], reportState.previewRows, meta, predictabilityPerSprint);

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
    if (reportState.previewData?.boards?.length > 0) {
      html += '<p><em>No boards match the current filters. Adjust search or project filters.</em></p>';
    } else {
      html += '<p><em>No boards were discovered for the selected projects in the date window.</em></p><p><small>Try a different date range or project selection.</small></p>';
    }
  } else {
    html += '<h3>Boards</h3>';
    const tableContextLabel = (() => {
      const m = getSafeMeta(reportState.previewData);
      const proj = (m?.selectedProjects && m.selectedProjects.length) ? m.selectedProjects.join(', ') : '—';
      const start = m?.windowStart ? formatDateForDisplay(m.windowStart) : '—';
      const end = m?.windowEnd ? formatDateForDisplay(m.windowEnd) : '—';
      return `General Performance – ${escapeHtml(proj)} – ${escapeHtml(start)} to ${escapeHtml(end)}`;
    })();
    html += '<p class="table-context" aria-label="Table context">' + tableContextLabel + '</p>';
    const hasPredictability = !!metrics?.predictability;
    html += '<p class="metrics-hint"><small>Time-normalized metrics (Stories / Day, SP / Day, Indexed Delivery) are shown. Indexed Delivery = current SP/day vs own baseline (last 6 closed sprints). Do not use to rank teams.</small></p>';
    html += '<table class="data-table"><thead><tr>';
    for (const key of BOARD_TABLE_COLUMN_ORDER) {
      const title = BOARD_TABLE_HEADER_TOOLTIPS[key] || '';
      html += '<th title="' + escapeHtml(title) + '" data-tooltip="' + escapeHtml(title) + '">' + escapeHtml(key) + '</th>';
    }
    html += '</tr></thead><tbody>';
    for (const board of boards) {
      const summary = boardSummaries.get(board.id) || { sprintCount: 0, doneStories: 0, doneSP: 0, registeredWorkHours: 0, estimatedWorkHours: 0, committedSP: 0, deliveredSP: 0, earliestStart: null, latestEnd: null, totalSprintDays: 0, validSprintDaysCount: 0, doneBySprintEnd: 0, sprintSpValues: [], epicStories: 0, nonEpicStories: 0, epicSP: 0, nonEpicSP: 0, assignees: new Set(), nonEpicAssignees: new Set() };
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

  if (metrics) {
    html += '<hr style="margin: 30px 0;">';

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

    if (metrics.rework) {
      html += '<h3>Rework Ratio</h3>';
      const r = metrics.rework;
      if (r.spAvailable) {
        html += `<p>Rework: ${formatPercent(r.reworkRatio)} (Bug SP: ${r.bugSP}, Story SP: ${r.storySP})</p>`;
      } else {
        html += `<p>Rework: SP unavailable (Bug Count: ${r.bugCount}, Story Count: ${r.storyCount})</p>`;
      }
    }

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
        if (meta?.epicTitleMissingCount > 0) {
          html += `<p class="data-quality-warning"><small>Note: ${meta.epicTitleMissingCount} epic(s) are missing titles. Check Jira permissions or Epic keys.</small></p>`;
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
          '<th title="Sum of subtask time spent (hours) across stories in this epic." data-tooltip="Sum of subtask time spent (hours) across stories in this epic.">Subtask Spent (Hrs)</th>' +
          '</tr></thead><tbody>';
        const epicRows = [...metrics.epicTTM, ...buildEpicAdhocRows(reportState.previewRows)];
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
    }
  } else {
    html += '<hr style="margin: 30px 0;">';
    html += '<p><em>No metrics available. Metrics are calculated when the corresponding options are enabled.</em></p>';
  }

  content.innerHTML = html;
  // Add hover titles for truncated headers/cells for better discoverability (dynamic import)
  try { import('./Reporting-App-Shared-Dom-Escape-Helpers.js').then(({ addTitleForTruncatedCells }) => addTitleForTruncatedCells('#project-epic-level-content table.data-table th, #project-epic-level-content table.data-table td')).catch(() => {}); } catch (e) {}
}
