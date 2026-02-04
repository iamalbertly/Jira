export const FALLBACK_CSV_COLUMNS = [
  'projectKey', 'boardId', 'boardName', 'sprintId', 'sprintName', 'sprintState', 'sprintStartDate', 'sprintEndDate',
  'issueKey', 'issueSummary', 'issueStatus', 'issueType', 'issueStatusCategory', 'issuePriority', 'issueLabels',
  'issueComponents', 'issueFixVersions', 'assigneeDisplayName', 'created', 'updated', 'resolutionDate', 'subtaskCount',
  'timeOriginalEstimateHours', 'timeRemainingEstimateHours', 'timeSpentHours', 'timeVarianceHours',
  'subtaskTimeOriginalEstimateHours', 'subtaskTimeRemainingEstimateHours', 'subtaskTimeSpentHours', 'subtaskTimeVarianceHours',
  'ebmTeam', 'ebmProductArea', 'ebmCustomerSegments', 'ebmValue', 'ebmImpact', 'ebmSatisfaction', 'ebmSentiment', 'ebmSeverity',
  'ebmSource', 'ebmWorkCategory', 'ebmGoals', 'ebmTheme', 'ebmRoadmap', 'ebmFocusAreas', 'ebmDeliveryStatus', 'ebmDeliveryProgress',
  'storyPoints', 'epicKey', 'epicTitle', 'epicSummary',
];

let csvColumns = [...FALLBACK_CSV_COLUMNS];

export function getCsvColumns() {
  return csvColumns;
}

export function initCsvColumns() {
  fetch('/api/csv-columns')
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(d => {
      if (Array.isArray(d?.columns)) {
        csvColumns = d.columns;
      }
    })
    .catch(() => {});
}

export const DEFAULT_WINDOW_START = '2025-07-01T00:00:00.000Z';
export const DEFAULT_WINDOW_END = '2025-09-30T23:59:59.999Z';
export const DEFAULT_WINDOW_START_LOCAL = '2025-07-01T00:00';
export const DEFAULT_WINDOW_END_LOCAL = '2025-09-30T23:59';
export const LOADING_STEP_LIMIT = 6;
