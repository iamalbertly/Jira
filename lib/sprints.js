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
  let pageCount = 0;
  const maxPages = 100; // Safety limit to prevent infinite loops

  while (!isLast && pageCount < maxPages) {
    try {
      pageCount++;
      logger.debug(`Fetching sprints for board ${boardId}, page ${pageCount} (startAt: ${startAt})`);

      const response = await agileClient.board.getAllSprints({
        boardId,
        startAt,
        maxResults,
      });

      if (response.values && Array.isArray(response.values)) {
        allSprints.push(...response.values);
        logger.debug(`Board ${boardId} page ${pageCount}: added ${response.values.length} sprints (total so far: ${allSprints.length})`);
      } else if (Array.isArray(response)) {
        allSprints.push(...response);
        logger.debug(`Board ${boardId} page ${pageCount}: added ${response.length} sprints from array response (total so far: ${allSprints.length})`);
      } else {
        logger.warn(`Board ${boardId} page ${pageCount}: unexpected response structure when fetching sprints`, {
          responseKeys: Object.keys(response || {}),
        });
      }

      // Determine if this is the last page
      if (response.isLast !== undefined) {
        isLast = response.isLast;
      } else if (response.total !== undefined) {
        isLast = (startAt + maxResults >= response.total);
      } else {
        const sprintCount = (response.values && Array.isArray(response.values)) ? response.values.length :
                          (Array.isArray(response) ? response.length : 0);
        isLast = (sprintCount === 0 || sprintCount < maxResults);
      }

      startAt += maxResults;
    } catch (error) {
      logger.error(`Error fetching sprints for board ${boardId}`, {
        error: error.message,
        stack: error.stack,
        boardId,
        startAt,
        sprintsFetched: allSprints.length,
      });
      // Propagate error instead of silently breaking
      throw new Error(`Failed to fetch sprints for board ${boardId}: ${error.message}`);
    }
  }

  if (pageCount >= maxPages && !isLast) {
    logger.warn(`Board ${boardId}: Reached maximum page limit (${maxPages}) when fetching sprints`, {
      totalSprints: allSprints.length,
      lastStartAt: startAt,
    });
  }

  logger.info(`Board ${boardId}: Completed fetching sprints`, {
    totalSprints: allSprints.length,
    pagesFetched: pageCount,
  });

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
