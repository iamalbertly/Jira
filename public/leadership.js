/**
 * Sprint Leadership view: normalized trends, indexed delivery, predictability.
 * No rankings, no individual names. Uses /preview.json with date range.
 */

import { buildBoardSummaries } from './Jira-Reporting-App-Public-Boards-Summary.js';

(function () {
  const projectsSelect = document.getElementById('leadership-projects');
  const startInput = document.getElementById('leadership-start');
  const endInput = document.getElementById('leadership-end');
  const previewBtn = document.getElementById('leadership-preview');
  const loadingEl = document.getElementById('leadership-loading');
  const errorEl = document.getElementById('leadership-error');
  const contentEl = document.getElementById('leadership-content');
  const STORAGE_KEY = 'leadership_filters_v1';
  const NOTIFICATION_STORE_KEY = 'appNotificationsV1';

  function setDefaultDates() {
    const end = new Date();
    const start = new Date(end);
    start.setMonth(start.getMonth() - 3);
    startInput.value = start.toISOString().slice(0, 10);
    endInput.value = end.toISOString().slice(0, 10);
  }

  function loadSavedFilters() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (saved?.projects && projectsSelect) {
        projectsSelect.value = saved.projects;
      }
      if (saved?.start && startInput) {
        startInput.value = saved.start;
      }
      if (saved?.end && endInput) {
        endInput.value = saved.end;
      }
      return Boolean(saved?.start || saved?.end || saved?.projects);
    } catch (_) {
      return false;
    }
  }

  function saveFilters() {
    try {
      const payload = {
        projects: projectsSelect?.value || '',
        start: startInput?.value || '',
        end: endInput?.value || '',
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {}
  }

  function showLoading(msg) {
    loadingEl.textContent = msg || 'Loading...';
    loadingEl.style.display = 'block';
    errorEl.style.display = 'none';
    contentEl.style.display = 'none';
  }

  // Single error banner for this view: #leadership-error
  function showError(msg) {
    loadingEl.style.display = 'none';
    errorEl.textContent = msg || 'An error occurred.';
    errorEl.style.display = 'block';
    contentEl.style.display = 'none';
  }

  function showContent(html) {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'none';
    contentEl.innerHTML = html;
    contentEl.style.display = 'block';
  }

  function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function formatNumber(n, decimals) {
    if (n == null || n === '') return '-';
    const d = decimals != null ? decimals : 2;
    return Number(n).toFixed(d);
  }

  function formatDateShort(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  }

  function parseISO(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function addMonths(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
  }

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
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  function buildPreviewUrl() {
    const projects = (projectsSelect?.value || 'MPSA,MAS').trim();
    const start = startInput?.value || '';
    const end = endInput?.value || '';
    const startISO = start ? new Date(start + 'T00:00:00.000Z').toISOString() : '';
    const endISO = end ? new Date(end + 'T23:59:59.999Z').toISOString() : '';
    const params = new URLSearchParams({
      projects,
      start: startISO,
      end: endISO,
      includeStoryPoints: 'true',
      includeBugsForRework: 'true',
      includePredictability: 'true',
      includeEpicTTM: 'true',
    });
    return '/preview.json?' + params.toString();
  }

  function readNotificationSummary() {
    try {
      const raw = localStorage.getItem(NOTIFICATION_STORE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;
      return data;
    } catch (_) {
      return null;
    }
  }

  function renderNotificationDock() {
    const summary = readNotificationSummary();
    const existing = document.getElementById('app-notification-dock');
    if (!summary || summary.total <= 0) {
      if (existing) existing.remove();
      return;
    }
    const dock = existing || document.createElement('div');
    dock.id = 'app-notification-dock';
    dock.className = 'app-notification-dock';
    dock.innerHTML = `
      <div class="app-notification-title">
        <span class="app-notification-badge">${summary.total}</span>
        Time tracking alerts
      </div>
      <div class="app-notification-body">${escapeHtml(summary.boardName || 'Board')} - ${escapeHtml(summary.sprintName || 'Sprint')}</div>
      <div class="app-notification-sub">Missing estimates: ${summary.missingEstimate} - No log: ${summary.missingLogged}</div>
      <a class="app-notification-link" href="/current-sprint">Open Current Sprint</a>
    `;
    if (!existing) document.body.appendChild(dock);
  }

  function render(data) {
    const boards = data.boards || [];
    const meta = data.meta || {};
    const metrics = data.metrics || {};
    const predictability = metrics.predictability || {};
    const perSprint = predictability.perSprint || {};
    const sprintsIncluded = data.sprintsIncluded || [];
    const windowEnd = meta.windowEnd || new Date().toISOString();
    const windowEndDate = parseISO(windowEnd) || new Date();
    const windowEndIso = windowEndDate.toISOString();

    let html = '<p class="metrics-hint"><strong>Assumption:</strong> Completion anchored to resolution date. Indexed Delivery = current SP/day vs own baseline (last 6 closed sprints). Do not use to rank teams.</p>';

    html += '<div class="leadership-card">';
    html += '<h2>Boards - normalized delivery</h2>';
    if (boards.length === 0) {
      html += '<p>No boards in this window. Adjust date range or projects.</p>';
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
        const indexStr = idx != null && idx.index != null ? formatNumber(idx.index, 2) : '-';
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
        html += '<td>' + (spPerDay != null ? formatNumber(spPerDay, 2) : '-') + '</td>';
        html += '<td>' + (storiesPerDay != null ? formatNumber(storiesPerDay, 2) : '-') + '</td>';
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
    html += '<table class="data-table"><thead><tr><th>Window</th><th>Sprints</th><th>Avg SP/day</th><th>Difference</th><th>On-time %</th><th>Grade</th></tr></thead><tbody>';
    for (const row of velocityWindows) {
      const label = row.months === 1 ? '1 month' : row.months + ' months';
      const diffText = row.diff != null ? formatNumber(row.diff, 1) + '%' : '-';
      const onTimeText = row.current?.onTimePct != null ? formatNumber(row.current.onTimePct, 1) + '%' : '-';
      const gradeText = row.grade || '-';
      html += '<tr>';
      html += '<td>' + label + '</td>';
      html += '<td>' + (row.current?.sprintCount ?? 0) + '</td>';
      html += '<td>' + (row.current?.avg != null ? formatNumber(row.current.avg, 2) : '-') + '</td>';
      html += '<td>' + diffText + '</td>';
      html += '<td>' + onTimeText + '</td>';
      html += '<td title="Based on on-time % and predictability; not for performance review.">' + gradeText + '</td>';
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
        html += '<td>' + (row.predictabilityStories != null ? formatNumber(row.predictabilityStories, 1) + '%' : '-') + '</td>';
        html += '<td>' + (row.predictabilitySP != null ? formatNumber(row.predictabilitySP, 1) + '%' : '-') + '</td>';
        html += '</tr>';
      }
      html += '</tbody></table></div>';
    }

    return html;
  }

  function loadPreview() {
    const url = buildPreviewUrl();
    saveFilters();
    showLoading('Loading preview...');
    fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(async r => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
          const msg = (body && (body.message || body.error)) || r.statusText || 'Preview failed';
          throw new Error(msg);
        }
        return body;
      })
      .then(data => {
        const boards = data.boards || [];
        const sprintsIncluded = data.sprintsIncluded || [];
        const rows = data.rows || [];
        const meta = data.meta || {};
        if (!boards || boards.length === 0 || (sprintsIncluded && sprintsIncluded.length === 0)) {
          showError('No sprint data in this range. Widen the date range or check project access.');
          return;
        }
        meta.windowEnd = endInput?.value ? new Date(endInput.value + 'T23:59:59.999Z').toISOString() : new Date().toISOString();
        const predictabilityPerSprint = data.metrics?.predictability?.perSprint || null;
        const boardSummaries = buildBoardSummaries(boards, sprintsIncluded, rows, meta, predictabilityPerSprint);
        data.boardSummaries = boardSummaries;
        data.meta = meta;
        showContent(render(data));
      })
      .catch(err => showError(err.message || 'Failed to load preview.'));
  }

  if (previewBtn) previewBtn.addEventListener('click', loadPreview);
  if (projectsSelect) projectsSelect.addEventListener('change', saveFilters);
  if (startInput) startInput.addEventListener('change', saveFilters);
  if (endInput) endInput.addEventListener('change', saveFilters);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      renderNotificationDock();
      if (!loadSavedFilters()) {
        setDefaultDates();
      }
    });
  } else {
    renderNotificationDock();
    if (!loadSavedFilters()) {
      setDefaultDates();
    }
  }
})();
