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
  'assigneeDisplayName',
  'created',
  'updated',
  'resolutionDate',
  'storyPoints',
  'epicKey',
];

/**
 * Escapes a CSV field value
 * @param {any} value - Value to escape
 * @returns {string} - Escaped CSV field
 */
function escapeCSVField(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);
  
  // If contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
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
