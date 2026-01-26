import { logger } from './Jira-Reporting-App-Server-Logging-Utility.js';

/**
 * Fetches all issues for a sprint with pagination and filtering
 * @param {number} sprintId - Sprint ID
 * @param {AgileClient} agileClient - Jira Agile client
 * @param {string[]} selectedProjects - Array of project keys to filter by
 * @param {boolean} requireResolvedBySprintEnd - If true, filter by resolutionDate <= sprintEndDate
 * @param {Date} sprintEndDate - Sprint end date for resolution filtering
 * @returns {Promise<Array>} - Array of filtered story issues
 */
export async function fetchSprintIssues(sprintId, agileClient, selectedProjects, requireResolvedBySprintEnd = false, sprintEndDate = null) {
  const allIssues = [];
  let startAt = 0;
  const maxResults = 50;
  let isLast = false;

  while (!isLast) {
    try {
      const response = await agileClient.sprint.getIssuesForSprint({
        sprintId,
        startAt,
        maxResults,
      });

      // Response structure: { issues: [...], maxResults, startAt, total, isLast }
      if (response.issues && Array.isArray(response.issues)) {
        allIssues.push(...response.issues);
      } else if (Array.isArray(response)) {
        // Fallback: if response is directly an array
        allIssues.push(...response);
      }

      isLast = response.isLast !== undefined ? response.isLast : (response.total <= startAt + maxResults);
      startAt += maxResults;
    } catch (error) {
      logger.error(`Error fetching issues for sprint ${sprintId}`, error);
      // If we have some issues, return them with a warning, otherwise throw
      if (allIssues.length > 0) {
        logger.warn(`Partial results: Returning ${allIssues.length} issues before error occurred`, { sprintId });
        break; // Return partial results
      }
      // No issues fetched, propagate error
      throw new Error(`Failed to fetch issues for sprint ${sprintId}: ${error.message}`);
    }
  }

  // Filter issues
  const filtered = allIssues.filter(issue => {
    // Filter by project
    if (!selectedProjects.includes(issue.fields?.project?.key)) {
      return false;
    }

    // Filter by type (Story)
    if (issue.fields?.issuetype?.name !== 'Story') {
      return false;
    }

    // Filter by status (done)
    if (issue.fields?.status?.statusCategory?.key !== 'done') {
      return false;
    }

    // Optional: filter by resolution date
    if (requireResolvedBySprintEnd && sprintEndDate) {
      const resolutionDate = issue.fields?.resolutiondate;
      if (!resolutionDate) {
        return false;
      }
      const resolutionTime = new Date(resolutionDate).getTime();
      const sprintEndTime = new Date(sprintEndDate).getTime();
      if (resolutionTime > sprintEndTime) {
        return false;
      }
    }

    return true;
  });

  return filtered;
}

/**
 * Resolves epic key from an issue
 * @param {Object} issue - Jira issue object
 * @param {string} epicLinkFieldId - Epic Link field ID (may be null)
 * @returns {string} - Epic key or empty string
 */
export function resolveEpicKey(issue, epicLinkFieldId) {
  // Prefer parent if it's an Epic
  if (issue.fields?.parent?.fields?.issuetype?.name === 'Epic') {
    return issue.fields.parent.key || '';
  }

  // Use Epic Link field if available
  if (epicLinkFieldId && issue.fields?.[epicLinkFieldId]) {
    const epicLink = issue.fields[epicLinkFieldId];
    // Epic Link field can be a string (key) or object with key property
    if (typeof epicLink === 'string') {
      return epicLink;
    }
    if (epicLink?.key) {
      return epicLink.key;
    }
  }

  return '';
}

/**
 * Builds a drill-down row object from issue, sprint, and board data
 * @param {Object} issue - Jira issue object
 * @param {Object} sprint - Sprint object
 * @param {Object} board - Board object
 * @param {Object} fields - Field IDs object {storyPointsFieldId, epicLinkFieldId}
 * @param {Object} options - Options {includeStoryPoints, includeEpicTTM}
 * @returns {Object} - Drill-down row object
 */
export function buildDrillDownRow(issue, sprint, board, fields, options = {}) {
  const { includeStoryPoints = false, includeEpicTTM = false } = options;

  const row = {
    projectKey: issue.fields?.project?.key || '',
    boardId: board.id || '',
    boardName: board.name || '',
    sprintId: sprint.id || '',
    sprintName: sprint.name || '',
    sprintState: sprint.state || '',
    sprintStartDate: sprint.startDate || '',
    sprintEndDate: sprint.endDate || '',
    issueKey: issue.key || '',
    issueSummary: issue.fields?.summary || '',
    issueStatus: issue.fields?.status?.name || '',
    assigneeDisplayName: issue.fields?.assignee?.displayName || '',
    created: issue.fields?.created || '',
    updated: issue.fields?.updated || '',
    resolutionDate: issue.fields?.resolutiondate || '',
  };

  // Conditionally add story points
  if (includeStoryPoints && fields.storyPointsFieldId) {
    const storyPoints = issue.fields?.[fields.storyPointsFieldId];
    row.storyPoints = storyPoints != null ? String(storyPoints) : '';
  } else {
    row.storyPoints = '';
  }

  // Conditionally add epic key
  if (includeEpicTTM) {
    row.epicKey = resolveEpicKey(issue, fields.epicLinkFieldId);
  } else {
    row.epicKey = '';
  }

  return row;
}

/**
 * Fetches bugs for multiple sprints (for rework ratio calculation)
 * @param {Array} sprintIds - Array of sprint IDs
 * @param {AgileClient} agileClient - Jira Agile client
 * @param {string[]} selectedProjects - Array of project keys to filter by
 * @param {number} concurrencyLimit - Maximum concurrent requests (default: 3)
 * @returns {Promise<Array>} - Array of bug issues
 */
export async function fetchBugsForSprints(sprintIds, agileClient, selectedProjects, concurrencyLimit = 3) {
  const allBugs = [];

  // Process sprints in chunks to limit concurrency
  for (let i = 0; i < sprintIds.length; i += concurrencyLimit) {
    const chunk = sprintIds.slice(i, i + concurrencyLimit);
    
    const chunkPromises = chunk.map(async (sprintId) => {
      try {
        const allIssues = [];
        let startAt = 0;
        const maxResults = 50;
        let isLast = false;

        while (!isLast) {
          const response = await agileClient.sprint.getIssuesForSprint({
            sprintId,
            startAt,
            maxResults,
          });

          if (response.issues) {
            allIssues.push(...response.issues);
          }

          isLast = response.isLast || false;
          startAt += maxResults;
        }

        // Filter to bugs in selected projects
        return allIssues.filter(issue => {
          return selectedProjects.includes(issue.fields?.project?.key) &&
                 issue.fields?.issuetype?.name === 'Bug';
        });
      } catch (error) {
        logger.error(`Error fetching bugs for sprint ${sprintId}`, error);
        return [];
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    allBugs.push(...chunkResults.flat());
  }

  return allBugs;
}
