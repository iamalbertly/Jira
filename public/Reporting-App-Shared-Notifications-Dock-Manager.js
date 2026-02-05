const DEFAULT_NOTIFICATION_STORE_KEY = 'appNotificationsV1';
const DEFAULT_NOTIFICATION_DOCK_STATE_KEY = 'appNotificationsDockStateV1';
const DEFAULT_TOGGLE_ID = 'app-notification-toggle';
const DEFAULT_DOCK_ID = 'app-notification-dock';

export function readNotificationSummary(storageKey = DEFAULT_NOTIFICATION_STORE_KEY) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch (_) {
    return null;
  }
}

export function writeNotificationSummary(summary, storageKey = DEFAULT_NOTIFICATION_STORE_KEY) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(summary));
  } catch (_) {}
}

export function readNotificationDockState(stateKey = DEFAULT_NOTIFICATION_DOCK_STATE_KEY) {
  try {
    const raw = localStorage.getItem(stateKey);
    if (!raw) return { collapsed: false, hidden: false };
    const parsed = JSON.parse(raw);
    return {
      collapsed: !!parsed.collapsed,
      hidden: !!parsed.hidden,
    };
  } catch (_) {
    return { collapsed: false, hidden: false };
  }
}

export function writeNotificationDockState(next, stateKey = DEFAULT_NOTIFICATION_DOCK_STATE_KEY) {
  try {
    localStorage.setItem(stateKey, JSON.stringify(next));
  } catch (_) {}
}

function renderToggleButton({ toggleId, stateKey, onShow, summary } = {}) {
  let toggle = document.getElementById(toggleId);
  if (!toggle) {
    const container = document.querySelector('header .header-row') || document.body;
    toggle = document.createElement('button');
    toggle.id = toggleId;
    toggle.className = 'app-notification-toggle';
    toggle.type = 'button';
    const total = summary && summary.total ? Number(summary.total) : 0;
    toggle.setAttribute('aria-label', 'Show notifications');
    toggle.innerHTML = `🔔 <span class="app-notification-badge">${total}</span>`;
    toggle.addEventListener('click', () => {
      const state = readNotificationDockState(stateKey);
      writeNotificationDockState({ ...state, hidden: false }, stateKey);
      toggle.remove();
      if (onShow) onShow();
    });
    container.appendChild(toggle);
  } else if (summary && typeof summary.total !== 'undefined') {
    const badge = toggle.querySelector('.app-notification-badge');
    if (badge) badge.textContent = String(summary.total);
  }
}

export function renderNotificationDock(options = {}) {
  const {
    summary,
    storageKey = DEFAULT_NOTIFICATION_STORE_KEY,
    stateKey = DEFAULT_NOTIFICATION_DOCK_STATE_KEY,
    dockId = DEFAULT_DOCK_ID,
    toggleId = DEFAULT_TOGGLE_ID,
    linkHref = '/current-sprint',
    title = 'Time tracking alerts',
  } = options;
  const resolvedSummary = summary || readNotificationSummary(storageKey);
  const existing = document.getElementById(dockId);
  const state = readNotificationDockState(stateKey);

  if (!resolvedSummary || resolvedSummary.total <= 0) {
    if (existing) existing.remove();
    const toggle = document.getElementById(toggleId);
    if (toggle) toggle.remove();
    document.body.classList.remove('notification-dock-visible');
    return;
  }

  if (state.hidden) {
    if (existing) existing.remove();
    renderToggleButton({ toggleId, stateKey, onShow: () => renderNotificationDock(options), summary: resolvedSummary });
    document.body.classList.remove('notification-dock-visible');
    return;
  }

  const dock = existing || document.createElement('div');
  dock.id = dockId;
  dock.className = 'app-notification-dock';
  dock.classList.toggle('is-collapsed', state.collapsed);
  const boardName = resolvedSummary.boardName || 'Board';
  const sprintName = resolvedSummary.sprintName || 'Sprint';
  const missingEstimate = resolvedSummary.missingEstimate ?? 0;
  const missingLogged = resolvedSummary.missingLogged ?? 0;

  dock.innerHTML = `
    <div class="app-notification-title">
      <span class="app-notification-badge">${resolvedSummary.total}</span>
      ${title}
      <div class="app-notification-actions">
        <button type="button" class="btn-ghost" data-action="toggle">${state.collapsed ? 'Expand' : 'Minimize'}</button>
        <button type="button" class="btn-ghost" data-action="close" aria-label="Hide notifications">x</button>
      </div>
    </div>
    <div class="app-notification-body">${boardName} - ${sprintName}</div>
    <div class="app-notification-sub">Missing estimates: ${missingEstimate} | No log: ${missingLogged}</div>
    <a class="app-notification-link" href="${linkHref}">Open Current Sprint</a>
  `;
  if (!existing) document.body.appendChild(dock);
  document.body.classList.add('notification-dock-visible');

  const toggleBtn = dock.querySelector('[data-action="toggle"]');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const nextState = readNotificationDockState(stateKey);
      nextState.collapsed = !nextState.collapsed;
      writeNotificationDockState(nextState, stateKey);
      renderNotificationDock(options);
    });
  }

  const closeBtn = dock.querySelector('[data-action="close"]');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      writeNotificationDockState({ ...readNotificationDockState(stateKey), hidden: true }, stateKey);
      renderNotificationDock(options);
    });
  }
}

export const NOTIFICATION_STORE_KEY = DEFAULT_NOTIFICATION_STORE_KEY;
export const NOTIFICATION_DOCK_STATE_KEY = DEFAULT_NOTIFICATION_DOCK_STATE_KEY;
export const NOTIFICATION_TOGGLE_ID = DEFAULT_TOGGLE_ID;
