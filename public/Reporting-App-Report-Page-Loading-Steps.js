import { reportDom } from './Reporting-App-Report-Page-Context.js';
import { LOADING_STEP_LIMIT } from './Reporting-App-Report-Config-Constants.js';

export function updateLoadingMessage(message, step = null) {
  const loadingMessage = document.getElementById('loading-message');
  if (loadingMessage) {
    loadingMessage.textContent = message;
  }
  const chip = document.getElementById('loading-status-chip');
  if (chip && chip.style.display !== 'none') {
    chip.textContent = message;
  }
  if (step) {
    appendLoadingStep(step);
  }
}

export function clearLoadingSteps() {
  const loadingSteps = document.getElementById('loading-steps');
  if (loadingSteps) {
    loadingSteps.innerHTML = '';
  }
}

export function appendLoadingStep(step) {
  const loadingSteps = document.getElementById('loading-steps');
  if (!loadingSteps) return;

  const stepEl = document.createElement('div');
  stepEl.className = 'loading-step';
  stepEl.textContent = step;
  loadingSteps.appendChild(stepEl);

  const items = loadingSteps.querySelectorAll('.loading-step');
  if (items.length > LOADING_STEP_LIMIT) {
    for (let i = 0; i < items.length - LOADING_STEP_LIMIT; i++) {
      loadingSteps.removeChild(items[i]);
    }
  }
}

export function scheduleRender(work) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => work(), { timeout: 1000 });
  } else {
    setTimeout(work, 0);
  }
}

export async function readResponseJson(response) {
  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return { data: await response.json(), text: null };
    } catch (_) {
      const text = await response.text().catch(() => '');
      return { data: null, text };
    }
  }

  const text = await response.text().catch(() => '');
  return { data: null, text };
}

export function setLoadingVisible(visible = true) {
  const { loadingEl } = reportDom;
  if (!loadingEl) return;
  loadingEl.style.display = visible ? 'block' : 'none';
  loadingEl.setAttribute('aria-hidden', visible ? 'false' : 'true');
  const chip = document.getElementById('loading-status-chip');
  if (chip) {
    chip.style.display = visible ? 'block' : 'none';
    if (!visible) {
      chip.textContent = '';
    }
  }
}

export function hideLoadingIfVisible() {
  const { loadingEl } = reportDom;
  if (loadingEl) {
    loadingEl.style.display = 'none';
    loadingEl.setAttribute('aria-hidden', 'true');
  }
  const chip = document.getElementById('loading-status-chip');
  if (chip) {
    chip.style.display = 'none';
    chip.textContent = '';
  }
}

export function forceHideLoading() {
  const { loadingEl } = reportDom;
  try {
    if (loadingEl) {
      // Remove inline styles and ensure hidden; also clear any animation state
      loadingEl.style.display = 'none';
      loadingEl.setAttribute('aria-hidden', 'true');
      const steps = loadingEl.querySelectorAll('.loading-step');
      if (steps && steps.length) {
        loadingEl.querySelector('.loading-steps').innerHTML = '';
      }
    }
  } catch (e) {
    // best-effort, ignore
  }
  try {
    const chip = document.getElementById('loading-status-chip');
    if (chip) {
      chip.style.display = 'none';
      chip.textContent = '';
    }
  } catch (_) {}
}
