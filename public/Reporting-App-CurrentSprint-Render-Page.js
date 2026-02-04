import { updateHeader, renderSprintTabs, renderSummaryCard, renderSprintWindows } from './Reporting-App-CurrentSprint-Render-Overview.js';
import { renderDailyCompletion, renderBurndown, renderScopeChanges, renderStories } from './Reporting-App-CurrentSprint-Render-Progress.js';
import { renderNotifications, renderSubtaskTracking, renderStuckCandidates } from './Reporting-App-CurrentSprint-Render-Subtasks.js';
import { renderNotes, renderAssumptions } from './Reporting-App-CurrentSprint-Render-Notes.js';
import { renderEmptyStateHtml } from './Reporting-App-Shared-Empty-State-Helpers.js';
// New redesign components
import { renderHeaderBar } from './Reporting-App-CurrentSprint-Header-Bar.js';
import { renderHealthDashboard } from './Reporting-App-CurrentSprint-Health-Dashboard.js';
import { renderAlertBanner } from './Reporting-App-CurrentSprint-Alert-Banner.js';
import { renderRisksAndInsights } from './Reporting-App-CurrentSprint-Risks-Insights.js';
import { renderCapacityAllocation } from './Reporting-App-CurrentSprint-Capacity-Allocation.js';
import { renderSprintCarousel } from './Reporting-App-CurrentSprint-Navigation-Carousel.js';
import { renderScopeIndicator, renderScopeModal } from './Reporting-App-CurrentSprint-Scope-Indicator.js';
import { renderCountdownTimer } from './Reporting-App-CurrentSprint-Countdown-Timer.js';
import { renderExportButton } from './Reporting-App-CurrentSprint-Export-Dashboard.js';

export function renderCurrentSprintPage(data) {
  if (!data.sprint) {
    updateHeader(null);
    return (
      '<div class="transparency-card">' +
      renderEmptyStateHtml(
        'No sprint',
        'No active or recent closed sprint for this board. Try another board or check back later.',
        ''
      ) +
      '</div>'
    );
  }

  updateHeader(data.sprint);

  let html = '';
  
  // NEW: Header bar (sticky) with sprint metadata
  html += renderHeaderBar(data);
  
  // NEW: Alert banner for critical issues
  html += renderAlertBanner(data);
  
  // NEW: Sprint carousel navigation
  html += renderSprintCarousel(data);

  // Redesigned page layout using CSS Grid
  html += '<div class="current-sprint-grid-layout">';

  // TOP ROW: Countdown timer, Health dashboard, Capacity (flexbox row)
  html += '<div class="sprint-cards-row top-row">';
  html += '<div class="card-column countdown-column">' + renderCountdownTimer(data) + '</div>';
  html += '<div class="card-column health-column">' + renderHealthDashboard(data) + '</div>';
  html += '<div class="card-column capacity-column">' + renderCapacityAllocation(data) + '</div>';
  html += '</div>';

  // SECONDARY: Burndown and Scope (2-column row)
  html += '<div class="sprint-cards-row secondary-row">';
  html += '<div class="card-column burndown-column">' + renderBurndown(data) + '</div>';
  html += '<div class="card-column scope-column">';
  html += renderScopeIndicator(data);
  html += renderScopeChanges(data); // Full scope changes table below indicator
  html += '</div>';
  html += '</div>';

  // MAIN CONTENT: Full-width cards
  html += '<div class="sprint-cards-column full-width">';
  html += renderDailyCompletion(data);
  html += renderStories(data);
  html += '</div>';

  // BELOW THE FOLD: Stuck items, Risks & Insights
  html += '<div class="sprint-cards-column full-width">';
  if ((data.stuckCandidates || []).length > 0) {
    html += renderStuckCandidates(data);
  }
  html += renderRisksAndInsights(data);
  html += '</div>';

  // LEGACY (kept for backward compatibility): Notifications, Sprint windows, Sub-task tracking
  html += '<div class="legacy-cards-section">';
  html += renderNotifications(data);
  html += renderSprintWindows(data);
  html += renderSubtaskTracking(data);
  html += '</div>';

  // Scope modal (hidden by default)
  html += renderScopeModal(data);

  html += '</div>';
  
  // Export button (floats above content)
  html += renderExportButton();

  // Backward compat: Render old cards for any downstream dependencies
  // These are now hidden via CSS in the legacy section above
  html += renderSprintTabs(data);
  html += renderSummaryCard(data);
  html += renderAssumptions(data);

  return html;
}
