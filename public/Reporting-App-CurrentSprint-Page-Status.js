import { currentSprintDom } from './Reporting-App-CurrentSprint-Page-Context.js';
import { getProjectsParam } from './Reporting-App-CurrentSprint-Page-Storage.js';

export function showLoading(msg) {
  const { loadingEl, errorEl } = currentSprintDom;
  if (!loadingEl) return;
  loadingEl.textContent = msg || ('Loading boards for projects ' + getProjectsParam().replace(/,/g, ', ') + '...');
  loadingEl.style.display = 'block';
  if (errorEl) errorEl.style.display = 'none';
}

export function showError(msg) {
  const { loadingEl, errorEl } = currentSprintDom;
  if (loadingEl) loadingEl.style.display = 'none';
  if (errorEl) {
    errorEl.textContent = msg || 'An error occurred.';
    errorEl.style.display = 'block';
  }
}

export function showContent(html) {
  const { loadingEl, errorEl, contentEl } = currentSprintDom;
  if (loadingEl) loadingEl.style.display = 'none';
  if (errorEl) errorEl.style.display = 'none';
  if (contentEl) {
    contentEl.innerHTML = html;
    contentEl.style.display = 'block';
  }
}
