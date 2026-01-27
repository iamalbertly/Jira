import { logger } from './Jira-Reporting-App-Server-Logging-Utility.js';

/**
 * Fetches all issues for a sprint with pagination and filtering
 * @param {number} sprintId - Sprint ID
 * @param {AgileClient} agileClient - Jira Agile client
 * @param {string[]} selectedProjects - Array of project keys to filter by
 * @param {boolean} requireResolvedBySprintEnd - If true, filter by resolutionDate <= sprintEndDate
 * @param {Date} sprintEndDate - Sprint end date for resolution filtering
 * @param {string[]} allowedIssueTypes - Array of issue type names to include (default: ['Story'])
 * @returns {Promise<Array>} - Array of filtered issues
 */
export async function fetchSprintIssues(sprintId, agileClient, selectedProjects, requireResolvedBySprintEnd = false, sprintEndDate = null, allowedIssueTypes = ['Story']) {
  const allIssues = [];
  let startAt = 0;
  const maxResults = 50;
  let isLast = false;

  let pageCount = 0;
  const maxPages = 100; // Safety limit to prevent infinite loops
  
  while (!isLast && pageCount < maxPages) {
    try {
      pageCount++;
      logger.debug(`Fetching sprint ${sprintId} issues, page ${pageCount} (startAt: ${startAt})`);
      
      const response = await agileClient.sprint.getIssuesForSprint({
        sprintId,
        startAt,
        maxResults,
      });

      // Log response structure for debugging
      logger.debug(`Sprint ${sprintId} page ${pageCount} response structure`, {
        hasIssues: !!response.issues,
        issuesIsArray: Array.isArray(response.issues),
        responseIsArray: Array.isArray(response),
        total: response.total,
        isLast: response.isLast,
        startAt: response.startAt,
        maxResults: response.maxResults
      });

      // Response structure: { issues: [...], maxResults, startAt, total, isLast }
      if (response.issues && Array.isArray(response.issues)) {
        allIssues.push(...response.issues);
        logger.debug(`Sprint ${sprintId} page ${pageCount}: added ${response.issues.length} issues (total so far: ${allIssues.length})`);
      } else if (Array.isArray(response)) {
        // Fallback: if response is directly an array
        allIssues.push(...response);
        logger.debug(`Sprint ${sprintId} page ${pageCount}: added ${response.length} issues from array response (total so far: ${allIssues.length})`);
      } else {
        logger.warn(`Sprint ${sprintId} page ${pageCount}: unexpected response structure`, { responseKeys: Object.keys(response || {}) });
      }

      // Determine if this is the last page
      if (response.isLast !== undefined) {
        isLast = response.isLast;
      } else if (response.total !== undefined) {
        isLast = (startAt + maxResults >= response.total);
      } else {
        // If we got no issues or fewer than maxResults, assume we're done
        const issuesCount = (response.issues && Array.isArray(response.issues)) ? response.issues.length : 
                          (Array.isArray(response) ? response.length : 0);
        isLast = (issuesCount === 0 || issuesCount < maxResults);
      }
      
      startAt += maxResults;
    } catch (error) {
      logger.error(`Error fetching issues for sprint ${sprintId} at page ${pageCount}`, {
        error: error.message,
        stack: error.stack,
        sprintId,
        startAt,
        issuesFetched: allIssues.length
      });
      // If we have some issues, return them with a warning, otherwise throw
      if (allIssues.length > 0) {
        logger.warn(`Partial results: Returning ${allIssues.length} issues before error occurred`, { sprintId });
        break; // Return partial results
      }
      // No issues fetched, propagate error
      throw new Error(`Failed to fetch issues for sprint ${sprintId}: ${error.message}`);
    }
  }
  
  if (pageCount >= maxPages && !isLast) {
    logger.warn(`Sprint ${sprintId}: Reached maximum page limit (${maxPages}), stopping pagination`, {
      totalIssues: allIssues.length,
      lastStartAt: startAt
    });
  }
  
  logger.info(`Sprint ${sprintId}: Completed fetching issues`, {
    totalIssues: allIssues.length,
    pagesFetched: pageCount
  });

  // Filter issues
  const filtered = allIssues.filter(issue => {
    // Filter by project
    if (!selectedProjects.includes(issue.fields?.project?.key)) {
      return false;
    }

    // Filter by type (allow multiple issue types)
    const issueTypeName = issue.fields?.issuetype?.name;
    if (!issueTypeName || !allowedIssueTypes.includes(issueTypeName)) {
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

  // Log issue type distribution for debugging
  if (filtered.length > 0) {
    const typeCounts = {};
    filtered.forEach(issue => {
      const type = issue.fields?.issuetype?.name || 'Unknown';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    logger.debug(`Sprint ${sprintId}: Filtered issues by type`, typeCounts);
  }

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
    issueType: issue.fields?.issuetype?.name || '',
    assigneeDisplayName: issue.fields?.assignee?.displayName || '',
    created: issue.fields?.created || '',
    updated: issue.fields?.updated || '',
    resolutionDate: issue.fields?.resolutiondate || '',
  };

  // Validate issueType presence for data quality tracking
  if (!issue.fields?.issuetype?.name) {
    logger.warn(`Issue ${issue.key}: Missing issueType field`, {
      issueKey: issue.key,
      projectKey: issue.fields?.project?.key
    });
  }

  // Validate issueType presence for data quality tracking
  if (!issue.fields?.issuetype?.name) {
    logger.warn(`Issue ${issue.key}: Missing issueType field`, {
      issueKey: issue.key,
      projectKey: issue.fields?.project?.key
    });
  }

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
        let pageCount = 0;
        const maxPages = 100; // Safety limit to prevent infinite loops

        while (!isLast && pageCount < maxPages) {
          pageCount++;
          logger.debug(`Fetching bugs for sprint ${sprintId}, page ${pageCount} (startAt: ${startAt})`);

          const response = await agileClient.sprint.getIssuesForSprint({
            sprintId,
            startAt,
            maxResults,
          });

          // Log response structure for debugging
          logger.debug(`Sprint ${sprintId} bugs page ${pageCount} response structure`, {
            hasIssues: !!response.issues,
            issuesIsArray: Array.isArray(response.issues),
            responseIsArray: Array.isArray(response),
            total: response.total,
            isLast: response.isLast,
            startAt: response.startAt,
            maxResults: response.maxResults
          });

          if (response.issues && Array.isArray(response.issues)) {
            allIssues.push(...response.issues);
            logger.debug(`Sprint ${sprintId} bugs page ${pageCount}: added ${response.issues.length} issues (total so far: ${allIssues.length})`);
          } else if (Array.isArray(response)) {
            allIssues.push(...response);
            logger.debug(`Sprint ${sprintId} bugs page ${pageCount}: added ${response.length} issues from array response (total so far: ${allIssues.length})`);
          } else {
            logger.warn(`Sprint ${sprintId} bugs page ${pageCount}: unexpected response structure`, { responseKeys: Object.keys(response || {}) });
          }

          // Determine if this is the last page
          if (response.isLast !== undefined) {
            isLast = response.isLast;
          } else if (response.total !== undefined) {
            isLast = (startAt + maxResults >= response.total);
          } else {
            const issuesCount = (response.issues && Array.isArray(response.issues)) ? response.issues.length :
                              (Array.isArray(response) ? response.length : 0);
            isLast = (issuesCount === 0 || issuesCount < maxResults);
          }

          startAt += maxResults;
        }

        // Filter to bugs in selected projects
        return allIssues.filter(issue => {
          return selectedProjects.includes(issue.fields?.project?.key) &&
                 issue.fields?.issuetype?.name === 'Bug';
        });
      } catch (error) {
        logger.error(`Error fetching bugs for sprint ${sprintId}`, {
          error: error.message,
          stack: error.stack,
          sprintId,
        });
        return [];
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    allBugs.push(...chunkResults.flat());
  }

  return allBugs;
}

/**
 * Fetches Epic issues directly by their keys
 * @param {string[]} epicKeys - Array of Epic issue keys
 * @param {Version3Client} version3Client - Jira Version3 client
 * @param {number} concurrencyLimit - Maximum concurrent requests (default: 3)
 * @returns {Promise<Array>} - Array of Epic issue objects
 */
export async function fetchEpicIssues(epicKeys, version3Client, concurrencyLimit = 3) {
  if (!epicKeys || epicKeys.length === 0) {
    return [];
  }

  const uniqueEpicKeys = [...new Set(epicKeys.filter(Boolean))];
  const allEpics = [];

  // Process Epic keys in chunks to limit concurrency
  for (let i = 0; i < uniqueEpicKeys.length; i += concurrencyLimit) {
    const chunk = uniqueEpicKeys.slice(i, i + concurrencyLimit);

    const chunkPromises = chunk.map(async (epicKey) => {
      try {
        logger.debug(`Fetching Epic issue ${epicKey}`);
        const epic = await version3Client.issues.getIssue({
          issueIdOrKey: epicKey,
        });
        
        // Verify it's actually an Epic
        if (epic.fields?.issuetype?.name === 'Epic') {
          return epic;
        } else {
          logger.warn(`Issue ${epicKey} is not an Epic (type: ${epic.fields?.issuetype?.name})`);
          return null;
        }
      } catch (error) {
        // Distinguish between expected (404) and unexpected (500) errors
        if (error.statusCode === 404 || error.message?.toLowerCase().includes('not found')) {
          logger.debug(`Epic ${epicKey} not found, skipping`);
        } else {
          logger.error(`Failed to fetch Epic ${epicKey}: ${error.message}`, {
            error: error.stack,
            epicKey,
            statusCode: error.statusCode
          });
        }
        return null;
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    allEpics.push(...chunkResults.filter(Boolean));
  }

  logger.info(`Fetched ${allEpics.length} Epic issues out of ${uniqueEpicKeys.length} requested`);
  return allEpics;
}
