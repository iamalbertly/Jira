import { formatDateForDisplay, formatDateTimeLocalForInput } from './Reporting-App-Shared-Format-DateNumber-Helpers.js';
import { toUtcIsoFromLocalInput } from './Reporting-App-Report-Utils-Data-Helpers.js';
import { initQuarterStrip } from './Reporting-App-Shared-Quarter-Range-Helpers.js';
import { reportDom } from './Reporting-App-Report-Page-Context.js';

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

export function initDateRangeControls(onApply) {
  const startInput = document.getElementById('start-date');
  const endInput = document.getElementById('end-date');
  if (startInput) startInput.addEventListener('change', updateDateDisplay);
  if (endInput) endInput.addEventListener('change', updateDateDisplay);

  initQuarterStrip('.quarter-strip-inner', startInput, endInput, {
    formatInputValue: formatDateTimeLocalForInput,
    updateDateDisplay,
    onApply,
  });
}
