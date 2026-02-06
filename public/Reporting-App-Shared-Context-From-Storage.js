/**
 * Reads and validates cross-page context (last query or projects + date range) for display and auto-run.
 * Used by shared header context bar and Leadership auto-run.
 */
import {
  PROJECTS_SSOT_KEY,
  SHARED_DATE_RANGE_KEY,
  LAST_QUERY_KEY,
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
 * Returns a one-line display string for the context bar, or a fallback message.
 */
export function getContextDisplayString() {
  const ctx = getValidLastQuery() || getFallbackContext();
  if (!ctx) return 'No report run yet';
  const proj = ctx.projects.replace(/,/g, ', ');
  const startStr = formatDateForContext(ctx.start);
  const endStr = formatDateForContext(ctx.end);
  const rangeStr = startStr && endStr ? `${startStr} – ${endStr}` : '';
  return rangeStr ? `Projects: ${proj} · ${rangeStr}` : `Projects: ${proj}`;
}
