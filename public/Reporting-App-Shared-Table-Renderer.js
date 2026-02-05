import { escapeHtml } from './Reporting-App-Shared-Dom-Escape-Helpers.js';

export function buildDataTableHtml(columns, rows, options = {}) {
  const { id, rowClassKey = '__rowClass', footerRow = null, footerTooltips = null } = options;
  let html = '';
  html += (id ? `<table class="data-table" id="${id}">` : '<table class="data-table">');
  html += '<thead><tr>';
  for (const col of columns) {
    const title = col.title || col;
    html += `<th title="${escapeHtml(title)}" data-tooltip="${escapeHtml(title)}">${escapeHtml(col.label || col)}</th>`;
  }
  html += '</tr></thead>';
  html += '<tbody>';
  for (const r of rows) {
    const rowClass = r && r[rowClassKey] ? ` class="${escapeHtml(String(r[rowClassKey]))}"` : '';
    html += `<tr${rowClass}>`;
    for (const col of columns) {
      const key = (col.key || col).toString();
      let value = '';
      if (typeof col.renderer === 'function') {
        try { value = col.renderer(r); } catch (e) { value = ''; }
      } else {
        value = (r[key] == null) ? '' : String(r[key]);
      }
      html += '<td>' + escapeHtml(value) + '</td>';
    }
    html += '</tr>';
  }
  html += '</tbody>';
  if (footerRow) {
    html += '<tfoot><tr class="boards-summary-row">';
    for (const col of columns) {
      const key = (col.key || col).toString();
      const tip = footerTooltips && footerTooltips[key] ? footerTooltips[key] : '';
      const value = footerRow[key] == null ? '' : String(footerRow[key]);
      html += `<td title="${escapeHtml(tip)}" data-tooltip="${escapeHtml(tip)}">${escapeHtml(value)}</td>`;
    }
    html += '</tr></tfoot>';
  }
  html += '</table>';
  return html;
}
