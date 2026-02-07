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
  html += '<p class="current-sprint-outcome-line" aria-live="polite">Sprint health at a glance. Use Burndown and Stuck for standup.</p>';
  // NEW: Header bar (sticky) with sprint metadata
  html += renderHeaderBar(data);
  
  // NEW: Alert banner for critical issues
  html += renderAlertBanner(data);
  
  // NEW: Sprint carousel navigation
  html += renderSprintCarousel(data);

  // Section quick links (jump to cards)
  html += '<div class="sprint-section-links" role="navigation" aria-label="Jump to section">';
  html += '<a href="#burndown-card">Burndown</a><span aria-hidden="true"> | </span>';
  html += '<a href="#scope-changes-card">Scope</a><span aria-hidden="true"> | </span>';
  html += '<a href="#stories-card">Work items</a><span aria-hidden="true"> | </span>';
  html += '<a href="#stuck-card">Stuck</a>';
  html += '</div>';

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

  // BELOW THE FOLD: Stuck items (always show for stable layout), Risks & Insights
  html += '<div class="sprint-cards-column full-width">';
  html += renderStuckCandidates(data);
  html += renderRisksAndInsights(data);
  html += '</div>';

  // LEGACY (kept for backward compatibility): Notifications, Sprint windows, Sub-task tracking
  html += '<div class="legacy-cards-section">';
  // Render lightweight placeholders and keep heavy legacy content inside <template> to avoid DOM bloat
  const notificationsHtml = renderNotifications(data);
  const subtaskHtml = renderSubtaskTracking(data);

  // Notifications placeholder with template
  html += '<div class="legacy-placeholder" id="legacy-notifications-placeholder">';
  html += '<h3>Legacy: Time tracking alerts</h3>';
  html += '<p><small>' + ((data.subtaskTracking && (data.subtaskTracking.notifications || []).length) || 0) + ' alerts</small></p>';
  html += '<button class="btn btn-secondary btn-compact" data-load-target="legacy-notifications">Show legacy notifications</button>';
  html += '<template id="legacy-notifications-template">' + notificationsHtml + '</template>';
  html += '</div>';

  // Sprint windows (keep as-is: small list)
  html += renderSprintWindows(data);

  // Subtask tracking placeholder with template
  html += '<div class="legacy-placeholder" id="legacy-subtasks-placeholder">';
  html += '<h3>Legacy: Sub-task tracking</h3>';
  html += '<p><small>' + ((data.subtaskTracking && (data.subtaskTracking.rows || []).length) || 0) + ' sub-tasks</small></p>';
  html += '<button class="btn btn-secondary btn-compact" data-load-target="legacy-subtasks">Show legacy sub-task table</button>';
  html += '<template id="legacy-subtasks-template">' + subtaskHtml + '</template>';
  html += '</div>';

  html += '</div>';

  // Scope modal (hidden by default)
  html += renderScopeModal(data);

  html += '</div>';
  
  // Export button (floats above content)
  html += renderExportButton();

  // Legacy summary/card is hidden via CSS; section nav is header bar "Issues in sprint" + carousel section links (Burndown | Scope | Work items | Stuck).
  html += renderSprintTabs(data);
  html += renderSummaryCard(data);
  html += renderAssumptions(data);

  // Add handlers for loading legacy templates on demand (to be wired after render)
  html += '<script>window._legacyTemplates = true;</script>';

  return html;
}
