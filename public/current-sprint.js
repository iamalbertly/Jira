/**
 * Current Sprint Transparency page: board selector, current-sprint API, render sprint meta,
 * planned vs observed window, flags, daily completion, scope changes, burndown, and notes.
 */

(function () {
  const projects = 'MPSA,MAS';
  const boardSelect = document.getElementById('board-select');
  const loadingEl = document.getElementById('current-sprint-loading');
  const errorEl = document.getElementById('current-sprint-error');
  const contentEl = document.getElementById('current-sprint-content');
  const titleEl = document.getElementById('current-sprint-title');
  const nameEl = document.getElementById('current-sprint-name');
  const subtitleEl = document.getElementById('current-sprint-subtitle');

  const STORAGE_KEY = 'vodaAgileBoard_lastBoardId';
  const STORAGE_SPRINT_KEY = 'vodaAgileBoard_lastSprintId';

  let currentBoardId = null;
  let currentSprintId = null;

  function showLoading(msg) {
    loadingEl.textContent = msg || 'Loading boards for projects MPSA, MAS...';
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

  function showContent(html, data) {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'none';
    contentEl.innerHTML = html;
    contentEl.style.display = 'block';
    wireDynamicHandlers(data);
  }

  function escapeHtml(value) {
    if (value == null) return '';
    const div = document.createElement('div');
    div.textContent = String(value);
    return div.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return '-';
    try {
      const d = new Date(iso);
      return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
    } catch (_) {
      return iso;
    }
  }

  function formatDayLabel(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const day = d.getDate();
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
    return day + ' ' + month + ' (' + weekday + ')';
  }

  function formatNumber(value, decimals) {
    if (value == null || value === '') return '-';
    const digits = decimals != null ? decimals : 1;
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(digits) : '-';
  }

  function getErrorMessage(r, body, fallback) {
    if (r.status === 401) return 'Session expired. Please log in again.';
    if (r.status === 429) return 'Data may be incomplete due to rate limits; try again later.';
    return (body && (body.message || body.error)) || r.statusText || fallback;
  }

  function updateHeader(sprint) {
    if (!titleEl || !nameEl) return;
    if (!sprint) {
      titleEl.textContent = 'Current Sprint';
      nameEl.textContent = '';
      if (subtitleEl) subtitleEl.textContent = 'Squad view - planned vs observed work, daily completion, scope changes';
      return;
    }
    titleEl.textContent = 'Current Sprint';
    nameEl.textContent = sprint.name ? '- ' + sprint.name : (sprint.id ? '- ' + sprint.id : '');
    if (subtitleEl) subtitleEl.textContent = 'Sprint transparency snapshot (' + (sprint.state || 'unknown') + ')';
  }

  function addLoginLink() {
    if (!errorEl || errorEl.querySelector('a.nav-link')) return;
    const link = document.createElement('a');
    link.href = '/';
    link.className = 'nav-link';
    link.textContent = 'Log in again';
    link.style.marginLeft = '8px';
    errorEl.appendChild(document.createTextNode(' '));
    errorEl.appendChild(link);
  }

  function loadBoards() {
    return fetch(`/api/boards.json?projects=${encodeURIComponent(projects)}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    }).then(async r => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(getErrorMessage(r, body, 'Failed to load boards'));
      return body;
    });
  }

  function loadCurrentSprint(boardId, sprintId) {
    const params = new URLSearchParams({
      boardId: String(boardId),
      projects,
    });
    if (sprintId) params.set('sprintId', String(sprintId));
    return fetch(`/api/current-sprint.json?${params.toString()}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    }).then(async r => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(getErrorMessage(r, body, 'Failed to load current sprint'));
      return body;
    });
  }

  function buildBurndownChart(remaining, ideal) {
    if (!remaining || remaining.length === 0) return '';
    const width = 640;
    const height = 220;
    const padding = 24;
    const maxY = Math.max(
      1,
      ...remaining.map(r => r.remainingSP || 0),
      ...(ideal || []).map(r => r.remainingSP || 0)
    );
    const maxX = remaining.length - 1;

    function pointForIndex(idx, value) {
      const x = maxX > 0 ? padding + (idx / maxX) * (width - padding * 2) : padding;
      const y = height - padding - (value / maxY) * (height - padding * 2);
      return x.toFixed(2) + ',' + y.toFixed(2);
    }

    const actualPoints = remaining.map((row, idx) => pointForIndex(idx, row.remainingSP || 0)).join(' ');
    const idealPoints = (ideal || remaining).map((row, idx) => pointForIndex(idx, row.remainingSP || 0)).join(' ');
    const startLabel = formatDayLabel(remaining[0].date);
    const midIndex = Math.floor(remaining.length / 2);
    const midLabel = formatDayLabel(remaining[midIndex].date);
    const endLabel = formatDayLabel(remaining[remaining.length - 1].date);

    return (
      '<div class="burndown-chart-wrap">' +
      '<svg class="burndown-chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Burndown chart with ideal line">' +
      '<rect x="0" y="0" width="' + width + '" height="' + height + '" fill="var(--card-muted)"></rect>' +
      '<polyline points="' + idealPoints + '" class="burndown-ideal" />' +
      '<polyline points="' + actualPoints + '" class="burndown-actual" />' +
      '</svg>' +
      '<div class="burndown-axis">' +
      '<span class="burndown-axis-y">Remaining SP</span>' +
      '<div class="burndown-axis-x">' +
      '<span>' + escapeHtml(startLabel) + '</span>' +
      '<span>' + escapeHtml(midLabel) + '</span>' +
      '<span>' + escapeHtml(endLabel) + '</span>' +
      '</div>' +
      '</div>' +
      '<div class="burndown-legend">' +
      '<span><span class="legend-swatch actual"></span>Actual</span>' +
      '<span><span class="legend-swatch ideal"></span>Ideal</span>' +
      '</div>' +
      '</div>'
    );
  }

  function renderSprintTabs(data) {
    const sprints = data.recentSprints || [];
    if (!sprints.length) return '';
    let html = '<div class="sprint-tabs" role="tablist" aria-label="Sprints">';
    for (const sprint of sprints) {
      const isActive = data.sprint && sprint.id === data.sprint.id;
      const sprintName = sprint.name || ('Sprint ' + sprint.id);
      const label = (sprint.state || '').toLowerCase() === 'active' ? 'Current - ' + sprintName : sprintName;
      html += '<button class="sprint-tab' + (isActive ? ' active' : '') + '" type="button" data-sprint-id="' + sprint.id + '" role="tab" aria-selected="' + (isActive ? 'true' : 'false') + '">' + escapeHtml(label) + '</button>';
    }
    html += '<a class="sprint-tab-link" href="/sprint-leadership">Dashboard</a>';
    html += '</div>';
    return html;
  }

  function renderSummaryCard(data) {
    const sprint = data.sprint || {};
    const summary = data.summary || {};
    const days = data.daysMeta || {};
    const planned = data.plannedWindow || {};
    const scopeChanges = data.scopeChanges || [];
    const nextSprint = data.nextSprint || null;
    const previousSprint = data.previousSprint || null;

    const totalStories = summary.totalStories ?? (data.stories ? data.stories.length : 0);
    const doneStories = summary.doneStories ?? 0;
    const totalSP = summary.totalSP ?? 0;
    const doneSP = summary.doneSP ?? 0;
    const percentDone = summary.percentDone ?? 0;

    const remainingDays = days.daysRemainingWorking != null ? days.daysRemainingWorking : days.daysRemainingCalendar;
    const remainingLabel = remainingDays == null ? '-' : (remainingDays <= 0 ? 'Sprint ended' : String(remainingDays));
    const remainingClass = remainingDays != null && remainingDays <= 2 ? ' critical' : '';

    let html = '<div class="transparency-card" id="sprint-summary-card">';
    html += '<div class="summary-strip">';
    html += '<div class="summary-headline">' +
      '<strong>' + doneStories + ' of ' + totalStories + ' stories (' + totalSP + ' pts)</strong>' +
      '<span>' + percentDone + '% done</span>' +
      '</div>';
    html += '<div class="summary-links">' +
      '<a href="#burndown-card">Burndown</a>' +
      '<span>|</span>' +
      '<a href="#stories-card">Stories</a>' +
      '<span>|</span>' +
      '<a href="#scope-changes-card">Scope changes</a>' +
      '</div>';
    html += '</div>';

    html += '<div class="status-chips">';
    html += '<span class="status-chip chip-planned">Planned: ' + formatDate(planned.start) + ' - ' + formatDate(planned.end) + '</span>';
    html += '<span class="status-chip chip-done">Done: ' + doneStories + ' stories / ' + doneSP + ' SP</span>';
    html += '<span class="status-chip chip-new">New: ' + scopeChanges.length + ' issues</span>';
    html += '</div>';

    html += '<div class="summary-grid">';
    html += '<div class="summary-block">' +
      '<span>Sprint end</span>' +
      '<strong>' + formatDate(sprint.endDate) + '</strong>' +
      '</div>';
    html += '<div class="summary-block">' +
      '<span>Days remaining</span>' +
      '<strong class="days-remaining' + remainingClass + '">' + remainingLabel + '</strong>' +
      '</div>';
    html += '<div class="summary-block">' +
      '<span>New Features</span>' +
      '<strong>' + formatNumber(summary.newFeaturesSP || 0, 0) + ' SP</strong>' +
      '</div>';
    html += '<div class="summary-block">' +
      '<span>Support & Ops</span>' +
      '<strong>' + formatNumber(summary.supportOpsSP || 0, 0) + ' SP</strong>' +
      '</div>';
    html += '<div class="summary-block">' +
      '<span>Total SP</span>' +
      '<strong>' + formatNumber(summary.totalAllSP != null ? summary.totalAllSP : totalSP, 0) + ' SP</strong>' +
      '</div>';
    html += '</div>';

    if (nextSprint && (nextSprint.name || nextSprint.goal)) {
      html += '<div class="summary-next">Next sprint: <strong>' + escapeHtml(nextSprint.name || '') + '</strong>';
      if (nextSprint.goal) html += ' - ' + escapeHtml(nextSprint.goal);
      html += '</div>';
    }

    if (previousSprint && previousSprint.name) {
      html += '<div class="summary-prev">Previous sprint: <strong>' + escapeHtml(previousSprint.name) + '</strong> - ' + (previousSprint.doneStories ?? 0) + ' stories, ' + (previousSprint.doneSP ?? 0) + ' SP.</div>';
    }

    html += '</div>';
    return html;
  }

  function renderSprintWindows(data) {
    const s = data.sprint || {};
    const pw = data.plannedWindow || {};
    const ow = data.observedWorkWindow || {};
    const flags = data.flags || {};
    const days = data.daysMeta || {};

    let html = '<div class="transparency-card" id="sprint-windows-card">';
    html += '<h2>Sprint and time windows</h2>';
    html += '<p><strong>' + escapeHtml(s.name || s.id || '') + '</strong> (' + escapeHtml(s.state || '') + ')</p>';
    html += '<div class="meta-row"><span>Planned:</span> <strong>' + formatDate(pw.start) + '</strong> -> <strong>' + formatDate(pw.end) + '</strong></div>';
    if (ow.start || ow.end) {
      html += '<div class="meta-row"><span>Observed work:</span> <strong>' + formatDate(ow.start) + '</strong> -> <strong>' + formatDate(ow.end) + '</strong></div>';
    }
    html += '<div class="meta-row"><span>Calendar days:</span> <strong>' + (s.calendarDays ?? '-') + '</strong> <span>Working days:</span> <strong>' + (s.workingDays ?? '-') + '</strong></div>';
    if (days.daysElapsedCalendar != null) {
      html += '<div class="meta-row"><span>Days elapsed (calendar):</span> <strong>' + days.daysElapsedCalendar + '</strong> <span>Remaining:</span> <strong>' + (days.daysRemainingCalendar ?? '-') + '</strong></div>';
    }
    if (days.daysElapsedWorking != null) {
      html += '<div class="meta-row"><span>Days elapsed (working):</span> <strong>' + days.daysElapsedWorking + '</strong> <span>Remaining:</span> <strong>' + (days.daysRemainingWorking ?? '-') + '</strong></div>';
    }
    if (flags.observedBeforeSprintStart || flags.observedAfterSprintEnd || flags.sprintDatesChanged) {
      html += '<p class="flag-warn" style="margin-top: 8px;">';
      if (flags.observedBeforeSprintStart) html += 'Observed work started before sprint start. ';
      if (flags.observedAfterSprintEnd) html += 'Observed work extended past sprint end. ';
      if (flags.sprintDatesChanged) html += 'Sprint dates may have been edited. ';
      html += '</p>';
    }
    html += '</div>';
    return html;
  }

  function renderDailyCompletion(data) {
    const daily = data.dailyCompletions || { stories: [], subtasks: [] };
    let html = '<div class="transparency-card" id="daily-completion-card">';
    html += '<h2>Daily completion</h2>';
    if (!daily.stories || daily.stories.length === 0) {
      html += '<p>No story completions by day in this sprint yet.</p>';
    } else {
      html += '<table class="data-table">';
      html += '<thead><tr><th>Date</th><th>Stories</th><th>SP completed</th><th>NPS</th></tr></thead><tbody>';
      for (const row of daily.stories) {
        html += '<tr>';
        html += '<td>' + escapeHtml(formatDayLabel(row.date)) + '</td>';
        html += '<td>' + (row.count ?? 0) + '</td>';
        html += '<td>' + formatNumber(row.spCompleted ?? 0, 1) + '</td>';
        html += '<td>' + (row.nps == null ? '-' : formatNumber(row.nps, 1)) + '</td>';
        html += '</tr>';
      }
      html += '</tbody></table>';
    }
    html += '</div>';
    return html;
  }

  function renderBurndown(data) {
    const remaining = data.remainingWorkByDay || [];
    const ideal = data.idealBurndown || [];
    if (!remaining.length) {
      return '<div class="transparency-card"><p class="meta-row"><small>Burndown will appear when story points and resolutions are available.</small></p></div>';
    }

    const totalSP = remaining[0].remainingSP || 0;
    const lastRemaining = remaining[remaining.length - 1].remainingSP || 0;
    const doneSP = totalSP - lastRemaining;
    const pct = totalSP > 0 ? Math.round((doneSP / totalSP) * 100) : 0;

    let html = '<div class="transparency-card" id="burndown-card">';
    html += '<h2>Burndown (remaining SP by day)</h2>';
    html += '<p class="meta-row" style="margin-bottom: 8px;"><strong>' + doneSP + ' of ' + totalSP + ' SP done</strong> (' + pct + '%). <small>Resolution-based burndown.</small></p>';
    html += '<p class="meta-row" style="margin-bottom: 8px;"><small>Context only; scope changes shown separately.</small></p>';
    html += buildBurndownChart(remaining, ideal);
    html += '<table class="data-table">';
    html += '<thead><tr><th>Date</th><th>Actual remaining</th><th>Ideal remaining</th></tr></thead><tbody>';
    for (let i = 0; i < remaining.length; i += 1) {
      const row = remaining[i];
      const idealRow = ideal[i] || row;
      html += '<tr>';
      html += '<td>' + escapeHtml(formatDayLabel(row.date)) + '</td>';
      html += '<td>' + formatNumber(row.remainingSP ?? 0, 1) + '</td>';
      html += '<td>' + formatNumber(idealRow.remainingSP ?? 0, 1) + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
    html += '</div>';
    return html;
  }

  function renderScopeChanges(data) {
    const scopeChanges = data.scopeChanges || [];
    const summary = data.scopeChangeSummary || {};
    let html = '<div class="transparency-card" id="scope-changes-card">';
    html += '<h2>Scope changes (added mid-sprint)</h2>';
    if (scopeChanges.length === 0) {
      html += '<p>No scope added after sprint start (by created date).</p>';
    } else {
      html += '<p>Summary: Bug ' + (summary.bug || 0) + ', Feature ' + (summary.feature || 0) + ', Support ' + (summary.support || 0) + '</p>';
      html += '<table class="data-table"><thead><tr><th>Date</th><th>Key</th><th>Type</th><th>SP</th><th>Classification</th></tr></thead><tbody>';
      for (const row of scopeChanges) {
        html += '<tr>';
        html += '<td>' + escapeHtml(formatDate(row.date)) + '</td>';
        html += '<td>' + escapeHtml(row.issueKey || '') + '</td>';
        html += '<td>' + escapeHtml(row.issueType || '') + '</td>';
        html += '<td>' + (row.storyPoints ?? '') + '</td>';
        html += '<td>' + escapeHtml(row.classification || '') + '</td>';
        html += '</tr>';
      }
      html += '</tbody></table>';
    }
    html += '</div>';
    return html;
  }

  function renderStories(data) {
    const stories = data.stories || [];
    let html = '<div class="transparency-card" id="stories-card">';
    html += '<h2>Stories in sprint</h2>';
    if (!stories.length) {
      html += '<p>No stories found for this sprint.</p>';
    } else {
      html += '<table class="data-table"><thead><tr><th>Key</th><th>Summary</th><th>Status</th><th>Pts</th><th>Completion %</th></tr></thead><tbody>';
      for (const story of stories) {
        const keyCell = story.issueUrl
          ? '<a href="' + escapeHtml(story.issueUrl) + '" target="_blank" rel="noopener">' + escapeHtml(story.issueKey || '') + '</a>'
          : escapeHtml(story.issueKey || '');
        html += '<tr>';
        html += '<td>' + keyCell + '</td>';
        html += '<td>' + escapeHtml(story.summary || '') + '</td>';
        html += '<td>' + escapeHtml(story.status || '-') + '</td>';
        html += '<td>' + (story.storyPoints ?? '') + '</td>';
        html += '<td>' + (story.completionPct ?? 0) + '%</td>';
        html += '</tr>';
      }
      html += '</tbody></table>';
    }
    html += '</div>';
    return html;
  }

  function renderStuckCandidates(data) {
    const stuckCandidates = data.stuckCandidates || [];
    if (stuckCandidates.length === 0) return '';
    let html = '<div class="transparency-card" id="stuck-card">';
    html += '<h2>Stuck (in progress > 24h)</h2>';
    html += '<table class="data-table"><thead><tr><th>Key</th><th>Summary</th><th>Status</th><th>Updated</th></tr></thead><tbody>';
    for (const row of stuckCandidates) {
      html += '<tr>';
      html += '<td>' + escapeHtml(row.issueKey || '') + '</td>';
      html += '<td>' + escapeHtml(row.summary || '') + '</td>';
      html += '<td>' + escapeHtml(row.status || '') + '</td>';
      html += '<td>' + escapeHtml(formatDate(row.updated)) + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    return html;
  }

  function renderNotes(data) {
    const notes = data.notes || { dependencies: [], learnings: [], updatedAt: null };
    const depsText = (notes.dependencies || []).join('\n');
    const learningsText = (notes.learnings || []).join('\n');

    let html = '<div class="transparency-card" id="notes-card">';
    const depsCount = (notes.dependencies || []).length;
    const learningsCount = (notes.learnings || []).length;
    html += '<h2>Dependencies / Learnings <span class="notes-count">(' + depsCount + ' / ' + learningsCount + ')</span></h2>';

    const hasDependencies = (notes.dependencies || []).length > 0;
    const hasLearnings = (notes.learnings || []).length > 0;
    if (!hasDependencies && !hasLearnings) {
      html += '<p>No dependencies or learnings recorded yet.</p>';
    } else {
      html += '<div class="notes-columns">';
      html += '<div><h3>Dependencies</h3><ul>' + (notes.dependencies || []).map(item => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul></div>';
      html += '<div><h3>Learnings</h3><ul>' + (notes.learnings || []).map(item => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul></div>';
      html += '</div>';
    }

    html += '<div class="notes-editor">';
    html += '<label for="notes-dependencies">Dependencies (one per line)</label>';
    html += '<textarea id="notes-dependencies" rows="4" placeholder="Add dependencies...">' + escapeHtml(depsText) + '</textarea>';
    html += '<label for="notes-learnings">Learnings (one per line)</label>';
    html += '<textarea id="notes-learnings" rows="4" placeholder="Add learnings...">' + escapeHtml(learningsText) + '</textarea>';
    html += '<div class="notes-actions">';
    html += '<button class="btn btn-primary btn-compact" type="button" id="notes-save">Save notes</button>';
    html += '<span class="notes-status" id="notes-status"></span>';
    html += '</div>';
    if (notes.updatedAt) {
      html += '<p class="notes-updated">Last updated: ' + escapeHtml(formatDate(notes.updatedAt)) + '</p>';
    }
    html += '</div>';

    html += '</div>';
    return html;
  }

  function renderAssumptions(data) {
    const assumptions = data.assumptions || [];
    let html = '<div class="transparency-card" id="assumptions-card">';
    html += '<h2>Assumptions</h2>';
    html += '<ul class="assumptions-list">';
    for (const a of assumptions) {
      html += '<li>' + escapeHtml(typeof a === 'string' ? a : JSON.stringify(a)) + '</li>';
    }
    html += '</ul></div>';
    return html;
  }

  function render(data) {
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

  function getPreferredBoardId() {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('boardId');
      if (fromUrl) return fromUrl.trim();
      return localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }

  function getPreferredSprintId() {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('sprintId');
      if (fromUrl) return fromUrl.trim();
      return localStorage.getItem(STORAGE_SPRINT_KEY);
    } catch (_) {
      return null;
    }
  }

  function persistSelection(boardId, sprintId) {
    try {
      if (boardId) localStorage.setItem(STORAGE_KEY, boardId);
      if (sprintId) localStorage.setItem(STORAGE_SPRINT_KEY, sprintId);
      else localStorage.removeItem(STORAGE_SPRINT_KEY);
    } catch (_) {}
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('boardId', boardId);
      if (sprintId) url.searchParams.set('sprintId', sprintId);
      else url.searchParams.delete('sprintId');
      window.history.replaceState({}, '', url.toString());
    } catch (_) {}
  }

  function wireDynamicHandlers(data) {
    const saveBtn = document.getElementById('notes-save');
    if (saveBtn && data?.sprint) {
      saveBtn.addEventListener('click', () => {
        saveNotes(data.board?.id, data.sprint?.id);
      });
    }
  }

  function saveNotes(boardId, sprintId) {
    const depsEl = document.getElementById('notes-dependencies');
    const learningsEl = document.getElementById('notes-learnings');
    const statusEl = document.getElementById('notes-status');
    const saveBtn = document.getElementById('notes-save');
    if (!depsEl || !learningsEl || !statusEl) return;
    if (!boardId || !sprintId) {
      statusEl.textContent = 'Missing board or sprint selection.';
      return;
    }

    statusEl.textContent = 'Saving...';
    if (saveBtn) saveBtn.disabled = true;

    fetch('/api/current-sprint-notes', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        boardId,
        sprintId,
        dependencies: depsEl.value,
        learnings: learningsEl.value,
      }),
    })
      .then(async r => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(getErrorMessage(r, body, 'Failed to save notes'));
        return body;
      })
      .then(() => {
        statusEl.textContent = 'Saved.';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
        return loadCurrentSprint(boardId, sprintId);
      })
      .then((data) => {
        if (data) {
          showContent(render(data), data);
        }
      })
      .catch(err => {
        statusEl.textContent = err.message || 'Save failed.';
      })
      .finally(() => {
        if (saveBtn) saveBtn.disabled = false;
      });
  }

  function onBoardChange() {
    const boardId = boardSelect.value;
    if (!boardId) {
      showLoading('Select a board to load current sprint data.');
      return;
    }
    currentBoardId = boardId;
    currentSprintId = null;
    persistSelection(boardId, null);
    showLoading('Loading current sprint...');
    loadCurrentSprint(boardId)
      .then(function (data) {
        showContent(render(data), data);
      })
      .catch(function (err) {
        const msg = err.message || 'Failed to load current sprint.';
        showError(msg);
        if ((msg || '').indexOf('Session expired') !== -1 && errorEl) {
          addLoginLink();
        }
      });
  }

  function onSprintTabClick(event) {
    const target = event.target.closest('[data-sprint-id]');
    if (!target || !currentBoardId) return;
    const sprintId = target.getAttribute('data-sprint-id');
    if (!sprintId) return;
    currentSprintId = sprintId;
    persistSelection(currentBoardId, sprintId);
    showLoading('Loading sprint...');
    loadCurrentSprint(currentBoardId, sprintId)
      .then(function (data) {
        showContent(render(data), data);
      })
      .catch(function (err) {
        showError(err.message || 'Failed to load sprint.');
      });
  }

  function init() {
    const preferredId = getPreferredBoardId();
    const preferredSprintId = getPreferredSprintId();
    showLoading('Loading boards for projects MPSA, MAS...');
    loadBoards()
      .then(function (res) {
        const boards = res.boards || [];
        boardSelect.innerHTML = '';
        boardSelect.appendChild(document.createElement('option'));
        const opt0 = boardSelect.querySelector('option');
        opt0.value = '';
        opt0.textContent = '- Select board -';
        boards.forEach(function (b) {
          const opt = document.createElement('option');
          opt.value = String(b.id);
          opt.textContent = (b.name || 'Board ' + b.id) + (b.projectKey ? ' (' + b.projectKey + ')' : '');
          boardSelect.appendChild(opt);
        });
        if (boards.length > 0) {
          const boardIds = boards.map(function (b) { return String(b.id); });
          const idToSelect = preferredId && boardIds.indexOf(preferredId) !== -1 ? preferredId : boardIds[0];
          boardSelect.value = idToSelect;
          currentBoardId = idToSelect;
          showLoading('Loading current sprint...');
          loadCurrentSprint(idToSelect, preferredSprintId)
            .then(function (data) {
              currentSprintId = data?.sprint?.id || null;
              persistSelection(currentBoardId, currentSprintId);
              showContent(render(data), data);
            })
            .catch(function (err) {
              showError(err.message || 'Failed to load current sprint.');
            });
        } else {
          showError('No boards found for the selected projects. Check Jira access or try different projects.');
        }
      })
      .catch(function (err) {
        const msg = err.message || 'Failed to load boards.';
        showError(msg);
        if ((msg || '').indexOf('Session expired') !== -1 && errorEl) {
          addLoginLink();
        }
      });

    boardSelect.addEventListener('change', onBoardChange);
    contentEl.addEventListener('click', onSprintTabClick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
