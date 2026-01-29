import { logger } from './Jira-Reporting-App-Server-Logging-Utility.js';
import { cache, CACHE_TTL } from './cache.js';

/**
 * Shared pagination helper for fetching sprint issues
 * @param {number} sprintId - Sprint ID
 * @param {AgileClient} agileClient - Jira Agile client
 * @param {string} logPrefix - Prefix for log messages (e.g., "sprint" or "bugs for sprint")
 * @param {number} maxPages - Maximum number of pages to fetch (default: 100)
 * @returns {Promise<{issues: Array, pageCount: number, reachedMaxPages: boolean}>}
 * @throws {Error} If pagination fails and no issues were fetched
 */
async function paginateSprintIssues(sprintId, agileClient, logPrefix = 'sprint', maxPages = 100, fields = null) {
  const allIssues = [];
  let startAt = 0;
  const maxResults = 50;
  let isLast = false;
  let pageCount = 0;
  let reachedMaxPages = false;
  
  while (!isLast && pageCount < maxPages) {
    try {
      pageCount++;
      logger.debug(`Fetching ${logPrefix} ${sprintId} issues, page ${pageCount} (startAt: ${startAt})`);
      
      const response = await agileClient.sprint.getIssuesForSprint({
        sprintId,
        startAt,
        maxResults,
        ...(fields ? { fields } : {}),
      });

      // Log response structure for debugging
      logger.debug(`${logPrefix.charAt(0).toUpperCase() + logPrefix.slice(1)} ${sprintId} page ${pageCount} response structure`, {
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
        logger.debug(`${logPrefix.charAt(0).toUpperCase() + logPrefix.slice(1)} ${sprintId} page ${pageCount}: added ${response.issues.length} issues (total so far: ${allIssues.length})`);
      } else if (Array.isArray(response)) {
        // Fallback: if response is directly an array
        allIssues.push(...response);
        logger.debug(`${logPrefix.charAt(0).toUpperCase() + logPrefix.slice(1)} ${sprintId} page ${pageCount}: added ${response.length} issues from array response (total so far: ${allIssues.length})`);
      } else {
        logger.warn(`${logPrefix.charAt(0).toUpperCase() + logPrefix.slice(1)} ${sprintId} page ${pageCount}: unexpected response structure`, { responseKeys: Object.keys(response || {}) });
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
      logger.error(`Error fetching ${logPrefix} ${sprintId} issues at page ${pageCount}`, {
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
      throw new Error(`Failed to fetch ${logPrefix} ${sprintId} issues: ${error.message}`);
    }
  }
  
  if (pageCount >= maxPages && !isLast) {
    reachedMaxPages = true;
    logger.warn(`${logPrefix.charAt(0).toUpperCase() + logPrefix.slice(1)} ${sprintId}: Reached maximum page limit (${maxPages}), stopping pagination`, {
      totalIssues: allIssues.length,
      lastStartAt: startAt
    });
  }
  
  logger.info(`${logPrefix.charAt(0).toUpperCase() + logPrefix.slice(1)} ${sprintId}: Completed fetching issues`, {
    totalIssues: allIssues.length,
    pagesFetched: pageCount
  });

  return { issues: allIssues, pageCount, reachedMaxPages };
}

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
function buildSprintIssueFields(fieldIds) {
  const coreFields = [
    'summary',
    'status',
    'issuetype',
    'assignee',
    'created',
    'updated',
    'resolutiondate',
    'project',
    'parent',
    'subtasks',
    'labels',
    'components',
    'fixVersions',
    'priority',
    'timetracking',
    'timeoriginalestimate',
    'timespent',
    'timeestimate',
    'aggregatetimeoriginalestimate',
    'aggregatetimespent',
    'aggregatetimeestimate',
  ];

  if (fieldIds?.storyPointsFieldId) {
    coreFields.push(fieldIds.storyPointsFieldId);
  }
  if (fieldIds?.epicLinkFieldId) {
    coreFields.push(fieldIds.epicLinkFieldId);
  }
  if (fieldIds?.ebmFieldIds) {
    Object.values(fieldIds.ebmFieldIds).forEach(fieldId => {
      if (fieldId) {
        coreFields.push(fieldId);
      }
    });
  }

  return coreFields;
}

function toHours(valueSeconds) {
  if (valueSeconds === null || valueSeconds === undefined) {
    return '';
  }
  const seconds = Number(valueSeconds);
  if (Number.isNaN(seconds)) {
    return '';
  }
  return Number((seconds / 3600).toFixed(2));
}

function extractTimeTrackingSeconds(issue) {
  return {
    original:
      issue.fields?.aggregatetimeoriginalestimate ??
      issue.fields?.timeoriginalestimate ??
      issue.fields?.timetracking?.originalEstimateSeconds ??
      null,
    spent:
      issue.fields?.aggregatetimespent ??
      issue.fields?.timespent ??
      issue.fields?.timetracking?.timeSpentSeconds ??
      null,
    remaining:
      issue.fields?.aggregatetimeestimate ??
      issue.fields?.timeestimate ??
      issue.fields?.timetracking?.remainingEstimateSeconds ??
      null,
  };
}

function formatFieldValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return value
      .map(entry => {
        if (entry?.name) return entry.name;
        if (entry?.value) return entry.value;
        if (entry?.displayName) return entry.displayName;
        return String(entry);
      })
      .filter(Boolean)
      .join('; ');
  }
  if (typeof value === 'object') {
    if (value?.name) return value.name;
    if (value?.value) return value.value;
    if (value?.displayName) return value.displayName;
    return '';
  }
  return String(value);
}

async function fetchSubtaskTimeTotals(parentKeys, version3Client) {
  if (!version3Client || !parentKeys || parentKeys.length === 0) {
    return new Map();
  }

  const subtaskSupportFlag = cache.get('subtaskTotals:unsupported');
  if (subtaskSupportFlag?.value) {
    return new Map();
  }

  const uniqueParents = [...new Set(parentKeys.filter(Boolean))];
  const totalsByParent = new Map();
  const pendingParents = [];

  for (const parentKey of uniqueParents) {
    const cached = cache.get(`subtaskTotals:${parentKey}`);
    if (cached?.value) {
      totalsByParent.set(parentKey, cached.value);
    } else {
      pendingParents.push(parentKey);
    }
  }

  if (pendingParents.length === 0) {
    return totalsByParent;
  }

  const fields = [
    'parent',
    'timetracking',
    'timeoriginalestimate',
    'timespent',
    'timeestimate',
    'aggregatetimeoriginalestimate',
    'aggregatetimespent',
    'aggregatetimeestimate',
  ];

  const chunkSize = 30;
  for (let i = 0; i < pendingParents.length; i += chunkSize) {
    const chunk = pendingParents.slice(i, i + chunkSize);
    const jql = `parent in (${chunk.join(',')})`;
    let startAt = 0;
    const maxResults = 100;
    let total = null;

    do {
      let response = null;
      try {
        response = await version3Client.issueSearch.searchForIssuesUsingJqlPost({
          jql,
          startAt,
          maxResults,
          fields,
        });
      } catch (error) {
        const status = error?.response?.status;
        const message = error?.message || '';
        if (status === 410 || message.includes('410')) {
          logger.warn('Subtask time tracking endpoint not available, disabling subtasks time totals for this run', {
            error: message,
          });
          cache.set('subtaskTotals:unsupported', true, CACHE_TTL.SPRINT_ISSUES);
          return new Map();
        }
        throw error;
      }

      const issues = response?.issues || [];
      if (total === null && typeof response?.total === 'number') {
        total = response.total;
      }

      for (const issue of issues) {
        const parentKey = issue.fields?.parent?.key;
        if (!parentKey) continue;
        const tracking = extractTimeTrackingSeconds(issue);
        const current = totalsByParent.get(parentKey) || {
          originalEstimateSeconds: 0,
          spentSeconds: 0,
          remainingSeconds: 0,
        };
        if (tracking.original != null) current.originalEstimateSeconds += Number(tracking.original) || 0;
        if (tracking.spent != null) current.spentSeconds += Number(tracking.spent) || 0;
        if (tracking.remaining != null) current.remainingSeconds += Number(tracking.remaining) || 0;
        totalsByParent.set(parentKey, current);
      }

      startAt += maxResults;
    } while (total !== null && startAt < total);
  }

  for (const parentKey of pendingParents) {
    const value = totalsByParent.get(parentKey) || {
      originalEstimateSeconds: 0,
      spentSeconds: 0,
      remainingSeconds: 0,
    };
    cache.set(`subtaskTotals:${parentKey}`, value, CACHE_TTL.SUBTASK_ISSUES);
    totalsByParent.set(parentKey, value);
  }

  return totalsByParent;
}

export async function fetchSprintIssues(sprintId, agileClient, selectedProjects, requireResolvedBySprintEnd = false, sprintEndDate = null, allowedIssueTypes = ['Story'], fieldIds = null, version3Client = null) {
  const includeSubtaskTotals = !!version3Client;
  const cacheKey = `sprintIssues:${sprintId}:${[...selectedProjects].sort().join(',')}:${requireResolvedBySprintEnd}:${sprintEndDate || ''}:${allowedIssueTypes.join(',')}:${includeSubtaskTotals}:${JSON.stringify(fieldIds?.ebmFieldIds || {})}`;
  const cached = cache.get(cacheKey);
  if (cached?.value) {
    logger.debug(`Cache hit for sprint issues ${sprintId}`, { cacheKey });
    return cached.value;
  }

  const fields = buildSprintIssueFields(fieldIds);
  const { issues: allIssues } = await paginateSprintIssues(sprintId, agileClient, 'sprint', 100, fields);

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

  if (includeSubtaskTotals) {
    const parentKeys = filtered
      .filter(issue => Array.isArray(issue.fields?.subtasks) && issue.fields.subtasks.length > 0)
      .map(issue => issue.key);

    if (parentKeys.length > 0) {
      try {
        const subtaskTotals = await fetchSubtaskTimeTotals(parentKeys, version3Client);
        for (const issue of filtered) {
          const totals = subtaskTotals.get(issue.key);
          issue.fields.subtaskTimeTracking = totals || {
            originalEstimateSeconds: 0,
            spentSeconds: 0,
            remainingSeconds: 0,
          };
        }
      } catch (error) {
        logger.warn('Failed to fetch subtask time tracking totals', { error: error.message });
        for (const issue of filtered) {
          issue.fields.subtaskTimeTracking = {
            originalEstimateSeconds: 0,
            spentSeconds: 0,
            remainingSeconds: 0,
          };
        }
      }
    }
  }

  cache.set(cacheKey, filtered, CACHE_TTL.SPRINT_ISSUES);
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
 * @param {Object} options - Options {includeStoryPoints, includeEpicTTM, epicMap}
 * @param {Map} options.epicMap - Optional Map<epicKey, {title: string, summary: string}> for Epic enrichment
 * @returns {Object} - Drill-down row object
 */
export function buildDrillDownRow(issue, sprint, board, fields, options = {}) {
  const { includeStoryPoints = false, includeEpicTTM = false, epicMap = null } = options;
  const tracking = extractTimeTrackingSeconds(issue);
  const timeOriginalEstimateSeconds = tracking.original;
  const timeSpentSeconds = tracking.spent;
  const timeRemainingSeconds = tracking.remaining;
  const timeVarianceSeconds =
    timeOriginalEstimateSeconds != null && timeSpentSeconds != null
      ? timeSpentSeconds - timeOriginalEstimateSeconds
      : null;
  const subtaskTracking = issue.fields?.subtaskTimeTracking || null;
  const subtaskOriginalEstimateSeconds = subtaskTracking?.originalEstimateSeconds ?? null;
  const subtaskSpentSeconds = subtaskTracking?.spentSeconds ?? null;
  const subtaskRemainingSeconds = subtaskTracking?.remainingSeconds ?? null;
  const subtaskVarianceSeconds =
    subtaskOriginalEstimateSeconds != null && subtaskSpentSeconds != null
      ? subtaskSpentSeconds - subtaskOriginalEstimateSeconds
      : null;
  const labels = Array.isArray(issue.fields?.labels) ? issue.fields.labels : [];
  const components = Array.isArray(issue.fields?.components)
    ? issue.fields.components.map(component => component?.name).filter(Boolean)
    : [];
  const fixVersions = Array.isArray(issue.fields?.fixVersions)
    ? issue.fields.fixVersions.map(version => version?.name).filter(Boolean)
    : [];
  const priorityName = issue.fields?.priority?.name || '';
  const statusCategoryName = issue.fields?.status?.statusCategory?.name || '';
  const subtaskCount = Array.isArray(issue.fields?.subtasks) ? issue.fields.subtasks.length : 0;
  const ebmFieldIds = fields?.ebmFieldIds || {};
  const ebmTeam = formatFieldValue(issue.fields?.[ebmFieldIds['Team']]);
  const ebmProductArea = formatFieldValue(issue.fields?.[ebmFieldIds['Product Area']]);
  const ebmCustomerSegments = formatFieldValue(issue.fields?.[ebmFieldIds['Customer segments']]);
  const ebmValue = formatFieldValue(issue.fields?.[ebmFieldIds['Value']]);
  const ebmImpact = formatFieldValue(issue.fields?.[ebmFieldIds['Impact']]);
  const ebmSatisfaction = formatFieldValue(issue.fields?.[ebmFieldIds['Satisfaction']]);
  const ebmSentiment = formatFieldValue(issue.fields?.[ebmFieldIds['Sentiment']]);
  const ebmSeverity = formatFieldValue(issue.fields?.[ebmFieldIds['Severity']]);
  const ebmSource = formatFieldValue(issue.fields?.[ebmFieldIds['Source']]);
  const ebmWorkCategory = formatFieldValue(issue.fields?.[ebmFieldIds['Work category']]);
  const ebmGoals = formatFieldValue(issue.fields?.[ebmFieldIds['Goals']]);
  const ebmTheme = formatFieldValue(issue.fields?.[ebmFieldIds['Theme']]);
  const ebmRoadmap = formatFieldValue(issue.fields?.[ebmFieldIds['Roadmap']]);
  const ebmFocusAreas = formatFieldValue(issue.fields?.[ebmFieldIds['Focus Areas']]);
  const ebmDeliveryStatus = formatFieldValue(issue.fields?.[ebmFieldIds['Delivery status']]);
  const ebmDeliveryProgress = formatFieldValue(issue.fields?.[ebmFieldIds['Delivery progress']]);

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
    issueStatusCategory: statusCategoryName,
    issuePriority: priorityName,
    issueLabels: labels.join('; '),
    issueComponents: components.join('; '),
    issueFixVersions: fixVersions.join('; '),
    assigneeDisplayName: issue.fields?.assignee?.displayName || '',
    created: issue.fields?.created || '',
    updated: issue.fields?.updated || '',
    resolutionDate: issue.fields?.resolutiondate || '',
    subtaskCount,
    timeOriginalEstimateHours: toHours(timeOriginalEstimateSeconds),
    timeRemainingEstimateHours: toHours(timeRemainingSeconds),
    timeSpentHours: toHours(timeSpentSeconds),
    timeVarianceHours: toHours(timeVarianceSeconds),
    subtaskTimeOriginalEstimateHours: toHours(subtaskOriginalEstimateSeconds),
    subtaskTimeRemainingEstimateHours: toHours(subtaskRemainingSeconds),
    subtaskTimeSpentHours: toHours(subtaskSpentSeconds),
    subtaskTimeVarianceHours: toHours(subtaskVarianceSeconds),
    ebmTeam,
    ebmProductArea,
    ebmCustomerSegments,
    ebmValue,
    ebmImpact,
    ebmSatisfaction,
    ebmSentiment,
    ebmSeverity,
    ebmSource,
    ebmWorkCategory,
    ebmGoals,
    ebmTheme,
    ebmRoadmap,
    ebmFocusAreas,
    ebmDeliveryStatus,
    ebmDeliveryProgress,
  };

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

  // Always resolve epic key when epicLinkFieldId exists (not just for TTM)
  if (fields.epicLinkFieldId) {
    row.epicKey = resolveEpicKey(issue, fields.epicLinkFieldId);
    
    // Enrich with Epic title and summary if epicMap provided
    if (epicMap && row.epicKey) {
      const epicData = epicMap.get(row.epicKey);
      if (epicData) {
        row.epicTitle = epicData.title || '';
        row.epicSummary = epicData.summary || '';
      } else {
        row.epicTitle = '';
        row.epicSummary = '';
      }
    } else {
      row.epicTitle = '';
      row.epicSummary = '';
    }
  } else {
    row.epicKey = '';
    row.epicTitle = '';
    row.epicSummary = '';
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
export async function fetchBugsForSprints(sprintIds, agileClient, selectedProjects, concurrencyLimit = 3, fieldIds = null) {
  const allBugs = [];
  const fields = buildSprintIssueFields(fieldIds);

  // Process sprints in chunks to limit concurrency
  for (let i = 0; i < sprintIds.length; i += concurrencyLimit) {
    const chunk = sprintIds.slice(i, i + concurrencyLimit);

    const chunkPromises = chunk.map(async (sprintId) => {
      try {
        const cacheKey = `bugIssues:${sprintId}:${[...selectedProjects].sort().join(',')}:${JSON.stringify(fieldIds?.ebmFieldIds || {})}`;
        const cached = cache.get(cacheKey);
        if (cached?.value) {
          if (cached.value.__nonEpic) {
            return null;
          }
          return cached.value;
        }

        const { issues: allIssues } = await paginateSprintIssues(sprintId, agileClient, 'bugs for sprint', 100, fields);

        // Filter to bugs in selected projects
        const bugs = allIssues.filter(issue => {
          return selectedProjects.includes(issue.fields?.project?.key) &&
                 issue.fields?.issuetype?.name === 'Bug';
        });
        cache.set(cacheKey, bugs, CACHE_TTL.BUG_ISSUES);
        return bugs;
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
        const cacheKey = `epicIssue:${epicKey}`;
        const cached = cache.get(cacheKey);
        if (cached?.value) {
          return cached.value;
        }
        logger.debug(`Fetching Epic issue ${epicKey}`);
        const epic = await version3Client.issues.getIssue({
          issueIdOrKey: epicKey,
        });
        
        // Verify it's actually an Epic
        if (epic.fields?.issuetype?.name === 'Epic') {
          cache.set(cacheKey, epic, CACHE_TTL.EPIC_ISSUES);
          return epic;
        } else {
          logger.warn(`Issue ${epicKey} is not an Epic (type: ${epic.fields?.issuetype?.name})`);
          cache.set(cacheKey, { __nonEpic: true }, CACHE_TTL.EPIC_ISSUES);
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
