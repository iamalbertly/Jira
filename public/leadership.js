/**
 * Sprint Leadership view: normalized trends, indexed delivery, predictability.
 * No rankings, no individual names. Uses /preview.json with date range.
 */

(function () {
  const projectsSelect = document.getElementById('leadership-projects');
  const startInput = document.getElementById('leadership-start');
  const endInput = document.getElementById('leadership-end');
  const previewBtn = document.getElementById('leadership-preview');
  const loadingEl = document.getElementById('leadership-loading');
  const errorEl = document.getElementById('leadership-error');
  const contentEl = document.getElementById('leadership-content');

  function setDefaultDates() {
    const end = new Date();
    const start = new Date(end);
    start.setMonth(start.getMonth() - 3);
    startInput.value = start.toISOString().slice(0, 10);
    endInput.value = end.toISOString().slice(0, 10);
  }

  function showLoading(msg) {
    loadingEl.textContent = msg || 'Loading…';
    loadingEl.style.display = 'block';
    errorEl.style.display = 'none';
    contentEl.style.display = 'none';
  }

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
    if (n == null || n === '') return '—';
    const d = decimals != null ? decimals : 2;
    return Number(n).toFixed(d);
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

  function render(data) {
    const boards = data.boards || [];
    const meta = data.meta || {};
    const metrics = data.metrics || {};
    const predictability = metrics.predictability || {};
    const perSprint = predictability.perSprint || {};

    let html = '<p class="metrics-hint"><strong>Assumption:</strong> Completion anchored to resolution date. Indexed Delivery = current SP/day vs own baseline (last 6 closed sprints). Do not use to rank teams.</p>';

    html += '<div class="leadership-card">';
    html += '<h2>Boards – normalized delivery</h2>';
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
        const indexStr = idx != null && idx.index != null ? formatNumber(idx.index, 2) : '—';
        const onTime = summary?.doneStories > 0
          ? ((summary.doneBySprintEnd || 0) / summary.doneStories * 100).toFixed(1) + '%'
          : '—';
        const sprintCount = summary?.sprintCount ?? '—';
        html += '<tr>';
        html += '<td>' + escapeHtml(board.name) + '</td>';
        html += '<td>' + escapeHtml((board.projectKeys || []).join(', ')) + '</td>';
        html += '<td>' + sprintCount + '</td>';
        html += '<td>' + doneStories + '</td>';
        html += '<td>' + doneSP + '</td>';
        html += '<td>' + (spPerDay != null ? formatNumber(spPerDay, 2) : '—') + '</td>';
        html += '<td>' + (storiesPerDay != null ? formatNumber(storiesPerDay, 2) : '—') + '</td>';
        html += '<td>' + indexStr + '</td>';
        html += '<td>' + onTime + '</td>';
        html += '</tr>';
      }
      html += '</tbody></table>';
    }
    html += '</div>';

    if (Object.keys(perSprint).length > 0) {
      html += '<div class="leadership-card">';
      html += '<h2>Predictability by sprint (committed vs delivered)</h2>';
      html += '<p class="metrics-hint">Planned = created before sprint start; unplanned = added after. Detection assumptions apply.</p>';
      html += '<table class="data-table"><thead><tr><th>Sprint</th><th>Committed Stories</th><th>Delivered Stories</th><th>Committed SP</th><th>Delivered SP</th><th>Stories %</th><th>SP %</th></tr></thead><tbody>';
      for (const row of Object.values(perSprint)) {
        if (!row) continue;
        html += '<tr>';
        html += '<td>' + escapeHtml(row.sprintName) + '</td>';
        html += '<td>' + (row.committedStories ?? '—') + '</td>';
        html += '<td>' + (row.deliveredStories ?? '—') + '</td>';
        html += '<td>' + (row.committedSP ?? '—') + '</td>';
        html += '<td>' + (row.deliveredSP ?? '—') + '</td>';
        html += '<td>' + (row.predictabilityStories != null ? formatNumber(row.predictabilityStories, 1) + '%' : '—') + '</td>';
        html += '<td>' + (row.predictabilitySP != null ? formatNumber(row.predictabilitySP, 1) + '%' : '—') + '</td>';
        html += '</tr>';
      }
      html += '</tbody></table></div>';
    }

    return html;
  }

  function loadPreview() {
    const url = buildPreviewUrl();
    showLoading('Loading preview…');
    fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(r => {
        if (!r.ok) throw new Error(r.statusText || 'Preview failed');
        return r.json();
      })
      .then(data => {
        const boards = data.boards || [];
        const sprintsIncluded = data.sprintsIncluded || [];
        const rows = data.rows || [];
        const meta = data.meta || {};
        const predictabilityPerSprint = data.metrics?.predictability?.perSprint || null;
        const boardSummaries = buildBoardSummaries(boards, sprintsIncluded, rows, meta, predictabilityPerSprint);
        data.boardSummaries = boardSummaries;
        showContent(render(data));
      })
      .catch(err => showError(err.message || 'Failed to load preview.'));
  }

  // Board summary must match server-provided sprintsIncluded shape (sprintWorkDays, doneSP, etc.).
  function buildBoardSummaries(boards, sprintsIncluded, rows, meta, predictabilityPerSprint) {
    const summaries = new Map();
    for (const board of boards || []) {
      const boardSprints = (sprintsIncluded || []).filter(s => s.boardId === board.id);
      const boardRows = (rows || []).filter(r => r.boardId === board.id);
      let totalSprintDays = 0;
      let validSprintDaysCount = 0;
      let doneBySprintEnd = 0;
      let earliestStart = null;
      let latestEnd = null;
      for (const s of boardSprints) {
        const wd = s.sprintWorkDays != null && s.sprintWorkDays > 0
          ? s.sprintWorkDays
          : (s.sprintCalendarDays != null && s.sprintCalendarDays > 0 ? s.sprintCalendarDays : null);
        if (wd && wd > 0) {
          totalSprintDays += wd;
          validSprintDaysCount += 1;
        }
        doneBySprintEnd += s.doneStoriesBySprintEnd || 0;
        if (s.startDate) {
          const d = new Date(s.startDate);
          if (!earliestStart || d < earliestStart) earliestStart = d;
        }
        if (s.endDate) {
          const d = new Date(s.endDate);
          if (!latestEnd || d > latestEnd) latestEnd = d;
        }
      }
      const committedSP = predictabilityPerSprint
        ? Object.values(predictabilityPerSprint).filter(p => boardSprints.some(s => s.id === p.sprintId)).reduce((sum, p) => sum + (p.committedSP || 0), 0)
        : 0;
      const deliveredSP = predictabilityPerSprint
        ? Object.values(predictabilityPerSprint).filter(p => boardSprints.some(s => s.id === p.sprintId)).reduce((sum, p) => sum + (p.deliveredSP || 0), 0)
        : 0;
      summaries.set(board.id, {
        sprintCount: boardSprints.length,
        doneStories: boardRows.length,
        doneSP: boardRows.reduce((sum, r) => sum + (parseFloat(r.storyPoints) || 0), 0),
        totalSprintDays,
        validSprintDaysCount,
        doneBySprintEnd,
        earliestStart,
        latestEnd,
        committedSP,
        deliveredSP,
      });
    }
    return summaries;
  }

  if (previewBtn) previewBtn.addEventListener('click', loadPreview);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { setDefaultDates(); });
  } else {
    setDefaultDates();
  }
})();
