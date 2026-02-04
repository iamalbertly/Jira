import { reportDom } from './Reporting-App-Report-Page-Context.js';
import { getSafeMeta } from './Reporting-App-Report-Page-Render-Helpers.js';
import { reportState } from './Reporting-App-Report-Page-State.js';

export function updateExportFilteredState() {
  const { exportDropdownMenu } = reportDom;
  if (!exportDropdownMenu) return;
  const csvFiltered = exportDropdownMenu.querySelector('.export-dropdown-item[data-export="csv-filtered"]');
  const excelFiltered = exportDropdownMenu.querySelector('.export-dropdown-item[data-export="excel-filtered"]');
  const hasRows = Array.isArray(reportState.visibleRows) && reportState.visibleRows.length > 0;
  if (csvFiltered) csvFiltered.disabled = !hasRows;
  if (excelFiltered) excelFiltered.disabled = !hasRows;
}

export function initExportMenu() {
  const { exportDropdownTrigger, exportDropdownMenu } = reportDom;
  if (!exportDropdownTrigger || !exportDropdownMenu) return;

  function openExportMenu() {
    exportDropdownMenu.classList.add('open');
    exportDropdownTrigger.setAttribute('aria-expanded', 'true');
    const firstItem = exportDropdownMenu.querySelector('.export-dropdown-item:not([disabled])');
    if (firstItem) firstItem.focus();
  }

  function closeExportMenu() {
    exportDropdownMenu.classList.remove('open');
    exportDropdownTrigger.setAttribute('aria-expanded', 'false');
  }

  exportDropdownTrigger.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = exportDropdownMenu.classList.contains('open');
    if (isOpen) {
      closeExportMenu();
    } else {
      openExportMenu();
    }
  });

  document.addEventListener('click', (event) => {
    if (!exportDropdownMenu.contains(event.target) && event.target !== exportDropdownTrigger) {
      closeExportMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeExportMenu();
    }
  });

  updateExportFilteredState();
}
