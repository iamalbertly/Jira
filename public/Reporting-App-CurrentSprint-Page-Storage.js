import { currentSprintDom, currentSprintKeys } from './Reporting-App-CurrentSprint-Page-Context.js';

export function getProjectsParam() {
  const { projectsSelect } = currentSprintDom;
  const normalizeForCurrentSprint = (value) => {
    const raw = (value || '').trim();
    if (!raw) return '';
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length <= 1) return raw;
    return parts[0];
  };
  const selection = normalizeForCurrentSprint(projectsSelect?.value || '');
  if (selection) return selection;
  try {
    const s = normalizeForCurrentSprint(localStorage.getItem(currentSprintKeys.projectsKey));
    if (s) return s;
  } catch (_) {}
  return 'MPSA';
}

export function getStoredProjects() {
  try {
    return localStorage.getItem(currentSprintKeys.projectsKey);
  } catch (_) {
    return null;
  }
}

export function syncProjectsSelect(value) {
  const { projectsSelect } = currentSprintDom;
  if (!projectsSelect) return false;
  const normalizeForCurrentSprint = (input) => {
    const raw = (input || '').trim();
    if (!raw) return '';
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
    return parts[0] || '';
  };
  const target = normalizeForCurrentSprint(value);
  if (!target) return false;
  const options = Array.from(projectsSelect.options || []);
  const match = options.find(opt => opt.value === target);
  if (match) {
    projectsSelect.value = target;
    return true;
  }
  const opt = document.createElement('option');
  opt.value = target;
  opt.textContent = 'Current: ' + target.replace(/,/g, ', ');
  projectsSelect.appendChild(opt);
  projectsSelect.value = target;
  return true;
}

export function persistProjectsSelection(value) {
  try {
    const cleaned = (value || '').trim();
    if (!cleaned) return;
    localStorage.setItem(currentSprintKeys.projectsKey, cleaned);
  } catch (_) {}
}

export function getPreferredBoardId() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('boardId');
    if (fromUrl) return fromUrl.trim();
    return localStorage.getItem(currentSprintKeys.boardKey);
  } catch (_) {
    return null;
  }
}

export function getPreferredSprintId() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('sprintId');
    if (fromUrl) return fromUrl.trim();
    return localStorage.getItem(currentSprintKeys.sprintKey);
  } catch (_) {
    return null;
  }
}

export function persistSelection(boardId, sprintId) {
  try {
    if (boardId) localStorage.setItem(currentSprintKeys.boardKey, boardId);
    if (sprintId) localStorage.setItem(currentSprintKeys.sprintKey, sprintId);
    else localStorage.removeItem(currentSprintKeys.sprintKey);
  } catch (_) {}
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('boardId', boardId);
    if (sprintId) url.searchParams.set('sprintId', sprintId);
    else url.searchParams.delete('sprintId');
    window.history.replaceState({}, '', url.toString());
  } catch (_) {}
}
