import { reportState } from './Reporting-App-Report-Page-State.js';
import { reportDom } from './Reporting-App-Report-Page-Context.js';
import { buildCsvFilename, getDateRangeLabel, getSafeMeta } from './Reporting-App-Report-Page-Render-Helpers.js';
import { generateCSVClient } from './Reporting-App-Report-Utils-Data-Helpers.js';
import { escapeHtml } from './Reporting-App-Shared-Dom-Escape-Helpers.js';

export function validateCSVColumns(columns, rows) {
  if (!Array.isArray(columns) || columns.length === 0) return false;
  if (!Array.isArray(rows)) return false;
  return true;
}

export function downloadCSV(csv, filename) {
  try {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => window.URL.revokeObjectURL(url), 500);

    const successMsg = document.createElement('div');
    successMsg.className = 'export-success-msg';
    successMsg.innerHTML = `<strong>Exported:</strong> ${escapeHtml(filename)}`;
    document.body.appendChild(successMsg);
    setTimeout(() => successMsg.remove(), 4000);
  } catch (_) {
    const errorEl = reportDom.errorEl;
    if (errorEl) {
      errorEl.style.display = 'block';
      errorEl.innerHTML = `
        <strong>Export error:</strong> Unable to download CSV file.
        <br><small>Your browser may be blocking downloads. Please check your browser settings or try clicking the export button again.</small>
        <button type="button" class="error-close" aria-label="Dismiss">x</button>
      `;
    }
  }
}

export async function exportCSV(rows, type, columns) {
  const meta = getSafeMeta(reportState.previewData);
  if (!meta) return;
  if (!validateCSVColumns(columns, rows)) return;

  const dateRange = await getDateRangeLabel(meta.windowStart, meta.windowEnd);
  const filename = buildCsvFilename('voda-agile-board', meta, type, dateRange);

  try {
    const csv = generateCSVClient(columns, rows);
    downloadCSV(csv, filename);
  } catch (_) {
    const errorEl = reportDom.errorEl;
    if (errorEl) {
      errorEl.style.display = 'block';
      errorEl.innerHTML = `
        <strong>Export error:</strong> Unable to download CSV file.
        <br><small>Check the browser console or try again.</small>
        <button type="button" class="error-close" aria-label="Dismiss">x</button>
      `;
    }
  }
}

export async function exportSectionCSV(sectionName, data, button = null) {
  if (button) button.disabled = true;
  const meta = getSafeMeta(reportState.previewData);
  if (!meta) return;
  const filename = buildCsvFilename(sectionName, meta, '', await getDateRangeLabel(meta.windowStart, meta.windowEnd));
  const rows = Array.isArray(data) ? data : [];
  const csv = generateCSVClient(Object.keys(rows[0] || {}), rows);
  downloadCSV(csv, filename);
  if (button) button.disabled = false;
}
