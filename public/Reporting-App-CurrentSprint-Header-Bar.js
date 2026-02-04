/**
 * Fixed Header Bar Component
 * Displays sprint metadata: name, date range, days remaining, total SP, status badge
 * Sticky positioning on desktop, relative on mobile
 * Rationale: Customer - Context always visible. Simplicity - Eliminates "Sprint Window" duplication. Trust - Countdown builds urgency awareness.
 */

import { escapeHtml } from './Reporting-App-Shared-Dom-Escape-Helpers.js';
import { formatDate } from './Reporting-App-Shared-Format-DateNumber-Helpers.js';

export function renderHeaderBar(data) {
  const sprint = data.sprint || {};
  const summary = data.summary || {};
  const days = data.daysMeta || {};
  const planned = data.plannedWindow || {};
  const meta = data.meta || {};

  const totalSP = summary.totalSP ?? 0;
  const donePercentage = summary.percentDone ?? 0;
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
      remainingClass = remainingDays <= 2 ? 'critical' : (remainingDays <= 5 ? 'warning' : '');
    }
  }

  // Build HTML
  let html = '<div class="current-sprint-header-bar">';
  
  // Left section: Sprint info
  html += '<div class="header-bar-left">';
  html += '<div class="header-sprint-name">' + escapeHtml(sprint.name || 'Sprint ' + sprint.id) + '</div>';
  html += '<div class="header-sprint-dates">';
  html += formatDate(planned.start || sprint.startDate) + ' → ' + formatDate(planned.end || sprint.endDate);
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
  html += '</div>';

  // Right section: Status badge
  html += '<div class="header-bar-right">';
  html += '<div class="status-badge ' + statusClass + '">' + statusBadge + '</div>';
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
}
