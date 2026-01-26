import express from 'express';
import dotenv from 'dotenv';

// Load environment variables FIRST before any other imports
dotenv.config();

import { createAgileClient, createVersion3Client } from './lib/jiraClients.js';
import { discoverBoardsForProjects, discoverFields } from './lib/discovery.js';
import { fetchSprintsForBoard, filterSprintsByOverlap } from './lib/sprints.js';
import { fetchSprintIssues, buildDrillDownRow, fetchBugsForSprints } from './lib/issues.js';
import { calculateThroughput, calculateDoneComparison, calculateReworkRatio, calculatePredictability, calculateEpicTTM } from './lib/metrics.js';
import { streamCSV, CSV_COLUMNS } from './lib/csv.js';
import { logger } from './lib/Jira-Reporting-App-Server-Logging-Utility.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '50mb' })); // Increase limit for large CSV exports
app.use(express.static('public'));

/**
 * Retry handler for 429 rate limit errors
 */
async function retryOnRateLimit(fn, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // Check for 429 status code in various error formats
      const statusCode = error.statusCode || 
                        error.cause?.response?.status || 
                        error.response?.status ||
                        (error.cause?.status);
      
      if (statusCode === 429 && attempt < maxRetries - 1) {
        const retryAfter = error.cause?.response?.headers?.['retry-after'] || 
                          error.response?.headers?.['retry-after'] ||
                          Math.pow(2, attempt);
        const delay = parseInt(retryAfter) * 1000;
        logger.warn(`Rate limited, retrying after ${delay}ms`, { attempt: attempt + 1, maxRetries });
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}

/**
 * GET /report - Serve the main report page
 */
app.get('/report', (req, res) => {
  res.sendFile('report.html', { root: './public' });
});

/**
 * GET /preview.json - Generate preview data
 */
app.get('/preview.json', async (req, res) => {
  try {
    // Parse query parameters
    const projectsParam = req.query.projects;
    // If projects param exists (even if empty string), parse it; otherwise use default
    let selectedProjects;
    if (projectsParam !== undefined && projectsParam !== null) {
      // projects param was provided (could be empty string)
      const parsed = projectsParam.split(',').map(p => p.trim()).filter(Boolean);
      selectedProjects = parsed;
    } else {
      // projects param not provided, use default
      selectedProjects = ['MPSA', 'MAS'];
    }
    
    // Validate projects FIRST (before any other operations)
    // Check for empty array (explicitly empty projects=) or no valid projects
    if (!selectedProjects || selectedProjects.length === 0) {
      return res.status(400).json({ 
        error: 'At least one project must be selected',
        code: 'NO_PROJECTS_SELECTED',
        message: 'Please select at least one project (MPSA or MAS) to generate a report.'
      });
    }
    
    const windowStart = req.query.start || '2025-04-01T00:00:00.000Z';
    const windowEnd = req.query.end || '2025-06-30T23:59:59.999Z';
    
    const includeStoryPoints = req.query.includeStoryPoints === 'true';
    const requireResolvedBySprintEnd = req.query.requireResolvedBySprintEnd === 'true';
    const includeBugsForRework = req.query.includeBugsForRework === 'true';
    const includePredictability = req.query.includePredictability === 'true';
    const predictabilityMode = req.query.predictabilityMode || 'approx';
    const includeEpicTTM = req.query.includeEpicTTM === 'true';
    const includeActiveOrMissingEndDateSprints = req.query.includeActiveOrMissingEndDateSprints === 'true';

    // Validate date window
    const startDate = new Date(windowStart);
    const endDate = new Date(windowEnd);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ 
        error: 'Invalid date window',
        code: 'INVALID_DATE_FORMAT',
        message: 'Please provide valid start and end dates in ISO 8601 format (e.g., 2025-04-01T00:00:00.000Z)'
      });
    }
    if (startDate >= endDate) {
      return res.status(400).json({ 
        error: 'Start date must be before end date',
        code: 'INVALID_DATE_RANGE',
        message: 'The start date must be earlier than the end date. Please adjust your date range.'
      });
    }
    
    // Validate date range is not too large (max 2 years)
    const maxRangeDays = 730;
    const rangeDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    if (rangeDays > maxRangeDays) {
      return res.status(400).json({
        error: 'Date range too large',
        code: 'DATE_RANGE_TOO_LARGE',
        message: `Date range cannot exceed ${maxRangeDays} days (approximately 2 years). Current range: ${rangeDays} days. Please select a smaller date window.`
      });
    }

    // Initialize clients
    logger.info('Initializing Jira clients', { projects: selectedProjects });
    let agileClient, version3Client;
    try {
      agileClient = createAgileClient();
      version3Client = createVersion3Client();
      logger.info('Jira clients initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Jira clients', error);
      throw error;
    }

    // Discovery
    logger.info('Starting board discovery', { projects: selectedProjects });
    const boards = await retryOnRateLimit(() => 
      discoverBoardsForProjects(selectedProjects, agileClient)
    );
    logger.info('Board discovery completed', { boardCount: boards.length });

    logger.info('Starting field discovery');
    const fields = await retryOnRateLimit(() => 
      discoverFields(version3Client)
    );
    logger.info('Field discovery completed', { 
      storyPointsFieldId: fields.storyPointsFieldId ? 'found' : 'not found',
      epicLinkFieldId: fields.epicLinkFieldId ? 'found' : 'not found'
    });

    // Fetch sprints for all boards
    logger.info('Fetching sprints for boards', { boardCount: boards.length });
    const allSprints = [];
    for (const board of boards) {
      logger.debug(`Fetching sprints for board ${board.id} (${board.name})`);
      const sprints = await retryOnRateLimit(() => 
        fetchSprintsForBoard(board.id, agileClient)
      );
      logger.debug(`Found ${sprints.length} sprints for board ${board.id}`);
      allSprints.push(...sprints.map(s => ({ ...s, boardId: board.id, boardName: board.name })));
    }
    logger.info('Sprint fetching completed', { totalSprints: allSprints.length });

    // Filter sprints by overlap
    logger.info('Filtering sprints by date overlap', { 
      windowStart, 
      windowEnd, 
      totalSprints: allSprints.length 
    });
    const { included: sprintsIncluded, unusable: sprintsUnusable } = 
      filterSprintsByOverlap(allSprints, windowStart, windowEnd, includeActiveOrMissingEndDateSprints);
    logger.info('Sprint filtering completed', { 
      included: sprintsIncluded.length, 
      unusable: sprintsUnusable.length 
    });

    // Create sprint map for quick lookup
    const sprintMap = new Map();
    for (const sprint of sprintsIncluded) {
      sprintMap.set(sprint.id, sprint);
    }

    // Fetch issues for included sprints (with concurrency limit of 3)
    logger.info('Fetching issues for sprints', { sprintCount: sprintsIncluded.length });
    const allRows = [];
    const sprintIds = sprintsIncluded.map(s => s.id);
    
    for (let i = 0; i < sprintIds.length; i += 3) {
      const chunk = sprintIds.slice(i, i + 3);
      logger.debug(`Processing sprint chunk ${Math.floor(i/3) + 1}, sprints: ${chunk.join(', ')}`);
      
      const chunkPromises = chunk.map(async (sprintId) => {
        const sprint = sprintMap.get(sprintId);
        const board = boards.find(b => b.id === sprint.boardId);
        
        const issues = await retryOnRateLimit(() =>
          fetchSprintIssues(
            sprintId,
            agileClient,
            selectedProjects,
            requireResolvedBySprintEnd,
            sprint.endDate
          )
        );

        logger.debug(`Sprint ${sprintId}: found ${issues.length} done stories`);
        return issues.map(issue => 
          buildDrillDownRow(
            issue,
            sprint,
            board,
            fields,
            { includeStoryPoints, includeEpicTTM }
          )
        );
      });

      const chunkRows = await Promise.all(chunkPromises);
      allRows.push(...chunkRows.flat());
    }
    logger.info('Issue fetching completed', { totalRows: allRows.length });

    // Calculate metrics
    const metrics = {};

    if (includeStoryPoints) {
      metrics.throughput = calculateThroughput(allRows, includeStoryPoints);
    }

    if (requireResolvedBySprintEnd) {
      metrics.doneComparison = calculateDoneComparison(allRows, requireResolvedBySprintEnd);
    }

    if (includeBugsForRework) {
      const bugIssues = await retryOnRateLimit(() =>
        fetchBugsForSprints(sprintIds, agileClient, selectedProjects, 3)
      );
      metrics.rework = calculateReworkRatio(
        allRows,
        bugIssues,
        includeStoryPoints,
        fields.storyPointsFieldId
      );
    }

    if (includePredictability) {
      metrics.predictability = await calculatePredictability(
        allRows,
        sprintsIncluded,
        predictabilityMode,
        version3Client
      );
    }

    if (includeEpicTTM) {
      metrics.epicTTM = calculateEpicTTM(allRows);
    }

    // Build sprint counts for display
    const sprintsWithCounts = sprintsIncluded.map(sprint => {
      const sprintRows = allRows.filter(r => r.sprintId === sprint.id);
      const doneNow = sprintRows.length;
      
      let doneByEnd = doneNow;
      if (requireResolvedBySprintEnd) {
        doneByEnd = sprintRows.filter(row => {
          if (!row.resolutionDate || !sprint.endDate) return false;
          return new Date(row.resolutionDate).getTime() <= new Date(sprint.endDate).getTime();
        }).length;
      }

      let doneSP = 0;
      if (includeStoryPoints) {
        doneSP = sprintRows.reduce((sum, row) => sum + (parseFloat(row.storyPoints) || 0), 0);
      }

      // Get project keys from rows in this sprint
      const projectKeys = [...new Set(sprintRows.map(r => r.projectKey))];

      return {
        ...sprint,
        projectKeys,
        doneStoriesNow: doneNow,
        doneStoriesBySprintEnd: doneByEnd,
        doneSP,
        excludedWrongProject: 0, // Would require fetching all sprint issues to calculate accurately
      };
    });

    // Response
    res.json({
      meta: {
        selectedProjects,
        windowStart,
        windowEnd,
        discoveredFields: fields,
      },
      boards: boards.map(b => {
        // Try to extract project key from board location
        const projectKey = b.location?.projectKey || 
                          (b.location?.projectId ? 
                            selectedProjects.find(p => b.location.projectId === p) : null) ||
                          null;
        
        return {
          id: b.id,
          name: b.name,
          type: b.type,
          projectKeys: projectKey ? [projectKey] : selectedProjects,
        };
      }),
      sprintsIncluded: sprintsWithCounts,
      sprintsUnusable: sprintsUnusable.map(s => ({
        id: s.id,
        name: s.name,
        boardId: s.boardId,
        boardName: s.boardName,
        reason: s.reason,
      })),
      rows: allRows,
      metrics: Object.keys(metrics).length > 0 ? metrics : undefined,
    });

  } catch (error) {
    logger.error('Error generating preview', error);
    
    // Provide specific error messages based on error type
    let errorMessage = 'Failed to generate preview';
    let errorCode = 'PREVIEW_ERROR';
    let userMessage = error.message || 'An unexpected error occurred while generating the preview.';
    
    if (error.message?.includes('Missing required Jira credentials')) {
      errorCode = 'AUTH_ERROR';
      userMessage = 'Jira authentication failed. Please check your JIRA_HOST, JIRA_EMAIL, and JIRA_API_TOKEN in the .env file.';
    } else if (error.message?.includes('Failed to fetch boards')) {
      errorCode = 'BOARD_FETCH_ERROR';
      userMessage = 'Unable to fetch boards from Jira. Please verify the project keys are correct and you have access to the projects.';
    } else if (error.message?.includes('Rate limited') || error.statusCode === 429) {
      errorCode = 'RATE_LIMIT_ERROR';
      userMessage = 'Jira API rate limit exceeded. Please wait a moment and try again.';
    } else if (error.message?.includes('network') || error.code === 'ECONNREFUSED') {
      errorCode = 'NETWORK_ERROR';
      userMessage = 'Network error connecting to Jira. Please check your internet connection and JIRA_HOST setting.';
    }
    
    res.status(500).json({ 
      error: errorMessage,
      code: errorCode,
      message: userMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /export - Stream CSV export
 */
app.post('/export', (req, res) => {
  try {
    const { columns, rows } = req.body;

    if (!Array.isArray(columns) || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'Invalid request body. Expected columns and rows arrays.' });
    }

    streamCSV(columns, rows, res);
  } catch (error) {
    logger.error('Error exporting CSV', error);
    res.status(500).json({ 
      error: 'Failed to export CSV',
      message: error.message 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// Start server
app.listen(PORT, () => {
  // Keep console.log for startup messages
  console.log(`Jira Reporting App running on http://localhost:${PORT}`);
  console.log(`Access the report at http://localhost:${PORT}/report`);
  
  // Verify environment variables are loaded
  const hasHost = !!process.env.JIRA_HOST;
  const hasEmail = !!process.env.JIRA_EMAIL;
  const hasToken = !!process.env.JIRA_API_TOKEN;
  
  if (hasHost && hasEmail && hasToken) {
    console.log(`✓ Jira credentials loaded: ${process.env.JIRA_HOST} (${process.env.JIRA_EMAIL.substring(0, 3)}***)`);
  } else {
    console.warn(`⚠ Missing Jira credentials: HOST=${hasHost}, EMAIL=${hasEmail}, TOKEN=${hasToken}`);
    console.warn(`  Please ensure .env file exists with JIRA_HOST, JIRA_EMAIL, and JIRA_API_TOKEN`);
  }
  
  logger.info('Server started', { port: PORT, credentialsLoaded: hasHost && hasEmail && hasToken });
});
