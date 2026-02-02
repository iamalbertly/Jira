/**
 * Current-sprint transparency: active sprint resolution, observed work window,
 * daily completion histogram, scope-change list, and flags.
 * Used by GET /api/current-sprint.json (snapshot-first when Phase 3 is active).
 */

import { getActiveSprintForBoard, getRecentClosedSprintForBoard } from './sprints.js';
import { fetchSprintIssuesForTransparency } from './issues.js';
import { calculateWorkDays } from './kpiCalculations.js';
import { logger } from './Jira-Reporting-App-Server-Logging-Utility.js';

/** Default assumption set for v1 (completion anchor = resolution date) */
const DEFAULT_ASSUMPTIONS = [
  'Completion anchored to: resolution date.',
  'Observed window from story created/resolution only.',
  'Scope added = created after sprint start (no changelog in v1).',
  'Burndown assumes linear scope; scope changes shown separately.',
];

/**
 * Normalize ISO timestamp to date-only string (YYYY-MM-DD) for grouping
 * @param {string} iso
 * @returns {string}
 */
function toDateOnly(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/**
 * Compute observed work window from issues (created + resolutionDate only in v1)
 * @param {Array} issues - Raw Jira issue objects
 * @param {string} sprintStartDate - ISO
 * @param {string} sprintEndDate - ISO
 * @returns {{ start: string | null, end: string | null }}
 */
function computeObservedWorkWindow(issues, sprintStartDate, sprintEndDate) {
  let observedStart = null;
  let observedEnd = null;
  const startTime = sprintStartDate ? new Date(sprintStartDate).getTime() : null;
  const endTime = sprintEndDate ? new Date(sprintEndDate).getTime() : null;

  for (const issue of issues) {
    const created = issue.fields?.created;
    const resolution = issue.fields?.resolutiondate;
    if (created) {
      const t = new Date(created).getTime();
      const minVal = resolution ? Math.min(t, new Date(resolution).getTime()) : t;
      if (observedStart === null || minVal < observedStart) observedStart = minVal;
    }
    if (resolution) {
      const t = new Date(resolution).getTime();
      if (observedEnd === null || t > observedEnd) observedEnd = t;
    }
  }

  return {
    start: observedStart != null ? new Date(observedStart).toISOString() : null,
    end: observedEnd != null ? new Date(observedEnd).toISOString() : null,
  };
}

/**
 * Compute flags: observed before/after sprint dates; sprint dates changed (v1: false)
 */
function computeFlags(observedWindow, plannedStart, plannedEnd) {
  const obsStart = observedWindow.start ? new Date(observedWindow.start).getTime() : null;
  const obsEnd = observedWindow.end ? new Date(observedWindow.end).getTime() : null;
  const planStart = plannedStart ? new Date(plannedStart).getTime() : null;
  const planEnd = plannedEnd ? new Date(plannedEnd).getTime() : null;

  return {
    observedBeforeSprintStart: planStart != null && obsStart != null && obsStart < planStart,
    observedAfterSprintEnd: planEnd != null && obsEnd != null && obsEnd > planEnd,
    sprintDatesChanged: false, // v1: best-effort deferred
  };
}

/**
 * Compute calendar days and working days for sprint; days elapsed/remaining from now
 */
function computeDaysMeta(sprint, now = new Date()) {
  const start = sprint.startDate ? new Date(sprint.startDate) : null;
  const end = sprint.endDate ? new Date(sprint.endDate) : null;
  if (!start || !end) {
    return {
      calendarDays: null,
      workingDays: null,
      daysElapsedCalendar: null,
      daysRemainingCalendar: null,
      daysElapsedWorking: null,
      daysRemainingWorking: null,
    };
  }

  const calendarDays = Math.ceil((end - start) / (24 * 60 * 60 * 1000));
  const workingDays = calculateWorkDays(sprint.startDate, sprint.endDate);
  const workingDaysNum = typeof workingDays === 'number' ? workingDays : null;

  const nowTime = now.getTime();
  const startTime = start.getTime();
  const endTime = end.getTime();

  let daysElapsedCalendar = null;
  let daysRemainingCalendar = null;
  let daysElapsedWorking = null;
  let daysRemainingWorking = null;

  if (nowTime >= startTime && nowTime <= endTime) {
    daysElapsedCalendar = Math.ceil((nowTime - startTime) / (24 * 60 * 60 * 1000));
    daysRemainingCalendar = Math.ceil((endTime - nowTime) / (24 * 60 * 60 * 1000));
    const elapsedStart = new Date(startTime);
    const elapsedEnd = new Date(nowTime);
    const remainingStart = new Date(nowTime);
    const remainingEnd = new Date(endTime);
    daysElapsedWorking = typeof workingDaysNum === 'number' ? calculateWorkDays(elapsedStart, elapsedEnd) : null;
    daysRemainingWorking = typeof workingDaysNum === 'number' ? calculateWorkDays(remainingStart, remainingEnd) : null;
  }

  return {
    calendarDays,
    workingDays: workingDaysNum,
    daysElapsedCalendar,
    daysRemainingCalendar,
    daysElapsedWorking,
    daysRemainingWorking,
  };
}

/**
 * Daily completion histogram: stories completed per day (resolutionDate). Subtasks v1: empty (proxy deferred).
 * @param {Array} issues - Raw Jira issues
 * @returns {{ stories: Array<{ date: string, count: number }>, subtasks: Array<{ date: string, count: number }> }}
 */
function computeDailyCompletions(issues) {
  const storyCountByDate = new Map();
  for (const issue of issues) {
    const res = issue.fields?.resolutiondate;
    if (!res) continue;
    const date = toDateOnly(res);
    if (!date) continue;
    storyCountByDate.set(date, (storyCountByDate.get(date) || 0) + 1);
  }
  const stories = [...storyCountByDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));
  return { stories, subtasks: [] };
}

/**
 * Burndown context: remaining SP by day (initial total SP minus cumulative completed by that day).
 * @param {Array} issues - Raw Jira issues
 * @param {string} sprintStartDate - ISO
 * @param {string} sprintEndDate - ISO
 * @param {string|null} storyPointsFieldId - Custom field ID for story points
 * @returns {Array<{ date: string, remainingSP: number }>}
 */
function computeRemainingWorkByDay(issues, sprintStartDate, sprintEndDate, storyPointsFieldId) {
  if (!sprintStartDate || !sprintEndDate) return [];
  const start = new Date(sprintStartDate);
  const end = new Date(sprintEndDate);
  const spField = storyPointsFieldId || '';

  let totalSP = 0;
  const spResolvedByDate = new Map();
  for (const issue of issues) {
    const sp = spField ? (parseFloat(issue.fields?.[spField]) || 0) : 0;
    totalSP += sp;
    const res = issue.fields?.resolutiondate;
    if (!res) continue;
    const date = toDateOnly(res);
    if (!date) continue;
    spResolvedByDate.set(date, (spResolvedByDate.get(date) || 0) + sp);
  }

  const result = [];
  const current = new Date(start);
  let cumulative = 0;
  while (current <= end) {
    const dateStr = toDateOnly(current.toISOString());
    const daySP = spResolvedByDate.get(dateStr) || 0;
    cumulative += daySP;
    result.push({ date: dateStr, remainingSP: Math.max(0, totalSP - cumulative) });
    current.setDate(current.getDate() + 1);
  }
  return result;
}

/**
 * Scope-change markers (v1 heuristic): issues with created > sprintStartDate. Classify by issueType.
 * @param {Array} issues - Raw Jira issues
 * @param {string} sprintStartDate - ISO
 * @param {string|null} storyPointsFieldId
 * @returns {{ scopeChanges: Array, scopeChangeSummary: Object }}
 */
function computeScopeChanges(issues, sprintStartDate, storyPointsFieldId) {
  const sprintStartTime = sprintStartDate ? new Date(sprintStartDate).getTime() : null;
  const spField = storyPointsFieldId || '';
  const scopeChanges = [];
  const summary = { bug: 0, feature: 0, support: 0 };

  for (const issue of issues) {
    const created = issue.fields?.created;
    if (!created || sprintStartTime == null) continue;
    if (new Date(created).getTime() <= sprintStartTime) continue;

    const issueType = (issue.fields?.issuetype?.name || '').toLowerCase();
    let classification = 'support';
    if (issueType.includes('bug')) classification = 'bug';
    else if (issueType.includes('story') || issueType.includes('feature')) classification = 'feature';
    summary[classification] = (summary[classification] || 0) + 1;

    const sp = spField ? (parseFloat(issue.fields?.[spField]) || 0) : 0;
    scopeChanges.push({
      date: created,
      issueKey: issue.key || '',
      issueType: issue.fields?.issuetype?.name || 'Unknown',
      storyPoints: sp,
      classification,
    });
  }

  scopeChanges.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return { scopeChanges, scopeChangeSummary: summary };
}

/**
 * Build full current-sprint transparency payload for one board.
 * @param {Object} params
 * @param {Object} params.board - { id, name, location?: { projectKey } }
 * @param {string[]} params.projectKeys - Project keys to filter issues (e.g. [board.location.projectKey])
 * @param {Object} params.agileClient - Jira Agile client
 * @param {Object} params.fields - { storyPointsFieldId, epicLinkFieldId, ... }
 * @param {Object} params.options - { useRecentClosedIfNoActive?: boolean, recentClosedWithinDays?: number, completionAnchor?: string }
 * @returns {Promise<Object>} - Payload for GET /api/current-sprint.json
 */
export async function buildCurrentSprintPayload({ board, projectKeys, agileClient, fields, options = {} }) {
  const { useRecentClosedIfNoActive = true, recentClosedWithinDays = 14, completionAnchor = 'resolution' } = options;
  // v1: only resolution is implemented; lastSubtask and statusDone require subtask/status history

  const boardId = board.id;
  const sprint = await getActiveSprintForBoard(boardId, agileClient)
    || (useRecentClosedIfNoActive ? await getRecentClosedSprintForBoard(boardId, agileClient, recentClosedWithinDays) : null);

  if (!sprint) {
    return {
      board: { id: board.id, name: board.name, projectKeys: projectKeys || [] },
      sprint: null,
      plannedWindow: null,
      observedWorkWindow: null,
      flags: null,
      daysMeta: null,
      dailyCompletions: { stories: [], subtasks: [] },
      remainingWorkByDay: [],
      scopeChanges: [],
      scopeChangeSummary: {},
      assumptions: DEFAULT_ASSUMPTIONS,
      meta: { fromSnapshot: false, snapshotAt: null },
    };
  }

  const issues = await fetchSprintIssuesForTransparency(
    sprint.id,
    agileClient,
    projectKeys || [board.location?.projectKey].filter(Boolean),
    ['Story', 'Bug'],
    fields
  );

  const plannedWindow = {
    start: sprint.startDate || null,
    end: sprint.endDate || null,
  };

  const observedWorkWindow = computeObservedWorkWindow(issues, sprint.startDate, sprint.endDate);
  const flags = computeFlags(observedWorkWindow, sprint.startDate, sprint.endDate);
  const daysMeta = computeDaysMeta(sprint);

  const calendarDays = daysMeta.calendarDays;
  const workingDays = daysMeta.workingDays;

  const assumptions = [...DEFAULT_ASSUMPTIONS];
  assumptions.push('Task movement (subtasks): not computed in v1; use stories only.');
  assumptions.push('Completion anchor: Resolution date (last subtask / status Done coming later).');

  const dailyCompletions = computeDailyCompletions(issues);
  const remainingWorkByDay = computeRemainingWorkByDay(
    issues,
    sprint.startDate,
    sprint.endDate,
    fields?.storyPointsFieldId || null
  );
  const { scopeChanges, scopeChangeSummary } = computeScopeChanges(
    issues,
    sprint.startDate,
    fields?.storyPointsFieldId || null
  );

  const payload = {
    board: { id: board.id, name: board.name, projectKeys: projectKeys || [] },
    sprint: {
      id: sprint.id,
      name: sprint.name,
      state: sprint.state || '',
      startDate: sprint.startDate || '',
      endDate: sprint.endDate || '',
      calendarDays,
      workingDays,
    },
    plannedWindow,
    observedWorkWindow: observedWorkWindow.start || observedWorkWindow.end ? observedWorkWindow : null,
    flags,
    daysMeta,
    dailyCompletions,
    remainingWorkByDay,
    scopeChanges,
    scopeChangeSummary,
    assumptions,
    meta: { fromSnapshot: false, snapshotAt: null },
  };

  return payload;
}
