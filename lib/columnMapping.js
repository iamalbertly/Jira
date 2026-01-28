/**
 * Business-friendly column name mapping
 * Maps technical column names to business-friendly labels for Excel exports
 */

export const BUSINESS_COLUMN_NAMES = {
  'projectKey': 'Project',
  'boardId': 'Board ID',
  'boardName': 'Board Name',
  'sprintId': 'Sprint ID',
  'sprintName': 'Sprint Name',
  'sprintState': 'Sprint State',
  'sprintStartDate': 'Sprint Start Date',
  'sprintEndDate': 'Sprint End Date',
  'issueKey': 'Ticket ID',
  'issueSummary': 'Ticket Summary',
  'issueStatus': 'Status',
  'issueType': 'Issue Type',
  'assigneeDisplayName': 'Assignee',
  'created': 'Created Date',
  'updated': 'Updated Date',
  'resolutionDate': 'Completed Date',
  'storyPoints': 'Story Points',
  'epicKey': 'Epic ID',
  'epicTitle': 'Epic Name',
  'epicSummary': 'Epic Summary',
};

/**
 * Reverse mapping: business name to technical name
 */
export const TECHNICAL_COLUMN_NAMES = Object.fromEntries(
  Object.entries(BUSINESS_COLUMN_NAMES).map(([tech, business]) => [business, tech])
);

/**
 * Maps technical column names to business-friendly names
 * @param {string[]} technicalColumns - Array of technical column names
 * @returns {string[]} Array of business-friendly column names
 */
export function mapColumnsToBusinessNames(technicalColumns) {
  return technicalColumns.map(col => BUSINESS_COLUMN_NAMES[col] || col);
}

/**
 * Maps business-friendly column names back to technical names
 * @param {string[]} businessColumns - Array of business-friendly column names
 * @returns {string[]} Array of technical column names
 */
export function mapBusinessToTechnicalNames(businessColumns) {
  return businessColumns.map(col => TECHNICAL_COLUMN_NAMES[col] || col);
}
