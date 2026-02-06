import { reportState } from './Reporting-App-Report-Page-State.js';
import { reportDom } from './Reporting-App-Report-Page-Context.js';
import { buildBoardSummaries } from './Reporting-App-Shared-Boards-Summary-Builder.js';
import { renderEmptyState } from './Reporting-App-Report-Page-Render-Helpers.js';
import { renderProjectEpicLevelTab } from './Reporting-App-Report-Page-Render-Boards.js';
import { renderSprintsTab } from './Reporting-App-Report-Page-Render-Sprints.js';
import { renderDoneStoriesTab } from './Reporting-App-Report-Page-Render-DoneStories.js';
import { updateExportFilteredState } from './Reporting-App-Report-Page-Export-Menu.js';

const REPORT_SEARCH_STORAGE_KEY = 'vodaAgileBoard_reportSearch_v1';

function persistSearchState() {
  try {
    const payload = {
      boards: document.getElementById('boards-search-box')?.value || '',
      sprints: document.getElementById('sprints-search-box')?.value || '',
      stories: document.getElementById('search-box')?.value || '',
    };
    localStorage.setItem(REPORT_SEARCH_STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {}
}

function hydrateSearchState() {
  try {
    const raw = localStorage.getItem(REPORT_SEARCH_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    const boardsSearch = document.getElementById('boards-search-box');
    const sprintsSearch = document.getElementById('sprints-search-box');
    const storiesSearch = document.getElementById('search-box');
    if (boardsSearch && typeof saved?.boards === 'string') boardsSearch.value = saved.boards;
    if (sprintsSearch && typeof saved?.sprints === 'string') sprintsSearch.value = saved.sprints;
    if (storiesSearch && typeof saved?.stories === 'string') storiesSearch.value = saved.stories;
  } catch (_) {}
}

function applyTabFilter(allItems, searchText, activePills, config) {
  const lower = (searchText || '').toLowerCase();
  let filtered = allItems;
  if (activePills.length > 0) {
    filtered = filtered.filter((item) => activePills.includes(config.projectKey(item)));
  }
  if (lower) {
    filtered = filtered.filter((item) => config.searchText(item).toLowerCase().includes(lower));
  }
  return filtered;
}

export function applyBoardsFilters() {
  const searchText = document.getElementById('boards-search-box')?.value || '';
  const activePills = Array.from(document.querySelectorAll('#boards-project-pills .pill.active')).map(p => p.dataset.project);
  reportState.visibleBoardRows = applyTabFilter(reportState.previewData?.boards || [], searchText, activePills, {
    projectKey: (board) => (board.projectKeys || []).join(','),
    searchText: (board) => `${board.name || ''} ${(board.projectKeys || []).join(',')}`,
  });
  renderProjectEpicLevelTab(reportState.visibleBoardRows, reportState.previewData?.metrics);
  updateExportFilteredState();
}

export function applySprintsFilters() {
  const searchText = document.getElementById('sprints-search-box')?.value || '';
  const activePills = Array.from(document.querySelectorAll('#sprints-project-pills .pill.active')).map(p => p.dataset.project);
  reportState.visibleSprintRows = applyTabFilter(reportState.previewData?.sprintsIncluded || [], searchText, activePills, {
    projectKey: (sprint) => (sprint.projectKey || ''),
    searchText: (sprint) => `${sprint.name || ''} ${sprint.projectKey || ''}`,
  });
  renderSprintsTab(reportState.visibleSprintRows, reportState.previewData?.metrics);
  updateExportFilteredState();
}

export function applyFilters() {
  const searchText = (document.getElementById('search-box')?.value || '').toLowerCase();
  const activePills = Array.from(document.querySelectorAll('#project-pills .pill.active')).map(p => p.dataset.project);
  reportState.visibleRows = applyTabFilter(reportState.previewRows || [], searchText, activePills, {
    projectKey: (row) => row.projectKey || '',
    searchText: (row) => `${row.issueKey || ''} ${row.issueSummary || ''} ${row.issueStatus || ''}`,
  });
  renderDoneStoriesTab(reportState.visibleRows);
  updateExportFilteredState();
}

export function populateBoardsPills() {
  const container = document.getElementById('boards-project-pills');
  if (!container) return;
  const projects = new Set();
  (reportState.previewData?.boards || []).forEach(board => {
    (board.projectKeys || []).forEach(key => projects.add(key));
  });
  container.innerHTML = '';
  Array.from(projects).sort().forEach(project => {
    const pill = document.createElement('button');
    pill.className = 'pill';
    pill.dataset.project = project;
    pill.textContent = project;
    pill.addEventListener('click', () => {
      pill.classList.toggle('active');
      applyBoardsFilters();
    });
    container.appendChild(pill);
  });
}

export function populateSprintsPills() {
  const container = document.getElementById('sprints-project-pills');
  if (!container) return;
  const projects = new Set();
  (reportState.previewData?.sprintsIncluded || []).forEach(sprint => {
    if (sprint.projectKey) projects.add(sprint.projectKey);
  });
  container.innerHTML = '';
  Array.from(projects).sort().forEach(project => {
    const pill = document.createElement('button');
    pill.className = 'pill';
    pill.dataset.project = project;
    pill.textContent = project;
    pill.addEventListener('click', () => {
      pill.classList.toggle('active');
      applySprintsFilters();
    });
    container.appendChild(pill);
  });
}

export function populateProjectsPills() {
  const container = document.getElementById('project-pills');
  if (!container) return;
  const projects = new Set();
  (reportState.previewRows || []).forEach(row => {
    if (row.projectKey) projects.add(row.projectKey);
  });
  container.innerHTML = '';
  Array.from(projects).sort().forEach(project => {
    const pill = document.createElement('button');
    pill.className = 'pill';
    pill.dataset.project = project;
    pill.textContent = project;
    pill.addEventListener('click', () => {
      pill.classList.toggle('active');
      applyFilters();
    });
    container.appendChild(pill);
  });
}

export function initFilters() {
  hydrateSearchState();
  const searchBox = document.getElementById('search-box');
  if (searchBox) searchBox.addEventListener('input', () => {
    applyFilters();
    persistSearchState();
  });
  const boardsSearchBox = document.getElementById('boards-search-box');
  if (boardsSearchBox) boardsSearchBox.addEventListener('input', () => {
    applyBoardsFilters();
    persistSearchState();
  });
  const sprintsSearchBox = document.getElementById('sprints-search-box');
  if (sprintsSearchBox) sprintsSearchBox.addEventListener('input', () => {
    applySprintsFilters();
    persistSearchState();
  });

  if (searchBox?.value) applyFilters();
  if (boardsSearchBox?.value) applyBoardsFilters();
  if (sprintsSearchBox?.value) applySprintsFilters();
}
