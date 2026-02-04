import { updateHeader, renderSprintTabs, renderSummaryCard, renderSprintWindows } from './Reporting-App-CurrentSprint-Render-Overview.js';
import { renderDailyCompletion, renderBurndown, renderScopeChanges, renderStories } from './Reporting-App-CurrentSprint-Render-Progress.js';
import { renderNotifications, renderSubtaskTracking, renderStuckCandidates } from './Reporting-App-CurrentSprint-Render-Subtasks.js';
import { renderNotes, renderAssumptions } from './Reporting-App-CurrentSprint-Render-Notes.js';

export function renderCurrentSprintPage(data) {
  if (!data.sprint) {
    updateHeader(null);
    return (
      '<div class="transparency-card">' +
      '<p>No active or recent closed sprint for this board. Try another board or check back later.</p>' +
      '</div>'
    );
  }

  updateHeader(data.sprint);

  let html = '';
  html += renderSprintTabs(data);
  html += renderSummaryCard(data);
  html += renderNotifications(data);
  html += renderSubtaskTracking(data);
  html += renderSprintWindows(data);
  html += renderDailyCompletion(data);
  html += renderBurndown(data);
  html += renderScopeChanges(data);
  html += renderStories(data);
  html += renderStuckCandidates(data);
  html += renderNotes(data);
  html += renderAssumptions(data);

  return html;
}
