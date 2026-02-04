import { currentSprintDom } from './Reporting-App-CurrentSprint-Page-Context.js';
import { renderNotificationDock } from './Reporting-App-Shared-Notifications-Dock-Manager.js';
import { updateNotificationStore } from './Reporting-App-CurrentSprint-Notifications-Helpers.js';
import { showLoading, showError, showContent } from './Reporting-App-CurrentSprint-Page-Status.js';
import { loadBoards, loadCurrentSprint } from './Reporting-App-CurrentSprint-Page-Data-Loaders.js';
import { renderCurrentSprintPage } from './Reporting-App-CurrentSprint-Render-Page.js';
import { wireDynamicHandlers } from './Reporting-App-CurrentSprint-Page-Handlers.js';
// New redesign component handlers
import { wireHeaderBarHandlers } from './Reporting-App-CurrentSprint-Header-Bar.js';
import { wireHealthDashboardHandlers } from './Reporting-App-CurrentSprint-Health-Dashboard.js';
import { wireAlertBannerHandlers } from './Reporting-App-CurrentSprint-Alert-Banner.js';
import { wireRisksAndInsightsHandlers } from './Reporting-App-CurrentSprint-Risks-Insights.js';
import { wireCapacityAllocationHandlers } from './Reporting-App-CurrentSprint-Capacity-Allocation.js';
import { wireSprintCarouselHandlers } from './Reporting-App-CurrentSprint-Navigation-Carousel.js';
import { wireScopeIndicatorHandlers } from './Reporting-App-CurrentSprint-Scope-Indicator.js';
import { wireCountdownTimerHandlers } from './Reporting-App-CurrentSprint-Countdown-Timer.js';
import { wireExportHandlers } from './Reporting-App-CurrentSprint-Export-Dashboard.js';
import {
  getProjectsParam,
  getStoredProjects,
  syncProjectsSelect,
  persistProjectsSelection,
  getPreferredBoardId,
  getPreferredSprintId,
  persistSelection,
} from './Reporting-App-CurrentSprint-Page-Storage.js';

let currentBoardId = null;
let currentSprintId = null;
let currentData = null; // Store current data for handlers

function addLoginLink() {
  const { errorEl } = currentSprintDom;
  if (!errorEl || errorEl.querySelector('a.nav-link')) return;
  const link = document.createElement('a');
  link.href = '/';
  link.className = 'nav-link';
  link.textContent = 'Log in again';
  link.style.marginLeft = '8px';
  errorEl.appendChild(document.createTextNode(' '));
  errorEl.appendChild(link);
}

/**
 * Wire all new redesign component handlers
 */
function wireRedesignHandlers(data) {
  currentData = data;
  
  // Wire all new components
  wireHeaderBarHandlers();
  wireHealthDashboardHandlers();
  wireAlertBannerHandlers();
  wireRisksAndInsightsHandlers();
  wireCapacityAllocationHandlers();
  wireCountdownTimerHandlers();
  wireScopeIndicatorHandlers();
  
  // Wire carousel with sprint selection callback
  wireSprintCarouselHandlers((sprintId) => {
    currentSprintId = sprintId;
    persistSelection(currentBoardId, sprintId);
    showLoading('Loading sprint...');
    loadCurrentSprint(currentBoardId, sprintId)
      .then((data) => {
        showRenderedContent(data);
      })
      .catch((err) => {
        showError(err.message || 'Failed to load sprint.');
      });
  });
  
  // Wire export handlers
  wireExportHandlers(data);
}

function showRenderedContent(data) {
  showContent(renderCurrentSprintPage(data));
  const summary = updateNotificationStore(data);
  renderNotificationDock({ summary });
  wireDynamicHandlers(data);
  
  // NEW: Wire all redesign component handlers
  wireRedesignHandlers(data);
}

function onBoardChange() {
  const { boardSelect } = currentSprintDom;
  const boardId = boardSelect?.value || '';
  if (!boardId) {
    showLoading('Select a board to load current sprint data.');
    return;
  }
  currentBoardId = boardId;
  currentSprintId = null;
  persistSelection(boardId, null);
  showLoading('Loading current sprint...');
  loadCurrentSprint(boardId)
    .then((data) => {
      showRenderedContent(data);
    })
    .catch((err) => {
      const msg = err.message || 'Failed to load current sprint.';
      showError(msg);
      if ((msg || '').includes('Session expired')) {
        addLoginLink();
      }
    });
}

function refreshBoards(preferredId, preferredSprintId) {
  const { boardSelect } = currentSprintDom;
  showLoading('Loading boards for projects ' + getProjectsParam().replace(/,/g, ', ') + '...');
  return loadBoards()
    .then((res) => {
      const boards = res.boards || [];
      if (!boardSelect) return null;
      boardSelect.innerHTML = '';
      boardSelect.appendChild(document.createElement('option'));
      const opt0 = boardSelect.querySelector('option');
      opt0.value = '';
      opt0.textContent = '- Select board -';
      boards.forEach((b) => {
        const opt = document.createElement('option');
        opt.value = String(b.id);
        opt.textContent = (b.name || 'Board ' + b.id) + (b.projectKey ? ' (' + b.projectKey + ')' : '');
        boardSelect.appendChild(opt);
      });
      if (boards.length > 0) {
        const boardIds = boards.map(b => String(b.id));
        const idToSelect = preferredId && boardIds.indexOf(preferredId) !== -1 ? preferredId : boardIds[0];
        boardSelect.value = idToSelect;
        currentBoardId = idToSelect;
        showLoading('Loading current sprint...');
        return loadCurrentSprint(idToSelect, preferredSprintId)
          .then((data) => {
            currentSprintId = data?.sprint?.id || null;
            persistSelection(currentBoardId, currentSprintId);
            showRenderedContent(data);
          });
      }
      showError('No boards found for the selected projects. Check Jira access or try different projects.');
      return null;
    })
    .catch((err) => {
      const msg = err.message || 'Failed to load boards.';
      showError(msg);
      if ((msg || '').includes('Session expired')) {
        addLoginLink();
      }
      return null;
    });
}

function onProjectsChange() {
  persistProjectsSelection(getProjectsParam());
  currentBoardId = null;
  currentSprintId = null;
  return refreshBoards(getPreferredBoardId(), getPreferredSprintId());
}

function onSprintTabClick(event) {
  const target = event.target.closest('[data-sprint-id]');
  if (!target || !currentBoardId) return;
  const sprintId = target.getAttribute('data-sprint-id');
  if (!sprintId) return;
  currentSprintId = sprintId;
  persistSelection(currentBoardId, sprintId);
  showLoading('Loading sprint...');
  loadCurrentSprint(currentBoardId, sprintId)
    .then((data) => {
      showRenderedContent(data);
    })
    .catch((err) => {
      showError(err.message || 'Failed to load sprint.');
    });
}

function init() {
  const { boardSelect, contentEl, projectsSelect } = currentSprintDom;
  const preferredId = getPreferredBoardId();
  const preferredSprintId = getPreferredSprintId();
  syncProjectsSelect(getStoredProjects());
  refreshBoards(preferredId, preferredSprintId)
    .catch((err) => {
      showError(err.message || 'Failed to load current sprint.');
    });

  if (boardSelect) boardSelect.addEventListener('change', onBoardChange);
  if (contentEl) contentEl.addEventListener('click', onSprintTabClick);
  if (projectsSelect) {
    projectsSelect.addEventListener('change', onProjectsChange);
  }
  window.addEventListener('storage', (event) => {
    if (event.key === 'vodaAgileBoard_selectedProjects') {
      syncProjectsSelect(event.newValue || '');
      onProjectsChange();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
