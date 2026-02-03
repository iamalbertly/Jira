/**
 * Current-sprint transparency: active sprint resolution, observed work window,
 * daily completion histogram, scope-change list, and flags.
 * Used by GET /api/current-sprint.json (snapshot-first when Phase 3 is active).
 */

import { fetchSprintsForBoard } from './sprints.js';
import { fetchSprintIssuesForTransparency } from './issues.js';
import { calculateWorkDays } from './kpiCalculations.js';
import { logger } from './Jira-Reporting-App-Server-Logging-Utility.js';
import path from 'path';
import { readFile } from 'fs/promises';

/** Default assumption set for v1 (completion anchor = resolution date) */
const DEFAULT_ASSUMPTIONS = [
  'Completion anchored to: resolution date.',
  'Observed window from story created/resolution only.',
  'Scope added = created after sprint start (no changelog in v1).',
  'Burndown assumes linear scope; scope changes shown separately.',
];

const CURRENT_SPRINT_NOTES_PATH = path.join(process.cwd(), 'data', 'current-sprint-notes.json');

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

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeList(input) {
  if (Array.isArray(input)) {
    return input.map(item => String(item || '').trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input
      .split(/\r?\n/)
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
}

async function readCurrentSprintNotes() {
  try {
    const raw = await readFile(CURRENT_SPRINT_NOTES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !isPlainObject(parsed)) return { updatedAt: null, items: {} };
    if (!isPlainObject(parsed.items)) parsed.items = {};
    return parsed;
  } catch (error) {
    if (error?.code === 'ENOENT') return { updatedAt: null, items: {} };
    throw error;
  }
}

function getCurrentSprintNotes(notesData, boardId, sprintId) {
  const boardKey = String(boardId || '');
  const sprintKey = String(sprintId || '');
  if (!boardKey || !sprintKey || !notesData?.items?.[boardKey]?.[sprintKey]) {
    return { dependencies: [], learnings: [], updatedAt: null };
  }
  const entry = notesData.items[boardKey][sprintKey] || {};
  return {
    dependencies: normalizeList(entry.dependencies),
    learnings: normalizeList(entry.learnings),
    updatedAt: entry.updatedAt || null,
  };
}

function normalizeIssueTypeName(issue) {
  return (issue?.fields?.issuetype?.name || '').toLowerCase();
}

function isStoryIssue(issue) {
  const type = normalizeIssueTypeName(issue);
  return type.includes('story');
}

function classifyIssueTypeForSplit(issue) {
  const type = normalizeIssueTypeName(issue);
  if (!type) return 'support';
  if (type.includes('bug') || type.includes('support') || type.includes('ops') || type.includes('operation')) {
    return 'support';
  }
  if (type.includes('task') || type.includes('chore') || type.includes('maintenance')) {
    return 'support';
  }
  if (type.includes('story') || type.includes('feature') || type.includes('improvement')) {
    return 'feature';
  }
  return 'support';
}

function isSubtaskIssue(issue) {
  const type = normalizeIssueTypeName(issue);
  return type.includes('sub-task') || type.includes('subtask');
}

function toHoursFromSeconds(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return 0;
  return Math.round((seconds / 3600) * 10) / 10;
}

function extractTimeTrackingSeconds(issue) {
  const fields = issue?.fields || {};
  const tracking = fields.timetracking || {};
  const original = tracking.originalEstimateSeconds ?? fields.timeoriginalestimate ?? null;
  const spent = tracking.timeSpentSeconds ?? fields.timespent ?? null;
  const remaining = tracking.remainingEstimateSeconds ?? fields.timeestimate ?? null;
  return {
    original: original != null ? Number(original) : null,
    spent: spent != null ? Number(spent) : null,
    remaining: remaining != null ? Number(remaining) : null,
  };
}

function buildIssueUrl(issueKey) {
  const host = process.env.JIRA_HOST;
  if (!host || !issueKey) return '';
  const trimmed = host.endsWith('/') ? host.slice(0, -1) : host;
  const prefix = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
  return `${prefix}/browse/${issueKey}`;
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
  } else if (nowTime > endTime) {
    daysElapsedCalendar = calendarDays;
    daysRemainingCalendar = 0;
    daysElapsedWorking = typeof workingDaysNum === 'number' ? workingDaysNum : null;
    daysRemainingWorking = 0;
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
 * @param {string|null} storyPointsFieldId
 * @returns {{ stories: Array<{ date: string, count: number, spCompleted: number, nps: null }>, subtasks: Array<{ date: string, count: number }> }}
 */
function computeDailyCompletions(issues, storyPointsFieldId) {
  const storyCountByDate = new Map();
  const storySpByDate = new Map();
  const spField = storyPointsFieldId || '';
  for (const issue of issues) {
    if (!isStoryIssue(issue)) continue;
    const res = issue.fields?.resolutiondate;
    if (!res) continue;
    const date = toDateOnly(res);
    if (!date) continue;
    storyCountByDate.set(date, (storyCountByDate.get(date) || 0) + 1);
    const sp = spField ? (parseFloat(issue.fields?.[spField]) || 0) : 0;
    storySpByDate.set(date, (storySpByDate.get(date) || 0) + sp);
  }
  const stories = [...storyCountByDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({
      date,
      count,
      spCompleted: storySpByDate.get(date) || 0,
      nps: null,
    }));
  return { stories, subtasks: [] };
}

function computeStoriesList(issues, storyPointsFieldId) {
  const spField = storyPointsFieldId || '';
  const stories = [];
  for (const issue of issues) {
    if (!isStoryIssue(issue)) continue;
    const sp = spField ? (parseFloat(issue.fields?.[spField]) || 0) : 0;
    const isDone = issue.fields?.status?.statusCategory?.key === 'done';
    stories.push({
      issueKey: issue.key || '',
      summary: (issue.fields?.summary || '').slice(0, 120),
      storyPoints: sp,
      completionPct: isDone ? 100 : 0,
      status: issue.fields?.status?.name || '',
      reporter: issue.fields?.reporter?.displayName || '',
      assignee: issue.fields?.assignee?.displayName || '',
      issueUrl: buildIssueUrl(issue.key || ''),
    });
  }
  stories.sort((a, b) => a.issueKey.localeCompare(b.issueKey));
  return stories;
}

function computeSubtaskTracking(issues) {
  const subtasks = [];
  let totalEstimateHours = 0;
  let totalLoggedHours = 0;
  let missingEstimate = 0;
  let missingLogged = 0;
  const byAssignee = new Map();
  const byReporter = new Map();

  function ensureGroup(map, name) {
    if (!map.has(name)) {
      map.set(name, { recipient: name, missingEstimate: [], missingLogged: [] });
    }
    return map.get(name);
  }

  for (const issue of issues) {
    if (!isSubtaskIssue(issue)) continue;
    const tracking = extractTimeTrackingSeconds(issue);
    const estimateHours = toHoursFromSeconds(tracking.original || 0);
    const loggedHours = toHoursFromSeconds(tracking.spent || 0);
    const remainingHours = toHoursFromSeconds(tracking.remaining || 0);
    totalEstimateHours += estimateHours;
    totalLoggedHours += loggedHours;

    const assignee = issue.fields?.assignee?.displayName || 'Unassigned';
    const reporter = issue.fields?.reporter?.displayName || 'Unassigned';
    const parentKey = issue.fields?.parent?.key || '';
    const parentSummary = issue.fields?.parent?.fields?.summary || '';
    const created = issue.fields?.created || '';
    const updated = issue.fields?.updated || '';
    const issueUrl = buildIssueUrl(issue.key || '');
    const parentUrl = parentKey ? buildIssueUrl(parentKey) : '';

    if (estimateHours === 0) missingEstimate += 1;
    if (estimateHours > 0 && loggedHours === 0) missingLogged += 1;

    const row = {
      issueKey: issue.key || '',
      summary: (issue.fields?.summary || '').slice(0, 140),
      assignee,
      reporter,
      estimateHours,
      loggedHours,
      remainingHours,
      created,
      updated,
      parentKey,
      parentSummary,
      issueUrl,
      parentUrl,
    };
    subtasks.push(row);

    const assigneeGroup = ensureGroup(byAssignee, assignee);
    const reporterGroup = ensureGroup(byReporter, reporter);
    if (estimateHours === 0) {
      assigneeGroup.missingEstimate.push(row);
      reporterGroup.missingEstimate.push(row);
    } else if (loggedHours === 0) {
      assigneeGroup.missingLogged.push(row);
      reporterGroup.missingLogged.push(row);
    }
  }

  return {
    summary: {
      totalEstimateHours: Math.round(totalEstimateHours * 10) / 10,
      totalLoggedHours: Math.round(totalLoggedHours * 10) / 10,
      missingEstimate,
      missingLogged,
    },
    subtasks,
    notifications: [...byAssignee.entries()].map(([name, groups]) => ({
      recipient: name,
      missingEstimate: groups.missingEstimate,
      missingLogged: groups.missingLogged,
    })),
    notificationsByReporter: [...byReporter.entries()].map(([name, groups]) => ({
      recipient: name,
      missingEstimate: groups.missingEstimate,
      missingLogged: groups.missingLogged,
    })),
  };
}

function computeSprintSummary(stories, allIssues, storyPointsFieldId) {
  const spField = storyPointsFieldId || '';
  const totalStories = stories.length;
  const doneStories = stories.filter(s => s.completionPct === 100).length;
  const totalSP = stories.reduce((sum, s) => sum + (parseFloat(s.storyPoints) || 0), 0);
  const doneSP = stories.reduce((sum, s) => sum + (s.completionPct === 100 ? (parseFloat(s.storyPoints) || 0) : 0), 0);
  const percentDone = totalSP > 0 ? Math.round((doneSP / totalSP) * 100) : (totalStories > 0 ? Math.round((doneStories / totalStories) * 100) : 0);

  let newFeaturesSP = 0;
  let supportOpsSP = 0;
  let totalAllSP = 0;
  for (const issue of allIssues) {
    const sp = spField ? (parseFloat(issue.fields?.[spField]) || 0) : 0;
    totalAllSP += sp;
    const bucket = classifyIssueTypeForSplit(issue);
    if (bucket === 'feature') newFeaturesSP += sp;
    else supportOpsSP += sp;
  }

  return {
    totalStories,
    doneStories,
    totalSP,
    doneSP,
    percentDone,
    newFeaturesSP,
    supportOpsSP,
    totalAllSP,
  };
}

function computeIdealBurndown(remainingWorkByDay) {
  if (!remainingWorkByDay || remainingWorkByDay.length === 0) return [];
  const totalSP = remainingWorkByDay[0].remainingSP || 0;
  const days = remainingWorkByDay.length;
  if (days === 1) {
    return [{ date: remainingWorkByDay[0].date, remainingSP: totalSP }];
  }
  return remainingWorkByDay.map((row, index) => {
    const pct = index / (days - 1);
    const remaining = Math.max(0, Math.round((totalSP - totalSP * pct) * 100) / 100);
    return { date: row.date, remainingSP: remaining };
  });
}

function resolveSprintFromList(sprints, options) {
  const sprintId = options?.sprintId != null ? Number(options.sprintId) : null;
  const useRecentClosedIfNoActive = options?.useRecentClosedIfNoActive ?? true;
  const recentClosedWithinDays = options?.recentClosedWithinDays ?? 14;
  const now = Date.now();

  let sprint = null;
  if (sprintId != null && !Number.isNaN(sprintId)) {
    sprint = sprints.find(s => Number(s.id) === sprintId) || null;
  }

  if (!sprint) {
    const active = sprints.find(s => (s.state || '').toLowerCase() === 'active');
    sprint = active || null;
  }

  if (!sprint && useRecentClosedIfNoActive) {
    const cutoff = now - recentClosedWithinDays * 24 * 60 * 60 * 1000;
    const closed = sprints.filter(s => (s.state || '').toLowerCase() === 'closed');
    const recent = closed
      .filter(s => s.endDate && new Date(s.endDate).getTime() >= cutoff)
      .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
    sprint = recent[0] || null;
  }

  return sprint;
}

function resolveRecentSprints(sprints, currentSprint, maxItems = 6) {
  if (!Array.isArray(sprints)) return [];
  const normalized = new Map();
  const currentState = currentSprint?.state ? String(currentSprint.state).toLowerCase() : '';
  const current = currentSprint ? { ...currentSprint, state: currentState || currentSprint.state } : null;
  if (current) normalized.set(current.id, current);

  for (const sprint of sprints) {
    if (!sprint || sprint.id == null) continue;
    const state = (sprint.state || '').toLowerCase();
    if (state !== 'active' && state !== 'closed') continue;
    if (!normalized.has(sprint.id)) {
      normalized.set(sprint.id, { ...sprint, state });
    }
  }

  const sorted = [...normalized.values()]
    .sort((a, b) => {
      const aTime = new Date(a.endDate || a.startDate || 0).getTime();
      const bTime = new Date(b.endDate || b.startDate || 0).getTime();
      return bTime - aTime;
    })
    .slice(0, maxItems);

  return sorted.map(s => ({
    id: s.id,
    name: s.name || '',
    state: s.state || '',
    startDate: s.startDate || '',
    endDate: s.endDate || '',
  }));
}

function resolveNextSprint(sprints, currentSprint) {
  if (!currentSprint || !Array.isArray(sprints)) return null;
  const currentEnd = currentSprint.endDate ? new Date(currentSprint.endDate).getTime() : null;
  const future = sprints.filter(s => {
    const state = (s.state || '').toLowerCase();
    if (state === 'future') return true;
    if (!currentEnd || !s.startDate) return false;
    return new Date(s.startDate).getTime() > currentEnd;
  });
  if (future.length === 0) return null;
  future.sort((a, b) => new Date(a.startDate || 0).getTime() - new Date(b.startDate || 0).getTime());
  const next = future[0];
  return {
    id: next.id,
    name: next.name || '',
    goal: next.goal || '',
    startDate: next.startDate || '',
    endDate: next.endDate || '',
  };
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
  const sprints = await fetchSprintsForBoard(boardId, agileClient);
  const sprint = resolveSprintFromList(sprints, {
    sprintId: options?.sprintId,
    useRecentClosedIfNoActive,
    recentClosedWithinDays,
  });

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
      stuckCandidates: [],
      previousSprint: null,
      recentSprints: [],
      nextSprint: null,
      stories: [],
      summary: null,
      idealBurndown: [],
      notes: { dependencies: [], learnings: [], updatedAt: null },
      assumptions: DEFAULT_ASSUMPTIONS,
      meta: { fromSnapshot: false, snapshotAt: null },
    };
  }

  const issues = await fetchSprintIssuesForTransparency(
    sprint.id,
    agileClient,
    projectKeys || [board.location?.projectKey].filter(Boolean),
    ['Story', 'User Story', 'Bug', 'Task', 'Sub-task', 'Subtask'],
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

  const dailyCompletions = computeDailyCompletions(issues, fields?.storyPointsFieldId || null);
  const remainingWorkByDay = computeRemainingWorkByDay(
    issues,
    sprint.startDate,
    sprint.endDate,
    fields?.storyPointsFieldId || null
  );
  const idealBurndown = computeIdealBurndown(remainingWorkByDay);
  const { scopeChanges, scopeChangeSummary } = computeScopeChanges(
    issues,
    sprint.startDate,
    fields?.storyPointsFieldId || null
  );

  const subtaskTracking = computeSubtaskTracking(issues);
  const stories = computeStoriesList(issues, fields?.storyPointsFieldId || null);
  const summary = computeSprintSummary(stories, issues, fields?.storyPointsFieldId || null);
  summary.subtaskEstimatedHours = subtaskTracking.summary.totalEstimateHours;
  summary.subtaskLoggedHours = subtaskTracking.summary.totalLoggedHours;
  summary.subtaskMissingEstimate = subtaskTracking.summary.missingEstimate;
  summary.subtaskMissingLogged = subtaskTracking.summary.missingLogged;

  const stuckThreshold = Date.now() - 24 * 60 * 60 * 1000;
  const stuckCandidates = issues
    .filter((issue) => issue.fields?.status?.statusCategory?.key !== 'done')
    .filter((issue) => {
      const updated = issue.fields?.updated;
      if (!updated) return false;
      return new Date(updated).getTime() < stuckThreshold;
    })
    .map((issue) => ({
      issueKey: issue.key || '',
      summary: (issue.fields?.summary || '').slice(0, 80),
      status: issue.fields?.status?.name || '',
      updated: issue.fields?.updated || '',
    }));

  let previousSprint = null;
  try {
    const closed = sprints
      .filter(s => (s.state || '').toLowerCase() === 'closed')
      .sort((a, b) => new Date(b.endDate || 0).getTime() - new Date(a.endDate || 0).getTime());
    const currentEnd = sprint.endDate ? new Date(sprint.endDate).getTime() : null;
    const prior = (sprint.state || '').toLowerCase() === 'active'
      ? closed[0]
      : closed.find(s => s.id !== sprint.id && (!currentEnd || new Date(s.endDate || 0).getTime() < currentEnd));
    if (prior && prior.id !== sprint.id) {
      const prevIssues = await fetchSprintIssuesForTransparency(
        prior.id,
        agileClient,
        projectKeys || [board.location?.projectKey].filter(Boolean),
        ['Story', 'User Story', 'Bug', 'Task', 'Sub-task', 'Subtask'],
        fields
      );
      const spField = fields?.storyPointsFieldId || '';
      let doneSP = 0;
      let doneStories = 0;
      for (const issue of prevIssues) {
        if (!isStoryIssue(issue)) continue;
        if (issue.fields?.status?.statusCategory?.key !== 'done') continue;
        doneStories += 1;
        doneSP += spField ? (parseFloat(issue.fields?.[spField]) || 0) : 0;
      }
      previousSprint = {
        name: prior.name || '',
        id: prior.id,
        doneSP,
        doneStories,
      };
    }
  } catch (err) {
    logger.warn('Previous sprint comparison skipped', { boardId, error: err?.message });
  }

  let notes = { dependencies: [], learnings: [], updatedAt: null };
  try {
    const notesData = await readCurrentSprintNotes();
    notes = getCurrentSprintNotes(notesData, boardId, sprint.id);
  } catch (err) {
    logger.warn('Current sprint notes unavailable', { boardId, error: err?.message });
  }

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
    summary,
    plannedWindow,
    observedWorkWindow: observedWorkWindow.start || observedWorkWindow.end ? observedWorkWindow : null,
    flags,
    daysMeta,
    dailyCompletions,
    remainingWorkByDay,
    idealBurndown,
    scopeChanges,
    scopeChangeSummary,
    subtaskTracking,
    stuckCandidates,
    previousSprint,
    recentSprints: resolveRecentSprints(sprints, sprint),
    nextSprint: resolveNextSprint(sprints, sprint),
    stories,
    notes,
    assumptions,
    meta: { fromSnapshot: false, snapshotAt: null },
  };

  return payload;
}
