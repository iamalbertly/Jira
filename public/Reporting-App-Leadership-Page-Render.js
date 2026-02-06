import { escapeHtml } from './Reporting-App-Shared-Dom-Escape-Helpers.js';
import { formatNumber, formatDateShort, parseISO, addMonths } from './Reporting-App-Shared-Format-DateNumber-Helpers.js';
import { renderEmptyStateHtml } from './Reporting-App-Shared-Empty-State-Helpers.js';

function computeVelocityWindowStats(sprints, windowEnd, months) {
  const end = parseISO(windowEnd);
  if (!end) return null;
  const start = addMonths(end, -months);
  const closed = sprints.filter(s => (s.state || '').toLowerCase() === 'closed');
  const inWindow = closed.filter(s => {
    const endDate = parseISO(s.endDate);
    return endDate && endDate >= start && endDate <= end;
  });
  const totalSP = inWindow.reduce((sum, s) => sum + (s.doneSP || 0), 0);
  const totalDays = inWindow.reduce((sum, s) => sum + (s.sprintWorkDays || 0), 0);
  const avg = totalDays > 0 ? totalSP / totalDays : null;
  const doneStories = inWindow.reduce((sum, s) => sum + (s.doneStoriesNow || 0), 0);
  const doneByEnd = inWindow.reduce((sum, s) => sum + (s.doneStoriesBySprintEnd || 0), 0);
  const onTimePct = doneStories > 0 ? (doneByEnd / doneStories) * 100 : null;
  return { avg, sprintCount: inWindow.length, onTimePct, inWindow };
}

function computePredictabilityAverage(perSprint, inWindow) {
  if (!perSprint || !inWindow || inWindow.length === 0) return null;
  const values = inWindow
    .map(s => perSprint[s.id]?.predictabilitySP)
    .filter(v => v != null && !Number.isNaN(v));
  if (!values.length) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

function gradeFromSignals(onTimePct, predictabilityPct) {
  const metrics = [onTimePct, predictabilityPct].filter(v => v != null && !Number.isNaN(v));
  if (!metrics.length) return null;
  const score = metrics.reduce((sum, v) => sum + v, 0) / metrics.length;
  if (score >= 90) return 'Strong';
  if (score >= 80) return 'Stable';
  if (score >= 70) return 'Watch';
  if (score >= 60) return 'At risk';
  return 'Critical';
}

export function renderLeadershipPage(data) {
  const boards = data.boards || [];
  const meta = data.meta || {};
  const metrics = data.metrics || {};
  const predictability = metrics.predictability || {};
  const perSprint = predictability.perSprint || {};
  const sprintsIncluded = data.sprintsIncluded || [];
  const windowEnd = meta.windowEnd || new Date().toISOString();
  const windowEndDate = parseISO(windowEnd) || new Date();
  const windowEndIso = windowEndDate.toISOString();

  const projectsLabel = meta.projects ? meta.projects.replace(/,/g, ', ') : '-';
  const rangeStart = meta.windowStart ? formatDateShort(meta.windowStart) : '-';
  const rangeEnd = meta.windowEnd ? formatDateShort(meta.windowEnd) : '-';

  let html = '<p class="metrics-hint"><strong>Context:</strong> Projects ' + escapeHtml(projectsLabel) + ' · Range ' + escapeHtml(rangeStart) + ' to ' + escapeHtml(rangeEnd) + ' · Completion anchored to resolution date.</p>';
  html += '<p class="metrics-hint">Indexed Delivery = current SP/day vs own baseline (last 6 closed sprints). Use for trend visibility, not performance ranking.</p>';

  html += '<div class="leadership-card">';
  html += '<h2>Boards - normalized delivery</h2>';
  if (boards.length === 0) {
    html += renderEmptyStateHtml(
      'No boards',
      'No boards in this window. Adjust date range or projects.',
      ''
    );
  } else {
    html += '<table class="data-table"><thead><tr>';
    html += '<th>Board</th><th>Projects</th><th>Sprints</th><th>Done Stories</th><th>Done SP</th>';
    html += '<th>SP / Day</th><th>Stories / Day</th><th>Indexed Delivery</th><th>On-time %</th>';
    html += '</tr></thead><tbody>';
    for (const board of boards) {
      const summary = (data.boardSummaries || new Map()).get(board.id);
      const totalSprintDays = summary?.totalSprintDays || 0;
      const doneStories = summary?.doneStories || 0;
      const doneSP = summary?.doneSP || 0;
      const spPerDay = totalSprintDays > 0 ? doneSP / totalSprintDays : null;
      const storiesPerDay = totalSprintDays > 0 ? doneStories / totalSprintDays : null;
      const idx = board.indexedDelivery;
      const indexStr = idx != null && idx.index != null ? formatNumber(idx.index, 2, '-') : '-';
      const onTime = summary?.doneStories > 0
        ? ((summary.doneBySprintEnd || 0) / summary.doneStories * 100).toFixed(1) + '%'
        : '-';
      const sprintCount = summary?.sprintCount ?? '-';
      html += '<tr>';
      html += '<td>' + escapeHtml(board.name) + '</td>';
      html += '<td>' + escapeHtml((board.projectKeys || []).join(', ')) + '</td>';
      html += '<td>' + sprintCount + '</td>';
      html += '<td>' + doneStories + '</td>';
      html += '<td>' + doneSP + '</td>';
      html += '<td>' + (spPerDay != null ? formatNumber(spPerDay, 2, '-') : '-') + '</td>';
      html += '<td>' + (storiesPerDay != null ? formatNumber(storiesPerDay, 2, '-') : '-') + '</td>';
      html += '<td>' + indexStr + '</td>';
      html += '<td>' + onTime + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
  }
  html += '</div>';

  const velocityWindows = [1, 3, 6, 12].map(months => {
    const current = computeVelocityWindowStats(sprintsIncluded, windowEndIso, months);
    const previousEnd = addMonths(windowEndDate, -months).toISOString();
    const previous = computeVelocityWindowStats(sprintsIncluded, previousEnd, months);
    const diff = current?.avg != null && previous?.avg != null && previous.avg !== 0
      ? ((current.avg - previous.avg) / previous.avg) * 100
      : null;
    const predictabilityAvg = computePredictabilityAverage(perSprint, current?.inWindow || []);
    const grade = gradeFromSignals(current?.onTimePct ?? null, predictabilityAvg ?? null);
    return { months, current, diff, predictabilityAvg, grade };
  });

  html += '<div class="leadership-card">';
  html += '<h2>Velocity (SP/day) and trend</h2>';
  html += '<p class="metrics-hint">Rolling averages by sprint end date. Difference compares against the previous window of the same length.</p>';
  html += '<table class="data-table"><thead><tr><th>Window</th><th>Sprints</th><th>Avg SP/day</th><th>Difference</th><th>On-time %</th><th>Signal</th><th>Data quality</th></tr></thead><tbody>';
  for (const row of velocityWindows) {
    const label = row.months === 1 ? '1 month' : row.months + ' months';
    const diffText = row.diff != null ? formatNumber(row.diff, 1, '-') + '%' : '-';
    const onTimeText = row.current?.onTimePct != null ? formatNumber(row.current.onTimePct, 1, '-') + '%' : '-';
    const gradeText = row.grade || '-';
    const quality = row.current?.sprintCount != null && row.current.sprintCount < 3 ? 'Low sample' : 'OK';
    html += '<tr>';
    html += '<td>' + label + '</td>';
    html += '<td>' + (row.current?.sprintCount ?? 0) + '</td>';
    html += '<td>' + (row.current?.avg != null ? formatNumber(row.current.avg, 2, '-') : '-') + '</td>';
    html += '<td>' + diffText + '</td>';
    html += '<td>' + onTimeText + '</td>';
    html += '<td title="Based on on-time % and predictability; not for performance review.">' + gradeText + '</td>';
    html += '<td>' + quality + '</td>';
    html += '</tr>';
  }
  html += '</tbody></table></div>';

  if (Object.keys(perSprint).length > 0) {
    const sprintIndex = new Map();
    for (const sprint of sprintsIncluded) {
      if (sprint?.id != null) sprintIndex.set(sprint.id, sprint);
    }
    const perSprintRows = Object.values(perSprint)
      .filter(Boolean)
      .map(row => {
        const sprint = sprintIndex.get(row.sprintId);
        return {
          ...row,
          endDate: sprint?.endDate || row.sprintEndDate || '',
          startDate: sprint?.startDate || row.sprintStartDate || '',
        };
      })
      .sort((a, b) => {
        const aTime = new Date(a.endDate || a.startDate || 0).getTime();
        const bTime = new Date(b.endDate || b.startDate || 0).getTime();
        return bTime - aTime;
      });

    html += '<div class="leadership-card">';
    html += '<h2>Predictability by sprint (committed vs delivered)</h2>';
    html += '<p class="metrics-hint">Planned = created before sprint start; unplanned = added after. Detection assumptions apply.</p>';
    html += '<table class="data-table"><thead><tr><th>Sprint</th><th>Start</th><th>End</th><th>Committed Stories</th><th>Delivered Stories</th><th>Committed SP</th><th>Delivered SP</th><th>Stories %</th><th>SP %</th></tr></thead><tbody>';
    for (const row of perSprintRows) {
      html += '<tr>';
      html += '<td>' + escapeHtml(row.sprintName) + '</td>';
      html += '<td>' + escapeHtml(formatDateShort(row.startDate)) + '</td>';
      html += '<td>' + escapeHtml(formatDateShort(row.endDate)) + '</td>';
      html += '<td>' + (row.committedStories ?? '-') + '</td>';
      html += '<td>' + (row.deliveredStories ?? '-') + '</td>';
      html += '<td>' + (row.committedSP ?? '-') + '</td>';
      html += '<td>' + (row.deliveredSP ?? '-') + '</td>';
      html += '<td>' + (row.predictabilityStories != null ? formatNumber(row.predictabilityStories, 1, '-') + '%' : '-') + '</td>';
      html += '<td>' + (row.predictabilitySP != null ? formatNumber(row.predictabilitySP, 1, '-') + '%' : '-') + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div>';
  }

  return html;
}
