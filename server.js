import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import { mkdir, appendFile, readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

// SIZE-EXEMPT: Cohesive Express server entry and preview/export orchestration kept together
// for operational transparency, logging, and simpler deployment without introducing additional
// routing layers or indirection.

// Load environment variables FIRST before any other imports
dotenv.config();

import { createAgileClient, createVersion3Client } from './lib/jiraClients.js';
import { discoverBoardsForProjects, discoverFields } from './lib/discovery.js';
import { fetchSprintsForBoard, filterSprintsByOverlap } from './lib/sprints.js';
import { buildCurrentSprintPayload } from './lib/currentSprint.js';
import { fetchSprintIssues, buildDrillDownRow, fetchBugsForSprints, fetchEpicIssues, buildSprintIssuesCacheKey, readCachedSprintIssues } from './lib/issues.js';
import { calculateThroughput, calculateDoneComparison, calculateReworkRatio, calculatePredictability, calculateEpicTTM } from './lib/metrics.js';
import { streamCSV, CSV_COLUMNS } from './lib/csv.js';
import { generateExcelWorkbook, generateExcelFilename, createSummarySheetData, formatDateRangeForFilename } from './lib/excel.js';
import { mapColumnsToBusinessNames } from './lib/columnMapping.js';
import { addKPIColumns, calculateWorkDays } from './lib/kpiCalculations.js';
import { logger } from './lib/Jira-Reporting-App-Server-Logging-Utility.js';
import { cache, CACHE_TTL } from './lib/cache.js';
import { getQuarterLabelAndPeriod, getQuartersUpToCurrent } from './lib/Jira-Reporting-App-Data-VodacomQuarters-01Bounds.js';
import { DEFAULT_WINDOW_START, DEFAULT_WINDOW_END } from './lib/Jira-Reporting-App-Config-DefaultWindow.js';

const DEFAULT_SNAPSHOT_PROJECTS = ['MPSA', 'MAS'];
const SNAPSHOT_REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const SNAPSHOT_DELAY_BETWEEN_BOARDS_MS = 2000;

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
});

class PreviewError extends Error {
  constructor(code, httpStatus, userMessage) {
    super(userMessage);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FEEDBACK_DIR = path.join(__dirname, 'data');
const FEEDBACK_FILE = path.join(__dirname, 'data', 'JiraReporting-Feedback-UserInput-Submission-Log.jsonl');
const CURRENT_SPRINT_NOTES_FILE = path.join(__dirname, 'data', 'current-sprint-notes.json');

const SESSION_SECRET = process.env.SESSION_SECRET;
const APP_LOGIN_USER = process.env.APP_LOGIN_USER;
const APP_LOGIN_PASSWORD = process.env.APP_LOGIN_PASSWORD;
const authEnabled = Boolean(SESSION_SECRET && APP_LOGIN_USER && APP_LOGIN_PASSWORD);

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

function normalizeNotesPayload(payload) {
  return {
    dependencies: normalizeList(payload?.dependencies),
    learnings: normalizeList(payload?.learnings),
  };
}

async function readCurrentSprintNotesFile() {
  try {
    const raw = await readFile(CURRENT_SPRINT_NOTES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { updatedAt: null, items: {} };
    if (!parsed.items || typeof parsed.items !== 'object') parsed.items = {};
    return parsed;
  } catch (error) {
    if (error?.code === 'ENOENT') return { updatedAt: null, items: {} };
    throw error;
  }
}

async function upsertCurrentSprintNotes(boardId, sprintId, payload) {
  const boardKey = String(boardId || '');
  const sprintKey = String(sprintId || '');
  if (!boardKey || !sprintKey) {
    throw new Error('boardId and sprintId are required');
  }

  const notes = await readCurrentSprintNotesFile();
  if (!notes.items[boardKey]) notes.items[boardKey] = {};

  const entry = {
    dependencies: normalizeList(payload?.dependencies),
    learnings: normalizeList(payload?.learnings),
    updatedAt: new Date().toISOString(),
  };

  notes.items[boardKey][sprintKey] = entry;
  notes.updatedAt = entry.updatedAt;

  await mkdir(path.dirname(CURRENT_SPRINT_NOTES_FILE), { recursive: true });
  await writeFile(CURRENT_SPRINT_NOTES_FILE, JSON.stringify(notes, null, 2), 'utf8');

  return entry;
}
const SESSION_IDLE_MS = Number(process.env.SESSION_IDLE_MS) || 30 * 60 * 1000; // 30 min default
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 min
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;
const loginFailuresByIp = new Map(); // ip -> { count, resetAt }

if (process.env.NODE_ENV === 'production' && SESSION_SECRET && (!APP_LOGIN_USER || !APP_LOGIN_PASSWORD)) {
  logger.error('Production requires APP_LOGIN_USER and APP_LOGIN_PASSWORD when SESSION_SECRET is set');
  process.exit(1);
}

// Middleware
app.use(express.json({ limit: '50mb' })); // Increase limit for large CSV exports
app.use(express.urlencoded({ extended: true })); // For login form POST
app.use(express.static('public'));

if (authEnabled) {
  app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: 'vodaagileboard.sid',
    cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 1000 },
  }));
}

function requireAuth(req, res, next) {
  if (!authEnabled) return next();
  if (req.session && req.session.user) {
    const now = Date.now();
    const last = req.session.lastActivity || now;
    if (now - last > SESSION_IDLE_MS) {
      req.session.destroy(() => {});
      const isApi = req.path.endsWith('.json') || req.get('Accept')?.includes('application/json') || req.xhr;
      if (isApi) return res.status(401).json({ error: 'Unauthorized', code: 'SESSION_EXPIRED' });
      return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}&error=timeout`);
    }
    req.session.lastActivity = now;
    return next();
  }
  const isApi = req.path.endsWith('.json') || req.get('Accept')?.includes('application/json') || req.xhr;
  if (isApi) return res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
  const redirect = encodeURIComponent(req.originalUrl);
  return res.redirect(`/login?redirect=${redirect}`);
}

// Login: first screen for unauthenticated users
app.get('/', (req, res) => {
  if (!authEnabled) return res.redirect('/report');
  if (req.session && req.session.user) return res.redirect(req.query.redirect || '/report');
  res.sendFile('login.html', { root: './public' });
});

app.get('/login', (req, res) => {
  if (!authEnabled) return res.redirect('/report');
  if (req.session && req.session.user) return res.redirect(req.query.redirect || '/report');
  res.sendFile('login.html', { root: './public' });
});

app.post('/login', (req, res) => {
  if (!authEnabled) return res.redirect('/report');
  const redirect = (req.body.redirect && req.body.redirect.startsWith('/')) ? req.body.redirect : '/report';
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  let record = loginFailuresByIp.get(ip);
  if (record && now > record.resetAt) {
    loginFailuresByIp.delete(ip);
    record = null;
  }
  if (record && record.count >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
    logger.warn('Login rate limit exceeded', { ip });
    return res.redirect(`/login?redirect=${encodeURIComponent(redirect)}&error=invalid`);
  }
  const honeypot = (req.body.website || '').trim();
  if (honeypot) {
    logger.warn('Login honeypot filled, rejecting', { ip });
    return res.redirect(`/login?redirect=${encodeURIComponent(redirect)}&error=bot`);
  }
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  if (username !== APP_LOGIN_USER || password !== APP_LOGIN_PASSWORD) {
    if (!record) loginFailuresByIp.set(ip, { count: 1, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS });
    else record.count += 1;
    return res.redirect(`/login?redirect=${encodeURIComponent(redirect)}&error=invalid`);
  }
  loginFailuresByIp.delete(ip);
  req.session.user = username;
  req.session.lastActivity = Date.now();
  return res.redirect(redirect);
});

/**
 * Retry handler for 429 rate limit errors
 * @param {Function} fn - async function to execute
 * @param {number} maxRetries - maximum number of retries
 * @param {string} operation - label for logging (boards/sprints/issues/bugs/fields)
 */
async function retryOnRateLimit(fn, maxRetries = 3, operation = 'unknown') {
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
        // Cap backoff to 30 seconds to avoid multi-minute stalls
        const delaySeconds = Math.min(parseInt(retryAfter, 10) || 0, 30) || Math.min(Math.pow(2, attempt), 30);
        const delay = delaySeconds * 1000;
        logger.warn(`Rate limited on ${operation}, retrying after ${delay}ms`, { attempt: attempt + 1, maxRetries, operation, statusCode, retryAfter: delaySeconds });
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}

/**
 * GET /report - Serve the main report page (protected when auth enabled)
 */
app.get('/report', requireAuth, (req, res) => {
  res.sendFile('report.html', { root: './public' });
});

/**
 * GET /current-sprint - Current sprint transparency page (squad view)
 */
app.get('/current-sprint', requireAuth, (req, res) => {
  res.sendFile('current-sprint.html', { root: './public' });
});

/**
 * GET /sprint-leadership - Leadership view (normalized trends, risk signals; no rankings)
 */
app.get('/sprint-leadership', requireAuth, (req, res) => {
  res.sendFile('leadership.html', { root: './public' });
});

app.get('/api/csv-columns', requireAuth, (req, res) => {
  res.json({ columns: CSV_COLUMNS });
});

/**
 * GET /api/date-range?quarter=Q1|Q2|Q3|Q4 - Latest completed Vodacom quarter range (UTC).
 * Returns { start, end, year, label, period } in ISO format. Never returns a future quarter.
 */
app.get('/api/date-range', requireAuth, (req, res) => {
  const quarterParam = (req.query.quarter || '').toUpperCase().replace(/^Q/, '');
  const q = quarterParam === '' ? null : parseInt(quarterParam, 10);
  if (q == null || Number.isNaN(q) || q < 1 || q > 4) {
    return res.status(400).json({
      error: 'Invalid quarter',
      code: 'INVALID_QUARTER',
      message: 'Provide quarter=Q1, Q2, Q3, or Q4.',
    });
  }
  const data = getQuarterLabelAndPeriod(q);
  if (!data) {
    return res.status(500).json({
      error: 'Could not compute quarter range',
      code: 'QUARTER_RANGE_ERROR',
      message: 'Latest completed quarter could not be determined.',
    });
  }
  res.json({ start: data.startISO, end: data.endISO, year: data.year, label: data.label, period: data.period });
});

/**
 * GET /api/format-date-range?start=...&end=... - Format date range for filename (Qn-YYYY or start_to_end).
 * Uses Vodacom quarter rules. Returns { dateRange: string }.
 */
app.get('/api/format-date-range', requireAuth, (req, res) => {
  const start = req.query.start || '';
  const end = req.query.end || '';
  const dateRange = formatDateRangeForFilename(start, end);
  res.json({ dateRange });
});

/**
 * GET /api/quarters-list?count=8 - Last N Vodacom quarters up to current (oldest to newest).
 * Returns { quarters: [{ start, end, label, period, isCurrent }, ...] }.
 */
app.get('/api/quarters-list', requireAuth, (req, res) => {
  const count = Math.min(20, Math.max(1, parseInt(req.query.count, 10) || 8));
  const quarters = getQuartersUpToCurrent(count).map((q) => ({
    start: q.startISO,
    end: q.endISO,
    label: q.label,
    period: q.period,
    isCurrent: q.isCurrent,
  }));
  res.json({ quarters });
});

/**
 * GET /api/default-window - Default report date window (SSOT from config).
 * Returns { start, end } in ISO format.
 */
app.get('/api/default-window', requireAuth, (req, res) => {
  res.json({ start: DEFAULT_WINDOW_START, end: DEFAULT_WINDOW_END });
});

/**
 * GET /api/boards.json - List boards for given projects (for current-sprint board selector)
 * Query: projects (optional, default MPSA,MAS)
 */
app.get('/api/boards.json', requireAuth, async (req, res) => {
  try {
    const projectsParam = req.query.projects;
    const selectedProjects = projectsParam != null
      ? Array.from(new Set(projectsParam.split(',').map(p => p.trim()).filter(Boolean)))
      : ['MPSA', 'MAS'];
    if (!selectedProjects.length) {
      return res.status(400).json({ error: 'At least one project required', code: 'NO_PROJECTS' });
    }
    const agileClient = createAgileClient();
    const boards = await retryOnRateLimit(
      () => discoverBoardsForProjects(selectedProjects, agileClient),
      3,
      'discoverBoards'
    );
    const list = boards.map(b => ({
      id: b.id,
      name: b.name,
      type: b.type,
      projectKey: b.location?.projectKey || null,
    }));
    res.json({ projects: selectedProjects, boards: list });
  } catch (error) {
    logger.error('Error fetching boards', error);
    res.status(500).json({ error: 'Failed to fetch boards', code: 'BOARDS_ERROR', message: error.message });
  }
});

/**
 * GET /api/current-sprint.json - Current sprint transparency for one board (protected when auth enabled)
 * Query: boardId (required), projects (optional, default MPSA,MAS), completionAnchor (optional, default resolution)
 */
app.get('/api/current-sprint.json', requireAuth, async (req, res) => {
  try {
    const boardIdParam = req.query.boardId;
    const sprintIdParam = req.query.sprintId;
    const projectsParam = req.query.projects;
    const selectedProjects = projectsParam != null
      ? Array.from(new Set(projectsParam.split(',').map(p => p.trim()).filter(Boolean)))
      : ['MPSA', 'MAS'];
    if (!selectedProjects.length) {
      return res.status(400).json({
        error: 'At least one project required',
        code: 'NO_PROJECTS',
        message: 'Provide boardId and optionally projects (e.g. projects=MPSA,MAS).',
      });
    }
    const boardId = boardIdParam != null ? Number(boardIdParam) : null;
    if (boardId == null || Number.isNaN(boardId)) {
      return res.status(400).json({
        error: 'boardId required',
        code: 'MISSING_BOARD_ID',
        message: 'Provide boardId (e.g. boardId=123).',
      });
    }
    const sprintId = sprintIdParam != null ? Number(sprintIdParam) : null;

    const agileClient = createAgileClient();
    const version3Client = createVersion3Client();
    const boards = await retryOnRateLimit(
      () => discoverBoardsForProjects(selectedProjects, agileClient),
      3,
      'discoverBoardsForCurrentSprint'
    );
    const board = boards.find(b => b.id === boardId);
    if (!board) {
      return res.status(404).json({
        error: 'Board not found',
        code: 'BOARD_NOT_FOUND',
        message: `No board with id ${boardId} in projects ${selectedProjects.join(', ')}.`,
      });
    }

    const projectKeys = board.location?.projectKey ? [board.location.projectKey] : selectedProjects;
    const forceLive = req.query.live === 'true' || req.query.refresh === 'true';
    const snapshotKey = sprintId != null && !Number.isNaN(sprintId)
      ? `currentSprintSnapshot:${boardId}:sprint:${sprintId}`
      : `currentSprintSnapshot:${boardId}`;

    if (!forceLive) {
      const cached = cache.get(snapshotKey);
      const cachedPayload = cached?.value ?? cached;
      if (cachedPayload && typeof cachedPayload === 'object') {
        const out = { ...cachedPayload };
        out.meta = out.meta || {};
        out.meta.fromSnapshot = true;
        out.meta.snapshotAt = cached?.cachedAt ?? null;
        out.meta.jiraHost = out.meta.jiraHost || process.env.JIRA_HOST || '';
        return res.json(out);
      }
    }

    const fields = await retryOnRateLimit(() => discoverFields(version3Client), 3, 'discoverFields');

    const completionAnchor = (req.query.completionAnchor || 'resolution').toLowerCase();
    const supportedAnchors = ['resolution', 'lastsubtask', 'statusdone'];
    const anchor = supportedAnchors.includes(completionAnchor) ? completionAnchor : 'resolution';

    const payload = await buildCurrentSprintPayload({
      board: { id: board.id, name: board.name, location: board.location },
      projectKeys,
      agileClient,
      fields: {
        storyPointsFieldId: fields.storyPointsFieldId,
        epicLinkFieldId: fields.epicLinkFieldId,
        ebmFieldIds: fields.ebmFieldIds || {},
      },
      options: { completionAnchor: anchor, sprintId },
    });

    if (!payload.meta) payload.meta = {};
    payload.meta.completionAnchor = anchor;
    payload.meta.fromSnapshot = false;
    payload.meta.snapshotAt = null;
    payload.meta.jiraHost = process.env.JIRA_HOST || '';

    try {
      cache.set(snapshotKey, payload, CACHE_TTL.CURRENT_SPRINT_SNAPSHOT);
    } catch (e) {
      logger.warn('Failed to cache current-sprint snapshot', { boardId, error: e.message });
    }

    res.json(payload);
  } catch (error) {
    logger.error('Error generating current-sprint payload', error);
    res.status(500).json({
      error: 'Failed to generate current sprint data',
      code: 'CURRENT_SPRINT_ERROR',
      message: error.message || 'An unexpected error occurred.',
    });
  }
});

/**
 * POST /api/current-sprint-notes - Save dependencies/learnings notes for a sprint (protected when auth enabled)
 * Body: { boardId, sprintId, dependencies, learnings }
 */
app.post('/api/current-sprint-notes', requireAuth, async (req, res) => {
  try {
    const boardId = req.body?.boardId != null ? Number(req.body.boardId) : null;
    const sprintId = req.body?.sprintId != null ? Number(req.body.sprintId) : null;
    if (boardId == null || Number.isNaN(boardId) || sprintId == null || Number.isNaN(sprintId)) {
      return res.status(400).json({
        error: 'boardId and sprintId required',
        code: 'MISSING_NOTES_KEYS',
        message: 'Provide boardId and sprintId with dependencies/learnings.',
      });
    }

    const payload = normalizeNotesPayload(req.body || {});
    const saved = await upsertCurrentSprintNotes(boardId, sprintId, payload);
    res.json({ boardId, sprintId, notes: saved });
  } catch (error) {
    logger.error('Error saving current-sprint notes', error);
    res.status(500).json({
      error: 'Failed to save notes',
      code: 'CURRENT_SPRINT_NOTES_ERROR',
      message: error.message || 'An unexpected error occurred.',
    });
  }
});

/**
 * GET /preview.json - Generate preview data (protected when auth enabled)
 */
app.get('/preview.json', requireAuth, async (req, res) => {
  try {
    // Preview timing and phase tracking for transparency and partial responses
    const MAX_PREVIEW_MS = 60 * 1000; // 1 minute soft limit to keep UI responsive
    const previewStartedAt = Date.now();
    const requestedAt = new Date().toISOString();
    const phaseLog = [];
    let isPartial = false;
    let partialReason = null;

    const addPhase = (phase, data = {}) => {
      phaseLog.push({
        phase,
        at: new Date().toISOString(),
        ...data,
      });
    };

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
        message: 'Please select at least one project to generate a report.'
      });
    }
    
    const windowStart = req.query.start || DEFAULT_WINDOW_START;
    const windowEnd = req.query.end || DEFAULT_WINDOW_END;
    
    // Story Points, Epic TTM, and Bugs/Rework are now mandatory (always enabled)
    const includeStoryPoints = req.query.includeStoryPoints !== 'false'; // Default to true, allow override for backward compatibility
    const requireResolvedBySprintEnd = req.query.requireResolvedBySprintEnd === 'true';
    const includeBugsForRework = req.query.includeBugsForRework !== 'false'; // Default to true, allow override for backward compatibility
    const includePredictability = req.query.includePredictability === 'true';
    const predictabilityMode = req.query.predictabilityMode || 'approx';
    const includeEpicTTM = req.query.includeEpicTTM !== 'false'; // Default to true, allow override for backward compatibility
    const includeActiveOrMissingEndDateSprints = req.query.includeActiveOrMissingEndDateSprints === 'true';
    const bypassCache = req.query.bypassCache === 'true';

    // Validate date window
    const startDate = new Date(windowStart);
    const endDate = new Date(windowEnd);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ 
        error: 'Invalid date window',
        code: 'INVALID_DATE_FORMAT',
        message: `Please provide valid start and end dates in ISO 8601 format (e.g., ${DEFAULT_WINDOW_START})`
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

    // Split long windows: prefer cached older sprints + live recent 2 weeks to avoid timeouts
    const RECENT_SPLIT_DAYS = 14;
    const shouldSplitByRecent = !bypassCache && rangeDays > RECENT_SPLIT_DAYS;
    const recentCutoffDate = shouldSplitByRecent ? new Date(endDate) : null;
    if (recentCutoffDate) {
      recentCutoffDate.setDate(recentCutoffDate.getDate() - RECENT_SPLIT_DAYS);
    }

    // Build a stable cache key for this preview request
    const cacheKey = `preview:${JSON.stringify({
      projects: [...selectedProjects].sort(),
      windowStart,
      windowEnd,
      includeStoryPoints,
      requireResolvedBySprintEnd,
      includeBugsForRework,
      includePredictability,
      predictabilityMode,
      includeEpicTTM,
      includeActiveOrMissingEndDateSprints,
    })}`;

    // Serve from cache if available and not bypassed
    const cachedEntry = !bypassCache ? cache.get(cacheKey) : null;
    if (cachedEntry) {
      const cachedPreview = cachedEntry.value || cachedEntry; // Handle both formats
      const cacheAge = cachedEntry.cachedAt ? Date.now() - cachedEntry.cachedAt : null;
      const cacheServedMs = Date.now() - previewStartedAt;
      
      logger.info('Serving preview response from cache', {
        cacheKey,
        projects: selectedProjects,
        windowStart,
        windowEnd,
        cacheAgeMs: cacheAge,
        cacheServedMs,
      });

      let fieldInventory = cachedPreview?.meta?.fieldInventory || null;
      if (!fieldInventory) {
        try {
          const version3Client = createVersion3Client();
          const fieldDiscovery = await discoverFields(version3Client);
          const ebmFieldCandidates = [
            'Customer',
            'Value',
            'Impact',
            'Satisfaction',
            'Sentiment',
            'Severity',
            'Source',
            'Product Area',
            'Work category',
            'Team',
            'Goals',
            'Theme',
            'Roadmap',
            'Focus Areas',
            'Delivery status',
            'Delivery progress',
            'Time to resolution',
            'Time to first response',
            'Time in Status',
          ];
          const ebmFieldsFound = [];
          const ebmFieldsMissing = [];
          for (const candidate of ebmFieldCandidates) {
            const normalized = candidate.toLowerCase();
            const matches = (fieldDiscovery.availableFields || []).filter(field => (field.name || '').toLowerCase().includes(normalized));
            if (matches.length > 0) {
              ebmFieldsFound.push({
                candidate,
                matches: matches.map(field => ({ id: field.id, name: field.name, custom: field.custom })),
              });
            } else {
              ebmFieldsMissing.push(candidate);
            }
          }
          fieldInventory = {
            availableFieldCount: (fieldDiscovery.availableFields || []).length,
            customFieldCount: (fieldDiscovery.customFields || []).length,
            ebmFieldsFound,
            ebmFieldsMissing,
          };
        } catch (error) {
          logger.warn('Failed to hydrate field inventory for cached preview', { error: error.message });
          fieldInventory = {
            availableFieldCount: 0,
            customFieldCount: 0,
            ebmFieldsFound: [],
            ebmFieldsMissing: [],
          };
        }
      }

      // Augment meta with cache metadata without mutating cached snapshot
      const cachedResponse = {
        ...cachedPreview,
        meta: {
          ...cachedPreview.meta,
          fromCache: true,
          cacheAgeMs: cacheAge,
          cacheAgeMinutes: cacheAge ? Math.floor(cacheAge / 60000) : undefined,
          cachedElapsedMs: cachedPreview?.meta?.elapsedMs ?? null,
          elapsedMs: cacheServedMs,
          requestedAt,
          cacheKey,
          fieldInventory,
        },
      };

      return res.json(cachedResponse);
    }

    logger.info('Cache miss for preview response', {
      cacheKey,
      projects: selectedProjects,
      windowStart,
      windowEnd,
    });

    // Initialize clients
    logger.info('Initializing Jira clients', { projects: selectedProjects });
    let agileClient, version3Client;
    try {
      agileClient = createAgileClient();
      version3Client = createVersion3Client();
      logger.info('Jira clients initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Jira clients', error);
      throw new PreviewError(
        'AUTH_ERROR',
        500,
        'Jira authentication failed. Please check your JIRA_HOST, JIRA_EMAIL, and JIRA_API_TOKEN in the .env file.'
      );
    }

    // Discovery
    logger.info('Starting board discovery', { projects: selectedProjects });
    const boards = await retryOnRateLimit(
      () => discoverBoardsForProjects(selectedProjects, agileClient),
      3,
      'discoverBoardsForProjects'
    );
    logger.info('Board discovery completed', { boardCount: boards.length });
    addPhase('discoverBoards', { boardCount: boards.length });

    logger.info('Starting field discovery');
    const fields = await retryOnRateLimit(
      () => discoverFields(version3Client),
      3,
      'discoverFields'
    );
    logger.info('Field discovery completed', { 
      storyPointsFieldId: fields.storyPointsFieldId ? 'found' : 'not found',
      epicLinkFieldId: fields.epicLinkFieldId ? 'found' : 'not found'
    });
    addPhase('discoverFields', {
      hasStoryPointsField: !!fields.storyPointsFieldId,
      hasEpicLinkField: !!fields.epicLinkFieldId,
    });

    const ebmFieldCandidates = [
      'Customer',
      'Value',
      'Impact',
      'Satisfaction',
      'Sentiment',
      'Severity',
      'Source',
      'Product Area',
      'Work category',
      'Team',
      'Goals',
      'Theme',
      'Roadmap',
      'Focus Areas',
      'Delivery status',
      'Delivery progress',
      'Time to resolution',
      'Time to first response',
      'Time in Status',
    ];

    const ebmFieldsFound = [];
    const ebmFieldsMissing = [];
    for (const candidate of ebmFieldCandidates) {
      const normalized = candidate.toLowerCase();
      const matches = (fields.availableFields || []).filter(field => (field.name || '').toLowerCase().includes(normalized));
      if (matches.length > 0) {
        ebmFieldsFound.push({
          candidate,
          matches: matches.map(field => ({ id: field.id, name: field.name, custom: field.custom })),
        });
      } else {
        ebmFieldsMissing.push(candidate);
      }
    }

    const fieldInventory = {
      availableFieldCount: (fields.availableFields || []).length,
      customFieldCount: (fields.customFields || []).length,
      ebmFieldsFound,
      ebmFieldsMissing,
    };

    // Fetch sprints for all boards (chunked to limit concurrency)
    logger.info('Fetching sprints for boards', { boardCount: boards.length });
    const allSprints = [];
    const boardChunks = [];
    const boardChunkSize = 3;
    for (let i = 0; i < boards.length; i += boardChunkSize) {
      boardChunks.push(boards.slice(i, i + boardChunkSize));
    }

    for (const chunk of boardChunks) {
      const chunkPromises = chunk.map(async (board) => {
        logger.debug(`Fetching sprints for board ${board.id} (${board.name})`);
        const sprints = await retryOnRateLimit(
          () => fetchSprintsForBoard(board.id, agileClient),
          3,
          `fetchSprintsForBoard:${board.id}`
        );
        logger.debug(`Found ${sprints.length} sprints for board ${board.id}`);
        return sprints.map(s => ({ ...s, boardId: board.id, boardName: board.name }));
      });
      const chunkResults = await Promise.all(chunkPromises);
      allSprints.push(...chunkResults.flat());
    }
    logger.info('Sprint fetching completed', { totalSprints: allSprints.length });
    addPhase('fetchSprints', { totalSprints: allSprints.length });

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
    addPhase('filterSprints', {
      included: sprintsIncluded.length,
      unusable: sprintsUnusable.length,
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
    const boardMap = new Map(boards.map(board => [board.id, board]));
    const totalChunks = Math.ceil(sprintIds.length / 3);
    const skippedOldSprints = [];
    const cachedOldSprints = [];
    const includeSubtaskTotals = !!version3Client;
    
    for (let i = 0; i < sprintIds.length; i += 3) {
      // Check time budget before processing each chunk
      if (!isPartial && Date.now() - previewStartedAt > MAX_PREVIEW_MS) {
        isPartial = true;
        partialReason = 'Time budget exceeded while fetching sprint issues';
        logger.warn('Preview time budget exceeded during issue fetching', {
          sprintCount: sprintIds.length,
          processedChunks: Math.floor(i / 3),
          totalChunks,
          elapsedMs: Date.now() - previewStartedAt,
        });
        break;
      }

      const chunk = sprintIds.slice(i, i + 3);
      const chunkNumber = Math.floor(i/3) + 1;
      logger.info(`Processing sprint chunk ${chunkNumber}/${totalChunks}`, { 
        sprints: chunk.join(', '),
        progress: `${chunkNumber}/${totalChunks}`
      });
      
      const chunkPromises = chunk.map(async (sprintId) => {
        const sprint = sprintMap.get(sprintId);
        const board = boardMap.get(sprint.boardId) || { id: sprint.boardId || '', name: sprint.boardName || '', projectKeys: [] };
        
        try {
          // Determine allowed issue types based on options
          const allowedTypes = ['Story']; // Always include Stories
          if (includeBugsForRework) {
            allowedTypes.push('Bug');
          }
          // Note: Epic and Feature types can be added here if needed for future enhancements

          const sprintEndCandidate = sprint?.endDate || sprint?.completeDate || sprint?.startDate || null;
          const sprintEndTime = sprintEndCandidate ? new Date(sprintEndCandidate).getTime() : NaN;
          const isRecentSprint = !shouldSplitByRecent || !recentCutoffDate
            ? true
            : ((sprint?.state || '').toLowerCase() === 'active' ||
              Number.isNaN(sprintEndTime) ||
              sprintEndTime >= recentCutoffDate.getTime());

          if (!isRecentSprint && shouldSplitByRecent) {
            const cacheKey = buildSprintIssuesCacheKey({
              sprintId,
              selectedProjects,
              requireResolvedBySprintEnd,
              sprintEndDate: sprint.endDate,
              allowedIssueTypes: allowedTypes,
              includeSubtaskTotals,
              fieldIds: fields,
            });
            const cachedIssues = readCachedSprintIssues(cacheKey);
            if (Array.isArray(cachedIssues) && cachedIssues.length > 0) {
              cachedOldSprints.push(sprintId);
              logger.debug(`Using cached issues for older sprint ${sprintId}`, { cacheKey });
              return cachedIssues.map(issue =>
                buildDrillDownRow(
                  issue,
                  sprint,
                  board,
                  fields,
                  { includeStoryPoints, includeEpicTTM }
                )
              );
            }
            skippedOldSprints.push(sprintId);
            return [];
          }

          const issues = await retryOnRateLimit(
            () =>
              fetchSprintIssues(
                sprintId,
                agileClient,
                selectedProjects,
                requireResolvedBySprintEnd,
                sprint.endDate,
                allowedTypes,
                fields,
                version3Client
              ),
            3,
            `fetchSprintIssues:${sprintId}`
          );

          logger.info(`Sprint ${sprintId} (${sprint.name}): found ${issues.length} done issues (types: ${allowedTypes.join(', ')})`);
          return issues.map(issue => 
            buildDrillDownRow(
              issue,
              sprint,
              board,
              fields,
              { includeStoryPoints, includeEpicTTM }
            )
          );
        } catch (error) {
          logger.error(`Failed to fetch issues for sprint ${sprintId}`, {
            error: error.message,
            sprintName: sprint?.name
          });
          // Return empty array to continue processing other sprints
          return [];
        }
      });

      const chunkRows = await Promise.all(chunkPromises);
      const flatChunkRows = chunkRows.flat();
      const chunkRowCount = flatChunkRows.length;
      allRows.push(...flatChunkRows);
      logger.info(`Chunk ${chunkNumber}/${totalChunks} completed`, {
        rowsInChunk: chunkRowCount,
        totalRowsSoFar: allRows.length
      });
    }

    if (shouldSplitByRecent && skippedOldSprints.length > 0) {
      isPartial = true;
      if (!partialReason) {
        partialReason = `Older sprints are still warming cache; showing cached data plus the most recent ${RECENT_SPLIT_DAYS} days. Use full refresh (bypass cache) to force a complete load.`;
      }
      addPhase('splitWindow', {
        recentDays: RECENT_SPLIT_DAYS,
        cachedOldSprints: cachedOldSprints.length,
        skippedOldSprints: skippedOldSprints.length,
      });

      const backgroundIds = [...new Set(skippedOldSprints)];
      if (backgroundIds.length > 0) {
        const warmSprintsInBackground = async () => {
          try {
            const concurrency = 3;
            for (let i = 0; i < backgroundIds.length; i += concurrency) {
              const slice = backgroundIds.slice(i, i + concurrency);
              await Promise.all(slice.map(async (sid) => {
                const sprint = sprintMap.get(sid);
                const allowedTypes = ['Story'];
                if (includeBugsForRework) allowedTypes.push('Bug');
                try {
                  await fetchSprintIssues(
                    sid,
                    agileClient,
                    selectedProjects,
                    requireResolvedBySprintEnd,
                    sprint?.endDate,
                    allowedTypes,
                    fields,
                    version3Client
                  );
                } catch (err) {
                  logger.warn('Background sprint cache warm failed', { sprintId: sid, error: err.message });
                }
              }));
            }
            logger.info('Background sprint cache warm completed', { warmed: backgroundIds.length });
          } catch (err) {
            logger.warn('Background sprint cache warm failed', { error: err.message });
          }
        };
        setTimeout(() => { warmSprintsInBackground(); }, 0);
      }
    }
    logger.info('Issue fetching completed', { totalRows: allRows.length, totalSprints: sprintIds.length });
    addPhase('fetchIssues', {
      totalRows: allRows.length,
      sprintCount: sprintIds.length,
      partial: isPartial,
    });

    // Fetch Epic issues and enrich rows with Epic title/summary when epicLinkFieldId exists
    let epicMap = new Map();
    let epicIssuesForTTM = []; // Store Epic issues for potential TTM reuse
    if (fields.epicLinkFieldId) {
      // Collect unique Epic keys from rows
      const epicKeys = [...new Set(allRows.map(row => row.epicKey).filter(Boolean))];
      
      if (epicKeys.length > 0) {
        const epicFetchStart = Date.now();
        try {
          epicIssuesForTTM = await retryOnRateLimit(
            () => fetchEpicIssues(epicKeys, version3Client, 3),
            3,
            'fetchEpicIssues'
          );
          const epicFetchDuration = Date.now() - epicFetchStart;
          
          // Create epicMap from fetched Epic issues
          for (const epic of epicIssuesForTTM) {
            if (epic?.key) {
              epicMap.set(epic.key, {
                title: epic.fields?.summary || '',
                summary: epic.fields?.description || ''
              });
            }
          }
          
          // Enrich allRows with epicTitle and epicSummary
          for (const row of allRows) {
            if (row.epicKey) {
              const epicData = epicMap.get(row.epicKey);
              if (epicData) {
                row.epicTitle = epicData.title;
                row.epicSummary = epicData.summary;
              } else {
                row.epicTitle = '';
                row.epicSummary = '';
              }
            } else {
              row.epicTitle = '';
              row.epicSummary = '';
            }
          }
          
          addPhase('fetchEpicIssues', {
            epicCount: epicIssuesForTTM.length,
            requestedCount: epicKeys.length,
            durationMs: epicFetchDuration
          });
          logger.info(`Enriched ${allRows.filter(r => r.epicKey).length} rows with Epic data`);
        } catch (error) {
          logger.warn('Epic fetch failed, continuing without Epic title/summary', {
            error: error.message,
            epicKeyCount: epicKeys.length
          });
          // Gracefully degrade - set empty strings for all rows
          for (const row of allRows) {
            row.epicTitle = '';
            row.epicSummary = '';
          }
          addPhase('fetchEpicIssues', {
            epicCount: 0,
            requestedCount: epicKeys.length,
            error: error.message
          });
        }
      } else {
        // No Epic keys found, set empty strings
        for (const row of allRows) {
          row.epicTitle = '';
          row.epicSummary = '';
        }
      }
    } else {
      // No epicLinkFieldId, set empty strings
      for (const row of allRows) {
        row.epicTitle = '';
        row.epicSummary = '';
      }
    }

    // Calculate metrics
    const metrics = {};
    const meta = {
      selectedProjects,
      windowStart,
      windowEnd,
      discoveredFields: {
        storyPointsFieldId: fields.storyPointsFieldId,
        epicLinkFieldId: fields.epicLinkFieldId,
        ebmFieldIds: fields.ebmFieldIds || {},
      },
      jiraHost: process.env.JIRA_HOST || '',
      fieldInventory,
      fromCache: false,
      requestedAt,
      generatedAt: null,
      elapsedMs: null,
      partial: isPartial,
      partialReason,
      requireResolvedBySprintEnd,
      phaseLog,
    };

    // Respect time budget before running metrics (they can be expensive)
    if (!isPartial && Date.now() - previewStartedAt > MAX_PREVIEW_MS) {
      isPartial = true;
      partialReason = 'Time budget exceeded before metrics; metrics were skipped';
      logger.warn('Preview time budget exceeded before metrics calculation', {
        elapsedMs: Date.now() - previewStartedAt,
        totalRows: allRows.length,
      });
    } else {
      if (includeStoryPoints) {
        metrics.throughput = calculateThroughput(allRows, includeStoryPoints);
      }

      if (requireResolvedBySprintEnd) {
        metrics.doneComparison = calculateDoneComparison(allRows, requireResolvedBySprintEnd);
      }

      if (includeBugsForRework) {
        const bugIssues = await retryOnRateLimit(
          () => fetchBugsForSprints(sprintIds, agileClient, selectedProjects, 3, fields),
          3,
          'fetchBugsForSprints'
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
        // Reuse Epic issues if already fetched for enrichment, otherwise fetch them
        let epicIssues = epicIssuesForTTM;
        if (epicIssues.length === 0) {
          // Epic issues not yet fetched, fetch them now
          const epicKeys = [...new Set(allRows.map(row => row.epicKey).filter(Boolean))];
          
          if (epicKeys.length > 0) {
            const epicFetchStart = Date.now();
            try {
              epicIssues = await retryOnRateLimit(
                () => fetchEpicIssues(epicKeys, version3Client, 3),
                3,
                'fetchEpicIssues'
              );
              const epicFetchDuration = Date.now() - epicFetchStart;
              addPhase('fetchEpicIssues', {
                epicCount: epicIssues.length,
                requestedCount: epicKeys.length,
                durationMs: epicFetchDuration
              });
            } catch (error) {
              logger.error('Epic fetch failed, continuing with story-based calculation', {
                error: error.message,
                epicKeyCount: epicKeys.length
              });
              // Continue with empty epicIssues array - calculateEpicTTM will use fallback
              addPhase('fetchEpicIssues', {
                epicCount: 0,
                requestedCount: epicKeys.length,
                error: error.message
              });
            }
          }
        }
        
        const epicTTMResult = calculateEpicTTM(allRows, epicIssues);
        // Handle both old format (array) and new format (object with metadata)
        if (Array.isArray(epicTTMResult)) {
          metrics.epicTTM = epicTTMResult;
        } else {
          metrics.epicTTM = epicTTMResult.epicTTM;
          if (epicTTMResult.fallbackCount > 0) {
            meta.epicTTMFallbackCount = epicTTMResult.fallbackCount;
            logger.info(`Epic TTM: ${epicTTMResult.fallbackCount} epic(s) used story date fallback`);
          }
        }
        if (Array.isArray(metrics.epicTTM)) {
          meta.epicTitleMissingCount = metrics.epicTTM.filter(epic => !epic.epicTitle).length;
        }
      }

      addPhase('calculateMetrics', {
        hasThroughput: !!metrics.throughput,
        hasDoneComparison: !!metrics.doneComparison,
        hasRework: !!metrics.rework,
        hasPredictability: !!metrics.predictability,
        hasEpicTTM: !!metrics.epicTTM,
      });
    }

    // Build sprint counts for display with time-normalized fields
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

      const projectKeys = [...new Set(sprintRows.map(r => r.projectKey))];

      const sprintCalendarDays = sprint.startDate && sprint.endDate
        ? Math.ceil((new Date(sprint.endDate) - new Date(sprint.startDate)) / (24 * 60 * 60 * 1000))
        : null;
      const sprintWorkDays = sprint.startDate && sprint.endDate
        ? calculateWorkDays(sprint.startDate, sprint.endDate)
        : null;
      const workDaysNum = typeof sprintWorkDays === 'number' ? sprintWorkDays : null;
      const spPerSprintDay = workDaysNum && workDaysNum > 0 ? doneSP / workDaysNum : null;
      const storiesPerSprintDay = workDaysNum && workDaysNum > 0 ? doneNow / workDaysNum : null;

      return {
        ...sprint,
        projectKeys,
        doneStoriesNow: doneNow,
        doneStoriesBySprintEnd: doneByEnd,
        doneSP,
        excludedWrongProject: 0,
        sprintCalendarDays,
        sprintWorkDays: workDaysNum,
        spPerSprintDay,
        storiesPerSprintDay,
      };
    });

    // Indexed delivery per board: current SP/day ÷ rolling avg (last 3–6 sprints)
    const ROLLING_SPRINTS = 6;
    const boardIndexedDelivery = new Map();
    for (const board of boards) {
      const boardSprints = sprintsWithCounts
        .filter(s => s.boardId === board.id)
        .sort((a, b) => new Date(b.endDate || 0).getTime() - new Date(a.endDate || 0).getTime());
      const closed = boardSprints.filter(s => (s.state || '').toLowerCase() === 'closed').slice(0, ROLLING_SPRINTS);
      const active = boardSprints.find(s => (s.state || '').toLowerCase() === 'active');
      const currentSprint = active || closed[0];
      if (!currentSprint || closed.length === 0) continue;
      let totalSP = 0;
      let totalDays = 0;
      for (const s of closed) {
        const wd = s.sprintWorkDays;
        if (wd && wd > 0) {
          totalSP += s.doneSP || 0;
          totalDays += wd;
        }
      }
      const rollingAvgSPPerDay = totalDays > 0 ? totalSP / totalDays : null;
      const currentSPPerDay = currentSprint.spPerSprintDay;
      const index = rollingAvgSPPerDay && rollingAvgSPPerDay > 0 && currentSPPerDay != null
        ? currentSPPerDay / rollingAvgSPPerDay
        : null;
      boardIndexedDelivery.set(board.id, {
        currentSPPerDay,
        rollingAvgSPPerDay,
        sprintCount: closed.length,
        index,
      });
    }

    // Response payload
    const generatedAt = new Date().toISOString();
    const elapsedMs = Date.now() - previewStartedAt;

    meta.generatedAt = generatedAt;
    meta.elapsedMs = elapsedMs;
    meta.partial = isPartial;
    meta.partialReason = partialReason;

    // Hygiene gates for Epic TTM
    const EPIC_HYGIENE_PCT_THRESHOLD = 20;
    const EPIC_SPAN_SPRINTS_THRESHOLD = 12;
    const totalStories = allRows.length;
    const storiesWithoutEpic = allRows.filter(r => !r.epicKey || r.epicKey === '').length;
    const pctWithoutEpic = totalStories > 0 ? (storiesWithoutEpic / totalStories) * 100 : 0;
    const epicToSprints = new Map();
    for (const row of allRows) {
      if (!row.epicKey) continue;
      if (!epicToSprints.has(row.epicKey)) epicToSprints.set(row.epicKey, new Set());
      epicToSprints.get(row.epicKey).add(row.sprintId);
    }
    let epicsSpanningTooMany = [];
    for (const [epicKey, sprintIds] of epicToSprints) {
      if (sprintIds.size > EPIC_SPAN_SPRINTS_THRESHOLD) epicsSpanningTooMany.push(epicKey);
    }
    const epicHygieneOk = pctWithoutEpic <= EPIC_HYGIENE_PCT_THRESHOLD && epicsSpanningTooMany.length === 0;
    meta.epicHygiene = {
      ok: epicHygieneOk,
      pctWithoutEpic: Math.round(pctWithoutEpic * 10) / 10,
      epicsSpanningOverN: epicsSpanningTooMany.length,
      epicsSpanningOverNKeys: epicsSpanningTooMany.slice(0, 5),
      message: !epicHygieneOk
        ? `Epic hygiene insufficient: ${pctWithoutEpic.toFixed(1)}% stories without epic${epicsSpanningTooMany.length ? `; ${epicsSpanningTooMany.length} epic(s) span > ${EPIC_SPAN_SPRINTS_THRESHOLD} sprints` : ''}.`
        : null,
    };

    const responsePayload = {
      meta,
      boards: boards.map(b => {
        const projectKey = b.location?.projectKey ||
                          (b.location?.projectId ?
                            selectedProjects.find(p => b.location.projectId === p) : null) ||
                          null;
        const indexedDelivery = boardIndexedDelivery.get(b.id) || null;
        return {
          id: b.id,
          name: b.name,
          type: b.type,
          projectKeys: projectKey ? [projectKey] : selectedProjects,
          indexedDelivery,
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
    };

    // Store in cache for subsequent identical requests
    try {
      cache.set(cacheKey, responsePayload, CACHE_TTL.PREVIEW);
      logger.info('Cached preview response', {
        cacheKey,
        ttlMs: CACHE_TTL.PREVIEW,
        projects: selectedProjects,
      });
    } catch (cacheError) {
      // Cache failures should not break the request
      logger.warn('Failed to cache preview response', {
        error: cacheError.message,
      });
    }

    res.json(responsePayload);

  } catch (error) {
    logger.error('Error generating preview', error);

    const isPreviewError = error instanceof PreviewError;
    const errorCode = isPreviewError ? error.code : 'PREVIEW_ERROR';
    const httpStatus = isPreviewError ? error.httpStatus : 500;
    const userMessage =
      isPreviewError
        ? error.message
        : (error.message || 'An unexpected error occurred while generating the preview.');

    res.status(httpStatus).json({
      error: 'Failed to generate preview',
      code: errorCode,
      message: userMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /export - Stream CSV export
 */
app.post('/export', requireAuth, (req, res) => {
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

/**
 * POST /export-excel - Generate Excel workbook with multiple sheets
 */
app.post('/export-excel', requireAuth, async (req, res) => {
  try {
    const { workbookData, meta } = req.body;

    if (!workbookData || !Array.isArray(workbookData.sheets)) {
      return res.status(400).json({ error: 'Invalid request body. Expected workbookData with sheets array.' });
    }

    // Generate Excel workbook
    const buffer = await generateExcelWorkbook(workbookData);

    // Set response headers
    const filename = meta ? generateExcelFilename(meta) : 'jira-report.xlsx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);

    // Send buffer
    res.send(buffer);
  } catch (error) {
    logger.error('Error exporting Excel', error);
    res.status(500).json({ 
      error: 'Failed to export Excel',
      message: error.message 
    });
  }
});

// POST /feedback - Capture user feedback for later review (anonymous submissions allowed)
// Simple IP rate-limiting applied to reduce spam while keeping the flow low-friction for users
const feedbackRateLimitByIp = (function () {
  const map = new Map(); // ip -> { count, resetAt }
  const WINDOW_MS = 60 * 1000; // 1 minute
  const MAX_PER_WINDOW = 3; // allow short bursts from same IP
  return {
    check(ip) {
      const now = Date.now();
      let record = map.get(ip);
      if (record && now > record.resetAt) {
        map.delete(ip);
        record = null;
      }
      if (!record) {
        map.set(ip, { count: 1, resetAt: now + WINDOW_MS });
        return true;
      }
      if (record.count >= MAX_PER_WINDOW) return false;
      record.count += 1;
      return true;
    }
  };
})();

app.post('/feedback', async (req, res) => {
  try {
    const { email, message } = req.body || {};
    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '';

    // Message is required; email is optional (allow anonymous feedback)
    if (!trimmedMessage) {
      return res.status(400).json({
        error: 'Invalid feedback payload',
        message: 'Feedback message is required.'
      });
    }

    // Rate limit per IP
    if (!feedbackRateLimitByIp.check(ip)) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many feedback submissions from this IP. Please wait a minute and try again.'
      });
    }

    await mkdir(FEEDBACK_DIR, { recursive: true });
    const feedbackEntry = {
      submittedAt: new Date().toISOString(),
      email: trimmedEmail,
      message: trimmedMessage,
      userAgent: req.headers['user-agent'] || '',
      ip,
      user: (req.session && req.session.user) ? { id: req.session.user.id, username: req.session.user.username } : null,
    };
    await appendFile(FEEDBACK_FILE, `${JSON.stringify(feedbackEntry)}\n`, 'utf-8');

    res.json({ ok: true });
  } catch (error) {
    logger.error('Failed to save feedback', { error: error.message });
    res.status(500).json({
      error: 'Failed to save feedback',
      message: 'Please try again later.'
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

/**
 * Refresh current-sprint snapshots for all boards (DEFAULT_SNAPSHOT_PROJECTS).
 * Runs sequentially with delay between boards to avoid Jira rate limits.
 */
async function refreshCurrentSprintSnapshots() {
  if (!process.env.JIRA_HOST || !process.env.JIRA_EMAIL || !process.env.JIRA_API_TOKEN) {
    return;
  }
  try {
    const agileClient = createAgileClient();
    const version3Client = createVersion3Client();
    const boards = await discoverBoardsForProjects(DEFAULT_SNAPSHOT_PROJECTS, agileClient);
    const fields = await discoverFields(version3Client);
    const fieldOpts = {
      storyPointsFieldId: fields.storyPointsFieldId,
      epicLinkFieldId: fields.epicLinkFieldId,
      ebmFieldIds: fields.ebmFieldIds || {},
    };
    for (const board of boards) {
      try {
        const projectKeys = board.location?.projectKey ? [board.location.projectKey] : DEFAULT_SNAPSHOT_PROJECTS;
        const payload = await buildCurrentSprintPayload({
          board: { id: board.id, name: board.name, location: board.location },
          projectKeys,
          agileClient,
          fields: fieldOpts,
        });
        cache.set(`currentSprintSnapshot:${board.id}`, payload, CACHE_TTL.CURRENT_SPRINT_SNAPSHOT);
        logger.debug('Current-sprint snapshot refreshed', { boardId: board.id, boardName: board.name });
      } catch (err) {
        logger.warn('Current-sprint snapshot refresh failed for board', { boardId: board.id, error: err.message });
      }
      await new Promise(r => setTimeout(r, SNAPSHOT_DELAY_BETWEEN_BOARDS_MS));
    }
    logger.info('Current-sprint snapshot refresh completed', { boardCount: boards.length });
  } catch (err) {
    logger.error('Current-sprint snapshot refresh failed', { error: err.message });
  }
}

// Start server
app.listen(PORT, () => {
  // Keep console.log for startup messages
  console.log(`VodaAgileBoard running on http://localhost:${PORT}`);
  console.log(`Access: ${authEnabled ? 'login at / then /report' : `report at http://localhost:${PORT}/report`}`);
  
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

  // Snapshot refresh: first run after 30s, then hourly
  setTimeout(() => refreshCurrentSprintSnapshots(), 30 * 1000);
  setInterval(() => refreshCurrentSprintSnapshots(), SNAPSHOT_REFRESH_INTERVAL_MS);
});
