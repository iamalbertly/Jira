import { escapeHtml } from './Reporting-App-Shared-Dom-Escape-Helpers.js';
import { formatDateForDisplay, formatNumber } from './Reporting-App-Shared-Format-DateNumber-Helpers.js';
import { buildJiraIssueUrl, getEpicStoryItems, isJiraIssueKey } from './Reporting-App-Report-Utils-Jira-Helpers.js';

export function buildPredictabilityTableHeaderHtml() {
  return '<table class="data-table"><thead><tr>' +
    '<th title="Sprint name.">Sprint</th>' +
    '<th title="Stories planned at sprint start (scope commitment).">Committed Stories</th>' +
    '<th title="Story points planned at sprint start (scope commitment).">Committed SP</th>' +
    '<th title="Stories completed by sprint end.">Delivered Stories</th>' +
    '<th title="Story points completed by sprint end.">Delivered SP</th>' +
    '<th title="Delivered stories that were committed at sprint start (created before sprint start).">Planned Carryover</th>' +
    '<th title="Delivered stories that were added mid-sprint (created after sprint start). Not a failure metric.">Unplanned Spillover</th>' +
    '<th title="Delivered Stories / Committed Stories. Higher means closer to plan; low suggests scope churn or over-commit.">Predictability % (Stories)</th>' +
    '<th title="Delivered SP / Committed SP. Higher means closer to plan; low suggests estimation drift or unstable capacity.">Predictability % (SP)</th>' +
    '</tr></thead><tbody>';
}

export function buildEpicAdhocRows(rows) {
  const nonEpicRows = (rows || []).filter(row => !row.epicKey);
  if (nonEpicRows.length === 0) return [];
  const byBoard = new Map();
  for (const row of nonEpicRows) {
    const boardId = row.boardId ?? '';
    const boardName = (row.boardName || '').trim();
    const projectKey = (row.projectKey || '').trim();
    const groupKey = String(boardId || boardName || projectKey || 'unknown');
    const displayLabel = boardName || projectKey || (boardId ? `Board-${boardId}` : 'Unknown');
    if (!byBoard.has(groupKey)) {
      byBoard.set(groupKey, { displayLabel: displayLabel.trim() || groupKey, rows: [] });
    }
    byBoard.get(groupKey).rows.push(row);
  }
  const result = [];
  for (const { displayLabel, rows: groupRows } of byBoard.values()) {
    const earliestStart = groupRows.reduce((acc, row) => {
      const created = row.created ? new Date(row.created) : null;
      if (!created || Number.isNaN(created.getTime())) return acc;
      return !acc || created < acc ? created : acc;
    }, null);
    const latestEnd = groupRows.reduce((acc, row) => {
      const resolved = row.resolutionDate ? new Date(row.resolutionDate) : null;
      if (!resolved || Number.isNaN(resolved.getTime())) return acc;
      return !acc || resolved > acc ? resolved : acc;
    }, null);
    if (!earliestStart || !latestEnd) continue;
    const calendarTTMdays = Math.ceil((latestEnd.getTime() - earliestStart.getTime()) / (1000 * 60 * 60 * 24));
    result.push({
      epicKey: `${displayLabel}-ad-hoc`,
      epicName: 'Ad-hoc work',
      storyCount: groupRows.length,
      startDate: earliestStart.toISOString(),
      endDate: latestEnd.toISOString(),
      calendarTTMdays,
      workingTTMdays: calendarTTMdays,
      storyItems: groupRows.map(row => ({
        key: row.issueKey,
        summary: row.issueSummary,
        subtaskTimeSpentHours: row.subtaskTimeSpentHours,
      })),
      subtaskSpentHours: groupRows.reduce((sum, row) => sum + (Number(row.subtaskTimeSpentHours) || 0), 0),
    });
  }
  return result;
}

export function renderEpicKeyCell(epic, meta) {
  const key = epic.epicKey || '';
  if (!isJiraIssueKey(key)) {
    return `<span class="epic-key">${escapeHtml(key)}</span>`;
  }
  const host = meta?.jiraHost || meta?.host || '';
  const url = buildJiraIssueUrl(host, key);
  if (url) {
    const aria = ` aria-label="Open issue ${escapeHtml(key)} in Jira"`;
    const title = ` title="Open in Jira: ${escapeHtml(key)}"`;
    return `<span class="epic-key"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"${title}${aria}>${escapeHtml(key)}</a></span>`;
  }
  return `<span class="epic-key">${escapeHtml(key)}</span>`;
}

export function renderEpicTitleCell(epic) {
  if (epic?.epicTitle && String(epic.epicTitle).trim() !== '') {
    return escapeHtml(epic.epicTitle);
  }
  return '<span class="data-quality-warning" title="Title may be missing due to Jira permissions or Epic key access.">Epic title unavailable</span>';
}

export function renderEpicStoryList(epic, meta, rows) {
  const host = meta?.jiraHost || meta?.host || '';
  const items = getEpicStoryItems(epic, rows);
  if (!items || items.length === 0) return '-';
  const pills = items.map(item => {
    const url = buildJiraIssueUrl(host, item.key);
    const label = escapeHtml(item.key || '');
    const summary = escapeHtml(item.summary || '');
    const titleText = summary ? `Open in Jira: ${item.key} — ${summary}` : `Open in Jira: ${item.key}`;
    const title = ` title="${escapeHtml(titleText)}"`;
    const aria = ` aria-label="Open issue ${escapeHtml(item.key || '')} in Jira"`;
    if (url) {
      return `<a class="story-pill" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"${title}${aria}>${label}</a>`;
    }
    return `<span class="story-pill"${title}>${label}</span>`;
  });
  return pills.join(' ');
}

export function renderEpicSubtaskHours(epic) {
  if (epic?.subtaskSpentHours != null) {
    return formatNumber(Number(epic.subtaskSpentHours), 2);
  }
  return '';
}
