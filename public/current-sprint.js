/**
 * Current Sprint Transparency page: board selector, current-sprint API, render sprint meta,
 * planned vs observed window, flags, daily completion histogram, scope-change markers, assumptions.
 */

(function () {
  const projects = 'MPSA,MAS';
  const boardSelect = document.getElementById('board-select');
  const loadingEl = document.getElementById('current-sprint-loading');
  const errorEl = document.getElementById('current-sprint-error');
  const contentEl = document.getElementById('current-sprint-content');

  function showLoading(msg) {
    loadingEl.textContent = msg || 'Loading boards for projects MPSA, MAS…';
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

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { dateStyle: 'short' });
    } catch (_) {
      return iso;
    }
  }

  function getErrorMessage(r, body, fallback) {
    if (r.status === 401) return 'Session expired. Please log in again.';
    return (body && (body.message || body.error)) || r.statusText || fallback;
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

  function loadCurrentSprint(boardId) {
    return fetch(
      `/api/current-sprint.json?boardId=${encodeURIComponent(boardId)}&projects=${encodeURIComponent(projects)}`,
      { credentials: 'same-origin', headers: { Accept: 'application/json' } }
    ).then(async r => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(getErrorMessage(r, body, 'Failed to load current sprint'));
      return body;
    });
  }

  function render(data) {
    if (!data.sprint) {
      return (
        '<div class="transparency-card">' +
        '<p>No active or recent closed sprint for this board. Try another board or check back later.</p>' +
        '</div>'
      );
    }

    const s = data.sprint;
    const pw = data.plannedWindow || {};
    const ow = data.observedWorkWindow || {};
    const flags = data.flags || {};
    const days = data.daysMeta || {};
    const daily = data.dailyCompletions || { stories: [], subtasks: [] };
    const scopeChanges = data.scopeChanges || [];
    const summary = data.scopeChangeSummary || {};
    const assumptions = data.assumptions || [];

    let html = '';

    html += '<div class="transparency-card">';
    html += '<h2>Sprint &amp; time windows</h2>';
    html += '<p><strong>' + (s.name || s.id) + '</strong> (' + (s.state || '') + ')</p>';
    html += '<div class="meta-row"><span>Planned:</span> <strong>' + formatDate(pw.start) + '</strong> → <strong>' + formatDate(pw.end) + '</strong></div>';
    if (ow.start || ow.end) {
      html += '<div class="meta-row"><span>Observed work:</span> <strong>' + formatDate(ow.start) + '</strong> → <strong>' + formatDate(ow.end) + '</strong></div>';
    }
    html += '<div class="meta-row"><span>Calendar days:</span> <strong>' + (s.calendarDays ?? '—') + '</strong> &nbsp; <span>Working days:</span> <strong>' + (s.workingDays ?? '—') + '</strong></div>';
    if (days.daysElapsedCalendar != null) {
      html += '<div class="meta-row"><span>Days elapsed (calendar):</span> <strong>' + days.daysElapsedCalendar + '</strong> &nbsp; <span>Remaining:</span> <strong>' + (days.daysRemainingCalendar ?? '—') + '</strong></div>';
    }
    if (days.daysElapsedWorking != null) {
      html += '<div class="meta-row"><span>Days elapsed (working):</span> <strong>' + days.daysElapsedWorking + '</strong> &nbsp; <span>Remaining:</span> <strong>' + (days.daysRemainingWorking ?? '—') + '</strong></div>';
    }
    if (flags.observedBeforeSprintStart || flags.observedAfterSprintEnd || flags.sprintDatesChanged) {
      html += '<p class="flag-warn" style="margin-top: 8px;">';
      if (flags.observedBeforeSprintStart) html += 'Observed work started before sprint start. ';
      if (flags.observedAfterSprintEnd) html += 'Observed work extended past sprint end. ';
      if (flags.sprintDatesChanged) html += 'Sprint dates may have been edited. ';
      html += '</p>';
    }
    html += '</div>';

    const maxStories = Math.max(1, ...daily.stories.map(x => x.count));
    html += '<div class="transparency-card">';
    html += '<h2>Daily completion (stories)</h2>';
    if (daily.stories.length === 0) {
      html += '<p>No story completions by day in this sprint yet.</p>';
    } else {
      daily.stories.forEach(function (row) {
        const pct = maxStories ? (row.count / maxStories) * 100 : 0;
        html += '<div class="histogram-bar-wrap">';
        html += '<label>' + row.date + '</label> ';
        html += '<span class="histogram-bar" style="width: ' + Math.max(4, pct) + '%; max-width: 200px;" title="' + row.count + '"></span> ';
        html += '<span>' + row.count + '</span>';
        html += '</div>';
      });
    }
    if (daily.subtasks && daily.subtasks.length > 0) {
      html += '<p style="margin-top: 12px; font-size: 0.9em; color: var(--muted);"><strong>Task movement (subtasks):</strong></p>';
      daily.subtasks.forEach(function (row) {
        html += '<div class="histogram-bar-wrap"><label>' + row.date + '</label> <span>' + row.count + '</span></div>';
      });
    }
    html += '</div>';

    html += '<div class="transparency-card">';
    html += '<h2>Scope changes (added mid-sprint)</h2>';
    if (scopeChanges.length === 0) {
      html += '<p>No scope added after sprint start (by created date).</p>';
    } else {
      html += '<p>Summary: Bug ' + (summary.bug || 0) + ', Feature ' + (summary.feature || 0) + ', Support ' + (summary.support || 0) + '</p>';
      html += '<table class="scope-table"><thead><tr><th>Date</th><th>Key</th><th>Type</th><th>SP</th><th>Classification</th></tr></thead><tbody>';
      scopeChanges.forEach(function (row) {
        html += '<tr><td>' + formatDate(row.date) + '</td><td>' + (row.issueKey || '') + '</td><td>' + (row.issueType || '') + '</td><td>' + (row.storyPoints ?? '') + '</td><td>' + (row.classification || '') + '</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';

    if (data.remainingWorkByDay && data.remainingWorkByDay.length > 0) {
      html += '<div class="transparency-card">';
      html += '<h2>Burndown (remaining SP by day)</h2>';
      html += '<p class="meta-row" style="margin-bottom: 8px;"><small>Context only; scope changes shown separately.</small></p>';
      const maxSP = Math.max(1, ...data.remainingWorkByDay.map(x => x.remainingSP));
      data.remainingWorkByDay.forEach(function (row) {
        const pct = maxSP ? (row.remainingSP / maxSP) * 100 : 0;
        html += '<div class="histogram-bar-wrap"><label>' + row.date + '</label> <span class="histogram-bar" style="width: ' + Math.max(4, pct) + '%; max-width: 200px;"></span> <span>' + row.remainingSP + ' SP</span></div>';
      });
      html += '</div>';
    }

    html += '<div class="transparency-card">';
    html += '<h2>Assumptions</h2>';
    html += '<ul class="assumptions-list">';
    assumptions.forEach(function (a) {
      html += '<li>' + (typeof a === 'string' ? a : JSON.stringify(a)) + '</li>';
    });
    html += '</ul></div>';

    return html;
  }

  function onBoardChange() {
    const boardId = boardSelect.value;
    if (!boardId) {
      showLoading('Select a board to load current sprint data.');
      return;
    }
    showLoading('Loading current sprint…');
    loadCurrentSprint(boardId)
      .then(function (data) {
        showContent(render(data));
      })
      .catch(function (err) {
        const msg = err.message || 'Failed to load current sprint.';
        showError(msg);
        if ((msg || '').indexOf('Session expired') !== -1 && errorEl) {
          const link = document.createElement('a');
          link.href = '/';
          link.className = 'nav-link';
          link.textContent = 'Log in again';
          link.style.marginLeft = '8px';
          errorEl.appendChild(document.createTextNode(' '));
          errorEl.appendChild(link);
        }
      });
  }

  function init() {
    showLoading('Loading boards for projects MPSA, MAS…');
    loadBoards()
      .then(function (res) {
        const boards = res.boards || [];
        boardSelect.innerHTML = '';
        boardSelect.appendChild(document.createElement('option'));
        const opt0 = boardSelect.querySelector('option');
        opt0.value = '';
        opt0.textContent = '— Select board —';
        boards.forEach(function (b) {
          const opt = document.createElement('option');
          opt.value = b.id;
          opt.textContent = (b.name || 'Board ' + b.id) + (b.projectKey ? ' (' + b.projectKey + ')' : '');
          boardSelect.appendChild(opt);
        });
        if (boards.length > 0) {
          boardSelect.value = boards[0].id;
          onBoardChange();
        } else {
          showLoading('No boards found for the selected projects. Check your Jira access or try different projects.');
        }
      })
      .catch(function (err) {
        const msg = err.message || 'Failed to load boards.';
        showError(msg);
        if ((msg || '').indexOf('Session expired') !== -1 && errorEl) {
          const link = document.createElement('a');
          link.href = '/';
          link.className = 'nav-link';
          link.textContent = 'Log in again';
          link.style.marginLeft = '8px';
          errorEl.appendChild(document.createTextNode(' '));
          errorEl.appendChild(link);
        }
      });

    boardSelect.addEventListener('change', onBoardChange);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
