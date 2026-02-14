import { currentSprintDom } from './Reporting-App-CurrentSprint-Page-Context.js';
import { getProjectsParam } from './Reporting-App-CurrentSprint-Page-Storage.js';
import { showErrorView, clearErrorView, showContentView } from './Reporting-App-Shared-Status-View-Helpers.js';
import { startRotatingMessages, stopRotatingMessages } from './Reporting-App-Shared-Loading-Theater.js';

const LOADING_SPINNER_HTML = '<div class="current-sprint-loading-spinner" aria-hidden="true"></div><p class="current-sprint-loading-msg" aria-live="polite"></p>';
const CURRENT_SPRINT_LOADING_MESSAGES = ['Loading board…', 'Loading sprint…', 'Building view…'];

export function showLoading(msg) {
  stopRotatingMessages();
  const { loadingEl, errorEl, contentEl } = currentSprintDom;
  const text = msg || ('Loading sprint data for project ' + getProjectsParam() + '...');
  if (loadingEl) {
    loadingEl.innerHTML = LOADING_SPINNER_HTML;
    const msgEl = loadingEl.querySelector('.current-sprint-loading-msg');
    if (msgEl) {
      msgEl.textContent = text;
      startRotatingMessages(msgEl, CURRENT_SPRINT_LOADING_MESSAGES, 1200);
    }
    loadingEl.classList.add('current-sprint-loading-with-spinner');
    loadingEl.style.display = 'block';
  }
  if (errorEl) errorEl.style.display = 'none';
  if (contentEl) contentEl.style.display = 'none';
}

export function showError(msg) {
  stopRotatingMessages();
  showErrorView(currentSprintDom, msg);
}

export function clearError() {
  clearErrorView(currentSprintDom);
}

export function showContent(html) {
  stopRotatingMessages();
  showContentView(currentSprintDom, html);
}
