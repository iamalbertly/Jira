import { escapeHtml, renderIssueKeyLink } from './Reporting-App-Shared-Dom-Escape-Helpers.js';
import { formatDateTime, formatNumber } from './Reporting-App-Shared-Format-DateNumber-Helpers.js';

export function renderStuckCandidates(data) {
  const stuck = data.stuckCandidates || [];
  let html = '<div class="transparency-card" id="stuck-card">';
  html += '<h2>Items stuck &gt; 24 hours</h2>';
  html += '<p class="meta-row"><small>Based on last status category change (fallback to last update).</small></p>';
  if (!stuck.length) {
    html += '<p>No items stuck beyond 24 hours in the current snapshot.</p>';
  } else {
    html += '<table class="data-table"><thead><tr><th>Issue</th><th>Summary</th><th>Status</th><th>Assignee</th><th>Hours in status</th><th>Updated</th></tr></thead><tbody>';
    for (const row of stuck) {
      html += '<tr>';
      html += '<td>' + renderIssueKeyLink(row.issueKey || row.key, row.issueUrl) + '</td>';
      html += '<td>' + escapeHtml(row.summary || '-') + '</td>';
      html += '<td>' + escapeHtml(row.status || '-') + '</td>';
      html += '<td>' + escapeHtml(row.assignee || '-') + '</td>';
      html += '<td>' + formatNumber(row.hoursInStatus ?? 0, 1, '-') + '</td>';
      html += '<td>' + escapeHtml(formatDateTime(row.updated)) + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
  }
  html += '</div>';
  return html;
}

export function renderSubtaskTracking(data) {
  const tracking = data.subtaskTracking || {};
  const summary = tracking.summary || {};
  const rows = tracking.rows || [];
  let html = '<div class="transparency-card" id="subtask-tracking-card">';
  html += '<h2>Sub-task time tracking</h2>';
  html += '<p class="meta-row"><span>Estimated:</span> <strong>' + formatNumber(summary.totalEstimateHours || 0, 1, '-') + ' h</strong>' +
    ' <span>Logged:</span> <strong>' + formatNumber(summary.totalLoggedHours || 0, 1, '-') + ' h</strong>' +
    ' <span>Remaining:</span> <strong>' + formatNumber(summary.totalRemainingHours || 0, 1, '-') + ' h</strong></p>';
  if (!rows.length) {
    html += '<p>No sub-tasks with time tracking in this sprint.</p>';
  } else {
    html += '<table class="data-table">';
    html += '<thead><tr><th>Sub-task</th><th>Summary</th><th>Status</th><th>Assignee</th><th>Estimate</th><th>Logged</th><th>Remaining</th><th>Hours in status</th><th>Created</th><th>Updated</th></tr></thead><tbody>';
    for (const row of rows) {
      const hoursCell = row.hoursInStatus != null
        ? (row.hoursInStatus >= 24 ? '<span class="flag-warn">' + formatNumber(row.hoursInStatus, 1, '-') + '</span>' : formatNumber(row.hoursInStatus, 1, '-'))
        : '-';
      html += '<tr>';
      html += '<td>' + renderIssueKeyLink(row.issueKey || row.key, row.issueUrl) + '</td>';
      html += '<td>' + escapeHtml(row.summary || '-') + '</td>';
      html += '<td>' + escapeHtml(row.status || '-') + '</td>';
      html += '<td>' + escapeHtml(row.assignee || '-') + '</td>';
      html += '<td>' + formatNumber(row.estimateHours || 0, 1, '-') + '</td>';
      html += '<td>' + formatNumber(row.loggedHours || 0, 1, '-') + '</td>';
      html += '<td>' + formatNumber(row.remainingHours || 0, 1, '-') + '</td>';
      html += '<td>' + hoursCell + '</td>';
      html += '<td>' + escapeHtml(formatDateTime(row.created)) + '</td>';
      html += '<td>' + escapeHtml(formatDateTime(row.updated)) + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
  }
  html += '</div>';
  return html;
}

export function buildNotificationMessage(data, group) {
  if (!group) return '';
  const missingEstimate = group.missingEstimate || [];
  const missingLogged = group.missingLogged || [];
  const seen = new Set();
  const items = [];
  for (const row of missingEstimate) {
    const key = row.issueKey || row.key || '';
    if (key && !seen.has(key)) {
      seen.add(key);
      items.push({ ...row, missingEstimate: true, missingLogged: false });
    } else if (key) {
      const existing = items.find((i) => (i.issueKey || i.key) === key);
      if (existing) existing.missingEstimate = true;
    }
  }
  for (const row of missingLogged) {
    const key = row.issueKey || row.key || '';
    if (key && !seen.has(key)) {
      seen.add(key);
      items.push({ ...row, missingEstimate: false, missingLogged: true });
    } else if (key) {
      const existing = items.find((i) => (i.issueKey || i.key) === key);
      if (existing) existing.missingLogged = true;
    }
  }
  const lines = ['Hello team,'];
  lines.push('We have a few items missing time tracking on the current sprint snapshot:');
  for (const item of items) {
    const key = item.issueKey || item.key || '';
    const parentLabel = item.parentKey ? (item.parentKey + (item.parentSummary ? ' - ' + item.parentSummary : '')) : 'N/A';
    if (item.missingEstimate) {
      lines.push(
        `- ${key}: ${item.summary || ''} (Missing estimate)` +
        ` - Created: ${formatDateTime(item.created)}; Updated: ${formatDateTime(item.updated)}; Estimate: - ; Logged: ${formatNumber(item.loggedHours || 0, 1, '-')}h; Parent: ${parentLabel}.`
      );
    }
    if (item.missingLogged) {
      lines.push(
        `- ${key}: ${item.summary || ''} (Missing log)` +
        ` - Created: ${formatDateTime(item.created)}; Updated: ${formatDateTime(item.updated)}; Estimate: ${formatNumber(item.estimateHours || 0, 1, '-')}h; Logged: 0h; Parent: ${parentLabel}.`
      );
    }
    if (item.issueUrl) {
      lines.push(`Open: ${item.issueUrl}`);
    }
  }
  lines.push('If you already updated these since this snapshot, thanks - no further action needed.');
  return lines.join('\n');
}

export function renderNotifications(data) {
  const tracking = data.subtaskTracking || {};
  const notifications = tracking.notifications || [];
  if (!notifications.length) return '';
  const byAssignee = tracking.notificationsByAssignee || [];
  const byReporter = tracking.notificationsByReporter || [];

  let html = '<div class="transparency-card" id="notifications-card">';
  html += '<h2>Time tracking alerts</h2>';
  html += '<p class="meta-row"><small>Missing estimates / No log. Use this message to prompt assignees/reporters to update time tracking. Open Current Sprint to view details.</small></p>';
  const generatedAt = (data.meta && data.meta.generatedAt) ? new Date(data.meta.generatedAt).toISOString() : new Date().toISOString();
  html += '<p class="meta-row generated-at"><small>Generated at ' + generatedAt + ' UTC</small></p>';
  html += '<div class="notification-controls">' +
    '<label>Group by</label>' +
    '<select id="notification-group">' +
    '<option value="assignee">Assignee</option>' +
    '<option value="reporter">Reporter</option>' +
    '</select>' +
    '<label>Recipient</label>' +
    '<select id="notification-recipient"></select>' +
    '<button class="btn btn-secondary btn-compact" type="button" id="notification-copy">Copy message</button>' +
    '</div>';
  html += '<textarea id="notification-message" rows="8"></textarea>';
  html += '<div id="notification-status" class="notification-status"></div>';
  html += '</div>';

  return html;
}
