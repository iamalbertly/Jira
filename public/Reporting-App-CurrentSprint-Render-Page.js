import { updateHeader, renderSprintTabs, renderSummaryCard, renderSprintWindows } from './Reporting-App-CurrentSprint-Render-Overview.js';
import { renderDailyCompletion, renderBurndown, renderStories } from './Reporting-App-CurrentSprint-Render-Progress.js';
import { renderWorkRisksMerged } from './Reporting-App-CurrentSprint-Render-Subtasks.js';
import { renderNotes, renderAssumptions } from './Reporting-App-CurrentSprint-Render-Notes.js';
import { renderEmptyStateHtml } from './Reporting-App-Shared-Empty-State-Helpers.js';
// New redesign components
import { renderHeaderBar } from './Reporting-App-CurrentSprint-Header-Bar.js';
import { renderHealthDashboard } from './Reporting-App-CurrentSprint-Health-Dashboard.js';
import { renderAlertBanner, renderVerdictBar } from './Reporting-App-CurrentSprint-Alert-Banner.js';
import { renderRisksAndInsights } from './Reporting-App-CurrentSprint-Risks-Insights.js';
import { renderCapacityAllocation } from './Reporting-App-CurrentSprint-Capacity-Allocation.js';
import { renderSprintCarousel } from './Reporting-App-CurrentSprint-Navigation-Carousel.js';
import { renderScopeIndicator, renderScopeModal } from './Reporting-App-CurrentSprint-Scope-Indicator.js';
import { renderCountdownTimer } from './Reporting-App-CurrentSprint-Countdown-Timer.js';

export function renderCurrentSprintPage(data) {
  if (!data.sprint) {
    updateHeader(null);
    return (
      '<div class="transparency-card">' +
      renderEmptyStateHtml(
        'No active sprint',
        'There is no active sprint on this board right now.',
        'Try the previous sprint tab in the carousel above or select a different board.'
      ) +
      '</div>'
    );
  }

  updateHeader(data.sprint);

  let html = '';
  const summary = data.summary || {};
  const tracking = data.subtaskTracking || {};
  const trackingRows = tracking.rows || [];
  const trackingSummary = tracking.summary || {};
  const stuckCount = (data.stuckCandidates || []).length || 0;
  const missingEstimates = trackingRows.filter((r) => !r.estimateHours || r.estimateHours === 0).length;
  const missingLoggedItems = trackingRows.filter((r) => !r.loggedHours || r.loggedHours === 0).length;
  const percentDone = typeof summary.percentDone === 'number' ? summary.percentDone : 0;

  let healthLabel = 'Healthy';
  let healthClass = 'healthy';
  const signals = [];
  if (stuckCount > 0) signals.push(stuckCount + ' stuck >24h');
  if (missingEstimates > 0) signals.push(missingEstimates + ' missing estimates');
  if (missingLoggedItems > 0) signals.push(missingLoggedItems + ' with no log');
  if (percentDone < 50 && (summary.totalStories || 0) > 0) signals.push('less than half of stories done');

  const riskCount = signals.length;
  if (riskCount >= 2) {
    healthLabel = 'Needs attention';
    healthClass = 'needs-attention';
  } else if (riskCount === 1) {
    healthLabel = 'At risk';
    healthClass = 'at-risk';
  }

  // Flaw 3: Single-line verdict bar first (one sentence, one color, one action)
  html += renderVerdictBar(data);

  html += renderHeaderBar(data);
  html += renderAlertBanner(data);
  html += renderSprintCarousel(data);

  html += '<div class="sprint-section-links" role="navigation" aria-label="Jump to section">';
  html += '<a href="#stuck-card">Risks</a><span aria-hidden="true"> | </span>';
  html += '<a href="#burndown-card">Burndown</a><span aria-hidden="true"> | </span>';
  html += '<a href="#scope-changes-card">Scope</a><span aria-hidden="true"> | </span>';
  html += '<a href="#stories-card">Work items</a>';
  html += '</div>';

  html += '<div class="current-sprint-grid-layout">';

  // Priority order: Blockers/Risks first, then burndown/scope, then details (progressive disclosure)
  html += '<div class="sprint-cards-row risks-row">';
  html += '<div class="card-column risks-stuck-column">' + renderWorkRisksMerged(data) + '</div>';
  html += '<div class="card-column risks-insights-column">' + renderRisksAndInsights(data) + '</div>';
  html += '</div>';

  html += '<div class="sprint-cards-row secondary-row">';
  html += '<div class="card-column burndown-column">' + renderBurndown(data) + '</div>';
  html += '<div class="card-column scope-column">' + renderScopeIndicator(data) + '</div>';
  html += '</div>';

  const detailsCollapsed = riskCount >= 1 ? ' card-details-collapsed' : '';
  html += '<div class="sprint-cards-row top-row card-details-toggle-wrap' + detailsCollapsed + '" data-region="details">';
  html += '<button type="button" class="card-details-toggle btn btn-secondary btn-compact" aria-expanded="' + (riskCount >= 1 ? 'false' : 'true') + '" aria-controls="card-details-region">' + (riskCount >= 1 ? 'Show details (countdown, health, capacity)' : 'Hide details') + '</button>';
  html += '</div>';
  html += '<div class="sprint-cards-row top-row" id="card-details-region" aria-hidden="' + (riskCount >= 1 ? 'true' : 'false') + '">';
  html += '<div class="card-column countdown-column">' + renderCountdownTimer(data) + '</div>';
  html += '<div class="card-column health-column">' + renderHealthDashboard(data) + '</div>';
  html += '<div class="card-column capacity-column">' + renderCapacityAllocation(data) + '</div>';
  html += '</div>';

  html += '<div class="sprint-cards-column full-width">';
  html += '<details class="mobile-secondary-details" data-mobile-collapse="true" open>';
  html += '<summary>Daily completion trend</summary>';
  html += renderDailyCompletion(data);
  html += '</details>';
  html += renderStories(data);
  html += '</div>';

  // LEGACY (kept for backward compatibility): Notifications, Sprint windows, Sub-task tracking

  // Render lightweight placeholders and keep heavy legacy content inside <template> to avoid DOM bloat






  // Scope modal (hidden by default)
  html += renderScopeModal(data);

  html += '</div>';

  // Legacy summary/card is hidden via CSS; section nav is header bar "Issues in sprint" + carousel section links (Burndown | Scope | Work items | Stuck).
  html += renderSprintTabs(data);
  html += renderSummaryCard(data);
  html += renderAssumptions(data);

  // Add handlers for loading legacy templates on demand (to be wired after render)


  return html;
}
