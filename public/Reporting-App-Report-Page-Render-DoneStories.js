import { reportState } from './Reporting-App-Report-Page-State.js';
import { reportDom } from './Reporting-App-Report-Page-Context.js';
import { getSafeMeta, renderEmptyState } from './Reporting-App-Report-Page-Render-Helpers.js';
import { formatDateForDisplay } from './Reporting-App-Shared-Format-DateNumber-Helpers.js';
import { escapeHtml } from './Reporting-App-Shared-Dom-Escape-Helpers.js';
import { buildJiraIssueUrl } from './Reporting-App-Report-Utils-Jira-Helpers.js';

export function toggleSprint(id) {
  const content = document.getElementById(id);
  if (!content) return;
  const isVisible = content.style.display !== 'none';
  content.style.display = isVisible ? 'none' : 'block';
  const header = content.previousElementSibling;
  if (header) {
    const icon = header.querySelector('.toggle-icon');
    if (icon) icon.textContent = isVisible ? '>' : 'v';
  }
}

export function renderDoneStoriesTab(rows) {
  const content = document.getElementById('done-stories-content');
  const totalsBar = document.getElementById('done-stories-totals');
  const meta = getSafeMeta(reportState.previewData);
  const jiraHost = meta?.jiraHost || meta?.host || '';

  if (!rows || rows.length === 0) {
    const searchText = document.getElementById('search-box')?.value || '';
    const activeProjects = Array.from(document.querySelectorAll('.pill.active')).map(p => p.dataset.project);
    const requireResolved = !!meta?.requireResolvedBySprintEnd;
    const totalPreviewRows = (reportState.previewData?.rows || []).length;

    let title = 'No done stories found';
    let message;
    let hint;

    if (requireResolved && totalPreviewRows > 0) {
      message = 'No stories passed the "Require resolved by sprint end" filter.';
      hint = 'Try turning off this option to see all Done stories, or inspect sprint end dates and resolution dates in Jira.';
    } else if (searchText || (meta?.selectedProjects && activeProjects.length < meta.selectedProjects.length)) {
      message = 'No stories match your current filters.';
      hint = 'Try adjusting your search text or project filters, or check if stories are marked as "Done" in the selected sprints.';
    } else {
      message = 'No stories with status "Done" were found in the selected sprints for the chosen projects.';
      hint = 'This could mean: (1) No stories were completed in these sprints, (2) Stories are not marked as "Done", or (3) the current filters are excluding stories. Try adjusting your filters.';
    }

    renderEmptyState(content, title, message, hint);
    if (totalsBar) totalsBar.innerHTML = '';
    const projectPills = document.getElementById('project-pills');
    if (projectPills) {
      projectPills.innerHTML = '';
    }
    if (reportDom.exportDropdownTrigger) reportDom.exportDropdownTrigger.disabled = true;
    return;
  }

  const hasStatusCategory = rows.some(row => row.issueStatusCategory);
  const hasPriority = rows.some(row => row.issuePriority);
  const hasLabels = rows.some(row => row.issueLabels);
  const hasComponents = rows.some(row => row.issueComponents);
  const hasFixVersions = rows.some(row => row.issueFixVersions);
  const hasSubtasks = rows.some(row => Number(row.subtaskCount) > 0);
  const hasTimeTracking = rows.some(row =>
    row.timeOriginalEstimateHours !== '' ||
    row.timeRemainingEstimateHours !== '' ||
    row.timeSpentHours !== '' ||
    row.timeVarianceHours !== ''
  );
  const hasSubtaskTimeTracking = rows.some(row =>
    row.subtaskTimeOriginalEstimateHours !== '' ||
    row.subtaskTimeRemainingEstimateHours !== '' ||
    row.subtaskTimeSpentHours !== '' ||
    row.subtaskTimeVarianceHours !== ''
  );
  const hasEbmTeam = rows.some(row => row.ebmTeam);
  const hasEbmProductArea = rows.some(row => row.ebmProductArea);
  const hasEbmCustomerSegments = rows.some(row => row.ebmCustomerSegments);
  const hasEbmValue = rows.some(row => row.ebmValue);
  const hasEbmImpact = rows.some(row => row.ebmImpact);
  const hasEbmSatisfaction = rows.some(row => row.ebmSatisfaction);
  const hasEbmSentiment = rows.some(row => row.ebmSentiment);
  const hasEbmSeverity = rows.some(row => row.ebmSeverity);
  const hasEbmSource = rows.some(row => row.ebmSource);
  const hasEbmWorkCategory = rows.some(row => row.ebmWorkCategory);
  const hasEbmGoals = rows.some(row => row.ebmGoals);
  const hasEbmTheme = rows.some(row => row.ebmTheme);
  const hasEbmRoadmap = rows.some(row => row.ebmRoadmap);
  const hasEbmFocusAreas = rows.some(row => row.ebmFocusAreas);
  const hasEbmDeliveryStatus = rows.some(row => row.ebmDeliveryStatus);
  const hasEbmDeliveryProgress = rows.some(row => row.ebmDeliveryProgress);

  const sprintGroups = new Map();
  for (const row of rows) {
    if (!sprintGroups.has(row.sprintId)) {
      sprintGroups.set(row.sprintId, {
        sprint: {
          id: row.sprintId,
          name: row.sprintName,
          startDate: row.sprintStartDate,
          endDate: row.sprintEndDate,
        },
        rows: [],
      });
    }
    sprintGroups.get(row.sprintId).rows.push(row);
  }

  // Show most recent sprints first (descending by start date)
  const sortedSprints = Array.from(sprintGroups.values()).sort((a, b) => {
    const dateA = new Date(a.sprint.startDate || 0).getTime();
    const dateB = new Date(b.sprint.startDate || 0).getTime();
    return dateB - dateA;
  });

  let html = '<div class="sprint-groups">';

  for (const group of sortedSprints) {
    const sprintId = group.sprint.id;
    const sprintKey = `sprint-${sprintId}`;
    const sprintStartLabel = formatDateForDisplay(group.sprint.startDate);
    const sprintEndLabel = formatDateForDisplay(group.sprint.endDate);

    html += `
      <div class="sprint-group">
        <button class="sprint-header" data-sprint-target="${sprintKey}">
          <span class="toggle-icon">></span>
          <strong>${escapeHtml(group.sprint.name)}</strong>
          <span class="sprint-meta">${escapeHtml(sprintStartLabel)} to ${escapeHtml(sprintEndLabel)}</span>
          <span class="story-count">${group.rows.length} stories</span>
        </button>
        <div class="sprint-content" id="${sprintKey}" style="display: none;">
          <table class="data-table">
            <thead>
              <tr>
                <th title="Jira issue key.">Key</th>
                <th class="cell-wrap" title="Issue summary from Jira.">Summary</th>
                <th title="Current Jira status.">Status</th>
                <th title="Issue type (Story, Bug, etc.).">Type</th>
                ${hasStatusCategory ? '<th title="Status group (To Do / In Progress / Done).">Status Group</th>' : ''}
                ${hasPriority ? '<th title="Priority from Jira.">Priority</th>' : ''}
                ${hasLabels ? '<th class="cell-wrap" title="Issue labels.">Labels</th>' : ''}
                ${hasComponents ? '<th class="cell-wrap" title="Components on the issue.">Components</th>' : ''}
                ${hasFixVersions ? '<th title="Fix versions on the issue.">Fix Versions</th>' : ''}
                ${hasEbmTeam ? '<th title="EBM Team: who owns the value. Use to compare outcomes and focus by team.">EBM Team</th>' : ''}
                ${hasEbmProductArea ? '<th title="EBM Product Area: links work to the customer or product slice it serves.">EBM Product Area</th>' : ''}
                ${hasEbmCustomerSegments ? '<th title="EBM Customer Segments: who benefits. Helps assess Current Value and gaps.">EBM Customer Segments</th>' : ''}
                ${hasEbmValue ? '<th title="EBM Value: value signal tied to CV/UV. Higher value should drive priority.">EBM Value</th>' : ''}
                ${hasEbmImpact ? '<th title="EBM Impact: expected outcome size. Use to compare impact vs effort.">EBM Impact</th>' : ''}
                ${hasEbmSatisfaction ? '<th title="EBM Satisfaction: customer happiness signal. Low values indicate CV risk.">EBM Satisfaction</th>' : ''}
                ${hasEbmSentiment ? '<th title="EBM Sentiment: team/customer sentiment. Track trends to protect CV.">EBM Sentiment</th>' : ''}
                ${hasEbmSeverity ? '<th title="EBM Severity: urgency and business impact. High severity drains A2I.">EBM Severity</th>' : ''}
                ${hasEbmSource ? '<th title="EBM Source: where demand started (customer, ops, internal). Balance CV vs A2I.">EBM Source</th>' : ''}
                ${hasEbmWorkCategory ? '<th title="EBM Work Category: feature/defect/debt. High defect or debt reduces A2I.">EBM Work Category</th>' : ''}
                ${hasEbmGoals ? '<th title="EBM Goals: strategic goal linkage. Strengthens UV alignment.">EBM Goals</th>' : ''}
                ${hasEbmTheme ? '<th title="EBM Theme: strategic theme grouping. Shows where investment clusters.">EBM Theme</th>' : ''}
                ${hasEbmRoadmap ? '<th title="EBM Roadmap: roadmap linkage. Highlights UV delivery progress.">EBM Roadmap</th>' : ''}
                ${hasEbmFocusAreas ? '<th title="EBM Focus Areas: focus topics for investment. Compare spend vs outcomes.">EBM Focus Areas</th>' : ''}
                ${hasEbmDeliveryStatus ? '<th title="EBM Delivery Status: current delivery state. Useful for flow visibility.">EBM Delivery Status</th>' : ''}
                ${hasEbmDeliveryProgress ? '<th title="EBM Delivery Progress: percent/stage toward done. Useful for predictability.">EBM Delivery Progress</th>' : ''}
                <th title="Assignee display name.">Assignee</th>
                <th title="Created date (local display).">Created</th>
                <th title="Resolved date (local display).">Resolved</th>
                ${hasSubtasks ? '<th title="Count of subtasks.">Subtasks</th>' : ''}
                ${hasTimeTracking ? '<th title="Original estimate (hours).">Est (Hrs)</th><th title="Time spent (hours).">Spent (Hrs)</th><th title="Remaining estimate (hours).">Remaining (Hrs)</th><th title="Actual hours minus estimate. Positive = over estimate; negative = under. Large swings mean estimation risk.">Variance (Hrs)</th>' : ''}
                ${hasSubtaskTimeTracking ? '<th title="Subtask estimate (hours).">Subtask Est (Hrs)</th><th title="Subtask spent (hours).">Subtask Spent (Hrs)</th><th title="Subtask remaining (hours).">Subtask Remaining (Hrs)</th><th title="Actual subtask hours minus estimate. Large swings signal hidden work or poor slicing.">Subtask Variance (Hrs)</th>' : ''}
                ${meta?.discoveredFields?.storyPointsFieldId ? '<th title="Story Points.">SP</th>' : ''}
                ${meta?.discoveredFields?.epicLinkFieldId ? '<th title="Epic key (planned work).">Epic</th><th title="Epic title.">Epic Title</th><th class="cell-wrap" title="Epic summary (truncated in UI).">Epic Summary</th>' : ''}
              </tr>
            </thead>
            <tbody>
    `;

    const sortedRows = group.rows.sort((a, b) => a.issueKey.localeCompare(b.issueKey));

    for (const row of sortedRows) {
      const issueKey = row.issueKey || '';
      const issueUrl = buildJiraIssueUrl(jiraHost, issueKey);
      const epicKey = row.epicKey || '';
      const epicUrl = buildJiraIssueUrl(jiraHost, epicKey);
      let epicSummaryDisplay = '';
      let epicSummaryTitle = '';
      if (meta?.discoveredFields?.epicLinkFieldId && row.epicSummary && typeof row.epicSummary === 'string' && row.epicSummary.length > 0) {
        if (row.epicSummary.length > 100) {
          epicSummaryDisplay = row.epicSummary.substring(0, 100) + '...';
          epicSummaryTitle = row.epicSummary;
        } else {
          epicSummaryDisplay = row.epicSummary;
        }
      }

      html += `
        <tr>
          <td>${
            issueUrl
              ? `<a href="${escapeHtml(issueUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(issueKey)}</a>`
              : escapeHtml(issueKey)
          }</td>
          <td class="cell-wrap">${escapeHtml(row.issueSummary)}</td>
          <td>${escapeHtml(row.issueStatus)}</td>
          <td>${row.issueType ? escapeHtml(row.issueType) : '<em>Unknown</em>'}</td>
          ${hasStatusCategory ? `<td>${escapeHtml(row.issueStatusCategory || '')}</td>` : ''}
          ${hasPriority ? `<td>${escapeHtml(row.issuePriority || '')}</td>` : ''}
          ${hasLabels ? `<td class="cell-wrap">${escapeHtml(row.issueLabels || '')}</td>` : ''}
          ${hasComponents ? `<td class="cell-wrap">${escapeHtml(row.issueComponents || '')}</td>` : ''}
          ${hasFixVersions ? `<td>${escapeHtml(row.issueFixVersions || '')}</td>` : ''}
          ${hasEbmTeam ? `<td>${escapeHtml(row.ebmTeam || '')}</td>` : ''}
          ${hasEbmProductArea ? `<td>${escapeHtml(row.ebmProductArea || '')}</td>` : ''}
          ${hasEbmCustomerSegments ? `<td>${escapeHtml(row.ebmCustomerSegments || '')}</td>` : ''}
          ${hasEbmValue ? `<td>${escapeHtml(row.ebmValue || '')}</td>` : ''}
          ${hasEbmImpact ? `<td>${escapeHtml(row.ebmImpact || '')}</td>` : ''}
          ${hasEbmSatisfaction ? `<td>${escapeHtml(row.ebmSatisfaction || '')}</td>` : ''}
          ${hasEbmSentiment ? `<td>${escapeHtml(row.ebmSentiment || '')}</td>` : ''}
          ${hasEbmSeverity ? `<td>${escapeHtml(row.ebmSeverity || '')}</td>` : ''}
          ${hasEbmSource ? `<td>${escapeHtml(row.ebmSource || '')}</td>` : ''}
          ${hasEbmWorkCategory ? `<td>${escapeHtml(row.ebmWorkCategory || '')}</td>` : ''}
          ${hasEbmGoals ? `<td>${escapeHtml(row.ebmGoals || '')}</td>` : ''}
          ${hasEbmTheme ? `<td>${escapeHtml(row.ebmTheme || '')}</td>` : ''}
          ${hasEbmRoadmap ? `<td>${escapeHtml(row.ebmRoadmap || '')}</td>` : ''}
          ${hasEbmFocusAreas ? `<td>${escapeHtml(row.ebmFocusAreas || '')}</td>` : ''}
          ${hasEbmDeliveryStatus ? `<td>${escapeHtml(row.ebmDeliveryStatus || '')}</td>` : ''}
          ${hasEbmDeliveryProgress ? `<td>${escapeHtml(row.ebmDeliveryProgress || '')}</td>` : ''}
          <td>${escapeHtml(row.assigneeDisplayName)}</td>
          <td title="${escapeHtml(formatDateForDisplay(row.created))}">${escapeHtml(formatDateForDisplay(row.created))}</td>
          <td title="${escapeHtml(formatDateForDisplay(row.resolutionDate || ''))}">${escapeHtml(formatDateForDisplay(row.resolutionDate || ''))}</td>
          ${hasSubtasks ? `<td>${row.subtaskCount || 0}</td>` : ''}
          ${hasTimeTracking ? `
            <td>${row.timeOriginalEstimateHours ?? ''}</td>
            <td>${row.timeSpentHours ?? ''}</td>
            <td>${row.timeRemainingEstimateHours ?? ''}</td>
            <td>${row.timeVarianceHours ?? ''}</td>
          ` : ''}
          ${hasSubtaskTimeTracking ? `
            <td>${row.subtaskTimeOriginalEstimateHours ?? ''}</td>
            <td>${row.subtaskTimeSpentHours ?? ''}</td>
            <td>${row.subtaskTimeRemainingEstimateHours ?? ''}</td>
            <td>${row.subtaskTimeVarianceHours ?? ''}</td>
          ` : ''}
          ${meta?.discoveredFields?.storyPointsFieldId ? `<td>${row.storyPoints ?? ''}</td>` : ''}
          ${meta?.discoveredFields?.epicLinkFieldId
            ? `<td>${
                epicUrl
                  ? `<span class="epic-key"><a href="${escapeHtml(epicUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(epicKey)}</a></span>`
                  : `<span class="epic-key">${escapeHtml(epicKey)}</span>`
              }</td><td>${escapeHtml(row.epicTitle || '')}</td><td class="cell-wrap" title="${escapeHtml(epicSummaryTitle)}">${escapeHtml(epicSummaryDisplay)}</td>`
            : ''}
        </tr>
      `;
    }

    html += '</tbody></table></div></div>';
  }

  html += '</div>';
  content.innerHTML = html;
  try { import('./Reporting-App-Shared-Dom-Escape-Helpers.js').then(({ addTitleForTruncatedCells }) => addTitleForTruncatedCells('#tab-done-stories table.data-table th, #tab-done-stories table.data-table td')).catch(() => {}); } catch (e) {}

  document.querySelectorAll('.sprint-header[data-sprint-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-sprint-target');
      if (targetId) toggleSprint(targetId);
    });
  });
}
