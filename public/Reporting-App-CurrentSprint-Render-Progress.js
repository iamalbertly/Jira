import { escapeHtml, renderIssueKeyLink } from './Reporting-App-Shared-Dom-Escape-Helpers.js';
import { formatDate, formatDayLabel, formatNumber } from './Reporting-App-Shared-Format-DateNumber-Helpers.js';
import { renderEmptyStateHtml } from './Reporting-App-Shared-Empty-State-Helpers.js';

function buildBurndownChart(remaining, ideal) {
  if (!remaining || remaining.length === 0) return '';
  const width = 640;
  const height = 220;
  const padding = 24;
  const maxY = Math.max(
    1,
    ...remaining.map(r => r.remainingSP || 0),
    ...(ideal || []).map(r => r.remainingSP || 0)
  );
  const maxX = remaining.length - 1;

  function pointForIndex(idx, value) {
    const x = maxX > 0 ? padding + (idx / maxX) * (width - padding * 2) : padding;
    const y = height - padding - (value / maxY) * (height - padding * 2);
    return x.toFixed(2) + ',' + y.toFixed(2);
  }

  const actualPoints = remaining.map((row, idx) => pointForIndex(idx, row.remainingSP || 0)).join(' ');
  const idealPoints = (ideal || remaining).map((row, idx) => pointForIndex(idx, row.remainingSP || 0)).join(' ');
  const startLabel = formatDayLabel(remaining[0].date);
  const midIndex = Math.floor(remaining.length / 2);
  const midLabel = formatDayLabel(remaining[midIndex].date);
  const endLabel = formatDayLabel(remaining[remaining.length - 1].date);

  return (
    '<div class="burndown-chart-wrap">' +
    '<svg class="burndown-chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Burndown chart with ideal line">' +
    '<rect x="0" y="0" width="' + width + '" height="' + height + '" fill="var(--card-muted)"></rect>' +
    '<polyline points="' + idealPoints + '" class="burndown-ideal" />' +
    '<polyline points="' + actualPoints + '" class="burndown-actual" />' +
    '</svg>' +
    '<div class="burndown-axis">' +
    '<span class="burndown-axis-y">Remaining SP</span>' +
    '<div class="burndown-axis-x">' +
    '<span>' + escapeHtml(startLabel) + '</span>' +
    '<span>' + escapeHtml(midLabel) + '</span>' +
    '<span>' + escapeHtml(endLabel) + '</span>' +
    '</div>' +
    '</div>' +
    '<div class="burndown-legend">' +
    '<span><span class="legend-swatch actual"></span>Actual</span>' +
    '<span><span class="legend-swatch ideal"></span>Ideal</span>' +
    '</div>' +
    '</div>'
  );
}

export function renderDailyCompletion(data) {
  const daily = data.dailyCompletions || { stories: [], subtasks: [] };
  let html = '<div class="transparency-card" id="daily-completion-card">';
  html += '<h2>Daily completion</h2>';
  if (!daily.stories || daily.stories.length === 0) {
    html += '<p>No story completions by day in this sprint yet.</p>';
  } else {
    html += '<table class="data-table">';
    html += '<thead><tr><th>Date</th><th>Stories</th><th>SP completed</th><th>NPS</th></tr></thead><tbody>';
    for (const row of daily.stories) {
      html += '<tr>';
      html += '<td>' + escapeHtml(formatDayLabel(row.date)) + '</td>';
      html += '<td>' + (row.count ?? 0) + '</td>';
      html += '<td>' + formatNumber(row.spCompleted ?? 0, 1, '-') + '</td>';
      html += '<td>' + (row.nps == null ? '-' : formatNumber(row.nps, 1, '-')) + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
  }
  html += '</div>';
  return html;
}

export function renderBurndown(data) {
  const remaining = data.remainingWorkByDay || [];
  const ideal = data.idealBurndown || [];
  if (!remaining.length) {
    return '<div class="transparency-card"><p class="meta-row"><small>Burndown will appear when story points and resolutions are available.</small></p></div>';
  }

  const totalSP = remaining[0].remainingSP || 0;
  const lastRemaining = remaining[remaining.length - 1].remainingSP || 0;
  const doneSP = totalSP - lastRemaining;
  const pct = totalSP > 0 ? Math.round((doneSP / totalSP) * 100) : 0;

  let html = '<div class="transparency-card" id="burndown-card">';
  html += '<h2>Burndown</h2>';
  html += '<p><strong>' + pct + '%</strong> complete (' + formatNumber(doneSP, 1, '-') + ' SP done of ' + formatNumber(totalSP, 1, '-') + ' SP).</p>';
  html += buildBurndownChart(remaining, ideal);
  html += '<table class="data-table">';
  html += '<thead><tr><th>Date</th><th>Remaining SP</th><th>Ideal Remaining</th></tr></thead><tbody>';
  for (let i = 0; i < remaining.length; i++) {
    const row = remaining[i];
    const idealRow = ideal[i] || ideal[ideal.length - 1] || {};
    html += '<tr>';
    html += '<td>' + escapeHtml(formatDayLabel(row.date)) + '</td>';
    html += '<td>' + formatNumber(row.remainingSP ?? 0, 1, '-') + '</td>';
    html += '<td>' + formatNumber(idealRow.remainingSP ?? 0, 1, '-') + '</td>';
    html += '</tr>';
  }
  html += '</tbody></table>';
  html += '</div>';
  return html;
}

export function renderScopeChanges(data) {
  const changes = data.scopeChanges || [];
  let html = '<div class="transparency-card" id="scope-changes-card">';
  html += '<h2>Scope changes (after sprint start)</h2>';
  if (!changes.length) {
    html += '<p>No scope added after sprint start (by created date).</p>';
  } else {
    html += '<p class="meta-row"><small>Scope changes are inferred using issue created date after sprint start.</small></p>';
    html += '<table class="data-table"><thead><tr><th>Story</th><th>Type</th><th>Story Points</th><th>Created</th></tr></thead><tbody>';
    for (const row of changes) {
      html += '<tr>';
      html += '<td>' + renderIssueKeyLink(row.issueKey || row.key, row.issueUrl) + '</td>';
      html += '<td>' + escapeHtml(row.issueType || row.summary || '-') + '</td>';
      html += '<td>' + formatNumber(row.storyPoints ?? 0, 1, '-') + '</td>';
      html += '<td>' + escapeHtml(formatDate(row.date)) + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
  }
  html += '</div>';
  return html;
}

export function renderStories(data) {
  const stories = data.stories || [];
  const planned = data.plannedWindow || {};
  let html = '<div class="transparency-card" id="stories-card">';
  html += '<h2>Stories in sprint</h2>';
  html += '<p class="meta-row"><span>Planned:</span> <strong>' + formatDate(planned.start) + ' - ' + formatDate(planned.end) + '</strong></p>';
  if (!stories.length) {
    html += renderEmptyStateHtml('No stories', 'No stories in this sprint.', '');
  } else {
    html += '<table class="data-table"><thead><tr><th>Story</th><th>Summary</th><th>Status</th><th>Assignee</th><th>Story Points</th><th>Created</th><th>Resolved</th></tr></thead><tbody>';
    for (const row of stories) {
      html += '<tr>';
      html += '<td>' + renderIssueKeyLink(row.issueKey || row.key, row.issueUrl) + '</td>';
      html += '<td>' + escapeHtml(row.summary || '-') + '</td>';
      html += '<td>' + escapeHtml(row.status || '-') + '</td>';
      html += '<td>' + escapeHtml(row.assignee || '-') + '</td>';
      html += '<td>' + formatNumber(row.storyPoints ?? 0, 1, '-') + '</td>';
      html += '<td>' + escapeHtml(formatDate(row.created)) + '</td>';
      html += '<td>' + escapeHtml(formatDate(row.resolved)) + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
  }
  html += '</div>';
  return html;
}
