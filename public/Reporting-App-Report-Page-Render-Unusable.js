import { renderEmptyState } from './Reporting-App-Report-Page-Render-Helpers.js';
import { escapeHtml } from './Reporting-App-Shared-Dom-Escape-Helpers.js';

export function renderUnusableSprintsTab(unusable) {
  const content = document.getElementById('unusable-sprints-content');

  if (!unusable || unusable.length === 0) {
    renderEmptyState(
      content,
      'No unusable sprints',
      'All sprints in the selected date range have valid start and end dates.',
      'Sprints are marked as unusable if they are missing start or end dates. Enable "Include Active/Missing End Date Sprints" to include sprints with missing end dates.'
    );
    return;
  }

  let html = '<table class="data-table"><thead><tr><th>Board</th><th>Sprint</th><th>Reason</th></tr></thead><tbody>';

  for (const sprint of unusable) {
    html += `
      <tr>
        <td>${escapeHtml(sprint.boardName || '')}</td>
        <td>${escapeHtml(sprint.name || '')}</td>
        <td>${escapeHtml(sprint.reason || '')}</td>
      </tr>
    `;
  }

  html += '</tbody></table>';
  content.innerHTML = html;
}
