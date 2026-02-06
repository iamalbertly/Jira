import { renderNotificationDock } from './Reporting-App-Shared-Notifications-Dock-Manager.js';
import { initLeadershipDefaults, initLeadershipFilters, tryAutoRunPreviewOnce, renderLeadershipLoading } from './Reporting-App-Leadership-Page-Data-Loader.js';

function csvEscape(val) {
  const s = String(val == null ? '' : val).trim();
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function exportLeadershipBoardsCsv() {
  const content = document.getElementById('leadership-content');
  if (!content) return;
  const table = content.querySelector('.leadership-card table.data-table');
  if (!table) return;
  const headers = Array.from(table.querySelectorAll('thead tr:first-child th')).map((th) => th.textContent.trim());
  const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
    Array.from(tr.querySelectorAll('td')).map((td) => td.textContent.trim())
  );
  const headerLine = headers.map(csvEscape).join(',');
  const dataLines = rows.map((row) => row.map(csvEscape).join(','));
  const csv = [headerLine, ...dataLines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'leadership-boards-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  setTimeout(() => window.URL.revokeObjectURL(url), 500);
}

function initLeadershipPage() {
  renderNotificationDock();
  initLeadershipDefaults();
  initLeadershipFilters();
  tryAutoRunPreviewOnce();
  renderLeadershipLoading();

  document.addEventListener('click', (ev) => {
    if (ev.target && ev.target.getAttribute && ev.target.getAttribute('data-action') === 'export-leadership-boards-csv') {
      exportLeadershipBoardsCsv();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLeadershipPage);
} else {
  initLeadershipPage();
}
