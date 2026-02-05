import { currentSprintDom } from './Reporting-App-CurrentSprint-Page-Context.js';
import { getProjectsParam } from './Reporting-App-CurrentSprint-Page-Storage.js';

export function showLoading(msg) {
  const { loadingEl, errorEl } = currentSprintDom;
  if (!loadingEl) return;
  loadingEl.textContent = msg || ('Loading boards for projects ' + getProjectsParam().replace(/,/g, ', ') + '...');
  loadingEl.style.display = 'block';
  if (errorEl) errorEl.style.display = 'none';
}

import { setErrorOnEl, clearEl } from './Reporting-App-Shared-Status-Helpers.js';

export function showError(msg) {
  const { loadingEl, errorEl } = currentSprintDom;
  if (loadingEl) loadingEl.style.display = 'none';
  if (errorEl) {
    setErrorOnEl(errorEl, msg);
  }
}

export function clearError() {
  const { errorEl } = currentSprintDom;
  clearEl(errorEl);
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
