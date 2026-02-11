import { currentSprintDom } from './Reporting-App-CurrentSprint-Page-Context.js';
import { getProjectsParam } from './Reporting-App-CurrentSprint-Page-Storage.js';
import { showErrorView, clearErrorView, showContentView } from './Reporting-App-Shared-Status-View-Helpers.js';

const LOADING_SPINNER_HTML = '<div class="current-sprint-loading-spinner" aria-hidden="true"></div><p class="current-sprint-loading-msg" aria-live="polite"></p>';

export function showLoading(msg) {
  const { loadingEl, errorEl, contentEl } = currentSprintDom;
  const text = msg || ('Loading sprint data for project ' + getProjectsParam() + '...');
  if (loadingEl) {
    loadingEl.innerHTML = LOADING_SPINNER_HTML;
    const msgEl = loadingEl.querySelector('.current-sprint-loading-msg');
    if (msgEl) msgEl.textContent = text;
    loadingEl.classList.add('current-sprint-loading-with-spinner');
    loadingEl.style.display = 'block';
  }
  if (errorEl) errorEl.style.display = 'none';
  if (contentEl) contentEl.style.display = 'none';
}

export function showError(msg) {
  showErrorView(currentSprintDom, msg);
}

export function clearError() {
  clearErrorView(currentSprintDom);
}

export function showContent(html) {
  showContentView(currentSprintDom, html);
}
