import { escapeHtml } from './Reporting-App-Shared-Dom-Escape-Helpers.js';
import { formatDateForDisplay, formatNumber } from './Reporting-App-Shared-Format-DateNumber-Helpers.js';
import { buildJiraIssueUrl, getEpicStoryItems } from './Reporting-App-Report-Utils-Jira-Helpers.js';

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
  const totalStoryCount = nonEpicRows.length;
  const earliestStart = nonEpicRows.reduce((acc, row) => {
    const created = row.created ? new Date(row.created) : null;
    if (!created || Number.isNaN(created.getTime())) return acc;
    return !acc || created < acc ? created : acc;
  }, null);
  const latestEnd = nonEpicRows.reduce((acc, row) => {
    const resolved = row.resolutionDate ? new Date(row.resolutionDate) : null;
    if (!resolved || Number.isNaN(resolved.getTime())) return acc;
    return !acc || resolved > acc ? resolved : acc;
  }, null);
  if (!earliestStart || !latestEnd) return [];
  const calendarTTMdays = Math.ceil((latestEnd.getTime() - earliestStart.getTime()) / (1000 * 60 * 60 * 24));
  return [{
    epicKey: 'AD-HOC',
    epicName: 'Ad-hoc work',
    storyCount: totalStoryCount,
    startDate: earliestStart.toISOString(),
    endDate: latestEnd.toISOString(),
    calendarTTMdays,
    workingTTMdays: calendarTTMdays,
    storyItems: nonEpicRows.map(row => ({
      key: row.issueKey,
      summary: row.issueSummary,
      subtaskTimeSpentHours: row.subtaskTimeSpentHours,
    })),
    subtaskSpentHours: nonEpicRows.reduce((sum, row) => sum + (Number(row.subtaskTimeSpentHours) || 0), 0),
  }];
}

export function renderEpicKeyCell(epic, meta) {
  const host = meta?.jiraHost || meta?.host || '';
  const url = buildJiraIssueUrl(host, epic.epicKey);
  if (url) {
    return `<span class="epic-key"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(epic.epicKey || '')}</a></span>`;
  }
  return `<span class="epic-key">${escapeHtml(epic.epicKey || '')}</span>`;
}

export function renderEpicTitleCell(epic) {
  if (epic?.epicTitle && String(epic.epicTitle).trim() !== '') {
    return escapeHtml(epic.epicTitle);
  }
  return '<span class="data-quality-warning">Epic title unavailable</span>';
}

export function renderEpicStoryList(epic, meta, rows) {
  const host = meta?.jiraHost || meta?.host || '';
  const items = getEpicStoryItems(epic, rows);
  if (!items || items.length === 0) return '-';
  const pills = items.map(item => {
    const url = buildJiraIssueUrl(host, item.key);
    const label = escapeHtml(item.key || '');
    const summary = escapeHtml(item.summary || '');
    const title = summary ? ` title="${summary}"` : '';
    if (url) {
      return `<a class="story-pill" href="${escapeHtml(url)}" target="_blank" rel="noopener"${title}>${label}</a>`;
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
