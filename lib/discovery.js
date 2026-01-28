import { cache, CACHE_TTL } from './cache.js';
import { logger } from './Jira-Reporting-App-Server-Logging-Utility.js';

/**
 * Discovers all boards for the given projects with pagination and deduplication
 * @param {string[]} projectKeys - Array of project keys (e.g., ['MPSA', 'MAS'])
 * @param {AgileClient} agileClient - Jira Agile client
 * @returns {Promise<Array>} - Array of unique boards
 */
export async function discoverBoardsForProjects(projectKeys, agileClient) {
  const allBoards = [];
  const boardIdSet = new Set();

  for (const projectKey of projectKeys) {
    const cacheKey = `boards:${projectKey}`;
    let cached = cache.get(cacheKey);
    
    if (cached) {
      allBoards.push(...cached);
      continue;
    }

    const projectBoards = [];
    let startAt = 0;
    const maxResults = 50;
    let isLast = false;

    while (!isLast) {
      try {
        const response = await agileClient.board.getAllBoards({
          projectKeyOrId: projectKey,
          startAt,
          maxResults,
        });

        if (response.values) {
          projectBoards.push(...response.values);
        }

        isLast = response.isLast || false;
        startAt += maxResults;
      } catch (error) {
        logger.error(`Error fetching boards for project ${projectKey}`, error);
        // Propagate error instead of silently breaking
        throw new Error(`Failed to fetch boards for project ${projectKey}: ${error.message}`);
      }
    }

    // Cache the boards for this project
    cache.set(cacheKey, projectBoards, CACHE_TTL.BOARDS);
    allBoards.push(...projectBoards);
  }

  // Deduplicate by boardId
  const uniqueBoards = [];
  for (const board of allBoards) {
    if (!boardIdSet.has(board.id)) {
      boardIdSet.add(board.id);
      uniqueBoards.push(board);
    }
  }

  return uniqueBoards;
}

/**
 * Discovers field IDs for Story Points and Epic Link fields
 * @param {Version3Client} version3Client - Jira Version3 client
 * @returns {Promise<Object>} - Object with storyPointsFieldId and epicLinkFieldId (may be null)
 */
export async function discoverFields(version3Client) {
  const cacheKey = 'fields:all';
  let cached = cache.get(cacheKey);
  
  if (cached) {
    return cached;
  }

  try {
    const fields = await version3Client.issueFields.getFields();
    
    let storyPointsFieldId = null;
    let epicLinkFieldId = null;

    for (const field of fields) {
      const fieldName = field.name?.toLowerCase() || '';
      
      if (!storyPointsFieldId && fieldName === 'story points') {
        storyPointsFieldId = field.id;
      }
      
      if (!epicLinkFieldId && fieldName === 'epic link') {
        epicLinkFieldId = field.id;
      }

      // Early exit if both found
      if (storyPointsFieldId && epicLinkFieldId) {
        break;
      }
    }

    const availableFields = fields.map(field => ({
      id: field.id,
      name: field.name,
      custom: !!field.custom,
      schemaType: field.schema?.type || null,
      schemaCustom: field.schema?.custom || null,
      clauseNames: Array.isArray(field.clauseNames) ? field.clauseNames : [],
    }));

    const customFields = availableFields.filter(field => field.custom);

    const result = {
      storyPointsFieldId,
      epicLinkFieldId,
      availableFields,
      customFields,
    };

    // Cache the result
    cache.set(cacheKey, result, CACHE_TTL.FIELD_IDS);
    return result;
  } catch (error) {
    logger.error('Error discovering fields', error);
    return {
      storyPointsFieldId: null,
      epicLinkFieldId: null,
      availableFields: [],
      customFields: [],
    };
  }
}
