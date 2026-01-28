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
  'issueStatusCategory': 'Status Category',
  'issuePriority': 'Priority',
  'issueLabels': 'Labels',
  'issueComponents': 'Components',
  'issueFixVersions': 'Fix Versions',
  'assigneeDisplayName': 'Assignee',
  'created': 'Created Date',
  'updated': 'Updated Date',
  'resolutionDate': 'Completed Date',
  'subtaskCount': 'Subtasks Count',
  'timeOriginalEstimateHours': 'Original Estimate (Hours)',
  'timeRemainingEstimateHours': 'Remaining Estimate (Hours)',
  'timeSpentHours': 'Time Spent (Hours)',
  'timeVarianceHours': 'Estimate Variance (Hours)',
  'subtaskTimeOriginalEstimateHours': 'Subtask Original Estimate (Hours)',
  'subtaskTimeRemainingEstimateHours': 'Subtask Remaining Estimate (Hours)',
  'subtaskTimeSpentHours': 'Subtask Time Spent (Hours)',
  'subtaskTimeVarianceHours': 'Subtask Estimate Variance (Hours)',
  'ebmTeam': 'EBM Team',
  'ebmProductArea': 'EBM Product Area',
  'ebmCustomerSegments': 'EBM Customer Segments',
  'ebmValue': 'EBM Value',
  'ebmImpact': 'EBM Impact',
  'ebmSatisfaction': 'EBM Satisfaction',
  'ebmSentiment': 'EBM Sentiment',
  'ebmSeverity': 'EBM Severity',
  'ebmSource': 'EBM Source',
  'ebmWorkCategory': 'EBM Work Category',
  'ebmGoals': 'EBM Goals',
  'ebmTheme': 'EBM Theme',
  'ebmRoadmap': 'EBM Roadmap',
  'ebmFocusAreas': 'EBM Focus Areas',
  'ebmDeliveryStatus': 'EBM Delivery Status',
  'ebmDeliveryProgress': 'EBM Delivery Progress',
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
