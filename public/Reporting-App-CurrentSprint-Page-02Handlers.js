/**
 * Init-level event handlers and refreshBoards / load current sprint logic for Current Sprint page.
 * Used by Init-Controller only; receives API from Init-Controller to avoid duplicate state.
 */
import { loadBoards, loadCurrentSprint } from './Reporting-App-CurrentSprint-Page-Data-Loaders.js';
import {
  getProjectsParam,
  getStoredProjects,
  syncProjectsSelect,
  persistProjectsSelection,
  getPreferredBoardId,
  getPreferredSprintId,
  persistSelection,
} from './Reporting-App-CurrentSprint-Page-Storage.js';

let __lastBoardsRefreshRequestId = 0;

function normalizeProjects(value) {
  if (!value || typeof value !== 'string') return '';
  return value.split(',').map(p => (p || '').trim()).filter(Boolean).sort().join(',');
}

/**
 * @param {{
 *   showRenderedContent: (data: object) => void,
 *   showLoading: (msg: string) => void,
 *   showError: (msg: string) => void,
 *   clearError: () => void,
 *   addLoginLink: () => void,
 *   currentSprintDom: { boardSelect?: HTMLSelectElement, errorEl?: HTMLElement }
 * }} api
 * @returns {{ refreshBoards: (a?: string, b?: string) => Promise<null>, onBoardChange: () => void, onProjectsChange: () => Promise<null>, onSprintTabClick: (e: Event) => void, updateProjectHint: () => void, handleRefreshSprint: () => void }}
 */
export function createInitHandlers(api) {
  const { showRenderedContent, showLoading, showError, clearError, addLoginLink, currentSprintDom } = api;
  let currentBoardId = null;
  let currentSprintId = null;

  function setBoardId(id) {
    currentBoardId = id;
  }
  function setSprintId(id) {
    currentSprintId = id;
  }

  function refreshBoards(preferredId, preferredSprintId) {
    const requestId = ++__lastBoardsRefreshRequestId;
    const { boardSelect } = currentSprintDom;
    showLoading('Loading boards for projects ' + getProjectsParam().replace(/,/g, ', ') + '...');
    function setBoardSelectCouldntLoad() {
      if (!boardSelect) return;
      boardSelect.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = "Couldn't load boards";
      boardSelect.appendChild(opt);
    }
    function appendRetryToError() {
      try {
        const { errorEl } = currentSprintDom;
        if (errorEl && !errorEl.querySelector('.retry-btn')) {
          const retry = document.createElement('button');
          retry.type = 'button';
          retry.className = 'btn btn-primary btn-sm retry-btn';
          retry.textContent = 'Retry';
          retry.style.marginLeft = '8px';
          retry.addEventListener('click', () => {
            try { if (typeof window !== 'undefined') window.__retryClicked = (window.__retryClicked || 0) + 1; } catch (_) {}
            retry.disabled = true;
            retry.textContent = 'Retrying...';
            clearError();
            refreshBoards(preferredId, preferredSprintId).finally(() => {
              try { retry.disabled = false; retry.textContent = 'Retry'; } catch (_) {}
            });
          });
          errorEl.appendChild(retry);
        }
      } catch (_) {}
    }
    return loadBoards()
      .then((res) => {
        if (requestId !== __lastBoardsRefreshRequestId) return null;
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
          setBoardId(idToSelect);
          showLoading('Loading current sprint...');
          const myRequestId = ++__lastBoardsRefreshRequestId;
          return loadCurrentSprint(idToSelect, preferredSprintId)
            .then((data) => {
              if (myRequestId !== __lastBoardsRefreshRequestId) return null;
              setSprintId(data?.sprint?.id || null);
              persistSelection(currentBoardId, currentSprintId);
              showRenderedContent(data);
            });
        }
        setBoardSelectCouldntLoad();
        showError('No boards found for the selected projects.');
        appendRetryToError();
        return null;
      })
      .catch((err) => {
        const msg = err.message || 'Failed to load boards.';
        setBoardSelectCouldntLoad();
        showError(msg || "Couldn't load boards.");
        if ((msg || '').includes('Session expired')) {
          addLoginLink();
        }
        appendRetryToError();
        return null;
      });
  }

  function onBoardChange() {
    const { boardSelect } = currentSprintDom;
    const boardId = boardSelect?.value || '';
    if (!boardId) {
      showLoading('Select a board to load current sprint data.');
      return;
    }
    setBoardId(boardId);
    setSprintId(null);
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

  function updateProjectHint() {
    const hintEl = document.getElementById('current-sprint-project-hint');
    if (!hintEl) return;
    const current = normalizeProjects(getProjectsParam());
    const stored = normalizeProjects(getStoredProjects() || '');
    if (!stored) {
      hintEl.innerHTML = '';
      return;
    }
    if (current === stored) {
      hintEl.innerHTML = '<span class="same-as-report-label">Same as Report</span>';
      return;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary btn-compact';
    btn.textContent = 'Use Report selection';
    btn.addEventListener('click', () => {
      syncProjectsSelect(stored);
      persistProjectsSelection(stored);
      updateProjectHint();
      setBoardId(null);
      setSprintId(null);
      refreshBoards(getPreferredBoardId(), getPreferredSprintId());
    });
    hintEl.innerHTML = '';
    hintEl.appendChild(btn);
  }

  function onProjectsChange() {
    persistProjectsSelection(getProjectsParam());
    updateProjectHint();
    setBoardId(null);
    setSprintId(null);
    return refreshBoards(getPreferredBoardId(), getPreferredSprintId());
  }

  function onSprintTabClick(event) {
    const target = event.target.closest('[data-sprint-id]');
    if (!target || !currentBoardId) return;
    const sprintId = target.getAttribute('data-sprint-id');
    if (!sprintId) return;
    setSprintId(sprintId);
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
      refreshBtn.textContent = 'Refreshing…';
    }
    showLoading('Refreshing sprint...');
    loadCurrentSprint(currentBoardId, currentSprintId)
      .then((data) => {
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
    setSprintId(sprintId);
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

  return { refreshBoards, onBoardChange, onProjectsChange, onSprintTabClick, updateProjectHint, handleRefreshSprint, selectSprintById };
}
