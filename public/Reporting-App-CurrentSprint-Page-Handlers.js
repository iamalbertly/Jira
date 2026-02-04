import { buildNotificationMessage } from './Reporting-App-CurrentSprint-Render-Subtasks.js';
import { getErrorMessage, loadCurrentSprint } from './Reporting-App-CurrentSprint-Page-Data-Loaders.js';
import { showContent } from './Reporting-App-CurrentSprint-Page-Status.js';
import { renderCurrentSprintPage } from './Reporting-App-CurrentSprint-Render-Page.js';

export function wireDynamicHandlers(data) {
  document.querySelectorAll('.card-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const card = targetId ? document.getElementById(targetId) : null;
      if (!card) return;
      card.classList.toggle('is-collapsed');
      btn.textContent = card.classList.contains('is-collapsed') ? 'Expand' : 'Minimize';
    });
  });

  const saveBtn = document.getElementById('notes-save');
  if (saveBtn && data?.sprint) {
    saveBtn.addEventListener('click', () => {
      saveNotes(data.board?.id, data.sprint?.id);
    });
  }

  const groupSelect = document.getElementById('notification-group');
  const recipientSelect = document.getElementById('notification-recipient');
  const messageArea = document.getElementById('notification-message');
  const copyBtn = document.getElementById('notification-copy');
  const statusEl = document.getElementById('notification-status');
  const byAssignee = (data?.subtaskTracking?.notifications || [])
    .filter(n => (n.missingEstimate || []).length > 0 || (n.missingLogged || []).length > 0);
  const byReporter = (data?.subtaskTracking?.notificationsByReporter || [])
    .filter(n => (n.missingEstimate || []).length > 0 || (n.missingLogged || []).length > 0);

  function getGroups(type) {
    return type === 'reporter' ? byReporter : byAssignee;
  }

  function populateRecipients(type) {
    if (!recipientSelect) return;
    recipientSelect.innerHTML = '';
    const groups = getGroups(type);
    groups.forEach((item, idx) => {
      const count = (item.missingEstimate || []).length + (item.missingLogged || []).length;
      const label = (item.recipient || 'Unassigned') + ' (' + count + ')';
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = label;
      recipientSelect.appendChild(opt);
    });
    if (!groups.length) {
      messageArea.value = '';
    } else {
      messageArea.value = buildNotificationMessage(data, groups[0]);
    }
  }

  function updateMessage(type, index) {
    const groups = getGroups(type);
    if (!groups.length) {
      messageArea.value = '';
      return;
    }
    const idx = Number.isNaN(index) ? 0 : Math.max(0, Math.min(index, groups.length - 1));
    messageArea.value = buildNotificationMessage(data, groups[idx]);
  }

  if (messageArea && recipientSelect && (byAssignee.length > 0 || byReporter.length > 0)) {
    let initialGroup = byReporter.length > 0 ? 'reporter' : 'assignee';
    if (groupSelect) {
      groupSelect.value = initialGroup;
    } else {
      initialGroup = byAssignee.length > 0 ? 'assignee' : 'reporter';
    }
    populateRecipients(initialGroup);

    if (groupSelect) {
      groupSelect.addEventListener('change', (event) => {
        const type = event.target.value || 'assignee';
        populateRecipients(type);
      });
    }

    recipientSelect.addEventListener('change', (event) => {
      const type = groupSelect ? groupSelect.value : (byAssignee.length > 0 ? 'assignee' : 'reporter');
      updateMessage(type, Number(event.target.value || 0));
    });

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(messageArea.value);
          if (statusEl) statusEl.textContent = 'Copied.';
          setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
        } catch (_) {
          if (statusEl) statusEl.textContent = 'Copy failed.';
        }
      });
    }
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
        showContent(renderCurrentSprintPage(data));
      }
    })
    .catch(err => {
      statusEl.textContent = err.message || 'Save failed.';
    })
    .finally(() => {
      if (saveBtn) saveBtn.disabled = false;
    });
}
