import { renderNotificationDock } from './Reporting-App-Shared-Notifications-Dock-Manager.js';
import { initLeadershipDefaults, initLeadershipFilters, tryAutoRunPreviewOnce, renderLeadershipLoading } from './Reporting-App-Leadership-Page-Data-Loader.js';

function initLeadershipPage() {
  renderNotificationDock();
  initLeadershipDefaults();
  initLeadershipFilters();
  tryAutoRunPreviewOnce();
  renderLeadershipLoading();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLeadershipPage);
} else {
  initLeadershipPage();
}
