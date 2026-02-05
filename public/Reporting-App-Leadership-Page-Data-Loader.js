import { leadershipDom, leadershipKeys } from './Reporting-App-Leadership-Page-Context.js';
import { renderLeadershipPage } from './Reporting-App-Leadership-Page-Render.js';
import { buildBoardSummaries } from './Reporting-App-Shared-Boards-Summary-Builder.js';
import { initQuarterStrip } from './Reporting-App-Shared-Quarter-Range-Helpers.js';

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
      const hasOption = Array.from(projectsSelect.options).some(o => o.value === val);
      if (hasOption) projectsSelect.value = val;
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

async function loadPreview() {
  const { endInput } = leadershipDom;
  const url = buildPreviewUrl();
  saveFilters();
  showLoading('Loading preview...');
  try {
    const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
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
    meta.windowEnd = endInput?.value ? new Date(endInput.value + 'T23:59:59.999Z').toISOString() : new Date().toISOString();
    const predictabilityPerSprint = body.metrics?.predictability?.perSprint || null;
    const boardSummaries = buildBoardSummaries(boards, sprintsIncluded, rows, meta, predictabilityPerSprint);
    body.boardSummaries = boardSummaries;
    body.meta = meta;
    showContent(renderLeadershipPage(body));
    setQuarterStripEnabled(true);
  } catch (err) {
    showError(err.message || 'Failed to load preview.');
    setQuarterStripEnabled(true);
  }
}

export function initLeadershipFilters() {
  const { projectsSelect, startInput, endInput, previewBtn } = leadershipDom;
  if (previewBtn) previewBtn.addEventListener('click', () => {
    setQuarterStripEnabled(false);
    loadPreview();
  });
  if (projectsSelect) projectsSelect.addEventListener('change', saveFilters);
  if (startInput) startInput.addEventListener('change', saveFilters);
  if (endInput) endInput.addEventListener('change', saveFilters);

  initQuarterStrip('.quarter-strip-inner-leadership', startInput, endInput, {
    formatInputValue: (date) => date.toISOString().slice(0, 10),
    onApply: () => {
      saveFilters();
      document.getElementById('leadership-preview')?.click();
    },
  });
}

export function initLeadershipDefaults() {
  if (!loadSavedFilters()) {
    setDefaultDates();
  }
}

export function renderLeadershipLoading() {
  showLoading('Set date range and click Preview to load normalized trends.');
}
