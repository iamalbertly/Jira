export function initSearchClearButtons() {
  const targets = ['boards-search-box', 'sprints-search-box', 'search-box', 'project-search'];
  targets.forEach((id) => {
    const input = document.getElementById(id);
    const btn = document.querySelector(`.search-clear-btn[data-target="${id}"]`);
    if (!input || !btn) return;
    const update = () => {
      btn.classList.toggle('is-visible', !!input.value);
    };
    input.addEventListener('input', update);
    btn.addEventListener('click', () => {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      update();
      input.focus();
    });
    update();
  });
}
