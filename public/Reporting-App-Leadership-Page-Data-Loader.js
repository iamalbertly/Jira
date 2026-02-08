import { leadershipDom, leadershipKeys } from './Reporting-App-Leadership-Page-Context.js';
import { renderLeadershipPage } from './Reporting-App-Leadership-Page-Render.js';
import { buildBoardSummaries } from './Reporting-App-Shared-Boards-Summary-Builder.js';
import { initQuarterStrip } from './Reporting-App-Shared-Quarter-Range-Helpers.js';
import { SHARED_DATE_RANGE_KEY } from './Reporting-App-Shared-Storage-Keys.js';
import { getValidLastQuery, getFallbackContext } from './Reporting-App-Shared-Context-From-Storage.js';

function setDefaultDates() {
  const { startInput, endInput } = leadershipDom;
  if (!startInput || !endInput) return;
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - 3);
  startInput.value = start.toISOString().slice(0, 10);
  endInput.value = end.toISOString().slice(0, 10);
}

function loadSavedFilters() {
  const { projectsSelect, startInput, endInput } = leadershipDom;
  const { storageKey, projectsKey } = leadershipKeys;
  try {
    const ssotProjects = localStorage.getItem(projectsKey);
    if (ssotProjects && projectsSelect) {
      const val = String(ssotProjects).trim();
      const options = Array.from(projectsSelect.options);
      const hasOption = options.some(o => o.value === val);
      if (hasOption) {
        projectsSelect.value = val;
      } else if (val) {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = 'Current: ' + val.replace(/,/g, ', ');
        projectsSelect.appendChild(opt);
        projectsSelect.value = val;
      }
    }
    const sharedRangeRaw = localStorage.getItem(SHARED_DATE_RANGE_KEY);
    if (sharedRangeRaw) {
      const shared = JSON.parse(sharedRangeRaw);
      if (shared?.start && startInput) startInput.value = String(shared.start).slice(0, 10);
      if (shared?.end && endInput) endInput.value = String(shared.end).slice(0, 10);
      return true;
    }
    const raw = localStorage.getItem(storageKey);
    if (!raw) return Boolean(ssotProjects);
    const saved = JSON.parse(raw);
    if (saved?.projects && projectsSelect) {
      projectsSelect.value = saved.projects;
    }
    if (saved?.start && startInput) {
      startInput.value = saved.start;
    }
    if (saved?.end && endInput) {
      endInput.value = saved.end;
    }
    return Boolean(saved?.start || saved?.end || saved?.projects);
  } catch (_) {
    return false;
  }
}

function saveFilters() {
  const { projectsSelect, startInput, endInput } = leadershipDom;
  const { storageKey, projectsKey } = leadershipKeys;
  try {
    const projectsVal = projectsSelect?.value || '';
    if (projectsVal) localStorage.setItem(projectsKey, projectsVal);
    const payload = {
      projects: projectsVal,
      start: startInput?.value || '',
      end: endInput?.value || '',
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
    if (payload.start && payload.end) {
      localStorage.setItem(SHARED_DATE_RANGE_KEY, JSON.stringify({
        start: payload.start + 'T00:00:00.000Z',
        end: payload.end + 'T23:59:59.999Z',
      }));
    }
  } catch (_) {}
}

function showLoading(msg) {
  const { loadingEl, errorEl, contentEl } = leadershipDom;
  if (loadingEl) {
    loadingEl.textContent = msg || 'Loading...';
    loadingEl.style.display = 'block';
  }
  if (errorEl) errorEl.style.display = 'none';
  if (contentEl) contentEl.style.display = 'none';
}

import { setErrorOnEl, clearEl } from './Reporting-App-Shared-Status-Helpers.js';

function showError(msg) {
  const { loadingEl, errorEl, contentEl } = leadershipDom;
  if (loadingEl) loadingEl.style.display = 'none';
  if (errorEl) {
    setErrorOnEl(errorEl, msg);
  }
  if (contentEl) contentEl.style.display = 'none';
}

function clearError() {
  const { errorEl } = leadershipDom;
  clearEl(errorEl);
}

function showContent(html) {
  const { loadingEl, errorEl, contentEl } = leadershipDom;
  if (loadingEl) loadingEl.style.display = 'none';
  if (errorEl) errorEl.style.display = 'none';
  if (contentEl) {
    contentEl.innerHTML = html;
    contentEl.style.display = 'block';
  }
}

function buildPreviewUrl() {
  const { projectsSelect, startInput, endInput } = leadershipDom;
  const projects = (projectsSelect?.value || 'MPSA,MAS').trim();
  const start = startInput?.value || '';
  const end = endInput?.value || '';
  const startISO = start ? new Date(start + 'T00:00:00.000Z').toISOString() : '';
  const endISO = end ? new Date(end + 'T23:59:59.999Z').toISOString() : '';
  const params = new URLSearchParams({
    projects,
    start: startISO,
    end: endISO,
    includeStoryPoints: 'true',
    includeBugsForRework: 'true',
    includePredictability: 'true',
    includeEpicTTM: 'true',
  });
  return '/preview.json?' + params.toString();
}

function setQuarterStripEnabled(enabled) {
  document.querySelectorAll('.quarter-pill').forEach(b => { b.disabled = !enabled; });
}

let leadershipRequestSeq = 0;
let leadershipInFlightController = null;

async function loadPreview() {
  const { startInput, endInput, projectsSelect } = leadershipDom;
  const startVal = startInput?.value || '';
  const endVal = endInput?.value || '';
  if (!startVal || !endVal || startVal > endVal) {
    showError('Start date must be before end date.');
    return;
  }
  const url = buildPreviewUrl();
  saveFilters();
  showLoading('Loading preview...');
  leadershipRequestSeq += 1;
  const requestId = leadershipRequestSeq;
  if (leadershipInFlightController) {
    try { leadershipInFlightController.abort(); } catch (_) {}
  }
  leadershipInFlightController = new AbortController();
  try {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: leadershipInFlightController.signal,
    });
    if (requestId !== leadershipRequestSeq) return;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        showError('Session expired. Sign in again to continue. ');
        const errorEl = document.getElementById('leadership-error');
        if (errorEl) {
          const link = document.createElement('a');
          link.href = '/?redirect=/sprint-leadership';
          link.className = 'nav-link';
          link.textContent = 'Sign in';
          link.style.marginLeft = '4px';
          errorEl.appendChild(link);
        }
        setQuarterStripEnabled(true);
        return;
      }
      const msg = (body && (body.message || body.error)) || response.statusText || 'Preview failed';
      throw new Error(msg);
    }
    const boards = body.boards || [];
    const sprintsIncluded = body.sprintsIncluded || [];
    const rows = body.rows || [];
    const meta = body.meta || {};
    if (!boards || boards.length === 0 || (sprintsIncluded && sprintsIncluded.length === 0)) {
      showError('No sprint data in this range. Widen the date range or check project access.');
      setQuarterStripEnabled(true);
      return;
    }
    meta.windowStart = startInput?.value ? new Date(startInput.value + 'T00:00:00.000Z').toISOString() : '';
    meta.windowEnd = endInput?.value ? new Date(endInput.value + 'T23:59:59.999Z').toISOString() : new Date().toISOString();
    meta.projects = projectsSelect?.value || '';
    const predictabilityPerSprint = body.metrics?.predictability?.perSprint || null;
    const boardSummaries = buildBoardSummaries(boards, sprintsIncluded, rows, meta, predictabilityPerSprint);
    body.boardSummaries = boardSummaries;
    body.meta = meta;
    showContent(renderLeadershipPage(body));
    setQuarterStripEnabled(true);
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    showError(err.message || 'Failed to load preview.');
    setQuarterStripEnabled(true);
  } finally {
    if (requestId === leadershipRequestSeq) {
      leadershipInFlightController = null;
    }
  }
}

export function initLeadershipFilters() {
  const { projectsSelect, startInput, endInput, previewBtn } = leadershipDom;
  let autoPreviewTimer = null;
  const scheduleAutoPreview = (delayMs = 600) => {
    if (autoPreviewTimer) clearTimeout(autoPreviewTimer);
    autoPreviewTimer = setTimeout(() => {
      autoPreviewTimer = null;
      loadPreview();
    }, delayMs);
  };

  if (previewBtn) previewBtn.addEventListener('click', () => {
    setQuarterStripEnabled(false);
    loadPreview();
  });
  if (projectsSelect) projectsSelect.addEventListener('change', () => {
    saveFilters();
    scheduleAutoPreview();
  });
  if (startInput) startInput.addEventListener('change', () => {
    saveFilters();
    scheduleAutoPreview();
  });
  if (endInput) endInput.addEventListener('change', () => {
    saveFilters();
    scheduleAutoPreview();
  });

  initQuarterStrip('.quarter-strip-inner-leadership', startInput, endInput, {
    formatInputValue: (date) => date.toISOString().slice(0, 10),
    onApply: () => {
      saveFilters();
      loadPreview();
    },
  });
}

export function initLeadershipDefaults() {
  if (!loadSavedFilters()) {
    setDefaultDates();
  }
}

/**
 * If we have valid stored context (last query or projects + date range), trigger preview once.
 * Call after initLeadershipFilters() so the UI is wired.
 */
export function tryAutoRunPreviewOnce() {
  const ctx = getValidLastQuery() || getFallbackContext();
  if (!ctx || !ctx.projects || !ctx.start || !ctx.end) return;
  loadPreview();
}

export function renderLeadershipLoading() {
  showLoading('Loading normalized trends for the selected projects and date range...');
}
