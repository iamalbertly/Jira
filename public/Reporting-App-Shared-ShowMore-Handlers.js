/**
 * Shared show-more button wiring. Single implementation for appending template content to table body.
 * @param {string} btnSelector - CSS selector for the show-more button
 * @param {string} templateId - id of the template element containing rows to append
 * @param {string} tableSelector - CSS selector for the table tbody (e.g. '#work-risks-table tbody')
 */
export function wireShowMoreHandler(btnSelector, templateId, tableSelector) {
  const btn = document.querySelector(btnSelector);
  if (!btn) return;
  btn.addEventListener('click', () => {
    const tpl = document.getElementById(templateId);
    const tbody = document.querySelector(tableSelector);
    if (tpl && tbody) {
      tbody.insertAdjacentHTML('beforeend', tpl.innerHTML);
      btn.style.display = 'none';
    }
  });
}
