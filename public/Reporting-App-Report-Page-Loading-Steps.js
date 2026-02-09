import { reportDom } from './Reporting-App-Report-Page-Context.js';
import { LOADING_STEP_LIMIT } from './Reporting-App-Report-Config-Constants.js';

const LOADING_CHIP_MIN_VISIBLE_MS = 300;
let loadingChipShowTimerId = null;

function clearLoadingChipShowTimer() {
  if (loadingChipShowTimerId != null) {
    clearTimeout(loadingChipShowTimerId);
    loadingChipShowTimerId = null;
  }
}

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
  const chip = document.getElementById('loading-status-chip');
  if (visible) {
    loadingEl.style.display = 'block';
    loadingEl.setAttribute('aria-hidden', 'false');
    clearLoadingChipShowTimer();
    loadingChipShowTimerId = setTimeout(() => {
      loadingChipShowTimerId = null;
      if (chip) {
        chip.style.display = 'block';
        const msgEl = document.getElementById('loading-message');
        if (msgEl) chip.textContent = msgEl.textContent || '';
      }
    }, LOADING_CHIP_MIN_VISIBLE_MS);
  } else {
    clearLoadingChipShowTimer();
    loadingEl.style.display = 'none';
    loadingEl.setAttribute('aria-hidden', 'true');
    if (chip) {
      chip.style.display = 'none';
      chip.textContent = '';
    }
  }
}

export function hideLoadingIfVisible() {
  clearLoadingChipShowTimer();
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
  clearLoadingChipShowTimer();
  const { loadingEl } = reportDom;
  try {
    if (loadingEl) {
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
