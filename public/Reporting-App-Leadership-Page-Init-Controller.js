import { renderNotificationDock } from './Reporting-App-Shared-Notifications-Dock-Manager.js';
import { initLeadershipDefaults, initLeadershipFilters, renderLeadershipLoading } from './Reporting-App-Leadership-Page-Data-Loader.js';

function initLeadershipPage() {
  renderNotificationDock();
  initLeadershipDefaults();
  initLeadershipFilters();
  renderLeadershipLoading();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLeadershipPage);
} else {
  initLeadershipPage();
}
