import { formatDateForDisplay, formatDateTimeLocalForInput } from './Reporting-App-Shared-Format-DateNumber-Helpers.js';
import { toUtcIsoFromLocalInput } from './Reporting-App-Report-Utils-Data-Helpers.js';
import { initQuarterStrip } from './Reporting-App-Shared-Quarter-Range-Helpers.js';
import { reportDom } from './Reporting-App-Report-Page-Context.js';
import { SHARED_DATE_RANGE_KEY } from './Reporting-App-Shared-Storage-Keys.js';

export function updateDateDisplay() {
  const startDate = document.getElementById('start-date')?.value || '';
  const endDate = document.getElementById('end-date')?.value || '';

  if (startDate && endDate) {
    const startISO = toUtcIsoFromLocalInput(startDate);
    const endISO = toUtcIsoFromLocalInput(endDate, true);
    if (!startISO || !endISO) {
      document.getElementById('date-display').innerHTML = `
        <small>
          UTC: Invalid date input<br>
          Local: Invalid date input
        </small>
      `;
      return;
    }
    const startLocal = formatDateForDisplay(startDate);
    const endLocal = formatDateForDisplay(endDate);
    const startUtc = new Date(startISO).toUTCString();
    const endUtc = new Date(endISO).toUTCString();

    document.getElementById('date-display').innerHTML = `
      <small>
        UTC: ${startUtc} to ${endUtc}<br>
        Local: ${startLocal} to ${endLocal}
      </small>
    `;
  }
}

function persistSharedDateRange() {
  const startDate = document.getElementById('start-date')?.value || '';
  const endDate = document.getElementById('end-date')?.value || '';
  if (!startDate || !endDate) return;
  const startISO = toUtcIsoFromLocalInput(startDate);
  const endISO = toUtcIsoFromLocalInput(endDate, true);
  if (!startISO || !endISO) return;
  try {
    localStorage.setItem(SHARED_DATE_RANGE_KEY, JSON.stringify({ start: startISO, end: endISO }));
  } catch (_) {}
}

function hydrateSharedDateRange(startInput, endInput) {
  try {
    const raw = localStorage.getItem(SHARED_DATE_RANGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed?.start || !parsed?.end) return false;
    const start = new Date(parsed.start);
    const end = new Date(parsed.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
    if (startInput) startInput.value = formatDateTimeLocalForInput(start);
    if (endInput) endInput.value = formatDateTimeLocalForInput(end);
    return true;
  } catch (_) {
    return false;
  }
}

function updateCustomRangeLabelVisibility() {
  const label = document.getElementById('custom-range-label');
  if (!label) return;
  const strip = document.querySelector('.quarter-strip-inner');
  const hasActivePill = strip && strip.querySelector('.quarter-pill.is-active');
  label.style.display = hasActivePill ? 'none' : '';
}

export function initDateRangeControls(onApply) {
  const startInput = document.getElementById('start-date');
  const endInput = document.getElementById('end-date');
  hydrateSharedDateRange(startInput, endInput);
  if (startInput) startInput.addEventListener('change', updateDateDisplay);
  if (endInput) endInput.addEventListener('change', updateDateDisplay);
  if (startInput) startInput.addEventListener('change', persistSharedDateRange);
  if (endInput) endInput.addEventListener('change', persistSharedDateRange);
  updateDateDisplay();

  initQuarterStrip('.quarter-strip-inner', startInput, endInput, {
    formatInputValue: formatDateTimeLocalForInput,
    updateDateDisplay: () => {
      updateDateDisplay();
      persistSharedDateRange();
    },
    onClearSelection: updateCustomRangeLabelVisibility,
    onQuartersLoaded: updateCustomRangeLabelVisibility,
    onApply: () => {
      updateCustomRangeLabelVisibility();
      persistSharedDateRange();
      if (typeof onApply === 'function') onApply();
    },
  });
}
