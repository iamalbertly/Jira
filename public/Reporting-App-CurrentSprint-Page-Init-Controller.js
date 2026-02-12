import { currentSprintDom, currentSprintKeys } from './Reporting-App-CurrentSprint-Page-Context.js';
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
import { wireCountdownTimerHandlers } from './Reporting-App-CurrentSprint-Countdown-Timer.js';
import { wireSubtasksShowMoreHandlers } from './Reporting-App-CurrentSprint-Render-Subtasks.js';
import { wireProgressShowMoreHandlers } from './Reporting-App-CurrentSprint-Render-Progress.js';
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

function addLoginLink() {
  const { errorEl } = currentSprintDom;
  if (!errorEl || errorEl.querySelector('a.nav-link')) return;
  const link = document.createElement('a');
  link.href = '/?redirect=/current-sprint';
  link.className = 'nav-link';
  link.textContent = 'Sign in';
  link.style.marginLeft = '8px';
  errorEl.appendChild(document.createTextNode(' '));
  errorEl.appendChild(link);
}

/**
 * Wire all new redesign component handlers
 */
function wireRedesignHandlers(data) {
  // Wire all new components
  wireHeaderBarHandlers();
  wireHealthDashboardHandlers();
  wireAlertBannerHandlers();
  wireRisksAndInsightsHandlers();
  wireCapacityAllocationHandlers();
  wireCountdownTimerHandlers();
  // Wire show-more handlers for large tables to reduce initial DOM node count
  wireSubtasksShowMoreHandlers();
  wireProgressShowMoreHandlers();
  
  // Wire carousel with sprint selection callback
  wireSprintCarouselHandlers((sprintId) => {
    initHandlers.selectSprintById(sprintId);
  });
  
  // Wire export handlers
  wireExportHandlers(data);
  collapseMobileDetailsSections();

}

function collapseMobileDetailsSections() {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    if (!window.matchMedia('(max-width: 768px)').matches) return;
    document.querySelectorAll('details[data-mobile-collapse="true"]').forEach((el) => {
      el.open = false;
    });
  } catch (_) {}
}

function showRenderedContent(data) {
  showContent(renderCurrentSprintPage(data));
  const summary = updateNotificationStore(data);
  renderNotificationDock({ summary, pageContext: 'current-sprint' });
  wireDynamicHandlers(data);
  wireRedesignHandlers(data);
}

let currentBoardId = null;
let currentSprintId = null;
let lastBoardsRefreshRequestId = 0;

function setBoardSelectCouldntLoad() {
  const { boardSelect } = currentSprintDom;
  if (!boardSelect) return;
  boardSelect.innerHTML = '';
  const opt = document.createElement('option');
  opt.value = '';
  opt.textContent = "Couldn't load boards";
  boardSelect.appendChild(opt);
}

function refreshBoards(preferredId, preferredSprintId) {
  const requestId = ++lastBoardsRefreshRequestId;
  const { boardSelect } = currentSprintDom;
  showLoading('Loading boards for project ' + getProjectsParam() + '...');
  return loadBoards()
    .then((res) => {
      if (requestId !== lastBoardsRefreshRequestId) return null;
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
      if (!boards.length) {
        setBoardSelectCouldntLoad();
        showError('No boards found for the selected projects. Check project selection or try Report to refresh project list.');
        return null;
      }
      const boardIds = boards.map((b) => String(b.id));
      const boardId = preferredId && boardIds.includes(preferredId) ? preferredId : boardIds[0];
      boardSelect.value = boardId;
      currentBoardId = boardId;
      showLoading('Loading current sprint...');
      const sprintRequestId = ++lastBoardsRefreshRequestId;
      return loadCurrentSprint(boardId, preferredSprintId).then((data) => {
        if (sprintRequestId !== lastBoardsRefreshRequestId) return null;
        currentSprintId = data?.sprint?.id || null;
        persistSelection(currentBoardId, currentSprintId);
        showRenderedContent(data);
        return null;
      });
    })
    .catch((err) => {
      const msg = err.message || 'Failed to load boards.';
      setBoardSelectCouldntLoad();
      showError(msg || "Couldn't load boards.");
      if ((msg || '').includes('Session expired')) addLoginLink();
      return null;
    });
}

function onBoardChange() {
  const { boardSelect } = currentSprintDom;
  const boardId = boardSelect?.value || '';
  if (!boardId) {
    showLoading('Choose projects above; boards load for those projects. Then pick a board.');
    return;
  }
  currentBoardId = boardId;
  currentSprintId = null;
  persistSelection(boardId, null);
  showLoading('Loading current sprint...');
  loadCurrentSprint(boardId)
    .then((data) => {
      currentSprintId = data?.sprint?.id || null;
      persistSelection(currentBoardId, currentSprintId);
      showRenderedContent(data);
    })
    .catch((err) => {
      const msg = err.message || 'Failed to load current sprint.';
      showError(msg);
      if ((msg || '').includes('Session expired')) addLoginLink();
    });
}

function updateProjectHint() {
  // Projects are already synchronized from shared storage.
}

function onProjectsChange() {
  persistProjectsSelection(getProjectsParam());
  updateProjectHint();
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

function handleRefreshSprint() {
  if (!currentBoardId) return;
  const refreshBtn = document.querySelector('.header-refresh-btn');
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing...';
  }
  showLoading('Refreshing sprint...');
  loadCurrentSprint(currentBoardId, currentSprintId)
    .then((data) => {
      currentSprintId = data?.sprint?.id || null;
      persistSelection(currentBoardId, currentSprintId);
      showRenderedContent(data);
    })
    .catch((err) => {
      showError(err.message || 'Failed to refresh sprint.');
    })
    .finally(() => {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'Refresh';
      }
    });
}

function selectSprintById(sprintId) {
  if (!currentBoardId || !sprintId) return;
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

const initHandlers = {
  refreshBoards,
  onBoardChange,
  updateProjectHint,
  onProjectsChange,
  onSprintTabClick,
  handleRefreshSprint,
  selectSprintById,
};

function init() {
  const { boardSelect, contentEl, projectsSelect } = currentSprintDom;
  const preferredId = getPreferredBoardId();
  const preferredSprintId = getPreferredSprintId();
  syncProjectsSelect(getStoredProjects());
  initHandlers.refreshBoards(preferredId, preferredSprintId)
    .catch((err) => {
      showError(err.message || 'Failed to load current sprint.');
    });

  initHandlers.updateProjectHint();
  if (boardSelect) boardSelect.addEventListener('change', initHandlers.onBoardChange);
  if (contentEl) contentEl.addEventListener('click', initHandlers.onSprintTabClick);
  document.addEventListener('refreshSprint', initHandlers.handleRefreshSprint);
  if (projectsSelect) {
    projectsSelect.addEventListener('change', initHandlers.onProjectsChange);
  }
  const { projectsKey } = currentSprintKeys;
  window.addEventListener('storage', (event) => {
    if (event.key === projectsKey) {
      syncProjectsSelect(event.newValue || '');
      initHandlers.onProjectsChange();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
