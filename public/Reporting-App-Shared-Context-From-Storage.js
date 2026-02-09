/**
 * Reads and validates cross-page context (last query or projects + date range) for display and auto-run.
 * Used by shared header context bar and Leadership auto-run.
 */
import {
  PROJECTS_SSOT_KEY,
  SHARED_DATE_RANGE_KEY,
  LAST_QUERY_KEY,
  REPORT_LAST_RUN_KEY,
} from './Reporting-App-Shared-Storage-Keys.js';

function parseDate(s) {
  if (typeof s !== 'string' || !s.trim()) return null;
  const d = new Date(s.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function isValidRange(start, end) {
  const startD = parseDate(start);
  const endD = parseDate(end);
  if (!startD || !endD) return false;
  return startD.getTime() < endD.getTime();
}

/**
 * Returns validated { projects, start, end } from LAST_QUERY_KEY, or null if missing/invalid.
 * Invalid entries are removed from localStorage.
 */
export function getValidLastQuery() {
  try {
    const raw = localStorage.getItem(LAST_QUERY_KEY);
    if (!raw || !raw.trim()) return null;
    const data = JSON.parse(raw);
    const projects = typeof data?.projects === 'string' ? data.projects.trim() : '';
    const start = typeof data?.start === 'string' ? data.start.trim() : '';
    const end = typeof data?.end === 'string' ? data.end.trim() : '';
    if (!projects || !isValidRange(start, end)) {
      localStorage.removeItem(LAST_QUERY_KEY);
      return null;
    }
    return { projects, start, end };
  } catch (_) {
    try {
      localStorage.removeItem(LAST_QUERY_KEY);
    } catch (_) {}
    return null;
  }
}

/**
 * Returns fallback context from PROJECTS_SSOT_KEY + SHARED_DATE_RANGE_KEY if valid.
 */
export function getFallbackContext() {
  try {
    const projects = localStorage.getItem(PROJECTS_SSOT_KEY);
    const rangeRaw = localStorage.getItem(SHARED_DATE_RANGE_KEY);
    if (!projects || !projects.trim() || !rangeRaw || !rangeRaw.trim()) return null;
    const range = JSON.parse(rangeRaw);
    const start = typeof range?.start === 'string' ? range.start.trim() : '';
    const end = typeof range?.end === 'string' ? range.end.trim() : '';
    if (!isValidRange(start, end)) return null;
    return { projects: projects.trim(), start, end };
  } catch (_) {
    return null;
  }
}

function formatDateForContext(iso) {
  const d = parseDate(iso);
  if (!d) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Returns last-run summary from sessionStorage when available (for context bar).
 */
function getLastRunSummary() {
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(REPORT_LAST_RUN_KEY) : null;
    if (!raw || !raw.trim()) return null;
    const obj = JSON.parse(raw);
    const stories = typeof obj.doneStories === 'number' ? obj.doneStories : null;
    const sprints = typeof obj.sprintsCount === 'number' ? obj.sprintsCount : null;
    if (stories == null && sprints == null) return null;
    const parts = [];
    if (stories != null) parts.push(`${stories} stories`);
    if (sprints != null) parts.push(`${sprints} sprints`);
    return parts.length ? `Last: ${parts.join(', ')}` : null;
  } catch (_) {
    return null;
  }
}

/**
 * Returns a one-line display string for the context bar, or a fallback message.
 * When sessionStorage has last-run data, prepends "Last: X stories, Y sprints · " to projects/range.
 */
export function getContextDisplayString() {
  const ctx = getValidLastQuery() || getFallbackContext();
  const lastRun = getLastRunSummary();
  const proj = ctx ? ctx.projects.replace(/,/g, ', ') : '';
  const startStr = ctx ? formatDateForContext(ctx.start) : '';
  const endStr = ctx ? formatDateForContext(ctx.end) : '';
  const rangeStr = startStr && endStr ? `${startStr} – ${endStr}` : '';
  const contextPart = rangeStr ? `Projects: ${proj} · ${rangeStr}` : (proj ? `Projects: ${proj}` : '');
  if (lastRun && contextPart) return `${lastRun} · ${contextPart}`;
  if (lastRun) return lastRun;
  if (contextPart) return contextPart;
  return 'No report run yet';
}
