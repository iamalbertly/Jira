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
  const metaEl = content.querySelector('.leadership-meta-attrs');
  const rangeStart = metaEl?.getAttribute('data-range-start') || '';
  const rangeEnd = metaEl?.getAttribute('data-range-end') || '';
  const projects = (metaEl?.getAttribute('data-projects') || '').replace(/\s+/g, '');
  let filename = 'leadership-boards';
  if (projects) filename += '_' + projects;
  if (rangeStart && rangeEnd) filename += '_' + rangeStart + '_' + rangeEnd;
  filename += '.csv';
  if (filename === 'leadership-boards.csv') filename = 'leadership-boards-' + new Date().toISOString().slice(0, 10) + '.csv';
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
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
    const th = ev.target && ev.target.closest ? ev.target.closest('#leadership-content th.sortable[data-sort]') : null;
    if (!th) return;
    const table = th.closest('table.leadership-boards-table');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const colIndex = Array.from(th.parentElement.children).indexOf(th);
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const lastSort = table.getAttribute('data-sort-col');
    const lastDir = table.getAttribute('data-sort-dir');
    const dir = lastSort === String(colIndex) && lastDir === 'asc' ? 'desc' : 'asc';
    table.setAttribute('data-sort-col', String(colIndex));
    table.setAttribute('data-sort-dir', dir);
    const numericCols = { 2: true, 3: true, 4: true, 5: true, 6: true, 7: true, 8: true };
    const num = numericCols[colIndex];
    rows.sort((a, b) => {
      const aCell = (a.children[colIndex] && a.children[colIndex].textContent) || '';
      const bCell = (b.children[colIndex] && b.children[colIndex].textContent) || '';
      let aVal = aCell.trim();
      let bVal = bCell.trim();
      if (num) {
        const aNum = parseFloat(aVal.replace(/,/g, '')) || 0;
        const bNum = parseFloat(bVal.replace(/,/g, '')) || 0;
        return dir === 'asc' ? aNum - bNum : bNum - aNum;
      }
      return dir === 'asc' ? (aVal < bVal ? -1 : aVal > bVal ? 1 : 0) : (bVal < aVal ? -1 : bVal > aVal ? 1 : 0);
    });
    rows.forEach((r) => tbody.appendChild(r));
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLeadershipPage);
} else {
  initLeadershipPage();
}
