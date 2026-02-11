/**
 * Fixed Header Bar Component
 * Displays sprint metadata: name, date range, days remaining, total SP, status badge
 * Sticky positioning on desktop, relative on mobile
 * Rationale: Customer - Context always visible. Simplicity - Eliminates "Sprint Window" duplication. Trust - Countdown builds urgency awareness.
 */

import { escapeHtml } from './Reporting-App-Shared-Dom-Escape-Helpers.js';
import { formatDate } from './Reporting-App-Shared-Format-DateNumber-Helpers.js';
import { renderExportButton } from './Reporting-App-CurrentSprint-Export-Dashboard.js';

export function renderHeaderBar(data) {
  const sprint = data.sprint || {};
  const summary = data.summary || {};
  const days = data.daysMeta || {};
  const planned = data.plannedWindow || {};
  const meta = data.meta || {};

  const totalSP = summary.totalSP ?? 0;
  const donePercentage = summary.percentDone ?? 0;
  const subtaskLoggedHours = Number(summary.subtaskLoggedHours || 0);
  const remainingDays = days.daysRemainingWorking != null ? days.daysRemainingWorking : days.daysRemainingCalendar;
  const sprintEndDate = planned.end || sprint.endDate;
  
  // Determine status badge
  const statusBadge = meta.fromSnapshot ? 'Snapshot' : (meta.snapshotAt == null ? 'Live' : 'Snapshot');
  const statusClass = statusBadge === 'Live' ? 'status-live' : 'status-snapshot';

  // Calculate remaining label (days or hours)
  let remainingLabel = '-';
  let remainingClass = '';
  if (remainingDays != null) {
    if (remainingDays <= 0) {
      remainingLabel = 'Sprint ended';
      remainingClass = 'critical';
    } else if (remainingDays < 1 && remainingDays > 0) {
      // Less than 24 hours
      remainingLabel = '<1 day';
      remainingClass = 'critical';
    } else {
      remainingLabel = String(remainingDays) + ' day' + (remainingDays !== 1 ? 's' : '');
      // Map semantics to expected visual classes: green (>5), yellow (3-5), critical (<=2)
      if (remainingDays > 5) {
        remainingClass = 'green';
      } else if (remainingDays > 2) {
        remainingClass = 'yellow';
      } else {
        remainingClass = 'critical';
      }
    }
  }

  const issuesCount = (data.stories || []).length;
  const remainingText = remainingLabel === '-' ? remainingLabel : (remainingLabel === 'Sprint ended' || remainingLabel === '<1 day' ? remainingLabel : remainingLabel + ' left');
  const outcomeParts = [
    escapeHtml(sprint.name || 'Sprint ' + sprint.id) + ': ' + donePercentage + '% done',
    remainingText,
    issuesCount + ' issues',
    subtaskLoggedHours.toFixed(1) + 'h logged'
  ];
  const outcomeLine = outcomeParts.join(' · ');

  // Build HTML
  let html = '<div class="current-sprint-header-bar" data-sprint-id="' + (sprint.id || '') + '">';
  html += '<div class="sprint-outcome-line" aria-live="polite">' + outcomeLine + '</div>';
  
  const boardName = (data.board && data.board.name) ? data.board.name : '';
  // Left section: Sprint info + board scope
  html += '<div class="header-bar-left">';
  if (boardName) html += '<div class="header-board-label" aria-label="Current board">Board: ' + escapeHtml(boardName) + '</div>';
  html += '<div class="header-sprint-name">' + escapeHtml(sprint.name || 'Sprint ' + sprint.id) + '</div>';
  html += '<div class="header-sprint-dates">';
  html += formatDate(planned.start || sprint.startDate) + ' – ' + formatDate(planned.end || sprint.endDate);
  html += '</div>';
  html += '</div>';

  // Center section: Key metrics
  html += '<div class="header-bar-center">';
  html += '<div class="header-metric">';
  html += '<span class="metric-label">Remaining</span>';
  html += '<span class="metric-value ' + remainingClass + '">' + remainingLabel + '</span>';
  html += '</div>';
  html += '<div class="header-metric">';
  html += '<span class="metric-label">Total SP</span>';
  html += '<span class="metric-value">' + totalSP + '</span>';
  html += '</div>';
  html += '<div class="header-metric">';
  html += '<span class="metric-label">Progress</span>';
  html += '<span class="metric-value">' + donePercentage + '%</span>';
  html += '</div>';
  html += '<div class="header-metric">';
  html += '<span class="metric-label">Spent Hrs</span>';
  html += '<span class="metric-value">' + subtaskLoggedHours.toFixed(1) + '</span>';
  html += '</div>';
  html += '<a href="#stories-card" class="header-metric header-metric-link" title="Jump to issues in this sprint">';
  html += '<span class="metric-label">Issues in sprint</span>';
  html += '<span class="metric-value">' + issuesCount + '</span>';
  html += '</a>';
  html += '</div>';

  // Right section: Status badge, last-updated and refresh
  const generatedAt = meta && (meta.generatedAt || meta.snapshotAt) ? new Date(meta.generatedAt || meta.snapshotAt) : null;
  const updatedLabel = generatedAt ? generatedAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '';
  html += '<div class="header-bar-right">';
  html += '<div class="status-badge ' + statusClass + '">' + statusBadge + '</div>';
  html += '<div class="header-updated">' + (updatedLabel ? ('Data as of <small class="last-updated">' + escapeHtml(updatedLabel) + '</small>') : '') + '</div>';
  html += '<button class="btn btn-compact header-refresh-btn" title="Refresh sprint data">Refresh</button>';
  html += renderExportButton(true);
  html += '</div>';

  html += '</div>';
  return html;
}

/**
 * Wire header bar click handlers for navigation
 */
export function wireHeaderBarHandlers() {
  const headerBar = document.querySelector('.current-sprint-header-bar');
  if (!headerBar) return;

  // Click on sprint name to open sprint selector
  const sprintName = headerBar.querySelector('.header-sprint-name');
  if (sprintName) {
    sprintName.style.cursor = 'pointer';
    sprintName.addEventListener('click', () => {
      const carousel = document.querySelector('.sprint-carousel');
      if (carousel) {
        carousel.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  // Tooltip on remaining days
  const remainingMetric = headerBar.querySelector('.header-metric:first-of-type .metric-value');
  if (remainingMetric) {
    remainingMetric.title = 'Days remaining in sprint (working days)';
  }

  // Refresh button wiring
  const refreshBtn = headerBar.querySelector('.header-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      document.dispatchEvent(new Event('refreshSprint'));
    });
  }
}



