import { cache, CACHE_TTL } from './cache.js';
import { logger } from './Jira-Reporting-App-Server-Logging-Utility.js';

/**
 * Fetches all sprints for a board with pagination
 * @param {number} boardId - Board ID
 * @param {AgileClient} agileClient - Jira Agile client
 * @returns {Promise<Array>} - Array of sprint objects
 */
export async function fetchSprintsForBoard(boardId, agileClient) {
  const cacheKey = `sprints:${boardId}`;
  const cached = cache.get(cacheKey);
  
  if (cached) {
    return cached;
  }

  const allSprints = [];
  let startAt = 0;
  const maxResults = 50;
  let isLast = false;

  while (!isLast) {
    try {
      const response = await agileClient.board.getAllSprints({
        boardId,
        startAt,
        maxResults,
      });

      if (response.values) {
        allSprints.push(...response.values);
      }

      isLast = response.isLast || false;
      startAt += maxResults;
    } catch (error) {
      logger.error(`Error fetching sprints for board ${boardId}`, error);
      // Propagate error instead of silently breaking
      throw new Error(`Failed to fetch sprints for board ${boardId}: ${error.message}`);
    }
  }

  // Cache the sprints
  cache.set(cacheKey, allSprints, CACHE_TTL.SPRINTS);
  return allSprints;
}

/**
 * Filters sprints by date window overlap and validates dates
 * @param {Array} sprints - Array of sprint objects
 * @param {string} windowStart - ISO date string (UTC)
 * @param {string} windowEnd - ISO date string (UTC)
 * @param {boolean} includeActiveOrMissingEndDate - If true, use completeDate as endDate fallback
 * @returns {Object} - {included: Array, unusable: Array}
 */
export function filterSprintsByOverlap(sprints, windowStart, windowEnd, includeActiveOrMissingEndDate = false) {
  const windowStartTime = new Date(windowStart).getTime();
  const windowEndTime = new Date(windowEnd).getTime();

  const included = [];
  const unusable = [];

  for (const sprint of sprints) {
    const startDate = sprint.startDate ? new Date(sprint.startDate).getTime() : null;
    let endDate = sprint.endDate ? new Date(sprint.endDate).getTime() : null;

    // Handle missing startDate
    if (!startDate) {
      unusable.push({
        ...sprint,
        reason: 'Missing startDate',
      });
      continue;
    }

    // Handle missing endDate
    if (!endDate) {
      if (includeActiveOrMissingEndDate && sprint.completeDate) {
        endDate = new Date(sprint.completeDate).getTime();
      } else {
        unusable.push({
          ...sprint,
          reason: 'Missing endDate',
        });
        continue;
      }
    }

    // Check overlap: sprintStart <= windowEnd AND sprintEnd >= windowStart
    const overlaps = startDate <= windowEndTime && endDate >= windowStartTime;

    if (overlaps) {
      included.push(sprint);
    }
  }

  return { included, unusable };
}
