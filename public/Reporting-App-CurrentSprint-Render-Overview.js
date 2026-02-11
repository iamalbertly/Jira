import { currentSprintDom } from './Reporting-App-CurrentSprint-Page-Context.js';
import { escapeHtml } from './Reporting-App-Shared-Dom-Escape-Helpers.js';
import { formatDate, formatDateTime, formatNumber } from './Reporting-App-Shared-Format-DateNumber-Helpers.js';

export function updateHeader(sprint) {
  const { titleEl, nameEl, subtitleEl } = currentSprintDom;
  if (!titleEl || !nameEl) return;
  if (!sprint) {
    titleEl.textContent = 'Current Sprint';
    nameEl.textContent = '';
    if (subtitleEl) subtitleEl.textContent = 'Squad view - planned vs observed work, daily completion, scope changes';
    return;
  }
  titleEl.textContent = 'Current Sprint';
  nameEl.textContent = sprint.name ? '- ' + sprint.name : (sprint.id ? '- ' + sprint.id : '');
  if (subtitleEl) subtitleEl.textContent = 'Sprint transparency snapshot (' + (sprint.state || 'unknown') + ')';
}

export function renderSprintTabs(data) {
  const sprints = data.recentSprints || [];
  if (!sprints.length) return '';
  let html = '<div class="sprint-tabs" role="tablist" aria-label="Sprints">';
  for (const sprint of sprints) {
    const isActive = data.sprint && sprint.id === data.sprint.id;
    const sprintName = sprint.name || ('Sprint ' + sprint.id);
    const label = (sprint.state || '').toLowerCase() === 'active' ? 'Current - ' + sprintName : sprintName;
    const startLabel = sprint.startDate ? formatDate(sprint.startDate) : '-';
    const endLabel = sprint.endDate ? formatDate(sprint.endDate) : '-';
    const title = 'Start: ' + startLabel + ' - End: ' + endLabel;
    html += '<button class="sprint-tab' + (isActive ? ' active' : '') + '" type="button" data-sprint-id="' + sprint.id + '" role="tab" aria-selected="' + (isActive ? 'true' : 'false') + '" title="' + escapeHtml(title) + '">' + escapeHtml(label) + '</button>';
  }
  html += '<a class="sprint-tab-link" href="/sprint-leadership">Dashboard</a>';
  html += '</div>';
  return html;
}

export function renderSummaryCard(data) {
  const sprint = data.sprint || {};
  const summary = data.summary || {};
  const days = data.daysMeta || {};
  const planned = data.plannedWindow || {};
  const meta = data.meta || {};
  const scopeChanges = data.scopeChanges || [];
  const nextSprint = data.nextSprint || null;
  const previousSprint = data.previousSprint || null;

  const totalStories = summary.totalStories ?? (data.stories ? data.stories.length : 0);
  const doneStories = summary.doneStories ?? 0;
  const totalSP = summary.totalSP ?? 0;
  const doneSP = summary.doneSP ?? 0;
  const percentDone = summary.percentDone ?? 0;

  const remainingDays = days.daysRemainingWorking != null ? days.daysRemainingWorking : days.daysRemainingCalendar;
  const remainingLabel = remainingDays == null ? '-' : (remainingDays <= 0 ? 'Sprint ended' : String(remainingDays));
  const remainingClass = remainingDays != null && remainingDays <= 2 ? ' critical' : '';

  let html = '<div class="transparency-card" id="sprint-summary-card">';
  html += '<div class="summary-strip">';
  html += '<div class="summary-headline">' +
    '<strong>' + doneStories + ' of ' + totalStories + ' work items (' + totalSP + ' pts)</strong>' +
    '<span>' + percentDone + '% done</span>' +
    '</div>';
  const stuckCount = (data.stuckCandidates || []).length;
  html += '<div class="summary-links">' +
    '<a href="#burndown-card">Burndown</a>' +
    '<span>|</span>' +
    '<a href="#stories-card">Work items</a>' +
    '<span>|</span>' +
    '<a href="#scope-changes-card">Scope changes</a>' +
    (stuckCount > 0 ? '<span>|</span><a href="#stuck-card" class="stuck-prompt">' + stuckCount + ' in progress &gt;24h - Follow up</a>' : '') +
    '</div>';
  if (meta.fromSnapshot) {
    const snapshotLabel = meta.snapshotAt ? formatDateTime(meta.snapshotAt) : 'unknown';
    html += '<div class="snapshot-badge">Snapshot: ' + escapeHtml(snapshotLabel) + '</div>';
  } else if (meta.snapshotAt == null) {
    html += '<div class="snapshot-badge snapshot-live">Live</div>';
  }
  html += '</div>';

  html += '<div class="status-chips">';
  html += '<span class="status-chip chip-planned">Planned: ' + formatDate(planned.start) + ' - ' + formatDate(planned.end) + '</span>';
  html += '<span class="status-chip chip-new">New: ' + scopeChanges.length + ' issues</span>';
  html += '</div>';

  html += '<div class="summary-grid">';
  html += '<div class="summary-block">' +
    '<span>Sprint window</span>' +
    '<strong>' + formatDate(planned.start || sprint.startDate) + ' - ' + formatDate(planned.end || sprint.endDate) + '</strong>' +
    '</div>';
  html += '<div class="summary-block">' +
    '<span>Days remaining</span>' +
    '<strong class="days-remaining' + remainingClass + '">' + remainingLabel + '</strong>' +
    '</div>';
  html += '<div class="summary-block">' +
    '<span>New Features</span>' +
    '<strong>' + formatNumber(summary.newFeaturesSP || 0, 0, '-') + ' SP</strong>' +
    '</div>';
  html += '<div class="summary-block">' +
    '<span>Support & Ops</span>' +
    '<strong>' + formatNumber(summary.supportOpsSP || 0, 0, '-') + ' SP</strong>' +
    '</div>';
  const missingEstimate = summary.subtaskMissingEstimate ?? 0;
  const missingLogged = summary.subtaskMissingLogged ?? 0;
  const subtaskStuck = summary.subtaskStuckOver24h ?? 0;
  const totalIssues = missingEstimate + missingLogged + subtaskStuck;
  const subtaskHealth = totalIssues === 0 ? 100 : Math.max(0, 100 - missingEstimate * 15 - missingLogged * 10 - subtaskStuck * 10);
  html += '<div class="summary-block summary-block-subtask">';
  html += '<span>Sub-task</span>';
  if (totalIssues === 0) {
    html += '<span class="subtask-chip subtask-chip-ok" title="All sub-tasks tracked"><a href="#stories-card">All tracked</a></span>';
    html += '<div class="subtask-chips">';
    html += '<a href="#stories-card" class="subtask-chip subtask-chip-neutral">' + formatNumber(summary.subtaskLoggedHours || 0, 1, '0') + 'h logged</a>';
    html += '</div>';
  } else {
    html += '<span class="subtask-health-score" title="Sub-task tracking health">' + subtaskHealth + '%</span>';
    html += '<div class="subtask-chips">';
    html += '<a href="#stories-card" class="subtask-chip subtask-chip-neutral">' + formatNumber(summary.subtaskLoggedHours || 0, 1, '0') + 'h logged</a>';
    if (missingEstimate > 0) html += '<a href="#work-risks-table" class="subtask-chip subtask-chip-warning" title="Missing estimates">' + missingEstimate + ' missing est.</a>';
    if (missingLogged > 0) html += '<a href="#work-risks-table" class="subtask-chip subtask-chip-info" title="No time logged yet">' + missingLogged + ' no log</a>';
    if (subtaskStuck > 0) html += '<a href="#work-risks-table" class="subtask-chip subtask-chip-warning" title="Stuck >24h">' + subtaskStuck + ' stuck</a>';
    html += '</div>';
  }
  html += '</div>';
  html += '<div class="summary-block">' +
    '<span>Total SP</span>' +
    '<strong>' + formatNumber(summary.totalAllSP != null ? summary.totalAllSP : totalSP, 0, '-') + ' SP</strong>' +
    '</div>';
  html += '</div>';

  if (nextSprint && (nextSprint.name || nextSprint.goal)) {
    html += '<div class="summary-next">Next sprint: <strong>' + escapeHtml(nextSprint.name || '') + '</strong>';
    if (nextSprint.goal) html += ' - ' + escapeHtml(nextSprint.goal);
    html += '</div>';
  }

  if (previousSprint && previousSprint.name) {
    html += '<div class="summary-prev">Previous sprint: <strong>' + escapeHtml(previousSprint.name) + '</strong> - ' + (previousSprint.doneStories ?? 0) + ' work items, ' + (previousSprint.doneSP ?? 0) + ' SP.</div>';
  }

  html += '</div>';
  return html;
}

export function renderSprintWindows(data) {
  const s = data.sprint || {};
  const pw = data.plannedWindow || {};
  const ow = data.observedWorkWindow || {};
  const flags = data.flags || {};
  const days = data.daysMeta || {};

  let html = '<div class="transparency-card" id="sprint-windows-card">';
  html += '<h2>Sprint and time windows</h2>';
  html += '<p><strong>' + escapeHtml(s.name || s.id || '') + '</strong> (' + escapeHtml(s.state || '') + ')</p>';
  html += '<div class="meta-row"><span>Planned:</span> <strong>' + formatDate(pw.start) + '</strong> -> <strong>' + formatDate(pw.end) + '</strong></div>';
  if (ow.start || ow.end) {
    html += '<div class="meta-row"><span>Observed work:</span> <strong>' + formatDate(ow.start) + '</strong> -> <strong>' + formatDate(ow.end) + '</strong></div>';
  }
  html += '<div class="meta-row"><span>Calendar days:</span> <strong>' + (s.calendarDays ?? '-') + '</strong> <span>Working days:</span> <strong>' + (s.workingDays ?? '-') + '</strong></div>';
  if (days.daysElapsedCalendar != null) {
    html += '<div class="meta-row"><span>Days elapsed (calendar):</span> <strong>' + days.daysElapsedCalendar + '</strong> <span>Remaining:</span> <strong>' + (days.daysRemainingCalendar ?? '-') + '</strong></div>';
  }
  if (days.daysElapsedWorking != null) {
    html += '<div class="meta-row"><span>Days elapsed (working):</span> <strong>' + days.daysElapsedWorking + '</strong> <span>Remaining:</span> <strong>' + (days.daysRemainingWorking ?? '-') + '</strong></div>';
  }
  if (flags.observedBeforeSprintStart || flags.observedAfterSprintEnd || flags.sprintDatesChanged) {
    html += '<p class="flag-warn" style="margin-top: 8px;">';
    if (flags.observedBeforeSprintStart) html += 'Observed work started before sprint start. ';
    if (flags.observedAfterSprintEnd) html += 'Observed work extended past sprint end. ';
    if (flags.sprintDatesChanged) html += 'Sprint dates may have been edited. ';
    html += '</p>';
  }
  html += '</div>';
  return html;
}
