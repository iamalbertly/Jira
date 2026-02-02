/**
 * Fixed column order for drill-down dataset
 */
export const CSV_COLUMNS = [
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
  'issueType',
  'issueStatusCategory',
  'issuePriority',
  'issueLabels',
  'issueComponents',
  'issueFixVersions',
  'assigneeDisplayName',
  'created',
  'updated',
  'resolutionDate',
  'subtaskCount',
  'timeOriginalEstimateHours',
  'timeRemainingEstimateHours',
  'timeSpentHours',
  'timeVarianceHours',
  'subtaskTimeOriginalEstimateHours',
  'subtaskTimeRemainingEstimateHours',
  'subtaskTimeSpentHours',
  'subtaskTimeVarianceHours',
  'ebmTeam',
  'ebmProductArea',
  'ebmCustomerSegments',
  'ebmValue',
  'ebmImpact',
  'ebmSatisfaction',
  'ebmSentiment',
  'ebmSeverity',
  'ebmSource',
  'ebmWorkCategory',
  'ebmGoals',
  'ebmTheme',
  'ebmRoadmap',
  'ebmFocusAreas',
  'ebmDeliveryStatus',
  'ebmDeliveryProgress',
  'storyPoints',
  'epicKey',
  'epicTitle',
  'epicSummary',
];

/**
 * Escapes a CSV field value (SSOT: matches client escape rules for contract consistency)
 * Handles comma, quote, newline, tab, carriage return, and control characters.
 * @param {any} value - Value to escape
 * @returns {string} - Escaped CSV field
 */
function escapeCSVField(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);
  const hasSpecial = str.includes(',') || str.includes('"') || str.includes('\n') ||
    str.includes('\r') || str.includes('\t');
  if (hasSpecial) {
    const escaped = str.replace(/"/g, '""').replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/\r/g, ' ');
    return `"${escaped}"`;
  }
  const cleaned = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return cleaned;
}

/**
 * Generates CSV string from columns and rows (client-side)
 * @param {string[]} columns - Column names
 * @param {Array<Object>} rows - Array of row objects
 * @returns {string} - CSV string
 */
export function generateCSVClient(columns, rows) {
  const lines = [];

  // Header row
  lines.push(columns.map(escapeCSVField).join(','));

  // Data rows
  for (const row of rows) {
    const values = columns.map(col => escapeCSVField(row[col]));
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

/**
 * Streams CSV to HTTP response (server-side)
 * @param {string[]} columns - Column names
 * @param {Array<Object>} rows - Array of row objects
 * @param {Object} response - Express response object
 */
export function streamCSV(columns, rows, response) {
  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader('Content-Disposition', 'attachment; filename="jira-report.csv"');

  // Write header
  const header = columns.map(escapeCSVField).join(',') + '\n';
  response.write(header);

  // Stream rows
  for (const row of rows) {
    const values = columns.map(col => escapeCSVField(row[col]));
    const line = values.join(',') + '\n';
    response.write(line);
  }

  response.end();
}
