/**
 * Calculates throughput metrics (story points per sprint and per project)
 * @param {Array} rows - Drill-down rows
 * @param {boolean} includeStoryPoints - Whether story points are included
 * @returns {Object} - {perSprint: Map, perProject: Object}
 */
export function calculateThroughput(rows, includeStoryPoints) {
  if (!includeStoryPoints) {
    return { perSprint: new Map(), perProject: {} };
  }

  const perSprint = new Map();
  const perProject = {};

  for (const row of rows) {
    const storyPoints = parseFloat(row.storyPoints) || 0;
    
    // Per sprint
    if (!perSprint.has(row.sprintId)) {
      perSprint.set(row.sprintId, {
        sprintId: row.sprintId,
        sprintName: row.sprintName,
        totalSP: 0,
        storyCount: 0,
      });
    }
    const sprintData = perSprint.get(row.sprintId);
    sprintData.totalSP += storyPoints;
    sprintData.storyCount += 1;

    // Per project
    if (!perProject[row.projectKey]) {
      perProject[row.projectKey] = {
        projectKey: row.projectKey,
        totalSP: 0,
        sprintCount: 0,
        storyCount: 0,
        sprints: new Set(),
      };
    }
    const projectData = perProject[row.projectKey];
    projectData.totalSP += storyPoints;
    projectData.storyCount += 1;
    projectData.sprints.add(row.sprintId);
  }

  // Convert Set to count
  for (const projectKey in perProject) {
    perProject[projectKey].sprintCount = perProject[projectKey].sprints.size;
    perProject[projectKey].averageSPPerSprint = 
      perProject[projectKey].sprintCount > 0
        ? perProject[projectKey].totalSP / perProject[projectKey].sprintCount
        : 0;
    delete perProject[projectKey].sprints;
  }

  return { perSprint, perProject };
}

/**
 * Calculates done now vs done by sprint end comparison
 * @param {Array} rows - Drill-down rows (all are "done now")
 * @param {boolean} requireResolvedBySprintEnd - Whether to calculate "done by end"
 * @returns {Object} - {doneNow: number, doneByEnd: number, perSprint: Map}
 */
export function calculateDoneComparison(rows, requireResolvedBySprintEnd) {
  const doneNow = rows.length;
  let doneByEnd = 0;
  const perSprint = new Map();

  for (const row of rows) {
    if (!perSprint.has(row.sprintId)) {
      perSprint.set(row.sprintId, {
        sprintId: row.sprintId,
        sprintName: row.sprintName,
        doneNow: 0,
        doneByEnd: 0,
      });
    }
    const sprintData = perSprint.get(row.sprintId);
    sprintData.doneNow += 1;

    if (requireResolvedBySprintEnd) {
      if (row.resolutionDate && row.sprintEndDate) {
        const resolutionTime = new Date(row.resolutionDate).getTime();
        const sprintEndTime = new Date(row.sprintEndDate).getTime();
        if (resolutionTime <= sprintEndTime) {
          sprintData.doneByEnd += 1;
          doneByEnd += 1;
        }
      }
    } else {
      // If toggle not enabled, doneByEnd equals doneNow
      sprintData.doneByEnd += 1;
      doneByEnd += 1;
    }
  }

  return { doneNow, doneByEnd, perSprint };
}

/**
 * Calculates rework ratio (bugs vs stories)
 * @param {Array} storyRows - Story rows
 * @param {Array} bugIssues - Bug issues from fetchBugsForSprints
 * @param {boolean} includeStoryPoints - Whether story points are available
 * @param {string} storyPointsFieldId - Story Points field ID
 * @returns {Object} - {reworkRatio: number, bugSP: number, storySP: number, bugCount: number, storyCount: number, spAvailable: boolean}
 */
export function calculateReworkRatio(storyRows, bugIssues, includeStoryPoints, storyPointsFieldId) {
  const storyCount = storyRows.length;
  const bugCount = bugIssues.length;

  if (!includeStoryPoints || !storyPointsFieldId) {
    return {
      reworkRatio: null,
      bugSP: 0,
      storySP: 0,
      bugCount,
      storyCount,
      spAvailable: false,
    };
  }

  let storySP = 0;
  for (const row of storyRows) {
    storySP += parseFloat(row.storyPoints) || 0;
  }

  let bugSP = 0;
  for (const issue of bugIssues) {
    const sp = issue.fields?.[storyPointsFieldId];
    bugSP += parseFloat(sp) || 0;
  }

  const totalSP = bugSP + storySP;
  const reworkRatio = totalSP > 0 ? (bugSP / totalSP) * 100 : 0;

  return {
    reworkRatio,
    bugSP,
    storySP,
    bugCount,
    storyCount,
    spAvailable: true,
  };
}

/**
 * Calculates predictability metrics (committed vs delivered)
 * @param {Array} rows - Drill-down rows
 * @param {Array} sprints - Sprint objects with startDate/endDate
 * @param {string} predictabilityMode - 'approx' or 'strict'
 * @param {Version3Client} version3Client - For changelog access in strict mode
 * @returns {Promise<Object>} - Predictability metrics
 */
import { logger } from './Jira-Reporting-App-Server-Logging-Utility.js';

export async function calculatePredictability(rows, sprints, predictabilityMode, version3Client) {
  if (predictabilityMode === 'strict') {
    // Strict mode: use changelog to detect sprint membership at sprint start
    // This is complex and may be slow, so we'll implement a best-effort approach
    // For now, fall back to approx mode with a note
    logger.warn('Strict predictability mode not fully implemented, falling back to approx mode');
    return calculatePredictabilityApprox(rows, sprints);
  }

  return calculatePredictabilityApprox(rows, sprints);
}

/**
 * Approximate predictability calculation
 * @param {Array} rows - Drill-down rows
 * @param {Array} sprints - Sprint objects
 * @returns {Object} - Predictability metrics
 */
function calculatePredictabilityApprox(rows, sprints) {
  const sprintMap = new Map();
  for (const sprint of sprints) {
    sprintMap.set(sprint.id, sprint);
  }

  const perSprint = new Map();

  for (const row of rows) {
    const sprint = sprintMap.get(row.sprintId);
    if (!sprint) continue;

    if (!perSprint.has(row.sprintId)) {
      perSprint.set(row.sprintId, {
        sprintId: row.sprintId,
        sprintName: row.sprintName,
        committedStories: 0,
        committedSP: 0,
        deliveredStories: 0,
        deliveredSP: 0,
      });
    }

    const sprintData = perSprint.get(row.sprintId);
    const sprintStartTime = new Date(sprint.startDate).getTime();
    const sprintEndTime = new Date(sprint.endDate).getTime();
    const createdTime = new Date(row.created).getTime();
    const resolutionTime = row.resolutionDate ? new Date(row.resolutionDate).getTime() : null;

    // Committed: created <= sprintStartDate
    if (createdTime <= sprintStartTime) {
      sprintData.committedStories += 1;
      sprintData.committedSP += parseFloat(row.storyPoints) || 0;
    }

    // Delivered: resolutionDate <= sprintEndDate
    if (resolutionTime && resolutionTime <= sprintEndTime) {
      sprintData.deliveredStories += 1;
      sprintData.deliveredSP += parseFloat(row.storyPoints) || 0;
    }
  }

  // Calculate predictability percentage
  for (const [sprintId, data] of perSprint.entries()) {
    if (data.committedStories > 0) {
      data.predictabilityStories = (data.deliveredStories / data.committedStories) * 100;
    } else {
      data.predictabilityStories = 0;
    }

    if (data.committedSP > 0) {
      data.predictabilitySP = (data.deliveredSP / data.committedSP) * 100;
    } else {
      data.predictabilitySP = 0;
    }
  }

  return {
    mode: 'approx',
    perSprint,
  };
}

/**
 * Calculates Epic Time-To-Market (TTM) metrics
 * @param {Array} rows - Drill-down rows
 * @returns {Object} - Epic TTM data
 */
export function calculateEpicTTM(rows) {
  const epicMap = new Map();

  for (const row of rows) {
    if (!row.epicKey) continue;

    if (!epicMap.has(row.epicKey)) {
      epicMap.set(row.epicKey, {
        epicKey: row.epicKey,
        storyCount: 0,
        createdDates: [],
        resolutionDates: [],
      });
    }

    const epicData = epicMap.get(row.epicKey);
    epicData.storyCount += 1;

    if (row.created) {
      epicData.createdDates.push(new Date(row.created));
    }
    if (row.resolutionDate) {
      epicData.resolutionDates.push(new Date(row.resolutionDate));
    }
  }

  const epicTTM = [];
  for (const [epicKey, data] of epicMap.entries()) {
    if (data.createdDates.length === 0) continue;

    const startDate = new Date(Math.min(...data.createdDates));
    const endDate = data.resolutionDates.length > 0 
      ? new Date(Math.max(...data.resolutionDates))
      : null;

    if (!endDate) {
      epicTTM.push({
        epicKey,
        storyCount: data.storyCount,
        startDate: startDate.toISOString(),
        endDate: '',
        calendarTTMdays: null,
        workingTTMdays: null,
      });
      continue;
    }

    const calendarTTMdays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    const workingTTMdays = calculateWorkingDays(startDate, endDate);

    epicTTM.push({
      epicKey,
      storyCount: data.storyCount,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      calendarTTMdays,
      workingTTMdays,
    });
  }

  return epicTTM;
}

/**
 * Calculates working days between two dates (excludes weekends)
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {number} - Working days count
 */
function calculateWorkingDays(startDate, endDate) {
  let count = 0;
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    // 0 = Sunday, 6 = Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}
